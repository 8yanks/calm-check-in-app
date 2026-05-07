// Marge — Stripe helpers (V2.3.4)
//
// SERVER-SIDE UNIQUEMENT. N'importez JAMAIS ce module depuis du code
// client — STRIPE_SECRET_KEY ne doit jamais être bundlée pour le navigateur.
//
// CONTRAT
// =======
// Une SEULE responsabilité : exposer une instance Stripe initialisée à la
// demande, et offrir 2 helpers haut-niveau (checkout, portail client) que
// les server functions de subscriptions.ts consomment.
//
// Le webhook handler (src/routes/api/stripe/webhook.ts) consomme aussi ce
// module pour vérifier la signature des events entrants.
//
// PRICE IDS
// =========
// Les Price IDs Stripe NE sont PAS stockés en DB. Ils sont configurés via
// env vars CF Pages :
//   STRIPE_PRICE_MONTHLY  — recurring 7.99 EUR/mois
//   STRIPE_PRICE_ANNUAL   — recurring 59.99 EUR/an
//   STRIPE_PRICE_LIFETIME — one-time 79.99 EUR (mode 'payment')
// Cela permet de basculer test ↔ live sans migration ni rebuild — on switch
// les variables et c'est tout.

import Stripe from "stripe";
import type { Plan } from "@/lib/entitlements";

// ─────────────────────────────────────────────────────────────────────────────
// Singleton Stripe client (lazy init)
// ─────────────────────────────────────────────────────────────────────────────

let _stripe: Stripe | null = null;

/**
 * Returns a Stripe client. Throws if STRIPE_SECRET_KEY is missing — caller
 * is expected to first check `isStripeConfigured()` if they want a graceful
 * degradation path (the /pricing page does this to keep CTAs disabled when
 * Stripe isn't yet wired up).
 */
export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY not configured");
  }
  // No explicit apiVersion: the SDK uses the version pinned by the
  // installed @stripe/stripe-node package, which matches the typed
  // surface. Setting it manually creates a moving-target risk between
  // the typed types (compile-time) and the version actually pinned by
  // the SDK at runtime.
  _stripe = new Stripe(key, {
    appInfo: { name: "Marge", version: "2.3.4" },
  });
  return _stripe;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** Returns 'live' | 'test' | null based on the configured key prefix. */
export function getStripeMode(): "live" | "test" | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (key.startsWith("sk_live_")) return "live";
  if (key.startsWith("sk_test_")) return "test";
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan ↔ Price mapping
// ─────────────────────────────────────────────────────────────────────────────

export type PaidPlan = Exclude<Plan, "free">;

export function getPriceIdForPlan(plan: PaidPlan): string {
  const id = (() => {
    switch (plan) {
      case "monthly":  return process.env.STRIPE_PRICE_MONTHLY;
      case "annual":   return process.env.STRIPE_PRICE_ANNUAL;
      case "lifetime": return process.env.STRIPE_PRICE_LIFETIME;
    }
  })();
  if (!id) {
    throw new Error(
      `STRIPE_PRICE_${plan.toUpperCase()} not configured. ` +
      `Add the price id from your Stripe dashboard to CF Pages env vars.`,
    );
  }
  return id;
}

/**
 * Lifetime is a one-shot purchase, not a subscription. Stripe Checkout
 * mode differs accordingly.
 */
export function getCheckoutModeForPlan(plan: PaidPlan): "subscription" | "payment" {
  return plan === "lifetime" ? "payment" : "subscription";
}

// ─────────────────────────────────────────────────────────────────────────────
// Customer lookup / creation
// ─────────────────────────────────────────────────────────────────────────────

interface UpsertCustomerOptions {
  userId: string;
  email: string;
  /** Existing stripe_customer_id from our DB (avoids duplicate customer rows). */
  existingCustomerId: string | null;
}

/**
 * Returns a Stripe customer id for the user. If existingCustomerId is
 * provided we reuse it, otherwise we create a new customer attached to the
 * user_id via metadata (so the webhook can resolve back to our user).
 */
export async function getOrCreateCustomer(opts: UpsertCustomerOptions): Promise<string> {
  const stripe = getStripe();

  if (opts.existingCustomerId) {
    // Verify it still exists (e.g. on a fresh test-mode account it may not)
    try {
      const cust = await stripe.customers.retrieve(opts.existingCustomerId);
      if (!cust.deleted) return cust.id;
    } catch {
      // fall through to create
    }
  }

  const customer = await stripe.customers.create({
    email: opts.email,
    metadata: { marge_user_id: opts.userId },
  });
  return customer.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Checkout session
// ─────────────────────────────────────────────────────────────────────────────

interface CreateCheckoutOptions {
  userId: string;
  email: string;
  plan: PaidPlan;
  customerId: string;
  successUrl: string;
  cancelUrl: string;
}

/**
 * Create a Stripe Checkout Session URL for the user/plan combination.
 * The trial flag is honoured automatically: monthly + annual subscriptions
 * default to a 7-day trial via subscription_data.
 */
export async function createCheckoutSessionUrl(opts: CreateCheckoutOptions): Promise<string> {
  const stripe = getStripe();
  const mode = getCheckoutModeForPlan(opts.plan);
  const priceId = getPriceIdForPlan(opts.plan);

  const params: Stripe.Checkout.SessionCreateParams = {
    mode,
    customer: opts.customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    metadata: { marge_user_id: opts.userId, marge_plan: opts.plan },
    allow_promotion_codes: true,
    locale: "fr",
  };

  if (mode === "subscription") {
    params.subscription_data = {
      trial_period_days: 7,
      metadata: { marge_user_id: opts.userId, marge_plan: opts.plan },
    };
  } else {
    // one-time payment (lifetime)
    params.payment_intent_data = {
      metadata: { marge_user_id: opts.userId, marge_plan: opts.plan },
    };
  }

  const session = await stripe.checkout.sessions.create(params);
  if (!session.url) {
    throw new Error("Stripe Checkout session created but URL is missing");
  }
  return session.url;
}

// ─────────────────────────────────────────────────────────────────────────────
// Billing portal
// ─────────────────────────────────────────────────────────────────────────────

interface BillingPortalOptions {
  customerId: string;
  returnUrl: string;
}

/**
 * Create a Stripe Customer Portal session — letting the user manage their
 * subscription themselves (cancel, update payment method, see invoices).
 * The portal is configured in the Stripe dashboard.
 */
export async function createBillingPortalUrl(opts: BillingPortalOptions): Promise<string> {
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: opts.customerId,
    return_url: opts.returnUrl,
    locale: "fr",
  });
  return session.url;
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook event verification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify a Stripe webhook payload using the configured webhook secret.
 * Returns the validated Stripe.Event or throws.
 */
export function verifyWebhookEvent(rawBody: string, signature: string): Stripe.Event {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET not configured");
  }
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}
