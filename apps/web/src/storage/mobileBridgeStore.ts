import type { BlockRecord, PageSummary } from '@eotion/domain'
import {
  MOBILE_STORAGE_CHANNEL,
  createLocalId,
  type MobileStorageRequest,
  type MobileStorageResponse,
} from '@eotion/storage'
import type { LocalStore, StorageOperation } from '@eotion/storage'

type Pending = { resolve(value: unknown): void; reject(reason: Error): void; timer: number; method: keyof LocalStore; sentAt: number; sequence: number }
const COMPLETED_ID_LIMIT = 256

export type MobileBridgeDiagnostics = {
  requestsSent: number
  responsesReceived: number
  pending: number
  timeouts: number
  unknownResponses: number
  duplicateResponses: number
  methodMismatches: number
  lastRequest?: { id: string; method: string; sentAt: number }
  lastResponse?: { id: string; method: string; status: string; latencyMs?: number }
  recentEvents: Array<{ sequence: number; id: string; method: string; status: string; latencyMs?: number }>
}

function emptyDiagnostics(): MobileBridgeDiagnostics {
  return { requestsSent: 0, responsesReceived: 0, pending: 0, timeouts: 0,
    unknownResponses: 0, duplicateResponses: 0, methodMismatches: 0, recentEvents: [] }
}

/** WebView-side LocalStore proxy. The Lynx shell currently responds unavailable. */
export class MobileBridgeLocalStore implements LocalStore {
  private readonly pending = new Map<string, Pending>()
  private readonly completedIds = new Set<string>()
  private readonly diagnosticsListeners = new Set<(snapshot: MobileBridgeDiagnostics) => void>()
  private diagnostics = emptyDiagnostics()

  /** Development-only, in-memory bridge observation; outside the LocalStore contract. */
  getDiagnostics(): MobileBridgeDiagnostics {
    return { ...this.diagnostics, recentEvents: this.diagnostics.recentEvents.map((event) => ({ ...event })),
      lastRequest: this.diagnostics.lastRequest && { ...this.diagnostics.lastRequest },
      lastResponse: this.diagnostics.lastResponse && { ...this.diagnostics.lastResponse } }
  }

  subscribeDiagnostics(listener: (snapshot: MobileBridgeDiagnostics) => void): () => void {
    if (!import.meta.env.DEV) return () => {}
    this.diagnosticsListeners.add(listener)
    listener(this.getDiagnostics())
    return () => this.diagnosticsListeners.delete(listener)
  }

  clearDiagnostics(): void {
    if (!import.meta.env.DEV || this.pending.size > 0) return
    this.completedIds.clear()
    this.diagnostics = emptyDiagnostics()
    this.publishDiagnostics()
  }

  private publishDiagnostics(): void {
    if (!import.meta.env.DEV) return
    this.diagnostics.pending = this.pending.size
    const snapshot = this.getDiagnostics()
    for (const listener of this.diagnosticsListeners) listener(snapshot)
  }

  private recordEvent(event: MobileBridgeDiagnostics['recentEvents'][number]): void {
    this.diagnostics.recentEvents.unshift(event)
    this.diagnostics.recentEvents.length = Math.min(this.diagnostics.recentEvents.length, 20)
  }

  private recordCompletedId(id: string): void {
    this.completedIds.add(id)
    if (this.completedIds.size > COMPLETED_ID_LIMIT) {
      const oldest = this.completedIds.values().next().value
      if (oldest !== undefined) this.completedIds.delete(oldest)
    }
  }

  constructor() {
    window.__eotionMobileStorageReceive = (response: MobileStorageResponse) => {
      if (response?.channel !== MOBILE_STORAGE_CHANNEL || response.kind !== 'response') return
      const request = this.pending.get(response.id)
      if (import.meta.env.DEV) {
        const responseStatus = response.ok ? 'ok' : response.error.code
        const status = request && response.method !== request.method
          ? `method-mismatch (${responseStatus})` : responseStatus
        this.diagnostics.responsesReceived += 1
        this.diagnostics.lastResponse = { id: response.id, method: response.method,
          status,
          latencyMs: request && Date.now() - request.sentAt }
        if (!request) {
          if (this.completedIds.has(response.id)) this.diagnostics.duplicateResponses += 1
          else this.diagnostics.unknownResponses += 1
          this.publishDiagnostics()
        } else if (response.method !== request.method) {
          this.diagnostics.methodMismatches += 1
        }
      }
      if (!request) return
      window.clearTimeout(request.timer)
      this.pending.delete(response.id)
      if (import.meta.env.DEV) {
        this.recordCompletedId(response.id)
        this.recordEvent({ sequence: request.sequence, id: response.id, method: request.method,
          status: response.method === request.method ? (response.ok ? 'ok' : response.error.code)
            : `method-mismatch (${response.ok ? 'ok' : response.error.code}; response method: ${response.method})`,
          latencyMs: Date.now() - request.sentAt })
        this.publishDiagnostics()
      }
      if (response.method !== request.method) {
        request.reject(new Error(`Mobile storage bridge protocol error: response method ${response.method} does not match request method ${request.method}`))
        return
      }
      if (response.ok) request.resolve(response.result)
      else request.reject(new Error(`${response.error.code}: ${response.error.message}`))
    }
  }

  private call<K extends keyof LocalStore>(method: K, ...args: Parameters<LocalStore[K]>): Promise<Awaited<ReturnType<LocalStore[K]>>> {
    const id = createLocalId()
    const message = { channel: MOBILE_STORAGE_CHANNEL, kind: 'request', id, method, args } as MobileStorageRequest
    return new Promise((resolve, reject) => {
      const sentAt = Date.now()
      const timer = window.setTimeout(() => {
        this.pending.delete(id)
        if (import.meta.env.DEV) {
          this.diagnostics.timeouts += 1
          this.recordEvent({ sequence, id, method, status: 'timeout' })
          this.publishDiagnostics()
        }
        reject(new Error('Mobile storage bridge timed out; manual verification required'))
      }, 5000)
      const sequence = import.meta.env.DEV ? ++this.diagnostics.requestsSent : 0
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer, method, sentAt, sequence })
      if (import.meta.env.DEV) {
        this.diagnostics.lastRequest = { id, method, sentAt }
        this.publishDiagnostics()
      }
      window.postMessage(JSON.stringify(message), window.location.origin)
    })
  }

  getPage(id: string): Promise<PageSummary | undefined> { return this.call('getPage', id) }
  listPages(): Promise<PageSummary[]> { return this.call('listPages') }
  upsertPage(page: PageSummary): Promise<void> { return this.call('upsertPage', page) }
  deletePage(id: string): Promise<void> { return this.call('deletePage', id) }
  getBlock(id: string): Promise<BlockRecord | undefined> { return this.call('getBlock', id) }
  listBlocksByPage(pageId: string): Promise<BlockRecord[]> { return this.call('listBlocksByPage', pageId) }
  upsertBlock(block: BlockRecord): Promise<void> { return this.call('upsertBlock', block) }
  deleteBlock(id: string): Promise<void> { return this.call('deleteBlock', id) }
  getPendingOperations(): Promise<StorageOperation[]> { return this.call('getPendingOperations') }
  markOperationSynced(id: string): Promise<void> { return this.call('markOperationSynced', id) }
  markOperationFailed(id: string): Promise<void> { return this.call('markOperationFailed', id) }
}
