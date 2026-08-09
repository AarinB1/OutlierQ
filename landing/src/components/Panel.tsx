import type { ReactNode } from "react";

/** Shared shell for product mockups: dark panel, header strip, synthetic-data tag.
 *
 *  The header dot used to pulse (animate-ping). It was removed deliberately: a
 *  pulsing indicator reads as "live feed", and nothing on this page is live. */
export function MockPanel({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-edge bg-panel shadow-[0_24px_80px_-32px_rgba(0,0,0,0.9)] ${className}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-2.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
          />
          <span className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-faint sm:text-[11px]">
            {label}
          </span>
        </div>
        <SampleTag />
      </div>
      {children}
    </div>
  );
}

export function SampleTag() {
  return (
    <span className="shrink-0 rounded-full border border-edge bg-panel-2 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-faint sm:text-[10px]">
      Synthetic data
    </span>
  );
}

/** Label/value row used inside mockups. */
export function StatCell({
  label,
  value,
  valueClass = "text-headline",
  sub,
}: {
  label: string;
  value: ReactNode;
  valueClass?: string;
  sub?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">{label}</div>
      <div className={`mt-1 font-mono text-sm font-medium sm:text-base ${valueClass}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-faint">{sub}</div> : null}
    </div>
  );
}
