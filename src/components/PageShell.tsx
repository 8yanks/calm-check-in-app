import type { ReactNode } from "react";
export function PageShell({ children, max = "max-w-md" }: { children: ReactNode; max?: string }) {
  return (
    <div className="min-h-screen bg-background">
      <div className={`mx-auto ${max} px-5 pt-8 pb-16 sm:pt-12`}>{children}</div>
    </div>
  );
}

/**
 * Desktop-aware shell: keeps a calm narrow column on mobile, opens up to a
 * wider editorial canvas on lg+ screens. Children are responsible for laying
 * out their own grid inside.
 */
export function WideShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-md lg:max-w-6xl px-5 lg:px-10 pt-8 lg:pt-14 pb-16 lg:pb-20">
        {children}
      </div>
    </div>
  );
}
