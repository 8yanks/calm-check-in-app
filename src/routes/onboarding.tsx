import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { WideShell } from "@/components/PageShell";
import { MargeMark } from "@/components/Logo";
import { savePrefs, getPrefs } from "@/lib/marge";
import { supabase } from "@/integrations/supabase/client";
import { useRequireAuth } from "@/hooks/use-auth";
import { track } from "@/lib/analytics";

// Optional ?next= param so callers can route the user to /diagnostic, /chat,
// etc. after onboarding completes. Defaults to /home.
const onboardingSearch = z.object({ next: z.string().optional() });

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Bienvenue — Marge" }] }),
  validateSearch: onboardingSearch,
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
  const { next: nextPath } = Route.useSearch();
  const { session, loading: authLoading } = useRequireAuth();
  const initial = getPrefs();
  const [step, setStep] = useState(0);
  const [selectedMoments, setSelectedMoments] = useState<string[]>(initial.best_moments);
  const [goal, setGoal] = useState<string>(initial.main_goal);
  const [notif, setNotif] = useState<boolean | null>(initial.notifications_enabled ? true : null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && session) track("onboarding_started", {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, session?.user.id]);

  if (authLoading || !session) return <WideShell><div className="h-screen" /></WideShell>;

  const total = 4;
  const next = () => setStep(s => Math.min(s + 1, total - 1));
  const back = () => setStep(s => Math.max(s - 1, 0));

  const finish = async () => {
    setSubmitting(true);
    try {
      // Save to Supabase. onConflict: "user_id" is REQUIRED — onboarding_preferences
      // has PK on `id` with a UNIQUE on `user_id`; without it the upsert tries to
      // INSERT a new row and violates the unique constraint when the user re-onboards.
      const { error: prefsErr } = await supabase
        .from("onboarding_preferences")
        .upsert(
          {
            user_id: session.user.id,
            best_moments: selectedMoments,
            main_goal: goal || null,
            notifications_enabled: !!notif,
            theme: "light",
          },
          { onConflict: "user_id" }
        );
      if (prefsErr) throw prefsErr;

      // Initialize profile_progress (PK is user_id → default upsert works).
      // Don't reset existing progress on re-onboarding: ignoreDuplicates.
      await supabase.from("profile_progress").upsert(
        {
          user_id: session.user.id,
          percentage: 10,
          signals_count: 0,
        },
        { ignoreDuplicates: true }
      );
    } catch (err) {
      console.error("Onboarding DB save error:", err);
      // Continue anyway — we also save locally
    }

    // Keep localStorage as cache
    savePrefs({
      best_moments: selectedMoments,
      main_goal: goal,
      notifications_enabled: !!notif,
      completed: true,
    });
    track("onboarding_completed", {
      moments_count: selectedMoments.length,
      has_goal: !!goal,
      notifications: !!notif,
      next: nextPath ?? "/home",
    });
    // Hand off to the originally-intended destination, or default to /home.
    if (nextPath === "/diagnostic") navigate({ to: "/diagnostic" });
    else if (nextPath === "/chat") navigate({ to: "/chat" });
    else navigate({ to: "/home" });
  };

  // Editorial hints for each step
  const stepMeta = [
    { eyebrow: "Bienvenue", side: "Marge n'attend rien de toi. Pas d'objectif, pas de score. Juste un endroit calme pour faire un point quand tu en as besoin." },
    { eyebrow: "Comment ça marche", side: "Quelques questions courtes, une lecture claire, une seule action utile. Trente secondes, pas plus." },
    { eyebrow: "Tes préférences", side: "Ces choix aident Marge à se présenter au bon moment. Tu peux les changer plus tard, sans rien perdre." },
    { eyebrow: "Presque fini", side: "Les rappels restent discrets, jamais culpabilisants. Tu peux aussi t'en passer complètement." },
  ] as const;

  const StepContent = (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-400" key={step}>
      {step === 0 && (
        <div>
          <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary marge-breath" aria-hidden />
            <span>Premier point</span>
          </div>
          <h2 className="mt-6 font-display text-3xl lg:text-[3.4rem] leading-[1.04] tracking-tight">
            Une minute<br className="hidden lg:block" /> suffit.
          </h2>
          <p className="mt-6 lg:mt-10 text-foreground/80 leading-relaxed lg:text-lg lg:max-w-md">
            Marge te pose quelques questions simples. En retour, tu reçois tout de suite
            une lecture claire de ton état et une action utile, courte.
          </p>
          <p className="mt-6 hidden lg:block text-sm text-foreground/55 leading-relaxed max-w-sm">
            Pas de compte à créer pour commencer. Tu peux t'arrêter à tout moment.
          </p>
        </div>
      )}
      {step === 1 && (
        <div>
          <h2 className="font-display text-3xl lg:text-5xl leading-[1.05] tracking-tight">Marge apprend avec toi.</h2>
          <p className="mt-6 lg:mt-8 text-foreground/80 leading-relaxed lg:text-lg lg:max-w-md">
            Plus tu fais des points, mieux Marge repère tes rythmes, tes pics de friction
            et ce qui t'aide vraiment. Sans jugement. Sans bruit.
          </p>
        </div>
      )}
      {step === 2 && (
        <div>
          <h2 className="font-display text-2xl lg:text-4xl tracking-tight">Quand préfères-tu faire un point&nbsp;?</h2>
          <p className="mt-2 text-sm text-muted-foreground">Choisis un ou plusieurs moments.</p>
          <div className="mt-6 lg:mt-8 space-y-3 lg:max-w-md">
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
          <h3 className="mt-10 lg:mt-14 font-display text-2xl lg:text-3xl tracking-tight">Ce que tu cherches le plus&nbsp;?</h3>
          <div className="mt-4 lg:mt-6 grid grid-cols-2 gap-3 lg:max-w-md">
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
          <h2 className="font-display text-2xl lg:text-4xl tracking-tight">Souhaites-tu des rappels doux&nbsp;?</h2>
          <p className="mt-2 text-sm text-muted-foreground">Tu pourras changer ça à tout moment.</p>
          <div className="mt-6 lg:mt-8 space-y-3 lg:max-w-md">
            <button className="marge-choice" data-selected={notif === true} onClick={() => setNotif(true)}>Oui, doucement</button>
            <button className="marge-choice" data-selected={notif === false} onClick={() => setNotif(false)}>Non, pas pour l'instant</button>
          </div>
        </div>
      )}
    </div>
  );

  const Actions = (
    <div className="flex items-center gap-3">
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
        <button
          onClick={finish}
          disabled={notif === null || submitting}
          className="ml-auto rounded-full bg-primary px-6 py-3 text-sm text-primary-foreground disabled:opacity-50 hover:opacity-90"
        >
          {submitting ? "…" : "Terminer"}
        </button>
      )}
    </div>
  );

  const StepDots = (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className="h-px transition-all duration-500"
          style={{
            width: i === step ? 28 : 14,
            backgroundColor: i <= step ? "var(--color-primary)" : "var(--color-border)",
            opacity: i <= step ? 1 : 0.7,
          }}
        />
      ))}
    </div>
  );

  return (
    <WideShell>
      <div className="flex items-center justify-between">
        <MargeMark size={28} />
        <div className="text-xs text-muted-foreground tabular-nums">{step + 1} / {total}</div>
      </div>

      {/* MOBILE */}
      <div className="lg:hidden">
        <div className="mt-3 h-1 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all duration-500" style={{ width: `${((step + 1) / total) * 100}%` }} />
        </div>
        <div className="mt-12 min-h-[55vh]">{StepContent}</div>
        <div className="mt-8">{Actions}</div>
      </div>

      {/* DESKTOP — two-column editorial */}
      <div className="hidden lg:block">
        <div className="mt-10 grid grid-cols-12 gap-16 min-h-[70vh]">
          <aside className="col-span-4 flex flex-col justify-between border-r border-border pr-12">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                {stepMeta[step].eyebrow}
              </div>
              <div className="mt-6 font-display text-xl text-foreground/85 leading-snug">
                Marge.
              </div>
              <p className="mt-4 text-sm text-foreground/65 leading-relaxed max-w-xs">
                {stepMeta[step].side}
              </p>
            </div>
            <div className="space-y-6">
              <ol className="space-y-3 text-sm">
                {["Bienvenue", "Comment ça marche", "Tes préférences", "Rappels"].map((label, i) => (
                  <li key={label} className="flex items-baseline gap-3">
                    <span className={`tabular-nums text-[11px] ${i === step ? "text-primary" : "text-muted-foreground/60"}`}>
                      0{i + 1}
                    </span>
                    <span className={i === step ? "text-foreground" : "text-foreground/45"}>
                      {label}
                    </span>
                  </li>
                ))}
              </ol>
              {StepDots}
            </div>
          </aside>
          <div className="col-span-8 flex flex-col">
            <div className="flex-1 max-w-2xl pt-4">{StepContent}</div>
            <div className="mt-12 max-w-2xl">{Actions}</div>
          </div>
        </div>
      </div>
    </WideShell>
  );
}
