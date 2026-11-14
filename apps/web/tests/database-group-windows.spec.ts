import { expect, test } from '@playwright/test'
import type { DatabaseViewGroupKey, DatabaseViewGroupRecordsResponse } from '@eotion/contracts'
import { createDatabaseGroupWindows, databaseGroupKeyId, type DatabaseGroupWindowContext } from '../src/components/editor/databaseGroupWindows'

const option = (optionId: string): DatabaseViewGroupKey => ({ kind: 'option', optionId })
const ungrouped: DatabaseViewGroupKey = { kind: 'ungrouped' }
const config = { filters: [], sorts: [], visibleProperties: null, propertyOrder: null, options: { groupByPropertyId: 'status' } }
const context = (patch: Partial<DatabaseGroupWindowContext> = {}): DatabaseGroupWindowContext => ({
  userId: 'user', workspaceId: 'ws', databaseId: 'db', viewId: 'view', databaseVersion: 3, viewVersion: 2,
  config, groups: [{ key: option('open|/'), label: 'Open', collapsed: false }, { key: ungrouped, label: 'No status', collapsed: false }], ...patch,
})
const record = (id: string) => ({ id, databaseId: 'db', workspaceId: 'ws', pageId: `page-${id}`, properties: { title: id },
  version: 1, createdAt: '2026-11-15T00:00:00.000Z', updatedAt: '2026-11-15T00:00:00.000Z', pageVersion: '2026-11-15T00:00:00.000Z' })
const response = (key: DatabaseViewGroupKey, ids: string[], nextCursor: string | null = null, versions = { database: 3, view: 2 }): DatabaseViewGroupRecordsResponse => ({
  database: { id: 'db', workspaceId: 'ws', name: 'Tasks', version: versions.database, createdAt: '2026-11-15T00:00:00.000Z', updatedAt: '2026-11-15T00:00:00.000Z' },
  view: { id: 'view', databaseId: 'db', workspaceId: 'ws', name: 'Timeline', type: 'timeline', config, version: versions.view,
    createdAt: '2026-11-15T00:00:00.000Z', updatedAt: '2026-11-15T00:00:00.000Z' },
  properties: [], records: ids.map(record), nextCursor, group: key,
})
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('different groups keep independent cursors, order, and empty windows without implicit requests', async () => {
  const calls: Array<{ key: DatabaseViewGroupKey; cursor?: string }> = []
  const windows = createDatabaseGroupWindows(async (key, window) => {
    calls.push({ key, cursor: window.cursor })
    return key.kind === 'ungrouped' ? response(key, []) : response(key, window.cursor ? ['r2'] : ['r1'], window.cursor ? null : 'next/open')
  }, () => { throw new Error('unexpected stale') })
  windows.configure(context())
  expect(calls).toHaveLength(0)
  expect(databaseGroupKeyId(option('x|y'))).not.toBe(databaseGroupKeyId(option('x|y0')))
  expect(databaseGroupKeyId(option('ungrouped'))).not.toBe(databaseGroupKeyId(ungrouped))
  expect(await windows.load(option('open|/'))).toBe(true)
  expect(await windows.load(ungrouped)).toBe(true)
  expect(await windows.load(ungrouped, true)).toBe(false)
  expect(await windows.load(option('open|/'), true)).toBe(true)
  expect(await windows.load(option('open|/'), true)).toBe(false)
  expect(calls.map(call => call.cursor)).toEqual([undefined, undefined, 'next/open'])
  expect(windows.groups.value.map(group => group.records.map(item => item.id))).toEqual([['r1', 'r2'], []])
  expect(windows.groups.value[1]?.hasLoaded).toBe(true)
  expect(windows.groups.value[1]?.nextCursor).toBeNull()
  windows.dispose()
})

test('same-group in-flight clicks coalesce; collapse invalidates a late result and re-open is explicit', async () => {
  const first = deferred<DatabaseViewGroupRecordsResponse>()
  let calls = 0
  const windows = createDatabaseGroupWindows(async key => { calls++; return calls === 1 ? first.promise : response(key, ['new']) }, () => {})
  windows.configure(context())
  const pending = windows.load(option('open|/'))
  expect(await windows.load(option('open|/'))).toBe(false)
  expect(calls).toBe(1)
  windows.setCollapsed(option('open|/'), true)
  expect(await windows.load(option('open|/'))).toBe(false)
  first.resolve(response(option('open|/'), ['old']))
  expect(await pending).toBe(false)
  expect(windows.groups.value[0]?.records).toEqual([])
  windows.setCollapsed(option('open|/'), false)
  expect(calls).toBe(1)
  expect(await windows.load(option('open|/'))).toBe(true)
  expect(windows.groups.value[0]?.records.map(item => item.id)).toEqual(['new'])
  windows.dispose()
})

test('A to B to A identity epochs reject the first A response', async () => {
  const old = deferred<DatabaseViewGroupRecordsResponse>()
  let calls = 0
  const windows = createDatabaseGroupWindows(async key => { calls++; return calls === 1 ? old.promise : response(key, ['fresh']) }, () => {})
  windows.configure(context())
  const pending = windows.load(option('open|/'))
  windows.configure(context({ userId: 'another' }))
  windows.configure(context())
  old.resolve(response(option('open|/'), ['old']))
  expect(await pending).toBe(false)
  expect(await windows.load(option('open|/'))).toBe(true)
  expect(windows.groups.value[0]?.records.map(item => item.id)).toEqual(['fresh'])
  windows.dispose()
})

test('reset invalidates an in-flight response and requires an explicit new configuration', async () => {
  const old = deferred<DatabaseViewGroupRecordsResponse>()
  const windows = createDatabaseGroupWindows(() => old.promise, () => {})
  windows.configure(context())
  const pending = windows.load(option('open|/'))
  windows.reset()
  old.resolve(response(option('open|/'), ['old']))
  expect(await pending).toBe(false)
  expect(windows.groups.value).toEqual([])
  expect(windows.stale.value).toBe(false)
  expect(await windows.load(option('open|/'))).toBe(false)
  windows.dispose()
})

test('version drift and 409 fail closed, cancel peer requests, and never retry automatically', async () => {
  for (const mode of ['version', 'conflict'] as const) {
    const other = deferred<DatabaseViewGroupRecordsResponse>()
    const reasons: string[] = []
    let calls = 0
    let peerSignal: AbortSignal | undefined
    const windows = createDatabaseGroupWindows(async (key, _window, signal) => {
      calls++
      if (key.kind === 'ungrouped') { peerSignal = signal; return other.promise }
      if (mode === 'conflict') throw Object.assign(new Error('stale'), { statusCode: 409 })
      return response(key, ['r1'], null, { database: 4, view: 2 })
    }, reason => reasons.push(reason))
    windows.configure(context())
    const peer = windows.load(ungrouped)
    expect(await windows.load(option('open|/'))).toBe(false)
    expect(windows.stale.value).toBe(true)
    expect(reasons).toEqual([mode === 'conflict' ? 'conflict' : 'snapshot'])
    expect(peerSignal?.aborted).toBe(true)
    other.resolve(response(ungrouped, ['late']))
    expect(await peer).toBe(false)
    expect(await windows.load(option('open|/'))).toBe(false)
    expect(calls).toBe(2)
    windows.dispose()
  }
})

test('duplicate ids across groups or pages fail closed without truncating server order', async () => {
  for (const duplicate of ['cross-group', 'next-page', 'same-page'] as const) {
    const reasons: string[] = []
    const windows = createDatabaseGroupWindows(async (key, window) => {
      if (duplicate === 'same-page') return response(key, ['same', 'same'])
      if (key.kind === 'ungrouped') return response(key, ['same'])
      return response(key, ['same'], window.cursor ? null : 'next')
    }, reason => reasons.push(reason))
    windows.configure(context())
    if (duplicate === 'cross-group') {
      expect(await windows.load(option('open|/'))).toBe(true)
      expect(await windows.load(ungrouped)).toBe(false)
    } else if (duplicate === 'next-page') {
      expect(await windows.load(option('open|/'))).toBe(true)
      expect(await windows.load(option('open|/'), true)).toBe(false)
    } else expect(await windows.load(option('open|/'))).toBe(false)
    expect(windows.stale.value).toBe(true)
    expect(reasons).toEqual(['duplicate-record'])
    windows.dispose()
  }
})

test('ordinary errors retain loaded records for an explicit retry; dispose cancels resources', async () => {
  const pending = deferred<DatabaseViewGroupRecordsResponse>()
  let calls = 0
  const windows = createDatabaseGroupWindows(async key => {
    calls++
    if (calls === 1) return response(key, ['kept'], 'more')
    if (calls === 2) throw new Error('temporary failure')
    return pending.promise
  }, () => {})
  windows.configure(context())
  expect(await windows.load(option('open|/'))).toBe(true)
  expect(await windows.load(option('open|/'), true)).toBe(false)
  expect(windows.groups.value[0]?.records.map(item => item.id)).toEqual(['kept'])
  expect(windows.groups.value[0]?.error).toBe('temporary failure')
  const retry = windows.load(option('open|/'), true)
  expect(calls).toBe(3)
  windows.dispose()
  pending.resolve(response(option('open|/'), ['late']))
  expect(await retry).toBe(false)
  expect(windows.groups.value).toEqual([])
  expect(await windows.load(option('open|/'))).toBe(false)
})
