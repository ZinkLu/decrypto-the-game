import { defineConfig } from 'vite';

// The new three.js frontend is a standalone package (webgl/), independent from
// the legacy web/ package. The Go server serves web/dist at runtime, so the
// production build writes there (see HANDOFF_THREEJS.md: no Go changes).
export default defineConfig({
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
  build: {
    outDir: '../web/dist',
    emptyOutDir: true,
  },
});
