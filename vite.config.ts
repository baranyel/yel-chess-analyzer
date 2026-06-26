import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'

// Dev-mode middleware: serve .wasm files with the correct MIME type so that
// WebAssembly.instantiateStreaming() doesn't reject the response.
const wasmMimePlugin: Plugin = {
  name: 'wasm-content-type',
  configureServer(server) {
    server.middlewares.use((_req, res, next) => {
      if (_req.url?.endsWith('.wasm')) {
        res.setHeader('Content-Type', 'application/wasm');
      }
      next();
    });
  },
}

export default defineConfig({
  // On GitHub Pages the site lives at /repo-name/, set via VITE_BASE_URL in CI.
  base: process.env.VITE_BASE_URL ?? '/',
  plugins: [react(), tailwindcss(), wasmMimePlugin],
  optimizeDeps: {
    exclude: ['stockfish'],
  },
})
