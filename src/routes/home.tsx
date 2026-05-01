import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell, WideShell } from "@/components/PageShell";
import { MargeWordmark } from "@/components/Logo";
import { applyTheme, weeklyInsights, greetingFor, type CheckinRecord } from "@/lib/marge";
import { Settings, BarChart3 } from "lucide-react";
import { useRequireAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/home")({
  head: () => ({ meta: [{ title: "Accueil — Marge" }] }),
  component: Home,
});

type LastCheckin = Pick<CheckinRecord, "state_label" | "explanation" | "micro_action">;

function Home() {
  const navigate = useNavigate();
  const { session, loading: authLoading, isAnonymous } = useRequireAuth();
  const [ready, setReady] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [checkinsCount, setCount] = useState(0);
  const [last, setLast] = useState<LastCheckin | null>(null);
  const [pct, setPct] = useState(0);
  const [recent, setRecent] = useState<CheckinRecord[]>([]);
  const [insights, setInsights] = useState<string[]>([]);

  useEffect(() => {
    if (authLoading || !session) return;

    const load = async () => {
      try {
        applyTheme("light");

        // 1. Check onboarding completion
        const { data: prefs } = await supabase
          .from("onboarding_preferences")
          .select("*")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (!prefs) { navigate({ to: "/onboarding" }); return; }

        if (prefs.theme === "dark") applyTheme("dark");

        // 2. Display name from profiles table
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", session.user.id)
          .maybeSingle();
        setDisplayName(profile?.display_name ?? null);

        // 3. Profile progress
        const { data: progress } = await supabase
          .from("profile_progress")
          .select("percentage, signals_count")
          .eq("user_id", session.user.id)
          .maybeSingle();
        setPct(progress?.percentage ?? 10);
        setCount(progress?.signals_count ?? 0);

        // 4. Recent checkins (last 3)
        const { data: recent3 } = await supabase
          .from("checkins")
          .select("*")
          .eq("user_id", session.user.id)
          .order("created_at", { ascending: false })
          .limit(3);

        if (recent3?.length) {
          setRecent(recent3 as unknown as CheckinRecord[]);
          setLast(recent3[0] as unknown as LastCheckin);
        }

        // 5. Weekly insights (last 7 days)
        const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
        const { data: weekData } = await supabase
          .from("checkins")
          .select("*")
          .eq("user_id", session.user.id)
          .gte("created_at", cutoff);
        if (weekData) setInsights(weeklyInsights(weekData as unknown as CheckinRecord[]));

      } catch (err) {
        console.error("Home load error:", err);
      }
      setReady(true);
    };

    load();
  }, [session, authLoading, navigate]);

  if (authLoading || !session || !ready) return <PageShell><div className="h-screen" /></PageShell>;

  const greet = greetingFor();
  const nameLabel = displayName ?? (isAnonymous ? "invité" : null);

  return (
    <WideShell>
      <header className="flex items-center justify-between">
        <MargeWordmark />
        <div className="flex items-center gap-2">
          <Link to="/week" aria-label="Semaine" className="rounded-full p-2 hover:bg-muted text-muted-foreground"><BarChart3 size={18} /></Link>
          <Link to="/settings" aria-label="Réglages" className="rounded-full p-2 hover:bg-muted text-muted-foreground"><Settings size={18} /></Link>
        </div>
      </header>

      {/* MOBILE */}
      <div className="lg:hidden">
        <div className="mt-12">
          <p className="text-sm text-muted-foreground">
            {greet}{nameLabel ? `, ${nameLabel}` : ""}.
          </p>
          <h1 className="mt-2 font-display text-4xl leading-tight">
            {last
              ? <>Tu étais <span className="text-primary">{last.state_label}</span> à ton dernier point.</>
              : <>Prêt à faire un point&nbsp;?</>}
          </h1>
          <p className="mt-3 text-foreground/70 text-base leading-relaxed">
            {last ? "Une minute peut suffire à voir plus clair." : "Quelques questions simples. Une réponse utile, tout de suite."}
          </p>
        </div>

        {isAnonymous && checkinsCount >= 1 ? (
          <div className="mt-10 rounded-2xl border border-primary/40 bg-primary/5 p-6">
            <p className="font-display text-2xl leading-snug">Crée un compte pour continuer.</p>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Sauvegarde tes bilans et suis ton évolution dans le temps — gratuitement.
            </p>
            <Link to="/auth" className="mt-5 block w-full rounded-full bg-primary py-4 text-center font-medium text-primary-foreground hover:opacity-90 cursor-pointer">
              Créer mon compte
            </Link>
          </div>
        ) : (
          <button
            onClick={() => navigate({ to: "/checkin" })}
            className="mt-10 w-full rounded-2xl bg-primary py-6 text-lg font-medium text-primary-foreground transition hover:opacity-95 active:scale-[0.99] shadow-sm cursor-pointer"
          >
            Faire un point
          </button>
        )}

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
            Marge commence à mieux repérer ce qui te pèse.{" "}
            {checkinsCount > 0
              ? `${checkinsCount} point${checkinsCount > 1 ? "s" : ""} enregistré${checkinsCount > 1 ? "s" : ""}.`
              : "Fais un premier point pour démarrer."}
          </p>
        </div>

        <Link to="/week" className="mt-4 block text-center text-sm text-muted-foreground hover:text-foreground py-3">
          Voir mon aperçu de la semaine
        </Link>
      </div>

      {/* DESKTOP */}
      <section className="hidden lg:grid grid-cols-12 gap-10 mt-16">
        {/* Main action zone */}
        <div className="col-span-7 max-w-2xl">
          <p className="text-sm text-muted-foreground">
            {greet}{nameLabel ? `, ${nameLabel}` : ""}.
          </p>
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
            {isAnonymous && checkinsCount >= 1 ? (
              <Link to="/auth" className="rounded-full bg-primary px-10 py-5 text-base font-medium text-primary-foreground transition hover:opacity-95 shadow-sm cursor-pointer">
                Créer mon compte pour continuer
              </Link>
            ) : (
              <button
                onClick={() => navigate({ to: "/checkin" })}
                className="rounded-full bg-primary px-10 py-5 text-base font-medium text-primary-foreground transition hover:opacity-95 active:scale-[0.99] shadow-sm cursor-pointer"
              >
                Faire un point
              </button>
            )}
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

        {/* Insight column */}
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
              Marge commence à mieux repérer ce qui te pèse.{" "}
              {checkinsCount > 0
                ? `${checkinsCount} point${checkinsCount > 1 ? "s" : ""} enregistré${checkinsCount > 1 ? "s" : ""}.`
                : "Fais un premier point pour démarrer."}
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
