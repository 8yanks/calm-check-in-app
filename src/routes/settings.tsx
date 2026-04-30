import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { getPrefs, savePrefs, clearAll, applyTheme } from "@/lib/marge";
import { supabase } from "@/integrations/supabase/client";

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
  const [prefs, setPrefs] = useState(() => getPrefs());
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    applyTheme(prefs.theme);
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
  }, [prefs.theme]);

  const update = (p: Partial<typeof prefs>) => {
    const next = { ...prefs, ...p };
    setPrefs(next);
    savePrefs(p);
  };

  const toggleMoment = (id: string) => {
    update({ best_moments: prefs.best_moments.includes(id) ? prefs.best_moments.filter(x => x !== id) : [...prefs.best_moments, id] });
  };

  const wipe = () => {
    if (!confirm("Effacer toutes tes données locales ? Cette action est définitive.")) return;
    clearAll();
    navigate({ to: "/" });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setEmail(null);
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
          Tes points restent sur ton appareil tant que tu ne crées pas de compte. Marge ne partage rien.
        </div>
        <button onClick={wipe} className="mt-3 w-full rounded-full border border-destructive/40 bg-surface py-3 text-sm text-destructive hover:bg-destructive/5">
          Supprimer toutes mes données
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
