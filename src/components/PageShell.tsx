import type { ReactNode } from "react";
export function PageShell({ children, max = "max-w-md" }: { children: ReactNode; max?: string }) {
  return (
    <div className="min-h-screen bg-background">
      <div className={`mx-auto ${max} px-5 pt-8 pb-16 sm:pt-12`}>{children}</div>
    </div>
  );
}
