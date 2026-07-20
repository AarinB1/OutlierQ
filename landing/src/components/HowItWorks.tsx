import Reveal from "./Reveal";

const steps = [
  {
    n: "01",
    title: "Ingest",
    body: "On a schedule, OutlierQ pulls company news from Finnhub and market data from yfinance. Everything lands in a SQL store with full history, so the pipeline is replayable from raw events.",
  },
  {
    n: "02",
    title: "Detect",
    body: "FinBERT scores the financial sentiment of each headline while a rolling z-score model watches for news-volume anomalies. Options chains are scanned for unusual activity, and events only escalate when independent sources confirm each other.",
  },
  {
    n: "03",
    title: "Signal",
    body: "Classified outlier events map to concrete call or put recommendations with a suggested strike and expiry. Each signal carries a confidence score calibrated against the platform's own realized win rate — not a hand-tuned constant.",
  },
  {
    n: "04",
    title: "Track",
    body: "Every signal is evaluated against actual market movement using Black-Scholes options P&L. Accuracy statistics feed back into confidence calibration, closing the loop between prediction and reality.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="relative overflow-hidden py-24 sm:py-32">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(48rem 30rem at 50% 0%, rgba(68,138,255,0.06), transparent 70%)",
        }}
      />
      <div className="relative mx-auto max-w-wrap px-5 sm:px-8">
        <Reveal>
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
            Architecture
          </p>
          <h2
            className="max-w-3xl font-semibold leading-[1.06] tracking-tight text-headline"
            style={{ fontSize: "clamp(1.9rem, 4.4vw, 3.25rem)" }}
          >
            How it works.
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
            One pipeline, four stages. Python, FastAPI, and SQLAlchemy on the backend; React and
            TypeScript on the front.
          </p>
        </Reveal>
        <div className="mt-14 sm:mt-16">
          {steps.map((step, i) => (
            <Reveal key={step.n} delay={i * 80}>
              <div className="grid gap-4 border-t border-edge py-8 sm:grid-cols-[6rem_14rem_1fr] sm:gap-6 sm:py-10">
                <div className="font-mono text-sm text-accent">{step.n}</div>
                <h3 className="text-xl font-semibold tracking-tight text-headline sm:text-2xl">
                  {step.title}
                </h3>
                <p className="max-w-xl text-[15px] leading-relaxed text-muted">{step.body}</p>
              </div>
            </Reveal>
          ))}
          <div className="border-t border-edge" />
        </div>
        <Reveal delay={120}>
          <p className="mt-10 font-mono text-xs uppercase tracking-[0.18em] text-faint">
            Python · FastAPI · SQLAlchemy · React · TypeScript
          </p>
        </Reveal>
      </div>
    </section>
  );
}
