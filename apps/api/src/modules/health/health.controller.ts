import { Controller, Get } from '@nestjs/common'

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      name: 'eotion-api',
      status: 'ok',
      timestamp: new Date().toISOString(),
      runtime: `node ${process.version}`,
      mongo: process.env.MONGODB_URI?.trim() ? 'configured' : 'disabled',
      redis: 'reserved',
      kafka: 'reserved',
    }
  }
}
