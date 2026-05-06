// Marge — Safety layer (V2.3.2)
//
// CONTRAT
// =======
// Une SEULE responsabilité : détecter dans un texte libre des signaux de
// crise / détresse aiguë, classer leur intensité, produire une réponse
// fallback bienveillante, et logger l'événement.
//
// Cette couche est appelée AVANT toute génération IA dans le chat (V2.3.3).
// Elle ne se préoccupe pas de l'orchestration de la conversation, du quota,
// du tone, ni du pricing. Elle ne fait QUE de la safety.
//
// PRINCIPES
// =========
// 1. Server-side only. La détection ne doit JAMAIS reposer sur un check
//    côté client — l'utilisateur peut le contourner.
// 2. Fail-closed pour les niveaux "urgent" : si la détection est positive,
//    on remplace la réponse normale par une réponse safety, on n'envoie
//    rien à Claude, on logue.
// 3. Fail-open pour la conversation normale : si la détection est faible
//    (level "none" ou "attention"), la conversation continue normalement,
//    avec éventuellement un rappel discret.
// 4. Privacy : on ne logue PAS la phrase exacte par défaut. On logue les
//    catégories matchées (matched_terms) dans `context.matched_terms`. La
//    phrase verbatim peut être stockée en option uniquement pour des
//    revues admin explicites.
// 5. Pas de jugement médical. On ne diagnostique pas. On redirige vers
//    de l'aide humaine et on rappelle les ressources d'urgence.
//
// LIMITES CONNUES
// ===============
// - Détection lexicale, pas sémantique. Une phrase de crise reformulée
//   subtilement peut ne pas matcher. Compromis assumé : zéro IA dans la
//   safety pour garantir la latence et la prévisibilité.
// - Faux positifs possibles (ex: "je veux mourir de rire"). Mitigés par
//   la détection de termes qui inversent ("rire", "blague").
// - Lexique volontairement conservateur en V2.3.2. Calibrage à affiner
//   avec les données réelles dès que le chat (V2.3.3) tourne en prod.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type RiskLevel = "none" | "attention" | "elevated" | "urgent";

export interface RiskDetection {
  level: RiskLevel;
  /** Categories of terms that matched (NOT the verbatim user phrase). */
  matched_terms: string[];
  /** True if a "false positive cancel" pattern (joke, idiom) was detected. */
  defused: boolean;
}

export interface SafetyResponse {
  level: RiskLevel;
  /**
   * Body of the safety message to display in place of the normal IA reply.
   * Calm, factual, never alarmist. Always offers human-help redirection.
   */
  message: string;
  /** Whether the surface MUST also display the EmergencyResources component. */
  show_resources: boolean;
  /** Whether the chat should refuse to send the user's message to the IA. */
  block_ia_response: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lexique FR — listes par niveau
//
// Chaque entrée est une expression en MINUSCULES, sans accents (la fonction
// detectRisk normalise le texte avant comparaison). Les expressions sont
// triées par sévérité descendante.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * URGENT — risque imminent ou idéation suicidaire / passage à l'acte.
 * Ces patterns déclenchent un block IA + redirection ressources d'urgence.
 */
const URGENT_PATTERNS: ReadonlyArray<RegExp> = [
  // Idéation suicidaire directe
  /\bje veux mourir\b/,
  /\bj['e ]?envie de mourir\b/,
  /\bje vais me tuer\b/,
  /\bje vais en finir\b/,
  /\bje veux en finir\b/,
  /\bj['e ]?envie d['e ]?en finir\b/,
  /\bje vais me suicider\b/,
  /\bje veux me suicider\b/,
  /\bme suicider\b/,
  /\bsuicide\b/, // attention : peut faire faux positif sur "prevention suicide"
  /\b(tentative|idee) de suicide\b/,
  /\bje pense au suicide\b/,
  // Désir d'arrêter
  /\bj['e ]?ai plus envie de vivre\b/,
  /\bje n['e ]?ai plus envie de vivre\b/,
  /\bj['e ]?ai pas envie de continuer\b/,
  /\bje veux disparaitre\b/,
  /\bj['e ]?ai envie de disparaitre\b/,
  /\bj['e ]?aimerais ne plus exister\b/,
  /\bj['e ]?aimerais etre mort\b/,
  /\bj['e ]?aimerais etre morte\b/,
  // Auto-mutilation / passage à l'acte
  /\bme faire du mal\b/,
  /\bme blesser\b/,
  /\bje me coupe\b/,
  /\bje me suis coupe\b/,
  /\bje me suis fait du mal\b/,
];

/**
 * ELEVATED — détresse aiguë sans idéation directe, mais préoccupante.
 * Déclenche une réponse safety + ressources mais ne bloque pas l'IA si
 * l'utilisateur veut continuer la conversation.
 */
const ELEVATED_PATTERNS: ReadonlyArray<RegExp> = [
  /\bje n['e ]?en peux plus\b/,
  /\bje tiens plus\b/,
  /\bje ne tiens plus\b/,
  /\bje suis au bord\b/,
  /\bau bout du rouleau\b/,
  /\bje craque\b/,
  /\bje suis a bout\b/,
  /\bj['e ]?ai touche le fond\b/,
  /\bje suis brise\b/,
  /\bje suis brisee\b/,
  /\bje suis vide\b/,
  /\brien n['e ]?a plus de sens\b/,
  /\brien ne sert a rien\b/,
  /\bje sers a rien\b/,
  /\bje ne sers a rien\b/,
];

/**
 * ATTENTION — signaux faibles. Pas d'action particulière, mais on logue
 * pour repérage de patterns dans le temps. Le chat continue normalement.
 */
const ATTENTION_PATTERNS: ReadonlyArray<RegExp> = [
  /\bje suis tres triste\b/,
  /\bj['e ]?arrive plus a rien\b/,
  /\bje suis epuise\b/,
  /\bje suis epuisee\b/,
  /\btout est noir\b/,
  /\bj['e ]?ai pas de gout\b/,
  /\bplus rien ne me touche\b/,
];

/**
 * "Defuse" patterns — expressions qui annulent une détection (idiomes
 * français où "mourir" / "fini" sont métaphoriques, pas littéraux).
 */
const DEFUSE_PATTERNS: ReadonlyArray<RegExp> = [
  /mourir de rire/,
  /mort de rire/,
  /\bmdr\b/,
  /a en mourir/,
  /je suis mort de fatigue/,
  /\bblague\b/,
  /\bplaisante\b/,
  /\bironique?\b/,
  /\bhumour\b/,
  /au sens figure/,
  /metaphor/,
];

// ─────────────────────────────────────────────────────────────────────────────
// Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalise un texte pour la comparaison lexicale :
 * - lowercase
 * - retire les accents (NFD + remove diacritics)
 * - normalise les espaces
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Détecte les signaux de risque dans un texte libre. Pure function, ne
 * dépend de rien hors du module. Retourne le niveau le plus élevé matché.
 *
 * Algorithme :
 *   1. Normalise le texte (lowercase + sans accents).
 *   2. Vérifie les patterns urgent → elevated → attention.
 *   3. Si match urgent, vérifie les "defuse" patterns. Si défusé, on
 *      rétrograde au plus à "attention".
 *   4. Retourne RiskDetection avec catégories matchées (pas la phrase).
 */
export function detectRisk(text: string): RiskDetection {
  if (!text || typeof text !== "string") {
    return { level: "none", matched_terms: [], defused: false };
  }
  const norm = normalize(text);
  const matched_terms: string[] = [];
  const defused = DEFUSE_PATTERNS.some(p => p.test(norm));

  let level: RiskLevel = "none";
  for (const p of URGENT_PATTERNS) {
    if (p.test(norm)) {
      level = "urgent";
      matched_terms.push("ideation_suicidaire");
      break;
    }
  }
  if (level === "none") {
    for (const p of ELEVATED_PATTERNS) {
      if (p.test(norm)) {
        level = "elevated";
        matched_terms.push("detresse_aigue");
        break;
      }
    }
  }
  if (level === "none") {
    for (const p of ATTENTION_PATTERNS) {
      if (p.test(norm)) {
        level = "attention";
        matched_terms.push("signal_faible");
        break;
      }
    }
  }

  // Defuse : si urgent + defuse patterns présents, rétrograder à attention.
  // On ne défuse PAS elevated (les expressions sont rarement métaphoriques)
  // et bien sûr pas attention (rien à rétrograder).
  if (defused && level === "urgent") {
    return {
      level: "attention",
      matched_terms: ["defused_urgent"],
      defused: true,
    };
  }

  return { level, matched_terms, defused };
}

// ─────────────────────────────────────────────────────────────────────────────
// Réponses fallback (server-side, jamais client)
// ─────────────────────────────────────────────────────────────────────────────

const URGENT_MESSAGE = `Ce que tu écris me touche, et je préfère qu'on s'arrête une seconde ici.

Marge n'est pas le bon endroit pour traverser ce moment seul·e. Quelqu'un peut t'écouter — tout de suite, anonymement, sans jugement.

Si tu te sens en danger immédiat, appelle le 15 (SAMU). Sinon, le 3114 est dédié à la prévention du suicide, gratuit et ouvert 24/7.

Tu peux fermer cette page si tu préfères. Je serai toujours là quand tu reviens.`;

const ELEVATED_MESSAGE = `Ce que tu décris a l'air vraiment lourd à porter en ce moment.

Marge peut t'aider à mettre les choses en mots, mais elle n'est pas un substitut à un soutien humain. Si tu en ressens le besoin, parler à quelqu'un fait souvent une vraie différence — un·e proche, un·e médecin, ou une ligne d'écoute.

On peut continuer ici, à ton rythme, ou tu peux faire une pause. Comme tu veux.`;

const ATTENTION_MESSAGE = `Je t'entends. Si à un moment tu as envie de parler à quelqu'un, des ressources existent — discrètes et gratuites.`;

/**
 * Construit la réponse safety appropriée pour le niveau détecté.
 * Pour "none" : retourne null (pas de message à afficher).
 */
export function buildSafetyResponse(level: RiskLevel): SafetyResponse | null {
  if (level === "none") return null;
  if (level === "urgent") {
    return {
      level,
      message: URGENT_MESSAGE,
      show_resources: true,
      block_ia_response: true,
    };
  }
  if (level === "elevated") {
    return {
      level,
      message: ELEVATED_MESSAGE,
      show_resources: true,
      block_ia_response: false,
    };
  }
  // attention
  return {
    level,
    message: ATTENTION_MESSAGE,
    show_resources: false,
    block_ia_response: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Logging (server-side, via scoped client)
// ─────────────────────────────────────────────────────────────────────────────

export interface LogRiskEventInput {
  userId: string | null;
  detection: RiskDetection;
  source: string;            // 'chat_message', 'checkin_text', 'manual_test', …
  action_taken: string;      // 'safety_response_shown', 'message_blocked', …
  /** Optional verbatim phrase. Avoid by default — privacy-sensitive. */
  trigger_phrase?: string;
  /** Free-form metadata (session id, etc.). matched_terms is added automatically. */
  context?: Record<string, unknown>;
}

/**
 * Loggue un risk_event. Best-effort — ne throw jamais. Utilise un client
 * scoped (avec le JWT du user) pour respecter la RLS qui exige
 * auth.uid() = user_id.
 */
export async function logRiskEvent(
  scopedClient: SupabaseClient<Database>,
  input: LogRiskEventInput,
): Promise<void> {
  try {
    await scopedClient.from("risk_events").insert({
      user_id: input.userId,
      level: input.detection.level === "none" ? "attention" : input.detection.level,
      source: input.source,
      trigger_phrase: input.trigger_phrase ?? null,
      action_taken: input.action_taken,
      context: {
        matched_terms: input.detection.matched_terms,
        defused: input.detection.defused,
        ...(input.context ?? {}),
      } as never,
    });
  } catch (err) {
    console.warn("[safety] logRiskEvent failed:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test cases — documentation exécutable du comportement attendu.
//
// Pas de runner installé en V2.3.2. Ces cases servent de spec et peuvent
// être exécutés via `runSafetyTests()` depuis la console du navigateur en
// dev pour calibrage. Ils seront formalisés avec vitest en V2.3.3+.
// ─────────────────────────────────────────────────────────────────────────────

export interface TestCase {
  input: string;
  expected_level: RiskLevel;
  note?: string;
}

export const SAFETY_TEST_CASES: ReadonlyArray<TestCase> = [
  // URGENT
  { input: "je veux mourir", expected_level: "urgent" },
  { input: "Je veux mourir.", expected_level: "urgent", note: "ponctuation et casse" },
  { input: "j'ai envie de mourir parfois", expected_level: "urgent" },
  { input: "je vais me tuer", expected_level: "urgent" },
  { input: "Je pense au suicide", expected_level: "urgent" },
  { input: "j'aimerais être mort", expected_level: "urgent", note: "accent" },
  { input: "j'ai envie de me faire du mal", expected_level: "urgent" },

  // DEFUSE — devrait rétrograder à attention
  { input: "je veux mourir de rire", expected_level: "attention", note: "defuse — idiome" },
  { input: "MDR je vais mourir", expected_level: "attention", note: "defuse — abrev" },
  { input: "je suis mort de fatigue", expected_level: "attention", note: "defuse — idiome" },

  // ELEVATED
  { input: "je n'en peux plus", expected_level: "elevated" },
  { input: "Je tiens plus.", expected_level: "elevated" },
  { input: "rien n'a plus de sens", expected_level: "elevated" },
  { input: "je suis au bord", expected_level: "elevated" },

  // ATTENTION
  { input: "je suis très triste", expected_level: "attention" },
  { input: "je suis épuisé", expected_level: "attention" },
  { input: "tout est noir", expected_level: "attention" },

  // NONE — pas de match
  { input: "j'ai eu une bonne journée", expected_level: "none" },
  { input: "ma chatte est mignonne", expected_level: "none", note: "pas de match" },
  { input: "je dois finir mon rapport", expected_level: "none", note: "'finir' seul ne suffit pas" },
  { input: "", expected_level: "none" },
];

/**
 * Exécutable manuellement en dev pour calibrer le lexique.
 * Retourne le nombre de cas en échec.
 */
export function runSafetyTests(): { total: number; failed: number; failures: TestCase[] } {
  const failures: TestCase[] = [];
  for (const tc of SAFETY_TEST_CASES) {
    const got = detectRisk(tc.input).level;
    if (got !== tc.expected_level) {
      failures.push({ ...tc, note: `${tc.note ?? ""} (got: ${got})` });
    }
  }
  return { total: SAFETY_TEST_CASES.length, failed: failures.length, failures };
}
