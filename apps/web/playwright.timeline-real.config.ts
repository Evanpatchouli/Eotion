import { randomUUID } from 'node:crypto'
import { defineConfig } from '@playwright/test'

const suppliedMongoUri = process.env.P4_TEST_MONGODB_URI
if (!suppliedMongoUri?.trim()) {
  throw new Error('P4_TEST_MONGODB_URI must point to an isolated test MongoDB before running timeline real tests.')
}

const database = `eotion_timeline_browser_${randomUUID().replaceAll('-', '')}`
const mongoUri = new URL(suppliedMongoUri)
mongoUri.pathname = `/${database}`
const apiPort = process.env.EOTION_TIMELINE_REAL_API_PORT ?? '7157'
const webPort = process.env.EOTION_TIMELINE_REAL_WEB_PORT ?? '4175'
const apiOrigin = `http://127.0.0.1:${apiPort}`
const webOrigin = `http://127.0.0.1:${webPort}`

export default defineConfig({
  metadata: { eotionTimelineRealMongoUri: mongoUri.toString() },
  testDir: './tests',
  testMatch: 'product-timeline-real.spec.ts',
  workers: 1,
  timeout: 120_000,
  use: {
    baseURL: webOrigin,
    browserName: 'chromium',
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  reporter: [['list'], ['json', { outputFile: 'test-results/timeline-real-report.json' }]],
  webServer: [
    {
      command: 'pnpm --filter @eotion/api start',
      url: `${apiOrigin}/api/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { MONGODB_URI: mongoUri.toString(), PORT: apiPort, WEB_ORIGIN: webOrigin },
    },
    {
      command: `pnpm exec vite preview --host 127.0.0.1 --port ${webPort} --strictPort`,
      url: webOrigin,
      env: { EOTION_API_PROXY_TARGET: apiOrigin },
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
})
