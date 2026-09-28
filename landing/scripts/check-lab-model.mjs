/**
 * Guards the Signal lab against drifting from the pipeline it models.
 *
 *   cd landing && npm run check:lab
 *
 * 1. Reads the Python defaults straight from source (no import, so no torch or
 *    FinBERT) and fails if any constant in src/lab/model.ts disagrees. The old
 *    landing page claimed a 2.5σ threshold while the code used 3.0σ; this is
 *    the check that would have caught it.
 * 2. Runs every scenario and asserts the outcomes the page's copy promises
 *    (a quiet day produces nothing, one outlet is rejected at sources, ...).
 *
 * esbuild is not a direct dependency: it ships with Vite, which this package
 * already requires to build at all.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const landing = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(landing, "..");

const out = await build({
  entryPoints: [join(landing, "src/lab/model.ts")],
  bundle: true,
  format: "esm",
  write: false,
  logLevel: "silent",
});
const M = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);

const py = async (path) => readFile(join(repo, path), "utf8");
const num = (src, re, what) => {
  const m = src.match(re);
  assert.ok(m, `could not find ${what} in the Python source; update this check`);
  return Number(m[1]);
};

const detection = await py("src/detection/__init__.py");
const finbert = await py("src/detection/finbert_analyzer.py");
const calibrator = await py("src/signals/confidence_calibrator.py");
const tracker = await py("src/signals/feedback_tracker.py");

const pairs = [
  ["Z_THRESHOLD", M.Z_THRESHOLD, num(detection, /volume_threshold: float = ([\d.]+)/, "volume_threshold")],
  ["EXTREME_PROB", M.EXTREME_PROB, num(detection, /_PROD_SENTIMENT_THRESHOLD = ([\d.]+)/, "_PROD_SENTIMENT_THRESHOLD")],
  ["EXTREME_PROB (analyzer)", M.EXTREME_PROB, num(finbert, /extreme_threshold: float = ([\d.]+)/, "extreme_threshold")],
  ["EXTREME_RATIO", M.EXTREME_RATIO, num(detection, /_PROD_EXTREME_RATIO = ([\d.]+)/, "_PROD_EXTREME_RATIO")],
  ["MIN_SOURCES", M.MIN_SOURCES, num(detection, /_PROD_MIN_SOURCES = (\d+)/, "_PROD_MIN_SOURCES")],
  ["OPTIONS_ONLY_CONVICTION", M.OPTIONS_ONLY_CONVICTION, num(detection, /"max_conviction", 0\.0\) >= ([\d.]+)/, "options-only conviction")],
  ["OPTIONS_ONLY_CONTRACTS", M.OPTIONS_ONLY_CONTRACTS, num(detection, /"unusual_contract_count", 0\) >= (\d+)/, "options-only contracts")],
  ["CALIBRATOR_MIN_SAMPLES", M.CALIBRATOR_MIN_SAMPLES, num(calibrator, /^MIN_SAMPLES = (\d+)/m, "MIN_SAMPLES")],
  ["RISK_FREE_RATE", M.RISK_FREE_RATE, num(tracker, /^RISK_FREE_RATE = ([\d.]+)/m, "RISK_FREE_RATE")],
];
for (const [name, lab, pipeline] of pairs) {
  assert.equal(lab, pipeline, `${name}: lab uses ${lab}, pipeline default is ${pipeline}`);
}

const run = Object.fromEntries(M.SCENARIOS.map((s) => [s.id, M.runScenario(s)]));
const statuses = (id) => run[id].steps.map((s) => `${s.stage}:${s.status}`).join(" ");

assert.equal(statuses("earnings-miss"), "volume:pass sentiment:pass sources:pass options:adjust signal:pass grade:pass");
assert.equal(run["earnings-miss"].signal.direction, "put");
assert.equal(statuses("one-source"), "volume:pass sentiment:pass sources:fail options:skip signal:skip grade:skip");
assert.equal(run["quiet"].signal, null, "a quiet day must produce nothing");
assert.equal(run["options-only"].signal.source, "options_flow");
assert.equal(run["options-only"].grade.outcome, "expired", "the lab promises a graded loss");
// signal_engine.py compute_expiry rounds to Friday; entry is a Monday (day 0).
assert.deepEqual([[5, 14, "spike_fade"], [7, 21, "moderate"], [14, 30, "sustained"]].map((a) => M.computeExpiryDays(...a)), [11, 18, 32]);

console.log(`signal lab: ${pairs.length} constants match the pipeline, ${M.SCENARIOS.length} scenarios behave as documented`);
