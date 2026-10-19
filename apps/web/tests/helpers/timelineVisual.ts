import type { AuthUserDto, BlockResponse, DatabasePropertyResponse, DatabaseResponse, DatabaseViewRecordsResponse, DatabaseViewResponse, PageResponse, WorkspaceResponse } from '@eotion/contracts'
import { DEFAULT_DATABASE_VIEW_CONFIG, type DatabaseViewConfig } from '@eotion/domain/database'
import type { Page, Route } from '@playwright/test'

export const timelineVisualNow = '2026-10-19T04:00:00.000Z'
const workspaceId = 'timeline-visual-workspace'
const pageId = 'timeline-visual-page'
const databaseId = 'timeline-visual-database'
const viewId = 'timeline-visual-view'
const blockId = 'timeline-visual-block'
const datePropertyId = 'timeline-visual-date'
const titlePropertyId = 'timeline-visual-title'
const statusPropertyId = 'timeline-visual-status'
const dependencyPropertyId = 'timeline-visual-dependency'

const user: AuthUserDto = {
  id: 'timeline-visual-user', email: 'timeline@example.com', displayName: 'Timeline User',
  createdAt: timelineVisualNow, updatedAt: timelineVisualNow,
}
const workspace: WorkspaceResponse = {
  id: workspaceId, name: 'Quiet Studio', ownerId: user.id,
  createdAt: timelineVisualNow, updatedAt: timelineVisualNow,
}
const hostPage: PageResponse = {
  id: pageId, workspaceId, parentPageId: null, title: '产品发布计划', orderKey: '0000000000000001',
  createdAt: timelineVisualNow, updatedAt: timelineVisualNow,
}
const database: DatabaseResponse = {
  id: databaseId, workspaceId, name: '产品发布', version: 1,
  createdAt: timelineVisualNow, updatedAt: timelineVisualNow,
}
const properties: DatabasePropertyResponse[] = [
  { id: titlePropertyId, databaseId, workspaceId, name: '名称', type: 'title', version: 1, createdAt: timelineVisualNow, updatedAt: timelineVisualNow },
  { id: datePropertyId, databaseId, workspaceId, name: '日期', type: 'date', version: 1, createdAt: timelineVisualNow, updatedAt: timelineVisualNow },
  { id: statusPropertyId, databaseId, workspaceId, name: '状态', type: 'select', version: 1, options: [{ id: 'status-progress', name: '进行中' }, { id: 'status-ready', name: '已就绪' }], createdAt: timelineVisualNow, updatedAt: timelineVisualNow },
  { id: dependencyPropertyId, databaseId, workspaceId, name: '依赖', type: 'relation', version: 1, config: { targetDatabaseId: databaseId }, createdAt: timelineVisualNow, updatedAt: timelineVisualNow },
]

function timelineConfig(): DatabaseViewConfig {
  return {
    ...DEFAULT_DATABASE_VIEW_CONFIG,
    visibleProperties: [titlePropertyId, statusPropertyId],
    propertyOrder: [titlePropertyId, statusPropertyId],
    options: {
      timeline: {
        scale: 'month',
        dateSource: { mode: 'date-property', propertyId: datePropertyId },
        frozenTable: { visible: true, visibleProperties: [titlePropertyId, statusPropertyId], propertyOrder: [titlePropertyId, statusPropertyId] },
        dependency: { propertyId: dependencyPropertyId, direction: 'depends-on', shiftMode: 'no_auto_shift', avoidWeekends: false },
      },
    },
  }
}

const view: DatabaseViewResponse = {
  id: viewId, databaseId, workspaceId, name: '时间轴', type: 'timeline', config: timelineConfig(), version: 1,
  createdAt: timelineVisualNow, updatedAt: timelineVisualNow,
}
const databaseBlock: BlockResponse = {
  id: blockId, workspaceId, pageId, parentBlockId: null, type: 'database', orderKey: '0000000000000001',
  createdAt: timelineVisualNow, updatedAt: timelineVisualNow,
  props: { node: { type: 'eotionDatabase', attrs: { databaseId, viewId } } },
}

const scheduledRecords: DatabaseViewRecordsResponse['records'] = [
  { id: 'timeline-foundation', databaseId, workspaceId, pageId: 'timeline-foundation-page', properties: { [titlePropertyId]: '产品范围确认', [datePropertyId]: { start: '2026-10-15', end: '2026-10-19' }, [statusPropertyId]: 'status-ready', [dependencyPropertyId]: [] }, version: 1, pageVersion: timelineVisualNow, createdAt: timelineVisualNow, updatedAt: timelineVisualNow },
  { id: 'timeline-integration', databaseId, workspaceId, pageId: 'timeline-integration-page', properties: { [titlePropertyId]: '接口联调', [datePropertyId]: { start: '2026-10-19', end: '2026-10-23' }, [statusPropertyId]: 'status-progress', [dependencyPropertyId]: ['timeline-foundation'] }, version: 1, pageVersion: timelineVisualNow, createdAt: timelineVisualNow, updatedAt: timelineVisualNow },
  { id: 'timeline-short', databaseId, workspaceId, pageId: 'timeline-short-page', properties: { [titlePropertyId]: '文案校对', [datePropertyId]: { start: '2026-10-20', end: '2026-10-21' }, [statusPropertyId]: 'status-progress', [dependencyPropertyId]: [] }, version: 1, pageVersion: timelineVisualNow, createdAt: timelineVisualNow, updatedAt: timelineVisualNow },
  { id: 'timeline-point', databaseId, workspaceId, pageId: 'timeline-point-page', properties: { [titlePropertyId]: '上线评审', [datePropertyId]: '2026-10-23', [statusPropertyId]: 'status-ready', [dependencyPropertyId]: [] }, version: 1, pageVersion: timelineVisualNow, createdAt: timelineVisualNow, updatedAt: timelineVisualNow },
  { id: 'timeline-unscheduled', databaseId, workspaceId, pageId: 'timeline-unscheduled-page', properties: { [titlePropertyId]: '发布复盘', [statusPropertyId]: 'status-ready', [dependencyPropertyId]: [] }, version: 1, pageVersion: timelineVisualNow, createdAt: timelineVisualNow, updatedAt: timelineVisualNow },
]

export async function installTimelineVisualApi(page: Page, allUnscheduled = false): Promise<void> {
  const recordPages: PageResponse[] = scheduledRecords.map(record => ({
    ...hostPage, id: record.pageId, title: String(record.properties[titlePropertyId]), role: 'database-record',
  }))
  const records = allUnscheduled
    ? scheduledRecords.map(record => {
      const properties = { ...record.properties }
      delete properties[datePropertyId]
      return { ...record, properties }
    })
    : scheduledRecords

  await page.route('**/api/**', async (route: Route) => {
    const { pathname } = new URL(route.request().url())
    const method = route.request().method()
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

    if (pathname === '/api/auth/me' && method === 'GET') return json(200, user)
    if (pathname === '/api/workspaces' && method === 'GET') return json(200, [workspace])
    if (pathname === `/api/sync/workspaces/${workspaceId}/snapshot` && method === 'GET') {
      return json(200, { pages: [hostPage, ...recordPages], blocks: [databaseBlock] })
    }
    if (pathname === `/api/workspaces/${workspaceId}/database-navigation` && method === 'GET') {
      return json(200, { items: [{ id: databaseId, workspaceId, name: database.name, parentPageId: pageId, orderKey: '000000000000000000000000000001', viewId }], nextCursor: null })
    }
    if (pathname === `/api/workspaces/${workspaceId}/databases` && method === 'GET') return json(200, { items: [database], nextCursor: null })
    if (pathname === `/api/workspaces/${workspaceId}/databases/${databaseId}/views` && method === 'GET') return json(200, [view])
    if ((pathname === `/api/workspaces/${workspaceId}/databases/${databaseId}/views/${viewId}/records`
      || pathname === `/api/workspaces/${workspaceId}/databases/${databaseId}/views/${viewId}/table`) && method === 'GET') {
      const response: DatabaseViewRecordsResponse = { database, view, properties, records, nextCursor: null }
      return json(200, response)
    }
    return json(404, { statusCode: 404, message: 'Not found', error: 'Not Found' })
  })
}

export async function openTimelineVisual(page: Page, options: { width: number; height: number; theme: 'light' | 'dark'; allUnscheduled?: boolean }): Promise<void> {
  await page.clock.install({ time: new Date(timelineVisualNow) })
  await page.setViewportSize({ width: options.width, height: options.height })
  await page.emulateMedia({ colorScheme: options.theme, reducedMotion: 'reduce' })
  await page.addInitScript(theme => localStorage.setItem('eotion:theme', theme), options.theme)
  await installTimelineVisualApi(page, options.allUnscheduled)
  await page.goto(`/?visual=timeline-${options.width}-${options.height}-${options.theme}#/app/${workspaceId}/page/${pageId}`)
}

export const timelineVisualSelectors = {
  blockId,
}
