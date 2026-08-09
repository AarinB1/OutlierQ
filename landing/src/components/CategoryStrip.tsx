import Reveal from "./Reveal";
import { useActiveSection } from "../lib/useActiveSection";

/** The four pipeline stages, as a segmented strip above the feature sections.
 *
 *  Same semantic call as SectionNav: clicking scrolls the page, it does not
 *  swap a panel, so this is a <nav> of anchors with aria-current rather than a
 *  role="tablist". A real tablist would owe the user arrow-key navigation,
 *  aria-selected, and focusable tabpanels — none of which describe "jump to a
 *  section further down the page". */

const STAGES = [
  { id: "detection", n: "01", label: "Detection" },
  { id: "signals", n: "02", label: "Signals" },
  { id: "arbitrage", n: "03", label: "Arbitrage" },
  { id: "tracking", n: "04", label: "Tracking" },
] as const;

const IDS = STAGES.map((s) => s.id);

export default function CategoryStrip() {
  const active = useActiveSection(IDS);

  return (
    <div className="relative mx-auto max-w-wrap px-5 sm:px-8">
      <Reveal>
        <nav aria-label="Pipeline stages">
          <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-edge bg-edge sm:grid-cols-4">
            {STAGES.map((s) => {
              const on = active === s.id;
              return (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    aria-current={on ? "true" : undefined}
                    // The active background must be opaque. A translucent
                    // accent tint here composited over the grid's `bg-edge`
                    // gap colour, not over `panel`, and accent-on-#1e2b45
                    // measured 4.24:1 — under AA. `panel-2` plus an inset rule
                    // gives the same read at 5.62:1, and an inset shadow (not a
                    // border) keeps the active cell the same size as the rest.
                    className={`flex h-full flex-col gap-1 px-4 py-3.5 transition-colors sm:px-5 sm:py-4 ${
                      on
                        ? "bg-panel-2 text-accent shadow-[inset_0_2px_0_0_#448aff]"
                        : "bg-panel text-muted hover:bg-panel-2 hover:text-headline"
                    }`}
                  >
                    <span
                      className={`font-mono text-[10px] tracking-[0.2em] ${
                        on ? "text-accent" : "text-faint"
                      }`}
                    >
                      {s.n}
                    </span>
                    <span className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] sm:text-xs">
                      {s.label}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </Reveal>
    </div>
  );
}
