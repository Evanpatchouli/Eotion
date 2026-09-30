import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { SyncOperationSchema } from '@eotion/contracts'
import type { UserRecord } from '../server-domain/types'
import { SyncService } from '../server-domain/services/sync.service'
import { CurrentUser, SessionAuthGuard } from './auth.transport'
import { parseBody } from './validation'

@Controller('sync')
@UseGuards(SessionAuthGuard)
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('operations')
  send(@CurrentUser() user: UserRecord, @Body() body: unknown) {
    return this.sync.apply(user.id, parseBody(SyncOperationSchema, body))
  }

  @Get('workspaces/:workspaceId/snapshot')
  snapshot(@CurrentUser() user: UserRecord, @Param('workspaceId') workspaceId: string) {
    return this.sync.snapshot(user.id, workspaceId)
  }
}
