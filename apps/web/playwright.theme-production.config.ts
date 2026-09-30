import { defineConfig } from '@playwright/test'

process.env.EOTION_THEME_PRODUCTION = '1'

export default defineConfig({
  testDir: './tests',
  testMatch: 'theme-production.spec.ts',
  use: {
    baseURL: 'http://127.0.0.1:4175',
    browserName: 'chromium',
    channel: 'chrome',
  },
  webServer: {
    command: 'pnpm build && pnpm exec vite preview --host 127.0.0.1 --port 4175 --strictPort',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
