import { createServerFn } from "@tanstack/react-start";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getEntitlementFromRow, hasFeature } from "@/lib/entitlements";

// =============================================================================
// V2.3.1 — Server-side helpers: caller identity, quotas, usage tracking
// =============================================================================
//
// All Claude server functions accept an optional `access_token` in their input
// (the user's Supabase JWT). When present:
//   1. We validate it via Supabase auth.getClaims (no service-role secret
//      needed — the publishable key + JWT signature is enough).
//   2. We build a request-scoped Supabase client (auth header set) so reads
//      and inserts run UNDER THE USER's RLS context. No service role.
//   3. Domain-specific gates (e.g. "1 diagnostic / 90 days for free") query
//      the canonical tables (assessments, subscriptions) — never raw ai_usage.
// When absent: fail-open. The Claude call still goes through, no usage row
// is recorded, no quota is enforced. This keeps backward compat for any
// caller that hasn't been updated yet.

interface CallerContext {
  userId: string;
  client: SupabaseClient<Database>;
}

/**
 * Validate an access token using the publishable key (no service-role required).
 * Returns a request-scoped Supabase client + the resolved userId, or null.
 */
async function resolveCaller(accessToken: string | undefined): Promise<CallerContext | null> {
  if (!accessToken) return null;
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY =
    process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    console.warn("[claude] Supabase env vars missing — skipping caller validation");
    return null;
  }
  try {
    const client = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getClaims(accessToken);
    if (error || !data?.claims?.sub) return null;
    return { userId: data.claims.sub, client };
  } catch (err) {
    console.warn("[claude] resolveCaller failed:", err);
    return null;
  }
}

type AiFn = "analyzeCheckin" | "analyzeDiagnostic" | "generateWeeklyReview" | "chatTurn";

/**
 * Best-effort, fire-and-forget. Never throws. Used at the END of each Claude
 * call to record cost/usage. RLS allows authenticated users to insert their
 * own rows — caller's scoped client is the right context.
 */
async function recordUsage(
  ctx: CallerContext | null,
  fn: AiFn,
  tokensIn: number,
  tokensOut: number,
  success: boolean,
): Promise<void> {
  if (!ctx) return; // no caller → nothing to record (acceptable for fail-open path)
  try {
    await ctx.client.from("ai_usage").insert({
      user_id: ctx.userId,
      fn,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      success,
    });
  } catch (err) {
    console.warn(`[claude] recordUsage(${fn}) failed:`, err);
  }
}

const DIAGNOSTIC_COOLDOWN_DAYS = 90;

/**
 * Throws DIAGNOSTIC_BLOCKED with `next_available_at` if the free user has
 * completed a diagnostic in the past 90 days. Premium users (active sub or
 * lifetime) bypass the check entirely.
 */
async function assertDiagnosticAllowed(ctx: CallerContext): Promise<void> {
  // 1. Read entitlement via subscriptions (RLS-protected SELECT, own row)
  const { data: sub } = await ctx.client
    .from("subscriptions")
    .select("*")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  const ent = getEntitlementFromRow(sub ?? null);
  if (hasFeature(ent, "diagnostic_unlimited")) return;

  // 2. Free user — query last completed diagnostic
  const { data: latest } = await ctx.client
    .from("assessments")
    .select("completed_at")
    .eq("user_id", ctx.userId)
    .eq("type", "diagnostic")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest?.completed_at) return; // never done one → allow
  const lastTs = new Date(latest.completed_at).getTime();
  const cooldownMs = DIAGNOSTIC_COOLDOWN_DAYS * 24 * 3600 * 1000;
  const nextTs = lastTs + cooldownMs;
  if (Date.now() < nextTs) {
    const err = new Error("DIAGNOSTIC_BLOCKED") as Error & {
      code?: string;
      next_available_at?: string;
      cooldown_days?: number;
    };
    err.code = "DIAGNOSTIC_BLOCKED";
    err.next_available_at = new Date(nextTs).toISOString();
    err.cooldown_days = DIAGNOSTIC_COOLDOWN_DAYS;
    throw err;
  }
}

// =============================================================================
// V1 — Check-in express (4 questions). PRESERVED untouched.
// =============================================================================

export interface CheckinInput {
  mental_load: string;
  calm_level: string;
  blocker: string;
  immediate_need: string;
  /** Optional Supabase access token. When present, usage is recorded. */
  access_token?: string;
}

export interface ClaudeResult {
  state_label: string;
  explanation: string;
  micro_action: string;
  load_score: number;
}

export const analyzeCheckin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as CheckinInput)
  .handler(async (ctx) => {
    const data = ctx.data;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

    const caller = await resolveCaller(data.access_token);

    const prompt = `Tu es un coach mental bienveillant. Analyse cet état et réponds UNIQUEMENT avec un JSON valide — aucun texte autour, pas de markdown.

Données :
- Charge mentale : ${data.mental_load}
- Niveau de calme : ${data.calm_level}
- Principal blocage : ${data.blocker}
- Besoin immédiat : ${data.immediate_need}

Réponds avec exactement ce JSON (valeurs en français) :
{"state_label":"[étiquette courte de l'état, ex: Surcharge cognitive]","explanation":"[2 phrases bienveillantes et directes sur l'état]","micro_action":"[1 action concrète de 30-90 secondes, commençant par un verbe]","load_score":[entier de 1 à 10]}`;

    let success = false;
    let tokensIn = 0;
    let tokensOut = 0;
    try {
      const result = await callClaude<ClaudeResult>(apiKey, prompt, 500, (parsed) => {
        parsed.load_score = Math.max(1, Math.min(10, Number(parsed.load_score) || 5));
        return parsed;
      }, (usage) => { tokensIn = usage.in; tokensOut = usage.out; });
      success = true;
      return result;
    } finally {
      void recordUsage(caller, "analyzeCheckin", tokensIn, tokensOut, success);
    }
  });

// =============================================================================
// V2.2 — Diagnostic complet
// =============================================================================

export interface DiagnosticInput {
  /** Per-domain scores: { stress: 0.7, anxiety: 0.45, ... } values in [0, 1]. */
  domains: Record<string, number>;
  overall_intensity: number; // 0..1
  /** Optional context — last few checkins to make the synthesis more personal. */
  recent_checkins?: Array<{
    state_label: string;
    explanation: string;
    created_at: string;
  }>;
  /** Tone hint coming from the personalization layer. */
  tone?: "neutre" | "rassurant" | "structuré";
  /** Required for free users — used to enforce the 1-per-90-days cap and
   *  record usage. Premium users still pass it; the cap is bypassed by
   *  entitlement check. Calls without a token fail-open (no cap, no log).
   */
  access_token?: string;
}

export interface DiagnosticSynthesis {
  profile_summary: string;
  intensity_label: string;
  vigilance_zones: Array<{ name: string; why: string }>;
  protective_factors: Array<{ name: string; why: string }>;
  recommendations: Array<{ action: string; content_slug?: string }>;
  next_step: string;
}

export const analyzeDiagnostic = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as DiagnosticInput)
  .handler(async (ctx) => {
    const data = ctx.data;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

    const caller = await resolveCaller(data.access_token);

    // Quota gate: free users get 1 diagnostic / 90 days. Premium bypasses.
    // We call this BEFORE hitting Claude — no point burning ~1200 tokens
    // for a request we will reject anyway. resolveCaller returning null
    // means we have no auth context at all → fail-open (no cap).
    if (caller) {
      try {
        await assertDiagnosticAllowed(caller);
      } catch (err) {
        // Surface the error verbatim so the client can read code +
        // next_available_at and render a calm "tu pourras refaire le X" UI.
        throw err;
      }
    }

    const tone = data.tone ?? "neutre";
    const toneNote =
      tone === "rassurant"
        ? "Adopte un ton particulièrement doux et rassurant. Évite tout vocabulaire qui pourrait inquiéter."
        : tone === "structuré"
        ? "Tu peux être direct et structuré, la personne semble suffisamment stable pour une lecture franche."
        : "Reste calme et neutre, ni trop doux ni trop incisif.";

    const domainsLine = Object.entries(data.domains)
      .map(([k, v]) => `${k}=${(v as number).toFixed(2)}`)
      .join(", ");

    const recentLine = data.recent_checkins?.length
      ? `\n\nDerniers check-ins courts:\n${data.recent_checkins
          .slice(0, 3)
          .map((c, i) => `${i + 1}. ${c.state_label} — ${c.explanation}`)
          .join("\n")}`
      : "";

    const prompt = `Tu es Marge, une compagne calme du quotidien. ${toneNote}

Tu reçois le score d'un diagnostic mental complet (10 dimensions, valeurs 0..1 où 1 = forte préoccupation, 0 = aucune préoccupation).

Score global d'intensité: ${data.overall_intensity.toFixed(2)}
Domaines: ${domainsLine}${recentLine}

Construis une SYNTHÈSE structurée. Réponds UNIQUEMENT avec ce JSON valide (français, pas de markdown autour) :
{
  "profile_summary": "[3 à 4 phrases qui décrivent en mots simples ce qui ressort. Pas de jargon médical. Pas de diagnostic. Une lecture humaine.]",
  "intensity_label": "[un mot parmi: clair, modéré, élevé, intense]",
  "vigilance_zones": [{"name": "[nom court du domaine ou phénomène, ex: Sommeil fragile]", "why": "[1 phrase qui explique]"}],
  "protective_factors": [{"name": "[nom court, ex: Lien social présent]", "why": "[1 phrase]"}],
  "recommendations": [{"action": "[action courte commençant par un verbe]", "content_slug": "[optionnel: un slug parmi: respiration-4-6, ancrage-5-sens, main-poitrine, vider-papier, micro-marche, surcharge-priorise, rumination-sortir, energie-basse, sommeil-coupe, routine-matin-2min, comprendre-charge, signaux-faibles]"}],
  "next_step": "[1 phrase qui invite la personne à un prochain pas — léger, jamais culpabilisant]"
}

Règles importantes:
- 2 à 4 zones de vigilance maximum
- 1 à 3 facteurs protecteurs (peut être 0 si vraiment rien ne ressort)
- 3 à 5 recommandations, dont au moins 2 avec un content_slug si possible
- JAMAIS de termes médicaux ("dépression", "burn-out", "TAG", "TOC"...)
- Toujours bienveillant, jamais alarmiste`;

    let success = false;
    let tokensIn = 0;
    let tokensOut = 0;
    try {
      const result = await callClaude<DiagnosticSynthesis>(
        apiKey, prompt, 1200, undefined,
        (usage) => { tokensIn = usage.in; tokensOut = usage.out; },
      );
      success = true;
      return result;
    } finally {
      void recordUsage(caller, "analyzeDiagnostic", tokensIn, tokensOut, success);
    }
  });

// =============================================================================
// V2.2 — Bilan hebdomadaire
// =============================================================================

export interface WeeklyInput {
  week_start: string;
  total_checkins: number;
  average_load: number | null;
  trend: "stable" | "improving" | "worsening" | "insufficient";
  dominant_state: string | null;
  dominant_need: string | null;
  dominant_blocker: string | null;
  daily: Array<{
    dow: string;
    count: number;
    avg_load: number | null;
    state_labels: string[];
  }>;
  time_of_day: {
    morning: { count: number; avg_load: number | null };
    day:     { count: number; avg_load: number | null };
    evening: { count: number; avg_load: number | null };
  };
  recent_excerpts: Array<{
    when: string;
    state: string;
    need: string;
    blocker: string;
  }>;
  tone?: "neutre" | "rassurant" | "structuré";
  /** Optional Supabase access token for usage tracking. */
  access_token?: string;
}

export interface WeeklySynthesis {
  narrative: string;
  helpful_factors: string[];
  aggravating_factors: string[];
  next_week_plan: string[];
  insights: string[];
}

export const generateWeeklyReview = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as WeeklyInput)
  .handler(async (ctx) => {
    const data = ctx.data;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

    const caller = await resolveCaller(data.access_token);

    const tone = data.tone ?? "neutre";
    const toneNote =
      tone === "rassurant"
        ? "Adopte un ton doux et rassurant — la personne est sensible cette semaine."
        : tone === "structuré"
        ? "Tu peux être franc et synthétique, la personne semble stable."
        : "Reste calme et neutre.";

    const todPretty = (label: string, b: { count: number; avg_load: number | null }) =>
      b.count === 0 ? `${label}: aucun point` : `${label}: ${b.count} points, charge moyenne ${b.avg_load?.toFixed(1) ?? "—"}`;

    const dailyLine = data.daily
      .filter(d => d.count > 0)
      .map(d => `${d.dow}: ${d.count} pts, charge ${d.avg_load?.toFixed(1) ?? "—"}`)
      .join(" · ");

    const excerptsLine = data.recent_excerpts
      .map(e => `• ${e.when} — état: ${e.state}, besoin: ${e.need}, blocage: ${e.blocker}`)
      .join("\n");

    const prompt = `Tu es Marge, une compagne calme. ${toneNote}

Voici l'agrégat de la semaine de la personne:
- Période: ${data.week_start} (lundi) à dimanche
- Nombre de check-ins: ${data.total_checkins}
- Charge moyenne: ${data.average_load?.toFixed(1) ?? "—"}/10
- Tendance: ${data.trend}
- État dominant: ${data.dominant_state ?? "—"}
- Besoin récurrent: ${data.dominant_need ?? "—"}
- Blocage récurrent: ${data.dominant_blocker ?? "—"}
- Par moment: ${todPretty("matin", data.time_of_day.morning)} · ${todPretty("après-midi", data.time_of_day.day)} · ${todPretty("soir", data.time_of_day.evening)}
- Par jour: ${dailyLine || "—"}

Extraits récents:
${excerptsLine || "Aucun extrait."}

Construis le bilan hebdomadaire. Réponds UNIQUEMENT avec ce JSON (français, pas de markdown autour) :
{
  "narrative": "[3 à 5 phrases qui racontent la semaine de manière humaine, sans verdict. Évite les chiffres bruts. Prends de la hauteur sans t'éloigner du concret.]",
  "helpful_factors": ["[ce qui a allégé cette semaine — 2 à 4 items courts]"],
  "aggravating_factors": ["[ce qui a alourdi — 2 à 4 items courts]"],
  "next_week_plan": ["[2 à 4 micro-actions concrètes pour la semaine prochaine, courtes, jamais ambitieuses]"],
  "insights": ["[3 à 5 lectures courtes en une phrase chacune — ce que Marge repère, ce qui se dessine]"]
}

Règles:
- Pas de jargon, pas de chiffres bruts dans le narrative
- Pas d'objectif chiffré dans next_week_plan
- Tonalité bienveillante toujours, jamais culpabilisante
- Si très peu de données (1-2 check-ins), la sortie reste honnête sur ce que ça permet de voir`;

    let success = false;
    let tokensIn = 0;
    let tokensOut = 0;
    try {
      const result = await callClaude<WeeklySynthesis>(
        apiKey, prompt, 1200, undefined,
        (usage) => { tokensIn = usage.in; tokensOut = usage.out; },
      );
      success = true;
      return result;
    } finally {
      void recordUsage(caller, "generateWeeklyReview", tokensIn, tokensOut, success);
    }
  });

// =============================================================================
// Shared low-level Claude call helper.
// =============================================================================

async function callClaude<T>(
  apiKey: string,
  prompt: string,
  maxTokens: number,
  postProcess?: (parsed: T) => T,
  onUsage?: (usage: { in: number; out: number }) => void,
): Promise<T> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-20241022",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
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
  if (onUsage) {
    onUsage({
      in: json.usage?.input_tokens ?? 0,
      out: json.usage?.output_tokens ?? 0,
    });
  }
  const text = json.content[0]?.text?.trim() ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Réponse Claude inattendue : ${text.slice(0, 120)}`);

  const parsed = JSON.parse(match[0]) as T;
  return postProcess ? postProcess(parsed) : parsed;
}
