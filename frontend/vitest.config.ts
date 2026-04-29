import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    include: ['src/**/__tests__/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    globals: false,
    clearMocks: true,
    css: false,
    // VITE_* env values come from frontend/.env.test (auto-loaded by
    // Vite in test mode). The earlier attempt to set them via test.env
    // here looked correct but only populated process.env — Vite's
    // import.meta.env replacement happens at transform time and only
    // reads .env* files.
  },
});
