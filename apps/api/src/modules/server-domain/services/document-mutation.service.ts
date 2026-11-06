import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { assignBlockOrder, nextOrderKey } from '@eotion/domain'
import { randomUUID } from 'node:crypto'
import type { ClientSession } from 'mongoose'

import type { PageRecord, ServerBlockRecord } from '../types'
import { BlockService } from './block.service'
import { McpMutationService } from './mcp-mutation.service'
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

@Injectable()
export class DocumentMutationService {
  constructor(
    private readonly mutations: McpMutationService,
    private readonly pages: PageService,
    private readonly blocks: BlockService,
    private readonly permissions: WorkspacePermissionService,
  ) {}

  async create<T>(userId: string, input: CreateDocumentInput, project: DocumentResultProject<T>, requestPayload?: unknown): Promise<T> {
    return this.mutations.execute(userId, 'eotion_create_page', input.idempotencyKey, requestPayload === undefined ? input : requestPayload,
      async () => this.permissions.assertCanWrite(userId, input.workspaceId), async (session) => {
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

      return this.projectResult(userId, page, project, session)
    })
  }

  async update<T>(userId: string, input: UpdateDocumentInput, project: DocumentResultProject<T>, requestPayload?: unknown): Promise<T> {
    return this.mutations.execute(userId, 'eotion_update_page', input.idempotencyKey, requestPayload === undefined ? input : requestPayload,
      async (session) => {
      const page = await this.pages.findAccessible(userId, input.pageId, session)
      await this.permissions.assertCanWrite(userId, page.workspaceId)
    }, async (session) => {
      const page = await this.pages.findAccessible(userId, input.pageId, session)
      await this.pages.updateDocumentVersion(userId, page.workspaceId, page.id, input.expectedUpdatedAt, input.title, session)
      if (input.blocks !== undefined) await this.replaceBlocks(userId, page, input.blocks, session)
      const current = await this.pages.find(userId, page.workspaceId, page.id, session)
      if (!current) throw new NotFoundException('Page not found')
      return this.projectResult(userId, current, project, session)
    })
  }

  private async projectResult<T>(userId: string, page: PageRecord, project: DocumentResultProject<T>, session: ClientSession): Promise<T> {
    const current = await this.pages.find(userId, page.workspaceId, page.id, session)
    if (!current) throw new NotFoundException('Page not found')
    const documentBlocks = await this.blocks.listBounded(userId, current.workspaceId, current.id, 1000, session)
    const result = project(current, documentBlocks)
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
