import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
    globals: false,
    clearMocks: true,
    // Per-test timeout (default 5s is fine for our integration tests).
    testTimeout: 15_000,
    // afterAll cleanup chains do many sequential deleteMany calls across
    // several orgs. Local Postgres handles that in milliseconds, but
    // remote Neon (~50ms RTT) can push past the 10s default. Bump for
    // contributors running tests against a remote dev branch.
    hookTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/__tests__/**', 'src/index.ts', 'src/lib/env.ts'],
    },
  },
});
