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
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/diagnostic")({
  head: () => ({ meta: [{ title: "Diagnostic complet — Marge" }] }),
  component: Diagnostic,
});

type Phase = "questions" | "processing" | "saving";

function Diagnostic() {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useRequireAuth();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [phase, setPhase] = useState<Phase>("questions");
  const [error, setError] = useState<string | null>(null);

  const total = TOTAL_QUESTIONS;
  const q = DIAGNOSTIC_QUESTIONS[step];

  useEffect(() => {
    if (!authLoading && session) track("diagnostic_started", {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, session?.user.id]);

  // Group questions by section to show a soft section header
  const sectionForStep = useMemo(() => {
    return DIAGNOSTIC_QUESTIONS[step]?.section ?? "";
  }, [step]);

  if (authLoading || !session) {
    return <PageShell><div className="h-screen" /></PageShell>;
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

      // 5. Call IA for synthesis
      let synthesis;
      try {
        synthesis = await analyzeDiagnostic({
          data: {
            domains: domainsForPrompt,
            overall_intensity: overall,
            recent_checkins: (recentRows ?? []) as never,
            tone,
          },
        });
      } catch (err) {
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
