// Marge — Stripe server functions (V2.3.4)
//
// Client-callable RPCs that orchestrate Stripe Checkout / Portal flows and
// expose a small status endpoint to drive the /pricing UI.
//
// SECURITY MODEL
// ==============
// - getStripeStatus: public-ish — returns mode (test/live/null) and the
//   list of configured plans. NEVER returns the secret key.
// - createCheckoutSession: requires a valid access_token (real account,
//   not anon). Validates via auth.getUser. Spawns a Stripe Checkout URL.
// - createBillingPortalSession: requires real account + an existing
//   stripe_customer_id (no portal for users who never paid).

import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  createBillingPortalUrl,
  createCheckoutSessionUrl,
  getOrCreateCustomer,
  getStripe,
  getStripeMode,
  isStripeConfigured,
  type PaidPlan,
} from "@/lib/stripe";
import { getStripeCustomerId, persistStripeCustomerId } from "@/lib/subscriptions";

// ─────────────────────────────────────────────────────────────────────────────
// Caller resolution
// ─────────────────────────────────────────────────────────────────────────────

interface AuthCaller {
  userId: string;
  email: string;
  isAnonymous: boolean;
}

async function resolveCaller(accessToken: string): Promise<AuthCaller | null> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  try {
    const client = createClient<Database>(url, key, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getUser(accessToken);
    if (error || !data.user) return null;
    return {
      userId: data.user.id,
      email: data.user.email ?? "",
      isAnonymous: !!data.user.is_anonymous,
    };
  } catch (err) {
    console.warn("[stripe-server] resolveCaller failed:", err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getStripeStatus — drives /pricing UI gating
// ─────────────────────────────────────────────────────────────────────────────

export interface StripeStatus {
  configured: boolean;
  mode: "live" | "test" | null;
  /** Which paid plans have a price id configured. */
  available_plans: Array<"monthly" | "annual" | "lifetime">;
}

export const getStripeStatus = createServerFn({ method: "GET" })
  .handler(async (): Promise<StripeStatus> => {
    const configured = isStripeConfigured();
    if (!configured) {
      return { configured: false, mode: null, available_plans: [] };
    }
    const available_plans: StripeStatus["available_plans"] = [];
    if (process.env.STRIPE_PRICE_MONTHLY)  available_plans.push("monthly");
    if (process.env.STRIPE_PRICE_ANNUAL)   available_plans.push("annual");
    if (process.env.STRIPE_PRICE_LIFETIME) available_plans.push("lifetime");
    return {
      configured: true,
      mode: getStripeMode(),
      available_plans,
    };
  });

// ─────────────────────────────────────────────────────────────────────────────
// createCheckoutSession — main paid-plan entry point
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateCheckoutInput {
  plan: PaidPlan;
  access_token: string;
  /** Absolute origin (https://marge-app.pages.dev). Server validates the host. */
  origin: string;
}

export interface CreateCheckoutResult {
  url: string;
}

const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/marge-app\.pages\.dev$/,
  /^https:\/\/[a-z0-9-]+\.marge-app\.pages\.dev$/, // CF Pages preview deployments
  /^http:\/\/localhost:\d+$/,                       // dev
];

function isOriginAllowed(origin: string): boolean {
  return ALLOWED_ORIGIN_PATTERNS.some(p => p.test(origin));
}

export const createCheckoutSession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as CreateCheckoutInput)
  .handler(async (ctx): Promise<CreateCheckoutResult> => {
    const data = ctx.data;

    if (!isStripeConfigured()) {
      const err = new Error("STRIPE_NOT_CONFIGURED") as Error & { code?: string };
      err.code = "STRIPE_NOT_CONFIGURED";
      throw err;
    }

    const caller = await resolveCaller(data.access_token);
    if (!caller) {
      const err = new Error("UNAUTHORIZED") as Error & { code?: string };
      err.code = "UNAUTHORIZED";
      throw err;
    }
    if (caller.isAnonymous) {
      const err = new Error("REAL_ACCOUNT_REQUIRED") as Error & { code?: string };
      err.code = "REAL_ACCOUNT_REQUIRED";
      throw err;
    }
    if (!caller.email) {
      const err = new Error("EMAIL_REQUIRED") as Error & { code?: string };
      err.code = "EMAIL_REQUIRED";
      throw err;
    }
    if (!isOriginAllowed(data.origin)) {
      const err = new Error("ORIGIN_NOT_ALLOWED") as Error & { code?: string };
      err.code = "ORIGIN_NOT_ALLOWED";
      throw err;
    }

    // 1. Get or create Stripe customer
    const existingCustomerId = await getStripeCustomerId(caller.userId);
    const customerId = await getOrCreateCustomer({
      userId: caller.userId,
      email: caller.email,
      existingCustomerId,
    });

    // 2. Persist customer id BEFORE checkout to dedupe on retries
    if (customerId !== existingCustomerId) {
      await persistStripeCustomerId(caller.userId, customerId);
    }

    // 3. Create Checkout session
    const url = await createCheckoutSessionUrl({
      userId: caller.userId,
      email: caller.email,
      plan: data.plan,
      customerId,
      successUrl: `${data.origin}/account/billing?status=success`,
      cancelUrl: `${data.origin}/pricing?status=canceled`,
    });

    return { url };
  });

// ─────────────────────────────────────────────────────────────────────────────
// createBillingPortalSession — let users manage their existing subscription
// ─────────────────────────────────────────────────────────────────────────────

export interface CreatePortalInput {
  access_token: string;
  origin: string;
}

export interface CreatePortalResult {
  url: string;
}

export const createBillingPortalSession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as CreatePortalInput)
  .handler(async (ctx): Promise<CreatePortalResult> => {
    const data = ctx.data;

    if (!isStripeConfigured()) {
      const err = new Error("STRIPE_NOT_CONFIGURED") as Error & { code?: string };
      err.code = "STRIPE_NOT_CONFIGURED";
      throw err;
    }

    const caller = await resolveCaller(data.access_token);
    if (!caller) {
      const err = new Error("UNAUTHORIZED") as Error & { code?: string };
      err.code = "UNAUTHORIZED";
      throw err;
    }
    if (caller.isAnonymous) {
      const err = new Error("REAL_ACCOUNT_REQUIRED") as Error & { code?: string };
      err.code = "REAL_ACCOUNT_REQUIRED";
      throw err;
    }
    if (!isOriginAllowed(data.origin)) {
      const err = new Error("ORIGIN_NOT_ALLOWED") as Error & { code?: string };
      err.code = "ORIGIN_NOT_ALLOWED";
      throw err;
    }

    const customerId = await getStripeCustomerId(caller.userId);
    if (!customerId) {
      const err = new Error("NO_STRIPE_CUSTOMER") as Error & { code?: string };
      err.code = "NO_STRIPE_CUSTOMER";
      throw err;
    }

    // Sanity check the customer still exists in Stripe (fresh test mode etc.)
    const stripe = getStripe();
    try {
      const cust = await stripe.customers.retrieve(customerId);
      if (cust.deleted) throw new Error("DELETED");
    } catch {
      const err = new Error("NO_STRIPE_CUSTOMER") as Error & { code?: string };
      err.code = "NO_STRIPE_CUSTOMER";
      throw err;
    }

    const url = await createBillingPortalUrl({
      customerId,
      returnUrl: `${data.origin}/account/billing`,
    });
    return { url };
  });
