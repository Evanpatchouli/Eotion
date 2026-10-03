import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4174',
    channel: 'chrome',
    locale: 'zh-CN',
    colorScheme: 'light',
    reducedMotion: 'reduce',
  },
  webServer: {
    command: 'pnpm preview',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
