import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { createMcpHandler, McpServer, type AuthInfo } from '@modelcontextprotocol/server'
import { hostHeaderValidation, originValidation, toNodeHandler } from '@modelcontextprotocol/node'
import { z } from 'zod'
import type { FastifyInstance } from 'fastify'

import { WorkspaceService } from '../server-domain/services/workspace.service'
import { PageService } from '../server-domain/services/page.service'
import { BlockService } from '../server-domain/services/block.service'
import { McpTokenService } from '../server-domain/services/mcp-token.service'
import {
  assertMcpResultSize,
  GetPageInputSchema,
  GetPageOutputSchema,
  ListPagesInputSchema,
  ListPagesOutputSchema,
  SearchPagesInputSchema,
  toMcpBlocks,
  toMcpPageSummary,
} from './mcp-read.contract'

const MCP_TOKEN_PATTERN = /^Bearer +(eotion_mcp_[A-Za-z0-9_-]{43})$/i
const MCP_REALM = 'Bearer realm="eotion-mcp", error="invalid_token"'

function csvValues(...values: Array<string | undefined>): string[] {
  return [...new Set(values.flatMap((value) => value?.split(',') ?? []).map((value) => value.trim()).filter(Boolean))]
}

function configuredOriginHosts(): string[] {
  const configuredOrigins = csvValues(process.env.WEB_ORIGIN, process.env.API_ORIGIN)
    .flatMap((origin) => {
      try {
        return [new URL(origin).hostname]
      } catch {
        return []
      }
    })

  return [...new Set([
    'localhost',
    '127.0.0.1',
    '[::1]',
    ...configuredOrigins,
    ...csvValues(process.env.MCP_ALLOWED_ORIGINS),
  ])]
}

@Injectable()
export class McpService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(McpService.name)
  private handler: ReturnType<typeof createMcpHandler> | undefined

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly tokens: McpTokenService,
    private readonly workspaces: WorkspaceService,
    private readonly pages: PageService,
    private readonly blocks: BlockService,
  ) {}

  onModuleInit(): void {
    const handler = createMcpHandler(
      ({ authInfo }) => this.createServer(authInfo),
      {
        responseMode: 'json',
        onerror: () => this.logger.error('MCP request failed'),
      },
    )
    this.handler = handler

    const fastify = this.adapterHost.httpAdapter.getInstance<FastifyInstance>()
    const handleNodeRequest = toNodeHandler({
      fetch: async (request, options) => {
        const response = await handler.fetch(request, options)
        // The SDK's legacy SSE transport supplies its own cache headers.
        // Apply the credentialed endpoint policy to both protocol paths.
        const headers = new Headers(response.headers)
        headers.set('Cache-Control', 'no-store, no-transform')
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
      },
    }, {
      onerror: () => this.logger.error('MCP request adapter failed'),
    })
    const validateHost = hostHeaderValidation([
      'localhost',
      '127.0.0.1',
      '[::1]',
      ...csvValues(process.env.MCP_ALLOWED_HOSTS),
    ])
    const validateOrigin = originValidation(configuredOriginHosts())

    fastify.all('/mcp', async (request, reply) => {
      reply.hijack()
      reply.raw.setHeader('Cache-Control', 'no-store')

      if (!validateHost(request.raw, reply.raw) || !validateOrigin(request.raw, reply.raw)) return

      const sendJson = (statusCode: number, body: unknown, headers: Record<string, string> = {}) => {
        reply.raw.statusCode = statusCode
        reply.raw.setHeader('Content-Type', 'application/json; charset=utf-8')
        for (const [name, value] of Object.entries(headers)) reply.raw.setHeader(name, value)
        reply.raw.end(JSON.stringify(body))
      }

      const authorization = request.headers.authorization
      const match = typeof authorization === 'string' ? MCP_TOKEN_PATTERN.exec(authorization) : null
      if (!match) {
        sendJson(401, { error: 'Authentication required' }, { 'WWW-Authenticate': MCP_REALM })
        return
      }

      let identity: { userId: string } | null
      try {
        identity = await this.tokens.resolve(match[1])
      } catch {
        this.logger.error('MCP token lookup failed')
        sendJson(500, { error: 'Internal server error' })
        return
      }

      if (!identity) {
        sendJson(401, { error: 'Authentication required' }, { 'WWW-Authenticate': MCP_REALM })
        return
      }

      const rawRequest = request.raw as typeof request.raw & { auth?: AuthInfo }
      rawRequest.auth = {
        token: '',
        clientId: 'eotion-mcp',
        scopes: [],
        extra: { userId: identity.userId },
      }

      try {
        await handleNodeRequest(rawRequest, reply.raw, request.body)
      } catch {
        this.logger.error('MCP request handling failed')
        if (!reply.raw.headersSent) sendJson(500, { error: 'Internal server error' })
      }
    })
  }

  async onModuleDestroy(): Promise<void> {
    await this.handler?.close()
  }

  private createServer(authInfo: AuthInfo | undefined): McpServer {
    const userId = authInfo?.extra?.userId
    const server = new McpServer({ name: 'eotion', version: '0.0.1' })

    server.registerTool(
      'eotion_list_workspaces',
      {
        title: 'List workspaces',
        description: 'List the authenticated user’s workspaces.',
        inputSchema: z.strictObject({}),
        outputSchema: z.object({
          workspaces: z.array(z.object({ id: z.string(), name: z.string() })),
        }),
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      },
      async () => {
        try {
          if (typeof userId !== 'string') throw new Error('Missing authenticated user')
          const listed = await this.workspaces.listByOwner(userId)
          const result = {
            workspaces: listed.map(({ id, name }) => ({ id, name })),
          }
          return {
            structuredContent: result,
            content: [{ type: 'text', text: JSON.stringify(result) }],
          }
        } catch {
          return {
            isError: true,
            content: [{ type: 'text', text: 'Unable to list workspaces.' }],
          }
        }
      },
    )

    const registerPageListTool = (name: 'eotion_list_pages' | 'eotion_search_pages', search: boolean) => {
      server.registerTool(
        name,
        {
          title: search ? 'Search pages' : 'List pages',
          description: search
            ? 'Search accessible page titles in the specified Eotion workspace using a case-insensitive literal substring.'
            : 'List pages in an accessible workspace in ascending page ID order.',
          inputSchema: search ? SearchPagesInputSchema : ListPagesInputSchema,
          outputSchema: ListPagesOutputSchema,
          annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
        },
        async (input) => {
          try {
            if (typeof userId !== 'string') throw new Error('Missing authenticated user')
            const query = search && 'query' in input && typeof input.query === 'string' ? input.query : undefined
            const listed = await this.pages.listWindow(userId, input.workspaceId, {
              ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
              limit: input.limit,
              ...(query === undefined ? {} : { query }),
            })
            const result = assertMcpResultSize({
              items: listed.items.map(toMcpPageSummary),
              nextCursor: listed.nextCursor,
            })
            return { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] }
          } catch {
            return { isError: true, content: [{ type: 'text', text: search ? 'Unable to search pages.' : 'Unable to list pages.' }] }
          }
        },
      )
    }

    registerPageListTool('eotion_list_pages', false)
    registerPageListTool('eotion_search_pages', true)

    server.registerTool(
      'eotion_get_page',
      {
        title: 'Get page',
        description: 'Read an accessible page summary and its supported body blocks.',
        inputSchema: GetPageInputSchema,
        outputSchema: GetPageOutputSchema,
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      },
      async (input) => {
        try {
          if (typeof userId !== 'string') throw new Error('Missing authenticated user')
          const page = await this.pages.findAccessible(userId, input.pageId)
          if (!page) throw new Error('Page not found')
          const records = await this.blocks.listBounded(userId, page.workspaceId, page.id, 1000)
          const result = assertMcpResultSize({ ...toMcpPageSummary(page), blocks: toMcpBlocks(records) })
          return { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] }
        } catch {
          return { isError: true, content: [{ type: 'text', text: 'Unable to get page.' }] }
        }
      },
    )

    return server
  }
}
