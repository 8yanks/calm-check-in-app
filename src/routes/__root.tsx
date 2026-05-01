import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-6xl text-foreground">404</h1>
        <p className="mt-3 text-muted-foreground">Cette page n'existe pas.</p>
        <Link to="/" className="mt-6 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm text-primary-foreground hover:opacity-90">
          Retour à l'accueil
        </Link>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#f3efe6", media: "(prefers-color-scheme: light)" },
      { name: "theme-color", content: "#1f2a26", media: "(prefers-color-scheme: dark)" },
      { title: "Marge — Moins de friction. Plus de marge." },
      { name: "description", content: "Marge t'aide à comprendre ce qui te pèse aujourd'hui et te propose une action utile, tout de suite." },
      // Open Graph
      { property: "og:title", content: "Marge — Moins de friction. Plus de marge." },
      { property: "og:description", content: "Une compagne calme du quotidien." },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "/og-image.svg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:locale", content: "fr_FR" },
      { property: "og:site_name", content: "Marge" },
      // Twitter
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Marge — Moins de friction. Plus de marge." },
      { name: "twitter:description", content: "Une compagne calme du quotidien." },
      { name: "twitter:image", content: "/og-image.svg" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500&family=Inter:wght@400;500;600&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: () => <Outlet />,
  notFoundComponent: NotFoundComponent,
});

// Synchronous theme bootstrap: runs in <head> before <body> renders so the
// dark class is on <html> from the very first paint — no white flash.
const themeBootstrap = `try{var p=JSON.parse(localStorage.getItem("marge.prefs")||"{}");if(p&&p.theme==="dark"){document.documentElement.classList.add("dark")}}catch(e){}`;

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
