import { defineConfig } from 'vite';

// base: './' is load-bearing: the bundle runs unmodified under /g/zoomway/ on the site
// and at the root in dev (design §12).
export default defineConfig({
  base: './',
  server: { port: 5193, host: true },
  preview: { port: 4193 },
  build: {
    target: 'es2020',
    // Three.js alone is ~550 kB minified; the 1.5 MiB total budget in
    // scripts/check-licenses.mjs is the real gate.
    chunkSizeWarningLimit: 1600,
  },
});
