// Marge — Emergency / crisis resources component (V2.3.2)
//
// Toujours-disponible. Jamais paywallé. Calme, factuel, sans urgence
// fabriquée. Affichage indépendant de la safety detection : la safety layer
// PEUT le déclencher (level urgent), mais l'utilisateur doit aussi pouvoir
// y accéder de lui-même via les liens "Aide" en footer.
//
// Trois composants exportés :
//   - <EmergencyResources>      : carte complète (utilisée dans page dédiée)
//   - <EmergencyResourcesInline>: variante compacte (à embed dans chat / safety alert)
//   - <EmergencyLink>           : lien discret pour footer (vers la page /aide)

import { Link } from "@tanstack/react-router";

interface Resource {
  name: string;
  phone: string;
  /** Pretty form for tel: link (no spaces). */
  phone_tel: string;
  description: string;
  hours: string;
}

const FR_RESOURCES: Resource[] = [
  {
    name: "SAMU",
    phone: "15",
    phone_tel: "15",
    description: "Urgence médicale immédiate. Si tu te sens en danger ou pour un proche en danger.",
    hours: "24h/24, 7j/7 — gratuit",
  },
  {
    name: "3114",
    phone: "3114",
    phone_tel: "3114",
    description: "Numéro national de prévention du suicide. Anonyme, gratuit, écoute par des professionnel·le·s formé·e·s.",
    hours: "24h/24, 7j/7 — gratuit",
  },
  {
    name: "SOS Amitié",
    phone: "09 72 39 40 50",
    phone_tel: "0972394050",
    description: "Ligne d'écoute généraliste. Quand on a besoin de parler, sans urgence forcément, juste pour ne pas être seul·e.",
    hours: "24h/24, 7j/7 — anonyme",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Full card — typically used on a dedicated /aide page or in a safety modal
// ─────────────────────────────────────────────────────────────────────────────

export function EmergencyResources({ heading = true }: { heading?: boolean }) {
  return (
    <section className="space-y-5">
      {heading && (
        <header>
          <div className="text-[11px] uppercase tracking-[0.18em] text-primary">
            Ressources d'aide
          </div>
          <h2 className="mt-3 font-display text-2xl lg:text-3xl leading-snug">
            Quand quelqu'un d'autre a besoin de te répondre.
          </h2>
          <p className="mt-3 text-sm text-foreground/70 leading-relaxed max-w-xl">
            Marge n'est pas un substitut à un soutien humain. Si tu traverses un moment
            difficile, ces lignes sont là pour ça — anonymes, gratuites, sans jugement.
          </p>
        </header>
      )}

      <div className="space-y-3">
        {FR_RESOURCES.map((r) => (
          <ResourceCard key={r.name} resource={r} />
        ))}
      </div>

      <p className="text-xs text-muted-foreground italic max-w-xl">
        En dehors de la France, les équivalents locaux existent — ne reste pas seul·e
        avec ce que tu portes.
      </p>
    </section>
  );
}

function ResourceCard({ resource }: { resource: Resource }) {
  return (
    <a
      href={`tel:${resource.phone_tel}`}
      className="marge-card block p-5 lg:p-6 hover:border-primary transition group"
    >
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {resource.name}
          </div>
          <div className="mt-1.5 font-display text-2xl lg:text-3xl tabular-nums tracking-tight group-hover:text-primary transition">
            {resource.phone}
          </div>
        </div>
        <div className="text-[11px] text-muted-foreground text-right shrink-0 leading-relaxed max-w-[180px]">
          {resource.hours}
        </div>
      </div>
      <p className="mt-3 text-sm text-foreground/75 leading-relaxed">
        {resource.description}
      </p>
    </a>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline variant — compact, used inside a safety alert or chat warning
// ─────────────────────────────────────────────────────────────────────────────

export function EmergencyResourcesInline() {
  return (
    <div className="marge-card p-5 border-primary/40 space-y-3">
      <div className="text-[11px] uppercase tracking-wider text-primary">
        Tu peux parler à quelqu'un, maintenant
      </div>
      <ul className="space-y-2 text-sm">
        {FR_RESOURCES.map((r) => (
          <li key={r.name} className="flex items-baseline justify-between gap-3">
            <a
              href={`tel:${r.phone_tel}`}
              className="text-foreground hover:text-primary transition"
            >
              <span className="font-medium">{r.name}</span>
              <span className="ml-2 tabular-nums text-primary">{r.phone}</span>
            </a>
            <span className="text-[11px] text-muted-foreground text-right shrink-0">
              {r.hours.split("—")[0].trim()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Discreet footer link — drops the user on /aide
// ─────────────────────────────────────────────────────────────────────────────

export function EmergencyLink({ className = "" }: { className?: string }) {
  return (
    <Link
      to="/aide"
      className={`text-muted-foreground hover:text-foreground transition ${className}`}
    >
      Aide d'urgence
    </Link>
  );
}
