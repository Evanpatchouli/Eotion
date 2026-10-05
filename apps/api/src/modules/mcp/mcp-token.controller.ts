import { BadRequestException, Body, Controller, Header, Post, UseGuards } from '@nestjs/common'
import { CurrentUser, SessionAuthGuard } from '../http-api/auth.transport'
import type { UserRecord } from '../server-domain/types'
import type { CreatedMcpToken } from '../server-domain/types/mcp-token.types'
import { McpTokenService } from '../server-domain/services/mcp-token.service'

@Controller('mcp/tokens')
@UseGuards(SessionAuthGuard)
export class McpTokenController {
  constructor(private readonly tokens: McpTokenService) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  create(@CurrentUser() user: UserRecord, @Body() body: unknown): Promise<CreatedMcpToken> {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new BadRequestException('Invalid request body')
    }
    const keys = Object.keys(body)
    if (keys.length !== 1 || keys[0] !== 'name' || typeof (body as { name?: unknown }).name !== 'string') {
      throw new BadRequestException('Invalid request body')
    }
    return this.tokens.create(user.id, (body as { name: string }).name)
  }
}
