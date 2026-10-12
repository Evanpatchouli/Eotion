import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Locator, type Page, type Route } from '@playwright/test'
import type { AuthUserDto, BlockResponse, PageResponse, WorkspaceResponse } from '@eotion/contracts'
import { convertDatabasePropertyValueForTypeChange, DEFAULT_DATABASE_VIEW_CONFIG, type DatabaseFilter, type DatabaseViewConfig, type DatabasePropertyConfig } from '@eotion/domain/database'

const now = '2026-09-30T00:00:00.000Z'
const later = '2027-09-30T00:00:00.000Z'
const user: AuthUserDto = { id: 'database-user', email: 'database@example.com', displayName: 'Database user', createdAt: now, updatedAt: now }
const workspace: WorkspaceResponse = { id: 'database-workspace', name: 'Database workspace', ownerId: user.id, createdAt: now, updatedAt: now }
const pageRecord: PageResponse = { id: 'database-page', workspaceId: workspace.id, parentPageId: null, title: 'Database references', orderKey: '0000000000000001', createdAt: now, updatedAt: now }

type TestDatabase = { id: string; workspaceId: string; name: string; version: number; createdAt: string; updatedAt: string }
type TestProperty = { id: string; databaseId: string; workspaceId: string; name: string; type: 'title' | 'text' | 'number' | 'checkbox' | 'select' | 'date' | 'relation' | 'rollup' | 'formula'; version: number; createdAt: string; updatedAt: string; options?: Array<{ id: string; name: string }>; config?: DatabasePropertyConfig }
type TestView = { id: string; databaseId: string; workspaceId: string; name: string; type: 'table' | 'list' | 'board'; config: DatabaseViewConfig; version: number; createdAt: string; updatedAt: string }
type TestRecord = { id: string; databaseId: string; workspaceId: string; pageId: string; properties: Record<string, string | number | boolean | null | string[]>; version: number; pageVersion: string; createdAt: string; updatedAt: string }

function database(id: string, name = 'Projects'): TestDatabase { return { id, workspaceId: workspace.id, name, version: 1, createdAt: now, updatedAt: now } }
function property(id: string, databaseId: string, name: string, type: TestProperty['type'], options?: TestProperty['options']): TestProperty {
  return { id, databaseId, workspaceId: workspace.id, name, type, version: 1, createdAt: now, updatedAt: now, ...(options ? { options } : {}) }
}
function view(id: string, databaseId: string, name = 'Table', config: DatabaseViewConfig = { ...DEFAULT_DATABASE_VIEW_CONFIG }, type: TestView['type'] = 'table'): TestView { return { id, databaseId, workspaceId: workspace.id, name, type, config: structuredClone(config), version: 1, createdAt: now, updatedAt: now } }
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
  failPropertyUpdates: number
  failPropertyDeletes: number
  failPropertyTypeChanges: number
  conflictPropertyTypeChanges: number
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

async function installApi(page: Page, seed: BlockResponse[], options: Partial<Pick<DatabaseApi, 'databases' | 'views' | 'properties' | 'records' | 'failTableLoads' | 'failTableAppendLoads' | 'tableLoadDelayMs' | 'failDatabaseCreates' | 'abortDatabaseCreatesAfterCommit' | 'failDatabaseReferenceReads' | 'abortRecordCreatesAfterCommit' | 'failCellUpdates' | 'conflictCellUpdates' | 'failViewUpdates' | 'failPropertyUpdates' | 'failPropertyDeletes' | 'failPropertyTypeChanges' | 'conflictPropertyTypeChanges' | 'abortViewCreatesAfterCommit' | 'abortViewDeletesAfterCommit' | 'failRecordPageReads' | 'failSnapshots' | 'failSnapshotAfterRecordCreate' | 'holdRecordCreateResponse' | 'holdDatabaseCreateResponse' | 'offline' | 'failRelationCandidates'>> = {}) {
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
    failPropertyUpdates: options.failPropertyUpdates ?? 0,
    failPropertyDeletes: options.failPropertyDeletes ?? 0,
    failPropertyTypeChanges: options.failPropertyTypeChanges ?? 0,
    conflictPropertyTypeChanges: options.conflictPropertyTypeChanges ?? 0,
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
      const input = payload as { id: string; name: string; type: 'table' | 'list'; config?: DatabaseViewConfig; expectedDatabaseVersion: number }
      if (!databaseItem) return json(route, 404, { statusCode: 404, message: 'Database not found' })
      if (input.expectedDatabaseVersion !== databaseItem.version) return json(route, 409, { statusCode: 409, message: 'Database version conflict' })
      const created = view(input.id, databaseItem.id, input.name, input.config, input.type)
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
      if (api.failPropertyUpdates > 0) { api.failPropertyUpdates -= 1; return json(route, 503, { statusCode: 503, message: 'Property update rejected' }) }
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
    const propertyTypePath = new RegExp(`^/api/workspaces/${workspace.id}/databases/([^/]+)/properties/([^/]+)/type$`, 'u').exec(pathname)
    if (propertyTypePath && request.method() === 'PATCH') {
      if (api.failPropertyTypeChanges > 0) { api.failPropertyTypeChanges -= 1; return json(route, 503, { statusCode: 503, message: 'Property type change rejected' }) }
      const databaseItem = api.databases.find(item => item.id === propertyTypePath[1])
      const propertyItem = api.properties.find(item => item.id === propertyTypePath[2] && item.databaseId === propertyTypePath[1])
      if (!databaseItem || !propertyItem) return json(route, 404, { statusCode: 404, message: 'Database property not found' })
      const input = payload as { targetType: TestProperty['type']; config?: DatabasePropertyConfig; expectedDatabaseVersion: number; expectedPropertyVersion: number }
      if (api.conflictPropertyTypeChanges > 0) {
        api.conflictPropertyTypeChanges -= 1
        propertyItem.version += 1
        databaseItem.version += 1
        return json(route, 409, { statusCode: 409, message: 'Database or property version is stale' })
      }
      if (input.expectedDatabaseVersion !== databaseItem.version || input.expectedPropertyVersion !== propertyItem.version) return json(route, 409, { statusCode: 409, message: 'Database or property version is stale' })
      let convertedRecordCount = 0
      let clearedRecordCount = 0
      for (const item of api.records.filter(item => item.databaseId === databaseItem.id)) {
        if (Object.hasOwn(item.properties, propertyItem.id)) {
          const conversion = convertDatabasePropertyValueForTypeChange(propertyItem.type, input.targetType, item.properties[propertyItem.id]!)
          if (conversion.action === 'keep') {
            item.properties[propertyItem.id] = conversion.value
            convertedRecordCount += 1
          } else {
            delete item.properties[propertyItem.id]
            clearedRecordCount += 1
          }
        }
        item.version += 1
      }
      let repairedViewCount = 0
      for (const item of api.views.filter(item => item.databaseId === databaseItem.id)) {
        const nextConfig = {
          ...item.config,
          filters: item.config.filters.filter(filter => filter.propertyId !== propertyItem.id),
          sorts: ['relation', 'rollup', 'formula'].includes(input.targetType) ? item.config.sorts.filter(sort => sort.propertyId !== propertyItem.id) : item.config.sorts,
        }
        if (nextConfig.filters.length !== item.config.filters.length || nextConfig.sorts.length !== item.config.sorts.length) {
          item.config = nextConfig
          item.version += 1
          repairedViewCount += 1
        }
      }
      propertyItem.type = input.targetType
      propertyItem.options = input.targetType === 'select' ? [] : undefined
      propertyItem.config = input.config
      propertyItem.version += 1
      databaseItem.version += 1
      return json(route, 200, { database: databaseItem, property: propertyItem, convertedRecordCount, clearedRecordCount, repairedViewCount })
    }
    if (propertyPath && request.method() === 'DELETE') {
      if (api.failPropertyDeletes > 0) { api.failPropertyDeletes -= 1; return json(route, 503, { statusCode: 503, message: 'Property delete rejected' }) }
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

async function beginPropertyRename(page: Page, scope: Locator, propertyName: string): Promise<Locator> {
  await scope.getByRole('button', { name: `属性设置 ${propertyName}` }).click()
  await page.getByRole('menu', { name: `属性设置: ${propertyName}` }).getByRole('menuitem', { name: '重命名' }).click()
  return scope.getByRole('textbox', { name: `属性名称 ${propertyName}` })
}

async function beginPropertyTypeChange(page: Page, scope: Locator, propertyName: string, targetType: string): Promise<Locator> {
  await scope.getByRole('button', { name: `属性设置 ${propertyName}` }).click()
  await page.getByRole('menu', { name: `属性设置: ${propertyName}` }).getByRole('menuitem', { name: '变更类型' }).click()
  await page.getByRole('group', { name: '更改属性类型' }).getByRole('menuitem', { name: targetType, exact: true }).click()
  return page.getByRole('dialog', { name: '变更属性类型？' })
}

async function beginAdvancedPropertyTypeChange(page: Page, scope: Locator, propertyName: string, targetType: '关联' | '汇总' | '公式') {
  await scope.getByRole('button', { name: `属性设置 ${propertyName}` }).click()
  await page.getByRole('menu', { name: `属性设置: ${propertyName}` }).getByRole('menuitem', { name: '变更类型' }).click()
  await page.getByRole('group', { name: '更改属性类型' }).getByRole('menuitem', { name: targetType, exact: true }).click()
  return page.getByRole('group', { name: `配置${targetType}属性` })
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
    // The phone surface enters as a bottom drawer; measure only once its enter transform has settled.
    if (width < 768) await expect(page.locator('dialog.eotion-product-overlay--bottom-drawer[open]')).toHaveCSS('transform', 'none')
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
  const visibleIconControls = propertiesPanel.locator('.eotion-database-property-row .settings-icon-button, .eotion-database-property-grip').filter({ visible: true })
  for (const control of await visibleIconControls.all()) {
    await expect(control.locator('svg')).toHaveCount(1)
    await expectButtonIconCentered(control)
    expect((await control.textContent())?.trim()).toBe('')
  }
  // Select and advanced properties open their editor from a text type label inside the row.
  // It must stay a real, vertically centred text button rather than a glyph-only icon.
  const configLabels = propertiesPanel.locator('.database-property-config-label').filter({ visible: true })
  expect(await configLabels.count()).toBeGreaterThan(0)
  for (const label of await configLabels.all()) {
    expect(['选择', '关联', '汇总', '公式']).toContain((await label.textContent())?.trim())
    const offset = await label.evaluate(element => {
      const row = element.closest('.eotion-database-property-row')!.getBoundingClientRect()
      const self = element.getBoundingClientRect()
      return Math.abs(self.y + self.height / 2 - (row.y + row.height / 2))
    })
    expect(offset).toBeLessThanOrEqual(2)
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

test('basic property type changes convert stored values and repair filters while retaining compatible sorts', async ({ page }) => {
  const conversionProperty = property('conversion-number-text', rootDatabase.id, 'Convertible points', 'text')
  const numberProperty = property('conversion-number', rootDatabase.id, 'Convertible count', 'number')
  const dateProperty = property('conversion-date', rootDatabase.id, 'Convertible date', 'date')
  const checkboxProperty = property('conversion-checkbox', rootDatabase.id, 'Convertible checkbox', 'text')
  const selectProperty = property('conversion-select', rootDatabase.id, 'Convertible select', 'text')
  const dateClearProperty = property('conversion-date-clear', rootDatabase.id, 'Convertible due', 'text')
  const secondRecord = record('conversion-second-record', rootDatabase.id, 'conversion-second-page', {
    ...basicRecord.properties,
    'conversion-number-text': 'not a number',
    'conversion-number': 8,
    'conversion-date': '2026-10-10',
    'conversion-checkbox': 'yes',
    'conversion-select': 'open',
    'conversion-date-clear': '2026-10-10',
  })
  const firstRecord = {
    ...basicRecord,
    properties: {
      ...basicRecord.properties,
      'conversion-number-text': ' 12.5 ',
      'conversion-number': 42,
      'conversion-date': '2026-10-04',
      'conversion-checkbox': 'true',
      'conversion-select': 'status-open',
      'conversion-date-clear': 'today',
    },
  }
  const filteredView = view('view-root-id', rootDatabase.id, 'Table', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    filters: [{ propertyId: conversionProperty.id, operator: 'contains', value: '12' }],
    sorts: [{ propertyId: conversionProperty.id, direction: 'asc' }],
  })
  const api = await installApi(page, [
    block('property-conversion', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], {
    databases: [rootDatabase], views: [filteredView],
    properties: [...rootProperties, conversionProperty, numberProperty, dateProperty, checkboxProperty, selectProperty, dateClearProperty],
    records: [firstRecord, secondRecord],
  })
  api.pages.push(
    { ...pageRecord, id: firstRecord.pageId, title: 'Launch plan', role: 'database-record' },
    { ...pageRecord, id: secondRecord.pageId, title: 'Second plan', role: 'database-record' },
  )
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  await expect(table.locator('tbody tr')).toHaveCount(1)

  const firstTypeDialog = await beginPropertyTypeChange(page, table, conversionProperty.name, '数字')
  await expect(firstTypeDialog).toBeVisible()
  await expect(firstTypeDialog).toContainText('可转换的数字文本会保留')
  await expect(firstTypeDialog).toContainText('现有筛选条件会被移除')
  const requestCountBeforeConfirm = api.requests.filter(({ method, path }) => method === 'PATCH' && path.endsWith(`/properties/${conversionProperty.id}/type`)).length
  expect(requestCountBeforeConfirm).toBe(0)
  await firstTypeDialog.getByRole('button', { name: '变更类型', exact: true }).click()
  await expect.poll(() => api.properties.find(item => item.id === conversionProperty.id)?.type).toBe('number')
  await expect.poll(() => api.records.find(item => item.id === firstRecord.id)?.properties[conversionProperty.id]).toBe(12.5)
  expect(api.records.find(item => item.id === secondRecord.id)?.properties[conversionProperty.id]).toBeUndefined()
  expect(api.views[0]?.config.filters).toEqual([])
  expect(api.views[0]?.config.sorts).toEqual([{ propertyId: conversionProperty.id, direction: 'asc' }])
  await expect(table.locator('tbody tr')).toHaveCount(2)
  const convertedNumber = table.getByRole('button', { name: '12.5', exact: true })
  await convertedNumber.click()
  const convertedNumberEditor = table.getByRole('textbox', { name: 'Convertible points 值' })
  await expect(convertedNumberEditor).toBeFocused()
  await expect(convertedNumberEditor).toHaveAttribute('inputmode', 'decimal')
  await page.keyboard.press('Escape')

  const numberDialog = await beginPropertyTypeChange(page, table, numberProperty.name, '文本')
  await numberDialog.getByRole('button', { name: '变更类型', exact: true }).click()
  await expect.poll(() => api.properties.find(item => item.id === numberProperty.id)?.type).toBe('text')
  expect(api.records.find(item => item.id === firstRecord.id)?.properties[numberProperty.id]).toBe('42')
  expect(api.records.find(item => item.id === secondRecord.id)?.properties[numberProperty.id]).toBe('8')

  const dateDialog = await beginPropertyTypeChange(page, table, dateProperty.name, '文本')
  await dateDialog.getByRole('button', { name: '变更类型', exact: true }).click()
  await expect.poll(() => api.properties.find(item => item.id === dateProperty.id)?.type).toBe('text')
  expect(api.records.find(item => item.id === firstRecord.id)?.properties[dateProperty.id]).toBe('2026-10-04')
  expect(api.records.find(item => item.id === secondRecord.id)?.properties[dateProperty.id]).toBe('2026-10-10')

  for (const [item, targetType, label] of [
    [checkboxProperty, 'checkbox', '复选框'], [selectProperty, 'select', '选择'], [dateClearProperty, 'date', '日期'],
  ] as const) {
    const dialog = await beginPropertyTypeChange(page, table, item.name, label)
    await dialog.getByRole('button', { name: '变更类型', exact: true }).click()
    await expect.poll(() => api.properties.find(propertyItem => propertyItem.id === item.id)?.type).toBe(targetType)
    expect(api.records.find(recordItem => recordItem.id === firstRecord.id)?.properties[item.id]).toBeUndefined()
    expect(api.records.find(recordItem => recordItem.id === secondRecord.id)?.properties[item.id]).toBeUndefined()
  }
  for (const item of [conversionProperty, numberProperty, dateProperty, checkboxProperty, selectProperty, dateClearProperty]) {
    expect(api.properties.find(propertyItem => propertyItem.id === item.id)?.id).toBe(item.id)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await openDatabaseSetting(page, table, '属性')
  const settingsPanel = page.getByRole('group', { name: '属性管理' })
  await settingsPanel.getByRole('button', { name: '属性设置 Notes' }).click()
  await page.getByRole('menu', { name: '属性设置: Notes' }).getByRole('menuitem', { name: '变更类型' }).click()
  await page.getByRole('group', { name: '更改属性类型' }).getByRole('menuitem', { name: '数字' }).click()
  const settingsTypeDialog = page.getByRole('dialog', { name: '变更属性类型？' })
  await expect(settingsTypeDialog).toBeVisible()
  const settingsDialogBounds = await settingsTypeDialog.boundingBox()
  expect(settingsDialogBounds).not.toBeNull()
  expect(settingsDialogBounds!.x).toBeGreaterThanOrEqual(0)
  expect(settingsDialogBounds!.x + settingsDialogBounds!.width).toBeLessThanOrEqual(390)
  await settingsTypeDialog.getByRole('button', { name: '变更类型', exact: true }).click()
  await expect(settingsTypeDialog).toHaveCount(0)
  await expect(settingsPanel.locator('.eotion-database-property-row').filter({ hasText: 'Notes' })).toContainText('数字')
  expect(api.properties.find(item => item.id === 'root-text')?.type).toBe('number')
  expect(api.requests.filter(({ method, path }) => method === 'PATCH' && path.includes('/properties/') && path.endsWith('/type'))).toHaveLength(7)
})

test('advanced type changes configure before confirmation and preserve property identity', async ({ page }) => {
  const relation = property('advanced-convert-relation', rootDatabase.id, 'Related', 'text')
  const formula = property('advanced-convert-formula', rootDatabase.id, 'Calculated', 'text')
  const rollup = property('advanced-convert-rollup', rootDatabase.id, 'Total', 'text')
  const rollupRelation = { ...property('advanced-convert-rollup-relation', rootDatabase.id, 'Rollup relation', 'relation'), config: { targetDatabaseId: rootDatabase.id } } as TestProperty
  const conversionView = view('view-root-id', rootDatabase.id, 'Table', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    filters: [{ propertyId: relation.id, operator: 'is_not_empty' }],
    sorts: [{ propertyId: relation.id, direction: 'asc' }],
  })
  const api = await installApi(page, [
    block('advanced-type-conversion', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], {
    databases: [rootDatabase], views: [conversionView], properties: [...rootProperties, relation, formula, rollup, rollupRelation],
    records: [{ ...basicRecord, properties: { ...basicRecord.properties, [relation.id]: 'old relation value', [formula.id]: 'old formula value', [rollup.id]: 'old rollup value' } }],
  })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')

  const relationConfig = await beginAdvancedPropertyTypeChange(page, table, relation.name, '关联')
  await expect(relationConfig.getByLabel('属性名称')).toHaveAttribute('readonly', '')
  await relationConfig.getByLabel('目标数据库').selectOption(rootDatabase.id)
  expect(api.requests.filter(({ method, path }) => method === 'PATCH' && path.endsWith(`/properties/${relation.id}/type`))).toHaveLength(0)
  await relationConfig.getByRole('button', { name: '继续', exact: true }).click()
  const relationConfirm = page.getByRole('dialog', { name: '变更属性类型？' })
  await expect(relationConfirm).toBeVisible()
  expect(api.requests.filter(({ method, path }) => method === 'PATCH' && path.endsWith(`/properties/${relation.id}/type`))).toHaveLength(0)
  await relationConfirm.getByRole('button', { name: '变更类型', exact: true }).click()
  await expect.poll(() => api.properties.find(item => item.id === relation.id)?.type).toBe('relation')
  expect(api.properties.find(item => item.id === relation.id)?.id).toBe(relation.id)
  expect(api.properties.find(item => item.id === relation.id)?.name).toBe(relation.name)
  expect(api.requests.filter(({ method, path }) => method === 'PATCH' && path.endsWith(`/properties/${relation.id}/type`)).at(-1)?.payload).toMatchObject({ targetType: 'relation', config: { targetDatabaseId: rootDatabase.id } })
  expect(api.records[0]?.properties[relation.id]).toBeUndefined()
  expect(api.views[0]?.config.filters).toEqual([])
  expect(api.views[0]?.config.sorts).toEqual([])

  const relationToFormulaConfig = await beginAdvancedPropertyTypeChange(page, table, relation.name, '公式')
  const priorRelationTypeRequests = api.requests.filter(({ method, path }) => method === 'PATCH' && path.endsWith(`/properties/${relation.id}/type`)).length
  await expect(relationToFormulaConfig.getByLabel('属性名称')).toHaveAttribute('readonly', '')
  await relationToFormulaConfig.getByRole('button', { name: '数字相加模板' }).click()
  await relationToFormulaConfig.getByLabel('结果类型').selectOption('number')
  expect(api.requests.filter(({ method, path }) => method === 'PATCH' && path.endsWith(`/properties/${relation.id}/type`))).toHaveLength(priorRelationTypeRequests)
  await relationToFormulaConfig.getByRole('button', { name: '继续', exact: true }).click()
  const formulaConfirm = page.getByRole('dialog', { name: '变更属性类型？' })
  await expect(formulaConfirm).toBeVisible()
  expect(api.requests.filter(({ method, path }) => method === 'PATCH' && path.endsWith(`/properties/${relation.id}/type`))).toHaveLength(priorRelationTypeRequests)
  await formulaConfirm.getByRole('button', { name: '变更类型', exact: true }).click()
  await expect.poll(() => api.properties.find(item => item.id === relation.id)?.type).toBe('formula')
  expect(api.properties.find(item => item.id === relation.id)?.id).toBe(relation.id)
  expect(api.properties.find(item => item.id === relation.id)?.name).toBe(relation.name)
  expect(api.properties.find(item => item.id === relation.id)?.config).toMatchObject({ resultType: 'number' })
  expect(api.records[0]?.properties[relation.id]).toBeUndefined()
  const formulaRequest = api.requests.filter(({ method, path }) => method === 'PATCH' && path.endsWith(`/properties/${relation.id}/type`)).at(-1)!
  expect(formulaRequest.payload).toMatchObject({ targetType: 'formula', config: { resultType: 'number' } })

  const formulaConfig = await beginAdvancedPropertyTypeChange(page, table, formula.name, '公式')
  await expect(formulaConfig.getByLabel('属性名称')).toHaveAttribute('readonly', '')
  await formulaConfig.getByLabel('表达式').fill('{bad json')
  await formulaConfig.getByRole('button', { name: '继续', exact: true }).click()
  await expect(formulaConfig.getByRole('alert')).toContainText('有效名称和配置')
  expect(api.requests.filter(({ method, path }) => method === 'PATCH' && path.endsWith(`/properties/${formula.id}/type`))).toHaveLength(0)
  await formulaConfig.getByRole('button', { name: '数字相加模板' }).click()
  await formulaConfig.getByLabel('结果类型').selectOption('number')
  await formulaConfig.getByRole('button', { name: '继续', exact: true }).click()
  const textToFormulaConfirm = page.getByRole('dialog', { name: '变更属性类型？' })
  await expect(textToFormulaConfirm).toBeVisible()
  await textToFormulaConfirm.getByRole('button', { name: '变更类型', exact: true }).click()
  await expect.poll(() => api.properties.find(item => item.id === formula.id)?.type).toBe('formula')
  expect(api.properties.find(item => item.id === formula.id)?.id).toBe(formula.id)
  expect(api.properties.find(item => item.id === formula.id)?.name).toBe(formula.name)
  expect(api.records[0]?.properties[formula.id]).toBeUndefined()
  expect(api.requests.filter(({ method, path }) => method === 'PATCH' && path.endsWith(`/properties/${formula.id}/type`)).at(-1)?.payload).toMatchObject({ targetType: 'formula', config: { resultType: 'number' } })

  const rollupConfig = await beginAdvancedPropertyTypeChange(page, table, rollup.name, '汇总')
  await expect(rollupConfig.getByLabel('属性名称')).toHaveAttribute('readonly', '')
  await rollupConfig.getByLabel('关联属性').selectOption(rollupRelation.id)
  await rollupConfig.getByLabel('目标属性').selectOption('root-number')
  await rollupConfig.getByLabel('汇总方式').selectOption('sum')
  expect(api.requests.filter(({ method, path }) => method === 'PATCH' && path.endsWith(`/properties/${rollup.id}/type`))).toHaveLength(0)
  await rollupConfig.getByRole('button', { name: '继续', exact: true }).click()
  const rollupConfirm = page.getByRole('dialog', { name: '变更属性类型？' })
  await expect(rollupConfirm).toBeVisible()
  await rollupConfirm.getByRole('button', { name: '变更类型', exact: true }).click()
  await expect.poll(() => api.properties.find(item => item.id === rollup.id)?.type).toBe('rollup')
  expect(api.properties.find(item => item.id === rollup.id)?.id).toBe(rollup.id)
  expect(api.properties.find(item => item.id === rollup.id)?.name).toBe(rollup.name)
  expect(api.records[0]?.properties[rollup.id]).toBeUndefined()
  const rollupRequest = api.requests.filter(({ method, path }) => method === 'PATCH' && path.endsWith(`/properties/${rollup.id}/type`)).at(-1)!
  expect(rollupRequest.payload).toMatchObject({ targetType: 'rollup', config: { relationPropertyId: rollupRelation.id, targetPropertyId: 'root-number', aggregation: 'sum' } })
})

test('advanced type conversion cancels after a 409 refresh when the source type changed', async ({ page }) => {
  const relation = { ...property('stale-advanced-source', rootDatabase.id, 'Related', 'relation'), config: { targetDatabaseId: rootDatabase.id } } as TestProperty
  const api = await installApi(page, [
    block('stale-advanced-source-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: [...rootProperties, relation], records: [basicRecord] })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  const config = await beginAdvancedPropertyTypeChange(page, table, relation.name, '公式')
  await config.getByRole('button', { name: '数字相加模板' }).click()
  await config.getByLabel('结果类型').selectOption('number')
  await config.getByRole('button', { name: '继续', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: '变更属性类型？' })
  let attemptedTypeChange = 0
  await page.route('**/properties/stale-advanced-source/type', async route => {
    attemptedTypeChange += 1
    const changed = api.properties.find(item => item.id === relation.id)!
    changed.type = 'text'
    changed.config = undefined
    changed.version += 1
    api.databases[0]!.version += 1
    await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ statusCode: 409, message: 'Database or property version is stale' }) })
  })
  await confirm.getByRole('button', { name: '变更类型', exact: true }).click()
  await expect(confirm).toHaveCount(0)
  await expect.poll(() => api.properties.find(item => item.id === relation.id)?.type).toBe('text')
  await expect(page.getByRole('alert')).toContainText('请重新选择')
  expect(attemptedTypeChange).toBe(1)
  await expect(table.locator('.eotion-database-header-name[data-property-id="stale-advanced-source"]')).toContainText('Related')
})

test('advanced type conversion cancels after a 409 refresh when the source property was deleted', async ({ page }) => {
  const relation = { ...property('deleted-advanced-source', rootDatabase.id, 'Related', 'relation'), config: { targetDatabaseId: rootDatabase.id } } as TestProperty
  const api = await installApi(page, [
    block('deleted-advanced-source-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: [...rootProperties, relation], records: [basicRecord] })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  const config = await beginAdvancedPropertyTypeChange(page, table, relation.name, '公式')
  await config.getByRole('button', { name: '数字相加模板' }).click()
  await config.getByLabel('结果类型').selectOption('number')
  await config.getByRole('button', { name: '继续', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: '变更属性类型？' })
  let attemptedTypeChange = 0
  await page.route('**/properties/deleted-advanced-source/type', async route => {
    attemptedTypeChange += 1
    api.properties = api.properties.filter(item => item.id !== relation.id)
    api.databases[0]!.version += 1
    await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ statusCode: 409, message: 'Database or property version is stale' }) })
  })
  await confirm.getByRole('button', { name: '变更类型', exact: true }).click()
  await expect(confirm).toHaveCount(0)
  expect(api.properties.some(item => item.id === relation.id)).toBe(false)
  await expect(page.getByRole('alert')).toContainText('请重新选择')
  expect(attemptedTypeChange).toBe(1)
})

test('advanced type conversion keeps confirmation after a server dependency 409 and can retry with refreshed versions', async ({ page }) => {
  const relation = { ...property('dependency-conflict-source', rootDatabase.id, 'Related', 'relation'), config: { targetDatabaseId: rootDatabase.id } } as TestProperty
  const api = await installApi(page, [
    block('dependency-conflict-source-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: [...rootProperties, relation], records: [basicRecord] })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  const config = await beginAdvancedPropertyTypeChange(page, table, relation.name, '公式')
  await config.getByRole('button', { name: '数字相加模板' }).click()
  await config.getByLabel('结果类型').selectOption('number')
  await config.getByRole('button', { name: '继续', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: '变更属性类型？' })
  let attemptedTypeChange = 0
  const rejectOnce = async (route: Route) => {
    attemptedTypeChange += 1
    const current = api.properties.find(item => item.id === relation.id)!
    current.version += 1
    api.databases[0]!.version += 1
    await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ statusCode: 409, message: 'Database property dependency conflict' }) })
  }
  await page.route('**/properties/dependency-conflict-source/type', rejectOnce)
  await confirm.getByRole('button', { name: '变更类型', exact: true }).click()
  await expect(confirm).toBeVisible()
  await expect(confirm.getByRole('alert')).toContainText('Database property dependency conflict')
  expect(api.properties.find(item => item.id === relation.id)?.type).toBe('relation')
  expect(attemptedTypeChange).toBe(1)
  await page.unroute('**/properties/dependency-conflict-source/type', rejectOnce)
  await confirm.getByRole('button', { name: '变更类型', exact: true }).click()
  await expect(confirm).toHaveCount(0)
  await expect.poll(() => api.properties.find(item => item.id === relation.id)?.type).toBe('formula')
  const retry = api.requests.filter(({ method, path }) => method === 'PATCH' && path.endsWith(`/properties/${relation.id}/type`)).at(-1)!
  expect(retry.payload?.expectedDatabaseVersion).toBe(api.databases[0]!.version - 1)
  expect(retry.payload?.expectedPropertyVersion).toBe(api.properties.find(item => item.id === relation.id)!.version - 1)
})

test('advanced type conversion retains its configured draft and refreshed versions after a same-source 409', async ({ page }) => {
  const relation = { ...property('same-source-conflict', rootDatabase.id, 'Related', 'relation'), config: { targetDatabaseId: rootDatabase.id } } as TestProperty
  const api = await installApi(page, [
    block('same-source-conflict-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: [...rootProperties, relation], records: [basicRecord], failPropertyTypeChanges: 1, conflictPropertyTypeChanges: 1 })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  const config = await beginAdvancedPropertyTypeChange(page, table, relation.name, '公式')
  await config.getByRole('button', { name: '数字相加模板' }).click()
  await config.getByLabel('结果类型').selectOption('number')
  await config.getByRole('button', { name: '继续', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: '变更属性类型？' })
  await confirm.getByRole('button', { name: '变更类型', exact: true }).click()
  await expect(confirm.getByRole('alert')).toContainText('Property type change rejected')
  await expect(confirm).toBeVisible()
  expect(api.properties.find(item => item.id === relation.id)?.type).toBe('relation')
  expect(api.requests.filter(({ method, path }) => method === 'PATCH' && path.endsWith(`/properties/${relation.id}/type`))).toHaveLength(1)
  await confirm.getByRole('button', { name: '变更类型', exact: true }).click()
  await expect(confirm).toBeVisible()
  await expect(confirm.getByRole('alert')).toContainText('已刷新，请重新确认。配置已保留')
  expect(api.properties.find(item => item.id === relation.id)?.type).toBe('relation')
  const requestCount = () => api.requests.filter(({ method, path }) => method === 'PATCH' && path.endsWith(`/properties/${relation.id}/type`)).length
  expect(requestCount()).toBe(2)
  await confirm.getByRole('button', { name: '变更类型', exact: true }).click()
  await expect(confirm).toHaveCount(0)
  await expect.poll(() => api.properties.find(item => item.id === relation.id)?.type).toBe('formula')
  expect(requestCount()).toBe(3)
  const retry = api.requests.filter(({ method, path }) => method === 'PATCH' && path.endsWith(`/properties/${relation.id}/type`)).at(-1)!
  expect(retry.payload).toMatchObject({ targetType: 'formula', config: { resultType: 'number' } })
  expect(retry.payload?.expectedDatabaseVersion).toBe(api.databases[0]!.version - 1)
  expect(retry.payload?.expectedPropertyVersion).toBe(api.properties.find(item => item.id === relation.id)!.version - 1)
})

test('existing advanced property editors still use property PATCH instead of type mutation', async ({ page }) => {
  const relation = { ...property('existing-edit-relation', rootDatabase.id, 'Related', 'relation'), config: { targetDatabaseId: rootDatabase.id } } as TestProperty
  const formula = { ...property('existing-edit-formula', rootDatabase.id, 'Calculated', 'formula'), config: { expression: { kind: 'literal', value: 1 }, resultType: 'number' } } as TestProperty
  const rollupRelation = { ...property('existing-edit-rollup-relation', rootDatabase.id, 'Rollup relation', 'relation'), config: { targetDatabaseId: rootDatabase.id } } as TestProperty
  const rollup = { ...property('existing-edit-rollup', rootDatabase.id, 'Total', 'rollup'), config: { relationPropertyId: rollupRelation.id, targetPropertyId: 'root-number', aggregation: 'sum' } } as TestProperty
  const api = await installApi(page, [
    block('existing-advanced-editors', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: [...rootProperties, relation, formula, rollupRelation, rollup], records: [basicRecord] })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  const settings = page.getByRole('group', { name: '属性管理' })
  for (const [item, label] of [[relation, '关联'], [formula, '公式'], [rollup, '汇总']] as const) {
    await openDatabaseSetting(page, table, '属性')
    await expect(settings).toBeVisible()
    await settings.getByRole('button', { name: `编辑${label}设置 ${item.name}` }).click()
    const config = page.getByRole('group', { name: `配置${label}属性` })
    await expect(config).toBeVisible()
    if (label === '关联') await config.getByLabel('目标数据库').selectOption(rootDatabase.id)
    if (label === '公式') {
      await config.getByRole('button', { name: '数字相加模板' }).click()
      await config.getByLabel('结果类型').selectOption('number')
    }
    if (label === '汇总') {
      await config.getByLabel('关联属性').selectOption(rollupRelation.id)
      await config.getByLabel('目标属性').selectOption('root-number')
      await config.getByLabel('汇总方式').selectOption('sum')
    }
    await config.getByRole('button', { name: '保存属性', exact: true }).click()
    await expect(config).toHaveCount(0)
    expect(api.properties.find(propertyItem => propertyItem.id === item.id)?.type).toBe(item.type)
    expect(api.requests.filter(({ method, path }) => method === 'PATCH' && path.endsWith(`/properties/${item.id}`))).toHaveLength(1)
    expect(api.requests.filter(({ method, path }) => method === 'PATCH' && path.endsWith(`/properties/${item.id}/type`))).toHaveLength(0)
  }
})

test('property type change failures keep the confirmation available and report conflicts without optimistic type changes', async ({ page }) => {
  const api = await installApi(page, [
    block('property-type-errors', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: rootProperties, records: [basicRecord], failPropertyTypeChanges: 1 })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  let dialog = await beginPropertyTypeChange(page, table, 'Notes', '数字')
  await dialog.getByRole('button', { name: '变更类型', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Property type change rejected')
  await expect(dialog).toBeVisible()
  expect(api.properties.find(item => item.id === 'root-text')?.type).toBe('text')
  expect(api.requests.filter(({ method, path }) => method === 'PATCH' && path.endsWith('/properties/root-text/type'))).toHaveLength(1)
  await dialog.getByRole('button', { name: '变更类型', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(api.properties.find(item => item.id === 'root-text')?.type).toBe('number')

  api.conflictPropertyTypeChanges = 1
  const tableReadsBeforeConflict = api.requests.filter(({ method, path }) => method === 'GET' && path.endsWith('/table')).length
  const dateDialog = await beginPropertyTypeChange(page, table, 'Due', '文本')
  await dateDialog.getByRole('button', { name: '变更类型', exact: true }).click()
  await expect(dateDialog.getByRole('alert')).toContainText('数据库结构已变化，已刷新，请重新确认')
  await expect(dateDialog.getByRole('alert')).toContainText('stale')
  await expect(dateDialog).toBeVisible()
  expect(api.properties.find(item => item.id === 'root-date')?.type).toBe('date')
  expect(api.requests.filter(({ method, path }) => method === 'PATCH' && path.endsWith('/properties/root-date/type'))).toHaveLength(1)
  expect(api.requests.filter(({ method, path }) => method === 'GET' && path.endsWith('/table')).length).toBeGreaterThan(tableReadsBeforeConflict)
  await dateDialog.getByRole('button', { name: '变更类型', exact: true }).click()
  await expect(dateDialog).toHaveCount(0)
  expect(api.properties.find(item => item.id === 'root-date')?.type).toBe('text')
  const dateTypeRequest = api.requests.filter(({ method, path }) => method === 'PATCH' && path.endsWith('/properties/root-date/type')).at(-1)!
  expect(dateTypeRequest.payload?.expectedPropertyVersion).toBe(api.properties.find(item => item.id === 'root-date')?.version - 1)
  expect(dateTypeRequest.payload?.expectedDatabaseVersion).toBe(api.databases[0]?.version - 1)
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
  await expect(panel.locator('.eotion-database-property-name').filter({ hasText: /^选择$/ })).toBeVisible()
  await expect(panel.getByRole('button', { name: '显示属性 Notes' })).toHaveAttribute('aria-pressed', 'false')

  await panel.getByRole('button', { name: '新增属性' }).click()
  await page.getByRole('group', { name: '添加属性类型' }).getByRole('button', { name: '文本', exact: true }).click()
  await expect(panel.locator('.eotion-database-property-name').filter({ hasText: /^文本$/ })).toBeVisible()
  const renameEditor = await beginPropertyRename(page, panel, '选择')
  await renameEditor.fill('发布状态')
  await renameEditor.press('Enter')
  await expect(panel.locator('.eotion-database-property-name').filter({ hasText: /^发布状态$/ })).toBeVisible()

  await panel.getByRole('button', { name: '管理选项 发布状态' }).click()
  let optionsPanel = page.getByRole('dialog', { name: '选择选项：发布状态' })
  await optionsPanel.getByRole('textbox', { name: '新选项名称' }).fill('待发布')
  await optionsPanel.getByRole('button', { name: '添加', exact: true }).click()
  await expect(optionsPanel.getByText('待发布', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(optionsPanel).toHaveCount(0)
  await expect(panel).toBeVisible()

  await panel.getByRole('button', { name: '属性设置 文本' }).click()
  await page.getByRole('menu', { name: '属性设置: 文本' }).getByRole('menuitem', { name: '删除' }).click()
  const deleteDialog = page.getByRole('dialog', { name: '删除属性“文本”' })
  await deleteDialog.getByRole('button', { name: '删除属性' }).click()
  await expect(panel.getByRole('button', { name: '属性设置 文本' })).toHaveCount(0)
  await expect(panel.getByRole('button', { name: '显示属性 Notes' })).toHaveAttribute('aria-pressed', 'false')
  await panel.getByRole('button', { name: '保存显示与顺序' }).click()
  await expect(page.getByRole('group', { name: '属性管理' })).toHaveCount(0)
})

test('property menu keeps its focus, type choices and database-local dismissal behavior', async ({ page }) => {
  const relation = { ...property('property-menu-relation', rootDatabase.id, 'Related for rollup', 'relation'), config: { targetDatabaseId: rootDatabase.id } } as TestProperty
  const api = await installApi(page, [
    block('property-menu-contract', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: [...rootProperties, relation], records: [basicRecord] })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  const trigger = table.getByRole('button', { name: '属性设置 Status' })

  await trigger.click()
  const menu = page.getByRole('menu', { name: '属性设置: Status' })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitem')).toHaveCount(3)
  await screenshot(page, 'property-menu-desktop')
  for (const action of ['重命名', '变更类型', '删除']) {
    const item = menu.getByRole('menuitem', { name: action })
    await expect(item).toBeVisible()
    await expect(item.locator('svg')).toHaveCount(1)
  }
  await menu.getByRole('menuitem', { name: '变更类型' }).click()
  const types = page.getByRole('group', { name: '更改属性类型' })
  const labels = ['文本', '数字', '复选框', '选择', '日期', '关联', '汇总', '公式']
  for (const label of labels) {
    const item = types.getByRole('menuitem', { name: label })
    await expect(item).toBeVisible()
    await expect(item.locator('svg')).toHaveCount(label === '选择' ? 2 : 1)
  }
  await expect(types.getByRole('menuitem', { name: '选择' })).toHaveAttribute('aria-current', 'true')
  const sameTypeRequestCount = api.requests.filter(({ method, path }) => method === 'PATCH' && path.endsWith('/properties/root-select/type')).length
  await types.getByRole('menuitem', { name: '选择' }).click()
  await expect(types).toHaveCount(0)
  expect(api.requests.filter(({ method, path }) => method === 'PATCH' && path.endsWith('/properties/root-select/type'))).toHaveLength(sameTypeRequestCount)
  await trigger.click()
  await menu.getByRole('menuitem', { name: '变更类型' }).click()
  await expect(types).toBeVisible()
  await screenshot(page, 'property-menu-types-desktop')
  await page.setViewportSize({ width: 390, height: 844 })
  await screenshot(page, 'property-menu-types-phone-390')
  const requestsBeforeTypeChoice = api.requests.length
  await types.getByRole('menuitem', { name: '数字' }).click()
  const typeDialog = page.getByRole('dialog', { name: '变更属性类型？' })
  await expect(typeDialog).toBeVisible()
  await expect(typeDialog.getByRole('button', { name: '变更类型', exact: true })).toBeVisible()
  await expect(typeDialog.getByRole('button', { name: '取消', exact: true })).toBeVisible()
  const typeDialogBounds = await typeDialog.boundingBox()
  expect(typeDialogBounds).not.toBeNull()
  expect(typeDialogBounds!.x).toBeGreaterThanOrEqual(0)
  expect(typeDialogBounds!.x + typeDialogBounds!.width).toBeLessThanOrEqual(390)
  await screenshot(page, 'property-type-confirmation-phone-390')
  await typeDialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(typeDialog).toHaveCount(0)
  expect(api.properties.find(item => item.id === 'root-select')?.type).toBe('select')
  expect(api.requests.slice(requestsBeforeTypeChoice).some(({ method, path }) => method === 'PATCH' && path.endsWith('/properties/root-select/type'))).toBe(false)

  await trigger.click()
  await menu.getByRole('menuitem', { name: '变更类型' }).click()
  await expect(types).toBeVisible()
  await types.getByRole('menuitem', { name: '文本' }).click()
  const escapeDialog = page.getByRole('dialog', { name: '变更属性类型？' })
  await expect(escapeDialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(escapeDialog).toHaveCount(0)
  await expect(types).toHaveCount(0)
  await expect(trigger).toBeFocused()
  expect(api.requests.slice(requestsBeforeTypeChoice).some(({ method, path }) => method === 'PATCH' && path.endsWith('/properties/root-select/type'))).toBe(false)

  await trigger.click()
  await menu.getByRole('menuitem', { name: '变更类型' }).click()
  await page.getByRole('group', { name: '更改属性类型' }).getByRole('menuitem', { name: '日期' }).click()
  const backdropDialog = page.getByRole('dialog', { name: '变更属性类型？' })
  await expect(backdropDialog).toBeVisible()
  await page.mouse.click(1, 1)
  await expect(backdropDialog).toHaveCount(0)
  expect(api.requests.slice(requestsBeforeTypeChoice).some(({ method, path }) => method === 'PATCH' && path.endsWith('/properties/root-select/type'))).toBe(false)

  await trigger.click()
  await menu.getByRole('menuitem', { name: '变更类型' }).click()
  await expect(types).toBeVisible()
  await table.locator('.eotion-database-header-name[data-property-id="root-text"]').click()
  await expect(types).toHaveCount(0)
  expect(api.properties.find(item => item.id === 'root-select')?.type).toBe('select')
  expect(api.requests.slice(requestsBeforeTypeChoice).some(({ method, path }) => method === 'PATCH' && path.endsWith('/properties/root-select/type'))).toBe(false)

  await trigger.click()
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(trigger).toBeFocused()

  await trigger.click()
  await expect(menu).toBeVisible()
  await table.locator('.eotion-database-header-name[data-property-id="root-text"]').click()
  await expect(menu).toHaveCount(0)
  await expect(table).toContainText('Launch plan')

  for (const [index, advancedType] of ['关联', '汇总', '公式'].entries()) {
    const requestsBeforeAdvancedChoice = api.requests.length
    const advancedTrigger = table.getByRole('button', { name: '属性设置 Notes' })
    await advancedTrigger.click()
    await page.getByRole('menu', { name: '属性设置: Notes' }).getByRole('menuitem', { name: '变更类型' }).click()
    await page.getByRole('group', { name: '更改属性类型' }).getByRole('menuitem', { name: advancedType }).click()
    const config = page.getByRole('group', { name: `配置${advancedType}属性` })
    await expect(config).toBeVisible()
    await expect(config.getByLabel('属性名称')).toHaveAttribute('readonly', '')
    await expect(config.getByRole('button', { name: '继续', exact: true })).toBeVisible()
    const configOverlay = page.locator('.eotion-product-overlay').filter({ has: config })
    const configBounds = await configOverlay.boundingBox()
    expect(configBounds).not.toBeNull()
    expect(configBounds!.x).toBeGreaterThanOrEqual(0)
    expect(configBounds!.x + configBounds!.width).toBeLessThanOrEqual(390)
    if (advancedType === '关联') await config.getByLabel('目标数据库').selectOption(rootDatabase.id)
    if (advancedType === '汇总') {
      await config.getByLabel('关联属性').selectOption(relation.id)
      await config.getByLabel('目标属性').selectOption('root-number')
      await config.getByLabel('汇总方式').selectOption('sum')
    }
    if (advancedType === '公式') {
      await config.getByRole('button', { name: '数字相加模板' }).click()
      await config.getByLabel('结果类型').selectOption('number')
    }
    await config.getByRole('button', { name: '继续', exact: true }).click()
    const confirm = page.getByRole('dialog', { name: '变更属性类型？' })
    await expect(confirm).toBeVisible()
    if (index === 0) await confirm.getByRole('button', { name: '取消', exact: true }).click()
    else if (index === 1) await page.keyboard.press('Escape')
    else await page.mouse.click(1, 1)
    await expect(confirm).toHaveCount(0)
    await expect(config).toHaveCount(0)
    expect(api.properties.find(item => item.id === 'root-text')?.type).toBe('text')
    expect(api.requests.slice(requestsBeforeAdvancedChoice).some(({ method, path }) => method === 'PATCH' && path.endsWith('/properties/root-text/type'))).toBe(false)
  }

  const keyboardTrigger = table.getByRole('button', { name: '属性设置 Notes' })
  await keyboardTrigger.focus()
  await keyboardTrigger.press('ArrowDown')
  const keyboardMenu = page.getByRole('menu', { name: '属性设置: Notes' })
  await expect(keyboardMenu).toBeVisible()
  await keyboardMenu.getByRole('menuitem', { name: '重命名' }).press('Enter')
  const keyboardRename = table.getByRole('textbox', { name: '属性名称 Notes' })
  await expect(keyboardRename).toBeFocused()
  await keyboardRename.press('Escape')

  await openDatabaseSetting(page, table, '属性')
  const settingsPanel = page.getByRole('group', { name: '属性管理' })
  const settingsTrigger = settingsPanel.getByRole('button', { name: '属性设置 Notes' })
  await settingsTrigger.click()
  const settingsMenu = page.getByRole('menu', { name: '属性设置: Notes' })
  await expect(settingsMenu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(settingsMenu).toHaveCount(0)
  await expect(settingsPanel).toBeVisible()
  await expect(settingsTrigger).toBeFocused()
  await settingsTrigger.click()
  await settingsMenu.getByRole('menuitem', { name: '删除' }).click()
  const settingsDeleteDialog = page.getByRole('dialog', { name: '删除属性“Notes”' })
  await expect(settingsDeleteDialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(settingsDeleteDialog).toHaveCount(0)
  await expect(settingsPanel).toBeVisible()
  expect(api.properties.some(item => item.id === 'root-text')).toBe(true)
  expect(api.requests.some(({ method, path }) => method === 'DELETE' && path.endsWith('/properties/root-text'))).toBe(false)
  await settingsPanel.getByRole('button', { name: '属性设置 名称' }).click()
  const titleMenu = page.getByRole('menu', { name: '属性设置: Name' })
  const deleteTitle = titleMenu.getByRole('menuitem', { name: '删除' })
  await expect(deleteTitle).toBeDisabled()
  await expect(deleteTitle).toHaveAttribute('title', '标题属性不能删除')
  await expect(titleMenu.getByRole('menuitem', { name: '变更类型' })).toBeDisabled()
  await closeDatabaseSetting(page, '属性管理')
})

test('inline property rename edits the existing header and settings spans and saves trimmed names with a stable ID', async ({ page }) => {
  const api = await installApi(page, [
    block('property-inline-rename', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: rootProperties, records: [basicRecord] })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  const name = table.locator('.eotion-database-header-name').filter({ hasText: 'Notes' })
  await expect(name).toHaveAttribute('data-property-id', 'root-text')
  await name.evaluate(element => element.setAttribute('data-original-name-node', 'notes-header'))
  let editor = await beginPropertyRename(page, table, 'Notes')
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  await expect(editor).toHaveAttribute('data-original-name-node', 'notes-header')
  await expect(editor).toBeFocused()
  const caretAtEnd = await editor.evaluate(element => {
    const selection = window.getSelection()
    if (selection?.rangeCount !== 1 || !selection.isCollapsed || !selection.anchorNode || !element.contains(selection.anchorNode)) return false
    const textBeforeCaret = document.createRange()
    textBeforeCaret.selectNodeContents(element)
    textBeforeCaret.setEnd(selection.anchorNode, selection.anchorOffset)
    return textBeforeCaret.toString().length === (element.textContent ?? '').length
  })
  expect(caretAtEnd).toBe(true)
  await editor.fill('  Notes updated  ')
  await editor.press('Enter')
  await expect(table.locator('.eotion-database-header-name').filter({ hasText: 'Notes updated' })).toBeVisible()
  expect(api.properties.find(item => item.id === 'root-text')?.name).toBe('Notes updated')
  await page.reload()
  let refreshedTable = page.locator('.eotion-editor-content .eotion-database')
  await expect(refreshedTable.locator('.eotion-database-header-name').filter({ hasText: 'Notes updated' })).toBeVisible()
  expect(api.properties.find(item => item.name === 'Notes updated')?.id).toBe('root-text')

  const writesBeforeInvalidNames = api.requests.filter(({ method, path }) => method === 'PATCH' && path.endsWith('/properties/root-text')).length
  editor = await beginPropertyRename(page, refreshedTable, 'Notes updated')
  await editor.fill('')
  await editor.press('Enter')
  await expect(refreshedTable.locator('.eotion-database-header-name').filter({ hasText: 'Notes updated' })).toBeVisible()
  editor = await beginPropertyRename(page, refreshedTable, 'Notes updated')
  await editor.fill('N'.repeat(101))
  await editor.press('Enter')
  await expect(refreshedTable.getByRole('alert')).toContainText('属性名称不能超过 100 个字符')
  await expect(refreshedTable.locator('.eotion-database-header-name').filter({ hasText: 'Notes updated' })).toBeVisible()
  expect(api.requests.filter(({ method, path }) => method === 'PATCH' && path.endsWith('/properties/root-text'))).toHaveLength(writesBeforeInvalidNames)

  editor = await beginPropertyRename(page, refreshedTable, 'Notes updated')
  await editor.fill('Canceled draft')
  await editor.press('Escape')
  await expect(refreshedTable.locator('.eotion-database-header-name').filter({ hasText: 'Notes updated' })).toBeVisible()
  expect(api.properties.find(item => item.id === 'root-text')?.name).toBe('Notes updated')

  editor = await beginPropertyRename(page, refreshedTable, 'Notes updated')
  await editor.fill('Composition draft')
  await editor.evaluate(element => element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' })))
  await editor.evaluate(element => element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, which: 229, isComposing: true, bubbles: true })))
  await expect(editor).toBeVisible()
  expect(api.properties.find(item => item.id === 'root-text')?.name).toBe('Notes updated')
  await editor.evaluate(element => element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'Composition draft' })))
  await editor.press('Escape')

  api.failPropertyUpdates = 1
  editor = await beginPropertyRename(page, refreshedTable, 'Notes updated')
  await editor.fill('Failed rename')
  await editor.press('Enter')
  await expect(refreshedTable.getByRole('alert')).toContainText('Property update rejected')
  await expect(refreshedTable.locator('.eotion-database-header-name').filter({ hasText: 'Notes updated' })).toBeVisible()
  expect(api.properties.find(item => item.id === 'root-text')?.name).toBe('Notes updated')

  await openDatabaseSetting(page, refreshedTable, '属性')
  const settingsPanel = page.getByRole('group', { name: '属性管理' })
  const settingsName = settingsPanel.locator('.eotion-database-property-name').filter({ hasText: 'Notes updated' })
  await settingsName.evaluate(element => element.setAttribute('data-original-name-node', 'notes-settings'))
  const settingsEditor = await beginPropertyRename(page, settingsPanel, 'Notes updated')
  await expect(settingsEditor).toHaveAttribute('data-original-name-node', 'notes-settings')
  await expect(settingsEditor).toBeFocused()
  const settingsCaretAtEnd = await settingsEditor.evaluate(element => {
    const selection = window.getSelection()
    if (selection?.rangeCount !== 1 || !selection.isCollapsed || !selection.anchorNode || !element.contains(selection.anchorNode)) return false
    const textBeforeCaret = document.createRange()
    textBeforeCaret.selectNodeContents(element)
    textBeforeCaret.setEnd(selection.anchorNode, selection.anchorOffset)
    return textBeforeCaret.toString().length === (element.textContent ?? '').length
  })
  expect(settingsCaretAtEnd).toBe(true)
  await settingsEditor.fill('Canceled settings draft')
  await settingsEditor.press('Escape')
  await expect(settingsPanel).toBeVisible()
  await expect(settingsName).toHaveText('Notes updated')
  const settingsBlurEditor = await beginPropertyRename(page, settingsPanel, 'Notes updated')
  await settingsBlurEditor.fill('  Settings name  ')
  await settingsBlurEditor.evaluate(element => (element as HTMLElement).blur())
  await expect(settingsPanel.locator('.eotion-database-property-name').filter({ hasText: 'Settings name' })).toBeVisible()
  expect(api.properties.find(item => item.id === 'root-text')?.name).toBe('Settings name')
  expect(api.properties.find(item => item.name === 'Settings name')?.id).toBe('root-text')

  for (const width of [1440, 1760]) {
    await page.setViewportSize({ width, height: 900 })
    const bounds = await settingsPanel.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
    await screenshot(page, `property-settings-desktop-${width}`)
  }
})

test('property deletion requires modal confirmation and preserves the property on cancellation or failure', async ({ page }) => {
  const api = await installApi(page, [
    block('property-delete-confirmation', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: rootProperties, records: [basicRecord], failPropertyDeletes: 1 })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  const trigger = table.getByRole('button', { name: '属性设置 Points' })
  const menu = page.getByRole('menu', { name: '属性设置: Points' })
  const deleteRequests = () => api.requests.filter(({ method, path }) => method === 'DELETE' && path.endsWith('/properties/root-number'))

  await trigger.click()
  await menu.getByRole('menuitem', { name: '删除' }).click()
  let dialog = page.getByRole('dialog', { name: '删除属性“Points”' })
  await expect(dialog).toBeVisible()
  expect(deleteRequests()).toHaveLength(0)
  await dialog.getByRole('button', { name: '取消' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(table.locator('.eotion-database-header-name').filter({ hasText: 'Points' })).toBeVisible()
  expect(deleteRequests()).toHaveLength(0)

  await trigger.click()
  await menu.getByRole('menuitem', { name: '删除' }).click()
  dialog = page.getByRole('dialog', { name: '删除属性“Points”' })
  await expect(dialog).toBeVisible()
  await page.setViewportSize({ width: 320, height: 740 })
  await screenshot(page, 'property-delete-modal-phone-320')
  const dialogBounds = await dialog.boundingBox()
  expect(dialogBounds).not.toBeNull()
  await page.mouse.click(Math.max(2, dialogBounds!.x - 2), Math.max(2, dialogBounds!.y - 2))
  await expect(dialog).toHaveCount(0)
  expect(deleteRequests()).toHaveLength(0)

  await trigger.click()
  await menu.getByRole('menuitem', { name: '删除' }).click()
  dialog = page.getByRole('dialog', { name: '删除属性“Points”' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  expect(deleteRequests()).toHaveLength(0)

  await trigger.click()
  await menu.getByRole('menuitem', { name: '删除' }).click()
  dialog = page.getByRole('dialog', { name: '删除属性“Points”' })
  await dialog.getByRole('button', { name: '删除属性' }).click()
  await expect(dialog.getByRole('alert')).toContainText('Property delete rejected')
  await expect(table.locator('.eotion-database-header-name').filter({ hasText: 'Points' })).toBeVisible()
  expect(deleteRequests()).toHaveLength(1)
  await dialog.getByRole('button', { name: '删除属性' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(table.locator('.eotion-database-header-name').filter({ hasText: 'Points' })).toHaveCount(0)
  expect(api.records[0]?.properties['root-number']).toBeUndefined()
  expect(deleteRequests()).toHaveLength(2)
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

test('database view selector creates a List view through the existing DatabaseView API', async ({ page }) => {
  const api = await installApi(page, [
    block('create-list-view-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: rootProperties, records: [basicRecord] })
  api.pages.push({ ...pageRecord, id: basicRecord.pageId, title: 'List record', orderKey: '0000000000000002', role: 'database-record' })
  const initialViewCount = api.views.length
  await page.goto('/#/app/database-workspace/page/database-page')

  const database = page.locator('#database-block-create-list-view-block')
  await expect(database.locator('tbody')).toBeVisible()
  await database.getByRole('button', { name: '切换视图' }).click()
  const menu = page.locator('.eotion-database-view-menu')
  await menu.getByRole('button', { name: '新建列表视图' }).click()

  await expect(database.getByTestId('database-list')).toBeVisible()
  await expect.poll(() => api.views).toHaveLength(initialViewCount + 1)
  const created = api.views.find(item => item.id !== 'view-root-id')
  expect(created?.type).toBe('list')
  expect(created?.config).toEqual(DEFAULT_DATABASE_VIEW_CONFIG)
  expect(api.requests.some(({ method, path, payload }) => method === 'POST' && path.endsWith(`/databases/${rootDatabase.id}/views`) && payload?.type === 'list' && payload?.config?.filters?.length === 0 && payload?.config?.sorts?.length === 0 && payload?.config?.visibleProperties === null && payload?.config?.propertyOrder === null)).toBe(true)
  await expect.poll(() => api.blocks.find(item => item.id === 'create-list-view-block')?.props.node?.attrs).toEqual({ databaseId: rootDatabase.id, viewId: created?.id })

  await database.getByRole('button', { name: '切换视图' }).click()
  await menu.getByRole('button', { name: '表格视图', exact: true }).click()
  await expect(database.locator('tbody')).toBeVisible()
  await expect(database.getByTestId('database-list')).toHaveCount(0)
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

test('database view selector lists Table and List, switches only viewId, and preserves nested editor state', async ({ page }) => {
  const listView = view('selector-list-view', rootDatabase.id, 'List view', { ...DEFAULT_DATABASE_VIEW_CONFIG }, 'list')
  const api = await installApi(page, [
    block('selector-root-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
    block('selector-toggle', 'toggle', { type: 'eotionToggle', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested database' }] }] }, 200),
    block('selector-nested-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100, 'selector-toggle'),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id), listView], properties: rootProperties, records: [basicRecord] })
  api.pages.push({ ...pageRecord, id: basicRecord.pageId, title: 'Selector record', orderKey: '0000000000000002', role: 'database-record' })
  await page.goto('/#/app/database-workspace/page/database-page')

  const root = page.locator('#database-block-selector-root-block')
  const nested = page.locator('#database-block-selector-nested-block')
  const editor = page.locator('.eotion-editor-content')
  await expect(root.locator('tbody')).toBeVisible()
  await expect(nested.locator('tbody')).toBeVisible()
  const lifecycleMarker = await root.evaluate((element) => {
    element.setAttribute('data-view-selector-lifecycle', 'stable')
    return 'stable'
  })
  await editor.evaluate((element) => {
    element.setAttribute('data-view-selector-lifecycle', 'stable')
  })

  await root.getByRole('button', { name: '切换视图' }).click()
  const menu = page.getByRole('group', { name: '数据库视图', exact: true })
  await expect(menu.locator('.eotion-database-view-row')).toHaveCount(2)
  await expect(menu.locator('.eotion-database-view-name')).toHaveText(['表格视图', 'List view'])
  await expect(menu.locator('.eotion-database-view-row.is-selected .eotion-database-view-name')).toHaveText('表格视图')

  await menu.getByRole('button', { name: 'List view', exact: true }).click()
  await expect(root.getByTestId('database-list')).toBeVisible()
  await expect(root.locator('table')).toHaveCount(0)
  await expect.poll(() => ((api.blocks.find(item => item.id === 'selector-root-block')?.props as { node?: { attrs?: { databaseId?: string; viewId?: string } } })?.node?.attrs)).toEqual({ databaseId: rootDatabase.id, viewId: listView.id })
  await expect(nested.locator('tbody')).toBeVisible()
  await expect(nested.getByRole('button', { name: '切换视图' })).toContainText('表格视图')
  await expect.poll(() => ((api.blocks.find(item => item.id === 'selector-nested-block')?.props as { node?: { attrs?: { databaseId?: string; viewId?: string } } })?.node?.attrs)).toEqual({ databaseId: rootDatabase.id, viewId: 'view-root-id' })
  await expect(root).toHaveAttribute('data-view-selector-lifecycle', lifecycleMarker)
  await expect(editor).toHaveAttribute('data-view-selector-lifecycle', lifecycleMarker)

  await root.getByRole('button', { name: '切换视图' }).click()
  await page.getByRole('group', { name: '数据库视图', exact: true }).getByRole('button', { name: '表格视图', exact: true }).click()
  await expect(root.locator('tbody')).toBeVisible()
  await expect(root.getByTestId('database-list')).toHaveCount(0)
  await expect.poll(() => ((api.blocks.find(item => item.id === 'selector-root-block')?.props as { node?: { attrs?: { databaseId?: string; viewId?: string } } })?.node?.attrs)).toEqual({ databaseId: rootDatabase.id, viewId: 'view-root-id' })
})

test('phone view selector keeps the existing two-row header while switching to List', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const listView = view('phone-selector-list-view', rootDatabase.id, 'List view', { ...DEFAULT_DATABASE_VIEW_CONFIG }, 'list')
  const api = await installApi(page, [
    block('phone-selector-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id), listView], properties: [rootProperties[0]!], records: [] })
  await page.goto('/#/app/database-workspace/page/database-page')

  const database = page.locator('#database-block-phone-selector-database')
  const header = database.locator('.eotion-database-header')
  const title = header.locator('.eotion-database-copy')
  const selector = header.getByRole('button', { name: '切换视图' })
  const add = header.getByRole('button', { name: '新建记录' })
  const settings = header.getByRole('button', { name: '数据库设置' })
  const [titleBox, selectorBox, addBox, settingsBox] = await Promise.all([title.boundingBox(), selector.boundingBox(), add.boundingBox(), settings.boundingBox()])
  expect(titleBox && selectorBox && addBox && settingsBox).toBeTruthy()
  expect(titleBox!.y + titleBox!.height).toBeLessThanOrEqual(selectorBox!.y)
  expect(Math.abs(selectorBox!.y - addBox!.y)).toBeLessThanOrEqual(4)
  expect(Math.abs(selectorBox!.y - settingsBox!.y)).toBeLessThanOrEqual(4)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

  await selector.click()
  const menu = page.getByRole('group', { name: '数据库视图', exact: true })
  await expect(menu.locator('.eotion-database-view-row')).toHaveCount(2)
  await menu.getByRole('button', { name: 'List view', exact: true }).click()
  await expect(database.getByTestId('database-list')).toBeVisible()
  await expect.poll(() => ((api.blocks.find(item => item.id === 'phone-selector-database')?.props as { node?: { attrs?: { databaseId?: string; viewId?: string } } })?.node?.attrs?.viewId)).toBe(listView.id)
  const [afterTitleBox, afterSelectorBox, afterAddBox, afterSettingsBox] = await Promise.all([title.boundingBox(), selector.boundingBox(), add.boundingBox(), settings.boundingBox()])
  expect(afterTitleBox && afterSelectorBox && afterAddBox && afterSettingsBox).toBeTruthy()
  expect(afterTitleBox!.y + afterTitleBox!.height).toBeLessThanOrEqual(afterSelectorBox!.y)
  expect(Math.abs(afterSelectorBox!.y - afterAddBox!.y)).toBeLessThanOrEqual(4)
  expect(Math.abs(afterSelectorBox!.y - afterSettingsBox!.y)).toBeLessThanOrEqual(4)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
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
  await expect(tables.nth(0).locator('.eotion-database-header-name').filter({ hasText: 'Notes' })).toHaveCount(1)
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

test('board renderer groups generic records by option IDs with projected titles and configured properties', async ({ page }) => {
  const boardConfig: DatabaseViewConfig = {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    filters: [{ propertyId: 'root-number', operator: 'gte', value: 10 }],
    sorts: [{ propertyId: 'root-number', direction: 'desc' }],
    visibleProperties: ['root-title', 'root-number', 'root-text'],
    propertyOrder: ['root-text', 'root-number', 'root-title'],
    options: { groupByPropertyId: 'root-select' },
  }
  const boardView = view('board-view', rootDatabase.id, 'Board', boardConfig, 'board')
  const status = property('root-select', rootDatabase.id, 'Status', 'select', [
    { id: 'todo', name: 'Todo' }, { id: 'doing', name: 'Doing' }, { id: 'unassigned', name: 'Done' },
  ])
  const records = [
    record('board-a', rootDatabase.id, 'page-a', { 'root-title': 'Stale copy', 'root-select': 'todo', 'root-number': 20, 'root-text': 'First' }),
    record('board-b', rootDatabase.id, 'page-b', { 'root-select': 'todo', 'root-number': 40, 'root-text': 'Second' }),
    record('board-c', rootDatabase.id, 'page-c', { 'root-select': 'doing', 'root-number': 30 }),
    record('board-d', rootDatabase.id, 'page-d', { 'root-number': 15 }),
    record('board-e', rootDatabase.id, 'page-e', { 'root-select': null, 'root-number': 16 }),
    record('board-filtered', rootDatabase.id, 'page-filtered', { 'root-select': 'unassigned', 'root-number': 1 }),
  ]
  const api = await installApi(page, [
    block('board-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: boardView.id } }, 100),
  ], { databases: [rootDatabase], views: [boardView], properties: rootProperties.map(item => item.id === status.id ? status : item), records })
  for (const [index, item] of records.entries()) api.pages.push({ ...pageRecord, id: item.pageId, title: `Projected ${item.id}`, orderKey: String(index + 2).padStart(16, '0'), role: 'database-record' })
  const original = structuredClone({ records: api.records, properties: api.properties, views: api.views })
  await page.goto('/#/app/database-workspace/page/database-page')
  const board = page.getByTestId('database-board')
  await expect(board).toBeVisible()
  await expect(board.locator('.eotion-database-board-column-name')).toHaveText(['Todo', 'Doing', 'Done', '未分组'])
  const todo = board.locator('[data-option-id="todo"]')
  await expect(todo.locator('.eotion-database-board-card')).toHaveCount(2)
  expect(await todo.locator('.eotion-database-board-card').evaluateAll(elements => elements.map(element => element.getAttribute('data-record-id')))).toEqual(['board-b', 'board-a'])
  await expect(board.locator('[data-option-id="doing"] .eotion-database-board-card')).toHaveAttribute('data-record-id', 'board-c')
  await expect(board.locator('[data-option-id="unassigned"] .eotion-database-board-card')).toHaveCount(0)
  expect(await board.locator('[data-option-id=""] .eotion-database-board-card').evaluateAll(elements => elements.map(element => element.getAttribute('data-record-id')))).toEqual(['board-e', 'board-d'])
  const card = board.locator('[data-record-id="board-a"]')
  await expect(card.getByRole('button', { name: '打开记录：Projected board-a' })).toBeVisible()
  await expect(card).toHaveAttribute('draggable', 'true')
  await expect(card.locator('dt')).toHaveText(['Notes', 'Points'])
  await expect(card.locator('dd')).toHaveText(['First', '20'])
  await expect(board.getByText('Stale copy', { exact: true })).toHaveCount(0)
  await expect(board.locator('input, [contenteditable="true"]')).toHaveCount(0)
  expect(api.requests.some(item => item.method === 'GET' && item.path.endsWith(`/views/${boardView.id}/table`))).toBe(true)
  expect({ records: api.records, properties: api.properties, views: api.views }).toEqual(original)

  for (const viewport of [{ width: 834, height: 1112 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    const columns = board.locator('.eotion-database-board-column')
    const first = await columns.nth(0).boundingBox()
    const second = await columns.nth(1).boundingBox()
    expect(first && second).toBeTruthy()
    if (viewport.width === 390) {
      expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height)
      expect(await board.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    } else expect(second!.x).toBeGreaterThan(first!.x)
  }
  await card.getByRole('button', { name: '打开记录：Projected board-a' }).click()
  await expect(page.getByRole('button', { name: '关闭记录' })).toBeVisible()
  expect(api.requests.filter(item => ['POST', 'PATCH', 'DELETE'].includes(item.method) && item.path.includes('/databases/'))).toHaveLength(0)
})

test('board renderer switches with Table and List without replacing editor or record drawer drafts', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const boardView = view('board-lifecycle-view', rootDatabase.id, 'Board', { ...DEFAULT_DATABASE_VIEW_CONFIG, options: { groupByPropertyId: 'root-select' } }, 'board')
  const listView = view('board-list-view', rootDatabase.id, 'List', { ...DEFAULT_DATABASE_VIEW_CONFIG }, 'list')
  const api = await installApi(page, [
    block('board-lifecycle', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: boardView.id } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id), listView, boardView], properties: rootProperties, records: [basicRecord] })
  api.pages.push({ ...pageRecord, id: basicRecord.pageId, title: 'Board record', orderKey: '0000000000000002', role: 'database-record' })
  await page.goto('/#/app/database-workspace/page/database-page')
  const database = page.locator('#database-block-board-lifecycle')
  await expect(database.getByTestId('database-board')).toBeVisible()
  await expect(database.locator('.eotion-database-board-card dt')).toHaveText(['Notes', 'Points', 'Done', 'Status', 'Due'])
  await page.locator('.eotion-editor-content').first().evaluate(element => element.setAttribute('data-board-lifecycle', 'stable'))
  await database.evaluate(element => element.setAttribute('data-board-lifecycle', 'stable'))
  await database.getByRole('button', { name: '打开记录：Board record' }).click()
  const drawer = page.locator('[data-overlay-mode="drawer"]')
  await expect(drawer).toBeVisible()
  await drawer.evaluate(element => element.setAttribute('data-board-lifecycle', 'stable'))
  const title = drawer.getByRole('textbox', { name: '记录标题' })
  await title.fill('Board draft survives')
  for (const [name, renderer] of [['表格视图', 'table'], ['List', '[data-testid="database-list"]'], ['Board', '[data-testid="database-board"]']] as const) {
    await database.getByRole('button', { name: '切换视图' }).focus()
    await database.getByRole('button', { name: '切换视图' }).press('Enter')
    await page.getByRole('group', { name: '数据库视图', exact: true }).getByRole('button', { name, exact: true }).click()
    await expect(database.locator(renderer)).toBeVisible()
    await expect(database).toHaveAttribute('data-board-lifecycle', 'stable')
    await expect(page.locator('.eotion-editor-content').first()).toHaveAttribute('data-board-lifecycle', 'stable')
    await expect(drawer).toHaveAttribute('data-board-lifecycle', 'stable')
    await expect(title).toHaveValue('Board draft survives')
  }
  await expect.poll(() => ((api.blocks.find(item => item.id === 'board-lifecycle')?.props as { node?: { attrs?: { viewId?: string } } })?.node?.attrs?.viewId)).toBe(boardView.id)
  expect(api.blocks.filter(item => item.type === 'database')).toHaveLength(1)
})

test('board renderer handles missing grouping and empty select options without table fallback', async ({ page }) => {
  const unconfigured = view('board-unconfigured', rootDatabase.id, 'Unconfigured', { ...DEFAULT_DATABASE_VIEW_CONFIG }, 'board')
  const empty = view('board-empty', rootDatabase.id, 'Empty', { ...DEFAULT_DATABASE_VIEW_CONFIG, options: { groupByPropertyId: 'root-select' } }, 'board')
  await installApi(page, [
    block('board-unconfigured-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: unconfigured.id } }, 100),
    block('board-empty-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: empty.id } }, 200),
  ], { databases: [rootDatabase], views: [unconfigured, empty], properties: rootProperties.map(item => item.id === 'root-select' ? { ...item, options: [] } : item), records: [] })
  await page.goto('/#/app/database-workspace/page/database-page')
  await expect(page.getByTestId('database-board')).toHaveCount(2)
  await expect(page.locator('#database-block-board-unconfigured-block')).toContainText('尚未配置分组属性')
  await expect(page.locator('#database-block-board-empty-block .eotion-database-board-column')).toHaveCount(1)
  await expect(page.locator('.eotion-database table')).toHaveCount(0)
})

test('Board drag preserves the current column while the cell update is pending', async ({ page }) => {
  const boardView = view('board-drag-pending-view', rootDatabase.id, 'Board', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { groupByPropertyId: 'root-select' },
  }, 'board')
  const api = await installApi(page, [
    block('board-drag-pending-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: boardView.id } }, 100),
  ], { databases: [rootDatabase], views: [boardView], properties: rootProperties, records: [basicRecord] })
  api.pages.push({ ...pageRecord, id: basicRecord.pageId, title: 'Launch plan', role: 'database-record' })
  let signalPatchStarted!: () => void
  let releasePatch!: () => void
  let pendingPatch: { method: string; payload: unknown } | undefined
  let holdBoardRefresh = false
  let signalBoardRefreshStarted!: () => void
  let releaseBoardRefresh!: () => void
  const patchStarted = new Promise<void>(resolve => { signalPatchStarted = resolve })
  const patchGate = new Promise<void>(resolve => { releasePatch = resolve })
  const boardRefreshStarted = new Promise<void>(resolve => { signalBoardRefreshStarted = resolve })
  const boardRefreshGate = new Promise<void>(resolve => { releaseBoardRefresh = resolve })
  await page.route(`**/records/${basicRecord.id}/cells/root-select`, async route => {
    pendingPatch = { method: route.request().method(), payload: route.request().postDataJSON() }
    signalPatchStarted()
    await patchGate
    await route.fallback()
  })
  await page.route(url => url.pathname.endsWith(`/views/${boardView.id}/table`), async route => {
    if (!holdBoardRefresh) return route.fallback()
    holdBoardRefresh = false
    signalBoardRefreshStarted()
    await boardRefreshGate
    await route.fallback()
  })
  await page.goto('/#/app/database-workspace/page/database-page')

  const board = page.getByTestId('database-board')
  const openColumn = board.locator('[data-option-id="status-open"]')
  const doneColumn = board.locator('[data-option-id="status-done"]')
  const card = openColumn.locator(`[data-record-id="${basicRecord.id}"]`)
  const picker = card.getByRole('button', { name: '移动记录分组' })
  try {
    await card.dragTo(doneColumn)
    await patchStarted
    await expect(openColumn.locator(`[data-record-id="${basicRecord.id}"]`)).toBeVisible()
    await expect(doneColumn.locator(`[data-record-id="${basicRecord.id}"]`)).toHaveCount(0)
    await expect(card).toHaveAttribute('draggable', 'false')
    await expect(picker).toBeDisabled()
    expect(pendingPatch).toEqual({ method: 'PATCH', payload: { value: 'status-done', expectedDatabaseVersion: 1, expectedRecordVersion: 1 } })
    expect(api.requests.filter(item => item.method === 'GET' && item.path.endsWith(`/views/${boardView.id}/table`))).toHaveLength(1)
  } finally {
    holdBoardRefresh = true
    releasePatch()
  }
  try {
    await boardRefreshStarted
    expect(api.requests.filter(item => item.method === 'GET' && item.path.endsWith(`/views/${boardView.id}/table`))).toHaveLength(1)
    api.records.find(item => item.id === basicRecord.id)!.properties['root-text'] = 'Changed during refresh'
    await page.evaluate(({ workspaceId, databaseId }) => window.dispatchEvent(new CustomEvent('eotion:database-updated', { detail: { workspaceId, databaseId } })), { workspaceId: workspace.id, databaseId: rootDatabase.id })
  } finally {
    releaseBoardRefresh()
  }
  await expect(doneColumn.locator(`[data-record-id="${basicRecord.id}"]`)).toBeVisible()
  await expect(doneColumn.locator(`[data-record-id="${basicRecord.id}"]`)).toContainText('Changed during refresh')
  await expect.poll(() => api.requests.filter(item => item.method === 'PATCH' && item.path.endsWith(`/records/${basicRecord.id}/cells/root-select`)).length).toBe(1)
  await expect.poll(() => api.requests.filter(item => item.method === 'GET' && item.path.endsWith(`/views/${boardView.id}/table`)).length).toBe(3)
  const update = api.requests.find(item => item.method === 'PATCH' && item.path.endsWith(`/records/${basicRecord.id}/cells/root-select`))
  expect(update?.payload).toEqual({ value: 'status-done', expectedDatabaseVersion: 1, expectedRecordVersion: 1 })
})

test('Board drag to the ungrouped column stores null and a same-column drop does nothing', async ({ page }) => {
  const boardView = view('board-drag-null-view', rootDatabase.id, 'Board', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { groupByPropertyId: 'root-select' },
  }, 'board')
  const api = await installApi(page, [
    block('board-drag-null-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: boardView.id } }, 100),
  ], { databases: [rootDatabase], views: [boardView], properties: rootProperties, records: [basicRecord] })
  api.pages.push({ ...pageRecord, id: basicRecord.pageId, title: 'Launch plan', role: 'database-record' })
  await page.goto('/#/app/database-workspace/page/database-page')

  const board = page.getByTestId('database-board')
  const openColumn = board.locator('[data-option-id="status-open"]')
  const ungroupedColumn = board.locator('[data-option-id=""]')
  const card = openColumn.locator(`[data-record-id="${basicRecord.id}"]`)
  await card.dragTo(openColumn)
  await expect(card).toBeVisible()
  expect(api.requests.filter(item => item.method === 'PATCH' && item.path.includes('/cells/'))).toHaveLength(0)

  await card.dragTo(ungroupedColumn)
  const ungroupedCard = ungroupedColumn.locator(`[data-record-id="${basicRecord.id}"]`)
  await expect(ungroupedCard).toBeVisible()
  const updates = api.requests.filter(item => item.method === 'PATCH' && item.path.endsWith(`/records/${basicRecord.id}/cells/root-select`))
  expect(updates).toHaveLength(1)
  expect(updates[0]?.payload).toEqual({ value: null, expectedDatabaseVersion: 1, expectedRecordVersion: 1 })
  expect(api.records.find(item => item.id === basicRecord.id)?.properties['root-select']).toBeNull()
  await ungroupedCard.dragTo(ungroupedColumn)
  expect(api.requests.filter(item => item.method === 'PATCH' && item.path.endsWith(`/records/${basicRecord.id}/cells/root-select`))).toHaveLength(1)
})

test('Board grouping picker clears a value on a 390px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const boardView = view('board-picker-null-view', rootDatabase.id, 'Board', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { groupByPropertyId: 'root-select' },
  }, 'board')
  const api = await installApi(page, [
    block('board-picker-null-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: boardView.id } }, 100),
  ], { databases: [rootDatabase], views: [boardView], properties: rootProperties, records: [basicRecord] })
  api.pages.push({ ...pageRecord, id: basicRecord.pageId, title: 'Launch plan', role: 'database-record' })
  await page.goto('/#/app/database-workspace/page/database-page')

  const board = page.getByTestId('database-board')
  const openColumn = board.locator('[data-option-id="status-open"]')
  const card = openColumn.locator(`[data-record-id="${basicRecord.id}"]`)
  await card.getByRole('button', { name: '移动记录分组' }).click()
  await page.getByRole('menu', { name: '移动记录分组' }).getByRole('menuitem', { name: '未分组', exact: true }).click()
  await expect(board.locator(`[data-option-id=""] [data-record-id="${basicRecord.id}"]`)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  expect(api.requests.filter(item => item.method === 'PATCH' && item.path.endsWith(`/records/${basicRecord.id}/cells/root-select`))).toHaveLength(1)
  expect(api.records.find(item => item.id === basicRecord.id)?.properties['root-select']).toBeNull()
})

test('board grouping mutation updates the record, keeps linked Table and List in sync, and preserves Table editing', async ({ page }) => {
  const boardView = view('board-mutation-view', rootDatabase.id, 'Board', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { groupByPropertyId: 'root-select' },
  }, 'board')
  const listView = view('board-mutation-list', rootDatabase.id, 'List', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    visibleProperties: ['root-select'],
    propertyOrder: ['root-select'],
  }, 'list')
  const moved = record('board-mutation-a', rootDatabase.id, 'board-mutation-page-a', { 'root-title': 'Move me', 'root-select': 'status-open' })
  const other = record('board-mutation-b', rootDatabase.id, 'board-mutation-page-b', { 'root-title': 'Stay here', 'root-select': 'status-open' })
  const alreadyDone = record('board-mutation-c', rootDatabase.id, 'board-mutation-page-c', { 'root-title': 'Already done', 'root-select': 'status-done' })
  const api = await installApi(page, [
    block('board-mutation-board-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: boardView.id } }, 100),
    block('board-mutation-table-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 200),
    block('board-mutation-list-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: listView.id } }, 300),
  ], {
    databases: [rootDatabase],
    views: [view('view-root-id', rootDatabase.id), boardView, listView],
    properties: rootProperties,
    records: [moved, other, alreadyDone],
  })
  api.pages.push(
    ...[moved, other, alreadyDone].map((item, index) => ({ ...pageRecord, id: item.pageId, title: String(item.properties['root-title']), orderKey: String(index + 2).padStart(16, '0'), role: 'database-record' as const })),
  )
  const originalViews = structuredClone(api.views)
  await page.goto('/#/app/database-workspace/page/database-page')

  const boardBlock = page.locator('#database-block-board-mutation-board-block')
  const tableBlock = page.locator('#database-block-board-mutation-table-block')
  const listBlock = page.locator('#database-block-board-mutation-list-block')
  const board = boardBlock.getByTestId('database-board')
  const openColumn = board.locator('[data-option-id="status-open"]')
  const doneColumn = board.locator('[data-option-id="status-done"]')
  const movedCard = openColumn.locator('[data-record-id="board-mutation-a"]')
  await expect(movedCard.getByRole('button', { name: '移动记录分组' })).toHaveAttribute('data-value', 'status-open')
  await expect(openColumn.locator('.eotion-database-board-card')).toHaveCount(2)
  await expect(doneColumn.locator('.eotion-database-board-card')).toHaveCount(1)
  await expect(tableBlock.getByRole('button', { name: '移动记录分组' })).toHaveCount(0)
  await expect(listBlock.getByRole('button', { name: '移动记录分组' })).toHaveCount(0)

  const boardRecordsPath = `/api/workspaces/${workspace.id}/databases/${rootDatabase.id}/views/${boardView.id}/table`
  const boardReadsBeforeDrag = api.requests.filter(item => item.method === 'GET' && item.path === boardRecordsPath).length
  await movedCard.dragTo(doneColumn)
  const movedDoneCard = doneColumn.locator('[data-record-id="board-mutation-a"]')
  await expect(movedDoneCard).toBeVisible()
  await expect.poll(() => api.requests.filter(item => item.method === 'GET' && item.path === boardRecordsPath).length).toBe(boardReadsBeforeDrag + 1)
  await expect(openColumn.locator('[data-record-id="board-mutation-b"]')).toBeVisible()
  await expect(doneColumn.locator('[data-record-id="board-mutation-c"]')).toBeVisible()
  await expect(movedDoneCard.getByRole('button', { name: '移动记录分组' })).toHaveAttribute('data-value', 'status-done')

  const cellUpdate = api.requests.find(item => item.method === 'PATCH' && item.path.endsWith(`/records/${moved.id}/cells/root-select`))
  expect(cellUpdate?.payload).toEqual({ value: 'status-done', expectedDatabaseVersion: 1, expectedRecordVersion: 1 })
  expect(api.records.find(item => item.id === moved.id)?.properties['root-select']).toBe('status-done')
  expect(api.records.find(item => item.id === other.id)?.properties['root-select']).toBe('status-open')
  expect(api.views).toEqual(originalViews)
  expect(api.requests.filter(item => ['POST', 'PATCH', 'DELETE'].includes(item.method) && item.path.includes('/databases/')).map(item => item.path)).toEqual([
    `/api/workspaces/${workspace.id}/databases/${rootDatabase.id}/records/${moved.id}/cells/root-select`,
  ])

  const tableRow = tableBlock.locator('tbody tr').filter({ hasText: 'Move me' })
  const listCard = listBlock.getByTestId('database-list').locator('.eotion-database-list-record').filter({ hasText: 'Move me' })
  await expect(tableRow.getByRole('button', { name: 'Done', exact: true })).toBeVisible()
  await expect(listCard).toContainText('Done')
  await expect(listCard.getByRole('button', { name: '移动记录分组' })).toHaveCount(0)

  await movedDoneCard.getByRole('button', { name: '打开记录：Move me' }).click()
  const drawer = page.locator('[data-overlay-mode="drawer"]')
  await expect(drawer).toBeVisible()
  const titleDraft = drawer.getByRole('textbox', { name: '记录标题' })
  await titleDraft.fill('Draft survives Board mutation')
  await page.locator('.eotion-editor-content').first().evaluate(element => element.setAttribute('data-board-mutation-lifecycle', 'stable'))
  await boardBlock.evaluate(element => element.setAttribute('data-board-mutation-lifecycle', 'stable'))
  await drawer.evaluate(element => element.setAttribute('data-board-mutation-lifecycle', 'stable'))
  const keyboardPicker = movedDoneCard.getByRole('button', { name: '移动记录分组' })
  await keyboardPicker.focus()
  await keyboardPicker.press('Enter')
  const keyboardMenu = page.getByRole('menu', { name: '移动记录分组' })
  const keyboardOption = keyboardMenu.getByRole('menuitem', { name: 'Open', exact: true })
  await keyboardOption.focus()
  await keyboardOption.press('Enter')
  await expect(openColumn.locator(`[data-record-id="${moved.id}"]`)).toBeVisible()
  await expect(drawer).toHaveAttribute('data-board-mutation-lifecycle', 'stable')
  await expect(boardBlock).toHaveAttribute('data-board-mutation-lifecycle', 'stable')
  await expect(page.locator('.eotion-editor-content').first()).toHaveAttribute('data-board-mutation-lifecycle', 'stable')
  await expect(titleDraft).toHaveValue('Draft survives Board mutation')

  await closeRecordSurface(page)
  const draftRow = tableBlock.locator('tbody tr').filter({ hasText: 'Draft survives Board mutation' })
  await chooseSelectCell(page, draftRow.getByRole('button', { name: 'Open', exact: true }), 'Done')
  await expect(draftRow.getByRole('button', { name: 'Done', exact: true })).toBeVisible()
  await expect.poll(() => api.records.find(item => item.id === moved.id)?.properties['root-select']).toBe('status-done')
})

test('failed Board drag keeps the card and selected option unchanged', async ({ page }) => {
  const boardView = view('board-mutation-failure-view', rootDatabase.id, 'Board', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { groupByPropertyId: 'root-select' },
  }, 'board')
  const api = await installApi(page, [
    block('board-mutation-failure-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: boardView.id } }, 100),
  ], {
    databases: [rootDatabase], views: [boardView], properties: rootProperties, records: [basicRecord], failCellUpdates: 1,
  })
  api.pages.push({ ...pageRecord, id: basicRecord.pageId, title: 'Launch plan', role: 'database-record' })
  const originalRecords = structuredClone(api.records)
  const originalViews = structuredClone(api.views)
  await page.goto('/#/app/database-workspace/page/database-page')

  const board = page.getByTestId('database-board')
  const openColumn = board.locator('[data-option-id="status-open"]')
  const openCard = openColumn.locator(`[data-record-id="${basicRecord.id}"]`)
  const doneColumn = board.locator('[data-option-id="status-done"]')
  await openCard.dragTo(doneColumn)

  await expect(page.getByRole('alert')).toBeVisible()
  await expect(openColumn.locator(`[data-record-id="${basicRecord.id}"]`)).toBeVisible()
  await expect(board.locator(`[data-option-id="status-done"] [data-record-id="${basicRecord.id}"]`)).toHaveCount(0)
  await expect(openCard.getByRole('button', { name: '移动记录分组' })).toHaveAttribute('data-value', 'status-open')
  expect(api.records).toEqual(originalRecords)
  expect(api.views).toEqual(originalViews)
  expect(api.requests.filter(item => item.method === 'PATCH' && item.path.includes('/databases/'))).toHaveLength(1)
})

test('Board drag conflict stays stale until refresh, then retries with fresh record versions', async ({ page }) => {
  const boardView = view('board-mutation-conflict-view', rootDatabase.id, 'Board', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { groupByPropertyId: 'root-select' },
  }, 'board')
  const api = await installApi(page, [
    block('board-mutation-conflict-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: boardView.id } }, 100),
  ], {
    databases: [rootDatabase], views: [boardView], properties: rootProperties, records: [basicRecord], conflictCellUpdates: 1,
  })
  api.pages.push({ ...pageRecord, id: basicRecord.pageId, title: 'Launch plan', role: 'database-record' })
  await page.goto('/#/app/database-workspace/page/database-page')

  const board = page.getByTestId('database-board')
  const openColumn = board.locator('[data-option-id="status-open"]')
  const doneColumn = board.locator('[data-option-id="status-done"]')
  const openCard = openColumn.locator(`[data-record-id="${basicRecord.id}"]`)
  const picker = openCard.getByRole('button', { name: '移动记录分组' })
  const boardRecordsPath = `/api/workspaces/${workspace.id}/databases/${rootDatabase.id}/views/${boardView.id}/table`
  await openCard.dragTo(doneColumn)

  const conflictAlert = page.getByRole('alert')
  await expect(conflictAlert).toContainText('请刷新后重新选择')
  await expect(openCard).toBeVisible()
  await expect(picker).toHaveAttribute('data-value', 'status-open')
  expect(api.records.find(item => item.id === basicRecord.id)?.properties['root-select']).toBe('Concurrent edit')

  const readsBeforeManualRefresh = api.requests.filter(item => item.method === 'GET' && item.path === boardRecordsPath).length
  await conflictAlert.getByRole('button', { name: '刷新记录' }).click()
  await expect.poll(() => api.requests.filter(item => item.method === 'GET' && item.path === boardRecordsPath).length).toBeGreaterThan(readsBeforeManualRefresh)
  const unassignedColumn = board.locator('[data-option-id=""]')
  const refreshedCard = unassignedColumn.locator(`[data-record-id="${basicRecord.id}"]`)
  await expect(refreshedCard).toBeVisible()
  const refreshedPicker = refreshedCard.getByRole('button', { name: '移动记录分组' })
  await expect(refreshedPicker).toHaveAttribute('data-value', '')

  await refreshedCard.dragTo(doneColumn)
  await expect(doneColumn.locator(`[data-record-id="${basicRecord.id}"]`)).toBeVisible()
  expect(api.records.find(item => item.id === basicRecord.id)?.properties['root-select']).toBe('status-done')
  const cellUpdates = api.requests.filter(item => item.method === 'PATCH' && item.path.endsWith(`/records/${basicRecord.id}/cells/root-select`))
  expect(cellUpdates).toHaveLength(2)
  expect(cellUpdates[0]?.payload).toEqual({ value: 'status-done', expectedDatabaseVersion: 1, expectedRecordVersion: 1 })
  expect(cellUpdates[1]?.payload).toEqual({ value: 'status-done', expectedDatabaseVersion: 2, expectedRecordVersion: 2 })
})

test('unconfigured Board stays read-only and exposes no grouping mutation control', async ({ page }) => {
  const boardView = view('board-mutation-unconfigured-view', rootDatabase.id, 'Board', { ...DEFAULT_DATABASE_VIEW_CONFIG }, 'board')
  const api = await installApi(page, [
    block('board-mutation-unconfigured-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: boardView.id } }, 100),
  ], { databases: [rootDatabase], views: [boardView], properties: rootProperties, records: [basicRecord] })
  await page.goto('/#/app/database-workspace/page/database-page')

  const board = page.getByTestId('database-board')
  await expect(board).toContainText('尚未配置分组属性')
  await expect(board.getByRole('button', { name: '移动记录分组' })).toHaveCount(0)
  expect(api.requests.filter(item => ['POST', 'PATCH', 'DELETE'].includes(item.method) && item.path.includes('/databases/'))).toHaveLength(0)
})

test('Board with a non-select grouping property remains read-only', async ({ page }) => {
  await page.goto('/login')
  await page.evaluate(async () => {
    const Vue = await import('/node_modules/.vite/deps/vue.js')
    const { default: DatabaseBoardView } = await import('/src/components/editor/DatabaseBoardView.vue')
    const host = document.createElement('div')
    host.id = 'non-select-board-test'
    document.body.append(host)
    const app = Vue.createApp({
      render: () => Vue.h(DatabaseBoardView, {
        records: [{ id: 'non-select-record', databaseId: 'database-root-id', workspaceId: 'database-workspace', pageId: 'non-select-page', properties: { 'root-title': 'Read only', 'root-text': 'Text grouping' }, version: 1, pageVersion: '2026-09-30T00:00:00.000Z', createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T00:00:00.000Z' }],
        properties: [
          { id: 'root-title', databaseId: 'database-root-id', workspaceId: 'database-workspace', name: 'Name', type: 'title' },
          { id: 'root-text', databaseId: 'database-root-id', workspaceId: 'database-workspace', name: 'Notes', type: 'text' },
        ],
        config: { filters: [], sorts: [], visibleProperties: null, propertyOrder: null, options: { groupByPropertyId: 'root-text' } },
        formatValue: (value: unknown) => value == null ? '' : String(value),
        writable: true,
        'onOpenRecord': () => undefined,
      }),
    })
    app.mount(host)
  })

  const board = page.locator('#non-select-board-test .eotion-database-board')
  await expect(board).toContainText('尚未配置分组属性')
  await expect(board.getByRole('button', { name: '移动记录分组' })).toHaveCount(0)
})

test('list view renders projected titles and ordered visible properties at desktop and phone widths', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const listConfig: DatabaseViewConfig = {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    visibleProperties: ['root-title', 'root-number', 'root-text'],
    propertyOrder: ['root-title', 'root-text', 'root-number'],
  }
  const listView = view('list-view-id', rootDatabase.id, 'List view', listConfig, 'list')
  const api = await installApi(page, [
    block('list-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: listView.id } }, 100),
  ], { databases: [rootDatabase], views: [listView], properties: rootProperties, records: [basicRecord] })
  api.pages.push({ ...pageRecord, id: basicRecord.pageId, title: 'Projected page title', orderKey: '0000000000000002', role: 'database-record' })
  await page.goto('/#/app/database-workspace/page/database-page')

  const list = page.getByTestId('database-list')
  await expect(list).toBeVisible()
  await expect(list.locator('.eotion-database-list-title-text')).toHaveText('Projected page title')
  await expect(list.locator('.eotion-database-list-property dt')).toHaveText(['Notes', 'Points'])
  await expect(list.locator('.eotion-database-list-property dd')).toHaveText(['Draft ready', '42'])
  await expect(list.locator('.eotion-database-list-property dt', { hasText: 'Done' })).toHaveCount(0)
  await expect(list.getByRole('button', { name: '打开记录：Projected page title' })).toBeVisible()

  const desktopColumns = await list.locator('.eotion-database-list-record').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)
  expect(desktopColumns).toBe(2)
  await page.setViewportSize({ width: 390, height: 844 })
  const phoneColumns = await list.locator('.eotion-database-list-record').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)
  expect(phoneColumns).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)

  await list.getByRole('button', { name: '打开记录：Projected page title' }).click()
  await expect(page.getByRole('button', { name: '关闭记录' })).toBeVisible()
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
  await expect(references.first().locator('th .eotion-database-header-name')).toHaveText(['名称', 'Notes', 'Points', 'Done', 'Status', 'Due'])
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

  await table.getByRole('button', { name: '属性设置 Due' }).click()
  await page.getByRole('menu', { name: '属性设置: Due' }).getByRole('menuitem', { name: '重命名' }).click()
  const dueEditor = table.getByRole('textbox', { name: '属性名称 Due' })
  await dueEditor.fill('Deadline')
  await screenshot(page, 'p83-desktop-light-property-menu')
  await dueEditor.press('Enter')
  await expect(table.locator('.eotion-database-header-name[data-property-id="root-date"]')).toHaveText('Deadline')
  await table.getByRole('button', { name: '2026-10-04' }).click()
  const dateInput = table.getByRole('textbox', { name: 'Deadline 值' })
  await dateInput.fill('2026-11-05')
  await dateInput.press('Enter')
  await expect(table.getByRole('button', { name: '2026-11-05' })).toBeVisible()
  await table.getByRole('button', { name: '2026-11-05' }).click()
  await table.getByRole('button', { name: '清除' }).click()
  await expect(table.locator('tbody tr').first().locator('td').nth(5).getByRole('button', { name: '', exact: true })).toBeVisible()
  expect(pageErrors).toEqual([])

  await openDatabaseSetting(page, table, '属性')
  let optionPanel = page.getByRole('group', { name: '属性管理' })
  await optionPanel.getByRole('button', { name: '管理选项 Status' }).click()
  let selectOptions = page.getByRole('dialog', { name: '选择选项：Status' })
  await screenshot(page, 'p83-desktop-light-select-menu')
  const optionInput = selectOptions.getByRole('textbox', { name: '新选项名称' })
  await optionInput.fill('Review')
  await selectOptions.getByRole('button', { name: '添加', exact: true }).click()
  const reviewOption = api.properties.find((item) => item.id === 'root-select')?.options?.find((item) => item.name === 'Review')
  expect(reviewOption?.id).toBeTruthy()
  await page.keyboard.press('Escape')
  await expect(selectOptions).toHaveCount(0)
  await expect(optionPanel).toBeVisible()
  await optionPanel.getByRole('button', { name: '管理选项 Status' }).click()
  selectOptions = page.getByRole('dialog', { name: '选择选项：Status' })
  await expect(selectOptions.locator('.eotion-database-option-edit').filter({ hasText: 'Review' })).toBeVisible()
  const openOption = api.properties.find((item) => item.id === 'root-select')?.options?.find((item) => item.name === 'Open')
  await selectOptions.locator('.eotion-database-option-edit').filter({ hasText: 'Open' }).getByRole('button', { name: '重命名' }).click()
  await page.getByRole('textbox', { name: '重命名选项 Open' }).fill('Opened')
  await selectOptions.locator('.eotion-database-option-edit').filter({ has: page.getByRole('textbox', { name: '重命名选项 Open' }) }).getByRole('button', { name: '保存' }).click()
  expect(api.properties.find((item) => item.id === 'root-select')?.options?.find((item) => item.name === 'Opened')?.id).toBe(openOption?.id)
  await expect(selectOptions.locator('.eotion-database-option-edit').filter({ hasText: 'Opened' })).toBeVisible()
  await selectOptions.locator('.eotion-database-option-edit').filter({ hasText: 'Review' }).getByRole('button', { name: '删除' }).click()
  expect(api.properties.find((item) => item.id === 'root-select')?.options?.some((item) => item.id === reviewOption?.id)).toBe(false)
  await page.keyboard.press('Escape')
  await closeDatabaseSetting(page, '属性管理')

  await table.getByRole('button', { name: '属性设置 Points' }).click()
  await page.getByRole('menu', { name: '属性设置: Points' }).getByRole('menuitem', { name: '删除' }).click()
  const pointsDialog = page.getByRole('dialog', { name: '删除属性“Points”' })
  await pointsDialog.getByRole('button', { name: '删除属性' }).click()
  await expect(table.locator('.eotion-database-header-name[data-property-id="root-number"]')).toHaveCount(0)
  expect(api.records[0]?.properties['root-number']).toBeUndefined()
  expect(api.requests.some(({ method, path }) => method === 'DELETE' && path.endsWith('/properties/root-number'))).toBe(true)
  await openDatabaseSetting(page, table, '属性')
  await page.getByRole('group', { name: '属性管理' }).getByRole('button', { name: '新增属性' }).click()
  await page.getByRole('button', { name: '文本', exact: true }).click()
  await expect(table.locator('.eotion-database-header-name').filter({ hasText: /^文本$/ })).toBeVisible()
  await closeDatabaseSetting(page, '属性管理')
  const contextEditor = await beginPropertyRename(page, table, '文本')
  await contextEditor.fill('Context')
  await contextEditor.press('Enter')
  await expect(table.locator('.eotion-database-header-name').filter({ hasText: /^Context$/ })).toBeVisible()
  const contextPropertyId = api.properties.find(item => item.name === 'Context')?.id
  expect(contextPropertyId).toBeTruthy()
  await table.getByRole('button', { name: '属性设置 Context' }).click()
  await page.getByRole('menu', { name: '属性设置: Context' }).getByRole('menuitem', { name: '删除' }).click()
  const contextDialog = page.getByRole('dialog', { name: '删除属性“Context”' })
  await contextDialog.getByRole('button', { name: '删除属性' }).click()
  await expect(table.locator('.eotion-database-header-name').filter({ hasText: /^Context$/ })).toHaveCount(0)
  expect(api.properties.some(item => item.id === contextPropertyId)).toBe(false)
  await page.reload()
  await expect(page.locator('.eotion-editor-content .eotion-database')).toContainText('Planning')
  await expect(page.locator('.eotion-editor-content .eotion-database')).toContainText('Revised notes')
  await installLocalBlockReader(page)
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await table.getByRole('button', { name: '属性设置 Deadline' }).click()
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
  await expect(table.locator('.eotion-database-header-name').filter({ hasText: '公式' })).toBeVisible()
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
  await expect(table.locator('.eotion-database-header-name').filter({ hasText: '公式' })).toHaveCount(1)
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
