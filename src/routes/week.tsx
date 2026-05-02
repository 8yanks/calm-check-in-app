import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { WideShell, PageShell } from "@/components/PageShell";
import { MargeWordmark } from "@/components/Logo";
import { weeklyInsights as fallbackInsights, type CheckinRecord } from "@/lib/marge";
import { useRequireAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { aggregateWeek, startOfWeekMonday, type WeeklyAggregate } from "@/lib/weekly";
import { generateWeeklyReview } from "@/lib/claude";
import { getTraits, pickTone } from "@/lib/personalization";
import { track } from "@/lib/analytics";
import type { Tables, Json } from "@/integrations/supabase/types";
import { RefreshCw } from "lucide-react";

export const Route = createFileRoute("/week")({
  head: () => ({ meta: [{ title: "Bilan de la semaine — Marge" }] }),
  component: Week,
});

type WeeklyRow = Tables<"weekly_summaries">;

function Week() {
  const { session, loading: authLoading } = useRequireAuth();
  const [list, setList] = useState<CheckinRecord[]>([]);
  const [pct, setPct] = useState(0);
  const [allCount, setAllCount] = useState(0);
  const [aggregate, setAggregate] = useState<WeeklyAggregate | null>(null);
  const [cachedReview, setCachedReview] = useState<WeeklyRow | null>(null);
  const [generating, setGenerating] = useState(false);
  const [ready, setReady] = useState(false);

  // Initial load: weekly checkins, total count, profile %, cached weekly_summary.
  useEffect(() => {
    if (authLoading || !session) return;
    const load = async () => {
      try {
        const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
        const weekStart = startOfWeekMonday().toISOString().slice(0, 10);
        const [
          { data: weekData },
          { count },
          { data: progress },
          { data: cached },
        ] = await Promise.all([
          supabase
            .from("checkins")
            .select("*")
            .eq("user_id", session.user.id)
            .gte("created_at", cutoff)
            .order("created_at", { ascending: false }),
          supabase
            .from("checkins")
            .select("*", { count: "exact", head: true })
            .eq("user_id", session.user.id),
          supabase
            .from("profile_progress")
            .select("percentage")
            .eq("user_id", session.user.id)
            .maybeSingle(),
          supabase
            .from("weekly_summaries")
            .select("*")
            .eq("user_id", session.user.id)
            .eq("week_start", weekStart)
            .maybeSingle(),
        ]);

        const checkins = ((weekData ?? []) as unknown as CheckinRecord[]);
        setList(checkins);
        setAllCount(count ?? 0);
        setPct(progress?.percentage ?? 10);
        setAggregate(aggregateWeek(checkins));
        setCachedReview(cached ?? null);
        if (cached) track("weekly_review_viewed", { source: "cache" });
      } catch (err) {
        console.error("Week load error:", err);
      }
      setReady(true);
    };
    load();
  }, [authLoading, session]);

  const handleGenerate = async () => {
    if (!session || !aggregate) return;
    if (aggregate.total_checkins < 2) return; // not enough data
    setGenerating(true);
    try {
      const traits = await getTraits(session.user.id);
      const tone = pickTone(traits?.fragility_estimate as never);

      const synthesis = await generateWeeklyReview({
        data: {
          week_start: aggregate.week_start,
          total_checkins: aggregate.total_checkins,
          average_load: aggregate.average_load,
          trend: aggregate.trend,
          dominant_state: aggregate.dominant_state,
          dominant_need: aggregate.dominant_need,
          dominant_blocker: aggregate.dominant_blocker,
          daily: aggregate.daily,
          time_of_day: aggregate.time_of_day,
          recent_excerpts: aggregate.recent_excerpts,
          tone,
        },
      });

      // Upsert into weekly_summaries (UNIQUE on user_id+week_start added in V2.2)
      const { data: saved } = await supabase
        .from("weekly_summaries")
        .upsert(
          {
            user_id: session.user.id,
            week_start: aggregate.week_start,
            average_load: aggregate.average_load,
            insights: synthesis.insights as unknown as Json,
            narrative: synthesis.narrative,
            helpful_factors: synthesis.helpful_factors as unknown as Json,
            aggravating_factors: synthesis.aggravating_factors as unknown as Json,
            next_week_plan: synthesis.next_week_plan as unknown as Json,
          },
          { onConflict: "user_id,week_start" },
        )
        .select("*")
        .single();

      // Update last_weekly_review_at trait (best effort)
      void supabase
        .from("user_profile_traits")
        .upsert(
          { user_id: session.user.id, last_weekly_review_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );

      setCachedReview(saved ?? null);
      track("weekly_review_generated", { week_start: aggregate.week_start });
    } catch (err) {
      console.error("generateWeeklyReview failed:", err);
      // Build a local-only "review" using the heuristic fallback so the user
      // always sees something useful. Don't persist (so a real IA review can
      // overwrite later).
      const fallback: WeeklyRow = {
        id: "local",
        user_id: session.user.id,
        week_start: aggregate.week_start,
        average_load: aggregate.average_load,
        insights: fallbackInsights(list) as unknown as Json,
        narrative: aggregate.total_checkins >= 3
          ? "Cette semaine reste lisible : quelques moments stables, quelques zones plus chargées. Marge garde le fil."
          : "Encore peu de points cette semaine. Marge a besoin de quelques signaux de plus pour vraiment voir quelque chose.",
        helpful_factors: [] as unknown as Json,
        aggravating_factors: [] as unknown as Json,
        next_week_plan: [] as unknown as Json,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setCachedReview(fallback);
    } finally {
      setGenerating(false);
    }
  };

  if (authLoading || !session || !ready) return <PageShell><div className="h-screen" /></PageShell>;

  const hasData = list.length > 0;
  const canGenerate = aggregate && aggregate.total_checkins >= 2 && !cachedReview;
  const review = cachedReview;

  // Helpers used by the chart (kept from MVP).
  const today = new Date(); today.setHours(0, 0, 0, 0);
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
  const dayLabels = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
  const dayLabelsShort = ["D", "L", "M", "M", "J", "V", "S"];
  const todayIdx = 6;

  const Trend = ({ heightPx, compact = false }: { heightPx: number; compact?: boolean }) => {
    const w = 700, padX = 24, padTop = 18, padBottom = 28;
    const innerW = w - padX * 2;
    const innerH = heightPx - padTop - padBottom;
    const stepX = innerW / 6;
    const yFor = (v: number) => padTop + innerH - (v / 10) * innerH;
    const points = dayData.map((d, i) => ({
      x: padX + i * stepX,
      y: d.avg ? yFor(d.avg) : null as number | null,
      avg: d.avg,
      count: d.count,
    }));
    const known = points.filter(p => p.y !== null) as { x: number; y: number; avg: number; count: number }[];
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
      <div className="relative w-full" style={{ height: heightPx }}>
        <svg viewBox={`0 0 ${w} ${heightPx}`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="margeAreaFade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1={padX} x2={w - padX} y1={padTop + innerH} y2={padTop + innerH} stroke="var(--color-border)" strokeWidth={1} />
          {!compact && (
            <line x1={padX} x2={w - padX} y1={yFor(5)} y2={yFor(5)} stroke="var(--color-border)" strokeWidth={1} strokeDasharray="2 6" opacity={0.7} />
          )}
          <line x1={points[todayIdx].x} x2={points[todayIdx].x} y1={padTop} y2={padTop + innerH} stroke="var(--color-primary)" strokeWidth={1} opacity={0.12} />
          {areaPath && <path d={areaPath} fill="url(#margeAreaFade)" />}
          {linePath && (
            <path d={linePath} fill="none" stroke="var(--color-primary)" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" opacity={0.9}
              style={{ strokeDasharray: 2000, strokeDashoffset: 2000, animation: "marge-draw 1.4s ease-out 0.1s forwards" }} />
          )}
          {points.map((p, i) => {
            const isToday = i === todayIdx;
            if (p.y === null) {
              return <circle key={i} cx={p.x} cy={padTop + innerH} r={isToday ? 2.5 : 1.8} fill="var(--color-border)" />;
            }
            return (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={5} fill="var(--color-background)" stroke="var(--color-primary)" strokeWidth={1.75} />
                {p.count > 1 && <circle cx={p.x} cy={p.y} r={2} fill="var(--color-primary)" />}
              </g>
            );
          })}
          {points.map((p, i) => {
            const dow = dayData[i].date.getDay();
            return (
              <text key={i} x={p.x} y={heightPx - 8} textAnchor="middle" fontSize={compact ? 10 : 11} fill="var(--color-muted-foreground)" fontFamily="var(--font-sans)" opacity={i === todayIdx ? 1 : 0.7}>
                {compact ? dayLabelsShort[dow] : dayLabels[dow]}
              </text>
            );
          })}
          {points[todayIdx].y !== null && !compact && (
            <text x={points[todayIdx].x} y={padTop - 6} textAnchor="middle" fontSize={10} fill="var(--color-primary)" fontFamily="var(--font-sans)" opacity={0.8}>
              aujourd'hui
            </text>
          )}
        </svg>
      </div>
    );
  };

  const avgCharge = list.length ? (list.reduce((s, c) => s + c.load_score, 0) / list.length) : null;

  // Pull narrative & friends from review (already validated jsonb arrays of string)
  const narrative = review?.narrative ?? null;
  const helpful = ((review?.helpful_factors as unknown as string[] | null) ?? []);
  const aggravating = ((review?.aggravating_factors as unknown as string[] | null) ?? []);
  const plan = ((review?.next_week_plan as unknown as string[] | null) ?? []);
  const reviewInsights = ((review?.insights as unknown as string[] | null) ?? null);

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
              ? `${list.length} point${list.length > 1 ? "s" : ""} cette semaine.`
              : "Pas encore de point cette semaine. Un seul suffit pour commencer."}
          </p>
        </div>

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

        {/* Generate / Regenerate CTA */}
        {(canGenerate || review) && (
          <div className="mt-8">
            {canGenerate && (
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="w-full rounded-full bg-primary px-6 py-4 text-base text-primary-foreground hover:opacity-90 disabled:opacity-60 cursor-pointer"
              >
                {generating ? "Marge écrit ton bilan…" : "Générer mon bilan"}
              </button>
            )}
            {review && (
              <button
                onClick={() => { setCachedReview(null); handleGenerate(); }}
                disabled={generating}
                className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-full border border-border bg-surface py-3 text-sm text-foreground hover:bg-muted disabled:opacity-60"
              >
                <RefreshCw size={14} />
                {generating ? "Régénération…" : "Régénérer le bilan"}
              </button>
            )}
          </div>
        )}

        {/* Narrative + factors */}
        {narrative && (
          <section className="mt-10">
            <div className="text-[11px] uppercase tracking-wider text-primary">Bilan</div>
            <p className="mt-3 font-display text-xl leading-snug">{narrative}</p>
          </section>
        )}

        {(helpful.length > 0 || aggravating.length > 0) && (
          <section className="mt-10 space-y-6">
            {helpful.length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Ce qui a allégé</div>
                <ul className="mt-3 space-y-2">
                  {helpful.map((t, i) => (
                    <li key={i} className="flex gap-3 text-sm leading-relaxed">
                      <span className="mt-2 h-1 w-1 rounded-full bg-primary shrink-0" />
                      <span className="text-foreground/85">{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {aggravating.length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Ce qui a alourdi</div>
                <ul className="mt-3 space-y-2">
                  {aggravating.map((t, i) => (
                    <li key={i} className="flex gap-3 text-sm leading-relaxed">
                      <span className="mt-2 h-1 w-1 rounded-full bg-foreground/40 shrink-0" />
                      <span className="text-foreground/85">{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {plan.length > 0 && (
          <section className="mt-10 marge-card p-5 border-primary/30">
            <div className="text-[11px] uppercase tracking-wider text-primary">Pour la semaine prochaine</div>
            <ul className="mt-4 space-y-3">
              {plan.map((t, i) => (
                <li key={i} className="flex items-baseline gap-3 text-sm leading-relaxed">
                  <span className="text-[10px] tabular-nums text-primary">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-foreground/85">{t}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Insights fallback if no review yet but data exists */}
        {!review && hasData && (
          <section className="mt-8 space-y-3">
            {(reviewInsights ?? fallbackInsights(list)).map((t, i) => (
              <div key={i} className="flex gap-3">
                <span className="mt-2 h-1 w-1 rounded-full bg-primary shrink-0" />
                <p className="text-foreground/85 leading-relaxed text-[15px]">{t}</p>
              </div>
            ))}
          </section>
        )}

        {list.length > 0 && (
          <div className="mt-10">
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

        {/* Trend + insights */}
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
                La courbe se dessinera à mesure que tu déposes des points. Rien à remplir, rien à rattraper.
              </p>
            )}
          </div>

          <aside className="col-span-4 lg:pl-10 lg:border-l lg:border-border self-stretch">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Ce que Marge repère</div>
            <ul className="mt-6 space-y-5">
              {(reviewInsights ?? fallbackInsights(list)).map((t, i) => (
                <li key={i} className="flex gap-4">
                  <span className="mt-[10px] h-px w-4 bg-primary shrink-0 opacity-70" />
                  <p className="font-display text-[17px] leading-snug tracking-tight text-foreground/85">{t}</p>
                </li>
              ))}
            </ul>

            {(canGenerate || review) && (
              <div className="mt-10 space-y-2">
                {canGenerate && (
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="w-full rounded-full bg-primary px-6 py-3 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-60 cursor-pointer"
                  >
                    {generating ? "Marge écrit ton bilan…" : "Générer mon bilan complet"}
                  </button>
                )}
                {review && (
                  <button
                    onClick={() => { setCachedReview(null); handleGenerate(); }}
                    disabled={generating}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-border bg-surface py-2.5 text-xs text-foreground hover:bg-muted disabled:opacity-60"
                  >
                    <RefreshCw size={12} />
                    {generating ? "Régénération…" : "Régénérer"}
                  </button>
                )}
              </div>
            )}
          </aside>
        </div>

        {/* Narrative + factors + plan (when review exists) */}
        {review && (
          <section className="mt-20 grid grid-cols-12 gap-12">
            <div className="col-span-7">
              <div className="text-[11px] uppercase tracking-[0.18em] text-primary">Bilan</div>
              {narrative && (
                <p className="mt-5 font-display text-3xl leading-[1.15] max-w-2xl">{narrative}</p>
              )}

              <div className="mt-10 grid grid-cols-2 gap-10">
                {helpful.length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Ce qui a allégé</div>
                    <ul className="mt-4 space-y-3">
                      {helpful.map((t, i) => (
                        <li key={i} className="flex gap-3 text-sm leading-relaxed">
                          <span className="mt-2 h-1 w-1 rounded-full bg-primary shrink-0" />
                          <span className="text-foreground/85">{t}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {aggravating.length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Ce qui a alourdi</div>
                    <ul className="mt-4 space-y-3">
                      {aggravating.map((t, i) => (
                        <li key={i} className="flex gap-3 text-sm leading-relaxed">
                          <span className="mt-2 h-1 w-1 rounded-full bg-foreground/40 shrink-0" />
                          <span className="text-foreground/85">{t}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <aside className="col-span-5">
              {plan.length > 0 && (
                <div className="marge-card p-7 border-primary/30">
                  <div className="text-[11px] uppercase tracking-wider text-primary">Pour la semaine prochaine</div>
                  <ol className="mt-5 space-y-4">
                    {plan.map((t, i) => (
                      <li key={i} className="flex items-baseline gap-4">
                        <span className="text-[10px] tabular-nums text-primary">{String(i + 1).padStart(2, "0")}</span>
                        <span className="text-foreground/85 leading-relaxed">{t}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </aside>
          </section>
        )}

        {/* Recent journal */}
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
