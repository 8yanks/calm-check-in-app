import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageShell, WideShell } from "@/components/PageShell";
import { useRequireAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics";
import {
  DIAGNOSTIC_QUESTIONS,
  TOTAL_QUESTIONS,
  computeDomainScores,
  computeOverallIntensity,
  type AnswerMap,
} from "@/lib/diagnostic";
import { analyzeDiagnostic } from "@/lib/claude";
import { getTraits, pickTone, recomputeAndStoreTraits } from "@/lib/personalization";
import { useEntitlements } from "@/hooks/use-entitlements";
import { hasFeature } from "@/lib/entitlements";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/diagnostic")({
  head: () => ({ meta: [{ title: "Diagnostic complet — Marge" }] }),
  component: Diagnostic,
});

type Phase = "loading" | "blocked" | "questions" | "processing" | "saving";

const COOLDOWN_DAYS = 90;

function Diagnostic() {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useRequireAuth();
  const { entitlement, loading: entLoading } = useEntitlements();
  const canUnlimited = hasFeature(entitlement, "diagnostic_unlimited");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [nextAvailable, setNextAvailable] = useState<string | null>(null);

  const total = TOTAL_QUESTIONS;
  const q = DIAGNOSTIC_QUESTIONS[step];

  // Pre-flight cap check: query the user's most recent completed diagnostic
  // and decide whether they can start a new one. Premium users skip the
  // check entirely. Done client-side; the server function re-validates on
  // submit for real enforcement.
  useEffect(() => {
    if (authLoading || !session || entLoading) return;

    if (canUnlimited) {
      setPhase("questions");
      track("diagnostic_started", { plan: entitlement?.plan ?? "premium" });
      return;
    }

    let cancelled = false;
    (async () => {
      const { data: latest } = await supabase
        .from("assessments")
        .select("completed_at")
        .eq("user_id", session.user.id)
        .eq("type", "diagnostic")
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if (!latest?.completed_at) {
        setPhase("questions");
        track("diagnostic_started", { plan: "free", first_time: true });
        return;
      }

      const lastTs = new Date(latest.completed_at).getTime();
      const nextTs = lastTs + COOLDOWN_DAYS * 24 * 3600 * 1000;
      if (Date.now() < nextTs) {
        setNextAvailable(new Date(nextTs).toISOString());
        setPhase("blocked");
      } else {
        setPhase("questions");
        track("diagnostic_started", { plan: "free", first_time: false });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, session?.user.id, entLoading, canUnlimited]);

  // Group questions by section to show a soft section header
  const sectionForStep = useMemo(() => {
    return DIAGNOSTIC_QUESTIONS[step]?.section ?? "";
  }, [step]);

  if (authLoading || !session || phase === "loading") {
    return <PageShell><div className="h-screen" /></PageShell>;
  }

  // Free user blocked by the cooldown — calm, dated message + premium upsell.
  if (phase === "blocked" && nextAvailable) {
    return <DiagnosticBlocked nextAvailable={nextAvailable} />;
  }

  if (phase === "processing" || phase === "saving") {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center min-h-[65vh] gap-6">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <div className="text-center">
            <p className="text-base text-foreground">
              {phase === "processing" ? "Marge construit ta synthèse…" : "Sauvegarde en cours…"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Quelques secondes.</p>
          </div>
        </div>
      </PageShell>
    );
  }

  const choose = (rawValue: number) => {
    const next = { ...answers, [q.key]: rawValue };
    setAnswers(next);
    setTimeout(() => {
      if (step < total - 1) setStep(step + 1);
      else finish(next);
    }, 220);
  };

  const finish = async (final: AnswerMap) => {
    setPhase("processing");
    setError(null);

    try {
      // 1. Compute scores client-side (works whether IA is up or not)
      const domainScores = computeDomainScores(final);
      const overall = computeOverallIntensity(final);
      const domainsForPrompt: Record<string, number> = {};
      for (const d of domainScores) domainsForPrompt[d.domain] = d.ratio;

      // 2. Pull personalization tone + last few checkins for context
      const traits = await getTraits(session.user.id);
      const tone = pickTone(traits?.fragility_estimate as never);

      const { data: recentRows } = await supabase
        .from("checkins")
        .select("state_label,explanation,created_at")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(3);

      // 3. Insert assessment row early (we will UPDATE with synthesis when IA returns)
      const { data: inserted, error: insertErr } = await supabase
        .from("assessments")
        .insert({
          user_id: session.user.id,
          type: "diagnostic",
          started_at: new Date().toISOString(),
          score_summary: {
            domains: domainsForPrompt as never,
            overall_intensity: overall,
            buckets: Object.fromEntries(domainScores.map(d => [d.domain, d.bucket])),
          } as never,
        })
        .select("id")
        .single();
      if (insertErr) throw insertErr;
      const assessmentId = inserted!.id;

      // 4. Bulk insert raw answers (best-effort; we already have the synthesis input)
      const rows = DIAGNOSTIC_QUESTIONS
        .filter(qq => qq.key in final)
        .map(qq => ({
          assessment_id: assessmentId,
          question_key: qq.key,
          value: final[qq.key],
        }));
      if (rows.length > 0) {
        await supabase.from("assessment_answers").insert(rows);
      }

      // 5. Call IA for synthesis. The server function re-validates the cap
      // server-side using the access_token — if the user got past our
      // pre-flight check via a stale state, the server will throw
      // DIAGNOSTIC_BLOCKED here and we render the blocked state instead.
      let synthesis;
      try {
        synthesis = await analyzeDiagnostic({
          data: {
            domains: domainsForPrompt,
            overall_intensity: overall,
            recent_checkins: (recentRows ?? []) as never,
            tone,
            access_token: session.access_token,
          },
        });
      } catch (err: unknown) {
        const isQuotaError =
          (err instanceof Error && err.message.includes("DIAGNOSTIC_BLOCKED")) ||
          (typeof err === "object" && err !== null && "code" in err &&
           (err as { code?: string }).code === "DIAGNOSTIC_BLOCKED");

        if (isQuotaError) {
          // Roll back the assessment row we created — we never finished.
          // Best-effort, ignore failures.
          void supabase.from("assessments").delete().eq("id", assessmentId);
          // Try to extract next_available_at from the thrown error's payload.
          const next = (err as { next_available_at?: string }).next_available_at;
          setNextAvailable(next ?? new Date(Date.now() + COOLDOWN_DAYS * 24 * 3600 * 1000).toISOString());
          setPhase("blocked");
          return;
        }

        console.error("analyzeDiagnostic failed, using fallback:", err);
        synthesis = buildFallbackSynthesis(domainScores, overall);
      }

      // 6. Save synthesis + completion timestamp
      setPhase("saving");
      await supabase
        .from("assessments")
        .update({
          completed_at: new Date().toISOString(),
          ai_synthesis: synthesis as never,
        })
        .eq("id", assessmentId);

      // 7. Update profile_progress (each diagnostic counts as a strong signal)
      try {
        const { data: pp } = await supabase
          .from("profile_progress")
          .select("signals_count, percentage")
          .eq("user_id", session.user.id)
          .maybeSingle();
        const newCount = (pp?.signals_count ?? 0) + 3; // a diagnostic ≈ 3 signals
        const newPct = Math.min(10 + newCount * 6, 100);
        await supabase.from("profile_progress").upsert({
          user_id: session.user.id,
          signals_count: newCount,
          percentage: newPct,
        });
      } catch (err) {
        console.warn("profile_progress update failed (non-fatal):", err);
      }

      // 8. Recompute traits in the background — don't await, don't block.
      void recomputeAndStoreTraits(session.user.id);

      track("diagnostic_completed", {
        intensity_label: (synthesis as { intensity_label?: string }).intensity_label,
        overall: Number(overall.toFixed(2)),
      });

      navigate({ to: "/diagnostic-result", search: { id: assessmentId } });
    } catch (err) {
      console.error("Diagnostic flow failed:", err);
      setError("Une erreur est survenue. Tu peux réessayer dans un instant.");
      setPhase("questions");
    }
  };

  const progressPct = ((step + 1) / total) * 100;
  const current = answers[q.key];

  return (
    <WideShell>
      <div className="flex items-center justify-between">
        <Link to="/home" className="text-sm text-muted-foreground hover:text-foreground">← Quitter</Link>
        <div className="text-xs text-muted-foreground tabular-nums">{step + 1} / {total}</div>
      </div>
      <div className="mt-3 h-1 w-full rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="mt-12 lg:mt-16 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-300" key={q.key}>
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{sectionForStep}</div>
        <h1 className="mt-4 font-display text-2xl lg:text-3xl leading-snug">{q.prompt}</h1>

        <div className="mt-8 space-y-3">
          {q.options.map((label, idx) => (
            <button
              key={idx}
              className="marge-choice w-full"
              data-selected={current === idx}
              onClick={() => choose(idx)}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <div className="mt-6 text-sm text-destructive">{error}</div>}

        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            className="mt-10 text-sm text-muted-foreground hover:text-foreground"
          >
            ← Question précédente
          </button>
        )}
      </div>
    </WideShell>
  );
}

/**
 * Calm screen shown to free users who already did their diagnostic in the
 * past 90 days. Surfaces the exact date they can come back, links to the
 * previous result, and offers Marge Plus for unlimited diagnostics.
 */
function DiagnosticBlocked({ nextAvailable }: { nextAvailable: string }) {
  const nextDate = new Date(nextAvailable);
  const formatted = nextDate.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const daysLeft = Math.max(
    1,
    Math.ceil((nextDate.getTime() - Date.now()) / (24 * 3600 * 1000)),
  );

  return (
    <WideShell>
      <header className="flex items-center justify-between">
        <Link to="/home" className="text-sm text-muted-foreground hover:text-foreground">
          ← Accueil
        </Link>
      </header>

      <article className="mt-16 lg:mt-24 max-w-2xl mx-auto text-center lg:text-left">
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Diagnostic complet
        </div>
        <h1 className="mt-4 font-display text-4xl lg:text-5xl leading-[1.05] tracking-tight">
          Tu as déjà fait ton diagnostic récemment.
        </h1>
        <p className="mt-6 text-lg text-foreground/75 leading-relaxed">
          Marge te propose le diagnostic complet une fois tous les {COOLDOWN_DAYS} jours
          en gratuit. Ça laisse le temps aux choses d'évoluer entre deux lectures —
          c'est ce qui rend la comparaison utile.
        </p>

        <div className="mt-10 marge-card p-7 text-left">
          <div className="text-[11px] uppercase tracking-wider text-primary">Prochain diagnostic</div>
          <p className="mt-3 font-display text-2xl">
            Disponible le {formatted}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Dans {daysLeft} jour{daysLeft > 1 ? "s" : ""}.
          </p>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-3">
          <Link
            to="/diagnostic-result"
            className="rounded-full bg-primary px-6 py-3 text-sm text-primary-foreground hover:opacity-90 cursor-pointer text-center"
          >
            Revoir mon dernier diagnostic
          </Link>
          <Link
            to="/home"
            className="text-sm text-muted-foreground hover:text-foreground transition px-3 py-3 text-center"
          >
            Retour à l'accueil
          </Link>
        </div>

        <div className="mt-12 lg:mt-16 marge-card p-6 lg:p-7 border-primary/30 text-left">
          <div className="text-[11px] uppercase tracking-[0.18em] text-primary">Marge Plus</div>
          <p className="mt-3 font-display text-lg leading-snug">
            Refais un diagnostic dès que tu veux.
          </p>
          <p className="mt-2 text-sm text-foreground/70 leading-relaxed">
            Avec Marge Plus, tu peux refaire un diagnostic à tout moment et comparer
            l'évolution dans le temps.
          </p>
          <Link
            to="/pricing"
            className="mt-4 inline-block text-sm text-primary hover:opacity-80"
          >
            Voir Marge Plus →
          </Link>
        </div>

        <footer className="mt-16 text-xs text-muted-foreground italic">
          Marge n'est pas un dispositif médical. Si tu traverses une période difficile,
          parler à un professionnel reste la meilleure démarche.
        </footer>
      </article>
    </WideShell>
  );
}

/**
 * Local fallback synthesis if Claude is unavailable. Honest about being a
 * basic reading; still useful so the user always lands on a result.
 */
function buildFallbackSynthesis(
  scores: ReturnType<typeof computeDomainScores>,
  overall: number,
): Tables<"assessments">["ai_synthesis"] {
  const intensity_label =
    overall <= 0.25 ? "clair"
    : overall <= 0.5 ? "modéré"
    : overall <= 0.75 ? "élevé"
    : "intense";

  const top = scores.filter(s => s.ratio >= 0.5).sort((a, b) => b.ratio - a.ratio);
  const low = scores.filter(s => s.ratio <= 0.25).sort((a, b) => a.ratio - b.ratio);

  return {
    profile_summary:
      overall <= 0.3
        ? "Tu sembles dans une période plutôt calme, avec quelques tensions ponctuelles. Marge a peu de signaux d'alerte à te remonter."
        : overall <= 0.6
        ? "Tu portes une charge réelle en ce moment, sans que ce soit submergeant. Quelques zones méritent qu'on les regarde de près."
        : "Tu traverses une période chargée, avec plusieurs signaux qui s'accumulent. C'est un bon moment pour ralentir et te poser.",
    intensity_label,
    vigilance_zones: top.slice(0, 3).map(s => ({
      name: s.domain,
      why: `Score ${s.bucket} sur cette dimension.`,
    })),
    protective_factors: low.slice(0, 2).map(s => ({
      name: s.domain,
      why: `Cette dimension reste plutôt préservée.`,
    })),
    recommendations: [
      { action: "Faire un check-in court demain matin", content_slug: "routine-matin-2min" },
      { action: "Prendre 2 minutes pour respirer", content_slug: "respiration-4-6" },
      { action: "Externaliser ce qui pèse sur papier", content_slug: "vider-papier" },
    ],
    next_step: "Tu peux refaire un diagnostic dans quelques semaines pour voir comment ça évolue.",
  } as never;
}
