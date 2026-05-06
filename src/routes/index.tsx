import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { WideShell } from "@/components/PageShell";
import { MargeMark, MargeWordmark } from "@/components/Logo";
import { applyTheme } from "@/lib/marge";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics";

export const Route = createFileRoute("/")({
  component: Welcome,
});

function Welcome() {
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Auto-redirect if already authenticated
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setChecking(false); return; }
        applyTheme("light");
        const { data } = await supabase
          .from("onboarding_preferences")
          .select("user_id")
          .eq("user_id", session.user.id)
          .maybeSingle();
        navigate({ to: data ? "/home" : "/onboarding" });
      } catch (err) {
        console.error("landing session check failed:", err);
        setChecking(false);
      }
    })();
  }, [navigate]);

  /**
   * Primary CTA: starts an anonymous Supabase session and routes to onboarding.
   * Preserved from MVP — DO NOT replace with /auth redirect, the anonymous flow
   * is core to the "first quiz free" UX and is wired across the app.
   *
   * The `intent` controls where the user lands AFTER any required onboarding:
   *  - "checkin"     → /home (then they tap "Faire un point")
   *  - "diagnostic"  → /diagnostic
   *  - "chat"        → /home (chat is V2.3, fall back to home for now)
   */
  const handleStart = async (intent: "checkin" | "diagnostic" | "chat" = "checkin") => {
    setStarting(true);
    track("landing_cta_clicked", { intent });
    // Map intent to a post-onboarding destination. Chat is real-account-only,
    // so for anon users we route via /chat which will hard-redirect to
    // /auth?next=/chat. This keeps the intent stable across the onboarding
    // hand-off and the eventual signup conversion.
    const destination =
      intent === "diagnostic" ? "/diagnostic"
      : intent === "chat" ? "/chat"
      : "/home";
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data } = await supabase
          .from("onboarding_preferences")
          .select("user_id")
          .eq("user_id", session.user.id)
          .maybeSingle();
        // If the user has done onboarding, jump straight to their destination.
        // Otherwise, they need onboarding first and we hand off via ?next=.
        if (data) {
          if (destination === "/diagnostic") navigate({ to: "/diagnostic" });
          else if (destination === "/chat") navigate({ to: "/chat" });
          else navigate({ to: "/home" });
        } else {
          navigate({ to: "/onboarding", search: { next: destination } });
        }
        return;
      }
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      track("anonymous_session_started", { from: "landing", intent });
      navigate({ to: "/onboarding", search: { next: destination } });
    } catch (err) {
      console.error("handleStart error:", err);
      setStarting(false);
      navigate({ to: "/auth" });
    }
  };

  if (checking) return <WideShell><div className="h-screen" /></WideShell>;

  return (
    <WideShell>
      {/* ─────────────────────────────────────────  TOP BAR  ───────────────────────────────────── */}
      <header className="flex items-center justify-between">
        <MargeWordmark />
        <nav className="flex items-center gap-5 text-sm">
          <Link to="/library" className="text-foreground/70 hover:text-foreground transition hidden sm:inline">
            Bibliothèque
          </Link>
          <Link to="/about" className="text-foreground/70 hover:text-foreground transition">
            À propos
          </Link>
          <Link to="/auth" className="text-foreground/70 hover:text-foreground transition hidden sm:inline">
            Se connecter
          </Link>
        </nav>
      </header>

      {/* ─────────────────────────────────────────  HERO  ───────────────────────────────────── */}
      <section className="mt-10 lg:mt-20 lg:grid lg:grid-cols-12 lg:gap-12 lg:items-start">
        <div className="lg:col-span-7 max-w-2xl animate-in fade-in slide-in-from-bottom-3 duration-700">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Compagne calme du quotidien
          </div>
          <h1 className="mt-6 font-display text-5xl lg:text-7xl leading-[1.05] tracking-tight text-foreground">
            Moins de friction.<br />
            <span className="text-primary">Plus de marge.</span>
          </h1>
          <p className="mt-6 lg:mt-8 text-base lg:text-lg leading-relaxed text-foreground/75 max-w-md">
            Marge t'aide à comprendre ce qui te pèse aujourd'hui — et te propose
            une action utile, faisable tout de suite. En une minute. Sans compte
            à créer pour commencer.
          </p>

          {/* Primary CTA */}
          <div className="mt-10 flex items-center gap-4">
            <button
              onClick={() => handleStart("checkin")}
              disabled={starting}
              className="rounded-full bg-primary px-7 py-4 text-base font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60 cursor-pointer shadow-sm"
            >
              {starting ? "…" : "Commencer maintenant"}
            </button>
            <Link to="/library" className="text-sm text-foreground/70 hover:text-foreground transition px-2 py-2">
              Voir la bibliothèque →
            </Link>
          </div>

          {/* Quick stats */}
          <div className="mt-12 lg:mt-16 grid grid-cols-3 gap-6 max-w-lg border-t border-border pt-8">
            {[
              { n: "1 min", t: "pour faire un point" },
              { n: "30–90 s", t: "pour l'action proposée" },
              { n: "0", t: "notification inutile" },
            ].map((x) => (
              <div key={x.t}>
                <div className="font-display text-xl lg:text-2xl text-foreground">{x.n}</div>
                <div className="mt-1 text-xs text-muted-foreground leading-snug">{x.t}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right-side mock preview */}
        <div className="hidden lg:block lg:col-span-5 mt-12 lg:mt-0">
          <div className="relative">
            <div className="absolute -inset-6 rounded-[2.5rem] bg-primary-soft/40 blur-2xl opacity-60" aria-hidden />
            <div className="relative marge-card p-8 animate-in fade-in slide-in-from-right-4 duration-700">
              <div className="flex items-center justify-between">
                <MargeMark size={36} />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Aperçu</span>
              </div>
              <div className="mt-8">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Ton état</div>
                <div className="mt-2 inline-flex items-center rounded-full px-3 py-1.5 bg-primary-soft">
                  <span className="font-display text-base capitalize text-accent-foreground">chargé</span>
                </div>
                <h3 className="mt-5 font-display text-2xl leading-snug">
                  Tu sembles surtout encombré mentalement.
                </h3>
              </div>
              <div className="mt-6 rounded-2xl border border-border bg-background/60 p-5">
                <div className="text-[10px] uppercase tracking-wider text-primary">Action utile · 60 s</div>
                <p className="mt-2 text-sm leading-relaxed text-foreground/85">
                  Sors trois choses de ta tête sur papier. Pas plus.
                </p>
              </div>
              <div className="mt-6">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Profil en construction</span>
                  <span className="text-muted-foreground">34%</span>
                </div>
                <div className="mt-2 h-1 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: "34%" }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────  3 PORTES D'ENTRÉE  ───────────────────────────────────── */}
      <section id="modes" className="mt-24 lg:mt-32">
        <SectionHeader eyebrow="Trois entrées" title="Selon le temps que tu as." />

        <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-5">
          <ModeCard
            badge="1 min"
            title="Check-in express"
            description="Quatre questions simples. Une lecture immédiate. Une micro-action faisable tout de suite."
            cta={{ label: "Faire un point", onClick: () => handleStart("checkin") }}
            available
          />
          <ModeCard
            badge="8–12 min"
            title="Diagnostic complet"
            description="Un parcours plus profond pour situer ton stress, ton énergie, ton sommeil. Profil synthétique et zones de vigilance."
            cta={{ label: "Faire le diagnostic", onClick: () => handleStart("diagnostic") }}
            available
          />
          <ModeCard
            badge="Conversation"
            title="Parler à Marge"
            description="Une discussion guidée pour reformuler, comprendre, ou trouver l'action minuscule qui débloque le reste."
            cta={{ label: "Démarrer une conversation", onClick: () => handleStart("chat") }}
            available
          />
        </div>
      </section>

      {/* ─────────────────────────────────────────  COMMENT ÇA MARCHE  ───────────────────────────────────── */}
      <section id="how" className="mt-24 lg:mt-32">
        <SectionHeader eyebrow="Comment ça marche" title="Quatre questions. Une réponse utile." />

        <div className="mt-12 grid grid-cols-1 lg:grid-cols-3 gap-10 lg:gap-12">
          <Step n="01" title="Tu réponds" body="Quatre questions sur ce qui se passe maintenant : charge, calme, blocage, besoin. Pas de jugement, pas de score à viser." />
          <Step n="02" title="Marge lit" body="Une analyse calme de ton état là, maintenant. Pas un diagnostic. Une lecture humaine, mise en mots." />
          <Step n="03" title="Tu agis" body="Une action courte, 30 à 90 secondes. Faisable tout de suite, là où tu es. Tu n'as pas besoin d'organiser ta vie pour la faire." />
        </div>
      </section>

      {/* ─────────────────────────────────────────  CE QUE MARGE REPÈRE  ───────────────────────────────────── */}
      <section id="what" className="mt-24 lg:mt-32">
        <SectionHeader eyebrow="Ce que Marge t'aide à comprendre" title="Repérer avant que ça déborde." />

        <div className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10 max-w-5xl">
          {[
            { t: "La charge mentale", d: "Pourquoi ta tête tourne même quand tu ne fais rien. Ce qui occupe la mémoire de travail sans que tu t'en rendes compte." },
            { t: "La rumination", d: "Différencier réfléchir et tourner en boucle. Trouver les leviers concrets pour sortir d'un cycle qui ne mène nulle part." },
            { t: "La fatigue décisionnelle", d: "Pourquoi le soir tu n'as plus envie de rien — alors que rien n'est plus dur. Comment l'anticiper, comment la diluer." },
            { t: "Tes signaux faibles", d: "Les six signaux que ton corps envoie avant la saturation. Apprendre à les nommer plutôt que de les ignorer." },
            { t: "Ce qui t'aide vraiment", d: "Au fil de tes points, Marge repère ce qui te fait du bien et ce qui ne fait que prendre du temps." },
            { t: "Tes rythmes", d: "Tes pics, tes creux, tes moments stables. Pas pour les optimiser. Pour les reconnaître." },
          ].map((x) => (
            <div key={x.t}>
              <h3 className="font-display text-xl lg:text-2xl text-foreground">{x.t}</h3>
              <p className="mt-2 text-foreground/70 leading-relaxed text-[15px]">{x.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─────────────────────────────────────────  APERÇU BILAN HEBDO  ───────────────────────────────────── */}
      <section id="weekly" className="mt-24 lg:mt-32">
        <div className="lg:grid lg:grid-cols-12 lg:gap-12 items-center">
          <div className="lg:col-span-5">
            <SectionHeader eyebrow="Chaque semaine" title="Un vrai bilan, pas un score." />
            <p className="mt-6 text-foreground/75 leading-relaxed text-[17px] max-w-md">
              À la fin de la semaine, Marge te propose une lecture synthétique :
              ce qui a pesé, ce qui a allégé, ce qui revient. Pas de classement,
              pas de récompense. Juste un point d'appui pour la semaine suivante.
            </p>
            <p className="mt-4 text-sm text-muted-foreground italic max-w-md">
              Disponible dès quelques points dans la semaine.
            </p>
          </div>

          <div className="lg:col-span-7 mt-10 lg:mt-0">
            <WeeklyMock />
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────  SUR QUOI C'EST BASÉ  ───────────────────────────────────── */}
      <section id="basis" className="mt-24 lg:mt-32">
        <SectionHeader eyebrow="Sur quoi c'est basé" title="Des références sérieuses, pas un produit médical." />

        <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <BasisCard
            title="Régulation physiologique"
            body="Cohérence cardiaque, ancrage sensoriel, auto-apaisement somatique — des techniques validées pour passer rapidement d'un état d'alerte à un état de repos."
          />
          <BasisCard
            title="Sciences cognitives"
            body="Effet Zeigarnik, charge mentale, fatigue décisionnelle, fenêtre de tolérance — des cadres lus en littérature pour comprendre ce qui se passe vraiment."
          />
          <BasisCard
            title="Design comportemental"
            body="Une app qui réduit la friction d'usage avant la profondeur. Optimisée pour être ouverte quand tu en as besoin, pas pour t'occuper."
          />
        </div>

        <p className="mt-10 text-sm text-muted-foreground max-w-2xl">
          Marge n'est pas un dispositif médical et ne remplace pas un suivi
          psychologique. Si tu traverses une période difficile, parler à un
          professionnel reste la meilleure démarche.
        </p>
      </section>

      {/* ─────────────────────────────────────────  CONFIDENTIALITÉ  ───────────────────────────────────── */}
      <section id="privacy" className="mt-24 lg:mt-32">
        <SectionHeader eyebrow="Confidentialité" title="Ce qui te concerne ne sort pas d'ici." />

        <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-5xl">
          <PrivacyCard title="Pas de compte requis" body="Tu peux utiliser Marge en invité dès la première seconde. Aucun nom, aucune adresse à fournir pour commencer." />
          <PrivacyCard title="Stockage chiffré" body="Tes points sont stockés sur Supabase avec chiffrement côté serveur. Personne d'autre ne peut les lire." />
          <PrivacyCard title="Aucun partage tiers" body="Marge ne vend, ne partage et ne croise jamais tes données. Pas de pixel publicitaire, pas de tracker tiers." />
        </div>
      </section>

      {/* ─────────────────────────────────────────  CTA FINAL  ───────────────────────────────────── */}
      <section className="mt-24 lg:mt-32">
        <div className="marge-card p-8 lg:p-14 text-center max-w-3xl mx-auto border-primary/30">
          <div className="text-xs uppercase tracking-[0.18em] text-primary">Prêt&nbsp;?</div>
          <h2 className="mt-4 font-display text-3xl lg:text-5xl leading-[1.05] tracking-tight">
            Une minute suffit.
          </h2>
          <p className="mt-5 text-foreground/70 leading-relaxed max-w-md mx-auto">
            Pas de compte à créer, pas de carte à entrer. Juste un endroit calme
            pour faire un point, là, maintenant.
          </p>
          <button
            onClick={() => handleStart("checkin")}
            disabled={starting}
            className="mt-8 rounded-full bg-primary px-8 py-4 text-base font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60 cursor-pointer shadow-sm"
          >
            {starting ? "…" : "Faire un point maintenant"}
          </button>
        </div>
      </section>

      {/* ─────────────────────────────────────────  FOOTER  ───────────────────────────────────── */}
      <footer className="mt-20 lg:mt-24 pt-8 border-t border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <MargeMark size={20} />
          <span>© Marge — Compagne calme du quotidien.</span>
        </div>
        <div className="flex items-center gap-5">
          <Link to="/about" className="hover:text-foreground transition">À propos</Link>
          <Link to="/library" className="hover:text-foreground transition">Bibliothèque</Link>
          <Link to="/aide" className="hover:text-foreground transition">Aide d'urgence</Link>
          <Link to="/auth" className="hover:text-foreground transition">Se connecter</Link>
        </div>
      </footer>
    </WideShell>
  );
}

// ─────────────────────────────────────────  SHARED COMPONENTS  ─────────────────────────────────────────

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</div>
      <h2 className="mt-4 font-display text-3xl lg:text-5xl leading-[1.05] tracking-tight max-w-3xl">
        {title}
      </h2>
    </div>
  );
}

function ModeCard({
  badge, title, description, cta, available,
}: {
  badge: string;
  title: string;
  description: string;
  cta: { label: string; onClick?: () => void; disabled?: boolean };
  available?: boolean;
}) {
  const baseClass = "marge-card p-7 flex flex-col h-full";
  const interactiveClass = available
    ? "hover:border-primary cursor-pointer transition"
    : "opacity-60";
  return (
    <div className={`${baseClass} ${interactiveClass}`}>
      <div className="text-[11px] uppercase tracking-wider text-primary">{badge}</div>
      <h3 className="mt-3 font-display text-2xl leading-snug">{title}</h3>
      <p className="mt-3 text-sm text-foreground/70 leading-relaxed flex-1">{description}</p>
      <button
        onClick={cta.onClick}
        disabled={cta.disabled}
        className={`mt-6 self-start rounded-full px-5 py-2.5 text-sm transition cursor-pointer ${
          available
            ? "bg-primary text-primary-foreground hover:opacity-90"
            : "border border-border bg-surface text-muted-foreground cursor-not-allowed"
        }`}
      >
        {cta.label}
      </button>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div>
      <div className="text-[11px] tabular-nums tracking-[0.16em] text-primary">{n}</div>
      <h3 className="mt-3 font-display text-2xl leading-snug">{title}</h3>
      <p className="mt-3 text-foreground/70 leading-relaxed text-[15px]">{body}</p>
    </div>
  );
}

function BasisCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="marge-card p-6">
      <h3 className="font-display text-xl">{title}</h3>
      <p className="mt-3 text-sm text-foreground/70 leading-relaxed">{body}</p>
    </div>
  );
}

function PrivacyCard({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="font-display text-lg text-foreground">{title}</h3>
      <p className="mt-2 text-sm text-foreground/70 leading-relaxed">{body}</p>
    </div>
  );
}

/**
 * A small mock of the weekly review with a fake trend curve and 3 insight bullets.
 * Static SVG, no data dependency. Just enough to suggest the format.
 */
function WeeklyMock() {
  return (
    <div className="marge-card p-7 lg:p-8">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Aperçu — semaine</div>
          <div className="mt-2 font-display text-2xl">Ta charge ressentie</div>
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">0 — 10</div>
      </div>
      <div className="mt-6">
        <svg viewBox="0 0 700 160" className="w-full h-32">
          <defs>
            <linearGradient id="mockArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1="20" y1="135" x2="680" y2="135" stroke="var(--color-border)" strokeWidth="1" />
          <path
            d="M 28 90 C 100 60, 160 100, 220 70 S 380 130, 460 80 S 600 50, 672 65 L 672 135 L 28 135 Z"
            fill="url(#mockArea)"
          />
          <path
            d="M 28 90 C 100 60, 160 100, 220 70 S 380 130, 460 80 S 600 50, 672 65"
            fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          />
          {[28, 138, 248, 358, 468, 578, 672].map((x, i) => (
            <circle key={i} cx={x} cy={[90, 80, 78, 95, 82, 70, 65][i]} r="4" fill="var(--color-background)" stroke="var(--color-primary)" strokeWidth="1.75" />
          ))}
          {["lun", "mar", "mer", "jeu", "ven", "sam", "dim"].map((d, i) => (
            <text key={d} x={[28, 138, 248, 358, 468, 578, 672][i]} y="155" textAnchor="middle" fontSize="11" fill="var(--color-muted-foreground)">{d}</text>
          ))}
        </svg>
      </div>
      <ul className="mt-6 space-y-3 text-sm text-foreground/85 leading-relaxed">
        <li className="flex gap-3"><span className="mt-2 h-1 w-1 rounded-full bg-primary shrink-0" />Tu sembles plus chargé en milieu de journée.</li>
        <li className="flex gap-3"><span className="mt-2 h-1 w-1 rounded-full bg-primary shrink-0" />Souvent, tu cherches juste à souffler.</li>
        <li className="flex gap-3"><span className="mt-2 h-1 w-1 rounded-full bg-primary shrink-0" />Le jeudi a été ton jour le plus léger.</li>
      </ul>
    </div>
  );
}
