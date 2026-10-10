import { BadRequestException, Body, Controller, Delete, Get, Header, HttpCode, Param, Post, UseGuards } from '@nestjs/common'
import { CurrentUser, SessionAuthGuard } from '../http-api/auth.transport'
import type { UserRecord } from '../server-domain/types'
import type { CreatedMcpToken, McpTokenMetadata } from '../server-domain/types/mcp-token.types'
import { McpTokenService } from '../server-domain/services/mcp-token.service'

@Controller('mcp/tokens')
@UseGuards(SessionAuthGuard)
export class McpTokenController {
  constructor(private readonly tokens: McpTokenService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentUser() user: UserRecord): Promise<McpTokenMetadata[]> {
    return this.tokens.list(user.id)
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  create(@CurrentUser() user: UserRecord, @Body() body: unknown): Promise<CreatedMcpToken> {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new BadRequestException('Invalid request body')
    const keys = Object.keys(body)
    if (keys.length !== 1 || keys[0] !== 'name' || typeof (body as { name?: unknown }).name !== 'string') throw new BadRequestException('Invalid request body')
    return this.tokens.create(user.id, (body as { name: string }).name)
  }

  @Delete(':id')
  @HttpCode(204)
  async revoke(@CurrentUser() user: UserRecord, @Param('id') id: string): Promise<void> {
    await this.tokens.revoke(user.id, id)
  }
}
