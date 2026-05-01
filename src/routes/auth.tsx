import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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

  const nextPath = (() => {
    if (typeof window === "undefined") return "/home";
    const p = new URLSearchParams(window.location.search).get("next");
    return p && p.startsWith("/") ? p : "/home";
  })();

  useEffect(() => {
    // If already signed in (including anonymous sessions), get out of the auth screen.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace(nextPath);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) window.location.replace(nextPath);
    });
    return () => sub.subscription.unsubscribe();
  }, [nextPath]);

  /**
   * "Continuer sans compte" — creates an anonymous Supabase session so that
   * useRequireAuth() on /home finds a valid session and doesn't redirect back.
   * onAuthStateChange above handles navigation once the session is established.
   */
  const handleGuestAccess = async () => {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      // onAuthStateChange fires → navigates to nextPath automatically
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
      setLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null); setInfo(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}${nextPath}` },
        });
        if (error) throw error;
        setInfo("Vérifie ta boîte mail pour confirmer ton compte.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: nextPath });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell>
      <button
        onClick={handleGuestAccess}
        disabled={loading}
        className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-60"
      >
        ← Continuer sans compte
      </button>
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

      <button
        onClick={handleGuestAccess}
        disabled={loading}
        className="mt-8 w-full text-center text-sm text-muted-foreground hover:text-foreground disabled:opacity-60"
      >
        Continuer sans compte pour l'instant
      </button>
    </PageShell>
  );
}
