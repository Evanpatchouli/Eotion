import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { BlockRepository } from './repositories/block.repository'
import { FileMetadataRepository } from './repositories/file-metadata.repository'
import { PageRepository } from './repositories/page.repository'
import { WorkspaceRepository } from './repositories/workspace.repository'
import { SessionRepository } from './repositories/session.repository'
import { UserRepository } from './repositories/user.repository'
import { BlockEntity, BlockSchema } from './schemas/block.schema'
import { FileMetadataEntity, FileMetadataSchema } from './schemas/file-metadata.schema'
import { PageEntity, PageSchema } from './schemas/page.schema'
import { WorkspaceEntity, WorkspaceSchema } from './schemas/workspace.schema'
import { SessionEntity, SessionSchema } from './schemas/session.schema'
import { UserEntity, UserSchema } from './schemas/user.schema'
import { BlockService } from './services/block.service'
import { FileMetadataService } from './services/file-metadata.service'
import { PageService } from './services/page.service'
import { WorkspaceService } from './services/workspace.service'
import { AuthService } from './services/auth.service'
import { SessionService } from './services/session.service'
import { WorkspacePermissionService } from './services/workspace-permission.service'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorkspaceEntity.name, schema: WorkspaceSchema },
      { name: PageEntity.name, schema: PageSchema },
      { name: BlockEntity.name, schema: BlockSchema },
      { name: FileMetadataEntity.name, schema: FileMetadataSchema },
      { name: UserEntity.name, schema: UserSchema },
      { name: SessionEntity.name, schema: SessionSchema },
    ]),
  ],
  providers: [
    WorkspaceRepository,
    PageRepository,
    BlockRepository,
    FileMetadataRepository,
    UserRepository,
    SessionRepository,
    WorkspaceService,
    PageService,
    BlockService,
    FileMetadataService,
    AuthService,
    SessionService,
    WorkspacePermissionService,
  ],
  exports: [WorkspaceService, PageService, BlockService, FileMetadataService, AuthService, SessionService, WorkspacePermissionService],
})
export class ServerDomainModule {}
