export function MargeMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="64" height="64" rx="16" fill="var(--color-primary-soft)" />
      <path
        d="M14 44 V20 L24 36 L34 20 V44"
        stroke="var(--color-primary)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="48" cy="22" r="4" fill="var(--color-primary)" />
    </svg>
  );
}

export function MargeWordmark() {
  return (
    <div className="flex items-center gap-2">
      <MargeMark size={28} />
      <span className="font-display text-xl text-foreground">Marge</span>
    </div>
  );
}
