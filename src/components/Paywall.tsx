// Marge — Paywall components (V2.3.0)
//
// Two reusable building blocks:
//
//   <Paywall feature="chat_full">
//     <ChatUI />
//   </Paywall>
// → renders children when the user has the feature, otherwise renders a
//   PaywallCard with a CTA. Cosmetic gating only — server-side enforcement
//   still lives in requireFeature().
//
//   <PremiumLock title="Marge Plus" reason="Disponible en premium">
//     <ContentCard /> {/* visually blurred, click takes user to paywall */}
//   </PremiumLock>
// → for in-list cards where we want the user to see the title but not consume
//   the body. Used on /library cards.

import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEntitlements } from "@/hooks/use-entitlements";
import { hasFeature, type Feature } from "@/lib/entitlements";
import { track } from "@/lib/analytics";
import { useEffect } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// <Paywall> — gates a whole subtree behind a feature
// ─────────────────────────────────────────────────────────────────────────────

export function Paywall({
  feature,
  children,
  trigger = "feature_blocked",
}: {
  feature: Feature;
  children: ReactNode;
  /** Free-form label sent to analytics so we can compare paywall locations. */
  trigger?: string;
}) {
  const { entitlement, loading } = useEntitlements();

  if (loading) {
    // Quiet placeholder — calm UX, no flicker
    return <div className="h-32" aria-hidden />;
  }

  if (hasFeature(entitlement, feature)) {
    return <>{children}</>;
  }

  return <PaywallCard feature={feature} trigger={trigger} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// <PaywallCard> — the actual upsell surface, with analytics impressions
// ─────────────────────────────────────────────────────────────────────────────

const FEATURE_COPY: Record<Feature, { title: string; body: string }> = {
  library_premium: {
    title: "Disponible avec Marge Plus",
    body: "Cette ressource fait partie des contenus premium. Marge Plus donne accès à toute la bibliothèque.",
  },
  diagnostic_unlimited: {
    title: "Refais ton diagnostic dès que tu veux",
    body: "En premium, tu peux refaire un diagnostic complet à tout moment, plus seulement tous les 90 jours.",
  },
  weekly_review_ai: {
    title: "Bilan hebdo complet",
    body: "Marge Plus génère un bilan narratif personnalisé avec tes facteurs aggravants, ce qui t'aide, et un plan pour la semaine suivante.",
  },
  chat_full: {
    title: "Parler à Marge — disponible avec un compte Plus",
    body: "Cinquante messages par mois pour reformuler, comprendre, ou trouver l'action minuscule qui débloque le reste.",
  },
  personalization_advanced: {
    title: "Recommandations personnalisées",
    body: "Marge Plus adapte ses suggestions à ton rythme, ton énergie et ce qui t'aide vraiment, jour après jour.",
  },
};

export function PaywallCard({
  feature,
  trigger = "feature_blocked",
  variant = "card",
}: {
  feature: Feature;
  trigger?: string;
  variant?: "card" | "inline";
}) {
  const copy = FEATURE_COPY[feature];

  // Fire impression event once per mount
  useEffect(() => {
    track("paywall_viewed", { feature, trigger, variant });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cta = (
    <Link
      to="/pricing"
      onClick={() => track("paywall_cta_clicked", { feature, trigger, destination: "/pricing" })}
      className="inline-flex rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90 cursor-pointer"
    >
      Voir Marge Plus →
    </Link>
  );

  if (variant === "inline") {
    return (
      <div className="text-sm text-foreground/70 leading-relaxed">
        <span className="text-primary font-medium">{copy.title}.</span>{" "}
        <Link
          to="/pricing"
          onClick={() => track("paywall_cta_clicked", { feature, trigger, destination: "/pricing" })}
          className="text-primary hover:opacity-80"
        >
          En savoir plus →
        </Link>
      </div>
    );
  }

  return (
    <div className="marge-card p-7 lg:p-8 border-primary/30 max-w-2xl">
      <div className="text-[11px] uppercase tracking-[0.18em] text-primary">Marge Plus</div>
      <h3 className="mt-3 font-display text-2xl leading-snug">{copy.title}</h3>
      <p className="mt-4 text-foreground/75 leading-relaxed">{copy.body}</p>
      <div className="mt-6">{cta}</div>
      <p className="mt-4 text-xs text-muted-foreground italic">
        Essai 7 jours · Annulable à tout moment
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// <PremiumLock> — visual lock overlay for cards in lists
// ─────────────────────────────────────────────────────────────────────────────

export function PremiumLock({
  children,
  showLabel = true,
}: {
  children: ReactNode;
  /** Show the "Marge Plus" pill in the corner. Default true. */
  showLabel?: boolean;
}) {
  // NOTE: we intentionally do NOT set pointer-events:none on the children.
  // Clicks pass through to the underlying Link / button so the user can
  // open the preview page (which shows the paywall). The visual states
  // (opacity, gradient overlay) are decorative only.
  return (
    <div className="relative">
      <div className="opacity-70 select-none">{children}</div>
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-background/0 via-background/30 to-background/55 pointer-events-none" />
      {showLabel && (
        <div className="absolute top-4 right-4 pointer-events-none">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-3 py-1 text-[11px] uppercase tracking-wider">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Plus
          </span>
        </div>
      )}
    </div>
  );
}
