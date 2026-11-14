import {
  ApiErrorResponseSchema,
  DatabaseViewRecordReorderRequestSchema,
  DatabaseViewRecordReorderResponseSchema,
  DatabaseViewGroupKeySchema,
  DatabaseViewGroupRecordsQuerySchema,
  DatabaseViewGroupRecordsResponseSchema,
  DatabaseViewRecordGroupMoveRequestSchema,
  DatabaseViewRecordGroupMoveResponseSchema,
  SyncOperationSchema,
} from '@eotion/contracts'
import type {
  ApiErrorResponse,
  AuthUserDto,
  BlockCreateRequest,
  BlockResponse,
  BlockUpdateRequest,
  ChangePasswordRequest,
  DatabaseCreateInPageRequest,
  DatabaseLinkInPageRequest,
  DatabaseRecordPageCreateRequest,
  DatabasePropertyCreateRequest,
  DatabasePropertyUpdateRequest,
  DatabasePropertyTypeChangeRequest,
  DatabasePropertyTypeChangeResponse,
  DatabasePropertyDeleteRequest,
  DatabaseViewHttpCreateRequest,
  DatabaseViewUpdateRequest,
  DatabaseViewDeleteRequest,
  DatabaseRecordCellUpdateRequest,
  DatabaseCellBatchMutationRequest,
  DatabaseCellBatchMutationResponse,
  DatabaseCellBatchMutationReceipt,
  DatabaseTableRecordResponse,
  DatabaseTableQuery,
  DatabaseTableResponse,
  DatabaseViewRecordsQuery,
  DatabaseViewRecordsResponse,
  DatabaseViewResponse,
  DatabaseViewRecordReorderRequest,
  DatabaseViewRecordReorderResponse,
  DatabaseViewGroupKey,
  DatabaseViewGroupRecordsQuery,
  DatabaseViewGroupRecordsResponse,
  DatabaseViewRecordGroupMoveRequest,
  DatabaseViewRecordGroupMoveResponse,
  DatabaseWindowResponse,
  DatabaseNavigationWindowResponse,
  DatabaseResponse,
  DatabasePropertyResponse,
  DatabaseRelationCandidatesQuery,
  DatabaseRelationCandidatesResponse,
  DatabaseRelationTitlesRequest,
  DatabaseRelationTitlesResponse,
  FileResponse,
  FileUpdateRequest,
  HealthResponse,
  LoginRequest,
  LoginResponse,
  McpTokenCreateRequest,
  McpTokenMetadataResponse,
  CreatedMcpTokenResponse,
  PageCreateRequest,
  PageMoveRequest,
  PageResponse,
  PageUpdateRequest,
  ProfileUpdateRequest,
  RegisterRequest,
  WorkspaceCreateRequest,
  WorkspaceResponse,
  WorkspaceUpdateRequest,
  SyncOperation,
  WorkspaceSnapshotResponse,
} from '@eotion/contracts'

export interface EotionApiClientOptions {
  baseUrl: string
  fetch?: typeof fetch
}

export class ApiError extends Error {
  readonly statusCode: number
  readonly error?: string
  readonly details: string | string[]

  constructor(statusCode: number, body: ApiErrorResponse | undefined, fallbackMessage: string) {
    const details = body?.message ?? fallbackMessage
    super(Array.isArray(details) ? details.join(', ') : details)
    this.name = 'ApiError'
    // HTTP status is authoritative for authentication and offline fallback decisions.
    this.statusCode = statusCode
    this.error = body?.error
    this.details = details
  }
}

export class EotionApiClient {
  readonly baseUrl: string
  readonly auth: {
    register: (input: RegisterRequest, signal?: AbortSignal) => Promise<AuthUserDto>
    login: (input: LoginRequest, signal?: AbortSignal) => Promise<LoginResponse>
    logout: (signal?: AbortSignal) => Promise<void>
    me: (signal?: AbortSignal) => Promise<AuthUserDto>
    updateProfile: (input: ProfileUpdateRequest, signal?: AbortSignal) => Promise<AuthUserDto>
    changePassword: (input: ChangePasswordRequest, signal?: AbortSignal) => Promise<void>
  }
  readonly mcpTokens: {
    list: (signal?: AbortSignal) => Promise<McpTokenMetadataResponse[]>
    create: (input: McpTokenCreateRequest, signal?: AbortSignal) => Promise<CreatedMcpTokenResponse>
    revoke: (id: string, signal?: AbortSignal) => Promise<void>
  }
  readonly workspaces: {
    list: (signal?: AbortSignal) => Promise<WorkspaceResponse[]>
    create: (input: WorkspaceCreateRequest, signal?: AbortSignal) => Promise<WorkspaceResponse>
    get: (workspaceId: string, signal?: AbortSignal) => Promise<WorkspaceResponse>
    update: (workspaceId: string, input: WorkspaceUpdateRequest, signal?: AbortSignal) => Promise<WorkspaceResponse>
  }
  readonly pages: {
    list: (workspaceId: string, signal?: AbortSignal) => Promise<PageResponse[]>
    create: (workspaceId: string, input: PageCreateRequest, signal?: AbortSignal) => Promise<PageResponse>
    get: (workspaceId: string, pageId: string, signal?: AbortSignal) => Promise<PageResponse>
    update: (workspaceId: string, pageId: string, input: PageUpdateRequest, signal?: AbortSignal) => Promise<PageResponse>
    move: (workspaceId: string, pageId: string, input: PageMoveRequest, signal?: AbortSignal) => Promise<PageResponse>
    delete: (workspaceId: string, pageId: string, signal?: AbortSignal) => Promise<void>
  }
  readonly blocks: {
    list: (workspaceId: string, pageId: string, signal?: AbortSignal) => Promise<BlockResponse[]>
    create: (workspaceId: string, pageId: string, input: BlockCreateRequest, signal?: AbortSignal) => Promise<BlockResponse>
    get: (workspaceId: string, pageId: string, blockId: string, signal?: AbortSignal) => Promise<BlockResponse>
    update: (workspaceId: string, pageId: string, blockId: string, input: BlockUpdateRequest, signal?: AbortSignal) => Promise<BlockResponse>
    delete: (workspaceId: string, pageId: string, blockId: string, signal?: AbortSignal) => Promise<void>
  }
  readonly files: {
    upload: (workspaceId: string, fileId: string, file: File, signal?: AbortSignal) => Promise<FileResponse>
    list: (workspaceId: string, signal?: AbortSignal) => Promise<FileResponse[]>
    get: (workspaceId: string, fileId: string, signal?: AbortSignal) => Promise<FileResponse>
    update: (workspaceId: string, fileId: string, input: FileUpdateRequest, signal?: AbortSignal) => Promise<FileResponse>
    delete: (workspaceId: string, fileId: string, signal?: AbortSignal) => Promise<void>
  }
  readonly databases: {
    listDatabases: (workspaceId: string, window?: Partial<Pick<DatabaseTableQuery, 'limit' | 'cursor'>>, signal?: AbortSignal) => Promise<DatabaseWindowResponse>
    listNavigation: (workspaceId: string, window?: Partial<Pick<DatabaseTableQuery, 'limit' | 'cursor'>>, signal?: AbortSignal) => Promise<DatabaseNavigationWindowResponse>
    listDatabaseViews: (workspaceId: string, databaseId: string, signal?: AbortSignal) => Promise<DatabaseViewResponse[]>
    getDatabaseTable: (workspaceId: string, databaseId: string, viewId: string, window?: Partial<Pick<DatabaseTableQuery, 'limit' | 'cursor'>>, signal?: AbortSignal) => Promise<DatabaseTableResponse>
    getDatabaseViewRecords: (workspaceId: string, databaseId: string, viewId: string, window?: Partial<Pick<DatabaseViewRecordsQuery, 'limit' | 'cursor'>>, signal?: AbortSignal) => Promise<DatabaseViewRecordsResponse>
    getDatabaseViewGroupRecords: (workspaceId: string, databaseId: string, viewId: string, groupKey: DatabaseViewGroupKey, window?: Partial<Pick<DatabaseViewGroupRecordsQuery, 'limit' | 'cursor'>>, signal?: AbortSignal) => Promise<DatabaseViewGroupRecordsResponse>
    listRelationCandidates: (workspaceId: string, databaseId: string, input?: Partial<DatabaseRelationCandidatesQuery>, signal?: AbortSignal) => Promise<DatabaseRelationCandidatesResponse>
    resolveRelationTitles: (workspaceId: string, databaseId: string, input: DatabaseRelationTitlesRequest, signal?: AbortSignal) => Promise<DatabaseRelationTitlesResponse>
    createDatabaseInPage: (workspaceId: string, pageId: string, input: DatabaseCreateInPageRequest, signal?: AbortSignal) => Promise<{ database: DatabaseResponse; titleProperty: DatabasePropertyResponse; view: DatabaseViewResponse; block: BlockResponse }>
    linkDatabaseInPage: (workspaceId: string, pageId: string, input: DatabaseLinkInPageRequest, signal?: AbortSignal) => Promise<{ block: BlockResponse }>
    createDatabaseRecord: (workspaceId: string, databaseId: string, input: DatabaseRecordPageCreateRequest, signal?: AbortSignal) => Promise<{ record: DatabaseTableRecordResponse; page: PageResponse }>
    createDatabaseProperty: (workspaceId: string, databaseId: string, input: DatabasePropertyCreateRequest, signal?: AbortSignal) => Promise<{ database: DatabaseResponse; property: DatabasePropertyResponse }>
    updateDatabaseProperty: (workspaceId: string, databaseId: string, propertyId: string, input: DatabasePropertyUpdateRequest, signal?: AbortSignal) => Promise<{ database: DatabaseResponse; property: DatabasePropertyResponse }>
    changeDatabasePropertyType: (workspaceId: string, databaseId: string, propertyId: string, input: DatabasePropertyTypeChangeRequest, signal?: AbortSignal) => Promise<DatabasePropertyTypeChangeResponse>
    deleteDatabaseProperty: (workspaceId: string, databaseId: string, propertyId: string, input: DatabasePropertyDeleteRequest, signal?: AbortSignal) => Promise<{ database: DatabaseResponse }>
    createDatabaseView: (workspaceId: string, databaseId: string, input: DatabaseViewHttpCreateRequest, signal?: AbortSignal) => Promise<{ database: DatabaseResponse; view: DatabaseViewResponse }>
    updateDatabaseView: (workspaceId: string, databaseId: string, viewId: string, input: DatabaseViewUpdateRequest, signal?: AbortSignal) => Promise<{ database: DatabaseResponse; view: DatabaseViewResponse }>
    deleteDatabaseView: (workspaceId: string, databaseId: string, viewId: string, input: DatabaseViewDeleteRequest, signal?: AbortSignal) => Promise<{ database: DatabaseResponse }>
    reorderDatabaseViewRecord: (workspaceId: string, databaseId: string, viewId: string, input: DatabaseViewRecordReorderRequest, signal?: AbortSignal) => Promise<DatabaseViewRecordReorderResponse>
    moveDatabaseViewRecordGroup: (workspaceId: string, databaseId: string, viewId: string, input: DatabaseViewRecordGroupMoveRequest, signal?: AbortSignal) => Promise<DatabaseViewRecordGroupMoveResponse>
    updateDatabaseRecordCell: (workspaceId: string, databaseId: string, recordId: string, propertyId: string, input: DatabaseRecordCellUpdateRequest, signal?: AbortSignal) => Promise<{ database: DatabaseResponse; record: DatabaseTableRecordResponse; page?: PageResponse }>
    mutateDatabaseCells: (workspaceId: string, databaseId: string, input: DatabaseCellBatchMutationRequest, signal?: AbortSignal) => Promise<DatabaseCellBatchMutationResponse>
    getDatabaseCellMutationReceipt: (workspaceId: string, databaseId: string, mutationId: string, signal?: AbortSignal) => Promise<DatabaseCellBatchMutationReceipt>
  }
  readonly sync: {
    send: (operation: SyncOperation, signal?: AbortSignal) => Promise<void>
    snapshot: (workspaceId: string, signal?: AbortSignal) => Promise<WorkspaceSnapshotResponse>
  }

  private readonly fetchImpl: typeof fetch

  constructor(options: EotionApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.auth = {
      register: (input, signal) => this.request('/api/auth/register', { method: 'POST', body: input, signal }),
      login: (input, signal) => this.request('/api/auth/login', { method: 'POST', body: input, signal }),
      logout: (signal) => this.request('/api/auth/logout', { method: 'POST', signal }),
      me: (signal) => this.request('/api/auth/me', { method: 'GET', signal }),
      updateProfile: (input, signal) => this.request('/api/auth/me', { method: 'PATCH', body: input, signal }),
      changePassword: async (input, signal) => {
        await this.request('/api/auth/change-password', { method: 'POST', body: input, signal })
      },
    }
    this.mcpTokens = {
      list: (signal) => this.request('/api/mcp/tokens', { method: 'GET', signal }),
      create: (input, signal) => this.request('/api/mcp/tokens', { method: 'POST', body: input, signal }),
      revoke: async (id, signal) => { await this.request(`/api/mcp/tokens/${segment(id)}`, { method: 'DELETE', signal }) },
    }
    this.workspaces = {
      list: (signal) => this.request('/api/workspaces', { method: 'GET', signal }),
      create: (input, signal) => this.request('/api/workspaces', { method: 'POST', body: input, signal }),
      get: (workspaceId, signal) => this.request(`/api/workspaces/${segment(workspaceId)}`, { method: 'GET', signal }),
      update: (workspaceId, input, signal) => this.request(`/api/workspaces/${segment(workspaceId)}`, { method: 'PATCH', body: input, signal }),
    }
    this.pages = {
      list: (workspaceId, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/pages`, { method: 'GET', signal }),
      create: (workspaceId, input, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/pages`, { method: 'POST', body: input, signal }),
      get: (workspaceId, pageId, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/pages/${segment(pageId)}`, { method: 'GET', signal }),
      update: (workspaceId, pageId, input, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/pages/${segment(pageId)}`, { method: 'PATCH', body: input, signal }),
      move: (workspaceId, pageId, input, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/pages/${segment(pageId)}/move`, { method: 'PATCH', body: input, signal }),
      delete: async (workspaceId, pageId, signal) => {
        await this.request(`/api/workspaces/${segment(workspaceId)}/pages/${segment(pageId)}`, { method: 'DELETE', signal })
      },
    }
    this.blocks = {
      list: (workspaceId, pageId, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/pages/${segment(pageId)}/blocks`, { method: 'GET', signal }),
      create: (workspaceId, pageId, input, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/pages/${segment(pageId)}/blocks`, { method: 'POST', body: input, signal }),
      get: (workspaceId, pageId, blockId, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/pages/${segment(pageId)}/blocks/${segment(blockId)}`, { method: 'GET', signal }),
      update: (workspaceId, pageId, blockId, input, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/pages/${segment(pageId)}/blocks/${segment(blockId)}`, { method: 'PATCH', body: input, signal }),
      delete: async (workspaceId, pageId, blockId, signal) => {
        await this.request(`/api/workspaces/${segment(workspaceId)}/pages/${segment(pageId)}/blocks/${segment(blockId)}`, { method: 'DELETE', signal })
      },
    }
    this.files = {
      upload: (workspaceId, fileId, file, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/files`, {
        method: 'POST',
        rawBody: file,
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Eotion-File-Id': segment(fileId),
          'X-Eotion-File-Name': segment(file.name),
          'X-Eotion-File-Mime-Type': segment(file.type || 'application/octet-stream'),
        },
        signal,
      }),
      list: (workspaceId, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/files`, { method: 'GET', signal }),
      get: (workspaceId, fileId, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/files/${segment(fileId)}`, { method: 'GET', signal }),
      update: (workspaceId, fileId, input, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/files/${segment(fileId)}`, { method: 'PATCH', body: input, signal }),
      delete: (workspaceId, fileId, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/files/${segment(fileId)}`, { method: 'DELETE', signal }),
    }
    this.databases = {
      listDatabases: (workspaceId, window = {}, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/databases${query(window)}`, { method: 'GET', signal }),
      listNavigation: (workspaceId, window = {}, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/database-navigation${query(window)}`, { method: 'GET', signal }),
      listDatabaseViews: (workspaceId, databaseId, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/databases/${segment(databaseId)}/views`, { method: 'GET', signal }),
      getDatabaseTable: (workspaceId, databaseId, viewId, window = {}, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/databases/${segment(databaseId)}/views/${segment(viewId)}/table${query(window)}`, { method: 'GET', signal }),
      getDatabaseViewRecords: (workspaceId, databaseId, viewId, window = {}, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/databases/${segment(databaseId)}/views/${segment(viewId)}/records${query(window)}`, { method: 'GET', signal }),
      getDatabaseViewGroupRecords: async (workspaceId, databaseId, viewId, groupKey, window = {}, signal) => {
        const group = DatabaseViewGroupKeySchema.parse(groupKey)
        const request = DatabaseViewGroupRecordsQuerySchema.parse({ groupKind: group.kind, ...(group.kind === 'option' ? { optionId: group.optionId } : {}), ...window })
        const params = new URLSearchParams({ groupKind: request.groupKind })
        if (request.optionId !== undefined) params.set('optionId', request.optionId)
        params.set('limit', String(request.limit))
        if (request.cursor !== undefined) params.set('cursor', request.cursor)
        const response: unknown = await this.request(`/api/workspaces/${segment(workspaceId)}/databases/${segment(databaseId)}/views/${segment(viewId)}/group-records?${params}`, { method: 'GET', signal })
        const result = DatabaseViewGroupRecordsResponseSchema.parse(response)
        if (result.database.workspaceId !== workspaceId || result.database.id !== databaseId || result.view.id !== viewId) {
          throw new TypeError('Group records response belongs to a different workspace, database, or view')
        }
        if (result.group.kind !== group.kind || (group.kind === 'option' && result.group.kind === 'option' && result.group.optionId !== group.optionId)) {
          throw new TypeError('Group records response belongs to a different group')
        }
        return result
      },
      listRelationCandidates: (workspaceId, databaseId, input = {}, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/databases/${segment(databaseId)}/record-options${query(input)}`, { method: 'GET', signal }),
      resolveRelationTitles: (workspaceId, databaseId, input, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/databases/${segment(databaseId)}/record-options/resolve`, { method: 'POST', body: input, signal }),
      createDatabaseInPage: (workspaceId, pageId, input, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/pages/${segment(pageId)}/databases`, { method: 'POST', body: input, signal }),
      linkDatabaseInPage: (workspaceId, pageId, input, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/pages/${segment(pageId)}/database-links`, { method: 'POST', body: input, signal }),
      createDatabaseRecord: (workspaceId, databaseId, input, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/databases/${segment(databaseId)}/records`, { method: 'POST', body: input, signal }),
      createDatabaseProperty: (workspaceId, databaseId, input, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/databases/${segment(databaseId)}/properties`, { method: 'POST', body: input, signal }),
      updateDatabaseProperty: (workspaceId, databaseId, propertyId, input, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/databases/${segment(databaseId)}/properties/${segment(propertyId)}`, { method: 'PATCH', body: input, signal }),
      changeDatabasePropertyType: (workspaceId, databaseId, propertyId, input, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/databases/${segment(databaseId)}/properties/${segment(propertyId)}/type`, { method: 'PATCH', body: input, signal }),
      deleteDatabaseProperty: (workspaceId, databaseId, propertyId, input, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/databases/${segment(databaseId)}/properties/${segment(propertyId)}`, { method: 'DELETE', body: input, signal }),
      createDatabaseView: (workspaceId, databaseId, input, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/databases/${segment(databaseId)}/views`, { method: 'POST', body: input, signal }),
      updateDatabaseView: (workspaceId, databaseId, viewId, input, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/databases/${segment(databaseId)}/views/${segment(viewId)}`, { method: 'PATCH', body: input, signal }),
      deleteDatabaseView: (workspaceId, databaseId, viewId, input, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/databases/${segment(databaseId)}/views/${segment(viewId)}`, { method: 'DELETE', body: input, signal }),
      reorderDatabaseViewRecord: async (workspaceId, databaseId, viewId, input, signal) => {
        const request = DatabaseViewRecordReorderRequestSchema.parse(input)
        const response: unknown = await this.request(`/api/workspaces/${segment(workspaceId)}/databases/${segment(databaseId)}/views/${segment(viewId)}/record-order`, { method: 'POST', body: request, signal })
        const result = DatabaseViewRecordReorderResponseSchema.parse(response)
        if (result.database.workspaceId !== workspaceId || result.database.id !== databaseId || result.view.id !== viewId) {
          throw new TypeError('Record reorder response belongs to a different workspace, database, or view')
        }
        return result
      },
      moveDatabaseViewRecordGroup: async (workspaceId, databaseId, viewId, input, signal) => {
        const request = DatabaseViewRecordGroupMoveRequestSchema.parse(input)
        const response: unknown = await this.request(`/api/workspaces/${segment(workspaceId)}/databases/${segment(databaseId)}/views/${segment(viewId)}/record-group`, { method: 'POST', body: request, signal })
        const result = DatabaseViewRecordGroupMoveResponseSchema.parse(response)
        if (result.database.workspaceId !== workspaceId || result.database.id !== databaseId || result.view.id !== viewId) {
          throw new TypeError('Record group move response belongs to a different workspace, database, or view')
        }
        if (result.record.id !== request.recordId) throw new TypeError('Record group move response belongs to a different record')
        const propertyId = result.view.config?.options?.groupByPropertyId
        if ((result.view.type !== 'board' && result.view.type !== 'timeline')
          || !DatabaseViewGroupKeySchema.safeParse({ kind: 'option', optionId: propertyId }).success) {
          throw new TypeError('Record group move response has no valid grouping property')
        }
        const value = result.record.properties[propertyId as string]
        if (request.targetGroup.kind === 'option' ? value !== request.targetGroup.optionId : value !== null && value !== undefined) {
          throw new TypeError('Record group move response does not match the target group')
        }
        return result
      },
      updateDatabaseRecordCell: (workspaceId, databaseId, recordId, propertyId, input, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/databases/${segment(databaseId)}/records/${segment(recordId)}/cells/${segment(propertyId)}`, { method: 'PATCH', body: input, signal }),
      // Mutation requests are deliberately single-shot; an uncertain response must be resolved via the receipt endpoint.
      mutateDatabaseCells: (workspaceId, databaseId, input, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/databases/${segment(databaseId)}/cell-mutations`, { method: 'POST', body: input, signal }),
      getDatabaseCellMutationReceipt: (workspaceId, databaseId, mutationId, signal) => this.request(`/api/workspaces/${segment(workspaceId)}/databases/${segment(databaseId)}/cell-mutations/${segment(mutationId)}`, { method: 'GET', signal }),
    }
    this.sync = {
      send: async (operation, signal) => {
        await this.request('/api/sync/operations', { method: 'POST', body: operation, signal })
      },
      snapshot: (workspaceId, signal) => this.request(`/api/sync/workspaces/${segment(workspaceId)}/snapshot`, { method: 'GET', signal }),
    }
  }

  async health(signal?: AbortSignal): Promise<HealthResponse> {
    return this.request('/api/health', { method: 'GET', signal })
  }

  private async request<T>(path: string, options: {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
    body?: unknown
    rawBody?: BodyInit
    headers?: Record<string, string>
    signal?: AbortSignal
  }): Promise<T> {
    const hasBody = options.body !== undefined
    const headers = {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    }
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: options.method,
      credentials: 'include',
      signal: options.signal,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      body: options.rawBody ?? (hasBody ? JSON.stringify(options.body) : undefined),
    })

    if (!response.ok) {
      let parsed: ApiErrorResponse | undefined
      let fallback = `Eotion API request failed: ${response.status}`
      try {
        const payload: unknown = await response.json()
        const result = ApiErrorResponseSchema.safeParse(payload)
        if (result.success) parsed = result.data
        else if (typeof payload === 'object' && payload !== null && 'message' in payload && typeof payload.message === 'string') fallback = payload.message
      } catch {
        // Leave the status-based fallback message for empty or non-JSON error bodies.
      }
      throw new ApiError(response.status, parsed, fallback)
    }

    if (response.status === 204) return undefined as T
    return await response.json() as T
  }
}

/** Sends persisted P3 operations without changing their stable ID or sequence. */
export class EotionOperationTransport {
  private readonly client: EotionApiClient

  constructor(client: EotionApiClient) {
    this.client = client
  }

  async send(operation: SyncOperation & { status?: unknown }): Promise<void> {
    // Explicitly reject pre-P4.4 local records. Their workspace and page-tree
    // data cannot be reconstructed safely from the legacy oplog.
    const { status: _status, ...wire } = operation
    const parsed = SyncOperationSchema.parse(wire)
    await this.client.sync.send(parsed)
  }
}

function segment(value: string): string {
  return encodeURIComponent(value)
}

function query(value: { limit?: number; cursor?: string; search?: string }): string {
  const params = new URLSearchParams()
  if (value.search !== undefined) params.set('search', value.search)
  if (value.limit !== undefined) params.set('limit', String(value.limit))
  if (value.cursor !== undefined) params.set('cursor', value.cursor)
  const encoded = params.toString()
  return encoded ? `?${encoded}` : ''
}
