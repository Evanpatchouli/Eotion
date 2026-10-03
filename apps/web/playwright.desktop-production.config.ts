import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: 'desktop-production-real.spec.ts',
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: 'list',
  use: {
    browserName: 'chromium',
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
})
