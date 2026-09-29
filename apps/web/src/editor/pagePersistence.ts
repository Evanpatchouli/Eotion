import type { BlockResponse, BlockCreateRequest, BlockUpdateRequest } from '@eotion/contracts'
import type { JSONContent } from '@tiptap/core'

import { api, errorMessage, expireSessionFromApi, ApiError } from '../services/productApi'
import { assignBlockOrder } from './blockOrder'
import { blocksToDocument, documentToBlocks, type EditorBlock } from './blockCodec'
import { rememberPageDraft } from './pendingPageDraft'

export type SaveStatus = 'loading' | 'saved' | 'saving' | 'error'

export class PagePersistence {
  status: SaveStatus = 'loading'
  error = ''
  private baseline = new Map<string, BlockResponse>()
  private document: JSONContent | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private saving: Promise<boolean> | null = null
  private composing = false
  private disposed = false
  private uncertainBlockId: string | null = null

  constructor(
    private readonly userId: string,
    private readonly workspaceId: string,
    private readonly pageId: string,
    private readonly onChange: (status: SaveStatus, error: string) => void,
  ) {}

  private state(status: SaveStatus, error = ''): void {
    this.status = status
    this.error = error
    if (!this.disposed) this.onChange(status, error)
  }

  private expireWithDraft(): void {
    this.preserveDraft()
    expireSessionFromApi()
  }

  preserveDraft(): void {
    if (this.document && this.hasPendingWork) rememberPageDraft(this.userId, this.workspaceId, this.pageId, this.document)
  }

  async load(signal?: AbortSignal): Promise<JSONContent> {
    this.state('loading')
    try {
      const blocks = await api.blocks.list(this.workspaceId, this.pageId, signal)
      const document = blocksToDocument(blocks)
      this.baseline = new Map(blocks.map((block) => [block.id, block]))
      this.document = document
      this.state('saved')
      return document
    } catch (cause) {
      if (cause instanceof ApiError && cause.statusCode === 401) this.expireWithDraft()
      this.state('error', errorMessage(cause, '无法加载区块，请重试。'))
      throw cause
    }
  }

  update(document: JSONContent): void {
    this.document = document
    try {
      this.currentBlocks()
      this.state('saving')
      if (!this.composing) this.schedule()
    } catch (cause) {
      this.clearTimer()
      this.state('error', errorMessage(cause, '当前内容无法安全保存。'))
    }
  }

  setComposing(value: boolean): void {
    this.composing = value
    if (value) this.clearTimer()
    else if (this.document) this.schedule()
  }

  get dirty(): boolean {
    if (!this.document) return false
    try { return this.changes().length > 0 } catch { return true }
  }

  get hasPendingWork(): boolean {
    return this.saving !== null || this.uncertainBlockId !== null || this.dirty
  }

  retry(): Promise<boolean> {
    return this.flush()
  }

  async flush(): Promise<boolean> {
    this.clearTimer()
    if (this.composing) {
      this.state('error', '请先完成当前输入，再重试保存。')
      return false
    }
    if (this.saving) return this.saving
    try {
      if (!this.dirty && !this.uncertainBlockId) {
        this.state('saved')
        return true
      }
      this.state('saving')
      const run = this.drain()
      this.saving = run
      return await run
    } catch (cause) {
      if (cause instanceof ApiError && cause.statusCode === 401) this.expireWithDraft()
      this.state('error', errorMessage(cause, '保存失败，请重试。'))
      return false
    } finally {
      this.saving = null
    }
  }

  dispose(): void {
    this.disposed = true
    this.clearTimer()
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private schedule(): void {
    this.clearTimer()
    this.timer = setTimeout(() => { void this.flush() }, 500)
  }

  private currentBlocks(): EditorBlock[] {
    if (!this.document) return []
    const decoded = documentToBlocks(this.document, [...this.baseline.values()])
    return assignBlockOrder(decoded, new Map([...this.baseline].map(([id, block]) => [id, block.orderKey])))
  }

  private changes(): Array<{ kind: 'create' | 'update' | 'delete'; block: EditorBlock | BlockResponse; patch?: BlockUpdateRequest }> {
    const current = this.currentBlocks()
    const byId = new Map(current.map((block) => [block.id, block]))
    const changes: Array<{ kind: 'create' | 'update' | 'delete'; block: EditorBlock | BlockResponse; patch?: BlockUpdateRequest }> = []
    for (const old of this.baseline.values()) {
      if (!byId.has(old.id)) changes.push({ kind: 'delete', block: old })
    }
    for (const block of current) {
      const old = this.baseline.get(block.id)
      if (!old) {
        changes.push({ kind: 'create', block })
        continue
      }
      const patch: BlockUpdateRequest = {}
      if (old.type !== block.type) patch.type = block.type
      if (old.orderKey !== block.orderKey) patch.orderKey = block.orderKey
      if (JSON.stringify(old.props) !== JSON.stringify(block.props)) patch.props = block.props
      if (Object.keys(patch).length) changes.push({ kind: 'update', block, patch })
    }
    return changes
  }

  private async drain(): Promise<boolean> {
    try {
      await this.reconcileUncertainMutation()
      while (!this.composing) {
        const next = this.changes()[0]
        if (!next) {
          this.state('saved')
          return true
        }
        try {
          if (next.kind === 'delete') {
            await api.blocks.delete(this.workspaceId, this.pageId, next.block.id)
            this.baseline.delete(next.block.id)
          } else if (next.kind === 'create') {
            const block = next.block as EditorBlock
            const created = await api.blocks.create(this.workspaceId, this.pageId, {
              id: block.id, parentBlockId: null, type: block.type, orderKey: block.orderKey, props: block.props,
            } satisfies BlockCreateRequest)
            this.baseline.set(created.id, created)
          } else {
            const updated = await api.blocks.update(this.workspaceId, this.pageId, next.block.id, next.patch!)
            this.baseline.set(updated.id, updated)
          }
        } catch (cause) {
          this.uncertainBlockId = next.block.id
          throw cause
        }
      }
      return false
    } catch (cause) {
      if (cause instanceof ApiError && cause.statusCode === 401) this.expireWithDraft()
      this.state('error', errorMessage(cause, '保存失败，请重试。'))
      return false
    }
  }

  private async reconcileUncertainMutation(): Promise<void> {
    const id = this.uncertainBlockId
    if (!id) return
    try {
      const block = await api.blocks.get(this.workspaceId, this.pageId, id)
      // A remote block with unsupported content must not be overwritten.
      blocksToDocument([block])
      this.baseline.set(id, block)
    } catch (cause) {
      if (!(cause instanceof ApiError) || cause.statusCode !== 404) throw cause
      this.baseline.delete(id)
    }
    this.uncertainBlockId = null
  }
}
