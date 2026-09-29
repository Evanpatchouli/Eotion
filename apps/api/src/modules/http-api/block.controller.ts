import { Body, Controller, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { BlockCreateRequestSchema, BlockUpdateRequestSchema } from '@eotion/contracts'
import { BlockService } from '../server-domain/services/block.service'
import type { UserRecord } from '../server-domain/types'
import { CurrentUser, SessionAuthGuard } from './auth.transport'
import { parseBody, parseId } from './validation'

@Controller('workspaces/:workspaceId/pages/:pageId/blocks')
@UseGuards(SessionAuthGuard)
export class BlockController {
  constructor(private readonly blocks: BlockService) {}

  @Post()
  create(@CurrentUser() user: UserRecord, @Param('workspaceId') workspaceId: string, @Param('pageId') pageId: string, @Body() body: unknown) {
    const input = parseBody(BlockCreateRequestSchema, body)
    const safeWorkspaceId = parseId(workspaceId)
    const safePageId = parseId(pageId)
    return this.blocks.create(user.id, safeWorkspaceId, safePageId, { ...input, pageId: safePageId })
  }

  @Get()
  list(@CurrentUser() user: UserRecord, @Param('workspaceId') workspaceId: string, @Param('pageId') pageId: string) {
    return this.blocks.list(user.id, parseId(workspaceId), parseId(pageId))
  }

  @Get(':blockId')
  async get(@CurrentUser() user: UserRecord, @Param('workspaceId') workspaceId: string, @Param('pageId') pageId: string, @Param('blockId') blockId: string) {
    const block = await this.blocks.find(user.id, parseId(workspaceId), parseId(pageId), parseId(blockId))
    if (!block) throw new NotFoundException('Block not found')
    return block
  }

  @Patch(':blockId')
  async update(@CurrentUser() user: UserRecord, @Param('workspaceId') workspaceId: string, @Param('pageId') pageId: string, @Param('blockId') blockId: string, @Body() body: unknown) {
    const input = parseBody(BlockUpdateRequestSchema, body)
    const block = await this.blocks.update(user.id, parseId(workspaceId), parseId(pageId), parseId(blockId), input)
    if (!block) throw new NotFoundException('Block not found')
    return block
  }
}
