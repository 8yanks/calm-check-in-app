import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { getPrefs, savePrefs, applyTheme, defaultPrefs, resetLocalStateToDefaults, type OnboardingPrefs } from "@/lib/marge";
import { supabase } from "@/integrations/supabase/client";
import { useRequireAuth } from "@/hooks/use-auth";
import { track } from "@/lib/analytics";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Réglages — Marge" }] }),
  component: SettingsPage,
});

const moments = [
  { id: "morning", label: "Matin" },
  { id: "day", label: "Journée" },
  { id: "evening", label: "Soir" },
];

function SettingsPage() {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useRequireAuth();
  const [prefs, setPrefs] = useState<OnboardingPrefs>(() => getPrefs());
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [wiping, setWiping] = useState(false);

  // Load prefs from Supabase (source of truth) + auth info
  useEffect(() => {
    if (authLoading || !session) return;
    const load = async () => {
      const [{ data: dbPrefs }, { data: { session: s } }] = await Promise.all([
        supabase.from("onboarding_preferences").select("*").eq("user_id", session.user.id).maybeSingle(),
        supabase.auth.getSession(),
      ]);
      // Real (non-anonymous) users have an email
      setEmail(s?.user.is_anonymous ? null : s?.user.email ?? null);

      if (dbPrefs) {
        const merged: OnboardingPrefs = {
          ...defaultPrefs(),
          best_moments: (dbPrefs.best_moments as string[]) ?? [],
          main_goal: dbPrefs.main_goal ?? "",
          notifications_enabled: !!dbPrefs.notifications_enabled,
          theme: (dbPrefs.theme as "light" | "dark") ?? "light",
          completed: true,
        };
        setPrefs(merged);
        savePrefs(merged); // refresh local cache
        applyTheme(merged.theme);
      } else {
        applyTheme(prefs.theme);
      }
      setReady(true);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, session]);

  if (authLoading || !session || !ready) return <PageShell><div className="h-screen" /></PageShell>;

  const update = (p: Partial<OnboardingPrefs>) => {
    const next = { ...prefs, ...p };
    setPrefs(next);
    savePrefs(p);
    // Mirror to Supabase (best-effort, fire-and-forget).
    // onConflict: "user_id" is REQUIRED — table has PK on `id`, UNIQUE on `user_id`.
    // Without it, PostgREST tries to INSERT and violates the UNIQUE constraint.
    supabase
      .from("onboarding_preferences")
      .upsert({
        user_id: session.user.id,
        best_moments: next.best_moments,
        main_goal: next.main_goal || null,
        notifications_enabled: next.notifications_enabled,
        theme: next.theme,
      }, { onConflict: "user_id" })
      .then(({ error }) => { if (error) console.error("settings sync error:", error); });
  };

  const toggleMoment = (id: string) => {
    update({ best_moments: prefs.best_moments.includes(id) ? prefs.best_moments.filter(x => x !== id) : [...prefs.best_moments, id] });
  };

  const wipe = async () => {
    if (!confirm("Effacer toutes tes données (locales et serveur) ? Cette action est définitive.")) return;
    setWiping(true);
    try {
      // Delete server data first (RLS limits this to the current user's rows)
      const uid = session.user.id;
      await Promise.all([
        supabase.from("checkins").delete().eq("user_id", uid),
        supabase.from("weekly_summaries").delete().eq("user_id", uid),
        supabase.from("profile_progress").delete().eq("user_id", uid),
        supabase.from("onboarding_preferences").delete().eq("user_id", uid),
      ]);
    } catch (err) {
      console.error("wipe server error:", err);
    }
    resetLocalStateToDefaults();
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const signOut = async () => {
    // Track BEFORE signOut so the event still has a session attached.
    await track("user_logged_out", {});
    // Reset local state to defaults so the next user (or anon) doesn't inherit
    // the previous account's theme / moments / notification preferences.
    resetLocalStateToDefaults();
    await supabase.auth.signOut();
    setEmail(null);
    navigate({ to: "/auth" });
  };

  return (
    <PageShell>
      <Link to="/home" className="text-sm text-muted-foreground hover:text-foreground">← Accueil</Link>
      <h1 className="mt-6 font-display text-3xl">Réglages</h1>

      <Section title="Compte">
        {email ? (
          <div className="marge-card p-5 flex items-center justify-between">
            <div>
              <div className="text-sm">Connecté</div>
              <div className="text-xs text-muted-foreground">{email}</div>
            </div>
            <button onClick={signOut} className="text-sm text-muted-foreground hover:text-foreground">Déconnexion</button>
          </div>
        ) : (
          <Link to="/auth" className="marge-card p-5 block hover:border-primary">
            <div className="text-sm">Sauvegarder mes points</div>
            <div className="mt-1 text-xs text-muted-foreground">Crée un compte pour synchroniser tes données entre tes appareils.</div>
          </Link>
        )}
      </Section>

      <Section title="Notifications">
        <Toggle label="Rappels doux" value={prefs.notifications_enabled} onChange={(v) => update({ notifications_enabled: v })} />
      </Section>

      <Section title="Moments préférés">
        <div className="space-y-2">
          {moments.map(m => (
            <button key={m.id} className="marge-choice" data-selected={prefs.best_moments.includes(m.id)} onClick={() => toggleMoment(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Apparence">
        <div className="grid grid-cols-2 gap-3">
          <button className="marge-choice text-center" data-selected={prefs.theme === "light"} onClick={() => update({ theme: "light" })}>Clair</button>
          <button className="marge-choice text-center" data-selected={prefs.theme === "dark"} onClick={() => update({ theme: "dark" })}>Sombre</button>
        </div>
      </Section>

      <Section title="Confidentialité">
        <div className="marge-card p-5 text-sm text-muted-foreground leading-relaxed">
          Tes points sont stockés sur ton compte. Tu peux tout effacer à tout moment.
        </div>
        <button
          onClick={wipe}
          disabled={wiping}
          className="mt-3 w-full rounded-full border border-destructive/40 bg-surface py-3 text-sm text-destructive hover:bg-destructive/5 disabled:opacity-60"
        >
          {wiping ? "Suppression…" : "Supprimer toutes mes données"}
        </button>
      </Section>

      <p className="mt-12 text-center text-xs text-muted-foreground">Marge · v0.1</p>
    </PageShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-8">
      <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className="marge-card p-5 w-full flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <span className={`relative h-6 w-11 rounded-full transition ${value ? "bg-primary" : "bg-muted"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${value ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}
