import { defineConfig } from '@playwright/test'

process.env.EOTION_EDITOR_PRODUCTION = '1'

export default defineConfig({
  testDir: './tests',
  testMatch: 'editor-foundation-production.spec.ts',
  use: {
    baseURL: 'http://127.0.0.1:4176',
    browserName: 'chromium',
    channel: 'chrome',
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'pnpm build && pnpm exec vite preview --host 127.0.0.1 --port 4176 --strictPort',
    url: 'http://127.0.0.1:4176',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
