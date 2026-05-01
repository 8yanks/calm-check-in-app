import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell, WideShell } from "@/components/PageShell";
import { MargeWordmark } from "@/components/Logo";
import { getLastResult, getCheckins, getPrefs, profileProgress } from "@/lib/marge";
import { useRequireAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/result")({
  head: () => ({ meta: [{ title: "Ton point — Marge" }] }),
  component: Result,
});

function Result() {
  const navigate = useNavigate();
  const { session, loading: authLoading, isAnonymous } = useRequireAuth();
  const [last, setLast] = useState<ReturnType<typeof getLastResult>>(null);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const r = getLastResult();
    if (!r) { navigate({ to: "/home" }); return; }
    setLast(r);
    const p = getPrefs();
    setPct(profileProgress(getCheckins().length, p.completed));
  }, [navigate]);

  if (authLoading || !session || !last) return <PageShell><div className="h-screen" /></PageShell>;

  const stateColor: Record<string, string> = {
    "léger": "oklch(0.85 0.06 145)",
    "chargé": "oklch(0.82 0.07 90)",
    "tendu": "oklch(0.78 0.09 55)",
    "saturé": "oklch(0.7 0.12 30)",
  };

  return (
    <WideShell>
      <header className="hidden lg:flex items-center justify-between">
        <Link to="/home"><MargeWordmark /></Link>
        <Link to="/home" className="text-sm text-muted-foreground hover:text-foreground">← Accueil</Link>
      </header>

      {/* MOBILE — preserved */}
      <div className="lg:hidden animate-in fade-in slide-in-from-bottom-3 duration-500">
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

        {isAnonymous ? (
          <div className="mt-8 rounded-2xl border border-primary/40 bg-primary/5 p-5">
            <p className="font-display text-xl leading-snug">Garde tes résultats.</p>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Crée un compte pour sauvegarder tes bilans et suivre ton évolution dans le temps — gratuitement.
            </p>
            <Link to="/auth" className="mt-4 block w-full rounded-full bg-primary py-3 text-center text-sm font-medium text-primary-foreground hover:opacity-90 cursor-pointer">
              Créer mon compte gratuitement
            </Link>
            <Link to="/home" className="mt-3 block w-full text-center text-sm text-muted-foreground hover:text-foreground py-1">
              Continuer sans compte pour l'instant
            </Link>
          </div>
        ) : (
          <div className="mt-10 space-y-3">
            <Link to="/home" className="block w-full rounded-full bg-primary py-4 text-center text-primary-foreground hover:opacity-90">
              Retour à l'accueil
            </Link>
            <Link to="/week" className="block w-full text-center text-sm text-muted-foreground hover:text-foreground py-2">
              Voir mes derniers points
            </Link>
          </div>
        )}
      </div>

      {/* DESKTOP — grouped editorial */}
      <section className="hidden lg:grid grid-cols-12 gap-12 mt-16 animate-in fade-in slide-in-from-bottom-3 duration-500">
        {/* Left: state + explanation */}
        <div className="col-span-7 max-w-2xl">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Ton état, là, maintenant</div>
          <div className="mt-5 inline-flex items-center gap-3 rounded-full px-5 py-2.5"
               style={{ backgroundColor: stateColor[last.state_label] }}>
            <span className="h-2 w-2 rounded-full bg-foreground/40" />
            <span className="font-display text-2xl text-foreground capitalize">{last.state_label}</span>
          </div>
          <h1 className="mt-10 font-display text-5xl leading-[1.1] tracking-tight max-w-[20ch]">
            {last.explanation}
          </h1>

          <div className="mt-12 flex items-center gap-4">
            <Link to="/home" className="rounded-full bg-primary px-8 py-4 text-base font-medium text-primary-foreground hover:opacity-90">
              Retour à l'accueil
            </Link>
            <Link to="/week" className="text-sm text-foreground/70 hover:text-foreground px-4 py-4">
              Voir mes derniers points →
            </Link>
          </div>
        </div>

        {/* Right: action + progress */}
        <aside className="col-span-5 space-y-5">
          <div className="marge-card p-8 border-primary/30">
            <div className="text-xs uppercase tracking-wider text-primary">Action utile · 30 à 90 secondes</div>
            <p className="mt-5 text-xl leading-relaxed text-foreground font-display">
              {last.micro_action}
            </p>
          </div>
          <div className="marge-card p-6">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Chaque point aide Marge à mieux comprendre ton rythme.
            </p>
            <div className="mt-4 h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all duration-700" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-2 text-xs text-muted-foreground">Profil en construction · {pct}%</div>
          </div>

          {isAnonymous && (
            <div className="rounded-2xl border border-primary/40 bg-primary/5 p-6">
              <p className="font-display text-xl leading-snug">Garde tes résultats.</p>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Crée un compte pour sauvegarder tes bilans et suivre ton évolution dans le temps — gratuitement.
              </p>
              <Link to="/auth" className="mt-4 block w-full rounded-full bg-primary py-3 text-center text-sm font-medium text-primary-foreground hover:opacity-90 cursor-pointer">
                Créer mon compte gratuitement
              </Link>
              <Link to="/home" className="mt-3 block w-full text-center text-sm text-muted-foreground hover:text-foreground py-1">
                Continuer sans compte
              </Link>
            </div>
          )}
        </aside>
      </section>
    </WideShell>
  );
}
