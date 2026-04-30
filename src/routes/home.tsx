import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { MargeWordmark } from "@/components/Logo";
import { getCheckins, getLastResult, getPrefs, greetingFor, profileProgress, applyTheme } from "@/lib/marge";
import { Settings, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/home")({
  head: () => ({ meta: [{ title: "Accueil — Marge" }] }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [checkinsCount, setCount] = useState(0);
  const [last, setLast] = useState<ReturnType<typeof getLastResult>>(null);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const p = getPrefs();
    applyTheme(p.theme);
    if (!p.completed) { navigate({ to: "/onboarding" }); return; }
    const list = getCheckins();
    setCount(list.length);
    setLast(getLastResult());
    setPct(profileProgress(list.length, p.completed));
    setReady(true);
  }, [navigate]);

  if (!ready) return <PageShell><div className="h-screen" /></PageShell>;

  const greet = greetingFor();

  return (
    <PageShell>
      <div className="flex items-center justify-between">
        <MargeWordmark />
        <div className="flex items-center gap-2">
          <Link to="/week" aria-label="Semaine" className="rounded-full p-2 hover:bg-muted text-muted-foreground"><BarChart3 size={18} /></Link>
          <Link to="/settings" aria-label="Réglages" className="rounded-full p-2 hover:bg-muted text-muted-foreground"><Settings size={18} /></Link>
        </div>
      </div>

      <div className="mt-12">
        <p className="text-sm text-muted-foreground">{greet}.</p>
        <h1 className="mt-2 font-display text-4xl leading-tight">
          {last ? <>Tu étais <span className="text-primary">{last.state_label}</span> à ton dernier point.</> : <>Prêt à faire un point&nbsp;?</>}
        </h1>
        <p className="mt-3 text-foreground/70 text-base leading-relaxed">
          {last ? "Une minute peut suffire à voir plus clair." : "Quelques questions simples. Une réponse utile, tout de suite."}
        </p>
      </div>

      <button
        onClick={() => navigate({ to: "/checkin" })}
        className="mt-10 w-full rounded-2xl bg-primary py-6 text-lg font-medium text-primary-foreground transition hover:opacity-95 active:scale-[0.99] shadow-sm"
      >
        Faire un point
      </button>

      {last && (
        <Link to="/result" className="mt-4 marge-card block p-5 hover:border-primary transition">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Dernier point</div>
          <div className="mt-2 font-display text-xl">{last.explanation}</div>
          <div className="mt-3 text-sm text-primary">Revoir l'action proposée →</div>
        </Link>
      )}

      <div className="mt-6 marge-card p-5">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Profil en construction</div>
          <div className="text-sm text-muted-foreground">{pct}%</div>
        </div>
        <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          Marge commence à mieux repérer ce qui te pèse. {checkinsCount > 0 ? `${checkinsCount} point${checkinsCount > 1 ? "s" : ""} enregistré${checkinsCount > 1 ? "s" : ""}.` : "Fais un premier point pour démarrer."}
        </p>
      </div>

      <Link to="/week" className="mt-4 block text-center text-sm text-muted-foreground hover:text-foreground py-3">
        Voir mon aperçu de la semaine
      </Link>
    </PageShell>
  );
}
