// Marge core logic: scoring, state derivation, micro-actions, local persistence
export type MentalLoad = "rien" | "quelques" | "pas-mal" | "trop" | "pleine";
export type CalmLevel = "tres-calme" | "calme" | "entre" | "deborde" | "tres-deborde";
export type Blocker = "lancer" | "concentrer" | "poser" | "vider" | "gerer" | "inconnu";
export type Need = "souffler" | "clarifier" | "repartir" | "couper" | "calme";
export type StateLabel = "léger" | "chargé" | "tendu" | "saturé";

export const LABELS = {
  mental_load: {
    rien: "Presque rien", quelques: "Quelques choses", "pas-mal": "Pas mal de choses",
    trop: "Trop de choses", pleine: "J'ai la tête pleine",
  },
  calm: {
    "tres-calme": "Très calme", calme: "Plutôt calme", entre: "Entre les deux",
    deborde: "Plutôt débordé", "tres-deborde": "Complètement débordé",
  },
  blocker: {
    lancer: "Me lancer", concentrer: "Me concentrer", poser: "Me poser",
    vider: "Me vider la tête", gerer: "Trop de choses à gérer", inconnu: "Je ne sais pas trop",
  },
  need: {
    souffler: "Souffler", clarifier: "Clarifier", repartir: "Repartir",
    couper: "Couper un peu", calme: "Revenir au calme",
  },
} as const;

const LOAD_SCORE: Record<MentalLoad, number> = { rien: 1, quelques: 2, "pas-mal": 3, trop: 4, pleine: 5 };
const CALM_SCORE: Record<CalmLevel, number> = { "tres-calme": 1, calme: 2, entre: 3, deborde: 4, "tres-deborde": 5 };

export function deriveState(load: MentalLoad, calm: CalmLevel): { label: StateLabel; score: number } {
  const score = LOAD_SCORE[load] + CALM_SCORE[calm];
  if (score <= 3) return { label: "léger", score };
  if (score <= 6) return { label: "chargé", score };
  if (score <= 8) return { label: "tendu", score };
  return { label: "saturé", score };
}

export function buildExplanation(blocker: Blocker, need: Need, label: StateLabel): string {
  const parts: Record<StateLabel, string> = {
    "léger": "Tu sembles plutôt en marge aujourd'hui — c'est un bon moment pour avancer doucement.",
    "chargé": "Tu sembles surtout encombré mentalement.",
    "tendu": "Tu portes pas mal de tension là, maintenant.",
    "saturé": "Ta tête semble vraiment pleine en ce moment.",
  };
  const needHint: Record<Need, string> = {
    souffler: "Tu as surtout besoin de souffler une minute.",
    clarifier: "Tu as surtout besoin d'y voir un peu plus clair.",
    repartir: "Tu as surtout besoin de retrouver un point d'appui.",
    couper: "Tu as surtout besoin de couper, même brièvement.",
    calme: "Tu as surtout besoin de revenir à un endroit calme.",
  };
  return `${parts[label]} ${needHint[need]}`;
}

export function buildMicroAction(need: Need, blocker: Blocker): string {
  const actions: Record<Need, string[]> = {
    souffler: [
      "Pose tes deux pieds au sol. Inspire 4 secondes, expire 6 secondes. Trois fois.",
      "Ferme les yeux 30 secondes. Sens juste l'air qui entre et qui sort.",
    ],
    clarifier: [
      "Note en une phrase la seule chose qui compte vraiment dans la prochaine heure.",
      "Sors trois choses de ta tête sur papier. Pas plus.",
    ],
    repartir: [
      "Choisis une action toute petite, faisable en 2 minutes. Fais-la maintenant.",
      "Bois un verre d'eau, puis reprends une chose, une seule.",
    ],
    couper: [
      "Lève-toi, marche 60 secondes loin de tes écrans.",
      "Regarde par la fenêtre. Compte 5 choses que tu vois.",
    ],
    calme: [
      "Pose une main sur ton ventre. Respire lentement pendant une minute.",
      "Étire doucement tes épaules vers l'arrière. Trois fois.",
    ],
  };
  const list = actions[need];
  const idx = blocker === "concentrer" ? 0 : list.length > 1 ? 1 : 0;
  return list[idx] ?? list[0];
}

// ---------- Local persistence (works without account) ----------
export interface CheckinRecord {
  id: string;
  created_at: string;
  mental_load: MentalLoad;
  calm_level: CalmLevel;
  blocker: Blocker;
  immediate_need: Need;
  state_label: StateLabel;
  explanation: string;
  micro_action: string;
  load_score: number;
}

export interface OnboardingPrefs {
  best_moments: string[];
  main_goal: string;
  notifications_enabled: boolean;
  theme: "light" | "dark";
  completed: boolean;
}

const KEYS = {
  prefs: "marge.prefs",
  checkins: "marge.checkins",
  lastResult: "marge.lastResult",
} as const;

export function isBrowser() { return typeof window !== "undefined"; }

export function getPrefs(): OnboardingPrefs {
  if (!isBrowser()) return defaultPrefs();
  try {
    const raw = localStorage.getItem(KEYS.prefs);
    return raw ? { ...defaultPrefs(), ...JSON.parse(raw) } : defaultPrefs();
  } catch { return defaultPrefs(); }
}
export function defaultPrefs(): OnboardingPrefs {
  return { best_moments: [], main_goal: "", notifications_enabled: false, theme: "light", completed: false };
}
export function savePrefs(p: Partial<OnboardingPrefs>) {
  if (!isBrowser()) return;
  const merged = { ...getPrefs(), ...p };
  localStorage.setItem(KEYS.prefs, JSON.stringify(merged));
  applyTheme(merged.theme);
}

export function applyTheme(theme: "light" | "dark") {
  if (!isBrowser()) return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function getCheckins(): CheckinRecord[] {
  if (!isBrowser()) return [];
  try { return JSON.parse(localStorage.getItem(KEYS.checkins) || "[]"); } catch { return []; }
}
export function saveCheckin(c: CheckinRecord) {
  if (!isBrowser()) return;
  const list = [c, ...getCheckins()].slice(0, 200);
  localStorage.setItem(KEYS.checkins, JSON.stringify(list));
  localStorage.setItem(KEYS.lastResult, JSON.stringify(c));
}
export function getLastResult(): CheckinRecord | null {
  if (!isBrowser()) return null;
  try { const raw = localStorage.getItem(KEYS.lastResult); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export function clearAll() {
  if (!isBrowser()) return;
  localStorage.removeItem(KEYS.prefs);
  localStorage.removeItem(KEYS.checkins);
  localStorage.removeItem(KEYS.lastResult);
}

/**
 * Reset every piece of local state to its default — used on logout/wipe so
 * the next user (real or anonymous) doesn't inherit the previous account's
 * theme, moments, notification preferences, or cached checkins.
 */
export function resetLocalStateToDefaults() {
  clearAll();
  applyTheme("light");
}

export function profileProgress(checkinsCount: number, prefsCompleted: boolean): number {
  // 10% for prefs, then +6% per checkin up to 90%, capped at 100%
  let pct = prefsCompleted ? 10 : 0;
  pct += Math.min(checkinsCount * 6, 90);
  return Math.min(pct, 100);
}

export function greetingFor(date = new Date()): string {
  const h = date.getHours();
  if (h < 6) return "Bonne nuit";
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bel après-midi";
  return "Bonsoir";
}

export function weeklyInsights(checkins: CheckinRecord[]): string[] {
  if (checkins.length === 0) {
    return [
      "Pas encore de point cette semaine.",
      "Un seul point suffit déjà pour commencer à voir quelque chose.",
    ];
  }
  if (checkins.length === 1) {
    const c = checkins[0];
    const day = new Date(c.created_at).toLocaleDateString("fr-FR", { weekday: "long" });
    return [
      `Un premier point ${day}. C'est un début, et c'est suffisant.`,
      "Marge commencera à repérer tes rythmes à partir de deux ou trois points.",
    ];
  }
  const out: string[] = [];
  // Time-of-day load
  const buckets = { morning: [] as number[], day: [] as number[], evening: [] as number[] };
  checkins.forEach(c => {
    const h = new Date(c.created_at).getHours();
    if (h < 12) buckets.morning.push(c.load_score);
    else if (h < 18) buckets.day.push(c.load_score);
    else buckets.evening.push(c.load_score);
  });
  const avg = (a: number[]) => a.length ? a.reduce((s, n) => s + n, 0) / a.length : 0;
  const m = avg(buckets.morning), d = avg(buckets.day), e = avg(buckets.evening);
  const max = Math.max(m, d, e);
  if (max > 0) {
    if (max === d) out.push("Tu sembles plus chargé en milieu de journée.");
    else if (max === m) out.push("Les matins semblent un peu plus lourds en ce moment.");
    else out.push("Le soir, tu portes plus que ce que tu crois.");
  }
  // Most common need
  const needs: Record<string, number> = {};
  checkins.forEach(c => { needs[c.immediate_need] = (needs[c.immediate_need] || 0) + 1; });
  const topNeed = Object.entries(needs).sort((a, b) => b[1] - a[1])[0]?.[0] as Need | undefined;
  if (topNeed) {
    const map: Record<Need, string> = {
      souffler: "Souvent, tu cherches juste à souffler.",
      clarifier: "Tu reviens souvent vers le besoin de clarifier.",
      repartir: "Tu cherches souvent un point d'appui pour repartir.",
      couper: "Le soir, tu cherches surtout à couper.",
      calme: "Tu reviens souvent à un besoin de calme.",
    };
    out.push(map[topNeed]);
  }
  // Lightest day, if we have a few points
  if (checkins.length >= 3) {
    const byDay: Record<string, number[]> = {};
    checkins.forEach(c => {
      const k = new Date(c.created_at).toLocaleDateString("fr-FR", { weekday: "long" });
      (byDay[k] ||= []).push(c.load_score);
    });
    const ranked = Object.entries(byDay)
      .map(([k, arr]) => [k, arr.reduce((s, n) => s + n, 0) / arr.length] as const)
      .sort((a, b) => a[1] - b[1]);
    const lightest = ranked[0];
    if (lightest && lightest[1] < 5) {
      out.push(`Le ${lightest[0]} a été ton jour le plus léger.`);
    }
  }
  return out;
}
