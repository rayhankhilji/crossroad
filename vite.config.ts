import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Served from a project page at /crossroad/ in production, from the root in
  // development. Assets are hashed and relative, so nothing else has to change.
  base: process.env.GITHUB_PAGES === 'true' ? '/crossroad/' : '/',
  worker: {
    format: 'es',
  },
  build: {
    // The engine and the chart layer are both substantial and both load on the
    // same screen, so splitting them buys nothing but request count.
    chunkSizeWarningLimit: 700,
  },
});
