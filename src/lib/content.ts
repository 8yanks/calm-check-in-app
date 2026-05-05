// Typed accessors for the content library.
//
// content_items is publicly readable (anon + authenticated), so SEO, previews
// on the landing, and unauthenticated browsing all work without surprises.
// content_interactions logs viewed/completed/saved per signed-in user.
//
// V2.3.0: queries now filter on status='published' (the new source of truth).
// The `published` boolean column is preserved for rétro-compat but not read.
// Premium gating is COSMETIC and lives in the UI — both free and premium tier
// rows are returned by these queries; the caller decides what to render.

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type ContentItem = Tables<"content_items">;
export type ContentTier = "free" | "premium";

export const CATEGORIES = {
  respiration: "Respiration",
  recentrage: "Recentrage",
  surcharge: "Surcharge",
  rumination: "Rumination",
  sommeil: "Sommeil",
  energie: "Énergie",
  routine: "Routines",
  guide: "Mini-guides",
} as const;

export type Category = keyof typeof CATEGORIES;

export const DURATION_BUCKETS = [
  { id: "short" as const, label: "Court (≤ 3 min)", min: 0, max: 3 },
  { id: "medium" as const, label: "Moyen (4-7 min)", min: 4, max: 7 },
  { id: "long" as const, label: "Long (8+ min)", min: 8, max: 60 },
];
export type DurationBucket = (typeof DURATION_BUCKETS)[number]["id"];

export type ContentFilter = {
  category?: Category | null;
  bucket?: DurationBucket | null;
  state?: string | null; // matches state_match []text
  tier?: ContentTier | null; // restrict to free or premium only; null = both
};

/**
 * Fetch published content items, optionally filtered by category, duration
 * bucket, or state (state_match overlap). Sorted by category then duration.
 */
export async function listContents(filter: ContentFilter = {}): Promise<ContentItem[]> {
  let q = supabase
    .from("content_items")
    .select("*")
    .eq("status", "published");

  if (filter.category) q = q.eq("category", filter.category);
  if (filter.tier) q = q.eq("tier", filter.tier);
  if (filter.bucket) {
    const b = DURATION_BUCKETS.find(x => x.id === filter.bucket);
    if (b) q = q.gte("duration_min", b.min).lte("duration_min", b.max);
  }
  if (filter.state) {
    // Postgres array overlap operator via PostgREST cs/ov filter
    q = q.contains("state_match", [filter.state]);
  }

  // Order: free first (so curated free content leads), then by category/duration
  const { data, error } = await q.order("tier").order("category").order("duration_min");
  if (error) {
    console.error("listContents error:", error);
    return [];
  }
  return data ?? [];
}

/** Fetch a single content item by slug. Returns null if not found / unpublished. */
export async function getContentBySlug(slug: string): Promise<ContentItem | null> {
  const { data, error } = await supabase
    .from("content_items")
    .select("*")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  if (error) {
    console.error("getContentBySlug error:", error);
    return null;
  }
  return data;
}

/**
 * Pick recommendations matching a user state (and optional duration cap).
 * Returns up to `limit` items whose state_match contains the target state.
 * Used by the result page and the home dashboard to suggest "next steps".
 */
export async function recommendForState(
  state: string,
  opts: { limit?: number; maxDuration?: number } = {},
): Promise<ContentItem[]> {
  const limit = opts.limit ?? 3;
  const target = state.toLowerCase().trim();
  let q = supabase
    .from("content_items")
    .select("*")
    .eq("published", true)
    .contains("state_match", [target]);
  if (opts.maxDuration) q = q.lte("duration_min", opts.maxDuration);

  const { data, error } = await q.order("duration_min").limit(limit);
  if (error) {
    console.error("recommendForState error:", error);
    return [];
  }
  return data ?? [];
}

export type InteractionAction = "viewed" | "completed" | "saved" | "dismissed";

/**
 * Log a content interaction. Best-effort: silently no-ops if the user is not
 * signed in or the insert fails (RLS blocks unauth users by design).
 */
export async function logInteraction(slug: string, action: InteractionAction): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await supabase.from("content_interactions").insert({
      user_id: session.user.id,
      content_slug: slug,
      action,
    });
  } catch (err) {
    console.warn("logInteraction failed:", err);
  }
}
