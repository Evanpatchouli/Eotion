import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { InjectConnection } from '@nestjs/mongoose'
import { assignBlockOrder, nextOrderKey } from '@eotion/domain'
import { createHash, randomUUID } from 'node:crypto'
import type { ClientSession, Connection } from 'mongoose'

import type { PageRecord, ServerBlockRecord } from '../types'
import { McpMutationRepository, type McpMutationReceiptRecord, type McpMutationTool } from '../repositories/mcp-mutation.repository'
import { BlockService } from './block.service'
import { supportsTransactions } from './mongo-transactions'
import { PageService } from './page.service'
import { WorkspacePermissionService } from './workspace-permission.service'

export interface DocumentBlockInput {
  id?: string
  type: ServerBlockRecord['type']
  props: Record<string, unknown>
}

export interface CreateDocumentInput {
  workspaceId: string
  parentPageId?: string | null
  title: string
  blocks: DocumentBlockInput[]
  idempotencyKey: string
}

export interface UpdateDocumentInput {
  pageId: string
  expectedUpdatedAt: string
  title?: string
  blocks?: DocumentBlockInput[]
  idempotencyKey: string
}

export type DocumentResultProject<T> = (page: PageRecord, blocks: ServerBlockRecord[]) => T

type MutationReceiptKey = Pick<McpMutationReceiptRecord, 'userId' | 'tool' | 'idempotencyKey'>

function canonical(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new BadRequestException('Mutation request is not JSON serializable')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map((item) => item === undefined ? 'null' : canonical(item)).join(',')}]`
  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  }
  throw new BadRequestException('Mutation request is not JSON serializable')
}

function requestHash(tool: McpMutationTool, payload: unknown): string {
  return createHash('sha256').update(canonical({ tool, payload })).digest('hex')
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000
}

function isTransactionUnsupported(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  if ('message' in error && typeof error.message === 'string' && error.message.includes('Transaction numbers are only allowed')) return true
  if ('originalError' in error && isTransactionUnsupported(error.originalError)) return true
  return 'errorResponse' in error && isTransactionUnsupported(error.errorResponse)
}

@Injectable()
export class DocumentMutationService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly receipts: McpMutationRepository,
    private readonly pages: PageService,
    private readonly blocks: BlockService,
    private readonly permissions: WorkspacePermissionService,
  ) {}

  async create<T>(userId: string, input: CreateDocumentInput, project: DocumentResultProject<T>, requestPayload?: unknown): Promise<T> {
    const tool: McpMutationTool = 'eotion_create_page'
    const hash = requestHash(tool, requestPayload === undefined ? input : requestPayload)
    const key: MutationReceiptKey = { userId, tool, idempotencyKey: input.idempotencyKey }
    return this.run(key, hash, async (session) => {
      const siblings = (await this.pages.list(userId, input.workspaceId, session))
        .filter((page) => page.parentPageId === (input.parentPageId ?? null))
      const page = await this.pages.create(userId, input.workspaceId, {
        id: randomUUID(),
        parentPageId: input.parentPageId ?? null,
        title: input.title,
        orderKey: nextOrderKey(siblings),
      }, session)

      const orderedInputs = assignBlockOrder(
        input.blocks.map((block) => ({ ...block, id: randomUUID(), orderKey: '' })),
        new Map<string, string>(),
      )
      for (const block of orderedInputs) {
        await this.blocks.create(userId, page.workspaceId, page.id, {
          id: block.id,
          pageId: page.id,
          parentBlockId: null,
          type: block.type,
          orderKey: block.orderKey,
          props: block.props,
        }, session)
      }

      return this.saveProjectedResult(userId, page, project, key, hash, session)
    }, async () => this.permissions.assertCanWrite(userId, input.workspaceId))
  }

  async update<T>(userId: string, input: UpdateDocumentInput, project: DocumentResultProject<T>, requestPayload?: unknown): Promise<T> {
    const tool: McpMutationTool = 'eotion_update_page'
    const hash = requestHash(tool, requestPayload === undefined ? input : requestPayload)
    const key: MutationReceiptKey = { userId, tool, idempotencyKey: input.idempotencyKey }
    return this.run(key, hash, async (session) => {
      const page = await this.pages.findAccessible(userId, input.pageId, session)
      await this.pages.updateDocumentVersion(userId, page.workspaceId, page.id, input.expectedUpdatedAt, input.title, session)
      if (input.blocks !== undefined) await this.replaceBlocks(userId, page, input.blocks, session)
      const current = await this.pages.find(userId, page.workspaceId, page.id, session)
      if (!current) throw new NotFoundException('Page not found')
      return this.saveProjectedResult(userId, current, project, key, hash, session)
    }, async (session) => {
      const page = await this.pages.findAccessible(userId, input.pageId, session)
      await this.permissions.assertCanWrite(userId, page.workspaceId)
    })
  }

  private async run<T>(key: MutationReceiptKey, hash: string, operation: (session: ClientSession) => Promise<T>, assertResourceAccess: (session?: ClientSession) => Promise<void>): Promise<T> {
    await this.receipts.ensureReady()
    if (!(await supportsTransactions(this.connection))) {
      throw new ServiceUnavailableException('Document mutations require MongoDB replica set transactions')
    }

    const session = await this.connection.startSession()
    try {
      try {
        let result!: T
        await session.withTransaction(async () => {
          // Mongo may retry this callback after transient transaction errors.
          // Re-read the receipt and re-check permission on every attempt.
          await assertResourceAccess(session)
          const replay = await this.readReplay<T>(key, hash, session)
          if (replay.found) {
            result = replay.result
            return
          }
          result = await operation(session)
        })
        return result
      } catch (error) {
        if (isTransactionUnsupported(error)) throw new ServiceUnavailableException('Document mutations require MongoDB replica set transactions')
        if (!isDuplicateKey(error)) throw error
        await assertResourceAccess()
        const receipt = await this.receipts.find(key)
        if (!receipt) throw error
        if (receipt.requestHash !== hash) throw new ConflictException('Idempotency key already used with different content')
        return receipt.result as T
      }
    } finally {
      await session.endSession()
    }
  }

  private async readReplay<T>(key: MutationReceiptKey, hash: string, session: ClientSession): Promise<{ found: false } | { found: true; result: T }> {
    const receipt = await this.receipts.find(key, session)
    if (!receipt) return { found: false }
    if (receipt.requestHash !== hash) throw new ConflictException('Idempotency key already used with different content')
    return { found: true, result: receipt.result as T }
  }

  private async saveProjectedResult<T>(userId: string, page: PageRecord, project: DocumentResultProject<T>, key: MutationReceiptKey, hash: string, session: ClientSession): Promise<T> {
    const current = await this.pages.find(userId, page.workspaceId, page.id, session)
    if (!current) throw new NotFoundException('Page not found')
    const documentBlocks = await this.blocks.listBounded(userId, current.workspaceId, current.id, 1000, session)
    const result = project(current, documentBlocks)
    await this.receipts.create({
      id: randomUUID(),
      ...key,
      requestHash: hash,
      status: 'committed',
      result,
    }, session)
    return result
  }

  private async replaceBlocks(userId: string, page: PageRecord, inputs: DocumentBlockInput[], session: ClientSession): Promise<void> {
    const current = await this.blocks.listBounded(userId, page.workspaceId, page.id, 1000, session)
    if (current.some((block) => block.parentBlockId !== null && block.parentBlockId !== undefined)) {
      throw new BadRequestException('Nested blocks cannot be replaced by this document mutation')
    }
    const existingById = new Map(current.map((block) => [block.id, block]))
    const seen = new Set<string>()
    for (const input of inputs) {
      if (input.id === undefined) continue
      if (seen.has(input.id)) throw new BadRequestException('Block IDs must be unique within a document')
      seen.add(input.id)
      if (!existingById.has(input.id)) throw new BadRequestException('Block ID must belong to the target page')
    }

    const normalized = inputs.map((block) => ({
      ...block,
      id: block.id ?? randomUUID(),
      orderKey: existingById.get(block.id ?? '')?.orderKey ?? '',
    }))
    const previous = new Map(current.map((block) => [block.id, block.orderKey]))
    const ordered = assignBlockOrder(normalized, previous)
    const wanted = new Set(ordered.map((block) => block.id))

    for (const block of ordered) {
      if (existingById.has(block.id)) {
        const updated = await this.blocks.update(userId, page.workspaceId, page.id, block.id, {
          type: block.type,
          props: block.props,
          orderKey: block.orderKey,
        }, session)
        if (!updated) throw new ConflictException('Page changed while its blocks were being updated')
      } else {
        await this.blocks.create(userId, page.workspaceId, page.id, {
          id: block.id,
          pageId: page.id,
          parentBlockId: null,
          type: block.type,
          props: block.props,
          orderKey: block.orderKey,
        }, session)
      }
    }
    for (const block of current) {
      if (!wanted.has(block.id)) await this.blocks.delete(userId, page.workspaceId, block.id, session)
    }
  }
}
