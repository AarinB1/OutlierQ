import Icon from "./Icon";
import { GITHUB_URL, sourceUrl } from "../lib/site";

const rows = [
  { rule: "News volume spike", value: "z ≥ 3.0, 14-day window", file: "src/detection/__init__.py" },
  { rule: "Extreme article", value: "FinBERT p(pos or neg) ≥ 0.6", file: "src/detection/finbert_analyzer.py" },
  { rule: "Tone gate", value: "≥ 50% of articles extreme", file: "src/detection/sentiment_filter.py" },
  { rule: "Independent sources", value: "≥ 2 distinct outlets", file: "src/detection/cross_source.py" },
  { rule: "Options-only event", value: "conviction ≥ 0.7, ≥ 3 contracts", file: "src/detection/__init__.py" },
  { rule: "Calibrator active", value: "n ≥ 40, both outcomes", file: "src/signals/confidence_calibrator.py" },
  { rule: "Arbitrage flag", value: "spread ≥ 3¢, match ≥ 0.55", file: "src/predictions/arbitrage_detector.py" },
];

export default function Parameters() {
  return (
    <section aria-labelledby="params-title" className="border-y border-line bg-paper-2 py-16 sm:py-20">
      <div className="wrap grid items-center gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
        <div>
          <p className="eyebrow">04 / Rules over results</p>
          <h2 id="params-title" className="heading mt-5 text-ink" style={{ fontSize: "clamp(2.1rem, 3.3vw, 2.6rem)" }}>
            Numbers with
            <br />
            their source attached.
          </h2>
          <p className="my-6 max-w-[26rem] text-[15px] leading-[1.85] text-muted">
            OutlierQ has no real track record to show, so this page shows its rules instead. Each
            one is a default you can find, change, and re-run.
          </p>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="text-link">
            Browse the source
            <Icon name="arrow-up-right" className="h-4 w-4" />
          </a>
        </div>

        <div className="rounded-md border border-line-2 bg-paper p-5 sm:p-6">
          <div className="label mb-4 flex flex-wrap justify-between gap-2 text-faint">
            <span>Documented defaults</span>
            <span>main branch</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[20rem] border-collapse text-left">
              <thead>
                <tr className="label text-faint">
                  <th className="border-b border-line py-2.5 pr-4 font-normal">Rule and where it lives</th>
                  <th className="border-b border-line py-2.5 text-right font-normal">Default</th>
                </tr>
              </thead>
              <tbody className="text-[14px]">
                {rows.map((r) => (
                  <tr key={r.rule}>
                    <td className="border-b border-line py-3 pr-4">
                      <span className="block text-ink">{r.rule}</span>
                      <a
                        href={sourceUrl(r.file)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block break-all font-mono text-[12px] text-muted underline decoration-line-2 underline-offset-4 transition-colors hover:text-accent"
                      >
                        {r.file.replace("src/", "")}
                      </a>
                    </td>
                    <td className="border-b border-line py-3 text-right align-middle">
                      <span className="inline-block rounded bg-paper-3 px-2 py-1 text-left font-mono text-[12px] text-body">
                        {r.value}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-[13px] leading-[1.75] text-muted">
            The <code className="font-mono text-[12px]">--demo</code> flag relaxes the tone and source
            gates (p ≥ 0.3, 5% extreme, 1 source) so ordinary days still produce signals for
            screenshots. Signals from that mode should not be read as results.
          </p>
        </div>
      </div>
    </section>
  );
}
