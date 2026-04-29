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
    // Vite only exposes VITE_* from .env files via import.meta.env; it
    // doesn't auto-pick up process.env. CI sets these via the workflow
    // `env:` block, so plumb them through here. Local dev still picks
    // up frontend/.env first; these are the fallbacks when no .env is
    // present (CI, fresh checkout without `cp .env.example .env`).
    env: {
      VITE_API_URL: process.env.VITE_API_URL ?? 'http://localhost:4000',
      VITE_APP_URL: process.env.VITE_APP_URL ?? 'http://localhost:5173',
      VITE_SENTRY_DSN: process.env.VITE_SENTRY_DSN ?? '',
    },
  },
});
