import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { DatabaseListQuerySchema, DatabaseRecordPageCreateRequestSchema, DatabaseTableQuerySchema, DatabaseViewListQuerySchema, DatabaseCreateInPageRequestSchema, DatabaseLinkInPageRequestSchema } from '@eotion/contracts'
import { DatabaseService } from '../server-domain/services/database.service'
import type { UserRecord } from '../server-domain/types'
import { CurrentUser, SessionAuthGuard } from './auth.transport'
import { parseBody, parseId } from './validation'

@Controller('workspaces/:workspaceId')
@UseGuards(SessionAuthGuard)
export class DatabaseController {
  constructor(private readonly databases: DatabaseService) {}

  @Get('databases')
  list(@CurrentUser() user: UserRecord, @Param('workspaceId') workspaceId: string, @Query() query: unknown) {
    return this.databases.listWindow(user.id, parseId(workspaceId), parseBody(DatabaseListQuerySchema, query))
  }

  @Post('pages/:pageId/databases')
  createInPage(@CurrentUser() user: UserRecord, @Param('workspaceId') workspaceId: string, @Param('pageId') pageId: string, @Body() body: unknown) {
    const input = parseBody(DatabaseCreateInPageRequestSchema, body)
    return this.databases.createInPage(user.id, parseId(workspaceId), parseId(pageId), input)
  }

  @Post('pages/:pageId/database-links')
  linkInPage(@CurrentUser() user: UserRecord, @Param('workspaceId') workspaceId: string, @Param('pageId') pageId: string, @Body() body: unknown) {
    const input = parseBody(DatabaseLinkInPageRequestSchema, body)
    return this.databases.linkInPage(user.id, parseId(workspaceId), parseId(pageId), input)
  }

  @Get('databases/:databaseId/views')
  listViews(@CurrentUser() user: UserRecord, @Param('workspaceId') workspaceId: string, @Param('databaseId') databaseId: string, @Query() query: unknown) {
    return this.databases.listViewsWindow(user.id, parseId(workspaceId), parseId(databaseId), parseBody(DatabaseViewListQuerySchema, query).limit)
  }

  @Get('databases/:databaseId/views/:viewId/table')
  table(@CurrentUser() user: UserRecord, @Param('workspaceId') workspaceId: string, @Param('databaseId') databaseId: string, @Param('viewId') viewId: string, @Query() query: unknown) {
    return this.databases.getTable(user.id, parseId(workspaceId), parseId(databaseId), parseId(viewId), parseBody(DatabaseTableQuerySchema, query))
  }

  @Post('databases/:databaseId/records')
  createRecord(@CurrentUser() user: UserRecord, @Param('workspaceId') workspaceId: string, @Param('databaseId') databaseId: string, @Body() body: unknown) {
    const input = parseBody(DatabaseRecordPageCreateRequestSchema, body)
    return this.databases.createRecordPage(user.id, parseId(workspaceId), parseId(databaseId), input)
  }
}
