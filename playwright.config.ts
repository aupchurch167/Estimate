import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config (Phase 9.4).
 *
 * Local: `npm run test:e2e` boots backend + frontend via `npm run dev`
 * (with E2E_FAKE_ANTHROPIC=true so AI calls never touch the network) and
 * runs the suite against http://localhost:5173.
 *
 * CI: the same script. Set CI=true so retries kick in and traces are
 * captured on first failure.
 *
 * Browser binaries are downloaded with `npx playwright install` — that
 * step is intentionally excluded from `npm install` so the repo stays
 * lightweight. Run it once before the first `test:e2e`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['line']] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'E2E_FAKE_ANTHROPIC=true npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
