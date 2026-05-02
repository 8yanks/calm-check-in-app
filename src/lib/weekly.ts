// Weekly review aggregation helpers (V2.2).
//
// Reads the user's checkins from the past 7 days, computes structured
// aggregates (daily averages, time-of-day buckets, dominant needs/blockers),
// and packages them into a context object that the IA server function
// (generateWeeklyReview) can summarise into a narrative.

import type { CheckinRecord } from "@/lib/marge";
import { LABELS } from "@/lib/marge";

export interface DailyBucket {
  date: string;            // YYYY-MM-DD
  dow: string;             // Monday/Tuesday/...
  count: number;
  avg_load: number | null; // null if no checkins
  state_labels: string[];
}

export interface TimeOfDayBuckets {
  morning: { count: number; avg_load: number | null };
  day:     { count: number; avg_load: number | null };
  evening: { count: number; avg_load: number | null };
}

export interface WeeklyAggregate {
  week_start: string;       // YYYY-MM-DD (Monday)
  week_end: string;         // YYYY-MM-DD (Sunday)
  total_checkins: number;
  average_load: number | null;
  daily: DailyBucket[];     // 7 days, in chronological order
  time_of_day: TimeOfDayBuckets;
  dominant_state: string | null;     // most frequent state_label
  dominant_need: string | null;      // most frequent immediate_need (key)
  dominant_blocker: string | null;   // most frequent blocker (key)
  state_distribution: Record<string, number>;
  trend: "stable" | "improving" | "worsening" | "insufficient";
  /** Light-weight shortlist for the prompt. Avoids dumping huge contexts. */
  recent_excerpts: Array<{
    when: string;       // "lundi matin"
    state: string;
    need: string;
    blocker: string;
  }>;
}

/** Returns the Monday-anchored date for a given timestamp (week_start). */
export function startOfWeekMonday(d = new Date()): Date {
  const day = d.getDay();        // 0=Sun..6=Sat
  const offset = (day + 6) % 7;  // days since Monday
  const monday = new Date(d);
  monday.setDate(d.getDate() - offset);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

const DOW_LABELS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Aggregate the user's checkins from the past 7 days into a structured
 * digest suitable for both UI rendering and the IA prompt.
 */
export function aggregateWeek(checkins: CheckinRecord[], now = new Date()): WeeklyAggregate {
  const weekStart = startOfWeekMonday(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const within = checkins.filter(c => {
    const t = new Date(c.created_at).getTime();
    return t >= weekStart.getTime() && t <= weekEnd.getTime();
  });

  // 7 daily buckets
  const daily: DailyBucket[] = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const dayKey = fmtDate(d);
    const items = within.filter(c => fmtDate(new Date(c.created_at)) === dayKey);
    return {
      date: dayKey,
      dow: DOW_LABELS[d.getDay()],
      count: items.length,
      avg_load: avg(items.map(c => c.load_score)),
      state_labels: items.map(c => c.state_label),
    };
  });

  // Time-of-day buckets
  const morning: number[] = [], day: number[] = [], evening: number[] = [];
  for (const c of within) {
    const h = new Date(c.created_at).getHours();
    if (h < 12) morning.push(c.load_score);
    else if (h < 18) day.push(c.load_score);
    else evening.push(c.load_score);
  }

  // Dominant state / need / blocker
  const counts = (key: keyof Pick<CheckinRecord, "state_label" | "immediate_need" | "blocker">) => {
    const map: Record<string, number> = {};
    for (const c of within) map[c[key]] = (map[c[key]] ?? 0) + 1;
    return map;
  };
  const stateDist = counts("state_label");
  const needDist = counts("immediate_need");
  const blockerDist = counts("blocker");

  const top = (m: Record<string, number>) => {
    const entries = Object.entries(m).sort((a, b) => b[1] - a[1]);
    return entries[0]?.[0] ?? null;
  };

  // Trend: compare first half vs second half of week, only if 4+ checkins
  let trend: WeeklyAggregate["trend"] = "insufficient";
  if (within.length >= 4) {
    const sorted = [...within].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const half = Math.floor(sorted.length / 2);
    const firstAvg = avg(sorted.slice(0, half).map(c => c.load_score)) ?? 0;
    const secondAvg = avg(sorted.slice(half).map(c => c.load_score)) ?? 0;
    const delta = secondAvg - firstAvg;
    if (Math.abs(delta) < 0.7) trend = "stable";
    else if (delta < 0) trend = "improving";
    else trend = "worsening";
  }

  // Compact "recent excerpts" for the prompt (last 5 checkins)
  const recent = [...within]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)
    .map(c => {
      const dt = new Date(c.created_at);
      const h = dt.getHours();
      const tod = h < 12 ? "matin" : h < 18 ? "après-midi" : "soir";
      const dow = DOW_LABELS[dt.getDay()];
      return {
        when: `${dow} ${tod}`,
        state: c.state_label,
        need: LABELS.need[c.immediate_need as keyof typeof LABELS.need] ?? c.immediate_need,
        blocker: LABELS.blocker[c.blocker as keyof typeof LABELS.blocker] ?? c.blocker,
      };
    });

  return {
    week_start: fmtDate(weekStart),
    week_end: fmtDate(weekEnd),
    total_checkins: within.length,
    average_load: avg(within.map(c => c.load_score)),
    daily,
    time_of_day: {
      morning: { count: morning.length, avg_load: avg(morning) },
      day:     { count: day.length,     avg_load: avg(day) },
      evening: { count: evening.length, avg_load: avg(evening) },
    },
    dominant_state: top(stateDist),
    dominant_need: top(needDist),
    dominant_blocker: top(blockerDist),
    state_distribution: stateDist,
    trend,
    recent_excerpts: recent,
  };
}

/**
 * Output expected from the IA weekly review server function. Mirrors the
 * jsonb columns added to weekly_summaries by the V2.2 migration.
 */
export interface WeeklyReviewSynthesis {
  narrative: string;
  helpful_factors: string[];      // ce qui a allégé
  aggravating_factors: string[];  // ce qui a alourdi
  next_week_plan: string[];       // micro-actions pour la semaine suivante
  insights: string[];             // courtes lectures (3-5 puces)
}
