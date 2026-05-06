import { createFileRoute, Link } from "@tanstack/react-router";
import { WideShell } from "@/components/PageShell";
import { MargeWordmark } from "@/components/Logo";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "À propos — Marge" },
      { name: "description", content: "Marge est une compagne calme pour réduire la friction du quotidien." },
    ],
  }),
  component: About,
});

function About() {
  return (
    <WideShell>
      <header className="flex items-center justify-between">
        <Link to="/"><MargeWordmark /></Link>
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Retour</Link>
      </header>

      {/* MOBILE */}
      <div className="lg:hidden">
        <h1 className="mt-10 font-display text-3xl">À propos de Marge</h1>
        <div className="mt-6 space-y-5 text-foreground/85 leading-relaxed">
          <p>Marge n'est pas une app de méditation, ni un dashboard de productivité.</p>
          <p>C'est une compagne calme qui t'aide à <strong>repérer ce qui te pèse</strong> et à <strong>agir tout de suite</strong>, en moins d'une minute.</p>
          <p>Au fil de tes points, Marge apprend tes rythmes — sans jugement, sans bruit visuel, sans gamification.</p>
        </div>
        <Link to="/onboarding" className="mt-10 block w-full rounded-full bg-primary py-4 text-center text-primary-foreground hover:opacity-90">
          Commencer
        </Link>
      </div>

      {/* DESKTOP — editorial */}
      <article className="hidden lg:block mt-20">
        <div className="grid grid-cols-12 gap-12 items-start">
          <div className="col-span-4">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Manifeste</div>
            <h1 className="mt-4 font-display text-5xl leading-[1.05] tracking-tight">
              À propos<br />de Marge.
            </h1>
            <p className="mt-6 text-sm text-muted-foreground leading-relaxed max-w-[28ch]">
              Une compagne calme pour réduire la friction du quotidien.
            </p>
          </div>

          <div className="col-span-7 col-start-6 max-w-[58ch] space-y-8 text-lg leading-relaxed text-foreground/85">
            <p className="font-display text-2xl text-foreground leading-snug">
              Marge n'est pas une app de méditation, ni un dashboard de productivité.
            </p>
            <p>
              C'est une compagne calme qui t'aide à <em className="text-primary not-italic">repérer ce qui te pèse</em>
              {" "}et à <em className="text-primary not-italic">agir tout de suite</em>, en moins d'une minute.
            </p>
            <p>
              Au fil de tes points, Marge apprend tes rythmes — sans jugement, sans bruit visuel,
              sans gamification, sans notification inutile.
            </p>
          </div>
        </div>

        <div className="mt-24 grid grid-cols-12 gap-12">
          <div className="col-span-4 col-start-6">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Trois principes</div>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-12 gap-6">
          {[
            { t: "Calme avant tout", d: "Une interface qui respire. Aucune alerte rouge, aucune urgence fabriquée." },
            { t: "Utile, tout de suite", d: "Une action en 30 à 90 secondes. Pas un programme, pas une routine." },
            { t: "Ton rythme, pas le nôtre", d: "Marge t'écoute. Elle ne te pousse pas, elle ne te note pas." },
          ].map((p) => (
            <div key={p.t} className="col-span-4 marge-card p-7">
              <div className="font-display text-xl text-foreground">{p.t}</div>
              <p className="mt-3 text-sm text-foreground/70 leading-relaxed">{p.d}</p>
            </div>
          ))}
        </div>

        <div className="mt-20 flex items-center gap-6">
          <Link to="/onboarding" className="rounded-full bg-primary px-8 py-4 text-base font-medium text-primary-foreground hover:opacity-90">
            Commencer
          </Link>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">Retour à l'accueil</Link>
        </div>

        <div className="mt-16 pt-8 border-t border-border text-xs text-muted-foreground">
          <p className="leading-relaxed max-w-xl">
            Marge n'est pas un dispositif médical et ne remplace pas un suivi
            psychologique. Si tu traverses un moment difficile,{" "}
            <Link to="/aide" className="text-primary hover:opacity-80">des lignes d'écoute existent</Link>
            {" "}— anonymes, gratuites, ouvertes quand tu en as besoin.
          </p>
        </div>
      </article>
    </WideShell>
  );
}
