/** The page's single animated hero element: a synthetic signal tape.
 *
 *  Honesty constraints encoded here:
 *   • Real listed tickers carry only neutral/bullish rows, and their labels
 *     describe the *detector* ("options-flow outlier"), never an event at the
 *     company. Nothing here asserts a real company missed, was sued, or recalled.
 *   • Every bearish row uses a fictional ticker. NRVX / ALTQ / CDYN / VERQ were
 *     checked against the Nasdaq Trader symbol directory (13,114 US symbols) and
 *     SEC company_tickers.json (10,398 registrants) — none of them are listed.
 *   • The numeric column is labelled SCORE, not confidence, and the strip says
 *     so: these are illustrative detector scores, not calibrated confidences,
 *     so no win rate or calibrated probability appears without a sample size.
 *
 *  Animation is a pure CSS translate of a duplicated row group (see .tape-track
 *  in index.css) and is switched off entirely under prefers-reduced-motion. */

type Dir = "CALL" | "PUT" | "FLAT";

interface Row {
  t: string;
  /** Fictional ticker — required for any bearish row. */
  fake?: boolean;
  label: string;
  dir: Dir;
  score: string;
}

const ROWS: Row[] = [
  { t: "NVDA", label: "Options-flow outlier", dir: "CALL", score: "0.71" },
  { t: "NRVX", fake: true, label: "Sentiment reversal", dir: "PUT", score: "0.63" },
  { t: "MSFT", label: "News-volume z 2.8σ", dir: "CALL", score: "0.66" },
  { t: "COIN", label: "Volume anomaly", dir: "FLAT", score: "0.54" },
  { t: "ALTQ", fake: true, label: "Guidance-language shift", dir: "PUT", score: "0.58" },
  { t: "TSM", label: "Cross-source cluster", dir: "CALL", score: "0.69" },
  { t: "KO", label: "Baseline drift", dir: "FLAT", score: "0.51" },
  { t: "CDYN", fake: true, label: "Volatility expansion", dir: "PUT", score: "0.61" },
  { t: "AAPL", label: "Headline cluster", dir: "CALL", score: "0.64" },
  { t: "VERQ", fake: true, label: "Coverage-tone drift", dir: "PUT", score: "0.57" },
];

const dirClass: Record<Dir, string> = {
  CALL: "text-up",
  PUT: "text-down",
  FLAT: "text-muted",
};

function TapeRow({ row }: { row: Row }) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-r border-edge px-5 py-2.5">
      <span className="font-mono text-[13px] font-semibold tracking-tight text-headline">
        {row.t}
        {row.fake ? <span className="text-faint">*</span> : null}
      </span>
      <span className="whitespace-nowrap font-mono text-[11px] text-muted">{row.label}</span>
      <span className={`font-mono text-[11px] font-semibold ${dirClass[row.dir]}`}>{row.dir}</span>
      <span className="font-mono text-[11px] text-faint">{row.score}</span>
    </div>
  );
}

export default function SignalTape() {
  return (
    <div className="overflow-hidden rounded-xl border border-edge bg-panel/70">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-edge px-4 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
          Synthetic signal tape
        </span>
        <span className="font-mono text-[10px] tracking-wide text-faint">
          Illustrative detector scores · not calibrated confidence · * fictional ticker
        </span>
      </div>
      {/* Decorative for assistive tech; the sentence below carries the meaning. */}
      <div className="tape-mask overflow-hidden" aria-hidden="true">
        <div className="tape-track">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex">
              {ROWS.map((row) => (
                <TapeRow key={`${copy}-${row.t}`} row={row} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <p className="sr-only">
        Illustrative synthetic signal tape showing detector labels, directions, and scores for
        sample tickers. It is not market data and contains no claims about any real company.
      </p>
    </div>
  );
}
