import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/PageShell";
import {
  LABELS, deriveState, buildExplanation, buildMicroAction, saveCheckin,
  type MentalLoad, type CalmLevel, type Blocker, type Need,
} from "@/lib/marge";

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
  const [step, setStep] = useState(0);
  const [state, setState] = useState<State>({});

  const questions = [
    {
      key: "mental_load" as const,
      title: "Tu as combien de choses en tête là, maintenant\u00a0?",
      options: Object.entries(LABELS.mental_load) as [MentalLoad, string][],
    },
    {
      key: "calm_level" as const,
      title: "Tu te sens plutôt calme ou débordé\u00a0?",
      options: Object.entries(LABELS.calm) as [CalmLevel, string][],
    },
    {
      key: "blocker" as const,
      title: "Qu'est-ce qui te bloque le plus là\u00a0?",
      options: Object.entries(LABELS.blocker) as [Blocker, string][],
    },
    {
      key: "immediate_need" as const,
      title: "Tu as besoin de quoi tout de suite\u00a0?",
      options: Object.entries(LABELS.need) as [Need, string][],
    },
  ];

  const total = questions.length;
  const q = questions[step];
  const current = state[q.key];

  const choose = (val: string) => {
    const next = { ...state, [q.key]: val };
    setState(next);
    setTimeout(() => {
      if (step < total - 1) setStep(step + 1);
      else finish(next as Required<State>);
    }, 220);
  };

  const finish = (s: Required<State>) => {
    const { label, score } = deriveState(s.mental_load, s.calm_level);
    const explanation = buildExplanation(s.blocker, s.immediate_need, label);
    const micro = buildMicroAction(s.immediate_need, s.blocker);
    saveCheckin({
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      mental_load: s.mental_load,
      calm_level: s.calm_level,
      blocker: s.blocker,
      immediate_need: s.immediate_need,
      state_label: label,
      explanation,
      micro_action: micro,
      load_score: score,
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
