import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Locator, type Page, type Route } from '@playwright/test'
import type { AuthUserDto, BlockResponse, PageResponse, WorkspaceResponse } from '@eotion/contracts'
import { DEFAULT_DATABASE_VIEW_CONFIG, type DatabaseFilter, type DatabaseViewConfig, type DatabasePropertyConfig } from '@eotion/domain/database'

const now = '2026-09-30T00:00:00.000Z'
const later = '2027-09-30T00:00:00.000Z'
const user: AuthUserDto = { id: 'database-user', email: 'database@example.com', displayName: 'Database user', createdAt: now, updatedAt: now }
const workspace: WorkspaceResponse = { id: 'database-workspace', name: 'Database workspace', ownerId: user.id, createdAt: now, updatedAt: now }
const pageRecord: PageResponse = { id: 'database-page', workspaceId: workspace.id, parentPageId: null, title: 'Database references', orderKey: '0000000000000001', createdAt: now, updatedAt: now }

type TestDatabase = { id: string; workspaceId: string; name: string; version: number; createdAt: string; updatedAt: string }
type TestProperty = { id: string; databaseId: string; workspaceId: string; name: string; type: 'title' | 'text' | 'number' | 'checkbox' | 'select' | 'date' | 'relation' | 'rollup' | 'formula'; version: number; createdAt: string; updatedAt: string; options?: Array<{ id: string; name: string }>; config?: DatabasePropertyConfig }
type TestView = { id: string; databaseId: string; workspaceId: string; name: string; type: 'table'; config: DatabaseViewConfig; version: number; createdAt: string; updatedAt: string }
type TestRecord = { id: string; databaseId: string; workspaceId: string; pageId: string; properties: Record<string, string | number | boolean | null | string[]>; version: number; pageVersion: string; createdAt: string; updatedAt: string }

function database(id: string, name = 'Projects'): TestDatabase { return { id, workspaceId: workspace.id, name, version: 1, createdAt: now, updatedAt: now } }
function property(id: string, databaseId: string, name: string, type: TestProperty['type'], options?: TestProperty['options']): TestProperty {
  return { id, databaseId, workspaceId: workspace.id, name, type, version: 1, createdAt: now, updatedAt: now, ...(options ? { options } : {}) }
}
function view(id: string, databaseId: string, name = 'Table', config: DatabaseViewConfig = { ...DEFAULT_DATABASE_VIEW_CONFIG }): TestView { return { id, databaseId, workspaceId: workspace.id, name, type: 'table', config: structuredClone(config), version: 1, createdAt: now, updatedAt: now } }
function record(id: string, databaseId: string, pageId: string, properties: TestRecord['properties']): TestRecord {
  return { id, databaseId, workspaceId: workspace.id, pageId, properties, version: 1, pageVersion: now, createdAt: now, updatedAt: now }
}
function matchesFilter(item: TestRecord, filter: DatabaseFilter): boolean {
  const value = item.properties[filter.propertyId]
  const empty = value === undefined || value === null || value === ''
  if (filter.operator === 'is_empty') return empty
  if (filter.operator === 'is_not_empty') return !empty
  if (filter.operator === 'checked') return value === true
  if (filter.operator === 'unchecked') return value === false
  if (empty) return false
  if (typeof filter.value === 'number') {
    if (typeof value !== 'number') return false
    if (filter.operator === 'eq') return value === filter.value
    if (filter.operator === 'ne') return value !== filter.value
    if (filter.operator === 'gt') return value > filter.value
    if (filter.operator === 'gte') return value >= filter.value
    if (filter.operator === 'lt') return value < filter.value
    if (filter.operator === 'lte') return value <= filter.value
    return false
  }
  const actual = typeof value === 'string' ? value : ''
  const expected = String(filter.value ?? '')
  if (filter.operator === 'is') return actual === expected
  if (filter.operator === 'is_not') return actual !== expected
  if (filter.operator === 'contains') return actual.includes(expected)
  if (filter.operator === 'does_not_contain') return !actual.includes(expected)
  if (filter.operator === 'before') return actual < expected
  if (filter.operator === 'after') return actual > expected
  return false
}
function compareDatabaseValues(left: string | number | boolean | null | undefined, right: string | number | boolean | null | undefined): number {
  const leftEmpty = left === undefined || left === null || left === ''
  const rightEmpty = right === undefined || right === null || right === ''
  if (leftEmpty || rightEmpty) return leftEmpty === rightEmpty ? 0 : leftEmpty ? 1 : -1
  if (typeof left === 'number' && typeof right === 'number') return left < right ? -1 : left > right ? 1 : 0
  const leftText = String(left)
  const rightText = String(right)
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0
}

function block(id: string, type: BlockResponse['type'], node: Record<string, unknown>, order: number, parentBlockId: string | null = null): BlockResponse {
  return {
    id, type, pageId: pageRecord.id, workspaceId: workspace.id, parentBlockId,
    orderKey: String(order).padStart(16, '0'), props: { node }, createdAt: now, updatedAt: now,
  }
}

async function installLocalBlockReader(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    const local = await useProductSyncStore().store()
    ;(window as Window & { __eotionListLocalBlocks?: (pageId: string) => Promise<unknown> }).__eotionListLocalBlocks = pageId => local.listBlocksByPage(pageId)
  })
}

async function readLocalBlocks(page: Page, pageId: string): Promise<string> {
  return page.evaluate(async (id) => {
    const read = (window as Window & { __eotionListLocalBlocks?: (pageId: string) => Promise<unknown> }).__eotionListLocalBlocks
    if (!read) throw new Error('Local block reader was not installed while online')
    return JSON.stringify(await read(id))
  }, pageId)
}

async function requestSnapshotHydration(page: Page): Promise<boolean> {
  const revision = await page.evaluate(async () => {
    const { PagePersistence } = await import('/src/editor/pagePersistence.ts')
    const original = PagePersistence.prototype.matchesLocalBlocks
    const target = window as Window & { __snapshotComparison?: boolean | null }
    target.__snapshotComparison = null
    PagePersistence.prototype.matchesLocalBlocks = function (blocks) {
      const result = original.call(this, blocks)
      target.__snapshotComparison = result
      PagePersistence.prototype.matchesLocalBlocks = original
      return result
    }
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    const sync = useProductSyncStore()
    const current = sync.snapshotRevision
    sync.requestSync(0)
    return current
  })
  await expect.poll(() => page.evaluate(async () => {
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    return useProductSyncStore().snapshotRevision
  })).toBeGreaterThan(revision)
  await expect.poll(() => page.evaluate(() => (window as Window & { __snapshotComparison?: boolean | null }).__snapshotComparison ?? null)).not.toBeNull()
  const comparison = await page.evaluate(async () => {
    await Promise.resolve()
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    return (window as Window & { __snapshotComparison?: boolean | null }).__snapshotComparison!
  })
  return comparison
}

async function alignServerBlocksWithLocal(page: Page, api: DatabaseApi): Promise<void> {
  const local = JSON.parse(await readLocalBlocks(page, pageRecord.id)) as BlockResponse[]
  expect(local.map(item => item.id).sort()).toEqual(api.blocks.map(item => item.id).sort())
  for (const block of api.blocks) {
    const current = local.find(item => item.id === block.id)!
    block.type = current.type
    block.orderKey = current.orderKey
    block.parentBlockId = current.parentBlockId
    block.props = structuredClone(current.props)
    block.updatedAt = current.updatedAt
  }
}

type DatabaseApi = {
  pages: PageResponse[]
  blocks: BlockResponse[]
  databases: TestDatabase[]
  views: TestView[]
  properties: TestProperty[]
  records: TestRecord[]
  requests: Array<{ method: string; path: string; search?: string; kind?: string; payload?: any }>
  failTableLoads: number
  failTableAppendLoads: number
  tableLoadDelayMs: number
  failDatabaseCreates: number
  abortDatabaseCreatesAfterCommit: number
  failDatabaseReferenceReads: number
  abortRecordCreatesAfterCommit: number
  failCellUpdates: number
  conflictCellUpdates: number
  failViewUpdates: number
  abortViewCreatesAfterCommit: number
  abortViewDeletesAfterCommit: number
  failRecordPageReads: number
  failSnapshots: number
  failSnapshotAfterRecordCreate: boolean
  holdRecordCreateResponse: boolean
  recordCreateResponseStarted: Promise<void>
  recordCreateResponseGate: Promise<void>
  signalRecordCreateResponseStarted: () => void
  releaseRecordCreateResponse: () => void
  holdDatabaseCreateResponse: boolean
  databaseCreateResponseStarted: Promise<void>
  databaseCreateResponseGate: Promise<void>
  signalDatabaseCreateResponseStarted: () => void
  releaseDatabaseCreateResponse: () => void
  offline: boolean
  failRelationCandidates: number
}

async function installApi(page: Page, seed: BlockResponse[], options: Partial<Pick<DatabaseApi, 'databases' | 'views' | 'properties' | 'records' | 'failTableLoads' | 'failTableAppendLoads' | 'tableLoadDelayMs' | 'failDatabaseCreates' | 'abortDatabaseCreatesAfterCommit' | 'failDatabaseReferenceReads' | 'abortRecordCreatesAfterCommit' | 'failCellUpdates' | 'conflictCellUpdates' | 'failViewUpdates' | 'abortViewCreatesAfterCommit' | 'abortViewDeletesAfterCommit' | 'failRecordPageReads' | 'failSnapshots' | 'failSnapshotAfterRecordCreate' | 'holdRecordCreateResponse' | 'holdDatabaseCreateResponse' | 'offline' | 'failRelationCandidates'>> = {}) {
  let signalRecordCreateResponseStarted!: () => void
  let releaseRecordCreateResponse!: () => void
  let signalDatabaseCreateResponseStarted!: () => void
  let releaseDatabaseCreateResponse!: () => void
  const recordCreateResponseStarted = new Promise<void>((resolve) => { signalRecordCreateResponseStarted = resolve })
  const recordCreateResponseGate = new Promise<void>((resolve) => { releaseRecordCreateResponse = resolve })
  const databaseCreateResponseStarted = new Promise<void>((resolve) => { signalDatabaseCreateResponseStarted = resolve })
  const databaseCreateResponseGate = new Promise<void>((resolve) => { releaseDatabaseCreateResponse = resolve })
  const api: DatabaseApi = {
    pages: [{ ...pageRecord }], blocks: [...seed], databases: (options.databases ?? []).map((item) => ({ ...item })), views: (options.views ?? []).map((item) => ({ ...item })),
    properties: (options.properties ?? []).map((item) => ({ ...item, ...(item.options ? { options: [...item.options] } : {}) })), records: (options.records ?? []).map((item) => ({ ...item, properties: { ...item.properties } })), requests: [],
    failTableLoads: options.failTableLoads ?? 0, failTableAppendLoads: options.failTableAppendLoads ?? 0,
    tableLoadDelayMs: options.tableLoadDelayMs ?? 0, failDatabaseCreates: options.failDatabaseCreates ?? 0,
    abortDatabaseCreatesAfterCommit: options.abortDatabaseCreatesAfterCommit ?? 0,
    failDatabaseReferenceReads: options.failDatabaseReferenceReads ?? 0,
    abortRecordCreatesAfterCommit: options.abortRecordCreatesAfterCommit ?? 0,
    failCellUpdates: options.failCellUpdates ?? 0,
    conflictCellUpdates: options.conflictCellUpdates ?? 0,
    failViewUpdates: options.failViewUpdates ?? 0,
    abortViewCreatesAfterCommit: options.abortViewCreatesAfterCommit ?? 0,
    abortViewDeletesAfterCommit: options.abortViewDeletesAfterCommit ?? 0,
    failRecordPageReads: options.failRecordPageReads ?? 0, failSnapshots: options.failSnapshots ?? 0,
    failSnapshotAfterRecordCreate: options.failSnapshotAfterRecordCreate ?? false,
    holdRecordCreateResponse: options.holdRecordCreateResponse ?? false,
    recordCreateResponseStarted, recordCreateResponseGate,
    signalRecordCreateResponseStarted: () => signalRecordCreateResponseStarted(),
    releaseRecordCreateResponse: () => releaseRecordCreateResponse(),
    holdDatabaseCreateResponse: options.holdDatabaseCreateResponse ?? false,
    databaseCreateResponseStarted, databaseCreateResponseGate,
    signalDatabaseCreateResponseStarted: () => signalDatabaseCreateResponseStarted(),
    releaseDatabaseCreateResponse: () => releaseDatabaseCreateResponse(),
    offline: options.offline ?? false, failRelationCandidates: options.failRelationCandidates ?? 0,
  }
  const initialRecordCount = api.records.length
  const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const pathname = url.pathname
    const payload = request.method() === 'GET' ? undefined : request.postDataJSON()
    api.requests.push({ method: request.method(), path: pathname, search: url.search, ...(payload === undefined ? {} : { payload }), ...(pathname === '/api/sync/operations' ? { kind: payload?.kind } : {}) })
    if (api.offline) return route.abort('internetdisconnected')
    if (url.pathname === '/api/auth/me' && request.method() === 'GET') return json(route, 200, user)
    if (url.pathname === '/api/workspaces' && request.method() === 'GET') return json(route, 200, [workspace])
    if (url.pathname === `/api/sync/workspaces/${workspace.id}/snapshot` && request.method() === 'GET') {
      if (api.failSnapshots > 0) { api.failSnapshots -= 1; return json(route, 503, { statusCode: 503, message: 'Snapshot temporarily unavailable' }) }
      if (api.failSnapshotAfterRecordCreate && api.records.length > initialRecordCount) return json(route, 503, { statusCode: 503, message: 'Snapshot temporarily unavailable' })
      const recordPageIds = new Set(api.records.map(record => record.pageId))
      return json(route, 200, { pages: api.pages.map(item => recordPageIds.has(item.id) ? { ...item, role: 'database-record' as const } : item), blocks: api.blocks })
    }
    const pageRead = new RegExp(`^/api/workspaces/${workspace.id}/pages/([^/]+)$`, 'u').exec(pathname)
    if (pageRead && request.method() === 'GET') {
      if (api.failRecordPageReads > 0) { api.failRecordPageReads -= 1; return json(route, 404, { statusCode: 404, message: 'Page not found' }) }
      const found = api.pages.find((item) => item.id === pageRead[1])
      return found ? json(route, 200, found) : json(route, 404, { statusCode: 404, message: 'Page not found' })
    }
    const blockRead = new RegExp(`^/api/workspaces/${workspace.id}/pages/([^/]+)/blocks/([^/]+)$`, 'u').exec(pathname)
    if (blockRead && request.method() === 'GET') {
      if (api.failDatabaseReferenceReads > 0) { api.failDatabaseReferenceReads -= 1; return json(route, 404, { statusCode: 404, message: 'Block not found' }) }
      const found = api.blocks.find((item) => item.pageId === blockRead[1] && item.id === blockRead[2])
      return found ? json(route, 200, found) : json(route, 404, { statusCode: 404, message: 'Block not found' })
    }
    const databaseList = new RegExp(`^/api/workspaces/${workspace.id}/databases$`, 'u')
    if (databaseList.test(pathname) && request.method() === 'GET') return json(route, 200, { items: api.databases, nextCursor: null })
    if (pathname === `/api/workspaces/${workspace.id}/database-navigation` && request.method() === 'GET') {
      return json(route, 200, { items: api.databases.map((item, index) => ({ id: item.id, workspaceId: workspace.id, name: item.name, parentPageId: pageRecord.id, orderKey: String(index + 1).padStart(30, '0'), viewId: api.views.find(view => view.databaseId === item.id)?.id ?? null })), nextCursor: null })
    }
    const relationOptions = new RegExp(`^/api/workspaces/${workspace.id}/databases/([^/]+)/record-options$`, 'u').exec(pathname)
    if (relationOptions && request.method() === 'GET') {
      if (api.failRelationCandidates > 0) { api.failRelationCandidates -= 1; return json(route, 503, { statusCode: 503, message: 'Options unavailable' }) }
      const search = url.searchParams.get('search')?.toLowerCase() ?? ''
      const items = api.records.filter(item => item.databaseId === relationOptions[1]).map(item => ({ recordId: item.id, pageId: item.pageId, title: api.pages.find(page => page.id === item.pageId)?.title ?? String(item.properties[api.properties.find(property => property.databaseId === item.databaseId && property.type === 'title')?.id ?? ''] ?? '') })).filter(item => item.title.toLowerCase().includes(search))
      const offset = Number(url.searchParams.get('cursor') ?? '0')
      const limit = Number(url.searchParams.get('limit') ?? '25')
      return json(route, 200, { items: items.slice(offset, offset + limit), nextCursor: offset + limit < items.length ? String(offset + limit) : null })
    }
    const resolveOptions = new RegExp(`^/api/workspaces/${workspace.id}/databases/([^/]+)/record-options/resolve$`, 'u').exec(pathname)
    if (resolveOptions && request.method() === 'POST') {
      const items = api.records.filter(item => item.databaseId === resolveOptions[1] && payload.recordIds.includes(item.id)).map(item => ({ recordId: item.id, pageId: item.pageId, title: api.pages.find(page => page.id === item.pageId)?.title ?? '' }))
      return json(route, 200, { items })
    }
    const viewsPath = new RegExp(`^/api/workspaces/${workspace.id}/databases/([^/]+)/views$`, 'u').exec(pathname)
    if (viewsPath && request.method() === 'GET') return json(route, 200, api.views.filter((item) => item.databaseId === viewsPath[1]))
    if (viewsPath && request.method() === 'POST') {
      const databaseItem = api.databases.find(item => item.id === viewsPath[1])
      const input = payload as { id: string; name: string; type: 'table'; config?: DatabaseViewConfig; expectedDatabaseVersion: number }
      if (!databaseItem) return json(route, 404, { statusCode: 404, message: 'Database not found' })
      if (input.expectedDatabaseVersion !== databaseItem.version) return json(route, 409, { statusCode: 409, message: 'Database version conflict' })
      const created = view(input.id, databaseItem.id, input.name, input.config)
      databaseItem.version += 1
      api.views.push(created)
      if (api.abortViewCreatesAfterCommit > 0) { api.abortViewCreatesAfterCommit -= 1; return route.abort('failed') }
      return json(route, 201, { database: databaseItem, view: created })
    }
    const viewPath = new RegExp(`^/api/workspaces/${workspace.id}/databases/([^/]+)/views/([^/]+)$`, 'u').exec(pathname)
    if (viewPath && request.method() === 'PATCH') {
      if (api.failViewUpdates > 0) { api.failViewUpdates -= 1; return json(route, 503, { statusCode: 503, message: 'View temporarily unavailable' }) }
      const databaseItem = api.databases.find(item => item.id === viewPath[1])
      const viewItem = api.views.find(item => item.id === viewPath[2] && item.databaseId === viewPath[1])
      const input = payload as { name?: string; config?: DatabaseViewConfig; expectedDatabaseVersion: number; expectedViewVersion: number }
      if (!databaseItem || !viewItem) return json(route, 404, { statusCode: 404, message: 'Database view not found' })
      if (input.expectedDatabaseVersion !== databaseItem.version || input.expectedViewVersion !== viewItem.version) return json(route, 409, { statusCode: 409, message: 'Database view version conflict' })
      if (input.name !== undefined) viewItem.name = input.name
      if (input.config !== undefined) viewItem.config = input.config
      viewItem.version += 1; viewItem.updatedAt = later
      databaseItem.version += 1; databaseItem.updatedAt = later
      return json(route, 200, { database: databaseItem, view: viewItem })
    }
    if (viewPath && request.method() === 'DELETE') {
      const databaseItem = api.databases.find(item => item.id === viewPath[1])
      const viewItem = api.views.find(item => item.id === viewPath[2] && item.databaseId === viewPath[1])
      const input = payload as { expectedDatabaseVersion: number; expectedViewVersion: number }
      if (!databaseItem || !viewItem) return json(route, 404, { statusCode: 404, message: 'Database view not found' })
      if (api.views.filter(item => item.databaseId === databaseItem.id).length < 2) return json(route, 409, { statusCode: 409, message: 'Cannot delete the last database view' })
      if (api.blocks.some(item => item.type === 'database' && item.props.node?.attrs && (item.props.node.attrs as { databaseId?: string; viewId?: string }).databaseId === databaseItem.id && (item.props.node.attrs as { viewId?: string }).viewId === viewItem.id)) return json(route, 409, { statusCode: 409, message: 'Database view is still referenced by blocks' })
      if (input.expectedDatabaseVersion !== databaseItem.version || input.expectedViewVersion !== viewItem.version) return json(route, 409, { statusCode: 409, message: 'Database view version conflict' })
      api.views = api.views.filter(item => item.id !== viewItem.id)
      databaseItem.version += 1; databaseItem.updatedAt = later
      if (api.abortViewDeletesAfterCommit > 0) { api.abortViewDeletesAfterCommit -= 1; return route.abort('failed') }
      return json(route, 200, { database: databaseItem })
    }
    const tablePath = new RegExp(`^/api/workspaces/${workspace.id}/databases/([^/]+)/views/([^/]+)/table$`, 'u').exec(pathname)
    if (tablePath && request.method() === 'GET') {
      if (api.tableLoadDelayMs > 0) await page.waitForTimeout(api.tableLoadDelayMs)
      if (api.failTableLoads > 0) { api.failTableLoads -= 1; return json(route, 503, { statusCode: 503, message: 'Database temporarily unavailable' }) }
      if (url.searchParams.has('cursor') && api.failTableAppendLoads > 0) {
        api.failTableAppendLoads -= 1
        return json(route, 503, { statusCode: 503, message: 'Database temporarily unavailable' })
      }
      const database = api.databases.find((item) => item.id === tablePath[1])
      const view = api.views.find((item) => item.id === tablePath[2] && item.databaseId === tablePath[1])
      if (!database || !view) return json(route, 404, { statusCode: 404, message: 'Database view not found' })
      const properties = api.properties.filter((item) => item.databaseId === database.id)
      const limit = Number.parseInt(url.searchParams.get('limit') ?? '50', 10)
      const cursor = url.searchParams.get('cursor')
      const filters = view.config?.filters ?? []
      const sorts = view.config?.sorts ?? []
      const matchingRecords = api.records.filter((item) => item.databaseId === database.id && filters.every(filter => matchesFilter(item, filter)))
      matchingRecords.sort((left, right) => {
        for (const sort of sorts) {
          const leftValue = left.properties[sort.propertyId]
          const rightValue = right.properties[sort.propertyId]
          const compared = compareDatabaseValues(leftValue, rightValue)
          if (compared) {
            const leftEmpty = leftValue === undefined || leftValue === null || leftValue === ''
            const rightEmpty = rightValue === undefined || rightValue === null || rightValue === ''
            return leftEmpty || rightEmpty || sort.direction === 'asc' ? compared : -compared
          }
        }
        return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
      })
      const remainingRecords = cursor ? matchingRecords.filter((item) => item.id > cursor) : matchingRecords
      const titleProperty = properties.find(item => item.type === 'title')
      const records = remainingRecords.slice(0, limit).map(item => ({
        ...item,
        properties: titleProperty ? { ...item.properties, [titleProperty.id]: api.pages.find(page => page.id === item.pageId)?.title ?? item.properties[titleProperty.id] } : item.properties,
      }))
      const nextCursor = remainingRecords.length > limit ? records[records.length - 1]?.id ?? null : null
      return json(route, 200, { database, view, properties, records, nextCursor })
    }
    const createInPage = new RegExp(`^/api/workspaces/${workspace.id}/pages/([^/]+)/databases$`, 'u').exec(pathname)
    if (createInPage && request.method() === 'POST') {
      if (api.failDatabaseCreates > 0) { api.failDatabaseCreates -= 1; return json(route, 400, { statusCode: 400, message: 'Database transaction rejected' }) }
      const input = payload as { id: string; name: string; titlePropertyId: string; viewId: string; blockId: string; orderKey: string; parentBlockId: string | null }
      const createdDatabase = database(input.id, input.name)
      const titleProperty = property(input.titlePropertyId, input.id, 'Name', 'title')
      const createdView = view(input.viewId, input.id)
      const createdBlock = block(input.blockId, 'database', { type: 'eotionDatabase', attrs: { databaseId: input.id, viewId: input.viewId } }, Number.parseInt(input.orderKey, 10) || 200, input.parentBlockId)
      createdBlock.orderKey = input.orderKey
      api.databases.push(createdDatabase); api.properties.push(titleProperty); api.views.push(createdView); api.blocks.push(createdBlock)
      if (api.holdDatabaseCreateResponse) {
        api.signalDatabaseCreateResponseStarted()
        await api.databaseCreateResponseGate
      }
      if (api.abortDatabaseCreatesAfterCommit > 0) { api.abortDatabaseCreatesAfterCommit -= 1; return route.abort('failed') }
      return json(route, 201, { database: createdDatabase, titleProperty, view: createdView, block: createdBlock })
    }
    const linkInPage = new RegExp(`^/api/workspaces/${workspace.id}/pages/([^/]+)/database-links$`, 'u').exec(pathname)
    if (linkInPage && request.method() === 'POST') {
      const input = payload as { databaseId: string; viewId: string; blockId: string; orderKey: string; parentBlockId: string | null }
      const linkedBlock = block(input.blockId, 'database', { type: 'eotionDatabase', attrs: { databaseId: input.databaseId, viewId: input.viewId } }, Number.parseInt(input.orderKey, 10) || 200, input.parentBlockId)
      linkedBlock.orderKey = input.orderKey
      api.blocks.push(linkedBlock)
      return json(route, 201, { block: linkedBlock })
    }
    const createProperty = new RegExp(`^/api/workspaces/${workspace.id}/databases/([^/]+)/properties$`, 'u').exec(pathname)
    if (createProperty && request.method() === 'POST') {
      const databaseItem = api.databases.find((item) => item.id === createProperty[1])
      if (!databaseItem) return json(route, 404, { statusCode: 404, message: 'Database not found' })
      const input = payload as Omit<TestProperty, 'databaseId' | 'workspaceId' | 'version' | 'createdAt' | 'updatedAt'> & { expectedDatabaseVersion: number }
      if (input.expectedDatabaseVersion !== databaseItem.version) return json(route, 409, { statusCode: 409, message: 'Database version conflict' })
      databaseItem.version += 1
      const created = { ...property(input.id, databaseItem.id, input.name, input.type, input.options), ...(input.config ? { config: input.config } : {}) }
      api.properties.push(created)
      return json(route, 201, { database: databaseItem, property: created })
    }
    const propertyPath = new RegExp(`^/api/workspaces/${workspace.id}/databases/([^/]+)/properties/([^/]+)$`, 'u').exec(pathname)
    if (propertyPath && request.method() === 'PATCH') {
      const databaseItem = api.databases.find((item) => item.id === propertyPath[1])!
      const propertyItem = api.properties.find((item) => item.id === propertyPath[2])!
      const input = payload as { name?: string; options?: TestProperty['options']; config?: DatabasePropertyConfig; expectedDatabaseVersion: number; expectedPropertyVersion: number }
      if (input.expectedDatabaseVersion !== databaseItem.version || input.expectedPropertyVersion !== propertyItem.version) return json(route, 409, { statusCode: 409, message: 'Property version conflict' })
      if (input.name !== undefined) propertyItem.name = input.name
      if (input.options !== undefined) propertyItem.options = input.options
      if (input.config !== undefined) propertyItem.config = input.config
      propertyItem.version += 1; databaseItem.version += 1
      return json(route, 200, { database: databaseItem, property: propertyItem })
    }
    if (propertyPath && request.method() === 'DELETE') {
      const databaseItem = api.databases.find((item) => item.id === propertyPath[1])!
      const propertyItem = api.properties.find((item) => item.id === propertyPath[2])!
      const input = payload as { expectedDatabaseVersion: number; expectedPropertyVersion: number }
      if (input.expectedDatabaseVersion !== databaseItem.version || input.expectedPropertyVersion !== propertyItem.version) return json(route, 409, { statusCode: 409, message: 'Property version conflict' })
      api.properties = api.properties.filter((item) => item.id !== propertyItem.id)
      for (const item of api.records) { delete item.properties[propertyItem.id]; item.version += 1 }
      databaseItem.version += 1
      return json(route, 200, { database: databaseItem })
    }
    const cellPath = new RegExp(`^/api/workspaces/${workspace.id}/databases/([^/]+)/records/([^/]+)/cells/([^/]+)$`, 'u').exec(pathname)
    if (cellPath && request.method() === 'PATCH') {
      if (api.failCellUpdates > 0) { api.failCellUpdates -= 1; return json(route, 400, { statusCode: 400, message: 'Cell update rejected' }) }
      const databaseItem = api.databases.find((item) => item.id === cellPath[1])!
      const recordItem = api.records.find((item) => item.id === cellPath[2])!
      const prop = api.properties.find((item) => item.id === cellPath[3])!
      const input = payload as { value: string | number | boolean | string[] | null; expectedDatabaseVersion: number; expectedRecordVersion: number; expectedPageUpdatedAt?: string }
      if (api.conflictCellUpdates > 0) {
        api.conflictCellUpdates -= 1
        recordItem.properties[prop.id] = 'Concurrent edit'
        recordItem.version += 1; databaseItem.version += 1
        return json(route, 409, { statusCode: 409, message: 'Record version conflict' })
      }
      const pageItem = api.pages.find((item) => item.id === recordItem.pageId)!
      if (input.expectedDatabaseVersion !== databaseItem.version || input.expectedRecordVersion !== recordItem.version || (input.expectedPageUpdatedAt && input.expectedPageUpdatedAt !== pageItem.updatedAt)) return json(route, 409, { statusCode: 409, message: 'Record version conflict' })
      recordItem.properties[prop.id] = input.value
      recordItem.version += 1; recordItem.updatedAt = later; databaseItem.version += 1; databaseItem.updatedAt = later
      for (const sourceRollup of api.properties.filter(item => item.type === 'rollup')) {
        const rollupConfig = sourceRollup.config as { relationPropertyId: string; targetPropertyId: string; aggregation: string }
        const relation = api.properties.find(item => item.id === rollupConfig.relationPropertyId)
        if (relation?.type !== 'relation' || (relation.config as { targetDatabaseId: string }).targetDatabaseId !== databaseItem.id || rollupConfig.targetPropertyId !== prop.id || rollupConfig.aggregation !== 'sum') continue
        for (const sourceRecord of api.records.filter(item => item.databaseId === sourceRollup.databaseId)) {
          const ids = sourceRecord.properties[relation.id]
          if (!Array.isArray(ids) || !ids.includes(recordItem.id)) continue
          sourceRecord.properties[sourceRollup.id] = ids.reduce<number>((total, id) => total + Number(api.records.find(item => item.id === id)?.properties[prop.id] ?? 0), 0)
          for (const formula of api.properties.filter(item => item.databaseId === sourceRollup.databaseId && item.type === 'formula')) sourceRecord.properties[formula.id] = Number(sourceRecord.properties[sourceRollup.id]) + 1
        }
      }
      let updatedPage: PageResponse | undefined
      if (prop.type === 'title' && input.value !== null) {
        updatedPage = { ...pageItem, title: String(input.value), updatedAt: later }
        api.pages.splice(api.pages.indexOf(pageItem), 1, updatedPage)
        recordItem.pageVersion = later
      }
      return json(route, 200, { database: databaseItem, record: recordItem, ...(updatedPage ? { page: updatedPage } : {}) })
    }
    const createRecord = new RegExp(`^/api/workspaces/${workspace.id}/databases/([^/]+)/records$`, 'u').exec(pathname)
    if (createRecord && request.method() === 'POST') {
      const input = payload as { id: string; pageId: string; title: string; orderKey: string }
      const databaseId = createRecord[1]!
      const titleProperty = api.properties.find((item) => item.databaseId === databaseId && item.type === 'title')!
      const titlePage: PageResponse = { ...pageRecord, id: input.pageId, title: input.title, orderKey: input.orderKey, role: 'database-record' }
      const createdRecord = record(input.id, databaseId, input.pageId, { [titleProperty.id]: input.title })
      const databaseItem = api.databases.find((item) => item.id === databaseId)!
      databaseItem.version += 1
      api.pages.push(titlePage); api.records.push(createdRecord)
      if (api.holdRecordCreateResponse) {
        api.signalRecordCreateResponseStarted()
        await api.recordCreateResponseGate
      }
      if (api.abortRecordCreatesAfterCommit > 0) { api.abortRecordCreatesAfterCommit -= 1; return route.abort('failed') }
      return json(route, 201, { record: createdRecord, page: titlePage })
    }
    if (url.pathname === '/api/sync/operations' && request.method() === 'POST') {
      const operation = request.postDataJSON() as { kind: string; workspaceId: string; payload: any }
      const payload = operation.payload
      const index = api.blocks.findIndex((item) => item.id === payload.id)
      if (operation.kind === 'page.upsert') {
        const pageIndex = api.pages.findIndex((item) => item.id === payload.id)
        const value: PageResponse = { ...payload, workspaceId: operation.workspaceId, createdAt: api.pages[pageIndex]?.createdAt ?? now, updatedAt: later }
        if (pageIndex < 0) api.pages.push(value)
        else api.pages[pageIndex] = value
      } else if (operation.kind === 'block.upsert') {
        const existing = index >= 0 ? api.blocks[index] : undefined
        const value: BlockResponse = { ...payload, workspaceId: operation.workspaceId, parentBlockId: payload.parentBlockId ?? null, createdAt: existing?.createdAt ?? now, updatedAt: later }
        if (index < 0) api.blocks.push(value)
        else api.blocks[index] = value
      } else if (operation.kind === 'block.move') {
        if (index < 0) return json(route, 404, { statusCode: 404, message: 'Block not found' })
        api.blocks[index] = { ...api.blocks[index]!, parentBlockId: payload.parentBlockId ?? null, orderKey: payload.orderKey, updatedAt: later }
      } else if (operation.kind === 'block.delete' && index >= 0) api.blocks.splice(index, 1)
      return json(route, 200, { id: 'database-operation', status: 'applied' })
    }
    return json(route, 404, { statusCode: 404, message: 'Not found' })
  })
  return api
}

async function screenshot(page: Page, name: string) {
  const directory = process.env.EOTION_VISUAL_QA_DIR
  if (!directory) return
  await mkdir(directory, { recursive: true })
  await page.screenshot({ path: path.join(directory, `${name}.png`), animations: 'disabled', fullPage: true })
}

async function expectButtonIconCentered(button: Locator, includeLabel = false) {
  const geometry = await button.evaluate(element => {
    const bounds = element.getBoundingClientRect()
    const icon = element.querySelector('svg')!.getBoundingClientRect()
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    let textNode: Node | null = null
    while ((textNode = walker.nextNode())) if (textNode.textContent?.trim()) break
    const label = textNode ? (() => { const range = document.createRange(); range.selectNodeContents(textNode!); return range.getBoundingClientRect() })() : null
    return { buttonX: bounds.x + bounds.width / 2, buttonY: bounds.y + bounds.height / 2, iconX: icon.x + icon.width / 2, iconY: icon.y + icon.height / 2, labelY: label ? label.y + label.height / 2 : null }
  })
  if (!includeLabel) expect(Math.abs(geometry.buttonX - geometry.iconX)).toBeLessThanOrEqual(1)
  if (!includeLabel) expect(Math.abs(geometry.buttonY - geometry.iconY)).toBeLessThanOrEqual(1)
  if (includeLabel) expect(Math.abs(geometry.labelY! - geometry.iconY)).toBeLessThanOrEqual(2)
}

function overlayFooter(content: Locator) {
  return content.locator('xpath=ancestor::dialog[1]').locator('.eotion-product-overlay__footer')
}

async function openDatabaseSetting(page: Page, table: Locator, name: '筛选' | '排序' | '属性' | '记录打开方式') {
  const menu = page.getByRole('menu', { name: '数据库设置' })
  await expect(async () => {
    if (!await menu.isVisible()) await table.getByRole('button', { name: '数据库设置' }).click({ timeout: 1_000 })
    await expect(menu).toBeVisible({ timeout: 1_000 })
    await menu.getByRole('menuitem', { name }).click({ timeout: 1_000 })
    await expect(menu).toHaveCount(0, { timeout: 1_000 })
  }).toPass({ timeout: 8_000 })
}

async function closeDatabaseSetting(page: Page, label: '属性管理' | '记录打开方式') {
  const panel = page.getByRole('group', { name: label })
  await expect(async () => {
    if (await panel.count() === 0) return
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0, { timeout: 1_000 })
  }).toPass({ timeout: 8_000 })
}

async function openPropertyCreator(page: Page, table: Locator) {
  await openDatabaseSetting(page, table, '属性')
  const panel = page.getByRole('group', { name: '属性管理' })
  await panel.getByRole('button', { name: '新增属性' }).click()
  return page.getByRole('group', { name: '添加属性类型' })
}

async function openAdvancedPropertyCreator(page: Page, table: Locator, type: '关联' | '汇总' | '公式') {
  const creator = page.getByRole('group', { name: '添加属性类型' })
  const config = page.getByRole('group', { name: `配置${type}属性` })
  await expect(async () => {
    if (!await creator.isVisible()) await openPropertyCreator(page, table)
    await creator.getByRole('button', { name: type }).click({ timeout: 1_000 })
    await expect(config).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 8_000 })
  const overlay = page.locator('.eotion-product-overlay').filter({ has: config })
  await expect(overlay.getByRole('heading', { level: 2 })).toHaveCount(1)
  await expect(overlay.getByRole('button', { name: '关闭' })).toHaveCount(1)
  return config
}

async function submitNewRecord(table: ReturnType<Page['locator']>) {
  await table.getByRole('button', { name: '新建记录', exact: true }).click()
  await expect(table.getByRole('textbox', { name: '记录标题' })).toHaveCount(0)
}

function openingGroup(page: Page, target: '记录' | '属性', layout: '桌面' | '平板' | '手机') {
  return page.getByRole('group', { name: `${target}${layout}打开方式` })
}

function openingTrigger(page: Page, target: '记录' | '属性', layout: '桌面' | '平板' | '手机') {
  return openingGroup(page, target, layout).getByRole('button', { name: `${target}${layout}打开方式` })
}

function openingSettingsPanel(page: Page, target: '记录' | '属性') {
  return page.getByRole('group', { name: target === '记录' ? '记录打开方式' : '属性管理' })
}

async function expandOpeningChoices(page: Page, target: '记录' | '属性') {
  const trigger = page.getByRole('button', { name: '展开其他设备打开方式' })
  if (await trigger.isVisible()) await trigger.click()
  await expect(openingGroup(page, target, '桌面')).toBeVisible()
  await expect(openingGroup(page, target, '平板')).toBeVisible()
  await expect(openingGroup(page, target, '手机')).toBeVisible()
}

async function selectSettingOption(panel: Locator, label: string, value: string, optionName: string) {
  const trigger = panel.getByRole('button', { name: label })
  await trigger.click()
  const overlay = panel.locator('xpath=ancestor::dialog[1]')
  const menu = overlay.getByRole('menu', { name: label })
  await menu.getByRole('menuitem', { name: optionName, exact: true }).click()
  await expect(trigger).toHaveAttribute('data-value', value)
}

async function chooseOpening(page: Page, table: Locator, target: '记录' | '属性', layout: '桌面' | '平板' | '手机', mode: string) {
  const menu = page.getByRole('menu', { name: `${target}${layout}打开方式` })
  await expect(async () => {
    if (!await openingSettingsPanel(page, target).isVisible()) await openDatabaseSetting(page, table, target === '记录' ? '记录打开方式' : '属性')
    await expandOpeningChoices(page, target)
    if (!await menu.isVisible()) await openingTrigger(page, target, layout).click({ timeout: 1_000 })
    await expect(menu).toBeVisible({ timeout: 1_000 })
    await menu.getByRole('menuitem', { name: mode, exact: true }).click({ timeout: 1_000 })
    if (!await openingSettingsPanel(page, target).isVisible()) await openDatabaseSetting(page, table, target === '记录' ? '记录打开方式' : '属性')
    await expect(openingTrigger(page, target, layout)).toContainText(mode, { timeout: 1_000 })
  }).toPass({ timeout: 8_000 })
}

async function expectOpeningOptions(page: Page, table: Locator, target: '记录' | '属性', layout: '桌面' | '平板' | '手机', options: string[]) {
  const menu = page.getByRole('menu', { name: `${target}${layout}打开方式` })
  await expect(async () => {
    if (!await openingGroup(page, target, layout).isVisible()) await openDatabaseSetting(page, table, target === '记录' ? '记录打开方式' : '属性')
    await expandOpeningChoices(page, target)
    if (!await menu.isVisible()) await openingTrigger(page, target, layout).click({ timeout: 1_000 })
    await expect(menu).toBeVisible({ timeout: 1_000 })
    expect((await menu.getByRole('menuitem').allTextContents()).map(text => text.replace('✓', '').trim())).toEqual(options)
    await menu.getByRole('menuitem').filter({ has: page.locator('[aria-hidden="true"]') }).click({ timeout: 1_000 })
    if (!await openingGroup(page, target, layout).isVisible()) await openDatabaseSetting(page, table, target === '记录' ? '记录打开方式' : '属性')
    await expect(openingGroup(page, target, layout)).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 8_000 })
}

async function closeRecordSurface(page: Page) {
  const close = page.getByRole('button', { name: '关闭记录' })
  if (await close.isVisible()) {
    await close.click()
    await expect(close).toHaveCount(0)
  }
}

async function chooseSelectCell(page: Page, trigger: Locator, option: string) {
  const menu = page.locator('.eotion-database-cell-menu')
  await expect(trigger).toBeEnabled()
  await expect(async () => {
    if (!await menu.isVisible()) await trigger.click({ timeout: 1_000 })
    await expect(menu).toBeVisible({ timeout: 1_000 })
    await menu.getByRole('button', { name: option, exact: true }).click({ timeout: 1_000 })
  }).toPass({ timeout: 8_000 })
}

async function startDatabaseSlash(page: Page) {
  const editor = page.locator('.eotion-editor-content .tiptap')
  await editor.click()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  await page.keyboard.press('/')
  await page.keyboard.type('database')
  await expect(page.locator('.p2-slash-menu').getByRole('option')).toHaveCount(1)
  await expect(page.locator('.p2-slash-icon[data-icon-name="database"] svg')).toHaveCount(1)
  await page.locator('.p2-slash-menu').getByRole('option', { name: '数据库', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '数据库' })).toBeVisible()
}

async function startDatabaseSlashFrom(page: Page, target: ReturnType<Page['locator']>) {
  await target.click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.press('/')
  await page.keyboard.type('database')
  await expect(page.locator('.p2-slash-menu').getByRole('option')).toHaveCount(1)
  await page.locator('.p2-slash-menu').getByRole('option', { name: '数据库', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '数据库' })).toBeVisible()
}

const rootDatabase = database('database-root-id', 'Root projects')
const nestedDatabase = database('database-nested-id', 'Nested projects')
const rootProperties = [
  property('root-title', rootDatabase.id, 'Name', 'title'),
  property('root-text', rootDatabase.id, 'Notes', 'text'),
  property('root-number', rootDatabase.id, 'Points', 'number'),
  property('root-checkbox', rootDatabase.id, 'Done', 'checkbox'),
  property('root-select', rootDatabase.id, 'Status', 'select', [{ id: 'status-open', name: 'Open' }, { id: 'status-done', name: 'Done' }]),
  property('root-date', rootDatabase.id, 'Due', 'date'),
]
const basicRecord = record('root-record', rootDatabase.id, 'root-record-page', {
  'root-title': 'Launch plan', 'root-text': 'Draft ready', 'root-number': 42,
  'root-checkbox': true, 'root-select': 'status-open', 'root-date': '2026-10-04',
})

test('database block controls reveal on hover or focus and insert a sibling paragraph below', async ({ page }) => {
  const api = await installApi(page, [
    block('control-before', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] }, 100),
    block('control-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 200),
    block('control-after', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'After' }] }, 300),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: [rootProperties[0]!], records: [] })
  await page.goto('/#/app/database-workspace/page/database-page')

  const editor = page.locator('.eotion-editor-content .tiptap')
  const databaseBlock = editor.locator('.eotion-database')
  const anchor = editor.locator('.eotion-block-drag-anchor').filter({ has: page.locator('[data-eotion-block-insert="control-database"]') })
  const handle = anchor.locator('[data-eotion-drag-handle="control-database"]')
  const insert = anchor.getByRole('button', { name: '在数据库区块下方插入区块' })
  await expect(anchor).toBeAttached()
  expect(await handle.evaluate(element => getComputedStyle(element).opacity)).toBe('0')
  await databaseBlock.hover()
  await expect.poll(() => handle.evaluate(element => getComputedStyle(element).opacity)).toBe('1')
  await page.locator('body').hover({ position: { x: 1, y: 1 } })
  await expect.poll(() => handle.evaluate(element => getComputedStyle(element).opacity)).toBe('0')
  await handle.focus()
  await expect(handle).toBeFocused()
  await expect.poll(() => handle.evaluate(element => getComputedStyle(element).opacity)).toBe('1')
  expect(await handle.locator('svg').count()).toBe(1)

  await insert.click()
  await expect.poll(() => api.blocks.filter(item => item.type === 'paragraph')).toHaveLength(3)
  const insertedSibling = databaseBlock.locator('xpath=following-sibling::*[not(contains(@class,"eotion-block-drag-anchor"))][1]')
  await expect(insertedSibling).toBeVisible()
  expect(await insertedSibling.evaluate(element => element.tagName)).toBe('P')
})

test.describe('touch database block controls', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('hides database block controls on phone without reserving header space', async ({ page }) => {
    const api = await installApi(page, [
      block('touch-control-before', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'Before touch database' }] }, 50),
      block('touch-control-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
      block('touch-control-toggle', 'toggle', { type: 'eotionToggle', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested controls' }] }] }, 200),
      block('touch-control-nested-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: nestedDatabase.id, viewId: 'view-nested-id' } }, 100, 'touch-control-toggle'),
      block('touch-control-after', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'After touch database' }] }, 300),
    ], {
      databases: [rootDatabase, nestedDatabase],
      views: [view('view-root-id', rootDatabase.id), view('view-nested-id', nestedDatabase.id)],
      properties: [rootProperties[0]!, property('nested-title', nestedDatabase.id, 'Name', 'title')],
      records: [],
    })
    await page.goto('/#/app/database-workspace/page/database-page')

    const anchor = page.locator('.eotion-block-drag-anchor--database').filter({ has: page.locator('[data-eotion-drag-handle="touch-control-database"]') })
    const rootHeader = page.locator('#database-block-touch-control-database .eotion-database-header')
    await expect.poll(() => anchor.evaluate(element => getComputedStyle(element).display)).toBe('none')
    expect(await rootHeader.evaluate(element => getComputedStyle(element).paddingLeft)).toBe('10px')

    const nestedAnchor = page.locator('.eotion-block-drag-anchor--database').filter({ has: page.locator('[data-eotion-drag-handle="touch-control-nested-database"]') })
    const nestedHeader = page.locator('.eotion-toggle-body .eotion-database-header')
    await expect.poll(() => nestedAnchor.evaluate(element => getComputedStyle(element).display)).toBe('none')
    expect(await nestedHeader.evaluate(element => getComputedStyle(element).paddingLeft)).toBe('10px')
    for (const id of ['touch-control-before', 'touch-control-database', 'touch-control-toggle', 'touch-control-nested-database', 'touch-control-after']) {
      await expect(page.locator(`[data-eotion-block-insert="${id}"]`)).toBeHidden()
      await expect(page.locator(`[data-eotion-drag-handle="${id}"]`)).toBeHidden()
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })

  test('phone header uses two rows for long names, stays within the viewport, and creates a record', async ({ page }) => {
    const longTitle = 'A very long project database title that must remain on one clipped line on a phone'
    const longViewName = 'A very long table view name that must be truncated without pushing controls offscreen'
    const longDatabase = { ...rootDatabase, name: longTitle }
    const longView = view('phone-long-view-id', longDatabase.id, longViewName)
    const api = await installApi(page, [
      block('phone-long-header-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: longDatabase.id, viewId: longView.id } }, 100),
    ], { databases: [longDatabase], views: [longView], properties: [rootProperties[0]!], records: [] })
    await page.goto('/#/app/database-workspace/page/database-page')
    const table = page.locator('#database-block-phone-long-header-database')
    const header = table.locator('.eotion-database-header')
    const title = header.locator('.eotion-database-copy')
    const viewTrigger = header.getByRole('button', { name: '切换视图' })
    const settings = header.getByRole('button', { name: '数据库设置' })
    const add = header.getByRole('button', { name: '新建记录' })

    const phoneLayout = async () => {
      const [headerBox, titleBox, viewBox, addBox, settingsBox] = await Promise.all([
        header.boundingBox(), title.boundingBox(), viewTrigger.boundingBox(), add.boundingBox(), settings.boundingBox(),
      ])
      expect(headerBox).not.toBeNull()
      expect(titleBox).not.toBeNull()
      expect(viewBox).not.toBeNull()
      expect(addBox).not.toBeNull()
      expect(settingsBox).not.toBeNull()
      await expect(title).toContainText(longTitle)
      await expect(viewTrigger).toContainText(longViewName)
      expect(titleBox!.y + titleBox!.height).toBeLessThanOrEqual(viewBox!.y)
      expect(Math.abs(viewBox!.y - addBox!.y)).toBeLessThanOrEqual(4)
      expect(Math.abs(viewBox!.y - settingsBox!.y)).toBeLessThanOrEqual(4)
      expect(settingsBox!.x + settingsBox!.width).toBeLessThanOrEqual(addBox!.x)
      for (const box of [viewBox!, addBox!, settingsBox!]) {
        expect(box.width).toBeGreaterThanOrEqual(44)
        expect(box.height).toBeGreaterThanOrEqual(44)
        expect(box.x).toBeGreaterThanOrEqual(headerBox!.x)
        expect(box.x + box.width).toBeLessThanOrEqual(headerBox!.x + headerBox!.width)
      }
      expect(await title.locator('strong').evaluate(element => {
        const style = getComputedStyle(element)
        return style.textOverflow === 'ellipsis' && style.whiteSpace === 'nowrap' && element.scrollWidth > element.clientWidth
      })).toBe(true)
      expect(titleBox!.width).toBeLessThan(headerBox!.width)
      expect(await viewTrigger.locator('span').evaluate(element => {
        const style = getComputedStyle(element)
        return style.textOverflow === 'ellipsis' && style.whiteSpace === 'nowrap' && element.scrollWidth > element.clientWidth
      })).toBe(true)
      expect(await table.locator('.eotion-database-mark').evaluate(element => getComputedStyle(element).display)).toBe('none')
      expect(await add.locator('.eotion-database-add-label').evaluate(element => getComputedStyle(element).display)).toBe('none')
      expect(await header.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      expect(await page.locator('.eotion-editor-content').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    }

    await phoneLayout()
    await screenshot(page, 'database-header-phone-long-names-light')
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark' })
    await phoneLayout()
    await screenshot(page, 'database-header-phone-long-names-dark')
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light' })

    await viewTrigger.click()
    await expect(page.getByRole('group', { name: '数据库视图' })).toBeVisible()
    await page.keyboard.press('Escape')
    await settings.click()
    const moreMenu = page.getByRole('menu', { name: '数据库设置' })
    await expect(moreMenu).toBeVisible()
    const [menuBox, triggerBox] = await Promise.all([moreMenu.boundingBox(), settings.boundingBox()])
    expect(menuBox!.x).toBeGreaterThanOrEqual(8)
    expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(382)
    expect(menuBox!.y).toBeGreaterThanOrEqual(triggerBox!.y + triggerBox!.height)
    expect(menuBox!.y - triggerBox!.y - triggerBox!.height).toBeLessThanOrEqual(8)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await screenshot(page, 'database-more-phone-390')
    await page.keyboard.press('Escape')
    await add.click()
    await expect.poll(() => api.records).toHaveLength(1)
    await expect(page.getByRole('textbox', { name: '记录标题' })).toHaveValue('无标题')
  })
})

test('database header keeps desktop and tablet controls on one row', async ({ page }) => {
  const api = await installApi(page, [
    block('wide-header-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: [rootProperties[0]!], records: [] })
  await page.goto('/#/app/database-workspace/page/database-page')
  const header = page.locator('#database-block-wide-header-database .eotion-database-header')
  const assertOneRow = async (width: number, screenshotName: string) => {
    await page.setViewportSize({ width, height: 844 })
    const [title, viewTrigger, settings, add] = await Promise.all([
      header.locator('.eotion-database-copy').boundingBox(),
      header.getByRole('button', { name: '切换视图' }).boundingBox(),
      header.getByRole('button', { name: '数据库设置' }).boundingBox(),
      header.getByRole('button', { name: '新建记录' }).boundingBox(),
    ])
    expect(title).not.toBeNull()
    expect(viewTrigger).not.toBeNull()
    expect(settings).not.toBeNull()
    expect(add).not.toBeNull()
    for (const box of [viewTrigger!, settings!, add!]) expect(Math.abs(box.y - title!.y)).toBeLessThanOrEqual(10)
    expect(await header.evaluate(element => getComputedStyle(element).display)).toBe('flex')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await screenshot(page, screenshotName)
  }
  await assertOneRow(1280, 'database-header-desktop')
  await assertOneRow(768, 'database-header-tablet')
  expect(api.records).toHaveLength(0)
})

test.describe('tablet coarse database block controls', () => {
  test.use({ viewport: { width: 820, height: 844 }, hasTouch: true, isMobile: false })

  test('preserves the existing tablet layout and visible controls', async ({ page }) => {
    const api = await installApi(page, [
      block('tablet-touch-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
    ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: [rootProperties[0]!], records: [] })
    await page.goto('/#/app/database-workspace/page/database-page')
    const anchor = page.locator('.eotion-block-drag-anchor--database').filter({ has: page.locator('[data-eotion-drag-handle="tablet-touch-database"]') })
    const header = page.locator('#database-block-tablet-touch-database .eotion-database-header')
    await expect.poll(() => anchor.evaluate(element => getComputedStyle(element).display)).not.toBe('none')
    await expect(anchor.locator('[data-eotion-drag-handle="tablet-touch-database"]')).toBeVisible()
    const insert = anchor.getByRole('button', { name: '在数据库区块下方插入区块' })
    await expect(insert).toBeVisible()
    expect(await header.evaluate(element => getComputedStyle(element).display)).toBe('flex')
    expect(await header.evaluate(element => getComputedStyle(element).paddingLeft)).toBe('100px')
    await screenshot(page, 'database-header-tablet-touch')
    const paragraphCount = api.blocks.filter(item => item.type === 'paragraph').length
    await insert.click()
    await expect.poll(() => api.blocks.filter(item => item.type === 'paragraph')).toHaveLength(paragraphCount + 1)
  })
})

test('database command separates back from cancel and keeps create and link choices on one row', async ({ page }) => {
  await installApi(page, [
    block('command-paragraph', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'Database command' }] }, 100),
  ])
  await page.goto('/#/app/database-workspace/page/database-page')
  await startDatabaseSlash(page)
  const dialog = page.getByRole('dialog', { name: '数据库' })
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveCount(1)
  await expect(dialog.getByRole('button', { name: /关闭/u })).toHaveCount(1)
  const createChoice = dialog.getByRole('button', { name: '创建新数据库' })
  const linkChoice = dialog.getByRole('button', { name: '链接现有数据库' })
  const [createBox, linkBox] = await Promise.all([createChoice.boundingBox(), linkChoice.boundingBox()])
  expect(createBox).not.toBeNull()
  expect(linkBox).not.toBeNull()
  expect(Math.abs(createBox!.y - linkBox!.y)).toBeLessThan(4)
  expect(createBox!.height).toBeGreaterThanOrEqual(96)
  expect(createBox!.height).toBe(linkBox!.height)
  expect(createBox!.width).toBeCloseTo(linkBox!.width, 0)
  for (const choice of [createChoice, linkChoice]) {
    expect(await choice.evaluate(element => {
      const style = getComputedStyle(element)
      return [style.textAlign, style.alignItems, style.justifyContent]
    })).toEqual(['center', 'center', 'center'])
  }
  await screenshot(page, 'database-create-cards-desktop')

  await createChoice.click()
  await expect(dialog.locator('label[for="database-name"]')).toHaveCount(0)
  await expect(dialog.getByRole('textbox', { name: '数据库名称' })).toHaveAttribute('placeholder', '数据库名字')
  const back = dialog.getByRole('button', { name: '返回', exact: true })
  const footer = dialog.locator('.eotion-product-overlay__footer')
  const cancel = footer.getByRole('button', { name: '取消', exact: true })
  const submit = footer.getByRole('button', { name: '创建数据库', exact: true })
  await expect(footer).toBeVisible()
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveCount(1)
  await screenshot(page, 'database-create-footer-desktop')
  await expect(back.locator('svg')).toHaveCount(1)
  await expect(submit).toHaveClass(/eotion-button--primary/u)
  const [backBox, cancelBox, submitBox] = await Promise.all([back.boundingBox(), cancel.boundingBox(), submit.boundingBox()])
  expect(backBox!.x).toBeLessThan(cancelBox!.x)
  expect(cancelBox!.x).toBeLessThan(submitBox!.x)
  await back.click()
  await expect(dialog.getByRole('button', { name: '链接现有数据库' })).toBeVisible()
  await dialog.getByRole('button', { name: '创建新数据库' }).click()
  await cancel.click()
  await expect(dialog).not.toBeVisible()
})

for (const width of [1440, 390]) {
  test(`database view popover uses shared controls and closes from outside clicks at ${width}px`, async ({ page, browser }) => {
    await page.setViewportSize({ width, height: 844 })
    await installApi(page, [
      block('view-polish-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
    ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: rootProperties, records: [] })
    await page.goto('/#/app/database-workspace/page/database-page')
    const table = page.locator('#database-block-view-polish-database')
    const trigger = table.getByRole('button', { name: '切换视图' })
    const menu = page.getByRole('group', { name: '数据库视图', exact: true })
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value }, theme)
      await table.getByRole('button', { name: '数据库设置' }).click()
      const automation = page.getByRole('menuitem', { name: '自动化', exact: true })
      await expect(automation).toBeDisabled()
      expect(Number(await automation.evaluate(element => getComputedStyle(element).opacity))).toBeLessThanOrEqual(0.5)
      await screenshot(page, `database-automation-${width}-${theme}`)
      await trigger.click()
      await expect(menu).toBeVisible()
      const currentRow = menu.locator('.eotion-database-view-row.is-selected')
      await expect(currentRow).toHaveCount(1)
      const currentName = currentRow.locator('.eotion-database-view-name')
      await expect(currentName).toHaveAttribute('role', 'button')
      await expect(currentName).toHaveAttribute('tabindex', '0')
      await expect(currentName).toHaveAttribute('aria-current', 'true')
      const createButton = menu.locator('.eotion-database-view-create')
      await expect(createButton).toHaveClass(/eotion-database-view-create/u)
      const createColor = await createButton.evaluate(element => {
        const marker = document.createElement('span')
        marker.style.color = 'var(--e-color-text-muted)'
        document.body.append(marker)
        const result = { actual: getComputedStyle(element).color, token: getComputedStyle(marker).color }
        marker.remove()
        return result
      })
      expect(createColor.actual).toBe(createColor.token)
      for (const button of await menu.locator('button').all()) await expect(button).toHaveClass(/eotion-button/u)
      await currentRow.hover()
      await currentRow.getByRole('button', { name: '编辑视图 表格视图' }).click()
      const editor = currentRow.getByRole('textbox', { name: '视图名称 表格视图' })
      await expect(editor).toHaveAttribute('contenteditable', 'true')
      await expect(editor).toHaveAttribute('tabindex', '0')
      await expect(editor).toBeFocused()
      await editor.press('Escape')
      await expect(currentName).toBeVisible()
      const bounds = (await menu.boundingBox())!
      expect(bounds.x).toBeGreaterThanOrEqual(0)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
      await screenshot(page, `database-view-polish-${width}-${theme}`)
      await table.locator('.eotion-database-copy').click()
      await expect(menu).toHaveCount(0)
      await trigger.click()
      await expect(menu).toBeVisible()
      await page.getByRole('heading', { name: 'Database references', exact: true }).click()
      await expect(menu).toHaveCount(0)
      await trigger.click()
      await expect(menu).toBeVisible()
      await trigger.click()
      await expect(menu).toHaveCount(0)
      await trigger.press('ArrowDown')
      await expect(menu).toBeVisible()
      await expect(menu.locator('.eotion-database-view-name[aria-current="true"]')).toHaveText('表格视图')
      await page.keyboard.press('Escape')
      await expect(trigger).toBeFocused()
    }

    const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    try {
      const touchPage = await touchContext.newPage()
      await installApi(touchPage, [
        block('touch-view-selector', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
      ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id), view('touch-second-view', rootDatabase.id, '表格 2')], properties: rootProperties, records: [] })
      await touchPage.goto('/#/app/database-workspace/page/database-page')
      const touchTable = touchPage.locator('#database-block-touch-view-selector')
      await touchTable.getByRole('button', { name: '切换视图' }).click()
      const touchRow = touchPage.locator('.eotion-database-view-row')
      const touchActions = [
        touchRow.getByRole('button', { name: '编辑视图 表格视图' }),
        touchRow.getByRole('button', { name: '删除视图 表格视图' }),
      ]
      expect(await touchPage.evaluate(() => matchMedia('(hover: none)').matches && matchMedia('(pointer: coarse)').matches)).toBe(true)
      for (const button of touchActions) {
        const style = await button.evaluate(element => ({ opacity: getComputedStyle(element).opacity, pointerEvents: getComputedStyle(element).pointerEvents }))
        expect(style).toEqual({ opacity: '1', pointerEvents: 'auto' })
      }
    } finally {
      await touchContext.close()
    }
  })
}

for (const width of [1440, 390]) {
test(`database creation cards and placeholder stay coordinated in light and dark at ${width}px`, async ({ page }) => {
  await installApi(page, [])
  await page.goto('/#/app/database-workspace/page/database-page')
    await page.setViewportSize({ width, height: 844 })
    await startDatabaseSlash(page)
    const dialog = page.getByRole('dialog', { name: '数据库' })
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value }, theme)
      const choices = dialog.locator('.database-command-option')
      const [first, second] = await Promise.all([choices.nth(0).boundingBox(), choices.nth(1).boundingBox()])
      expect(first!.height).toBeGreaterThanOrEqual(96)
      expect(first!.height).toBe(second!.height)
      expect(first!.width).toBeCloseTo(second!.width, 0)
      expect(first!.y).toBe(second!.y)
      expect(second!.x - first!.x - first!.width).toBeCloseTo(8, 0)
      await screenshot(page, `database-create-cards-${width}-${theme}`)
      await choices.nth(0).click()
      const input = dialog.getByRole('textbox', { name: '数据库名称' })
      await expect(input).toHaveValue('无标题数据库')
      await expect(input).toHaveAttribute('placeholder', '数据库名字')
      await expect(dialog.locator('label[for="database-name"]')).toHaveCount(0)
      await input.fill('')
      expect(await input.evaluate(element => getComputedStyle(element, '::placeholder').color)).not.toBe(await input.evaluate(element => getComputedStyle(element).color))
      await screenshot(page, `database-create-placeholder-${width}-${theme}`)
      await input.fill('无标题数据库')
      await dialog.getByRole('button', { name: '返回', exact: true }).click()
    }
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
})
}

test('database settings exposes five entries and record and property opening modes drive real surfaces', async ({ page }) => {
  const api = await installApi(page, [
    block('settings-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: rootProperties, records: [basicRecord] })
  api.pages.push({ ...pageRecord, id: basicRecord.pageId, title: 'Launch plan', orderKey: '0000000000000002', role: 'database-record' })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  await expect(table.getByRole('button', { name: '切换视图' })).toHaveText(/表格视图/u)
  await expect(table.locator('.eotion-database-copy')).not.toContainText('Table')
  await expect(table.locator('.eotion-database-mark[data-icon-name="database"] svg')).toHaveCount(1)

  await table.getByRole('button', { name: '数据库设置' }).click()
  const menu = page.getByRole('menu', { name: '数据库设置' })
  await expect(menu.getByRole('menuitem')).toHaveText(['筛选', '排序', '属性', '记录打开方式', '自动化'])
  await expect(menu.getByRole('menuitem', { name: '自动化', exact: true })).toBeDisabled()
  await expect(menu).toHaveClass(/eotion-popover-panel/u)
  await expect(menu.getByRole('menuitem').first()).toHaveClass(/eotion-context-menu__item/u)
  expect(await menu.getByRole('menuitem').first().evaluate(element => {
    const style = getComputedStyle(element)
    return [style.fontSize, style.lineHeight, style.paddingTop, style.paddingLeft, style.minHeight]
  })).toEqual(await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement)
    return [style.getPropertyValue('--e-type-ui-size').trim(), style.getPropertyValue('--e-type-ui-line').trim(), '4px', '6px', '28px']
  }))
  await menu.getByRole('menuitem', { name: '属性' }).click()
  await expect(menu).toHaveCount(0)
  const propertiesPanel = page.getByRole('group', { name: '属性管理' })
  await expectOpeningOptions(page, table, '属性', '桌面', ['抽屉', '弹窗', '页面'])
  await expectOpeningOptions(page, table, '属性', '平板', ['抽屉', '弹窗', '页面'])
  await expectOpeningOptions(page, table, '属性', '手机', ['右侧抽屉', '下方抽屉', '弹窗', '页面'])
  await chooseOpening(page, table, '属性', '桌面', '弹窗')
  const propertyModal = page.locator('dialog[aria-label="属性"][open]')
  await expect(propertyModal).toBeVisible()
  await expect(propertyModal.getByRole('heading', { level: 2 })).toHaveText('属性')
  await expect(propertyModal.getByRole('button', { name: '关闭' })).toHaveCount(1)
  await closeDatabaseSetting(page, '属性管理')

  await openDatabaseSetting(page, table, '属性')
  await chooseOpening(page, table, '属性', '桌面', '页面')
  const propertyPage = page.locator('#eotion-product-page-layer [data-overlay-mode="page"]')
  await expect(propertyPage).toBeVisible()
  await expect(propertyPage.locator('.eotion-product-overlay__header').getByRole('heading', { level: 1 })).toHaveText('属性')
  await expect(propertyPage.locator('.eotion-product-overlay__header').getByRole('button', { name: '关闭' })).toHaveCount(1)
  const [layerBox, propertyPageBox] = await Promise.all([page.locator('#eotion-product-page-layer').boundingBox(), propertyPage.boundingBox()])
  expect(propertyPageBox).toEqual(layerBox)
  await closeDatabaseSetting(page, '属性管理')
  await expect(propertyPage).toHaveCount(0)

  await openDatabaseSetting(page, table, '记录打开方式')
  await screenshot(page, 'database-opening-settings-desktop-light')
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await screenshot(page, 'database-opening-settings-desktop-dark')
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  await expectOpeningOptions(page, table, '记录', '桌面', ['抽屉', '弹窗', '页面'])
  await expectOpeningOptions(page, table, '记录', '平板', ['抽屉', '弹窗', '页面'])
  await expectOpeningOptions(page, table, '记录', '手机', ['右侧抽屉', '下方抽屉', '弹窗', '页面'])
  await chooseOpening(page, table, '记录', '桌面', '弹窗')
  await closeDatabaseSetting(page, '记录打开方式')
  await table.getByRole('button', { name: '打开记录：Launch plan' }).click()
  const recordModal = page.locator('dialog[aria-label="记录"][open]')
  await expect(recordModal).toBeVisible()
  await expect(recordModal.getByRole('heading', { level: 2 })).toHaveText('记录')
  await expect(recordModal.getByRole('button', { name: '关闭记录' })).toHaveCount(1)
  await expect(recordModal.locator('.eotion-editor-content .tiptap')).toHaveAttribute('contenteditable', 'true')
  await recordModal.getByRole('button', { name: '关闭记录' }).click()

  await openDatabaseSetting(page, table, '记录打开方式')
  await chooseOpening(page, table, '记录', '桌面', '页面')
  await closeDatabaseSetting(page, '记录打开方式')
  await table.getByRole('button', { name: '打开记录：Launch plan' }).click()
  await expect(page).toHaveURL(/\/page\/root-record-page\?edit=record$/u)
  await expect(page.locator('.eotion-editor-content .tiptap')).toHaveAttribute('contenteditable', 'true')
})

test('opening settings show the current device by default and expand or collapse the other layouts', async ({ page }) => {
  await installApi(page, [
    block('settings-container-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: rootProperties, records: [basicRecord] })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')

  for (const device of [
    { width: 1440, mode: 'modal' },
    { width: 900, mode: 'modal' },
    { width: 390, mode: 'bottom-drawer' },
  ] as const) {
    await page.setViewportSize({ width: device.width, height: 844 })
    for (const target of ['记录', '属性'] as const) {
      const setting = target === '记录' ? '记录打开方式' : '属性'
      const panel = target === '记录' ? '记录打开方式' : '属性管理'
      await openDatabaseSetting(page, table, setting)
      if (target === '记录') await expect(page.locator(`dialog.eotion-product-overlay--${device.mode}[open][aria-label="${setting}"]`)).toBeVisible()
      else await expect(openingSettingsPanel(page, target)).toBeVisible()
      const currentLayout = device.width === 390 ? '手机' : device.width === 900 ? '平板' : '桌面'
      await expect(openingTrigger(page, target, currentLayout)).toBeVisible()
      for (const layout of ['桌面', '平板', '手机'] as const) {
        if (layout !== currentLayout) await expect(openingGroup(page, target, layout)).toHaveCount(0)
      }
      await expect(page.getByRole('button', { name: '展开其他设备打开方式' })).toHaveAttribute('aria-expanded', 'false')
      await expandOpeningChoices(page, target)
      await expect(page.getByRole('button', { name: '收起其他设备打开方式' })).toHaveAttribute('aria-expanded', 'true')
      await expect(page.locator('.opening-choices__row .opening-choices__label').allTextContents()).resolves.toEqual(['桌面', '平板', '手机'].map(layout => currentLayout === layout ? `${layout}当前设备` : layout))
      await page.getByRole('button', { name: '收起其他设备打开方式' }).click()
      for (const layout of ['桌面', '平板', '手机'] as const) {
        if (layout !== currentLayout) await expect(openingGroup(page, target, layout)).toHaveCount(0)
      }
      await closeDatabaseSetting(page, panel)
    }
  }
})

test('database UX controls render library icons instead of text glyphs', async ({ page }) => {
  await installApi(page, [
    block('icon-audit-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: rootProperties, records: [] })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('#database-block-icon-audit-database')
  await openDatabaseSetting(page, table, '记录打开方式')
  await expandOpeningChoices(page, '记录')
  for (const trigger of await page.locator('.opening-choices__trigger').all()) {
    await expect(trigger.locator('svg')).toHaveCount(1)
    await expect(trigger).not.toContainText('⌄')
  }
  await openingTrigger(page, '记录', '桌面').click()
  const selected = page.locator('.opening-choices__option[aria-current="true"]')
  await expect(selected.locator('svg')).toHaveCount(1)
  await expect(selected).not.toContainText('✓')
  await page.keyboard.press('Escape')
  await closeDatabaseSetting(page, '记录打开方式')
  await openDatabaseSetting(page, table, '属性')
  await expandOpeningChoices(page, '属性')
  const propertiesPanel = page.getByRole('group', { name: '属性管理' })
  await expect(propertiesPanel.getByRole('button', { name: '隐藏属性 名称' })).toBeDisabled()
  await expect(propertiesPanel.getByRole('button', { name: '隐藏属性 名称' })).toHaveAttribute('title', '标题属性始终显示')
  for (const viewport of [{ width: 1440, height: 900, suffix: 'desktop' }, { width: 390, height: 844, suffix: 'phone' }] as const) {
    await closeDatabaseSetting(page, '属性管理')
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await openDatabaseSetting(page, table, '属性')
    await expandOpeningChoices(page, '属性')
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme)
      const eye = propertiesPanel.getByRole('button', { name: '隐藏属性 Notes' }).filter({ visible: true })
      await expect(eye).toHaveCount(1)
      const geometry = await eye.evaluate(element => {
        const button = element.getBoundingClientRect()
        const icon = element.querySelector('svg')!.getBoundingClientRect()
        const rowElement = element.closest('.eotion-database-property-row')!
        const row = rowElement.getBoundingClientRect()
        const rowChildren = [...rowElement.children].filter(child => child.getClientRects().length > 0).map(child => {
          const bounds = child.getBoundingClientRect()
          return { centerY: bounds.y + bounds.height / 2, tag: child.tagName, className: typeof child.className === 'string' ? child.className : '', text: child.textContent?.trim() ?? '' }
        })
        return { buttonX: button.x + button.width / 2, buttonY: button.y + button.height / 2, iconX: icon.x + icon.width / 2, iconY: icon.y + icon.height / 2, rowY: row.y + row.height / 2, rowChildren }
      })
      expect(Math.abs(geometry.buttonX - geometry.iconX)).toBeLessThanOrEqual(1)
      expect(Math.abs(geometry.buttonY - geometry.iconY)).toBeLessThanOrEqual(1)
      expect(Math.abs(geometry.buttonY - geometry.rowY)).toBeLessThanOrEqual(1)
      for (const child of geometry.rowChildren) {
        expect(Math.abs(child.centerY - geometry.rowY), `${viewport.suffix}/${theme} row child ${child.tag}.${child.className} ${child.text}`).toBeLessThanOrEqual(2)
      }
      const add = propertiesPanel.getByRole('button', { name: '新增属性' })
      const addGeometry = await add.evaluate(element => {
        const icon = element.querySelector('svg')!.getBoundingClientRect()
        const range = document.createRange()
        const text = [...element.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())!
        range.selectNodeContents(text)
        const label = range.getBoundingClientRect()
        return { iconY: icon.y + icon.height / 2, labelY: label.y + label.height / 2 }
      })
      expect(Math.abs(addGeometry.iconY - addGeometry.labelY)).toBeLessThanOrEqual(2)
      await screenshot(page, `database-property-settings-${viewport.suffix}-${theme}`)
    }
  }
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  await closeDatabaseSetting(page, '属性管理')
  await page.setViewportSize({ width: 1440, height: 900 })
  await openDatabaseSetting(page, table, '属性')
  await expandOpeningChoices(page, '属性')
  const visiblePropertyControls = propertiesPanel.locator('.eotion-database-property-row button, .eotion-database-property-grip').filter({ visible: true })
  for (const control of await visiblePropertyControls.all()) {
    await expect(control.locator('svg')).toHaveCount(1)
    await expectButtonIconCentered(control)
    expect((await control.textContent())?.trim()).toBe('')
  }
  await expect(propertiesPanel.getByRole('button', { name: '新增属性' }).locator('svg')).toHaveCount(1)
  await closeDatabaseSetting(page, '属性管理')
  await openDatabaseSetting(page, table, '排序')
  const sorts = page.getByRole('group', { name: '排序条件' })
  await sorts.getByRole('button', { name: '添加排序' }).click()
  for (const viewport of [{ width: 1440, height: 900, suffix: 'desktop' }, { width: 390, height: 844, suffix: 'phone' }] as const) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme)
      const addSort = sorts.getByRole('button', { name: '添加排序' })
      await expectButtonIconCentered(addSort, true)
      for (const control of await sorts.locator('.eotion-database-sort-row .settings-icon-button').all()) await expectButtonIconCentered(control)
      await screenshot(page, `database-sort-settings-${viewport.suffix}-${theme}`)
    }
  }
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  await page.setViewportSize({ width: 1440, height: 900 })
  for (const control of await sorts.locator('.eotion-database-sort-row .settings-icon-button').all()) {
    await expect(control.locator('svg')).toHaveCount(1)
    expect((await control.textContent())?.trim()).toBe('')
  }
  await page.keyboard.press('Escape')
  await expect(sorts).toHaveCount(0)
  await openDatabaseSetting(page, table, '筛选')
  const filters = page.getByRole('group', { name: '筛选条件' })
  await filters.getByRole('button', { name: '添加筛选条件' }).click()
  for (const viewport of [{ width: 1440, height: 900, suffix: 'desktop' }, { width: 390, height: 844, suffix: 'phone' }] as const) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme)
      const addFilter = filters.getByRole('button', { name: '添加筛选条件' })
      await expectButtonIconCentered(addFilter, true)
      await expectButtonIconCentered(filters.getByRole('button', { name: '删除筛选条件 1' }))
      await screenshot(page, `database-filter-settings-${viewport.suffix}-${theme}`)
    }
  }
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(filters.getByRole('button', { name: '删除筛选条件 1' }).locator('svg')).toHaveCount(1)
  await expect(filters.getByRole('button', { name: '添加筛选条件' }).locator('svg')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(filters).toHaveCount(0)
  await table.getByRole('button', { name: '切换视图' }).click()
  await expect(page.getByRole('group', { name: '数据库视图' }).getByRole('button', { name: '新建视图' }).locator('svg')).toHaveCount(1)
})

test('property schema mutations refresh inside the open panel and preserve unsaved view drafts', async ({ page }) => {
  await installApi(page, [
    block('property-refresh-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: rootProperties, records: [basicRecord] })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  await openDatabaseSetting(page, table, '属性')
  const panel = page.getByRole('group', { name: '属性管理' })
  const notesVisibility = panel.getByRole('button', { name: '隐藏属性 Notes' })
  await notesVisibility.click()
  await expect(panel.getByRole('button', { name: '显示属性 Notes' })).toHaveAttribute('aria-pressed', 'false')

  await panel.getByRole('button', { name: '新增属性' }).click()
  await page.getByRole('group', { name: '添加属性类型' }).getByRole('button', { name: '选择', exact: true }).click()
  await expect(panel.getByText('选择', { exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: '显示属性 Notes' })).toHaveAttribute('aria-pressed', 'false')

  await panel.getByRole('button', { name: '新增属性' }).click()
  await page.getByRole('group', { name: '添加属性类型' }).getByRole('button', { name: '文本', exact: true }).click()
  await expect(panel.getByText('文本', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: '编辑属性 选择' }).click()
  let propertyMenu = page.locator('.eotion-database-property-menu')
  await propertyMenu.getByRole('textbox', { name: '属性名称' }).fill('发布状态')
  await propertyMenu.getByRole('button', { name: '重命名' }).click()
  await expect(panel.getByText('发布状态', { exact: true })).toBeVisible()

  await panel.getByRole('button', { name: '编辑属性 发布状态' }).click()
  propertyMenu = page.locator('.eotion-database-property-menu')
  await propertyMenu.getByRole('textbox', { name: '新选项名称' }).fill('待发布')
  await propertyMenu.getByRole('button', { name: '添加', exact: true }).click()
  await panel.getByRole('button', { name: '编辑属性 发布状态' }).click()
  propertyMenu = page.locator('.eotion-database-property-menu')
  await expect(propertyMenu.getByText('待发布', { exact: true })).toBeVisible()

  await panel.getByRole('button', { name: '编辑属性 文本' }).click()
  await page.locator('.eotion-database-property-menu').getByRole('button', { name: '删除属性' }).click()
  await expect(panel.getByRole('button', { name: '编辑属性 文本' })).toHaveCount(0)
  await expect(panel.getByRole('button', { name: '显示属性 Notes' })).toHaveAttribute('aria-pressed', 'false')
  await panel.getByRole('button', { name: '保存显示与顺序' }).click()
  await expect(page.getByRole('group', { name: '属性管理' })).toHaveCount(0)
})

test('phone record settings offer right and bottom drawers and apply both modes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const api = await installApi(page, [
    block('phone-opening-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: rootProperties, records: [basicRecord] })
  api.pages.push({ ...pageRecord, id: basicRecord.pageId, title: 'Launch plan', orderKey: '0000000000000002', role: 'database-record' })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  await openDatabaseSetting(page, table, '属性')
  await expectOpeningOptions(page, table, '属性', '手机', ['右侧抽屉', '下方抽屉', '弹窗', '页面'])
  await expect(openingTrigger(page, '属性', '手机')).toContainText('下方抽屉')
  await closeDatabaseSetting(page, '属性管理')
  await openDatabaseSetting(page, table, '记录打开方式')
  await expandOpeningChoices(page, '记录')
  await screenshot(page, 'database-opening-settings-mobile-390')
  const openingOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(openingOverflow).toBeLessThanOrEqual(0)
  await expectOpeningOptions(page, table, '记录', '手机', ['右侧抽屉', '下方抽屉', '弹窗', '页面'])
  await expect(openingTrigger(page, '记录', '手机')).toContainText('下方抽屉')
  await closeDatabaseSetting(page, '记录打开方式')
  await table.getByRole('button', { name: '打开记录：Launch plan' }).click()
  await expect(page.locator('dialog.eotion-product-overlay--bottom-drawer[open]')).toBeVisible()
  await closeRecordSurface(page)

  await openDatabaseSetting(page, table, '记录打开方式')
  await chooseOpening(page, table, '记录', '手机', '右侧抽屉')
  await closeDatabaseSetting(page, '记录打开方式')
  await table.getByRole('button', { name: '打开记录：Launch plan' }).click()
  await expect(page.locator('dialog.eotion-product-overlay--right-drawer[open]')).toBeVisible()
  await closeRecordSurface(page)
})

test('property settings remain usable in a 320px phone right drawer', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await installApi(page, [
    block('narrow-property-settings-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: rootProperties, records: [basicRecord] })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  await openDatabaseSetting(page, table, '属性')
  await expandOpeningChoices(page, '属性')
  await chooseOpening(page, table, '属性', '手机', '右侧抽屉')
  await closeDatabaseSetting(page, '属性管理')

  await openDatabaseSetting(page, table, '属性')
  const panel = page.getByRole('group', { name: '属性管理' })
  const drawer = page.locator('dialog.eotion-product-overlay--right-drawer[open][aria-label="属性"]')
  await expect(drawer).toBeVisible()
  const collapse = page.getByRole('button', { name: '展开其他设备打开方式' })
  const phoneRow = openingGroup(page, '属性', '手机')
  const [collapseBounds, labelBounds, triggerBounds] = await Promise.all([
    collapse.boundingBox(), phoneRow.locator('.opening-choices__label').boundingBox(), openingTrigger(page, '属性', '手机').boundingBox(),
  ])
  expect(collapseBounds).not.toBeNull()
  expect(labelBounds).not.toBeNull()
  expect(triggerBounds).not.toBeNull()
  const overlaps = (left: NonNullable<typeof collapseBounds>, right: NonNullable<typeof labelBounds>) =>
    left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y
  expect(overlaps(collapseBounds!, labelBounds!)).toBe(false)
  expect(overlaps(collapseBounds!, triggerBounds!)).toBe(false)
  expect(await panel.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0)
  await screenshot(page, 'database-property-settings-phone-320-right-drawer')
  await page.getByRole('button', { name: '展开其他设备打开方式' }).click()
  await expect(page.getByRole('group', { name: '属性桌面打开方式' })).toBeVisible()
  await expect(page.getByRole('group', { name: '属性平板打开方式' })).toBeVisible()
  await expect(page.getByRole('group', { name: '属性手机打开方式' })).toBeVisible()
  await expect(panel.evaluate(element => element.scrollWidth - element.clientWidth)).resolves.toBeLessThanOrEqual(0)
  await drawer.evaluate(element => { element.scrollTop = 0 })
  for (const control of await panel.locator('.eotion-database-property-row button').all()) {
    await control.scrollIntoViewIfNeeded()
    const bounds = await control.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320)
    const hit = await control.evaluate(element => {
      const bounds = element.getBoundingClientRect()
      return document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)?.closest('button') === element
    })
    expect(hit).toBe(true)
  }
})

for (const target of ['记录', '属性'] as const) {
  test(`desktop ${target} third-row opening popover remains interactive in the modal`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.addInitScript(() => {
      for (const target of ['record', 'property']) {
        localStorage.setItem(`eotion:database-opening:database-user:database-workspace:database-root-id:${target}`, JSON.stringify({ desktop: 'modal', tablet: 'drawer', mobile: 'bottom-drawer' }))
      }
    })
    const api = await installApi(page, [
      block(`phone-${target}-popover-database`, 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
    ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: target === '属性' ? [rootProperties[0]!] : rootProperties, records: [basicRecord] })
    api.pages.push({ ...pageRecord, id: basicRecord.pageId, title: 'Launch plan', orderKey: '0000000000000002', role: 'database-record' })
    await page.goto('/#/app/database-workspace/page/database-page')
    const table = page.locator('.eotion-editor-content .eotion-database')
    const settingName = target === '记录' ? '记录打开方式' : '属性'
    const panelName = target === '记录' ? '记录打开方式' : '属性管理'
    await openDatabaseSetting(page, table, settingName)
    await expandOpeningChoices(page, target)

    const group = openingGroup(page, target, '手机')
    const trigger = openingTrigger(page, target, '手机')
    const overlay = page.locator('.eotion-product-overlay').filter({ has: group })
    const shell = overlay.locator('.eotion-product-overlay__shell')
    await trigger.click()
    const menu = page.getByRole('menu', { name: `${target}手机打开方式` })
    await expect(menu).toBeVisible()
    const lastOption = menu.getByRole('menuitem', { name: '页面', exact: true })
    const geometry = await Promise.all([lastOption.boundingBox(), shell.boundingBox(), overlay.boundingBox()])
    expect(geometry[0]).not.toBeNull()
    expect(geometry[1]).not.toBeNull()
    expect(geometry[2]).not.toBeNull()
    expect(await menu.evaluate(element => element.parentElement?.classList.contains('eotion-product-overlay'))).toBe(true)
    if (target === '记录') expect(geometry[0]!.y + geometry[0]!.height).toBeGreaterThan(geometry[2]!.y + geometry[2]!.height)
    const hitPosition = {
      x: geometry[0]!.x + geometry[0]!.width / 2,
      y: geometry[0]!.y + geometry[0]!.height / 2,
    }
    if (target === '记录') {
      await overlay.evaluate(element => { (element as HTMLElement).style.overflow = 'hidden' })
      const clippedTarget = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[role="menuitem"]')?.textContent?.trim(), hitPosition)
      expect(clippedTarget ?? '').not.toContain('页面')
      await overlay.evaluate(element => { (element as HTMLElement).style.removeProperty('overflow') })
      expect(await overlay.evaluate(element => getComputedStyle(element).overflow)).toBe('visible')
    }
    const hitTarget = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[role="menuitem"]')?.textContent?.trim(), hitPosition)
    expect(hitTarget).toContain('页面')
    await expect(menu.getByRole('menuitem').first()).toBeFocused()
    await screenshot(page, `database-${target === '记录' ? 'record' : 'property'}-opening-popover-phone-light`)
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
    await screenshot(page, `database-${target === '记录' ? 'record' : 'property'}-opening-popover-phone-dark`)
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))

    await lastOption.click()
    await expect(menu).toHaveCount(0)
    await expect(trigger).toContainText('页面')

    await trigger.click()
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('menuitem').first()).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(trigger).toBeFocused()

    await trigger.click()
    await expect(menu).toBeVisible()
    await group.locator('.opening-choices__label').click()
    await expect(menu).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await closeDatabaseSetting(page, panelName)
    await expect(page.getByRole('group', { name: panelName })).toHaveCount(0)
  })
}

test('opening choices persist independently across layouts and targets, including legacy saved keys', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('opening-preferences-seeded')) return
    sessionStorage.setItem('opening-preferences-seeded', 'true')
    localStorage.setItem('eotion:database-opening:database-user:database-workspace:database-root-id:record', JSON.stringify({ desktop: 'modal', tablet: 'page', mobile: 'right-drawer' }))
    localStorage.setItem('eotion:database-opening:database-user:database-workspace:database-root-id:property', JSON.stringify({ desktop: 'drawer', tablet: 'modal', mobile: 'bottom-drawer' }))
  })
  await installApi(page, [block('opening-persistence-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100)], {
    databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: rootProperties, records: [basicRecord],
  })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  await openDatabaseSetting(page, table, '记录打开方式')
  await expandOpeningChoices(page, '记录')
  await expect(openingTrigger(page, '记录', '桌面')).toContainText('弹窗')
  await expect(openingTrigger(page, '记录', '平板')).toContainText('页面')
  await expect(openingTrigger(page, '记录', '手机')).toContainText('右侧抽屉')
  await chooseOpening(page, table, '记录', '手机', '下方抽屉')
  await expect(openingTrigger(page, '记录', '桌面')).toContainText('弹窗')
  await expect(openingTrigger(page, '记录', '平板')).toContainText('页面')
  await closeDatabaseSetting(page, '记录打开方式')
  await openDatabaseSetting(page, table, '属性')
  await expandOpeningChoices(page, '属性')
  await expect(openingTrigger(page, '属性', '桌面')).toContainText('抽屉')
  await expect(openingTrigger(page, '属性', '平板')).toContainText('弹窗')
  await expect(openingTrigger(page, '属性', '手机')).toContainText('下方抽屉')
  await chooseOpening(page, table, '属性', '平板', '页面')
  await page.reload()
  await openDatabaseSetting(page, table, '记录打开方式')
  await expandOpeningChoices(page, '记录')
  await expect(openingTrigger(page, '记录', '桌面')).toContainText('弹窗')
  await expect(openingTrigger(page, '记录', '平板')).toContainText('页面')
  await expect(openingTrigger(page, '记录', '手机')).toContainText('下方抽屉')
  await closeDatabaseSetting(page, '记录打开方式')
  await openDatabaseSetting(page, table, '属性')
  await expandOpeningChoices(page, '属性')
  await expect(openingTrigger(page, '属性', '桌面')).toContainText('抽屉')
  await expect(openingTrigger(page, '属性', '平板')).toContainText('页面')
  await expect(openingTrigger(page, '属性', '手机')).toContainText('下方抽屉')
})

test('switching records from an interactive desktop drawer flushes the current record first', async ({ page }) => {
  const second = record('second-record', rootDatabase.id, 'second-record-page', { 'root-title': 'Second plan' })
  const api = await installApi(page, [
    block('record-switch-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: rootProperties, records: [basicRecord, second] })
  api.pages.push(
    { ...pageRecord, id: basicRecord.pageId, title: 'Launch plan', orderKey: '0000000000000002', role: 'database-record' },
    { ...pageRecord, id: second.pageId, title: 'Second plan', orderKey: '0000000000000003', role: 'database-record' },
  )
  api.blocks.push({
    ...block('first-record-body', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'Before switch' }] }, 100),
    pageId: basicRecord.pageId,
  })
  await page.goto('/#/app/database-workspace/page/database-page')
  await installLocalBlockReader(page)
  const table = page.locator('.eotion-editor-content .eotion-database')
  await table.getByRole('button', { name: '打开记录：Launch plan' }).click()
  const drawer = page.locator('[data-overlay-mode="drawer"]')
  const editor = drawer.locator('.eotion-editor-content .tiptap')
  await expect(editor).toBeVisible()
  await editor.fill('Saved before switching')
  await table.getByRole('button', { name: '打开记录：Second plan' }).click()
  await expect(drawer.getByRole('textbox', { name: '记录标题' })).toHaveValue('Second plan')
  await expect.poll(() => readLocalBlocks(page, basicRecord.pageId)).toContain('Saved before switching')
})

test('closing a record programmatically flushes its focused title draft first', async ({ page }) => {
  const api = await installApi(page, [
    block('title-close-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: rootProperties, records: [basicRecord] })
  api.pages.push({ ...pageRecord, id: basicRecord.pageId, title: 'Launch plan', orderKey: '0000000000000002', role: 'database-record' })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  await table.getByRole('button', { name: '打开记录：Launch plan' }).click()
  const title = page.locator('[data-overlay-mode="drawer"]').getByRole('textbox', { name: '记录标题' })
  // Wait for the Record editor's initial autofocus before exercising a focused title draft.
  await expect(page.locator('[data-overlay-mode="drawer"]').getByRole('textbox', { name: '页面正文编辑区域' })).toBeFocused()
  await title.fill('Saved without blur')
  await expect(title).toBeFocused()
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('button[aria-label="关闭记录"]')?.click())
  await expect(page.locator('[data-overlay-mode="drawer"]')).toHaveCount(0)
  await expect.poll(() => api.pages.find((item) => item.id === basicRecord.pageId)?.title).toBe('Saved without blur')
  await table.getByRole('button', { name: '打开记录：Saved without blur' }).click()
  const routeTitle = page.locator('[data-overlay-mode="drawer"]').getByRole('textbox', { name: '记录标题' })
  await expect(page.locator('[data-overlay-mode="drawer"]').getByRole('textbox', { name: '页面正文编辑区域' })).toBeFocused()
  await routeTitle.fill('Saved before route')
  await expect(routeTitle).toBeFocused()
  await page.evaluate(() => {
    window.history.pushState({}, '', '/#/app/database-workspace')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page).toHaveURL(/\/app\/database-workspace$/u)
  await expect.poll(() => api.pages.find((item) => item.id === basicRecord.pageId)?.title).toBe('Saved before route')
})

test('rapid title saves across records queue refreshes for both originating databases', async ({ page }) => {
  const secondDatabase = database('database-title-refresh-two', 'Second projects')
  const secondView = view('view-title-refresh-two', secondDatabase.id)
  const secondProperties = rootProperties.map((item) => ({ ...item, id: `second-${item.id}`, databaseId: secondDatabase.id }))
  const secondRecord = record('second-title-refresh-record', secondDatabase.id, 'second-title-refresh-page', {
    [`second-${rootProperties[0]!.id}`]: 'Second plan',
  })
  const api = await installApi(page, [
    block('title-refresh-database-one', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
    block('title-refresh-database-two', 'database', { type: 'eotionDatabase', attrs: { databaseId: secondDatabase.id, viewId: secondView.id } }, 200),
  ], {
    databases: [rootDatabase, secondDatabase], views: [view('view-root-id', rootDatabase.id), secondView],
    properties: [...rootProperties, ...secondProperties], records: [basicRecord, secondRecord],
  })
  api.pages.push(
    { ...pageRecord, id: basicRecord.pageId, title: 'Launch plan', orderKey: '0000000000000002', role: 'database-record' },
    { ...pageRecord, id: secondRecord.pageId, title: 'Second plan', orderKey: '0000000000000003', role: 'database-record' },
  )
  await page.goto('/#/app/database-workspace/page/database-page')
  const tables = page.locator('.eotion-editor-content .eotion-database')
  await expect(tables).toHaveCount(2)
  await tables.nth(0).getByRole('button', { name: '打开记录：Launch plan' }).click()
  await page.evaluate(() => {
    const target = window as Window & { __databaseUpdates?: string[] }
    target.__databaseUpdates = []
    window.addEventListener('eotion:database-updated', (event) => target.__databaseUpdates?.push((event as CustomEvent<{ databaseId: string }>).detail.databaseId))
  })

  let releaseSnapshot!: () => void
  let signalSnapshotStarted!: () => void
  const snapshotGate = new Promise<void>((resolve) => { releaseSnapshot = resolve })
  const snapshotStarted = new Promise<void>((resolve) => { signalSnapshotStarted = resolve })
  let holdNextSnapshot = false
  await page.route(`**/api/sync/workspaces/${workspace.id}/snapshot`, async (route) => {
    if (holdNextSnapshot) {
      holdNextSnapshot = false
      signalSnapshotStarted()
      await snapshotGate
    }
    await route.fallback()
  })

  try {
    holdNextSnapshot = true
    const titleA = page.locator('[data-overlay-mode="drawer"]').getByRole('textbox', { name: '记录标题' })
    await expect(page.locator('[data-overlay-mode="drawer"]').getByRole('textbox', { name: '页面正文编辑区域' })).toBeFocused()
    await titleA.fill('Renamed in A')
    await tables.nth(1).getByRole('button', { name: '打开记录：Second plan' }).click()
    await snapshotStarted
    const titleB = page.locator('[data-overlay-mode="drawer"]').getByRole('textbox', { name: '记录标题' })
    await expect(titleB).toHaveValue('Second plan')
    await expect(page.locator('[data-overlay-mode="drawer"]').getByRole('textbox', { name: '页面正文编辑区域' })).toBeFocused()
    await titleB.fill('Renamed in B')
    await titleB.press('Enter')
    await expect(titleB).toHaveValue('Renamed in B')
    releaseSnapshot()
    await expect.poll(() => page.evaluate(() => (window as Window & { __databaseUpdates?: string[] }).__databaseUpdates ?? []))
      .toEqual(expect.arrayContaining([rootDatabase.id, secondDatabase.id]))
    await expect(tables.nth(0)).toContainText('Renamed in A')
    await expect(tables.nth(1)).toContainText('Renamed in B')
  } finally {
    releaseSnapshot()
  }
})

test('page tree shows databases under their host page, excludes records, and keeps both routes reachable', async ({ page }) => {
  const api = await installApi(page, [
    block('tree-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: rootProperties, records: [basicRecord] })
  api.pages.push({ ...pageRecord, id: basicRecord.pageId, title: 'Hidden record page', orderKey: '0000000000000002', role: 'database-record' })
  await page.goto('/#/app/database-workspace/page/database-page')
  const tree = page.getByRole('tree', { name: '页面树' })
  await expect(tree.locator('[data-page-id]')).toHaveCount(1)
  await expect(tree).not.toContainText('Hidden record page')
  await tree.getByRole('button', { name: '展开Database references的子项' }).click()
  const databaseNode = tree.locator('[data-database-id="database-root-id"]')
  await expect(databaseNode).toContainText('Root projects')
  await databaseNode.getByRole('button').click()
  await expect(page).toHaveURL(/\/database\/database-root-id\?view=view-root-id$/u)
  await expect(page.getByLabel('数据库页面').locator('.eotion-database')).toContainText('Hidden record page')

  await page.goto('/#/app/database-workspace/page/root-record-page')
  await expect(page.locator('.eotion-editor-content .tiptap')).toHaveAttribute('contenteditable', 'true')
  await expect(page.getByRole('tree', { name: '页面树' })).not.toContainText('Hidden record page')
})

test('standalone database route switches views through routing without blanking the table', async ({ page }) => {
  const secondView = view('standalone-second-view', rootDatabase.id, '第二视图')
  await installApi(page, [], {
    databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id), secondView],
    properties: rootProperties, records: [basicRecord],
  })
  await page.goto('/#/app/database-workspace/database/database-root-id?view=view-root-id')
  const table = page.getByLabel('数据库页面').locator('.eotion-database')
  await expect(table).toContainText('Launch plan')
  await table.getByRole('button', { name: '切换视图' }).click()
  await page.locator('.eotion-database-view-menu').getByRole('button', { name: '第二视图', exact: true }).click()
  await expect(page).toHaveURL(/\/database\/database-root-id\?view=standalone-second-view$/u)
  await expect(table.getByRole('button', { name: '切换视图' })).toContainText('第二视图')
  await expect(table).toContainText('Launch plan')
  await expect(table.getByRole('region', { name: '数据库记录' })).toBeVisible()
})

test('first pointer focus beside a trailing Database block keeps ProseMirror selection current', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await installApi(page, [
    block('trailing-database-text', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'Before the database' }] }, 50),
    block('trailing-database-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: [rootProperties[0]!], records: [] })
  await page.goto('/#/app/database-workspace/page/database-page')

  const paragraph = page.locator('.eotion-editor-content .tiptap p').filter({ hasText: 'Before the database' })
  await paragraph.click({ position: { x: 400, y: 12 } })
  await page.keyboard.press('End')
  await page.keyboard.type(' stays editable')
  await expect(paragraph).toContainText('stays editable')
  expect(pageErrors).toEqual([])
})

test('database views create, rename, switch, delete and persist the selected reference', async ({ page }) => {
  const api = await installApi(page, [
    block('view-lifecycle', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
    block('view-lifecycle-linked', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 200),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: rootProperties, records: [basicRecord], abortViewCreatesAfterCommit: 1, abortViewDeletesAfterCommit: 1 })
  await page.goto('/#/app/database-workspace/page/database-page')
  const tables = page.locator('.eotion-editor-content .eotion-database')
  const table = tables.nth(0)
  await expect(table).toContainText('Launch plan')
  await screenshot(page, 'p84-database-view-desktop')

  await table.getByRole('button', { name: '切换视图' }).click()
  const viewsMenu = page.locator('.eotion-database-view-menu')
  await expect(viewsMenu.getByRole('button', { name: '表格视图', exact: true })).toBeVisible()
  await viewsMenu.getByRole('button', { name: '新建视图' }).click()
  await expect(table.getByRole('button', { name: '切换视图' })).toContainText('表格 2')
  expect(api.views).toHaveLength(2)
  expect(api.requests.some(({ method, path, payload }) => method === 'POST' && path.endsWith(`/databases/${rootDatabase.id}/views`) && payload?.expectedDatabaseVersion === 1)).toBe(true)

  await table.getByRole('button', { name: '切换视图' }).click()
  const renameMenu = page.locator('.eotion-database-view-menu')
  await renameMenu.locator('.eotion-database-view-row').nth(1).hover()
  await renameMenu.getByRole('button', { name: '编辑视图 表格 2' }).click()
  const renameEditor = renameMenu.getByRole('textbox', { name: '视图名称 表格 2' })
  await renameEditor.fill('Quarterly')
  await renameEditor.press('Enter')
  await expect(table.getByRole('button', { name: '切换视图' })).toContainText('Quarterly')
  expect(api.views.find(item => item.name === 'Quarterly')?.version).toBe(2)

  await expect(page.locator('.eotion-database-view-menu')).toBeVisible()
  await page.locator('.eotion-database-view-menu').getByRole('button', { name: /^表格视图/u }).click()
  await expect(table.getByRole('button', { name: '切换视图' })).toContainText('表格视图')
  await expect.poll(() => api.blocks.find(item => item.id === 'view-lifecycle')?.props.node?.attrs).toEqual({ databaseId: rootDatabase.id, viewId: 'view-root-id' })

  expect(api.blocks.filter(item => item.type === 'database' && (item.props.node?.attrs as { viewId?: string } | undefined)?.viewId === 'view-root-id')).toHaveLength(2)
  await table.getByRole('button', { name: '切换视图' }).click()
  await page.locator('.eotion-database-view-menu').getByRole('button', { name: '删除视图 表格视图' }).click()
  await expect.poll(() => api.requests.some(({ method, path }) => method === 'DELETE' && path.endsWith('/views/view-root-id'))).toBe(true)
  await expect.poll(() => api.views).toHaveLength(2)
  await expect(page.getByRole('alert')).toContainText('仍被其它数据库块引用')
  await expect(table.getByRole('button', { name: '切换视图' })).toContainText('Quarterly')

  await tables.nth(1).getByRole('button', { name: '切换视图' }).click()
  await page.locator('.eotion-database-view-menu').getByRole('button', { name: 'Quarterly', exact: true }).click()
  await expect(tables.nth(1).getByRole('button', { name: '切换视图' })).toContainText('Quarterly')
  await tables.nth(1).getByRole('button', { name: '切换视图' }).click()
  await page.locator('.eotion-database-view-menu').getByRole('button', { name: /^表格视图/u }).click()
  await expect(tables.nth(1).getByRole('button', { name: '切换视图' })).toContainText('表格视图')
  await tables.nth(1).getByRole('button', { name: '切换视图' }).click()
  const deleteMenu = page.locator('.eotion-database-view-menu')
  await deleteMenu.locator('.eotion-database-view-row.is-selected').hover()
  await deleteMenu.getByRole('button', { name: '删除视图 表格视图' }).click()
  await expect.poll(() => api.views.map(item => item.name)).toEqual(['Quarterly'])
  expect(api.requests.some(({ method, path }) => method === 'DELETE' && path.endsWith('/views/view-root-id'))).toBe(true)

  await table.getByRole('button', { name: '切换视图' }).click()
  await page.locator('.eotion-database-view-menu').getByRole('button', { name: '新建视图' }).click()
  await expect(table.getByRole('button', { name: '切换视图' })).toContainText('表格 2')
  await table.getByRole('button', { name: '切换视图' }).click()
  await page.locator('.eotion-database-view-menu .eotion-database-view-row.is-selected').hover()
  await page.locator('.eotion-database-view-menu').getByRole('button', { name: '删除视图 表格 2' }).click()
  await expect(table.getByRole('button', { name: '切换视图' })).toContainText('Quarterly')
  await expect.poll(() => api.views.map(item => item.name)).toEqual(['Quarterly'])
  await expect.poll(() => api.blocks.find(item => item.id === 'view-lifecycle')?.props.node?.attrs).toEqual({ databaseId: rootDatabase.id, viewId: api.views[0]?.id })

  await page.reload()
  await expect(page.locator('.eotion-editor-content .eotion-database').nth(0).getByRole('button', { name: '切换视图' })).toContainText('Quarterly')
  await page.locator('.eotion-editor-content .eotion-database').nth(0).getByRole('button', { name: '切换视图' }).click()
  const lastViewMenu = page.locator('.eotion-database-view-menu')
  await expect(lastViewMenu.getByRole('button', { name: '删除视图 Quarterly' })).toBeDisabled()
})

test('database view selector supports accessible inline rename without switching on rename or delete', async ({ page }) => {
  const secondView = view('selector-second-view', rootDatabase.id, '表格 2')
  const api = await installApi(page, [
    block('view-selector', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id), secondView], properties: rootProperties, records: [] })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('#database-block-view-selector')
  const trigger = table.getByRole('button', { name: '切换视图' })
  await trigger.click()
  const menu = page.locator('.eotion-database-view-menu')
  const currentRow = menu.locator('.eotion-database-view-row.is-selected')
  const otherRow = menu.locator('.eotion-database-view-row').nth(1)
  const currentName = currentRow.locator('.eotion-database-view-name')
  await expect(currentRow).toHaveCount(1)
  await expect(currentName).toHaveJSProperty('tagName', 'SPAN')
  await expect(currentName).toHaveAttribute('role', 'button')
  await expect(currentName).toHaveAttribute('tabindex', '0')
  await expect(currentName).toHaveAttribute('aria-current', 'true')
  expect(await currentRow.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(await otherRow.evaluate(element => getComputedStyle(element).backgroundColor))
  await expect(menu.getByRole('textbox', { name: '当前视图名称' })).toHaveCount(0)
  await expect(menu.getByRole('button', { name: '保存名称' })).toHaveCount(0)
  await expect(menu.locator(':scope > button')).toHaveCount(1)
  const editCurrent = currentRow.getByRole('button', { name: '编辑视图 表格视图' })
  const deleteCurrent = currentRow.getByRole('button', { name: '删除视图 表格视图' })
  for (const button of [editCurrent, deleteCurrent]) {
    await expect(button).toHaveClass(/eotion-button/u)
    await expect(button.locator('svg')).toHaveCount(1)
  }
  const create = menu.locator('.eotion-database-view-create')
  await expect(create).toHaveClass(/eotion-button/u)
  const createColor = await create.evaluate(element => {
    const marker = document.createElement('span')
    marker.style.color = 'var(--e-color-text-muted)'
    document.body.append(marker)
    const result = { actual: getComputedStyle(element).color, token: getComputedStyle(marker).color }
    marker.remove()
    return result
  })
  expect(createColor.actual).toBe(createColor.token)

  await otherRow.locator('.eotion-database-view-name').evaluate(element => (element as HTMLElement).focus())
  await page.mouse.move(0, 0)
  const initialVisibility = await editCurrent.evaluate(element => ({ opacity: getComputedStyle(element).opacity, pointerEvents: getComputedStyle(element).pointerEvents }))
  expect(initialVisibility).toEqual({ opacity: '0', pointerEvents: 'none' })
  await currentRow.hover()
  await expect.poll(() => editCurrent.evaluate(element => getComputedStyle(element).opacity)).toBe('1')
  await expect.poll(() => editCurrent.evaluate(element => getComputedStyle(element).pointerEvents)).toBe('auto')

  await currentName.focus()
  await expect.poll(() => editCurrent.evaluate(element => getComputedStyle(element).opacity)).toBe('1')
  await currentName.evaluate(element => element.setAttribute('data-rename-node-marker', 'selector-name'))
  const rowHeightBeforeEditing = (await currentRow.boundingBox())!.height
  await currentRow.hover()
  await editCurrent.click()
  const editor = currentRow.getByRole('textbox', { name: '视图名称 表格视图' })
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  await expect(editor).toHaveAttribute('tabindex', '0')
  await expect(editor).toHaveAttribute('data-rename-node-marker', 'selector-name')
  expect((await currentRow.boundingBox())!.height).toBe(rowHeightBeforeEditing)
  await expect(editor).toBeFocused()
  await expect.poll(() => editor.evaluate(element => {
    const selection = window.getSelection()
    if (!selection?.isCollapsed || !selection.anchorNode) return false
    const textBeforeCaret = document.createRange()
    textBeforeCaret.selectNodeContents(element)
    textBeforeCaret.setEnd(selection.anchorNode, selection.anchorOffset)
    return textBeforeCaret.toString().length === (element.textContent ?? '').length
  })).toBe(true)

  await editor.evaluate(element => element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true })))
  await expect(editor).toBeVisible()
  expect(api.views.find(item => item.id === 'view-root-id')?.name).toBe('Table')
  await editor.press('Escape')
  await expect(currentName).toHaveText('表格视图')
  await expect(currentName).toHaveAttribute('data-rename-node-marker', 'selector-name')
  expect(api.views.find(item => item.id === 'view-root-id')?.version).toBe(1)

  await currentRow.hover()
  await currentRow.getByRole('button', { name: '编辑视图 表格视图' }).click()
  const emptyEditor = currentRow.getByRole('textbox', { name: '视图名称 表格视图' })
  await emptyEditor.fill('   ')
  await emptyEditor.evaluate(element => (element as HTMLElement).blur())
  await expect(currentRow.locator('.eotion-database-view-name')).toHaveText('表格视图')
  expect(api.views.find(item => item.id === 'view-root-id')?.version).toBe(1)

  await currentRow.hover()
  await currentRow.getByRole('button', { name: '编辑视图 表格视图' }).click()
  const tooLongEditor = currentRow.getByRole('textbox', { name: '视图名称 表格视图' })
  await tooLongEditor.fill('x'.repeat(101))
  await tooLongEditor.press('Enter')
  await expect(currentRow.locator('.eotion-database-view-name')).toHaveText('表格视图')
  await expect(page.getByRole('alert')).toBeVisible()
  expect(api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith('/views/view-root-id'))).toHaveLength(0)
  expect(api.views.find(item => item.id === 'view-root-id')?.name).toBe('Table')
  expect(api.views.find(item => item.id === 'view-root-id')?.version).toBe(1)

  await currentRow.hover()
  await currentRow.getByRole('button', { name: '编辑视图 表格视图' }).click()
  const blurEditor = currentRow.getByRole('textbox', { name: '视图名称 表格视图' })
  await blurEditor.fill('Working title')
  await blurEditor.evaluate(element => (element as HTMLElement).blur())
  await expect(currentRow.locator('.eotion-database-view-name')).toHaveText('Working title')
  expect(api.views.find(item => item.id === 'view-root-id')?.name).toBe('Working title')
  await currentRow.hover()
  await currentRow.getByRole('button', { name: '编辑视图 Working title' }).click()
  await currentRow.getByRole('textbox', { name: '视图名称 Working title' }).fill('Table')
  await currentRow.getByRole('textbox', { name: '视图名称 Working title' }).press('Enter')
  await expect(currentRow.locator('.eotion-database-view-name')).toHaveText('表格视图')

  api.failViewUpdates = 1
  await currentRow.hover()
  await currentRow.getByRole('button', { name: '编辑视图 表格视图' }).click()
  const failedSaveEditor = currentRow.getByRole('textbox', { name: '视图名称 表格视图' })
  await failedSaveEditor.fill('Retry me')
  await failedSaveEditor.press('Enter')
  await expect(page.getByRole('alert')).toContainText('View temporarily unavailable')
  await expect(currentRow.locator('.eotion-database-view-name')).toHaveText('表格视图')
  await expect(trigger).toContainText('表格视图')
  await expect(currentRow.locator('.eotion-database-view-name')).toHaveAttribute('aria-current', 'true')
  await currentRow.hover()
  await currentRow.getByRole('button', { name: '编辑视图 表格视图' }).click()
  const retryEditor = currentRow.getByRole('textbox', { name: '视图名称 表格视图' })
  await retryEditor.fill('Retry me')
  await retryEditor.press('Enter')
  await expect(currentRow.locator('.eotion-database-view-name')).toHaveText('Retry me')
  expect(api.views.find(item => item.id === 'view-root-id')?.name).toBe('Retry me')
  await currentRow.hover()
  await currentRow.getByRole('button', { name: '编辑视图 Retry me' }).click()
  const restoreEditor = currentRow.getByRole('textbox', { name: '视图名称 Retry me' })
  await restoreEditor.fill('Table')
  await restoreEditor.press('Enter')
  await expect(currentRow.locator('.eotion-database-view-name')).toHaveText('表格视图')

  await otherRow.hover()
  await otherRow.getByRole('button', { name: '编辑视图 表格 2' }).click()
  const otherEditor = otherRow.getByRole('textbox', { name: '视图名称 表格 2' })
  await otherEditor.fill('Quarterly')
  await otherEditor.press('Enter')
  await expect(otherRow.locator('.eotion-database-view-name')).toHaveText('Quarterly')
  expect(api.views.find(item => item.id === 'selector-second-view')?.name).toBe('Quarterly')
  await expect(trigger).toContainText('表格视图')
  await expect(currentRow.locator('.eotion-database-view-name')).toHaveAttribute('aria-current', 'true')

  await otherRow.hover()
  await otherRow.getByRole('button', { name: '删除视图 Quarterly' }).click()
  await expect(otherRow).toHaveCount(0)
  await expect(trigger).toContainText('表格视图')
  await expect(currentRow.locator('.eotion-database-view-name')).toHaveAttribute('aria-current', 'true')
})

test('linked views keep independent server filters, multi-sort order and column layout', async ({ page, context }) => {
  test.setTimeout(60_000)
  const records = [
    record('view-row-alpha', rootDatabase.id, 'page-alpha', { 'root-title': 'Alpha done', 'root-number': 10, 'root-select': 'status-done', 'root-text': 'visible' }),
    record('view-row-beta', rootDatabase.id, 'page-beta', { 'root-title': 'Beta done', 'root-number': 30, 'root-select': 'status-done', 'root-text': 'hidden' }),
    record('view-row-delta', rootDatabase.id, 'page-delta', { 'root-title': 'Delta done', 'root-number': 30, 'root-select': 'status-done', 'root-text': 'hidden' }),
    record('view-row-open', rootDatabase.id, 'page-open', { 'root-title': 'Open task', 'root-number': 99, 'root-select': 'status-open', 'root-text': 'hidden' }),
    record('view-row-empty', rootDatabase.id, 'page-empty', { 'root-title': 'Empty done', 'root-select': 'status-done', 'root-text': 'hidden' }),
  ]
  const api = await installApi(page, [
    block('linked-view-one', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
    block('linked-view-two', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 200),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: rootProperties, records, failViewUpdates: 1 })
  await page.goto('/#/app/database-workspace/page/database-page')
  const tables = page.locator('.eotion-editor-content .eotion-database')
  await expect(tables).toHaveCount(2)
  await expect(tables.nth(0).locator('tbody tr')).toHaveCount(5)
  await tables.nth(1).getByRole('button', { name: '切换视图' }).click()
  await page.locator('.eotion-database-view-menu').getByRole('button', { name: '新建视图' }).click()
  await expect(tables.nth(1).getByRole('button', { name: '切换视图' })).toContainText('表格 2')
  await expect(tables.nth(0).getByRole('button', { name: '切换视图' })).toContainText('表格视图')
  await expect.poll(() => api.blocks.find(item => item.id === 'linked-view-two')?.props.node?.attrs).not.toEqual({ databaseId: rootDatabase.id, viewId: 'view-root-id' })
  await expect(page.locator('.product-sync-status')).toContainText('已同步')

  await openDatabaseSetting(page, tables.nth(1), '筛选')
  const filterPanel = page.getByRole('group', { name: '筛选条件' })
  await expect(page.locator('dialog.eotion-product-overlay--modal[open]')).toBeVisible()
  expect(await page.locator('dialog.eotion-product-overlay--modal[open]').evaluate(element => element.matches(':modal'))).toBe(true)
  await screenshot(page, 'p84-database-filter-desktop')
  await filterPanel.getByRole('button', { name: '添加筛选条件' }).click()
  await selectSettingOption(filterPanel, '筛选属性 1', 'root-select', 'Status')
  await selectSettingOption(filterPanel, '筛选值 1', 'status-done', 'Done')
  await overlayFooter(filterPanel).getByRole('button', { name: '保存筛选' }).click()
  await expect(page.getByRole('alert')).toContainText('View temporarily unavailable')
  await expect(filterPanel.getByRole('button', { name: '筛选值 1' })).toHaveAttribute('data-value', 'status-done')
  await overlayFooter(filterPanel).getByRole('button', { name: '保存筛选' }).click()
  await expect(tables.nth(1).locator('tbody tr')).toHaveCount(4)
  await expect(tables.nth(1)).not.toContainText('Open task')
  expect(api.views.find(item => item.id !== 'view-root-id')?.config.filters).toEqual([{ propertyId: 'root-select', operator: 'is', value: 'status-done' }])
  await expect(tables.nth(0).locator('tbody tr')).toHaveCount(5)

  await openDatabaseSetting(page, tables.nth(1), '排序')
  const sortPanel = page.getByRole('group', { name: '排序条件' })
  await expect(page.locator('dialog.eotion-product-overlay--modal[open]')).toBeVisible()
  expect(await page.locator('dialog.eotion-product-overlay--modal[open]').evaluate(element => element.matches(':modal'))).toBe(true)
  await screenshot(page, 'p84-database-sort-desktop')
  await sortPanel.getByRole('button', { name: '添加排序' }).click()
  await selectSettingOption(sortPanel, '排序属性 1', 'root-number', 'Points')
  await selectSettingOption(sortPanel, '排序方向 1', 'desc', '降序')
  await sortPanel.getByRole('button', { name: '添加排序' }).click()
  await overlayFooter(sortPanel).getByRole('button', { name: '保存排序' }).click()
  await expect(tables.nth(1).locator('tbody tr').nth(0)).toContainText('Beta done')
  await expect(tables.nth(1).locator('tbody tr').nth(1)).toContainText('Delta done')
  await expect(tables.nth(1).locator('tbody tr').nth(2)).toContainText('Alpha done')
  await expect(tables.nth(1).locator('tbody tr').nth(3)).toContainText('Empty done')
  const configuredView = api.views.find(item => item.id !== 'view-root-id')!
  expect(configuredView.config.sorts).toEqual([{ propertyId: 'root-number', direction: 'desc' }, { propertyId: 'root-title', direction: 'asc' }])

  await openDatabaseSetting(page, tables.nth(1), '排序')
  const reorderPanel = page.getByRole('group', { name: '排序条件' })
  await reorderPanel.getByRole('button', { name: '排序下移 1' }).click()
  await overlayFooter(reorderPanel).getByRole('button', { name: '保存排序' }).click()
  await expect(tables.nth(1).locator('tbody tr').nth(0)).toContainText('Alpha done')
  expect(configuredView.config.sorts[0]?.propertyId).toBe('root-title')

  await expect(page.locator('.product-sync-status')).toContainText('已同步')
  await openDatabaseSetting(page, tables.nth(1), '属性')
  const columnsPanel = page.getByRole('group', { name: '属性管理' })
  await screenshot(page, 'p84-database-columns-desktop')
  const notes = columnsPanel.getByRole('button', { name: '隐藏属性 Notes' })
  await notes.click()
  await expect(columnsPanel.getByRole('button', { name: '显示属性 Notes' })).toHaveAttribute('aria-pressed', 'false')
  for (let index = 0; index < 3; index += 1) {
    const moveDue = columnsPanel.getByRole('button', { name: '列上移 Due' })
    if (!await moveDue.isEnabled()) break
    await moveDue.click()
  }
  await columnsPanel.getByRole('button', { name: '保存显示与顺序' }).dispatchEvent('click')
  await expect(tables.nth(1).locator('thead th')).toHaveCount(5)
  const headers = await tables.nth(1).locator('thead th').allTextContents()
  expect(headers.some(header => header.includes('Notes'))).toBe(false)
  expect(headers.indexOf('Due')).toBeLessThan(headers.indexOf('Points'))
  await expect(tables.nth(0).locator('thead th')).toHaveCount(6)
  await expect(tables.nth(0).getByRole('button', { name: 'Notes', exact: true })).toBeVisible()
  expect(configuredView.config.visibleProperties).not.toContain('root-text')

  await chooseSelectCell(page, tables.nth(0).getByRole('button', { name: 'Open', exact: true }), 'Done')
  await expect(tables.nth(1).locator('tbody tr')).toHaveCount(5)
  const betaStatus = tables.nth(0).locator('tbody tr').filter({ hasText: 'Beta done' }).getByRole('button', { name: 'Done', exact: true })
  await chooseSelectCell(page, betaStatus, 'Open')
  await expect(tables.nth(1).locator('tbody tr')).toHaveCount(4)
  await expect(tables.nth(0).locator('tbody tr')).toHaveCount(5)

  await page.reload()
  const reloadedTables = page.locator('.eotion-editor-content .eotion-database')
  await expect(reloadedTables.nth(1).getByRole('button', { name: '切换视图' })).toContainText('表格 2')
  const reloadedHeaders = await reloadedTables.nth(1).locator('thead th').allTextContents()
  expect(reloadedHeaders.some(header => header.includes('Notes'))).toBe(false)
  await expect(reloadedTables.nth(1).locator('tbody tr')).toHaveCount(4)

  const filterButton = tables.nth(1).getByRole('button', { name: '数据库设置' })
  await openDatabaseSetting(page, tables.nth(1), '筛选')
  await expect(page.getByRole('group', { name: '筛选条件' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('group', { name: '筛选条件' })).toHaveCount(0)
  await expect(filterButton).toBeFocused()
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await openDatabaseSetting(page, tables.nth(1), '筛选')
  await screenshot(page, 'p84-database-filter-dark')
  await page.keyboard.press('Escape')
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  await page.setViewportSize({ width: 390, height: 844 })
  await openDatabaseSetting(page, tables.nth(1), '筛选')
  await expect(page.locator('dialog.eotion-product-overlay--bottom-drawer[open]')).toBeVisible()
  expect(await page.locator('dialog.eotion-product-overlay--bottom-drawer[open]').evaluate(element => element.matches(':modal'))).toBe(true)
  await screenshot(page, 'p84-database-filter-mobile-390')
  const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
  expect(overflow.width).toBeLessThanOrEqual(overflow.client)
  await page.keyboard.press('Escape')
  await openDatabaseSetting(page, tables.nth(1), '排序')
  await expect(page.locator('dialog.eotion-product-overlay--bottom-drawer[open]')).toBeVisible()
  expect(await page.locator('dialog.eotion-product-overlay--bottom-drawer[open]').evaluate(element => element.matches(':modal'))).toBe(true)
  await screenshot(page, 'p84-database-sort-mobile-390')
  await page.keyboard.press('Escape')
  await openDatabaseSetting(page, tables.nth(1), '属性')
  await screenshot(page, 'p84-database-columns-mobile-390')
  await page.keyboard.press('Escape')
  const mutationCount = api.requests.filter(({ method, path }) => ['POST', 'PATCH', 'DELETE'].includes(method) && path.includes(`/databases/${rootDatabase.id}/views`)).length
  await context.setOffline(true)
  api.offline = true
  await expect(tables.nth(1).getByRole('button', { name: '切换视图' })).toBeDisabled()
  await expect(tables.nth(1).getByRole('button', { name: '数据库设置' })).toBeEnabled()
  expect(api.requests.filter(({ method, path }) => ['POST', 'PATCH', 'DELETE'].includes(method) && path.includes(`/databases/${rootDatabase.id}/views`))).toHaveLength(mutationCount)
})

for (const panelKind of ['筛选', '排序'] as const) {
  test(`snapshot convergence preserves phone ${panelKind} draft without detaching editor`, async ({ page }) => {
    test.setTimeout(60_000)
    const api = await installApi(page, [
      block('snapshot-phone-paragraph', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'Stable page text' }] }, 100),
      block('phone-view-settings', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'phone-view-id' } }, 200),
    ], { databases: [rootDatabase], views: [view('phone-view-id', rootDatabase.id)], properties: rootProperties, records: [basicRecord] })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/#/app/database-workspace/page/database-page')
    await expect(page.locator('.product-sync-status')).toContainText('已同步')
    await installLocalBlockReader(page)
    await alignServerBlocksWithLocal(page, api)

    const table = page.locator('.eotion-editor-content .eotion-database')
    await openDatabaseSetting(page, table, panelKind)
    const drawer = page.locator('dialog.eotion-product-overlay--bottom-drawer[open]')
    await expect(drawer).toBeVisible()
    if (panelKind === '筛选') {
      const panel = page.getByRole('group', { name: '筛选条件' })
      await panel.getByRole('button', { name: '添加筛选条件' }).click()
      await selectSettingOption(panel, '筛选属性 1', 'root-select', 'Status')
      await selectSettingOption(panel, '筛选值 1', 'status-done', 'Done')
    } else {
      const panel = page.getByRole('group', { name: '排序条件' })
      await panel.getByRole('button', { name: '添加排序' }).click()
      await selectSettingOption(panel, '排序属性 1', 'root-number', 'Points')
      await selectSettingOption(panel, '排序方向 1', 'desc', '降序')
    }

    await page.evaluate(() => {
      type Capture = { editor: Element; database: Element; dialog: Element; editorInstance: unknown; databaseInstance: unknown; detached: string[] }
      const editor = document.querySelector('.eotion-editor')
      const database = document.querySelector('.eotion-database')
      const dialog = document.querySelector('dialog.eotion-product-overlay--bottom-drawer[open]')
      if (!editor || !database || !dialog) throw new Error('Expected editor, database, and open mobile drawer')
      const capture: Capture = {
        editor, database, dialog,
        editorInstance: (editor as Element & { __vueParentComponent?: unknown }).__vueParentComponent,
        databaseInstance: (database as Element & { __vueParentComponent?: unknown }).__vueParentComponent,
        detached: [],
      }
      const observer = new MutationObserver(records => {
        for (const record of records) for (const removed of record.removedNodes) {
          for (const [name, target] of [['editor', capture.editor], ['database', capture.database], ['dialog', capture.dialog]] as const) {
            if (removed === target || (removed instanceof Element && removed.contains(target))) capture.detached.push(name)
          }
        }
      })
      observer.observe(document.documentElement, { childList: true, subtree: true })
      ;(window as Window & { __snapshotCapture?: Capture; __snapshotObserver?: MutationObserver }).__snapshotCapture = capture
      ;(window as Window & { __snapshotObserver?: MutationObserver }).__snapshotObserver = observer
    })

    const databaseBlock = api.blocks.find(item => item.id === 'phone-view-settings')!
    const node = databaseBlock.props.node as { type: string; attrs: Record<string, unknown> }
    databaseBlock.props = { node: { attrs: { viewId: node.attrs.viewId, databaseId: node.attrs.databaseId }, type: node.type } }
    expect(await requestSnapshotHydration(page)).toBe(true)

    const identity = await page.evaluate(() => {
      const capture = (window as Window & { __snapshotCapture?: { editor: Element; database: Element; dialog: Element; editorInstance: unknown; databaseInstance: unknown; detached: string[] } }).__snapshotCapture!
      const editor = document.querySelector('.eotion-editor')
      const database = document.querySelector('.eotion-database')
      const dialog = document.querySelector('dialog.eotion-product-overlay--bottom-drawer[open]')
      return {
        editorSame: editor === capture.editor,
        databaseSame: database === capture.database,
        dialogSame: dialog === capture.dialog,
        editorConnected: capture.editor.isConnected,
        databaseConnected: capture.database.isConnected,
        dialogConnected: capture.dialog.isConnected,
        editorComponentSame: capture.editorInstance === (editor as (Element & { __vueParentComponent?: unknown }) | null)?.__vueParentComponent,
        databaseComponentSame: capture.databaseInstance === (database as (Element & { __vueParentComponent?: unknown }) | null)?.__vueParentComponent,
        detached: capture.detached,
      }
    })
    expect(identity).toEqual({ editorSame: true, databaseSame: true, dialogSame: true, editorConnected: true, databaseConnected: true, dialogConnected: true, editorComponentSame: true, databaseComponentSame: true, detached: [] })
    if (panelKind === '筛选') {
      await expect(page.getByRole('group', { name: '筛选条件' }).getByRole('button', { name: '筛选值 1' })).toHaveAttribute('data-value', 'status-done')
    } else {
      await expect(page.getByRole('group', { name: '排序条件' }).getByRole('button', { name: '排序方向 1' })).toHaveAttribute('data-value', 'desc')
    }
  })
}

test('snapshot convergence reloads the editor when paragraph content changes', async ({ page }) => {
  test.setTimeout(60_000)
  const api = await installApi(page, [
    block('snapshot-content-paragraph', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'Before snapshot' }] }, 100),
    block('snapshot-content-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'phone-view-id' } }, 200),
  ], { databases: [rootDatabase], views: [view('phone-view-id', rootDatabase.id)], properties: rootProperties, records: [basicRecord] })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/app/database-workspace/page/database-page')
  await expect(page.locator('.product-sync-status')).toContainText('已同步')
  await installLocalBlockReader(page)
  await alignServerBlocksWithLocal(page, api)

  const previousEditor = await page.locator('.eotion-editor').elementHandle()
  expect(previousEditor).not.toBeNull()
  const paragraph = api.blocks.find(item => item.id === 'snapshot-content-paragraph')!
  paragraph.props = { node: { type: 'paragraph', content: [{ type: 'text', text: 'Updated from snapshot' }] } }
  expect(await requestSnapshotHydration(page)).toBe(false)
  await expect(page.locator('.eotion-editor-content')).toContainText('Updated from snapshot')
  expect(await previousEditor!.evaluate(element => element.isConnected)).toBe(false)
})

test('snapshot convergence PagePersistence matches equivalent blocks independent of object key order', async ({ page }) => {
  const api = await installApi(page, [
    block('snapshot-compare-paragraph', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'First' }, { type: 'hardBreak' }, { type: 'text', text: 'Second' }] }, 100),
    block('snapshot-compare-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'phone-view-id' } }, 200),
  ], { databases: [rootDatabase], views: [view('phone-view-id', rootDatabase.id)], properties: rootProperties, records: [basicRecord] })
  await page.goto('/#/app/database-workspace/page/database-page')
  await expect(page.locator('.product-sync-status')).toContainText('已同步')
  await installLocalBlockReader(page)
  await alignServerBlocksWithLocal(page, api)
  const outcomes = await page.evaluate(async pageId => {
    const [{ PagePersistence }, { useProductSyncStore }, { blocksToDocument }] = await Promise.all([
      import('/src/editor/pagePersistence.ts'), import('/src/stores/productSync.ts'), import('/src/editor/blockCodec.ts'),
    ])
    const persistence = new PagePersistence('database-user', 'database-workspace', pageId, () => {})
    await persistence.load()
    const blocks = await (await useProductSyncStore().store()).listBlocksByPage(pageId)
    const base = structuredClone(blocks)
    const matches = (candidate: unknown[]) => persistence.matchesLocalBlocks(candidate as never[])
    const database = base.find(block => block.id === 'snapshot-compare-database')!
    const paragraph = base.find(block => block.id === 'snapshot-compare-paragraph')!
    const originalNode = database.props.node as { type: string; attrs: Record<string, unknown> }
    const reordered = structuredClone(base)
    const reorderedDatabase = reordered.find(block => block.id === database.id)!
    reorderedDatabase.props = { node: { attrs: { viewId: originalNode.attrs.viewId, databaseId: originalNode.attrs.databaseId }, type: originalNode.type } }
    persistence.update(blocksToDocument(reordered))
    const reorderedDocumentDirty = persistence.dirty
    const nullParentUndefined = structuredClone(base).map(block => ({ ...block, parentBlockId: undefined }))
    const changed = (edit: (copy: typeof base) => void) => { const copy = structuredClone(base); edit(copy); return matches(copy) }
    const paragraphContent = paragraph.props.node as { content: unknown[] }
    const reversedContent = changed(copy => {
      const target = copy.find(block => block.id === paragraph.id)!
      const node = target.props.node as { content: unknown[] }
      node.content = [...paragraphContent.content].reverse()
    })
    const results = {
      reorderedObjectKeys: matches(reordered),
      reorderedDocumentDirty,
      nullAndUndefinedParent: matches(nullParentUndefined),
      changedProps: changed(copy => { copy.find(block => block.id === database.id)!.props.description = 'changed' }),
      changedDatabaseId: changed(copy => { const node = copy.find(block => block.id === database.id)!.props.node as { type: string; attrs: Record<string, unknown> }; node.attrs.databaseId = 'changed-database' }),
      changedViewId: changed(copy => { const node = copy.find(block => block.id === database.id)!.props.node as { type: string; attrs: Record<string, unknown> }; node.attrs.viewId = 'changed-view' }),
      changedType: changed(copy => { copy.find(block => block.id === database.id)!.type = 'paragraph' }),
      changedOrder: changed(copy => { copy.find(block => block.id === database.id)!.orderKey += 'x' }),
      changedParent: changed(copy => { copy.find(block => block.id === database.id)!.parentBlockId = 'other-parent' }),
      changedArrayOrder: reversedContent,
      addedBlock: changed(copy => { copy.push({ ...copy[0]!, id: 'added-block' }) }),
      removedBlock: matches(base.filter(block => block.id !== database.id)),
    }
    persistence.dispose()
    return results
  }, pageRecord.id)
  expect(outcomes).toEqual({
    reorderedObjectKeys: true,
    reorderedDocumentDirty: false,
    nullAndUndefinedParent: true,
    changedProps: false,
    changedDatabaseId: false,
    changedViewId: false,
    changedType: false,
    changedOrder: false,
    changedParent: false,
    changedArrayOrder: false,
    addedBlock: false,
    removedBlock: false,
  })
})

test('phone filter and sort panels save through their footers and restore saved drafts', async ({ page }) => {
  const api = await installApi(page, [
    block('phone-view-settings', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'phone-view-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('phone-view-id', rootDatabase.id)], properties: rootProperties, records: [basicRecord] })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  const mobileDialog = page.locator('dialog.eotion-product-overlay--bottom-drawer[open]')

  await openDatabaseSetting(page, table, '筛选')
  const filterPanel = page.getByRole('group', { name: '筛选条件' })
  await expect(mobileDialog).toBeVisible()
  await expect(mobileDialog.getByRole('heading', { level: 2 })).toHaveText('筛选条件')
  await expect(mobileDialog.getByRole('heading', { level: 2 })).toHaveCount(1)
  await filterPanel.getByRole('button', { name: '添加筛选条件' }).click()
  await selectSettingOption(filterPanel, '筛选属性 1', 'root-select', 'Status')
  await selectSettingOption(filterPanel, '筛选值 1', 'status-done', 'Done')
  await overlayFooter(filterPanel).getByRole('button', { name: '保存筛选' }).click()
  await expect.poll(() => api.views[0]!.config.filters).toEqual([{ propertyId: 'root-select', operator: 'is', value: 'status-done' }])
  await expect(filterPanel).toHaveCount(0)
  await expect(mobileDialog).toHaveCount(0)

  await openDatabaseSetting(page, table, '筛选')
  await expect(filterPanel.getByRole('button', { name: '筛选属性 1' })).toHaveAttribute('data-value', 'root-select')
  await expect(filterPanel.getByRole('button', { name: '筛选值 1' })).toHaveAttribute('data-value', 'status-done')
  await page.keyboard.press('Escape')
  await expect(filterPanel).toHaveCount(0)
  await expect(mobileDialog).toHaveCount(0)

  await openDatabaseSetting(page, table, '排序')
  const sortPanel = page.getByRole('group', { name: '排序条件' })
  await expect(mobileDialog).toBeVisible()
  await expect(mobileDialog.getByRole('heading', { level: 2 })).toHaveText('排序条件')
  await expect(mobileDialog.getByRole('heading', { level: 2 })).toHaveCount(1)
  await sortPanel.getByRole('button', { name: '添加排序' }).click()
  await selectSettingOption(sortPanel, '排序属性 1', 'root-number', 'Points')
  await selectSettingOption(sortPanel, '排序方向 1', 'desc', '降序')
  await overlayFooter(sortPanel).getByRole('button', { name: '保存排序' }).click()
  await expect.poll(() => api.views[0]!.config.sorts).toEqual([{ propertyId: 'root-number', direction: 'desc' }])
  await expect(sortPanel).toHaveCount(0)
  await expect(mobileDialog).toHaveCount(0)

  await openDatabaseSetting(page, table, '排序')
  await expect(sortPanel.getByRole('button', { name: '排序属性 1' })).toHaveAttribute('data-value', 'root-number')
  await expect(sortPanel.getByRole('button', { name: '排序方向 1' })).toHaveAttribute('data-value', 'desc')
  await page.keyboard.press('Escape')
  await expect(sortPanel).toHaveCount(0)
  await expect(mobileDialog).toHaveCount(0)
})

test('filter and sort setting menus are keyboard operable and disable unsupported properties', async ({ page }) => {
  const relation = { ...property('unsupported-relation', rootDatabase.id, 'Related', 'relation'), config: { targetDatabaseId: rootDatabase.id } }
  const formula = { ...property('unsupported-formula', rootDatabase.id, 'Calculated', 'formula'), config: { expression: { kind: 'literal', value: 1 }, resultType: 'number' } } as TestProperty
  await installApi(page, [
    block('settings-select-accessibility', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: [...rootProperties, relation, formula], records: [basicRecord] })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')

  await openDatabaseSetting(page, table, '筛选')
  const filters = page.getByRole('group', { name: '筛选条件' })
  await filters.getByRole('button', { name: '添加筛选条件' }).click()
  await expect(filters.locator('select')).toHaveCount(0)
  const filterProperty = filters.getByRole('button', { name: '筛选属性 1' })
  await filterProperty.press('ArrowDown')
  const filterMenu = page.getByRole('menu', { name: '筛选属性 1' })
  await expect(filterMenu).toBeVisible()
  await expect(filterMenu.getByRole('menuitem').first()).toBeFocused()
  await expect(filterMenu.getByRole('menuitem', { name: 'Calculated（暂不支持筛选）' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  await openDatabaseSetting(page, table, '排序')
  const sorts = page.getByRole('group', { name: '排序条件' })
  await sorts.getByRole('button', { name: '添加排序' }).click()
  await expect(sorts.locator('select')).toHaveCount(0)
  const sortProperty = sorts.getByRole('button', { name: '排序属性 1' })
  await sortProperty.press('ArrowDown')
  const sortMenu = page.getByRole('menu', { name: '排序属性 1' })
  await expect(sortMenu).toBeVisible()
  await expect(sortMenu.getByRole('menuitem').first()).toBeFocused()
  await expect(sortMenu.getByRole('menuitem', { name: 'Related（暂不支持排序）' })).toBeDisabled()
})

test('database tables render and references round-trip at root and under a toggle', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const api = await installApi(page, [
    block('before', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] }, 100),
    block('database-root', 'database', { type: 'eotionDatabase', attrs: { databaseId: 'database-root-id', viewId: 'view-root-id' } }, 200),
    block('toggle', 'toggle', { type: 'eotionToggle', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested references' }] }] }, 300),
    block('database-nested', 'database', { type: 'eotionDatabase', attrs: { databaseId: 'database-nested-id', viewId: 'view-nested-id' } }, 100, 'toggle'),
    block('divider', 'divider', { type: 'horizontalRule' }, 500),
    block('image', 'image', { type: 'eotionImage', attrs: { fileId: 'image-file', name: 'image.png', mimeType: 'image/png', size: 12, url: 'https://objects.example.test/image.png' } }, 600),
    block('file', 'file', { type: 'eotionFile', attrs: { fileId: 'document-file', name: 'notes.pdf', mimeType: 'application/pdf', size: 34, url: 'https://objects.example.test/notes.pdf' } }, 700),
    block('after', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'After' }] }, 400),
  ], {
    databases: [rootDatabase, nestedDatabase],
    views: [view('view-root-id', rootDatabase.id), view('view-nested-id', nestedDatabase.id)],
    properties: [...rootProperties, property('nested-title', nestedDatabase.id, 'Name', 'title')],
    records: [basicRecord],
  })

  await page.goto('/#/app/database-workspace/page/database-page')
  const editor = page.locator('.eotion-editor-content .tiptap')
  await expect(editor).toBeVisible()
  const references = editor.locator('.eotion-database')
  await expect(references).toHaveCount(2)
  await expect(references.first()).toContainText('Root projects')
  await expect(references.first().locator('th button.eotion-database-property-trigger')).toHaveText(['名称', 'Notes', 'Points', 'Done', 'Status', 'Due'])
  await expect(references.first().locator('tbody tr td')).toHaveText(['Launch plan', 'Draft ready', '42', '已完成', 'Open', '2026-10-04'])
  await expect(references.nth(1)).toContainText('Nested projects')
  await expect(references.nth(1)).toContainText('暂无记录')
  await expect(editor).toContainText('Before')
  await expect(editor).toContainText('After')
  await screenshot(page, 'product-database-desktop')
  await screenshot(page, 'product-database-empty')
  await page.emulateMedia({ colorScheme: 'dark' })
  await screenshot(page, 'product-database-desktop-dark')
  await expect(references.first().locator('tbody tr td')).toHaveText(['Launch plan', 'Draft ready', '42', '已完成', 'Open', '2026-10-04'])
  await page.emulateMedia({ colorScheme: 'light' })

  await editor.getByText('Before', { exact: true }).click()
  await page.keyboard.press('Home')
  await page.keyboard.type('Edited ')
  await expect(editor.locator('p').first()).toContainText('Edited Before')
  await expect.poll(() => api.blocks.find((item) => item.id === 'before')?.props.node).toMatchObject({
    type: 'paragraph', content: [{ type: 'text', text: 'Edited Before' }],
  })
  await expect.poll(() => api.blocks.find((item) => item.props.node.type === 'eotionDatabase' && (item.props.node.attrs as any)?.databaseId === 'database-root-id')?.id).toBe('database-root')
  await expect.poll(() => api.blocks.find((item) => item.id === 'database-root')?.props.node).toEqual({
    type: 'eotionDatabase', attrs: { databaseId: 'database-root-id', viewId: 'view-root-id' },
  })

  await page.reload()
  await expect(page.locator('.eotion-editor-content .tiptap .eotion-database')).toHaveCount(2)
  await expect(page.locator('.eotion-database').first()).toContainText('Root projects')
  await expect(page.locator('.eotion-editor-content .tiptap')).toContainText('Edited Before')
  expect(api.blocks.find((item) => item.id === 'database-root')?.id).toBe('database-root')
  expect(api.blocks.find((item) => item.id === 'database-nested')).toMatchObject({
    id: 'database-nested', parentBlockId: 'toggle',
    props: { node: { type: 'eotionDatabase', attrs: { databaseId: 'database-nested-id', viewId: 'view-nested-id' } } },
  })

  const rootPlaceholder = page.locator('.eotion-editor-content .tiptap .eotion-database').first()
  await rootPlaceholder.locator('.eotion-database-copy').click()
  await page.keyboard.press('Backspace')
  await expect(page.locator('.eotion-editor-content .tiptap .eotion-database')).toHaveCount(1)
  await expect.poll(() => api.blocks.some((item) => item.id === 'database-root')).toBe(false)
  expect(api.databases.some((item) => item.id === rootDatabase.id)).toBe(true)
  expect(api.properties.some((item) => item.databaseId === rootDatabase.id)).toBe(true)
  expect(api.views.some((item) => item.databaseId === rootDatabase.id)).toBe(true)
  expect(api.records.some((item) => item.databaseId === rootDatabase.id)).toBe(true)
  expect(api.blocks.map((item) => item.id)).toEqual(expect.arrayContaining(['before', 'toggle', 'database-nested', 'divider', 'image', 'file', 'after']))
  expect(errors).toEqual([])

  await page.reload()
  await expect(page.locator('.eotion-editor-content .tiptap .eotion-database')).toHaveCount(1)
  await expect(page.locator('.eotion-editor-content .tiptap')).toContainText('Edited Before')
  await expect(page.locator('.eotion-editor-content .tiptap')).toContainText('After')
  expect(api.blocks.some((item) => item.id === 'database-nested')).toBe(true)
})

test('slash creates a database table and preserves the reference ID after reload', async ({ page }) => {
  const api = await installApi(page, [
    block('body-before-create', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: '正文保留' }] }, 100),
  ])
  await page.goto('/#/app/database-workspace/page/database-page')
  await startDatabaseSlash(page)
  await page.getByRole('button', { name: '创建新数据库' }).click()
  await page.getByRole('textbox', { name: '数据库名称' }).fill('Sprint board')
  await page.getByRole('button', { name: '创建数据库', exact: true }).click()
  const table = page.locator('.eotion-editor-content .tiptap .eotion-database')
  await expect(table).toContainText('Sprint board')
  await expect(table).toContainText('暂无记录')
  await expect(page.locator('.eotion-editor-content .tiptap')).toContainText('正文保留')
  await expect.poll(() => api.databases.some((item) => item.name === 'Sprint board')).toBe(true)
  const createdBlock = api.blocks.find((item) => item.type === 'database')
  expect(createdBlock).toBeDefined()
  const savedReference = (createdBlock?.props as any)?.node?.attrs
  expect(savedReference?.databaseId).toBe(api.databases[0]?.id)
  const stableBlockId = createdBlock?.id
  await page.reload()
  const reloadedBlock = api.blocks.find((item) => item.id === stableBlockId)
  expect(reloadedBlock?.id).toBe(stableBlockId)
  expect((reloadedBlock?.props as any)?.node?.attrs).toEqual(savedReference)
  await expect(page.locator('.eotion-editor-content .tiptap .eotion-database')).toContainText('Sprint board')
  await expect(page.locator('.eotion-editor-content .tiptap')).toContainText('正文保留')
})

test('committed inline database creation is recovered by its fixed block ID after a lost response', async ({ page }) => {
  const api = await installApi(page, [], { abortDatabaseCreatesAfterCommit: 1 })
  await page.goto('/#/app/database-workspace/page/database-page')
  await startDatabaseSlash(page)
  await page.getByRole('button', { name: '创建新数据库' }).click()
  await page.getByRole('textbox', { name: '数据库名称' }).fill('Recovered board')
  await page.getByRole('button', { name: '创建数据库', exact: true }).click()
  await expect(page.locator('.eotion-editor-content .eotion-database')).toContainText('Recovered board')
  expect(api.databases.filter((item) => item.name === 'Recovered board')).toHaveLength(1)
  expect(api.blocks.filter((item) => item.type === 'database')).toHaveLength(1)
  expect(api.requests.filter(({ method, path }) => method === 'POST' && path.endsWith('/databases'))).toHaveLength(1)
  expect(api.requests.filter(({ method, path }) => method === 'GET' && /\/blocks\/[^/]+$/u.test(path))).toHaveLength(1)
})

test('unconfirmed inline database creation fences further create or link attempts until page refresh', async ({ page }) => {
  const api = await installApi(page, [], { abortDatabaseCreatesAfterCommit: 1, failDatabaseReferenceReads: 1 })
  api.pages.push({ ...pageRecord, id: 'other-database-page', title: 'Other page', orderKey: '0000000000000002' })
  await page.goto('/#/app/database-workspace/page/database-page')
  await startDatabaseSlash(page)
  await page.getByRole('button', { name: '创建新数据库' }).click()
  await page.getByRole('textbox', { name: '数据库名称' }).fill('Uncertain board')
  await page.getByRole('button', { name: '创建数据库', exact: true }).click()
  const editor = page.locator('.eotion-editor-content .tiptap')
  const uncertainMessage = '上次数据库操作结果尚未确认，请联网并刷新页面后确认；正文可继续编辑。'
  await expect(page.getByRole('alert')).toContainText(uncertainMessage)
  await expect(editor).toHaveAttribute('contenteditable', 'true')

  await page.getByRole('button', { name: 'Other page', exact: true }).click()
  await expect(page).toHaveURL(/other-database-page$/u)
  await expect(page.locator('.eotion-editor-content .tiptap')).toBeVisible()
  await page.getByRole('button', { name: 'Database references', exact: true }).click()
  await expect(page).toHaveURL(/database-page$/u)
  await expect(editor).toBeVisible()
  await expect.poll(() => page.evaluate(async () => {
    const { isProductDatabaseInsertionUncertain } = await import('/src/services/productDatabases.ts')
    return isProductDatabaseInsertionUncertain('database-user', 'database-workspace', 'database-page')
  })).toBe(true)
  await editor.click()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  await page.keyboard.press('/')
  await page.keyboard.type('database')
  await page.locator('.p2-slash-menu').getByRole('option', { name: '数据库', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(uncertainMessage)
  expect(api.requests.filter(({ method, path }) => method === 'POST' && (path.endsWith('/databases') || path.endsWith('/database-links')))).toHaveLength(1)
})

test('committed inline database creation fences its original user when auth switches before the response', async ({ page }) => {
  const api = await installApi(page, [], { holdDatabaseCreateResponse: true })
  await page.goto('/#/app/database-workspace/page/database-page')
  await startDatabaseSlash(page)
  await page.getByRole('button', { name: '创建新数据库' }).click()
  await page.getByRole('textbox', { name: '数据库名称' }).fill('Auth switched board')
  await page.getByRole('button', { name: '创建数据库', exact: true }).click()
  await api.databaseCreateResponseStarted
  expect(api.databases.filter((item) => item.name === 'Auth switched board')).toHaveLength(1)
  expect(api.blocks.filter((item) => item.type === 'database')).toHaveLength(1)

  await page.evaluate(async () => {
    const { useAuthStore } = await import('/src/stores/auth.ts')
    useAuthStore().user = { id: 'other-user', email: 'other@example.test', displayName: 'Other user', createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T00:00:00.000Z' }
  })
  api.releaseDatabaseCreateResponse()
  const fenceMessage = '上次数据库操作结果尚未确认，请联网并刷新页面后确认；正文可继续编辑。'
  await expect(page.getByRole('alert')).toContainText('数据库已创建，但登录状态已切换。')

  await page.evaluate(async () => {
    const { useAuthStore } = await import('/src/stores/auth.ts')
    useAuthStore().user = { id: 'database-user', email: 'database@example.com', displayName: 'Database user', createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T00:00:00.000Z' }
  })
  expect(await page.evaluate(async () => {
    const { isProductDatabaseInsertionUncertain } = await import('/src/services/productDatabases.ts')
    return isProductDatabaseInsertionUncertain('database-user', 'database-workspace', 'database-page')
  })).toBe(true)

  const editor = page.locator('.eotion-editor-content .tiptap')
  await editor.click()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  await page.keyboard.press('/')
  await page.keyboard.type('database')
  await page.locator('.p2-slash-menu').getByRole('option', { name: '数据库', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(fenceMessage)
  expect(api.databases.filter((item) => item.name === 'Auth switched board')).toHaveLength(1)
  expect(api.blocks.filter((item) => item.type === 'database')).toHaveLength(1)
  expect(api.requests.filter(({ method, path }) => method === 'POST' && path.endsWith('/databases'))).toHaveLength(1)
})

test('mobile slash database dialog stays within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const api = await installApi(page, [])
  await page.goto('/#/app/database-workspace/page/database-page')
  await startDatabaseSlash(page)
  const dialog = page.getByRole('dialog', { name: '数据库' })
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveCount(1)
  await expect(dialog.getByRole('button', { name: /关闭/u })).toHaveCount(1)
  const choices = dialog.locator('.database-command-option')
  await expect(choices).toHaveCount(2)
  for (const choice of await choices.all()) {
    expect((await choice.boundingBox())!.height).toBeGreaterThanOrEqual(96)
    expect(await choice.evaluate(element => {
      const style = getComputedStyle(element)
      return [style.textAlign, style.alignItems, style.justifyContent]
    })).toEqual(['center', 'center', 'center'])
  }
  await dialog.getByRole('button', { name: '创建新数据库' }).click()
  await expect(dialog.getByRole('textbox', { name: '数据库名称' })).toBeVisible()
  await expect(dialog.locator('label[for="database-name"]')).toHaveCount(0)
  await expect(dialog.getByRole('textbox', { name: '数据库名称' })).toHaveAttribute('placeholder', '数据库名字')
  const footer = dialog.locator('.eotion-product-overlay__footer')
  const back = footer.getByRole('button', { name: '返回', exact: true })
  const cancel = footer.getByRole('button', { name: '取消', exact: true })
  const submit = footer.getByRole('button', { name: '创建数据库', exact: true })
  await expect(footer).toBeVisible()
  await screenshot(page, 'database-create-footer-mobile-390')
  await expect(back.locator('svg')).toHaveCount(1)
  await expect(submit).toHaveAttribute('form', 'database-create-database-page')
  const [footerBounds, backBounds, cancelBounds, submitBounds] = await Promise.all([footer.boundingBox(), back.boundingBox(), cancel.boundingBox(), submit.boundingBox()])
  expect(footerBounds).not.toBeNull()
  expect(backBounds!.x).toBeGreaterThanOrEqual(footerBounds!.x)
  expect(backBounds!.x).toBeLessThan(cancelBounds!.x)
  expect(cancelBounds!.x).toBeLessThan(submitBounds!.x)
  expect(submitBounds!.x + submitBounds!.width).toBeLessThanOrEqual(footerBounds!.x + footerBounds!.width)
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveCount(1)
  const bounds = await dialog.boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.y).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844)
  await back.click()
  await expect(dialog.getByRole('button', { name: '创建新数据库' })).toBeVisible()
  await dialog.getByRole('button', { name: '创建新数据库' }).click()
  await dialog.getByRole('textbox', { name: '数据库名称' }).fill('Mobile board')
  await cancel.click()
  await expect(dialog).not.toBeVisible()

  await startDatabaseSlash(page)
  const reopenedDialog = page.getByRole('dialog', { name: '数据库' })
  await reopenedDialog.getByRole('button', { name: '创建新数据库' }).click()
  await reopenedDialog.getByRole('textbox', { name: '数据库名称' }).fill('Mobile board')
  await reopenedDialog.locator('.eotion-product-overlay__footer').getByRole('button', { name: '创建数据库', exact: true }).click()
  await expect(page.locator('.eotion-editor-content .eotion-database')).toContainText('Mobile board')
  await expect.poll(() => api.databases.some(item => item.name === 'Mobile board')).toBe(true)
})

test('slash creates a nested database under an existing toggle child', async ({ page }) => {
  const api = await installApi(page, [
    block('nested-toggle', 'toggle', { type: 'eotionToggle', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Summary' }] }] }, 100),
    block('nested-target', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'Create database here' }] }, 200, 'nested-toggle'),
  ])
  await page.goto('/#/app/database-workspace/page/database-page')
  const nestedParagraph = page.locator('.eotion-editor-content .tiptap .eotion-toggle-body p').filter({ hasText: 'Create database here' })
  await startDatabaseSlashFrom(page, nestedParagraph)
  await page.getByRole('button', { name: '创建新数据库' }).click()
  await page.getByRole('textbox', { name: '数据库名称' }).fill('Nested board')
  await page.getByRole('button', { name: '创建数据库', exact: true }).click()
  await expect.poll(() => api.blocks.find((item) => item.type === 'database')).toBeDefined()
  const created = api.blocks.find((item) => item.type === 'database')
  expect(created).toBeDefined()
  expect(created?.parentBlockId).toBe('nested-toggle')
  expect(api.blocks.some((item) => item.id === 'nested-toggle')).toBe(true)
  await expect(page.locator('.eotion-toggle-body .eotion-database')).toContainText('Nested board')
  await expect(page.locator('.eotion-toggle-body')).toContainText('Summary')
  await expect(page.locator('.eotion-toggle-body')).toContainText('Create database here')
  const stableId = created?.id
  await page.reload()
  expect(api.blocks.find((item) => item.id === stableId)).toMatchObject({ id: stableId, parentBlockId: 'nested-toggle' })
  await expect(page.locator('.eotion-toggle-body .eotion-database')).toContainText('Nested board')
  await expect(page.locator('.eotion-toggle-body')).toContainText('Summary')
  await expect(page.locator('.eotion-toggle-body')).toContainText('Create database here')
})

test('linking a shared database adds only a reference and new records create pages', async ({ page }) => {
  const api = await installApi(page, [
    block('body-before-link', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'Shared body' }] }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: rootProperties, records: [basicRecord] })
  await page.goto('/#/app/database-workspace/page/database-page')
  await startDatabaseSlash(page)
  await page.getByRole('button', { name: '链接现有数据库' }).click()
  await page.getByRole('button', { name: 'Root projects', exact: true }).click()
  await page.getByRole('button', { name: '表格视图', exact: true }).click()
  const table = page.locator('.eotion-editor-content .tiptap .eotion-database')
  await expect(table).toContainText('Launch plan')
  expect(api.databases).toHaveLength(1)
  expect(api.records).toHaveLength(1)
  expect(api.properties).toHaveLength(6)
  const linked = api.blocks.find((item) => item.type === 'database')
  expect((linked?.props as any)?.node?.attrs).toEqual({ databaseId: rootDatabase.id, viewId: 'view-root-id' })
  await submitNewRecord(table)
  await expect.poll(() => api.records).toHaveLength(2)
  await expect.poll(() => api.pages.some((item) => item.title === '无标题')).toBe(true)
  await expect(table).toContainText('无标题')
  await expect.poll(() => api.requests.some(({ method, path }) => method === 'POST' && path.endsWith(`/databases/${rootDatabase.id}/records`))).toBe(true)
  await expect(page.locator('[data-overlay-mode="drawer"] .eotion-editor-content .tiptap')).toHaveAttribute('contenteditable', 'true')
  const recordTitle = page.locator('[data-overlay-mode="drawer"]').getByRole('textbox', { name: '记录标题' })
  await recordTitle.fill('First record')
  await recordTitle.press('Enter')
  await expect.poll(() => api.pages.some((item) => item.title === 'First record')).toBe(true)
  await expect(table).toContainText('First record')
  await closeRecordSurface(page)
  await page.reload()
  await expect(page.locator('.eotion-editor-content .eotion-database')).toContainText('First record')
  await expect(page.locator('.eotion-editor-content .eotion-database').getByRole('button', { name: '打开记录：First record' })).toBeVisible()
  expect(api.databases).toHaveLength(1)
  expect(api.properties).toHaveLength(6)
})

test('record title refreshes a missing page before opening its editable drawer', async ({ page }) => {
  const api = await installApi(page, [
    block('open-record-page-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], {
    databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)],
    properties: rootProperties, records: [basicRecord],
  })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  await expect.poll(() => api.pages.some((item) => item.id === basicRecord.pageId)).toBe(false)
  api.pages.push({ ...pageRecord, id: basicRecord.pageId, title: 'Launch plan', orderKey: '0000000000000002' })
  await table.getByRole('button', { name: '打开记录：Launch plan' }).click()
  await expect(page.locator('[data-overlay-mode="drawer"]')).toBeVisible()
  const recordEditor = page.locator('[data-overlay-mode="drawer"] .eotion-editor-content .tiptap')
  await expect(recordEditor).toBeVisible()
  await expect(recordEditor).toHaveAttribute('contenteditable', 'true')
  expect(api.pages.some((item) => item.id === basicRecord.pageId)).toBe(true)
  expect(api.blocks.some((item) => item.pageId === basicRecord.pageId)).toBe(false)
})

test('two references share record refresh and removing one keeps the other reference and data', async ({ page }) => {
  const api = await installApi(page, [
    block('shared-reference-one', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
    block('shared-reference-two', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 200),
  ], {
    databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)],
    properties: rootProperties, records: [basicRecord],
  })
  await page.goto('/#/app/database-workspace/page/database-page')
  const tables = page.locator('.eotion-editor-content .eotion-database')
  await expect(tables).toHaveCount(2)
  await expect(tables.nth(0).locator('tbody tr')).toHaveCount(1)
  await expect(tables.nth(1).locator('tbody tr')).toHaveCount(1)

  await submitNewRecord(tables.nth(0))
  await expect(page.locator('[data-overlay-mode="drawer"]')).toBeVisible()
  const sharedTitle = page.locator('[data-overlay-mode="drawer"]').getByRole('textbox', { name: '记录标题' })
  await sharedTitle.fill('Shared record')
  await sharedTitle.press('Enter')
  await closeRecordSurface(page)
  await expect(tables.nth(0).locator('tbody tr')).toHaveCount(2)
  await expect(tables.nth(1).locator('tbody tr')).toHaveCount(2)
  await expect(tables.nth(0)).toContainText('Shared record')
  await expect(tables.nth(1)).toContainText('Shared record')
  expect(api.databases).toHaveLength(1)
  expect(api.databases[0]).toMatchObject({ id: rootDatabase.id, version: 2 })
  expect(api.views).toEqual([view('view-root-id', rootDatabase.id)])
  expect(api.properties).toEqual(rootProperties)
  expect(api.records).toHaveLength(2)
  expect(api.blocks.filter((item) => item.type === 'database')).toHaveLength(2)

  await tables.nth(0).locator('.eotion-database-copy').click()
  await page.keyboard.press('Backspace')
  await expect(page.locator('.eotion-editor-content .eotion-database')).toHaveCount(1)
  const remaining = page.locator('.eotion-editor-content .eotion-database')
  await expect(remaining).toContainText('Launch plan')
  await expect(remaining).toContainText('Shared record')
  await expect.poll(() => api.blocks.filter((item) => item.type === 'database').map((item) => item.id)).toEqual(['shared-reference-two'])
  expect(api.databases[0]).toMatchObject({ id: rootDatabase.id, version: 2 })
  expect(api.views).toEqual([view('view-root-id', rootDatabase.id)])
  expect(api.properties).toEqual(rootProperties)
  expect(api.records).toHaveLength(2)
})

test('record creation remains successful when the following snapshot refresh fails', async ({ page }) => {
  const api = await installApi(page, [
    block('refresh-warning-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], {
    databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)],
    properties: rootProperties, records: [basicRecord], failSnapshotAfterRecordCreate: true,
  })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  await submitNewRecord(table)
  await expect.poll(() => api.records).toHaveLength(2)
  await expect(table.locator('tbody tr')).toHaveCount(2)
  await expect(table.getByRole('alert')).toContainText('记录已创建，页面列表暂未刷新，请稍后刷新。')
  await expect(table).not.toContainText('无法新建记录')
})

test('edits versioned cells and manages property options without losing stable IDs', async ({ page, context }) => {
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  const seededRecord = { ...basicRecord, properties: { ...basicRecord.properties, 'root-checkbox': null } }
  const api = await installApi(page, [
    block('offline-body', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'Offline body' }] }, 50),
    block('p83-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: rootProperties, records: [seededRecord] })
  api.pages.push({ ...pageRecord, id: seededRecord.pageId, title: 'Launch plan', orderKey: '0000000000000002' })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  await expect(table).toContainText('Launch plan')

  await table.getByRole('button', { name: '编辑名称：Launch plan' }).click()
  let titleInput = table.getByRole('textbox', { name: '名称 值' })
  await titleInput.fill('Planning')
  await expect(titleInput).toBeFocused()
  await screenshot(page, 'p83-desktop-light-cell-edit')
  await titleInput.press('Enter')
  await expect(table.getByRole('button', { name: '编辑名称：Planning' })).toBeVisible()
  expect(api.pages.find((item) => item.id === seededRecord.pageId)?.title).toBe('Planning')
  expect(pageErrors).toEqual([])

  await table.getByRole('button', { name: 'Draft ready' }).click()
  const textInput = table.getByRole('textbox', { name: 'Notes 值' })
  await textInput.fill('Revised notes')
  await textInput.press('Enter')
  await expect(table).toContainText('Revised notes')

  await table.getByRole('button', { name: '42', exact: true }).click()
  const numberInput = table.getByRole('textbox', { name: 'Points 值' })
  await numberInput.fill('not-a-number')
  await numberInput.press('Enter')
  await expect(table.getByRole('alert')).toContainText('请输入有效数字')
  expect(api.requests.filter(({ method, path }) => method === 'PATCH' && path.includes('/cells/root-number'))).toHaveLength(0)
  await numberInput.fill('12.5')
  await table.getByRole('button', { name: '保存' }).click()
  await expect(table).toContainText('12.5')
  await table.getByRole('button', { name: '12.5', exact: true }).click()
  await table.getByRole('textbox', { name: 'Points 值' }).fill('')
  await table.getByRole('textbox', { name: 'Points 值' }).press('Enter')
  await expect(table.locator('tbody tr').first().locator('td').nth(2).getByRole('button', { name: '', exact: true })).toBeVisible()
  expect(api.records[0]?.properties['root-number']).toBeNull()

  const checkCell = table.locator('tbody tr').first().locator('td').nth(3).getByRole('button', { name: '', exact: true })
  await expect(checkCell).toHaveAttribute('aria-pressed', 'false')
  await checkCell.click()
  await expect(table.getByRole('button', { name: '已完成' })).toHaveAttribute('aria-pressed', 'true')
  await table.getByRole('button', { name: '已完成' }).focus()
  await page.keyboard.press('Space')
  await expect(table.getByRole('button', { name: '未完成' })).toHaveAttribute('aria-pressed', 'false')
  expect(pageErrors).toEqual([])

  await table.getByRole('button', { name: 'Open' }).click()
  const selectPopover = page.locator('body > .eotion-database-popover')
  await expect(selectPopover).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(selectPopover).toHaveCount(0)
  await table.getByRole('button', { name: 'Open' }).click()
  await selectPopover.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(table.locator('tbody').getByRole('button', { name: 'Done', exact: true })).toBeVisible()
  await table.locator('tbody').getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('button', { name: '清除' }).click()
  await expect(table.locator('tbody tr').first().locator('td').nth(4).getByRole('button', { name: '', exact: true })).toBeVisible()
  expect(pageErrors).toEqual([])

  await table.getByRole('button', { name: 'Due', exact: true }).click()
  await page.getByRole('textbox', { name: '属性名称' }).fill('Deadline')
  await screenshot(page, 'p83-desktop-light-property-menu')
  await page.getByRole('button', { name: '重命名', exact: true }).click()
  await expect(table.getByRole('button', { name: 'Deadline', exact: true })).toBeVisible()
  await table.getByRole('button', { name: '2026-10-04' }).click()
  const dateInput = table.getByRole('textbox', { name: 'Deadline 值' })
  await dateInput.fill('2026-11-05')
  await dateInput.press('Enter')
  await expect(table.getByRole('button', { name: '2026-11-05' })).toBeVisible()
  await table.getByRole('button', { name: '2026-11-05' }).click()
  await table.getByRole('button', { name: '清除' }).click()
  await expect(table.locator('tbody tr').first().locator('td').nth(5).getByRole('button', { name: '', exact: true })).toBeVisible()
  expect(pageErrors).toEqual([])

  await table.getByRole('button', { name: 'Status', exact: true }).click()
  await screenshot(page, 'p83-desktop-light-select-menu')
  const optionInput = page.getByRole('textbox', { name: '新选项名称' })
  await optionInput.fill('Review')
  await page.getByRole('button', { name: '添加', exact: true }).click()
  const reviewOption = api.properties.find((item) => item.id === 'root-select')?.options?.find((item) => item.name === 'Review')
  expect(reviewOption?.id).toBeTruthy()
  await table.getByRole('button', { name: 'Status', exact: true }).click()
  await expect(page.locator('.eotion-database-option-edit').filter({ hasText: 'Review' })).toBeVisible()
  const openOption = api.properties.find((item) => item.id === 'root-select')?.options?.find((item) => item.name === 'Open')
  await page.locator('.eotion-database-option-edit').filter({ hasText: 'Open' }).getByRole('button', { name: '重命名' }).click()
  await page.getByRole('textbox', { name: '重命名选项 Open' }).fill('Opened')
  await page.locator('.eotion-database-option-edit').filter({ has: page.getByRole('textbox', { name: '重命名选项 Open' }) }).getByRole('button', { name: '保存' }).click()
  expect(api.properties.find((item) => item.id === 'root-select')?.options?.find((item) => item.name === 'Opened')?.id).toBe(openOption?.id)
  await table.getByRole('button', { name: 'Status', exact: true }).click()
  await expect(page.locator('.eotion-database-option-edit').filter({ hasText: 'Opened' })).toBeVisible()
  await page.locator('.eotion-database-option-edit').filter({ hasText: 'Review' }).getByRole('button', { name: '删除' }).click()
  expect(api.properties.find((item) => item.id === 'root-select')?.options?.some((item) => item.id === reviewOption?.id)).toBe(false)

  await table.getByRole('button', { name: 'Points', exact: true }).click()
  await page.getByRole('button', { name: '删除属性' }).click()
  await expect(table.getByRole('button', { name: 'Points', exact: true })).toHaveCount(0)
  expect(api.records[0]?.properties['root-number']).toBeUndefined()
  expect(api.requests.some(({ method, path }) => method === 'DELETE' && path.endsWith('/properties/root-number'))).toBe(true)
  await openDatabaseSetting(page, table, '属性')
  await page.getByRole('group', { name: '属性管理' }).getByRole('button', { name: '新增属性' }).click()
  await page.getByRole('button', { name: '文本', exact: true }).click()
  await expect(table.getByRole('button', { name: '文本', exact: true })).toBeVisible()
  await table.getByRole('button', { name: '文本', exact: true }).click()
  await page.getByRole('textbox', { name: '属性名称' }).fill('Context')
  await page.getByRole('button', { name: '重命名', exact: true }).click()
  await expect(table.getByRole('button', { name: 'Context', exact: true })).toBeVisible()
  await table.getByRole('button', { name: 'Context', exact: true }).click()
  await page.getByRole('button', { name: '删除属性' }).click()
  await expect(table.getByRole('button', { name: 'Context', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.eotion-editor-content .eotion-database')).toContainText('Planning')
  await expect(page.locator('.eotion-editor-content .eotion-database')).toContainText('Revised notes')
  await installLocalBlockReader(page)
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await table.getByRole('button', { name: 'Deadline', exact: true }).click()
  await screenshot(page, 'p83-desktop-dark-property-menu')
  api.offline = true
  const writesBeforeOffline = api.requests.filter(({ method, path }) => path.includes('/databases/') && (method === 'POST' || method === 'PATCH' || method === 'DELETE')).length
  await context.setOffline(true)
  await expect(table.getByRole('status')).toContainText('数据库只读')
  await expect(table.getByRole('button', { name: '数据库设置' })).toBeEnabled()
  await expect(table.getByRole('button', { name: '编辑名称：Planning' })).toBeDisabled()
  expect(api.requests.filter(({ method, path }) => path.includes('/databases/') && (method === 'POST' || method === 'PATCH' || method === 'DELETE'))).toHaveLength(writesBeforeOffline)
  const offlineBody = page.locator('.eotion-editor-content .tiptap p').filter({ hasText: 'Offline body' })
  await offlineBody.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' remains editable')
  await expect.poll(() => readLocalBlocks(page, pageRecord.id)).toContain('remains editable')
  expect(JSON.stringify(api.blocks.find((item) => item.id === 'offline-body')?.props)).not.toContain('remains editable')
  await expect.poll(() => pageErrors).toEqual([])
})

test('keeps failed text drafts for retry and Escape cancels without a write', async ({ page }) => {
  const api = await installApi(page, [
    block('draft-retry-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: rootProperties, records: [basicRecord], failCellUpdates: 1 })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  await table.getByRole('button', { name: 'Draft ready' }).click()
  const input = table.getByRole('textbox', { name: 'Notes 值' })
  await input.fill('Keep this draft')
  await input.press('Enter')
  await expect(table.getByRole('alert')).toContainText('Cell update rejected')
  await expect(table.getByRole('textbox', { name: 'Notes 值' })).toHaveValue('Keep this draft')
  await table.getByRole('button', { name: '重试' }).click()
  await expect(table).toContainText('Keep this draft')
  expect(api.records[0]?.properties['root-text']).toBe('Keep this draft')
  await table.getByRole('button', { name: 'Keep this draft' }).click()
  const blurInput = table.getByRole('textbox', { name: 'Notes 值' })
  await blurInput.fill('Saved on blur')
  await blurInput.evaluate(element => (element as HTMLInputElement).blur())
  await expect(table).toContainText('Saved on blur')

  await table.getByRole('button', { name: '42', exact: true }).click()
  const numberInput = table.getByRole('textbox', { name: 'Points 值' })
  await numberInput.fill('99')
  const writesBeforeEscape = api.requests.filter(({ method, path }) => method === 'PATCH' && path.includes('/cells/root-number')).length
  await numberInput.evaluate((element) => element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true, keyCode: 229 })))
  expect(api.requests.filter(({ method, path }) => method === 'PATCH' && path.includes('/cells/root-number'))).toHaveLength(writesBeforeEscape)
  await numberInput.press('Escape')
  await expect(table.getByRole('button', { name: '42', exact: true })).toBeVisible()
  expect(api.requests.filter(({ method, path }) => method === 'PATCH' && path.includes('/cells/root-number'))).toHaveLength(writesBeforeEscape)
})

test('title cells edit in place while the first-column detail button stays independent across layouts', async ({ page }) => {
  const api = await installApi(page, [
    block('title-detail-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: rootProperties, records: [basicRecord] })
  api.pages.push({ ...pageRecord, id: basicRecord.pageId, title: 'Launch plan', orderKey: '0000000000000002', role: 'database-record' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  const titleCell = table.locator('tbody tr').first().locator('td').first()
  const titleBody = titleCell.getByRole('button', { name: '编辑名称：Launch plan' })
  const detail = titleCell.getByRole('button', { name: '打开记录：Launch plan' })
  await expect(table.locator('.eotion-database-title-edit')).toHaveCount(0)
  await expect(detail).toBeVisible()
  await page.mouse.move(1, 1)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  expect(await detail.evaluate(element => getComputedStyle(element).opacity)).toBe('0')

  await titleBody.click()
  const titleInput = titleCell.getByRole('textbox', { name: '名称 值' })
  await expect(titleInput).toBeFocused()
  await expect(page.locator('dialog[open]')).toHaveCount(0)
  await titleInput.fill('Edited inline')
  await titleInput.press('Enter')
  await expect.poll(() => api.pages.find(item => item.id === basicRecord.pageId)?.title).toBe('Edited inline')
  const titlePatch = api.requests.find(({ method, path }) => method === 'PATCH' && path.endsWith('/cells/root-title'))
  expect(titlePatch?.payload?.expectedPageUpdatedAt).toBe(now)

  const editedDetail = titleCell.getByRole('button', { name: '打开记录：Edited inline' })
  await titleCell.hover()
  await expect.poll(() => editedDetail.evaluate(element => getComputedStyle(element).opacity)).toBe('1')
  await page.mouse.move(1, 1)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await editedDetail.focus()
  await expect.poll(() => editedDetail.evaluate(element => getComputedStyle(element).opacity)).toBe('1')
  await editedDetail.click()
  await expect(page.locator('[data-overlay-mode="drawer"]')).toBeVisible()
  await expect(titleCell.getByRole('textbox', { name: '名称 值' })).toHaveCount(0)
  await closeRecordSurface(page)

  for (const width of [900, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await page.mouse.move(1, 1)
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    const touchDetail = titleCell.getByRole('button', { name: '打开记录：Edited inline' })
    await expect.poll(() => touchDetail.evaluate(element => getComputedStyle(element).opacity)).toBe('1')
    const [bodyBox, detailBox] = await Promise.all([titleCell.getByRole('button', { name: '编辑名称：Edited inline' }).boundingBox(), touchDetail.boundingBox()])
    expect(detailBox?.height).toBeGreaterThanOrEqual(44)
    expect(bodyBox && detailBox && bodyBox.x + bodyBox.width).toBeLessThanOrEqual(detailBox!.x)
  }

  await page.setViewportSize({ width: 1440, height: 900 })
  await titleCell.getByRole('button', { name: '编辑名称：Edited inline' }).click()
  const escapeInput = titleCell.getByRole('textbox', { name: '名称 值' })
  await escapeInput.fill('Discard this')
  await escapeInput.press('Escape')
  const restoredBody = titleCell.getByRole('button', { name: '编辑名称：Edited inline' })
  await expect(restoredBody).toBeFocused()
  expect(api.requests.filter(({ method, path }) => method === 'PATCH' && path.endsWith('/cells/root-title'))).toHaveLength(1)

  await restoredBody.press('Enter')
  const tabInput = titleCell.getByRole('textbox', { name: '名称 值' })
  await tabInput.fill('Committed with Tab')
  await tabInput.press('Tab')
  await expect.poll(() => api.requests.filter(({ method, path }) => method === 'PATCH' && path.endsWith('/cells/root-title')).length).toBe(2)
  await expect.poll(() => api.pages.find(item => item.id === basicRecord.pageId)?.title).toBe('Committed with Tab')
  expect(await titleCell.evaluate(element => element.contains(document.activeElement))).toBe(false)
  // A generated trailing Page block can be pending when title CAS starts; flush it before the cell PATCH.
  const titlePatchIndex = api.requests.findIndex(({ method, path, payload }) => method === 'PATCH' && path.endsWith('/cells/root-title') && payload?.value === 'Committed with Tab')
  const lastPageBlockFlushIndex = api.requests.reduce((index, item, current) => item.kind === 'block.upsert' ? current : index, -1)
  expect(lastPageBlockFlushIndex).toBeGreaterThanOrEqual(0)
  expect(lastPageBlockFlushIndex).toBeLessThan(titlePatchIndex)

  await titleCell.getByRole('button', { name: '编辑名称：Committed with Tab' }).click()
  const reverseTabInput = titleCell.getByRole('textbox', { name: '名称 值' })
  await reverseTabInput.fill('Committed with Shift Tab')
  await reverseTabInput.press('Shift+Tab')
  await expect.poll(() => api.pages.find(item => item.id === basicRecord.pageId)?.title).toBe('Committed with Shift Tab')
  expect(await titleCell.evaluate(element => element.contains(document.activeElement))).toBe(false)
})

test('409 refreshes the latest record version while retaining the cell draft for retry', async ({ page }) => {
  const api = await installApi(page, [
    block('conflict-retry-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: rootProperties, records: [basicRecord], conflictCellUpdates: 1 })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  await table.getByRole('button', { name: 'Draft ready' }).click()
  const input = table.getByRole('textbox', { name: 'Notes 值' })
  await input.fill('My retry draft')
  await input.press('Enter')
  await expect(table.getByRole('alert')).toContainText('内容已变化')
  await expect(table.getByRole('textbox', { name: 'Notes 值' })).toHaveValue('My retry draft')
  expect(api.records[0]?.properties['root-text']).toBe('Concurrent edit')
  await table.getByRole('button', { name: '重试' }).click()
  await expect(table).toContainText('My retry draft')
  expect(api.records[0]?.properties['root-text']).toBe('My retry draft')
  expect(api.requests.filter(({ method, path }) => method === 'PATCH' && path.endsWith('/cells/root-text'))).toHaveLength(2)
})

test('new record creates immediately with the default Page title and no header title form', async ({ page }) => {
  const api = await installApi(page, [
    block('empty-title-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: rootProperties, records: [basicRecord] })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  await table.getByRole('button', { name: '新建记录', exact: true }).click()
  await expect(table.getByRole('textbox', { name: '记录标题' })).toHaveCount(0)
  await expect.poll(() => api.records).toHaveLength(2)
  await expect(page.locator('[data-overlay-mode="drawer"]')).toBeVisible()
  await expect(page.locator('[data-overlay-mode="drawer"]').getByRole('textbox', { name: '记录标题' })).toHaveValue('无标题')
  await screenshot(page, 'database-new-record-desktop-drawer')
  expect(api.requests.filter(({ method, path }) => method === 'POST' && path.endsWith(`/databases/${rootDatabase.id}/records`))).toHaveLength(1)
  expect(api.pages.find((item) => item.id === api.records.at(-1)?.pageId)?.title).toBe('无标题')
})

for (const scenario of [
  { name: 'desktop modal', width: 1280, mode: 'modal', surface: 'modal' },
  { name: 'desktop page', width: 1280, mode: 'page', surface: 'page' },
  { name: 'phone right drawer', width: 390, mode: 'right-drawer', surface: 'right-drawer' },
  { name: 'phone bottom drawer', width: 390, mode: 'bottom-drawer', surface: 'bottom-drawer' },
  { name: 'phone modal', width: 390, mode: 'modal', surface: 'modal' },
] as const) {
  test(`new record opens through the shared ${scenario.name} pipeline`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: 844 })
    await page.addInitScript((mode) => {
      localStorage.setItem('eotion:database-opening:database-user:database-workspace:database-root-id:record', JSON.stringify({
        desktop: mode === 'modal' || mode === 'page' ? mode : 'drawer', tablet: 'drawer',
        mobile: mode === 'right-drawer' || mode === 'bottom-drawer' || mode === 'modal' || mode === 'page' ? mode : 'bottom-drawer',
      }))
    }, scenario.mode)
    const api = await installApi(page, [block(`new-${scenario.mode}-database`, 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100)], {
      databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: rootProperties, records: [basicRecord],
    })
    await page.goto('/#/app/database-workspace/page/database-page')
    const table = page.locator('.eotion-editor-content .eotion-database')
    await submitNewRecord(table)
    await expect.poll(() => api.records).toHaveLength(2)
    expect(api.requests.filter(({ method, path }) => method === 'POST' && path.endsWith(`/databases/${rootDatabase.id}/records`))).toHaveLength(1)
    if (scenario.surface === 'page') {
      await expect(page).toHaveURL(/\/page\/[^/]+\?edit=record$/u)
      await expect(page.getByRole('textbox', { name: '记录标题' })).toHaveValue('无标题')
      await screenshot(page, `database-new-record-${scenario.name.replaceAll(' ', '-')}`)
    } else {
      const surface = page.locator(`dialog.eotion-product-overlay--${scenario.surface}[open]`)
      await expect(surface).toBeVisible()
      await expect(surface.getByRole('textbox', { name: '记录标题' })).toHaveValue('无标题')
      await expect(surface.locator('.eotion-editor-content .tiptap')).toHaveAttribute('contenteditable', 'true')
      await screenshot(page, `database-new-record-${scenario.name.replaceAll(' ', '-')}`)
    }
  })
}

test('missing constructor-like property IDs render as empty values', async ({ page }) => {
  const inheritedProperty = property('constructor', rootDatabase.id, 'Inherited field', 'text')
  const api = await installApi(page, [
    block('constructor-property-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: [...rootProperties, inheritedProperty], records: [basicRecord] })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  const inheritedCell = table.locator('tbody tr td').nth(6)
  await expect(inheritedCell).toHaveText('')
  await inheritedCell.getByRole('button', { name: '', exact: true }).click()
  await expect(table.getByRole('textbox', { name: 'Inherited field 值' })).toHaveValue('')
  expect(Object.hasOwn(api.records[0]?.properties ?? {}, 'constructor')).toBe(false)
})

test('uncertain record creation fences all references until page refresh', async ({ page }) => {
  const api = await installApi(page, [
    block('uncertain-record-one', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
    block('uncertain-record-two', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 200),
  ], {
    databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)],
    properties: rootProperties, records: [basicRecord], abortRecordCreatesAfterCommit: 1, failRecordPageReads: 1,
  })
  await page.goto('/#/app/database-workspace/page/database-page')
  const tables = page.locator('.eotion-editor-content .eotion-database')
  await submitNewRecord(tables.nth(0))
  const message = '上次记录创建结果尚未确认，请联网并刷新页面后确认。'
  await expect(tables.nth(0).getByRole('alert')).toContainText(message)
  await expect(tables.nth(0).getByRole('button', { name: '新建记录', exact: true })).toBeDisabled()
  await expect(tables.nth(1).getByRole('button', { name: '新建记录', exact: true })).toBeDisabled()
  expect(api.records).toHaveLength(2)
  expect(api.requests.filter(({ method, path }) => method === 'POST' && path.endsWith(`/databases/${rootDatabase.id}/records`))).toHaveLength(1)
})

test('record POST success during auth switch fences the original user and database', async ({ page }) => {
  const api = await installApi(page, [
    block('auth-switch-record-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], {
    databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)],
    properties: rootProperties, records: [basicRecord], holdRecordCreateResponse: true,
  })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  await submitNewRecord(table)
  await api.recordCreateResponseStarted
  await page.evaluate(async () => {
    const { useAuthStore } = await import('/src/stores/auth.ts')
    const auth = useAuthStore()
    auth.user = { id: 'other-user', email: 'other@example.test', displayName: 'Other user', createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T00:00:00.000Z' }
  })
  api.releaseRecordCreateResponse()
  await expect(table.getByRole('alert')).toContainText('记录已创建，但登录状态或工作区已切换。')
  expect(api.records).toHaveLength(2)
  await page.evaluate(async () => {
    const { useAuthStore } = await import('/src/stores/auth.ts')
    const auth = useAuthStore()
    auth.user = { id: 'database-user', email: 'database@example.com', displayName: 'Database user', createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T00:00:00.000Z' }
  })
  await expect(table.getByRole('button', { name: '新建记录', exact: true })).toBeDisabled()
  expect(await page.evaluate(async () => {
    const { isProductDatabaseRecordCreationUncertain } = await import('/src/services/productDatabases.ts')
    return isProductDatabaseRecordCreationUncertain('database-user', 'database-workspace', 'database-root-id')
  })).toBe(true)
  expect(api.requests.filter(({ method, path }) => method === 'POST' && path.endsWith(`/databases/${rootDatabase.id}/records`))).toHaveLength(1)
})

test('record POST success during workspace switch fences the original workspace', async ({ page }) => {
  const api = await installApi(page, [
    block('workspace-switch-record-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], {
    databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)],
    properties: rootProperties, records: [basicRecord], holdRecordCreateResponse: true,
  })
  await page.goto('/#/app/database-workspace/page/database-page')
  await submitNewRecord(page.locator('.eotion-editor-content .eotion-database'))
  await api.recordCreateResponseStarted
  await page.evaluate(async () => {
    const { useProductPagesStore } = await import('/src/stores/productPages.ts')
    useProductPagesStore().forWorkspaceId = 'other-workspace'
  })
  api.releaseRecordCreateResponse()
  await expect.poll(() => api.records).toHaveLength(2)
  await expect.poll(() => page.evaluate(async () => {
    const { isProductDatabaseRecordCreationUncertain } = await import('/src/services/productDatabases.ts')
    return isProductDatabaseRecordCreationUncertain('database-user', 'database-workspace', 'database-root-id')
  })).toBe(true)
  expect(api.requests.filter(({ method, path }) => method === 'POST' && path.endsWith(`/databases/${rootDatabase.id}/records`))).toHaveLength(1)
})

test('table shows loading state while its request is delayed', async ({ page }) => {
  const api = await installApi(page, [
    block('delayed-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], {
    databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)],
    properties: rootProperties, records: [basicRecord], tableLoadDelayMs: 600,
  })
  const tableRequest = page.waitForRequest((request) => request.url().includes(`/databases/${rootDatabase.id}/views/view-root-id/table`))
  await page.goto('/#/app/database-workspace/page/database-page')
  await tableRequest
  const table = page.locator('.eotion-editor-content .eotion-database')
  await expect(table.getByRole('status')).toContainText('正在加载数据库…')
  await expect(table).not.toContainText('Launch plan')
  await expect(table).toContainText('Launch plan', { timeout: 5000 })
  expect(api.requests.some(({ method, path }) => method === 'GET' && path.endsWith(`/databases/${rootDatabase.id}/views/view-root-id/table`))).toBe(true)
})

test('table loads the next 25-record window without duplicating rows', async ({ page }) => {
  const records = Array.from({ length: 31 }, (_, index) => {
    const number = String(index + 1).padStart(3, '0')
    return record(`page-record-${number}`, rootDatabase.id, `page-${number}`, { 'root-title': `Record ${number}` })
  })
  const api = await installApi(page, [
    block('paginated-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], {
    databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)],
    properties: [rootProperties[0]!], records,
  })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  const rows = table.locator('tbody tr')
  await expect(rows).toHaveCount(25)
  await expect(rows.first()).toContainText('Record 001')
  await expect(rows.last()).toContainText('Record 025')
  await table.getByRole('button', { name: '加载更多' }).click()
  await expect(rows).toHaveCount(31)
  const titles = await rows.locator('td').allTextContents()
  expect(titles).toHaveLength(31)
  expect(new Set(titles).size).toBe(31)
  expect(titles[24]).toBe('Record 025')
  expect(titles[25]).toBe('Record 026')
  expect(titles[30]).toBe('Record 031')
  await expect(table.getByRole('button', { name: '加载更多' })).toHaveCount(0)
  expect(api.requests.filter(({ method, path }) => method === 'GET' && path.endsWith(`/databases/${rootDatabase.id}/views/view-root-id/table`))).toHaveLength(2)
})

test('failed load more keeps existing rows and retries the same cursor', async ({ page }) => {
  const records = Array.from({ length: 31 }, (_, index) => {
    const number = String(index + 1).padStart(3, '0')
    return record(`retry-record-${number}`, rootDatabase.id, `retry-page-${number}`, { 'root-title': `Retry ${number}` })
  })
  const api = await installApi(page, [
    block('retry-pagination-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], {
    databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)],
    properties: [rootProperties[0]!], records, failTableAppendLoads: 1,
  })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  const rows = table.locator('tbody tr')
  await expect(rows).toHaveCount(25)
  await table.getByRole('button', { name: '加载更多' }).click()
  await expect(table.getByRole('alert')).toContainText('Database temporarily unavailable')
  await expect(rows).toHaveCount(25)
  await table.getByRole('button', { name: '重试加载更多' }).click()
  await expect(rows).toHaveCount(31)
  const titles = await rows.locator('td').allTextContents()
  expect(new Set(titles).size).toBe(31)
  const appendRequests = api.requests.filter(({ method, path, search }) => method === 'GET' && path.endsWith(`/databases/${rootDatabase.id}/views/view-root-id/table`) && search?.includes('cursor='))
  expect(appendRequests).toHaveLength(2)
  expect(appendRequests[0]?.search).toBe(appendRequests[1]?.search)
})

test('linked mutation refresh during a pending page append leaves pagination usable', async ({ page }) => {
  const records = Array.from({ length: 31 }, (_, index) => {
    const number = String(index + 1).padStart(3, '0')
    return record(`race-record-${number}`, rootDatabase.id, `race-page-${number}`, { 'root-title': `Race ${number}`, 'root-checkbox': false })
  })
  const api = await installApi(page, [
    block('race-reference-one', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
    block('race-reference-two', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 200),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: [rootProperties[0]!, rootProperties[3]!], records, tableLoadDelayMs: 700 })
  await page.goto('/#/app/database-workspace/page/database-page')
  const tables = page.locator('.eotion-editor-content .eotion-database')
  await expect(tables.nth(0).locator('tbody tr')).toHaveCount(25)
  const appendStarted = page.waitForRequest((request) => request.url().includes('cursor='))
  await tables.nth(0).getByRole('button', { name: '加载更多' }).click()
  await appendStarted
  await tables.nth(1).locator('tbody tr').first().locator('td').nth(1).getByRole('button', { name: '未完成' }).click()
  await expect(tables.nth(0).locator('tbody tr')).toHaveCount(25)
  await expect(tables.nth(0).locator('tbody tr').first().getByRole('button', { name: '已完成' })).toBeVisible()
  const loadMore = tables.nth(0).getByRole('button', { name: '加载更多' })
  await expect(loadMore).toBeEnabled()
  await loadMore.click()
  await expect(tables.nth(0).locator('tbody tr')).toHaveCount(31)
  await tables.nth(1).getByRole('button', { name: '加载更多' }).click()
  await expect(tables.nth(1).locator('tbody tr')).toHaveCount(31)
  await tables.nth(1).locator('tbody tr').nth(1).locator('td').nth(1).getByRole('button', { name: '未完成' }).click()
  await expect(tables.nth(0).locator('tbody tr')).toHaveCount(31)
  await expect(tables.nth(1).locator('tbody tr')).toHaveCount(31)
  await expect(tables.nth(0).locator('tbody tr').nth(1).getByRole('button', { name: '已完成' })).toBeVisible()
  expect(api.records[0]?.properties['root-checkbox']).toBe(true)
})

test('failed database creation leaves no partial reference and can be retried', async ({ page }) => {
  const api = await installApi(page, [], { failDatabaseCreates: 1 })
  await page.goto('/#/app/database-workspace/page/database-page')
  await startDatabaseSlash(page)
  await page.getByRole('button', { name: '创建新数据库' }).click()
  await page.getByRole('textbox', { name: '数据库名称' }).fill('Retry board')
  await page.getByRole('button', { name: '创建数据库', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Database transaction rejected')
  expect(api.databases).toHaveLength(0)
  expect(api.blocks.some((item) => item.type === 'database')).toBe(false)
  expect(api.properties).toHaveLength(0)
  expect(api.views).toHaveLength(0)
  expect(api.records).toHaveLength(0)
  await startDatabaseSlash(page)
  await page.getByRole('button', { name: '创建新数据库' }).click()
  await page.getByRole('textbox', { name: '数据库名称' }).fill('Retry board')
  await page.getByRole('button', { name: '创建数据库', exact: true }).click()
  await expect(page.locator('.eotion-editor-content .tiptap .eotion-database')).toContainText('Retry board')
  expect(api.databases).toHaveLength(1)
  expect(api.blocks.filter((item) => item.type === 'database')).toHaveLength(1)
})

test('database loading error retries and offline state preserves the page body', async ({ page, context }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const api = await installApi(page, [
    block('offline-body', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: '正文离线可见' }] }, 100),
    block('error-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 200),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: rootProperties, records: [basicRecord], failTableLoads: 1 })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .tiptap .eotion-database')
  await expect(table.getByRole('alert')).toContainText('Database temporarily unavailable')
  await screenshot(page, 'product-database-error')
  await expect(page.locator('.eotion-editor-content .tiptap')).toContainText('正文离线可见')
  await installLocalBlockReader(page)
  await context.setOffline(true)
  api.offline = true
  await table.getByRole('button', { name: '重试加载' }).click()
  await expect(table.getByRole('alert')).toContainText('离线时无法读取数据库')
  await expect(page.locator('.eotion-editor-content .tiptap')).toContainText('正文离线可见')
  const editor = page.locator('.eotion-editor-content .tiptap')
  await editor.locator('p').first().click()
  await page.keyboard.press('End')
  await page.keyboard.type('，离线修改已保存')
  await expect.poll(() => readLocalBlocks(page, pageRecord.id)).toContain('离线修改已保存')
  expect(JSON.stringify(api.blocks.find((item) => item.id === 'offline-body')?.props)).not.toContain('离线修改已保存')
  expect(api.blocks.some((item) => item.id === 'offline-body')).toBe(true)
  expect(api.blocks.find((item) => item.id === 'error-database')?.props.node).toEqual({
    type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' },
  })
  await context.setOffline(false)
  expect(errors).toEqual([])
})

test('database table scrolls horizontally on mobile without document overflow', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  const api = await installApi(page, [
    block('mobile-before', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'Mobile page' }] }, 100),
    block('mobile-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: 'mobile-database-id', viewId: 'mobile-view-id' } }, 200),
  ], {
    databases: [database('mobile-database-id', 'Mobile data')],
    views: [view('mobile-view-id', 'mobile-database-id')],
    properties: [
      property('mobile-title', 'mobile-database-id', 'Name', 'title'),
      property('mobile-text', 'mobile-database-id', 'Description', 'text'),
      property('mobile-number', 'mobile-database-id', 'Estimate', 'number'),
      property('mobile-check', 'mobile-database-id', 'Done', 'checkbox'),
      property('mobile-select', 'mobile-database-id', 'Status', 'select', [{ id: 'mobile-open', name: 'Open' }]),
      property('mobile-date', 'mobile-database-id', 'Due date', 'date'),
    ],
    records: [record('mobile-record', 'mobile-database-id', 'mobile-row-page', {
      'mobile-title': 'Mobile row', 'mobile-text': 'Long enough for scrolling', 'mobile-number': 21,
      'mobile-check': false, 'mobile-select': 'mobile-open', 'mobile-date': '2026-10-08',
    })],
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  await expect(table).toBeVisible()
  await expect(table).toContainText('Mobile row')
  await table.getByRole('button', { name: 'Long enough for scrolling' }).click()
  await expect(table.getByRole('textbox', { name: 'Description 值' })).toBeFocused()
  await screenshot(page, 'p83-mobile-text-active-editor')
  await page.keyboard.press('Escape')
  const widths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
    editor: document.querySelector('.eotion-editor-content')?.scrollWidth ?? 0,
    editorClient: document.querySelector('.eotion-editor-content')?.clientWidth ?? 0,
    table: document.querySelector('[data-testid="database-table-scroll"]')?.scrollWidth ?? 0,
    tableClient: document.querySelector('[data-testid="database-table-scroll"]')?.clientWidth ?? 0,
  }))
  expect(widths.document).toBeLessThanOrEqual(widths.viewport)
  expect(widths.editor).toBeLessThanOrEqual(widths.editorClient)
  expect(widths.table).toBeGreaterThan(widths.tableClient)
  const horizontalScroll = await page.locator('[data-testid="database-table-scroll"]').evaluate((element) => {
    return (element as HTMLElement).scrollLeft
  })
  await screenshot(page, 'product-database-mobile-initial-390x844')
  const horizontalScrollAfter = await page.locator('[data-testid="database-table-scroll"]').evaluate((element) => {
    const scrollContainer = element as HTMLElement
    scrollContainer.scrollLeft = scrollContainer.scrollWidth
    return scrollContainer.scrollLeft
  })
  expect(horizontalScroll).toBe(0)
  expect(horizontalScrollAfter).toBeGreaterThan(0)
  const description = table.getByRole('button', { name: 'Long enough for scrolling' })
  await description.click()
  const mobileText = table.getByRole('textbox', { name: 'Description 值' })
  await expect(mobileText).toBeFocused()
  await mobileText.fill('Saved on mobile')
  await mobileText.press('Enter')
  await expect(table).toContainText('Saved on mobile')
  await table.getByRole('button', { name: '2026-10-08' }).click()
  const mobileDate = table.getByRole('textbox', { name: 'Due date 值' })
  await mobileDate.fill('2026-12-15')
  await mobileDate.press('Enter')
  await expect(table.getByRole('button', { name: '2026-12-15' })).toBeVisible()
  expect(api.records[0]?.properties['mobile-text']).toBe('Saved on mobile')
  expect(api.records[0]?.properties['mobile-date']).toBe('2026-12-15')
  await table.getByRole('button', { name: 'Open' }).click()
  await screenshot(page, 'p83-mobile-select-popover')
  await page.keyboard.press('Escape')
  await screenshot(page, 'p83-mobile-390-saved-cells')
  expect(errors).toEqual([])
  await screenshot(page, 'product-database-mobile-390x844')
})

test('advanced properties configure relation and formula, keep linked views in sync, and retry picker reads', async ({ page }) => {
  test.setTimeout(60_000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const another = record('related-record', rootDatabase.id, 'related-page', { 'root-title': 'Related plan', 'root-number': 7 })
  const api = await installApi(page, [
    block('advanced-main', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
    block('advanced-linked', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 200),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: rootProperties, records: [basicRecord, another], failRelationCandidates: 1 })
  api.pages.push({ ...pageRecord, id: basicRecord.pageId, title: 'Launch plan' }, { ...pageRecord, id: another.pageId, title: 'Related plan' })
  await page.goto('/#/app/database-workspace/page/database-page')
  const tables = page.locator('.eotion-editor-content .eotion-database')
  const table = tables.first()
  const config = await openAdvancedPropertyCreator(page, table, '关联')
  await expect(config.getByLabel('目标数据库')).toHaveValue(rootDatabase.id)
  await config.getByRole('button', { name: '保存属性' }).click()
  await expect(tables.nth(1).getByRole('button', { name: '编辑关联 关联' }).first()).toBeVisible()
  await table.locator('tbody tr').filter({ hasText: 'Launch plan' }).getByRole('button', { name: '编辑关联 关联' }).click()
  const picker = page.getByRole('group', { name: '关联记录：关联' })
  await expect(picker.getByRole('alert')).toContainText('Options unavailable')
  await picker.getByRole('button', { name: '重试' }).click()
  await picker.getByRole('button', { name: 'Related plan' }).click()
  await expect(table.locator('tbody tr').filter({ hasText: 'Launch plan' })).toContainText('Related plan')
  await expect(tables.nth(1).locator('tbody tr').filter({ hasText: 'Launch plan' })).toContainText('Related plan')
  const relation = api.properties.find(item => item.type === 'relation')!
  expect(api.records.find(item => item.id === basicRecord.id)?.properties[relation.id]).toEqual(['related-record'])
  await page.keyboard.press('Escape')
  await expect(picker).toHaveCount(0)
  await page.reload()
  await expect(table.locator('tbody tr').filter({ hasText: 'Launch plan' })).toContainText('Related plan')
  await table.locator('tbody tr').filter({ hasText: 'Launch plan' }).getByRole('button', { name: '编辑关联 关联' }).click()
  const removalPicker = page.getByRole('group', { name: '关联记录：关联' })
  await removalPicker.getByRole('button', { name: '移除关联 Related plan' }).click()
  await expect.poll(() => api.records.find(item => item.id === basicRecord.id)?.properties[relation.id]).toEqual([])
  await page.keyboard.press('Escape')
  await expect(removalPicker).toHaveCount(0)
  const formula = await openAdvancedPropertyCreator(page, table, '公式')
  await formula.getByLabel('表达式').fill('{bad json')
  await formula.getByRole('button', { name: '保存属性' }).click()
  await expect(formula.getByRole('alert')).toContainText('有效名称和配置')
  expect(api.properties.filter(item => item.type === 'formula')).toHaveLength(0)
  await formula.getByRole('button', { name: '数字相加模板' }).click()
  await formula.getByLabel('结果类型').selectOption('number')
  await screenshot(page, 'p85-formula-config-desktop')
  await formula.getByRole('button', { name: '保存属性' }).click()
  await expect(table.getByRole('button', { name: '公式', exact: true })).toBeVisible()
  const formulaProperty = api.properties.find(item => item.type === 'formula')!
  expect(formulaProperty).toBeDefined()
  const rollup = await openAdvancedPropertyCreator(page, table, '汇总')
  await rollup.getByLabel('关联属性').selectOption(relation.id)
  await rollup.getByLabel('目标属性').selectOption('root-number')
  await rollup.getByLabel('汇总方式').selectOption('sum')
  await rollup.getByRole('button', { name: '保存属性' }).click()
  const rollupProperty = api.properties.find(item => item.type === 'rollup')!
  expect(rollupProperty.config).toEqual({ relationPropertyId: relation.id, targetPropertyId: 'root-number', aggregation: 'sum' })
  api.records.find(item => item.id === basicRecord.id)!.properties[formulaProperty.id] = 43
  api.records.find(item => item.id === basicRecord.id)!.properties[rollupProperty.id] = 7
  await page.reload()
  const row = table.locator('tbody tr').filter({ hasText: 'Launch plan' })
  await expect(row).toContainText('43')
  await expect(row).toContainText('7')
  await expect(row.getByRole('button', { name: '编辑公式：43' })).toHaveCount(0)
  await expect(row.getByRole('button', { name: '编辑汇总：7' })).toHaveCount(0)
  expect(errors).toEqual([])
  await tables.first().getByTestId('database-table-scroll').evaluate(element => { (element as HTMLElement).scrollLeft = (element as HTMLElement).scrollWidth })
  await screenshot(page, 'p85-advanced-properties-desktop')
  await tables.nth(1).getByTestId('database-table-scroll').evaluate(element => { (element as HTMLElement).scrollLeft = (element as HTMLElement).scrollWidth })
  await screenshot(page, 'p85-advanced-linked-desktop')
})

test('mobile relation picker searches paged results and stays read-only offline', async ({ page, context }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const relationProperty: TestProperty = { ...property('mobile-relation', rootDatabase.id, 'Linked', 'relation'), config: { targetDatabaseId: rootDatabase.id } }
  const related = Array.from({ length: 27 }, (_, index) => record(`related-${String(index).padStart(2, '0')}`, rootDatabase.id, `related-page-${index}`, { 'root-title': `Item ${index}` }))
  const special = record('constructor', rootDatabase.id, 'special-page', { 'root-title': 'Special item' })
  const api = await installApi(page, [block('mobile-advanced', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100)], {
    databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: [...rootProperties, relationProperty],
    records: [{ ...basicRecord, id: 'a-mobile-source', properties: { ...basicRecord.properties, 'mobile-relation': ['constructor', 'related-26'] } }, ...related, special],
  })
  for (let index = 0; index < related.length; index += 1) api.pages.push({ ...pageRecord, id: `related-page-${index}`, title: `Item ${index}` })
  api.pages.push({ ...pageRecord, id: special.pageId, title: 'Special item' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  const row = table.locator('tbody tr').filter({ hasText: 'Launch plan' })
  await expect(row).toContainText('Item 26')
  await expect(row).toContainText('Special item')
  await row.getByRole('button', { name: '编辑关联 Linked' }).click()
  const picker = page.getByRole('group', { name: '关联记录：Linked' })
  await expect(picker.getByRole('button', { name: '加载更多' })).toBeVisible()
  await picker.getByRole('button', { name: '加载更多' }).click()
  await expect(picker.getByRole('button', { name: 'Item 25' })).toBeVisible()
  await picker.getByLabel('搜索记录').fill('Item 25')
  await picker.getByRole('button', { name: '搜索' }).click()
  await expect(picker.getByRole('button', { name: 'Item 25' })).toBeVisible()
  await screenshot(page, 'p85-mobile-relation-picker-390x844')
  const width = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  expect(width[0]).toBeLessThanOrEqual(width[1]!)
  await picker.getByRole('button', { name: '完成' }).click()
  await openAdvancedPropertyCreator(page, table, '公式')
  await screenshot(page, 'p85-mobile-formula-config-390x844')
  await page.getByRole('group', { name: '配置公式属性' }).getByRole('button', { name: '保存属性' }).scrollIntoViewIfNeeded()
  await screenshot(page, 'p85-mobile-formula-save-390x844')
  await context.setOffline(true)
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  await expect(page.getByRole('group', { name: '配置公式属性' }).getByRole('button', { name: '保存属性' })).toBeDisabled()
  await expect(row.getByRole('button', { name: '编辑关联 Linked' })).toBeDisabled()
  expect(errors).toEqual([])
})

test('linked target edits refresh source rollup and formula, and self relation titles follow page rename', async ({ page }) => {
  const bTitle = property('b-title', nestedDatabase.id, 'Name', 'title')
  const bNumber = property('b-number', nestedDatabase.id, 'Amount', 'number')
  const relation = { ...property('a-relation', rootDatabase.id, 'Related', 'relation'), config: { targetDatabaseId: nestedDatabase.id } } as TestProperty
  const rollup = { ...property('a-rollup', rootDatabase.id, 'Total', 'rollup'), config: { relationPropertyId: relation.id, targetPropertyId: bNumber.id, aggregation: 'sum' } } as TestProperty
  const formula = { ...property('a-formula', rootDatabase.id, 'Plus one', 'formula'), config: { expression: { kind: 'binary', operator: '+', left: { kind: 'property', propertyId: rollup.id }, right: { kind: 'literal', value: 1 } }, resultType: 'number' } } as TestProperty
  const selfRelation = { ...property('a-self', rootDatabase.id, 'Peer', 'relation'), config: { targetDatabaseId: rootDatabase.id } } as TestProperty
  const source = record('a-source', rootDatabase.id, 'a-page', { 'root-title': 'Source', 'a-relation': ['b-record'], 'a-rollup': 5, 'a-formula': 6, 'a-self': ['a-peer'] })
  const peer = record('a-peer', rootDatabase.id, 'peer-page', { 'root-title': 'Peer original' })
  const target = record('b-record', nestedDatabase.id, 'b-page', { 'b-title': 'Target', 'b-number': 5 })
  const api = await installApi(page, [
    block('source-db-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
    block('target-db-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: nestedDatabase.id, viewId: 'view-target-id' } }, 200),
  ], { databases: [rootDatabase, nestedDatabase], views: [view('view-root-id', rootDatabase.id), view('view-target-id', nestedDatabase.id)], properties: [...rootProperties, relation, rollup, formula, selfRelation, bTitle, bNumber], records: [source, peer, target] })
  api.pages.push({ ...pageRecord, id: source.pageId, title: 'Source' }, { ...pageRecord, id: peer.pageId, title: 'Peer original' }, { ...pageRecord, id: target.pageId, title: 'Target' })
  await page.goto('/#/app/database-workspace/page/database-page')
  const tables = page.locator('.eotion-editor-content .eotion-database')
  const sourceRow = tables.first().locator('tbody tr').filter({ hasText: 'Source' })
  await expect(sourceRow).toContainText('Peer original')
  await expect(sourceRow).toContainText('5')
  await tables.nth(1).getByRole('button', { name: '5' }).click()
  const input = tables.nth(1).getByRole('textbox', { name: 'Amount 值' })
  await input.fill('9')
  await input.press('Enter')
  await expect(sourceRow.locator('td').filter({ hasText: '9' })).toHaveCount(1)
  await expect(sourceRow.locator('td').filter({ hasText: '10' })).toHaveCount(1)
  const peerRow = tables.first().locator('tbody tr').filter({ hasText: 'Peer original' })
  await peerRow.getByRole('button', { name: '编辑名称：Peer original' }).click()
  const titleInput = tables.first().getByRole('textbox', { name: '名称 值' })
  await titleInput.fill('Peer renamed')
  await titleInput.press('Enter')
  await expect(sourceRow).toContainText('Peer renamed')
})

test('existing cross-database rollup allows a new formula and a second target rollup', async ({ page }) => {
  const third = database('database-third-id', 'Third projects')
  const bTitle = property('b-title', nestedDatabase.id, 'Name', 'title')
  const bNumber = property('b-number', nestedDatabase.id, 'Amount', 'number')
  const cTitle = property('c-title', third.id, 'Name', 'title')
  const cNumber = property('c-number', third.id, 'Value', 'number')
  const bRelation = { ...property('a-b-relation', rootDatabase.id, 'B relation', 'relation'), config: { targetDatabaseId: nestedDatabase.id } } as TestProperty
  const bRollup = { ...property('a-b-rollup', rootDatabase.id, 'B total', 'rollup'), config: { relationPropertyId: bRelation.id, targetPropertyId: bNumber.id, aggregation: 'sum' } } as TestProperty
  const api = await installApi(page, [block('multi-target-db-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100)], {
    databases: [rootDatabase, nestedDatabase, third],
    views: [view('view-root-id', rootDatabase.id), view('view-b-id', nestedDatabase.id), view('view-c-id', third.id)],
    properties: [...rootProperties, bRelation, bRollup, bTitle, bNumber, cTitle, cNumber], records: [basicRecord],
  })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  const formula = await openAdvancedPropertyCreator(page, table, '公式')
  await formula.getByRole('button', { name: '数字相加模板' }).click()
  await formula.getByLabel('结果类型').selectOption('number')
  await formula.getByRole('button', { name: '保存属性' }).click()
  await expect(table.getByRole('button', { name: '公式', exact: true })).toBeVisible()
  const relationPanel = await openAdvancedPropertyCreator(page, table, '关联')
  await relationPanel.getByLabel('目标数据库').selectOption(third.id)
  await relationPanel.getByRole('button', { name: '保存属性' }).click()
  await expect(relationPanel).toHaveCount(0)
  const cRelation = api.properties.find(item => item.type === 'relation' && (item.config as { targetDatabaseId: string }).targetDatabaseId === third.id)!
  const rollup = await openAdvancedPropertyCreator(page, table, '汇总')
  await rollup.getByLabel('关联属性').selectOption(cRelation.id)
  await rollup.getByLabel('目标属性').selectOption(cNumber.id)
  await rollup.getByLabel('汇总方式').selectOption('sum')
  await rollup.getByRole('button', { name: '保存属性' }).click()
  await expect(rollup).toHaveCount(0)
  expect(api.properties.filter(item => item.type === 'rollup')).toHaveLength(2)
})
