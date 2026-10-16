import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    // Real Dexie on an in-memory IndexedDB.
    setupFiles: ['fake-indexeddb/auto'],
  },
});
