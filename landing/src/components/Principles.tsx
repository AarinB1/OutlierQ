import type { ReactNode } from "react";
import Icon, { type IconName } from "./Icon";
import SectionHeading from "./SectionHeading";
import { SCENARIOS, Z_THRESHOLD, baseline, runScenario, CALIBRATOR_MIN_SAMPLES } from "../lab/model";

const byId = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));

function Principle({
  icon,
  title,
  body,
  children,
}: {
  icon: IconName;
  title: ReactNode;
  body: string;
  children: ReactNode;
}) {
  return (
    <article className="flex flex-col border-line py-8 md:px-7 md:py-9 md:first:pl-0 md:last:pr-0 md:[&+&]:border-l [&+&]:border-t md:[&+&]:border-t-0">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-paper-3 text-accent">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <h3 className="mt-6 text-[1.4rem] font-medium leading-[1.3] tracking-[-0.025em] text-ink">{title}</h3>
      <p className="mt-4 max-w-[22rem] text-[14px] leading-[1.8] text-muted md:min-h-[7.5rem]">{body}</p>
      <div className="mt-6 flex min-h-[10rem] flex-col justify-center rounded-md border border-line bg-paper-2 p-4 font-mono text-[12px] text-body sm:p-5">
        {children}
      </div>
    </article>
  );
}

function ZRow({ id }: { id: string }) {
  const s = byId[id];
  const { mean, std } = baseline(s.history);
  const z = (s.today - mean) / std;
  const pct = Math.max(0, Math.min(z / 5, 1)) * 100;
  const over = z >= Z_THRESHOLD;
  return (
    <div className="grid grid-cols-[3.6rem_1fr_3.4rem] items-center gap-3 py-1.5">
      <span className="text-ink">{s.ticker}{s.fictional ? "*" : ""}</span>
      <span className="relative h-1.5 rounded-full bg-paper-3">
        <i
          className={`absolute inset-y-0 left-0 rounded-full ${over ? "bg-accent" : "bg-line-2"}`}
          style={{ width: `${pct}%` }}
        />
        <i className="absolute -top-1 h-3.5 w-px bg-down" style={{ left: `${(Z_THRESHOLD / 5) * 100}%` }} />
      </span>
      <b className={`text-right font-medium ${over ? "text-accent" : "text-muted"}`}>z {z.toFixed(2)}</b>
    </div>
  );
}

const stageLabel: Record<string, string> = { volume: "Volume", sentiment: "Tone", sources: "Sources" };
const stages = [
  ...runScenario(byId["one-source"])
    .steps.slice(0, 3)
    .map((s) => ({ key: s.stage, label: stageLabel[s.stage], status: s.status, value: s.value })),
  { key: "signal", label: "Signal", status: "skip" as const, value: "not reached" },
];

export default function Principles() {
  return (
    <section id="principles" aria-labelledby="principles-title" className="wrap py-20 sm:py-24 lg:py-28">
      <SectionHeading
        id="principles-title"
        eyebrow="01 / The principles"
        title={
          <>
            Built for the days
            <br />
            when nothing happens.
          </>
        }
        aside="Most scans should end empty. A signal has to earn its way through every stage, and then it gets graded anyway."
      />
      <div className="grid border-y border-line md:grid-cols-3">
        <Principle
          icon="activity"
          title={
            <>
              Loud for this ticker.
              <br />
              Not loud in general.
            </>
          }
          body="News volume is scored against each ticker's own 14-day baseline, quiet days included. Seven stories about a small cap can be an outlier; eleven about a mega cap is an ordinary Tuesday."
        >
          <ZRow id="earnings-miss" />
          <ZRow id="quiet" />
          <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-[12px] text-muted">
            <span>14-day baseline each</span>
            <span className="text-down">threshold z ≥ {Z_THRESHOLD.toFixed(1)}</span>
          </div>
        </Principle>

        <Principle
          icon="filter"
          title={
            <>
              Every stage must pass.
              <br />
              In order.
            </>
          }
          body="Volume, then FinBERT tone, then independent sources. Fail one and the cascade stops. Options flow can adjust confidence, or raise its own options-only event when conviction is high."
        >
          <ol className="space-y-1.5">
            {stages.map((st) => {
              const tone =
                st.status === "pass" ? "text-accent" : st.status === "fail" ? "text-down" : "text-faint";
              return (
                <li key={st.key} className={`grid grid-cols-[1rem_4.5rem_1fr] items-center gap-2 ${tone}`}>
                  {st.status === "pass" ? (
                    <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.2} />
                  ) : st.status === "fail" ? (
                    <Icon name="x" className="h-3.5 w-3.5" strokeWidth={2.2} />
                  ) : (
                    <Icon name="minus" className="h-3.5 w-3.5" />
                  )}
                  <span className={st.status === "skip" ? "text-faint" : "text-ink"}>{st.label}</span>
                  <span className="text-right">{st.value}</span>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 border-t border-line pt-3 text-[12px] text-muted">TQNX*: four stories, one outlet.</p>
        </Principle>

        <Principle
          icon="check-circle"
          title={
            <>
              Every signal is graded.
              <br />
              Wins and losses.
            </>
          }
          body={`At expiry each option is marked at intrinsic value against a Black-Scholes entry price. Until ${CALIBRATOR_MIN_SAMPLES} graded signals with both outcomes exist, confidence stays raw and says so.`}
        >
          <dl className="grid grid-cols-[4.2rem_1fr] gap-x-3 gap-y-2">
            <dt className="text-up">profit</dt>
            <dd className="text-muted">worth more than the entry premium</dd>
            <dt className="text-body">loss</dt>
            <dd className="text-muted">some value left, below entry</dd>
            <dt className="text-down">expired</dt>
            <dd className="text-muted">worthless at expiry, −100%</dd>
          </dl>
          <p className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-[12px] text-muted">
            <Icon name="info" className="h-3.5 w-3.5" />
            Calibrator inert until n ≥ {CALIBRATOR_MIN_SAMPLES}
          </p>
        </Principle>
      </div>
    </section>
  );
}
