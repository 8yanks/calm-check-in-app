import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell, WideShell } from "@/components/PageShell";
import { MargeWordmark } from "@/components/Logo";
import { getCheckins, getLastResult, getPrefs, greetingFor, profileProgress, applyTheme, weeklyInsights, type CheckinRecord } from "@/lib/marge";
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
  const [recent, setRecent] = useState<CheckinRecord[]>([]);
  const [insights, setInsights] = useState<string[]>([]);

  useEffect(() => {
    const p = getPrefs();
    applyTheme(p.theme);
    if (!p.completed) { navigate({ to: "/onboarding" }); return; }
    const list = getCheckins();
    setCount(list.length);
    setLast(getLastResult());
    setPct(profileProgress(list.length, p.completed));
    setRecent(list.slice(0, 3));
    const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
    setInsights(weeklyInsights(list.filter(c => new Date(c.created_at).getTime() >= cutoff)));
    setReady(true);
  }, [navigate]);

  if (!ready) return <PageShell><div className="h-screen" /></PageShell>;

  const greet = greetingFor();

  return (
    <WideShell>
      <header className="flex items-center justify-between">
        <MargeWordmark />
        <div className="flex items-center gap-2">
          <Link to="/week" aria-label="Semaine" className="rounded-full p-2 hover:bg-muted text-muted-foreground"><BarChart3 size={18} /></Link>
          <Link to="/settings" aria-label="Réglages" className="rounded-full p-2 hover:bg-muted text-muted-foreground"><Settings size={18} /></Link>
        </div>
      </header>

      {/* MOBILE — preserved */}
      <div className="lg:hidden">
        <div className="mt-12">
          <p className="text-sm text-muted-foreground">{greet}.</p>
          <h1 className="mt-2 font-display text-4xl leading-tight">
            {last ? <>Tu étais <span className="text-primary">{last.state_label}</span> à ton dernier point.</> : <>Prêt à faire un point&nbsp;?</>}
          </h1>
          <p className="mt-3 text-foreground/70 text-base leading-relaxed">
            {last ? "Une minute peut suffire à voir plus clair." : "Quelques questions simples. Une réponse utile, tout de suite."}
          </p>
        </div>
        <button onClick={() => navigate({ to: "/checkin" })} className="mt-10 w-full rounded-2xl bg-primary py-6 text-lg font-medium text-primary-foreground transition hover:opacity-95 active:scale-[0.99] shadow-sm">
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
      </div>

      {/* DESKTOP — main action zone (left) + insight column (right) */}
      <section className="hidden lg:grid grid-cols-12 gap-10 mt-16">
        {/* Main action zone */}
        <div className="col-span-7 max-w-2xl">
          <p className="text-sm text-muted-foreground">{greet}.</p>
          <h1 className="mt-3 font-display text-5xl leading-[1.1] tracking-tight">
            {last ? (
              <>Tu étais <span className="text-primary">{last.state_label}</span><br />à ton dernier point.</>
            ) : (
              <>Prêt à faire<br />un point&nbsp;?</>
            )}
          </h1>
          <p className="mt-5 text-lg text-foreground/70 leading-relaxed max-w-md">
            {last ? "Une minute peut suffire à voir plus clair." : "Quelques questions simples. Une réponse utile, tout de suite."}
          </p>

          <div className="mt-10 flex items-center gap-4">
            <button onClick={() => navigate({ to: "/checkin" })} className="rounded-full bg-primary px-10 py-5 text-base font-medium text-primary-foreground transition hover:opacity-95 active:scale-[0.99] shadow-sm">
              Faire un point
            </button>
            {last && (
              <Link to="/result" className="text-sm text-foreground/70 hover:text-foreground transition px-4 py-4">
                Revoir le dernier →
              </Link>
            )}
          </div>

          {last && (
            <Link to="/result" className="mt-12 marge-card block p-7 hover:border-primary transition max-w-xl">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Dernier point</div>
              <div className="mt-3 font-display text-2xl leading-snug">{last.explanation}</div>
              <div className="mt-4 rounded-xl bg-background/60 border border-border p-4">
                <div className="text-[10px] uppercase tracking-wider text-primary">Action proposée</div>
                <p className="mt-1 text-sm text-foreground/85 leading-relaxed">{last.micro_action}</p>
              </div>
              <div className="mt-4 text-sm text-primary">Rouvrir →</div>
            </Link>
          )}
        </div>

        {/* Secondary insight column */}
        <aside className="col-span-5 space-y-5">
          <div className="marge-card p-6">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Profil en construction</div>
              <div className="text-sm text-muted-foreground">{pct}%</div>
            </div>
            <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all duration-700" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
              Marge commence à mieux repérer ce qui te pèse. {checkinsCount > 0 ? `${checkinsCount} point${checkinsCount > 1 ? "s" : ""} enregistré${checkinsCount > 1 ? "s" : ""}.` : "Fais un premier point pour démarrer."}
            </p>
          </div>

          {insights.length > 0 && (
            <div className="marge-card p-6">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Cette semaine</div>
              <ul className="mt-4 space-y-3">
                {insights.slice(0, 2).map((t, i) => (
                  <li key={i} className="text-sm text-foreground/85 leading-relaxed flex gap-3">
                    <span className="mt-2 h-1 w-1 rounded-full bg-primary shrink-0" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
              <Link to="/week" className="mt-5 inline-block text-sm text-primary hover:opacity-80">
                Voir l'aperçu complet →
              </Link>
            </div>
          )}

          {recent.length > 0 && (
            <div className="marge-card p-6">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Derniers points</div>
              <ul className="mt-4 divide-y divide-border">
                {recent.map(c => (
                  <li key={c.id} className="py-3 flex items-center justify-between gap-4 text-sm">
                    <span className="capitalize text-foreground/85">{c.state_label}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(c.created_at).toLocaleString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </section>
    </WideShell>
  );
}
