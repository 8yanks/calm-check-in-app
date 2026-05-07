// /pricing — public pricing page.
//
// V2.3.0 shipped this as a vitrine. V2.3.4 makes the CTAs go live AS SOON
// AS Stripe is configured on the server. The page polls getStripeStatus()
// once on mount; if Stripe is configured AND a price id is set for the
// plan, the CTA opens a real Stripe Checkout session. Otherwise the CTA
// stays disabled with "Bientôt disponible". This means deploying V2.3.4
// to prod doesn't suddenly activate billing — the user controls activation
// via env vars.

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { WideShell } from "@/components/PageShell";
import { MargeMark, MargeWordmark } from "@/components/Logo";
import { PRICING } from "@/lib/entitlements";
import { useEntitlements } from "@/hooks/use-entitlements";
import { track } from "@/lib/analytics";
import { supabase } from "@/integrations/supabase/client";
import {
  createCheckoutSession,
  getStripeStatus,
  type StripeStatus,
} from "@/lib/stripe-server-fns";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Marge Plus — Tarifs" },
      {
        name: "description",
        content:
          "Marge gratuit reste utile au quotidien. Marge Plus donne accès au diagnostic illimité, à la bibliothèque complète, au bilan IA et au chat.",
      },
    ],
  }),
  component: Pricing,
});

function Pricing() {
  const navigate = useNavigate();
  const { entitlement, loading } = useEntitlements();
  const isAlreadyPremium = entitlement?.active === true;
  const [stripeStatus, setStripeStatus] = useState<StripeStatus | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    track("pricing_viewed", {});
    // Probe Stripe configuration so we know whether to enable the CTAs.
    // Errors here are non-fatal — we just leave CTAs disabled.
    getStripeStatus().then(setStripeStatus).catch(() => setStripeStatus({
      configured: false, mode: null, available_plans: [],
    }));
  }, []);

  const isPlanAvailable = (plan: "monthly" | "annual" | "lifetime"): boolean =>
    !!stripeStatus?.configured && stripeStatus.available_plans.includes(plan);

  const handlePlanCta = async (plan: "monthly" | "annual" | "lifetime") => {
    track("paywall_cta_clicked", { feature: "checkout", trigger: "pricing", plan });
    setCheckoutError(null);

    // Anon users → /auth first so checkout has a stable user_id
    const { data: { session } } = await supabase.auth.getSession();
    if (!session && typeof window !== "undefined") {
      window.location.assign("/auth?next=/pricing");
      return;
    }

    // Stripe not configured → silently no-op (CTA shouldn't have been clickable)
    if (!isPlanAvailable(plan)) return;

    if (!session) return;
    setCheckoutPlan(plan);
    track("subscription_checkout_started", { plan });
    try {
      const { url } = await createCheckoutSession({
        data: {
          plan,
          access_token: session.access_token,
          origin: typeof window !== "undefined" ? window.location.origin : "",
        },
      });
      if (typeof window !== "undefined") window.location.href = url;
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code
        ?? (err instanceof Error ? err.message : "");
      if (code === "REAL_ACCOUNT_REQUIRED") {
        if (typeof window !== "undefined") window.location.assign("/auth?next=/pricing");
        return;
      }
      if (code === "STRIPE_NOT_CONFIGURED") {
        setCheckoutError("Le paiement n'est pas encore activé. Reviens dans quelques jours.");
      } else if (code === "EMAIL_REQUIRED") {
        setCheckoutError("Une adresse email est requise pour Stripe. Vérifie ton compte.");
      } else {
        console.error("[pricing] checkout failed:", err);
        setCheckoutError("Quelque chose s'est mal passé. Tu peux réessayer.");
      }
      setCheckoutPlan(null);
    }
  };

  return (
    <WideShell>
      <header className="flex items-center justify-between">
        <Link to="/"><MargeWordmark /></Link>
        <div className="flex items-center gap-5 text-sm">
          <Link to="/library" className="text-foreground/70 hover:text-foreground">Bibliothèque</Link>
          <Link to="/about" className="text-foreground/70 hover:text-foreground">À propos</Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mt-12 lg:mt-20 max-w-3xl">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Marge Plus</div>
        <h1 className="mt-6 font-display text-5xl lg:text-7xl leading-[1.05] tracking-tight">
          Continuer ce que tu fais déjà —<br />
          <span className="text-primary">en plus profond.</span>
        </h1>
        <p className="mt-6 lg:mt-8 text-lg text-foreground/75 leading-relaxed max-w-xl">
          Marge gratuit reste utile au quotidien. Marge Plus donne plus de
          continuité, plus de personnalisation, et accès à toute la profondeur
          que Marge peut offrir.
        </p>
      </section>

      {/* Plans */}
      <section className="mt-16 lg:mt-20">
        {isAlreadyPremium && !loading && (
          <div className="mb-8 marge-card p-5 border-primary/30 max-w-2xl">
            <div className="text-[11px] uppercase tracking-[0.18em] text-primary">Tu es déjà membre</div>
            <p className="mt-2 text-foreground/80 leading-relaxed">
              Tu as accès à toutes les features Marge Plus. Tu peux gérer ton abonnement
              {" "}<Link to="/settings" className="text-primary hover:opacity-80">depuis tes réglages</Link>.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 max-w-5xl">
          <PlanCard
            badge="Gratuit"
            price="0 €"
            period="pour toujours"
            description="Le cœur de Marge, sans compte payant."
            features={[
              "Check-in express illimité",
              "Quelques contenus essentiels",
              "Bilan hebdo simple",
              "1 diagnostic complet (puis tous les 90 jours)",
            ]}
            cta={{ label: "Continuer en gratuit", onClick: () => navigate({ to: "/" }) }}
          />

          <PlanCard
            badge="Mensuel"
            price={`${PRICING.monthly.amount.toFixed(2).replace(".", ",")} €`}
            period={`/ ${PRICING.monthly.period}`}
            description="Souplesse totale, annulable à tout moment."
            features={[
              "Tout le gratuit",
              "Bibliothèque complète",
              "Diagnostic illimité",
              "Bilan hebdo IA détaillé",
              "Chat “Parler à Marge” (50 msg/mois)",
            ]}
            cta={{
              label: checkoutPlan === "monthly"
                ? "Ouverture…"
                : isPlanAvailable("monthly") ? "Choisir Mensuel" : "Bientôt disponible",
              onClick: () => handlePlanCta("monthly"),
              disabled: !isPlanAvailable("monthly") || checkoutPlan !== null || isAlreadyPremium,
            }}
            footnote={`Essai ${PRICING.trial_days} jours sur la première souscription`}
          />

          <PlanCard
            badge="Annuel · recommandé"
            price={`${PRICING.annual.amount.toFixed(2).replace(".", ",")} €`}
            period={`/ ${PRICING.annual.period}`}
            description={`Soit ${PRICING.annual.monthly_equivalent.toFixed(2).replace(".", ",")} €/mois — 2 mois offerts.`}
            features={[
              "Tout le mensuel",
              "Économie significative",
              "Continuité sans frais cachés",
            ]}
            cta={{
              label: checkoutPlan === "annual"
                ? "Ouverture…"
                : isPlanAvailable("annual") ? "Choisir Annuel" : "Bientôt disponible",
              onClick: () => handlePlanCta("annual"),
              disabled: !isPlanAvailable("annual") || checkoutPlan !== null || isAlreadyPremium,
            }}
            footnote={`Essai ${PRICING.trial_days} jours sur la première souscription`}
            highlight
          />
        </div>

        {checkoutError && (
          <p className="mt-6 text-sm text-destructive max-w-2xl">{checkoutError}</p>
        )}

        {/* Lifetime plan — secondary, presented honestly */}
        <div className="mt-10 max-w-5xl">
          <div className="marge-card p-7 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-7">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">À vie · paiement unique</div>
              <h3 className="mt-3 font-display text-2xl leading-snug">
                {PRICING.lifetime.amount.toFixed(2).replace(".", ",")} € — Marge Plus à vie
              </h3>
              <p className="mt-3 text-sm text-foreground/70 leading-relaxed max-w-lg">
                Accès permanent à Marge Plus tel qu'il existe aujourd'hui. Si une
                future fonctionnalité a un coût d'infrastructure très élevé
                (ex&nbsp;: chat IA étendu, modèles plus lourds), elle peut être proposée
                en option séparée — c'est explicite et honnête.
              </p>
            </div>
            <div className="lg:col-span-5 lg:text-right">
              <button
                onClick={() => handlePlanCta("lifetime")}
                disabled={!isPlanAvailable("lifetime") || checkoutPlan !== null || isAlreadyPremium}
                className={`inline-flex items-center justify-center rounded-full px-6 py-3 text-sm transition ${
                  isPlanAvailable("lifetime") && !isAlreadyPremium
                    ? "bg-primary text-primary-foreground hover:opacity-90 cursor-pointer"
                    : "border border-border bg-surface text-muted-foreground cursor-not-allowed"
                }`}
              >
                {checkoutPlan === "lifetime"
                  ? "Ouverture…"
                  : isPlanAvailable("lifetime") ? "Acheter à vie" : "Bientôt disponible"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Reassurance */}
      <section className="mt-16 lg:mt-24 grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-5xl">
        <Reassurance title="Pas de frustration artificielle" body="Le gratuit reste réellement utile. Tu n'es pas piégé en payant — tu débloques de la profondeur." />
        <Reassurance title="Annulable à tout moment" body="Tu gardes le contrôle. L'essai 7 jours peut être interrompu sans frais, l'abonnement annulé en un clic." />
        <Reassurance title="Tes données t'appartiennent" body="Marge ne vend rien à personne. Tu peux tout effacer depuis tes réglages, à tout moment." />
      </section>

      {/* FAQ */}
      <section className="mt-20 lg:mt-24 max-w-3xl">
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Questions fréquentes</div>
        <h2 className="mt-4 font-display text-3xl">Quelques précisions.</h2>
        <div className="mt-10 space-y-8">
          <Faq q="Est-ce que je peux essayer Marge Plus avant de payer&nbsp;?">
            Oui. Les abonnements mensuel et annuel ouvrent sur un essai gratuit de
            {" "}{PRICING.trial_days} jours. Tu peux annuler à tout moment pendant l'essai —
            tu ne seras pas facturé.
          </Faq>
          <Faq q="Que comprend exactement le plan à vie&nbsp;?">
            Un accès permanent à Marge Plus tel qu'il existe aujourd'hui. Pour les
            futures fonctionnalités très coûteuses (chat IA étendu, modèles lourds),
            une option séparée pourra être proposée — c'est explicite et choisi en
            transparence, jamais imposé.
          </Faq>
          <Faq q="Comment annuler&nbsp;?">
            En un clic depuis tes réglages, ou directement depuis le portail Stripe
            quand tu reçois ta confirmation. Tu gardes l'accès jusqu'à la fin de la
            période en cours.
          </Faq>
          <Faq q="Le check-in express reste-t-il gratuit&nbsp;?">
            Oui, toujours. Le check-in express est le cœur de Marge et reste accessible
            sans abonnement, sans limite, sans compte payant.
          </Faq>
        </div>
      </section>

      <footer className="mt-20 lg:mt-24 pt-8 border-t border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <MargeMark size={20} />
          <span>© Marge — Compagne calme du quotidien.</span>
        </div>
        <div className="flex items-center gap-5">
          <Link to="/about" className="hover:text-foreground">À propos</Link>
          <Link to="/library" className="hover:text-foreground">Bibliothèque</Link>
          <Link to="/aide" className="hover:text-foreground">Aide d'urgence</Link>
        </div>
      </footer>
    </WideShell>
  );
}

function PlanCard({
  badge, price, period, description, features, cta, footnote, highlight,
}: {
  badge: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  cta: { label: string; onClick: () => void; disabled?: boolean };
  footnote?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`marge-card p-7 lg:p-8 flex flex-col h-full ${highlight ? "border-primary/40" : ""}`}>
      <div className={`text-[11px] uppercase tracking-[0.18em] ${highlight ? "text-primary" : "text-muted-foreground"}`}>
        {badge}
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <span className="font-display text-4xl tracking-tight">{price}</span>
        <span className="text-sm text-muted-foreground">{period}</span>
      </div>
      <p className="mt-3 text-sm text-foreground/70 leading-relaxed">{description}</p>

      <ul className="mt-6 space-y-2.5 flex-1">
        {features.map((f, i) => (
          <li key={i} className="flex items-baseline gap-3 text-sm leading-relaxed">
            <span className="mt-1.5 h-1 w-1 rounded-full bg-primary shrink-0" />
            <span className="text-foreground/85">{f}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={cta.onClick}
        disabled={cta.disabled}
        className={`mt-7 rounded-full px-6 py-3 text-sm font-medium transition cursor-pointer ${
          cta.disabled
            ? "border border-border bg-surface text-muted-foreground cursor-not-allowed"
            : highlight
            ? "bg-primary text-primary-foreground hover:opacity-90"
            : "border border-border bg-surface text-foreground hover:bg-muted"
        }`}
      >
        {cta.label}
      </button>
      {footnote && (
        <p className="mt-3 text-xs text-muted-foreground italic">{footnote}</p>
      )}
    </div>
  );
}

function Reassurance({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="font-display text-lg text-foreground">{title}</h3>
      <p className="mt-2 text-sm text-foreground/70 leading-relaxed">{body}</p>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-display text-lg lg:text-xl">{q}</h3>
      <p className="mt-2 text-sm lg:text-[15px] text-foreground/75 leading-relaxed">{children}</p>
    </div>
  );
}
