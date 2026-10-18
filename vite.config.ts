import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
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
