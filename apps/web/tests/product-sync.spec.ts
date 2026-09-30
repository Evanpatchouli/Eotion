import { expect, test, type Page, type Route } from '@playwright/test'
import type { BlockResponse, PageResponse } from '@eotion/contracts'

const now = '2026-09-30T00:00:00.000Z'
const user = { id: 'sync-user', email: 'sync@example.com', createdAt: now, updatedAt: now }
const workspace = { id: 'sync-workspace', name: '同步工作区', ownerId: user.id, createdAt: now, updatedAt: now }

type Server = { pages: PageResponse[]; blocks: BlockResponse[] }
async function mockApi(page: Page, server: Server = { pages: [], blocks: [] }) {
  const requests: Array<{ path: string; method: string; body?: any }> = []
  const controls = { disconnected: false, failPush: false, auth401: false, auth503: false, holdPush: false, cleanupStatus: 204 }
  let releasePush: (() => void) | null = null
  const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    const body = request.postData() ? request.postDataJSON() : undefined
    requests.push({ path, method, body })
    if (controls.disconnected) return route.abort('failed')
    if (path === '/api/auth/me') {
      if (controls.auth401) return json(route, 401, { statusCode: 401, message: 'Unauthorized' })
      if (controls.auth503) return json(route, 503, { statusCode: 503, message: 'Unavailable' })
      return json(route, 200, user)
    }
    if (path === '/api/workspaces' && method === 'GET') return json(route, 200, [workspace])
    if (path === `/api/sync/workspaces/${workspace.id}/snapshot` && method === 'GET') return json(route, 200, server)
    if (path.startsWith(`/api/workspaces/${workspace.id}/files/`) && method === 'DELETE') {
      if (controls.cleanupStatus === 204) return route.fulfill({ status: 204 })
      return json(route, controls.cleanupStatus, { statusCode: controls.cleanupStatus, message: 'Synthetic cleanup failure' })
    }
    if (path === '/api/sync/operations' && method === 'POST') {
      if (controls.holdPush) await new Promise<void>((resolve) => { releasePush = resolve })
      if (controls.failPush) return json(route, 503, { statusCode: 503, message: 'Sync failed' })
      const op = body as { kind: string; payload: any }
      if (op.kind === 'page.upsert') {
        const old = server.pages.find((item) => item.id === op.payload.id)
        server.pages = server.pages.filter((item) => item.id !== op.payload.id)
        server.pages.push({ id: op.payload.id, workspaceId: workspace.id, parentPageId: op.payload.parentPageId, title: op.payload.title, orderKey: op.payload.orderKey, icon: op.payload.icon ?? undefined, createdAt: old?.createdAt ?? now, updatedAt: now })
      }
      if (op.kind === 'page.delete') {
        server.pages = server.pages.filter((item) => item.id !== op.payload.id)
        server.blocks = server.blocks.filter((item) => item.pageId !== op.payload.id)
      }
      if (op.kind === 'page.move') server.pages = server.pages.map((item) => item.id === op.payload.id ? { ...item, parentPageId: op.payload.parentPageId, orderKey: op.payload.orderKey } : item)
      if (op.kind === 'block.upsert') {
        const old = server.blocks.find((item) => item.id === op.payload.id)
        server.blocks = server.blocks.filter((item) => item.id !== op.payload.id)
        server.blocks.push({ ...op.payload, workspaceId: workspace.id, parentBlockId: op.payload.parentBlockId ?? null, createdAt: old?.createdAt ?? now, updatedAt: now })
      }
      if (op.kind === 'block.delete') server.blocks = server.blocks.filter((item) => item.id !== op.payload.id)
      return json(route, 200, { id: body.id, status: 'applied' })
    }
    return json(route, 404, { statusCode: 404, message: 'Not found' })
  })
  return { server, requests, controls, releasePush: () => releasePush?.() }
}

test('hydrates an empty workspace, keeps offline page edits across reload, then pushes before pulling', async ({ page }) => {
  const api = await mockApi(page)
  await page.goto(`/#/app/${workspace.id}`)
  await expect(page.getByText('还没有页面')).toBeVisible()
  expect(api.requests.some((request) => request.path.endsWith('/snapshot'))).toBe(true)

  api.controls.disconnected = true
  await page.getByRole('button', { name: '新建根页面' }).click()
  await expect(page.getByRole('heading', { name: '无标题' })).toBeVisible()
  const createdId = new URL(page.url()).hash.split('/').at(-1)!
  await page.reload()
  await expect(page.getByRole('heading', { name: '无标题' })).toBeVisible()
  expect(new URL(page.url()).hash).toContain(createdId)

  const beforeReconnect = api.requests.length
  api.controls.disconnected = false
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  const reconnect = api.requests.slice(beforeReconnect)
  expect(reconnect.findIndex((request) => request.path === '/api/sync/operations')).toBeGreaterThanOrEqual(0)
  expect(reconnect.findIndex((request) => request.path.endsWith('/snapshot'))).toBeGreaterThan(reconnect.findIndex((request) => request.path === '/api/sync/operations'))
  expect(api.server.pages.some((item) => item.id === createdId)).toBe(true)
})

test('attachment cleanup waits for delete acknowledgement, survives failure and reload, and accepts 404', async ({ page }) => {
  const server: Server = {
    pages: [{ id: 'attached-page', workspaceId: workspace.id, parentPageId: null, title: '附件页面', orderKey: '1', createdAt: now, updatedAt: now }],
    blocks: [{ id: 'attached-block', workspaceId: workspace.id, pageId: 'attached-page', parentBlockId: null, type: 'file', orderKey: '1',
      props: { node: { type: 'eotionFile', attrs: { fileId: 'owned-file', name: 'notes.txt', mimeType: 'application/octet-stream', size: 12, url: 'https://objects.example.test/notes.txt' } } }, createdAt: now, updatedAt: now }],
  }
  const api = await mockApi(page, server)
  await page.goto(`/#/app/${workspace.id}/page/attached-page`)
  await expect(page.locator('.attachment-file')).toContainText('notes.txt')
  api.controls.failPush = true
  await page.evaluate(async () => {
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    const sync = useProductSyncStore()
    await (await sync.store()).deleteBlock('sync-workspace', 'attached-block')
    sync.localMutation()
  })
  await expect(page.getByRole('button', { name: /同步失败/ })).toBeVisible()
  expect(api.requests.filter((item) => item.method === 'DELETE')).toHaveLength(0)
  api.controls.failPush = false
  api.controls.cleanupStatus = 503
  await page.getByRole('button', { name: /同步失败/ }).click()
  await expect(page.locator('.product-cleanup-status')).toContainText('附件清理暂未完成')
  expect(api.server.blocks).toHaveLength(0)
  await page.reload()
  await expect(page.locator('.attachment-file')).toHaveCount(0)
  await expect(page.locator('.product-cleanup-status')).toContainText('附件清理暂未完成')
  const requestCount = api.requests.filter((item) => item.method === 'DELETE').length
  await page.waitForTimeout(600)
  expect(api.requests.filter((item) => item.method === 'DELETE')).toHaveLength(requestCount)
  api.controls.cleanupStatus = 404
  await page.getByRole('button', { name: '重试清理' }).click()
  await expect(page.locator('.product-cleanup-status')).toHaveCount(0)
  const firstDelete = api.requests.findIndex((item) => item.method === 'DELETE')
  const appliedDelete = api.requests.findIndex((item) => item.path === '/api/sync/operations' && item.body?.kind === 'block.delete')
  expect(firstDelete).toBeGreaterThan(appliedDelete)
})

test('cleanup only sends freshly authorized workspaces and invalidates the session on 401', async ({ page }) => {
  const api = await mockApi(page)
  await page.goto(`/#/app/${workspace.id}`)
  await expect(page.getByText('还没有页面')).toBeVisible()
  await page.evaluate(async () => {
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    const sync = useProductSyncStore()
    const local = await sync.store()
    await local.enqueueFileCleanup('other-account-workspace', 'private-file')
    await local.enqueueFileCleanup('sync-workspace', 'orphan-file')
  })
  api.controls.cleanupStatus = 401
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page).toHaveURL(/#\/login/)
  const deletions = api.requests.filter((item) => item.method === 'DELETE')
  expect(deletions).toHaveLength(1)
  expect(deletions[0]!.path).toBe('/api/workspaces/sync-workspace/files/orphan-file')
  expect(await page.evaluate(() => localStorage.getItem('eotion:last-authenticated-user'))).toBeNull()
})

test('failed push leaves local content and does not pull a stale snapshot', async ({ page }) => {
  const api = await mockApi(page)
  await page.goto(`/#/app/${workspace.id}`)
  await expect(page.getByText('还没有页面')).toBeVisible()
  api.controls.failPush = true
  const beforeEdit = api.requests.length
  await page.getByRole('button', { name: '新建根页面' }).click()
  await expect(page.getByRole('heading', { name: '无标题' })).toBeVisible()
  await expect(page.getByRole('button', { name: /同步失败/ })).toBeVisible()
  const afterEdit = api.requests.slice(beforeEdit)
  expect(afterEdit.some((request) => request.path === '/api/sync/operations')).toBe(true)
  expect(afterEdit.some((request) => request.path.endsWith('/snapshot'))).toBe(false)
  await page.reload()
  await expect(page.getByRole('heading', { name: '无标题' })).toBeVisible()
  api.controls.failPush = false
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
})

test('a confirmed 401 clears cached identity instead of restoring offline access', async ({ page }) => {
  const api = await mockApi(page)
  await page.goto(`/#/app/${workspace.id}`)
  await expect(page.getByText('还没有页面')).toBeVisible()
  api.controls.auth401 = true
  await page.reload()
  await expect(page).toHaveURL(/#\/login/)
  expect(await page.evaluate(() => localStorage.getItem('eotion:last-authenticated-user'))).toBeNull()
})

test('HTTP 503 cannot use cached identity as an offline login', async ({ page }) => {
  const api = await mockApi(page)
  await page.goto(`/#/app/${workspace.id}`)
  await expect(page.getByText('还没有页面')).toBeVisible()
  api.controls.auth503 = true
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('Unavailable')
  await expect(page.getByRole('heading', { name: '无标题' })).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('eotion:last-authenticated-user'))).not.toBeNull()
})

test('a never authenticated offline client cannot enter the product', async ({ page }) => {
  const api = await mockApi(page)
  api.controls.disconnected = true
  await page.goto(`/#/app/${workspace.id}`)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: '新建根页面' })).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('eotion:last-authenticated-user'))).toBeNull()
})

test('offline editor saves blocks locally and restores text after reload', async ({ page }) => {
  const api = await mockApi(page)
  await page.goto(`/#/app/${workspace.id}`)
  await expect(page.getByText('还没有页面')).toBeVisible()
  await page.getByRole('button', { name: '新建根页面' }).click()
  await expect(page.locator('.eotion-editor-content .tiptap')).toBeVisible()
  api.controls.disconnected = true
  const editor = page.locator('.eotion-editor-content .tiptap')
  await editor.click()
  await editor.pressSequentially('离线正文')
  await expect(page.getByRole('status').filter({ hasText: '已保存到本地' })).toBeVisible()
  await page.reload()
  await expect(page.locator('.eotion-editor-content .tiptap')).toContainText('离线正文')
  api.controls.disconnected = false
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect.poll(() => JSON.stringify(api.server.blocks)).toContain('离线正文')
})

test('mobile WebView runtime keeps the same IndexedDB product content offline', async ({ page }) => {
  const api = await mockApi(page)
  await page.goto(`/?eotionRuntime=mobile-webview#/app/${workspace.id}`)
  await expect(page.locator('.product-shell')).toHaveAttribute('data-runtime', 'mobile-webview')
  await expect(page.getByText('还没有页面')).toBeVisible()
  await page.getByRole('button', { name: '新建根页面' }).click()
  api.controls.disconnected = true
  await page.locator('.eotion-editor-content .tiptap').fill('移动 WebView 本地正文')
  await expect(page.getByRole('status').filter({ hasText: '已保存到本地' })).toBeVisible()
  await page.reload()
  await expect(page.locator('.eotion-editor-content .tiptap')).toContainText('移动 WebView 本地正文')
})

test('offline page rename, move and delete stay durable after reload', async ({ page }) => {
  const server: Server = {
    pages: [
      { id: 'page-alpha', workspaceId: workspace.id, parentPageId: null, title: 'Alpha', orderKey: '0000000000000001', createdAt: now, updatedAt: now },
      { id: 'page-bravo', workspaceId: workspace.id, parentPageId: null, title: 'Bravo', orderKey: '0000000000000002', createdAt: now, updatedAt: now },
    ],
    blocks: [],
  }
  const api = await mockApi(page, server)
  await page.goto(`/#/app/${workspace.id}`)
  await expect(page.locator('.product-page-title')).toHaveText(['Alpha', 'Bravo'])
  api.controls.disconnected = true

  await page.getByRole('button', { name: '页面操作：Alpha' }).click()
  await page.getByRole('group', { name: 'Alpha 的操作' }).getByRole('button', { name: '重命名' }).click()
  await page.getByLabel('页面标题').fill('Offline Alpha')
  await page.getByRole('button', { name: '保存标题' }).click()
  await expect(page.locator('.product-page-title')).toHaveText(['Offline Alpha', 'Bravo'])

  await page.getByRole('button', { name: '页面操作：Bravo' }).click()
  await page.getByRole('group', { name: 'Bravo 的操作' }).getByRole('button', { name: '移动' }).click()
  await page.getByLabel('移动到').selectOption('page-alpha')
  await page.getByRole('button', { name: '移动', exact: true }).click()
  await expect(page.getByRole('treeitem', { name: /Bravo/ })).toHaveAttribute('aria-level', '2')

  await page.getByRole('button', { name: '页面操作：Bravo' }).click()
  await page.getByRole('group', { name: 'Bravo 的操作' }).getByRole('button', { name: '删除' }).click()
  await page.getByRole('button', { name: '确认删除' }).click()
  await expect(page.locator('.product-page-title')).toHaveText(['Offline Alpha'])
  await page.reload()
  await expect(page.locator('.product-page-title')).toHaveText(['Offline Alpha'])
  expect(server.pages.map((item) => item.title)).toEqual(['Alpha', 'Bravo'])
})

test('a second client pulls sequential changes and remote deletion removes local pages', async ({ browser, page }) => {
  const first = await mockApi(page)
  await page.goto(`/#/app/${workspace.id}`)
  await expect(page.getByText('还没有页面')).toBeVisible()
  await page.getByRole('button', { name: '新建根页面' }).click()
  await expect(page.getByRole('heading', { name: '无标题' })).toBeVisible()
  await expect.poll(() => first.server.pages.length).toBe(1)
  const secondContext = await browser.newContext()
  try {
    const secondPage = await secondContext.newPage()
    await mockApi(secondPage, first.server)
    await secondPage.goto(`/#/app/${workspace.id}`)
    await expect(secondPage.locator('.product-page-title')).toHaveText('无标题')
    first.server.pages.splice(0)
    await secondPage.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(secondPage.getByText('还没有页面')).toBeVisible()
  } finally { await secondContext.close() }
})

test('a clean active editor reloads a remote block change on focus', async ({ browser, page }) => {
  const first = await mockApi(page)
  await page.goto(`/#/app/${workspace.id}`)
  await expect(page.getByText('还没有页面')).toBeVisible()
  await page.getByRole('button', { name: '新建根页面' }).click()
  await expect(page).toHaveURL(/\/page\//)
  const pageId = new URL(page.url()).hash.split('/').at(-1)!
  const firstEditor = page.locator('.eotion-editor-content .tiptap')
  await firstEditor.click()
  await firstEditor.pressSequentially('Client A')
  await expect.poll(() => JSON.stringify(first.server.blocks)).toContain('Client A')

  const secondContext = await browser.newContext()
  try {
    const secondPage = await secondContext.newPage()
    await mockApi(secondPage, first.server)
    await secondPage.goto(`/#/app/${workspace.id}/page/${pageId}`)
    const secondEditor = secondPage.locator('.eotion-editor-content .tiptap')
    await expect(secondEditor).toContainText('Client A')
    await secondEditor.click()
    await secondEditor.press('Control+A')
    await secondEditor.pressSequentially('Client B')
    await expect.poll(() => JSON.stringify(first.server.blocks)).toContain('Client B')
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(firstEditor).toContainText('Client B')
  } finally { await secondContext.close() }
})

test('switching identity during a push cannot send the next old-account operation', async ({ page }) => {
  const api = await mockApi(page)
  await page.goto(`/#/app/${workspace.id}`)
  await expect(page.getByText('还没有页面')).toBeVisible()
  api.controls.disconnected = true
  await page.getByRole('button', { name: '新建根页面' }).click()
  await expect(page.getByRole('heading', { name: '无标题' })).toBeVisible()
  await page.getByRole('button', { name: '新建根页面' }).click()
  await expect(page.locator('.product-page-title')).toHaveCount(2)

  api.controls.disconnected = false
  api.controls.holdPush = true
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect.poll(() => api.requests.filter((request) => request.path === '/api/sync/operations').length).toBe(1)
  await page.evaluate(async () => {
    const [{ useAuthStore }, { useProductSyncStore }] = await Promise.all([
      import('/src/stores/auth.ts'), import('/src/stores/productSync.ts'),
    ])
    useAuthStore().user = { id: 'other-user', email: 'other@example.com', createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T00:00:00.000Z' }
    useProductSyncStore().configure('other-user', false)
  })
  api.controls.holdPush = false
  api.releasePush()
  await page.waitForTimeout(350)
  expect(api.requests.filter((request) => request.path === '/api/sync/operations')).toHaveLength(1)
})
