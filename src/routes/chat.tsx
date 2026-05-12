// /chat — "Parler à Marge" (V2.3.3)
//
// Comptes réels uniquement. Anon → /auth?next=/chat.
// Free : 5 messages / 24h. Premium : 50 messages / 30j.
// Safety pre-check + post-check côté serveur (src/lib/agent.ts).

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { PageShell, WideShell } from "@/components/PageShell";
import { MargeWordmark } from "@/components/Logo";
import { useRequireAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { chatTurn, getChatQuota, type ChatQuotaResult } from "@/lib/agent";
import { EmergencyResourcesInline } from "@/components/EmergencyResources";
import { PaywallCard } from "@/components/Paywall";
import { track } from "@/lib/analytics";
import type { Tables } from "@/integrations/supabase/types";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/chat")({
  head: () => ({ meta: [{ title: "Parler à Marge" }] }),
  component: ChatPage,
});

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  safety_flag: string | null;
  pending?: boolean;
};

function ChatPage() {
  const navigate = useNavigate();
  const { session, loading: authLoading, isAnonymous } = useRequireAuth();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [quota, setQuota] = useState<ChatQuotaResult | null>(null);
  const [showResources, setShowResources] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Anon users get redirected to /auth — chat is real-account-only.
  useEffect(() => {
    if (authLoading) return;
    if (!session) return; // useRequireAuth handles the /auth redirect
    if (isAnonymous) {
      // Soft redirect: keep them in-app but route them to /auth with next param.
      if (typeof window !== "undefined") {
        window.location.assign("/auth?next=/chat");
      }
    }
  }, [authLoading, session, isAnonymous]);

  // Load active session + history + quota
  useEffect(() => {
    if (authLoading || !session || isAnonymous) return;
    const load = async () => {
      try {
        track("chat_opened", {});
        // Find most recent open session, or fall back to most recent session
        const { data: openSessions } = await supabase
          .from("chat_sessions")
          .select("*")
          .eq("user_id", session.user.id)
          .is("ended_at", null)
          .order("started_at", { ascending: false })
          .limit(1);

        let activeId: string | null = openSessions?.[0]?.id ?? null;
        if (activeId) {
          const { data: msgs } = await supabase
            .from("chat_messages")
            .select("*")
            .eq("session_id", activeId)
            .order("created_at", { ascending: true });
          setSessionId(activeId);
          setMessages(
            (msgs ?? []).map((m: Tables<"chat_messages">) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              safety_flag: m.safety_flag,
            })),
          );
        }

        // Quota
        const q = await getChatQuota({ data: { access_token: session.access_token } });
        setQuota(q);
      } catch (err) {
        console.error("[chat] load error:", err);
      }
      setReady(true);
    };
    load();
  }, [authLoading, session, isAnonymous]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = async () => {
    if (!session) return;
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setErrorBanner(null);

    // Optimistic UI: show the user message immediately + a placeholder
    const tempUserId = `tmp-u-${Date.now()}`;
    const tempAsstId = `tmp-a-${Date.now()}`;
    setMessages(prev => [
      ...prev,
      { id: tempUserId, role: "user", content: text, safety_flag: null },
      { id: tempAsstId, role: "assistant", content: "", safety_flag: null, pending: true },
    ]);
    setInput("");

    try {
      const result = await chatTurn({
        data: {
          session_id: sessionId,
          message: text,
          access_token: session.access_token,
        },
      });
      track("chat_message_sent", {
        safety_flag: result.safety_flag,
        blocked: result.blocked,
      });
      setSessionId(result.session_id);
      setMessages(prev =>
        prev.map(m =>
          m.id === tempAsstId
            ? {
                id: tempAsstId,
                role: "assistant",
                content: result.reply,
                safety_flag: result.safety_flag,
              }
            : m,
        ),
      );
      setShowResources(prev => prev || result.show_resources);
      setQuota(prev =>
        prev
          ? { ...prev, used: result.quota.used, limit: result.quota.limit, window: result.quota.window }
          : prev,
      );
    } catch (err) {
      // Roll back the placeholder assistant bubble.
      setMessages(prev => prev.filter(m => m.id !== tempAsstId));
      const code = (err as { code?: string; message?: string })?.code
        || (err instanceof Error ? err.message : "");
      // Always log with the resolved code prominently — makes prod
      // debugging trivial via the user's DevTools console.
      console.error(`[chat] send failed — code="${code}"`, err);
      if (code === "CHAT_QUOTA_EXCEEDED") {
        setErrorBanner("quota");
      } else if (code === "REAL_ACCOUNT_REQUIRED") {
        if (typeof window !== "undefined") window.location.assign("/auth?next=/chat");
      } else if (code === "UNAUTHORIZED") {
        if (typeof window !== "undefined") window.location.assign("/auth?next=/chat");
      } else if (code === "AI_KEY_MISSING") {
        setErrorBanner("not_configured");
      } else if (code === "AI_UNAVAILABLE") {
        setErrorBanner("ai_unavailable");
      } else if (code === "MESSAGE_EMPTY") {
        // Silently no-op (UI shouldn't allow this anyway)
      } else {
        setErrorBanner("generic");
      }
    } finally {
      setSending(false);
    }
  };

  const handleNewConversation = async () => {
    if (!session || !sessionId) {
      // No active session — just clear the UI
      setMessages([]);
      setShowResources(false);
      setErrorBanner(null);
      return;
    }
    // End the current session, reset UI to empty
    await supabase
      .from("chat_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", sessionId);
    track("chat_session_ended", { session_id: sessionId });
    setSessionId(null);
    setMessages([]);
    setShowResources(false);
    setErrorBanner(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter to send, Shift+Enter for newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (authLoading || !session) {
    return <PageShell><div className="h-screen" /></PageShell>;
  }
  if (isAnonymous) {
    // Brief flash before redirect — keep clean
    return <PageShell><div className="h-screen" /></PageShell>;
  }
  if (!ready) {
    return <PageShell><div className="h-screen" /></PageShell>;
  }

  const quotaPct = quota ? Math.min(1, quota.used / Math.max(1, quota.limit)) : 0;
  const quotaExhausted = quota ? quota.used >= quota.limit : false;

  return (
    <WideShell>
      {/* ─────────────────────────────────────────  HEADER  ───────────────────────────────────── */}
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Link to="/home" className="text-sm text-muted-foreground hover:text-foreground">
            ← Accueil
          </Link>
          <div className="hidden sm:block">
            <MargeWordmark />
          </div>
        </div>
        <div className="flex items-center gap-3">
          {quota && (
            <div className="text-xs text-muted-foreground tabular-nums">
              {quota.used} / {quota.limit} <span className="text-muted-foreground/70">/ {quota.window}</span>
            </div>
          )}
          <button
            onClick={handleNewConversation}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-xs text-foreground hover:bg-muted transition cursor-pointer"
          >
            <Plus size={12} />
            Nouvelle conversation
          </button>
        </div>
      </header>

      {/* ─────────────────────────────────────────  TITLE  ───────────────────────────────────── */}
      <section className="mt-10 lg:mt-14 max-w-2xl mx-auto">
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground text-center">
          Parler à Marge
        </div>
        <h1 className="mt-3 font-display text-3xl lg:text-4xl leading-[1.1] tracking-tight text-center">
          Quand mettre des mots aide.
        </h1>
        <p className="mt-3 text-sm text-foreground/70 leading-relaxed text-center max-w-md mx-auto">
          Marge n'est pas une thérapeute, et n'en remplace pas une. C'est un endroit
          pour reformuler, comprendre, ou trouver l'action minuscule qui débloque le reste.
        </p>
      </section>

      {/* ─────────────────────────────────────────  MESSAGES  ───────────────────────────────────── */}
      <section
        ref={scrollRef}
        className="mt-10 max-w-2xl mx-auto rounded-3xl border border-border bg-surface min-h-[40vh] max-h-[60vh] overflow-y-auto"
      >
        {messages.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-display text-lg text-foreground/80">Par où veux-tu commencer ?</p>
            <p className="mt-3 text-sm text-foreground/60 leading-relaxed max-w-sm mx-auto">
              Tu peux raconter ce qui se passe en quelques mots. Pas besoin de bien formuler.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {[
                "Je tourne en rond sur un truc.",
                "J'arrive pas à me concentrer.",
                "Je me sens vidé·e ce matin.",
              ].map(suggestion => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  disabled={sending || quotaExhausted}
                  className="rounded-full border border-border bg-background px-4 py-2 text-xs text-foreground/80 hover:border-primary hover:text-foreground transition disabled:opacity-50 cursor-pointer"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-5 lg:p-7 space-y-4">
            {messages.map(m => (
              <Bubble key={m.id} message={m} />
            ))}
          </div>
        )}
      </section>

      {/* ─────────────────────────────────────────  SAFETY RESOURCES  ───────────────────────────────────── */}
      {showResources && (
        <section className="mt-6 max-w-2xl mx-auto">
          <EmergencyResourcesInline />
        </section>
      )}

      {/* ─────────────────────────────────────────  ERRORS / QUOTA  ───────────────────────────────────── */}
      {errorBanner === "ai_unavailable" && (
        <section className="mt-6 max-w-2xl mx-auto marge-card p-4 text-sm text-foreground/80 leading-relaxed">
          Marge n'a pas pu te répondre cette fois. Tu peux réessayer dans un instant.
        </section>
      )}
      {errorBanner === "not_configured" && (
        <section className="mt-6 max-w-2xl mx-auto marge-card p-5 border-primary/30">
          <div className="text-[11px] uppercase tracking-wider text-primary">Configuration en cours</div>
          <p className="mt-2 text-sm text-foreground/80 leading-relaxed">
            Le chat IA n'est pas encore pleinement activé sur cette instance.
            Reviens dans quelques jours, ou écris-moi pour me dire que tu attendais.
          </p>
        </section>
      )}
      {errorBanner === "generic" && (
        <section className="mt-6 max-w-2xl mx-auto marge-card p-4 text-sm text-foreground/80 leading-relaxed">
          Quelque chose s'est mal passé. Tu peux réessayer.
        </section>
      )}
      {(errorBanner === "quota" || quotaExhausted) && quota && (
        <section className="mt-6 max-w-2xl mx-auto">
          {quota.premium ? (
            <div className="marge-card p-5">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Quota mensuel atteint</div>
              <p className="mt-2 text-sm text-foreground/80 leading-relaxed">
                Tu as utilisé tes {quota.limit} messages du mois. Il se renouvelle automatiquement.
              </p>
            </div>
          ) : (
            <PaywallCard feature="chat_full" trigger="chat_quota" />
          )}
        </section>
      )}

      {/* ─────────────────────────────────────────  INPUT  ───────────────────────────────────── */}
      <section className="mt-6 max-w-2xl mx-auto">
        <div className="flex items-end gap-3">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending || quotaExhausted}
            placeholder={
              quotaExhausted
                ? "Quota atteint — Marge revient bientôt."
                : "Écris à Marge…"
            }
            rows={2}
            className="flex-1 rounded-2xl border border-border bg-surface px-5 py-3 text-base text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary resize-none disabled:opacity-60"
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim() || quotaExhausted}
            className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            {sending ? "…" : "Envoyer"}
          </button>
        </div>

        {/* Subtle quota progress bar */}
        {quota && quota.limit > 0 && (
          <div className="mt-3 h-px w-full bg-border overflow-hidden">
            <div
              className={`h-px transition-all duration-500 ${quotaExhausted ? "bg-foreground/30" : "bg-primary"}`}
              style={{ width: `${quotaPct * 100}%` }}
            />
          </div>
        )}
      </section>

      {/* ─────────────────────────────────────────  FOOTER  ───────────────────────────────────── */}
      <footer className="mt-12 max-w-2xl mx-auto text-xs text-muted-foreground italic leading-relaxed">
        Marge n'est pas un dispositif médical. Pour les moments difficiles, des
        {" "}<Link to="/aide" className="text-primary hover:opacity-80">lignes d'écoute</Link>{" "}
        existent — anonymes, gratuites, ouvertes quand tu en as besoin.
      </footer>
    </WideShell>
  );
}

function Bubble({ message }: { message: Msg }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  // assistant
  if (message.pending) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-background border border-border px-4 py-3 text-[15px] text-foreground/60">
          <span className="inline-flex gap-1">
            <span className="animate-pulse">·</span>
            <span className="animate-pulse" style={{ animationDelay: "0.15s" }}>·</span>
            <span className="animate-pulse" style={{ animationDelay: "0.3s" }}>·</span>
          </span>
        </div>
      </div>
    );
  }

  const safetyClass =
    message.safety_flag === "urgent" || message.safety_flag === "elevated"
      ? "border-primary/40 bg-primary/5"
      : "border-border bg-background";

  return (
    <div className="flex justify-start">
      <div className={`max-w-[80%] rounded-2xl rounded-bl-sm border px-4 py-3 text-[15px] leading-relaxed text-foreground whitespace-pre-wrap ${safetyClass}`}>
        {message.content}
      </div>
    </div>
  );
}
