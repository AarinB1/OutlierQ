import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Two builds share this config:
 *
 *   npm run build       -> dist/,      talks to FastAPI at /api (unchanged)
 *   npm run build:demo  -> dist-demo/, VITE_DEMO_MODE=true, fully static
 *
 * Only the demo branch changes `base` and `outDir`; everything else — including
 * the dev proxy — is identical in both modes.
 */
const isDemo = process.env.VITE_DEMO_MODE === 'true'

// GitHub Pages serves the dashboard under <PAGES_BASE>demo/ (project pages).
const pagesBase = process.env.PAGES_BASE ?? '/OutlierQ/'

export default defineConfig({
  plugins: [react()],
  // Fixture dates are anchored to build time so the demo always looks recent
  // and never drifts between page loads. Defined in both modes because
  // demo/demoConfig.ts (imported by Layout) references it unconditionally.
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  ...(isDemo
    ? {
        base: `${pagesBase}demo/`,
        build: {
          outDir: 'dist-demo',
          emptyOutDir: true,
        },
      }
    : {}),
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
