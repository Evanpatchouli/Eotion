import { randomUUID } from 'node:crypto'
import { defineConfig } from '@playwright/test'

const database = `eotion_p54_browser_${randomUUID().replaceAll('-', '')}`
const mongoUri = new URL(process.env.P4_TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/?replicaSet=rs0')
mongoUri.pathname = `/${database}`
const apiPort = process.env.EOTION_REAL_API_PORT ?? '7137'
const webPort = process.env.EOTION_REAL_WEB_PORT ?? '4173'
const apiOrigin = `http://127.0.0.1:${apiPort}`
const webOrigin = `http://127.0.0.1:${webPort}`

export default defineConfig({
  metadata: { eotionRealMongoUri: mongoUri.toString() },
  testDir: './tests',
  testMatch: 'product-sync-real.spec.ts',
  workers: 1,
  timeout: 120_000,
  use: {
    baseURL: webOrigin,
    browserName: 'chromium',
    channel: 'chrome',
  },
  webServer: [
    {
      command: 'node scripts/fake-oss-server.mjs',
      url: 'http://127.0.0.1:7141/health',
      reuseExistingServer: false,
      timeout: 10_000,
    },
    {
      command: 'pnpm --filter @eotion/api start',
      url: `${apiOrigin}/api/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        MONGODB_URI: mongoUri.toString(),
        PORT: apiPort,
        WEB_ORIGIN: webOrigin,
        ALI_OSS_SERVER_URL: 'http://127.0.0.1:7141',
        ALI_OSS_CLIENT_ID: 'eotion-real-sync-test',
        ALI_OSS_CLIENT_SECRET: 'synthetic-test',
      },
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
