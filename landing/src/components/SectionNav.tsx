import { useActiveSection } from "../lib/useActiveSection";

/** Thin sticky rail listing every page section, revealed once the hero has
 *  scrolled away and highlighting the section currently in view.
 *
 *  Semantics: these are same-page links that move the viewport, not a tab
 *  widget — no panel is shown or hidden, and focus never moves into a panel. So
 *  this is a <nav> of links with aria-current on the active one, which is the
 *  honest pattern and needs no arrow-key handling to be correct. Faking
 *  role="tablist" here would promise a keyboard contract the widget does not
 *  actually implement.
 *
 *  It is `fixed`, so revealing it causes no layout shift. Hiding uses
 *  `visibility: hidden`, which also removes the links from the tab order —
 *  opacity alone would leave invisible focus stops. */

const SECTIONS = [
  { id: "detection", label: "Detection" },
  { id: "signals", label: "Signals" },
  { id: "arbitrage", label: "Arbitrage" },
  { id: "tracking", label: "Tracking" },
  { id: "how-it-works", label: "Architecture" },
  { id: "faq", label: "FAQ" },
] as const;

const IDS = SECTIONS.map((s) => s.id);

export default function SectionNav({ shown }: { shown: boolean }) {
  const active = useActiveSection(IDS);

  return (
    <div
      className="fixed inset-x-0 top-16 z-40 border-b border-white/5 bg-ink/85 backdrop-blur-md transition-[opacity,transform] duration-300"
      style={{
        opacity: shown ? 1 : 0,
        visibility: shown ? "visible" : "hidden",
        transform: shown ? "none" : "translateY(-6px)",
      }}
    >
      <nav
        aria-label="Page sections"
        className="mx-auto max-w-wrap overflow-x-auto px-5 sm:px-8"
        style={{ scrollbarWidth: "none" }}
      >
        <ul className="flex items-center gap-1 whitespace-nowrap py-1.5">
          {SECTIONS.map((s) => {
            const on = active === s.id;
            return (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  aria-current={on ? "true" : undefined}
                  className={`inline-block rounded-md px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors sm:text-[11px] ${
                    on ? "bg-accent/10 text-accent" : "text-faint hover:text-body"
                  }`}
                >
                  {s.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
