import { Controller, Get } from '@nestjs/common'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type RootManifest = {
  version: string
  eotion?: {
    buildNumber?: number
  }
}

const rootManifest = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../..', 'package.json'), 'utf8'),
) as RootManifest

const buildNumber = rootManifest.eotion?.buildNumber
if (
  typeof buildNumber !== 'number' ||
  !Number.isSafeInteger(buildNumber) ||
  buildNumber < 1
) {
  throw new Error('Invalid root package.json eotion.buildNumber')
}

const gitSha = (process.env.GIT_SHA?.trim() || 'unknown').slice(0, 12)

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      name: 'eotion-api',
      status: 'ok',
      version: rootManifest.version,
      buildNumber,
      gitSha,
      timestamp: new Date().toISOString(),
      runtime: `node ${process.version}`,
      mongo: process.env.MONGODB_URI?.trim() ? 'configured' : 'disabled',
      redis: 'reserved',
      kafka: 'reserved',
    }
  }
}
