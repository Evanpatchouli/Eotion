import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Page, type Route } from '@playwright/test'
import type { AuthUserDto, BlockResponse, PageResponse, WorkspaceResponse } from '@eotion/contracts'

const now = '2026-09-30T00:00:00.000Z'
const later = '2027-09-30T00:00:00.000Z'
const user: AuthUserDto = { id: 'database-user', email: 'database@example.com', displayName: 'Database user', createdAt: now, updatedAt: now }
const workspace: WorkspaceResponse = { id: 'database-workspace', name: 'Database workspace', ownerId: user.id, createdAt: now, updatedAt: now }
const pageRecord: PageResponse = { id: 'database-page', workspaceId: workspace.id, parentPageId: null, title: 'Database references', orderKey: '0000000000000001', createdAt: now, updatedAt: now }

type TestDatabase = { id: string; workspaceId: string; name: string; version: number; createdAt: string; updatedAt: string }
type TestProperty = { id: string; databaseId: string; workspaceId: string; name: string; type: 'title' | 'text' | 'number' | 'checkbox' | 'select' | 'date'; version: number; createdAt: string; updatedAt: string; options?: Array<{ id: string; name: string }> }
type TestView = { id: string; databaseId: string; workspaceId: string; name: string; type: 'table'; version: number; createdAt: string; updatedAt: string }
type TestRecord = { id: string; databaseId: string; workspaceId: string; pageId: string; properties: Record<string, string | number | boolean | null>; version: number; createdAt: string; updatedAt: string }

function database(id: string, name = 'Projects'): TestDatabase { return { id, workspaceId: workspace.id, name, version: 1, createdAt: now, updatedAt: now } }
function property(id: string, databaseId: string, name: string, type: TestProperty['type'], options?: TestProperty['options']): TestProperty {
  return { id, databaseId, workspaceId: workspace.id, name, type, version: 1, createdAt: now, updatedAt: now, ...(options ? { options } : {}) }
}
function view(id: string, databaseId: string, name = 'Table'): TestView { return { id, databaseId, workspaceId: workspace.id, name, type: 'table', version: 1, createdAt: now, updatedAt: now } }
function record(id: string, databaseId: string, pageId: string, properties: TestRecord['properties']): TestRecord {
  return { id, databaseId, workspaceId: workspace.id, pageId, properties, version: 1, createdAt: now, updatedAt: now }
}

function block(id: string, type: BlockResponse['type'], node: Record<string, unknown>, order: number, parentBlockId: string | null = null): BlockResponse {
  return {
    id, type, pageId: pageRecord.id, workspaceId: workspace.id, parentBlockId,
    orderKey: String(order).padStart(16, '0'), props: { node }, createdAt: now, updatedAt: now,
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
}

async function installApi(page: Page, seed: BlockResponse[], options: Partial<Pick<DatabaseApi, 'databases' | 'views' | 'properties' | 'records' | 'failTableLoads' | 'failTableAppendLoads' | 'tableLoadDelayMs' | 'failDatabaseCreates' | 'abortDatabaseCreatesAfterCommit' | 'failDatabaseReferenceReads' | 'abortRecordCreatesAfterCommit' | 'failRecordPageReads' | 'failSnapshots' | 'failSnapshotAfterRecordCreate' | 'holdRecordCreateResponse' | 'holdDatabaseCreateResponse' | 'offline'>> = {}) {
  let signalRecordCreateResponseStarted!: () => void
  let releaseRecordCreateResponse!: () => void
  let signalDatabaseCreateResponseStarted!: () => void
  let releaseDatabaseCreateResponse!: () => void
  const recordCreateResponseStarted = new Promise<void>((resolve) => { signalRecordCreateResponseStarted = resolve })
  const recordCreateResponseGate = new Promise<void>((resolve) => { releaseRecordCreateResponse = resolve })
  const databaseCreateResponseStarted = new Promise<void>((resolve) => { signalDatabaseCreateResponseStarted = resolve })
  const databaseCreateResponseGate = new Promise<void>((resolve) => { releaseDatabaseCreateResponse = resolve })
  const api: DatabaseApi = {
    pages: [pageRecord], blocks: [...seed], databases: options.databases ?? [], views: options.views ?? [],
    properties: options.properties ?? [], records: options.records ?? [], requests: [],
    failTableLoads: options.failTableLoads ?? 0, failTableAppendLoads: options.failTableAppendLoads ?? 0,
    tableLoadDelayMs: options.tableLoadDelayMs ?? 0, failDatabaseCreates: options.failDatabaseCreates ?? 0,
    abortDatabaseCreatesAfterCommit: options.abortDatabaseCreatesAfterCommit ?? 0,
    failDatabaseReferenceReads: options.failDatabaseReferenceReads ?? 0,
    abortRecordCreatesAfterCommit: options.abortRecordCreatesAfterCommit ?? 0,
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
    offline: options.offline ?? false,
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
    const viewsPath = new RegExp(`^/api/workspaces/${workspace.id}/databases/([^/]+)/views$`, 'u').exec(pathname)
    if (viewsPath && request.method() === 'GET') return json(route, 200, api.views.filter((item) => item.databaseId === viewsPath[1]))
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
      const matchingRecords = api.records.filter((item) => item.databaseId === database.id).sort((left, right) => left.id.localeCompare(right.id))
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
    const createRecord = new RegExp(`^/api/workspaces/${workspace.id}/databases/([^/]+)/records$`, 'u').exec(pathname)
    if (createRecord && request.method() === 'POST') {
      const input = payload as { id: string; pageId: string; title: string; orderKey: string }
      const databaseId = createRecord[1]!
      const titleProperty = api.properties.find((item) => item.databaseId === databaseId && item.type === 'title')!
      const titlePage: PageResponse = { ...pageRecord, id: input.pageId, title: input.title, orderKey: input.orderKey }
      const createdRecord = record(input.id, databaseId, input.pageId, { [titleProperty.id]: input.title })
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
  await expect(references.first().locator('th')).toHaveText(['Name', 'Notes', 'Points', 'Done', 'Status', 'Due'])
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
  await table.getByRole('button', { name: '+ 新建记录' }).click()
  await expect.poll(() => api.records).toHaveLength(2)
  await expect.poll(() => api.pages.some((item) => item.title === '无标题')).toBe(true)
  await expect(table).toContainText('无标题')
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
  await table.getByRole('link', { name: 'Launch plan' }).click()
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

  await tables.nth(0).getByRole('button', { name: '+ 新建记录' }).click()
  await expect(tables.nth(0).locator('tbody tr')).toHaveCount(2)
  await expect(tables.nth(1).locator('tbody tr')).toHaveCount(2)
  await expect(tables.nth(0)).toContainText('无标题')
  await expect(tables.nth(1)).toContainText('无标题')
  expect(api.databases).toEqual([rootDatabase])
  expect(api.views).toEqual([view('view-root-id', rootDatabase.id)])
  expect(api.properties).toEqual(rootProperties)
  expect(api.records).toHaveLength(2)
  expect(api.blocks.filter((item) => item.type === 'database')).toHaveLength(2)

  await tables.nth(0).locator('.eotion-database-copy').click()
  await page.keyboard.press('Backspace')
  await expect(page.locator('.eotion-editor-content .eotion-database')).toHaveCount(1)
  const remaining = page.locator('.eotion-editor-content .eotion-database')
  await expect(remaining).toContainText('Launch plan')
  await expect(remaining).toContainText('无标题')
  await expect.poll(() => api.blocks.filter((item) => item.type === 'database').map((item) => item.id)).toEqual(['shared-reference-two'])
  expect(api.databases).toEqual([rootDatabase])
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
  await table.getByRole('button', { name: '+ 新建记录' }).click()
  await expect.poll(() => api.records).toHaveLength(2)
  await expect(table.locator('tbody tr')).toHaveCount(2)
  await expect(table.getByRole('alert')).toContainText('记录已创建，页面列表暂未刷新，请稍后刷新。')
  await expect(table).not.toContainText('无法新建记录')
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
  await tables.nth(0).getByRole('button', { name: '+ 新建记录' }).click()
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
  await table.getByRole('button', { name: '+ 新建记录' }).click()
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
  await page.locator('.eotion-editor-content .eotion-database').getByRole('button', { name: '+ 新建记录' }).click()
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
  await context.setOffline(true)
  api.offline = true
  await table.getByRole('button', { name: '重试加载' }).click()
  await expect(table.getByRole('alert')).toContainText('离线时无法读取数据库')
  await expect(page.locator('.eotion-editor-content .tiptap')).toContainText('正文离线可见')
  const editor = page.locator('.eotion-editor-content .tiptap')
  await editor.locator('p').first().click()
  await page.keyboard.press('End')
  await page.keyboard.type('，离线修改已保存')
  await expect.poll(() => page.evaluate(async (id) => {
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    const local = await useProductSyncStore().store()
    return JSON.stringify(await local.listBlocksByPage(id))
  }, pageRecord.id)).toContain('离线修改已保存')
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
  await installApi(page, [
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
  expect(errors).toEqual([])
  await screenshot(page, 'product-database-mobile-390x844')
})
