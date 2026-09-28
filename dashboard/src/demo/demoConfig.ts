/**
 * Demo-mode configuration.
 *
 * This is the ONLY demo module that the normal (non-demo) bundle touches:
 * `Layout.tsx` imports `DEMO_MODE` from here to render the honesty badge and
 * to filter the sidebar nav. It deliberately has no imports of its own and no
 * fixture data, so pulling it into the normal build costs a handful of
 * constants that Rollup folds away.
 *
 * `DEMO_MODE` is written so that Vite's static replacement of
 * `import.meta.env.VITE_DEMO_MODE` turns it into `false` in a normal build
 * (`undefined === 'true'`), letting Rollup eliminate every `if (DEMO_MODE)`
 * branch — and with them the dynamic imports of the fixture modules.
 */

export const DEMO_MODE: boolean = import.meta.env.VITE_DEMO_MODE === 'true'

/** Injected by Vite `define` at build time (see vite.config.ts). */
export const BUILD_TIME: string = __BUILD_TIME__

/** Fixed seed — the whole dataset is reproducible from this number alone. */
export const DEMO_SEED = 20260817

/** Simulated network latency window (ms). Skeletons/stagger need time to run. */
export const LATENCY_MIN_MS = 120
export const LATENCY_MAX_MS = 400

/** Extra think-time for POST endpoints that "do work" server-side. */
export const ACTION_LATENCY_MIN_MS = 700
export const ACTION_LATENCY_MAX_MS = 1500

/** Synthetic signal stream cadence. */
export const STREAM_INTERVAL_MS = 25_000
export const STREAM_FIRST_DELAY_MS = 9_000

/** Window of history the fixtures cover. */
export const SIGNAL_WINDOW_DAYS = 90

export const REPO_URL = 'https://github.com/AarinB1/OutlierQ'

/** sessionStorage key for the first-visit notice (session-scoped by design). */
export const NOTICE_DISMISS_KEY = 'outlierq-demo-notice-dismissed'
