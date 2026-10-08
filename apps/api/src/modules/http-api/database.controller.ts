import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { DatabaseListQuerySchema, DatabaseRecordPageCreateRequestSchema, DatabaseRecordCellUpdateRequestSchema, DatabasePropertyCreateRequestSchema, DatabasePropertyDeleteRequestSchema, DatabasePropertyUpdateRequestSchema, DatabaseTableQuerySchema, DatabaseViewListQuerySchema, DatabaseCreateInPageRequestSchema, DatabaseLinkInPageRequestSchema } from '@eotion/contracts'
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

  @Post('databases/:databaseId/properties')
  createProperty(@CurrentUser() user: UserRecord, @Param('workspaceId') workspaceId: string, @Param('databaseId') databaseId: string, @Body() body: unknown) {
    return this.databases.createProperty(user.id, parseId(workspaceId), parseId(databaseId), parseBody(DatabasePropertyCreateRequestSchema, body))
  }

  @Patch('databases/:databaseId/properties/:propertyId')
  updateProperty(@CurrentUser() user: UserRecord, @Param('workspaceId') workspaceId: string, @Param('databaseId') databaseId: string, @Param('propertyId') propertyId: string, @Body() body: unknown) {
    return this.databases.updateProperty(user.id, parseId(workspaceId), parseId(databaseId), parseId(propertyId), parseBody(DatabasePropertyUpdateRequestSchema, body))
  }

  @Delete('databases/:databaseId/properties/:propertyId')
  deleteProperty(@CurrentUser() user: UserRecord, @Param('workspaceId') workspaceId: string, @Param('databaseId') databaseId: string, @Param('propertyId') propertyId: string, @Body() body: unknown) {
    return this.databases.deleteProperty(user.id, parseId(workspaceId), parseId(databaseId), parseId(propertyId), parseBody(DatabasePropertyDeleteRequestSchema, body))
  }

  @Patch('databases/:databaseId/records/:recordId/cells/:propertyId')
  updateRecordCell(@CurrentUser() user: UserRecord, @Param('workspaceId') workspaceId: string, @Param('databaseId') databaseId: string, @Param('recordId') recordId: string, @Param('propertyId') propertyId: string, @Body() body: unknown) {
    return this.databases.updateRecordCell(user.id, parseId(workspaceId), parseId(databaseId), parseId(recordId), parseId(propertyId), parseBody(DatabaseRecordCellUpdateRequestSchema, body))
  }
}
