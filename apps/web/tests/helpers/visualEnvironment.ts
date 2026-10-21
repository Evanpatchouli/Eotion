import { execFileSync } from 'node:child_process'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type FullConfig } from '@playwright/test'

const manifestUrl = new URL('../visual-regression.spec.ts-snapshots/environment.json', import.meta.url)

export default async function visualEnvironment(config: FullConfig) {
  const expected = JSON.parse(readFileSync(manifestUrl, 'utf8')) as Record<string, unknown>
  const system = JSON.parse(execFileSync('pwsh', [
    '-NoProfile', '-NonInteractive', '-File',
    fileURLToPath(new URL('../../scripts/read-visual-environment.ps1', import.meta.url)),
  ], { encoding: 'utf8' })) as Record<string, unknown>
  const browser = await chromium.launch({ channel: 'chrome' })
  let browserVersion: string
  try {
    browserVersion = browser.version()
  } finally {
    await browser.close()
  }
  const require = createRequire(import.meta.url)
  const actual = {
    ...system,
    browserVersion,
    playwrightVersion: (require('@playwright/test/package.json') as { version: string }).version,
  }
  const outputDirectory = config.projects[0]!.outputDir
  mkdirSync(outputDirectory, { recursive: true })
  writeFileSync(join(outputDirectory, 'visual-environment.json'), `${JSON.stringify({
    capturedAt: new Date().toISOString(), ...actual,
  }, null, 2)}\n`)
  config.metadata.visualEnvironment = actual
  const differences = Object.keys(expected).filter(key =>
    JSON.stringify(expected[key]) !== JSON.stringify(actual[key as keyof typeof actual]))
  if (differences.length) {
    throw new Error(`Visual environment mismatch: ${differences.join(', ')}. Review visual-environment.json in ${outputDirectory} against ${fileURLToPath(manifestUrl)}. Restore the reviewed environment or deliberately review new screenshots and the baseline environment; do not automatically update snapshots or system settings.`)
  }
}
