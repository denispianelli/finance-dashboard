import { defineConfig } from '@playwright/test';

// Dedicated config for the screenshot harness so it never runs as part of the
// E2E suite (testDir ./tests/e2e). Single worker, generous timeout (it seeds
// data + captures 14 screens in one run).
export default defineConfig({
  testDir: './tests/screenshots',
  timeout: 180_000,
  retries: 0,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
});
