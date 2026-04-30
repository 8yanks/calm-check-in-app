import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/PageShell";
import { MargeMark } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Mon compte — Marge" }] }),
  component: Auth,
});

function Auth() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null); setInfo(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/home` },
        });
        if (error) throw error;
        setInfo("Vérifie ta boîte mail pour confirmer ton compte.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/home" });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell>
      <Link to="/home" className="text-sm text-muted-foreground hover:text-foreground">← Continuer sans compte</Link>
      <div className="mt-12 text-center">
        <MargeMark size={56} />
      </div>
      <h1 className="mt-6 font-display text-3xl text-center">
        {mode === "signin" ? "Bon retour" : "Créer un compte"}
      </h1>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        Pour retrouver tes points sur tous tes appareils.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-3">
        <input
          type="email" required value={email} onChange={e => setEmail(e.target.value)}
          placeholder="Adresse email"
          className="w-full rounded-2xl border border-border bg-surface px-5 py-4 text-base outline-none focus:border-primary"
        />
        <input
          type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)}
          placeholder="Mot de passe"
          className="w-full rounded-2xl border border-border bg-surface px-5 py-4 text-base outline-none focus:border-primary"
        />
        {error && <div className="text-sm text-destructive px-1">{error}</div>}
        {info && <div className="text-sm text-primary px-1">{info}</div>}
        <button type="submit" disabled={loading}
          className="w-full rounded-full bg-primary py-4 text-base text-primary-foreground hover:opacity-90 disabled:opacity-60">
          {loading ? "…" : mode === "signin" ? "Se connecter" : "Créer mon compte"}
        </button>
      </form>

      <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        className="mt-6 w-full text-center text-sm text-muted-foreground hover:text-foreground">
        {mode === "signin" ? "Pas encore de compte ? Créer un compte" : "J'ai déjà un compte"}
      </button>

      <Link to="/home" className="mt-8 block text-center text-sm text-muted-foreground hover:text-foreground">
        Continuer sans compte pour l'instant
      </Link>
    </PageShell>
  );
}
