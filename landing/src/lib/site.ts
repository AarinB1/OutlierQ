/** Single source of truth for outbound links.
 *
 *  BASE is injected by Vite from `base` in vite.config.ts (itself read from
 *  PAGES_BASE), and always ends in "/". Building the demo href from it means a
 *  custom-domain move is a one-line change in vite.config.ts, not a grep. */
export const BASE: string = import.meta.env.BASE_URL;

/** Static dashboard demo, deployed alongside this page. Synthetic fixtures only. */
export const DEMO_URL = `${BASE}demo/`;

/** Human-readable form of DEMO_URL, used in the mock browser address bar. */
export const DEMO_URL_DISPLAY = `aarinb1.github.io${DEMO_URL}`;

export const GITHUB_URL = "https://github.com/AarinB1/OutlierQ";

/** Label used everywhere the demo is referenced. Never "live" — the deployed
 *  dashboard is a static build over baked synthetic fixtures. */
export const DEMO_LABEL = "Interactive demo";
export const DEMO_SUBLABEL = "Synthetic data";
