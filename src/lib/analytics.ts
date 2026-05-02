// Lightweight client-side analytics helper.
//
// Writes events into public.analytics_events. Best-effort, fire-and-forget:
// a failed event MUST NEVER block a user-facing action. The table has an INSERT
// policy for the authenticated role only (anon Supabase sessions count as
// authenticated), so events fired before signInAnonymously() will silently fail
// — that is the intended behaviour (no spam from the public landing).

import { supabase } from "@/integrations/supabase/client";

/**
 * Canonical event names. Keep this list explicit so analytics dashboards stay
 * readable and we can grep for usage. Add new events here as features land.
 */
export type EventName =
  // Auth & onboarding
  | "user_signed_up"
  | "user_logged_in"
  | "user_logged_out"
  | "anonymous_session_started"
  | "onboarding_started"
  | "onboarding_completed"
  // Check-in express
  | "checkin_started"
  | "checkin_completed"
  | "checkin_failed"
  // Library
  | "content_viewed"
  | "content_completed"
  | "content_saved"
  | "content_dismissed"
  // Navigation / landing
  | "landing_cta_clicked"
  | "diagnostic_started"      // reserved for V2.2
  | "diagnostic_completed"    // reserved for V2.2
  | "weekly_review_viewed"    // reserved for V2.2
  | "weekly_review_generated" // reserved for V2.2
  | "chat_opened"             // reserved for V2.3
  | "chat_message_sent"       // reserved for V2.3
  | "chat_session_ended"      // reserved for V2.3
  | "feature_feedback_submitted";

/** Fire-and-forget event tracking. Never throws. */
export async function track(event: EventName, payload: Record<string, unknown> = {}): Promise<void> {
  if (typeof window === "undefined") return; // Skip on SSR
  try {
    const { data: { session } } = await supabase.auth.getSession();
    // No session = no event. The INSERT policy requires authenticated role.
    if (!session) return;
    const { error } = await supabase.from("analytics_events").insert({
      user_id: session.user.id,
      event,
      payload: payload as never,
    });
    if (error) console.warn(`[analytics] ${event} dropped:`, error.message);
  } catch (err) {
    // Network/runtime failure — silently swallow.
    console.warn(`[analytics] ${event} crashed:`, err);
  }
}
