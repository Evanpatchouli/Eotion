import { randomUUID } from 'node:crypto'
import { defineConfig } from '@playwright/test'

const database = `eotion_p54_browser_${randomUUID().replaceAll('-', '')}`
const mongoUri = new URL(process.env.P4_TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/?replicaSet=rs0')
mongoUri.pathname = `/${database}`

export default defineConfig({
  metadata: { eotionRealMongoUri: mongoUri.toString() },
  testDir: './tests',
  testMatch: 'product-sync-real.spec.ts',
  workers: 1,
  timeout: 120_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
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
      url: 'http://127.0.0.1:7137/api/health',
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        MONGODB_URI: mongoUri.toString(),
        PORT: '7137',
        WEB_ORIGIN: 'http://127.0.0.1:4173',
        ALI_OSS_SERVER_URL: 'http://127.0.0.1:7141',
        ALI_OSS_CLIENT_ID: 'eotion-real-sync-test',
        ALI_OSS_CLIENT_SECRET: 'synthetic-test',
      },
    },
    {
      command: 'pnpm --filter @eotion/web preview',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
})
