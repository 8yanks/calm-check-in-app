// /account/billing — Billing & subscription management (V2.3.4)
//
// Real account only. Anon → /auth?next=/account/billing.
// Reads the user's subscription row (RLS-protected), shows plan + status +
// next renewal, exposes a single button → Stripe Customer Portal where the
// user can cancel / update payment / see invoices.

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { PageShell, WideShell } from "@/components/PageShell";
import { MargeWordmark } from "@/components/Logo";
import { useRequireAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useEntitlements } from "@/hooks/use-entitlements";
import { createBillingPortalSession } from "@/lib/stripe-server-fns";
import type { Tables } from "@/integrations/supabase/types";

const searchSchema = z.object({
  status: z.enum(["success", "canceled"]).optional(),
});

export const Route = createFileRoute("/account/billing")({
  head: () => ({ meta: [{ title: "Mon abonnement — Marge" }] }),
  validateSearch: searchSchema,
  component: BillingPage,
});

function BillingPage() {
  const navigate = useNavigate();
  const { session, loading: authLoading, isAnonymous } = useRequireAuth();
  const { entitlement, refresh } = useEntitlements();
  const { status: urlStatus } = Route.useSearch();
  const [sub, setSub] = useState<Tables<"subscriptions"> | null>(null);
  const [loading, setLoading] = useState(true);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!session) return;
    if (isAnonymous && typeof window !== "undefined") {
      window.location.assign("/auth?next=/account/billing");
      return;
    }
    const load = async () => {
      const { data } = await supabase
        .from("subscriptions").select("*")
        .eq("user_id", session.user.id).maybeSingle();
      setSub(data);
      setLoading(false);
    };
    load();
  }, [authLoading, session, isAnonymous]);

  // After a successful Checkout return, refresh entitlement & subscription
  useEffect(() => {
    if (urlStatus === "success") {
      refresh();
      // Re-poll subscription a few times (the webhook may take a few seconds)
      let tries = 0;
      const id = setInterval(async () => {
        tries++;
        if (!session) return;
        const { data } = await supabase.from("subscriptions").select("*")
          .eq("user_id", session.user.id).maybeSingle();
        setSub(data);
        if ((data?.plan && data.plan !== "free") || tries > 6) {
          clearInterval(id);
        }
      }, 2000);
      return () => clearInterval(id);
    }
  }, [urlStatus, session, refresh]);

  const handleOpenPortal = async () => {
    if (!session || typeof window === "undefined") return;
    setOpeningPortal(true);
    setError(null);
    try {
      const { url } = await createBillingPortalSession({
        data: {
          access_token: session.access_token,
          origin: window.location.origin,
        },
      });
      window.location.href = url;
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code
        ?? (err instanceof Error ? err.message : "");
      if (code === "NO_STRIPE_CUSTOMER") {
        setError("Tu n'as pas encore d'abonnement actif sur Stripe.");
      } else if (code === "STRIPE_NOT_CONFIGURED") {
        setError("La gestion d'abonnement n'est pas encore activée. Reviens dans quelques jours.");
      } else {
        console.error("[billing] portal failed:", err);
        setError("Quelque chose s'est mal passé. Tu peux réessayer.");
      }
      setOpeningPortal(false);
    }
  };

  if (authLoading || !session || isAnonymous) {
    return <PageShell><div className="h-screen" /></PageShell>;
  }

  return (
    <WideShell>
      <header className="flex items-center justify-between">
        <Link to="/home"><MargeWordmark /></Link>
        <Link to="/settings" className="text-sm text-muted-foreground hover:text-foreground">
          ← Réglages
        </Link>
      </header>

      <article className="mt-12 lg:mt-20 max-w-2xl mx-auto">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Mon abonnement</div>
        <h1 className="mt-4 font-display text-4xl lg:text-5xl leading-[1.05] tracking-tight">
          Ton plan, en clair.
        </h1>

        {urlStatus === "success" && (
          <div className="mt-8 marge-card p-5 border-primary/40 bg-primary/5">
            <div className="text-[11px] uppercase tracking-wider text-primary">Bienvenue</div>
            <p className="mt-2 text-foreground/85 leading-relaxed">
              Ton paiement a été confirmé. Marge Plus est activé sur ton compte
              dans quelques secondes — pas besoin de rafraîchir.
            </p>
          </div>
        )}

        {urlStatus === "canceled" && (
          <div className="mt-8 marge-card p-5 text-sm text-foreground/80 leading-relaxed">
            Tu as annulé le paiement. Aucun problème — tu peux y revenir quand tu veux.
            <Link to="/pricing" className="ml-2 text-primary hover:opacity-80">Voir Marge Plus →</Link>
          </div>
        )}

        {/* Current plan card */}
        <section className="mt-10 marge-card p-7 lg:p-8">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Plan actuel</div>
          {loading ? (
            <p className="mt-3 text-sm text-muted-foreground">Chargement…</p>
          ) : (
            <>
              <p className="mt-3 font-display text-3xl">
                {planLabel(entitlement?.plan ?? "free")}
              </p>
              <p className="mt-2 text-sm text-foreground/70 leading-relaxed">
                {statusSentence(entitlement, sub)}
              </p>

              {sub?.cancel_at_period_end && entitlement?.current_period_end && (
                <p className="mt-3 text-sm text-muted-foreground italic">
                  Annulation prévue le{" "}
                  {new Date(entitlement.current_period_end).toLocaleDateString("fr-FR", {
                    day: "numeric", month: "long", year: "numeric",
                  })}
                  .
                </p>
              )}
            </>
          )}
        </section>

        {/* Actions */}
        <section className="mt-8 space-y-3">
          {entitlement?.active && entitlement.plan !== "lifetime" && sub?.stripe_customer_id ? (
            <button
              onClick={handleOpenPortal}
              disabled={openingPortal}
              className="rounded-full bg-primary px-6 py-3 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-60 cursor-pointer"
            >
              {openingPortal ? "Ouverture…" : "Gérer mon abonnement"}
            </button>
          ) : entitlement?.plan === "lifetime" ? (
            <p className="text-sm text-foreground/70 leading-relaxed">
              Tu as accès à vie à Marge Plus. Aucun paiement récurrent — c'est définitif.
            </p>
          ) : (
            <Link
              to="/pricing"
              className="inline-flex rounded-full bg-primary px-6 py-3 text-sm text-primary-foreground hover:opacity-90 cursor-pointer"
            >
              Voir Marge Plus
            </Link>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </section>

        <footer className="mt-16 text-xs text-muted-foreground italic leading-relaxed">
          La gestion (annulation, mise à jour de la carte, factures) se fait via le portail
          sécurisé de Stripe. Marge ne stocke jamais ton numéro de carte.
        </footer>
      </article>
    </WideShell>
  );
}

function planLabel(plan: string): string {
  switch (plan) {
    case "monthly":  return "Marge Plus · mensuel";
    case "annual":   return "Marge Plus · annuel";
    case "lifetime": return "Marge Plus · à vie";
    default:         return "Plan gratuit";
  }
}

function statusSentence(
  ent: ReturnType<typeof useEntitlements>["entitlement"],
  sub: Tables<"subscriptions"> | null,
): string {
  if (!ent || ent.plan === "free") {
    return "Le check-in express, quelques contenus, le bilan simple — tout reste gratuit.";
  }
  if (ent.plan === "lifetime") {
    return ent.purchased_at
      ? `Acheté le ${new Date(ent.purchased_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.`
      : "Accès à vie à Marge Plus.";
  }
  if (ent.status === "trialing" && ent.trial_until) {
    const trialEnd = new Date(ent.trial_until);
    return `Essai gratuit en cours, jusqu'au ${trialEnd.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}.`;
  }
  if (ent.status === "past_due") {
    return "Le dernier paiement a échoué. Mets à jour ton moyen de paiement depuis le portail.";
  }
  if (ent.status === "canceled" || ent.status === "expired") {
    return "Ton abonnement n'est plus actif. Tu peux le réactiver quand tu veux.";
  }
  if (ent.current_period_end) {
    const end = new Date(ent.current_period_end);
    const renew = sub?.cancel_at_period_end ? "Se termine" : "Se renouvelle";
    return `${renew} le ${end.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.`;
  }
  return "Marge Plus est actif sur ton compte.";
}
