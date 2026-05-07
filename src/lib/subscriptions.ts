// Marge — Subscription reconciliation (V2.3.4)
//
// SERVER-SIDE UNIQUEMENT. Le webhook handler (api/stripe/webhook.ts) appelle
// les fonctions exportées ici pour transformer un Stripe.Event en upsert
// idempotent sur public.subscriptions.
//
// CONTRAT
// =======
// - PURE par défaut : extractSubscriptionUpdate(event) ne fait pas d'I/O.
//   Le webhook handler décide ensuite d'écrire ou pas.
// - Idempotence : les writes sont des UPSERT par user_id (PK). Le webhook
//   utilise stripe_events pour bloquer le retry des events déjà traités.
// - Map Stripe ↔ Marge plan : extrait via metadata.marge_plan que le
//   client a setté lors du checkout. Fallback sur l'analyse du price si
//   metadata absent (ex: events provenant directement du dashboard).

import type Stripe from "stripe";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, TablesInsert, Json } from "@/integrations/supabase/types";
import type { Plan } from "@/lib/entitlements";
import type { PaidPlan } from "@/lib/stripe";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SubscriptionUpdate {
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null; // null for lifetime one-shots
  plan: Plan;
  status: "active" | "trialing" | "past_due" | "canceled" | "expired" | "incomplete";
  current_period_end: string | null; // ISO
  trial_end: string | null;          // ISO
  purchased_at: string | null;       // ISO — set for lifetime
  cancel_at_period_end: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service-role Supabase client (bypasses RLS — required for webhook writes)
// ─────────────────────────────────────────────────────────────────────────────

let _admin: SupabaseClient<Database> | null = null;

function getAdmin(): SupabaseClient<Database> {
  if (_admin) return _admin;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("[subscriptions] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  }
  _admin = createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}

// ─────────────────────────────────────────────────────────────────────────────
// Idempotence
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if the event was successfully claimed (not seen before),
 * false if it was already processed and should be skipped.
 *
 * Implementation: INSERT into stripe_events with PK = event.id. ON CONFLICT
 * DO NOTHING means duplicate deliveries get skipped without error.
 */
export async function claimStripeEvent(event: Stripe.Event): Promise<boolean> {
  const admin = getAdmin();
  const { error } = await admin.from("stripe_events").insert({
    id: event.id,
    type: event.type,
    payload: event as unknown as Json,
  });
  if (error) {
    // Duplicate key = already processed, treat as "skip"
    if (error.code === "23505") return false;
    // Other errors = surface
    throw new Error(`[subscriptions] claimStripeEvent failed: ${error.message}`);
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure extractors — turn a Stripe.Event into a SubscriptionUpdate or null
// ─────────────────────────────────────────────────────────────────────────────

const PAID_PLANS: ReadonlyArray<PaidPlan> = ["monthly", "annual", "lifetime"];

function isPaidPlan(value: unknown): value is PaidPlan {
  return typeof value === "string" && (PAID_PLANS as readonly string[]).includes(value);
}

function tsToISO(unixSeconds: number | null | undefined): string | null {
  if (typeof unixSeconds !== "number" || unixSeconds <= 0) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

/**
 * Map a Stripe.Subscription.status string to ours. Stripe has more granular
 * statuses (incomplete_expired, paused) — we coalesce them.
 */
function mapStripeStatus(s: Stripe.Subscription.Status): SubscriptionUpdate["status"] {
  switch (s) {
    case "active":              return "active";
    case "trialing":            return "trialing";
    case "past_due":            return "past_due";
    case "canceled":            return "canceled";
    case "incomplete":          return "incomplete";
    case "incomplete_expired":  return "expired";
    case "unpaid":              return "expired";
    case "paused":              return "expired";
    default:                    return "expired";
  }
}

interface ResolveContext {
  customerId: string;
  /** marge_user_id from metadata — required, falls back to customer lookup. */
  metadataUserId?: string;
}

/**
 * Pure: extract the user_id from event metadata or fallback paths.
 * The webhook handler resolves this to a real user_id by reading the
 * stripe_customer_id from our subscriptions table when metadata is missing.
 */
async function resolveUserId(ctx: ResolveContext): Promise<string | null> {
  if (ctx.metadataUserId) return ctx.metadataUserId;
  // Fallback: look up by stripe_customer_id we wrote earlier
  const admin = getAdmin();
  const { data } = await admin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", ctx.customerId)
    .maybeSingle();
  return data?.user_id ?? null;
}

/**
 * Build a SubscriptionUpdate from a Stripe Subscription object.
 * Returns null if metadata + DB lookup both fail to identify the user.
 *
 * NOTE on current_period_end: Stripe moved this field from the subscription
 * level to subscription.items[i].current_period_end in the dahlia API. We
 * read it from the first item (all items share the same period for our
 * single-line-item subscriptions). Older API versions still expose it at
 * the top level — we fall back to that if the items path is missing.
 */
async function fromStripeSubscription(
  sub: Stripe.Subscription,
): Promise<SubscriptionUpdate | null> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const metadataUserId = typeof sub.metadata?.marge_user_id === "string"
    ? sub.metadata.marge_user_id : undefined;
  const userId = await resolveUserId({ customerId, metadataUserId });
  if (!userId) return null;

  const metadataPlan = sub.metadata?.marge_plan;
  const plan: Plan = isPaidPlan(metadataPlan) ? metadataPlan : "monthly";

  // Read current_period_end from the new (items-level) location, fall back
  // to the legacy top-level field for older API versions.
  const itemPeriodEnd = sub.items?.data?.[0]?.current_period_end;
  const legacyPeriodEnd =
    (sub as unknown as { current_period_end?: number }).current_period_end;
  const periodEndUnix = itemPeriodEnd ?? legacyPeriodEnd ?? null;

  return {
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    plan,
    status: mapStripeStatus(sub.status),
    current_period_end: tsToISO(periodEndUnix),
    trial_end: tsToISO(sub.trial_end),
    purchased_at: null,
    cancel_at_period_end: sub.cancel_at_period_end,
  };
}

/**
 * Build a SubscriptionUpdate for a lifetime one-shot purchase from a
 * checkout.session.completed event.
 */
async function fromLifetimeCheckout(
  session: Stripe.Checkout.Session,
): Promise<SubscriptionUpdate | null> {
  if (session.mode !== "payment") return null;
  if (session.payment_status !== "paid") return null;
  const customerId = typeof session.customer === "string"
    ? session.customer
    : session.customer?.id;
  if (!customerId) return null;

  const metadataUserId = typeof session.metadata?.marge_user_id === "string"
    ? session.metadata.marge_user_id : undefined;
  const userId = await resolveUserId({ customerId, metadataUserId });
  if (!userId) return null;

  return {
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: null,
    plan: "lifetime",
    status: "active",
    current_period_end: null,
    trial_end: null,
    purchased_at: new Date().toISOString(),
    cancel_at_period_end: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-level event handler — called from the webhook route
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Process a single Stripe webhook event. Idempotence is handled by
 * claimStripeEvent before this is called. Returns the SubscriptionUpdate
 * that was applied, or null when the event is informational/non-actionable.
 */
export async function processStripeEvent(event: Stripe.Event): Promise<SubscriptionUpdate | null> {
  const admin = getAdmin();
  let update: SubscriptionUpdate | null = null;

  switch (event.type) {
    // Subscription lifecycle (recurring)
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
    case "customer.subscription.trial_will_end": {
      update = await fromStripeSubscription(event.data.object as Stripe.Subscription);
      break;
    }
    // Lifetime checkout completion (one-shot payment)
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "payment") {
        update = await fromLifetimeCheckout(session);
      }
      // For mode='subscription', we wait for customer.subscription.created
      break;
    }
    // Invoice events drive past_due / active state via the subscription update
    // event Stripe also emits — no action here.
    case "invoice.paid":
    case "invoice.payment_failed":
      return null;
    default:
      return null;
  }

  if (!update) return null;

  // Upsert (PK on user_id → idempotent)
  const row: TablesInsert<"subscriptions"> = {
    user_id: update.user_id,
    stripe_customer_id: update.stripe_customer_id,
    stripe_subscription_id: update.stripe_subscription_id,
    plan: update.plan,
    status: update.status,
    current_period_end: update.current_period_end,
    trial_end: update.trial_end,
    purchased_at: update.purchased_at,
    cancel_at_period_end: update.cancel_at_period_end,
  };

  const { error } = await admin
    .from("subscriptions")
    .upsert(row, { onConflict: "user_id" });

  if (error) {
    throw new Error(`[subscriptions] upsert failed: ${error.message}`);
  }

  return update;
}

// ─────────────────────────────────────────────────────────────────────────────
// Customer lookup helpers used by checkout / portal server fns
// ─────────────────────────────────────────────────────────────────────────────

export async function getStripeCustomerId(userId: string): Promise<string | null> {
  const admin = getAdmin();
  const { data } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.stripe_customer_id ?? null;
}

/**
 * Persist the freshly-created Stripe customer id BEFORE the checkout flow
 * starts. This way, even if the user closes the tab before completing
 * checkout, we won't create a duplicate customer on retry — we'll reuse
 * the existing one.
 */
export async function persistStripeCustomerId(userId: string, customerId: string): Promise<void> {
  const admin = getAdmin();
  await admin
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        stripe_customer_id: customerId,
        plan: "free", // placeholder until checkout completes
        status: "incomplete",
      },
      { onConflict: "user_id", ignoreDuplicates: false },
    );
}
