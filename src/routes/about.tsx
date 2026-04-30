import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/PageShell";

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
    <PageShell>
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Retour</Link>
      <h1 className="mt-6 font-display text-3xl">À propos de Marge</h1>
      <div className="mt-6 space-y-5 text-foreground/85 leading-relaxed">
        <p>Marge n'est pas une app de méditation, ni un dashboard de productivité.</p>
        <p>C'est une compagne calme qui t'aide à <strong>repérer ce qui te pèse</strong> et à <strong>agir tout de suite</strong>, en moins d'une minute.</p>
        <p>Au fil de tes points, Marge apprend tes rythmes — sans jugement, sans bruit visuel, sans gamification.</p>
      </div>
      <Link
        to="/onboarding"
        className="mt-10 block w-full rounded-full bg-primary py-4 text-center text-primary-foreground hover:opacity-90"
      >
        Commencer
      </Link>
    </PageShell>
  );
}
