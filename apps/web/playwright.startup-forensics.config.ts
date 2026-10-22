import { defineConfig } from '@playwright/test'
import baseConfig from './playwright.config'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const runDir = process.env.FORENSICS_RUN_DIR
if (!runDir) throw new Error('FORENSICS_RUN_DIR must point to the diagnostic evidence directory')
const baseURL = process.env.FORENSICS_BASE_URL ?? baseConfig.use?.baseURL

// Cumulative target runs retain successful traces too, so a non-reproduction
// still has its complete startup sequence. Both modes record while running.
const trace = process.env.FORENSICS_TRACE === 'on' || path.basename(runDir).startsWith('b-')
  ? 'on'
  : 'retain-on-failure'

export default defineConfig({
  ...baseConfig,
  testMatch: 'forensics--*.spec.ts',
  workers: 1,
  retries: 0,
  reporter: [
    [fileURLToPath(new URL('../../tools/startup-forensics/reporter.mjs', import.meta.url)), { runDir }],
    ['json', { outputFile: path.join(runDir, 'results.json') }],
    ['line'],
  ],
  use: {
    ...baseConfig.use,
    baseURL,
    trace,
    screenshot: 'only-on-failure',
  },
  webServer: undefined,
})
