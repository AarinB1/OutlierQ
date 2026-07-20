import { useEffect, useState } from "react";
import Section from "./Section";
import { MockPanel, StatCell } from "./Panel";

/** True below the given viewport width; used to render a mobile-legible chart. */
function useNarrow(query = "(max-width: 640px)") {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setNarrow(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return narrow;
}

/** Six months of illustrative weekly paper-portfolio values (USD). */
const VALUES = [
  10000, 10140, 10080, 10260, 10190, 10430, 10370, 10540, 10310, 10480, 10620, 10560, 10790,
  10730, 10980, 10900, 11150, 11060, 11320, 11480, 11390, 11630, 11550, 11820, 11940, 11870,
  12110, 12310,
];

const MONTHS = ["Feb", "Mar", "Apr", "May", "Jun", "Jul"];

function EquityChart() {
  const narrow = useNarrow();
  const w = narrow ? 340 : 640;
  const h = narrow ? 250 : 240;
  const pad = narrow
    ? { top: 14, right: 62, bottom: 26, left: 38 }
    : { top: 16, right: 74, bottom: 28, left: 44 };
  const axisFont = narrow ? 11 : 10;
  const labelFont = narrow ? 12 : 11;
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;
  const yMin = 9800;
  const yMax = 12600;

  const x = (i: number) => pad.left + (i / (VALUES.length - 1)) * plotW;
  const y = (v: number) => pad.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  const linePath = VALUES.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${x(VALUES.length - 1).toFixed(1)} ${(pad.top + plotH).toFixed(1)} L${pad.left} ${(pad.top + plotH).toFixed(1)} Z`;

  const gridValues = [10000, 11000, 12000];
  const last = VALUES[VALUES.length - 1];

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="block w-full"
      role="img"
      aria-label="Sample equity curve: paper portfolio value growing from $10,000 to $12,310 over six months"
    >
      <defs>
        <linearGradient id="eq-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#448aff" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#448aff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* recessive gridlines + y labels */}
      {gridValues.map((gv) => (
        <g key={gv}>
          <line
            x1={pad.left}
            x2={w - pad.right}
            y1={y(gv)}
            y2={y(gv)}
            stroke="#1a2233"
            strokeWidth="1"
          />
          <text
            x={pad.left - 8}
            y={y(gv) + 3}
            textAnchor="end"
            fontSize={axisFont}
            fill="#5c657b"
            fontFamily="'JetBrains Mono', monospace"
          >
            ${gv / 1000}k
          </text>
        </g>
      ))}

      {/* x labels */}
      {MONTHS.map((m, i) => (
        <text
          key={m}
          x={pad.left + (i / (MONTHS.length - 1)) * plotW}
          y={h - 8}
          textAnchor="middle"
          fontSize={axisFont}
          fill="#5c657b"
          fontFamily="'JetBrains Mono', monospace"
        >
          {m}
        </text>
      ))}

      <path d={areaPath} fill="url(#eq-area)" />
      <path
        d={linePath}
        fill="none"
        stroke="#448aff"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* end marker + direct label */}
      <circle cx={x(VALUES.length - 1)} cy={y(last)} r="4" fill="#448aff" stroke="#0a0e16" strokeWidth="2" />
      <text
        x={x(VALUES.length - 1) + 10}
        y={y(last) + 4}
        fontSize={labelFont}
        fontWeight="600"
        fill="#f2f4f8"
        fontFamily="'JetBrains Mono', monospace"
      >
        ${last.toLocaleString("en-US")}
      </text>
    </svg>
  );
}

function TrackingMockup() {
  return (
    <MockPanel label="OutlierQ · Paper portfolio">
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
              Portfolio value · 6 months
            </div>
            <div className="mt-1 font-mono text-2xl font-semibold tracking-tight text-headline sm:text-3xl">
              $12,310 <span className="text-base font-medium text-up sm:text-lg">+23.1%</span>
            </div>
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
            Weekly marks · simulated
          </div>
        </div>
        <div className="mt-4">
          <EquityChart />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-edge pt-5 sm:grid-cols-4">
          <StatCell label="Win rate" value="61.4%" valueClass="text-up" sub="vs 50% coin-flip" />
          <StatCell label="Signals tracked" value="312" />
          <StatCell label="Avg hold" value="4.2 days" />
          <StatCell label="Max drawdown" value="-4.9%" valueClass="text-down" />
        </div>
      </div>
    </MockPanel>
  );
}

export default function TrackingSection() {
  return (
    <Section
      id="tracking"
      kicker="03 · Tracking & calibration"
      headline={
        <>
          Every signal gets graded.
          <br className="hidden sm:block" /> No exceptions.
        </>
      }
      lede="A signal you never score is just an opinion. OutlierQ evaluates each recommendation against actual market movement using Black-Scholes options P&L, and feeds the results straight back into how confident the next signal is allowed to be."
      mockup={<TrackingMockup />}
      cards={[
        {
          title: "Black-Scholes P&L",
          body: "Each options signal is marked against modeled option value at evaluation time, not just the underlying's direction. Being right late still counts as being wrong.",
        },
        {
          title: "Confidence calibration",
          body: "Realized win rates flow back into the confidence model. A signal type that stops working gets its confidence cut automatically — no manual overrides.",
        },
        {
          title: "Full audit trail",
          body: "Every signal, entry assumption, and outcome is stored in SQL. The whole track record can be recomputed from raw events at any time.",
        },
      ]}
      glowSide="left"
    />
  );
}
