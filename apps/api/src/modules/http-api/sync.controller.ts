import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { SyncOperationSchema } from '@eotion/contracts'
import type { UserRecord } from '../server-domain/types'
import { SyncService } from '../server-domain/services/sync.service'
import { CurrentUser, SessionAuthGuard } from './auth.transport'
import { parseBody } from './validation'

@Controller('sync/operations')
@UseGuards(SessionAuthGuard)
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post()
  send(@CurrentUser() user: UserRecord, @Body() body: unknown) {
    return this.sync.apply(user.id, parseBody(SyncOperationSchema, body))
  }
}
