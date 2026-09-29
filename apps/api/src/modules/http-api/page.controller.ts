import { Body, Controller, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { PageCreateRequestSchema, PageUpdateRequestSchema } from '@eotion/contracts'
import { PageService } from '../server-domain/services/page.service'
import type { UserRecord } from '../server-domain/types'
import { CurrentUser, SessionAuthGuard } from './auth.transport'
import { parseBody, parseId } from './validation'

@Controller('workspaces/:workspaceId/pages')
@UseGuards(SessionAuthGuard)
export class PageController {
  constructor(private readonly pages: PageService) {}

  @Post()
  create(@CurrentUser() user: UserRecord, @Param('workspaceId') workspaceId: string, @Body() body: unknown) {
    const input = parseBody(PageCreateRequestSchema, body)
    return this.pages.create(user.id, parseId(workspaceId), input)
  }

  @Get()
  list(@CurrentUser() user: UserRecord, @Param('workspaceId') workspaceId: string) {
    return this.pages.list(user.id, parseId(workspaceId))
  }

  @Get(':pageId')
  async get(@CurrentUser() user: UserRecord, @Param('workspaceId') workspaceId: string, @Param('pageId') pageId: string) {
    const page = await this.pages.find(user.id, parseId(workspaceId), parseId(pageId))
    if (!page) throw new NotFoundException('Page not found')
    return page
  }

  @Patch(':pageId')
  async update(@CurrentUser() user: UserRecord, @Param('workspaceId') workspaceId: string, @Param('pageId') pageId: string, @Body() body: unknown) {
    const input = parseBody(PageUpdateRequestSchema, body)
    const page = await this.pages.update(user.id, parseId(workspaceId), parseId(pageId), input)
    if (!page) throw new NotFoundException('Page not found')
    return page
  }
}
