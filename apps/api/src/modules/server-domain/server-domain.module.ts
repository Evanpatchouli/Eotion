import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { BlockRepository } from './repositories/block.repository'
import { FileMetadataRepository } from './repositories/file-metadata.repository'
import { PageRepository } from './repositories/page.repository'
import { WorkspaceRepository } from './repositories/workspace.repository'
import { BlockEntity, BlockSchema } from './schemas/block.schema'
import { FileMetadataEntity, FileMetadataSchema } from './schemas/file-metadata.schema'
import { PageEntity, PageSchema } from './schemas/page.schema'
import { WorkspaceEntity, WorkspaceSchema } from './schemas/workspace.schema'
import { BlockService } from './services/block.service'
import { FileMetadataService } from './services/file-metadata.service'
import { PageService } from './services/page.service'
import { WorkspaceService } from './services/workspace.service'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorkspaceEntity.name, schema: WorkspaceSchema },
      { name: PageEntity.name, schema: PageSchema },
      { name: BlockEntity.name, schema: BlockSchema },
      { name: FileMetadataEntity.name, schema: FileMetadataSchema },
    ]),
  ],
  providers: [
    WorkspaceRepository,
    PageRepository,
    BlockRepository,
    FileMetadataRepository,
    WorkspaceService,
    PageService,
    BlockService,
    FileMetadataService,
  ],
  exports: [WorkspaceService, PageService, BlockService, FileMetadataService],
})
export class ServerDomainModule {}
