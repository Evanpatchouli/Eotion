import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Locator, type Page, type Route, type TestInfo } from '@playwright/test'
import type { AuthUserDto, BlockResponse, PageResponse, WorkspaceResponse } from '@eotion/contracts'
import { convertDatabasePropertyValueForTypeChange, DEFAULT_DATABASE_VIEW_CONFIG, type DatabaseFilter, type DatabaseViewConfig, type DatabasePropertyConfig, type DatabasePropertyValue } from '@eotion/domain/database'
import { getTimelineScale, pxPerMs } from '../src/components/editor/timeline/scale'

const now = '2026-09-30T00:00:00.000Z'
const later = '2027-09-30T00:00:00.000Z'
const user: AuthUserDto = { id: 'database-user', email: 'database@example.com', displayName: 'Database user', createdAt: now, updatedAt: now }
const workspace: WorkspaceResponse = { id: 'database-workspace', name: 'Database workspace', ownerId: user.id, createdAt: now, updatedAt: now }
const pageRecord: PageResponse = { id: 'database-page', workspaceId: workspace.id, parentPageId: null, title: 'Database references', orderKey: '0000000000000001', createdAt: now, updatedAt: now }

type TestDatabase = { id: string; workspaceId: string; name: string; version: number; createdAt: string; updatedAt: string }
type TestProperty = { id: string; databaseId: string; workspaceId: string; name: string; type: 'title' | 'text' | 'number' | 'checkbox' | 'select' | 'date' | 'relation' | 'rollup' | 'formula'; version: number; createdAt: string; updatedAt: string; options?: Array<{ id: string; name: string }>; config?: DatabasePropertyConfig }
type TestView = { id: string; databaseId: string; workspaceId: string; name: string; type: 'table' | 'list' | 'board' | 'timeline'; config: DatabaseViewConfig; version: number; createdAt: string; updatedAt: string }
type TestRecord = { id: string; databaseId: string; workspaceId: string; pageId: string; properties: Record<string, DatabasePropertyValue>; version: number; pageVersion: string; createdAt: string; updatedAt: string }

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

function p113bSnapDeltaMs(endpoint: string, scale: Parameters<typeof getTimelineScale>[0], direction: -1 | 1 = 1): number {
  const target = new Date(endpoint)
  if (!Number.isFinite(target.getTime())) throw new Error(`Invalid P11.3B snap endpoint: ${endpoint}`)
  const { unit, amount } = getTimelineScale(scale).futureSnapUnit
  const step = amount * direction
  if (unit === 'minute') target.setUTCMinutes(target.getUTCMinutes() + step)
  else if (unit === 'hour') target.setUTCHours(target.getUTCHours() + step)
  else if (unit === 'day') target.setUTCDate(target.getUTCDate() + step)
  else if (unit === 'week') target.setUTCDate(target.getUTCDate() + step * 7)
  else if (unit === 'month') target.setUTCMonth(target.getUTCMonth() + step)
  else if (unit === 'quarter') target.setUTCMonth(target.getUTCMonth() + step * 3)
  else target.setUTCFullYear(target.getUTCFullYear() + step)
  return target.getTime() - Date.parse(endpoint)
}

async function p113bResize(page: Page, bar: Locator, handle: Locator, scale: Parameters<typeof getTimelineScale>[0], endpoint: string, direction: -1 | 1 = 1): Promise<void> {
  await bar.scrollIntoViewIfNeeded()
  const bounds = await handle.boundingBox()
  if (!bounds) throw new Error('Expected visible P11.3B resize handle')
  const deltaX = pxPerMs(scale) * p113bSnapDeltaMs(endpoint, scale, direction)
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + deltaX, y, { steps: 4 })
  await expect(bar).toHaveAttribute('data-drag-state', 'dragging')
  await page.mouse.up()
  await expect(bar).toHaveAttribute('data-drag-state', 'idle')
}

/** Close the singleton Record drawer when a pointer gesture left it open. */
async function closeTimelineDrawer(page: Page): Promise<void> {
  const drawer = page.locator('[data-overlay-mode="drawer"]')
  if (await drawer.count() === 0) return
  const close = page.getByRole('button', { name: '关闭记录' })
  if (await close.count() > 0) {
    try { await close.first().click({ timeout: 3000 }) } catch { await page.keyboard.press('Escape') }
  } else {
    await page.keyboard.press('Escape')
  }
  await expect(drawer).toHaveCount(0)
}

async function dragTimelineBar(page: Page, bar: Locator, deltaX: number): Promise<void> {
  await bar.scrollIntoViewIfNeeded()
  const bounds = await bar.boundingBox()
  if (!bounds) throw new Error('Expected a visible Timeline bar for the pointer gesture')
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  if (deltaX !== 0) await page.mouse.move(x + deltaX, y, { steps: 4 })
  await page.mouse.up()
}

test('P11.3B date-only resize changes one endpoint, keeps inclusive end dates, and promotes legacy points to ranges', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.clock.setFixedTime(new Date('2026-10-13T00:00:00.000Z'))
  const runtimeErrors: string[] = []
  page.on('pageerror', error => runtimeErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') runtimeErrors.push(message.text()) })
  const date = property('p113b-date', rootDatabase.id, 'Date', 'date')
  const timelineView = view('p113b-date-view', rootDatabase.id, 'Resize dates', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { timeline: { scale: 'month', dateSource: { mode: 'date-property', propertyId: date.id }, frozenTable: { visible: true, visibleProperties: ['root-title', date.id], propertyOrder: ['root-title', date.id] } } },
  }, 'timeline')
  const tableView = view('p113b-date-table-view', rootDatabase.id, 'Resize table')
  const standaloneView = view('p113b-date-start-end-view', rootDatabase.id, 'Independent Start End', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { timeline: { scale: 'month', dateSource: { mode: 'start-end', startPropertyId: 'p113b-start', endPropertyId: 'p113b-end' } } },
  }, 'timeline')
  const items = [
    record('p113b-range', rootDatabase.id, 'p113b-range-page', { 'root-title': 'Range', [date.id]: { start: '2026-10-13', end: '2026-10-15' } }),
    record('p113b-string-point', rootDatabase.id, 'p113b-string-page', { 'root-title': 'Legacy string', [date.id]: '2026-10-18' }),
    record('p113b-object-point', rootDatabase.id, 'p113b-object-page', { 'root-title': 'Legacy object', [date.id]: { start: '2026-10-16' } }),
    record('p113b-standalone', rootDatabase.id, 'p113b-standalone-page', { 'root-title': 'Independent Start End', 'p113b-start': '2026-10-13', 'p113b-end': '2026-10-15' }),
  ]
  const api = await installApi(page, [block('p113b-date-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100), block('p113b-start-end-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: standaloneView.id } }, 200)], {
    databases: [rootDatabase], views: [timelineView, tableView, standaloneView], properties: [...rootProperties, date, property('p113b-start', rootDatabase.id, 'Start', 'date'), property('p113b-end', rootDatabase.id, 'End', 'date')], records: items,
  })
  for (const item of items) api.pages.push({ ...pageRecord, id: item.pageId, title: String(item.properties['root-title']), role: 'database-record' })
  await page.goto('/#/app/database-workspace/page/database-page')
  const databaseBlock = page.locator('#database-block-p113b-date-block')
  const timeline = databaseBlock.getByTestId('database-timeline')
  const barFor = (id: string) => timeline.locator(`[data-testid="timeline-bar"][data-record-id="${id}"]`)
  const rangeBar = barFor('p113b-range')
  const startHandle = timeline.locator('[data-testid="timeline-resize-start"][data-record-id="p113b-range"]')
  const endHandle = timeline.locator('[data-testid="timeline-resize-end"][data-record-id="p113b-range"]')
  expect(await startHandle.evaluate(element => element.closest('[data-testid="timeline-bar"]'))).toBeNull()
  expect(await endHandle.evaluate(element => element.closest('[data-testid="timeline-bar"]'))).toBeNull()
  await expect(startHandle).toHaveAccessibleName('调整开始日期：Range')
  await expect(endHandle).toHaveAccessibleName('调整结束日期：Range')
  const beforePatchCount = () => api.requests.filter(request => request.method === 'PATCH' && request.path.includes('/cells/')).length
  const patchesBeforeStart = beforePatchCount()
  const startDate = await startHandle.boundingBox()
  if (!startDate) throw new Error('Expected date range start resize handle')
  await page.mouse.move(startDate.x + startDate.width / 2, startDate.y + startDate.height / 2)
  await page.mouse.down()
  await page.mouse.move(startDate.x + startDate.width / 2 - pxPerMs('month') * 86_400_000, startDate.y + startDate.height / 2, { steps: 4 })
  await expect(rangeBar).toHaveAttribute('data-drag-state', 'dragging')
  await expect(rangeBar).toHaveAttribute('data-preview-date', /2026-10-12/u)
  await expect(page.locator('[data-overlay-mode="drawer"]')).toHaveCount(0)
  expect(beforePatchCount()).toBe(patchesBeforeStart)
  expect(api.records.find(item => item.id === 'p113b-range')?.properties[date.id]).toEqual({ start: '2026-10-13', end: '2026-10-15' })
  await page.mouse.up()
  await expect.poll(() => api.records.find(item => item.id === 'p113b-range')?.properties[date.id]).toEqual({ start: '2026-10-12', end: '2026-10-15' })
  expect(beforePatchCount()).toBe(patchesBeforeStart + 1)
  await expect(databaseBlock.locator(`[data-timeline-frozen-row][data-record-id="p113b-range"] [data-property-id="${date.id}"]`)).toContainText('2026-10-12 → 2026-10-15')

  const endBounds = await endHandle.boundingBox()
  if (!endBounds) throw new Error('Expected date range end resize handle after start commit')
  const patchesBeforeEnd = beforePatchCount()
  await page.mouse.move(endBounds.x + endBounds.width / 2, endBounds.y + endBounds.height / 2)
  await page.mouse.down()
  await page.mouse.move(endBounds.x + endBounds.width / 2 + pxPerMs('month') * 86_400_000, endBounds.y + endBounds.height / 2, { steps: 4 })
  await expect(rangeBar).toHaveAttribute('data-drag-state', 'dragging')
  await expect(rangeBar).toHaveAttribute('data-preview-date', /2026-10-16/u)
  expect(beforePatchCount()).toBe(patchesBeforeEnd)
  await page.mouse.up()
  await expect.poll(() => api.records.find(item => item.id === 'p113b-range')?.properties[date.id]).toEqual({ start: '2026-10-12', end: '2026-10-16' })
  expect(beforePatchCount()).toBe(patchesBeforeEnd + 1)

  for (const [id, start] of [['p113b-string-point', '2026-10-18'], ['p113b-object-point', '2026-10-16']] as const) {
    const bar = barFor(id)
    const handle = timeline.locator(`[data-testid="timeline-resize-end"][data-record-id="${id}"]`)
    await expect(timeline.locator(`[data-testid="timeline-resize-start"][data-record-id="${id}"]`)).toHaveCount(0)
    const count = beforePatchCount()
    const bounds = await handle.boundingBox()
    if (!bounds) throw new Error(`Expected legacy point end handle for ${id}`)
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    await page.mouse.down()
    await page.mouse.move(bounds.x + bounds.width / 2 + pxPerMs('month') * 86_400_000, bounds.y + bounds.height / 2, { steps: 4 })
    await expect(bar).toHaveAttribute('data-drag-state', 'dragging')
    await expect(bar).toHaveAttribute('data-preview-date', new RegExp(start, 'u'))
    await expect(page.locator('[data-overlay-mode="drawer"]')).toHaveCount(0)
    expect(beforePatchCount()).toBe(count)
    await page.mouse.up()
    await expect.poll(() => api.records.find(item => item.id === id)?.properties[date.id]).toEqual({ start, end: start })
    expect(beforePatchCount()).toBe(count + 1)
    await expect(timeline.locator(`[data-testid="timeline-resize-start"][data-record-id="${id}"]`)).toHaveCount(1)
    const reverseHandle = timeline.locator(`[data-testid="timeline-resize-end"][data-record-id="${id}"]`)
    const reverseCount = beforePatchCount()
    const reverseBounds = await reverseHandle.boundingBox()
    if (!reverseBounds) throw new Error(`Expected promoted date range end handle for ${id}`)
    await page.mouse.move(reverseBounds.x + reverseBounds.width / 2, reverseBounds.y + reverseBounds.height / 2)
    await page.mouse.down()
    await page.mouse.move(reverseBounds.x + reverseBounds.width / 2 - pxPerMs('month') * 86_400_000, reverseBounds.y + reverseBounds.height / 2, { steps: 4 })
    await expect(bar).toHaveAttribute('data-drag-state', 'dragging')
    await page.mouse.up()
    await expect(bar).toHaveAttribute('data-drag-state', 'idle')
    await expect.poll(() => api.records.find(item => item.id === id)?.properties[date.id]).toEqual({ start, end: start })
    expect(beforePatchCount()).toBe(reverseCount)
  }

  const standaloneTimeline = page.locator('#database-block-p113b-start-end-block').getByTestId('database-timeline')
  const standalone = standaloneTimeline.locator('[data-testid="timeline-bar"][data-record-id="p113b-standalone"]')
  await expect(standalone).toBeVisible()
  await expect(standaloneTimeline.locator('[data-testid="timeline-resize-start"][data-record-id="p113b-standalone"]')).toHaveCount(0)
  await expect(standaloneTimeline.locator('[data-testid="timeline-resize-end"][data-record-id="p113b-standalone"]')).toHaveCount(0)
  expect(beforePatchCount()).toBe(4)
  const noOpCount = beforePatchCount()
  const noOpBounds = await endHandle.boundingBox()
  if (!noOpBounds) throw new Error('Expected date range end handle for no-op verification')
  await page.mouse.move(noOpBounds.x + noOpBounds.width / 2, noOpBounds.y + noOpBounds.height / 2)
  await page.mouse.down()
  await page.mouse.up()
  expect(beforePatchCount()).toBe(noOpCount)
  await expect(page.locator('[data-overlay-mode="drawer"]')).toHaveCount(0)
  await screenshot(page, 'p113b-date-endpoints-desktop-light')
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await screenshot(page, 'p113b-date-endpoints-desktop-dark')
  await page.setViewportSize({ width: 390, height: 844 })
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    await startHandle.focus()
    await expect(startHandle).toBeFocused()
    if (theme === 'light') {
      const beforePhoneResize = beforePatchCount()
      const phoneHandleBounds = await startHandle.boundingBox()
      if (!phoneHandleBounds) throw new Error('Expected focused 390px start resize handle')
      const x = phoneHandleBounds.x + phoneHandleBounds.width / 2
      const y = phoneHandleBounds.y + phoneHandleBounds.height / 2
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x - pxPerMs('month') * 86_400_000, y, { steps: 4 })
      await expect(rangeBar).toHaveAttribute('data-drag-state', 'dragging')
      await expect(rangeBar).toHaveAttribute('data-preview-date', /2026-10-11/u)
      expect(beforePatchCount()).toBe(beforePhoneResize)
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
      await screenshot(page, 'p113b-date-resize-preview-phone-390-light')
      await page.keyboard.press('Escape')
      await page.mouse.up()
      await expect(rangeBar).toHaveAttribute('data-drag-state', 'idle')
      await expect.poll(() => api.records.find(item => item.id === 'p113b-range')?.properties[date.id]).toEqual({ start: '2026-10-12', end: '2026-10-16' })
      expect(beforePatchCount()).toBe(beforePhoneResize)
      await startHandle.focus()
    }
    await screenshot(page, `p113b-date-endpoints-phone-${theme}`)
  }
  const switchView = async (name: string) => {
    await databaseBlock.getByRole('button', { name: '切换视图' }).click()
    await page.getByRole('group', { name: '数据库视图', exact: true }).getByRole('button', { name, exact: true }).click()
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  const beforeTableBounds = await barFor('p113b-range').boundingBox()
  if (!beforeTableBounds) throw new Error('Expected resized Timeline geometry before switching to Table')
  const promotedPoints = [['p113b-string-point', 'Legacy string', '2026-10-18'], ['p113b-object-point', 'Legacy object', '2026-10-16']] as const
  const promotedBeforeTable = new Map<string, { x: number; width: number }>()
  for (const [id] of promotedPoints) {
    const bounds = await barFor(id).boundingBox()
    if (!bounds) throw new Error(`Expected promoted range geometry for ${id}`)
    promotedBeforeTable.set(id, bounds)
    await expect(barFor(id)).toHaveAttribute('data-kind', 'range')
    await expect(barFor(id)).toHaveAttribute('data-marker', 'false')
    expect(Math.abs(bounds.width - pxPerMs('month') * 86_400_000)).toBeLessThanOrEqual(1)
  }
  await switchView('Resize table')
  await expect(databaseBlock.locator('table')).toBeVisible()
  await expect(databaseBlock.locator('table')).toContainText('2026-10-12')
  for (const [, title, start] of promotedPoints) {
    await expect(databaseBlock.locator('tbody tr').filter({ hasText: title })).toContainText(`${start} → ${start}`)
  }
  await switchView('Resize dates')
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  const afterTableBounds = await barFor('p113b-range').boundingBox()
  if (!afterTableBounds) throw new Error('Expected Timeline geometry after returning from Table')
  expect(Math.abs(afterTableBounds.width - beforeTableBounds.width)).toBeLessThanOrEqual(1)
  for (const [id] of promotedPoints) {
    const bounds = await barFor(id).boundingBox()
    if (!bounds) throw new Error(`Expected promoted range after Table switch for ${id}`)
    expect(Math.abs(bounds.x - promotedBeforeTable.get(id)!.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(bounds.width - promotedBeforeTable.get(id)!.width)).toBeLessThanOrEqual(1)
  }
  const beforeReloadBounds = afterTableBounds
  await page.reload()
  await expect.poll(() => api.records.find(item => item.id === 'p113b-range')?.properties[date.id]).toEqual({ start: '2026-10-12', end: '2026-10-16' })
  await expect(barFor('p113b-range')).toBeVisible()
  const afterReloadBounds = await barFor('p113b-range').boundingBox()
  if (!afterReloadBounds) throw new Error('Expected Timeline geometry after reload')
  expect(Math.abs(afterReloadBounds.x - beforeReloadBounds.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(afterReloadBounds.width - beforeReloadBounds.width)).toBeLessThanOrEqual(1)
  await expect(databaseBlock.locator(`[data-timeline-frozen-row][data-record-id="p113b-range"] [data-property-id="${date.id}"]`)).toContainText('2026-10-12 → 2026-10-16')
  for (const [id, , start] of promotedPoints) {
    const bounds = await barFor(id).boundingBox()
    if (!bounds) throw new Error(`Expected promoted range after reload for ${id}`)
    expect(Math.abs(bounds.x - promotedBeforeTable.get(id)!.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(bounds.width - promotedBeforeTable.get(id)!.width)).toBeLessThanOrEqual(1)
    await expect(barFor(id)).toHaveAttribute('data-kind', 'range')
    await expect(barFor(id)).toHaveAttribute('data-marker', 'false')
    await expect(databaseBlock.locator(`[data-timeline-frozen-row][data-record-id="${id}"] [data-property-id="${date.id}"]`)).toContainText(`${start} → ${start}`)
  }
  expect(runtimeErrors).toEqual([])
})

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
  abortCellUpdatesAfterCommit: number
  abortCellUpdatesWithoutCommit: number
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
  holdCellUpdateResponse: boolean
  cellUpdateResponseStarted: Promise<void>
  cellUpdateResponseGate: Promise<void>
  signalCellUpdateResponseStarted: () => void
  releaseCellUpdateResponse: () => void
  failCellUpdateStatus: 400 | 500
  conflictCellUpdateValue: DatabasePropertyValue
  offline: boolean
  failRelationCandidates: number
}

async function installApi(page: Page, seed: BlockResponse[], options: Partial<Pick<DatabaseApi, 'databases' | 'views' | 'properties' | 'records' | 'failTableLoads' | 'failTableAppendLoads' | 'tableLoadDelayMs' | 'failDatabaseCreates' | 'abortDatabaseCreatesAfterCommit' | 'failDatabaseReferenceReads' | 'abortRecordCreatesAfterCommit' | 'abortCellUpdatesAfterCommit' | 'abortCellUpdatesWithoutCommit' | 'failCellUpdates' | 'conflictCellUpdates' | 'holdCellUpdateResponse' | 'failCellUpdateStatus' | 'conflictCellUpdateValue' | 'failViewUpdates' | 'failPropertyUpdates' | 'failPropertyDeletes' | 'failPropertyTypeChanges' | 'conflictPropertyTypeChanges' | 'abortViewCreatesAfterCommit' | 'abortViewDeletesAfterCommit' | 'failRecordPageReads' | 'failSnapshots' | 'failSnapshotAfterRecordCreate' | 'holdRecordCreateResponse' | 'holdDatabaseCreateResponse' | 'offline' | 'failRelationCandidates'>> = {}) {
  let signalRecordCreateResponseStarted!: () => void
  let releaseRecordCreateResponse!: () => void
  let signalDatabaseCreateResponseStarted!: () => void
  let releaseDatabaseCreateResponse!: () => void
  let signalCellUpdateResponseStarted!: () => void
  let releaseCellUpdateResponse!: () => void
  const recordCreateResponseStarted = new Promise<void>((resolve) => { signalRecordCreateResponseStarted = resolve })
  const recordCreateResponseGate = new Promise<void>((resolve) => { releaseRecordCreateResponse = resolve })
  const databaseCreateResponseStarted = new Promise<void>((resolve) => { signalDatabaseCreateResponseStarted = resolve })
  const databaseCreateResponseGate = new Promise<void>((resolve) => { releaseDatabaseCreateResponse = resolve })
  const cellUpdateResponseStarted = new Promise<void>((resolve) => { signalCellUpdateResponseStarted = resolve })
  const cellUpdateResponseGate = new Promise<void>((resolve) => { releaseCellUpdateResponse = resolve })
  const api: DatabaseApi = {
    pages: [{ ...pageRecord }], blocks: [...seed], databases: (options.databases ?? []).map((item) => ({ ...item })), views: (options.views ?? []).map((item) => ({ ...item })),
    properties: (options.properties ?? []).map((item) => ({ ...item, ...(item.options ? { options: [...item.options] } : {}) })), records: (options.records ?? []).map((item) => ({ ...item, properties: { ...item.properties } })), requests: [],
    failTableLoads: options.failTableLoads ?? 0, failTableAppendLoads: options.failTableAppendLoads ?? 0,
    tableLoadDelayMs: options.tableLoadDelayMs ?? 0, failDatabaseCreates: options.failDatabaseCreates ?? 0,
    abortDatabaseCreatesAfterCommit: options.abortDatabaseCreatesAfterCommit ?? 0,
    failDatabaseReferenceReads: options.failDatabaseReferenceReads ?? 0,
    abortRecordCreatesAfterCommit: options.abortRecordCreatesAfterCommit ?? 0,
    abortCellUpdatesAfterCommit: options.abortCellUpdatesAfterCommit ?? 0,
    abortCellUpdatesWithoutCommit: options.abortCellUpdatesWithoutCommit ?? 0,
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
    holdCellUpdateResponse: options.holdCellUpdateResponse ?? false,
    cellUpdateResponseStarted, cellUpdateResponseGate,
    signalCellUpdateResponseStarted: () => signalCellUpdateResponseStarted(),
    releaseCellUpdateResponse: () => releaseCellUpdateResponse(),
    failCellUpdateStatus: options.failCellUpdateStatus ?? 400,
    conflictCellUpdateValue: options.conflictCellUpdateValue ?? 'Concurrent edit',
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
      const input = payload as { id: string; name: string; type: 'table' | 'list' | 'board'; config?: DatabaseViewConfig; expectedDatabaseVersion: number }
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
      for (const item of api.views.filter(item => item.databaseId === databaseItem.id)) {
        const nextConfig = { ...item.config }
        let repaired = false
        if (nextConfig.visibleProperties !== null && nextConfig.visibleProperties.includes(propertyItem.id)) {
          nextConfig.visibleProperties = nextConfig.visibleProperties.filter(id => id !== propertyItem.id)
          repaired = true
        }
        if (nextConfig.propertyOrder !== null && nextConfig.propertyOrder.includes(propertyItem.id)) {
          nextConfig.propertyOrder = nextConfig.propertyOrder.filter(id => id !== propertyItem.id)
          repaired = true
        }
        const timeline = nextConfig.options?.timeline
        if (item.type === 'timeline' && timeline && typeof timeline === 'object') {
          const frozen = (timeline as { frozenTable?: { visibleProperties?: string[] | null; propertyOrder?: string[] | null } }).frozenTable
          if (frozen) {
            const visibleProperties = frozen.visibleProperties?.filter(id => id !== propertyItem.id) ?? null
            const propertyOrder = frozen.propertyOrder?.filter(id => id !== propertyItem.id) ?? null
            if (visibleProperties?.length !== frozen.visibleProperties?.length || propertyOrder?.length !== frozen.propertyOrder?.length) {
              nextConfig.options = { ...nextConfig.options, timeline: { ...timeline, frozenTable: { ...frozen, visibleProperties, propertyOrder } } }
              repaired = true
            }
          }
        }
        if (repaired) { item.config = nextConfig; item.version += 1 }
      }
      databaseItem.version += 1
      return json(route, 200, { database: databaseItem })
    }
    const cellPath = new RegExp(`^/api/workspaces/${workspace.id}/databases/([^/]+)/records/([^/]+)/cells/([^/]+)$`, 'u').exec(pathname)
    if (cellPath && request.method() === 'PATCH') {
      if (api.holdCellUpdateResponse) {
        api.signalCellUpdateResponseStarted()
        await api.cellUpdateResponseGate
      }
      if (api.failCellUpdates > 0) { api.failCellUpdates -= 1; return json(route, api.failCellUpdateStatus, { statusCode: api.failCellUpdateStatus, message: 'Cell update rejected' }) }
      if (api.abortCellUpdatesWithoutCommit > 0) { api.abortCellUpdatesWithoutCommit -= 1; return route.abort('failed') }
      const databaseItem = api.databases.find((item) => item.id === cellPath[1])!
      const recordItem = api.records.find((item) => item.id === cellPath[2])!
      const prop = api.properties.find((item) => item.id === cellPath[3])!
      const input = payload as { value: DatabasePropertyValue; expectedDatabaseVersion: number; expectedRecordVersion: number; expectedPageUpdatedAt?: string }
      if (api.conflictCellUpdates > 0) {
        api.conflictCellUpdates -= 1
        recordItem.properties[prop.id] = api.conflictCellUpdateValue
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
      if (api.abortCellUpdatesAfterCommit > 0) { api.abortCellUpdatesAfterCommit -= 1; return route.abort('failed') }
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

async function timelineScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const screenshotPath = testInfo.outputPath(`${name}.png`)
  await mkdir(path.dirname(screenshotPath), { recursive: true })
  await page.screenshot({ path: screenshotPath, animations: 'disabled' })
}

async function timelineViewport(scroller: Locator) {
  return scroller.evaluate(element => {
    const node = element as HTMLElement
    const data = node.dataset
    return {
      start: Number(data.visibleStart), end: Number(data.visibleEnd), origin: Number(data.originMs),
      generation: Number(data.generation), width: node.clientWidth, scrollLeft: node.scrollLeft,
      scrollWidth: node.scrollWidth, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight,
      overflowY: getComputedStyle(node).overflowY,
    }
  })
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

async function openDatabaseSetting(page: Page, table: Locator, name: '筛选' | '排序' | '属性' | '分组属性' | '记录打开方式') {
  const menu = page.getByRole('menu', { name: '数据库设置' })
  await expect(async () => {
    if (!await menu.isVisible()) await table.getByRole('button', { name: '数据库设置' }).click({ timeout: 1_000 })
    await expect(menu).toBeVisible({ timeout: 1_000 })
    await menu.getByRole('menuitem', { name }).click({ timeout: 1_000 })
    await expect(menu).toHaveCount(0, { timeout: 1_000 })
  }).toPass({ timeout: 8_000 })
}

async function closeDatabaseSetting(page: Page, label: '属性管理' | '分组属性' | '记录打开方式') {
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
    await expect(page.getByRole('group', { name: '数据库视图', exact: true })).toBeVisible()
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

test('standalone database route keeps editor, NodeView, and record drafts across delayed Table/List/Board/Timeline A-B-A switches', async ({ page }) => {
  const tableView = view('standalone-table-a', rootDatabase.id, 'Table A', undefined, 'table')
  const listView = view('standalone-list-b', rootDatabase.id, 'List B', undefined, 'list')
  const boardView = view('standalone-board-c', rootDatabase.id, 'Board C', { ...DEFAULT_DATABASE_VIEW_CONFIG, options: { groupByPropertyId: 'root-select' } }, 'board')
  const timelineView = view('standalone-timeline-d', rootDatabase.id, 'Timeline D', undefined, 'timeline')
  const api = await installApi(page, [], {
    databases: [rootDatabase], views: [tableView, listView, boardView, timelineView],
    properties: rootProperties, records: [basicRecord],
  })
  api.pages.push({ ...pageRecord, id: basicRecord.pageId, title: 'Standalone record', role: 'database-record' })
  api.blocks.push({ ...block('standalone-record-body', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'Body before route switch' }] }, 100), pageId: basicRecord.pageId })
  let holdListViews = false
  let signalListViewsStarted!: () => void
  let releaseListViews!: () => void
  const listViewsStarted = new Promise<void>(resolve => { signalListViewsStarted = resolve })
  const listViewsGate = new Promise<void>(resolve => { releaseListViews = resolve })
  await page.route(url => url.pathname.endsWith(`/databases/${rootDatabase.id}/views`) && url.search === '' && url.href.includes('/api/'), async route => {
    if (!holdListViews || route.request().method() !== 'GET') return route.fallback()
    holdListViews = false
    signalListViewsStarted()
    await listViewsGate
    await route.fallback()
  })

  await page.goto(`/#/app/database-workspace/database/${rootDatabase.id}?view=${tableView.id}`)
  const editor = page.locator('.eotion-editor')
  const database = page.getByLabel('数据库页面').locator('.eotion-database')
  await expect(database.locator('tbody')).toBeVisible()
  await page.evaluate(() => {
    const root = document.querySelector('.eotion-editor') as (Element & { __vueParentComponent?: { exposed?: { editor?: any } } }) | null
    const exposed = root?.__vueParentComponent?.exposed?.editor
    const editor = exposed?.commands ? exposed : exposed?.value
    if (!editor?.view) throw new Error('Expected protected standalone Tiptap editor')
    const before = JSON.stringify(editor.state.doc.toJSON())
    editor.commands.insertContent('protected synthetic document')
    editor.view.dispatch(editor.state.tr.delete(0, editor.state.doc.content.size))
    ;(window as Window & { __protectedDocumentUnchanged?: boolean }).__protectedDocumentUnchanged = JSON.stringify(editor.state.doc.toJSON()) === before
  })
  expect(await page.evaluate(() => (window as Window & { __protectedDocumentUnchanged?: boolean }).__protectedDocumentUnchanged)).toBe(true)
  await expect(database).toBeVisible()
  expect(api.requests.filter(item => item.path === '/api/sync/operations' && item.method === 'POST' && item.kind === 'block.upsert')).toHaveLength(0)
  await database.getByRole('button', { name: '打开记录：Standalone record' }).click()
  const drawer = page.locator('[data-overlay-mode="drawer"]')
  const titleDraft = drawer.getByRole('textbox', { name: '记录标题' })
  const bodyDraft = drawer.locator('.eotion-editor-content .tiptap')
  const recordHostIdentity = await drawer.evaluate(element => {
      let current = (element as Element & { __vueParentComponent?: { parent?: unknown } }).__vueParentComponent as ({ parent?: any; type?: { __name?: string } } | undefined)
      while (current && current.type?.__name !== 'DatabaseRecordHost') current = current.parent
      if (!current) throw new Error('Expected the existing DatabaseRecordHost component')
      ;(window as Window & { __standaloneRecordHost?: unknown }).__standaloneRecordHost = current
      return true
    })
  expect(recordHostIdentity).toBe(true)
  await expect(bodyDraft).toBeVisible()
  await titleDraft.fill('Title draft across route')
  await bodyDraft.fill('Body draft across route')
  await page.evaluate(() => {
    const editor = document.querySelector('.eotion-editor')
    const database = document.querySelector('.eotion-database')
    const drawer = document.querySelector('[data-overlay-mode="drawer"]')
    if (!editor || !database || !drawer || !database.id.startsWith('database-block-')) throw new Error('Expected standalone editor, identified Database NodeView block, and record drawer')
    const bodyEditor = (drawer as Element).querySelector('.eotion-editor')
    const bodyEditorComponent = (bodyEditor as (Element & { __vueParentComponent?: unknown }) | null)?.__vueParentComponent
    if (!bodyEditor || !bodyEditorComponent) throw new Error('Expected the stable standalone Block and record body Editor component')
    ;(window as Window & { __standaloneIdentity?: { editor: Element; block: Element; blockId: string; drawer: Element; bodyEditor: Element; editorComponent: unknown; blockComponent: unknown; recordHostComponent: unknown; bodyEditorComponent: unknown } }).__standaloneIdentity = {
      editor, block: database, blockId: database.id, drawer, bodyEditor,
      editorComponent: (editor as Element & { __vueParentComponent?: unknown }).__vueParentComponent,
      blockComponent: (database as Element & { __vueParentComponent?: unknown }).__vueParentComponent,
      recordHostComponent: (window as Window & { __standaloneRecordHost?: unknown }).__standaloneRecordHost,
      bodyEditorComponent,
    }
  })

  await database.getByRole('button', { name: '切换视图' }).focus()
  await database.getByRole('button', { name: '切换视图' }).press('Enter')
  const viewMenu = page.getByRole('group', { name: '数据库视图', exact: true })
  await expect(viewMenu.getByRole('button', { name: 'List B', exact: true })).toBeVisible()
  holdListViews = true
  await viewMenu.getByRole('button', { name: 'List B', exact: true }).click()
  await listViewsStarted
  await expect(page).toHaveURL(new RegExp(`/database/${rootDatabase.id}\\?view=${listView.id}$`, 'u'))
  await expect.poll(() => page.evaluate(() => {
    const before = (window as Window & { __standaloneIdentity?: { editor: Element; block: Element; blockId: string; drawer: Element; bodyEditor: Element; editorComponent: unknown; blockComponent: unknown; recordHostComponent: unknown; bodyEditorComponent: unknown } }).__standaloneIdentity!
    return {
      editorSame: document.querySelector('.eotion-editor') === before.editor,
      blockSame: document.querySelector('.eotion-database') === before.block,
      blockIdSame: (document.querySelector('.eotion-database') as HTMLElement | null)?.id === before.blockId,
      drawerSame: document.querySelector('[data-overlay-mode="drawer"]') === before.drawer,
      editorComponentSame: (document.querySelector('.eotion-editor') as (Element & { __vueParentComponent?: unknown }) | null)?.__vueParentComponent === before.editorComponent,
      blockComponentSame: (document.querySelector('.eotion-database') as (Element & { __vueParentComponent?: unknown }) | null)?.__vueParentComponent === before.blockComponent,
      recordHostComponentSame: (() => {
        let current = ((document.querySelector('[data-overlay-mode="drawer"]') as (Element & { __vueParentComponent?: { parent?: any } }) | null)?.__vueParentComponent as ({ parent?: any; type?: { __name?: string } } | undefined))
        while (current && current.type?.__name !== 'DatabaseRecordHost') current = current.parent
        return current === before.recordHostComponent
      })(),
      bodyEditorSame: (document.querySelector('[data-overlay-mode="drawer"]') as Element | null)?.querySelector('.eotion-editor') === before.bodyEditor,
      bodyEditorComponentSame: ((document.querySelector('[data-overlay-mode="drawer"]') as Element | null)?.querySelector('.eotion-editor') as (Element & { __vueParentComponent?: unknown }) | null)?.__vueParentComponent === before.bodyEditorComponent,
    }
  })).toEqual({ editorSame: true, blockSame: true, blockIdSame: true, drawerSame: true, editorComponentSame: true, blockComponentSame: true, recordHostComponentSame: true, bodyEditorSame: true, bodyEditorComponentSame: true })
  await expect(titleDraft).toHaveValue('Title draft across route')
  await expect(bodyDraft).toContainText('Body draft across route')
  releaseListViews()

  const transitions = [
    { target: listView, label: 'List B', renderer: 'list' as const },
    { target: timelineView, label: 'Timeline D', renderer: 'timeline' as const },
    { target: boardView, label: 'Board C', renderer: 'board' as const },
    { target: tableView, label: 'Table A', renderer: 'table' as const },
    { target: timelineView, label: 'Timeline D', renderer: 'timeline' as const },
    { target: boardView, label: 'Board C', renderer: 'board' as const },
    { target: timelineView, label: 'Timeline D', renderer: 'timeline' as const },
  ]
  for (const transition of transitions) {
    if (transition.target.id !== listView.id) {
      await page.evaluate(({ targetDatabaseId, targetViewId }) => {
        const url = new URL(window.location.href)
        url.hash = `/app/database-workspace/database/${targetDatabaseId}?view=${targetViewId}`
        window.history.pushState({}, '', url)
        window.dispatchEvent(new PopStateEvent('popstate'))
      }, { targetDatabaseId: rootDatabase.id, targetViewId: transition.target.id })
    }
    await expect(page).toHaveURL(new RegExp(`/database/${rootDatabase.id}\\?view=${transition.target.id}$`, 'u'))
    if (transition.renderer === 'timeline') await expect(database.getByTestId('database-timeline')).toBeVisible()
    if (transition.renderer === 'list') await expect(database.getByTestId('database-list')).toBeVisible()
    if (transition.renderer === 'board') await expect(database.getByTestId('database-board')).toBeVisible()
    if (transition.renderer === 'table') await expect(database.locator('tbody')).toBeVisible()
    await expect(titleDraft).toHaveValue('Title draft across route')
    await expect(bodyDraft).toContainText('Body draft across route')
    await expect.poll(() => page.evaluate(() => {
      const before = (window as Window & { __standaloneIdentity?: { editor: Element; block: Element; blockId: string; drawer: Element; bodyEditor: Element; editorComponent: unknown; blockComponent: unknown; recordHostComponent: unknown; bodyEditorComponent: unknown } }).__standaloneIdentity!
      const editor = document.querySelector('.eotion-editor') as (Element & { __vueParentComponent?: unknown }) | null
      const block = document.querySelector('.eotion-database') as (Element & { __vueParentComponent?: unknown }) | null
      const bodyEditor = (document.querySelector('[data-overlay-mode="drawer"]') as Element | null)?.querySelector('.eotion-editor') as (Element & { __vueParentComponent?: unknown }) | null
      let recordHost = ((document.querySelector('[data-overlay-mode="drawer"]') as (Element & { __vueParentComponent?: { parent?: any } }) | null)?.__vueParentComponent as ({ parent?: any; type?: { __name?: string } } | undefined))
      while (recordHost && recordHost.type?.__name !== 'DatabaseRecordHost') recordHost = recordHost.parent
      return {
        editorSame: editor === before.editor,
        blockSame: block === before.block,
        blockIdSame: block?.id === before.blockId,
        drawerSame: document.querySelector('[data-overlay-mode="drawer"]') === before.drawer,
        editorComponentSame: editor?.__vueParentComponent === before.editorComponent,
        blockComponentSame: block?.__vueParentComponent === before.blockComponent,
        recordHostComponentSame: recordHost === before.recordHostComponent,
        bodyEditorSame: bodyEditor === before.bodyEditor,
        bodyEditorComponentSame: bodyEditor?.__vueParentComponent === before.bodyEditorComponent,
      }
    })).toEqual({ editorSame: true, blockSame: true, blockIdSame: true, drawerSame: true, editorComponentSame: true, blockComponentSame: true, recordHostComponentSame: true, bodyEditorSame: true, bodyEditorComponentSame: true })
  }
  expect(api.requests.filter(item => item.method === 'GET' && item.path.endsWith(`/databases/${rootDatabase.id}/views`)).length).toBeGreaterThanOrEqual(5)
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

test('database view selector creates a Board view through the existing DatabaseView API', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const api = await installApi(page, [
    block('create-board-view-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
    block('create-board-linked-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 200),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: rootProperties, records: [basicRecord] })
  api.pages.push({ ...pageRecord, id: basicRecord.pageId, title: 'Board record', orderKey: '0000000000000002', role: 'database-record' })
  const initialPages = structuredClone(api.pages)
  const initialBlocks = structuredClone(api.blocks)
  const initialDatabaseBlockIds = initialBlocks.filter(item => item.type === 'database').map(item => item.id)
  const initialDatabases = structuredClone(api.databases)
  const initialRecords = structuredClone(api.records)
  const initialViewCount = api.views.length
  await page.goto('/#/app/database-workspace/page/database-page')

  const database = page.locator('#database-block-create-board-view-block')
  const linkedDatabase = page.locator('#database-block-create-board-linked-block')
  await expect(database.locator('tbody')).toBeVisible()
  await database.getByRole('button', { name: '打开记录：Board record' }).click()
  const drawer = page.locator('[data-overlay-mode="drawer"]')
  await expect(drawer).toBeVisible()
  const titleDraft = drawer.getByRole('textbox', { name: '记录标题' })
  await expect(drawer.locator('.eotion-editor-content .tiptap')).toHaveAttribute('contenteditable', 'true')
  await titleDraft.fill('Board draft survives creation')
  await expect(titleDraft).toHaveValue('Board draft survives creation')
  await database.getByRole('button', { name: '切换视图' }).click()
  const menu = page.getByRole('group', { name: '数据库视图', exact: true })
  await expect(menu.getByRole('button', { name: '新建看板视图' })).toBeVisible()

  await page.evaluate(() => {
    const editor = document.querySelector('.eotion-editor')
    const database = document.querySelector('#database-block-create-board-view-block')
    const drawer = document.querySelector('[data-overlay-mode="drawer"]')
    if (!editor || !database || !drawer) throw new Error('Expected editor, target Database NodeView, and record drawer')
    ;(window as Window & { __boardCreateIdentity?: { editor: Element; database: Element; drawer: Element; editorComponent: unknown; databaseComponent: unknown } }).__boardCreateIdentity = {
      editor,
      database,
      drawer,
      editorComponent: (editor as Element & { __vueParentComponent?: unknown }).__vueParentComponent,
      databaseComponent: (database as Element & { __vueParentComponent?: unknown }).__vueParentComponent,
    }
  })

  await menu.getByRole('button', { name: '新建看板视图' }).click()

  const board = database.getByTestId('database-board')
  await expect(board).toBeVisible()
  await expect(board).toContainText('尚未配置分组属性')
  await expect(board.locator('.eotion-database-board-column')).toHaveCount(0)
  await expect(titleDraft).toHaveValue('Board draft survives creation')
  await expect.poll(() => api.views).toHaveLength(initialViewCount + 1)
  const created = api.views.find(item => item.id !== 'view-root-id')!
  expect(created.type).toBe('board')
  expect(created.config).toEqual(DEFAULT_DATABASE_VIEW_CONFIG)
  expect(created.config.propertyOrder).toBeNull()
  expect(created.config.options).toBeUndefined()
  expect(created.config.filters).toEqual([])
  expect(created.config.sorts).toEqual([])
  const viewCreateRequests = api.requests.filter(({ method, path }) => method === 'POST' && path.endsWith(`/databases/${rootDatabase.id}/views`))
  expect(viewCreateRequests).toHaveLength(1)
  expect(viewCreateRequests[0]?.payload).toMatchObject({ type: 'board', config: DEFAULT_DATABASE_VIEW_CONFIG })
  expect(viewCreateRequests[0]?.payload.config).not.toHaveProperty('options')
  const databaseMutations = api.requests.filter(({ method, path }) => ['POST', 'PATCH', 'DELETE'].includes(method) && path.includes(`/databases/${rootDatabase.id}/`))
  expect(databaseMutations).toEqual(viewCreateRequests)
  await expect.poll(() => api.blocks.find(item => item.id === 'create-board-view-block')?.props.node?.attrs).toEqual({ databaseId: rootDatabase.id, viewId: created.id })
  expect(api.blocks.find(item => item.id === 'create-board-linked-block')?.props.node?.attrs).toEqual({ databaseId: rootDatabase.id, viewId: 'view-root-id' })
  expect(api.blocks.filter(item => item.type === 'database').map(item => item.id)).toEqual(initialDatabaseBlockIds)
  expect(api.pages.map(item => item.id)).toEqual(initialPages.map(item => item.id))
  expect(api.databases.map(({ id }) => id)).toEqual(initialDatabases.map(({ id }) => id))
  expect(api.records).toEqual(initialRecords)
  expect(api.properties.map(({ id }) => id)).toEqual(rootProperties.map(({ id }) => id))

  await expect(page.locator('.product-sync-status')).toContainText('已同步')
  await installLocalBlockReader(page)
  await alignServerBlocksWithLocal(page, api)
  expect(await requestSnapshotHydration(page)).toBe(true)
  await expect(titleDraft).toHaveValue('Board draft survives creation')

  await expect.poll(() => page.evaluate(() => {
    const before = (window as Window & { __boardCreateIdentity?: { editor: Element; database: Element; drawer: Element; editorComponent: unknown; databaseComponent: unknown } }).__boardCreateIdentity!
    const editor = document.querySelector('.eotion-editor')
    const database = document.querySelector('#database-block-create-board-view-block')
    const drawer = document.querySelector('[data-overlay-mode="drawer"]')
    return {
      editorSame: editor === before.editor,
      databaseSame: database === before.database,
      drawerSame: drawer === before.drawer,
      editorComponentSame: (editor as (Element & { __vueParentComponent?: unknown }) | null)?.__vueParentComponent === before.editorComponent,
      databaseComponentSame: (database as (Element & { __vueParentComponent?: unknown }) | null)?.__vueParentComponent === before.databaseComponent,
    }
  })).toEqual({ editorSame: true, databaseSame: true, drawerSame: true, editorComponentSame: true, databaseComponentSame: true })
  await expect(titleDraft).toHaveValue('Board draft survives creation')
  await expect(linkedDatabase.getByRole('button', { name: '切换视图' })).toContainText('表格视图')
})

test('Board view settings select only local Select properties, preserve config, and share View updates', async ({ page }) => {
  const boardProperties = [
    ...rootProperties,
    property('root-priority', rootDatabase.id, 'Priority', 'select', [{ id: 'priority-high', name: 'High' }, { id: 'priority-low', name: 'Low' }]),
  ]
  const sharedConfig: DatabaseViewConfig = {
    filters: [{ propertyId: 'root-text', operator: 'contains', value: 'keep' }],
    sorts: [{ propertyId: 'root-number', direction: 'desc' }],
    visibleProperties: ['root-title', 'root-select', 'root-priority'],
    propertyOrder: ['root-title', 'root-priority', 'root-select', 'root-number', 'root-text'],
    options: { groupByPropertyId: 'root-select', futureOption: { keep: true } },
  }
  const independentConfig: DatabaseViewConfig = { ...DEFAULT_DATABASE_VIEW_CONFIG, options: { groupByPropertyId: 'root-select' } }
  const records = [
    record('board-settings-open', rootDatabase.id, 'board-settings-open-page', { 'root-title': 'Keep open', 'root-text': 'keep', 'root-number': 10, 'root-select': 'status-open', 'root-priority': 'priority-high' }),
    record('board-settings-done', rootDatabase.id, 'board-settings-done-page', { 'root-title': 'Keep done', 'root-text': 'keep', 'root-number': 20, 'root-select': 'status-done', 'root-priority': 'priority-low' }),
  ]
  const api = await installApi(page, [
    block('board-settings-shared-one', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'board-settings-shared' } }, 100),
    block('board-settings-shared-two', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'board-settings-shared' } }, 200),
    block('board-settings-independent', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'board-settings-independent' } }, 300),
    block('board-settings-table', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'board-settings-table' } }, 400),
    block('board-settings-list', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'board-settings-list' } }, 500),
  ], {
    databases: [rootDatabase],
    views: [
      view('board-settings-shared', rootDatabase.id, 'Shared board', sharedConfig, 'board'),
      view('board-settings-independent', rootDatabase.id, 'Independent board', independentConfig, 'board'),
      view('board-settings-table', rootDatabase.id, 'Table settings', undefined, 'table'),
      view('board-settings-list', rootDatabase.id, 'List settings', undefined, 'list'),
    ],
    properties: boardProperties,
    records,
  })
  const initialRecords = structuredClone(api.records)
  await page.goto('/#/app/database-workspace/page/database-page')

  const sharedOne = page.locator('#database-block-board-settings-shared-one')
  const sharedTwo = page.locator('#database-block-board-settings-shared-two')
  const independent = page.locator('#database-block-board-settings-independent')
  const table = page.locator('#database-block-board-settings-table')
  const list = page.locator('#database-block-board-settings-list')
  await expect(sharedOne.getByTestId('database-board')).toBeVisible()
  await expect(sharedTwo.getByTestId('database-board')).toBeVisible()
  await expect(independent.getByTestId('database-board')).toBeVisible()
  await expect(list.getByTestId('database-list')).toBeVisible()

  await sharedOne.getByRole('button', { name: '数据库设置' }).click()
  const boardMenu = page.getByRole('menu', { name: '数据库设置' })
  await expect(boardMenu.getByRole('menuitem')).toHaveText(['筛选1', '排序1', '属性', '分组属性', '记录打开方式', '自动化'])
  await boardMenu.getByRole('menuitem', { name: '分组属性', exact: true }).click()
  const groupingPanel = page.getByRole('group', { name: '分组属性' })
  const groupingTrigger = groupingPanel.getByRole('button', { name: '分组属性' })
  await expect(groupingTrigger).toHaveAttribute('data-value', 'root-select')
  await groupingTrigger.click()
  const groupingMenu = page.getByRole('menu', { name: '分组属性' })
  expect(await groupingMenu.getByRole('menuitem').allTextContents()).toEqual(['未设置', 'Status', 'Priority'])
  await groupingMenu.getByRole('menuitem', { name: 'Priority', exact: true }).click()
  await expect(groupingTrigger).toHaveAttribute('data-value', 'root-priority')
  await overlayFooter(groupingPanel).getByRole('button', { name: '保存分组' }).click()

  await expect.poll(() => api.views.find(item => item.id === 'board-settings-shared')?.config.options).toEqual({ groupByPropertyId: 'root-priority', futureOption: { keep: true } })
  expect(api.views.find(item => item.id === 'board-settings-shared')?.config.filters).toEqual(sharedConfig.filters)
  expect(api.views.find(item => item.id === 'board-settings-shared')?.config.sorts).toEqual(sharedConfig.sorts)
  expect(api.views.find(item => item.id === 'board-settings-shared')?.config.visibleProperties).toEqual(sharedConfig.visibleProperties)
  expect(api.views.find(item => item.id === 'board-settings-shared')?.config.propertyOrder).toEqual(sharedConfig.propertyOrder)
  expect(api.records).toEqual(initialRecords)
  await expect.poll(() => sharedOne.locator('.eotion-database-board-column-name').allTextContents()).toEqual(['High', 'Low', '未分组'])
  await expect.poll(() => sharedTwo.locator('.eotion-database-board-column-name').allTextContents()).toEqual(['High', 'Low', '未分组'])
  await expect(independent.locator('.eotion-database-board-column-name')).toHaveText(['Open', 'Done', '未分组'])

  await openDatabaseSetting(page, sharedOne, '分组属性')
  const clearPanel = page.getByRole('group', { name: '分组属性' })
  await selectSettingOption(clearPanel, '分组属性', '', '未设置')
  await overlayFooter(clearPanel).getByRole('button', { name: '保存分组' }).click()
  await expect.poll(() => api.views.find(item => item.id === 'board-settings-shared')?.config.options).toEqual({ futureOption: { keep: true } })
  await expect(sharedOne.getByTestId('database-board')).toContainText('尚未配置分组属性')
  await expect.poll(async () => await sharedTwo.getByTestId('database-board').textContent()).toContain('尚未配置分组属性')

  for (const database of [table, list]) {
    await database.getByRole('button', { name: '数据库设置' }).click()
    const menu = page.getByRole('menu', { name: '数据库设置' })
    await expect(menu.getByRole('menuitem', { name: '分组属性', exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
  }
})

test('Board grouping settings remain available without Select properties and read-only offline on phone', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const numberProperty = property('board-settings-number', rootDatabase.id, 'Estimate', 'number')
  const api = await installApi(page, [
    block('board-settings-no-select', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'board-settings-no-select-view' } }, 100),
  ], {
    databases: [rootDatabase],
    views: [view('board-settings-no-select-view', rootDatabase.id, 'No select board', undefined, 'board')],
    properties: [rootProperties[0]!, numberProperty],
    records: [],
  })
  await page.goto('/#/app/database-workspace/page/database-page')
  const database = page.locator('#database-block-board-settings-no-select')
  await expect(database.getByTestId('database-board')).toContainText('尚未配置分组属性')
  await openDatabaseSetting(page, database, '分组属性')
  const panel = page.getByRole('group', { name: '分组属性' })
  await expect(page.locator('dialog.eotion-product-overlay--bottom-drawer[open]')).toBeVisible()
  await expect(panel).toContainText('没有可用的选择属性')
  const trigger = panel.getByRole('button', { name: '分组属性' })
  await trigger.click()
  await expect(page.getByRole('menu', { name: '分组属性' }).getByRole('menuitem')).toHaveText(['未设置'])
  await closeDatabaseSetting(page, '分组属性')
  expect(api.properties.filter(item => item.type === 'select')).toHaveLength(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

  const viewMutationCount = () => api.requests.filter(({ method, path }) => ['POST', 'PATCH', 'DELETE'].includes(method) && path.includes(`/databases/${rootDatabase.id}/views`)).length
  const mutationsBeforeOffline = viewMutationCount()
  await context.setOffline(true)
  api.offline = true
  await expect(database.getByRole('button', { name: '数据库设置' })).toBeEnabled()
  await openDatabaseSetting(page, database, '分组属性')
  await expect(panel.getByRole('button', { name: '分组属性' })).toBeDisabled()
  await expect(overlayFooter(panel).getByRole('button', { name: '保存分组' })).toBeDisabled()
  expect(viewMutationCount()).toBe(mutationsBeforeOffline)
})

for (const targetType of ['table', 'list'] as const) {
  test(`Board grouping settings stay hidden while switching to a ${targetType} View`, async ({ page }) => {
    const targetViewId = `board-settings-switch-${targetType}`
    const targetConfig: DatabaseViewConfig = { ...DEFAULT_DATABASE_VIEW_CONFIG, options: { groupByPropertyId: `opaque-${targetType}`, futureOption: true } }
    const api = await installApi(page, [
      block(`board-settings-switch-${targetType}-block`, 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'board-settings-switch-source' } }, 100),
    ], {
      databases: [rootDatabase],
      views: [
        view('board-settings-switch-source', rootDatabase.id, 'Board source', { ...DEFAULT_DATABASE_VIEW_CONFIG, options: { groupByPropertyId: 'root-select' } }, 'board'),
        view(targetViewId, rootDatabase.id, `${targetType} target`, targetConfig, targetType),
      ],
      properties: rootProperties,
      records: [basicRecord],
      tableLoadDelayMs: 300,
    })
    await page.goto('/#/app/database-workspace/page/database-page')
    const database = page.locator(`#database-block-board-settings-switch-${targetType}-block`)
    await expect(database.getByTestId('database-board')).toBeVisible()
    await database.getByRole('button', { name: '切换视图' }).click()
    await page.getByRole('group', { name: '数据库视图', exact: true }).getByRole('button', { name: `${targetType} target`, exact: true }).click()
    await expect.poll(() => api.requests.some(({ method, path }) => method === 'GET' && path.endsWith(`/views/${targetViewId}/table`))).toBe(true)

    await database.getByRole('button', { name: '数据库设置' }).click()
    const settingsMenu = page.getByRole('menu', { name: '数据库设置' })
    await expect(settingsMenu.getByRole('menuitem', { name: '分组属性', exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
    if (targetType === 'table') await expect(database.locator('tbody')).toBeVisible()
    else await expect(database.getByTestId('database-list')).toBeVisible()
    expect(api.requests.filter(({ method, path }) => method === 'PATCH' && path.endsWith(`/views/${targetViewId}`))).toHaveLength(0)
    expect(api.views.find(item => item.id === targetViewId)?.config.options).toEqual(targetConfig.options)
  })
}

test('Board grouping settings keep the existing View conflict behavior', async ({ page }) => {
  const api = await installApi(page, [
    block('board-settings-conflict', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'board-settings-conflict-view' } }, 100),
  ], {
    databases: [rootDatabase],
    views: [view('board-settings-conflict-view', rootDatabase.id, 'Conflict board', undefined, 'board')],
    properties: rootProperties,
    records: [basicRecord],
  })
  await page.goto('/#/app/database-workspace/page/database-page')
  const database = page.locator('#database-block-board-settings-conflict')
  await openDatabaseSetting(page, database, '分组属性')
  const panel = page.getByRole('group', { name: '分组属性' })
  await selectSettingOption(panel, '分组属性', 'root-select', 'Status')
  api.databases[0]!.version += 1
  await overlayFooter(panel).getByRole('button', { name: '保存分组' }).click()
  await expect(page.getByRole('alert')).toContainText('数据库或视图已变化')
  expect(api.views.find(item => item.id === 'board-settings-conflict-view')?.config.options).toBeUndefined()
  expect(api.requests.filter(({ method, path }) => method === 'PATCH' && path.endsWith('/views/board-settings-conflict-view'))).toHaveLength(1)
})

for (const outcome of ['success', 'conflict'] as const) {
  test(`delayed Board View settings PATCH ${outcome} cannot overwrite a List View after external snapshot switch`, async ({ page }) => {
    test.setTimeout(60_000)
    await page.setViewportSize({ width: 1440, height: 1000 })
    const boardConfig: DatabaseViewConfig = { ...DEFAULT_DATABASE_VIEW_CONFIG, options: { groupByPropertyId: 'root-select' } }
    const listConfig: DatabaseViewConfig = { ...DEFAULT_DATABASE_VIEW_CONFIG, visibleProperties: ['root-title'] }
    const boardView = view('delayed-board-a', rootDatabase.id, 'Board A', boardConfig, 'board')
    const listView = view('delayed-list-b', rootDatabase.id, 'List B', listConfig, 'list')
    boardView.version = 5
    listView.version = 7
    const boardProperties = [
      ...rootProperties,
      property('root-priority', rootDatabase.id, 'Priority', 'select', [{ id: 'priority-high', name: 'High' }, { id: 'priority-low', name: 'Low' }]),
    ]
    const api = await installApi(page, [
      block('delayed-view-switch-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: boardView.id } }, 100),
    ], {
      databases: [rootDatabase],
      views: [boardView, listView],
      properties: boardProperties,
      records: [basicRecord],
    })
    api.databases[0]!.version = 5
    api.pages.push({ ...pageRecord, id: basicRecord.pageId, title: 'Delayed view record', role: 'database-record' })

    let signalPatchStarted!: () => void
    let releasePatch!: () => void
    let heldPatchPayload: unknown
    const patchStarted = new Promise<void>(resolve => { signalPatchStarted = resolve })
    const patchGate = new Promise<void>(resolve => { releasePatch = resolve })
    await page.route(`**/views/${boardView.id}`, async route => {
      if (route.request().method() !== 'PATCH') return route.fallback()
      heldPatchPayload = route.request().postDataJSON()
      signalPatchStarted()
      await patchGate
      await route.fallback()
    })

    await page.goto('/#/app/database-workspace/page/database-page')
    const database = page.locator('#database-block-delayed-view-switch-block')
    await expect(database.getByTestId('database-board')).toBeVisible()
    await openDatabaseSetting(page, database, '分组属性')
    const groupingPanel = page.getByRole('group', { name: '分组属性' })
    await selectSettingOption(groupingPanel, '分组属性', 'root-priority', 'Priority')
    const patchResponse = page.waitForResponse(response => response.request().method() === 'PATCH' && response.url().endsWith(`/views/${boardView.id}`))
    await overlayFooter(groupingPanel).getByRole('button', { name: '保存分组' }).click()
    await patchStarted
    expect(heldPatchPayload).toMatchObject({ config: { options: { groupByPropertyId: 'root-priority' } } })

    const blockItem = api.blocks.find(item => item.id === 'delayed-view-switch-block')!
    blockItem.props = { node: { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: listView.id } } }
    expect(await requestSnapshotHydration(page)).toBe(false)
    await expect(database.getByTestId('database-list')).toBeVisible()
    await expect(database.getByRole('button', { name: '切换视图' })).toContainText('List B')
    await expect(database.locator('.eotion-database-list-property')).toHaveCount(0)
    await expect.poll(() => api.blocks.find(item => item.id === blockItem.id)?.props.node?.attrs).toEqual({ databaseId: rootDatabase.id, viewId: listView.id })

    await page.evaluate(() => {
      const editor = document.querySelector('.eotion-editor')
      const database = document.querySelector('#database-block-delayed-view-switch-block')
      if (!editor || !database) throw new Error('Expected converged editor and List NodeView')
      ;(window as Window & { __delayedViewIdentity?: { editor: Element; database: Element; editorComponent: unknown; databaseComponent: unknown } }).__delayedViewIdentity = {
        editor,
        database,
        editorComponent: (editor as Element & { __vueParentComponent?: unknown }).__vueParentComponent,
        databaseComponent: (database as Element & { __vueParentComponent?: unknown }).__vueParentComponent,
      }
    })
    const listTableRequestsBeforeRelease = api.requests.filter(({ method, path }) => method === 'GET' && path.endsWith(`/views/${listView.id}/table`)).length
    const listViewListRequestsBeforeRelease = api.requests.filter(({ method, path }) => method === 'GET' && path.endsWith(`/databases/${rootDatabase.id}/views`)).length
    const listPatchRequestsBeforeRelease = api.requests.filter(({ method, path }) => method === 'PATCH' && path.endsWith(`/views/${listView.id}`)).length
    const listConfigBeforeRelease = structuredClone(api.views.find(item => item.id === listView.id)!.config)
    const listVersionBeforeRelease = api.views.find(item => item.id === listView.id)!.version

    if (outcome === 'conflict') api.databases[0]!.version += 1
    releasePatch()
    const response = await patchResponse
    expect(response.status()).toBe(outcome === 'success' ? 200 : 409)
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())))

    await expect(database.getByTestId('database-list')).toBeVisible()
    await expect(database).toContainText('Delayed view record')
    await expect(database.locator('.eotion-database-list-property')).toHaveCount(0)
    await expect.poll(() => api.requests.filter(({ method, path }) => method === 'GET' && path.endsWith(`/views/${listView.id}/table`)).length).toBe(listTableRequestsBeforeRelease + (outcome === 'success' ? 1 : 0))
    await expect.poll(() => api.requests.filter(({ method, path }) => method === 'GET' && path.endsWith(`/databases/${rootDatabase.id}/views`)).length).toBe(listViewListRequestsBeforeRelease)
    expect(api.requests.filter(({ method, path }) => method === 'PATCH' && path.endsWith(`/views/${listView.id}`))).toHaveLength(listPatchRequestsBeforeRelease)
    expect(api.views.find(item => item.id === listView.id)?.config).toEqual(listConfigBeforeRelease)
    expect(api.views.find(item => item.id === listView.id)?.version).toBe(listVersionBeforeRelease)
    expect(api.views.find(item => item.id === boardView.id)?.config).toEqual(outcome === 'success' ? { ...boardConfig, options: { groupByPropertyId: 'root-priority' } } : boardConfig)

    await database.getByRole('button', { name: '数据库设置' }).click()
    const listSettingsMenu = page.getByRole('menu', { name: '数据库设置' })
    await expect(listSettingsMenu.getByRole('menuitem', { name: '分组属性', exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect.poll(() => page.evaluate(() => {
      const before = (window as Window & { __delayedViewIdentity?: { editor: Element; database: Element; editorComponent: unknown; databaseComponent: unknown } }).__delayedViewIdentity!
      const editor = document.querySelector('.eotion-editor')
      const database = document.querySelector('#database-block-delayed-view-switch-block')
      return {
        editorSame: editor === before.editor,
        databaseSame: database === before.database,
        editorComponentSame: (editor as (Element & { __vueParentComponent?: unknown }) | null)?.__vueParentComponent === before.editorComponent,
        databaseComponentSame: (database as (Element & { __vueParentComponent?: unknown }) | null)?.__vueParentComponent === before.databaseComponent,
      }
    })).toEqual({ editorSame: true, databaseSame: true, editorComponentSame: true, databaseComponentSame: true })
  })
}

test('A to B to A editor-attribute switching does not let an old View PATCH refresh reloaded A', async ({ page }) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  const boardConfig: DatabaseViewConfig = { ...DEFAULT_DATABASE_VIEW_CONFIG, options: { groupByPropertyId: 'root-select' } }
  const boardView = view('revisit-board-a', rootDatabase.id, 'Board A', boardConfig, 'board')
  const listView = view('revisit-list-b', rootDatabase.id, 'List B', { ...DEFAULT_DATABASE_VIEW_CONFIG }, 'list')
  const boardProperties = [
    ...rootProperties,
    property('revisit-priority', rootDatabase.id, 'Priority', 'select', [{ id: 'revisit-high', name: 'High' }]),
  ]
  const api = await installApi(page, [
    block('revisit-view-switch-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: boardView.id } }, 100),
  ], {
    databases: [rootDatabase],
    views: [boardView, listView],
    properties: boardProperties,
    records: [basicRecord],
  })
  api.databases[0]!.version = 5
  boardView.version = 5
  api.views.find(item => item.id === boardView.id)!.version = 5
  api.pages.push({ ...pageRecord, id: basicRecord.pageId, title: 'A-B-A record', role: 'database-record' })

  let signalPatchStarted!: () => void
  let releasePatch!: () => void
  const patchStarted = new Promise<void>(resolve => { signalPatchStarted = resolve })
  const patchGate = new Promise<void>(resolve => { releasePatch = resolve })
  await page.route(`**/views/${boardView.id}`, async route => {
    if (route.request().method() !== 'PATCH') return route.fallback()
    signalPatchStarted()
    await patchGate
    await route.fallback()
  })

  await page.goto('/#/app/database-workspace/page/database-page')
  const database = page.locator('#database-block-revisit-view-switch-block')
  await expect(database.getByTestId('database-board')).toBeVisible()
  await expect(database).toHaveAttribute('data-view-ready', 'true')
  await openDatabaseSetting(page, database, '分组属性')
  const groupingPanel = page.getByRole('group', { name: '分组属性' })
  await selectSettingOption(groupingPanel, '分组属性', 'revisit-priority', 'Priority')
  await expect(overlayFooter(groupingPanel).getByRole('button', { name: '保存分组' })).toBeEnabled()
  const patchResponse = page.waitForResponse(response => response.request().method() === 'PATCH' && response.url().endsWith(`/views/${boardView.id}`))
  await overlayFooter(groupingPanel).getByRole('button', { name: '保存分组' }).click()
  await patchStarted

  const blockItem = api.blocks.find(item => item.id === 'revisit-view-switch-block')!
  blockItem.props = { node: { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: listView.id } } }
  expect(await requestSnapshotHydration(page)).toBe(false)
  await expect(database.getByTestId('database-list')).toBeVisible()
  await expect(database).toHaveAttribute('data-view-ready', 'true')
  await installLocalBlockReader(page)
  await expect.poll(() => readLocalBlocks(page, pageRecord.id)).toContain(listView.id)

  let signalBoardLoadStarted!: () => void
  let releaseBoardLoad!: () => void
  const boardLoadStarted = new Promise<void>(resolve => { signalBoardLoadStarted = resolve })
  const boardLoadGate = new Promise<void>(resolve => { releaseBoardLoad = resolve })
  await page.route(url => url.pathname.endsWith(`/views/${boardView.id}/table`), async route => {
    signalBoardLoadStarted()
    await boardLoadGate
    await route.fallback()
  })
  blockItem.props = { node: { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: boardView.id } } }
  await page.evaluate((targetViewId) => {
    const root = document.querySelector('.eotion-editor') as (Element & { __vueParentComponent?: { exposed?: { editor?: any } } }) | null
    const exposedEditor = root?.__vueParentComponent?.exposed?.editor
    const editor = exposedEditor?.commands ? exposedEditor : exposedEditor?.value
    if (!editor?.view) throw new Error('Expected the active Tiptap editor')
    let position = -1
    let attrs: Record<string, unknown> | undefined
    editor.state.doc.descendants((node: { type: { name: string }; attrs: Record<string, unknown> }, nodePosition: number) => {
      if (position < 0 && node.type.name === 'eotionDatabase') {
        position = nodePosition
        attrs = node.attrs
      }
    })
    if (position < 0 || !attrs) throw new Error('Expected the database node in the active editor')
    editor.view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, { ...attrs, viewId: targetViewId }))
  }, boardView.id)
  await boardLoadStarted
  await expect(database).toHaveAttribute('data-view-ready', 'false')
  releaseBoardLoad()
  await expect(database.getByTestId('database-board')).toBeVisible()
  await expect(database).toHaveAttribute('data-view-ready', 'true')
  const currentBoardTableRequests = api.requests.filter(({ method, path }) => method === 'GET' && path.endsWith(`/views/${boardView.id}/table`)).length
  const currentViewListRequests = api.requests.filter(({ method, path }) => method === 'GET' && path.endsWith(`/databases/${rootDatabase.id}/views`)).length
  api.databases[0]!.version += 1
  releasePatch()
  expect((await patchResponse).status()).toBe(409)
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())))
  await expect.poll(() => api.requests.filter(({ method, path }) => method === 'GET' && path.endsWith(`/views/${boardView.id}/table`)).length).toBe(currentBoardTableRequests)
  await expect.poll(() => api.requests.filter(({ method, path }) => method === 'GET' && path.endsWith(`/databases/${rootDatabase.id}/views`)).length).toBe(currentViewListRequests)
  await expect(database.getByRole('button', { name: '切换视图' })).toContainText('Board A')
  expect(api.views.find(item => item.id === boardView.id)?.config).toEqual(boardConfig)
  await expect.poll(() => api.blocks.find(item => item.id === 'revisit-view-switch-block')?.props.node?.attrs).toEqual({ databaseId: rootDatabase.id, viewId: boardView.id })
})

test('Table List Board switch matrix keeps the database reference, renderer settings, and editor identity', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const tableView = view('matrix-table-view', rootDatabase.id, 'Table A', { ...DEFAULT_DATABASE_VIEW_CONFIG, visibleProperties: ['root-title'] }, 'table')
  const listView = view('matrix-list-view', rootDatabase.id, 'List B', { ...DEFAULT_DATABASE_VIEW_CONFIG, visibleProperties: ['root-title'] }, 'list')
  const boardView = view('matrix-board-view', rootDatabase.id, 'Board C', { ...DEFAULT_DATABASE_VIEW_CONFIG, visibleProperties: ['root-title'], options: { groupByPropertyId: 'root-select' } }, 'board')
  const timelineView = view('matrix-timeline-view', rootDatabase.id, 'Timeline D', { ...DEFAULT_DATABASE_VIEW_CONFIG }, 'timeline')
  const api = await installApi(page, [
    block('matrix-view-switch-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: tableView.id } }, 100),
    block('matrix-independent-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: tableView.id } }, 200),
    block('matrix-initial-timeline-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 300),
  ], { databases: [rootDatabase], views: [tableView, listView, boardView, timelineView], properties: rootProperties, records: [basicRecord] })
  api.pages.push({ ...pageRecord, id: basicRecord.pageId, title: 'Matrix record', role: 'database-record' })
  await page.goto('/#/app/database-workspace/page/database-page')
  const database = page.locator('#database-block-matrix-view-switch-block')
  await expect(database.locator('tbody')).toBeVisible()
  const independentDatabase = page.locator('#database-block-matrix-independent-block')
  await expect(independentDatabase.locator('tbody')).toBeVisible()
  const initialTimeline = page.locator('#database-block-matrix-initial-timeline-block')
  await expect(initialTimeline.getByTestId('database-timeline')).toBeVisible()
  await expect(initialTimeline.locator('table, [data-testid="database-list"], [data-testid="database-board"]')).toHaveCount(0)
  await page.evaluate(() => {
    const editor = document.querySelector('.eotion-editor')
    const database = document.querySelector('#database-block-matrix-view-switch-block')
    if (!editor || !database) throw new Error('Expected matrix editor and Database NodeView')
    ;(window as Window & { __viewMatrixIdentity?: { editor: Element; database: Element; editorComponent: unknown; databaseComponent: unknown } }).__viewMatrixIdentity = {
      editor,
      database,
      editorComponent: (editor as Element & { __vueParentComponent?: unknown }).__vueParentComponent,
      databaseComponent: (database as Element & { __vueParentComponent?: unknown }).__vueParentComponent,
    }
  })

  const transitions = [
    { target: timelineView, name: 'Timeline D', renderer: 'timeline' as const },
    { target: listView, name: 'List B', renderer: 'list' as const },
    { target: tableView, name: 'Table A', renderer: 'table' as const },
    { target: boardView, name: 'Board C', renderer: 'board' as const },
    { target: tableView, name: 'Table A', renderer: 'table' as const },
    { target: listView, name: 'List B', renderer: 'list' as const },
    { target: boardView, name: 'Board C', renderer: 'board' as const },
    { target: listView, name: 'List B', renderer: 'list' as const },
  ]
  for (const transition of transitions) {
    await database.getByRole('button', { name: '切换视图' }).click()
    await page.getByRole('group', { name: '数据库视图', exact: true }).getByRole('button', { name: transition.name, exact: true }).click()
    if (transition.renderer === 'table') await expect(database.locator('tbody')).toBeVisible()
    if (transition.renderer === 'list') {
      await expect(database.getByTestId('database-list')).toBeVisible()
      await expect(database.locator('.eotion-database-list-property')).toHaveCount(0)
    }
    if (transition.renderer === 'board') {
      await expect(database.getByTestId('database-board')).toBeVisible()
      await expect(database.locator('.eotion-database-board-column-name')).toHaveText(['Open', 'Done', '未分组'])
    }
    if (transition.renderer === 'timeline') {
      await expect(database.getByTestId('database-timeline')).toBeVisible()
      await expect(database.locator('table, [data-testid="database-list"], [data-testid="database-board"]')).toHaveCount(0)
      await expect(database.getByRole('button', { name: '新建记录' })).toBeVisible()
      await expect.poll(() => api.blocks.find(item => item.id === 'matrix-independent-block')?.props.node?.attrs).toEqual({ databaseId: rootDatabase.id, viewId: tableView.id })
    }
    await expect(database.getByRole('button', { name: '切换视图' })).toContainText(transition.name)
    await expect.poll(() => api.blocks.find(item => item.id === 'matrix-view-switch-block')?.props.node?.attrs).toEqual({ databaseId: rootDatabase.id, viewId: transition.target.id })
    await expect.poll(() => page.evaluate(() => {
      const before = (window as Window & { __viewMatrixIdentity?: { editor: Element; database: Element; editorComponent: unknown; databaseComponent: unknown } }).__viewMatrixIdentity!
      const editor = document.querySelector('.eotion-editor')
      const database = document.querySelector('#database-block-matrix-view-switch-block')
      return {
        editorSame: editor === before.editor,
        databaseSame: database === before.database,
        editorComponentSame: (editor as (Element & { __vueParentComponent?: unknown }) | null)?.__vueParentComponent === before.editorComponent,
        databaseComponentSame: (database as (Element & { __vueParentComponent?: unknown }) | null)?.__vueParentComponent === before.databaseComponent,
      }
    })).toEqual({ editorSame: true, databaseSame: true, editorComponentSame: true, databaseComponentSame: true })
    if (transition.renderer === 'timeline') {
      await database.getByRole('button', { name: '切换视图' }).click()
      const viewMenu = page.getByRole('group', { name: '数据库视图', exact: true })
      await expect(viewMenu.getByRole('group', { name: '新建数据库视图' }).getByRole('button')).toHaveText(['新建视图', '新建列表视图', '新建看板视图'])
      await expect(viewMenu.getByRole('button', { name: '编辑视图 Timeline D' })).toBeVisible()
      await expect(viewMenu.getByRole('button', { name: '删除视图 Timeline D' })).toBeVisible()
      await page.keyboard.press('Escape')
    }
    await database.getByRole('button', { name: '数据库设置' }).click()
    const settingsMenu = page.getByRole('menu', { name: '数据库设置' })
    if (transition.renderer === 'board') await expect(settingsMenu.getByRole('menuitem', { name: '分组属性', exact: true })).toBeVisible()
    else await expect(settingsMenu.getByRole('menuitem', { name: '分组属性', exact: true })).toHaveCount(0)
    if (transition.renderer === 'timeline') {
      await expect(settingsMenu.getByRole('menuitem', { name: '筛选', exact: true })).toBeVisible()
      await expect(settingsMenu.getByRole('menuitem', { name: '排序', exact: true })).toBeVisible()
    }
    await page.keyboard.press('Escape')
  }
  await database.getByRole('button', { name: '切换视图' }).click()
  await page.getByRole('group', { name: '数据库视图', exact: true }).getByRole('button', { name: 'Timeline D', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(database.getByTestId('database-timeline')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  const selectorBounds = await database.getByRole('button', { name: '切换视图' }).boundingBox()
  expect(selectorBounds).toBeTruthy()
  expect(selectorBounds!.x + selectorBounds!.width).toBeLessThanOrEqual(390)
})

test('Timeline shell keeps local zoom, exposes the seven scales, and has no table fallback', async ({ page, context }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const defaultTimeline = view('shell-default-timeline', rootDatabase.id, 'Timeline default', { ...DEFAULT_DATABASE_VIEW_CONFIG }, 'timeline')
  const configuredTimeline = view('shell-configured-timeline', rootDatabase.id, 'Timeline configured', {
    ...DEFAULT_DATABASE_VIEW_CONFIG, options: { timeline: { scale: 'week' } },
  }, 'timeline')
  const emptyDatabase = database('shell-empty-database', 'Empty database')
  const emptyTimeline = view('shell-empty-timeline', emptyDatabase.id, 'Empty Timeline', { ...DEFAULT_DATABASE_VIEW_CONFIG }, 'timeline')
  const tableView = view('shell-empty-table', emptyDatabase.id, 'Empty Table', { ...DEFAULT_DATABASE_VIEW_CONFIG }, 'table')
  const api = await installApi(page, [
    block('shell-default-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: defaultTimeline.id } }, 100),
    block('shell-peer-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: defaultTimeline.id } }, 200),
    block('shell-configured-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: configuredTimeline.id } }, 300),
    block('shell-empty-timeline-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: emptyDatabase.id, viewId: emptyTimeline.id } }, 400),
    block('shell-empty-table-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: emptyDatabase.id, viewId: tableView.id } }, 500),
  ], {
    databases: [rootDatabase, emptyDatabase], views: [defaultTimeline, configuredTimeline, emptyTimeline, tableView],
    properties: [...rootProperties, property('shell-empty-title', emptyDatabase.id, 'Name', 'title')], records: [basicRecord],
  })
  api.pages.push({ ...pageRecord, id: basicRecord.pageId, title: 'Timeline shell record', role: 'database-record' })
  await page.goto('/#/app/database-workspace/page/database-page')

  const defaultDatabase = page.locator('#database-block-shell-default-block')
  const peerDatabase = page.locator('#database-block-shell-peer-block')
  const configuredDatabase = page.locator('#database-block-shell-configured-block')
  const emptyTimelineDatabase = page.locator('#database-block-shell-empty-timeline-block')
  const defaultShell = defaultDatabase.getByTestId('database-timeline')
  const peerShell = peerDatabase.getByTestId('database-timeline')
  const configuredShell = configuredDatabase.getByTestId('database-timeline')
  const emptyTimelineShell = emptyTimelineDatabase.getByTestId('database-timeline')
  const scaleSelect = defaultShell.getByLabel('时间轴刻度')
  const peerScaleSelect = peerShell.getByLabel('时间轴刻度')
  const configuredScaleSelect = configuredShell.getByLabel('时间轴刻度')
  await expect(defaultShell).toBeVisible()
  await expect(defaultShell).toHaveAttribute('data-scale', 'month')
  await expect(defaultShell).toHaveAttribute('data-configured-scale', 'month')
  await expect(peerShell).toHaveAttribute('data-scale', 'month')
  await expect(configuredShell).toHaveAttribute('data-scale', 'week')
  await expect(configuredShell).toHaveAttribute('data-configured-scale', 'week')
  await expect(defaultDatabase.locator('table, [data-testid="database-list"], [data-testid="database-board"]')).toHaveCount(0)
  await expect(emptyTimelineShell).toBeVisible()
  await expect(emptyTimelineShell.locator('details')).toHaveCount(0)
  await expect(emptyTimelineDatabase.locator('table, [data-testid="database-list"], [data-testid="database-board"]')).toHaveCount(0)
  await expect(emptyTimelineShell.getByText('暂无记录', { exact: true })).toBeVisible()
  await expect(defaultShell.getByText('未排期（1）', { exact: true })).toBeVisible()
  await expect(defaultShell.getByTestId('timeline-unscheduled-row')).toContainText('Timeline shell record')
  await defaultShell.getByRole('button', { name: '打开记录：Timeline shell record' }).click()
  await expect(page.locator('[data-overlay-mode="drawer"]')).toBeVisible()
  await page.getByRole('button', { name: '关闭记录' }).click()

  const scaleIds = ['hour', 'day', 'week', 'biweek', 'month', 'quarter', 'year']
  await expect(scaleSelect.locator('option')).toHaveCount(scaleIds.length)
  expect(await scaleSelect.locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value))).toEqual(scaleIds)
  const recordReadsBeforeZoom = api.requests.filter(item => item.method === 'GET' && item.path.endsWith(`/views/${defaultTimeline.id}/table`)).length
  const viewWritesBeforeZoom = api.requests.filter(item => ['POST', 'PATCH', 'DELETE'].includes(item.method) && item.path.includes(`/databases/${rootDatabase.id}/views`)).length
  for (const scale of scaleIds) {
    await scaleSelect.selectOption(scale)
    await expect(defaultShell).toHaveAttribute('data-scale', scale)
    await expect(peerShell).toHaveAttribute('data-scale', 'month')
    await expect(peerScaleSelect).toHaveValue('month')
    await expect(configuredShell).toHaveAttribute('data-scale', 'week')
    await expect(configuredScaleSelect).toHaveValue('week')
  }
  expect(api.requests.filter(item => item.method === 'GET' && item.path.endsWith(`/views/${defaultTimeline.id}/table`))).toHaveLength(recordReadsBeforeZoom)
  expect(api.requests.filter(item => ['POST', 'PATCH', 'DELETE'].includes(item.method) && item.path.includes(`/databases/${rootDatabase.id}/views`))).toHaveLength(viewWritesBeforeZoom)

  const onlineTimelineScroller = defaultShell.getByTestId('timeline-scroll')
  const beforeOffline = await timelineViewport(onlineTimelineScroller)
  const tableReadsBeforeOffline = api.requests.filter(item => item.method === 'GET' && item.path.endsWith(`/views/${defaultTimeline.id}/table`)).length
  await page.evaluate(() => {
    const timeline = document.querySelector('#database-block-shell-default-block [data-testid="database-timeline"]')
    if (!timeline) throw new Error('Expected Timeline before going offline')
    ;(window as Window & { __onlineTimelineIdentity?: { timeline: Element; component: unknown } }).__onlineTimelineIdentity = {
      timeline, component: (timeline as Element & { __vueParentComponent?: unknown }).__vueParentComponent,
    }
  })
  api.offline = true
  await context.setOffline(true)
  await expect(defaultDatabase.locator('.eotion-database-offline')).toContainText('离线')
  api.offline = false
  await context.setOffline(false)
  await expect.poll(() => api.requests.filter(item => item.method === 'GET' && item.path.endsWith(`/views/${defaultTimeline.id}/table`)).length).toBe(tableReadsBeforeOffline + 2)
  await expect(defaultShell).toHaveAttribute('data-scale', 'year')
  const afterOnline = await timelineViewport(onlineTimelineScroller)
  expect(Math.abs((afterOnline.start + afterOnline.end) / 2 - (beforeOffline.start + beforeOffline.end) / 2)).toBeLessThan(2)
  expect(await page.evaluate(() => {
    const before = (window as Window & { __onlineTimelineIdentity?: { timeline: Element; component: unknown } }).__onlineTimelineIdentity!
    const current = document.querySelector('#database-block-shell-default-block [data-testid="database-timeline"]') as (Element & { __vueParentComponent?: unknown }) | null
    return current === before.timeline && current?.__vueParentComponent === before.component
  })).toBe(true)

  const emptyTable = page.locator('#database-block-shell-empty-table-block')
  await expect(emptyTable.locator('table')).toBeVisible()
  await expect(emptyTable.getByText('暂无记录', { exact: true })).toBeVisible()
  await expect(emptyTable.getByTestId('database-timeline')).toHaveCount(0)

  for (const [width, height, suffix] of [[1440, 900, 'desktop'], [390, 844, 'phone']] as const) {
    await page.setViewportSize({ width, height })
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme)
      if (width === 390) {
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
        for (const name of ['上一个时间段', '今天', '下一个时间段']) {
          const button = defaultShell.getByRole('button', { name })
          await expect(button).toBeVisible()
          const bounds = await button.boundingBox()
          expect(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width).toBe(true)
        }
        const selectBounds = await scaleSelect.boundingBox()
        expect(selectBounds && selectBounds.x >= 0 && selectBounds.x + selectBounds.width <= width).toBe(true)
      }
      await timelineScreenshot(page, testInfo, `p112a-timeline-shell-${suffix}-${theme}`)
    }
  }
})

test.describe('P11.2D Timeline acceptance', () => {
  test.use({ timezoneId: 'UTC' })

  test('validates scales, coordinates, cached projections, network silence, and empty screenshots', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.clock.setFixedTime(new Date('2026-10-13T00:00:00.000Z'))
    const timelineView = view('p112d-acceptance-view', rootDatabase.id, 'P11.2D Timeline', {
      ...DEFAULT_DATABASE_VIEW_CONFIG,
      visibleProperties: ['root-title'], propertyOrder: ['root-title'],
      options: { timeline: {
        dateSource: { mode: 'date-property', propertyId: 'root-date' },
        frozenTable: { visible: true, visibleProperties: ['root-title'], propertyOrder: ['root-title'] },
      } },
    }, 'timeline')
    const emptyDatabase = database('p112d-empty-database', 'Empty timeline')
    const emptyView = view('p112d-empty-view', emptyDatabase.id, 'Empty Timeline', {
      ...DEFAULT_DATABASE_VIEW_CONFIG,
      options: { timeline: { dateSource: { mode: 'date-property', propertyId: 'p112d-empty-date' } } },
    }, 'timeline')
    const unscheduledDatabase = database('p112d-unscheduled-database', 'Unscheduled timeline')
    const unscheduledView = view('p112d-unscheduled-view', unscheduledDatabase.id, 'Unscheduled Timeline', {
      ...DEFAULT_DATABASE_VIEW_CONFIG,
      options: { timeline: { dateSource: { mode: 'date-property', propertyId: 'p112d-unscheduled-date' } } },
    }, 'timeline')
    const records = [
      record('p112d-datetime-point', rootDatabase.id, 'p112d-point-page', { 'root-title': 'UTC datetime point', 'root-date': { start: '2026-10-13T00:30:00.000Z', timeZone: 'America/New_York' } }),
      record('p112d-datetime-range', rootDatabase.id, 'p112d-range-page', { 'root-title': 'UTC datetime range', 'root-date': { start: '2026-10-12T00:15:00.000Z', end: '2026-10-20T01:45:00.000Z', timeZone: 'America/New_York' } }),
      record('p112d-date-only', rootDatabase.id, 'p112d-date-page', { 'root-title': 'Date-only milestone', 'root-date': '2026-10-13' }),
    ]
    const api = await installApi(page, [
      block('p112d-acceptance-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100),
      block('p112d-empty-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: emptyDatabase.id, viewId: emptyView.id } }, 200),
      block('p112d-unscheduled-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: unscheduledDatabase.id, viewId: unscheduledView.id } }, 300),
    ], {
      databases: [rootDatabase, emptyDatabase, unscheduledDatabase],
      views: [timelineView, emptyView, unscheduledView],
      properties: [
        ...rootProperties,
        property('p112d-empty-title', emptyDatabase.id, 'Name', 'title'),
        property('p112d-empty-date', emptyDatabase.id, 'Date', 'date'),
        property('p112d-unscheduled-title', unscheduledDatabase.id, 'Name', 'title'),
        property('p112d-unscheduled-date', unscheduledDatabase.id, 'Date', 'date'),
      ],
      records: [...records, record('p112d-unscheduled-record', unscheduledDatabase.id, 'p112d-unscheduled-page', { 'p112d-unscheduled-title': 'No date scheduled' })],
    })
    await page.goto('/#/app/database-workspace/page/database-page')
    const databaseBlock = page.locator('#database-block-p112d-acceptance-block')
    const timeline = databaseBlock.getByTestId('database-timeline')
    await expect(timeline).toBeVisible()
    await expect(databaseBlock.getByTestId('timeline-frozen-table')).toBeVisible()
    const scroller = timeline.getByTestId('timeline-scroll')
    await expect.poll(async () => (await timelineViewport(scroller)).width).toBeGreaterThan(0)
    await expect.poll(() => timeline.evaluate(root => (root as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, any> } }).__vueParentComponent?.setupState?.projectedItems?.length)).toBe(3)
    const tablePath = `/api/workspaces/${workspace.id}/databases/${rootDatabase.id}/views/${timelineView.id}/table`
    const readsBeforeScaleChanges = api.requests.filter(request => request.method === 'GET' && request.path === tablePath).length
    const writesBeforeScaleChanges = api.requests.filter(request => ['POST', 'PATCH', 'DELETE'].includes(request.method) && request.path.includes(`/databases/${rootDatabase.id}/views`)).length
    const viewPatchesBeforeScaleChanges = api.requests.filter(request => request.method === 'PATCH' && request.path.includes(`/databases/${rootDatabase.id}/views`)).length
    const recordPatchesBeforeScaleChanges = api.requests.filter(request => request.method === 'PATCH' && request.path.includes(`/databases/${rootDatabase.id}/records/`)).length
    const allPatchesBeforeScaleChanges = api.requests.filter(request => request.method === 'PATCH').length
    await timeline.evaluate(root => {
      const setup = (root as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, any> } }).__vueParentComponent?.setupState
      const viewport = setup?.viewport
      if (!setup || !viewport?.state?.value || !Array.isArray(setup.projectedItems) || !(setup.temporalMap instanceof Map) || !(setup.frozenDisplayMap instanceof Map)) throw new Error('Timeline acceptance state is unavailable')
      ;(window as Window & { __p112dIdentity?: { component: unknown; projectedItems: unknown; temporalMap: unknown; frozenDisplayMap: unknown } }).__p112dIdentity = {
        component: (root as HTMLElement & { __vueParentComponent?: unknown }).__vueParentComponent,
        projectedItems: setup.projectedItems, temporalMap: setup.temporalMap, frozenDisplayMap: setup.frozenDisplayMap,
      }
    })
    const centerOf = async () => {
      const viewport = await timelineViewport(scroller)
      return (viewport.start + viewport.end) / 2
    }
    const scales = ['hour', 'day', 'week', 'biweek', 'month', 'quarter', 'year'] as const
    const samples: Array<Record<string, unknown>> = []
    const assertGeometry = async (phase: string, scale: typeof scales[number]) => {
      const sample = await timeline.evaluate(root => {
        const setup = (root as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, any> } }).__vueParentComponent?.setupState
        const viewport = setup?.viewport
        const state = viewport?.state?.value
        const rawTicks = viewport?.ticks?.value
        const rulerTicks = viewport?.rulerTicks?.value
        const rows = setup?.rowGeometry
        const temporalMap = setup?.temporalMap
        if (!state || !Array.isArray(rawTicks) || !Array.isArray(rulerTicks) || !Array.isArray(rows) || !(temporalMap instanceof Map)) throw new Error('Timeline acceptance projection is unavailable')
        const bars = rows.map((row: any) => {
          const temporal = temporalMap.get(row.item.recordId)
          const element = root.querySelector<HTMLElement>(`[data-testid="timeline-bar"][data-record-id="${row.item.recordId}"]`)
          return temporal ? {
            recordId: row.item.recordId, kind: row.item.kind,
            startMs: temporal.startMs, visualEndMs: temporal.visualEndMs,
            sourceTimeZone: row.item.start?.sourceTimeZone ?? null,
            endSourceTimeZone: row.item.end?.sourceTimeZone ?? null,
            rawX: row.geometry?.rawX ?? null, rawWidth: row.geometry?.rawWidth ?? null,
            x: row.geometry?.x ?? null, width: row.geometry?.width ?? null,
            clippedLeft: row.geometry?.clippedLeft ?? false, clippedRight: row.geometry?.clippedRight ?? false,
            marker: row.geometry?.marker ?? false, offscreen: row.geometry?.offscreen ?? null,
            domLeft: element ? Number.parseFloat(element.style.left) : null,
            domWidth: element && !row.geometry?.marker ? Number.parseFloat(element.style.width) : null,
          } : null
        }).filter(Boolean)
        const rulerDom = [...root.querySelectorAll<HTMLElement>('.eotion-timeline-ruler-tick')].map(element => ({ left: Number.parseFloat(element.style.left), label: element.querySelector('.eotion-timeline-ruler-label')?.textContent ?? '', level: element.classList.contains('eotion-timeline-ruler-tick--major') ? 'major' : 'minor' }))
        const gridDom = [...root.querySelectorAll<HTMLElement>('.eotion-timeline-grid-line')].map(element => Number.parseFloat(element.style.left))
        const today = root.querySelector<HTMLElement>('[data-testid="timeline-today-line"]')
        return {
          originMs: state.originMs, visibleStartMs: state.visibleStartMs, visibleEndMs: state.visibleEndMs,
          overscanStartMs: state.overscanStartMs, overscanEndMs: state.overscanEndMs,
          width: state.width, scrollLeft: state.scrollLeft, generation: state.generation,
          nativeScrollLeft: root.querySelector<HTMLElement>('[data-testid="timeline-scroll"]')?.scrollLeft ?? null,
          scale: state.scale, displayTimeZone: viewport.displayTimeZone?.value,
          projectedCount: setup.projectedItems.length, temporalCount: temporalMap.size,
          rawTicks: rawTicks.map((tick: any) => ({ unit: tick.unit, level: tick.level, boundaryMs: tick.boundaryMs, spanEndMs: tick.spanEndMs, label: tick.label })),
          rulerTicks: rulerTicks.map((tick: any) => ({ unit: tick.unit, level: tick.level, boundaryMs: tick.boundaryMs, x: tick.x, label: tick.label })),
          rulerDom, gridDom, todayMs: viewport.todayMs?.value ?? null, todayX: viewport.todayX?.value ?? null,
          todayDomLeft: today ? Number.parseFloat(today.style.left) : null,
          bars,
        }
      })
      const expectedPxPerHour: Record<typeof scale, number> = {
        hour: 48, day: 16, week: 4, biweek: 8 / 3, month: 1.5, quarter: 0.5, year: 1 / 12,
      }
      const rate = expectedPxPerHour[scale] / 3_600_000
      const expectedById = new Map([
        ['p112d-datetime-point', { start: Date.parse('2026-10-13T00:30:00.000Z'), end: null }],
        ['p112d-datetime-range', { start: Date.parse('2026-10-12T00:15:00.000Z'), end: Date.parse('2026-10-20T01:45:00.000Z') }],
        ['p112d-date-only', { start: Date.parse('2026-10-13T00:00:00.000Z'), end: null }],
      ])
      expect(sample.displayTimeZone).toBe('UTC')
      expect(sample.scale).toBe(scale)
      expect(Math.abs(sample.nativeScrollLeft - sample.scrollLeft)).toBeLessThanOrEqual(1)
      expect(sample.rawTicks.length).toBeLessThanOrEqual(80)
      expect(sample.rawTicks.length).toBeGreaterThan(0)
      const unitSignature = sample.rawTicks.map(tick => `${tick.level}:${tick.unit}`)
      const expectedUnits: Record<typeof scale, { major: string; minor: string }> = {
        hour: { major: 'day', minor: 'hour' }, day: { major: 'day', minor: 'hour' },
        week: { major: 'week', minor: 'day' }, biweek: { major: 'week', minor: 'day' },
        month: { major: 'month', minor: 'day' }, quarter: { major: 'quarter', minor: 'week' }, year: { major: 'year', minor: 'month' },
      }
      expect(unitSignature).toContain(`major:${expectedUnits[scale].major}`)
      expect(unitSignature).toContain(`minor:${expectedUnits[scale].minor}`)
      expect(sample.rawTicks.every(tick => tick.spanEndMs > tick.boundaryMs && tick.label.length > 0)).toBe(true)
      for (const tick of sample.rulerTicks) {
        const expectedX = (tick.boundaryMs - sample.originMs) * rate - sample.scrollLeft
        expect(Math.abs(tick.x - expectedX)).toBeLessThanOrEqual(0.5)
      }
      expect(sample.rulerDom.length).toBe(sample.rulerTicks.length)
      expect(sample.rulerDom.every((tick, index) => Math.abs(tick.left - sample.rulerTicks[index]!.x) <= 0.5 && tick.label.length > 0)).toBe(true)
      expect(sample.gridDom.length).toBe(sample.rawTicks.length)
      expect(sample.gridDom.every((left, index) => Math.abs(left - (sample.rawTicks[index]!.boundaryMs - sample.originMs) * rate) <= 0.5)).toBe(true)
      expect(sample.rawTicks.every(tick => {
        const date = new Date(tick.boundaryMs)
        const midnight = date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0
        if (tick.unit === 'hour') return date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0
        if (tick.unit === 'day' || tick.unit === 'week') return midnight
        if (tick.unit === 'month') return midnight && date.getUTCDate() === 1
        if (tick.unit === 'quarter') return midnight && date.getUTCDate() === 1 && [0, 3, 6, 9].includes(date.getUTCMonth())
        return midnight && date.getUTCDate() === 1 && date.getUTCMonth() === 0
      })).toBe(true)
      const minorHourTicks = sample.rawTicks.filter(tick => tick.level === 'minor' && tick.unit === 'hour')
      if (scale === 'hour') expect(minorHourTicks.every(tick => new Date(tick.boundaryMs).getUTCMinutes() === 0)).toBe(true)
      if (scale === 'day') expect(minorHourTicks.every(tick => new Date(tick.boundaryMs).getUTCHours() % 6 === 0)).toBe(true)
      const todayMs = Date.parse('2026-10-13T00:00:00.000Z')
      const todayIsInOverscan = todayMs >= sample.overscanStartMs && todayMs <= sample.overscanEndMs
      if (todayIsInOverscan) {
        const todayX = (todayMs - sample.originMs) * rate
        expect(sample.todayMs).toBe(todayMs)
        expect(sample.todayX).toBeCloseTo(todayX, 1)
        expect(sample.todayDomLeft).toBeCloseTo(todayX, 1)
      } else {
        expect(sample.todayX).toBeNull()
        expect(sample.todayDomLeft).toBeNull()
      }
      expect(sample.bars).toHaveLength(3)
      for (const bar of sample.bars) {
        const expected = expectedById.get(bar.recordId)!
        expect(bar.startMs).toBe(expected.start)
        expect(bar.visualEndMs).toBe(expected.end)
        if (bar.recordId === 'p112d-datetime-point' || bar.recordId === 'p112d-datetime-range') {
          expect(bar.sourceTimeZone).toBe('America/New_York')
          if (bar.recordId === 'p112d-datetime-range') expect(bar.endSourceTimeZone).toBe('America/New_York')
        }
        expect(bar.rawX).toBeCloseTo((expected.start - sample.originMs) * rate, 1)
        const expectedRawWidth = expected.end === null ? 0 : (expected.end - expected.start) * rate
        expect(bar.rawWidth).toBeCloseTo(expectedRawWidth, 1)
        const expectedX = expected.end === null ? bar.rawX : Math.max(sample.scrollLeft, bar.rawX)
        const expectedRight = expected.end === null ? bar.rawX : Math.min(sample.scrollLeft + sample.width, bar.rawX + bar.rawWidth)
        expect(bar.x).toBeCloseTo(expectedX, 1)
        expect(bar.width).toBeCloseTo(expected.end === null ? 0 : Math.max(0, expectedRight - expectedX), 1)
        if (bar.domLeft !== null) expect(bar.domLeft).toBeCloseTo(bar.x, 1)
        if (bar.domWidth !== null) expect(bar.domWidth).toBeCloseTo(bar.width, 1)
        if (bar.offscreen === null) expect(bar.domLeft).not.toBeNull()
        else expect(bar.domLeft).toBeNull()
        if (phase === 'scale' && scale === 'hour' && bar.recordId === 'p112d-datetime-range') {
          expect(bar.clippedLeft).toBe(true)
          expect(bar.clippedRight).toBe(true)
        }
        if (bar.recordId === 'p112d-datetime-range') expect(bar.marker).toBe(false)
        if (bar.recordId !== 'p112d-datetime-range') expect(bar.marker).toBe(true)
      }
      const unchanged = await timeline.evaluate(root => {
        const setup = (root as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, any> } }).__vueParentComponent?.setupState
        const before = (window as Window & { __p112dIdentity?: { component: unknown; projectedItems: unknown; temporalMap: unknown; frozenDisplayMap: unknown } }).__p112dIdentity!
        return (root as HTMLElement & { __vueParentComponent?: unknown }).__vueParentComponent === before.component
          && setup?.projectedItems === before.projectedItems
          && setup?.temporalMap === before.temporalMap
          && setup?.frozenDisplayMap === before.frozenDisplayMap
      })
      expect(unchanged).toBe(true)
      return {
        phase, ...sample,
        labelSignature: [...new Set(sample.rulerTicks.map(tick => `${tick.level}:${tick.unit}:${tick.label}`))],
        labelDensity: { major: sample.rulerTicks.filter(tick => tick.level === 'major').length, minor: sample.rulerTicks.filter(tick => tick.level === 'minor').length },
        rawTickCount: sample.rawTicks.length,
        cacheRefsUnchanged: unchanged,
      }
    }

    let previousCenter = await centerOf()
    for (const scale of scales) {
      await timeline.getByLabel('时间轴刻度').selectOption(scale)
      await expect(timeline).toHaveAttribute('data-scale', scale)
      const center = await centerOf()
      const viewport = await timelineViewport(scroller)
      const centerDeltaMs = Math.abs(center - previousCenter)
      expect(centerDeltaMs).toBeLessThanOrEqual(Math.max(1, (viewport.end - viewport.start) / viewport.width / 2))
      previousCenter = center
      samples.push({ ...(await assertGeometry('scale', scale)), centerDeltaMs })
    }
    expect(new Set(samples.slice(0, scales.length).map(sample => JSON.stringify(sample.labelSignature))).size).toBeGreaterThan(1)

    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    const beforeScroll = await timelineViewport(scroller)
    const scrollLeftBefore = await scroller.evaluate(element => (element as HTMLElement).scrollLeft)
    await scroller.evaluate(element => { (element as HTMLElement).scrollLeft += 180 })
    await expect.poll(() => scroller.evaluate(element => (element as HTMLElement).scrollLeft)).toBeGreaterThan(scrollLeftBefore)
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    expect((await timelineViewport(scroller)).scrollLeft).toBeGreaterThan(beforeScroll.scrollLeft)
    samples.push(await assertGeometry('ordinary-scroll', 'year'))
    const beforeRebase = await timelineViewport(scroller)
    const target = await scroller.evaluate(element => {
      const node = element as HTMLElement
      node.scrollLeft = Math.round((node.scrollWidth - node.clientWidth) * 0.9)
      return node.scrollLeft
    })
    expect(target).toBeGreaterThan(beforeRebase.width)
    await expect.poll(async () => (await timelineViewport(scroller)).generation).toBeGreaterThan(beforeRebase.generation)
    samples.push(await assertGeometry('rebase', 'year'))
    await timeline.getByRole('button', { name: '今天', exact: true }).click()
    await expect(timeline.getByTestId('timeline-today-line')).toBeVisible()
    await expect(timeline.locator('[data-testid="timeline-bar"][data-record-id="p112d-datetime-point"]')).toBeAttached()
    await expect.poll(async () => {
      const viewport = await timelineViewport(scroller)
      return Math.abs((viewport.start + viewport.end) / 2 - Date.parse('2026-10-13T00:00:00.000Z'))
    }).toBeLessThan(1)
    samples.push(await assertGeometry('today-recentered', 'year'))

    expect(api.requests.filter(request => request.method === 'GET' && request.path === tablePath)).toHaveLength(readsBeforeScaleChanges)
    expect(api.requests.filter(request => ['POST', 'PATCH', 'DELETE'].includes(request.method) && request.path.includes(`/databases/${rootDatabase.id}/views`))).toHaveLength(writesBeforeScaleChanges)
    expect(api.requests.filter(request => request.method === 'PATCH' && request.path.includes(`/databases/${rootDatabase.id}/views`))).toHaveLength(viewPatchesBeforeScaleChanges)
    expect(api.requests.filter(request => request.method === 'PATCH' && request.path.includes(`/databases/${rootDatabase.id}/records/`))).toHaveLength(recordPatchesBeforeScaleChanges)
    expect(api.requests.filter(request => request.method === 'PATCH')).toHaveLength(allPatchesBeforeScaleChanges)
    for (const [blockId, screenshotName] of [['p112d-empty-block', 'p112d-timeline-empty'], ['p112d-unscheduled-block', 'p112d-timeline-all-unscheduled']] as const) {
      const targetTimeline = page.locator(`#database-block-${blockId}`).getByTestId('database-timeline')
      await targetTimeline.scrollIntoViewIfNeeded()
      if (blockId === 'p112d-empty-block') await expect(targetTimeline.getByText('暂无记录', { exact: true })).toBeVisible()
      else await expect(targetTimeline.locator('[data-testid="timeline-unscheduled-row"]')).toContainText('No date scheduled')
      const screenshotPath = testInfo.outputPath(`${screenshotName}.png`)
      await page.screenshot({ path: screenshotPath, animations: 'disabled' })
      await testInfo.attach(`${screenshotName}.png`, { path: screenshotPath, contentType: 'image/png' })
    }
    const artifact = {
      browserVersion: page.context().browser()?.version() ?? 'unknown',
      viewport: page.viewportSize(),
      displayTimeZone: 'UTC',
      readsBeforeScaleChanges, readsAfterScaleChanges: api.requests.filter(request => request.method === 'GET' && request.path === tablePath).length,
      writesBeforeScaleChanges, writesAfterScaleChanges: api.requests.filter(request => ['POST', 'PATCH', 'DELETE'].includes(request.method) && request.path.includes(`/databases/${rootDatabase.id}/views`)).length,
      viewPatchesBeforeScaleChanges, viewPatchesAfterScaleChanges: api.requests.filter(request => request.method === 'PATCH' && request.path.includes(`/databases/${rootDatabase.id}/views`)).length,
      recordPatchesBeforeScaleChanges, recordPatchesAfterScaleChanges: api.requests.filter(request => request.method === 'PATCH' && request.path.includes(`/databases/${rootDatabase.id}/records/`)).length,
      allPatchesBeforeScaleChanges, allPatchesAfterScaleChanges: api.requests.filter(request => request.method === 'PATCH').length,
      samples,
    }
    const samplePath = testInfo.outputPath('p112d-timeline-scale-dom-cache-samples.json')
    const sampleJson = JSON.stringify(artifact, null, 2)
    await writeFile(samplePath, sampleJson, 'utf8')
    await testInfo.attach('p112d-timeline-scale-dom-cache-samples.json', { path: samplePath, contentType: 'application/json' })
  })
})

test('Timeline generic records project date sources, retain unscheduled order, and open the selected record read-only', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.clock.setFixedTime(new Date('2026-10-13T12:00:00.000Z'))
  const singleView = view('generic-single-timeline', rootDatabase.id, 'Single date', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    visibleProperties: ['root-title', 'root-text'],
    propertyOrder: ['root-title', 'root-text'],
    options: { timeline: { dateSource: { mode: 'date-property', propertyId: 'root-date' } } },
  }, 'timeline')
  const alternateSingleView = view('generic-single-timeline-alternate', rootDatabase.id, 'Single date alternate', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    visibleProperties: ['root-title', 'root-text'],
    propertyOrder: ['root-title', 'root-text'],
    options: { timeline: { scale: 'week', dateSource: { mode: 'date-property', propertyId: 'root-date' } } },
  }, 'timeline')
  const startEndView = view('generic-start-end-timeline', rootDatabase.id, 'Start and end', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    visibleProperties: ['root-title', 'root-text'],
    propertyOrder: ['root-title', 'root-text'],
    options: { timeline: { dateSource: { mode: 'start-end', startPropertyId: 'timeline-start', endPropertyId: 'timeline-end' } } },
  }, 'timeline')
  const datetimeView = view('generic-datetime-timeline', rootDatabase.id, 'Date and time', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    visibleProperties: ['root-title', 'root-text'],
    propertyOrder: ['root-title', 'root-text'],
    options: { timeline: { dateSource: { mode: 'date-property', propertyId: 'timeline-datetime' } } },
  }, 'timeline')
  const items = [
    record('generic-01-single-range', rootDatabase.id, 'generic-page-01', { 'root-title': 'Single range', 'root-date': { start: '2026-10-12', end: '2026-10-15' } }),
    record('generic-02-single-point', rootDatabase.id, 'generic-page-02', { 'root-title': 'Single milestone', 'root-date': '2026-10-13' }),
    record('generic-03-start-range', rootDatabase.id, 'generic-page-03', { 'root-title': 'Separated range', 'timeline-start': { start: '2026-10-12', end: '2026-10-30' }, 'timeline-end': { start: '2026-10-15', end: '2026-11-05' } }),
    record('generic-04-start-point', rootDatabase.id, 'generic-page-04', { 'root-title': 'Separated milestone', 'timeline-start': '2026-10-14' }),
    record('generic-05-start-missing', rootDatabase.id, 'generic-page-05', { 'root-title': 'Missing start', 'timeline-end': '2026-10-16' }),
    record('generic-06-start-invalid', rootDatabase.id, 'generic-page-06', { 'root-title': 'Invalid start', 'timeline-start': 'not-a-date', 'timeline-end': '2026-10-16' }),
    record('generic-07-start-reversed', rootDatabase.id, 'generic-page-07', { 'root-title': 'Reversed range', 'timeline-start': '2026-10-17', 'timeline-end': '2026-10-16' }),
    record('generic-08-start-incompatible', rootDatabase.id, 'generic-page-08', { 'root-title': 'Incompatible range', 'timeline-start': '2026-10-13', 'timeline-end': { start: '2026-10-13T15:45:00.000Z', timeZone: 'America/New_York' } }),
    record('generic-09-datetime-point', rootDatabase.id, 'generic-page-09', { 'root-title': 'Date time milestone', 'timeline-datetime': { start: '2026-10-13T11:30:00.000Z', timeZone: 'America/New_York' } }),
    record('generic-10-datetime-range', rootDatabase.id, 'generic-page-10', { 'root-title': 'Date time range', 'timeline-datetime': { start: '2026-10-13T12:00:00.000Z', end: '2026-10-13T15:45:00.000Z', timeZone: 'America/New_York' } }),
  ]
  const api = await installApi(page, [
    block('generic-timeline-single', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: singleView.id } }, 100),
    block('generic-timeline-start-end', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: startEndView.id } }, 200),
    block('generic-timeline-datetime', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: datetimeView.id } }, 300),
  ], {
    databases: [rootDatabase], views: [singleView, alternateSingleView, startEndView, datetimeView],
    properties: [
      ...rootProperties,
      property('timeline-start', rootDatabase.id, 'Hidden start', 'date'),
      property('timeline-end', rootDatabase.id, 'Hidden end', 'date'),
      property('timeline-datetime', rootDatabase.id, 'Hidden date and time', 'date'),
    ], records: items,
  })
  for (const item of items) api.pages.push({ ...pageRecord, id: item.pageId, title: String(item.properties['root-title']), role: 'database-record' })
  await page.goto('/#/app/database-workspace/page/database-page')

  const single = page.locator('#database-block-generic-timeline-single').getByTestId('database-timeline')
  const startEnd = page.locator('#database-block-generic-timeline-start-end').getByTestId('database-timeline')
  const datetime = page.locator('#database-block-generic-timeline-datetime').getByTestId('database-timeline')
  for (const timeline of [single, startEnd, datetime]) await expect(timeline).toBeVisible()

  const rowIds = (timeline: Locator) => timeline.locator('[data-timeline-row]').evaluateAll(elements => elements.map(element => {
    const row = element as HTMLElement
    return row.querySelector<HTMLElement>('[data-record-id]')?.dataset.recordId ?? row.dataset.recordId ?? ''
  }))
  const barIds = (timeline: Locator) => timeline.getByTestId('timeline-bar').evaluateAll(elements => elements.map(element => (element as HTMLElement).dataset.recordId ?? ''))
  const unscheduledIds = (timeline: Locator) => timeline.getByTestId('timeline-unscheduled-row').evaluateAll(elements => elements.map(element => (element as HTMLElement).dataset.recordId ?? ''))
  const allIds = items.map(item => item.id)
  await expect.poll(() => rowIds(single)).toEqual(allIds)
  await expect.poll(() => rowIds(startEnd)).toEqual(allIds)
  await expect.poll(() => rowIds(datetime)).toEqual(allIds)
  await expect.poll(() => barIds(single)).toEqual(['generic-01-single-range', 'generic-02-single-point'])
  await expect.poll(() => barIds(startEnd)).toEqual(['generic-03-start-range', 'generic-04-start-point'])
  await expect.poll(() => barIds(datetime)).toEqual(['generic-09-datetime-point', 'generic-10-datetime-range'])
  await expect.poll(() => unscheduledIds(startEnd)).toEqual(['generic-01-single-range', 'generic-02-single-point', 'generic-05-start-missing', 'generic-06-start-invalid', 'generic-07-start-reversed', 'generic-08-start-incompatible', 'generic-09-datetime-point', 'generic-10-datetime-range'])
  await expect(startEnd.locator('[data-timeline-row][data-record-id="generic-05-start-missing"] [data-testid="timeline-unscheduled-row"]')).toContainText('缺少开始日期')
  await expect(startEnd.locator('[data-timeline-row][data-record-id="generic-06-start-invalid"] [data-testid="timeline-unscheduled-row"]')).toContainText('日期无效')
  await expect(startEnd.locator('[data-timeline-row][data-record-id="generic-07-start-reversed"] [data-testid="timeline-unscheduled-row"]')).toContainText('结束日期早于开始日期')
  await expect(startEnd.locator('[data-timeline-row][data-record-id="generic-08-start-incompatible"] [data-testid="timeline-unscheduled-row"]')).toContainText('起止日期精度不同')
  await expect(single).not.toContainText('Hidden date')
  await expect(startEnd).not.toContainText('Hidden start')
  await expect(startEnd).not.toContainText('Hidden end')
  await expect(datetime).not.toContainText('Hidden date and time')

  await expect(single.locator('[data-testid="timeline-bar"][data-record-id="generic-01-single-range"]')).toHaveAttribute('data-marker', 'false')
  await expect(single.locator('[data-testid="timeline-bar"][data-record-id="generic-02-single-point"]')).toHaveAttribute('data-marker', 'true')
  await expect(startEnd.locator('[data-testid="timeline-bar"][data-record-id="generic-03-start-range"]')).toHaveAttribute('data-marker', 'false')
  await expect(startEnd.locator('[data-testid="timeline-bar"][data-record-id="generic-04-start-point"]')).toHaveAttribute('data-marker', 'true')
  await expect(datetime.locator('[data-testid="timeline-bar"][data-record-id="generic-09-datetime-point"]')).toHaveAttribute('data-marker', 'true')
  await expect(datetime.locator('[data-testid="timeline-bar"][data-record-id="generic-10-datetime-range"]')).toHaveAttribute('data-marker', 'false')

  const rangeTooltip = await single.locator('[data-testid="timeline-bar"][data-record-id="generic-01-single-range"]').getAttribute('title')
  expect(rangeTooltip).toBe('Single range · 2026-10-12 → 2026-10-15')
  const separatedTooltip = await startEnd.locator('[data-testid="timeline-bar"][data-record-id="generic-03-start-range"]').getAttribute('title')
  expect(separatedTooltip).toBe('Separated range · 2026-10-12 – 2026-10-15')
  expect(separatedTooltip).not.toContain('2026-10-30')
  expect(separatedTooltip).not.toContain('2026-11-05')
  const datetimeTooltip = await datetime.locator('[data-testid="timeline-bar"][data-record-id="generic-10-datetime-range"]').getAttribute('title')
  expect(datetimeTooltip).toBe('Date time range · 2026-10-13 12:00 UTC → 2026-10-13 15:45 UTC (America/New_York)')

  const datetimeGeometry = await datetime.evaluate(root => {
    const component = (root as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, any> } }).__vueParentComponent
    const setup = component?.setupState
    const row = setup?.rowGeometry?.find((item: any) => item.item.recordId === 'generic-10-datetime-range')
    const temporal = setup?.temporalMap?.get('generic-10-datetime-range')
    const viewport = setup?.viewport?.state?.value
    const element = root.querySelector<HTMLElement>('[data-testid="timeline-bar"][data-record-id="generic-10-datetime-range"]')
    if (!row || !temporal || !viewport || !element) throw new Error('Expected datetime range geometry, viewport, and rendered bar')
    return {
      startMs: temporal.startMs,
      visualEndMs: temporal.visualEndMs,
      originMs: viewport.originMs,
      scale: viewport.scale,
      geometryX: row.geometry.x,
      geometryWidth: row.geometry.width,
      renderedLeft: Number.parseFloat(element.style.left),
      renderedWidth: Number.parseFloat(element.style.width),
    }
  })
  expect(datetimeGeometry.startMs).toBe(Date.parse('2026-10-13T12:00:00.000Z'))
  expect(datetimeGeometry.visualEndMs).toBe(Date.parse('2026-10-13T15:45:00.000Z'))
  expect(Math.abs(datetimeGeometry.geometryX - (datetimeGeometry.startMs - datetimeGeometry.originMs) * pxPerMs(datetimeGeometry.scale))).toBeLessThanOrEqual(0.5)
  expect(Math.abs(datetimeGeometry.geometryWidth - (datetimeGeometry.visualEndMs! - datetimeGeometry.startMs) * pxPerMs(datetimeGeometry.scale))).toBeLessThanOrEqual(0.5)
  expect(Math.abs(datetimeGeometry.renderedLeft - datetimeGeometry.geometryX)).toBeLessThanOrEqual(0.5)
  expect(Math.abs(datetimeGeometry.renderedWidth - datetimeGeometry.geometryWidth)).toBeLessThanOrEqual(0.5)

  const markerGeometry = await single.evaluate(root => {
    const setup = (root as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, any> } }).__vueParentComponent?.setupState
    const row = setup?.rowGeometry?.find((item: any) => item.item.recordId === 'generic-02-single-point')
    const temporal = setup?.temporalMap?.get('generic-02-single-point')
    const viewport = setup?.viewport?.state?.value
    const element = root.querySelector<HTMLElement>('[data-testid="timeline-bar"][data-record-id="generic-02-single-point"]')
    if (!row || !temporal || !viewport || !element) throw new Error('Expected point geometry, viewport, and rendered marker')
    return {
      startMs: temporal.startMs,
      originMs: viewport.originMs,
      scale: viewport.scale,
      geometryX: row.geometry.x,
      renderedLeft: Number.parseFloat(element.style.left),
      marker: row.geometry.marker,
      markerShapeCount: element.querySelectorAll('[data-testid="timeline-marker"]').length,
    }
  })
  expect(markerGeometry.marker).toBe(true)
  expect(markerGeometry.markerShapeCount).toBe(1)
  expect(Math.abs(markerGeometry.geometryX - (markerGeometry.startMs - markerGeometry.originMs) * pxPerMs('month'))).toBeLessThanOrEqual(0.5)
  expect(Math.abs(markerGeometry.renderedLeft - markerGeometry.geometryX)).toBeLessThanOrEqual(0.5)

  const selectedBar = single.locator('[data-testid="timeline-bar"][data-record-id="generic-01-single-range"]')
  await selectedBar.click()
  const drawer = page.locator('[data-overlay-mode="drawer"]')
  await expect(drawer).toBeVisible()
  await expect(drawer.getByRole('textbox', { name: '记录标题' })).toHaveValue('Single range')
  await expect(selectedBar).toHaveAttribute('aria-pressed', 'true')
  expect(api.requests.filter(({ method, path }) => method === 'PATCH' && path.includes('/records/'))).toHaveLength(0)
  await page.getByRole('button', { name: '关闭记录' }).click()

  const singleDatabase = page.locator('#database-block-generic-timeline-single')
  const singleDetails = single.locator('details')
  await expect(singleDetails).toHaveCount(1)
  await singleDetails.locator('summary').click()
  await expect(singleDetails.getByRole('button', { name: '打开记录：Missing start' })).toBeVisible()
  await singleDatabase.getByRole('button', { name: '切换视图' }).click()
  await page.getByRole('group', { name: '数据库视图', exact: true }).getByRole('button', { name: 'Single date alternate', exact: true }).click()
  await expect(singleDatabase.getByTestId('database-timeline')).toHaveAttribute('data-configured-scale', 'week')
  const alternateDetails = singleDatabase.getByTestId('database-timeline').locator('details')
  await expect(alternateDetails).not.toHaveAttribute('open', '')
  await alternateDetails.locator('summary').click()
  await expect(alternateDetails.getByRole('button', { name: '打开记录：Missing start' })).toBeVisible()
  await singleDatabase.getByRole('button', { name: '切换视图' }).click()
  await page.getByRole('group', { name: '数据库视图', exact: true }).getByRole('button', { name: 'Single date', exact: true }).click()
  await expect(singleDatabase.getByTestId('database-timeline')).toHaveAttribute('data-configured-scale', 'month')
  await expect(singleDatabase.getByTestId('database-timeline').locator('details')).not.toHaveAttribute('open', '')

  for (const [width, height, suffix] of [[1440, 900, 'desktop'], [390, 844, 'phone']] as const) {
    await page.setViewportSize({ width, height })
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme)
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      await page.evaluate(() => {
        const host = document.querySelector('.document-wrap') as HTMLElement
        const firstTimelineBlock = document.querySelector('#database-block-generic-timeline-single') as HTMLElement
        const hostBounds = host.getBoundingClientRect()
        const blockBounds = firstTimelineBlock.getBoundingClientRect()
        host.scrollTop = blockBounds.top - hostBounds.top + host.scrollTop
      })
      await expect(single.locator('[data-testid="timeline-bar"][data-record-id="generic-01-single-range"]')).toBeInViewport()
      await expect(single.locator('[data-testid="timeline-bar"][data-record-id="generic-02-single-point"]')).toBeInViewport()
      if (width === 390) await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
      await timelineScreenshot(page, testInfo, `p112b-generic-timeline-${suffix}-${theme}`)
    }
  }
})

test('Timeline Frozen Table resolves independent columns, formats shared properties, and opens the existing Record Host', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const relationDatabase = database('frozen-relation-database', 'Related records')
  const relationProperty = { ...property('frozen-relation', rootDatabase.id, 'Related', 'relation'), config: { targetDatabaseId: relationDatabase.id } } as TestProperty
  const formulaProperty = { ...property('frozen-formula', rootDatabase.id, 'Estimate', 'formula'), config: { expression: { kind: 'literal', value: 1 }, resultType: 'number' } } as TestProperty
  const timelineConfig = {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    visibleProperties: ['root-title', 'root-text'],
    propertyOrder: ['root-text', 'root-title'],
    options: {
      unknownOuterSetting: { retained: true },
      timeline: {
        dateSource: { mode: 'date-property', propertyId: 'root-date' },
        frozenTable: {
          visible: true,
          // Defensive HTTP fixture bypasses API validation for Title/stale-ID handling; the server still validates Title.
          visibleProperties: ['frozen-relation', 'root-date', 'frozen-formula', 'root-select', 'root-text', 'frozen-relation', 'deleted-frozen-property'],
          propertyOrder: ['frozen-relation', 'root-date', 'frozen-formula', 'root-select', 'root-text', 'root-title', 'frozen-relation', 'deleted-frozen-property'],
        },
      },
    },
  } as unknown as DatabaseViewConfig
  const nullConfig = {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { timeline: { frozenTable: { visible: true, visibleProperties: null, propertyOrder: null } } },
  } as unknown as DatabaseViewConfig
  const hiddenConfig = {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { timeline: { dateSource: { mode: 'date-property', propertyId: 'root-date' } } },
  } as unknown as DatabaseViewConfig
  const disabledConfig = {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { timeline: { frozenTable: { visible: false, visibleProperties: null, propertyOrder: null } } },
  } as unknown as DatabaseViewConfig
  const timelineView = view('frozen-projection-view', rootDatabase.id, 'Frozen projection', timelineConfig, 'timeline')
  const nullView = view('frozen-null-view', rootDatabase.id, 'Frozen null defaults', nullConfig, 'timeline')
  const hiddenView = view('frozen-hidden-view', rootDatabase.id, 'Frozen hidden', hiddenConfig, 'timeline')
  const disabledView = view('frozen-disabled-view', rootDatabase.id, 'Frozen disabled', disabledConfig, 'timeline')
  const records = [
    record('frozen-record-a', rootDatabase.id, 'frozen-page-a', {
      'root-title': 'Frozen A', 'root-text': 'Shared notes A', 'root-select': 'status-open',
      'root-date': { start: '2026-10-13', end: '2026-10-14' }, 'frozen-formula': 12,
      'frozen-relation': ['related-record-a', 'related-record-a'],
    }),
    record('frozen-record-b', rootDatabase.id, 'frozen-page-b', {
      'root-title': 'Frozen B', 'root-text': 'Shared notes B', 'root-select': 'status-done',
      'root-date': '2026-10-15', 'frozen-formula': 24, 'frozen-relation': ['related-record-a'],
    }),
  ]
  const api = await installApi(page, [
    block('frozen-projection-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100),
  ], {
    databases: [rootDatabase, relationDatabase], views: [timelineView, nullView, hiddenView, disabledView],
    properties: [...rootProperties, relationProperty, formulaProperty], records,
  })
  api.pages.push(
    { ...pageRecord, id: 'frozen-page-a', title: 'Frozen A', role: 'database-record' },
    { ...pageRecord, id: 'frozen-page-b', title: 'Frozen B', role: 'database-record' },
    { ...pageRecord, id: 'related-page-a', title: 'Resolved relation title', role: 'database-record' },
  )
  api.records.push(record('related-record-a', relationDatabase.id, 'related-page-a', { 'related-title': 'Resolved relation title' }))
  await page.goto('/#/app/database-workspace/page/database-page')

  const databaseBlock = page.locator('#database-block-frozen-projection-block')
  const timeline = databaseBlock.getByTestId('database-timeline')
  const frozen = databaseBlock.getByTestId('timeline-frozen-table')
  await expect(timeline).toBeVisible()
  await expect(frozen).toBeVisible()
  const frozenHeaderIds = () => frozen.getByTestId('timeline-frozen-header').locator('[data-property-id]').evaluateAll(elements => elements.map(element => (element as HTMLElement).dataset.propertyId ?? ''))
  await expect.poll(frozenHeaderIds).toEqual(['frozen-relation', 'root-date', 'frozen-formula', 'root-select', 'root-text', 'root-title'])
  await expect(frozen.locator('[data-timeline-frozen-row][data-record-id="frozen-record-a"] [data-property-id="root-title"]')).toContainText('Frozen A')
  await expect(frozen.locator('[data-timeline-frozen-row][data-record-id="frozen-record-a"] [data-property-id="root-text"]')).toContainText('Shared notes A')
  await expect(frozen.locator('[data-timeline-frozen-row][data-record-id="frozen-record-a"] [data-property-id="root-select"]')).toContainText('Open')
  await expect(frozen.locator('[data-timeline-frozen-row][data-record-id="frozen-record-a"] [data-property-id="frozen-formula"]')).toContainText('12')
  await expect(frozen.locator('[data-timeline-frozen-row][data-record-id="frozen-record-a"] [data-property-id="root-date"]')).toContainText('2026-10-13 → 2026-10-14')
  await expect.poll(() => frozen.locator('[data-timeline-frozen-row][data-record-id="frozen-record-a"] [data-property-id="frozen-relation"]').innerText()).toContain('Resolved relation title')
  await expect(timeline.getByTestId('timeline-bar').first()).toContainText('Shared notes A')
  await expect(frozen.locator('[data-property-id="frozen-relation"]')).toHaveCount(3)
  const relationResolutions = api.requests.filter(({ method, path }) => method === 'POST' && path.endsWith('/record-options/resolve'))
  expect(relationResolutions.filter(({ path }) => path.endsWith(`/${relationDatabase.id}/record-options/resolve`))).toHaveLength(1)
  expect(relationResolutions.find(({ path }) => path.endsWith(`/${relationDatabase.id}/record-options/resolve`))?.payload.recordIds).toEqual(['related-record-a'])

  const topLevelProjection = await timeline.evaluate(root => {
    const component = (root as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, any> } }).__vueParentComponent
    const items = component?.setupState?.projectedItems
    if (!Array.isArray(items)) throw new Error('Expected Timeline projection')
    return {
      title: items[0]?.title,
      visibleProperties: items[0]?.visibleProperties?.map((item: { propertyId: string }) => item.propertyId),
    }
  })
  expect(topLevelProjection).toEqual({ title: 'Frozen A', visibleProperties: ['root-text'] })

  const titleButton = frozen.locator('[data-timeline-frozen-row][data-record-id="frozen-record-a"] [data-property-id="root-title"] button')
  await titleButton.click()
  const drawer = page.locator('[data-overlay-mode="drawer"]')
  await expect(drawer).toBeVisible()
  await expect(drawer.getByRole('textbox', { name: '记录标题' })).toHaveValue('Frozen A')
  await expect(titleButton).toHaveAttribute('aria-pressed', 'true')
  expect(api.requests.filter(({ method, path }) => method === 'PATCH' && path.includes('/records/'))).toHaveLength(0)
  expect(api.requests.filter(({ method, path }) => ['POST', 'PATCH', 'DELETE'].includes(method) && path.includes('/properties/'))).toHaveLength(0)
  await page.getByRole('button', { name: '关闭记录' }).click()

  const switchView = async (name: string) => {
    await databaseBlock.getByRole('button', { name: '切换视图' }).click()
    await page.getByRole('group', { name: '数据库视图', exact: true }).getByRole('button', { name, exact: true }).click()
  }
  await switchView('Frozen null defaults')
  await expect(frozen).toBeVisible()
  await expect.poll(() => frozen.getByTestId('timeline-frozen-header').locator('[data-property-id]').evaluateAll(elements => elements.map(element => (element as HTMLElement).dataset.propertyId))).toEqual(rootProperties.map(item => item.id).concat(['frozen-relation', 'frozen-formula']))
  await switchView('Frozen hidden')
  await expect(frozen).toHaveCount(0)
  await switchView('Frozen disabled')
  await expect(frozen).toHaveCount(0)
  await switchView('Frozen projection')
  await expect(frozen).toBeVisible()
  expect(timelineView.config.options?.unknownOuterSetting).toEqual({ retained: true })
  await page.evaluate(() => {
    const editor = document.querySelector('.eotion-editor')
    const databaseBlock = document.querySelector('#database-block-frozen-projection-block')
    const timeline = databaseBlock?.querySelector('[data-testid="database-timeline"]')
    const frozen = databaseBlock?.querySelector('[data-testid="timeline-frozen-table"]')
    if (!editor || !databaseBlock || !timeline || !frozen) throw new Error('Expected stable Editor, NodeView, Timeline, and Frozen Table')
    ;(window as Window & { __frozenResponsiveIdentity?: Element[] }).__frozenResponsiveIdentity = [
      editor, databaseBlock, timeline, frozen,
      (editor as Element & { __vueParentComponent?: unknown }).__vueParentComponent as Element,
      (databaseBlock as Element & { __vueParentComponent?: unknown }).__vueParentComponent as Element,
      (timeline as Element & { __vueParentComponent?: unknown }).__vueParentComponent as Element,
      (frozen as Element & { __vueParentComponent?: unknown }).__vueParentComponent as Element,
    ]
  })

  for (const [width, height, suffix] of [[1440, 900, 'desktop'], [390, 844, 'phone']] as const) {
    await page.setViewportSize({ width, height })
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme)
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      expect(await page.evaluate(() => {
        const before = (window as Window & { __frozenResponsiveIdentity?: Element[] }).__frozenResponsiveIdentity
        const editor = document.querySelector('.eotion-editor') as (Element & { __vueParentComponent?: unknown }) | null
        const databaseBlock = document.querySelector('#database-block-frozen-projection-block') as (Element & { __vueParentComponent?: unknown }) | null
        const timeline = databaseBlock?.querySelector('[data-testid="database-timeline"]') as (Element & { __vueParentComponent?: unknown }) | null
        const frozen = databaseBlock?.querySelector('[data-testid="timeline-frozen-table"]') as (Element & { __vueParentComponent?: unknown }) | null
        return Boolean(before && editor && databaseBlock && timeline && frozen
          && editor === before[0] && databaseBlock === before[1] && timeline === before[2] && frozen === before[3]
          && editor.__vueParentComponent === before[4] && databaseBlock.__vueParentComponent === before[5]
          && timeline.__vueParentComponent === before[6] && frozen.__vueParentComponent === before[7])
      })).toBe(true)
      if (width === 390) {
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
        await expect(frozen.getByTestId('timeline-frozen-header').locator('[data-property-id="root-title"]')).toBeVisible()
        await expect(frozen.locator('[data-timeline-frozen-row][data-record-id="frozen-record-a"] [data-property-id="root-title"]')).toBeVisible()
        await expect.poll(() => frozen.locator('.eotion-timeline-frozen-cell:not(.is-title)').evaluateAll(cells => cells.every(cell => cell.getClientRects().length === 0))).toBe(true)
        const paneWidth = await frozen.evaluate(element => element.getBoundingClientRect().width)
        expect(paneWidth).toBeGreaterThan(0)
        expect(paneWidth).toBeLessThanOrEqual(120)
        const timeScroller = timeline.getByTestId('timeline-scroll')
        await expect.poll(() => timeScroller.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true)
      }
      await timelineScreenshot(page, testInfo, `p112c-frozen-projection-${suffix}-${theme}`)
    }
  }
})

test('Timeline Frozen rows share row geometry, hover, selection, and page-host scroll with the time canvas', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const timelineView = view('frozen-geometry-view', rootDatabase.id, 'Frozen geometry', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { timeline: { dateSource: { mode: 'date-property', propertyId: 'root-date' }, frozenTable: { visible: true, visibleProperties: ['root-title'], propertyOrder: ['root-title'] } } },
  }, 'timeline')
  const records = Array.from({ length: 30 }, (_, index) => record(`frozen-geometry-${index}`, rootDatabase.id, `frozen-geometry-page-${index}`, {
    'root-title': `Geometry ${index}`, 'root-date': '2026-10-13',
  }))
  const api = await installApi(page, [block('frozen-geometry-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100)], {
    databases: [rootDatabase], views: [timelineView], properties: [rootProperties[0]!, rootProperties[5]!], records,
  })
  for (const item of records) api.pages.push({ ...pageRecord, id: item.pageId, title: String(item.properties['root-title']), role: 'database-record' })
  await page.goto('/#/app/database-workspace/page/database-page')
  const databaseBlock = page.locator('#database-block-frozen-geometry-block')
  const timeline = databaseBlock.getByTestId('database-timeline')
  const frozen = databaseBlock.getByTestId('timeline-frozen-table')
  const scroller = timeline.getByTestId('timeline-scroll')
  await expect(frozen).toBeVisible()
  await expect.poll(async () => {
    const frozenRows = await frozen.locator('[data-timeline-frozen-row]').evaluateAll(elements => elements.map(element => (element as HTMLElement).dataset.recordId))
    const timelineRows = await timeline.locator('[data-timeline-row]').evaluateAll(elements => elements.map(element => (element as HTMLElement).dataset.recordId))
    return frozenRows.length > 0 && JSON.stringify(frozenRows) === JSON.stringify(timelineRows)
  }).toBe(true)
  const rowPairs = await page.evaluate(() => {
    const root = document.querySelector('#database-block-frozen-geometry-block')!
    const left = [...root.querySelectorAll<HTMLElement>('[data-timeline-frozen-row]')]
    const right = [...root.querySelectorAll<HTMLElement>('[data-timeline-row]')]
    return left.map(row => {
      const peer = right.find(item => item.dataset.recordId === row.dataset.recordId)
      if (!peer) throw new Error(`Missing Timeline row for ${row.dataset.recordId}`)
      const a = row.getBoundingClientRect()
      const b = peer.getBoundingClientRect()
      return { recordId: row.dataset.recordId, leftIndex: row.dataset.rowIndex, rightIndex: peer.dataset.rowIndex, topDelta: Math.abs(a.top - b.top), heightDelta: Math.abs(a.height - b.height) }
    })
  })
  expect(rowPairs.length).toBeGreaterThan(0)
  expect(rowPairs.every(row => row.leftIndex === row.rightIndex && row.topDelta <= 0.5 && row.heightDelta <= 0.5)).toBe(true)
  const headerGeometry = async () => page.evaluate(() => {
    const root = document.querySelector('#database-block-frozen-geometry-block')!
    const left = root.querySelector<HTMLElement>('[data-testid="timeline-frozen-header"]')!
    const right = root.querySelector<HTMLElement>('[data-testid="timeline-ruler"]')!
    const a = left.getBoundingClientRect()
    const b = right.getBoundingClientRect()
    return { leftTop: a.top, rightTop: b.top, topDelta: Math.abs(a.top - b.top), heightDelta: Math.abs(a.height - b.height) }
  })
  expect((await headerGeometry()).topDelta).toBeLessThanOrEqual(0.5)
  expect((await headerGeometry()).heightDelta).toBeLessThanOrEqual(0.5)

  const leftRow = frozen.locator('[data-timeline-frozen-row][data-record-id="frozen-geometry-0"]')
  const rightRow = timeline.locator('[data-timeline-row][data-record-id="frozen-geometry-0"]')
  await leftRow.hover()
  await expect(leftRow).toHaveClass(/is-hovered/u)
  await expect(rightRow).toHaveClass(/is-hovered/u)
  await rightRow.hover()
  await expect(leftRow).toHaveClass(/is-hovered/u)
  await expect(rightRow).toHaveClass(/is-hovered/u)
  await page.locator('body').hover({ position: { x: 1, y: 1 } })
  await expect(leftRow).not.toHaveClass(/is-hovered/u)
  await expect(rightRow).not.toHaveClass(/is-hovered/u)
  const titleButton = leftRow.locator('[data-property-id="root-title"] button')
  await titleButton.click()
  await expect(titleButton).toHaveAttribute('aria-pressed', 'true')
  await expect(leftRow).toHaveClass(/is-selected/u)
  await expect(rightRow).toHaveClass(/is-selected/u)
  expect(api.requests.filter(({ method, path }) => method === 'PATCH' && path.includes('/records/'))).toHaveLength(0)
  await page.getByRole('button', { name: '关闭记录' }).click()
  await expect(titleButton).toHaveAttribute('aria-pressed', 'false')
  await expect(leftRow).not.toHaveClass(/is-selected/u)
  await expect(rightRow).not.toHaveClass(/is-selected/u)

  const frozenX = await frozen.evaluate(element => element.getBoundingClientRect().x)
  const beforeHorizontal = await scroller.evaluate(element => (element as HTMLElement).scrollLeft)
  await scroller.evaluate(element => { (element as HTMLElement).scrollLeft += 160 })
  await expect.poll(() => scroller.evaluate(element => (element as HTMLElement).scrollLeft)).toBeGreaterThan(beforeHorizontal)
  expect(await frozen.evaluate(element => element.getBoundingClientRect().x)).toBe(frozenX)

  const host = page.locator('.document-wrap')
  const beforeVertical = await host.evaluate(element => (element as HTMLElement).scrollTop)
  await host.evaluate(element => { (element as HTMLElement).scrollTop += 80 })
  await expect.poll(() => host.evaluate(element => (element as HTMLElement).scrollTop)).toBeGreaterThan(beforeVertical)
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  const afterScrollPairs = await page.evaluate(() => {
    const root = document.querySelector('#database-block-frozen-geometry-block')!
    const left = [...root.querySelectorAll<HTMLElement>('[data-timeline-frozen-row]')]
    const right = [...root.querySelectorAll<HTMLElement>('[data-timeline-row]')]
    return left.map(row => {
      const peer = right.find(item => item.dataset.recordId === row.dataset.recordId)!
      return Math.abs(row.getBoundingClientRect().top - peer.getBoundingClientRect().top) <= 0.5
    })
  })
  expect(afterScrollPairs.length).toBeGreaterThan(0)
  expect(afterScrollPairs.every(Boolean)).toBe(true)
  const pinnedHeader = await headerGeometry()
  expect(pinnedHeader.topDelta).toBeLessThanOrEqual(0.5)
  expect(pinnedHeader.heightDelta).toBeLessThanOrEqual(0.5)
  await expect.poll(() => scroller.evaluate(element => getComputedStyle(element).overflowY)).not.toMatch(/^(auto|scroll)$/u)
})

test('Timeline Frozen columns disappear after the server repairs a deleted property reference', async ({ page }) => {
  const timelineView = view('frozen-repair-view', rootDatabase.id, 'Frozen repair', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { timeline: {
      dateSource: { mode: 'date-property', propertyId: 'root-date' },
      frozenTable: { visible: true, visibleProperties: ['root-text', 'deleted-frozen-property'], propertyOrder: ['root-text', 'root-title', 'deleted-frozen-property'] },
    } },
  }, 'timeline')
  const api = await installApi(page, [block('frozen-repair-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100)], {
    databases: [rootDatabase], views: [timelineView], properties: rootProperties,
    records: [record('frozen-repair-record', rootDatabase.id, 'frozen-repair-page', { 'root-title': 'Repair target', 'root-text': 'Delete this visible property', 'root-date': '2026-10-13' })],
  })
  api.pages.push({ ...pageRecord, id: 'frozen-repair-page', title: 'Repair target', role: 'database-record' })
  await page.goto('/#/app/database-workspace/page/database-page')
  const databaseBlock = page.locator('#database-block-frozen-repair-block')
  const frozen = databaseBlock.getByTestId('timeline-frozen-table')
  await expect(frozen).toBeVisible()
  await expect(frozen.getByTestId('timeline-frozen-header').locator('[data-property-id="root-text"]')).toBeAttached()
  await expect(frozen.locator('[data-property-id="deleted-frozen-property"]')).toHaveCount(0)

  await openDatabaseSetting(page, databaseBlock, '属性')
  const settings = page.getByRole('group', { name: '属性管理' })
  await settings.getByRole('button', { name: '属性设置 Notes' }).click()
  await page.getByRole('menu', { name: '属性设置: Notes' }).getByRole('menuitem', { name: '删除' }).click()
  const dialog = page.getByRole('dialog', { name: '删除属性“Notes”' })
  await dialog.getByRole('button', { name: '删除属性' }).click()
  await expect.poll(() => api.properties.some(item => item.id === 'root-text')).toBe(false)
  await expect.poll(() => {
    const timeline = api.views.find(item => item.id === timelineView.id)?.config.options?.timeline as { frozenTable?: { visibleProperties?: string[] | null } } | undefined
    return timeline?.frozenTable?.visibleProperties
  }).toEqual(['deleted-frozen-property'])
  await expect(frozen.locator('[data-property-id="root-text"]')).toHaveCount(0)
  await expect(frozen.getByTestId('timeline-frozen-header').locator('[data-property-id="root-text"]')).toHaveCount(0)
  await expect(frozen.locator('[data-timeline-frozen-row][data-record-id="frozen-repair-record"] [data-property-id="root-text"]')).toHaveCount(0)
  await expect(frozen.getByTestId('timeline-frozen-header').locator('[data-property-id="root-title"]')).toBeVisible()
  expect(api.requests.filter(({ method, path }) => method === 'DELETE' && path.endsWith('/properties/root-text'))).toHaveLength(1)
})

for (const total of [100, 500] as const) {
  test(`Timeline loads all ${total} generic records in 25-record pages and virtualizes without reprojecting`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.clock.setFixedTime(new Date('2026-10-13T12:00:00.000Z'))
    const barRelationDatabase = database(`timeline-${total}-bar-relations`, 'Bar relation targets')
    const frozenRelationDatabase = database(`timeline-${total}-frozen-relations`, 'Frozen relation targets')
    const barRelationProperty = { ...property(`timeline-${total}-bar-relation`, rootDatabase.id, 'Bar relation', 'relation'), config: { targetDatabaseId: barRelationDatabase.id } } as TestProperty
    const frozenRelationProperty = { ...property(`timeline-${total}-frozen-relation`, rootDatabase.id, 'Frozen relation', 'relation'), config: { targetDatabaseId: frozenRelationDatabase.id } } as TestProperty
    const timelineView = view(`timeline-page-${total}-view`, rootDatabase.id, `Timeline ${total}`, {
      ...DEFAULT_DATABASE_VIEW_CONFIG,
      visibleProperties: ['root-title', barRelationProperty.id],
      propertyOrder: ['root-title', barRelationProperty.id],
      options: { timeline: {
        dateSource: { mode: 'date-property', propertyId: 'root-date' },
        frozenTable: { visible: true, visibleProperties: ['root-title', frozenRelationProperty.id], propertyOrder: ['root-title', frozenRelationProperty.id] },
      } },
    }, 'timeline')
    const records = Array.from({ length: total }, (_, index) => {
      const number = String(index + 1).padStart(3, '0')
      return record(`timeline-${total}-${number}`, rootDatabase.id, `timeline-${total}-page-${number}`, {
        'root-title': `Timeline record ${number}`,
        [barRelationProperty.id]: [`bar-target-${total}-${number}`, `bar-target-${total}-${String((index + 1) % total + 1).padStart(3, '0')}`],
        [frozenRelationProperty.id]: [`frozen-target-${total}-${number}`, `frozen-target-${total}-${String((index + 1) % total + 1).padStart(3, '0')}`],
        ...(total === 500 && index === total - 1 ? {} : { 'root-date': '2026-10-13' }),
      })
    })
    const api = await installApi(page, [
      block(`timeline-page-${total}-block`, 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100),
    ], { databases: [rootDatabase, barRelationDatabase, frozenRelationDatabase], views: [timelineView], properties: [rootProperties[0]!, rootProperties[5]!, barRelationProperty, frozenRelationProperty], records })
    const relationTargets = [
      ...Array.from({ length: total }, (_, index) => {
        const number = String(index + 1).padStart(3, '0')
        return record(`bar-target-${total}-${number}`, barRelationDatabase.id, `bar-target-page-${total}-${number}`, {})
      }),
      ...Array.from({ length: total }, (_, index) => {
        const number = String(index + 1).padStart(3, '0')
        return record(`frozen-target-${total}-${number}`, frozenRelationDatabase.id, `frozen-target-page-${total}-${number}`, {})
      }),
    ]
    api.records.push(...relationTargets)
    for (const target of relationTargets) {
      const title = target.id.startsWith('bar-target-') ? `Bar title ${target.id.split('-').at(-1)}` : `Frozen title ${target.id.split('-').at(-1)}`
      api.pages.push({ ...pageRecord, id: target.pageId, title, role: 'database-record' })
    }
    if (total === 500) {
      const lastRecord = records.at(-1)!
      api.pages.push({ ...pageRecord, id: lastRecord.pageId, title: 'Timeline record 500', role: 'database-record' })
    }
    const tablePath = `/views/${timelineView.id}/table`
    const tableRequestTimings: Array<{ startTime: number; responseEndMs: number }> = []
    page.on('requestfinished', request => {
      if (!request.url().includes(tablePath)) return
      const timing = request.timing()
      tableRequestTimings.push({ startTime: timing.startTime, responseEndMs: timing.responseEnd })
    })
    await page.goto('/#/app/database-workspace/page/database-page')
    const databaseBlock = page.locator(`#database-block-timeline-page-${total}-block`)
    const timeline = databaseBlock.getByTestId('database-timeline')
    const frozen = databaseBlock.getByTestId('timeline-frozen-table')
    await expect(timeline).toBeVisible()
    const startedAt = await page.evaluate(() => performance.now())
    const projectedCount = () => page.evaluate(() => {
      const timeline = document.querySelector('[data-testid="database-timeline"]') as (HTMLElement & { __vueParentComponent?: { setupState?: Record<string, unknown> } }) | null
      const items = timeline?.__vueParentComponent?.setupState?.projectedItems
      if (!Array.isArray(items)) throw new Error('Timeline projectedItems is not available for loaded-record verification')
      return items.length
    })
    await expect.poll(projectedCount).toBe(25)
    let loaded = await projectedCount()
    const loadMoreButton = databaseBlock.getByRole('button', { name: '加载更多' })
    while (loaded < total) {
      await expect.poll(() => loadMoreButton.count(), { message: `Timeline should expose the cursor after the first 25 of ${total} records; requests=${JSON.stringify(api.requests.filter(({ path }) => path.endsWith(tablePath)))}` }).toBe(1)
      await loadMoreButton.click()
      const nextLoaded = Math.min(loaded + 25, total)
      await expect.poll(projectedCount).toBe(nextLoaded)
      loaded = nextLoaded
    }
    await expect(databaseBlock.getByRole('button', { name: '加载更多' })).toHaveCount(0)
    expect(loaded).toBe(total)
    const recordReads = api.requests.filter(({ method, path }) => method === 'GET' && path.endsWith(tablePath))
    expect(recordReads).toHaveLength(total / 25)
    expect(recordReads.every(({ search }) => new URLSearchParams(search).get('limit') === '25')).toBe(true)
    expect(tableRequestTimings).toHaveLength(total / 25)
    const frozenDisplayText = (recordId: string) => timeline.evaluate((root, input) => {
      const setup = (root as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, unknown> } }).__vueParentComponent?.setupState
      const display = setup?.frozenDisplayMap
      if (!(display instanceof Map)) throw new Error('Timeline frozenDisplayMap is unavailable')
      const values = display.get(input.recordId)
      return values instanceof Map ? String(values.get(input.propertyId) ?? '') : ''
    }, { recordId, propertyId: frozenRelationProperty.id })
    await expect.poll(() => frozenDisplayText(`timeline-${total}-001`)).toContain('Frozen title 001')
    const visibleFrozenRecordIds = await frozen.locator('[data-timeline-frozen-row]').evaluateAll(elements => elements.map(element => (element as HTMLElement).dataset.recordId ?? ''))
    expect(visibleFrozenRecordIds.length).toBeGreaterThan(0)
    for (const recordId of visibleFrozenRecordIds) {
      const ordinal = recordId.split('-').at(-1)!
      await expect.poll(() => frozenDisplayText(recordId)).toContain(`Frozen title ${ordinal}`)
      await expect.poll(() => frozen.locator(`[data-timeline-frozen-row][data-record-id="${recordId}"] [data-property-id="${frozenRelationProperty.id}"]`).innerText()).toContain(`Frozen title ${ordinal}`)
    }

    const captureProjectionIdentity = () => page.evaluate(() => {
      const timeline = document.querySelector('[data-testid="database-timeline"]') as (HTMLElement & { __vueParentComponent?: { setupState?: Record<string, unknown> } }) | null
      const component = timeline?.__vueParentComponent
      const items = component?.setupState?.projectedItems
      if (!component || !Array.isArray(items)) throw new Error('Timeline projection component is unavailable')
      const temporalMap = component.setupState?.temporalMap
      if (!(temporalMap instanceof Map)) throw new Error('Timeline temporalMap is not available for identity verification')
      const frozen = document.querySelector('[data-testid="timeline-frozen-table"]') as (HTMLElement & { __vueParentComponent?: { props?: Record<string, unknown> } }) | null
      const viewport = document.querySelector('[data-testid="timeline-viewport"]') as (HTMLElement & { __vueParentComponent?: { props?: Record<string, unknown> } }) | null
      if (!frozen?.__vueParentComponent || !viewport?.__vueParentComponent) throw new Error('Frozen Table or Timeline viewport component is unavailable')
      const rows = component.setupState?.rowGeometry
      const frozenDisplayMap = component.setupState?.frozenDisplayMap
      if (!Array.isArray(rows) || !(frozenDisplayMap instanceof Map)) throw new Error('Frozen row geometry or display projection is unavailable')
      if (frozen.__vueParentComponent.props?.rows !== viewport.__vueParentComponent.props?.rows) throw new Error('Frozen Table and Timeline viewport do not share the same rows array')
      if (frozen.__vueParentComponent.props?.rows !== rows) throw new Error('Frozen Table rows do not reuse Timeline rowGeometry')
      ;(window as Window & { __timelineProjectionProbe?: { component: unknown; items: unknown; temporalMap: unknown; rows: unknown; frozenDisplayMap: unknown; frozen: unknown; viewport: unknown } }).__timelineProjectionProbe = {
        component, items, temporalMap, rows, frozenDisplayMap,
        frozen: frozen.__vueParentComponent, viewport: viewport.__vueParentComponent,
      }
      return items.length
    })
    expect(await captureProjectionIdentity()).toBe(total)
    await expect.poll(() => timeline.evaluate(root => {
      const map = (root as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, unknown> } }).__vueParentComponent?.setupState?.temporalMap
      return map instanceof Map ? map.size : -1
    })).toBe(total === 500 ? 499 : total)
    const projectionSame = () => page.evaluate(() => {
      const before = (window as Window & { __timelineProjectionProbe?: { component: unknown; items: unknown; temporalMap: unknown; rows: unknown; frozenDisplayMap: unknown; frozen: unknown; viewport: unknown } }).__timelineProjectionProbe!
      const timeline = document.querySelector('[data-testid="database-timeline"]') as (HTMLElement & { __vueParentComponent?: { setupState?: Record<string, unknown> } }) | null
      const frozen = document.querySelector('[data-testid="timeline-frozen-table"]') as (HTMLElement & { __vueParentComponent?: { props?: Record<string, unknown> } }) | null
      const viewport = document.querySelector('[data-testid="timeline-viewport"]') as (HTMLElement & { __vueParentComponent?: { props?: Record<string, unknown> } }) | null
      const currentRows = timeline?.__vueParentComponent?.setupState?.rowGeometry
      return timeline?.__vueParentComponent === before.component
        && timeline.__vueParentComponent?.setupState?.projectedItems === before.items
        && timeline.__vueParentComponent?.setupState?.temporalMap === before.temporalMap
        && timeline.__vueParentComponent?.setupState?.frozenDisplayMap === before.frozenDisplayMap
        && frozen?.__vueParentComponent === before.frozen
        && viewport?.__vueParentComponent === before.viewport
        && Array.isArray(currentRows)
        && frozen?.__vueParentComponent?.props?.rows === viewport?.__vueParentComponent?.props?.rows
        && frozen?.__vueParentComponent?.props?.rows === currentRows
    })
    const bodyWindow = timeline.locator('[data-row-window-first]').first()
    await expect(bodyWindow).toBeAttached()
    const initialWindow = await bodyWindow.evaluate(element => {
      const data = (element as HTMLElement).dataset
      return { first: Number(data.rowWindowFirst), last: Number(data.rowWindowLast), height: Number(data.rowWindowHeight), totalHeight: Number(data.rowWindowTotalHeight) }
    })
    const renderedRows = timeline.locator('[data-timeline-row]')
    const initialRenderedCount = await renderedRows.count()
    expect(initialRenderedCount).toBeLessThanOrEqual(total < 200 ? total : 40)
    const frozenRows = databaseBlock.getByTestId('timeline-frozen-table').locator('[data-timeline-frozen-row]')
    expect(await frozenRows.count()).toBe(initialRenderedCount)
    const visibleRowGeometry = await page.evaluate(() => {
      const frozen = [...document.querySelectorAll<HTMLElement>('[data-timeline-frozen-row]')]
      const timeline = [...document.querySelectorAll<HTMLElement>('[data-timeline-row]')]
      return frozen.map(row => {
        const peer = timeline.find(item => item.dataset.recordId === row.dataset.recordId)
        if (!peer) throw new Error(`Missing Timeline row for Frozen row ${row.dataset.recordId}`)
        const left = row.getBoundingClientRect()
        const right = peer.getBoundingClientRect()
        return {
          recordId: row.dataset.recordId,
          frozenIndex: row.dataset.rowIndex,
          timelineIndex: peer.dataset.rowIndex,
          frozenTop: left.top,
          timelineTop: right.top,
          frozenHeight: left.height,
          timelineHeight: right.height,
        }
      })
    })
    expect(visibleRowGeometry.length).toBe(initialRenderedCount)
    expect(visibleRowGeometry.every(row => row.frozenIndex === row.timelineIndex && Math.abs(row.frozenTop - row.timelineTop) <= 0.5 && Math.abs(row.frozenHeight - row.timelineHeight) <= 0.5)).toBe(true)
    expect(initialWindow.totalHeight).toBe(total * 48)

    const hostState = await page.evaluate(() => {
      const host = document.querySelector('.document-wrap') as HTMLElement | null
      if (!host) throw new Error('Expected the existing page scroll host')
      return { scrollHeight: host.scrollHeight, clientHeight: host.clientHeight, overflowY: getComputedStyle(host).overflowY }
    })
    expect(hostState.scrollHeight).toBeGreaterThan(hostState.clientHeight)
    expect(['auto', 'scroll']).toContain(hostState.overflowY)
    const scroller = timeline.getByTestId('timeline-scroll')
    await expect.poll(() => scroller.evaluate(element => getComputedStyle(element).overflowY)).not.toMatch(/^(auto|scroll)$/u)

    let focusedRelationRequestCounts: { bar: number; frozen: number } | null = null
    if (total === 500) {
      const focusedIndex = total - 2
      const focusedNumber = String(focusedIndex + 1).padStart(3, '0')
      await page.evaluate(index => {
        const host = document.querySelector('.document-wrap') as HTMLElement
        const timeline = document.querySelector('[data-testid="database-timeline"]')!
        const body = timeline.querySelector('[data-row-window-first]')!
        const hostBounds = host.getBoundingClientRect()
        const bodyBounds = body.getBoundingClientRect()
        const bodyOffset = bodyBounds.top - hostBounds.top + host.scrollTop
        host.scrollTop = bodyOffset + index * 48 - host.clientHeight / 2
      }, focusedIndex)
      const focusedBar = timeline.locator(`[data-testid="timeline-bar"][data-record-id="timeline-${total}-${focusedNumber}"]`)
      await expect(focusedBar).toBeVisible()
      await focusedBar.focus()
      await page.evaluate(() => { (document.querySelector('.document-wrap') as HTMLElement).scrollTop = 0 })
      await expect.poll(() => page.evaluate(() => (document.querySelector('.document-wrap') as HTMLElement).scrollTop)).toBe(0)
      const focusedRow = timeline.locator(`[data-timeline-row][data-row-index="${focusedIndex}"]`)
      await expect(focusedRow).toBeAttached()
      const frozenFocusedRow = databaseBlock.locator(`[data-timeline-frozen-row][data-row-index="${focusedIndex}"]`)
      await expect(frozenFocusedRow).toBeAttached()
      await expect.poll(() => frozenFocusedRow.locator(`[data-property-id="${frozenRelationProperty.id}"]`).innerText()).toContain('Frozen title 499')
      const focusedBarRowLocator = focusedRow.getByTestId('timeline-bar')
      await expect.poll(() => focusedBarRowLocator.locator('.eotion-timeline-bar-properties').innerText()).toContain('Bar title 499')
      const focusedBarId = `bar-target-${total}-499`
      const focusedFrozenId = `frozen-target-${total}-499`
      const relationResolveRequests = () => api.requests.filter(({ method, path }) => method === 'POST' && path.endsWith('/record-options/resolve'))
      expect(relationResolveRequests().every(request => Array.isArray(request.payload.recordIds) && request.payload.recordIds.length <= 50)).toBe(true)
      const countRequestsContaining = (id: string) => relationResolveRequests().filter(request => request.payload.recordIds.includes(id)).length
      expect(countRequestsContaining(focusedBarId)).toBeGreaterThan(0)
      expect(countRequestsContaining(focusedFrozenId)).toBeGreaterThan(0)
      focusedRelationRequestCounts = { bar: countRequestsContaining(focusedBarId), frozen: countRequestsContaining(focusedFrozenId) }
      await expect.poll(() => bodyWindow.evaluate(element => Number((element as HTMLElement).dataset.rowWindowLast))).toBeLessThan(focusedIndex)
      expect(await renderedRows.count()).toBeLessThanOrEqual(40)
      expect(await frozenRows.count()).toBeLessThanOrEqual(40)

      const unscheduled = timeline.locator('details')
      await expect(unscheduled.locator('summary')).toHaveText('未排期（1）')
      await unscheduled.locator('summary').click()
      const footerEntry = unscheduled.getByRole('button', { name: '打开记录：Timeline record 500' })
      await expect(footerEntry).toBeVisible()
      const targetRow = timeline.locator(`[data-timeline-row][data-record-id="timeline-${total}-500"]`)
      const frozenTargetRow = databaseBlock.locator(`[data-timeline-frozen-row][data-record-id="timeline-${total}-500"]`)
      await page.evaluate(targetRecordId => document.addEventListener('focusin', event => {
        const row = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-timeline-row]')
        if (row?.dataset.recordId === targetRecordId) {
          ;(window as Window & { __timelineFooterTargetFocused?: boolean }).__timelineFooterTargetFocused = true
        }
      }, { once: false, capture: true }), `timeline-${total}-500`)
      await footerEntry.click()
      const drawer = page.locator('[data-overlay-mode="drawer"]')
      await expect(drawer).toBeVisible()
      await expect(drawer.getByRole('textbox', { name: '记录标题' })).toHaveValue('Timeline record 500')
      expect(await page.evaluate(() => (window as Window & { __timelineFooterTargetFocused?: boolean }).__timelineFooterTargetFocused)).toBe(true)
      await expect(targetRow).toBeInViewport()
      await expect(frozenTargetRow).toBeAttached()
      await expect.poll(() => frozenTargetRow.locator(`[data-property-id="${frozenRelationProperty.id}"]`).innerText()).toContain('Frozen title 500')
      const targetGeometry = await Promise.all([targetRow.boundingBox(), frozenTargetRow.boundingBox()])
      expect(targetGeometry[0] && targetGeometry[1]).toBeTruthy()
      expect(Math.abs(targetGeometry[0]!.y - targetGeometry[1]!.y)).toBeLessThanOrEqual(0.5)
      expect(Math.abs(targetGeometry[0]!.height - targetGeometry[1]!.height)).toBeLessThanOrEqual(0.5)
      await page.getByRole('button', { name: '关闭记录' }).click()
      await expect(targetRow).toBeInViewport()
      await expect(targetRow).toHaveAttribute('data-record-id', `timeline-${total}-500`)
      const pageReadsBeforeModifiedClick = api.requests.filter(({ method, path }) => method === 'GET' && path === `/api/workspaces/${workspace.id}/pages/timeline-${total}-page-500`).length
      await footerEntry.click({ modifiers: ['Shift'] })
      await expect(page.locator('[data-overlay-mode="drawer"]')).toHaveCount(0)
      expect(api.requests.filter(({ method, path }) => method === 'GET' && path === `/api/workspaces/${workspace.id}/pages/timeline-${total}-page-500`)).toHaveLength(pageReadsBeforeModifiedClick)
    }

    // Relation titles can invalidate display projection; capture after focused targets settle.
    expect(await captureProjectionIdentity()).toBe(total)
    const readsBeforeViewportChanges = api.requests.filter(({ method, path }) => method === 'GET' && path.endsWith(tablePath)).length
    await timeline.getByLabel('时间轴刻度').selectOption('year')
    await expect(timeline).toHaveAttribute('data-scale', 'year')
    await scroller.evaluate(element => { (element as HTMLElement).scrollLeft += 500 })
    await page.evaluate(() => { (document.querySelector('.document-wrap') as HTMLElement).scrollTop += 120 })
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    const projectionIdentityPreserved = await projectionSame()
    expect(projectionIdentityPreserved).toBe(true)
    expect(api.requests.filter(({ method, path }) => method === 'GET' && path.endsWith(tablePath))).toHaveLength(readsBeforeViewportChanges)
    if (focusedRelationRequestCounts) {
      const relationResolveRequests = api.requests.filter(({ method, path }) => method === 'POST' && path.endsWith('/record-options/resolve'))
      expect(relationResolveRequests.filter(request => request.payload.recordIds.includes(`bar-target-${total}-499`))).toHaveLength(focusedRelationRequestCounts.bar)
      expect(relationResolveRequests.filter(request => request.payload.recordIds.includes(`frozen-target-${total}-499`))).toHaveLength(focusedRelationRequestCounts.frozen)
    }

    const samples = await page.evaluate(({ projectionIdentityPreserved, total }) => {
      const host = document.querySelector('.document-wrap') as HTMLElement
      const timeline = document.querySelector('[data-testid="database-timeline"]') as HTMLElement
      const body = timeline.querySelector('[data-row-window-first]') as HTMLElement
      const data = body.dataset
      const setup = (timeline as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, any> } }).__vueParentComponent?.setupState
      const viewport = setup?.viewport
      return {
        observedAt: new Date().toISOString(),
        elapsedSincePagingStartedMs: performance.now(),
        tableResources: performance.getEntriesByType('resource')
          .filter(entry => entry.name.includes('/table'))
          .map(entry => ({ name: entry.name, durationMs: entry.duration, transferSize: (entry as PerformanceResourceTiming).transferSize })),
        browserResourceSamples: performance.getEntriesByType('resource').slice(-30)
          .map(entry => ({ name: entry.name, initiatorType: entry.initiatorType, durationMs: entry.duration })),
        loadedRecords: Array.isArray((timeline as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, unknown> } }).__vueParentComponent?.setupState?.projectedItems)
          ? ((timeline as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, unknown> } }).__vueParentComponent!.setupState!.projectedItems as unknown[]).length
          : null,
        temporalGeometryCount: (timeline as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, unknown> } }).__vueParentComponent?.setupState?.temporalMap instanceof Map
          ? ((timeline as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, unknown> } }).__vueParentComponent!.setupState!.temporalMap as Map<unknown, unknown>).size
          : null,
        rawTickCount: Array.isArray(viewport?.ticks?.value) ? viewport.ticks.value.length : null,
        rulerTickCount: Array.isArray(viewport?.rulerTicks?.value) ? viewport.rulerTicks.value.length : null,
        renderedRows: timeline.querySelectorAll('[data-timeline-row]').length,
        renderedFrozenRows: document.querySelectorAll('[data-timeline-frozen-row]').length,
        frozenDisplayCount: (timeline as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, unknown> } }).__vueParentComponent?.setupState?.frozenDisplayMap instanceof Map
          ? ((timeline as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, unknown> } }).__vueParentComponent!.setupState!.frozenDisplayMap as Map<unknown, unknown>).size
          : null,
        frozenAndTimelineRowsShareGeometry: (() => {
          const frozen = document.querySelector('[data-testid="timeline-frozen-table"]') as (HTMLElement & { __vueParentComponent?: { props?: Record<string, unknown> } }) | null
          const viewport = document.querySelector('[data-testid="timeline-viewport"]') as (HTMLElement & { __vueParentComponent?: { props?: Record<string, unknown> } }) | null
          return Boolean(frozen?.__vueParentComponent?.props?.rows && frozen.__vueParentComponent.props.rows === viewport?.__vueParentComponent?.props?.rows)
        })(),
        resolvedRelationTitleCount: (() => {
          const databaseBlock = document.querySelector('[id^="database-block-timeline-page-"]') as (HTMLElement & { __vueParentComponent?: { setupState?: Record<string, unknown> } }) | null
          const titles = databaseBlock?.__vueParentComponent?.setupState?.relationTitles
          return titles instanceof Map ? titles.size : null
        })(),
        rowIndexPairsAligned: (() => {
          const frozen = [...document.querySelectorAll<HTMLElement>('[data-timeline-frozen-row]')]
          const timelineRows = [...timeline.querySelectorAll<HTMLElement>('[data-timeline-row]')]
          return frozen.every(row => {
            const peer = timelineRows.find(item => item.dataset.recordId === row.dataset.recordId)
            return Boolean(peer && row.dataset.rowIndex === peer.dataset.rowIndex)
          })
        })(),
        rowWindow: { first: Number(data.rowWindowFirst), last: Number(data.rowWindowLast), height: Number(data.rowWindowHeight), totalHeight: Number(data.rowWindowTotalHeight) },
        pageScroll: { top: host.scrollTop, scrollHeight: host.scrollHeight, clientHeight: host.clientHeight },
        domRowsWithinBound: timeline.querySelectorAll('[data-timeline-row]').length <= 40 && document.querySelectorAll('[data-timeline-frozen-row]').length <= 40,
        virtualizationExpected: total >= 200,
        projectionAndTemporalIdentityPreserved: projectionIdentityPreserved,
        frozenDisplayIdentityPreserved: projectionIdentityPreserved,
      }
    }, { projectionIdentityPreserved, total })
    expect(samples.rawTickCount).toBeLessThanOrEqual(80)
    expect(samples.rulerTickCount).toBeLessThanOrEqual(80)
    expect(samples.virtualizationExpected).toBe(total >= 200)
    if (samples.virtualizationExpected) expect(samples.renderedRows).toBeLessThanOrEqual(40)
    samples.elapsedSincePagingStartedMs = (await page.evaluate(() => performance.now())) - startedAt
    samples.tableRequestTimings = tableRequestTimings
    samples.relationResolutionBatches = api.requests.filter(({ method, path }) => method === 'POST' && path.endsWith('/record-options/resolve'))
      .map(({ path, payload }) => ({ path, targetCount: Array.isArray(payload.recordIds) ? payload.recordIds.length : null }))
    const samplePath = testInfo.outputPath(`timeline-${total}-browser-samples.json`)
    const sampleJson = JSON.stringify(samples, null, 2)
    await mkdir(path.dirname(samplePath), { recursive: true })
    await writeFile(samplePath, sampleJson, 'utf8')
    await testInfo.attach(`timeline-${total}-browser-samples.json`, { path: samplePath, contentType: 'application/json' })
  })
}

test('P11.3B resize handles remain hittable at the native Timeline viewport edges', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.clock.setFixedTime(new Date('2026-10-13T00:00:00.000Z'))
  const date = property('p113b-edge-date', rootDatabase.id, 'Date', 'date')
  const timelineView = view('p113b-edge-view', rootDatabase.id, 'Resize edge handles', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { timeline: { scale: 'month', dateSource: { mode: 'date-property', propertyId: date.id } } },
  }, 'timeline')
  const item = record('p113b-edge-record', rootDatabase.id, 'p113b-edge-page', { 'root-title': 'Edge range', [date.id]: { start: '2026-10-13', end: '2026-10-14' } })
  const api = await installApi(page, [block('p113b-edge-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100)], {
    databases: [rootDatabase], views: [timelineView], properties: [...rootProperties, date], records: [item],
  })
  api.pages.push({ ...pageRecord, id: item.pageId, title: 'Edge range', role: 'database-record' })
  await page.goto('/#/app/database-workspace/page/database-page')
  const timeline = page.locator('#database-block-p113b-edge-block').getByTestId('database-timeline')
  const scroller = timeline.getByTestId('timeline-scroll')
  const bar = timeline.locator(`[data-testid="timeline-bar"][data-record-id="${item.id}"]`)
  await expect(bar).toBeVisible()
  const alignAtEdge = async (handle: Locator, edge: 'left' | 'right') => {
    const viewport = await scroller.boundingBox()
    const before = await handle.boundingBox()
    if (!viewport || !before) throw new Error(`Expected ${edge} resize handle before native-scroll alignment`)
    const edgeX = edge === 'left' ? viewport.x + 1 : viewport.x + viewport.width - 1
    const centerX = before.x + before.width / 2
    await scroller.evaluate((element, shift) => { (element as HTMLElement).scrollLeft += shift }, centerX - edgeX)
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    const aligned = await handle.boundingBox()
    if (!aligned) throw new Error(`Expected ${edge} resize handle after scrolling its endpoint to the viewport edge`)
    const x = aligned.x + aligned.width / 2
    const y = aligned.y + aligned.height / 2
    const expectedHitCenter = edge === 'left' ? viewport.x + 6 : viewport.x + viewport.width - 6
    expect(Math.abs(x - expectedHitCenter)).toBeLessThanOrEqual(2)
    const hit = await page.evaluate(({ x, y, testId }) => Boolean(testId && document.elementFromPoint(x, y)?.closest(`[data-testid="${testId}"]`)), { x, y, testId: await handle.getAttribute('data-testid') })
    expect(hit).toBe(true)
    return { x, y }
  }
  const startHandle = timeline.locator(`[data-testid="timeline-resize-start"][data-record-id="${item.id}"]`)
  const endHandle = timeline.locator(`[data-testid="timeline-resize-end"][data-record-id="${item.id}"]`)
  const patches = () => api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith(`/records/${item.id}/cells/${date.id}`)).length
  const beforeEdgeResize = patches()
  const start = await alignAtEdge(startHandle, 'left')
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x - pxPerMs('month') * 86_400_000, start.y, { steps: 4 })
  await expect(bar).toHaveAttribute('data-drag-state', 'dragging')
  await expect(bar).toHaveAttribute('data-preview-date', /2026-10-12/u)
  expect(patches()).toBe(beforeEdgeResize)
  await page.mouse.up()
  await expect(bar).toHaveAttribute('data-drag-state', 'idle')
  await expect.poll(() => api.records[0]?.properties[date.id]).toEqual({ start: '2026-10-12', end: '2026-10-14' })
  expect(patches()).toBe(beforeEdgeResize + 1)

  const end = await alignAtEdge(endHandle, 'right')
  await page.mouse.move(end.x, end.y)
  await page.mouse.down()
  await page.mouse.move(end.x + pxPerMs('month') * 86_400_000, end.y, { steps: 4 })
  await expect(bar).toHaveAttribute('data-drag-state', 'dragging')
  await expect(bar).toHaveAttribute('data-preview-date', /2026-10-15/u)
  expect(patches()).toBe(beforeEdgeResize + 1)
  await page.mouse.up()
  await expect.poll(() => api.records[0]?.properties[date.id]).toEqual({ start: '2026-10-12', end: '2026-10-15' })
  expect(patches()).toBe(beforeEdgeResize + 2)
})

test('Timeline keeps the viewport centered across navigation, rebase, resize, locale, and local-day updates', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.clock.install({ time: new Date('2026-10-13T12:00:00.000Z') })
  const timelineView = view('viewport-timeline', rootDatabase.id, 'Timeline', { ...DEFAULT_DATABASE_VIEW_CONFIG }, 'timeline')
  const tableView = view('viewport-table', rootDatabase.id, 'Table', { ...DEFAULT_DATABASE_VIEW_CONFIG }, 'table')
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await installApi(page, [block('viewport-timeline-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100)], {
    databases: [rootDatabase], views: [timelineView, tableView], properties: rootProperties, records: [],
  })
  await page.goto('/#/app/database-workspace/page/database-page')
  await page.clock.runFor(100)
  const database = page.locator('#database-block-viewport-timeline-block')
  const timeline = database.getByTestId('database-timeline')
  const scroller = timeline.getByTestId('timeline-scroll')
  await expect(timeline).toBeVisible()
  await page.clock.runFor(100)
  await expect.poll(() => scroller.evaluate(element => Number((element as HTMLElement).dataset.visibleStart))).toBeGreaterThan(0)

  const today = Number(await timeline.getAttribute('data-today-ms'))
  const initial = await timelineViewport(scroller)
  expect(Math.abs((initial.start + initial.end) / 2 - today)).toBeLessThan(1)
  const todayLine = timeline.getByTestId('timeline-today-line')
  await expect(todayLine).toBeVisible()
  const todayLineStyle = await todayLine.evaluate(element => {
    const style = getComputedStyle(element)
    return { borderWidth: style.borderLeftWidth, borderStyle: style.borderLeftStyle, borderColor: style.borderLeftColor, pointerEvents: style.pointerEvents }
  })
  expect(todayLineStyle.borderWidth).toBe('2px')
  expect(todayLineStyle.borderStyle).toBe('solid')
  expect(todayLineStyle.borderColor).not.toBe('rgba(0, 0, 0, 0)')
  expect(todayLineStyle.pointerEvents).toBe('none')
  await timeline.getByRole('button', { name: '上一个时间段' }).click()
  const previous = await timelineViewport(scroller)
  const previousExpected = await page.evaluate(instant => {
    const date = new Date(instant)
    date.setMonth(date.getMonth() - 1)
    return date.getTime()
  }, today)
  const monthHalfPixelMs = (previous.end - previous.start) / previous.width / 2
  expect(Math.abs((previous.start + previous.end) / 2 - previousExpected)).toBeLessThanOrEqual(monthHalfPixelMs)
  await timeline.getByRole('button', { name: '下一个时间段' }).click()
  const returnedAfterNext = await timelineViewport(scroller)
  expect(Math.abs((returnedAfterNext.start + returnedAfterNext.end) / 2 - (initial.start + initial.end) / 2)).toBeLessThanOrEqual((returnedAfterNext.end - returnedAfterNext.start) / returnedAfterNext.width / 2)

  const afterNavigation = await timelineViewport(scroller)
  await scroller.evaluate(element => { (element as HTMLElement).scrollLeft = (element as HTMLElement).scrollWidth * 0.05 })
  await expect.poll(async () => (await timelineViewport(scroller)).generation).toBeGreaterThan(afterNavigation.generation)
  await timeline.getByRole('button', { name: '今天', exact: true }).click()
  const returnedByToday = await timelineViewport(scroller)
  expect(Math.abs((returnedByToday.start + returnedByToday.end) / 2 - (initial.start + initial.end) / 2)).toBeLessThanOrEqual((returnedByToday.end - returnedByToday.start) / returnedByToday.width / 2)
  await timeline.getByLabel('时间轴刻度').selectOption('year')
  await expect(timeline).toHaveAttribute('data-scale', 'year')
  const beforeRebase = await timelineViewport(scroller)
  expect(beforeRebase.scrollWidth).toBeGreaterThan(beforeRebase.width)
  expect(beforeRebase.scrollHeight).toBeLessThanOrEqual(beforeRebase.clientHeight)
  expect(['auto', 'scroll']).not.toContain(beforeRebase.overflowY)
  const rebaseInput = await scroller.evaluate(element => {
    const node = element as HTMLElement
    const target = Math.round((node.scrollWidth - node.clientWidth) * 0.9)
    node.scrollLeft = target
    return { target: node.scrollLeft, width: node.clientWidth }
  })
  const rebaseExpectedStart = beforeRebase.origin + rebaseInput.target * (beforeRebase.end - beforeRebase.start) / beforeRebase.width
  await expect.poll(async () => (await timelineViewport(scroller)).generation).toBeGreaterThan(beforeRebase.generation)
  const afterRebase = await timelineViewport(scroller)
  expect(Math.abs(afterRebase.start - rebaseExpectedStart)).toBeLessThanOrEqual((beforeRebase.end - beforeRebase.start) / beforeRebase.width / 2)
  expect(afterRebase.scrollLeft).toBeGreaterThan(afterRebase.width)
  expect(afterRebase.scrollLeft).toBeLessThan(afterRebase.scrollWidth - afterRebase.width)

  const beforeResize = await timelineViewport(scroller)
  await page.setViewportSize({ width: 900, height: 820 })
  await expect.poll(async () => (await timelineViewport(scroller)).width).toBeLessThan(beforeResize.width)
  await expect.poll(async () => (await timelineViewport(scroller)).generation).toBeGreaterThan(beforeResize.generation)
  const afterResize = await timelineViewport(scroller)
  expect(Math.abs((afterResize.start + afterResize.end) / 2 - (beforeResize.start + beforeResize.end) / 2)).toBeLessThanOrEqual((afterResize.end - afterResize.start) / afterResize.width / 2)

  await timeline.getByLabel('时间轴刻度').selectOption('week')
  await page.evaluate(() => { document.documentElement.lang = 'zh-CN' })
  const chineseWeekStarts = await timeline.getByTestId('timeline-ruler').locator('.eotion-timeline-ruler-tick--major').evaluateAll(elements => elements.map(element => Number.parseFloat((element as HTMLElement).style.left)))
  const beforeLocale = await timelineViewport(scroller)
  await page.evaluate(() => { document.documentElement.lang = 'en-US' })
  await expect.poll(() => timeline.getByTestId('timeline-ruler').locator('.eotion-timeline-ruler-tick--major').evaluateAll(elements => elements.map(element => Number.parseFloat((element as HTMLElement).style.left)))).not.toEqual(chineseWeekStarts)
  const englishWeekStarts = await timeline.getByTestId('timeline-ruler').locator('.eotion-timeline-ruler-tick--major').evaluateAll(elements => elements.map(element => Number.parseFloat((element as HTMLElement).style.left)))
  expect(chineseWeekStarts.length).toBeGreaterThan(1)
  expect(englishWeekStarts.length).toBeGreaterThan(1)
  const afterLocale = await timelineViewport(scroller)
  expect(Math.abs((afterLocale.start + afterLocale.end) / 2 - (beforeLocale.start + beforeLocale.end) / 2)).toBeLessThanOrEqual((afterLocale.end - afterLocale.start) / afterLocale.width / 2)
  await expect(timeline).toHaveAttribute('data-scale', 'week')

  const localTomorrow = await page.evaluate(() => {
    const next = new Date(Date.now())
    next.setHours(24, 0, 0, 0)
    return next.getTime()
  })
  await page.clock.setSystemTime(new Date(localTomorrow - 1000))
  await page.clock.runFor(61_000)
  const afterMidnight = Number(await timeline.getAttribute('data-today-ms'))
  expect(afterMidnight).toBeGreaterThanOrEqual(localTomorrow)
  expect(afterMidnight).toBeLessThan(localTomorrow + 60_000)
  const localDayStart = (instant: number) => page.evaluate(value => {
    const date = new Date(value)
    date.setHours(0, 0, 0, 0)
    return date.getTime()
  }, instant)
  const tomorrowAfterWake = await page.evaluate(() => {
    const next = new Date(Date.now())
    next.setHours(24, 0, 0, 0)
    return next.getTime()
  })
  await page.clock.setSystemTime(new Date(tomorrowAfterWake + 1000))
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect.poll(async () => Number(await timeline.getAttribute('data-today-ms'))).toBe(await localDayStart(tomorrowAfterWake + 1000))
  const followingDay = await page.evaluate(() => {
    const next = new Date(Date.now())
    next.setHours(24, 0, 0, 0)
    return next.getTime()
  })
  await page.clock.setSystemTime(new Date(followingDay + 1000))
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect.poll(async () => Number(await timeline.getAttribute('data-today-ms'))).toBe(await localDayStart(followingDay + 1000))

  await database.getByRole('button', { name: '切换视图' }).click()
  await page.getByRole('group', { name: '数据库视图', exact: true }).getByRole('button', { name: '表格视图', exact: true }).click()
  await expect(database.locator('table')).toBeVisible()
  await expect(database.getByText('暂无记录', { exact: true })).toBeVisible()
  await page.evaluate(() => {
    document.documentElement.lang = 'zh-CN'
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('pageshow'))
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('resize'))
  })
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await expect(database.getByTestId('database-timeline')).toHaveCount(0)
  expect(pageErrors).toEqual([])
})

test('phone creates a Board view without a Select property and keeps the two-row header in the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const api = await installApi(page, [
    block('phone-create-board-view-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: [rootProperties[0]!], records: [] })
  const initialPageCount = api.pages.length
  const initialDatabaseBlockIds = api.blocks.filter(item => item.type === 'database').map(item => item.id)
  const initialDatabaseCount = api.databases.length
  const initialRecordCount = api.records.length
  await page.goto('/#/app/database-workspace/page/database-page')

  const database = page.locator('#database-block-phone-create-board-view-block')
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
  await database.getByRole('button', { name: '切换视图' }).click()
  const menu = page.getByRole('group', { name: '数据库视图', exact: true })
  const createBoardButton = menu.getByRole('button', { name: '新建看板视图' })
  const createBoardBox = await createBoardButton.boundingBox()
  expect(createBoardBox).toBeTruthy()
  expect(createBoardBox!.x).toBeGreaterThanOrEqual(0)
  expect(createBoardBox!.y).toBeGreaterThanOrEqual(0)
  expect(createBoardBox!.x + createBoardBox!.width).toBeLessThanOrEqual(390)
  expect(createBoardBox!.y + createBoardBox!.height).toBeLessThanOrEqual(844)
  await createBoardButton.click()

  const board = database.getByTestId('database-board')
  await expect(board).toBeVisible()
  await expect(board).toContainText('尚未配置分组属性')
  await expect.poll(() => api.views.find(item => item.id !== 'view-root-id')).toMatchObject({ type: 'board', config: DEFAULT_DATABASE_VIEW_CONFIG })
  const createdView = api.views.find(item => item.id !== 'view-root-id')!
  expect(createdView.config.options).toBeUndefined()
  await expect.poll(() => api.blocks.find(item => item.id === 'phone-create-board-view-block')?.props.node?.attrs).toEqual({ databaseId: rootDatabase.id, viewId: createdView.id })
  expect(api.requests.filter(({ method, path }) => method === 'POST' && path.endsWith(`/databases/${rootDatabase.id}/views`))).toHaveLength(1)
  expect(api.pages).toHaveLength(initialPageCount)
  expect(api.blocks.filter(item => item.type === 'database').map(item => item.id)).toEqual(initialDatabaseBlockIds)
  expect(api.databases).toHaveLength(initialDatabaseCount)
  expect(api.records).toHaveLength(initialRecordCount)
  expect(api.properties.map(({ id }) => id)).toEqual([rootProperties[0]!.id])

  const [afterTitleBox, afterSelectorBox, afterAddBox, afterSettingsBox] = await Promise.all([title.boundingBox(), selector.boundingBox(), add.boundingBox(), settings.boundingBox()])
  expect(afterTitleBox && afterSelectorBox && afterAddBox && afterSettingsBox).toBeTruthy()
  expect(afterTitleBox!.y + afterTitleBox!.height).toBeLessThanOrEqual(afterSelectorBox!.y)
  expect(Math.abs(afterSelectorBox!.y - afterAddBox!.y)).toBeLessThanOrEqual(4)
  expect(Math.abs(afterSelectorBox!.y - afterSettingsBox!.y)).toBeLessThanOrEqual(4)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('a 409 while creating a List view clears the pending type before creating a Board view', async ({ page }) => {
  const api = await installApi(page, [
    block('retry-board-view-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: rootProperties, records: [] })
  await page.goto('/#/app/database-workspace/page/database-page')
  const database = page.locator('#database-block-retry-board-view-block')
  const selector = database.getByRole('button', { name: '切换视图' })
  await expect(selector).toBeVisible()
  await selector.click()
  const menu = page.getByRole('group', { name: '数据库视图', exact: true })

  api.databases[0]!.version += 1
  await menu.getByRole('button', { name: '新建列表视图' }).click()
  await expect(page.getByRole('alert')).toContainText('数据库或视图已变化')
  expect(api.views).toHaveLength(1)
  expect(api.requests.filter(({ method, path }) => method === 'POST' && path.endsWith(`/databases/${rootDatabase.id}/views`)).map(item => item.payload?.type)).toEqual(['list'])

  if (!await menu.isVisible()) await selector.click()
  await page.getByRole('group', { name: '数据库视图', exact: true }).getByRole('button', { name: '新建看板视图' }).click()
  await expect(database.getByTestId('database-board')).toContainText('尚未配置分组属性')
  expect(api.views.filter(item => item.type === 'board')).toHaveLength(1)
  expect(api.requests.filter(({ method, path }) => method === 'POST' && path.endsWith(`/databases/${rootDatabase.id}/views`)).map(item => item.payload?.type)).toEqual(['list', 'board'])
})

test('an unconfirmed List creation blocks a cross-type Board retry without another POST', async ({ page }) => {
  const api = await installApi(page, [
    block('uncertain-board-view-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: rootProperties, records: [] })
  let interrupted = false
  const interruptedCreateAttempts: Array<{ id: string; type: string }> = []
  await page.route(url => url.pathname.endsWith(`/databases/${rootDatabase.id}/views`), async route => {
    if (!interrupted && route.request().method() === 'POST') {
      interrupted = true
      interruptedCreateAttempts.push(route.request().postDataJSON() as { id: string; type: string })
      return route.abort('failed')
    }
    return route.fallback()
  })
  await page.goto('/#/app/database-workspace/page/database-page')
  const database = page.locator('#database-block-uncertain-board-view-block')
  const selector = database.getByRole('button', { name: '切换视图' })
  await expect(selector).toBeVisible()
  await selector.click()
  const menu = page.getByRole('group', { name: '数据库视图', exact: true })
  await menu.getByRole('button', { name: '新建列表视图' }).click()
  await expect(page.getByRole('alert')).toContainText('视图创建结果暂未确认')
  const createRequests = () => api.requests.filter(({ method, path }) => method === 'POST' && path.endsWith(`/databases/${rootDatabase.id}/views`))
  expect(interruptedCreateAttempts.map(item => item.type)).toEqual(['list'])
  expect(interruptedCreateAttempts[0]?.id).toBeTruthy()
  expect(createRequests()).toHaveLength(0)

  if (!await menu.isVisible()) await selector.click()
  await page.getByRole('group', { name: '数据库视图', exact: true }).getByRole('button', { name: '新建看板视图' }).click()
  await expect(page.getByRole('alert')).toContainText('上次视图创建结果暂未确认，请先重试原类型视图。')
  expect(interruptedCreateAttempts.map(item => item.type)).toEqual(['list'])
  expect(createRequests()).toHaveLength(0)
  await expect(database.getByTestId('database-board')).toHaveCount(0)

  if (!await menu.isVisible()) await selector.click()
  await page.getByRole('group', { name: '数据库视图', exact: true }).getByRole('button', { name: '新建列表视图' }).click()
  await expect(database.getByTestId('database-list')).toBeVisible()
  expect(createRequests().map(item => item.payload?.type)).toEqual(['list'])
  expect(createRequests()[0]?.payload?.id).toBe(interruptedCreateAttempts[0]?.id)
  expect(api.views.filter(item => item.type === 'list')).toHaveLength(1)
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
  const creationGroup = menu.getByRole('group', { name: '新建数据库视图', exact: true })
  await expect(creationGroup.getByRole('button')).toHaveCount(3)
  for (const name of ['新建视图', '新建列表视图', '新建看板视图']) {
    await expect(creationGroup.getByRole('button', { name, exact: true })).toBeVisible()
  }
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
  const timelineView = view('board-timeline-view', rootDatabase.id, 'Timeline', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { timeline: { frozenTable: { visible: true, visibleProperties: ['root-title'], propertyOrder: ['root-title'] } } },
  }, 'timeline')
  const api = await installApi(page, [
    block('board-lifecycle', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: boardView.id } }, 100),
  ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id), listView, boardView, timelineView], properties: rootProperties, records: [basicRecord] })
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
  const body = drawer.locator('.eotion-editor-content .tiptap')
  await title.fill('Board draft survives')
  await body.fill('Timeline view switch body draft')
  await page.evaluate(() => {
    const editor = document.querySelector('.eotion-editor')
    const database = document.querySelector('#database-block-board-lifecycle')
    const drawer = document.querySelector('[data-overlay-mode="drawer"]')
    if (!editor || !database || !drawer) throw new Error('Expected editor, database NodeView, and record drawer')
    ;(window as Window & { __boardLifecycleIdentity?: { editor: Element; database: Element; drawer: Element; editorComponent: unknown; databaseComponent: unknown } }).__boardLifecycleIdentity = {
      editor, database, drawer,
      editorComponent: (editor as Element & { __vueParentComponent?: unknown }).__vueParentComponent,
      databaseComponent: (database as Element & { __vueParentComponent?: unknown }).__vueParentComponent,
    }
  })
  for (const [name, renderer] of [['表格视图', 'table'], ['List', '[data-testid="database-list"]'], ['Timeline', 'timeline'], ['Board', '[data-testid="database-board"]']] as const) {
    await database.getByRole('button', { name: '切换视图' }).focus()
    await database.getByRole('button', { name: '切换视图' }).press('Enter')
    await page.getByRole('group', { name: '数据库视图', exact: true }).getByRole('button', { name, exact: true }).click()
    if (renderer === 'timeline') {
      await expect(database.getByTestId('database-timeline')).toBeVisible()
      await expect(database.getByTestId('timeline-frozen-table')).toBeVisible()
      await expect(database.locator('table, [data-testid="database-list"], [data-testid="database-board"]')).toHaveCount(0)
    } else await expect(database.locator(renderer)).toBeVisible()
    await expect(database).toHaveAttribute('data-board-lifecycle', 'stable')
    await expect(page.locator('.eotion-editor-content').first()).toHaveAttribute('data-board-lifecycle', 'stable')
    await expect(drawer).toHaveAttribute('data-board-lifecycle', 'stable')
    await expect(title).toHaveValue('Board draft survives')
    await expect(body).toContainText('Timeline view switch body draft')
    await expect.poll(() => page.evaluate(() => {
      const before = (window as Window & { __boardLifecycleIdentity?: { editor: Element; database: Element; drawer: Element; editorComponent: unknown; databaseComponent: unknown } }).__boardLifecycleIdentity!
      const editor = document.querySelector('.eotion-editor') as (Element & { __vueParentComponent?: unknown }) | null
      const database = document.querySelector('#database-block-board-lifecycle') as (Element & { __vueParentComponent?: unknown }) | null
      return {
        editorSame: editor === before.editor,
        databaseSame: database === before.database,
        drawerSame: document.querySelector('[data-overlay-mode="drawer"]') === before.drawer,
        editorComponentSame: editor?.__vueParentComponent === before.editorComponent,
        databaseComponentSame: database?.__vueParentComponent === before.databaseComponent,
      }
    })).toEqual({ editorSame: true, databaseSame: true, drawerSame: true, editorComponentSame: true, databaseComponentSame: true })
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
  await expect(drawer.locator('.eotion-editor-content .tiptap')).toHaveAttribute('contenteditable', 'true')
  await titleDraft.fill('Draft survives Board mutation')
  await expect(titleDraft).toHaveValue('Draft survives Board mutation')
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

test('List empty projected title keeps its visible and accessible name consistent', async ({ page }) => {
  const listView = view('empty-title-list', rootDatabase.id, 'List', undefined, 'list')
  const api = await installApi(page, [
    block('empty-title-list-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: listView.id } }, 100),
  ], { databases: [rootDatabase], views: [listView], properties: rootProperties, records: [basicRecord] })
  api.pages.push({ ...pageRecord, id: basicRecord.pageId, title: '', role: 'database-record' })
  await page.goto('/#/app/database-workspace/page/database-page')
  await expect(page.getByTestId('database-list').getByRole('button', { name: '打开记录：无标题', exact: true })).toBeVisible()
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
  const clearedDate = table.locator('tbody tr').first().locator('td').nth(5).getByRole('button', { name: '编辑Deadline：', exact: true })
  await expect(clearedDate).toBeVisible()
  await expect(clearedDate).toHaveText('')
  expect(api.records[0]?.properties['root-date']).toBeNull()
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
  await table.getByRole('button', { name: /编辑Due date/u }).click()
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

test('P11.1B formats, edits, validates, and reloads date values without losing range data', async ({ page }) => {
  test.setTimeout(60_000)
  const errors: string[] = []
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', error => errors.push(error.message))
  const legacy = property('p111b-legacy', rootDatabase.id, 'Legacy', 'date')
  const ranged = property('p111b-range', rootDatabase.id, 'Range', 'date')
  const equal = property('p111b-equal', rootDatabase.id, 'Equal', 'date')
  const timed = property('p111b-timed', rootDatabase.id, 'When', 'date')
  const single = property('p111b-single', rootDatabase.id, 'Single', 'date')
  const createRange = property('p111b-create-range', rootDatabase.id, 'Create range', 'date')
  const api = await installApi(page, [block('p111b-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100)], {
    databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: [property('p111b-title', rootDatabase.id, 'Name', 'title'), legacy, ranged, equal, timed, single, createRange],
    records: [record('p111b-record', rootDatabase.id, 'p111b-page', {
      'p111b-title': 'Date row', [legacy.id]: '2026-10-01',
      [ranged.id]: { start: '2026-10-02', end: '2026-10-05' },
      [equal.id]: { start: '2026-10-06', end: '2026-10-06' },
      [timed.id]: { start: '2026-10-07T09:30:12.345Z', end: '2026-10-07T10:30:45.678Z', timeZone: 'Asia/Shanghai' },
      [single.id]: { start: '2026-10-08' },
      [createRange.id]: '2026-10-09',
    })],
  })
  await page.goto('/#/app/database-workspace/page/database-page')
  expect(page.url()).toContain('/#/app/database-workspace/page/database-page')
  await expect(page).toHaveTitle(/Eotion/u)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  const table = page.locator('.eotion-editor-content .eotion-database')
  await expect(table).toContainText('2026-10-01')
  await expect(table).toContainText('2026-10-02 → 2026-10-05')
  await expect(table).toContainText('2026-10-06 → 2026-10-06')
  await expect(table).toContainText('2026-10-07 09:30 UTC → 2026-10-07 10:30 UTC (Asia/Shanghai)')

  await table.getByRole('button', { name: /编辑Legacy/u }).click()
  await screenshot(page, 'p111b-date-editor-desktop')
  const legacyInput = table.getByLabel('Legacy 值')
  await expect(legacyInput).toBeFocused()
  await legacyInput.fill('2026-10-11')
  await legacyInput.press('Enter')
  await expect.poll(() => api.records[0]?.properties[legacy.id]).toBe('2026-10-11')

  await page.setViewportSize({ width: 390, height: 844 })
  await table.getByRole('button', { name: /编辑Range/u }).click()
  await screenshot(page, 'p111b-date-editor-mobile-390')
  await expect(table.getByLabel('Range 值')).toBeFocused()
  const cellPatchCount = () => api.requests.filter(request => request.method === 'PATCH' && /\/cells\//u.test(request.path)).length
  const beforeTab = cellPatchCount()
  await page.keyboard.press('Tab')
  await expect(table.getByRole('textbox', { name: '结束日期' })).toBeFocused()
  expect(cellPatchCount()).toBe(beforeTab)
  const cancelDateEdit = table.getByRole('button', { name: '取消', exact: true })
  await cancelDateEdit.focus()
  await page.keyboard.press('Tab')
  await expect.poll(() => page.evaluate(() => !document.activeElement?.closest('.eotion-database-date-editor'))).toBe(true)
  await expect(table.getByLabel('Range 值')).toBeVisible()
  expect(cellPatchCount()).toBe(beforeTab)
  const rangeStart = table.getByLabel('Range 值')
  await rangeStart.focus()
  await page.keyboard.press('Shift+Tab')
  await expect.poll(() => page.evaluate(() => !document.activeElement?.closest('.eotion-database-date-editor'))).toBe(true)
  expect(cellPatchCount()).toBe(beforeTab)
  await expect(rangeStart).toHaveValue('2026-10-02')
  await table.getByLabel('Range 值').fill('')
  await table.getByRole('button', { name: '保存', exact: true }).click()
  await expect(table.getByRole('alert')).toContainText('请选择有效日期')
  await expect(table.getByLabel('Range 值')).toHaveValue('')
  await table.getByLabel('Range 值').fill('2026-10-03')
  await table.getByRole('textbox', { name: '结束日期' }).fill('2026-10-02')
  await table.getByRole('button', { name: '保存', exact: true }).click()
  await expect(table.getByRole('alert')).toContainText('结束日期不早于开始日期')
  await table.getByRole('textbox', { name: '结束日期' }).fill('2026-10-05')
  await table.getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(() => api.records[0]?.properties[ranged.id]).toEqual({ start: '2026-10-03', end: '2026-10-05' })

  await table.getByRole('button', { name: /编辑Create range/u }).click()
  await table.getByRole('checkbox', { name: '结束日期' }).check()
  await table.getByRole('textbox', { name: '结束日期' }).fill('2026-10-10')
  await table.getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(() => api.records[0]?.properties[createRange.id]).toEqual({ start: '2026-10-09', end: '2026-10-10' })

  await table.getByRole('button', { name: /编辑When/u }).click()
  await expect(table.getByLabel('When 值')).toHaveValue('2026-10-07T09:30:12.345')
  await table.getByLabel('时区').fill('America/New_York')
  api.abortCellUpdatesAfterCommit = 1
  await table.getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(() => api.records[0]?.properties[timed.id]).toEqual({ start: '2026-10-07T09:30:12.345Z', end: '2026-10-07T10:30:45.678Z', timeZone: 'America/New_York' })

  await table.getByRole('button', { name: /编辑When/u }).click()
  await table.getByLabel('When 值').fill('2026-10-07T09:45:12.789')
  await table.getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(() => api.records[0]?.properties[timed.id]).toEqual({ start: '2026-10-07T09:45:12.789Z', end: '2026-10-07T10:30:45.678Z', timeZone: 'America/New_York' })

  await table.getByRole('button', { name: /编辑When/u }).click()
  await table.getByLabel('时区').fill('Not/AZone')
  await table.getByRole('button', { name: '保存', exact: true }).click()
  await expect(table.getByRole('alert')).toContainText('UTC 日期时间范围和 IANA 时区')
  await expect(table.getByLabel('时区')).toHaveValue('Not/AZone')
  await table.getByLabel('时区').fill('America/New_York')
  await table.getByRole('button', { name: '保存', exact: true }).click()
  await expect(table.getByLabel('When 值')).toHaveCount(0)

  await table.getByRole('button', { name: /编辑Equal/u }).click()
  await table.getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(() => api.records[0]?.properties[equal.id]).toEqual({ start: '2026-10-06', end: '2026-10-06' })

  await table.getByRole('button', { name: /编辑Single/u }).click()
  await table.getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(() => api.records[0]?.properties[single.id]).toEqual({ start: '2026-10-08' })

  await table.getByRole('button', { name: /编辑Single/u }).click()
  await table.getByLabel('Single 值').fill('')
  await table.getByRole('button', { name: '保存', exact: true }).click()
  await expect(table.getByRole('alert')).toContainText('请选择有效日期')
  await expect(table.getByLabel('Single 值')).toHaveValue('')
  await table.getByLabel('Single 值').fill('2026-10-08')
  await table.getByLabel('包含时间').check()
  await table.getByLabel('Single 值').fill('')
  await table.getByRole('button', { name: '保存', exact: true }).click()
  await expect(table.getByRole('alert')).toContainText('UTC 日期时间范围')
  await expect(table.getByLabel('Single 值')).toHaveValue('')
  await table.getByLabel('Single 值').fill('2026-10-08T00:00')
  await table.getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(() => api.records[0]?.properties[single.id]).toEqual({ start: '2026-10-08T00:00:00.000Z', timeZone: 'UTC' })

  api.conflictCellUpdates = 1
  await table.getByRole('button', { name: /编辑Legacy/u }).click()
  await table.getByLabel('Legacy 值').fill('2026-10-12')
  await table.getByLabel('Legacy 值').press('Enter')
  await expect(table.getByRole('alert')).toContainText('内容已变化')
  await expect(table.getByLabel('Legacy 值')).toHaveValue('2026-10-12')
  await table.getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(() => api.records[0]?.properties[legacy.id]).toBe('2026-10-12')

  const widths = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }))
  expect(widths.document).toBeLessThanOrEqual(widths.viewport)
  await page.reload()
  await expect(page.locator('.eotion-editor-content .eotion-database')).toContainText('2026-10-03 → 2026-10-05')
  await expect(page.locator('.eotion-editor-content .eotion-database')).toContainText('America/New_York')
  await expect(page.locator('.eotion-editor-content .eotion-database')).toContainText('2026-10-06 → 2026-10-06')
  await expect(page.locator('.eotion-editor-content .eotion-database')).toContainText('2026-10-08 00:00 UTC (UTC)')
  expect(errors.filter(error => !error.includes('409 (Conflict)') && !error.includes('net::ERR_FAILED'))).toEqual([])
})

test('P11.3A Timeline date-property drag previews locally and commits one CAS update without changing date wire shape', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.clock.setFixedTime(new Date('2026-10-13T00:00:00.000Z'))
  const runtimeErrors: string[] = []
  page.on('pageerror', error => runtimeErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') runtimeErrors.push(message.text()) })
  const date = property('p113a-date', rootDatabase.id, 'Date', 'date')
  const timelineView = view('p113a-date-view', rootDatabase.id, 'Drag dates', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { timeline: {
      scale: 'month', dateSource: { mode: 'date-property', propertyId: date.id },
      frozenTable: { visible: true, visibleProperties: ['root-title', date.id], propertyOrder: ['root-title', date.id] },
    } },
  }, 'timeline')
  const tableView = view('p113a-date-table-view', rootDatabase.id, 'Date table')
  const items = [
    record('p113a-date-string', rootDatabase.id, 'p113a-date-page', { 'root-title': 'Date string', [date.id]: '2026-10-13' }),
    record('p113a-date-start', rootDatabase.id, 'p113a-start-page', { 'root-title': 'Date start object', [date.id]: { start: '2026-10-14' } }),
    record('p113a-date-range', rootDatabase.id, 'p113a-range-page', { 'root-title': 'Inclusive date range', [date.id]: { start: '2026-10-15', end: '2026-10-17' } }),
  ]
  const api = await installApi(page, [block('p113a-date-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100)], {
    databases: [rootDatabase], views: [timelineView, tableView], properties: [...rootProperties, date], records: items, holdCellUpdateResponse: true,
  })
  for (const item of items) api.pages.push({ ...pageRecord, id: item.pageId, title: String(item.properties['root-title']), role: 'database-record' })
  await page.goto('/#/app/database-workspace/page/database-page')
  const databaseBlock = page.locator('#database-block-p113a-date-block')
  const timeline = databaseBlock.getByTestId('database-timeline')
  const barFor = (id: string) => timeline.locator(`[data-testid="timeline-bar"][data-record-id="${id}"]`)
  await expect(barFor(items[0]!.id)).toBeVisible()
  await expect(databaseBlock.getByTestId('timeline-frozen-table')).toBeVisible()
  const dayPixels = pxPerMs('month') * 86_400_000
  const initialBar = barFor(items[0]!.id)
  const initialBounds = await initialBar.boundingBox()
  if (!initialBounds) throw new Error('Expected the date bar to have visible geometry')
  await page.mouse.move(initialBounds.x + initialBounds.width / 2, initialBounds.y + initialBounds.height / 2)
  await page.mouse.down()
  await page.mouse.move(initialBounds.x + initialBounds.width / 2 + dayPixels, initialBounds.y + initialBounds.height / 2, { steps: 4 })
  await expect(initialBar).toHaveAttribute('data-drag-state', 'dragging')
  await expect(initialBar).toHaveAttribute('data-preview-date', '2026-10-14')
  await screenshot(page, 'p113a-date-drag-preview-desktop')
  expect(api.records[0]?.properties[date.id]).toBe('2026-10-13')
  expect(api.requests.filter(item => item.method === 'PATCH' && item.path.includes(`/records/${items[0]!.id}/cells/`))).toHaveLength(0)
  const previewBounds = await initialBar.boundingBox()
  expect(previewBounds?.x).toBeCloseTo(initialBounds.x + dayPixels, 0)

  await page.mouse.up()
  await expect(initialBar).toHaveAttribute('data-drag-state', 'saving')
  await api.cellUpdateResponseStarted
  const firstPatch = api.requests.filter(item => item.method === 'PATCH' && item.path.endsWith(`/records/${items[0]!.id}/cells/${date.id}`))
  expect(firstPatch).toHaveLength(1)
  expect(firstPatch[0]?.payload).toEqual({ value: '2026-10-14', expectedDatabaseVersion: 1, expectedRecordVersion: 1 })
  expect(api.records[0]?.properties[date.id]).toBe('2026-10-13')
  await expect(initialBar).toHaveAttribute('data-preview-date', '2026-10-14')
  api.releaseCellUpdateResponse()
  api.holdCellUpdateResponse = false
  await expect.poll(() => api.records[0]?.properties[date.id]).toBe('2026-10-14')
  await expect.poll(() => barFor(items[0]!.id).count()).toBe(1)
  await expect(initialBar).toHaveAttribute('data-drag-state', 'idle')
  await expect(databaseBlock.locator(`[data-timeline-frozen-row][data-record-id="${items[0]!.id}"] [data-property-id="${date.id}"]`)).toContainText('2026-10-14')
  await screenshot(page, 'p113a-date-drag-committed-desktop')
  await expect(page.locator('[data-overlay-mode="drawer"]')).toHaveCount(0)

  await databaseBlock.getByRole('button', { name: '切换视图' }).click()
  await page.getByRole('group', { name: '数据库视图', exact: true }).getByRole('button', { name: 'Date table', exact: true }).click()
  const table = databaseBlock.locator('table')
  await expect(table.locator('tbody tr').filter({ hasText: 'Date string' })).toContainText('2026-10-14')
  await databaseBlock.getByRole('button', { name: '切换视图' }).click()
  await page.getByRole('group', { name: '数据库视图', exact: true }).getByRole('button', { name: 'Drag dates', exact: true }).click()

  await page.setViewportSize({ width: 390, height: 844 })
  const mobileBar = barFor(items[0]!.id)
  const mobileBounds = await mobileBar.boundingBox()
  if (!mobileBounds) throw new Error('Expected the date bar to be visible at the 390px viewport')
  const mobileX = mobileBounds.x + mobileBounds.width / 2
  const mobileY = mobileBounds.y + mobileBounds.height / 2
  await page.mouse.move(mobileX, mobileY)
  await page.mouse.down()
  await page.mouse.move(mobileX + dayPixels, mobileY, { steps: 4 })
  await expect(mobileBar).toHaveAttribute('data-drag-state', 'dragging')
  await expect(mobileBar).toHaveAttribute('data-preview-date', '2026-10-15')
  await screenshot(page, 'p113a-date-drag-preview-mobile390')
  await page.mouse.up()
  await expect.poll(() => api.records[0]?.properties[date.id]).toBe('2026-10-15')
  await screenshot(page, 'p113a-date-drag-committed-mobile390')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await page.setViewportSize({ width: 1440, height: 900 })

  const dragOneDay = async (id: string) => {
    const bar = barFor(id)
    await bar.scrollIntoViewIfNeeded()
    const bounds = await bar.boundingBox()
    if (!bounds) throw new Error(`Expected visible Timeline bar ${id}`)
    const x = bounds.x + bounds.width / 2
    const y = bounds.y + bounds.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + dayPixels, y, { steps: 4 })
    await expect(bar).toHaveAttribute('data-drag-state', 'dragging')
    await page.mouse.up()
    await expect(bar).toHaveAttribute('data-drag-state', 'idle')
  }
  for (const item of items.slice(1)) {
    const previous = structuredClone(item.properties[date.id])
    await dragOneDay(item.id)
    const expected = item.id === 'p113a-date-start'
      ? { start: '2026-10-15' }
      : { start: '2026-10-16', end: '2026-10-18' }
    await expect.poll(() => api.records.find(record => record.id === item.id)?.properties[date.id]).toEqual(expected)
    expect(api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith(`/records/${item.id}/cells/${date.id}`))).toHaveLength(1)
    expect(previous).not.toEqual(expected)
  }
  expect(api.requests.filter(item => item.method === 'PATCH' && item.path.includes('/cells/'))).toHaveLength(4)
  await page.reload()
  await expect(barFor(items[0]!.id)).not.toHaveAttribute('data-preview-date', /.+/u)
  await expect(timeline).toContainText('2026-10-15')
  await expect(timeline).toContainText('2026-10-15')
  await expect(timeline).toContainText('2026-10-16 → 2026-10-18')
  expect(runtimeErrors.filter(error => !error.includes('net::ERR_FAILED'))).toEqual([])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})

test('P11.3A Timeline datetime drag preserves timezone, milliseconds, and range duration; start-end bars stay read-only', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.clock.setFixedTime(new Date('2026-10-13T12:00:00.000Z'))
  const datetime = property('p113a-datetime', rootDatabase.id, 'When', 'date')
  const start = property('p113a-start', rootDatabase.id, 'Start', 'date')
  const end = property('p113a-end', rootDatabase.id, 'End', 'date')
  const datetimeView = view('p113a-datetime-view', rootDatabase.id, 'Datetime drag', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { timeline: { scale: 'day', dateSource: { mode: 'date-property', propertyId: datetime.id } } },
  }, 'timeline')
  const startEndView = view('p113a-start-end-view', rootDatabase.id, 'Start-end read-only', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { timeline: { scale: 'day', dateSource: { mode: 'start-end', startPropertyId: start.id, endPropertyId: end.id } } },
  }, 'timeline')
  const items = [
    record('p113a-datetime-point', rootDatabase.id, 'p113a-datetime-point-page', { 'root-title': 'Timed point', [datetime.id]: { start: '2026-10-13T12:30:12.345Z', timeZone: 'America/New_York' }, [start.id]: { start: '2026-10-13T12:30:12.345Z', timeZone: 'America/New_York' } }),
    record('p113a-datetime-range', rootDatabase.id, 'p113a-datetime-range-page', { 'root-title': 'Timed range', [datetime.id]: { start: '2026-10-13T13:15:12.345Z', end: '2026-10-13T14:45:45.678Z', timeZone: 'America/New_York' }, [start.id]: { start: '2026-10-13T13:15:12.345Z', timeZone: 'America/New_York' }, [end.id]: { start: '2026-10-13T14:45:45.678Z', timeZone: 'America/New_York' } }),
  ]
  const api = await installApi(page, [
    block('p113a-datetime-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: datetimeView.id } }, 100),
    block('p113a-start-end-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: startEndView.id } }, 200),
  ], { databases: [rootDatabase], views: [datetimeView, startEndView], properties: [...rootProperties, datetime, start, end], records: items })
  for (const item of items) api.pages.push({ ...pageRecord, id: item.pageId, title: String(item.properties['root-title']), role: 'database-record' })
  await page.goto('/#/app/database-workspace/page/database-page')
  const timeline = page.locator('#database-block-p113a-datetime-block').getByTestId('database-timeline')
  const readonlyTimeline = page.locator('#database-block-p113a-start-end-block').getByTestId('database-timeline')
  const hourPixels = pxPerMs('day') * 3_600_000
  const moveByHour = async (id: string) => {
    const bar = timeline.locator(`[data-testid="timeline-bar"][data-record-id="${id}"]`)
    const bounds = await bar.boundingBox()
    if (!bounds) throw new Error(`Expected visible datetime bar ${id}`)
    const x = bounds.x + bounds.width / 2
    const y = bounds.y + bounds.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + hourPixels, y, { steps: 4 })
    await expect(bar).toHaveAttribute('data-preview-date', /2026-10-13 /u)
    await page.mouse.up()
    await expect(bar).toHaveAttribute('data-drag-state', 'idle')
  }
  await moveByHour(items[0]!.id)
  await moveByHour(items[1]!.id)
  expect(api.records.find(item => item.id === items[0]!.id)?.properties[datetime.id]).toEqual({ start: '2026-10-13T13:30:12.345Z', timeZone: 'America/New_York' })
  expect(api.records.find(item => item.id === items[1]!.id)?.properties[datetime.id]).toEqual({ start: '2026-10-13T14:15:12.345Z', end: '2026-10-13T15:45:45.678Z', timeZone: 'America/New_York' })
  await expect(readonlyTimeline.locator('[data-testid="timeline-bar"][data-record-id="p113a-datetime-point"]')).toHaveAttribute('data-draggable', 'false')
  const readonlyBar = readonlyTimeline.locator('[data-testid="timeline-bar"][data-record-id="p113a-datetime-point"]')
  const readonlyBounds = await readonlyBar.boundingBox()
  if (!readonlyBounds) throw new Error('Expected start-end bar to remain visible')
  await page.mouse.move(readonlyBounds.x + 10, readonlyBounds.y + 12)
  await page.mouse.down()
  await page.mouse.move(readonlyBounds.x + 10 + hourPixels, readonlyBounds.y + 12, { steps: 4 })
  await expect(readonlyBar).toHaveAttribute('data-drag-state', 'idle')
  await page.mouse.up()
  expect(api.requests.filter(item => item.method === 'PATCH' && item.path.includes('/cells/'))).toHaveLength(2)
  await page.reload()
  await expect(timeline).toContainText('America/New_York')
  expect(api.records.find(item => item.id === items[1]!.id)?.properties[datetime.id]).toEqual({ start: '2026-10-13T14:15:12.345Z', end: '2026-10-13T15:45:45.678Z', timeZone: 'America/New_York' })
})

test('P11.3A Timeline rolls back failed and conflicted drags without retrying, and cancellation/no-op/offline stays write-free', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.clock.setFixedTime(new Date('2026-10-13T00:00:00.000Z'))
  const date = property('p113a-failure-date', rootDatabase.id, 'Date', 'date')
  const tableView = view('p113a-failure-table-view', rootDatabase.id, 'Failure table')
  const timelineView = view('p113a-failure-view', rootDatabase.id, 'Failed drags', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { timeline: { scale: 'month', dateSource: { mode: 'date-property', propertyId: date.id } } },
  }, 'timeline')
  const item = record('p113a-failure-record', rootDatabase.id, 'p113a-failure-page', { 'root-title': 'Failure row', [date.id]: '2026-10-13' })
  const api = await installApi(page, [block('p113a-failure-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100)], {
    databases: [rootDatabase], views: [timelineView, tableView], properties: [...rootProperties, date], records: [item],
    conflictCellUpdateValue: '2026-10-15',
  })
  api.pages.push({ ...pageRecord, id: item.pageId, title: 'Failure row', role: 'database-record' })
  await page.goto('/#/app/database-workspace/page/database-page')
  const timeline = page.locator('#database-block-p113a-failure-block').getByTestId('database-timeline')
  const bar = timeline.locator(`[data-testid="timeline-bar"][data-record-id="${item.id}"]`)
  const dayPixels = pxPerMs('month') * 86_400_000
  const drag = async (deltaX = dayPixels) => {
    const bounds = await bar.boundingBox()
    if (!bounds) throw new Error('Expected failure test bar to be visible')
    const x = bounds.x + bounds.width / 2
    const y = bounds.y + bounds.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + deltaX, y, { steps: 4 })
    await expect(bar).toHaveAttribute('data-drag-state', 'dragging')
    await page.mouse.up()
    await expect(bar).toHaveAttribute('data-drag-state', 'idle')
  }

  // Bump the server record after pointerdown has captured its expected version.
  const staleBounds = await bar.boundingBox()
  if (!staleBounds) throw new Error('Expected failure test bar before stale-CAS drag')
  const staleX = staleBounds.x + staleBounds.width / 2
  const staleY = staleBounds.y + staleBounds.height / 2
  api.holdCellUpdateResponse = true
  await page.mouse.move(staleX, staleY)
  await page.mouse.down()
  await expect(bar).toHaveAttribute('data-drag-state', 'armed')
  const capturedRecordVersion = api.records[0]!.version
  await page.mouse.move(staleX + dayPixels, staleY, { steps: 4 })
  await expect(bar).toHaveAttribute('data-drag-state', 'dragging')
  await page.mouse.up()
  await api.cellUpdateResponseStarted
  api.records[0]!.version += 1
  api.releaseCellUpdateResponse()
  api.holdCellUpdateResponse = false
  await expect(bar).toHaveAttribute('data-drag-state', 'idle')
  await expect.poll(() => api.records[0]?.properties[date.id]).toBe('2026-10-13')
  await expect(bar).not.toHaveAttribute('data-preview-date', /.+/u)
  await expect(bar).toHaveAttribute('title', /2026-10-13/u)
  const stalePatch = api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith(`/records/${item.id}/cells/${date.id}`))
  expect(stalePatch).toHaveLength(1)
  expect(stalePatch[0]?.payload.expectedRecordVersion).toBe(capturedRecordVersion)

  api.conflictCellUpdates = 1
  await drag()
  await expect.poll(() => api.records[0]?.properties[date.id]).toBe('2026-10-15')
  await expect(bar).not.toHaveAttribute('data-preview-date', /.+/u)
  await screenshot(page, 'p113a-date-drag-rollback-desktop')
  await expect(bar).toHaveAttribute('title', /2026-10-15/u)
  expect(api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith(`/records/${item.id}/cells/${date.id}`))).toHaveLength(2)

  for (const status of [400, 500] as const) {
    api.failCellUpdates = 1
    api.failCellUpdateStatus = status
    await drag()
    await expect.poll(() => api.records[0]?.properties[date.id]).toBe('2026-10-15')
    await expect(bar).not.toHaveAttribute('data-preview-date', /.+/u)
    expect(api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith(`/records/${item.id}/cells/${date.id}`))).toHaveLength(status === 400 ? 3 : 4)
  }

  const patchesBeforeNoOps = () => api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith(`/records/${item.id}/cells/${date.id}`)).length
  const beforeNoOps = patchesBeforeNoOps()
  const bounds = await bar.boundingBox()
  if (!bounds) throw new Error('Expected failure test bar to remain visible')
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.up()
  await expect(bar).toHaveAttribute('data-drag-state', 'idle')
  await expect(page.locator('[data-overlay-mode="drawer"]')).toBeVisible()
  await page.getByRole('button', { name: '关闭记录' }).click()

  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dayPixels, y, { steps: 3 })
  await expect(bar).toHaveAttribute('data-drag-state', 'dragging')
  await page.keyboard.press('Escape')
  await expect(bar).toHaveAttribute('data-drag-state', 'idle')
  await page.mouse.up()
  await expect(page.locator('[data-overlay-mode="drawer"]')).toHaveCount(0)

  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dayPixels, y, { steps: 3 })
  await expect(bar).toHaveAttribute('data-drag-state', 'dragging')
  await bar.evaluate(element => element.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 })))
  await expect(bar).toHaveAttribute('data-drag-state', 'idle')
  await page.mouse.up()
  await expect(page.locator('[data-overlay-mode="drawer"]')).toHaveCount(0)
  expect(patchesBeforeNoOps()).toBe(beforeNoOps)

  const clickBar = async () => {
    const clickBounds = await bar.boundingBox()
    if (!clickBounds) throw new Error('Expected the bar to stay visible for click suppression checks')
    await page.mouse.click(clickBounds.x + clickBounds.width / 2, clickBounds.y + clickBounds.height / 2)
  }
  await clickBar()
  await expect(page.locator('[data-overlay-mode="drawer"]')).toBeVisible()
  await page.getByRole('button', { name: '关闭记录' }).click()
  await bar.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-overlay-mode="drawer"]')).toBeVisible()
  await page.getByRole('button', { name: '关闭记录' }).click()

  const scroller = timeline.getByTestId('timeline-scroll')
  const scrollBounds = await bar.boundingBox()
  if (!scrollBounds) throw new Error('Expected bar geometry for the same-task scroll fence')
  const scrollX = scrollBounds.x + scrollBounds.width / 2
  const scrollY = scrollBounds.y + scrollBounds.height / 2
  await page.mouse.move(scrollX, scrollY)
  await page.mouse.down()
  await page.mouse.move(scrollX + dayPixels, scrollY, { steps: 3 })
  await expect(bar).toHaveAttribute('data-drag-state', 'dragging')
  const beforeScrollFence = patchesBeforeNoOps()
  await page.evaluate(() => {
    const timeline = document.querySelector('#database-block-p113a-failure-block [data-testid="database-timeline"]')!
    const scroller = timeline.querySelector<HTMLElement>('[data-testid="timeline-scroll"]')!
    const bar = timeline.querySelector<HTMLElement>('[data-testid="timeline-bar"][data-record-id="p113a-failure-record"]')!
    const bounds = bar.getBoundingClientRect()
    scroller.scrollLeft += 40
    bar.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, button: 0, isPrimary: true, clientX: bounds.x + bounds.width / 2, clientY: bounds.y + bounds.height / 2 }))
  })
  await page.mouse.up()
  await expect(bar).toHaveAttribute('data-drag-state', 'idle')
  expect(patchesBeforeNoOps()).toBe(beforeScrollFence)

  await context.setOffline(true)
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  await expect(bar).toHaveAttribute('data-draggable', 'false')
  const offlineBounds = await bar.boundingBox()
  if (!offlineBounds) throw new Error('Expected offline bar to remain visible')
  await page.mouse.move(offlineBounds.x + 10, offlineBounds.y + 12)
  await page.mouse.down()
  await page.mouse.move(offlineBounds.x + 10 + dayPixels, offlineBounds.y + 12, { steps: 3 })
  await page.mouse.up()
  await expect(bar).toHaveAttribute('data-drag-state', 'idle')
  expect(patchesBeforeNoOps()).toBe(beforeNoOps)
  expect(api.records[0]?.properties[date.id]).toBe('2026-10-15')
})

test('P11.3A drag preserves the open record editor draft and Page/Editor/NodeView identity without opening a second drawer', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.clock.setFixedTime(new Date('2026-10-13T00:00:00.000Z'))
  const date = property('p113a-identity-date', rootDatabase.id, 'Date', 'date')
  const timelineView = view('p113a-identity-view', rootDatabase.id, 'Identity Timeline', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { timeline: {
      scale: 'month', dateSource: { mode: 'date-property', propertyId: date.id },
      frozenTable: { visible: true, visibleProperties: ['root-title', date.id], propertyOrder: ['root-title', date.id] },
    } },
  }, 'timeline')
  const item = record('p113a-identity-record', rootDatabase.id, 'p113a-identity-page', { 'root-title': 'Identity row', [date.id]: '2026-10-13' })
  const api = await installApi(page, [block('p113a-identity-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100)], {
    databases: [rootDatabase], views: [timelineView], properties: [...rootProperties, date], records: [item],
  })
  api.pages.push({ ...pageRecord, id: item.pageId, title: 'Identity row', role: 'database-record' })
  const bodyBlock = block('p113a-identity-body', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'Identity body' }] }, 100)
  bodyBlock.pageId = item.pageId
  api.blocks.push(bodyBlock)
  await page.goto('/#/app/database-workspace/page/database-page')
  const databaseBlock = page.locator('#database-block-p113a-identity-block')
  const timeline = databaseBlock.getByTestId('database-timeline')
  const frozenTitle = databaseBlock.locator(`[data-timeline-frozen-row][data-record-id="${item.id}"] [data-property-id="root-title"] button`)
  await frozenTitle.click()
  const drawer = page.locator('[data-overlay-mode="drawer"]')
  const titleDraft = drawer.getByRole('textbox', { name: '记录标题' })
  await expect(titleDraft).toHaveValue('Identity row')
  await titleDraft.fill('Edited record title')
  await titleDraft.press('Tab')
  await expect.poll(() => api.pages.find(candidate => candidate.id === item.pageId)?.title).toBe('Edited record title')
  const bodyDraft = drawer.locator('.eotion-editor-content .tiptap')
  await expect(bodyDraft).toContainText('Identity body')
  await bodyDraft.fill('Unsaved body draft')
  await expect(bodyDraft).toContainText('Unsaved body draft')
  const bar = timeline.locator(`[data-testid="timeline-bar"][data-record-id="${item.id}"]`)
  await bar.scrollIntoViewIfNeeded()
  await expect(bar).toBeVisible()
  const drawerLeft = await drawer.evaluate(element => element.getBoundingClientRect().left)
  await timeline.getByTestId('timeline-scroll').evaluate((element, drawerLeftEdge) => {
    const scroller = element as HTMLElement
    const bar = scroller.querySelector<HTMLElement>('[data-testid="timeline-bar"][data-record-id="p113a-identity-record"]')!
    const bounds = bar.getBoundingClientRect()
    if (bounds.x + bounds.width / 2 >= drawerLeftEdge - 24) scroller.scrollLeft += bounds.x + bounds.width / 2 - drawerLeftEdge + 96
  }, drawerLeft)
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await page.evaluate(() => {
    const drawer = document.querySelector('[data-overlay-mode="drawer"]')
    const recordEditor = drawer?.querySelector('.eotion-editor') as (Element & { __vueParentComponent?: unknown }) | null
    let host = (drawer as (Element & { __vueParentComponent?: { parent?: any } }) | null)?.__vueParentComponent as ({ parent?: any; type?: { __name?: string; setupState?: any } } | undefined)
    while (host && host.type?.__name !== 'DatabaseRecordHost') host = host.parent
    const getTiptap = (node: Element | null) => {
      const component = (node as (Element & { __vueParentComponent?: { exposed?: { editor?: any } } }) | null)?.__vueParentComponent
      const candidate = component?.exposed?.editor
      const editor = candidate?.view ? candidate : candidate?.value
      return editor?.view ? editor : null
    }
    const record = host?.setupState?.content?.record
    const pageTiptap = getTiptap(document.querySelector('.document-wrap .eotion-editor'))
    const recordTiptap = getTiptap(recordEditor)
    const identity = {
      nodes: [
        document.querySelector('.document-wrap'), document.querySelector('.eotion-editor-content'),
        document.querySelector('#database-block-p113a-identity-block'),
        document.querySelector('#database-block-p113a-identity-block [data-testid="database-timeline"]'),
        drawer, recordEditor,
        document.querySelector('[data-testid="timeline-bar"][data-record-id="p113a-identity-record"]'),
      ],
      components: [
        (document.querySelector('.eotion-editor-content') as Element & { __vueParentComponent?: unknown } | null)?.__vueParentComponent,
        (document.querySelector('#database-block-p113a-identity-block') as Element & { __vueParentComponent?: unknown } | null)?.__vueParentComponent,
        (recordEditor as (Element & { __vueParentComponent?: unknown }) | null)?.__vueParentComponent,
        host,
      ],
      record, pageId: record?.pageId, pageTiptap, recordTiptap,
    }
    if (identity.nodes.some(node => !node) || identity.components.some(component => !component) || !record || !identity.pageId || !pageTiptap?.view || !recordTiptap?.view) throw new Error('Expected Page, Editor, NodeView, Drawer, RecordEditor, RecordHost record/pageId, and Tiptap identities')
    ;(window as Window & { __p113aIdentity?: typeof identity }).__p113aIdentity = identity
  })
  const bounds = await bar.boundingBox()
  if (!bounds) throw new Error('Expected identity Timeline bar geometry')
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-testid="timeline-bar"]')?.getAttribute('data-record-id'), { x, y })).toBe(item.id)
  const dayPixels = pxPerMs('month') * 86_400_000
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dayPixels, y, { steps: 4 })
  await expect(bar).toHaveAttribute('data-drag-state', 'dragging')
  await expect(bar).toHaveAttribute('data-preview-date', '2026-10-14')
  const expectIdentityPreserved = async () => expect.poll(() => page.evaluate(() => {
    const before = (window as Window & { __p113aIdentity?: { nodes: Element[]; components: unknown[]; record: unknown; pageId: unknown; pageTiptap: any; recordTiptap: any } }).__p113aIdentity
    const drawer = document.querySelector('[data-overlay-mode="drawer"]')
    const recordEditor = drawer?.querySelector('.eotion-editor') as (Element & { __vueParentComponent?: unknown }) | null
    let host = (drawer as (Element & { __vueParentComponent?: { parent?: any } }) | null)?.__vueParentComponent as ({ parent?: any; type?: { __name?: string } } | undefined)
    while (host && host.type?.__name !== 'DatabaseRecordHost') host = host.parent
    const getTiptap = (node: Element | null) => {
      const component = (node as (Element & { __vueParentComponent?: { exposed?: { editor?: any } } }) | null)?.__vueParentComponent
      const candidate = component?.exposed?.editor
      const editor = candidate?.view ? candidate : candidate?.value
      return editor?.view ? editor : null
    }
    const record = (host as any)?.setupState?.content?.record
    const currentNodes = [
      document.querySelector('.document-wrap'), document.querySelector('.eotion-editor-content'),
      document.querySelector('#database-block-p113a-identity-block'),
      document.querySelector('#database-block-p113a-identity-block [data-testid="database-timeline"]'),
      drawer, recordEditor,
      document.querySelector('[data-testid="timeline-bar"][data-record-id="p113a-identity-record"]'),
    ]
    const currentComponents = [
      (document.querySelector('.eotion-editor-content') as Element & { __vueParentComponent?: unknown } | null)?.__vueParentComponent,
      (document.querySelector('#database-block-p113a-identity-block') as Element & { __vueParentComponent?: unknown } | null)?.__vueParentComponent,
      recordEditor?.__vueParentComponent, host,
    ]
    return Boolean(before && currentNodes.every((node, index) => node === before.nodes[index])
      && currentComponents.every((component, index) => component === before.components[index])
      && record === before.record && record?.pageId === before.pageId
      && getTiptap(document.querySelector('.document-wrap .eotion-editor')) === before.pageTiptap
      && getTiptap(recordEditor) === before.recordTiptap)
  })).toBe(true)
  await expectIdentityPreserved()
  await expect(titleDraft).toHaveValue('Edited record title')
  await expect(bodyDraft).toContainText('Unsaved body draft')
  expect(api.records[0]?.properties[date.id]).toBe('2026-10-13')
  expect(api.requests.filter(request => request.method === 'PATCH' && request.path.includes('/cells/'))).toHaveLength(0)
  await page.mouse.up()
  await expect(bar).toHaveAttribute('data-drag-state', 'idle')
  await expect.poll(() => api.records[0]?.properties[date.id]).toBe('2026-10-14')
  await expect(databaseBlock.locator(`[data-timeline-frozen-row][data-record-id="${item.id}"] [data-property-id="${date.id}"]`)).toContainText('2026-10-14')
  await expectIdentityPreserved()
  await expect(drawer).toBeVisible()
  await expect(titleDraft).toHaveValue('Edited record title')
  await expect(bodyDraft).toContainText('Unsaved body draft')
  expect(api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith(`/records/${item.id}/cells/${date.id}`))).toHaveLength(1)
  await page.getByRole('button', { name: '关闭记录' }).click()
})

for (const total of [100, 500] as const) {
test(`P11.3A drag preview does not rebuild ${total}-row Timeline projections or mutate unrelated bars`, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.clock.setFixedTime(new Date('2026-10-13T00:00:00.000Z'))
  const date = property('p113a-500-date', rootDatabase.id, 'Date', 'date')
  const timelineView = view(`p113a-${total}-view`, rootDatabase.id, `${total} drag rows`, {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { timeline: {
      scale: 'month', dateSource: { mode: 'date-property', propertyId: date.id },
      frozenTable: { visible: true, visibleProperties: ['root-title', date.id], propertyOrder: ['root-title', date.id] },
    } },
  }, 'timeline')
  const items = Array.from({ length: total }, (_, index) => record(`p113a-${total}-${String(index).padStart(3, '0')}`, rootDatabase.id, `p113a-${total}-page-${index}`, {
    'root-title': `Row ${index}`, [date.id]: '2026-10-13',
  }))
  const api = await installApi(page, [block(`p113a-${total}-block`, 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100)], {
    databases: [rootDatabase], views: [timelineView], properties: [...rootProperties, date], records: items,
  })
  for (const item of items) api.pages.push({ ...pageRecord, id: item.pageId, title: String(item.properties['root-title']), role: 'database-record' })
  await page.goto('/#/app/database-workspace/page/database-page')
  const databaseBlock = page.locator(`#database-block-p113a-${total}-block`)
  const timeline = databaseBlock.getByTestId('database-timeline')
  const projectedCount = () => timeline.evaluate(root => (root as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, any> } }).__vueParentComponent?.setupState?.projectedItems?.length)
  await expect.poll(projectedCount).toBe(25)
  let loaded = 25
  const loadMore = databaseBlock.getByRole('button', { name: '加载更多' })
  while (loaded < total) {
    await expect.poll(() => loadMore.count()).toBe(1)
    await loadMore.click()
    loaded = Math.min(loaded + 25, total)
    await expect.poll(projectedCount).toBe(loaded)
  }
  await expect(loadMore).toHaveCount(0)
  await page.evaluate(() => { (document.querySelector('.document-wrap') as HTMLElement).scrollTop = 0 })
  await expect.poll(() => timeline.locator('[data-row-window-first]').getAttribute('data-row-window-first')).toBe('0')
  const target = timeline.locator(`[data-testid="timeline-bar"][data-record-id="${items[0]!.id}"]`)
  await expect(target).toBeVisible()
  const targetRecordId = await target.getAttribute('data-record-id')
  if (!targetRecordId) throw new Error('Expected visible Timeline bar to identify its record')
  const bounds = await target.boundingBox()
  if (!bounds) throw new Error('Expected first 500-row Timeline bar to be visible')
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  await page.mouse.move(x, y)
  await target.hover()
  const stableBounds = await target.boundingBox()
  if (!stableBounds) throw new Error('Expected the hovered preview bar to remain visible')
  const stableX = stableBounds.x + stableBounds.width / 2
  const stableY = stableBounds.y + stableBounds.height / 2
  await page.mouse.move(stableX, stableY)
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-testid="timeline-bar"]')?.getAttribute('data-record-id'), { x: stableX, y: stableY })).toBe(items[0]!.id)
  await page.mouse.down()
  await expect(target).toHaveAttribute('data-drag-state', 'armed')
  await timeline.evaluate((root, targetRecordId) => {
    const setup = (root as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, any> } }).__vueParentComponent?.setupState
    const bars = [...root.querySelectorAll<HTMLElement>('[data-testid="timeline-bar"]')]
    const otherBars = bars.filter(bar => bar.dataset.recordId !== targetRecordId)
    if (!setup || !Array.isArray(setup.projectedItems) || !(setup.temporalMap instanceof Map) || !Array.isArray(setup.rowGeometry) || !(setup.frozenDisplayMap instanceof Map) || !otherBars.length) throw new Error('Expected complete Timeline projections and multiple mounted bars')
    const mutationState = { count: 0, updatedHooks: 0, activeMutations: 0, activeUpdatedHooks: 0, stableMutations: 0 }
    const otherComponents = otherBars.map(bar => (bar as HTMLElement & { __vueParentComponent?: { u?: Array<() => void> } }).__vueParentComponent)
    if (otherComponents.some(component => !component)) throw new Error('Expected every unrelated bar to expose its Vue instance for update-hook evidence')
    for (const component of otherComponents) component!.u = [...(component!.u ?? []), () => { mutationState.updatedHooks += 1 }]
    const activeBar = bars.find(bar => bar.dataset.recordId === targetRecordId)!
    const activeComponent = (activeBar as HTMLElement & { __vueParentComponent?: { u?: Array<() => void> } }).__vueParentComponent
    if (!activeComponent) throw new Error('Expected active bar Vue instance')
    activeComponent.u = [...(activeComponent.u ?? []), () => { mutationState.activeUpdatedHooks += 1 }]
    const rulerTicks = [...root.querySelectorAll<HTMLElement>('.eotion-timeline-ruler-tick')]
    const frozenRows = [...root.querySelectorAll<HTMLElement>('[data-timeline-frozen-row]')]
    if (!rulerTicks.length || !frozenRows.length) throw new Error('Expected mounted ruler ticks and Frozen rows')
    const observer = new MutationObserver(mutations => { mutationState.count += mutations.length })
    for (const bar of otherBars) observer.observe(bar, { attributes: true, childList: true, subtree: true, characterData: true })
    const activeObserver = new MutationObserver(mutations => { mutationState.activeMutations += mutations.length })
    activeObserver.observe(activeBar, { attributes: true, childList: true, subtree: true, characterData: true })
    const stableObserver = new MutationObserver(mutations => { mutationState.stableMutations += mutations.length })
    for (const node of [...rulerTicks, ...frozenRows]) stableObserver.observe(node, { attributes: true, childList: true, subtree: true, characterData: true })
    ;(window as Window & { __p113aPreviewSnapshot?: Record<string, unknown> }).__p113aPreviewSnapshot = {
      projectedItems: setup.projectedItems, temporalMap: setup.temporalMap, rowGeometry: setup.rowGeometry,
      frozenDisplayMap: setup.frozenDisplayMap, otherBars, otherComponents, observer, activeObserver, stableObserver,
      activeBar, rulerTicks, frozenRows, mutationState,
    }
  }, targetRecordId)
  await page.mouse.move(stableX + pxPerMs('month') * 86_400_000, stableY, { steps: 4 })
  await expect(target).toHaveAttribute('data-drag-state', 'dragging')
  await expect(target).toHaveAttribute('data-preview-date', '2026-10-14')
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())))
  const unchanged = await timeline.evaluate(root => {
    const setup = (root as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, any> } }).__vueParentComponent?.setupState
    const before = (window as Window & { __p113aPreviewSnapshot?: Record<string, any> }).__p113aPreviewSnapshot
    if (!setup || !before) throw new Error('Expected stored 500-row Timeline preview snapshot')
    const mutations = before.observer.takeRecords()
    before.observer.disconnect()
    const activeMutations = before.activeObserver.takeRecords().length + before.mutationState.activeMutations
    before.activeObserver.disconnect()
    const stableMutations = before.stableObserver.takeRecords().length + before.mutationState.stableMutations
    before.stableObserver.disconnect()
    return {
      projectedItems: setup.projectedItems === before.projectedItems,
      temporalMap: setup.temporalMap === before.temporalMap,
      rowGeometry: setup.rowGeometry === before.rowGeometry,
      frozenDisplayMap: setup.frozenDisplayMap === before.frozenDisplayMap,
      unrelatedBarMutations: mutations.length + before.mutationState.count,
      unrelatedBarUpdatedHooks: before.mutationState.updatedHooks,
      unrelatedBarComponentsSame: before.otherBars.every((bar: HTMLElement, index: number) => bar.__vueParentComponent === before.otherComponents[index]),
      activeBarMutations: activeMutations,
      activeBarUpdatedHooks: before.mutationState.activeUpdatedHooks,
      rulerTicksSame: [...root.querySelectorAll('.eotion-timeline-ruler-tick')].every((node, index) => node === before.rulerTicks[index]) && root.querySelectorAll('.eotion-timeline-ruler-tick').length === before.rulerTicks.length,
      frozenRowsSame: [...root.querySelectorAll('[data-timeline-frozen-row]')].every((node, index) => node === before.frozenRows[index]) && root.querySelectorAll('[data-timeline-frozen-row]').length === before.frozenRows.length,
      rulerAndFrozenMutations: stableMutations,
    }
  })
  expect(unchanged).toMatchObject({ projectedItems: true, temporalMap: true, rowGeometry: true, frozenDisplayMap: true, unrelatedBarMutations: 0, unrelatedBarUpdatedHooks: 0, unrelatedBarComponentsSame: true, rulerTicksSame: true, frozenRowsSame: true, rulerAndFrozenMutations: 0 })
  expect(unchanged.activeBarMutations).toBeGreaterThan(0)
  expect(unchanged.activeBarUpdatedHooks).toBeGreaterThan(0)
  console.log(`P11.3D ${total} drag preview evidence: ${JSON.stringify(unchanged)}`)
  expect(api.requests.filter(request => request.method === 'PATCH' && request.path.includes('/cells/'))).toHaveLength(0)
  expect(api.records.find(item => item.id === targetRecordId)?.properties[date.id]).toBe('2026-10-13')
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(target).toHaveAttribute('data-drag-state', 'idle')
})
}

test('P11.3B datetime resize snaps from the dragged endpoint on every scale and preserves timezone and milliseconds', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.clock.setFixedTime(new Date('2026-10-13T00:00:00.000Z'))
  const scales = ['hour', 'day', 'week', 'biweek', 'month', 'quarter', 'year'] as const
  const dateProperties = scales.map(scale => property(`p113b-${scale}-date`, rootDatabase.id, `${scale} Date`, 'date'))
  const timelineViews = scales.map((scale, index) => view(`p113b-${scale}-view`, rootDatabase.id, `${scale} resize`, {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { timeline: { scale, dateSource: { mode: 'date-property', propertyId: dateProperties[index]!.id } } },
  }, 'timeline'))
  const items = scales.map((scale, index) => record(`p113b-${scale}-record`, rootDatabase.id, `p113b-${scale}-page`, {
    'root-title': `${scale} datetime`, [dateProperties[index]!.id]: { start: '2026-10-13T10:15:30.123Z', end: '2026-10-13T10:30:30.123Z', timeZone: 'America/New_York' },
  }))
  items.push(record('p113b-zero-datetime', rootDatabase.id, 'p113b-zero-datetime-page', {
    'root-title': 'Zero duration datetime', [dateProperties[1]!.id]: { start: '2026-10-13T10:15:30.123Z', end: '2026-10-13T10:15:30.123Z', timeZone: 'America/New_York' },
  }))
  const blocks = scales.map((scale, index) => block(`p113b-${scale}-block`, 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineViews[index]!.id } }, 100 + index * 100))
  const api = await installApi(page, blocks, { databases: [rootDatabase], views: timelineViews, properties: [...rootProperties, ...dateProperties], records: items })
  for (const item of items) api.pages.push({ ...pageRecord, id: item.pageId, title: String(item.properties['root-title']), role: 'database-record' })
  await page.goto('/#/app/database-workspace/page/database-page')
  for (let index = 0; index < scales.length; index += 1) {
    const scale = scales[index]!
    const date = dateProperties[index]!
    const item = items[index]!
    const canonical = api.records.find(candidate => candidate.id === item.id)!
    await page.locator(`#database-block-p113b-${scale}-block`).scrollIntoViewIfNeeded()
    const timeScroller = page.locator(`#database-block-p113b-${scale}-block [data-testid="timeline-scroll"]`)
    if (scale === 'hour') await timeScroller.evaluate(element => { (element as HTMLElement).scrollLeft += 600 })
    const bar = page.locator(`#database-block-p113b-${scale}-block [data-testid="timeline-bar"][data-record-id="${item.id}"]`)
    const original = item.properties[date.id] as { start: string; end: string; timeZone: string }
    const firstEndDelta = p113bSnapDeltaMs(original.end, scale)
    const afterRight = { ...original, end: new Date(Date.parse(original.end) + firstEndDelta).toISOString() }
    const beforeRightPatchCount = api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith(`/records/${item.id}/cells/${date.id}`)).length
    await p113bResize(page, bar, page.locator(`#database-block-p113b-${scale}-block [data-testid="timeline-resize-end"][data-record-id="${item.id}"]`), scale, original.end)
    await expect.poll(() => canonical.properties[date.id]).toEqual(afterRight)
    expect(api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith(`/records/${item.id}/cells/${date.id}`))).toHaveLength(beforeRightPatchCount + 1)
    const startDelta = p113bSnapDeltaMs(original.start, scale, -1)
    const afterLeft = { ...afterRight, start: new Date(Date.parse(original.start) + startDelta).toISOString() }
    const beforeLeftPatchCount = api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith(`/records/${item.id}/cells/${date.id}`)).length
    await p113bResize(page, bar, page.locator(`#database-block-p113b-${scale}-block [data-testid="timeline-resize-start"][data-record-id="${item.id}"]`), scale, original.start, -1)
    await expect.poll(() => canonical.properties[date.id]).toEqual(afterLeft)
    expect(api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith(`/records/${item.id}/cells/${date.id}`))).toHaveLength(beforeLeftPatchCount + 1)
    expect(canonical.properties[date.id]).toMatchObject({ timeZone: 'America/New_York' })
    expect(Date.parse((canonical.properties[date.id] as { start: string }).start) % 1000).toBe(123)
    expect(Date.parse((canonical.properties[date.id] as { end: string }).end) % 1000).toBe(123)
  }
  const zero = api.records.find(candidate => candidate.id === 'p113b-zero-datetime')!
  const zeroDate = dateProperties[1]!
  const zeroBar = page.locator('#database-block-p113b-day-block [data-testid="timeline-bar"][data-record-id="p113b-zero-datetime"]')
  const zeroStartHandle = page.locator('#database-block-p113b-day-block [data-testid="timeline-resize-start"][data-record-id="p113b-zero-datetime"]')
  const zeroEndHandle = page.locator('#database-block-p113b-day-block [data-testid="timeline-resize-end"][data-record-id="p113b-zero-datetime"]')
  const zeroPatchCount = () => api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith(`/records/${zero.id}/cells/${zeroDate.id}`)).length
  const beforeClamp = zeroPatchCount()
  await zeroBar.scrollIntoViewIfNeeded()
  const zeroScroller = page.locator('#database-block-p113b-day-block [data-testid="timeline-scroll"]')
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const marker = await zeroBar.boundingBox()
    const viewport = await zeroScroller.boundingBox()
    if (!marker || !viewport) throw new Error('Expected zero-duration marker and native Timeline viewport during edge alignment')
    const shift = marker.x - viewport.x
    if (Math.abs(shift) < 0.5) break
    await zeroScroller.evaluate((element, delta) => { (element as HTMLElement).scrollLeft += delta }, shift)
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  }
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  const markerAtEdge = await zeroBar.boundingBox()
  const startHandleAtEdge = await zeroStartHandle.boundingBox()
  const endHandleAtEdge = await zeroEndHandle.boundingBox()
  const edgeViewport = await zeroScroller.boundingBox()
  if (!markerAtEdge || !startHandleAtEdge || !endHandleAtEdge || !edgeViewport) throw new Error('Expected zero-duration marker and resize handles after native-scroll alignment')
  const markerBodyPoint = { x: markerAtEdge.x + 6, y: markerAtEdge.y + markerAtEdge.height / 2 }
  const startHandlePoint = { x: startHandleAtEdge.x + startHandleAtEdge.width / 2, y: startHandleAtEdge.y + startHandleAtEdge.height / 2 }
  expect(Math.abs(markerAtEdge.x - edgeViewport.x)).toBeLessThanOrEqual(2)
  expect(Math.abs(startHandlePoint.x - (edgeViewport.x + 6))).toBeLessThanOrEqual(2)
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-testid="timeline-bar"]')?.getAttribute('data-record-id'), markerBodyPoint)).toBe(zero.id)
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-testid="timeline-resize-start"]')?.getAttribute('data-record-id'), startHandlePoint)).toBe(zero.id)
  await page.mouse.click(markerBodyPoint.x, markerBodyPoint.y)
  const markerDrawer = page.locator('[data-overlay-mode="drawer"]')
  await expect(markerDrawer).toBeVisible()
  expect(zeroPatchCount()).toBe(beforeClamp)
  await page.keyboard.press('Escape')
  await expect(markerDrawer).toBeHidden()
  await p113bResize(page, zeroBar, zeroStartHandle, 'day', '2026-10-13T10:15:30.123Z')
  await expect.poll(() => zero.properties[zeroDate.id]).toEqual({ start: '2026-10-13T10:15:30.123Z', end: '2026-10-13T10:15:30.123Z', timeZone: 'America/New_York' })
  expect(zeroPatchCount()).toBe(beforeClamp)
  await expect(zeroBar).toHaveAttribute('data-drag-state', 'idle')
  await p113bResize(page, zeroBar, zeroStartHandle, 'day', '2026-10-13T10:15:30.123Z', -1)
  await expect.poll(() => zero.properties[zeroDate.id]).toEqual({ start: '2026-10-13T09:15:30.123Z', end: '2026-10-13T10:15:30.123Z', timeZone: 'America/New_York' })
  expect(zeroPatchCount()).toBe(beforeClamp + 1)
})

test('P11.3B 409, 400, and 500 resize failures restore canonical endpoints with one request and no retry', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.clock.setFixedTime(new Date('2026-10-13T00:00:00.000Z'))
  const date = property('p113b-failure-date', rootDatabase.id, 'Date', 'date')
  const timelineView = view('p113b-failure-view', rootDatabase.id, 'Resize failures', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { timeline: { scale: 'month', dateSource: { mode: 'date-property', propertyId: date.id } } },
  }, 'timeline')
  const item = record('p113b-failure-record', rootDatabase.id, 'p113b-failure-page', { 'root-title': 'Failure range', [date.id]: { start: '2026-10-13', end: '2026-10-15' } })
  const api = await installApi(page, [block('p113b-failure-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100)], {
    databases: [rootDatabase], views: [timelineView], properties: [...rootProperties, date], records: [item],
  })
  api.pages.push({ ...pageRecord, id: item.pageId, title: 'Failure range', role: 'database-record' })
  await page.goto('/#/app/database-workspace/page/database-page')
  const bar = page.locator('#database-block-p113b-failure-block [data-testid="timeline-bar"][data-record-id="p113b-failure-record"]')
  const handle = page.locator('#database-block-p113b-failure-block [data-testid="timeline-resize-end"][data-record-id="p113b-failure-record"]')
  const requestsForCell = () => api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith(`/records/${item.id}/cells/${date.id}`))
  api.conflictCellUpdates = 1
  api.conflictCellUpdateValue = { start: '2026-10-13', end: '2026-10-18' }
  const beforeConflict = requestsForCell().length
  await p113bResize(page, bar, handle, 'month', '2026-10-15')
  await expect.poll(() => api.records.find(candidate => candidate.id === item.id)?.properties[date.id]).toEqual(api.conflictCellUpdateValue)
  await expect(bar).not.toHaveAttribute('data-preview-date', /.+/u)
  await expect(bar).toHaveAttribute('title', /2026-10-18/u)
  expect(requestsForCell()).toHaveLength(beforeConflict + 1)

  for (const status of [400, 500] as const) {
    const canonicalBefore = structuredClone(api.records.find(candidate => candidate.id === item.id)!.properties[date.id])
    api.failCellUpdates = 1
    api.failCellUpdateStatus = status
    const before = requestsForCell().length
    await p113bResize(page, bar, handle, 'month', '2026-10-18')
    await expect.poll(() => api.records.find(candidate => candidate.id === item.id)?.properties[date.id]).toEqual(canonicalBefore)
    await expect(bar).not.toHaveAttribute('data-preview-date', /.+/u)
    expect(requestsForCell()).toHaveLength(before + 1)
  }
})

test('P11.3B resizing preserves the open Record Host, Drawer, Page Editor, and NodeView identities and drafts', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.clock.setFixedTime(new Date('2026-10-13T00:00:00.000Z'))
  const date = property('p113b-identity-date', rootDatabase.id, 'Date', 'date')
  const timelineView = view('p113b-identity-view', rootDatabase.id, 'Identity resize', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { timeline: { scale: 'month', dateSource: { mode: 'date-property', propertyId: date.id }, frozenTable: { visible: true, visibleProperties: ['root-title', date.id], propertyOrder: ['root-title', date.id] } } },
  }, 'timeline')
  const item = record('p113b-identity-record', rootDatabase.id, 'p113b-identity-page', { 'root-title': 'Identity range', [date.id]: { start: '2026-10-13', end: '2026-10-15' } })
  const api = await installApi(page, [block('p113b-identity-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100)], {
    databases: [rootDatabase], views: [timelineView], properties: [...rootProperties, date], records: [item],
  })
  api.pages.push({ ...pageRecord, id: item.pageId, title: 'Identity range', role: 'database-record' })
  const bodyBlock = block('p113b-identity-body', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'Identity body' }] }, 200)
  bodyBlock.pageId = item.pageId
  api.blocks.push(bodyBlock)
  await page.goto('/#/app/database-workspace/page/database-page')
  const databaseBlock = page.locator('#database-block-p113b-identity-block')
  const timeline = databaseBlock.getByTestId('database-timeline')
  await databaseBlock.locator(`[data-timeline-frozen-row][data-record-id="${item.id}"] [data-property-id="root-title"] button`).click()
  const drawer = page.locator('[data-overlay-mode="drawer"]')
  const titleDraft = drawer.getByRole('textbox', { name: '记录标题' })
  await expect(titleDraft).toHaveValue('Identity range')
  const bodyDraft = drawer.locator('.eotion-editor-content .tiptap')
  await expect(bodyDraft).toContainText('Identity body')
  await bodyDraft.fill('Unsaved resize draft')
  const bar = timeline.locator(`[data-testid="timeline-bar"][data-record-id="${item.id}"]`)
  await bar.scrollIntoViewIfNeeded()
  const drawerLeft = await drawer.evaluate(element => element.getBoundingClientRect().left)
  await timeline.getByTestId('timeline-scroll').evaluate((element, left) => {
    const scroller = element as HTMLElement
    const handle = element.closest('[data-testid="database-timeline"]')?.querySelector<HTMLElement>('[data-testid="timeline-resize-end"][data-record-id="p113b-identity-record"]')!
    const bounds = handle.getBoundingClientRect()
    if (bounds.x + bounds.width / 2 >= left - 24) scroller.scrollLeft += bounds.x + bounds.width / 2 - left + 96
  }, drawerLeft)
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await page.evaluate(() => {
    const drawer = document.querySelector('[data-overlay-mode="drawer"]') as (Element & { __vueParentComponent?: { parent?: any } }) | null
    const recordEditor = drawer?.querySelector('.eotion-editor') as (Element & { __vueParentComponent?: unknown }) | null
    let host = drawer?.__vueParentComponent as ({ parent?: any; type?: { __name?: string; setupState?: any } } | undefined)
    while (host && host.type?.__name !== 'DatabaseRecordHost') host = host.parent
    const getTiptap = (node: Element | null) => {
      const candidate = (node as (Element & { __vueParentComponent?: { exposed?: { editor?: any } } }) | null)?.__vueParentComponent?.exposed?.editor
      const editor = candidate?.view ? candidate : candidate?.value
      return editor?.view ? editor : null
    }
    const record = host?.setupState?.content?.record
    const nodes = [document.querySelector('.document-wrap'), document.querySelector('.eotion-editor-content'), document.querySelector('#database-block-p113b-identity-block'), document.querySelector('#database-block-p113b-identity-block [data-testid="database-timeline"]'), document.querySelector('[data-testid="timeline-frozen-table"]'), drawer, recordEditor, document.querySelector('[data-testid="timeline-bar"][data-record-id="p113b-identity-record"]')]
    const components = nodes.map(node => (node as (Element & { __vueParentComponent?: unknown }) | null)?.__vueParentComponent)
    const pageTiptap = getTiptap(document.querySelector('.document-wrap .eotion-editor'))
    const recordTiptap = getTiptap(recordEditor)
    if (nodes.some(node => !node) || components.some(component => !component) || !record || !record.pageId || !pageTiptap || !recordTiptap) throw new Error('Expected Page, Editor, NodeView, Frozen Table, Drawer, Record Host, record, and Tiptap identities')
    ;(window as Window & { __p113bIdentity?: unknown }).__p113bIdentity = { nodes, components, host, record, pageId: record.pageId, pageTiptap, recordTiptap }
  })
  const handle = page.locator('#database-block-p113b-identity-block [data-testid="timeline-resize-end"][data-record-id="p113b-identity-record"]')
  const bounds = await handle.boundingBox()
  if (!bounds) throw new Error('Expected identity resize handle to be visible beside the open Drawer')
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  const deltaX = pxPerMs('month') * 86_400_000
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + deltaX, y, { steps: 4 })
  await expect(bar).toHaveAttribute('data-drag-state', 'dragging')
  expect(api.requests.filter(request => request.method === 'PATCH' && request.path.includes('/cells/'))).toHaveLength(0)
  const preservesIdentity = () => page.evaluate(() => {
    const before = (window as Window & { __p113bIdentity?: any }).__p113bIdentity
    const drawer = document.querySelector('[data-overlay-mode="drawer"]') as (Element & { __vueParentComponent?: { parent?: any } }) | null
    const recordEditor = drawer?.querySelector('.eotion-editor') as (Element & { __vueParentComponent?: unknown }) | null
    let host = drawer?.__vueParentComponent as ({ parent?: any; type?: { __name?: string } } | undefined)
    while (host && host.type?.__name !== 'DatabaseRecordHost') host = host.parent
    const nodes = [document.querySelector('.document-wrap'), document.querySelector('.eotion-editor-content'), document.querySelector('#database-block-p113b-identity-block'), document.querySelector('#database-block-p113b-identity-block [data-testid="database-timeline"]'), document.querySelector('[data-testid="timeline-frozen-table"]'), drawer, recordEditor, document.querySelector('[data-testid="timeline-bar"][data-record-id="p113b-identity-record"]')]
    const components = nodes.map(node => (node as (Element & { __vueParentComponent?: unknown }) | null)?.__vueParentComponent)
    const getTiptap = (node: Element | null) => {
      const candidate = (node as (Element & { __vueParentComponent?: { exposed?: { editor?: any } } }) | null)?.__vueParentComponent?.exposed?.editor
      const editor = candidate?.view ? candidate : candidate?.value
      return editor?.view ? editor : null
    }
    let currentHost = host
    return Boolean(before && nodes.every((node, index) => node === before.nodes[index]) && components.every((component, index) => component === before.components[index])
      && currentHost === before.host && currentHost?.setupState?.content?.record === before.record && before.record.pageId === before.pageId
      && getTiptap(document.querySelector('.document-wrap .eotion-editor')) === before.pageTiptap && getTiptap(recordEditor) === before.recordTiptap)
  })
  await expect.poll(preservesIdentity).toBe(true)
  await expect(bodyDraft).toContainText('Unsaved resize draft')
  await page.mouse.up()
  await expect.poll(() => api.records.find(candidate => candidate.id === item.id)?.properties[date.id]).toEqual({ start: '2026-10-13', end: '2026-10-16' })
  await expect.poll(preservesIdentity).toBe(true)
  await expect(drawer).toBeVisible()
  await expect(bodyDraft).toContainText('Unsaved resize draft')
  await expect(databaseBlock.locator(`[data-timeline-frozen-row][data-record-id="${item.id}"] [data-property-id="${date.id}"]`)).toContainText('2026-10-13 → 2026-10-16')
  expect(api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith(`/records/${item.id}/cells/${date.id}`))).toHaveLength(1)
})

for (const total of [100, 500] as const) {
  test(`P11.3B resize preview preserves ${total}-row projections and leaves unrelated bars untouched`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.clock.setFixedTime(new Date('2026-10-13T00:00:00.000Z'))
    const date = property(`p113b-${total}-date`, rootDatabase.id, 'Date', 'date')
    const timelineView = view(`p113b-${total}-view`, rootDatabase.id, `${total} resize rows`, {
      ...DEFAULT_DATABASE_VIEW_CONFIG,
      options: { timeline: { scale: 'month', dateSource: { mode: 'date-property', propertyId: date.id }, frozenTable: { visible: true, visibleProperties: ['root-title', date.id], propertyOrder: ['root-title', date.id] } } },
    }, 'timeline')
    const items = Array.from({ length: total }, (_, index) => record(`p113b-${total}-${String(index).padStart(3, '0')}`, rootDatabase.id, `p113b-${total}-page-${index}`, {
      'root-title': `Resize row ${index}`, [date.id]: '2026-10-13',
    }))
    const api = await installApi(page, [block(`p113b-${total}-block`, 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100)], {
      databases: [rootDatabase], views: [timelineView], properties: [...rootProperties, date], records: items,
    })
    for (const item of items) api.pages.push({ ...pageRecord, id: item.pageId, title: String(item.properties['root-title']), role: 'database-record' })
    await page.goto('/#/app/database-workspace/page/database-page')
    const databaseBlock = page.locator(`#database-block-p113b-${total}-block`)
    const timeline = databaseBlock.getByTestId('database-timeline')
    const projectedCount = () => timeline.evaluate(root => (root as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, any> } }).__vueParentComponent?.setupState?.projectedItems?.length)
    await expect.poll(projectedCount).toBe(25)
    let loaded = 25
    const loadMore = databaseBlock.getByRole('button', { name: '加载更多' })
    while (loaded < total) {
      await expect(loadMore).toHaveCount(1)
      await loadMore.click()
      loaded = Math.min(loaded + 25, total)
      await expect.poll(projectedCount).toBe(loaded)
    }
    await expect(loadMore).toHaveCount(0)
    await page.evaluate(() => { (document.querySelector('.document-wrap') as HTMLElement).scrollTop = 0 })
    await expect.poll(() => timeline.locator('[data-row-window-first]').getAttribute('data-row-window-first')).toBe('0')
    const target = timeline.locator(`[data-testid="timeline-bar"][data-record-id="${items[0]!.id}"]`)
    await expect(target).toBeVisible()
    await target.scrollIntoViewIfNeeded()
    const handle = timeline.locator(`[data-testid="timeline-resize-end"][data-record-id="${items[0]!.id}"]`)
    const bounds = await handle.boundingBox()
    if (!bounds) throw new Error(`Expected visible ${total}-row resize handle`)
    const x = bounds.x + bounds.width / 2
    const y = bounds.y + bounds.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await expect(target).toHaveAttribute('data-drag-state', 'armed')
    await timeline.evaluate((root, id) => {
      const setup = (root as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, any> } }).__vueParentComponent?.setupState
      const bars = [...root.querySelectorAll<HTMLElement>('[data-testid="timeline-bar"]')]
      const otherBars = bars.filter(bar => bar.dataset.recordId !== id)
      if (!setup || !Array.isArray(setup.projectedItems) || !(setup.temporalMap instanceof Map) || !Array.isArray(setup.rowGeometry) || !(setup.frozenDisplayMap instanceof Map) || !otherBars.length) throw new Error('Expected Timeline projections, Frozen Table projection, and unrelated mounted bars')
      const state = { mutations: 0, updated: 0, activeMutations: 0, activeUpdated: 0, stableMutations: 0 }
      const components = otherBars.map(bar => (bar as HTMLElement & { __vueParentComponent?: { u?: Array<() => void> } }).__vueParentComponent)
      if (components.some(component => !component)) throw new Error('Expected unrelated bar Vue instances for updated-hook evidence')
      for (const component of components) component!.u = [...(component!.u ?? []), () => { state.updated += 1 }]
      const activeBar = bars.find(bar => bar.dataset.recordId === id)!
      const activeComponent = (activeBar as HTMLElement & { __vueParentComponent?: { u?: Array<() => void> } }).__vueParentComponent
      if (!activeComponent) throw new Error('Expected active bar Vue instance')
      activeComponent.u = [...(activeComponent.u ?? []), () => { state.activeUpdated += 1 }]
      const rulerTicks = [...root.querySelectorAll<HTMLElement>('.eotion-timeline-ruler-tick')]
      const frozenRows = [...root.querySelectorAll<HTMLElement>('[data-timeline-frozen-row]')]
      if (!rulerTicks.length || !frozenRows.length) throw new Error('Expected mounted ruler ticks and Frozen rows')
      const observer = new MutationObserver(records => { state.mutations += records.length })
      for (const bar of otherBars) observer.observe(bar, { attributes: true, childList: true, subtree: true, characterData: true })
      const activeObserver = new MutationObserver(records => { state.activeMutations += records.length })
      activeObserver.observe(activeBar, { attributes: true, childList: true, subtree: true, characterData: true })
      const stableObserver = new MutationObserver(records => { state.stableMutations += records.length })
      for (const node of [...rulerTicks, ...frozenRows]) stableObserver.observe(node, { attributes: true, childList: true, subtree: true, characterData: true })
      ;(window as Window & { __p113bPerformance?: Record<string, unknown> }).__p113bPerformance = {
        projectedItems: setup.projectedItems, temporalMap: setup.temporalMap, rowGeometry: setup.rowGeometry,
        frozenDisplayMap: setup.frozenDisplayMap, otherBars, components, observer, activeObserver, stableObserver,
        activeBar, rulerTicks, frozenRows, state,
      }
    }, items[0]!.id)
    await page.mouse.move(x + pxPerMs('month') * 86_400_000, y, { steps: 4 })
    await expect(target).toHaveAttribute('data-drag-state', 'dragging')
    await expect(target).toHaveAttribute('data-preview-date', /2026-10-13/u)
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())))
    const evidence = await timeline.evaluate(root => {
      const setup = (root as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, any> } }).__vueParentComponent?.setupState
      const before = (window as Window & { __p113bPerformance?: Record<string, any> }).__p113bPerformance
      if (!setup || !before) throw new Error('Expected captured P11.3B resize preview evidence')
      const mutationCount = before.observer.takeRecords().length + before.state.mutations
      before.observer.disconnect()
      const activeMutations = before.activeObserver.takeRecords().length + before.state.activeMutations
      before.activeObserver.disconnect()
      const stableMutations = before.stableObserver.takeRecords().length + before.state.stableMutations
      before.stableObserver.disconnect()
      return {
        projectedItems: setup.projectedItems === before.projectedItems,
        temporalMap: setup.temporalMap === before.temporalMap,
        rowGeometry: setup.rowGeometry === before.rowGeometry,
        frozenDisplayMap: setup.frozenDisplayMap === before.frozenDisplayMap,
        unrelatedBarMutations: mutationCount,
        unrelatedBarUpdatedHooks: before.state.updated,
        unrelatedBarComponentsSame: before.otherBars.every((bar: HTMLElement, index: number) => bar.__vueParentComponent === before.components[index]),
        activeBarMutations: activeMutations,
        activeBarUpdatedHooks: before.state.activeUpdated,
        rulerTicksSame: [...root.querySelectorAll('.eotion-timeline-ruler-tick')].every((node, index) => node === before.rulerTicks[index]) && root.querySelectorAll('.eotion-timeline-ruler-tick').length === before.rulerTicks.length,
        frozenRowsSame: [...root.querySelectorAll('[data-timeline-frozen-row]')].every((node, index) => node === before.frozenRows[index]) && root.querySelectorAll('[data-timeline-frozen-row]').length === before.frozenRows.length,
        rulerAndFrozenMutations: stableMutations,
      }
    })
    expect(evidence).toMatchObject({ projectedItems: true, temporalMap: true, rowGeometry: true, frozenDisplayMap: true, unrelatedBarMutations: 0, unrelatedBarUpdatedHooks: 0, unrelatedBarComponentsSame: true, rulerTicksSame: true, frozenRowsSame: true, rulerAndFrozenMutations: 0 })
    expect(evidence.activeBarMutations).toBeGreaterThan(0)
    expect(evidence.activeBarUpdatedHooks).toBeGreaterThan(0)
    console.log(`P11.3D ${total} resize preview evidence: ${JSON.stringify(evidence)}`)
    expect(api.requests.filter(request => request.method === 'PATCH' && request.path.includes('/cells/'))).toHaveLength(0)
    expect(api.records.find(candidate => candidate.id === items[0]!.id)?.properties[date.id]).toBe('2026-10-13')
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await expect(target).toHaveAttribute('data-drag-state', 'idle')
  })
}
test('P11.3C Timeline no-op round trips suppress release clicks while ordinary clicks open Records', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.clock.setFixedTime(new Date('2026-10-13T00:00:00.000Z'))
  const date = property('p113c-noop-date', rootDatabase.id, 'Date', 'date')
  const timelineView = view('p113c-noop-view', rootDatabase.id, 'No-op gestures', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { timeline: { scale: 'month', dateSource: { mode: 'date-property', propertyId: date.id } } },
  }, 'timeline')
  const point = record('p113c-noop-point', rootDatabase.id, 'p113c-noop-point-page', { 'root-title': 'No-op point', [date.id]: '2026-10-13' })
  const range = record('p113c-noop-range', rootDatabase.id, 'p113c-noop-range-page', { 'root-title': 'No-op range', [date.id]: { start: '2026-10-13', end: '2026-10-15' } })
  const api = await installApi(page, [block('p113c-noop-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100)], {
    databases: [rootDatabase], views: [timelineView], properties: [...rootProperties, date], records: [point, range],
  })
  for (const item of [point, range]) api.pages.push({ ...pageRecord, id: item.pageId, title: String(item.properties['root-title']), role: 'database-record' })
  await page.goto('/#/app/database-workspace/page/database-page')
  const timeline = page.locator('#database-block-p113c-noop-block').getByTestId('database-timeline')
  const cellPatches = () => api.requests.filter(request => request.method === 'PATCH' && request.path.includes('/cells/')).length
  const barFor = (id: string) => timeline.locator(`[data-testid="timeline-bar"][data-record-id="${id}"]`)
  const handleFor = (testId: string, id: string) => timeline.locator(`[data-testid="${testId}"][data-record-id="${id}"]`)
  const dayPixels = pxPerMs('month') * 86_400_000

  await expect(barFor(point.id)).toBeVisible()
  const before = cellPatches()

  // A press/release without movement is the existing Record-open affordance.
  await dragTimelineBar(page, barFor(point.id), 0)
  await expect(page.locator('[data-overlay-mode="drawer"]')).toBeVisible()
  await page.getByRole('button', { name: '关闭记录' }).click()
  await expect(page.locator('[data-overlay-mode="drawer"]')).toHaveCount(0)
  expect(cellPatches()).toBe(before)

  // A movement under the shared drag threshold is still a click, never a preview.
  await dragTimelineBar(page, barFor(point.id), 2)
  await expect(barFor(point.id)).not.toHaveAttribute('data-preview-date', /.+/u)
  expect(await barFor(point.id).getAttribute('data-interaction-phase')).toBe('idle')
  await expect(page.locator('[data-overlay-mode="drawer"]')).toBeVisible()
  await page.getByRole('button', { name: '关闭记录' }).click()
  await expect(page.locator('[data-overlay-mode="drawer"]')).toHaveCount(0)
  expect(cellPatches()).toBe(before)
  expect(api.records.find(item => item.id === point.id)?.properties[date.id]).toBe('2026-10-13')

  // A real body drag that snaps back to the canonical point value must not send a PATCH or open a Record.
  const pointBefore = structuredClone(api.records.find(item => item.id === point.id)!)
  const pointBounds = await barFor(point.id).boundingBox()
  if (!pointBounds) throw new Error('Expected the no-op point bar for the round trip')
  const pointX = pointBounds.x + pointBounds.width / 2
  const pointY = pointBounds.y + pointBounds.height / 2
  await page.mouse.move(pointX, pointY)
  await page.mouse.down()
  await page.mouse.move(pointX + dayPixels, pointY, { steps: 4 })
  await expect(barFor(point.id)).toHaveAttribute('data-drag-state', 'dragging')
  await expect(barFor(point.id)).toHaveAttribute('data-interaction-phase', 'previewing')
  await expect(barFor(point.id)).toHaveAttribute('data-preview-date', '2026-10-14')
  await page.mouse.move(pointX, pointY, { steps: 4 })
  await expect(barFor(point.id)).toHaveAttribute('data-preview-date', '2026-10-13')
  await page.mouse.up()
  await expect(barFor(point.id)).toHaveAttribute('data-drag-state', 'idle')
  await expect(barFor(point.id)).toHaveAttribute('data-interaction-phase', 'idle')
  await expect(barFor(point.id)).not.toHaveAttribute('data-preview-date', /.+/u)
  expect(cellPatches()).toBe(before)
  await expect(page.locator('[data-overlay-mode="drawer"]')).toHaveCount(0)
  expect(api.records.find(item => item.id === point.id)).toEqual(pointBefore)

  // The same body round trip preserves the canonical range object and its version.
  const rangeBefore = structuredClone(api.records.find(item => item.id === range.id)!)
  const rangeBounds = await barFor(range.id).boundingBox()
  if (!rangeBounds) throw new Error('Expected the no-op range bar for the round trip')
  const rangeX = rangeBounds.x + rangeBounds.width / 2
  const rangeY = rangeBounds.y + rangeBounds.height / 2
  await page.mouse.move(rangeX, rangeY)
  await page.mouse.down()
  await page.mouse.move(rangeX + dayPixels, rangeY, { steps: 4 })
  await expect(barFor(range.id)).toHaveAttribute('data-drag-state', 'dragging')
  await expect(barFor(range.id)).toHaveAttribute('data-interaction-phase', 'previewing')
  await expect(barFor(range.id)).toHaveAttribute('data-preview-date', '2026-10-14 – 2026-10-16')
  await page.mouse.move(rangeX, rangeY, { steps: 4 })
  await expect(barFor(range.id)).toHaveAttribute('data-preview-date', '2026-10-13 – 2026-10-15')
  await page.mouse.up()
  await expect(barFor(range.id)).toHaveAttribute('data-drag-state', 'idle')
  await expect(barFor(range.id)).toHaveAttribute('data-interaction-phase', 'idle')
  await expect(barFor(range.id)).not.toHaveAttribute('data-preview-date', /.+/u)
  await expect(page.locator('[data-overlay-mode="drawer"]')).toHaveCount(0)
  expect(cellPatches()).toBe(before)
  expect(api.records.find(item => item.id === range.id)).toEqual(rangeBefore)
  await screenshot(page, 'p11-3c-round-trip-noop')

  // Suppressing each release click must not disable the next pointer or keyboard activation.
  await barFor(point.id).click()
  await expect(page.locator('[data-overlay-mode="drawer"]')).toBeVisible()
  await page.getByRole('button', { name: '关闭记录' }).click()
  await expect(page.locator('[data-overlay-mode="drawer"]')).toHaveCount(0)
  await barFor(point.id).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-overlay-mode="drawer"]')).toBeVisible()
  await page.getByRole('button', { name: '关闭记录' }).click()
  await expect(page.locator('[data-overlay-mode="drawer"]')).toHaveCount(0)
  await barFor(range.id).focus()
  await page.keyboard.press('Space')
  await expect(page.locator('[data-overlay-mode="drawer"]')).toBeVisible()
  await page.getByRole('button', { name: '关闭记录' }).click()
  await expect(page.locator('[data-overlay-mode="drawer"]')).toHaveCount(0)
  expect(cellPatches()).toBe(before)

  // Handle interactions never fall through to the bar click handler.
  await dragTimelineBar(page, handleFor('timeline-resize-end', range.id), 0)
  await expect(page.locator('[data-overlay-mode="drawer"]')).toHaveCount(0)
  await dragTimelineBar(page, handleFor('timeline-resize-start', range.id), 0)
  await expect(page.locator('[data-overlay-mode="drawer"]')).toHaveCount(0)
  expect(cellPatches()).toBe(before)

  // Keyboard and modifier activation of a resize handle is still a control action,
  // never a Record open.
  const keyboardHandle = handleFor('timeline-resize-end', range.id)
  await keyboardHandle.focus()
  await expect(keyboardHandle).toBeFocused()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Space')
  await expect(page.locator('[data-overlay-mode="drawer"]')).toHaveCount(0)
  await keyboardHandle.click({ modifiers: ['Control'] })
  await expect(page.locator('[data-overlay-mode="drawer"]')).toHaveCount(0)
  await keyboardHandle.click({ modifiers: ['Meta'] })
  await expect(page.locator('[data-overlay-mode="drawer"]')).toHaveCount(0)
  expect(cellPatches()).toBe(before)
  // The bar still opens the Record, so it must never advertise itself as disabled.
  await expect(barFor(point.id)).not.toHaveAttribute('aria-disabled', /.+/u)
  await expect(barFor(range.id)).not.toHaveAttribute('aria-disabled', /.+/u)

  // A resize dragged out and back to the canonical endpoint sends no PATCH either.
  const rangeEndHandle = handleFor('timeline-resize-end', range.id)
  const endHandleBounds = await rangeEndHandle.boundingBox()
  if (!endHandleBounds) throw new Error('Expected the no-op range end handle')
  const endHandleX = endHandleBounds.x + endHandleBounds.width / 2
  const endHandleY = endHandleBounds.y + endHandleBounds.height / 2
  await page.mouse.move(endHandleX, endHandleY)
  await page.mouse.down()
  await page.mouse.move(endHandleX + dayPixels, endHandleY, { steps: 4 })
  await expect(barFor(range.id)).toHaveAttribute('data-drag-state', 'dragging')
  await page.mouse.move(endHandleX, endHandleY, { steps: 4 })
  await page.mouse.up()
  await expect(barFor(range.id)).toHaveAttribute('data-drag-state', 'idle')
  await expect(barFor(range.id)).not.toHaveAttribute('data-preview-date', /.+/u)
  await expect(page.locator('[data-overlay-mode="drawer"]')).toHaveCount(0)
  expect(cellPatches()).toBe(before)
  expect(api.records.find(item => item.id === range.id)?.properties[date.id]).toEqual({ start: '2026-10-13', end: '2026-10-15' })
})

test('P11.3C Escape and pointercancel cancel previews with zero PATCH and keep focus in the Timeline', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.clock.setFixedTime(new Date('2026-10-13T00:00:00.000Z'))
  const date = property('p113c-cancel-date', rootDatabase.id, 'Date', 'date')
  const timelineView = view('p113c-cancel-view', rootDatabase.id, 'Cancel gestures', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { timeline: { scale: 'month', dateSource: { mode: 'date-property', propertyId: date.id } } },
  }, 'timeline')
  const point = record('p113c-cancel-point', rootDatabase.id, 'p113c-cancel-point-page', { 'root-title': 'Cancel point', [date.id]: '2026-10-13' })
  const range = record('p113c-cancel-range', rootDatabase.id, 'p113c-cancel-range-page', { 'root-title': 'Cancel range', [date.id]: { start: '2026-10-13', end: '2026-10-15' } })
  const api = await installApi(page, [block('p113c-cancel-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100)], {
    databases: [rootDatabase], views: [timelineView], properties: [...rootProperties, date], records: [point, range],
  })
  for (const item of [point, range]) api.pages.push({ ...pageRecord, id: item.pageId, title: String(item.properties['root-title']), role: 'database-record' })
  await page.goto('/#/app/database-workspace/page/database-page')
  const timeline = page.locator('#database-block-p113c-cancel-block').getByTestId('database-timeline')
  const scroller = timeline.getByTestId('timeline-scroll')
  const cellPatches = () => api.requests.filter(request => request.method === 'PATCH' && request.path.includes('/cells/')).length
  const dayPixels = pxPerMs('month') * 86_400_000
  const before = cellPatches()

  const bar = timeline.locator(`[data-testid="timeline-bar"][data-record-id="${point.id}"]`)
  const barBounds = await bar.boundingBox()
  if (!barBounds) throw new Error('Expected the cancel point bar')
  const barX = barBounds.x + barBounds.width / 2
  const barY = barBounds.y + barBounds.height / 2
  await page.mouse.move(barX, barY)
  await page.mouse.down()
  await page.mouse.move(barX + dayPixels, barY, { steps: 4 })
  await expect(bar).toHaveAttribute('data-drag-state', 'dragging')
  await expect(bar).toHaveAttribute('data-interaction-phase', 'previewing')
  await page.keyboard.press('Escape')
  await expect(bar).toHaveAttribute('data-drag-state', 'idle')
  await expect(bar).toHaveAttribute('data-interaction-phase', 'idle')
  await expect(bar).not.toHaveAttribute('data-preview-date', /.+/u)
  expect(cellPatches()).toBe(before)
  await page.mouse.up()
  expect(cellPatches()).toBe(before)
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-record-id'))).toBe(point.id)
  await closeTimelineDrawer(page)
  await dragTimelineBar(page, bar, dayPixels)
  await expect.poll(() => cellPatches()).toBe(before + 1)
  await expect.poll(() => api.records.find(item => item.id === point.id)?.properties[date.id]).toBe('2026-10-14')

  const rangeBar = timeline.locator(`[data-testid="timeline-bar"][data-record-id="${range.id}"]`)
  const startHandle = timeline.locator(`[data-testid="timeline-resize-start"][data-record-id="${range.id}"]`)
  const handleBounds = await startHandle.boundingBox()
  if (!handleBounds) throw new Error('Expected the cancel range start handle')
  const handleX = handleBounds.x + handleBounds.width / 2
  const handleY = handleBounds.y + handleBounds.height / 2
  const beforeResizeEscape = cellPatches()
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await expect(page.locator('body')).toBeFocused()
  await page.mouse.move(handleX, handleY)
  await page.mouse.down()
  await page.mouse.move(handleX - dayPixels, handleY, { steps: 4 })
  await expect(rangeBar).toHaveAttribute('data-drag-state', 'dragging')
  await expect(startHandle).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(rangeBar).toHaveAttribute('data-drag-state', 'idle')
  await expect(startHandle).toBeFocused()
  await page.mouse.up()
  expect(cellPatches()).toBe(beforeResizeEscape)
  expect(api.records.find(item => item.id === range.id)?.properties[date.id]).toEqual({ start: '2026-10-13', end: '2026-10-15' })
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[data-testid="timeline-bar"], [data-testid^="timeline-resize-"]')))).toBe(true)

  const endHandle = timeline.locator(`[data-testid="timeline-resize-end"][data-record-id="${range.id}"]`)
  const endBounds = await endHandle.boundingBox()
  if (!endBounds) throw new Error('Expected the cancel range end handle')
  const endX = endBounds.x + endBounds.width / 2
  const endY = endBounds.y + endBounds.height / 2
  await page.mouse.move(endX, endY)
  await page.mouse.down()
  await page.mouse.move(endX + dayPixels, endY, { steps: 4 })
  await expect(rangeBar).toHaveAttribute('data-drag-state', 'dragging')
  await endHandle.evaluate(element => {
    const scrollerElement = document.querySelector('#database-block-p113c-cancel-block [data-testid="timeline-scroll"]')!
    scrollerElement.scrollLeft += 24
    element.dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 1 }))
  })
  await expect(rangeBar).toHaveAttribute('data-drag-state', 'idle')
  await expect(rangeBar).toHaveAttribute('data-interaction-phase', 'idle')
  await expect(rangeBar).not.toHaveAttribute('data-preview-date', /.+/u)
  await expect(scroller).toBeVisible()
  expect(cellPatches()).toBe(beforeResizeEscape)
  await page.mouse.up()
  expect(cellPatches()).toBe(beforeResizeEscape)

  const rangeBarBounds = await rangeBar.boundingBox()
  if (!rangeBarBounds) throw new Error('Expected the cancel range bar')
  const rangeBarX = rangeBarBounds.x + rangeBarBounds.width / 2
  const rangeBarY = rangeBarBounds.y + rangeBarBounds.height / 2
  await rangeBar.evaluate(element => {
    let pointerId: number | null = null
    element.addEventListener('pointerdown', event => { pointerId = event.pointerId }, { once: true })
    element.addEventListener('review-release-pointer-capture', () => {
      if (pointerId !== null && element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId)
    }, { once: true })
  })
  await page.mouse.move(rangeBarX, rangeBarY)
  await page.mouse.down()
  await page.mouse.move(rangeBarX + dayPixels, rangeBarY, { steps: 4 })
  await expect(rangeBar).toHaveAttribute('data-drag-state', 'dragging')
  await rangeBar.evaluate(element => element.dispatchEvent(new Event('review-release-pointer-capture')))
  await page.mouse.move(rangeBarX + dayPixels + 1, rangeBarY)
  await expect(rangeBar).toHaveAttribute('data-drag-state', 'idle')
  await expect(rangeBar).toHaveAttribute('data-interaction-phase', 'idle')
  await rangeBar.evaluate(element => {
    element.addEventListener('click', event => {
      element.dataset.testClickDefaultPrevented = String(event.defaultPrevented)
    }, { once: true })
  })
  await page.mouse.move(rangeBarX, rangeBarY)
  await page.mouse.up()
  await expect(rangeBar).toHaveAttribute('data-test-click-default-prevented', 'true')
  await rangeBar.evaluate(element => { delete element.dataset.testClickDefaultPrevented })
  expect(cellPatches()).toBe(beforeResizeEscape)
  await expect(page.locator('[data-overlay-mode="drawer"]')).toHaveCount(0)
  expect(api.records.find(item => item.id === range.id)?.properties[date.id]).toEqual({ start: '2026-10-13', end: '2026-10-15' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  expect(api.records.find(item => item.id === range.id)?.properties[date.id]).toEqual({ start: '2026-10-13', end: '2026-10-15' })
  await expect(page.locator('[data-overlay-mode="drawer"]')).toHaveCount(0)
  expect(api.requests.filter(request => request.method === 'PATCH' && request.path.includes('/cells/'))).toHaveLength(before + 1)

  for (const cancellation of ['blur', 'hidden'] as const) {
    const bounds = await rangeBar.boundingBox()
    if (!bounds) throw new Error(`Expected range bar before ${cancellation} cancellation`)
    const x = bounds.x + bounds.width / 2
    const y = bounds.y + bounds.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + dayPixels, y, { steps: 4 })
    await expect(rangeBar).toHaveAttribute('data-interaction-phase', 'previewing')
    if (cancellation === 'blur') {
      await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    } else {
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
        document.dispatchEvent(new Event('visibilitychange'))
        Reflect.deleteProperty(document, 'visibilityState')
      })
    }
    await expect(rangeBar).toHaveAttribute('data-interaction-phase', 'idle')
    await expect(rangeBar).not.toHaveAttribute('data-preview-date', /.+/u)
    await page.mouse.up()
    await expect(page.locator('[data-overlay-mode="drawer"]')).toHaveCount(0)
    expect(cellPatches()).toBe(before + 1)
    expect(api.records.find(item => item.id === range.id)?.properties[date.id]).toEqual({ start: '2026-10-13', end: '2026-10-15' })
  }
})

test('P11.3C pending mutation shows a quiet saving state, blocks the same record, and leaves other records interactive', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.clock.setFixedTime(new Date('2026-10-13T00:00:00.000Z'))
  const date = property('p113c-pending-date', rootDatabase.id, 'Date', 'date')
  const timelineView = view('p113c-pending-view', rootDatabase.id, 'Pending gestures', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { timeline: { scale: 'month', dateSource: { mode: 'date-property', propertyId: date.id } } },
  }, 'timeline')
  const first = record('p113c-pending-first', rootDatabase.id, 'p113c-pending-first-page', { 'root-title': 'Pending first', [date.id]: '2026-10-13' })
  const second = record('p113c-pending-second', rootDatabase.id, 'p113c-pending-second-page', { 'root-title': 'Pending second', [date.id]: '2026-10-20' })
  const range = record('p113c-pending-range', rootDatabase.id, 'p113c-pending-range-page', { 'root-title': 'Pending range', [date.id]: { start: '2026-10-13', end: '2026-10-15' } })
  const api = await installApi(page, [block('p113c-pending-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100)], {
    databases: [rootDatabase], views: [timelineView], properties: [...rootProperties, date], records: [first, second, range], holdCellUpdateResponse: true,
  })
  for (const item of [first, second, range]) api.pages.push({ ...pageRecord, id: item.pageId, title: String(item.properties['root-title']), role: 'database-record' })
  await page.goto('/#/app/database-workspace/page/database-page')
  const timeline = page.locator('#database-block-p113c-pending-block').getByTestId('database-timeline')
  const dayPixels = pxPerMs('month') * 86_400_000
  const cellPatches = () => api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith(`/records/${first.id}/cells/${date.id}`)).length
  const barFor = (id: string) => timeline.locator(`[data-testid="timeline-bar"][data-record-id="${id}"]`)

  api.holdCellUpdateResponse = true
  const beforePatches = cellPatches()
  await dragTimelineBar(page, barFor(first.id), dayPixels)
  await api.cellUpdateResponseStarted
  const pendingBar = barFor(first.id)
  await expect(pendingBar).toHaveAttribute('data-drag-state', 'saving')
  await expect(pendingBar).toHaveAttribute('data-interaction-phase', 'pending')
  await expect(pendingBar).toHaveAttribute('data-saving', 'true')
  await expect(pendingBar).toHaveAttribute('aria-busy', 'true')
  await expect(pendingBar).toHaveClass(/is-pending/u)
  // The bar can still open the Record while saving, so it must not be aria-disabled.
  await expect(pendingBar).not.toHaveAttribute('aria-disabled', /.+/u)
  expect(await page.evaluate(() => document.activeElement !== document.body && document.activeElement !== null)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  expect(cellPatches()).toBe(beforePatches + 1)
  await screenshot(page, 'p113d-pending-desktop-light')

  const blockedPatches = cellPatches()
  const pendingPreview = await pendingBar.getAttribute('data-preview-date')
  await dragTimelineBar(page, pendingBar, dayPixels)
  expect(cellPatches()).toBe(blockedPatches)
  await expect(pendingBar).toHaveAttribute('data-drag-state', 'saving')
  await expect(pendingBar).toHaveAttribute('data-preview-date', pendingPreview ?? '')
  const pendingHandle = timeline.locator(`[data-testid="timeline-resize-end"][data-record-id="${first.id}"]`)
  if (await pendingHandle.count() > 0) {
    await dragTimelineBar(page, pendingHandle, dayPixels)
    expect(cellPatches()).toBe(blockedPatches)
  }

  // The generic Record Cell service serialises database-wide, so another record
  // cannot open a second in-flight mutation while the first one is unanswered.
  const secondPatches = () => api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith(`/records/${second.id}/cells/${date.id}`)).length
  await dragTimelineBar(page, barFor(second.id), dayPixels)
  expect(secondPatches()).toBeLessThanOrEqual(1)

  api.holdCellUpdateResponse = false
  api.releaseCellUpdateResponse()
  await expect.poll(() => api.records.find(item => item.id === first.id)?.properties[date.id]).toBe('2026-10-14')
  await expect(barFor(first.id)).toHaveAttribute('data-drag-state', 'idle')
  await expect(barFor(first.id)).toHaveAttribute('data-saving', 'false')
  await expect(barFor(second.id)).toBeFocused()
  // The second mutation captured the pre-refresh Database version, so the existing
  // CAS fence rejects it instead of double-writing; the canonical value is unchanged.
  await expect.poll(() => api.records.find(item => item.id === second.id)?.properties[date.id]).toBe('2026-10-20')
  expect(secondPatches()).toBeLessThanOrEqual(1)
  const canonicalSecond = api.records.find(item => item.id === second.id)!.properties[date.id]
  await dragTimelineBar(page, barFor(second.id), dayPixels)
  await expect.poll(() => api.records.find(item => item.id === second.id)?.properties[date.id]).toBe(canonicalSecond === '2026-10-20' ? '2026-10-21' : canonicalSecond)

  const rangeBar = barFor(range.id)
  const rangeBoundsBefore = await rangeBar.boundingBox()
  const rangeHandle = timeline.locator(`[data-testid="timeline-resize-end"][data-record-id="${range.id}"]`)
  const handleBounds = await rangeHandle.boundingBox()
  if (!rangeBoundsBefore || !handleBounds) throw new Error('Expected the pending resize handle')
  const resizeX = handleBounds.x + handleBounds.width / 2
  const resizeY = handleBounds.y + handleBounds.height / 2
  await page.mouse.move(resizeX, resizeY)
  await page.mouse.down()
  await page.mouse.move(resizeX + dayPixels, resizeY, { steps: 4 })
  await expect(rangeBar).toHaveAttribute('data-drag-state', 'dragging')
  await page.keyboard.press('Escape')
  await expect(rangeBar).toHaveAttribute('data-drag-state', 'idle')
  await page.mouse.up()
  const rangeBoundsAfter = await rangeBar.boundingBox()
  if (!rangeBoundsAfter) throw new Error('Expected the pending resize range bar after cancel')
  expect(Math.abs(rangeBoundsAfter.width - rangeBoundsBefore.width)).toBeLessThanOrEqual(1)
  expect(api.records.find(item => item.id === range.id)?.properties[date.id]).toEqual({ start: '2026-10-13', end: '2026-10-15' })

  const scroller = timeline.getByTestId('timeline-scroll')

  const patchesBeforeOffline = cellPatches()
  await context.setOffline(true)
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  await expect(barFor(second.id)).toHaveAttribute('data-draggable', 'false')
  const offlineBounds = await barFor(second.id).boundingBox()
  if (!offlineBounds) throw new Error('Expected the offline bar to stay visible')
  await page.mouse.move(offlineBounds.x + offlineBounds.width / 2, offlineBounds.y + offlineBounds.height / 2)
  await page.mouse.down()
  await page.mouse.move(offlineBounds.x + offlineBounds.width / 2 + dayPixels, offlineBounds.y + offlineBounds.height / 2, { steps: 3 })
  await page.mouse.up()
  await expect(barFor(second.id)).toHaveAttribute('data-drag-state', 'idle')
  expect(cellPatches()).toBe(patchesBeforeOffline)
  await context.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))

  api.releaseCellUpdateResponse()
  await expect.poll(() => api.records.find(item => item.id === first.id)?.properties[date.id]).toBe('2026-10-14')
  await expect(barFor(first.id)).toHaveAttribute('data-drag-state', 'idle')
  await expect(barFor(first.id)).toHaveAttribute('data-saving', 'false')
  expect(cellPatches()).toBe(beforePatches + 1)
  await expect(scroller).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)

  // The adapter-level busy fence is real: a pre-acquired record+property key makes
  // moveTimelineRecord bail before the generic Cell PATCH.
  expect(await page.evaluate(async () => {
    const module = await import('/src/components/editor/timeline/interaction.ts')
    return module.beginTimelineDateMutation({ recordId: 'p113c-pending-second', propertyId: 'p113c-pending-date' })
  })).toBe(true)
  const fencedPatches = secondPatches()
  await dragTimelineBar(page, barFor(second.id), dayPixels)
  expect(secondPatches()).toBe(fencedPatches)
  await page.evaluate(async () => {
    const module = await import('/src/components/editor/timeline/interaction.ts')
    module.endTimelineDateMutation({ recordId: 'p113c-pending-second', propertyId: 'p113c-pending-date' })
  })
  const releasedPatches = secondPatches()
  await dragTimelineBar(page, barFor(second.id), dayPixels)
  await expect.poll(() => secondPatches()).toBe(releasedPatches + 1)
})

for (const interruption of ['Escape', 'offline'] as const) {
  test(`P11.3D ${interruption} during pending keeps the submitted mutation and releases busy after completion`, async ({ page, context }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.clock.setFixedTime(new Date('2026-10-13T00:00:00.000Z'))
    const date = property(`p113d-${interruption}-date`, rootDatabase.id, 'Date', 'date')
    const timelineView = view(`p113d-${interruption}-view`, rootDatabase.id, 'Pending interruption', {
      ...DEFAULT_DATABASE_VIEW_CONFIG,
      options: { timeline: { scale: 'month', dateSource: { mode: 'date-property', propertyId: date.id } } },
    }, 'timeline')
    const item = record(`p113d-${interruption}-record`, rootDatabase.id, `p113d-${interruption}-page`, { 'root-title': 'Pending item', [date.id]: '2026-10-13' })
    const api = await installApi(page, [block(`p113d-${interruption}-block`, 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100)], {
      databases: [rootDatabase], views: [timelineView], properties: [...rootProperties, date], records: [item], holdCellUpdateResponse: true,
    })
    api.pages.push({ ...pageRecord, id: item.pageId, title: 'Pending item', role: 'database-record' })
    await page.goto('/#/app/database-workspace/page/database-page')
    const databaseBlock = page.locator(`#database-block-p113d-${interruption}-block`)
    const bar = databaseBlock.getByTestId('database-timeline').locator(`[data-testid="timeline-bar"][data-record-id="${item.id}"]`)
    const patches = () => api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith(`/records/${item.id}/cells/${date.id}`)).length
    const tableReads = () => api.requests.filter(request => request.method === 'GET' && request.path === `/api/workspaces/${workspace.id}/databases/${rootDatabase.id}/views/${timelineView.id}/table`).length
    await expect(bar).toBeVisible()
    await dragTimelineBar(page, bar, pxPerMs('month') * 86_400_000)
    await api.cellUpdateResponseStarted
    await expect(bar).toHaveAttribute('data-interaction-phase', 'pending')
    expect(patches()).toBe(1)

    if (interruption === 'Escape') {
      await page.keyboard.press('Escape')
      await expect(bar).toHaveAttribute('data-interaction-phase', 'idle')
      await expect(bar).not.toHaveAttribute('data-preview-date', /.+/u)
    } else {
      await context.setOffline(true)
      await page.evaluate(() => window.dispatchEvent(new Event('offline')))
      await expect(bar).toHaveAttribute('data-draggable', 'false')
      await context.setOffline(false)
      await page.evaluate(() => window.dispatchEvent(new Event('online')))
    }
    expect(patches()).toBe(1)
    expect(api.records.find(candidate => candidate.id === item.id)?.properties[date.id]).toBe('2026-10-13')
    // Offline happened after the PATCH started. The route mock does not drop an
    // in-flight response on its own, so model a committed write with a lost
    // response and failed canonical reads explicitly.
    if (interruption === 'offline') {
      api.abortCellUpdatesAfterCommit = 1
      api.failTableLoads = 5
    }
    api.holdCellUpdateResponse = false
    api.releaseCellUpdateResponse()
    await expect.poll(() => api.records.find(candidate => candidate.id === item.id)?.properties[date.id]).toBe('2026-10-14')
    if (interruption === 'offline') {
      await expect(bar).toHaveAttribute('data-draggable', 'false')
      await expect(databaseBlock.getByRole('alert').filter({ hasText: '提交结果暂未确认' })).toBeVisible()
      const readsBeforeRetry = tableReads()
      api.failTableLoads = 0
      await databaseBlock.getByRole('button', { name: '重试刷新' }).click()
      await expect.poll(() => tableReads()).toBe(readsBeforeRetry + 1)
      expect(patches()).toBe(1)
    }
    await expect(bar).toHaveAttribute('data-interaction-phase', 'idle')
    await expect(bar).toHaveAttribute('data-saving', 'false')
    await expect(bar).toHaveAttribute('title', /2026-10-14/u)
    expect(patches()).toBe(1)
    await dragTimelineBar(page, bar, pxPerMs('month') * 86_400_000)
    await expect.poll(() => api.records.find(candidate => candidate.id === item.id)?.properties[date.id]).toBe('2026-10-15')
    expect(patches()).toBe(2)
  })
}

test('P11.3C drag completion preserves focus on another Timeline bar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.clock.setFixedTime(new Date('2026-10-13T00:00:00.000Z'))
  const date = property('p113c-focus-date', rootDatabase.id, 'Date', 'date')
  const timelineView = view('p113c-focus-view', rootDatabase.id, 'Focus preservation', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { timeline: { scale: 'month', dateSource: { mode: 'date-property', propertyId: date.id } } },
  }, 'timeline')
  const first = record('p113c-focus-first', rootDatabase.id, 'p113c-focus-first-page', { 'root-title': 'First', [date.id]: '2026-10-13' })
  const second = record('p113c-focus-second', rootDatabase.id, 'p113c-focus-second-page', { 'root-title': 'Second', [date.id]: '2026-10-20' })
  const api = await installApi(page, [block('p113c-focus-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100)], {
    databases: [rootDatabase], views: [timelineView], properties: [...rootProperties, date], records: [first, second], holdCellUpdateResponse: true,
  })
  for (const item of [first, second]) api.pages.push({ ...pageRecord, id: item.pageId, title: String(item.properties['root-title']), role: 'database-record' })
  await page.goto('/#/app/database-workspace/page/database-page')
  const timeline = page.locator('#database-block-p113c-focus-block').getByTestId('database-timeline')
  const barFor = (id: string) => timeline.locator(`[data-testid="timeline-bar"][data-record-id="${id}"]`)
  const patches = () => api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith(`/records/${first.id}/cells/${date.id}`)).length
  const before = patches()

  await dragTimelineBar(page, barFor(first.id), pxPerMs('month') * 86_400_000)
  await api.cellUpdateResponseStarted
  await expect(barFor(first.id)).toHaveAttribute('data-saving', 'true')
  await barFor(second.id).focus()
  await expect(barFor(second.id)).toBeFocused()
  api.holdCellUpdateResponse = false
  api.releaseCellUpdateResponse()
  await expect.poll(() => api.records.find(item => item.id === first.id)?.properties[date.id]).toBe('2026-10-14')
  await expect(barFor(first.id)).toHaveAttribute('data-saving', 'false')
  await expect(barFor(second.id)).toBeFocused()
  expect(patches()).toBe(before + 1)
  await expect(page.locator('[data-overlay-mode="drawer"]')).toHaveCount(0)
})

test('P11.3C resize completion restores focus to the current same-record handle after pending removes handles', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.clock.setFixedTime(new Date('2026-10-13T00:00:00.000Z'))
  const date = property('p113c-resize-focus-date', rootDatabase.id, 'Date', 'date')
  const timelineView = view('p113c-resize-focus-view', rootDatabase.id, 'Resize focus', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { timeline: { scale: 'month', dateSource: { mode: 'date-property', propertyId: date.id } } },
  }, 'timeline')
  const range = record('p113c-resize-focus-range', rootDatabase.id, 'p113c-resize-focus-page', { 'root-title': 'Resize focus', [date.id]: { start: '2026-10-13', end: '2026-10-15' } })
  const api = await installApi(page, [block('p113c-resize-focus-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100)], {
    databases: [rootDatabase], views: [timelineView], properties: [...rootProperties, date], records: [range], holdCellUpdateResponse: true,
  })
  api.pages.push({ ...pageRecord, id: range.pageId, title: 'Resize focus', role: 'database-record' })
  await page.goto('/#/app/database-workspace/page/database-page')
  const timeline = page.locator('#database-block-p113c-resize-focus-block').getByTestId('database-timeline')
  const rangeBar = timeline.locator(`[data-testid="timeline-bar"][data-record-id="${range.id}"]`)
  const startHandle = timeline.locator(`[data-testid="timeline-resize-start"][data-record-id="${range.id}"]`)
  const bounds = await startHandle.boundingBox()
  if (!bounds) throw new Error('Expected the P11.3C resize focus start handle')
  const before = api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith(`/records/${range.id}/cells/${date.id}`)).length
  const dayPixels = pxPerMs('month') * 86_400_000
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x - dayPixels, y, { steps: 4 })
  await expect(rangeBar).toHaveAttribute('data-drag-state', 'dragging')
  await page.mouse.up()
  await api.cellUpdateResponseStarted
  await expect(rangeBar).toHaveAttribute('data-drag-state', 'saving')
  await expect(startHandle).toHaveCount(0)
  expect(api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith(`/records/${range.id}/cells/${date.id}`))).toHaveLength(before + 1)

  api.holdCellUpdateResponse = false
  api.releaseCellUpdateResponse()
  await expect.poll(() => api.records.find(item => item.id === range.id)?.properties[date.id]).toEqual({ start: '2026-10-12', end: '2026-10-15' })
  await expect(rangeBar).toHaveAttribute('data-drag-state', 'idle')
  await expect(startHandle).toBeAttached()
  await expect(startHandle).toBeFocused()
  await expect(page.locator('[data-overlay-mode="drawer"]')).toHaveCount(0)
  expect(api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith(`/records/${range.id}/cells/${date.id}`))).toHaveLength(before + 1)

  api.conflictCellUpdates = 1
  api.conflictCellUpdateValue = '2026-10-12'
  const beforeConflict = api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith(`/records/${range.id}/cells/${date.id}`)).length
  const currentHandleBounds = await startHandle.boundingBox()
  if (!currentHandleBounds) throw new Error('Expected the current start handle before the canonical point conflict')
  const conflictX = currentHandleBounds.x + currentHandleBounds.width / 2
  const conflictY = currentHandleBounds.y + currentHandleBounds.height / 2
  await page.mouse.move(conflictX, conflictY)
  await page.mouse.down()
  await page.mouse.move(conflictX + dayPixels * 3, conflictY, { steps: 4 })
  await expect(rangeBar).toHaveAttribute('data-drag-state', 'dragging')
  await page.mouse.up()
  await expect.poll(() => api.records.find(item => item.id === range.id)?.properties[date.id]).toBe('2026-10-12')
  await expect(rangeBar).toHaveAttribute('data-drag-state', 'idle')
  await expect(startHandle).toHaveCount(0)
  await expect(timeline.locator(`[data-testid="timeline-resize-end"][data-record-id="${range.id}"]`)).toHaveCount(1)
  await expect(rangeBar).toBeFocused()
  expect(api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith(`/records/${range.id}/cells/${date.id}`))).toHaveLength(beforeConflict + 1)
})

test('P11.3C conflict and network failures reconcile to canonical dates without retry or stale optimism', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.clock.setFixedTime(new Date('2026-10-13T00:00:00.000Z'))
  const date = property('p113c-reconcile-date', rootDatabase.id, 'Date', 'date')
  const tableView = view('p113c-reconcile-table', rootDatabase.id, 'Reconcile table')
  const timelineView = view('p113c-reconcile-view', rootDatabase.id, 'Reconcile gestures', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { timeline: { scale: 'month', dateSource: { mode: 'date-property', propertyId: date.id } } },
  }, 'timeline')
  const item = record('p113c-reconcile-record', rootDatabase.id, 'p113c-reconcile-page', { 'root-title': 'Reconcile row', [date.id]: '2026-10-13' })
  const api = await installApi(page, [block('p113c-reconcile-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100)], {
    databases: [rootDatabase], views: [timelineView, tableView], properties: [...rootProperties, date], records: [item],
  })
  api.pages.push({ ...pageRecord, id: item.pageId, title: 'Reconcile row', role: 'database-record' })
  await page.goto('/#/app/database-workspace/page/database-page')
  const databaseBlock = page.locator('#database-block-p113c-reconcile-block')
  const timeline = databaseBlock.getByTestId('database-timeline')
  const bar = timeline.locator(`[data-testid="timeline-bar"][data-record-id="${item.id}"]`)
  const alert = databaseBlock.getByRole('alert')
  const dayPixels = pxPerMs('month') * 86_400_000
  const cellPatches = () => api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith(`/records/${item.id}/cells/${date.id}`)).length
  const canonicalValue = () => api.records.find(candidate => candidate.id === item.id)?.properties[date.id]
  await expect(bar).toBeVisible()

  // 409: canonical refresh, no retry, no stale optimistic position.
  api.conflictCellUpdateValue = '2026-10-20'
  api.conflictCellUpdates = 1
  await dragTimelineBar(page, bar, dayPixels)
  await expect.poll(() => canonicalValue()).toBe('2026-10-20')
  await expect(alert).toContainText('日期已在其他位置被修改，已刷新到最新版本')
  await expect(bar).toHaveAttribute('data-drag-state', 'idle')
  await expect(bar).not.toHaveAttribute('data-preview-date', /.+/u)
  await expect(bar).toHaveAttribute('title', /2026-10-20/u)
  expect(cellPatches()).toBe(1)
  await screenshot(page, 'p113d-conflict-desktop-light')

  // HTTP 500 has an unknown result; refresh confirms the unchanged canonical date.
  api.failCellUpdates = 1
  api.failCellUpdateStatus = 500
  await dragTimelineBar(page, bar, dayPixels)
  await expect.poll(() => canonicalValue()).toBe('2026-10-20')
  await expect(bar).toHaveAttribute('data-drag-state', 'idle')
  await expect(bar).not.toHaveAttribute('data-preview-date', /.+/u)
  await expect(bar).toHaveAttribute('title', /2026-10-20/u)
  expect(cellPatches()).toBe(2)

  // Unknown result where the server did commit: canonical verification accepts it.
  api.abortCellUpdatesAfterCommit = 1
  await dragTimelineBar(page, bar, dayPixels)
  await expect.poll(() => canonicalValue()).toBe('2026-10-21')
  await expect(alert).toContainText('日期已更新，提交响应暂未确认')
  await expect(bar).toHaveAttribute('data-drag-state', 'idle')
  await expect(bar).not.toHaveAttribute('data-preview-date', /.+/u)
  await expect(bar).toHaveAttribute('title', /2026-10-21/u)
  expect(cellPatches()).toBe(3)

  // Unknown result where the server never applied the change: explicit uncertainty, no assumed success.
  api.abortCellUpdatesWithoutCommit = 1
  await dragTimelineBar(page, bar, dayPixels)
  await expect.poll(() => canonicalValue()).toBe('2026-10-21')
  await expect(alert).toContainText('提交结果暂未确认，已刷新为服务器最新日期')
  await expect(bar).toHaveAttribute('data-drag-state', 'idle')
  await expect(bar).not.toHaveAttribute('data-preview-date', /.+/u)
  await expect(bar).toHaveAttribute('title', /2026-10-21/u)
  expect(cellPatches()).toBe(4)

  await databaseBlock.getByRole('button', { name: '切换视图' }).click()
  await page.getByRole('group', { name: '数据库视图', exact: true }).getByRole('button', { name: 'Reconcile table', exact: true }).click()
  await expect(databaseBlock.locator('table')).toContainText('2026-10-21')
  await databaseBlock.getByRole('button', { name: '切换视图' }).click()
  await page.getByRole('group', { name: '数据库视图', exact: true }).getByRole('button', { name: 'Reconcile gestures', exact: true }).click()
  await expect(bar).toBeVisible()
  await expect(bar).toHaveAttribute('title', /2026-10-21/u)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})

for (const scenario of [
  { key: 'after-commit', name: 'after server commit', abortField: 'abortCellUpdatesAfterCommit' as const, expectedValue: '2026-10-14' },
  { key: 'without-commit', name: 'without server commit', abortField: 'abortCellUpdatesWithoutCommit' as const, expectedValue: '2026-10-13' },
]) {
  test(`P11.3C unknown refresh failure keeps result uncertain until retry (${scenario.name})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.clock.setFixedTime(new Date('2026-10-13T00:00:00.000Z'))
    const date = property(`p113c-unknown-refresh-${scenario.key}`, rootDatabase.id, 'Date', 'date')
    const timelineView = view(`p113c-unknown-refresh-${scenario.key}-view`, rootDatabase.id, 'Unknown refresh', {
      ...DEFAULT_DATABASE_VIEW_CONFIG,
      options: { timeline: { scale: 'month', dateSource: { mode: 'date-property', propertyId: date.id } } },
    }, 'timeline')
    const item = record(`p113c-unknown-refresh-${scenario.key}-record`, rootDatabase.id, `p113c-unknown-refresh-${scenario.key}-page`, { 'root-title': 'Unknown refresh', [date.id]: '2026-10-13' })
    const api = await installApi(page, [block(`p113c-unknown-refresh-${scenario.key}-block`, 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100)], {
      databases: [rootDatabase], views: [timelineView], properties: [...rootProperties, date], records: [item],
    })
    api.pages.push({ ...pageRecord, id: item.pageId, title: 'Unknown refresh', role: 'database-record' })
    await page.goto('/#/app/database-workspace/page/database-page')
    const databaseBlock = page.locator(`#database-block-p113c-unknown-refresh-${scenario.key}-block`)
    const timeline = databaseBlock.getByTestId('database-timeline')
    const bar = timeline.locator(`[data-testid="timeline-bar"][data-record-id="${item.id}"]`)
    await expect(bar).toBeVisible()
    const recordsPath = `/api/workspaces/${workspace.id}/databases/${rootDatabase.id}/views/${timelineView.id}/table`
    const tableReads = () => api.requests.filter(request => request.method === 'GET' && request.path === recordsPath).length
    const patches = () => api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith(`/records/${item.id}/cells/${date.id}`)).length
    const readsBeforeMutation = tableReads()
    const patchesBeforeMutation = patches()
    api[scenario.abortField] = 1
    api.failTableLoads = 1

    await dragTimelineBar(page, bar, pxPerMs('month') * 86_400_000)
    await expect.poll(() => tableReads()).toBe(readsBeforeMutation + 1)
    await expect(bar).toHaveAttribute('data-drag-state', 'idle')
    await expect(bar).not.toHaveAttribute('data-preview-date', /.+/u)
    await expect(bar).toHaveAttribute('data-draggable', 'false')
    await expect(bar).toHaveAttribute('title', /2026-10-13/u)
    const failedRefreshAlerts = () => databaseBlock.getByRole('alert').allTextContents()
    await expect.poll(async () => (await failedRefreshAlerts()).join(' ')).toContain('提交结果暂未确认')
    await expect.poll(async () => (await failedRefreshAlerts()).join(' ')).toContain('只读')
    expect((await failedRefreshAlerts()).join(' ')).not.toMatch(/已刷新为服务器最新日期|日期已更新/u)
    expect(patches()).toBe(patchesBeforeMutation + 1)
    expect(tableReads()).toBe(readsBeforeMutation + 1)

    await databaseBlock.getByRole('button', { name: '重试刷新' }).click()
    await expect(databaseBlock.getByRole('button', { name: '重试刷新' })).toHaveCount(0)
    await expect.poll(() => tableReads()).toBe(readsBeforeMutation + 2)
    await expect.poll(() => api.records.find(candidate => candidate.id === item.id)?.properties[date.id]).toBe(scenario.expectedValue)
    await expect(bar).toHaveAttribute('data-draggable', 'true')
    await expect(bar).toHaveAttribute('title', new RegExp(scenario.expectedValue, 'u'))
    await expect(databaseBlock.getByRole('alert')).toContainText('提交结果暂未确认。')
    expect(patches()).toBe(patchesBeforeMutation + 1)
  })
}

test('P11.3C view switch during preview or pending keeps identity fences, drafts, and canonical records', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.clock.setFixedTime(new Date('2026-10-13T00:00:00.000Z'))
  const date = property('p113c-fence-date', rootDatabase.id, 'Date', 'date')
  const tableView = view('p113c-fence-table', rootDatabase.id, 'Fence table')
  const timelineView = view('p113c-fence-view', rootDatabase.id, 'Fence timeline', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { timeline: { scale: 'month', dateSource: { mode: 'date-property', propertyId: date.id } } },
  }, 'timeline')
  const item = record('p113c-fence-record', rootDatabase.id, 'p113c-fence-page', { 'root-title': 'Fence row', [date.id]: '2026-10-13' })
  const api = await installApi(page, [block('p113c-fence-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100)], {
    databases: [rootDatabase], views: [timelineView, tableView], properties: [...rootProperties, date], records: [item],
  })
  api.pages.push({ ...pageRecord, id: item.pageId, title: 'Fence row', role: 'database-record' })
  const bodyBlock = block('p113c-fence-body', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'Fence body' }] }, 100)
  bodyBlock.pageId = item.pageId
  api.blocks.push(bodyBlock)
  await page.goto('/#/app/database-workspace/page/database-page')
  const databaseBlock = page.locator('#database-block-p113c-fence-block')
  const timeline = databaseBlock.getByTestId('database-timeline')
  const bar = timeline.locator(`[data-testid="timeline-bar"][data-record-id="${item.id}"]`)
  const dayPixels = pxPerMs('month') * 86_400_000
  const cellPatches = () => api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith(`/records/${item.id}/cells/${date.id}`)).length
  const canonicalValue = () => api.records.find(candidate => candidate.id === item.id)?.properties[date.id]
  const switchView = async (name: string) => {
    await databaseBlock.getByRole('button', { name: '切换视图' }).click()
    await page.getByRole('group', { name: '数据库视图', exact: true }).getByRole('button', { name, exact: true }).click()
  }
  // While a Timeline preview holds pointer capture the toolbar cannot be clicked with
  // the mouse, so this drives the same DOM controls without a pointer.
  const switchViewWithoutPointer = async (name: string) => {
    await page.evaluate(() => {
      const trigger = document.querySelector<HTMLElement>('#database-block-p113c-fence-block button[aria-label="切换视图"]')
      trigger?.click()
    })
    await expect(page.locator('section.eotion-database-view-menu')).toBeVisible()
    await page.evaluate((viewName) => {
      const rows = [...document.querySelectorAll('.eotion-database-view-row')]
      const row = rows.find(candidate => candidate.querySelector('.eotion-database-view-name')?.textContent?.trim() === viewName)
      ;(row?.querySelector('.eotion-database-view-name') as HTMLElement | undefined)?.click()
    }, name)
  }


  await expect(bar).toBeVisible()

  // Preview, then switch the View while the pointer is still down: the bar unmounts,
  // the preview is discarded and no PATCH is ever sent.
  const previewBounds = await bar.boundingBox()
  if (!previewBounds) throw new Error('Expected the fence bar before the preview view switch')
  const previewX = previewBounds.x + previewBounds.width / 2
  const previewY = previewBounds.y + previewBounds.height / 2
  await page.mouse.move(previewX, previewY)
  await page.mouse.down()
  await page.mouse.move(previewX + dayPixels, previewY, { steps: 4 })
  await expect(bar).toHaveAttribute('data-drag-state', 'dragging')
  await switchViewWithoutPointer('Fence table')
  await expect(databaseBlock.locator('table')).toBeVisible()
  await page.mouse.up()
  await page.mouse.move(0, 0)
  expect(cellPatches()).toBe(0)
  expect(canonicalValue()).toBe('2026-10-13')
  await switchViewWithoutPointer('Fence timeline')
  await expect(bar).toBeVisible()
  await expect(bar).toHaveAttribute('data-drag-state', 'idle')
  await expect(bar).toHaveAttribute('data-interaction-phase', 'idle')
  expect(cellPatches()).toBe(0)

  // Pending, then switch the View: the request may finish, but only canonical records update.
  api.holdCellUpdateResponse = true
  const pendingBounds = await bar.boundingBox()
  if (!pendingBounds) throw new Error('Expected the fence bar before the pending view switch')
  const pendingX = pendingBounds.x + pendingBounds.width / 2
  const pendingY = pendingBounds.y + pendingBounds.height / 2
  await page.mouse.move(pendingX, pendingY)
  await page.mouse.down()
  await page.mouse.move(pendingX + dayPixels, pendingY, { steps: 4 })
  await page.mouse.up()
  await api.cellUpdateResponseStarted
  await expect(bar).toHaveAttribute('data-drag-state', 'saving')
  // The existing generic busy guard disables the View switcher while the Date
  // mutation is unanswered, so a pending View switch fails closed instead of
  // racing the request. The stale-callback fence is covered by the logic spec.
  await expect(databaseBlock.getByRole('button', { name: '切换视图' })).toBeDisabled()
  await expect(databaseBlock.getByTestId('database-timeline')).toBeVisible()
  const realmOrigin = await page.evaluate(() => {
    ;(window as Window & { __p113dRealm?: object }).__p113dRealm = {}
    return performance.timeOrigin
  })
  const oldBar = await bar.elementHandle()
  await page.goto(`/#/app/${workspace.id}/page/${item.pageId}`)
  await expect(databaseBlock).toHaveCount(0)
  await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  await expect(bar).toBeVisible()
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(realmOrigin)
  expect(await page.evaluate(() => Boolean((window as Window & { __p113dRealm?: object }).__p113dRealm))).toBe(true)
  expect(await oldBar?.evaluate(element => element.isConnected)).toBe(false)
  const newBar = await bar.elementHandle()
  await expect(bar).toHaveAttribute('data-interaction-phase', 'idle')
  await expect(bar).toHaveAttribute('data-saving', 'false')
  api.releaseCellUpdateResponse()
  api.holdCellUpdateResponse = false
  await expect.poll(() => canonicalValue()).toBe('2026-10-14')
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  expect(await newBar?.evaluate(element => element.isConnected)).toBe(true)
  await expect(bar).toHaveAttribute('data-interaction-phase', 'idle')
  await expect(bar).toHaveAttribute('data-saving', 'false')
  await expect(bar).not.toHaveAttribute('data-preview-date', /.+/u)
  await expect(databaseBlock.getByRole('button', { name: '切换视图' })).toBeEnabled()
  await switchView('Fence table')
  await expect(databaseBlock.locator('table')).toContainText('2026-10-14')
  await switchView('Fence timeline')
  await expect(bar).toBeVisible()
  await expect(bar).toHaveAttribute('title', /2026-10-14/u)
  await expect(bar).toHaveAttribute('data-drag-state', 'idle')
  await expect(bar).toHaveAttribute('data-saving', 'false')
  expect(cellPatches()).toBe(1)

  // The Record Host and its draft survive a Timeline mutation while the drawer is open.
  await bar.click()
  const drawer = page.locator('[data-overlay-mode="drawer"]')
  await expect(drawer).toBeVisible()
  const titleDraft = drawer.getByRole('textbox', { name: '记录标题' })
  const bodyDraft = drawer.locator('.eotion-editor-content .tiptap')
  await expect(titleDraft).toHaveValue('Fence row')
  await bodyDraft.fill('Fence draft body')
  await expect(bodyDraft).toContainText('Fence draft body')
  await dragTimelineBar(page, bar, dayPixels)
  await expect.poll(() => canonicalValue()).toBe('2026-10-15')
  await expect(bar).toHaveAttribute('title', /2026-10-15/u)
  await expect(drawer).toBeVisible()
  await expect(titleDraft).toHaveValue('Fence row')
  await expect(bodyDraft).toContainText('Fence draft body')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})

test('P11.3C offline fails closed before preview and cancels an active preview without a request', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.clock.setFixedTime(new Date('2026-10-13T00:00:00.000Z'))
  const date = property('p113c-offline-date', rootDatabase.id, 'Date', 'date')
  const firstView = view('p113c-offline-view', rootDatabase.id, 'Offline gestures', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { timeline: { scale: 'month', dateSource: { mode: 'date-property', propertyId: date.id } } },
  }, 'timeline')
  const secondView = view('p113c-offline-second', rootDatabase.id, 'Offline second', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    options: { timeline: { scale: 'month', dateSource: { mode: 'date-property', propertyId: date.id } } },
  }, 'timeline')
  const item = record('p113c-offline-record', rootDatabase.id, 'p113c-offline-page', { 'root-title': 'Offline row', [date.id]: '2026-10-13' })
  const api = await installApi(page, [block('p113c-offline-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: firstView.id } }, 100)], {
    databases: [rootDatabase], views: [firstView, secondView], properties: [...rootProperties, date], records: [item],
  })
  api.pages.push({ ...pageRecord, id: item.pageId, title: 'Offline row', role: 'database-record' })
  await page.goto('/#/app/database-workspace/page/database-page')
  const timeline = page.locator('#database-block-p113c-offline-block').getByTestId('database-timeline')
  const dayPixels = pxPerMs('month') * 86_400_000
  const cellPatches = () => api.requests.filter(request => request.method === 'PATCH' && request.path.includes('/cells/')).length
  const firstBar = timeline.locator(`[data-testid="timeline-bar"][data-record-id="${item.id}"]`)
  const before = cellPatches()
  await expect(firstBar).toBeVisible()


  await context.setOffline(true)
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  await expect(firstBar).toHaveAttribute('data-draggable', 'false')
  const offlineBounds = await firstBar.boundingBox()
  if (!offlineBounds) throw new Error('Expected the offline Timeline bar to remain visible')
  const offlineX = offlineBounds.x + offlineBounds.width / 2
  const offlineY = offlineBounds.y + offlineBounds.height / 2
  await page.mouse.move(offlineX, offlineY)
  await page.mouse.down()
  await page.mouse.move(offlineX + dayPixels, offlineY, { steps: 3 })
  await expect(firstBar).toHaveAttribute('data-drag-state', 'idle')
  await expect(firstBar).toHaveAttribute('data-interaction-phase', 'idle')
  await page.mouse.up()
  expect(cellPatches()).toBe(before)
  await expect(page.locator('[data-overlay-mode="drawer"]')).toHaveCount(0)
  expect(api.records.find(candidate => candidate.id === item.id)?.properties[date.id]).toBe('2026-10-13')
  await context.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(firstBar).toHaveAttribute('data-draggable', 'true')

  const activeBounds = await firstBar.boundingBox()
  if (!activeBounds) throw new Error('Expected the online Timeline bar before the active preview')
  const activeX = activeBounds.x + activeBounds.width / 2
  const activeY = activeBounds.y + activeBounds.height / 2
  await page.mouse.move(activeX, activeY)
  await page.mouse.down()
  await page.mouse.move(activeX + dayPixels, activeY, { steps: 4 })
  await expect(firstBar).toHaveAttribute('data-drag-state', 'dragging')
  await context.setOffline(true)
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  await expect(firstBar).toHaveAttribute('data-drag-state', 'idle')
  await expect(firstBar).toHaveAttribute('data-interaction-phase', 'idle')
  await expect(firstBar).not.toHaveAttribute('data-preview-date', /.+/u)
  await page.mouse.up()
  expect(cellPatches()).toBe(before)
  expect(api.records.find(candidate => candidate.id === item.id)?.properties[date.id]).toBe('2026-10-13')
  await context.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
})

for (const direction of ['depends-on', 'blocks'] as const) {
  test(`P11.4A ${direction} draws read-only directed dependencies from loaded, scheduled self Relation targets`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.clock.setFixedTime(new Date('2026-10-13T12:00:00.000Z'))
    const relation = { ...property(`p114a-${direction}-relation`, rootDatabase.id, 'Predecessors', 'relation'), config: { targetDatabaseId: rootDatabase.id } } as TestProperty
    const timelineView = view(`p114a-${direction}-view`, rootDatabase.id, 'Dependency lines', {
      ...DEFAULT_DATABASE_VIEW_CONFIG,
      visibleProperties: ['root-title', 'root-date'], propertyOrder: ['root-title', 'root-date'],
      filters: [{ propertyId: 'root-text', operator: 'contains', value: 'keep' }],
      options: { timeline: {
        scale: 'month', dateSource: { mode: 'date-property', propertyId: 'root-date' },
        frozenTable: { visible: true, visibleProperties: ['root-title', 'root-date'], propertyOrder: ['root-title', 'root-date'] },
        dependency: { propertyId: relation.id, direction, shiftMode: 'no_auto_shift', avoidWeekends: false },
      } },
    }, 'timeline')
    const items = [
      record(`p114a-${direction}-a`, rootDatabase.id, `p114a-${direction}-page-a`, { 'root-title': 'A', 'root-text': 'keep', 'root-date': '2026-10-15', [relation.id]: [`p114a-${direction}-b`, `p114a-${direction}-c`, `p114a-${direction}-b`, `p114a-${direction}-missing`, `p114a-${direction}-filtered`, `p114a-${direction}-a`] }),
      record(`p114a-${direction}-b`, rootDatabase.id, `p114a-${direction}-page-b`, { 'root-title': 'B', 'root-text': 'keep', 'root-date': { start: '2026-10-10', end: '2026-10-12' } }),
      record(`p114a-${direction}-c`, rootDatabase.id, `p114a-${direction}-page-c`, { 'root-title': 'C', 'root-text': 'keep', 'root-date': '2026-10-20' }),
      record(`p114a-${direction}-filtered`, rootDatabase.id, `p114a-${direction}-page-filtered`, { 'root-title': 'Filtered', 'root-text': 'hidden', 'root-date': '2026-10-14' }),
    ]
    const api = await installApi(page, [block(`p114a-${direction}-block`, 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100)], {
      databases: [rootDatabase], views: [timelineView], properties: [rootProperties[0]!, rootProperties[1]!, rootProperties[5]!, relation], records: items,
    })
    await page.goto('/#/app/database-workspace/page/database-page')
    const timeline = page.locator(`#database-block-p114a-${direction}-block`).getByTestId('database-timeline')
    const layer = timeline.getByTestId('timeline-dependency-layer')
    const paths = layer.getByTestId('timeline-dependency-path')
    await expect(layer).toHaveAttribute('data-projected-edge-count', '2')
    await expect(paths).toHaveCount(2)
    const actual = await paths.evaluateAll(elements => elements.map(element => ({
      predecessor: element.getAttribute('data-predecessor-id'), successor: element.getAttribute('data-successor-id'),
      startX: Number(element.getAttribute('data-start-x')), endX: Number(element.getAttribute('data-end-x')),
      startY: Number(element.getAttribute('data-start-y')), endY: Number(element.getAttribute('data-end-y')),
      d: element.getAttribute('d'), marker: element.getAttribute('marker-end'),
    })))
    const id = (suffix: string) => `p114a-${direction}-${suffix}`
    expect(actual.map(edge => [edge.predecessor, edge.successor]).sort()).toEqual((direction === 'depends-on'
      ? [[id('b'), id('a')], [id('c'), id('a')]]
      : [[id('a'), id('b')], [id('a'), id('c')]]).sort())
    expect(actual.every(edge => edge.d?.startsWith('M') && edge.marker?.startsWith('url(#') && Number.isFinite(edge.startX) && Number.isFinite(edge.endX) && Number.isFinite(edge.startY) && Number.isFinite(edge.endY))).toBe(true)
    expect(actual.some(edge => edge.startX > edge.endX)).toBe(true)
    expect(actual.some(edge => edge.startX < edge.endX)).toBe(true)
    const anchors = await timeline.evaluate(root => {
      const geometry = (root as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, any> } }).__vueParentComponent?.setupState?.dependencyGeometryById
      if (!(geometry instanceof Map)) throw new Error('Expected dependency geometry by Record ID')
      return [...root.querySelectorAll<SVGPathElement>('[data-testid="timeline-dependency-path"]')].map(path => {
        const predecessor = geometry.get(path.dataset.predecessorId)
        const successor = geometry.get(path.dataset.successorId)
        if (!predecessor || !successor) throw new Error('Expected both edge endpoints in geometry map')
        return {
          startX: Number(path.dataset.startX), expectedStartX: predecessor.marker || predecessor.kind === 'point' ? predecessor.rawX : predecessor.rawX + predecessor.rawWidth,
          endX: Number(path.dataset.endX), expectedEndX: successor.rawX,
          startY: Number(path.dataset.startY), expectedStartY: predecessor.top + predecessor.height / 2,
          endY: Number(path.dataset.endY), expectedEndY: successor.top + successor.height / 2,
        }
      })
    })
    for (const anchor of anchors) {
      expect(anchor.startX).toBeCloseTo(anchor.expectedStartX, 3)
      expect(anchor.endX).toBeCloseTo(anchor.expectedEndX, 3)
      expect(anchor.startY).toBeCloseTo(anchor.expectedStartY, 3)
      expect(anchor.endY).toBeCloseTo(anchor.expectedEndY, 3)
    }
    for (const suffix of ['a', 'b', 'c']) {
      const row = timeline.locator(`[data-timeline-row][data-record-id="${id(suffix)}"]`)
      await expect(row).toHaveCount(1)
      await expect(timeline.locator(`[data-timeline-frozen-row][data-record-id="${id(suffix)}"]`)).toHaveCount(1)
    }
    expect(api.requests.filter(request => request.method !== 'GET')).toHaveLength(0)
    expect(api.requests.filter(request => /record-options|\/records\//u.test(request.path))).toHaveLength(0)
    expect(api.requests.filter(request => request.method === 'GET' && request.path.endsWith(`/views/${timelineView.id}/table`))).toHaveLength(1)
  })
}

test('P11.4A Timeline without dependency config keeps an empty line layer and ordinary bars interactive', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-13T12:00:00.000Z'))
  const relation = { ...property('p114a-disabled-relation', rootDatabase.id, 'Related', 'relation'), config: { targetDatabaseId: rootDatabase.id } } as TestProperty
  const timelineView = view('p114a-disabled-view', rootDatabase.id, 'No dependency', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    visibleProperties: ['root-title', 'root-date'], propertyOrder: ['root-title', 'root-date'],
    options: { timeline: { dateSource: { mode: 'date-property', propertyId: 'root-date' } } },
  }, 'timeline')
  const api = await installApi(page, [block('p114a-disabled-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100)], {
    databases: [rootDatabase], views: [timelineView], properties: [rootProperties[0]!, rootProperties[5]!, relation], records: [
      record('p114a-disabled-a', rootDatabase.id, 'p114a-disabled-page-a', { 'root-title': 'A', 'root-date': '2026-10-13', [relation.id]: ['p114a-disabled-b'] }),
      record('p114a-disabled-b', rootDatabase.id, 'p114a-disabled-page-b', { 'root-title': 'B', 'root-date': '2026-10-14' }),
    ],
  })
  api.pages.push(
    { ...pageRecord, id: 'p114a-disabled-page-a', title: 'A', role: 'database-record' },
    { ...pageRecord, id: 'p114a-disabled-page-b', title: 'B', role: 'database-record' },
  )
  await page.goto('/#/app/database-workspace/page/database-page')
  const timeline = page.locator('#database-block-p114a-disabled-block').getByTestId('database-timeline')
  const layer = timeline.getByTestId('timeline-dependency-layer')
  await expect(layer).toHaveAttribute('data-projected-edge-count', '0')
  await expect(layer.getByTestId('timeline-dependency-path')).toHaveCount(0)
  const bar = timeline.locator('[data-testid="timeline-bar"][data-record-id="p114a-disabled-a"]')
  await bar.click()
  await expect(page.locator('[data-overlay-mode="drawer"]')).toBeVisible()
  expect(api.requests.filter(request => request.method === 'PATCH' || /record-options|\/records\//u.test(request.path))).toHaveLength(0)
})

test('P11.4A dependency paths follow bar preview, scroll, scale and navigation without intercepting the bar', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.clock.setFixedTime(new Date('2026-10-13T12:00:00.000Z'))
  const relation = { ...property('p114a-interaction-relation', rootDatabase.id, 'Blocks', 'relation'), config: { targetDatabaseId: rootDatabase.id } } as TestProperty
  const timelineView = view('p114a-interaction-view', rootDatabase.id, 'Dependency preview', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    visibleProperties: ['root-title', 'root-date'], propertyOrder: ['root-title', 'root-date'],
    options: { timeline: {
      scale: 'month', dateSource: { mode: 'date-property', propertyId: 'root-date' },
      frozenTable: { visible: true, visibleProperties: ['root-title', 'root-date'], propertyOrder: ['root-title', 'root-date'] },
      dependency: { propertyId: relation.id, direction: 'blocks', shiftMode: 'no_auto_shift', avoidWeekends: false },
    } },
  }, 'timeline')
  const items = [
    record('p114a-interaction-a', rootDatabase.id, 'p114a-interaction-page-a', { 'root-title': 'A', 'root-date': { start: '2026-10-12', end: '2026-10-15' }, [relation.id]: ['p114a-interaction-b', 'p114a-interaction-c'] }),
    record('p114a-interaction-b', rootDatabase.id, 'p114a-interaction-page-b', { 'root-title': 'B', 'root-date': '2026-10-18' }),
    record('p114a-interaction-c', rootDatabase.id, 'p114a-interaction-page-c', { 'root-title': 'C', 'root-date': '2026-10-20' }),
    record('p114a-interaction-d', rootDatabase.id, 'p114a-interaction-page-d', { 'root-title': 'D', 'root-date': '2026-10-11', [relation.id]: ['p114a-interaction-c'] }),
  ]
  const api = await installApi(page, [block('p114a-interaction-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100)], {
    databases: [rootDatabase], views: [timelineView], properties: [rootProperties[0]!, rootProperties[5]!, relation], records: items,
  })
  await page.goto('/#/app/database-workspace/page/database-page')
  const timeline = page.locator('#database-block-p114a-interaction-block').getByTestId('database-timeline')
  const scroller = timeline.getByTestId('timeline-scroll')
  const layer = timeline.getByTestId('timeline-dependency-layer')
  const paths = layer.getByTestId('timeline-dependency-path')
  await expect(paths).toHaveCount(3)
  const marker = layer.locator('marker')
  await expect(marker).toHaveAttribute('refX', '17')
  const markerId = await marker.getAttribute('id')
  expect(markerId).toBeTruthy()
  expect(await paths.evaluateAll((elements, id) => elements.every(element => element.getAttribute('marker-end') === `url(#${id})`), markerId)).toBe(true)
  const screenshotDir = path.join(process.env.TEMP ?? testInfo.outputDir, `eotion-p114a-web-${Date.now()}-${process.pid}`)
  await mkdir(screenshotDir, { recursive: true })
  await page.screenshot({ path: path.join(screenshotDir, 'desktop-lines-light.png') })
  const a = timeline.locator('[data-testid="timeline-bar"][data-record-id="p114a-interaction-a"]')
  const unrelatedPath = layer.locator('[data-testid="timeline-dependency-path"][data-predecessor-id="p114a-interaction-d"]')
  await expect(unrelatedPath).toHaveCount(1)
  const before = await paths.evaluateAll(elements => elements.map(element => ({ id: element.getAttribute('data-edge-id'), d: element.getAttribute('d'), predecessor: element.getAttribute('data-predecessor-id') })))
  const barBounds = await a.boundingBox()
  if (!barBounds) throw new Error('Expected dependency preview bar')
  const x = barBounds.x + barBounds.width / 2
  const y = barBounds.y + barBounds.height / 2
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-testid="timeline-bar"]')?.getAttribute('data-record-id'), { x, y })).toBe('p114a-interaction-a')
  expect(await layer.evaluate(element => getComputedStyle(element).pointerEvents)).toBe('none')
  await page.mouse.move(x, y)
  await page.mouse.down()
  await timeline.evaluate(root => {
    const setup = (root as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, any> } }).__vueParentComponent?.setupState
    const unrelated = root.querySelector('[data-testid="timeline-dependency-path"][data-predecessor-id="p114a-interaction-d"]')
    if (!setup || !unrelated) throw new Error('Expected dependency projection and unrelated path')
    const state = { mutations: 0 }
    const observer = new MutationObserver(records => { state.mutations += records.length })
    observer.observe(unrelated, { attributes: true, childList: true, subtree: true })
    ;(window as Window & { __p114aPreviewProbe?: Record<string, unknown> }).__p114aPreviewProbe = {
      edges: setup.dependencyEdges, geometry: setup.dependencyGeometryById, windowEdges: setup.windowDependencyEdges,
      unrelated, observer, state,
    }
  })
  await page.mouse.move(x + pxPerMs('month') * 86_400_000, y, { steps: 4 })
  await expect(a).toHaveAttribute('data-drag-state', 'dragging')
  await expect.poll(async () => paths.evaluateAll((elements, baseline) => elements.map(element => ({ id: element.getAttribute('data-edge-id'), d: element.getAttribute('d'), predecessor: element.getAttribute('data-predecessor-id') })).filter(edge => edge.predecessor === 'p114a-interaction-a').some(edge => edge.d !== baseline.find(original => original.id === edge.id)?.d), before)).toBe(true)
  const preview = await timeline.evaluate(root => {
    const setup = (root as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, unknown> } }).__vueParentComponent?.setupState
    const probe = (window as Window & { __p114aPreviewProbe?: Record<string, any> }).__p114aPreviewProbe
    if (!setup || !probe) throw new Error('Expected dependency preview probe')
    const mutations = probe.state.mutations + probe.observer.takeRecords().length
    probe.observer.disconnect()
    return {
      edgesSame: setup.dependencyEdges === probe.edges,
      geometrySame: setup.dependencyGeometryById === probe.geometry,
      windowEdgesSame: setup.windowDependencyEdges === probe.windowEdges,
      unrelatedSame: root.querySelector('[data-testid="timeline-dependency-path"][data-predecessor-id="p114a-interaction-d"]') === probe.unrelated,
      unrelatedMutations: mutations,
    }
  })
  expect(preview).toEqual({ edgesSame: true, geometrySame: true, windowEdgesSame: true, unrelatedSame: true, unrelatedMutations: 0 })
  await page.screenshot({ path: path.join(screenshotDir, 'desktop-drag-preview-light.png') })
  expect(api.requests.filter(request => request.method === 'PATCH')).toHaveLength(0)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(a).toHaveAttribute('data-drag-state', 'idle')
  await expect.poll(() => paths.evaluateAll(elements => elements.map(element => ({ id: element.getAttribute('data-edge-id'), d: element.getAttribute('d'), predecessor: element.getAttribute('data-predecessor-id') })))).toEqual(before)

  await a.hover()
  const endHandle = timeline.locator('[data-testid="timeline-resize-end"][data-record-id="p114a-interaction-a"]')
  await expect(endHandle).toBeVisible()
  const handleBounds = await endHandle.boundingBox()
  if (!handleBounds) throw new Error('Expected range resize handle under dependency lines')
  const handleX = handleBounds.x + handleBounds.width / 2
  const handleY = handleBounds.y + handleBounds.height / 2
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-testid="timeline-resize-end"]')?.getAttribute('data-record-id'), { x: handleX, y: handleY })).toBe('p114a-interaction-a')
  await page.mouse.move(handleX, handleY)
  await page.mouse.down()
  await page.mouse.move(handleX + pxPerMs('month') * 86_400_000, handleY, { steps: 4 })
  await expect(a).toHaveAttribute('data-drag-state', 'dragging')
  await expect.poll(async () => paths.evaluateAll((elements, baseline) => elements.some(element => element.getAttribute('data-predecessor-id') === 'p114a-interaction-a' && element.getAttribute('d') !== baseline.find(original => original.id === element.getAttribute('data-edge-id'))?.d), before)).toBe(true)
  expect(api.requests.filter(request => request.method === 'PATCH')).toHaveLength(0)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(a).toHaveAttribute('data-drag-state', 'idle')
  await expect.poll(() => paths.evaluateAll(elements => elements.map(element => ({ id: element.getAttribute('data-edge-id'), d: element.getAttribute('d'), predecessor: element.getAttribute('data-predecessor-id') })))).toEqual(before)

  const beforeScroll = await unrelatedPath.boundingBox()
  await timeline.evaluate(root => {
    const setup = (root as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, any> } }).__vueParentComponent?.setupState
    if (!setup) throw new Error('Expected Timeline projection before scroll')
    ;(window as Window & { __p114aReadProbe?: { projectedItems: unknown; temporalMap: unknown; dependencyEdges: unknown } }).__p114aReadProbe = {
      projectedItems: setup.projectedItems, temporalMap: setup.temporalMap, dependencyEdges: setup.dependencyEdges,
    }
  })
  await scroller.evaluate(element => { element.scrollLeft += 120 })
  await expect.poll(async () => (await unrelatedPath.boundingBox())?.x).not.toBe(beforeScroll?.x)
  const projectionsSame = () => timeline.evaluate(root => {
    const setup = (root as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, any> } }).__vueParentComponent?.setupState
    const probe = (window as Window & { __p114aReadProbe?: { projectedItems: unknown; temporalMap: unknown; dependencyEdges: unknown } }).__p114aReadProbe
    return Boolean(setup && probe && setup.projectedItems === probe.projectedItems && setup.temporalMap === probe.temporalMap && setup.dependencyEdges === probe.dependencyEdges)
  })
  expect(await projectionsSame()).toBe(true)
  const tableReads = api.requests.filter(request => request.method === 'GET' && request.path.endsWith(`/views/${timelineView.id}/table`)).length
  await timeline.getByLabel('时间轴刻度').selectOption('week')
  await expect(timeline).toHaveAttribute('data-scale', 'week')
  await expect(paths).toHaveCount(3)
  expect(await projectionsSame()).toBe(true)
  await timeline.getByRole('button', { name: '今天' }).click()
  await expect(paths).toHaveCount(3)
  expect(await projectionsSame()).toBe(true)
  await timeline.getByRole('button', { name: '下一个时间段' }).click()
  await expect(paths).toHaveCount(3)
  expect(await projectionsSame()).toBe(true)
  await timeline.getByRole('button', { name: '上一个时间段' }).click()
  await expect(paths).toHaveCount(3)
  expect(await projectionsSame()).toBe(true)
  await timeline.getByRole('button', { name: '今天' }).click()
  await expect(paths).toHaveCount(3)
  expect(api.requests.filter(request => request.method === 'GET' && request.path.endsWith(`/views/${timelineView.id}/table`))).toHaveLength(tableReads)
  expect(api.requests.filter(request => request.method === 'PATCH')).toHaveLength(0)
  await timeline.getByLabel('时间轴刻度').selectOption('quarter')
  await timeline.getByRole('button', { name: '今天' }).click()
  await expect(paths).toHaveCount(3)
  await page.screenshot({ path: path.join(screenshotDir, 'desktop-lines-today-light.png') })
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await page.screenshot({ path: path.join(screenshotDir, 'desktop-lines-today-dark.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  const closeMobileNav = page.getByRole('button', { name: '关闭导航菜单' })
  if (await closeMobileNav.isVisible()) await closeMobileNav.click()
  await expect.poll(() => page.locator('.product-sidebar').evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0)
  await expect(page.locator('.sidebar-scrim')).toHaveCount(0)
  await timeline.getByRole('button', { name: '今天' }).click()
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    await expect(layer).toBeAttached()
    await page.screenshot({ path: path.join(screenshotDir, `phone-390-lines-${theme}.png`) })
  }
  console.log(`P11.4A screenshot evidence: ${screenshotDir}`)
})

for (const total of [100, 500] as const) {
  for (const density of ['sparse', 'medium'] as const) {
    test(`P11.4A ${total} loaded rows keep ${density} dependency projection bounded across pagination and row windows`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.clock.setFixedTime(new Date('2026-10-13T12:00:00.000Z'))
      const relation = { ...property(`p114a-${total}-${density}-relation`, rootDatabase.id, 'Blocks', 'relation'), config: { targetDatabaseId: rootDatabase.id } } as TestProperty
      const timelineView = view(`p114a-${total}-${density}-view`, rootDatabase.id, 'Dependency density', {
        ...DEFAULT_DATABASE_VIEW_CONFIG,
        visibleProperties: ['root-title', 'root-date'], propertyOrder: ['root-title', 'root-date'],
        options: { timeline: {
          scale: 'month', dateSource: { mode: 'date-property', propertyId: 'root-date' },
          frozenTable: { visible: true, visibleProperties: ['root-title'], propertyOrder: ['root-title'] },
          dependency: { propertyId: relation.id, direction: 'blocks', shiftMode: 'no_auto_shift', avoidWeekends: false },
        } },
      }, 'timeline')
      const id = (index: number) => `p114a-${total}-${density}-${String(index).padStart(3, '0')}`
      const items = Array.from({ length: total }, (_, index) => {
        const targetIndexes = density === 'medium'
          ? [index + 1, index + 2].filter(next => next < total)
          : index % 10 === 0 && index + 1 < total ? [index + 1] : index === 24 ? [25] : []
        return record(id(index), rootDatabase.id, `${id(index)}-page`, {
          'root-title': `Row ${index}`, 'root-date': '2026-10-13', [relation.id]: targetIndexes.map(id),
        })
      })
      const api = await installApi(page, [block(`p114a-${total}-${density}-block`, 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100)], {
        databases: [rootDatabase], views: [timelineView], properties: [rootProperties[0]!, rootProperties[5]!, relation], records: items,
      })
      await page.goto('/#/app/database-workspace/page/database-page')
      const blockRoot = page.locator(`#database-block-p114a-${total}-${density}-block`)
      const timeline = blockRoot.getByTestId('database-timeline')
      const layer = timeline.getByTestId('timeline-dependency-layer')
      const projectedCount = () => timeline.evaluate(root => {
        const items = (root as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, any> } }).__vueParentComponent?.setupState?.projectedItems
        return Array.isArray(items) ? items.length : -1
      })
      await expect.poll(projectedCount).toBe(25)
      await expect(layer).toHaveAttribute('data-projected-edge-count', density === 'medium' ? '47' : '3')
      await expect(layer.locator(`[data-predecessor-id="${id(24)}"][data-successor-id="${id(25)}"]`)).toHaveCount(0)
      const loadMore = blockRoot.getByRole('button', { name: '加载更多' })
      for (let loaded = 25; loaded < total; loaded += 25) {
        await loadMore.click()
        await expect.poll(projectedCount).toBe(Math.min(loaded + 25, total))
      }
      await expect(loadMore).toHaveCount(0)
      const expectedEdges = density === 'medium' ? total * 2 - 3 : total / 10 + 1
      await expect(layer).toHaveAttribute('data-projected-edge-count', String(expectedEdges))
      const reads = api.requests.filter(request => request.method === 'GET' && request.path.endsWith(`/views/${timelineView.id}/table`))
      expect(reads).toHaveLength(total / 25)
      expect(reads.every(request => new URLSearchParams(request.search).get('limit') === '25')).toBe(true)
      expect(api.requests.filter(request => /record-options|\/records\//u.test(request.path))).toHaveLength(0)
      expect(api.requests.filter(request => request.method !== 'GET')).toHaveLength(0)
      const bounded = await timeline.evaluate(root => {
        const setup = (root as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, any> } }).__vueParentComponent?.setupState
        const layer = root.querySelector('[data-testid="timeline-dependency-layer"]')
        if (!setup || !layer || !Array.isArray(setup.dependencyEdges) || !(setup.dependencyGeometryById instanceof Map) || !Array.isArray(setup.windowDependencyEdges)) throw new Error('Expected dependency projection refs')
        const rows = root.querySelectorAll('[data-timeline-row]').length
        const windowEdges = Number(layer.getAttribute('data-window-edge-count'))
        const paths = layer.querySelectorAll('[data-testid="timeline-dependency-path"]').length
        ;(window as Window & { __p114aDensityProbe?: { edges: unknown } }).__p114aDensityProbe = { edges: setup.dependencyEdges }
        return { rows, windowEdges, paths, edges: setup.dependencyEdges.length, geometry: setup.dependencyGeometryById.size }
      })
      expect(bounded.edges).toBe(expectedEdges)
      expect(bounded.paths).toBeLessThanOrEqual(bounded.windowEdges)
      expect(bounded.windowEdges).toBeLessThanOrEqual(density === 'medium' ? bounded.rows * 2 + 4 : bounded.rows + 4)
      expect(bounded.geometry).toBe(total)
      await page.evaluate(() => { (document.querySelector('.document-wrap') as HTMLElement).scrollTop = 0 })
      await expect.poll(() => timeline.locator('[data-row-window-first]').getAttribute('data-row-window-first')).toBe('0')
      const sourceBar = timeline.locator(`[data-testid="timeline-bar"][data-record-id="${id(0)}"]`)
      const incidentPath = layer.locator(`[data-testid="timeline-dependency-path"][data-predecessor-id="${id(0)}"]`).first()
      const unrelatedPath = layer.locator(`[data-testid="timeline-dependency-path"][data-predecessor-id="${id(density === 'medium' ? 2 : 10)}"]`).first()
      await expect(sourceBar).toBeVisible()
      await expect(incidentPath).toHaveCount(1)
      await expect(unrelatedPath).toHaveCount(1)
      const incidentBefore = await incidentPath.getAttribute('d')
      const sourceBounds = await sourceBar.boundingBox()
      if (!sourceBounds) throw new Error('Expected source bar for dependency preview density probe')
      const x = sourceBounds.x + sourceBounds.width / 2
      const y = sourceBounds.y + sourceBounds.height / 2
      await page.mouse.move(x, y)
      await page.mouse.down()
      await timeline.evaluate((root, unrelatedRecordId) => {
        const setup = (root as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, any> } }).__vueParentComponent?.setupState
        const unrelated = root.querySelector(`[data-testid="timeline-dependency-path"][data-predecessor-id="${unrelatedRecordId}"]`)
        if (!setup || !unrelated) throw new Error('Expected Timeline dependency preview probes')
        const state = { mutations: 0 }
        const observer = new MutationObserver(records => { state.mutations += records.length })
        observer.observe(unrelated, { attributes: true, childList: true, subtree: true })
        ;(window as Window & { __p114aDensityPreviewProbe?: Record<string, unknown> }).__p114aDensityPreviewProbe = {
          projectedItems: setup.projectedItems, temporalMap: setup.temporalMap, dependencyEdges: setup.dependencyEdges,
          dependencyGeometryById: setup.dependencyGeometryById, windowDependencyEdges: setup.windowDependencyEdges,
          unrelated, observer, state,
        }
      }, id(density === 'medium' ? 2 : 10))
      await page.mouse.move(x + pxPerMs('month') * 86_400_000, y, { steps: 4 })
      await expect(sourceBar).toHaveAttribute('data-drag-state', 'dragging')
      await expect.poll(() => incidentPath.getAttribute('d')).not.toBe(incidentBefore)
      const previewEvidence = await timeline.evaluate((root, unrelatedRecordId) => {
        const setup = (root as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, any> } }).__vueParentComponent?.setupState
        const probe = (window as Window & { __p114aDensityPreviewProbe?: Record<string, any> }).__p114aDensityPreviewProbe
        if (!setup || !probe) throw new Error('Expected stored dependency preview probes')
        const unrelatedMutations = probe.state.mutations + probe.observer.takeRecords().length
        probe.observer.disconnect()
        return {
          projectedItemsSame: setup.projectedItems === probe.projectedItems,
          temporalMapSame: setup.temporalMap === probe.temporalMap,
          dependencyEdgesSame: setup.dependencyEdges === probe.dependencyEdges,
          dependencyGeometrySame: setup.dependencyGeometryById === probe.dependencyGeometryById,
          windowEdgesSame: setup.windowDependencyEdges === probe.windowDependencyEdges,
          unrelatedPathSame: root.querySelector(`[data-testid="timeline-dependency-path"][data-predecessor-id="${unrelatedRecordId}"]`) === probe.unrelated,
          unrelatedMutations,
        }
      }, id(density === 'medium' ? 2 : 10))
      expect(previewEvidence).toEqual({ projectedItemsSame: true, temporalMapSame: true, dependencyEdgesSame: true, dependencyGeometrySame: true, windowEdgesSame: true, unrelatedPathSame: true, unrelatedMutations: 0 })
      expect(api.requests.filter(request => request.method === 'PATCH')).toHaveLength(0)
      await page.keyboard.press('Escape')
      await page.mouse.up()
      await expect(sourceBar).toHaveAttribute('data-drag-state', 'idle')
      await expect(incidentPath).toHaveAttribute('d', incidentBefore ?? '')
      if (total === 500) {
        expect(bounded.rows).toBeLessThanOrEqual(40)
        await page.evaluate(() => { (document.querySelector('.document-wrap') as HTMLElement).scrollTop = 1000 })
        await expect.poll(() => timeline.locator('[data-row-window-first]').getAttribute('data-row-window-first')).not.toBe('0')
        expect(await timeline.evaluate(root => {
          const setup = (root as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, any> } }).__vueParentComponent?.setupState
          const probe = (window as Window & { __p114aDensityProbe?: { edges: unknown } }).__p114aDensityProbe
          return setup?.dependencyEdges === probe?.edges
        })).toBe(true)
        const visible = await layer.evaluate(element => ({ paths: element.querySelectorAll('[data-testid="timeline-dependency-path"]').length, windowEdges: Number(element.getAttribute('data-window-edge-count')) }))
        expect(visible.paths).toBeLessThanOrEqual(visible.windowEdges)
        expect(visible.windowEdges).toBeLessThanOrEqual(84)
      }
      console.log(`P11.4A ${total} ${density} dependency evidence: ${JSON.stringify({ ...bounded, preview: previewEvidence })}`)
    })
  }
}

// P11.4B acceptance helpers and gates. Keep these at the end of the shared
// Database suite so its eventual full run also exercises the P11.3 regression set.
type P114bDirection = 'depends-on' | 'blocks'

async function p114bFixture(page: Page, direction: P114bDirection, records?: TestRecord[], options: Parameters<typeof installApi>[2] = {}) {
  const relation = { ...property(`p114b-${direction}-relation`, rootDatabase.id, 'Dependencies', 'relation'), config: { targetDatabaseId: rootDatabase.id } } as TestProperty
  const timelineView = view(`p114b-${direction}-view`, rootDatabase.id, 'Dependency editing', {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    visibleProperties: ['root-title', 'root-date'], propertyOrder: ['root-title', 'root-date'],
    options: { timeline: {
      scale: 'month', dateSource: { mode: 'date-property', propertyId: 'root-date' },
      frozenTable: { visible: true, visibleProperties: ['root-title'], propertyOrder: ['root-title'] },
      dependency: { propertyId: relation.id, direction, shiftMode: 'no_auto_shift', avoidWeekends: false },
    } },
  }, 'timeline')
  const fallbackView = view(`p114b-${direction}-table-view`, rootDatabase.id, 'Fallback table')
  const items = records ?? [
    record('p114b-a', rootDatabase.id, 'p114b-page-a', { 'root-title': 'Alpha', 'root-date': '2026-10-13' }),
    record('p114b-b', rootDatabase.id, 'p114b-page-b', { 'root-title': 'Beta', 'root-date': '2026-10-14' }),
    record('p114b-c', rootDatabase.id, 'p114b-page-c', { 'root-title': 'Gamma', 'root-date': '2026-10-15' }),
  ]
  const api = await installApi(page, [block(`p114b-${direction}-block`, 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100)], {
    databases: [rootDatabase], views: [timelineView, fallbackView], properties: [...rootProperties, relation], records: items,
    ...options,
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.clock.setFixedTime(new Date('2026-10-13T12:00:00.000Z'))
  await page.goto('/#/app/database-workspace/page/database-page')
  const timeline = page.locator(`#database-block-p114b-${direction}-block`).getByTestId('database-timeline')
  await expect(timeline).toBeVisible()
  return { relation, timelineView, items, api, timeline }
}

function p114bRelationPatch(api: DatabaseApi, relationId: string) {
  return api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith(`/cells/${relationId}`))
}

async function p114bConnect(page: Page, timeline: Locator, predecessorId: string, successorId: string) {
  const handle = timeline.locator(`[data-testid="timeline-dependency-handle"][data-record-id="${predecessorId}"]`)
  const target = timeline.locator(`[data-testid="timeline-bar"][data-record-id="${successorId}"]`)
  await expect(handle).toBeVisible()
  await expect(target).toBeVisible()
  await handle.scrollIntoViewIfNeeded()
  await target.scrollIntoViewIfNeeded()
  const sourceBounds = await handle.boundingBox()
  const targetBounds = await target.boundingBox()
  if (!sourceBounds || !targetBounds) throw new Error('Expected visible P11.4B source and target')
  const source = { x: sourceBounds.x + sourceBounds.width / 2, y: sourceBounds.y + sourceBounds.height / 2 }
  const destination = { x: targetBounds.x + targetBounds.width / 2, y: targetBounds.y + targetBounds.height / 2 }
  await page.mouse.move(source.x, source.y)
  await page.mouse.down()
  await page.mouse.move(destination.x, destination.y, { steps: 4 })
  return { handle, target, destination }
}

async function p114bSelectEdge(page: Page, timeline: Locator, predecessorId: string, successorId: string) {
  const hit = timeline.locator(`[data-testid="timeline-dependency-hit"][data-predecessor-id="${predecessorId}"][data-successor-id="${successorId}"]`)
  await expect(hit).toBeVisible()
  const point = await hit.evaluate(element => {
    const path = element as SVGPathElement
    const svg = path.ownerSVGElement
    if (!svg) throw new Error('Expected dependency hit path owner SVG')
    const bounds = svg.getBoundingClientRect()
    for (const fraction of [0.08, 0.16, 0.24, 0.32, 0.4, 0.5, 0.6, 0.68, 0.76, 0.84, 0.92]) {
      const position = path.getPointAtLength(path.getTotalLength() * fraction)
      const x = bounds.left + position.x
      const y = bounds.top + position.y
      if (document.elementFromPoint(x, y)?.closest('[data-testid="timeline-dependency-hit"]') === path) return { x, y }
    }
    throw new Error('No dependency path segment wins elementFromPoint hit-testing')
  })
  await page.mouse.click(point.x, point.y)
  const control = timeline.getByTestId('timeline-dependency-control')
  await expect(control).toHaveAttribute('data-selected-edge-id', /.+/u)
  return control
}

async function p114bDeleteEdge(page: Page, timeline: Locator, predecessorId: string, successorId: string) {
  const control = await p114bSelectEdge(page, timeline, predecessorId, successorId)
  await control.press('Delete')
}

for (const direction of ['depends-on', 'blocks'] as const) {
  test(`P11.4B ${direction} create and delete use one ordered Relation Cell CAS`, async ({ page }) => {
    const { relation, timeline, api } = await p114bFixture(page, direction)
    await p114bConnect(page, timeline, 'p114b-a', 'p114b-b')
    await expect(timeline.locator('[data-testid="timeline-dependency-preview"]')).toBeVisible()
    expect(p114bRelationPatch(api, relation.id)).toHaveLength(0)
    await page.mouse.up()
    await expect.poll(() => p114bRelationPatch(api, relation.id).length).toBe(1)
    const ownerId = direction === 'depends-on' ? 'p114b-b' : 'p114b-a'
    const relatedId = direction === 'depends-on' ? 'p114b-a' : 'p114b-b'
    expect(p114bRelationPatch(api, relation.id)[0]?.payload).toMatchObject({ value: [relatedId], expectedDatabaseVersion: 1, expectedRecordVersion: 1 })
    await expect(timeline.locator(`[data-testid="timeline-dependency-path"][data-predecessor-id="p114b-a"][data-successor-id="p114b-b"]`)).toHaveCount(1)
    await p114bDeleteEdge(page, timeline, 'p114b-a', 'p114b-b')
    await expect.poll(() => p114bRelationPatch(api, relation.id).length).toBe(2)
    expect(p114bRelationPatch(api, relation.id)[1]?.payload).toMatchObject({ value: [], expectedDatabaseVersion: 2, expectedRecordVersion: 2 })
    expect(api.records.find(item => item.id === ownerId)?.properties[relation.id]).toEqual([])
    expect(api.records.find(item => item.id === relatedId)?.properties[relation.id]).toBeUndefined()
    expect(api.requests.filter(request => request.method === 'PATCH' && request.path.includes('/cells/'))).toHaveLength(2)
  })
}

test('P11.4B appends only the new Relation ID, preserving other IDs, order, and Date wire values', async ({ page }) => {
  const initial = record('p114b-a', rootDatabase.id, 'p114b-page-a', {
    'root-title': 'Alpha', 'root-date': { start: '2026-10-15T10:20:30.000Z', end: '2026-10-16T10:20:30.000Z', timeZone: 'America/Los_Angeles' },
    'p114b-depends-on-relation': ['p114b-c', 'p114b-keep'],
  })
  const fixture = await p114bFixture(page, 'blocks', [
    initial,
    record('p114b-b', rootDatabase.id, 'p114b-page-b', { 'root-title': 'Beta', 'root-date': '2026-10-14' }),
    record('p114b-c', rootDatabase.id, 'p114b-page-c', { 'root-title': 'Gamma', 'root-date': '2026-10-15' }),
  ])
  const relationId = fixture.relation.id
  // The fixture's Relation property id is generated from the direction.
  initial.properties[relationId] = ['p114b-c', 'p114b-keep']
  const seeded = fixture.api.records.find(item => item.id === 'p114b-a')!
  seeded.properties[relationId] = ['p114b-c', 'p114b-keep']
  await page.reload()
  await expect(fixture.timeline.locator('[data-testid="timeline-dependency-path"]')).toHaveCount(1)
  await p114bConnect(page, fixture.timeline, 'p114b-a', 'p114b-b')
  await page.mouse.up()
  await expect.poll(() => p114bRelationPatch(fixture.api, relationId).length).toBe(1)
  expect(p114bRelationPatch(fixture.api, relationId)[0]?.payload.value).toEqual(['p114b-c', 'p114b-keep', 'p114b-b'])
  await expect(fixture.timeline.locator('[data-testid="timeline-dependency-path"]')).toHaveCount(2)
  await p114bDeleteEdge(page, fixture.timeline, 'p114b-a', 'p114b-b')
  await expect.poll(() => p114bRelationPatch(fixture.api, relationId).length).toBe(2)
  expect(p114bRelationPatch(fixture.api, relationId)[1]?.payload.value).toEqual(['p114b-c', 'p114b-keep'])
  await expect(fixture.timeline.locator('[data-testid="timeline-dependency-path"]')).toHaveCount(1)
  expect(fixture.api.records.find(item => item.id === 'p114b-a')?.properties[relationId]).toEqual(['p114b-c', 'p114b-keep'])
  expect(fixture.api.records.find(item => item.id === 'p114b-a')?.properties['root-date']).toEqual({ start: '2026-10-15T10:20:30.000Z', end: '2026-10-16T10:20:30.000Z', timeZone: 'America/Los_Angeles' })
  expect(fixture.api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith('/cells/root-date'))).toHaveLength(0)
})

test('P11.4B self and duplicate links do not write; a longer cycle remains a valid Relation edge', async ({ page }) => {
  const { relation, timeline, api } = await p114bFixture(page, 'blocks', [
    record('p114b-a', rootDatabase.id, 'p114b-page-a', { 'root-title': 'Alpha', 'root-date': '2026-10-13', 'p114b-blocks-relation': ['p114b-b'] }),
    record('p114b-b', rootDatabase.id, 'p114b-page-b', { 'root-title': 'Beta', 'root-date': '2026-10-14', 'p114b-blocks-relation': ['p114b-c'] }),
    record('p114b-c', rootDatabase.id, 'p114b-page-c', { 'root-title': 'Gamma', 'root-date': '2026-10-15' }),
  ])
  for (const id of ['p114b-a', 'p114b-b']) {
    const handleBounds = await timeline.locator(`[data-testid="timeline-dependency-handle"][data-record-id="${id}"]`).boundingBox()
    const barBounds = await timeline.locator(`[data-testid="timeline-bar"][data-record-id="${id}"]`).boundingBox()
    if (!handleBounds || !barBounds) throw new Error(`Expected dependency handle and Bar for ${id}`)
    await page.mouse.move(handleBounds.x + handleBounds.width / 2, handleBounds.y + handleBounds.height / 2)
    await page.mouse.down()
    await page.mouse.move(barBounds.x + barBounds.width / 2, barBounds.y + barBounds.height / 2, { steps: 2 })
    await page.mouse.up()
  }
  await p114bConnect(page, timeline, 'p114b-a', 'p114b-b')
  await page.mouse.up()
  expect(p114bRelationPatch(api, relation.id)).toHaveLength(0)
  await p114bConnect(page, timeline, 'p114b-c', 'p114b-a')
  await page.mouse.up()
  await expect.poll(() => p114bRelationPatch(api, relation.id).length).toBe(1)
  expect(api.records.find(item => item.id === 'p114b-c')?.properties[relation.id]).toEqual(['p114b-a'])
  await expect(timeline.locator('[data-testid="timeline-dependency-path"]')).toHaveCount(3)
})

for (const cancellation of ['Escape', 'pointercancel', 'lostpointercapture', 'blur', 'hidden', 'offline', 'scope-change'] as const) {
  test(`P11.4B cancels connection on ${cancellation} without PATCH`, async ({ page, context }) => {
    const { relation, timeline, api } = await p114bFixture(page, 'blocks')
    const { handle, target, destination } = await p114bConnect(page, timeline, 'p114b-a', 'p114b-b')
    await expect(timeline.locator('[data-testid="timeline-dependency-preview"]')).toBeVisible()
    if (cancellation === 'Escape') await page.keyboard.press('Escape')
    else if (cancellation === 'pointercancel') await handle.dispatchEvent('pointercancel', { pointerId: 1, bubbles: true })
    else if (cancellation === 'lostpointercapture') await handle.dispatchEvent('lostpointercapture', { pointerId: 1, bubbles: true })
    else if (cancellation === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    else if (cancellation === 'hidden') await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    else if (cancellation === 'offline') { await context.setOffline(true); await page.evaluate(() => window.dispatchEvent(new Event('offline'))) }
    else {
      await page.getByRole('button', { name: '切换视图' }).evaluate(element => (element as HTMLButtonElement).click())
      await page.getByRole('group', { name: '数据库视图', exact: true }).getByRole('button', { name: 'Fallback table', exact: true }).evaluate(element => (element as HTMLButtonElement).click())
    }
    await expect(timeline.locator('[data-testid="timeline-dependency-preview"]')).toHaveCount(0)
    await page.mouse.up()
    expect(p114bRelationPatch(api, relation.id)).toHaveLength(0)
    expect(api.records.find(item => item.id === 'p114b-a')?.properties[relation.id]).toBeUndefined()
    if (cancellation === 'offline') await context.setOffline(false)
    void target; void destination
  })
}

for (const operation of ['create', 'delete'] as const) {
  for (const failure of ['409', '4xx', 'unknown-committed', 'unknown-uncommitted'] as const) {
    test(`P11.4B ${operation} ${failure} reconciles canonical Relation without retry`, async ({ page }) => {
      const relationSeed = operation === 'delete' ? ['p114b-b'] : undefined
      const a = record('p114b-a', rootDatabase.id, 'p114b-page-a', { 'root-title': 'Alpha', 'root-date': '2026-10-13', ...(relationSeed ? { 'p114b-blocks-relation': relationSeed } : {}) })
      const { relation, timeline, api } = await p114bFixture(page, 'blocks', [
        a,
        record('p114b-b', rootDatabase.id, 'p114b-page-b', { 'root-title': 'Beta', 'root-date': '2026-10-14' }),
        record('p114b-c', rootDatabase.id, 'p114b-page-c', { 'root-title': 'Gamma', 'root-date': '2026-10-15' }),
      ], failure === '409'
        ? { conflictCellUpdates: 1, conflictCellUpdateValue: operation === 'create' ? ['p114b-b'] : [] }
        : failure === '4xx' ? { failCellUpdates: 1, failCellUpdateStatus: 403 }
          : failure === 'unknown-committed' ? { abortCellUpdatesAfterCommit: 1 }
            : { abortCellUpdatesWithoutCommit: 1 })
      if (operation === 'create') {
        await p114bConnect(page, timeline, 'p114b-a', 'p114b-b')
        await page.mouse.up()
      } else await p114bDeleteEdge(page, timeline, 'p114b-a', 'p114b-b')
      await expect.poll(() => p114bRelationPatch(api, relation.id).length).toBe(1)
      const edgeAfterRefresh = operation === 'create'
        ? ['409', 'unknown-committed'].includes(failure) ? 1 : 0
        : ['409', 'unknown-committed'].includes(failure) ? 0 : 1
      await expect.poll(() => timeline.locator('[data-testid="timeline-dependency-path"]').count()).toBe(edgeAfterRefresh)
      expect(p114bRelationPatch(api, relation.id)).toHaveLength(1)
      if (failure === 'unknown-committed') {
        const owner = api.records.find(item => item.id === 'p114b-a')!
        expect(owner.properties[relation.id]).toEqual(operation === 'create' ? ['p114b-b'] : [])
      }
    })
  }
}

test('P11.4B refresh failure after unknown commit locks the stale dependency view read-only', async ({ page }) => {
  const { relation, timeline, timelineView, api } = await p114bFixture(page, 'blocks', undefined, { abortCellUpdatesWithoutCommit: 1 })
  let failedRefresh = false
  await page.route(`**/databases/${rootDatabase.id}/views/${timelineView.id}/table**`, async route => {
    if (!failedRefresh && route.request().method() === 'GET') {
      failedRefresh = true
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ statusCode: 503, message: 'Snapshot unavailable' }) })
      return
    }
    await route.fallback()
  })
  await p114bConnect(page, timeline, 'p114b-a', 'p114b-b')
  await page.mouse.up()
  await expect.poll(() => p114bRelationPatch(api, relation.id).length).toBe(1)
  await expect.poll(() => failedRefresh).toBe(true)
  await expect(timeline.locator('[data-testid="timeline-dependency-handle"]')).toHaveCount(0)
  await expect(timeline.locator('[data-testid="timeline-dependency-path"]')).toHaveCount(0)
  expect(p114bRelationPatch(api, relation.id)).toHaveLength(1)
  const tablePath = `/views/${timelineView.id}/table`
  const readsBeforeRetry = api.requests.filter(request => request.method === 'GET' && request.path.endsWith(tablePath)).length
  await page.getByRole('button', { name: '重试刷新' }).click()
  await expect.poll(() => api.requests.filter(request => request.method === 'GET' && request.path.endsWith(tablePath)).length).toBe(readsBeforeRetry + 1)
  await expect(timeline.locator('[data-testid="timeline-dependency-handle"]')).toHaveCount(3)
  expect(p114bRelationPatch(api, relation.id)).toHaveLength(1)
})

test('P11.4B pending relation write locks other Database mutations and releases once settled', async ({ page }) => {
  const { relation, timeline, api } = await p114bFixture(page, 'blocks', undefined, { holdCellUpdateResponse: true })
  await p114bConnect(page, timeline, 'p114b-a', 'p114b-b')
  const responseStarted = api.cellUpdateResponseStarted
  await page.mouse.up()
  await responseStarted
  await expect(timeline.getByRole('status')).toHaveText('正在保存依赖关系…')
  await expect(timeline.locator('[data-testid="timeline-dependency-handle"]')).toHaveCount(0)
  expect(p114bRelationPatch(api, relation.id)).toHaveLength(1)
  await page.locator('.document-wrap .eotion-editor').evaluate(element => {
    const candidate = (element as Element & { __vueParentComponent?: { exposed?: { editor?: any } } }).__vueParentComponent?.exposed?.editor
    const editor = candidate?.view ? candidate : candidate?.value
    if (!editor?.setEditable) throw new Error('Expected the parent Tiptap Editor to toggle editability')
    editor.setEditable(false)
  })
  api.releaseCellUpdateResponse()
  await expect.poll(() => api.records.find(item => item.id === 'p114b-a')?.properties[relation.id]).toEqual(['p114b-b'])
  await expect(timeline.getByRole('status')).toHaveCount(0)
  await expect(timeline.getByTestId('timeline-dependency-control')).toHaveAttribute('aria-busy', 'false')
  await expect(timeline.locator('[data-testid="timeline-dependency-path"][data-predecessor-id="p114b-a"][data-successor-id="p114b-b"]')).toHaveCount(1)
  await page.locator('.document-wrap .eotion-editor').evaluate(element => {
    const candidate = (element as Element & { __vueParentComponent?: { exposed?: { editor?: any } } }).__vueParentComponent?.exposed?.editor
    const editor = candidate?.view ? candidate : candidate?.value
    editor?.setEditable(true)
  })
  await expect(timeline.getByTestId('timeline-dependency-control')).not.toHaveAttribute('aria-disabled', 'true')
  await p114bConnect(page, timeline, 'p114b-a', 'p114b-c')
  await expect(timeline.locator('[data-testid="timeline-dependency-preview"]')).toBeVisible()
  await page.mouse.up()
  await expect.poll(() => p114bRelationPatch(api, relation.id).length).toBe(2)
  expect(p114bRelationPatch(api, relation.id)[1]?.payload).toMatchObject({ value: ['p114b-b', 'p114b-c'], expectedDatabaseVersion: 2, expectedRecordVersion: 2 })
})

test('P11.4B dependency control selects edges by keyboard and pointer gestures do not start Bar or resize mutations', async ({ page }) => {
  const relationId = 'p114b-blocks-relation'
  const { relation, timeline, api } = await p114bFixture(page, 'blocks', [
    record('p114b-a', rootDatabase.id, 'p114b-page-a', { 'root-title': 'Alpha', 'root-date': { start: '2026-10-13', end: '2026-10-14' }, [relationId]: ['p114b-b'] }),
    record('p114b-b', rootDatabase.id, 'p114b-page-b', { 'root-title': 'Beta', 'root-date': '2026-10-14', [relationId]: ['p114b-c'] }),
    record('p114b-c', rootDatabase.id, 'p114b-page-c', { 'root-title': 'Gamma', 'root-date': '2026-10-15' }),
    record('p114b-d', rootDatabase.id, 'p114b-page-d', { 'root-title': 'Delta', 'root-date': '2026-10-16' }),
  ])
  const hitTest = await timeline.evaluate(root => {
    const hit = root.querySelector<SVGPathElement>('[data-testid="timeline-dependency-hit"]')
    const bar = root.querySelector<HTMLElement>('[data-testid="timeline-bar"][data-record-id="p114b-a"]')
    const blankRow = root.querySelector<HTMLElement>('[data-timeline-row][data-record-id="p114b-d"]')
    if (!hit || !bar || !blankRow || !hit.ownerSVGElement) throw new Error('Expected hit path, Bar and blank row')
    const hitBounds = hit.ownerSVGElement.getBoundingClientRect()
    const point = hit.getPointAtLength(hit.getTotalLength() / 2)
    const barBounds = bar.getBoundingClientRect()
    const rowBounds = blankRow.getBoundingClientRect()
    const scrollBounds = root.querySelector<HTMLElement>('[data-testid="timeline-scroll"]')!.getBoundingClientRect()
    const left = Math.max(rowBounds.left, scrollBounds.left + 5)
    const right = Math.min(rowBounds.right, scrollBounds.right - 5)
    const candidates = [rowBounds.top + 5, rowBounds.top + rowBounds.height / 2, rowBounds.bottom - 5]
      .flatMap(y => Array.from({ length: 40 }, (_, index) => ({ x: left + (right - left) * (index + 0.5) / 40, y })))
    const blankPoint = candidates.find(candidate => {
      const target = document.elementFromPoint(candidate.x, candidate.y)
      return target?.closest('[data-timeline-row]') === blankRow
        && !target.closest('[data-testid="timeline-bar"], [data-testid^="timeline-resize-"], [data-testid="timeline-dependency-hit"]')
    })
    if (!blankPoint) throw new Error('Expected an uncovered point inside the visible blank timeline row')
    return {
      line: document.elementFromPoint(hitBounds.left + point.x, hitBounds.top + point.y)?.closest('[data-testid="timeline-dependency-hit"]') === hit,
      bar: document.elementFromPoint(barBounds.left + barBounds.width / 2, barBounds.top + barBounds.height / 2)?.closest('[data-testid="timeline-bar"]') === bar,
      blankRow: blankPoint,
    }
  })
  expect(hitTest.line).toBe(true)
  expect(hitTest.bar).toBe(true)
  await page.mouse.move(hitTest.blankRow.x, hitTest.blankRow.y)
  await expect(timeline.locator('[data-timeline-row][data-record-id="p114b-d"]')).toHaveClass(/is-hovered/u)
  const control = timeline.getByTestId('timeline-dependency-control')
  await expect(control).toBeVisible()
  await control.focus()
  await expect(control).toHaveAttribute('data-selected-edge-id', /.+/u)
  const first = await control.getAttribute('data-selected-edge-id')
  await control.press('ArrowRight')
  await expect.poll(() => control.getAttribute('data-selected-edge-id')).not.toBe(first)
  await control.press('ArrowLeft')
  await expect(control).toHaveAttribute('data-selected-edge-id', first ?? '')
  const { handle, target } = await p114bConnect(page, timeline, 'p114b-c', 'p114b-a')
  await page.mouse.up()
  await expect.poll(() => p114bRelationPatch(api, relation.id).length).toBe(1)
  expect(api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith('/cells/root-date'))).toHaveLength(0)
  expect(api.records.find(item => item.id === 'p114b-c')?.properties[relation.id]).toEqual(['p114b-a'])
  await expect(handle).toBeAttached()
  await expect(target).toBeAttached()
})

test('P11.4B first dependency-control click selects without deleting', async ({ page }) => {
  const { relation, timeline, api } = await p114bFixture(page, 'blocks', [
    record('p114b-a', rootDatabase.id, 'p114b-page-a', { 'root-title': 'Alpha', 'root-date': '2026-10-13', 'p114b-blocks-relation': ['p114b-b'] }),
    record('p114b-b', rootDatabase.id, 'p114b-page-b', { 'root-title': 'Beta', 'root-date': '2026-10-14', 'p114b-blocks-relation': ['p114b-c'] }),
    record('p114b-c', rootDatabase.id, 'p114b-page-c', { 'root-title': 'Gamma', 'root-date': '2026-10-15' }),
  ])
  const control = timeline.getByTestId('timeline-dependency-control')
  await expect(control).not.toHaveAttribute('data-selected-edge-id')
  const refsBefore = await timeline.evaluate(root => {
    const setup = (root as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, any> } }).__vueParentComponent?.setupState
    return { dependencyEdges: setup?.dependencyEdges, projectedItems: setup?.projectedItems }
  })
  await control.click()
  await expect(control).toHaveAttribute('data-selected-edge-id', /.+/u)
  await expect(timeline.locator('[data-testid="timeline-dependency-path"]')).toHaveCount(2)
  const refsAfter = await timeline.evaluate(root => {
    const setup = (root as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, any> } }).__vueParentComponent?.setupState
    return { dependencyEdges: setup?.dependencyEdges, projectedItems: setup?.projectedItems }
  })
  expect(refsAfter).toEqual(refsBefore)
  expect(p114bRelationPatch(api, relation.id)).toHaveLength(0)
})

test('P11.4B Desktop and 390px dependency UI screenshots stay usable in Light and Dark', async ({ page }, testInfo) => {
  const { timeline, api } = await p114bFixture(page, 'blocks', [
    record('p114b-a', rootDatabase.id, 'p114b-page-a', { 'root-title': 'Alpha', 'root-date': '2026-10-14', 'p114b-blocks-relation': ['p114b-b'] }),
    record('p114b-b', rootDatabase.id, 'p114b-page-b', { 'root-title': 'Beta', 'root-date': '2026-10-14' }),
    record('p114b-c', rootDatabase.id, 'p114b-page-c', { 'root-title': 'Gamma', 'root-date': '2026-10-14' }),
  ])
  const unique = `${Date.now()}-${process.pid}-${Math.random().toString(16).slice(2)}`
  const directory = path.join(process.env.TEMP ?? testInfo.outputDir, `eotion-p114b-web-${unique}`)
  await mkdir(directory, { recursive: true })
  for (const [width, prefix] of [[1440, 'desktop'], [390, 'phone-390']] as const) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    if (width === 390) {
      const closeMobileNav = page.getByRole('button', { name: '关闭导航菜单' })
      if (await closeMobileNav.isVisible()) await closeMobileNav.click()
      await expect.poll(() => page.locator('.product-sidebar').evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0)
    }
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme)
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
      await expect(timeline.locator('[data-testid="timeline-dependency-path"]')).toHaveCount(1)
      await page.screenshot({ path: path.join(directory, `${prefix}-${theme}.png`), animations: 'disabled', fullPage: true })
    }
    if (width === 390) {
      await p114bConnect(page, timeline, 'p114b-a', 'p114b-c')
      await expect(timeline.locator('[data-testid="timeline-dependency-preview"]')).toBeVisible()
      await page.screenshot({ path: path.join(directory, 'phone-390-create-preview-light.png'), animations: 'disabled', fullPage: true })
      await page.mouse.up()
      await expect.poll(() => p114bRelationPatch(api, 'p114b-blocks-relation').length).toBe(1)
      const control = await p114bSelectEdge(page, timeline, 'p114b-a', 'p114b-c')
      await expect(control).toHaveAttribute('aria-label', /删除依赖/u)
      await page.screenshot({ path: path.join(directory, 'phone-390-selected-delete-light.png'), animations: 'disabled', fullPage: true })
      await control.press('Delete')
      await expect.poll(() => p114bRelationPatch(api, 'p114b-blocks-relation').length).toBe(2)
      await expect(timeline.locator('[data-testid="timeline-dependency-path"]')).toHaveCount(1)
    }
  }
  expect(api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith('/cells/p114b-blocks-relation'))).toHaveLength(2)
  console.log(`P11.4B visual evidence: ${directory}`)
})

test('P11.4B 390px coarse touch creates and deletes a dependency with touch input', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
  try {
    const page = await context.newPage()
    const pageErrors: string[] = []
    page.on('pageerror', error => pageErrors.push(error.message))
    const { timeline, api } = await p114bFixture(page, 'blocks', [
      record('p114b-a', rootDatabase.id, 'p114b-page-a', { 'root-title': 'Alpha', 'root-date': '2026-10-14' }),
      record('p114b-b', rootDatabase.id, 'p114b-page-b', { 'root-title': 'Beta', 'root-date': '2026-10-14' }),
      record('p114b-c', rootDatabase.id, 'p114b-page-c', { 'root-title': 'Gamma', 'root-date': '2026-10-14' }),
    ])
    await page.setViewportSize({ width: 390, height: 844 })
    const closeMobileNav = page.getByRole('button', { name: '关闭导航菜单' })
    if (await closeMobileNav.isVisible()) await closeMobileNav.click()
    await expect.poll(() => page.evaluate(() => ({ coarse: matchMedia('(pointer: coarse)').matches, touchPoints: navigator.maxTouchPoints }))).toEqual({ coarse: true, touchPoints: expect.any(Number) })
    expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(0)
    const cdp = await context.newCDPSession(page)
    const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', point?: { x: number; y: number }) => {
      await cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: point ? [{ x: point.x, y: point.y, id: 1, radiusX: 1, radiusY: 1, force: 1 }] : [],
      })
    }
    const handle = timeline.locator('[data-testid="timeline-dependency-handle"][data-record-id="p114b-a"]')
    const target = timeline.locator('[data-testid="timeline-bar"][data-record-id="p114b-c"]')
    const targetHandle = timeline.locator('[data-testid="timeline-dependency-handle"][data-record-id="p114b-c"]')
    await expect(handle).toBeVisible()
    await expect(target).toBeVisible()
    await expect(targetHandle).toBeVisible()
    const sourceBounds = await handle.boundingBox()
    const targetBounds = await target.boundingBox()
    if (!sourceBounds || !targetBounds) throw new Error('Expected coarse-pointer dependency source and target')
    const source = { x: sourceBounds.x + sourceBounds.width / 2, y: sourceBounds.y + sourceBounds.height / 2 }
    const targetGeometry = await target.evaluate(element => {
      const rect = element.getBoundingClientRect()
      const describe = (x: number, y: number) => {
        const hit = document.elementFromPoint(x, y) as HTMLElement | null
        return { tag: hit?.tagName, testId: hit?.getAttribute('data-testid'), className: typeof hit?.className === 'string' ? hit.className : '', recordId: hit?.dataset.recordId, closestBarId: hit?.closest<HTMLElement>('[data-testid="timeline-bar"]')?.dataset.recordId, closestResizeId: hit?.closest<HTMLElement>('[data-testid^="timeline-resize-"]')?.dataset.testid }
      }
      const resize = document.querySelector<HTMLElement>('[data-testid="timeline-resize-end"][data-record-id="p114b-c"]')
      const resizeRect = resize?.getBoundingClientRect()
      const bodyPoint = [0.25, 0.35, 0.65, 0.75].map(fraction => ({ x: rect.left + rect.width * fraction, y: rect.top + rect.height / 2 }))
        .find(point => document.elementFromPoint(point.x, point.y)?.closest('[data-testid="timeline-bar"]') === element)
      return {
        bar: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, kind: element.dataset.kind },
        barCenterPoint: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
        barCenter: describe(rect.left + rect.width / 2, rect.top + rect.height / 2),
        resizeCenter: resizeRect ? describe(resizeRect.left + resizeRect.width / 2, resizeRect.top + resizeRect.height / 2) : null,
        bodyPoint: bodyPoint ?? null,
      }
    })
    console.log(`P11.4B coarse touch hit geometry: ${JSON.stringify(targetGeometry)}`)
    expect(targetGeometry.barCenter.closestBarId).toBe('p114b-c')
    expect(targetGeometry.resizeCenter?.closestResizeId).toBe('timeline-resize-end')
    const overlap = { x: targetGeometry.barCenterPoint.x + 9, y: targetGeometry.barCenterPoint.y + 10 }
    const overlapHit = await page.evaluate(({ x, y }) => {
      const element = document.elementFromPoint(x, y) as HTMLElement | null
      return { testId: element?.getAttribute('data-testid'), connectorRecordId: element?.closest<HTMLElement>('[data-testid="timeline-dependency-handle"]')?.dataset.recordId }
    }, overlap)
    console.log(`P11.4B coarse touch Bar-plus-connector hit: ${JSON.stringify({ overlap, overlapHit })}`)
    expect(overlapHit.connectorRecordId).toBe('p114b-c')
    const destination = overlap
    const handleHit = await page.evaluate(({ x, y }) => {
      const element = document.elementFromPoint(x, y) as HTMLElement | null
      return { testId: element?.getAttribute('data-testid'), recordId: element?.closest<HTMLElement>('[data-testid="timeline-dependency-handle"]')?.dataset.recordId }
    }, destination)
    expect(handleHit).toEqual({ testId: null, recordId: 'p114b-c' })
    await handle.evaluate(element => {
      const target = window as Window & { __p114bTouchTypes?: string[] }
      target.__p114bTouchTypes = []
      element.addEventListener('pointerdown', event => target.__p114bTouchTypes!.push((event as PointerEvent).pointerType), { once: true })
    })
    await touch('touchStart', source)
    await touch('touchMove', destination)
    await expect(timeline.locator('[data-testid="timeline-dependency-preview"]')).toBeVisible()
    expect(await page.evaluate(() => (window as Window & { __p114bTouchTypes?: string[] }).__p114bTouchTypes)).toEqual(['touch'])
    await touch('touchEnd')
    await expect.poll(() => p114bRelationPatch(api, 'p114b-blocks-relation').length).toBe(1)

    const control = timeline.getByTestId('timeline-dependency-control')
    await expect(control).toBeVisible()
    await control.tap()
    await expect(control).toHaveAttribute('data-selected-edge-id', /.+/u)
    expect(p114bRelationPatch(api, 'p114b-blocks-relation')).toHaveLength(1)
    await control.tap()
    await expect.poll(() => p114bRelationPatch(api, 'p114b-blocks-relation').length).toBe(2)
    await expect(timeline.locator('[data-testid="timeline-dependency-path"]')).toHaveCount(0)
    expect(pageErrors).toEqual([])
  } finally {
    await context.close()
  }
})

for (const total of [100, 500] as const) {
  test(`P11.4B ${total} rows keep pointer preview local with no relation N+1`, async ({ page }) => {
    const relationId = `p114b-blocks-relation`
    const id = (index: number) => `p114b-${total}-${String(index).padStart(3, '0')}`
    const items = Array.from({ length: total }, (_, index) => record(id(index), rootDatabase.id, `${id(index)}-page`, {
      'root-title': `Row ${index}`, 'root-date': '2026-10-13',
      [relationId]: index % 10 === 0 && index + 1 < total ? [id(index + 1)] : [],
    }))
    const { relation, timeline, timelineView, api } = await p114bFixture(page, 'blocks', items)
    const loadMore = page.getByRole('button', { name: '加载更多' })
    for (let loaded = 25; loaded < total; loaded += 25) await loadMore.click()
    await expect.poll(() => timeline.evaluate(root => {
      const setup = (root as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, any> } }).__vueParentComponent?.setupState
      return Array.isArray(setup?.projectedItems) ? setup.projectedItems.length : -1
    })).toBe(total)
    await expect(timeline.getByTestId('timeline-dependency-layer')).toHaveAttribute('data-projected-edge-count', String(total / 10))
    const requestEvidence = api.requests.filter(request => /record-options|\/records\//u.test(request.path))
    expect(requestEvidence).toHaveLength(0)
    expect(api.requests.filter(request => request.method === 'GET' && request.path.endsWith(`/views/${timelineView.id}/table`))).toHaveLength(total / 25)
    await timeline.evaluate(root => {
      for (let element: HTMLElement | null = root.parentElement; element; element = element.parentElement) element.scrollTop = 0
      document.scrollingElement?.scrollTo(0, 0)
      window.scrollTo(0, 0)
    })
    await expect(timeline.getByTestId('timeline-canvas-body')).toHaveAttribute('data-row-window-first', '0')
    const handle = timeline.locator(`[data-testid="timeline-dependency-handle"][data-record-id="${id(0)}"]`)
    const target = timeline.locator(`[data-testid="timeline-bar"][data-record-id="${id(2)}"]`)
    await target.scrollIntoViewIfNeeded()
    const unrelated = timeline.locator(`[data-testid="timeline-dependency-path"][data-predecessor-id="${id(10)}"]`).first()
    const bounds = await handle.boundingBox(); const targetBounds = await target.boundingBox()
    if (!bounds || !targetBounds) throw new Error('Expected dense dependency handles')
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    await page.mouse.down()
    const refs = await timeline.evaluate((root, probeArgs) => {
      const setup = (root as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, any> } }).__vueParentComponent?.setupState
      const path = root.querySelector(probeArgs.unrelatedSelector)
      const bars = [...root.querySelectorAll<HTMLElement>('[data-testid="timeline-bar"]')]
        .filter(bar => bar.dataset.recordId !== probeArgs.sourceId && bar.dataset.recordId !== probeArgs.targetId)
      const components = bars.map(bar => (bar as HTMLElement & { __vueParentComponent?: { u?: Array<() => void> } }).__vueParentComponent)
      const layer = root.querySelector('[data-testid="timeline-dependency-layer"]')
      const layerComponent = (layer as (Element & { __vueParentComponent?: { u?: Array<() => void> } }) | null)?.__vueParentComponent
      if (!setup || !path || !layer || components.some(component => !component) || !layerComponent) throw new Error('Expected dependency projection, unrelated Bars/path and Vue components')
      const state = { mutations: 0, unrelatedUpdated: 0, layerUpdated: 0 }
      for (const component of components) component!.u = [...(component!.u ?? []), () => { state.unrelatedUpdated += 1 }]
      layerComponent.u = [...(layerComponent.u ?? []), () => { state.layerUpdated += 1 }]
      const observer = new MutationObserver(records => { state.mutations += records.length })
      observer.observe(path, { attributes: true, childList: true, subtree: true })
      ;(window as Window & { __p114bRefs?: Record<string, unknown>; __p114bObserver?: MutationObserver }).__p114bRefs = {
        projectedItems: setup.projectedItems, temporalMap: setup.temporalMap, dependencyEdges: setup.dependencyEdges,
        geometry: setup.dependencyGeometryById, windowEdges: setup.windowDependencyEdges, path, unrelatedSelector: probeArgs.unrelatedSelector,
        bars, components, layer, layerComponent, state,
      }
      ;(window as Window & { __p114bObserver?: MutationObserver }).__p114bObserver = observer
      return true
    }, { unrelatedSelector: `[data-testid="timeline-dependency-path"][data-predecessor-id="${id(10)}"]`, sourceId: id(0), targetId: id(2) })
    expect(refs).toBe(true)
    await page.mouse.move(targetBounds.x + targetBounds.width / 2, targetBounds.y + targetBounds.height / 2, { steps: 4 })
    await expect(timeline.locator('[data-testid="timeline-dependency-preview"]')).toBeVisible()
    const evidence = await timeline.evaluate(root => {
      const setup = (root as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, any> } }).__vueParentComponent?.setupState
      const windowWithProbe = window as Window & { __p114bRefs?: Record<string, any>; __p114bObserver?: MutationObserver }
      const probe = windowWithProbe.__p114bRefs
      if (!setup || !probe) throw new Error('Expected P11.4B density probe')
      const mutations = probe.state.mutations + (windowWithProbe.__p114bObserver?.takeRecords().length ?? 0)
      windowWithProbe.__p114bObserver?.disconnect()
      return {
        projectionStable: setup.projectedItems === probe.projectedItems && setup.temporalMap === probe.temporalMap && setup.dependencyEdges === probe.dependencyEdges,
        geometryStable: setup.dependencyGeometryById === probe.geometry && setup.windowDependencyEdges === probe.windowEdges,
        unrelatedPathStable: root.querySelector(probe.unrelatedSelector) === probe.path,
        unrelatedMutations: mutations,
        unrelatedVueUpdates: probe.state.unrelatedUpdated,
        incidentLayerVueUpdates: probe.state.layerUpdated,
        unrelatedBarsStable: probe.bars.every((bar: HTMLElement, index: number) => (bar as HTMLElement & { __vueParentComponent?: unknown }).__vueParentComponent === probe.components[index]),
      }
    })
    expect(evidence).toMatchObject({ projectionStable: true, geometryStable: true, unrelatedPathStable: true, unrelatedMutations: 0, unrelatedVueUpdates: 0, unrelatedBarsStable: true })
    expect(evidence.incidentLayerVueUpdates).toBeGreaterThan(0)
    console.log(`P11.4B ${total} pointer evidence: ${JSON.stringify({ projectedRecords: total, projectedEdges: total / 10, loadedTableReads: total / 25, extraRecordRequests: requestEvidence.length, ...evidence })}`)
    expect(api.requests.filter(request => request.method === 'PATCH')).toHaveLength(0)
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await expect(timeline.locator('[data-testid="timeline-dependency-preview"]')).toHaveCount(0)
    expect(p114bRelationPatch(api, relation.id)).toHaveLength(0)
    if (total === 500) expect(await timeline.locator('[data-timeline-row]').count()).toBeLessThanOrEqual(40)
  })
}
