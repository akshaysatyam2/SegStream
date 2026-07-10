/**
 * Vite Configuration — SegStream Frontend
 *
 * Configured for React 19 with sensible defaults for a streaming
 * studio application. Dev server proxies API calls to the Python
 * backend running on port 8080.
 *
 * @author Akshay Satyam
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  server: {
    /* Dev server on port 5173 (Vite default) */
    port: 5173,
    open: true,

    /**
     * Proxy API and signaling requests to the Python backend.
     * In production, this would be handled by a reverse proxy (nginx, caddy).
     */
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/offer': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },

  build: {
    /* Target modern browsers — no need for legacy polyfills */
    target: 'es2022',
    outDir: 'dist',
    sourcemap: false,

    rollupOptions: {
      output: {
        /**
         * Manual chunk splitting for better caching:
         * - vendor: React + ReactDOM (rarely changes)
         * - app: our application code (changes often)
         */
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor';
          }
        },
      },
    },
  },
});
