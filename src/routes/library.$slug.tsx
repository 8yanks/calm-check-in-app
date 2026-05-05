import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { WideShell, PageShell } from "@/components/PageShell";
import { MargeWordmark } from "@/components/Logo";
import { getContentBySlug, logInteraction, CATEGORIES, type ContentItem, type Category } from "@/lib/content";
import { track } from "@/lib/analytics";
import { useEntitlements } from "@/hooks/use-entitlements";
import { hasFeature } from "@/lib/entitlements";
import { PaywallCard } from "@/components/Paywall";

export const Route = createFileRoute("/library/$slug")({
  head: () => ({ meta: [{ title: "Lecture — Marge" }] }),
  component: ContentDetail,
});

function ContentDetail() {
  const { slug } = useParams({ from: "/library/$slug" });
  const [item, setItem] = useState<ContentItem | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [completed, setCompleted] = useState(false);
  const { entitlement, loading: entLoading } = useEntitlements();
  const canPremium = hasFeature(entitlement, "library_premium");
  const isLocked = item?.tier === "premium" && !canPremium;

  // Fetch content + log "viewed" once per mount
  useEffect(() => {
    let cancelled = false;
    getContentBySlug(slug).then((data) => {
      if (cancelled) return;
      if (!data) { setNotFound(true); return; }
      setItem(data);
      logInteraction(slug, "viewed");
      track("content_viewed", { slug, category: data.category, duration_min: data.duration_min, tier: data.tier });
    });
    return () => { cancelled = true; };
  }, [slug]);

  const handleComplete = async () => {
    setCompleted(true);
    if (item) {
      await logInteraction(slug, "completed");
      track("content_completed", { slug, category: item.category, duration_min: item.duration_min });
    }
  };

  if (notFound) {
    return (
      <PageShell>
        <Link to="/library" className="text-sm text-muted-foreground hover:text-foreground">← Bibliothèque</Link>
        <div className="mt-20 text-center">
          <h1 className="font-display text-3xl">Contenu introuvable</h1>
          <p className="mt-3 text-muted-foreground">Ce contenu n'existe pas ou a été retiré.</p>
          <Link to="/library" className="mt-6 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm text-primary-foreground hover:opacity-90">
            Retour à la bibliothèque
          </Link>
        </div>
      </PageShell>
    );
  }

  if (!item) return <PageShell><div className="h-screen" /></PageShell>;

  const categoryLabel = CATEGORIES[item.category as Category] ?? item.category;

  return (
    <WideShell>
      <header className="flex items-center justify-between">
        <Link to="/"><MargeWordmark /></Link>
        <Link to="/library" className="text-sm text-muted-foreground hover:text-foreground">
          ← Bibliothèque
        </Link>
      </header>

      <article className="mt-12 lg:mt-16 max-w-3xl mx-auto">
        {/* Meta line */}
        <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.18em]">
          <span className="text-primary">{categoryLabel}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground tabular-nums">{item.duration_min} minutes</span>
          {item.tier === "premium" && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-primary">Marge Plus</span>
            </>
          )}
        </div>

        {/* Title */}
        <h1 className="mt-5 font-display text-4xl lg:text-5xl leading-[1.1] tracking-tight">
          {item.title}
        </h1>

        {/* Summary */}
        <p className="mt-6 text-lg text-foreground/75 leading-relaxed font-display italic">
          {item.summary}
        </p>

        {/* Body — preview only when locked */}
        {isLocked ? (
          <>
            <div className="mt-12 prose-marge text-foreground/90 leading-[1.75] text-[17px] relative">
              {(() => {
                // Show only the first paragraph as preview, then fade-out
                const blocks = item.body.split(/\n\n+/);
                const previewBlocks = blocks.slice(0, 1);
                return previewBlocks.map((block, i) => (
                  <Paragraph key={i} text={block} />
                ));
              })()}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent" />
            </div>

            <div className="mt-12">
              {entLoading ? (
                <div className="h-32" aria-hidden />
              ) : (
                <PaywallCard feature="library_premium" trigger="content_detail" />
              )}
            </div>
          </>
        ) : (
          <>
            <div className="mt-12 prose-marge text-foreground/90 leading-[1.75] text-[17px]">
              {item.body.split(/\n\n+/).map((block, i) => (
                <Paragraph key={i} text={block} />
              ))}
            </div>

            {/* Why helps */}
            <aside className="mt-16 marge-card p-7 border-primary/30">
              <div className="text-xs uppercase tracking-[0.18em] text-primary">Pourquoi ça aide</div>
              <p className="mt-4 text-foreground/85 leading-relaxed">{item.why_helps}</p>
              {Array.isArray(item.refs) && item.refs.length > 0 && (
                <ul className="mt-5 space-y-2">
                  {(item.refs as Array<{ label: string; source: string }>).map((r, i) => (
                    <li key={i} className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/80">{r.label}</span>
                      {r.source && <span className="text-muted-foreground"> · {r.source}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </aside>

            {/* Action */}
            <div className="mt-12 flex flex-col sm:flex-row sm:items-center gap-4">
              {completed ? (
                <div className="flex items-center gap-3 text-sm text-primary">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                  <span>Bien fait. Tu peux refermer la page tranquillement.</span>
                </div>
              ) : (
                <button
                  onClick={handleComplete}
                  className="rounded-full bg-primary px-6 py-3 text-sm text-primary-foreground hover:opacity-90 cursor-pointer"
                >
                  C'est fait
                </button>
              )}
              <Link to="/library" className="text-sm text-muted-foreground hover:text-foreground">
                Voir d'autres contenus →
              </Link>
            </div>
          </>
        )}

        <footer className="mt-20 text-xs text-muted-foreground italic max-w-xl">
          Marge n'est pas un substitut à un suivi psychologique. Si tu traverses une période
          difficile, parler à un professionnel reste la meilleure démarche.
        </footer>
      </article>
    </WideShell>
  );
}

/**
 * Render a single paragraph block with light markdown handling:
 * - **bold** becomes <strong>
 * - *italic* becomes <em>
 * - Lines starting with "1. " "2. " etc. become an ordered list
 * - Lines starting with "- " become an unordered list
 * - Otherwise, render as a paragraph with line breaks preserved as <br/>
 */
function Paragraph({ text }: { text: string }) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Ordered list detection
  if (/^\d+\.\s/.test(trimmed)) {
    const items = trimmed.split(/\n(?=\d+\.\s)/).map(line => line.replace(/^\d+\.\s/, "").trim());
    return (
      <ol className="my-5 space-y-3 list-decimal pl-5">
        {items.map((it, i) => (
          <li key={i}><Inline text={it} /></li>
        ))}
      </ol>
    );
  }

  // Unordered list detection
  if (trimmed.startsWith("- ")) {
    const items = trimmed.split(/\n(?=- )/).map(line => line.replace(/^- /, "").trim());
    return (
      <ul className="my-5 space-y-2 list-disc pl-5">
        {items.map((it, i) => (
          <li key={i}><Inline text={it} /></li>
        ))}
      </ul>
    );
  }

  return (
    <p className="my-5">
      <Inline text={trimmed} />
    </p>
  );
}

/** Inline formatting: **bold** and *italic*, line breaks preserved. */
function Inline({ text }: { text: string }) {
  const parts: Array<string | { kind: "b" | "i" | "br"; value?: string }> = [];
  // Split by line first to keep line breaks
  const lines = text.split("\n");
  lines.forEach((line, lineIdx) => {
    // Tokenise inline marks
    const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      if (m.index > lastIdx) parts.push(line.slice(lastIdx, m.index));
      const match = m[0];
      if (match.startsWith("**")) parts.push({ kind: "b", value: match.slice(2, -2) });
      else parts.push({ kind: "i", value: match.slice(1, -1) });
      lastIdx = m.index + match.length;
    }
    if (lastIdx < line.length) parts.push(line.slice(lastIdx));
    if (lineIdx < lines.length - 1) parts.push({ kind: "br" });
  });

  return (
    <>
      {parts.map((p, i) => {
        if (typeof p === "string") return <span key={i}>{p}</span>;
        if (p.kind === "br") return <br key={i} />;
        if (p.kind === "b") return <strong key={i} className="text-foreground">{p.value}</strong>;
        return <em key={i}>{p.value}</em>;
      })}
    </>
  );
}
