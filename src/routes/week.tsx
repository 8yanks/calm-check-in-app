import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { WideShell } from "@/components/PageShell";
import { MargeWordmark } from "@/components/Logo";
import { getCheckins, weeklyInsights, profileProgress, getPrefs, type CheckinRecord } from "@/lib/marge";
import { useRequireAuth } from "@/hooks/use-auth";
import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/week")({
  head: () => ({ meta: [{ title: "Ma semaine — Marge" }] }),
  component: Week,
});

function Week() {
  const { session, loading: authLoading } = useRequireAuth();
  const [list, setList] = useState<CheckinRecord[]>([]);
  const [pct, setPct] = useState(0);
  const [allCount, setAllCount] = useState(0);

  useEffect(() => {
    const all = getCheckins();
    const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
    setList(all.filter(c => new Date(c.created_at).getTime() >= cutoff));
    setAllCount(all.length);
    const p = getPrefs();
    setPct(profileProgress(all.length, p.completed));
  }, []);

  if (authLoading || !session) return <PageShell><div className="h-screen" /></PageShell>;

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
  const dayLabels = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
  const dayLabelsShort = ["D", "L", "M", "M", "J", "V", "S"];
  const hasData = list.length > 0;
  const todayIdx = 6; // last in the array

  // Build a smooth area path connecting average-load dots day by day.
  const Trend = ({ heightPx, compact = false }: { heightPx: number; compact?: boolean }) => {
    const w = 700;
    const h = heightPx;
    const padX = 24;
    const padTop = 18;
    const padBottom = 28;
    const innerW = w - padX * 2;
    const innerH = h - padTop - padBottom;
    const stepX = innerW / 6;
    const yFor = (v: number) => padTop + innerH - (v / 10) * innerH;
    const points = dayData.map((d, i) => ({
      x: padX + i * stepX,
      y: d.avg ? yFor(d.avg) : null as number | null,
      avg: d.avg,
      count: d.count,
    }));
    const known = points.filter(p => p.y !== null) as { x: number; y: number; avg: number; count: number }[];
    // Build smooth path through known points
    const linePath = known.length >= 2
      ? known.reduce((acc, p, i, arr) => {
          if (i === 0) return `M ${p.x} ${p.y}`;
          const prev = arr[i - 1];
          const cx = (prev.x + p.x) / 2;
          return `${acc} C ${cx} ${prev.y}, ${cx} ${p.y}, ${p.x} ${p.y}`;
        }, "")
      : "";
    const areaPath = linePath
      ? `${linePath} L ${known[known.length - 1].x} ${padTop + innerH} L ${known[0].x} ${padTop + innerH} Z`
      : "";

    return (
      <div className="relative w-full" style={{ height: h }}>
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="margeAreaFade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Baseline */}
          <line
            x1={padX} x2={w - padX}
            y1={padTop + innerH} y2={padTop + innerH}
            stroke="var(--color-border)" strokeWidth={1}
          />
          {/* Soft midline reference */}
          {!compact && (
            <line
              x1={padX} x2={w - padX}
              y1={yFor(5)} y2={yFor(5)}
              stroke="var(--color-border)" strokeWidth={1}
              strokeDasharray="2 6" opacity={0.7}
            />
          )}
          {/* Today highlight */}
          <line
            x1={points[todayIdx].x} x2={points[todayIdx].x}
            y1={padTop} y2={padTop + innerH}
            stroke="var(--color-primary)" strokeWidth={1} opacity={0.12}
          />

          {areaPath && (
            <path d={areaPath} fill="url(#margeAreaFade)" />
          )}
          {linePath && (
            <path
              d={linePath} fill="none"
              stroke="var(--color-primary)" strokeWidth={1.75}
              strokeLinecap="round" strokeLinejoin="round" opacity={0.9}
              style={{
                strokeDasharray: 2000,
                strokeDashoffset: 2000,
                animation: "marge-draw 1.4s ease-out 0.1s forwards",
              }}
            />
          )}

          {/* Day dots */}
          {points.map((p, i) => {
            const isToday = i === todayIdx;
            if (p.y === null) {
              return (
                <circle key={i} cx={p.x} cy={padTop + innerH}
                  r={isToday ? 2.5 : 1.8}
                  fill="var(--color-border)"
                />
              );
            }
            return (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={5}
                  fill="var(--color-background)"
                  stroke="var(--color-primary)" strokeWidth={1.75}
                />
                {p.count > 1 && (
                  <circle cx={p.x} cy={p.y} r={2} fill="var(--color-primary)" />
                )}
              </g>
            );
          })}

          {/* Day labels */}
          {points.map((p, i) => {
            const dow = dayData[i].date.getDay();
            return (
              <text key={i} x={p.x} y={h - 8}
                textAnchor="middle"
                fontSize={compact ? 10 : 11}
                fill="var(--color-muted-foreground)"
                fontFamily="var(--font-sans)"
                opacity={i === todayIdx ? 1 : 0.7}
              >
                {compact ? dayLabelsShort[dow] : dayLabels[dow]}
              </text>
            );
          })}
          {/* Today marker label */}
          {points[todayIdx].y !== null && !compact && (
            <text
              x={points[todayIdx].x}
              y={padTop - 6}
              textAnchor="middle"
              fontSize={10}
              fill="var(--color-primary)"
              fontFamily="var(--font-sans)"
              opacity={0.8}
            >
              aujourd'hui
            </text>
          )}
        </svg>
      </div>
    );
  };

  const avgCharge = list.length
    ? (list.reduce((s, c) => s + c.load_score, 0) / list.length)
    : null;

  return (
    <WideShell>
      <header className="flex items-center justify-between">
        <Link to="/home"><MargeWordmark /></Link>
        <Link to="/home" className="text-sm text-muted-foreground hover:text-foreground">← Accueil</Link>
      </header>

      {/* MOBILE */}
      <div className="lg:hidden">
        <div className="mt-8">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Aperçu</div>
          <h1 className="mt-2 font-display text-3xl">Cette semaine</h1>
          <p className="mt-2 text-sm text-foreground/70 leading-relaxed">
            {hasData
              ? `${list.length} point${list.length > 1 ? "s" : ""} cette semaine. Marge écoute doucement.`
              : "Pas encore de point cette semaine. Un seul suffit pour commencer."}
          </p>
        </div>

        {/* Inline stats row, no boxes */}
        <div className="mt-6 flex items-baseline justify-between border-y border-border py-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Points</div>
            <div className="mt-1 font-display text-2xl tabular-nums">{list.length}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Charge moy.</div>
            <div className="mt-1 font-display text-2xl tabular-nums">{avgCharge !== null ? avgCharge.toFixed(1) : "—"}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Profil</div>
            <div className="mt-1 font-display text-2xl tabular-nums">{pct}%</div>
          </div>
        </div>

        <div className="mt-8">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Charge ressentie</div>
          <div className="mt-3"><Trend heightPx={150} compact /></div>
        </div>

        <div className="mt-8 space-y-4">
          {insights.map((t, i) => (
            <div key={i} className="flex gap-3">
              <span className="mt-2 h-1 w-1 rounded-full bg-primary shrink-0" />
              <p className="text-foreground/85 leading-relaxed text-[15px]">{t}</p>
            </div>
          ))}
        </div>

        <div className="mt-10">
          <div className="flex items-center justify-between text-xs">
            <span className="uppercase tracking-wider text-muted-foreground">Apprentissage du profil</span>
            <span className="text-muted-foreground tabular-nums">{pct}%</span>
          </div>
          <div className="mt-2 h-px w-full bg-border overflow-hidden">
            <div className="h-full bg-primary transition-all duration-700" style={{ width: `${pct}%`, height: "1px" }} />
          </div>
        </div>

        {list.length > 0 && (
          <div className="mt-8">
            <h2 className="font-display text-xl">Tes derniers points</h2>
            <div className="mt-4 divide-y divide-border">
              {list.slice(0, 6).map(c => (
                <div key={c.id} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm capitalize font-medium">{c.state_label}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {new Date(c.created_at).toLocaleString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground/90 max-w-[55%] text-right leading-relaxed">{c.explanation.split(".")[0]}.</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* DESKTOP */}
      <section className="hidden lg:block mt-14">
        {/* Editorial header */}
        <div className="grid grid-cols-12 gap-12 items-end">
          <div className="col-span-7">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Aperçu — semaine en cours</div>
            <h1 className="mt-4 font-display text-6xl tracking-tight leading-[1.05]">Cette semaine.</h1>
            <p className="mt-6 text-lg text-foreground/70 leading-relaxed max-w-lg">
              {hasData
                ? `${list.length} point${list.length > 1 ? "s" : ""} déposé${list.length > 1 ? "s" : ""} ces sept derniers jours. Marge écoute doucement et garde le fil.`
                : "Pas encore de point cette semaine. Un seul point suffit pour que Marge commence à voir quelque chose."}
            </p>
          </div>
          <div className="col-span-5">
            {/* Inline stat row, no card boxes — visually attached to the page */}
            <div className="grid grid-cols-3 border-y border-border divide-x divide-border">
              <div className="py-5 pr-5">
                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Points</div>
                <div className="mt-2 font-display text-3xl tabular-nums">{list.length}</div>
              </div>
              <div className="py-5 px-5">
                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Charge moy.</div>
                <div className="mt-2 font-display text-3xl tabular-nums">{avgCharge !== null ? avgCharge.toFixed(1) : "—"}</div>
              </div>
              <div className="py-5 pl-5">
                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Profil</div>
                <div className="mt-2 font-display text-3xl tabular-nums">{pct}%</div>
                <div className="mt-2 h-px w-full bg-border overflow-hidden">
                  <div className="h-px bg-primary transition-all duration-700" style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Trend + insights — one cohesive editorial unit */}
        <div className="mt-16 grid grid-cols-12 gap-12 items-start">
          <div className="col-span-8">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Charge ressentie</div>
                <div className="mt-2 font-display text-2xl">Sept jours</div>
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">0 — 10</div>
            </div>
            <div className="mt-8 border-t border-border pt-8">
              <Trend heightPx={220} />
            </div>
            {!hasData && (
              <p className="mt-6 text-sm text-foreground/60 leading-relaxed max-w-md">
                La courbe se dessinera à mesure que tu déposes des points.
                Rien à remplir, rien à rattraper.
              </p>
            )}
          </div>

          <aside className="col-span-4 lg:pl-10 lg:border-l lg:border-border self-stretch">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Ce que Marge repère
            </div>
            <ul className="mt-6 space-y-5">
              {insights.map((t, i) => (
                <li key={i} className="flex gap-4">
                  <span className="mt-[10px] h-px w-4 bg-primary shrink-0 opacity-70" />
                  <p className="font-display text-[17px] leading-snug tracking-tight text-foreground/85">
                    {t}
                  </p>
                </li>
              ))}
            </ul>
            {hasData && (
              <p className="mt-8 text-xs text-muted-foreground/80 leading-relaxed">
                Lectures faites à partir de tes {list.length} dernier{list.length > 1 ? "s" : ""} point{list.length > 1 ? "s" : ""}.
              </p>
            )}
          </aside>
        </div>

        {list.length > 0 && (
          <div className="mt-20">
            <div className="grid grid-cols-12 gap-12">
              <div className="col-span-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Journal</div>
                <h2 className="mt-3 font-display text-2xl">Tes derniers points</h2>
                <p className="mt-3 text-sm text-foreground/60 leading-relaxed">
                  Ce que tu as déposé récemment, dans l'ordre.
                </p>
              </div>
              <div className="col-span-8 divide-y divide-border">
                {list.slice(0, 8).map(c => (
                  <div key={c.id} className="py-5 grid grid-cols-12 gap-6 items-baseline">
                    <div className="col-span-3 text-xs text-muted-foreground tabular-nums">
                      {new Date(c.created_at).toLocaleString("fr-FR", { weekday: "long", hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div className="col-span-3 text-sm capitalize font-medium">{c.state_label}</div>
                    <p className="col-span-6 text-sm text-foreground/75 leading-relaxed">
                      {c.explanation.split(".")[0]}.
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {!hasData && (
          <div className="mt-20 grid grid-cols-12 gap-12 items-baseline">
            <div className="col-span-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Commencer</div>
            </div>
            <div className="col-span-8">
              <p className="font-display text-2xl text-foreground/85 leading-snug max-w-xl">
                Une minute suffit pour déposer un premier point.
              </p>
              <Link to="/checkin" className="mt-6 inline-flex rounded-full bg-primary px-6 py-3 text-sm text-primary-foreground hover:opacity-90">
                Faire un point
              </Link>
            </div>
          </div>
        )}

        {allCount > list.length && (
          <p className="mt-16 text-xs text-muted-foreground">
            {allCount - list.length} point{allCount - list.length > 1 ? "s" : ""} plus ancien{allCount - list.length > 1 ? "s" : ""} ne sont pas affichés ici.
          </p>
        )}
      </section>
    </WideShell>
  );
}
