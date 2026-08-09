import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Deployed at https://aarinb1.github.io/OutlierQ/ — GitHub Pages serves the site
// from a repo subpath, so assets must be requested from /OutlierQ/.
// Override with PAGES_BASE to move to a custom domain (PAGES_BASE=/ npm run build).
// Everything in the app derives its links from import.meta.env.BASE_URL, so this
// is the only place the deploy path is written down.
export default defineConfig({
  base: process.env.PAGES_BASE ?? "/OutlierQ/",
  plugins: [react()],
  build: {
    // The landing page must stay well under a 120 kB gzip JS budget; warn early.
    chunkSizeWarningLimit: 200,
  },
});
