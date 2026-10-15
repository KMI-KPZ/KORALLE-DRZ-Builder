/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `npm run build` produces the regular app for deployment (dist/).
// `npm run build:single` produces one self-contained HTML file (dist-single/) for sharing a preview.
export default defineConfig(({ mode }) => ({
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react()],
  base: './',
  server: {
    // Set by docker-compose (profile "dev"): bind mounts on Windows/macOS need polling to see file changes.
    watch: process.env.VITE_USE_POLLING === 'true' ? { usePolling: true, interval: 300 } : undefined,
    // Backend API (simulation engine). Default: engine dev server of backend/ on port 8000.
    proxy: { '/api': { target: process.env.VITE_API_PROXY ?? 'http://127.0.0.1:8000', changeOrigin: true } },
  },
  preview: {
    proxy: { '/api': { target: process.env.VITE_API_PROXY ?? 'http://127.0.0.1:8000', changeOrigin: true } },
  },
  build: mode === 'single' ? { outDir: 'dist-single', chunkSizeWarningLimit: 4000 } : { chunkSizeWarningLimit: 2500 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}))
