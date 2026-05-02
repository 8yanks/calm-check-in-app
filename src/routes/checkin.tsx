import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import {
  LABELS, deriveState, buildExplanation, buildMicroAction, saveCheckin,
  type MentalLoad, type CalmLevel, type Blocker, type Need, type StateLabel,
} from "@/lib/marge";
import { analyzeCheckin } from "@/lib/claude";
import { supabase } from "@/integrations/supabase/client";
import { useRequireAuth } from "@/hooks/use-auth";
import { track } from "@/lib/analytics";

export const Route = createFileRoute("/checkin")({
  head: () => ({ meta: [{ title: "Faire un point — Marge" }] }),
  component: Checkin,
});

interface State {
  mental_load?: MentalLoad;
  calm_level?: CalmLevel;
  blocker?: Blocker;
  immediate_need?: Need;
}

function Checkin() {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useRequireAuth();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<State>({});
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!authLoading && session) track("checkin_started", {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, session?.user.id]);

  if (authLoading || !session) {
    return <PageShell><div className="h-screen" /></PageShell>;
  }

  // Loading screen while Claude processes
  if (processing) {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center min-h-[65vh] gap-6">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <div className="text-center">
            <p className="text-base text-foreground">Marge analyse…</p>
            <p className="mt-1 text-sm text-muted-foreground">Quelques secondes.</p>
          </div>
        </div>
      </PageShell>
    );
  }

  const questions = [
    {
      key: "mental_load" as const,
      title: "Tu as combien de choses en tête là, maintenant ?",
      options: Object.entries(LABELS.mental_load) as [MentalLoad, string][],
    },
    {
      key: "calm_level" as const,
      title: "Tu te sens plutôt calme ou débordé ?",
      options: Object.entries(LABELS.calm) as [CalmLevel, string][],
    },
    {
      key: "blocker" as const,
      title: "Qu'est-ce qui te bloque le plus là ?",
      options: Object.entries(LABELS.blocker) as [Blocker, string][],
    },
    {
      key: "immediate_need" as const,
      title: "Tu as besoin de quoi tout de suite ?",
      options: Object.entries(LABELS.need) as [Need, string][],
    },
  ];

  const total = questions.length;
  const q = questions[step];
  const current = state[q.key];

  const choose = (val: string) => {
    if (processing) return;
    const next = { ...state, [q.key]: val };
    setState(next);
    setTimeout(() => {
      if (step < total - 1) setStep(step + 1);
      else finish(next as Required<State>);
    }, 220);
  };

  const finish = async (s: Required<State>) => {
    setProcessing(true);

    // Labels for the Claude prompt (human-readable French)
    const labeledInput = {
      mental_load: LABELS.mental_load[s.mental_load],
      calm_level: LABELS.calm[s.calm_level],
      blocker: LABELS.blocker[s.blocker],
      immediate_need: LABELS.need[s.immediate_need],
    };

    let stateLabel: StateLabel;
    let explanation: string;
    let microAction: string;
    let loadScore: number;
    let usedFallback = false;

    try {
      const result = await analyzeCheckin({ data: labeledInput });
      stateLabel = result.state_label as StateLabel;
      explanation = result.explanation;
      microAction = result.micro_action;
      loadScore = result.load_score;
    } catch (err) {
      console.error("Claude API failed, using fallback:", err);
      usedFallback = true;
      track("checkin_failed", { reason: err instanceof Error ? err.message : "unknown" });
      // Graceful fallback to hardcoded logic
      const derived = deriveState(s.mental_load, s.calm_level);
      stateLabel = derived.label;
      explanation = buildExplanation(s.blocker, s.immediate_need, derived.label);
      microAction = buildMicroAction(s.immediate_need, s.blocker);
      loadScore = derived.score;
    }

    const checkin = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      mental_load: s.mental_load,
      calm_level: s.calm_level,
      blocker: s.blocker,
      immediate_need: s.immediate_need,
      state_label: stateLabel,
      explanation,
      micro_action: microAction,
      load_score: loadScore,
    };

    // Save to localStorage (powers the /result page cache)
    saveCheckin(checkin);

    // Save to Supabase
    try {
      await supabase.from("checkins").insert({
        user_id: session.user.id,
        mental_load: checkin.mental_load,
        calm_level: checkin.calm_level,
        blocker: checkin.blocker,
        immediate_need: checkin.immediate_need,
        state_label: checkin.state_label,
        explanation: checkin.explanation,
        micro_action: checkin.micro_action,
        load_score: checkin.load_score,
      });

      // Increment profile_progress
      const { data: pp } = await supabase
        .from("profile_progress")
        .select("signals_count, percentage")
        .eq("user_id", session.user.id)
        .maybeSingle();

      const newCount = (pp?.signals_count ?? 0) + 1;
      const newPct = Math.min(10 + newCount * 6, 100);
      await supabase.from("profile_progress").upsert({
        user_id: session.user.id,
        signals_count: newCount,
        percentage: newPct,
      });
    } catch (err) {
      console.error("Supabase save error:", err);
      // Continue — result is already in localStorage
    }

    track("checkin_completed", {
      state_label: stateLabel,
      load_score: loadScore,
      used_fallback: usedFallback,
    });

    navigate({ to: "/result" });
  };

  return (
    <PageShell>
      <div className="flex items-center justify-between">
        <Link to="/home" className="text-sm text-muted-foreground hover:text-foreground">← Quitter</Link>
        <div className="text-xs text-muted-foreground">{step + 1} / {total}</div>
      </div>
      <div className="mt-3 h-1 w-full rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${((step + 1) / total) * 100}%` }} />
      </div>

      <div className="mt-12 animate-in fade-in slide-in-from-bottom-2 duration-300" key={step}>
        <h1 className="font-display text-2xl leading-snug">{q.title}</h1>
        <div className="mt-8 space-y-3">
          {q.options.map(([val, label]) => (
            <button key={val} className="marge-choice" data-selected={current === val} onClick={() => choose(val)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {step > 0 && (
        <button onClick={() => setStep(step - 1)} className="mt-8 text-sm text-muted-foreground hover:text-foreground">
          ← Question précédente
        </button>
      )}
    </PageShell>
  );
}
