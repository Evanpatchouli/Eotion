import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { AuthController } from './auth.controller'
import { BlockController } from './block.controller'
import { PageController } from './page.controller'
import { SameOriginGuard } from './same-origin.guard'
import { SessionAuthGuard } from './auth.transport'
import { WorkspaceController } from './workspace.controller'
import { SyncController } from './sync.controller'
import { ServerDomainModule } from '../server-domain/server-domain.module'

@Module({
  imports: [ServerDomainModule],
  controllers: [AuthController, WorkspaceController, PageController, BlockController, SyncController],
  providers: [SessionAuthGuard, { provide: APP_GUARD, useClass: SameOriginGuard }],
})
export class HttpApiModule {}
