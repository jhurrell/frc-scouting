import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { serviceWorkerPlugin } from './src/pwa/serviceWorkerPlugin.ts';

export default defineConfig({
  // Relative paths, so the same build works at a GitHub Pages project address (/frc-scouting/) or anywhere else.
  base: './',
  plugins: [react(), serviceWorkerPlugin('src/pwa/serviceWorker.js')],
  build: {
    // One bundle on purpose: the app runs offline, and a piece loaded later can fail to load with no connection.
    // The QR libraries take it past Vite's default warning of 500 kB.
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'node',
    // Real Dexie on an in-memory IndexedDB.
    setupFiles: ['fake-indexeddb/auto'],
  },
});
