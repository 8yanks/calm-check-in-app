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

export type ContentFetchErrorKind = "network_blocked" | "timeout" | "supabase_error";

export interface ListContentsResult {
  items: ContentItem[];
  /** Surfaced to the UI when the underlying Supabase call fails. Null on success. */
  error: { kind: ContentFetchErrorKind; message: string; code?: string } | null;
}

/** Hard upper-bound on a single fetch — anything beyond is treated as network failure. */
const LIBRARY_FETCH_TIMEOUT_MS = 8000;

/**
 * Race a promise against a timeout. Rejects with a typed marker so the caller
 * can distinguish "Supabase took forever" (user's network blocking, ISP
 * dropping packets, project asleep) from "Supabase returned an error".
 */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("LIBRARY_TIMEOUT")), ms);
    p.then(
      (v) => { clearTimeout(id); resolve(v); },
      (e) => { clearTimeout(id); reject(e); },
    );
  });
}

/**
 * Fetch published content items, optionally filtered by category, duration
 * bucket, or state (state_match overlap). Sorted by category then duration.
 *
 * Returns a discriminated result so the caller can render a real error
 * banner instead of an indistinguishable "Aucun contenu" empty state when
 * the network / RLS / project-mismatch goes wrong.
 *
 * Resilience: bounded by an 8s timeout. Also catches network-level errors
 * (typically "Failed to fetch" when the user's browser blocks supabase.co
 * via an extension / DNS / firewall) so the UI can render an actionable
 * message instead of spinning forever.
 */
export async function listContentsResult(filter: ContentFilter = {}): Promise<ListContentsResult> {
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
  const promise = q.order("tier").order("category").order("duration_min");

  try {
    const { data, error } = await withTimeout(promise as unknown as Promise<{
      data: ContentItem[] | null;
      error: { message: string; code?: string } | null;
    }>, LIBRARY_FETCH_TIMEOUT_MS);
    if (error) {
      console.error("[content] listContents error:", error);
      return {
        items: [],
        error: { kind: "supabase_error", message: error.message, code: error.code },
      };
    }
    return { items: data ?? [], error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[content] listContents rejected:", msg);
    if (msg === "LIBRARY_TIMEOUT") {
      return {
        items: [],
        error: {
          kind: "timeout",
          message:
            "Marge n'a pas pu charger la bibliothèque dans le temps imparti. " +
            "Ta connexion est peut-être lente, ou un bloqueur empêche l'accès à Supabase.",
        },
      };
    }
    // Network-level failure (e.g. "Failed to fetch", DNS, blocked domain).
    // We surface a calm, actionable message — no "réessayer" if the cause
    // is a hard block (the retry wouldn't help).
    return {
      items: [],
      error: {
        kind: "network_blocked",
        message:
          "Marge n'a pas pu joindre Supabase. Une extension de blocage " +
          "(uBlock Origin, AdGuard, Privacy Badger…), un firewall réseau " +
          "ou un DNS filtré bloquent peut-être supabase.co. " +
          "Essaie de désactiver tes extensions ou utilise un autre navigateur.",
      },
    };
  }
}

/**
 * Backwards-compat thin wrapper. New callers should use listContentsResult
 * to surface real errors instead of mixing them with empty filters.
 */
export async function listContents(filter: ContentFilter = {}): Promise<ContentItem[]> {
  const { items } = await listContentsResult(filter);
  return items;
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
