// /aide — page dédiée aux ressources d'aide humaine.
//
// Toujours-disponible, indexée, accessible sans compte. Volontairement
// éditoriale et calme : pas de sirène, pas d'alerte, juste un endroit où
// retrouver les bonnes lignes quand on en a besoin.

import { createFileRoute, Link } from "@tanstack/react-router";
import { WideShell } from "@/components/PageShell";
import { MargeMark, MargeWordmark } from "@/components/Logo";
import { EmergencyResources } from "@/components/EmergencyResources";

export const Route = createFileRoute("/aide")({
  head: () => ({
    meta: [
      { title: "Aide — Ressources d'écoute" },
      {
        name: "description",
        content:
          "Numéros d'écoute et lignes d'urgence en France. Marge ne remplace pas un soutien humain — voici les ressources à appeler si tu en as besoin.",
      },
    ],
  }),
  component: AidePage,
});

function AidePage() {
  return (
    <WideShell>
      <header className="flex items-center justify-between">
        <Link to="/"><MargeWordmark /></Link>
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Accueil
        </Link>
      </header>

      <article className="mt-12 lg:mt-20 max-w-2xl">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Aide</div>
        <h1 className="mt-4 font-display text-4xl lg:text-5xl leading-[1.05] tracking-tight">
          Quand tu as besoin de quelqu'un.
        </h1>
        <p className="mt-6 text-lg text-foreground/75 leading-relaxed">
          Marge est une compagne calme du quotidien — pas un dispositif de soin.
          Si tu traverses un moment difficile, parler à un·e humain·e fait souvent
          une vraie différence. Voici des lignes anonymes, gratuites, ouvertes
          quand tu en as besoin.
        </p>

        <div className="mt-12">
          <EmergencyResources heading={false} />
        </div>

        <div className="mt-16 marge-card p-6 lg:p-7">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Si tu accompagnes quelqu'un
          </div>
          <p className="mt-3 text-foreground/85 leading-relaxed">
            Si une personne autour de toi traverse une période difficile, les
            mêmes lignes peuvent t'aider à savoir comment l'écouter, quoi dire,
            quand orienter. Tu n'as pas besoin d'avoir les bons mots avant
            d'appeler.
          </p>
        </div>

        <div className="mt-12 text-sm text-foreground/70 leading-relaxed">
          <p>
            Marge est conçue pour les moments du quotidien où on a besoin de
            poser. Pour tout ce qui dépasse — détresse forte, idées noires,
            sentiment de danger — ces ressources sont la bonne porte.
          </p>
          <p className="mt-4 italic text-muted-foreground">
            Si tu te sens en danger immédiat ou si tu accompagnes une personne
            en danger, appelle le 15.
          </p>
        </div>
      </article>

      <footer className="mt-20 lg:mt-24 pt-8 border-t border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <MargeMark size={20} />
          <span>© Marge — Compagne calme du quotidien.</span>
        </div>
        <div className="flex items-center gap-5">
          <Link to="/about" className="hover:text-foreground">À propos</Link>
          <Link to="/library" className="hover:text-foreground">Bibliothèque</Link>
          <Link to="/pricing" className="hover:text-foreground">Tarifs</Link>
        </div>
      </footer>
    </WideShell>
  );
}
