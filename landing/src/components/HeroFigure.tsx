import Icon from "./Icon";
import { SCENARIOS, baseline, runScenario, Z_THRESHOLD } from "../lab/model";

/** FIG. 001: the earnings-miss scenario from the Signal lab, drawn as a
 *  technical figure. Every number on it is computed from the same model the lab
 *  runs, so the hero and the lab can never disagree.
 *
 *  Composition: the story (articles in, signal out) sits in the upper half,
 *  the evidence (fifteen days of article counts) in the lower half, so no card
 *  ever covers a bar. */
const scenario = SCENARIOS[0];
const run = runScenario(scenario);
const { mean, std } = baseline(scenario.history);
const counts = [...scenario.history, scenario.today];

// Chart geometry in the SVG's 600 × 500 user space, bottom-aligned.
const X0 = 52;
const STEP = 33;
const BAR = 19;
const BASE_Y = 440;
const UNIT = 24; // px per article
const RIGHT = X0 + STEP * (counts.length - 1) + BAR;
const y = (count: number) => BASE_Y - count * UNIT;
const thresholdCount = mean + Z_THRESHOLD * std;

export default function HeroFigure() {
  const sig = run.signal!;
  return (
    <figure
      aria-label={`Figure: ${scenario.ticker} news volume spikes to z = ${run.z.toFixed(2)}, above the ${Z_THRESHOLD.toFixed(1)} threshold, and becomes a graded put signal`}
      className="panel-grid relative isolate min-h-[440px] w-full overflow-hidden rounded-lg bg-deep text-deep-ink shadow-[0_24px_60px_-34px_rgba(19,28,46,0.55)] sm:min-h-[500px] lg:min-h-[520px]"
    >
      <div className="label absolute inset-x-5 top-5 flex items-center justify-between text-deep-muted sm:inset-x-6">
        <span className="flex items-center gap-2">
          <i className="inline-block h-1.5 w-1.5 rounded-full bg-ice" />
          News volume · {scenario.ticker}*
        </span>
        <span>Fig. 001</span>
      </div>

      <svg
        viewBox="0 0 600 500"
        preserveAspectRatio="xMidYMax meet"
        aria-hidden="true"
        className="absolute inset-0 -z-10 h-full w-full"
      >
        <defs>
          <linearGradient id="bar-today" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#b8ccff" />
            <stop offset="1" stopColor="#6f8fe0" />
          </linearGradient>
          <linearGradient id="scan" x1="0" x2="1">
            <stop offset="0" stopColor="#b8ccff" stopOpacity="0" />
            <stop offset="1" stopColor="#b8ccff" stopOpacity="0.22" />
          </linearGradient>
        </defs>
        {/* ±1σ band and mean */}
        <rect x={X0 - 12} y={y(mean + std)} width={RIGHT - X0 + 24} height={std * 2 * UNIT} fill="#b8ccff" opacity="0.07" />
        <line x1={X0 - 12} x2={RIGHT + 12} y1={y(mean)} y2={y(mean)} stroke="#98a7c2" strokeOpacity="0.5" strokeDasharray="2 5" />
        {counts.map((c, i) => {
          const today = i === counts.length - 1;
          return (
            <rect
              key={i}
              x={X0 + i * STEP}
              y={y(c)}
              width={BAR}
              height={c * UNIT}
              rx="2"
              fill={today ? "url(#bar-today)" : "#33476e"}
              className={today ? "fig-breathe" : undefined}
            />
          );
        })}
        {/* threshold, drawn over the bars */}
        <line x1={X0 - 12} x2={RIGHT + 12} y1={y(thresholdCount)} y2={y(thresholdCount)} stroke="#e2b25c" strokeWidth="1.5" strokeDasharray="6 5" />
        <text x={X0 + STEP * 7} y={y(thresholdCount) - 9} fill="#e2b25c" className="fig-label">
          {Z_THRESHOLD.toFixed(1)}σ threshold
        </text>
        <line x1={X0 - 12} x2={RIGHT + 12} y1={BASE_Y} y2={BASE_Y} stroke="#98a7c2" strokeOpacity="0.55" />
        <g className="fig-scan" style={{ ["--scan-distance" as string]: `${STEP * (counts.length - 1)}px` }}>
          <rect x={X0 - 30} y={y(7.4)} width="36" height={7.4 * UNIT} fill="url(#scan)" />
        </g>
      </svg>

      <ArticleCard
        className="left-5 top-16 -rotate-[4deg] sm:left-8 sm:top-[4.75rem]"
        label={`${scenario.articles[0].source} · 09:41`}
        title={`${scenario.ticker}* revenue falls short`}
        score={`finbert neg ${scenario.articles[0].neg.toFixed(2)}`}
      />
      <ArticleCard
        className="left-10 top-[12.25rem] hidden rotate-[3deg] sm:flex lg:hidden xl:flex"
        label={`${scenario.articles[2].source} · 09:52`}
        title={`${scenario.ticker}* margin narrows`}
        score={`finbert neg ${scenario.articles[2].neg.toFixed(2)}`}
      />

      {/* Positions step per breakpoint: at lg (1024-1279) the figure is only
          ~400px wide, so the pill drops below the signal card instead of
          sharing a row with the article card. */}
      <div className="absolute right-5 top-[9.75rem] flex items-center gap-2.5 rounded-full border border-ice/40 bg-ice/90 px-4 py-2.5 font-mono text-[12px] text-deep shadow-[0_0_30px_rgba(184,204,255,0.18)] sm:right-8 sm:top-[5.5rem] lg:top-[18.25rem] xl:top-[5.5rem]">
        <Icon name="activity" className="h-4 w-4" />
        <span>
          z = <b className="font-semibold">{run.z.toFixed(2)}</b>
          <span className="ml-2 opacity-75">≥ {Z_THRESHOLD.toFixed(1)}</span>
        </span>
      </div>

      <div className="absolute right-5 top-[13rem] flex max-w-[17rem] -rotate-2 gap-3.5 rounded-lg bg-paper p-4 text-ink shadow-[0_20px_30px_rgba(8,14,28,0.35)] sm:right-8 sm:top-[10rem] sm:p-[18px] lg:top-[11rem] xl:top-[10rem]">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Icon name="check" className="h-4 w-4" strokeWidth={2} />
        </span>
        <div className="flex flex-col gap-1.5">
          <span className="label text-faint">Signal 001 · raw {sig.confidence.toFixed(2)}</span>
          <strong className="text-[13px] font-semibold">
            {scenario.ticker}* {sig.direction.toUpperCase()} ${sig.strike}, day {sig.expiryDays}
          </strong>
          <small className="text-[12px] text-muted">Graded at expiry, win or lose.</small>
        </div>
      </div>

      <div className="label absolute inset-x-5 bottom-5 flex items-center justify-between text-deep-muted sm:inset-x-6">
        <span>
          Baseline {mean.toFixed(1)} ± {std.toFixed(1)}
          <span className="lg:hidden xl:inline"> · 14 days</span>
        </span>
        <span className="hidden items-center gap-2 text-deep-ink sm:flex lg:hidden xl:flex">
          Every stage must pass <Icon name="arrow-up-right" className="h-3.5 w-3.5" />
        </span>
      </div>
    </figure>
  );
}

function ArticleCard({
  className,
  label,
  title,
  score,
}: {
  className: string;
  label: string;
  title: string;
  score: string;
}) {
  return (
    <div
      className={`absolute flex flex-col gap-2 rounded-md border border-deep-line bg-deep-2/85 px-4 py-3 shadow-[0_12px_25px_rgba(4,10,24,0.25)] backdrop-blur-sm ${className}`}
    >
      <span className="label text-deep-faint">{label}</span>
      <strong className="text-[13px] font-medium">{title}</strong>
      <span className="font-mono text-[12px] text-ice">{score}</span>
    </div>
  );
}
