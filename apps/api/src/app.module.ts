import 'dotenv/config'

import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'

import { HealthModule } from './modules/health/health.module'
import { HttpApiModule } from './modules/http-api/http-api.module'
import { McpModule } from './modules/mcp/mcp.module'

const mongoUri = process.env.MONGODB_URI?.trim()
const mongoImports = mongoUri
  ? [
      MongooseModule.forRoot(mongoUri, {
        serverSelectionTimeoutMS: 5000,
      }),
    ]
  : []

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ...mongoImports,
    ...(mongoUri ? [HttpApiModule, McpModule] : []),
    HealthModule,
  ],
})
export class AppModule {}
