/** Single source of truth for outbound links.
 *
 *  BASE is injected by Vite from `base` in vite.config.ts (itself read from
 *  PAGES_BASE), and always ends in "/". Building the demo href from it means a
 *  custom-domain move is a one-line change in vite.config.ts, not a grep. */
export const BASE: string = import.meta.env.BASE_URL;

/** Static dashboard demo, deployed alongside this page. Synthetic fixtures only. */
export const DEMO_URL = `${BASE}demo/`;

export const GITHUB_URL = "https://github.com/AarinB1/OutlierQ";
export const AUTHOR_URL = "https://aarinbasu.com";

/** Link to a file on the default branch, for "where does this rule live". */
export const sourceUrl = (path: string) => `${GITHUB_URL}/blob/main/${path}`;
