// Marge — Entitlements helper (V2.3.0)
//
// Single source of truth for "who can access what".
//
// Architecture choice: NO `user_entitlements` table. The user's entitlement is
// derived on the fly from their `subscriptions` row (or absence thereof).
// This avoids any drift between two stores. If we ever need a cache (latency,
// per-user feature toggles), we can add it later WITHOUT changing the public
// API of this module.
//
// Server-side: requireFeature() throws when missing — used by server functions
// that gate premium actions (chat, diagnostic IA, weekly review IA, …).
// Client-side: hasFeature() reads a cached Entitlement from the hook.
// Frontend gating is COSMETIC. Real enforcement always happens server-side.

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type Plan = "free" | "monthly" | "annual" | "lifetime";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "expired"
  | "incomplete";

/**
 * Stable, exhaustive list of premium-gated features. New features are added
 * here ONCE. Do NOT scatter "if user.plan === 'monthly'" checks across the app
 * — instead consume the helpers below.
 */
export type Feature =
  | "library_premium"            // access to premium-tier library content
  | "diagnostic_unlimited"       // bypass the 1-per-90-days cap on full diagnostic
  | "weekly_review_ai"           // IA-generated narrative weekly review (vs heuristic fallback)
  | "chat_full"                  // chat IA "Parler à Marge" (full quota, vs free 5/day)
  | "personalization_advanced";  // adaptive recommendations on home, fine-tuned tone

/**
 * Stable list of all features. Used to build the "premium full" feature set.
 * Order does not matter; uniqueness is enforced by the union type.
 */
const ALL_FEATURES: readonly Feature[] = [
  "library_premium",
  "diagnostic_unlimited",
  "weekly_review_ai",
  "chat_full",
  "personalization_advanced",
] as const;

/**
 * Computed entitlement snapshot for a single user. Always safe to render —
 * even users with no subscription row get a valid Entitlement object (free).
 */
export interface Entitlement {
  plan: Plan;
  status: SubscriptionStatus;
  /** True iff the user currently has access to premium features. */
  active: boolean;
  features: Feature[];
  trial_until: string | null;
  current_period_end: string | null;
  purchased_at: string | null;
  cancel_at_period_end: boolean;
  /** Where this entitlement comes from. Useful for UI ("Tu es en essai 7j"). */
  source: "free" | "trial" | "stripe_subscription" | "stripe_lifetime";
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure derivation
// ─────────────────────────────────────────────────────────────────────────────

type SubscriptionRow = Tables<"subscriptions">;

/**
 * Pure function — derives an Entitlement from a subscriptions row (or null
 * when the user has no row, treated as free).
 *
 * Honours `features_excluded` on the subscription row: ops can record per-row
 * exclusions without code changes (useful for lifetime plans that should NOT
 * include a future high-cost feature, per the product decision).
 */
export function getEntitlementFromRow(row: SubscriptionRow | null): Entitlement {
  // No row → free. Defensive default: never grant features.
  if (!row || row.plan === "free") {
    return {
      plan: "free",
      status: "active",
      active: false,
      features: [],
      trial_until: null,
      current_period_end: null,
      purchased_at: null,
      cancel_at_period_end: false,
      source: "free",
    };
  }

  const plan = row.plan as Plan;
  const status = row.status as SubscriptionStatus;
  const isLifetime = plan === "lifetime";
  const isTrialing = status === "trialing";

  // Active access conditions:
  //  - status active OR trialing (trialing has full access)
  //  - lifetime is always active unless explicitly canceled
  const hasActiveAccess =
    status === "active" ||
    status === "trialing" ||
    (isLifetime && status !== "canceled" && status !== "expired");

  // Build the features set. Apply per-row exclusions (e.g. lifetime that
  // doesn't include `chat_full` because of LLM cost).
  const excluded = parseExcludedFeatures(row.features_excluded);
  const features: Feature[] = hasActiveAccess
    ? ALL_FEATURES.filter(f => !excluded.includes(f))
    : [];

  let source: Entitlement["source"] = "stripe_subscription";
  if (isLifetime) source = "stripe_lifetime";
  else if (isTrialing) source = "trial";

  return {
    plan,
    status,
    active: hasActiveAccess,
    features,
    trial_until: row.trial_end,
    current_period_end: row.current_period_end,
    purchased_at: row.purchased_at,
    cancel_at_period_end: row.cancel_at_period_end,
    source,
  };
}

function parseExcludedFeatures(raw: SubscriptionRow["features_excluded"]): Feature[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is Feature =>
    typeof x === "string" && (ALL_FEATURES as readonly string[]).includes(x),
  );
}

/** Pure boolean check. Safe to call with a null/undefined entitlement. */
export function hasFeature(ent: Entitlement | null | undefined, feature: Feature): boolean {
  return ent?.features.includes(feature) ?? false;
}

/** Convenience: is the user on any paid plan (incl. trial)? */
export function isPremium(ent: Entitlement | null | undefined): boolean {
  return ent?.active === true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Client-side fetch (RLS-protected SELECT, safe to call from any component)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads the current user's subscription row via Supabase (RLS limits it to
 * own row). Returns a derived Entitlement. NEVER throws — falls back to a
 * free entitlement on any error. Use the useEntitlements() hook in
 * components instead of calling this directly.
 */
export async function fetchMyEntitlement(): Promise<Entitlement> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return getEntitlementFromRow(null);
    const { data } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", session.user.id)
      .maybeSingle();
    return getEntitlementFromRow(data);
  } catch (err) {
    console.warn("[entitlements] fetchMyEntitlement failed, defaulting to free:", err);
    return getEntitlementFromRow(null);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Server-side enforcement (used in server functions)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Server-only. Throws if the user lacks the requested feature.
 *
 * SECURITY NOTE: The supabase client passed in MUST already be authenticated
 * as the user (RLS will scope the SELECT to their row). Caller is responsible
 * for using the request-scoped client (e.g. via auth middleware), not the
 * service-role client.
 *
 * Currently called from V2.3.3+ server functions (chat) and V2.3.1 (quota
 * checks on diagnostic). Not called yet — included now to lock the API.
 */
export async function requireFeature(
  scopedClient: typeof supabase,
  userId: string,
  feature: Feature,
): Promise<Entitlement> {
  const { data, error } = await scopedClient
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`[entitlements] DB read failed: ${error.message}`);
  const ent = getEntitlementFromRow(data);
  if (!hasFeature(ent, feature)) {
    const err = new Error(`[entitlements] feature "${feature}" required`);
    (err as Error & { code?: string }).code = "FEATURE_REQUIRED";
    throw err;
  }
  return ent;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pricing constants — single source of truth shared with /pricing page
// ─────────────────────────────────────────────────────────────────────────────

export const PRICING = {
  monthly: { amount: 7.99, currency: "EUR", period: "mois" },
  annual:  { amount: 59.99, currency: "EUR", period: "an", monthly_equivalent: 5.0 },
  lifetime:{ amount: 79.99, currency: "EUR", period: "à vie" },
  trial_days: 7,
} as const;
