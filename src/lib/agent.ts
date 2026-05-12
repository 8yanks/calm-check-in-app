// Marge — Chat agent (V2.3.3)
//
// CONTRAT
// =======
// Une SEULE responsabilité : orchestrer un tour de conversation, en
// respectant strictement les couches existantes :
//   - safety   (src/lib/safety.ts)
//   - quota    (chat_full feature + 5/jour free, 50/30j premium)
//   - usage    (recordUsage côté claude.ts)
//   - context  (traits + recent checkins + last diagnostic résumé)
//
// L'agent ne sait rien du frontend, du paywall UI, du pricing ou du
// streaming (V2.3.5+). Il fait UN tour, il persiste, il rend.
//
// LIMITES STRICTES (system prompt) :
//   - Marge ne se présente JAMAIS comme thérapeute / médecin
//   - Pas de diagnostic
//   - Réponses courtes (2-4 phrases)
//   - Tutoie l'utilisateur (cohérent avec le reste de l'app)
//   - Ne donne PAS d'instructions thérapeutiques ou médicales
//   - Si la personne semble en crise → la safety layer prend le relais

import { createServerFn } from "@tanstack/react-start";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";
import { detectRisk, buildSafetyResponse, logRiskEvent, type RiskLevel } from "@/lib/safety";
import { getEntitlementFromRow, hasFeature } from "@/lib/entitlements";

// ─────────────────────────────────────────────────────────────────────────────
// Public types (consumed by /chat route)
// ─────────────────────────────────────────────────────────────────────────────

export interface ChatTurnInput {
  /** Existing session id, OR null to create a new one. */
  session_id: string | null;
  message: string;
  access_token: string;
}

export interface ChatTurnResult {
  session_id: string;
  reply: string;
  safety_flag: RiskLevel | null;
  show_resources: boolean;
  blocked: boolean;
  /** Quota state AFTER this turn — for display in the UI. */
  quota: {
    used: number;
    limit: number;
    /** Window label for the UI ('jour' for free, 'mois' for premium). */
    window: "jour" | "mois";
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Quota constants
// ─────────────────────────────────────────────────────────────────────────────

const FREE_LIMIT = 5;             // messages per 24h sliding window
const FREE_WINDOW_MS = 24 * 3600 * 1000;
const PREMIUM_LIMIT = 50;         // messages per 30d sliding window
const PREMIUM_WINDOW_MS = 30 * 24 * 3600 * 1000;
/** Max recent messages we feed back to Claude as conversation history. */
const HISTORY_LIMIT = 14;

// ─────────────────────────────────────────────────────────────────────────────
// System prompt
// ─────────────────────────────────────────────────────────────────────────────

interface UserContext {
  display_name: string | null;
  fragility: "stable" | "modéré" | "fragile" | null;
  preferred_format: "court" | "moyen" | "long" | null;
  intensity_avg: number | null;
  most_common_need: string | null;
  most_common_blocker: string | null;
  last_diagnostic_summary: string | null;
  recent_state_labels: string[];
}

function buildSystemPrompt(ctx: UserContext): string {
  const parts: string[] = [];

  parts.push(
    `Tu es Marge, une compagne calme du quotidien.`,
    ``,
    `LIMITES STRICTES — non négociables :`,
    `- Tu n'es PAS thérapeute, PAS médecin. Tu ne fais JAMAIS de diagnostic, jamais de prescription.`,
    `- Tu ne donnes PAS d'instructions médicales ou thérapeutiques formelles.`,
    `- Si la personne semble traverser une crise (idées noires, danger, urgence), tu ne tentes pas de la soigner — tu lui rappelles qu'une aide humaine professionnelle existe et tu cites les ressources : 15 (SAMU), 3114 (prévention suicide), SOS Amitié.`,
    `- Tu ne promets jamais de résultat, tu ne minimises jamais ce que la personne ressent.`,
    ``,
    `STYLE :`,
    `- Phrases courtes. Réponses brèves : 2 à 4 phrases en moyenne, pas plus.`,
    `- Tutoiement (cohérent avec le reste de l'app Marge).`,
    `- Ton bienveillant, jamais condescendant, jamais "coach".`,
    `- Pas de jargon, pas d'anglicismes, pas de listes numérotées sauf si vraiment utile.`,
    `- Si la personne demande "que faire", tu proposes UNE seule chose simple, faisable en 30-90 secondes.`,
    `- Tu peux reformuler ce que la personne dit pour l'aider à mettre des mots, c'est souvent plus utile que de "résoudre".`,
  );

  // Personalization context — only what's actually meaningful to Marge
  const ctxLines: string[] = [];
  if (ctx.display_name) ctxLines.push(`Prénom : ${ctx.display_name}`);
  if (ctx.fragility) ctxLines.push(`Fragilité estimée : ${ctx.fragility}`);
  if (ctx.preferred_format) ctxLines.push(`Format préféré : ${ctx.preferred_format}`);
  if (ctx.intensity_avg !== null) ctxLines.push(`Charge moyenne récente : ${ctx.intensity_avg.toFixed(1)}/10`);
  if (ctx.most_common_need) ctxLines.push(`Besoin récurrent : ${ctx.most_common_need}`);
  if (ctx.most_common_blocker) ctxLines.push(`Blocage récurrent : ${ctx.most_common_blocker}`);
  if (ctx.recent_state_labels.length > 0) {
    ctxLines.push(`États récents (3 derniers points) : ${ctx.recent_state_labels.join(", ")}`);
  }
  if (ctx.last_diagnostic_summary) {
    ctxLines.push(`Synthèse du dernier diagnostic :\n${ctx.last_diagnostic_summary}`);
  }

  if (ctxLines.length > 0) {
    parts.push(``, `CONTEXTE UTILISATEUR :`, ctxLines.join("\n"));
  }

  // Tone tuning based on fragility
  if (ctx.fragility === "fragile") {
    parts.push(
      ``,
      `NOTE : la personne est dans une zone fragile actuellement. Adopte un ton particulièrement doux et rassurant. Évite tout vocabulaire qui pourrait inquiéter. Privilégie l'écoute à l'action.`,
    );
  } else if (ctx.fragility === "stable") {
    parts.push(
      ``,
      `NOTE : la personne semble plutôt stable. Tu peux être franc et concret, sans être abrupt.`,
    );
  }

  return parts.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Caller resolution + quota
// ─────────────────────────────────────────────────────────────────────────────

interface CallerContext {
  userId: string;
  isAnonymous: boolean;
  client: SupabaseClient<Database>;
}

async function resolveAuthCaller(accessToken: string): Promise<CallerContext | null> {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY =
    process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return null;
  try {
    const client = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getUser(accessToken);
    if (error || !data?.user) return null;
    return {
      userId: data.user.id,
      isAnonymous: !!data.user.is_anonymous,
      client,
    };
  } catch (err) {
    console.warn("[agent] resolveAuthCaller failed:", err);
    return null;
  }
}

interface QuotaState {
  used: number;
  limit: number;
  window: "jour" | "mois";
  windowMs: number;
}

async function getQuotaState(caller: CallerContext): Promise<QuotaState> {
  // Read entitlement
  const { data: sub } = await caller.client
    .from("subscriptions")
    .select("*")
    .eq("user_id", caller.userId)
    .maybeSingle();
  const ent = getEntitlementFromRow(sub ?? null);
  const isPremium = hasFeature(ent, "chat_full");

  const limit = isPremium ? PREMIUM_LIMIT : FREE_LIMIT;
  const windowMs = isPremium ? PREMIUM_WINDOW_MS : FREE_WINDOW_MS;
  const window: "jour" | "mois" = isPremium ? "mois" : "jour";

  // Count chatTurn entries in the sliding window via ai_usage (recorded by
  // recordUsage on each successful or failed call — a perfectly accurate
  // proxy for "messages sent that hit the IA").
  const cutoff = new Date(Date.now() - windowMs).toISOString();
  const { count } = await caller.client
    .from("ai_usage")
    .select("*", { count: "exact", head: true })
    .eq("user_id", caller.userId)
    .eq("fn", "chatTurn")
    .gte("created_at", cutoff);

  return { used: count ?? 0, limit, window, windowMs };
}

// ─────────────────────────────────────────────────────────────────────────────
// Context builder — pulls perso + recent checkins + last diagnostic
// ─────────────────────────────────────────────────────────────────────────────

async function buildUserContext(caller: CallerContext): Promise<UserContext> {
  const [
    { data: profile },
    { data: traits },
    { data: recentCheckins },
    { data: lastDiagnostic },
  ] = await Promise.all([
    caller.client.from("profiles").select("display_name").eq("id", caller.userId).maybeSingle(),
    caller.client.from("user_profile_traits").select("*").eq("user_id", caller.userId).maybeSingle(),
    caller.client.from("checkins").select("state_label").eq("user_id", caller.userId)
      .order("created_at", { ascending: false }).limit(3),
    caller.client.from("assessments").select("ai_synthesis,completed_at")
      .eq("user_id", caller.userId).eq("type", "diagnostic")
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  // Extract the one-paragraph profile_summary from the diagnostic synthesis
  let lastDiagnosticSummary: string | null = null;
  if (lastDiagnostic?.ai_synthesis && typeof lastDiagnostic.ai_synthesis === "object") {
    const s = lastDiagnostic.ai_synthesis as { profile_summary?: string };
    if (s.profile_summary) lastDiagnosticSummary = s.profile_summary.slice(0, 600);
  }

  const fragility = (traits?.fragility_estimate as UserContext["fragility"]) ?? null;
  return {
    display_name: profile?.display_name ?? null,
    fragility,
    preferred_format: (traits?.preferred_format as UserContext["preferred_format"]) ?? null,
    intensity_avg: traits?.intensity_avg ?? null,
    most_common_need: traits?.most_common_need ?? null,
    most_common_blocker: traits?.most_common_blocker ?? null,
    last_diagnostic_summary: lastDiagnosticSummary,
    recent_state_labels: (recentCheckins ?? []).map(c => c.state_label),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Session management
// ─────────────────────────────────────────────────────────────────────────────

async function ensureSession(
  caller: CallerContext,
  sessionId: string | null,
): Promise<Tables<"chat_sessions">> {
  // Reuse the requested session if it belongs to the user and is still open
  if (sessionId) {
    const { data } = await caller.client
      .from("chat_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", caller.userId)
      .maybeSingle();
    if (data && data.ended_at === null) return data;
  }
  // Otherwise, create a new session
  const { data, error } = await caller.client
    .from("chat_sessions")
    .insert({ user_id: caller.userId })
    .select("*")
    .single();
  if (error) throw new Error(`[agent] failed to create session: ${error.message}`);
  return data;
}

async function loadHistory(
  caller: CallerContext,
  sessionId: string,
): Promise<Tables<"chat_messages">[]> {
  const { data } = await caller.client
    .from("chat_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(HISTORY_LIMIT);
  return data ?? [];
}

async function persistMessage(
  caller: CallerContext,
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  tokensIn: number,
  tokensOut: number,
  safetyFlag: RiskLevel | null,
): Promise<void> {
  await caller.client.from("chat_messages").insert({
    session_id: sessionId,
    role,
    content,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    safety_flag: safetyFlag === "none" ? null : safetyFlag,
  });
}

async function bumpSessionStats(
  caller: CallerContext,
  sessionId: string,
  addTokens: number,
  addMessages: number,
): Promise<void> {
  // Read-modify-write — chat is low-frequency, race conditions are negligible
  const { data: cur } = await caller.client
    .from("chat_sessions").select("tokens_used,message_count")
    .eq("id", sessionId).maybeSingle();
  await caller.client
    .from("chat_sessions")
    .update({
      tokens_used: (cur?.tokens_used ?? 0) + addTokens,
      message_count: (cur?.message_count ?? 0) + addMessages,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Claude call (non-streaming)
// ─────────────────────────────────────────────────────────────────────────────

async function callChat(
  apiKey: string,
  systemPrompt: string,
  history: Tables<"chat_messages">[],
  userMessage: string,
): Promise<{ reply: string; tokensIn: number; tokensOut: number }> {
  // Map our schema to Anthropic's expected message shape. Skip system rows.
  const messages = history
    .filter(m => m.role === "user" || m.role === "assistant")
    .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
  messages.push({ role: "user", content: userMessage });

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 600, // chat replies are short by design
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${errText}`);
  }

  const json = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const reply = json.content[0]?.text?.trim() ?? "";
  return {
    reply,
    tokensIn: json.usage?.input_tokens ?? 0,
    tokensOut: json.usage?.output_tokens ?? 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Server function — single chat turn
// ─────────────────────────────────────────────────────────────────────────────

export const chatTurn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as ChatTurnInput)
  .handler(async (ctx): Promise<ChatTurnResult> => {
    const data = ctx.data;
    if (!data.message?.trim()) throw new Error("MESSAGE_EMPTY");

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      const err = new Error("AI_KEY_MISSING") as Error & { code?: string };
      err.code = "AI_KEY_MISSING";
      throw err;
    }

    const caller = await resolveAuthCaller(data.access_token);
    if (!caller) {
      const err = new Error("UNAUTHORIZED") as Error & { code?: string };
      err.code = "UNAUTHORIZED";
      throw err;
    }
    if (caller.isAnonymous) {
      const err = new Error("REAL_ACCOUNT_REQUIRED") as Error & { code?: string };
      err.code = "REAL_ACCOUNT_REQUIRED";
      throw err;
    }

    // ─── Step 1: ensure / create session ────────────────────────────────────
    const session = await ensureSession(caller, data.session_id);

    // ─── Step 2: safety pre-check on user input ────────────────────────────
    const userDetection = detectRisk(data.message);
    if (userDetection.level !== "none") {
      void logRiskEvent(caller.client, {
        userId: caller.userId,
        detection: userDetection,
        source: "chat_message",
        action_taken:
          userDetection.level === "urgent"
            ? "ia_blocked_safety_response_shown"
            : "safety_response_shown",
        context: { session_id: session.id, where: "user_input" },
      });
    }

    // URGENT → block IA, persist user message + safety reply, short-circuit
    if (userDetection.level === "urgent") {
      const safety = buildSafetyResponse("urgent");
      await persistMessage(caller, session.id, "user", data.message, 0, 0, "urgent");
      const fallback = safety?.message ?? "Je préfère qu'on s'arrête une seconde ici.";
      await persistMessage(caller, session.id, "assistant", fallback, 0, 0, "urgent");
      await bumpSessionStats(caller, session.id, 0, 2);
      // No ai_usage row — we did NOT call Claude.
      const quota = await getQuotaState(caller);
      return {
        session_id: session.id,
        reply: fallback,
        safety_flag: "urgent",
        show_resources: true,
        blocked: true,
        quota: { used: quota.used, limit: quota.limit, window: quota.window },
      };
    }

    // ─── Step 3: quota check (BEFORE Claude call) ──────────────────────────
    const quotaBefore = await getQuotaState(caller);
    if (quotaBefore.used >= quotaBefore.limit) {
      const err = new Error("CHAT_QUOTA_EXCEEDED") as Error & {
        code?: string;
        quota?: { used: number; limit: number; window: string };
      };
      err.code = "CHAT_QUOTA_EXCEEDED";
      err.quota = { used: quotaBefore.used, limit: quotaBefore.limit, window: quotaBefore.window };
      throw err;
    }

    // ─── Step 4: build context + call Claude ───────────────────────────────
    const [userCtx, history] = await Promise.all([
      buildUserContext(caller),
      loadHistory(caller, session.id),
    ]);
    const systemPrompt = buildSystemPrompt(userCtx);

    let reply: string;
    let tokensIn = 0;
    let tokensOut = 0;
    try {
      const result = await callChat(apiKey, systemPrompt, history, data.message);
      reply = result.reply;
      tokensIn = result.tokensIn;
      tokensOut = result.tokensOut;
    } catch (err) {
      // Persist the user message so they don't lose it. Surface a calm error.
      await persistMessage(caller, session.id, "user", data.message, 0, 0, userDetection.level === "none" ? null : userDetection.level);
      // Record failed usage for cost observability (fire-and-forget)
      void caller.client.from("ai_usage").insert({
        user_id: caller.userId, fn: "chatTurn", tokens_in: 0, tokens_out: 0, success: false,
      });
      console.error("[agent] callChat failed:", err);
      throw new Error("AI_UNAVAILABLE");
    }

    // ─── Step 5: safety post-check on assistant reply (defensive) ──────────
    const replyDetection = detectRisk(reply);
    let finalReply = reply;
    let finalSafetyFlag: RiskLevel | null = null;
    let showResources = false;
    if (replyDetection.level === "urgent" || replyDetection.level === "elevated") {
      // Replace the assistant's reply with a safe fallback. Anthropic's haiku
      // is unlikely to emit risky content given our system prompt, but this
      // is defense-in-depth.
      const safety = buildSafetyResponse(replyDetection.level);
      if (safety) {
        finalReply = safety.message;
        showResources = safety.show_resources;
      }
      finalSafetyFlag = replyDetection.level;
      void logRiskEvent(caller.client, {
        userId: caller.userId,
        detection: replyDetection,
        source: "chat_assistant_output",
        action_taken: "assistant_reply_replaced_with_safety",
        context: { session_id: session.id, where: "assistant_output" },
      });
    } else if (userDetection.level === "elevated") {
      // User showed elevated distress. Keep IA reply but also offer resources.
      showResources = true;
    }

    // ─── Step 6: persist messages + record ai_usage + bump session stats ───
    await persistMessage(
      caller, session.id, "user", data.message, 0, 0,
      userDetection.level === "none" ? null : userDetection.level,
    );
    await persistMessage(
      caller, session.id, "assistant", finalReply, tokensIn, tokensOut,
      finalSafetyFlag,
    );
    await bumpSessionStats(caller, session.id, tokensIn + tokensOut, 2);

    // ai_usage — fire-and-forget. Counted on next quota check.
    void caller.client.from("ai_usage").insert({
      user_id: caller.userId, fn: "chatTurn",
      tokens_in: tokensIn, tokens_out: tokensOut, success: true,
    });

    // Return updated quota after this turn (informational)
    const quotaAfter = {
      used: quotaBefore.used + 1,
      limit: quotaBefore.limit,
      window: quotaBefore.window,
    };

    return {
      session_id: session.id,
      reply: finalReply,
      safety_flag: finalSafetyFlag,
      show_resources: showResources,
      blocked: false,
      quota: quotaAfter,
    };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Server function — fetch quota state for UI display
// ─────────────────────────────────────────────────────────────────────────────

export interface ChatQuotaInput { access_token: string }
export interface ChatQuotaResult {
  used: number;
  limit: number;
  window: "jour" | "mois";
  authenticated: boolean;
  is_anonymous: boolean;
  premium: boolean;
}

export const getChatQuota = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as ChatQuotaInput)
  .handler(async (ctx): Promise<ChatQuotaResult> => {
    const caller = await resolveAuthCaller(ctx.data.access_token);
    if (!caller) {
      return { used: 0, limit: FREE_LIMIT, window: "jour", authenticated: false, is_anonymous: false, premium: false };
    }
    const state = await getQuotaState(caller);
    const { data: sub } = await caller.client
      .from("subscriptions").select("*").eq("user_id", caller.userId).maybeSingle();
    const ent = getEntitlementFromRow(sub ?? null);
    return {
      used: state.used,
      limit: state.limit,
      window: state.window,
      authenticated: true,
      is_anonymous: caller.isAnonymous,
      premium: hasFeature(ent, "chat_full"),
    };
  });
