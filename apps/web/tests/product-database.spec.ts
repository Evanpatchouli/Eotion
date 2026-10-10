import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Page, type Route } from '@playwright/test'
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
      return json(route, 200, { pages: api.pages, blocks: api.blocks })
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
      const records = remainingRecords.slice(0, limit)
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
      const titlePage: PageResponse = { ...pageRecord, id: input.pageId, title: input.title, orderKey: input.orderKey }
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
      if (operation.kind === 'block.upsert') {
        const existing = index >= 0 ? api.blocks[index] : undefined
        const value: BlockResponse = { ...payload, workspaceId: operation.workspaceId, parentBlockId: payload.parentBlockId ?? null, createdAt: existing?.createdAt ?? now, updatedAt: later }
        if (index < 0) api.blocks.push(value)
        else api.blocks[index] = value
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

async function submitNewRecord(table: ReturnType<Page['locator']>, title: string) {
  await table.getByRole('button', { name: '+ 新建记录' }).click()
  await table.getByRole('textbox', { name: '记录标题' }).fill(title)
  await table.getByRole('button', { name: '创建', exact: true }).click()
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
  await expect(viewsMenu.getByRole('button', { name: 'Table' })).toBeVisible()
  await viewsMenu.getByRole('button', { name: '＋ 新建视图' }).click()
  await expect(table.locator('.eotion-database-copy small')).toHaveText('表格 2')
  expect(api.views).toHaveLength(2)
  expect(api.requests.some(({ method, path, payload }) => method === 'POST' && path.endsWith(`/databases/${rootDatabase.id}/views`) && payload?.expectedDatabaseVersion === 1)).toBe(true)

  await table.getByRole('button', { name: '切换视图' }).click()
  const renameMenu = page.locator('.eotion-database-view-menu')
  await renameMenu.getByRole('textbox', { name: '当前视图名称' }).fill('Quarterly')
  await renameMenu.getByRole('button', { name: '保存名称' }).click()
  await expect(table.locator('.eotion-database-copy small')).toHaveText('Quarterly')
  expect(api.views.find(item => item.name === 'Quarterly')?.version).toBe(2)

  await expect(page.locator('.eotion-database-view-menu')).toBeVisible()
  await page.locator('.eotion-database-view-menu').getByRole('button', { name: /^Table/u }).click()
  await expect(table.locator('.eotion-database-copy small')).toHaveText('Table')
  await expect.poll(() => api.blocks.find(item => item.id === 'view-lifecycle')?.props.node?.attrs).toEqual({ databaseId: rootDatabase.id, viewId: 'view-root-id' })

  expect(api.blocks.filter(item => item.type === 'database' && (item.props.node?.attrs as { viewId?: string } | undefined)?.viewId === 'view-root-id')).toHaveLength(2)
  await table.getByRole('button', { name: '切换视图' }).click()
  await page.locator('.eotion-database-view-menu').getByRole('button', { name: '删除视图' }).click()
  await expect.poll(() => api.requests.some(({ method, path }) => method === 'DELETE' && path.endsWith('/views/view-root-id'))).toBe(true)
  await expect.poll(() => api.views).toHaveLength(2)
  await expect(page.getByRole('alert')).toContainText('仍被其它数据库块引用')
  await expect(table.locator('.eotion-database-copy small')).toHaveText('Quarterly')

  await tables.nth(1).getByRole('button', { name: '切换视图' }).click()
  await page.locator('.eotion-database-view-menu').getByRole('button', { name: 'Quarterly' }).click()
  await expect(tables.nth(1).locator('.eotion-database-copy small')).toHaveText('Quarterly')
  await tables.nth(1).getByRole('button', { name: '切换视图' }).click()
  await page.locator('.eotion-database-view-menu').getByRole('button', { name: /^Table/u }).click()
  await expect(tables.nth(1).locator('.eotion-database-copy small')).toHaveText('Table')
  await tables.nth(1).getByRole('button', { name: '切换视图' }).click()
  const deleteMenu = page.locator('.eotion-database-view-menu')
  await deleteMenu.getByRole('button', { name: '删除视图' }).click()
  await expect.poll(() => api.views.map(item => item.name)).toEqual(['Quarterly'])
  expect(api.requests.some(({ method, path }) => method === 'DELETE' && path.endsWith('/views/view-root-id'))).toBe(true)

  await table.getByRole('button', { name: '切换视图' }).click()
  await page.locator('.eotion-database-view-menu').getByRole('button', { name: '＋ 新建视图' }).click()
  await expect(table.locator('.eotion-database-copy small')).toHaveText('表格 2')
  await table.getByRole('button', { name: '切换视图' }).click()
  await page.locator('.eotion-database-view-menu').getByRole('button', { name: '删除视图' }).click()
  await expect(table.locator('.eotion-database-copy small')).toHaveText('Quarterly')
  await expect.poll(() => api.views.map(item => item.name)).toEqual(['Quarterly'])
  await expect.poll(() => api.blocks.find(item => item.id === 'view-lifecycle')?.props.node?.attrs).toEqual({ databaseId: rootDatabase.id, viewId: api.views[0]?.id })

  await page.reload()
  await expect(page.locator('.eotion-editor-content .eotion-database').nth(0).locator('.eotion-database-copy small')).toHaveText('Quarterly')
  await page.locator('.eotion-editor-content .eotion-database').nth(0).getByRole('button', { name: '切换视图' }).click()
  const lastViewMenu = page.locator('.eotion-database-view-menu')
  await expect(lastViewMenu.getByRole('button', { name: '删除视图' })).toBeDisabled()
})

test('linked views keep independent server filters, multi-sort order and column layout', async ({ page, context }) => {
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
  await page.locator('.eotion-database-view-menu').getByRole('button', { name: '＋ 新建视图' }).click()
  await expect(tables.nth(1).locator('.eotion-database-copy small')).toHaveText('表格 2')
  await expect(tables.nth(0).locator('.eotion-database-copy small')).toHaveText('Table')

  await tables.nth(1).getByRole('button', { name: '筛选' }).click()
  const filterPanel = page.getByRole('group', { name: '筛选条件' })
  await screenshot(page, 'p84-database-filter-desktop')
  await filterPanel.getByRole('button', { name: '＋ 添加筛选条件' }).click()
  await filterPanel.getByRole('combobox', { name: '筛选属性 1' }).selectOption('root-select')
  await filterPanel.getByRole('combobox', { name: '筛选值 1' }).selectOption('status-done')
  await filterPanel.getByRole('button', { name: '保存筛选' }).click()
  await expect(page.getByRole('alert')).toContainText('View temporarily unavailable')
  await expect(filterPanel.getByRole('combobox', { name: '筛选值 1' })).toHaveValue('status-done')
  await filterPanel.getByRole('button', { name: '保存筛选' }).click()
  await expect(tables.nth(1).locator('tbody tr')).toHaveCount(4)
  await expect(tables.nth(1)).not.toContainText('Open task')
  expect(api.views.find(item => item.id !== 'view-root-id')?.config.filters).toEqual([{ propertyId: 'root-select', operator: 'is', value: 'status-done' }])
  await expect(tables.nth(0).locator('tbody tr')).toHaveCount(5)

  await tables.nth(1).getByRole('button', { name: '排序' }).click()
  const sortPanel = page.getByRole('group', { name: '排序条件' })
  await screenshot(page, 'p84-database-sort-desktop')
  await sortPanel.getByRole('button', { name: '＋ 添加排序' }).click()
  await sortPanel.getByRole('combobox', { name: '排序属性 1' }).selectOption('root-number')
  await sortPanel.getByRole('combobox', { name: '排序方向 1' }).selectOption('desc')
  await sortPanel.getByRole('button', { name: '＋ 添加排序' }).click()
  await sortPanel.getByRole('button', { name: '保存排序' }).click()
  await expect(tables.nth(1).locator('tbody tr').nth(0)).toContainText('Beta done')
  await expect(tables.nth(1).locator('tbody tr').nth(1)).toContainText('Delta done')
  await expect(tables.nth(1).locator('tbody tr').nth(2)).toContainText('Alpha done')
  await expect(tables.nth(1).locator('tbody tr').nth(3)).toContainText('Empty done')
  const configuredView = api.views.find(item => item.id !== 'view-root-id')!
  expect(configuredView.config.sorts).toEqual([{ propertyId: 'root-number', direction: 'desc' }, { propertyId: 'root-title', direction: 'asc' }])

  await tables.nth(1).getByRole('button', { name: '排序' }).click()
  const reorderPanel = page.getByRole('group', { name: '排序条件' })
  await reorderPanel.getByRole('button', { name: '排序下移 1' }).click()
  await reorderPanel.getByRole('button', { name: '保存排序' }).click()
  await expect(tables.nth(1).locator('tbody tr').nth(0)).toContainText('Alpha done')
  expect(configuredView.config.sorts[0]?.propertyId).toBe('root-title')

  await tables.nth(1).getByRole('button', { name: '视图列设置' }).click()
  const columnsPanel = page.getByRole('group', { name: '列设置' })
  await screenshot(page, 'p84-database-columns-desktop')
  await columnsPanel.getByRole('checkbox', { name: 'Notes' }).uncheck()
  for (let index = 0; index < 3; index += 1) await columnsPanel.getByRole('button', { name: '列上移 Due' }).click()
  await columnsPanel.getByRole('button', { name: '保存列设置' }).click()
  const headers = await tables.nth(1).locator('thead th').allTextContents()
  expect(headers.some(header => header.includes('Notes'))).toBe(false)
  expect(headers.indexOf('Due⌄')).toBeLessThan(headers.indexOf('Points⌄'))
  expect(await tables.nth(0).locator('thead th').allTextContents()).toContain('Notes⌄')
  expect(configuredView.config.visibleProperties).not.toContain('root-text')

  await tables.nth(0).getByRole('button', { name: 'Open', exact: true }).click()
  await page.locator('.eotion-database-cell-menu').getByRole('button', { name: 'Done', exact: true }).click()
  await expect(tables.nth(1).locator('tbody tr')).toHaveCount(5)
  await tables.nth(0).locator('tbody tr').filter({ hasText: 'Beta done' }).getByRole('button', { name: 'Done', exact: true }).click()
  await page.locator('.eotion-database-cell-menu').getByRole('button', { name: 'Open', exact: true }).click()
  await expect(tables.nth(1).locator('tbody tr')).toHaveCount(4)
  await expect(tables.nth(0).locator('tbody tr')).toHaveCount(5)

  await expect.poll(() => api.blocks.find(item => item.id === 'linked-view-two')?.props.node?.attrs).not.toEqual({ databaseId: rootDatabase.id, viewId: 'view-root-id' })
  await page.reload()
  const reloadedTables = page.locator('.eotion-editor-content .eotion-database')
  await expect(reloadedTables.nth(1).locator('.eotion-database-copy small')).toHaveText('表格 2')
  const reloadedHeaders = await reloadedTables.nth(1).locator('thead th').allTextContents()
  expect(reloadedHeaders.some(header => header.includes('Notes'))).toBe(false)
  await expect(reloadedTables.nth(1).locator('tbody tr')).toHaveCount(4)

  const filterButton = tables.nth(1).getByRole('button', { name: /筛选/u })
  await filterButton.click()
  await expect(page.getByRole('group', { name: '筛选条件' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('group', { name: '筛选条件' })).toHaveCount(0)
  await expect(filterButton).toBeFocused()
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await filterButton.click()
  await screenshot(page, 'p84-database-filter-dark')
  await page.keyboard.press('Escape')
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  await page.setViewportSize({ width: 390, height: 844 })
  await filterButton.click()
  await screenshot(page, 'p84-database-filter-mobile-390')
  const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
  expect(overflow.width).toBeLessThanOrEqual(overflow.client)
  await page.keyboard.press('Escape')
  await tables.nth(1).getByRole('button', { name: /排序/u }).click()
  await screenshot(page, 'p84-database-sort-mobile-390')
  await page.keyboard.press('Escape')
  await tables.nth(1).getByRole('button', { name: '视图列设置' }).click()
  await screenshot(page, 'p84-database-columns-mobile-390')
  await page.keyboard.press('Escape')
  const mutationCount = api.requests.filter(({ method, path }) => ['POST', 'PATCH', 'DELETE'].includes(method) && path.includes(`/databases/${rootDatabase.id}/views`)).length
  await context.setOffline(true)
  api.offline = true
  await expect(tables.nth(1).getByRole('button', { name: '切换视图' })).toBeDisabled()
  await expect(tables.nth(1).getByRole('button', { name: /筛选/u })).toBeDisabled()
  await expect(tables.nth(1).getByRole('button', { name: /排序/u })).toBeDisabled()
  await expect(tables.nth(1).getByRole('button', { name: '视图列设置' })).toBeDisabled()
  expect(api.requests.filter(({ method, path }) => ['POST', 'PATCH', 'DELETE'].includes(method) && path.includes(`/databases/${rootDatabase.id}/views`))).toHaveLength(mutationCount)
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
  await expect(references.first().locator('th button.eotion-database-property-trigger')).toHaveText(['Name', 'Notes', 'Points', 'Done', 'Status', 'Due'])
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
  await installApi(page, [])
  await page.goto('/#/app/database-workspace/page/database-page')
  await startDatabaseSlash(page)
  const dialog = page.getByRole('dialog', { name: '数据库' })
  await dialog.getByRole('button', { name: '创建新数据库' }).click()
  await expect(dialog.getByRole('textbox', { name: '数据库名称' })).toBeVisible()
  const bounds = await dialog.boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.y).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844)
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
  await page.getByRole('button', { name: 'Table', exact: true }).click()
  const table = page.locator('.eotion-editor-content .tiptap .eotion-database')
  await expect(table).toContainText('Launch plan')
  expect(api.databases).toHaveLength(1)
  expect(api.records).toHaveLength(1)
  expect(api.properties).toHaveLength(6)
  const linked = api.blocks.find((item) => item.type === 'database')
  expect((linked?.props as any)?.node?.attrs).toEqual({ databaseId: rootDatabase.id, viewId: 'view-root-id' })
  await submitNewRecord(table, 'First record')
  await expect.poll(() => api.records).toHaveLength(2)
  await expect.poll(() => api.pages.some((item) => item.title === 'First record')).toBe(true)
  await expect(table).toContainText('First record')
  await expect.poll(() => api.requests.some(({ method, path }) => method === 'POST' && path.endsWith(`/databases/${rootDatabase.id}/records`))).toBe(true)
  expect(api.databases).toHaveLength(1)
  expect(api.properties).toHaveLength(6)
})

test('record title refreshes a missing page before opening its ordinary editor', async ({ page }) => {
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
  await table.getByRole('link', { name: '打开记录页面：Launch plan' }).click()
  await expect(page).toHaveURL(new RegExp(`/page/${basicRecord.pageId}$`, 'u'))
  await expect(page.locator('.eotion-editor-content .tiptap')).toBeVisible()
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

  await submitNewRecord(tables.nth(0), 'Shared record')
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
  await submitNewRecord(table, 'Snapshot warning')
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

  await table.getByRole('button', { name: '编辑Name' }).click()
  let titleInput = table.getByRole('textbox', { name: 'Name 值' })
  await titleInput.fill('Planning')
  await expect(titleInput).toBeFocused()
  await screenshot(page, 'p83-desktop-light-cell-edit')
  await titleInput.press('Enter')
  await expect(table.getByRole('button', { name: '编辑Name：Planning' })).toBeVisible()
  expect(api.pages.find((item) => item.id === seededRecord.pageId)?.title).toBe('Planning')

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
  await expect(table.locator('tbody tr').first().locator('td').nth(2).getByRole('button', { name: '—', exact: true })).toBeVisible()
  expect(api.records[0]?.properties['root-number']).toBeNull()

  const checkCell = table.locator('tbody tr').first().locator('td').nth(3).getByRole('button', { name: '—', exact: true })
  await expect(checkCell).toHaveAttribute('aria-pressed', 'false')
  await checkCell.click()
  await expect(table.getByRole('button', { name: '已完成' })).toHaveAttribute('aria-pressed', 'true')
  await table.getByRole('button', { name: '已完成' }).click()
  await expect(table.getByRole('button', { name: '未完成' })).toHaveAttribute('aria-pressed', 'false')

  await table.getByRole('button', { name: 'Open' }).click()
  await expect(page.locator('body > .eotion-database-popover')).toBeVisible()
  await page.getByRole('button', { name: 'Done', exact: true }).last().click()
  await expect(table.getByRole('button', { name: 'Done', exact: true })).toBeVisible()
  await table.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('button', { name: '清除' }).click()
  await expect(table.locator('tbody tr').first().locator('td').nth(4).getByRole('button', { name: '—', exact: true })).toBeVisible()

  await table.getByRole('button', { name: 'Due⌄' }).click()
  await page.getByRole('textbox', { name: '属性名称' }).fill('Deadline')
  await screenshot(page, 'p83-desktop-light-property-menu')
  await page.getByRole('button', { name: '重命名', exact: true }).click()
  await expect(table.getByRole('button', { name: 'Deadline⌄' })).toBeVisible()
  await table.getByRole('button', { name: '2026-10-04' }).click()
  const dateInput = table.getByRole('textbox', { name: 'Deadline 值' })
  await dateInput.fill('2026-11-05')
  await dateInput.press('Enter')
  await expect(table.getByRole('button', { name: '2026-11-05' })).toBeVisible()
  await table.getByRole('button', { name: '2026-11-05' }).click()
  await table.getByRole('button', { name: '清除' }).click()
  await expect(table.locator('tbody tr').first().locator('td').nth(5).getByRole('button', { name: '—', exact: true })).toBeVisible()

  await table.getByRole('button', { name: 'Status⌄' }).click()
  await screenshot(page, 'p83-desktop-light-select-menu')
  const optionInput = page.getByRole('textbox', { name: '新选项名称' })
  await optionInput.fill('Review')
  await page.getByRole('button', { name: '添加', exact: true }).click()
  const reviewOption = api.properties.find((item) => item.id === 'root-select')?.options?.find((item) => item.name === 'Review')
  expect(reviewOption?.id).toBeTruthy()
  await table.getByRole('button', { name: 'Status⌄' }).click()
  await expect(page.locator('.eotion-database-option-edit').filter({ hasText: 'Review' })).toBeVisible()
  const openOption = api.properties.find((item) => item.id === 'root-select')?.options?.find((item) => item.name === 'Open')
  await page.locator('.eotion-database-option-edit').filter({ hasText: 'Open' }).getByRole('button', { name: '重命名' }).click()
  await page.getByRole('textbox', { name: '重命名选项 Open' }).fill('Opened')
  await page.locator('.eotion-database-option-edit').filter({ has: page.getByRole('textbox', { name: '重命名选项 Open' }) }).getByRole('button', { name: '保存' }).click()
  expect(api.properties.find((item) => item.id === 'root-select')?.options?.find((item) => item.name === 'Opened')?.id).toBe(openOption?.id)
  await table.getByRole('button', { name: 'Status⌄' }).click()
  await expect(page.locator('.eotion-database-option-edit').filter({ hasText: 'Opened' })).toBeVisible()
  await page.locator('.eotion-database-option-edit').filter({ hasText: 'Review' }).getByRole('button', { name: '删除' }).click()
  expect(api.properties.find((item) => item.id === 'root-select')?.options?.some((item) => item.id === reviewOption?.id)).toBe(false)

  await table.getByRole('button', { name: 'Points⌄' }).click()
  await page.getByRole('button', { name: '删除属性' }).click()
  await expect(table.getByRole('button', { name: 'Points⌄' })).toHaveCount(0)
  expect(api.records[0]?.properties['root-number']).toBeUndefined()
  expect(api.requests.some(({ method, path }) => method === 'DELETE' && path.endsWith('/properties/root-number'))).toBe(true)
  await table.getByRole('button', { name: '属性' }).click()
  await page.getByRole('button', { name: '文本', exact: true }).click()
  await expect(table.getByRole('button', { name: '文本⌄' })).toBeVisible()
  await table.getByRole('button', { name: '文本⌄' }).click()
  await page.getByRole('textbox', { name: '属性名称' }).fill('Context')
  await page.getByRole('button', { name: '重命名', exact: true }).click()
  await expect(table.getByRole('button', { name: 'Context⌄' })).toBeVisible()
  await table.getByRole('button', { name: 'Context⌄' }).click()
  await page.getByRole('button', { name: '删除属性' }).click()
  await expect(table.getByRole('button', { name: 'Context⌄' })).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.eotion-editor-content .eotion-database')).toContainText('Planning')
  await expect(page.locator('.eotion-editor-content .eotion-database')).toContainText('Revised notes')
  await installLocalBlockReader(page)
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await table.getByRole('button', { name: 'Deadline⌄' }).click()
  await screenshot(page, 'p83-desktop-dark-property-menu')
  api.offline = true
  const writesBeforeOffline = api.requests.filter(({ method, path }) => path.includes('/databases/') && (method === 'POST' || method === 'PATCH' || method === 'DELETE')).length
  await context.setOffline(true)
  await expect(table.getByRole('status')).toContainText('数据库只读')
  await expect(table.getByRole('button', { name: '属性' })).toBeDisabled()
  await expect(table.getByRole('button', { name: '编辑Name：Planning' })).toBeDisabled()
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

test('empty new-record titles send no request and Escape cancels title entry', async ({ page }) => {
  const api = await installApi(page, [
    block('empty-title-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: rootProperties, records: [basicRecord] })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  await table.getByRole('button', { name: '+ 新建记录' }).click()
  const titleInput = table.getByRole('textbox', { name: '记录标题' })
  await titleInput.fill('   ')
  await expect(table.getByRole('button', { name: '创建', exact: true })).toBeDisabled()
  await titleInput.evaluate((element) => element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true, keyCode: 229 })))
  expect(api.requests.filter(({ method, path }) => method === 'POST' && path.endsWith(`/databases/${rootDatabase.id}/records`))).toHaveLength(0)
  await titleInput.press('Enter')
  expect(api.requests.filter(({ method, path }) => method === 'POST' && path.endsWith(`/databases/${rootDatabase.id}/records`))).toHaveLength(0)
  await titleInput.press('Escape')
  await expect(table.getByRole('button', { name: '+ 新建记录' })).toBeVisible()
})

test('missing constructor-like property IDs render as empty values', async ({ page }) => {
  const inheritedProperty = property('constructor', rootDatabase.id, 'Inherited field', 'text')
  const api = await installApi(page, [
    block('constructor-property-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: [...rootProperties, inheritedProperty], records: [basicRecord] })
  await page.goto('/#/app/database-workspace/page/database-page')
  const table = page.locator('.eotion-editor-content .eotion-database')
  const inheritedCell = table.locator('tbody tr td').nth(6)
  await expect(inheritedCell).toHaveText('—')
  await inheritedCell.getByRole('button', { name: '—' }).click()
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
  await submitNewRecord(tables.nth(0), 'Uncertain title')
  const message = '上次记录创建结果尚未确认，请联网并刷新页面后确认。'
  await expect(tables.nth(0).getByRole('alert')).toContainText(message)
  await expect(tables.nth(0).getByRole('button', { name: '+ 新建记录' })).toBeDisabled()
  await expect(tables.nth(1).getByRole('button', { name: '+ 新建记录' })).toBeDisabled()
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
  await submitNewRecord(table, 'Auth switch')
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
  await expect(table.getByRole('button', { name: '+ 新建记录' })).toBeDisabled()
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
  await submitNewRecord(page.locator('.eotion-editor-content .eotion-database'), 'Workspace switch')
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
  await table.getByRole('button', { name: '添加属性' }).click()
  await page.getByRole('group', { name: '添加属性类型' }).getByRole('button', { name: '关联' }).click()
  const config = table.getByRole('group', { name: '配置关联属性' })
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
  await page.reload()
  await expect(table.locator('tbody tr').filter({ hasText: 'Launch plan' })).toContainText('Related plan')
  await table.locator('tbody tr').filter({ hasText: 'Launch plan' }).getByRole('button', { name: '编辑关联 关联' }).click()
  await page.getByRole('group', { name: '关联记录：关联' }).getByRole('button', { name: '移除关联 Related plan' }).click()
  await expect.poll(() => api.records.find(item => item.id === basicRecord.id)?.properties[relation.id]).toEqual([])
  await table.getByRole('button', { name: '添加属性' }).click()
  await page.getByRole('group', { name: '添加属性类型' }).getByRole('button', { name: '公式' }).click()
  const formula = table.getByRole('group', { name: '配置公式属性' })
  await formula.getByLabel('表达式').fill('{bad json')
  await formula.getByRole('button', { name: '保存属性' }).click()
  await expect(formula.getByRole('alert')).toContainText('有效名称和配置')
  expect(api.properties.filter(item => item.type === 'formula')).toHaveLength(0)
  await formula.getByRole('button', { name: '数字相加模板' }).click()
  await formula.getByLabel('结果类型').selectOption('number')
  await screenshot(page, 'p85-formula-config-desktop')
  await formula.getByRole('button', { name: '保存属性' }).click()
  await expect(table.getByRole('button', { name: /公式⌄/u })).toBeVisible()
  const formulaProperty = api.properties.find(item => item.type === 'formula')!
  expect(formulaProperty).toBeDefined()
  await table.getByRole('button', { name: '添加属性' }).click()
  await page.getByRole('group', { name: '添加属性类型' }).getByRole('button', { name: '汇总' }).click()
  const rollup = table.getByRole('group', { name: '配置汇总属性' })
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
  await table.getByRole('button', { name: '添加属性' }).click()
  await page.getByRole('group', { name: '添加属性类型' }).getByRole('button', { name: '公式' }).click()
  await screenshot(page, 'p85-mobile-formula-config-390x844')
  await table.getByRole('group', { name: '配置公式属性' }).getByRole('button', { name: '保存属性' }).scrollIntoViewIfNeeded()
  await screenshot(page, 'p85-mobile-formula-save-390x844')
  await context.setOffline(true)
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  await expect(table.getByRole('group', { name: '配置公式属性' }).getByRole('button', { name: '保存属性' })).toBeDisabled()
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
  await peerRow.getByRole('button', { name: '编辑Name：Peer original' }).click()
  const titleInput = tables.first().getByRole('textbox', { name: 'Name 值' })
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
  await table.getByRole('button', { name: '添加属性' }).click()
  await page.getByRole('group', { name: '添加属性类型' }).getByRole('button', { name: '公式' }).click()
  const formula = table.getByRole('group', { name: '配置公式属性' })
  await formula.getByRole('button', { name: '数字相加模板' }).click()
  await formula.getByLabel('结果类型').selectOption('number')
  await formula.getByRole('button', { name: '保存属性' }).click()
  await expect(table.getByRole('button', { name: /公式⌄/u })).toBeVisible()
  await table.getByRole('button', { name: '添加属性' }).click()
  await page.getByRole('group', { name: '添加属性类型' }).getByRole('button', { name: '关联' }).click()
  const relationPanel = table.getByRole('group', { name: '配置关联属性' })
  await relationPanel.getByLabel('目标数据库').selectOption(third.id)
  await relationPanel.getByRole('button', { name: '保存属性' }).click()
  await expect(relationPanel).toHaveCount(0)
  const cRelation = api.properties.find(item => item.type === 'relation' && (item.config as { targetDatabaseId: string }).targetDatabaseId === third.id)!
  await table.getByRole('button', { name: '添加属性' }).click()
  await page.getByRole('group', { name: '添加属性类型' }).getByRole('button', { name: '汇总' }).click()
  const rollup = table.getByRole('group', { name: '配置汇总属性' })
  await rollup.getByLabel('关联属性').selectOption(cRelation.id)
  await rollup.getByLabel('目标属性').selectOption(cNumber.id)
  await rollup.getByLabel('汇总方式').selectOption('sum')
  await rollup.getByRole('button', { name: '保存属性' }).click()
  await expect(rollup).toHaveCount(0)
  expect(api.properties.filter(item => item.type === 'rollup')).toHaveLength(2)
})
