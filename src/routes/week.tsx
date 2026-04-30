import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
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

  // Build 7-day buckets (today on the right)
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

  return (
    <PageShell>
      <Link to="/home" className="text-sm text-muted-foreground hover:text-foreground">← Accueil</Link>
      <h1 className="mt-6 font-display text-3xl">Cette semaine</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {list.length === 0 ? "Pas encore de point cette semaine." : `${list.length} point${list.length > 1 ? "s" : ""} enregistré${list.length > 1 ? "s" : ""}.`}
      </p>

      <div className="mt-8 marge-card p-5">
        <div className="flex items-end justify-between gap-2 h-32">
          {dayData.map((d, i) => {
            const h = d.avg ? Math.max(8, (d.avg / 10) * 100) : 4;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full rounded-md transition-all duration-700"
                     style={{
                       height: `${h}%`,
                       backgroundColor: d.avg ? "var(--color-primary)" : "var(--color-border)",
                       opacity: d.avg ? 0.4 + (d.avg / 10) * 0.6 : 1,
                     }} />
                <span className="text-[10px] text-muted-foreground">{dayLabels[d.date.getDay()]}</span>
              </div>
            );
          })}
        </div>
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
    </PageShell>
  );
}
