import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { getLastResult, getCheckins, getPrefs, profileProgress } from "@/lib/marge";

export const Route = createFileRoute("/result")({
  head: () => ({ meta: [{ title: "Ton point — Marge" }] }),
  component: Result,
});

function Result() {
  const navigate = useNavigate();
  const [last, setLast] = useState<ReturnType<typeof getLastResult>>(null);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const r = getLastResult();
    if (!r) { navigate({ to: "/home" }); return; }
    setLast(r);
    const p = getPrefs();
    setPct(profileProgress(getCheckins().length, p.completed));
  }, [navigate]);

  if (!last) return <PageShell><div className="h-screen" /></PageShell>;

  const stateColor: Record<string, string> = {
    "léger": "oklch(0.85 0.06 145)",
    "chargé": "oklch(0.82 0.07 90)",
    "tendu": "oklch(0.78 0.09 55)",
    "saturé": "oklch(0.7 0.12 30)",
  };

  return (
    <PageShell>
      <div className="animate-in fade-in slide-in-from-bottom-3 duration-500">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Ton état là, maintenant</div>
        <div className="mt-3 inline-flex items-center gap-3 rounded-full px-4 py-2"
             style={{ backgroundColor: stateColor[last.state_label] }}>
          <span className="font-display text-xl text-foreground capitalize">{last.state_label}</span>
        </div>

        <h1 className="mt-8 font-display text-3xl leading-snug">{last.explanation}</h1>

        <div className="mt-8 marge-card p-6">
          <div className="text-xs uppercase tracking-wider text-primary">Action utile · 30 à 90 secondes</div>
          <p className="mt-3 text-lg leading-relaxed text-foreground">{last.micro_action}</p>
        </div>

        <div className="mt-6 marge-card p-5">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Chaque point aide Marge à mieux comprendre ton rythme.
          </p>
          <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 text-xs text-muted-foreground">Profil en construction · {pct}%</div>
        </div>

        <div className="mt-10 space-y-3">
          <Link to="/home" className="block w-full rounded-full bg-primary py-4 text-center text-primary-foreground hover:opacity-90">
            Retour à l'accueil
          </Link>
          <Link to="/week" className="block w-full text-center text-sm text-muted-foreground hover:text-foreground py-2">
            Voir mes derniers points
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
