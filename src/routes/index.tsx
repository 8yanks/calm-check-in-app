import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { PageShell } from "@/components/PageShell";
import { MargeMark } from "@/components/Logo";
import { getPrefs, applyTheme } from "@/lib/marge";

export const Route = createFileRoute("/")({
  component: Welcome,
});

function Welcome() {
  const navigate = useNavigate();
  useEffect(() => {
    const p = getPrefs();
    applyTheme(p.theme);
    if (p.completed) navigate({ to: "/home" });
  }, [navigate]);

  return (
    <PageShell>
      <div className="flex min-h-[88vh] flex-col">
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="mb-10 animate-in fade-in zoom-in-95 duration-700">
            <MargeMark size={84} />
          </div>
          <h1 className="font-display text-5xl text-foreground tracking-tight">Marge</h1>
          <p className="mt-5 text-lg text-foreground/80 font-display italic">
            Moins de friction.<br />Plus de marge.
          </p>
          <p className="mt-8 max-w-xs text-sm leading-relaxed text-muted-foreground">
            Une compagne calme du quotidien. En quelques secondes, comprends ce qui te pèse
            et reçois une action utile, tout de suite.
          </p>
        </div>
        <div className="space-y-3">
          <Link
            to="/onboarding"
            className="block w-full rounded-full bg-primary py-4 text-center text-base font-medium text-primary-foreground transition hover:opacity-90 active:scale-[0.99]"
          >
            Commencer
          </Link>
          <Link
            to="/about"
            className="block w-full rounded-full border border-border bg-surface py-4 text-center text-base text-foreground transition hover:bg-muted"
          >
            En savoir plus
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
