import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/PageShell";
import { MargeMark } from "@/components/Logo";
import { savePrefs, getPrefs } from "@/lib/marge";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Bienvenue — Marge" }] }),
  component: Onboarding,
});

const moments = [
  { id: "morning", label: "Matin" },
  { id: "day", label: "Journée" },
  { id: "evening", label: "Soir" },
];
const goals = [
  { id: "calme", label: "Calme" },
  { id: "clarte", label: "Clarté" },
  { id: "elan", label: "Élan" },
  { id: "equilibre", label: "Équilibre" },
];

function Onboarding() {
  const navigate = useNavigate();
  const initial = getPrefs();
  const [step, setStep] = useState(0);
  const [selectedMoments, setSelectedMoments] = useState<string[]>(initial.best_moments);
  const [goal, setGoal] = useState<string>(initial.main_goal);
  const [notif, setNotif] = useState<boolean | null>(initial.notifications_enabled ? true : null);

  const total = 4;
  const next = () => setStep(s => Math.min(s + 1, total - 1));
  const back = () => setStep(s => Math.max(s - 1, 0));

  const finish = () => {
    savePrefs({
      best_moments: selectedMoments,
      main_goal: goal,
      notifications_enabled: !!notif,
      completed: true,
    });
    navigate({ to: "/home" });
  };

  return (
    <PageShell>
      <div className="flex items-center justify-between">
        <MargeMark size={28} />
        <div className="text-xs text-muted-foreground">{step + 1} / {total}</div>
      </div>
      <div className="mt-3 h-1 w-full rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${((step + 1) / total) * 100}%` }} />
      </div>

      <div className="mt-12 min-h-[55vh] animate-in fade-in slide-in-from-bottom-2 duration-400" key={step}>
        {step === 0 && (
          <div>
            <h2 className="font-display text-3xl leading-tight">Une minute suffit.</h2>
            <p className="mt-5 text-foreground/80 leading-relaxed">
              Marge te pose quelques questions simples. En retour, tu reçois tout de suite
              une lecture claire de ton état et une action utile, courte.
            </p>
          </div>
        )}
        {step === 1 && (
          <div>
            <h2 className="font-display text-3xl leading-tight">Marge apprend avec toi.</h2>
            <p className="mt-5 text-foreground/80 leading-relaxed">
              Plus tu fais des points, mieux Marge repère tes rythmes, tes pics de friction
              et ce qui t'aide vraiment. Sans jugement. Sans bruit.
            </p>
          </div>
        )}
        {step === 2 && (
          <div>
            <h2 className="font-display text-2xl">Quand préfères-tu faire un point&nbsp;?</h2>
            <p className="mt-2 text-sm text-muted-foreground">Choisis un ou plusieurs moments.</p>
            <div className="mt-6 space-y-3">
              {moments.map(m => (
                <button
                  key={m.id}
                  className="marge-choice"
                  data-selected={selectedMoments.includes(m.id)}
                  onClick={() => setSelectedMoments(s => s.includes(m.id) ? s.filter(x => x !== m.id) : [...s, m.id])}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <h3 className="mt-10 font-display text-2xl">Ce que tu cherches le plus&nbsp;?</h3>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {goals.map(g => (
                <button key={g.id} className="marge-choice text-center" data-selected={goal === g.id} onClick={() => setGoal(g.id)}>
                  {g.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {step === 3 && (
          <div>
            <h2 className="font-display text-2xl">Souhaites-tu des rappels doux&nbsp;?</h2>
            <p className="mt-2 text-sm text-muted-foreground">Tu pourras changer ça à tout moment.</p>
            <div className="mt-6 space-y-3">
              <button className="marge-choice" data-selected={notif === true} onClick={() => setNotif(true)}>Oui, doucement</button>
              <button className="marge-choice" data-selected={notif === false} onClick={() => setNotif(false)}>Non, pas pour l'instant</button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 flex items-center gap-3">
        {step > 0 && (
          <button onClick={back} className="rounded-full border border-border bg-surface px-5 py-3 text-sm text-foreground hover:bg-muted">
            Retour
          </button>
        )}
        {step < total - 1 ? (
          <button onClick={next} className="ml-auto rounded-full bg-primary px-6 py-3 text-sm text-primary-foreground hover:opacity-90">
            Continuer
          </button>
        ) : (
          <button onClick={finish} disabled={notif === null} className="ml-auto rounded-full bg-primary px-6 py-3 text-sm text-primary-foreground disabled:opacity-50 hover:opacity-90">
            Terminer
          </button>
        )}
      </div>
    </PageShell>
  );
}
