import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { BlockRepository } from './repositories/block.repository'
import { FileMetadataRepository } from './repositories/file-metadata.repository'
import { PageRepository } from './repositories/page.repository'
import { WorkspaceRepository } from './repositories/workspace.repository'
import { SessionRepository } from './repositories/session.repository'
import { McpCredentialRepository } from './repositories/mcp-credential.repository'
import { McpMutationRepository } from './repositories/mcp-mutation.repository'
import { UserRepository } from './repositories/user.repository'
import { BlockEntity, BlockSchema } from './schemas/block.schema'
import { FileMetadataEntity, FileMetadataSchema } from './schemas/file-metadata.schema'
import { PageEntity, PageSchema } from './schemas/page.schema'
import { WorkspaceEntity, WorkspaceSchema } from './schemas/workspace.schema'
import { SessionEntity, SessionSchema } from './schemas/session.schema'
import { McpCredentialEntity, McpCredentialSchema } from './schemas/mcp-credential.schema'
import { McpMutationReceiptEntity, McpMutationReceiptSchema } from './schemas/mcp-mutation.schema'
import { UserEntity, UserSchema } from './schemas/user.schema'
import { OperationReceiptEntity, OperationReceiptSchema } from './schemas/operation-receipt.schema'
import { BlockService } from './services/block.service'
import { FileMetadataService } from './services/file-metadata.service'
import { AliOssObjectStorage, FILE_OBJECT_STORAGE } from './services/file-object-storage'
import { PageService } from './services/page.service'
import { WorkspaceService } from './services/workspace.service'
import { AuthService } from './services/auth.service'
import { SessionService } from './services/session.service'
import { McpTokenService } from './services/mcp-token.service'
import { WorkspacePermissionService } from './services/workspace-permission.service'
import { SyncService } from './services/sync.service'
import { DocumentMutationService } from './services/document-mutation.service'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorkspaceEntity.name, schema: WorkspaceSchema },
      { name: PageEntity.name, schema: PageSchema },
      { name: BlockEntity.name, schema: BlockSchema },
      { name: FileMetadataEntity.name, schema: FileMetadataSchema },
      { name: UserEntity.name, schema: UserSchema },
      { name: SessionEntity.name, schema: SessionSchema },
      { name: McpCredentialEntity.name, schema: McpCredentialSchema },
      { name: McpMutationReceiptEntity.name, schema: McpMutationReceiptSchema },
      { name: OperationReceiptEntity.name, schema: OperationReceiptSchema },
    ]),
  ],
  providers: [
    WorkspaceRepository,
    PageRepository,
    BlockRepository,
    FileMetadataRepository,
    UserRepository,
    SessionRepository,
    McpCredentialRepository,
    McpMutationRepository,
    WorkspaceService,
    PageService,
    BlockService,
    FileMetadataService,
    AliOssObjectStorage,
    { provide: FILE_OBJECT_STORAGE, useExisting: AliOssObjectStorage },
    AuthService,
    SessionService,
    McpTokenService,
    WorkspacePermissionService,
    SyncService,
    DocumentMutationService,
  ],
  exports: [WorkspaceService, PageService, BlockService, FileMetadataService, AuthService, SessionService, McpTokenService, WorkspacePermissionService, SyncService, DocumentMutationService],
})
export class ServerDomainModule {}
