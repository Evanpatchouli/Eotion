import { Module } from '@nestjs/common'

import { ServerDomainModule } from '../server-domain/server-domain.module'
import { SessionAuthGuard } from '../http-api/auth.transport'
import { McpTokenController } from './mcp-token.controller'
import { McpService } from './mcp.service'

@Module({
  imports: [ServerDomainModule],
  controllers: [McpTokenController],
  providers: [SessionAuthGuard, McpService],
})
export class McpModule {}
