import type { ReactNode } from "react";
import Reveal from "./Reveal";

export interface FeatureCard {
  title: string;
  body: string;
}

/** Shared layout for the three major feature sections:
 *  kicker + big headline + mockup + row of three cards. */
export default function Section({
  id,
  kicker,
  headline,
  lede,
  mockup,
  cards,
  glowSide = "left",
}: {
  id: string;
  kicker: string;
  headline: ReactNode;
  lede: string;
  mockup: ReactNode;
  cards: FeatureCard[];
  glowSide?: "left" | "right";
}) {
  return (
    <section id={id} className="relative overflow-hidden py-24 sm:py-32">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(44rem 28rem at ${
            glowSide === "left" ? "12%" : "88%"
          } 18%, rgba(68,138,255,0.07), transparent 68%)`,
        }}
      />
      <div className="relative mx-auto max-w-wrap px-5 sm:px-8">
        <Reveal>
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
            {kicker}
          </p>
          <h2
            className="max-w-4xl font-semibold leading-[1.06] tracking-tight text-headline"
            style={{ fontSize: "clamp(1.9rem, 4.4vw, 3.25rem)" }}
          >
            {headline}
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">{lede}</p>
        </Reveal>
        <Reveal delay={120} className="mt-12 sm:mt-14">
          {mockup}
        </Reveal>
        <div className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-3 sm:gap-5">
          {cards.map((card, i) => (
            <Reveal key={card.title} delay={i * 90}>
              <div className="h-full rounded-xl border border-edge bg-panel/60 p-5 transition-colors hover:border-accent/40 sm:p-6">
                <h3 className="text-[15px] font-semibold tracking-tight text-headline sm:text-base">
                  {card.title}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-muted">{card.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
