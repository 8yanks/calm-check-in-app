// Personalization layer (V2.2).
//
// Reads the user's recent checkins + last assessment + weekly review and
// derives a small set of traits stored in user_profile_traits. Those traits
// are used by the rest of the app to:
//  - pick a recommendation tone (short/rassurant vs. structuré),
//  - filter content (favouring "doux" intensity for fragile users),
//  - decide when to nudge towards a deeper diagnostic.
//
// Keep the rules SIMPLE and READABLE. We're not building a recommender
// system here; we want a transparent, debug-friendly behavioural layer.

import { supabase } from "@/integrations/supabase/client";
import type { CheckinRecord } from "@/lib/marge";
import type { Tables } from "@/integrations/supabase/types";

export type FragilityLevel = "stable" | "modéré" | "fragile";
export type PreferredFormat = "court" | "moyen" | "long";

export interface ProfileTraits {
  intensity_avg: number | null;
  fragility_estimate: FragilityLevel | null;
  preferred_format: PreferredFormat | null;
  most_common_need: string | null;
  most_common_blocker: string | null;
  last_diagnostic_at: string | null;
  last_weekly_review_at: string | null;
  signals: Record<string, unknown>;
}

/** Derive traits from recent activity. Pure function — no side effects. */
export function deriveTraits(input: {
  checkins: CheckinRecord[];
  contentInteractions?: Array<Tables<"content_interactions">>;
  diagnosticIntensity?: number; // 0..1 from latest assessment, optional
}): Partial<ProfileTraits> {
  const { checkins, contentInteractions = [], diagnosticIntensity } = input;
  if (checkins.length === 0 && diagnosticIntensity === undefined) {
    return { intensity_avg: null, fragility_estimate: null };
  }

  // Average load (0-10)
  const intensity_avg =
    checkins.length > 0
      ? checkins.reduce((s, c) => s + c.load_score, 0) / checkins.length
      : null;

  // Fragility estimate. Combines:
  //  - average load on checkins (high = fragile)
  //  - diagnostic intensity (high = fragile)
  //  - rate of dismissed content (high dismissal = fatigue)
  const dismissed = contentInteractions.filter(i => i.action === "dismissed").length;
  const dismissalRate = contentInteractions.length
    ? dismissed / contentInteractions.length
    : 0;

  let fragilityScore = 0;
  if (intensity_avg !== null) fragilityScore += intensity_avg / 10;            // 0..1
  if (diagnosticIntensity !== undefined) fragilityScore += diagnosticIntensity; // 0..1
  fragilityScore += Math.min(0.3, dismissalRate);                              // 0..0.3
  // Normalize to /2 if both signals present, /1 if only one
  const divisor =
    (intensity_avg !== null ? 1 : 0) +
    (diagnosticIntensity !== undefined ? 1 : 0) +
    (contentInteractions.length > 0 ? 0.3 : 0);
  const fragilityNormalized = divisor > 0 ? fragilityScore / divisor : 0;

  let fragility_estimate: FragilityLevel = "stable";
  if (fragilityNormalized > 0.65) fragility_estimate = "fragile";
  else if (fragilityNormalized > 0.4) fragility_estimate = "modéré";

  // Preferred format derived from completed content avg duration
  const completedDurations = contentInteractions
    .filter(i => i.action === "completed")
    .map(_ => 0); // we'd need to join with content_items; left as a TODO
  void completedDurations;
  // Heuristic fallback: if fragile, prefer "court"; if stable, prefer "moyen"
  const preferred_format: PreferredFormat =
    fragility_estimate === "fragile" ? "court" : fragility_estimate === "stable" ? "moyen" : "court";

  // Most common need / blocker from checkins
  const counts = (
    key: keyof Pick<CheckinRecord, "immediate_need" | "blocker">,
  ): string | null => {
    if (checkins.length === 0) return null;
    const map: Record<string, number> = {};
    for (const c of checkins) map[c[key]] = (map[c[key]] ?? 0) + 1;
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] ?? null;
  };

  return {
    intensity_avg,
    fragility_estimate,
    preferred_format,
    most_common_need: counts("immediate_need"),
    most_common_blocker: counts("blocker"),
    signals: {
      checkins_count: checkins.length,
      dismissal_rate: dismissalRate,
      diagnostic_intensity: diagnosticIntensity ?? null,
    },
  };
}

/**
 * Recompute traits for the current user from Supabase data and upsert them
 * into user_profile_traits. Best-effort: silently no-ops on failure.
 */
export async function recomputeAndStoreTraits(userId: string): Promise<void> {
  try {
    const sinceISO = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const [
      { data: checkins },
      { data: interactions },
      { data: latestAssessment },
    ] = await Promise.all([
      supabase
        .from("checkins")
        .select("*")
        .eq("user_id", userId)
        .gte("created_at", sinceISO)
        .order("created_at", { ascending: false })
        .limit(60),
      supabase
        .from("content_interactions")
        .select("*")
        .eq("user_id", userId)
        .gte("created_at", sinceISO)
        .order("created_at", { ascending: false }),
      supabase
        .from("assessments")
        .select("score_summary, ai_synthesis, completed_at")
        .eq("user_id", userId)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const diagnosticIntensity =
      latestAssessment?.score_summary &&
      typeof latestAssessment.score_summary === "object" &&
      "overall_intensity" in (latestAssessment.score_summary as Record<string, unknown>)
        ? Number((latestAssessment.score_summary as Record<string, unknown>).overall_intensity)
        : undefined;

    const partial = deriveTraits({
      checkins: (checkins ?? []) as unknown as CheckinRecord[],
      contentInteractions: (interactions ?? []) as Tables<"content_interactions">[],
      diagnosticIntensity,
    });

    await supabase
      .from("user_profile_traits")
      .upsert({
        user_id: userId,
        intensity_avg: partial.intensity_avg ?? null,
        fragility_estimate: partial.fragility_estimate ?? null,
        preferred_format: partial.preferred_format ?? null,
        most_common_need: partial.most_common_need ?? null,
        most_common_blocker: partial.most_common_blocker ?? null,
        last_diagnostic_at: latestAssessment?.completed_at ?? null,
        signals: (partial.signals ?? {}) as never,
        computed_at: new Date().toISOString(),
      });
  } catch (err) {
    console.warn("recomputeAndStoreTraits failed:", err);
  }
}

/** Read the cached traits for the current user. Returns null if not computed. */
export async function getTraits(userId: string): Promise<Tables<"user_profile_traits"> | null> {
  const { data, error } = await supabase
    .from("user_profile_traits")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.warn("getTraits error:", error.message);
    return null;
  }
  return data;
}

/**
 * Convenience: pick a tone based on fragility. Used by Claude prompts to
 * adjust register without rewriting the whole system message.
 */
export function pickTone(fragility: FragilityLevel | null | undefined): "neutre" | "rassurant" | "structuré" {
  if (fragility === "fragile") return "rassurant";
  if (fragility === "modéré") return "neutre";
  return "structuré";
}
