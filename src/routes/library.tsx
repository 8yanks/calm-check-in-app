import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { WideShell } from "@/components/PageShell";
import { MargeWordmark } from "@/components/Logo";
import {
  listContents,
  CATEGORIES,
  DURATION_BUCKETS,
  type ContentItem,
  type Category,
  type DurationBucket,
} from "@/lib/content";

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "Bibliothèque — Marge" },
      {
        name: "description",
        content:
          "Exercices courts et mini-guides pour comprendre ce qui se passe et faire un pas. Respiration, recentrage, surcharge, sommeil, énergie.",
      },
    ],
  }),
  component: Library,
});

function Library() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<Category | null>(null);
  const [bucket, setBucket] = useState<DurationBucket | null>(null);

  useEffect(() => {
    setLoading(true);
    listContents({ category, bucket }).then((rows) => {
      setItems(rows);
      setLoading(false);
    });
  }, [category, bucket]);

  return (
    <WideShell>
      <header className="flex items-center justify-between">
        <Link to="/"><MargeWordmark /></Link>
        <Link to="/home" className="text-sm text-muted-foreground hover:text-foreground">
          ← Accueil
        </Link>
      </header>

      {/* Editorial hero */}
      <section className="mt-12 lg:mt-16 max-w-3xl">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Bibliothèque</div>
        <h1 className="mt-4 font-display text-4xl lg:text-6xl leading-[1.05] tracking-tight">
          Des choses courtes,<br />
          <span className="text-primary">utiles tout de suite.</span>
        </h1>
        <p className="mt-6 text-lg text-foreground/75 leading-relaxed max-w-xl">
          Pas de programme. Pas de routine à tenir. Juste des exercices et des mini-guides
          que tu peux ouvrir quand tu en as besoin et fermer quand tu te sens mieux.
        </p>
      </section>

      {/* Filters */}
      <div className="mt-12 lg:mt-16 space-y-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground mb-3">Sujet</div>
          <div className="flex flex-wrap gap-2">
            <Pill active={category === null} onClick={() => setCategory(null)}>Tous</Pill>
            {(Object.entries(CATEGORIES) as [Category, string][]).map(([id, label]) => (
              <Pill key={id} active={category === id} onClick={() => setCategory(category === id ? null : id)}>
                {label}
              </Pill>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground mb-3">Durée</div>
          <div className="flex flex-wrap gap-2">
            <Pill active={bucket === null} onClick={() => setBucket(null)}>Toutes</Pill>
            {DURATION_BUCKETS.map((b) => (
              <Pill key={b.id} active={bucket === b.id} onClick={() => setBucket(bucket === b.id ? null : b.id)}>
                {b.label}
              </Pill>
            ))}
          </div>
        </div>
      </div>

      {/* List */}
      <section className="mt-12 lg:mt-16">
        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Chargement…</div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-foreground/70">Aucun contenu ne correspond à ce filtre.</p>
            <button
              onClick={() => { setCategory(null); setBucket(null); }}
              className="mt-4 text-sm text-primary hover:opacity-80"
            >
              Réinitialiser les filtres
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
            {items.map((item) => (
              <ContentCard key={item.slug} item={item} />
            ))}
          </div>
        )}
      </section>

      <footer className="mt-20 text-xs text-muted-foreground">
        {items.length > 0 && !loading && (
          <span>{items.length} contenu{items.length > 1 ? "s" : ""} affiché{items.length > 1 ? "s" : ""}.</span>
        )}
      </footer>
    </WideShell>
  );
}

function Pill({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm transition border cursor-pointer ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-surface text-foreground/80 border-border hover:border-primary hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function ContentCard({ item }: { item: ContentItem }) {
  const categoryLabel = CATEGORIES[item.category as Category] ?? item.category;
  return (
    <Link
      to="/library/$slug"
      params={{ slug: item.slug }}
      className="marge-card p-6 hover:border-primary transition group flex flex-col"
    >
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wider">
        <span className="text-primary">{categoryLabel}</span>
        <span className="text-muted-foreground tabular-nums">{item.duration_min} min</span>
      </div>
      <h2 className="mt-4 font-display text-xl leading-snug group-hover:text-primary transition">
        {item.title}
      </h2>
      <p className="mt-3 text-sm text-foreground/70 leading-relaxed flex-1">
        {item.summary}
      </p>
      <div className="mt-5 text-sm text-primary opacity-0 group-hover:opacity-100 transition">
        Ouvrir →
      </div>
    </Link>
  );
}
