import type { BlockResponse, BlockUpdateRequest } from '@eotion/contracts'
import type { JSONContent } from '@tiptap/core'

import { errorMessage } from '../services/productApi'
import { useProductSyncStore } from '../stores/productSync'
import { assignBlockOrder } from './blockOrder'
import { blocksToDocument, documentToBlocks, type EditorBlock } from './blockCodec'
import { rememberPageDraft } from './pendingPageDraft'

export type SaveStatus = 'loading' | 'saved' | 'saving' | 'error'

export class PagePersistence {
  status: SaveStatus = 'loading'
  error = ''
  private baseline = new Map<string, BlockResponse>()
  private hasStoredBlocks = false
  private document: JSONContent | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private saving: Promise<boolean> | null = null
  private composing = false
  private disposed = false

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

  preserveDraft(): void {
    if (this.document && this.hasPendingWork) rememberPageDraft(this.userId, this.workspaceId, this.pageId, this.document)
  }

  async load(_signal?: AbortSignal): Promise<JSONContent> {
    this.state('loading')
    try {
      const blocks = await (await useProductSyncStore().store()).listBlocksByPage(this.pageId)
      const document = blocksToDocument(blocks)
      this.baseline = new Map(blocks.map((block) => [block.id, block]))
      this.hasStoredBlocks = blocks.length > 0
      this.document = document
      this.state('saved')
      return document
    } catch (cause) {
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
    else if (this.document) {
      this.schedule()
      useProductSyncStore().requestSync()
    }
  }

  get dirty(): boolean {
    if (!this.document) return false
    try { return this.changes().length > 0 } catch { return true }
  }

  get hasPendingWork(): boolean {
    return this.composing || this.saving !== null || this.dirty
  }

  matchesLocalBlocks(blocks: BlockResponse[]): boolean {
    if (blocks.length !== this.baseline.size) return false
    return blocks.every((block) => {
      const old = this.baseline.get(block.id)
      return old?.type === block.type && old.orderKey === block.orderKey &&
        JSON.stringify(old.props) === JSON.stringify(block.props)
    })
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
    if (this.saving) {
      const inFlight = this.saving
      if (!(await inFlight)) return false
      if (!this.dirty) return true
      if (this.saving === inFlight) this.saving = null
      return this.flush()
    }
    let run: Promise<boolean> | null = null
    try {
      if (!this.dirty) {
        this.state('saved')
        return true
      }
      this.state('saving')
      run = this.drain()
      this.saving = run
      return await run
    } catch (cause) {
      this.state('error', errorMessage(cause, '保存失败，请重试。'))
      return false
    } finally {
      if (this.saving === run) this.saving = null
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
    const decoded = documentToBlocks(this.document, [...this.baseline.values()], this.hasStoredBlocks)
    return assignBlockOrder(decoded, new Map([...this.baseline].map(([id, block]) => [id, block.orderKey])))
  }

  private changes(): Array<{ kind: 'create' | 'update' | 'delete'; block: EditorBlock | BlockResponse; patch?: BlockUpdateRequest }> {
    const current = this.currentBlocks()
    const byId = new Map(current.map((block) => [block.id, block]))
    const changes: Array<{ kind: 'create' | 'update' | 'delete'; block: EditorBlock | BlockResponse; patch?: BlockUpdateRequest }> = []
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
    for (const old of this.baseline.values()) {
      if (!byId.has(old.id)) changes.push({ kind: 'delete', block: old })
    }
    return changes
  }

  private async drain(): Promise<boolean> {
    try {
      const sync = useProductSyncStore()
      const local = await sync.store()
      while (!this.composing) {
        const next = this.changes()[0]
        if (!next) {
          this.state('saved')
          return true
        }
        try {
          if (next.kind === 'delete') {
            await local.deleteBlock(this.workspaceId, next.block.id)
            this.baseline.delete(next.block.id)
          } else if (next.kind === 'create') {
            const block = next.block as EditorBlock
            const now = new Date().toISOString()
            const created: BlockResponse = {
              id: block.id, workspaceId: this.workspaceId, pageId: this.pageId, parentBlockId: null,
              type: block.type, orderKey: block.orderKey, props: block.props, createdAt: now, updatedAt: now,
            }
            await local.upsertBlock(created)
            this.baseline.set(created.id, created)
            this.hasStoredBlocks = true
          } else {
            const old = this.baseline.get(next.block.id)!
            const updated: BlockResponse = { ...old, ...next.patch!, updatedAt: new Date().toISOString() }
            await local.upsertBlock(updated)
            this.baseline.set(updated.id, updated)
            this.hasStoredBlocks = true
          }
          sync.localMutation()
        } catch (cause) {
          throw cause
        }
      }
      return false
    } catch (cause) {
      this.state('error', errorMessage(cause, '保存失败，请重试。'))
      return false
    }
  }

}
