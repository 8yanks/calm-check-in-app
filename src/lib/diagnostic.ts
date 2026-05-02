// Marge — Diagnostic complet (V2.2)
//
// Questionnaire de 12 questions, 4 réponses chacune (scale 0-3).
// Inspiré sans être copié de PSS-10, GAD-7, WHO-5, CD-RISC-10.
// Reformulé en français bienveillant — pas de framing médical.
//
// Chaque question appartient à un "domaine" (stress, anxiety, ...). Le scoring
// agrège par domaine, ce qui permet de produire un profil multi-dimensionnel
// utilisé ensuite par l'IA pour construire la synthèse.

export type Domain =
  | "stress"
  | "anxiety"
  | "energy"
  | "sleep"
  | "cognition"
  | "irritability"
  | "social"
  | "recovery"
  | "pleasure"
  | "outlook";

export interface DiagnosticQuestion {
  key: string;            // unique identifier persisted in assessment_answers
  domain: Domain;
  section: string;        // editorial section (UX grouping)
  prompt: string;         // the question itself
  scale: "frequency" | "quality" | "agreement";
  /** 4 options, each 0-3. Index 0 = best, index 3 = worst (high score = more concern). */
  options: [string, string, string, string];
  /**
   * If true, the question is reverse-coded: index 0 = worst, index 3 = best.
   * Used for "positive" questions like "à quelle fréquence te sens-tu plein
   * d'énergie" where a low number means concern.
   */
  reversed?: boolean;
}

export const DIAGNOSTIC_QUESTIONS: DiagnosticQuestion[] = [
  // ── STRESS PERÇU ─────────────────────────────────────────────────────────
  {
    key: "stress_overload",
    domain: "stress",
    section: "Stress et tension",
    prompt: "Au cours des deux dernières semaines, à quelle fréquence t'es-tu senti·e débordé·e par ce que tu avais à gérer ?",
    scale: "frequency",
    options: ["Pas du tout", "Quelques jours", "Plus d'un jour sur deux", "Presque tous les jours"],
  },
  {
    key: "stress_lost_control",
    domain: "stress",
    section: "Stress et tension",
    prompt: "À quelle fréquence as-tu eu le sentiment que les choses t'échappaient ?",
    scale: "frequency",
    options: ["Pas du tout", "Parfois", "Souvent", "Très souvent"],
  },
  // ── ANXIÉTÉ ──────────────────────────────────────────────────────────────
  {
    key: "anxiety_tension",
    domain: "anxiety",
    section: "Stress et tension",
    prompt: "À quelle fréquence t'es-tu senti·e tendu·e ou anxieux·se sans raison claire ?",
    scale: "frequency",
    options: ["Pas du tout", "Parfois", "Souvent", "Presque tout le temps"],
  },
  // ── ÉNERGIE (positif → reverse) ──────────────────────────────────────────
  {
    key: "energy_level",
    domain: "energy",
    section: "Énergie et sommeil",
    prompt: "À quelle fréquence t'es-tu senti·e plein·e d'énergie ?",
    scale: "frequency",
    options: ["Tout le temps", "La plupart du temps", "De temps en temps", "Rarement"],
    reversed: true,
  },
  // ── SOMMEIL ──────────────────────────────────────────────────────────────
  {
    key: "sleep_quality",
    domain: "sleep",
    section: "Énergie et sommeil",
    prompt: "Comment dirais-tu que ton sommeil a été globalement ?",
    scale: "quality",
    options: ["Réparateur", "Plutôt bon", "Irrégulier", "Difficile la plupart des nuits"],
  },
  // ── COGNITION ────────────────────────────────────────────────────────────
  {
    key: "cognition_focus",
    domain: "cognition",
    section: "Tête et clarté",
    prompt: "À quelle fréquence as-tu eu du mal à te concentrer même sur des tâches simples ?",
    scale: "frequency",
    options: ["Jamais", "Parfois", "Souvent", "Presque tout le temps"],
  },
  {
    key: "cognition_clarity",
    domain: "cognition",
    section: "Tête et clarté",
    prompt: "Tes pensées ressemblaient le plus souvent à :",
    scale: "quality",
    options: ["Claires et organisées", "Un peu désordonnées", "En boucle ou parasitées", "Très denses, difficiles à suivre"],
  },
  // ── IRRITABILITÉ ─────────────────────────────────────────────────────────
  {
    key: "irritability",
    domain: "irritability",
    section: "Tête et clarté",
    prompt: "À quelle fréquence t'es-tu senti·e facilement irritable ou à fleur de peau ?",
    scale: "frequency",
    options: ["Jamais", "Parfois", "Souvent", "La plupart du temps"],
  },
  // ── SOCIAL ───────────────────────────────────────────────────────────────
  {
    key: "social_connection",
    domain: "social",
    section: "Lien et récupération",
    prompt: "Côté lien social, tu te dirais plutôt :",
    scale: "quality",
    options: ["Bien entouré·e", "Quelques contacts qui comptent", "Plutôt isolé·e malgré ton entourage", "Très en retrait, peu de contact"],
  },
  // ── RÉCUPÉRATION ─────────────────────────────────────────────────────────
  {
    key: "recovery_disconnect",
    domain: "recovery",
    section: "Lien et récupération",
    prompt: "Après une journée chargée, à quelle fréquence arrives-tu à vraiment décrocher ?",
    scale: "frequency",
    options: ["La plupart du temps", "Souvent", "Rarement", "Presque jamais"],
    reversed: true,
  },
  // ── PLAISIR (positif → reverse) ──────────────────────────────────────────
  {
    key: "pleasure_capacity",
    domain: "pleasure",
    section: "Lien et récupération",
    prompt: "Quand tu fais quelque chose qui te plaît, tu ressens :",
    scale: "quality",
    options: ["Du plaisir clair", "Un plaisir modéré", "Peu de chose", "Rien de particulier"],
  },
  // ── PROJECTION ───────────────────────────────────────────────────────────
  {
    key: "outlook",
    domain: "outlook",
    section: "Sur les prochaines semaines",
    prompt: "En te projetant sur les deux prochaines semaines, tu te sens :",
    scale: "quality",
    options: ["Plutôt confiant·e", "Mitigé·e", "Inquiet·ète", "Vraiment éprouvé·e"],
  },
];

export type AnswerMap = Record<string, number>; // question_key → 0..3

/**
 * Convert raw answer index (0-3) into a "concern score" 0-3, applying the
 * reverse-coding flag for positive questions.
 */
export function normalizeAnswer(question: DiagnosticQuestion, rawValue: number): number {
  const v = Math.max(0, Math.min(3, rawValue));
  return question.reversed ? 3 - v : v;
}

export interface DomainScore {
  domain: Domain;
  raw: number;        // sum of normalized answers in the domain
  max: number;        // theoretical max for this domain
  ratio: number;      // raw / max in [0, 1]
  bucket: "calme" | "modéré" | "élevé" | "intense";
}

export function bucketForRatio(ratio: number): DomainScore["bucket"] {
  if (ratio <= 0.25) return "calme";
  if (ratio <= 0.5) return "modéré";
  if (ratio <= 0.75) return "élevé";
  return "intense";
}

/** Compute per-domain scores from an answer map. */
export function computeDomainScores(answers: AnswerMap): DomainScore[] {
  const byDomain = new Map<Domain, { raw: number; max: number }>();
  for (const q of DIAGNOSTIC_QUESTIONS) {
    if (!(q.key in answers)) continue;
    const v = normalizeAnswer(q, answers[q.key]);
    const cur = byDomain.get(q.domain) ?? { raw: 0, max: 0 };
    cur.raw += v;
    cur.max += 3;
    byDomain.set(q.domain, cur);
  }
  return Array.from(byDomain.entries()).map(([domain, { raw, max }]) => ({
    domain,
    raw,
    max,
    ratio: max > 0 ? raw / max : 0,
    bucket: bucketForRatio(max > 0 ? raw / max : 0),
  }));
}

/** Overall intensity (0-1) from all answers — used by Claude prompt. */
export function computeOverallIntensity(answers: AnswerMap): number {
  let raw = 0, max = 0;
  for (const q of DIAGNOSTIC_QUESTIONS) {
    if (!(q.key in answers)) continue;
    raw += normalizeAnswer(q, answers[q.key]);
    max += 3;
  }
  return max > 0 ? raw / max : 0;
}

export const DOMAIN_LABELS: Record<Domain, string> = {
  stress: "Stress perçu",
  anxiety: "Tension intérieure",
  energy: "Énergie",
  sleep: "Sommeil",
  cognition: "Clarté mentale",
  irritability: "Irritabilité",
  social: "Lien social",
  recovery: "Récupération",
  pleasure: "Capacité à ressentir",
  outlook: "Projection",
};

export const DOMAIN_DESCRIPTIONS: Record<Domain, string> = {
  stress: "Sentiment d'être débordé ou que les choses échappent.",
  anxiety: "Tension de fond, anxiété diffuse.",
  energy: "Vitalité ressentie au quotidien.",
  sleep: "Qualité du sommeil et récupération nocturne.",
  cognition: "Concentration, clarté des pensées.",
  irritability: "Réactivité émotionnelle, sensibilité aux contrariétés.",
  social: "Sentiment d'être entouré et compris.",
  recovery: "Capacité à décrocher après l'effort.",
  pleasure: "Accès au plaisir et à la satisfaction.",
  outlook: "Sentiment face aux semaines à venir.",
};

/** Sections in display order (UX grouping). Used to build progress chunks. */
export const SECTIONS = [
  "Stress et tension",
  "Énergie et sommeil",
  "Tête et clarté",
  "Lien et récupération",
  "Sur les prochaines semaines",
] as const;

export const TOTAL_QUESTIONS = DIAGNOSTIC_QUESTIONS.length;
