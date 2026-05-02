import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { PageShell, WideShell } from "@/components/PageShell";
import { MargeWordmark } from "@/components/Logo";
import { useRequireAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  DOMAIN_LABELS,
  DOMAIN_DESCRIPTIONS,
  type Domain,
} from "@/lib/diagnostic";
import type { Tables } from "@/integrations/supabase/types";

const searchSchema = z.object({ id: z.string().uuid().optional() });

export const Route = createFileRoute("/diagnostic-result")({
  head: () => ({ meta: [{ title: "Ton profil — Marge" }] }),
  validateSearch: searchSchema,
  component: DiagnosticResult,
});

interface ScoreSummary {
  domains: Record<string, number>;
  overall_intensity: number;
  buckets: Record<string, "calme" | "modéré" | "élevé" | "intense">;
}

interface AISynthesis {
  profile_summary: string;
  intensity_label: string;
  vigilance_zones: Array<{ name: string; why: string }>;
  protective_factors: Array<{ name: string; why: string }>;
  recommendations: Array<{ action: string; content_slug?: string }>;
  next_step: string;
}

function DiagnosticResult() {
  const { id } = useSearch({ from: "/diagnostic-result" });
  const { session, loading: authLoading } = useRequireAuth();
  const [assessment, setAssessment] = useState<Tables<"assessments"> | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (authLoading || !session) return;
    let q = supabase
      .from("assessments")
      .select("*")
      .eq("user_id", session.user.id)
      .order("completed_at", { ascending: false, nullsFirst: false })
      .limit(1);
    // If a specific id was passed, fetch that one instead of the latest
    if (id) {
      q = supabase.from("assessments").select("*").eq("user_id", session.user.id).eq("id", id).limit(1);
    }
    q.maybeSingle().then(({ data }) => {
      if (!data) { setNotFound(true); return; }
      setAssessment(data);
    });
  }, [authLoading, session, id]);

  if (authLoading || !session) return <PageShell><div className="h-screen" /></PageShell>;

  if (notFound) {
    return (
      <PageShell>
        <Link to="/home" className="text-sm text-muted-foreground hover:text-foreground">← Accueil</Link>
        <div className="mt-20 text-center">
          <h1 className="font-display text-3xl">Diagnostic introuvable</h1>
          <p className="mt-3 text-muted-foreground">Aucun diagnostic récent pour ce compte.</p>
          <Link to="/diagnostic" className="mt-6 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm text-primary-foreground hover:opacity-90">
            Faire un diagnostic
          </Link>
        </div>
      </PageShell>
    );
  }

  if (!assessment) return <PageShell><div className="h-screen" /></PageShell>;

  const scores = assessment.score_summary as unknown as ScoreSummary;
  const synthesis = assessment.ai_synthesis as unknown as AISynthesis | null;
  const completedDate = assessment.completed_at
    ? new Date(assessment.completed_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : "Diagnostic en cours";

  const intensityLabel = synthesis?.intensity_label ?? "—";
  const overallPct = Math.round((scores?.overall_intensity ?? 0) * 100);

  const sortedDomains = scores?.domains
    ? Object.entries(scores.domains)
        .map(([domain, ratio]) => ({ domain: domain as Domain, ratio }))
        .sort((a, b) => b.ratio - a.ratio)
    : [];

  return (
    <WideShell>
      <header className="flex items-center justify-between">
        <Link to="/home"><MargeWordmark /></Link>
        <Link to="/home" className="text-sm text-muted-foreground hover:text-foreground">← Accueil</Link>
      </header>

      <article className="mt-12 lg:mt-16 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-3 duration-500">
        {/* Header band */}
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{completedDate}</div>
        <h1 className="mt-4 font-display text-4xl lg:text-6xl leading-[1.05] tracking-tight">
          Ton profil,<br />
          <span className="text-primary">à un instant T.</span>
        </h1>

        {/* Profile summary */}
        {synthesis && (
          <p className="mt-8 text-lg lg:text-xl text-foreground/85 leading-relaxed font-display max-w-3xl">
            {synthesis.profile_summary}
          </p>
        )}

        {/* Intensity chip */}
        <div className="mt-10 inline-flex items-center gap-3 rounded-full border border-border bg-surface px-5 py-2.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Intensité globale</span>
          <span className="font-display text-base capitalize text-foreground">{intensityLabel}</span>
          <span className="text-xs text-muted-foreground tabular-nums">· {overallPct}%</span>
        </div>

        {/* Two-column layout: domain bars (left), narrative components (right) */}
        <div className="mt-16 grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* DOMAIN BARS */}
          <div className="lg:col-span-7">
            <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Lecture par dimension</div>
            <div className="mt-6 space-y-4">
              {sortedDomains.map(({ domain, ratio }) => (
                <DomainBar key={domain} domain={domain} ratio={ratio} />
              ))}
            </div>
          </div>

          {/* SIDE: vigilance + protective + recommendations */}
          <aside className="lg:col-span-5 space-y-8">
            {synthesis && synthesis.vigilance_zones.length > 0 && (
              <div className="marge-card p-6 border-primary/30">
                <div className="text-[11px] uppercase tracking-wider text-primary">Zones de vigilance</div>
                <ul className="mt-4 space-y-3">
                  {synthesis.vigilance_zones.map((z, i) => (
                    <li key={i}>
                      <div className="font-display text-base">{z.name}</div>
                      <p className="mt-1 text-sm text-foreground/70 leading-relaxed">{z.why}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {synthesis && synthesis.protective_factors.length > 0 && (
              <div className="marge-card p-6">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Facteurs protecteurs</div>
                <ul className="mt-4 space-y-3">
                  {synthesis.protective_factors.map((f, i) => (
                    <li key={i}>
                      <div className="font-display text-base">{f.name}</div>
                      <p className="mt-1 text-sm text-foreground/70 leading-relaxed">{f.why}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>

        {/* Recommendations row */}
        {synthesis && synthesis.recommendations.length > 0 && (
          <section className="mt-16">
            <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Recommandations</div>
            <h2 className="mt-3 font-display text-2xl lg:text-3xl">
              Quelques pas concrets, dans l'ordre.
            </h2>
            <ol className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
              {synthesis.recommendations.map((r, i) => (
                <li key={i} className="marge-card p-6">
                  <div className="text-[10px] uppercase tracking-wider text-primary tabular-nums">{String(i + 1).padStart(2, "0")}</div>
                  <p className="mt-3 font-display text-lg leading-snug">{r.action}</p>
                  {r.content_slug && (
                    <Link
                      to="/library/$slug"
                      params={{ slug: r.content_slug }}
                      className="mt-4 inline-block text-sm text-primary hover:opacity-80"
                    >
                      Ouvrir le contenu →
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Next step + actions */}
        <section className="mt-16 marge-card p-8 border-primary/30 max-w-3xl">
          <div className="text-[11px] uppercase tracking-wider text-primary">Prochain pas</div>
          <p className="mt-3 font-display text-xl leading-snug">
            {synthesis?.next_step ?? "Tu peux refaire un check-in court à tout moment."}
          </p>
          <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3">
            <Link to="/home" className="rounded-full bg-primary px-6 py-3 text-sm text-primary-foreground hover:opacity-90 cursor-pointer text-center">
              Retour à l'accueil
            </Link>
            <Link to="/library" className="text-sm text-foreground/70 hover:text-foreground transition px-3 py-3 text-center">
              Explorer la bibliothèque →
            </Link>
            <span className="text-xs text-muted-foreground italic sm:ml-auto">
              « Parler à Marge » — bientôt disponible
            </span>
          </div>
        </section>

        <footer className="mt-20 text-xs text-muted-foreground italic max-w-xl">
          Marge n'est pas un dispositif médical. Cette synthèse n'est pas un diagnostic clinique.
          Si tu traverses une période difficile, parler à un professionnel reste la meilleure démarche.
        </footer>
      </article>
    </WideShell>
  );
}

function DomainBar({ domain, ratio }: { domain: Domain; ratio: number }) {
  const label = DOMAIN_LABELS[domain] ?? domain;
  const description = DOMAIN_DESCRIPTIONS[domain] ?? "";
  const pct = Math.round(ratio * 100);
  const bucket: "calme" | "modéré" | "élevé" | "intense" =
    ratio <= 0.25 ? "calme" : ratio <= 0.5 ? "modéré" : ratio <= 0.75 ? "élevé" : "intense";
  const colorClass =
    bucket === "calme" ? "bg-primary/40"
    : bucket === "modéré" ? "bg-primary/60"
    : bucket === "élevé" ? "bg-primary/80"
    : "bg-primary";

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div className="font-display text-base">{label}</div>
        <div className="text-xs text-muted-foreground tabular-nums">{pct}% · {bucket}</div>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full ${colorClass} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
