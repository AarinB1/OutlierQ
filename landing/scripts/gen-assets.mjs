/**
 * Rasterises public/og.svg -> public/og.png (1200x630) and public/favicon.svg ->
 * public/favicon-32.png + public/apple-touch-icon.png (180x180).
 *
 * The PNGs are committed, so this is an authoring tool, not a build step —
 * `npm run build` never invokes it and the landing page has zero new npm
 * dependencies. It drives the Chromium that is already installed globally with
 * Playwright rather than adding a rasteriser to package.json:
 *
 *     cd landing && node scripts/gen-assets.mjs
 *
 * Re-run it after editing either SVG. Fonts are self-hosted in public/fonts and
 * loaded via @font-face here, so the rendered PNG uses the same faces as the
 * page rather than whatever Chromium falls back to.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");

/** Resolve Playwright from wherever it lives — a local install if one exists,
 *  otherwise the global npm root. ESM ignores NODE_PATH, hence the explicit
 *  resolve rather than a bare `import "playwright"`. */
async function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const candidates = [root];
  try {
    candidates.push(execSync("npm root -g", { encoding: "utf8" }).trim());
  } catch {
    /* npm unavailable; fall through to the local lookup only */
  }
  for (const base of candidates) {
    try {
      const mod = await import(
        pathToFileURL(require.resolve("playwright", { paths: [base] })).href
      );
      // Playwright ships CJS, so named exports may only exist on `default`.
      return mod.chromium ? mod : mod.default;
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error(
    "Playwright not found. Install it globally (npm i -g playwright) — it is deliberately " +
      "not a dependency of this package, because the PNGs it produces are committed."
  );
}

const { chromium } = await loadPlaywright();

const FONT_CSS = `
  @font-face {
    font-family: 'IBM Plex Sans';
    src: url('data:font/woff2;base64,__PLEX__') format('woff2');
    font-weight: 400 700;
  }
  @font-face {
    font-family: 'JetBrains Mono';
    src: url('data:font/woff2;base64,__MONO__') format('woff2');
    font-weight: 400 600;
  }
`;

async function fontCss() {
  const plex = await readFile(join(pub, "fonts/ibm-plex-sans-latin-var.woff2"));
  const mono = await readFile(join(pub, "fonts/jetbrains-mono-latin-var.woff2"));
  return FONT_CSS.replace("__PLEX__", plex.toString("base64")).replace(
    "__MONO__",
    mono.toString("base64")
  );
}

async function render(page, svgPath, outPath, width, height) {
  const svg = await readFile(join(pub, svgPath), "utf8");
  const css = await fontCss();
  await page.setViewportSize({ width, height });
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>
       ${css}
       *{margin:0;padding:0}
       html,body{width:${width}px;height:${height}px;background:#05070b;overflow:hidden}
       svg{display:block;width:${width}px;height:${height}px}
     </style>${svg}`,
    { waitUntil: "load" }
  );
  await page.evaluate(() => document.fonts.ready);
  const buf = await page.screenshot({
    type: "png",
    clip: { x: 0, y: 0, width, height },
  });
  await writeFile(join(pub, outPath), buf);
  console.log(`${outPath.padEnd(24)} ${width}x${height}  ${buf.length} bytes`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
await render(page, "og.svg", "og.png", 1200, 630);
await render(page, "favicon.svg", "favicon-32.png", 32, 32);
await render(page, "favicon.svg", "apple-touch-icon.png", 180, 180);
await browser.close();
