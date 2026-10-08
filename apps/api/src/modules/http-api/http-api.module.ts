import { Module, type OnModuleInit } from '@nestjs/common'
import { APP_GUARD, HttpAdapterHost } from '@nestjs/core'
import { AuthController } from './auth.controller'
import { BlockController } from './block.controller'
import { PageController } from './page.controller'
import { SameOriginGuard } from './same-origin.guard'
import { SessionAuthGuard } from './auth.transport'
import { WorkspaceController } from './workspace.controller'
import { SyncController } from './sync.controller'
import { FileController } from './file.controller'
import { DatabaseController } from './database.controller'
import { ServerDomainModule } from '../server-domain/server-domain.module'

@Module({
  imports: [ServerDomainModule],
  controllers: [AuthController, WorkspaceController, PageController, BlockController, SyncController, FileController, DatabaseController],
  providers: [SessionAuthGuard, { provide: APP_GUARD, useClass: SameOriginGuard }],
})
export class HttpApiModule implements OnModuleInit {
  constructor(private readonly adapterHost: HttpAdapterHost) {}

  onModuleInit(): void {
    const fastify = this.adapterHost.httpAdapter.getInstance()
    fastify.removeContentTypeParser('application/octet-stream')
    fastify.addContentTypeParser('application/octet-stream', (_request: unknown, payload: unknown, done: (error: Error | null, body?: unknown) => void) => {
      done(null, payload)
    })
  }
}
