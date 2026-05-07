// Stripe webhook endpoint — POST /api/stripe/webhook
//
// SECURITY
// ========
// - Vérifie la signature Stripe (rejet 400 sinon).
// - Idempotent via stripe_events.id (PK) — un retry n'a aucun effet.
// - Service-role uniquement (geste service via subscriptions.ts) — n'accepte
//   PAS l'auth utilisateur, ne lit pas l'access_token.
//
// CONFIG REQUISE (CF Pages env vars)
// ==================================
// - STRIPE_SECRET_KEY        (sk_test_… ou sk_live_…)
// - STRIPE_WEBHOOK_SECRET    (whsec_… — copié depuis Stripe Dashboard)
// - SUPABASE_URL             (déjà configuré)
// - SUPABASE_SERVICE_ROLE_KEY (NOUVEAU — requis pour le webhook qui
//                              écrit dans subscriptions sans session user)

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { verifyWebhookEvent } from "@/lib/stripe";
import { claimStripeEvent, processStripeEvent } from "@/lib/subscriptions";
import type { Database } from "@/integrations/supabase/types";

// Helper to roll back the idempotence claim if processing failed, so that
// Stripe's automatic retry actually re-attempts the event instead of being
// silently dropped as a duplicate.
async function unclaimStripeEvent(eventId: string): Promise<void> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    const admin = createClient<Database>(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    await admin.from("stripe_events").delete().eq("id", eventId);
  } catch (err) {
    console.warn("[stripe-webhook] unclaimStripeEvent failed:", err);
  }
}

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // 1. Read raw body (Stripe verification needs the unparsed bytes)
        const rawBody = await request.text();
        const signature = request.headers.get("stripe-signature");
        if (!signature) {
          return new Response("Missing stripe-signature header", { status: 400 });
        }

        // 2. Verify signature
        let event;
        try {
          event = verifyWebhookEvent(rawBody, signature);
        } catch (err) {
          console.error("[stripe-webhook] signature verification failed:", err);
          return new Response("Invalid signature", { status: 400 });
        }

        // 3. Idempotence claim — bail early on duplicate delivery
        try {
          const claimed = await claimStripeEvent(event);
          if (!claimed) {
            return new Response(JSON.stringify({ received: true, duplicate: true }), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
        } catch (err) {
          console.error("[stripe-webhook] claimStripeEvent failed:", err);
          return new Response("Internal error claiming event", { status: 500 });
        }

        // 4. Process event (subscription state reconciliation)
        try {
          const update = await processStripeEvent(event);
          return new Response(
            JSON.stringify({ received: true, processed: !!update }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        } catch (err) {
          console.error("[stripe-webhook] processStripeEvent failed:", err);
          // Roll back the idempotence claim so Stripe's automatic retries
          // actually re-attempt processing instead of getting silently
          // dropped as a duplicate.
          await unclaimStripeEvent(event.id);
          return new Response("Internal error processing event", { status: 500 });
        }
      },
    },
  },
  // No component — this is a pure server endpoint.
  component: () => null,
});
