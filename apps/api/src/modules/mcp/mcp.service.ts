import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { createMcpHandler, McpServer, type AuthInfo } from '@modelcontextprotocol/server'
import { hostHeaderValidation, originValidation, toNodeHandler } from '@modelcontextprotocol/node'
import { z } from 'zod'
import type { FastifyInstance } from 'fastify'

import { WorkspaceService } from '../server-domain/services/workspace.service'
import { PageService } from '../server-domain/services/page.service'
import { BlockService } from '../server-domain/services/block.service'
import { McpTokenService } from '../server-domain/services/mcp-token.service'
import { DocumentMutationService } from '../server-domain/services/document-mutation.service'
import { DatabaseService } from '../server-domain/services/database.service'
import { DATABASE_VIEW_TYPES, type Database, type DatabaseProperty, type DatabaseTableRecord, type DatabaseView } from '@eotion/domain'
import {
  McpGetDatabaseSchemaInputSchema,
  McpGetDatabaseSchemaOutputSchema,
  McpGetRecordInputSchema,
  McpGetRecordOutputSchema,
  McpListDatabasesInputSchema,
  McpListDatabasesOutputSchema,
  McpQueryDatabaseInputSchema,
  McpQueryDatabaseOutputSchema,
  McpResolveRelationRecordsInputSchema,
  McpResolveRelationRecordsOutputSchema,
} from './mcp-database-read.contract'
import { toDocumentBlocks } from '../server-domain/services/document-block-codec'
import { assertMcpWritePayloadSize, CreatePageInputSchema, UpdatePageInputSchema } from './mcp-write.contract'
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

function configuredProductHosts(): string[] {
  return csvValues(process.env.WEB_ORIGIN, process.env.API_ORIGIN)
    .flatMap((origin) => {
      try { return [new URL(origin).hostname] } catch { return [] }
    })
}

function configuredOriginHosts(): string[] {
  return [...new Set(['localhost', '127.0.0.1', '[::1]', ...configuredProductHosts(), ...csvValues(process.env.MCP_ALLOWED_ORIGINS)])]
}

function configuredRequestHosts(): string[] {
  return [...new Set(['localhost', '127.0.0.1', '[::1]', ...configuredProductHosts(), ...csvValues(process.env.MCP_ALLOWED_HOSTS)])]
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
    private readonly documents: DocumentMutationService,
    private readonly databases: DatabaseService,
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
    const validateHost = hostHeaderValidation(configuredRequestHosts())
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
          assertMcpResultSize(result)
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

    const databaseReadError = (error: unknown) => {
      const code = error instanceof Error && (/MCP result too large|exceeds (?:the )?maximum|exceeded its maximum size/i.test(error.message))
        ? 'LIMIT_EXCEEDED'
        : error instanceof BadRequestException
          ? 'INVALID_ARGUMENT'
          : error instanceof NotFoundException || error instanceof ForbiddenException
            ? 'NOT_FOUND'
            : error instanceof ConflictException
              ? 'CONFLICT'
              : error instanceof ServiceUnavailableException
                ? 'UNAVAILABLE'
                : 'INTERNAL'
      const messages: Record<typeof code, string> = {
        INVALID_ARGUMENT: 'Invalid arguments.',
        NOT_FOUND: 'Resource not found.',
        CONFLICT: 'Resource changed; reload and retry.',
        UNAVAILABLE: 'Temporarily unavailable.',
        LIMIT_EXCEEDED: 'The response exceeds the supported size limit.',
        INTERNAL: 'Unable to complete the request.',
      }
      return { isError: true, content: [{ type: 'text' as const, text: `${code}: ${messages[code]}` }] }
    }
    const toDatabaseSummary = (database: Database) => ({
      id: database.id, workspaceId: database.workspaceId, name: database.name, version: database.version,
      createdAt: database.createdAt, updatedAt: database.updatedAt,
    })
    const toDatabaseProperty = (property: DatabaseProperty) => ({
      id: property.id, databaseId: property.databaseId, workspaceId: property.workspaceId, name: property.name,
      type: property.type, version: property.version, createdAt: property.createdAt, updatedAt: property.updatedAt,
      ...(property.options === undefined ? {} : { options: property.options }),
      ...(property.config === undefined ? {} : { config: property.config }),
    })
    const toDatabaseView = (view: DatabaseView) => ({
      id: view.id, databaseId: view.databaseId, workspaceId: view.workspaceId, name: view.name, type: view.type,
      version: view.version, createdAt: view.createdAt, updatedAt: view.updatedAt,
      ...(view.config === undefined ? {} : { config: view.config }),
    })
    const toDatabaseRecord = (record: DatabaseTableRecord, propertyIds?: ReadonlySet<string>) => ({
      id: record.id, databaseId: record.databaseId, workspaceId: record.workspaceId, pageId: record.pageId,
      properties: Object.fromEntries(Object.entries(record.properties).filter(([propertyId]) => propertyIds === undefined || propertyIds.has(propertyId))),
      version: record.version, createdAt: record.createdAt, updatedAt: record.updatedAt, pageVersion: record.pageVersion,
    })

    server.registerTool('eotion_list_databases', {
      title: 'List databases',
      description: 'List databases in an accessible Eotion workspace using a bounded cursor window.',
      inputSchema: McpListDatabasesInputSchema,
      outputSchema: McpListDatabasesOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }, async (input) => {
      try {
        if (typeof userId !== 'string') throw new Error('Missing authenticated user')
        const listed = await this.databases.listWindow(userId, input.workspaceId, {
          ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
          limit: input.limit,
        })
        const result = assertMcpResultSize(McpListDatabasesOutputSchema.parse({
          items: listed.items.map(toDatabaseSummary),
          nextCursor: listed.nextCursor,
        }))
        return { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] }
      } catch (error) {
        return databaseReadError(error)
      }
    })

    server.registerTool('eotion_get_database_schema', {
      title: 'Get database schema',
      description: 'Read the database, its properties and all supported views. Includes the currently supported view types and temporary query capabilities.',
      inputSchema: McpGetDatabaseSchemaInputSchema,
      outputSchema: McpGetDatabaseSchemaOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }, async (input) => {
      try {
        if (typeof userId !== 'string') throw new Error('Missing authenticated user')
        const schema = await this.databases.getSchema(userId, input.workspaceId, input.databaseId)
        const result = assertMcpResultSize(McpGetDatabaseSchemaOutputSchema.parse({
          database: toDatabaseSummary(schema.database),
          properties: schema.properties.map(toDatabaseProperty),
          views: schema.views.map(toDatabaseView),
          capabilities: { viewTypes: [...DATABASE_VIEW_TYPES], supportsTemporaryFiltersAndSorts: true },
        }))
        return { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] }
      } catch (error) {
        return databaseReadError(error)
      }
    })

    server.registerTool('eotion_query_database', {
      title: 'Query database',
      description: 'Query a saved database view with server-side filters, sorting and cursor pagination. Supplied filters or sorts replace only that saved configuration for this call; omitted values keep the saved configuration. Temporary settings never update the saved view. Repeat the same overrides when requesting the next cursor page.',
      inputSchema: McpQueryDatabaseInputSchema,
      outputSchema: McpQueryDatabaseOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }, async (input) => {
      try {
        if (typeof userId !== 'string') throw new Error('Missing authenticated user')
        const response = await this.databases.getViewRecords(userId, input.workspaceId, input.databaseId, input.viewId, {
          ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
          limit: input.limit,
          ...(input.filters === undefined ? {} : { filters: input.filters }),
          ...(input.sorts === undefined ? {} : { sorts: input.sorts }),
          ...(input.propertyIds === undefined ? {} : { propertyIds: input.propertyIds }),
        })
        const titleProperty = response.properties.find(property => property.type === 'title')
        if (!titleProperty) throw new ConflictException('Database title property is missing')
        const requestedIds = input.propertyIds === undefined
          ? response.properties.map(property => property.id)
          : [...new Set([...input.propertyIds, titleProperty.id])]
        const requestedSet = new Set(requestedIds)
        const properties = response.properties.filter(property => requestedSet.has(property.id)).map(toDatabaseProperty)
        const savedConfig = response.view.config ?? { filters: [], sorts: [], visibleProperties: null, propertyOrder: null }
        const result = assertMcpResultSize(McpQueryDatabaseOutputSchema.parse({
          database: toDatabaseSummary(response.database),
          view: toDatabaseView(response.view),
          properties,
          records: response.records.map(record => toDatabaseRecord(record, requestedSet)),
          nextCursor: response.nextCursor,
          effectiveQuery: {
            filters: input.filters ?? savedConfig.filters,
            sorts: input.sorts ?? savedConfig.sorts,
            propertyIds: properties.map(property => property.id),
          },
        }))
        return { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] }
      } catch (error) {
        return databaseReadError(error)
      }
    })

    server.registerTool('eotion_get_record', {
      title: 'Get database record',
      description: 'Read one record in the specified accessible database, including its canonical Page title and derived values when supported.',
      inputSchema: McpGetRecordInputSchema,
      outputSchema: McpGetRecordOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }, async (input) => {
      try {
        if (typeof userId !== 'string') throw new Error('Missing authenticated user')
        const record = await this.databases.getRecord(userId, input.workspaceId, input.databaseId, input.recordId)
        const result = assertMcpResultSize(McpGetRecordOutputSchema.parse(toDatabaseRecord(record)))
        return { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] }
      } catch (error) {
        return databaseReadError(error)
      }
    })

    server.registerTool('eotion_resolve_relation_records', {
      title: 'Resolve relation records',
      description: 'Search for relation candidates or resolve known record ids to stable record/page ids and titles within an accessible workspace database.',
      inputSchema: McpResolveRelationRecordsInputSchema,
      outputSchema: McpResolveRelationRecordsOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }, async (input) => {
      try {
        if (typeof userId !== 'string') throw new Error('Missing authenticated user')
        const result = input.mode === 'search'
          ? await this.databases.listRecordOptions(userId, input.workspaceId, input.databaseId, {
            ...(input.search === undefined ? {} : { search: input.search }),
            ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
            limit: input.limit,
          })
          : { ...(await this.databases.resolveRecordOptions(userId, input.workspaceId, input.databaseId, { recordIds: input.recordIds })), nextCursor: null }
        const safe = assertMcpResultSize(McpResolveRelationRecordsOutputSchema.parse(result))
        return { structuredContent: safe, content: [{ type: 'text', text: JSON.stringify(safe) }] }
      } catch (error) {
        return databaseReadError(error)
      }
    })

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

    const projectPage = (page: Parameters<typeof toMcpPageSummary>[0], records: Parameters<typeof toMcpBlocks>[0]) =>
      assertMcpResultSize(GetPageOutputSchema.parse({ ...toMcpPageSummary(page), blocks: toMcpBlocks(records) }))

    const writeError = (error: unknown) => ({
      isError: true,
      content: [{ type: 'text' as const, text: error instanceof ConflictException
        ? error.message
        : error instanceof ServiceUnavailableException
          ? 'Page writes require MongoDB replica set transactions.'
          : 'Unable to write page.' }],
    })

    server.registerTool('eotion_create_page', {
      title: 'Create page',
      description: 'Create a new page in a writable Eotion workspace with an initial document body. Use a unique idempotencyKey; repeat identical requests safely.',
      inputSchema: CreatePageInputSchema,
      outputSchema: GetPageOutputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async (input) => {
      try {
        if (typeof userId !== 'string') throw new Error('Missing authenticated user')
        assertMcpWritePayloadSize(input)
        const result = await this.documents.create(userId, { ...input, blocks: toDocumentBlocks(input.blocks) }, projectPage, input)
        return { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] }
      } catch (error) {
        return writeError(error)
      }
    })

    server.registerTool('eotion_update_page', {
      title: 'Update page',
      description: 'Read the page with eotion_get_page first, then update using its latest updatedAt as expectedUpdatedAt. Supplied blocks are the complete target body snapshot; omitted blocks preserve the body. Repeat identical requests with the same idempotencyKey safely.',
      inputSchema: UpdatePageInputSchema,
      outputSchema: GetPageOutputSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    }, async (input) => {
      try {
        if (typeof userId !== 'string') throw new Error('Missing authenticated user')
        assertMcpWritePayloadSize(input)
        const { blocks, ...patch } = input
        const result = await this.documents.update(userId, {
          ...patch,
          ...(blocks === undefined ? {} : { blocks: toDocumentBlocks(blocks) }),
        }, projectPage, input)
        return { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] }
      } catch (error) {
        return writeError(error)
      }
    })

    return server
  }
}
