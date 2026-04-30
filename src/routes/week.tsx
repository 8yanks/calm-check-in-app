import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { WideShell } from "@/components/PageShell";
import { MargeWordmark } from "@/components/Logo";
import { getCheckins, weeklyInsights, profileProgress, getPrefs, type CheckinRecord } from "@/lib/marge";

export const Route = createFileRoute("/week")({
  head: () => ({ meta: [{ title: "Ma semaine — Marge" }] }),
  component: Week,
});

function Week() {
  const [list, setList] = useState<CheckinRecord[]>([]);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const all = getCheckins();
    const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
    setList(all.filter(c => new Date(c.created_at).getTime() >= cutoff));
    const p = getPrefs();
    setPct(profileProgress(all.length, p.completed));
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    return d;
  });
  const dayData = days.map(d => {
    const dayMs = d.getTime();
    const items = list.filter(c => {
      const cd = new Date(c.created_at); cd.setHours(0, 0, 0, 0);
      return cd.getTime() === dayMs;
    });
    const avg = items.length ? items.reduce((s, c) => s + c.load_score, 0) / items.length : 0;
    return { date: d, count: items.length, avg };
  });
  const insights = weeklyInsights(list);
  const dayLabels = ["D", "L", "M", "M", "J", "V", "S"];

  const Chart = ({ heightClass }: { heightClass: string }) => (
    <div className={`flex items-end justify-between gap-2 ${heightClass}`}>
      {dayData.map((d, i) => {
        const h = d.avg ? Math.max(8, (d.avg / 10) * 100) : 4;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-2">
            <div
              className="w-full rounded-md transition-all duration-700"
              style={{
                height: `${h}%`,
                backgroundColor: d.avg ? "var(--color-primary)" : "var(--color-border)",
                opacity: d.avg ? 0.4 + (d.avg / 10) * 0.6 : 1,
              }}
            />
            <span className="text-[10px] text-muted-foreground">{dayLabels[d.date.getDay()]}</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <WideShell>
      <header className="flex items-center justify-between">
        <Link to="/home"><MargeWordmark /></Link>
        <Link to="/home" className="text-sm text-muted-foreground hover:text-foreground">← Accueil</Link>
      </header>

      {/* MOBILE */}
      <div className="lg:hidden">
        <h1 className="mt-8 font-display text-3xl">Cette semaine</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {list.length === 0 ? "Pas encore de point cette semaine." : `${list.length} point${list.length > 1 ? "s" : ""} enregistré${list.length > 1 ? "s" : ""}.`}
        </p>

        <div className="mt-8 marge-card p-5">
          <Chart heightClass="h-32" />
          <div className="mt-3 text-xs text-muted-foreground">Charge ressentie au fil des jours</div>
        </div>

        <div className="mt-6 space-y-3">
          {insights.map((t, i) => (
            <div key={i} className="marge-card p-5">
              <p className="text-foreground/85 leading-relaxed">{t}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 marge-card p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Apprentissage du profil</div>
            <div className="text-sm text-muted-foreground">{pct}%</div>
          </div>
          <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {list.length > 0 && (
          <div className="mt-8">
            <h2 className="font-display text-xl">Tes derniers points</h2>
            <div className="mt-3 space-y-2">
              {list.slice(0, 6).map(c => (
                <div key={c.id} className="marge-card p-4 flex items-center justify-between">
                  <div>
                    <div className="text-sm capitalize">{c.state_label}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(c.created_at).toLocaleString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground max-w-[55%] text-right">{c.explanation.split(".")[0]}.</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* DESKTOP */}
      <section className="hidden lg:block mt-14">
        <div className="grid grid-cols-12 gap-12 items-end">
          <div className="col-span-7">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Aperçu</div>
            <h1 className="mt-3 font-display text-6xl tracking-tight leading-[1.05]">Cette semaine.</h1>
            <p className="mt-5 text-lg text-foreground/70 leading-relaxed max-w-md">
              {list.length === 0
                ? "Pas encore de point cette semaine. Fais un premier point pour voir tes rythmes apparaître."
                : `${list.length} point${list.length > 1 ? "s" : ""} enregistré${list.length > 1 ? "s" : ""}. Marge repère doucement ce qui revient.`}
            </p>
          </div>
          <div className="col-span-5 grid grid-cols-3 gap-6">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Points</div>
              <div className="mt-2 font-display text-3xl">{list.length}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Charge moy.</div>
              <div className="mt-2 font-display text-3xl">
                {list.length ? (list.reduce((s, c) => s + c.load_score, 0) / list.length).toFixed(1) : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Profil</div>
              <div className="mt-2 font-display text-3xl">{pct}%</div>
            </div>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-12 gap-8">
          <div className="col-span-8 marge-card p-8">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Charge ressentie</div>
                <div className="mt-1 font-display text-xl">7 derniers jours</div>
              </div>
              <div className="text-xs text-muted-foreground">Échelle 0–10</div>
            </div>
            <div className="mt-8"><Chart heightClass="h-56" /></div>
          </div>

          <aside className="col-span-4 space-y-5">
            <div className="marge-card p-6">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Ce que Marge repère</div>
              <ul className="mt-4 space-y-4">
                {insights.map((t, i) => (
                  <li key={i} className="text-sm text-foreground/85 leading-relaxed flex gap-3">
                    <span className="mt-2 h-1 w-1 rounded-full bg-primary shrink-0" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="marge-card p-6">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Apprentissage du profil</div>
                <div className="text-sm text-muted-foreground">{pct}%</div>
              </div>
              <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all duration-700" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </aside>
        </div>

        {list.length > 0 && (
          <div className="mt-16">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-2xl">Tes derniers points</h2>
              <span className="text-xs text-muted-foreground">{list.length} cette semaine</span>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-4">
              {list.slice(0, 8).map(c => (
                <div key={c.id} className="marge-card p-5">
                  <div className="text-sm capitalize font-medium">{c.state_label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {new Date(c.created_at).toLocaleString("fr-FR", { weekday: "long", hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <p className="mt-3 text-sm text-foreground/75 leading-relaxed line-clamp-2">
                    {c.explanation.split(".")[0]}.
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </WideShell>
  );
}
