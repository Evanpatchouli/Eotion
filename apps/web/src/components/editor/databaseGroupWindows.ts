import type { DatabaseViewGroupKey, DatabaseViewGroupRecordsResponse } from '@eotion/contracts'
import type { DatabaseViewConfig } from '@eotion/domain/database'
import { shallowRef } from 'vue'

type GroupRecord = DatabaseViewGroupRecordsResponse['records'][number]
export type DatabaseGroupDefinition = { key: DatabaseViewGroupKey; label: string; collapsed: boolean }
export type DatabaseGroupWindow = DatabaseGroupDefinition & {
  records: GroupRecord[]
  nextCursor: string | null
  hasLoaded: boolean
  loading: boolean
  error: string | null
}
export type DatabaseGroupWindowContext = {
  userId: string
  workspaceId: string
  databaseId: string
  viewId: string
  databaseVersion: number
  viewVersion: number
  config: DatabaseViewConfig
  groups: readonly DatabaseGroupDefinition[]
}
export type DatabaseGroupWindowLoader = (key: DatabaseViewGroupKey, window: { limit: number; cursor?: string }, signal: AbortSignal) => Promise<DatabaseViewGroupRecordsResponse>
export type DatabaseGroupStaleReason = 'conflict' | 'snapshot' | 'duplicate-record'

/** A JSON tuple keeps option IDs distinct from the ungrouped identity and from each other. */
export function databaseGroupKeyId(key: DatabaseViewGroupKey): string {
  return JSON.stringify(key.kind === 'option' ? ['option', key.optionId] : ['ungrouped'])
}

export function createDatabaseGroupWindows(loader: DatabaseGroupWindowLoader, onStale: (reason: DatabaseGroupStaleReason) => void, limit = 25) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new TypeError('Invalid group window limit')
  const groups = shallowRef<DatabaseGroupWindow[]>([])
  const stale = shallowRef(false)
  const pending = new Map<string, { controller: AbortController; token: number }>()
  const tokens = new Map<string, number>()
  let context: Omit<DatabaseGroupWindowContext, 'groups'> | null = null
  let configIdentity = ''
  let epoch = 0
  let disposed = false

  function update(id: string, patch: Partial<DatabaseGroupWindow>): void {
    groups.value = groups.value.map(group => databaseGroupKeyId(group.key) === id ? { ...group, ...patch } : group)
  }

  function abort(id: string): void {
    pending.get(id)?.controller.abort()
    pending.delete(id)
    tokens.set(id, (tokens.get(id) ?? 0) + 1)
  }

  function abortAll(): void {
    for (const id of pending.keys()) abort(id)
  }

  function failClosed(reason: DatabaseGroupStaleReason): void {
    if (stale.value || disposed) return
    stale.value = true
    abortAll()
    groups.value = groups.value.map(group => ({ ...group, loading: false }))
    onStale(reason)
  }

  function reset(): void {
    if (disposed) return
    abortAll()
    epoch += 1
    stale.value = false
    context = null
    configIdentity = ''
    tokens.clear()
    groups.value = []
  }

  function configure(next: DatabaseGroupWindowContext): void {
    if (disposed) throw new TypeError('Group windows have been disposed')
    reset()
    const seen = new Set<string>()
    for (const group of next.groups) {
      const id = databaseGroupKeyId(group.key)
      if (seen.has(id)) throw new TypeError('Duplicate database group key')
      seen.add(id)
    }
    const { groups: definitions, ...identity } = next
    context = identity
    configIdentity = JSON.stringify(next.config)
    groups.value = definitions.map(group => ({ key: group.key, label: group.label, collapsed: group.collapsed,
      records: [], nextCursor: null, hasLoaded: false, loading: false, error: null }))
  }

  function setCollapsed(key: DatabaseViewGroupKey, collapsed: boolean): void {
    if (disposed || !context) return
    const id = databaseGroupKeyId(key)
    const group = groups.value.find(item => databaseGroupKeyId(item.key) === id)
    if (!group) throw new TypeError('Database group not configured')
    if (collapsed) abort(id)
    update(id, { collapsed, loading: collapsed ? false : group.loading })
  }

  async function load(key: DatabaseViewGroupKey, append = false): Promise<boolean> {
    if (disposed || stale.value || !context) return false
    const id = databaseGroupKeyId(key)
    const group = groups.value.find(item => databaseGroupKeyId(item.key) === id)
    if (!group) throw new TypeError('Database group not configured')
    if (group.collapsed || pending.has(id) || append && (!group.hasLoaded || group.nextCursor === null)
      || !append && group.hasLoaded && group.error === null) return false
    const capturedEpoch = epoch
    const capturedContext = context
    const capturedConfig = configIdentity
    const controller = new AbortController()
    const token = (tokens.get(id) ?? 0) + 1
    tokens.set(id, token)
    pending.set(id, { controller, token })
    update(id, { loading: true, error: null })
    const current = () => !disposed && !stale.value && epoch === capturedEpoch && tokens.get(id) === token
      && pending.get(id)?.controller === controller && !controller.signal.aborted
    try {
      const response = await loader(group.key, { limit, ...(append ? { cursor: group.nextCursor! } : {}) }, controller.signal)
      if (!current()) return false
      if (response.database.workspaceId !== capturedContext.workspaceId || response.database.id !== capturedContext.databaseId
        || response.view.id !== capturedContext.viewId || response.view.databaseId !== capturedContext.databaseId
        || response.view.workspaceId !== capturedContext.workspaceId || response.database.version !== capturedContext.databaseVersion
        || response.view.version !== capturedContext.viewVersion || JSON.stringify(response.view.config) !== capturedConfig
        || databaseGroupKeyId(response.group) !== id) {
        failClosed('snapshot')
        return false
      }
      const otherIds = new Set(groups.value.flatMap(item => databaseGroupKeyId(item.key) === id && !append ? [] : item.records.map(record => record.id)))
      const receivedIds = new Set<string>()
      for (const record of response.records) {
        if (otherIds.has(record.id) || receivedIds.has(record.id)) {
          failClosed('duplicate-record')
          return false
        }
        receivedIds.add(record.id)
      }
      update(id, { records: append ? [...group.records, ...response.records] : [...response.records],
        nextCursor: response.nextCursor, hasLoaded: true, loading: false, error: null })
      return true
    } catch (error) {
      if (!current()) return false
      if (typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 409) {
        failClosed('conflict')
      } else {
        update(id, { loading: false, error: error instanceof Error ? error.message : 'Group records could not be loaded' })
      }
      return false
    } finally {
      if (pending.get(id)?.controller === controller) pending.delete(id)
    }
  }

  function dispose(): void {
    if (disposed) return
    reset()
    disposed = true
  }

  return { groups, stale, configure, reset, setCollapsed, load, dispose }
}
