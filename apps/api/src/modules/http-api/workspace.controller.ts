import { Body, Controller, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { WorkspaceCreateRequestSchema, WorkspaceUpdateRequestSchema } from '@eotion/contracts'
import { WorkspaceService } from '../server-domain/services/workspace.service'
import type { UserRecord } from '../server-domain/types'
import { CurrentUser, SessionAuthGuard } from './auth.transport'
import { parseBody, parseId } from './validation'

@Controller('workspaces')
@UseGuards(SessionAuthGuard)
export class WorkspaceController {
  constructor(private readonly workspaces: WorkspaceService) {}

  @Post()
  create(@CurrentUser() user: UserRecord, @Body() body: unknown) {
    const input = parseBody(WorkspaceCreateRequestSchema, body)
    return this.workspaces.create(user.id, { id: input.id, name: input.name })
  }

  @Get()
  list(@CurrentUser() user: UserRecord) {
    return this.workspaces.listByOwner(user.id)
  }

  @Get(':workspaceId')
  async get(@CurrentUser() user: UserRecord, @Param('workspaceId') workspaceId: string) {
    const workspace = await this.workspaces.findById(user.id, parseId(workspaceId))
    if (!workspace) throw new NotFoundException('Workspace not found')
    return workspace
  }

  @Patch(':workspaceId')
  async rename(@CurrentUser() user: UserRecord, @Param('workspaceId') workspaceId: string, @Body() body: unknown) {
    const input = parseBody(WorkspaceUpdateRequestSchema, body)
    const workspace = await this.workspaces.updateName(user.id, parseId(workspaceId), input.name)
    if (!workspace) throw new NotFoundException('Workspace not found')
    return workspace
  }
}
