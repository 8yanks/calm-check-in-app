import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { WideShell } from "@/components/PageShell";
import { MargeMark, MargeWordmark } from "@/components/Logo";
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
    <WideShell>
      {/* Top bar — visible on every breakpoint */}
      <header className="flex items-center justify-between">
        <MargeWordmark />
        <Link to="/about" className="text-sm text-muted-foreground hover:text-foreground transition">
          À propos
        </Link>
      </header>

      {/* MOBILE hero (unchanged feel) */}
      <div className="lg:hidden flex min-h-[80vh] flex-col mt-6">
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
          <Link to="/onboarding" className="block w-full rounded-full bg-primary py-4 text-center text-base font-medium text-primary-foreground transition hover:opacity-90 active:scale-[0.99]">
            Commencer
          </Link>
          <Link to="/about" className="block w-full rounded-full border border-border bg-surface py-4 text-center text-base text-foreground transition hover:bg-muted">
            En savoir plus
          </Link>
        </div>
      </div>

      {/* DESKTOP hero — split layout */}
      <section className="hidden lg:grid grid-cols-12 gap-10 items-center mt-16 min-h-[78vh]">
        {/* Left: editorial copy */}
        <div className="col-span-7 max-w-xl animate-in fade-in slide-in-from-bottom-3 duration-700">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Compagne calme du quotidien
          </div>
          <h1 className="mt-6 font-display text-7xl leading-[1.05] tracking-tight text-foreground">
            Moins de friction.<br />
            <span className="text-primary">Plus de marge.</span>
          </h1>
          <p className="mt-8 text-lg leading-relaxed text-foreground/75 max-w-md">
            En quelques secondes, comprends ce qui te pèse aujourd'hui — et reçois
            une action utile, faisable tout de suite.
          </p>
          <div className="mt-10 flex items-center gap-4">
            <Link to="/onboarding" className="rounded-full bg-primary px-8 py-4 text-base font-medium text-primary-foreground transition hover:opacity-90">
              Commencer
            </Link>
            <Link to="/about" className="text-sm text-foreground/70 hover:text-foreground transition px-4 py-4">
              En savoir plus →
            </Link>
          </div>

          <div className="mt-16 grid grid-cols-3 gap-8 max-w-lg">
            {[
              { n: "1 min", t: "pour faire un point" },
              { n: "30–90 s", t: "pour l'action proposée" },
              { n: "0", t: "notification inutile" },
            ].map((x) => (
              <div key={x.t}>
                <div className="font-display text-2xl text-foreground">{x.n}</div>
                <div className="mt-1 text-xs text-muted-foreground leading-snug">{x.t}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: supporting visual — a still preview of the app surface */}
        <div className="col-span-5">
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

      <footer className="hidden lg:flex mt-20 items-center justify-between text-xs text-muted-foreground">
        <span>© Marge</span>
        <span>Pas une app médicale. Pas un dashboard. Une compagne.</span>
      </footer>
    </WideShell>
  );
}
