import 'dotenv/config'

import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'

import { HealthModule } from './modules/health/health.module'
import { ServerDomainModule } from './modules/server-domain/server-domain.module'

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
    ...(mongoUri ? [ServerDomainModule] : []),
    HealthModule,
  ],
})
export class AppModule {}
