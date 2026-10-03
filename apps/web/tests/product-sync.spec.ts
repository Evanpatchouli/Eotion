import { expect, test, type Page, type Route } from '@playwright/test'
import type { BlockResponse, PageResponse } from '@eotion/contracts'

const now = '2026-09-30T00:00:00.000Z'
const user = { id: 'sync-user', email: 'sync@example.com', createdAt: now, updatedAt: now }
const workspace = { id: 'sync-workspace', name: '同步工作区', ownerId: user.id, createdAt: now, updatedAt: now }

type Server = { pages: PageResponse[]; blocks: BlockResponse[] }
async function mockApi(page: Page, server: Server = { pages: [], blocks: [] }) {
  const requests: Array<{ path: string; method: string; body?: any }> = []
  const controls = { disconnected: false, unavailable: 0, authStatus: 0, workspaceStatus: 0, failPush: false, auth401: false, holdPush: false, cleanupStatus: 204 }
  let releasePush: (() => void) | null = null
  const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    const body = request.postData() ? request.postDataJSON() : undefined
    requests.push({ path, method, body })
    if (controls.disconnected) return route.abort('failed')
    if (controls.unavailable) return json(route, controls.unavailable, { statusCode: controls.unavailable, message: 'Unavailable' })
    if (path === '/api/auth/me') {
      if (controls.auth401) return json(route, 401, { statusCode: 401, message: 'Unauthorized' })
      if (controls.authStatus) return json(route, controls.authStatus, { statusCode: controls.authStatus, message: 'Unavailable' })
      return json(route, 200, user)
    }
    if (path === '/api/workspaces' && method === 'GET') return json(route, controls.workspaceStatus || 200, controls.workspaceStatus ? { statusCode: controls.workspaceStatus, message: 'Unavailable' } : [workspace])
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
  await expect(page.getByRole('button', { name: /离线 · 本地已保存/ })).toBeVisible()
  expect(api.requests.filter((item) => item.method === 'DELETE')).toHaveLength(0)
  api.controls.failPush = false
  api.controls.cleanupStatus = 503
  await page.getByRole('button', { name: /离线 · 本地已保存/ }).click()
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
  await expect(page.getByRole('button', { name: /离线 · 本地已保存/ })).toBeVisible()
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

for (const status of [400, 403, 404, 501, 505]) test(`HTTP ${status} cannot use cached identity as an offline login`, async ({ page }) => {
  const api = await mockApi(page)
  await page.goto(`/#/app/${workspace.id}`)
  await expect(page.getByText('还没有页面')).toBeVisible()
  api.controls.authStatus = status
  await page.reload()
  await expect(page.getByRole('heading', { name: '暂时无法连接 Eotion' })).toBeVisible()
  await expect(page.locator('.product-shell')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '无标题' })).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('eotion:last-authenticated-user'))).not.toBeNull()
})

for (const status of [401, 403]) test(`HTTP ${status} cannot use cached identity even with a 500 error body`, async ({ page }) => {
  await mockApi(page)
  await page.goto(`/#/app/${workspace.id}`)
  await expect(page.getByText('还没有页面')).toBeVisible()
  await page.route('**/api/auth/me', (route) => route.fulfill({
    status, contentType: 'application/json', body: JSON.stringify({ statusCode: 500, message: 'Mismatched body' }),
  }))
  await page.reload()
  if (status === 401) {
    await expect(page).toHaveURL(/#\/login/)
    expect(await page.evaluate(() => localStorage.getItem('eotion:last-authenticated-user'))).toBeNull()
  } else {
    await expect(page.getByRole('heading', { name: '暂时无法连接 Eotion' })).toBeVisible()
  }
  await expect(page.locator('.product-shell')).toHaveCount(0)
})

test('HTTP 500 uses cached identity offline and restores the authenticated product on recovery', async ({ page }) => {
  const api = await mockApi(page)
  await page.goto(`/#/app/${workspace.id}`)
  await expect(page.getByText('还没有页面')).toBeVisible()
  api.controls.authStatus = 500
  await page.reload()
  await expect(page.getByText('还没有页面')).toBeVisible()
  await expect(page.getByRole('button', { name: /离线 · 本地已保存/ })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('eotion:last-authenticated-user'))).not.toBeNull()

  api.controls.authStatus = 0
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  await expect(page.getByRole('button', { name: /离线 · 本地已保存/ })).toHaveCount(0)
})

test('a never authenticated offline client cannot enter the product', async ({ page }) => {
  const api = await mockApi(page)
  api.controls.disconnected = true
  await page.goto(`/#/app/${workspace.id}`)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: '新建根页面' })).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('eotion:last-authenticated-user'))).toBeNull()
})

for (const failure of ['network', 500, 502, 503, 504] as const) test(`backend ${failure} restores the local product and recovers without reload`, async ({ page }) => {
  const api = await mockApi(page)
  await page.goto(`/#/app/${workspace.id}`)
  await expect(page.getByText('还没有页面')).toBeVisible()
  await page.getByRole('button', { name: '新建根页面' }).click()
  const editor = page.locator('.eotion-editor-content .tiptap')
  await editor.fill('原有本地正文')
  await expect.poll(() => JSON.stringify(api.server.blocks)).toContain('原有本地正文')
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  api.controls.disconnected = failure === 'network'
  api.controls.unavailable = failure === 'network' ? 0 : failure
  await page.reload()
  await expect(editor).toContainText('原有本地正文')
  await expect(page.locator('.product-page-title')).toContainText('无标题')
  await expect(page.getByRole('button', { name: /离线 · 本地已保存/ })).toBeVisible()
  await editor.fill('恢复前本地编辑')
  await expect.poll(() => page.evaluate(async () => {
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    const local = await useProductSyncStore().store()
    return JSON.stringify(await local.listBlocksByPage(location.hash.split('/').at(-1)!))
  })).toContain('恢复前本地编辑')
  const pending = () => page.evaluate(async () => {
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    return (await (await useProductSyncStore().store()).getPendingOperations()).length
  })
  await expect.poll(pending).toBeGreaterThan(0)
  expect(JSON.stringify(api.server.blocks)).not.toContain('恢复前本地编辑')
  const reconnectAt = api.requests.length
  api.controls.disconnected = false
  api.controls.unavailable = 0
  const synced = page.getByRole('status').filter({ hasText: '已同步' })
  const retry = page.getByRole('button', { name: /离线 · 本地已保存/ })
  if (await retry.isVisible()) {
    try {
      await retry.click({ timeout: 3000 })
    } catch {
      // A pending attention sync can remove the retry button as the click starts.
      await expect(synced).toBeVisible()
    }
  }
  await expect(synced).toBeVisible()
  await expect(editor).toContainText('恢复前本地编辑')
  expect(JSON.stringify(api.server.blocks)).toContain('恢复前本地编辑')
  expect(await pending()).toBe(0)
  const reconnect = api.requests.slice(reconnectAt)
  const lastPush = reconnect.map((r, i) => r.path === '/api/sync/operations' ? i : -1).reduce((a, b) => Math.max(a, b), -1)
  expect(lastPush).toBeGreaterThanOrEqual(0)
  expect(reconnect.findIndex((r) => r.path.endsWith('/snapshot'))).toBeGreaterThan(lastPush)
})

for (const status of [500, 502, 503, 504]) test(`workspace list ${status} restores only the current account cache`, async ({ page }) => {
  const api = await mockApi(page)
  await page.goto(`/#/app/${workspace.id}`)
  await expect(page.getByText('还没有页面')).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  await page.evaluate(() => localStorage.setItem('eotion:workspaces:other-user', JSON.stringify([{ id: 'private', name: 'Other private', ownerId: 'other-user' }])))
  api.controls.workspaceStatus = status
  await page.reload()
  await expect(page.getByText('还没有页面')).toBeVisible()
  await expect(page.getByRole('button', { name: /离线 · 本地已保存/ })).toBeVisible()
  await expect(page.getByText('Other private')).toHaveCount(0)
})

for (const status of [400, 403, 501, 505]) test(`workspace list ${status} cannot fall back to cached permissions`, async ({ page }) => {
  const api = await mockApi(page)
  await page.goto(`/#/app/${workspace.id}`)
  await expect(page.getByText('还没有页面')).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  api.controls.workspaceStatus = status
  await page.reload()
  await expect(page.getByRole('heading', { name: '暂时无法加载工作区' })).toBeVisible()
  await expect(page.locator('.product-page-title')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /离线 · 本地已保存/ })).toHaveCount(0)
})

test('cached identity with no workspace snapshot refuses to invent an empty workspace', async ({ page }) => {
  const api = await mockApi(page)
  api.controls.unavailable = 500
  await page.addInitScript(({ user, workspace }) => {
    localStorage.setItem('eotion:last-authenticated-user', JSON.stringify(user))
    localStorage.setItem(`eotion:workspaces:${user.id}`, JSON.stringify([workspace]))
  }, { user, workspace })
  await page.goto(`/#/app/${workspace.id}/page/not-hydrated`)
  await expect(page.getByRole('region', { name: '暂时无法加载页面' }).getByRole('alert')).toHaveText('此工作区尚未保存到本机，当前离线无法打开。')
  await expect(page.locator('.eotion-editor-content .tiptap')).toHaveCount(0)
  await expect(page.getByText('还没有页面')).toHaveCount(0)
  api.controls.unavailable = 0
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByText('还没有页面')).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
})

test('workspace list unavailable without local cache can recover on attention', async ({ page }) => {
  const api = await mockApi(page)
  api.controls.workspaceStatus = 503
  await page.goto(`/#/app/${workspace.id}`)
  await expect(page.getByRole('heading', { name: '暂时无法加载工作区' })).toBeVisible()
  await expect(page.getByRole('button', { name: /离线 · 本地已保存/ })).toBeVisible()
  api.controls.workspaceStatus = 0
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByText('还没有页面')).toBeVisible()
})

test('offline identity without workspace metadata recovers using the workspace retry button', async ({ page }) => {
  const api = await mockApi(page)
  api.controls.unavailable = 502
  await page.addInitScript((user) => localStorage.setItem('eotion:last-authenticated-user', JSON.stringify(user)), user)
  await page.goto(`/#/app/${workspace.id}`)
  const state = page.getByRole('region', { name: '暂时无法加载工作区' })
  await expect(state).toBeVisible()
  api.controls.unavailable = 0
  await state.getByRole('button', { name: '重试', exact: true }).click()
  await expect(page.getByText('还没有页面')).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
})

for (const reducedMotion of ['no-preference', 'reduce'] as const) test(`HTTP 500 without identity shows accessible responsive connectivity UI (${reducedMotion}) and retry restores the product`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  const api = await mockApi(page)
  api.controls.unavailable = 500
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/app')
  await expect(page.getByRole('heading', { name: '暂时无法连接 Eotion' })).toBeVisible()
  await expect(page.getByText('无法验证登录状态，请检查服务或网络后重试')).toBeVisible()
  await expect(page.locator('.product-shell')).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('eotion:last-authenticated-user'))).toBeNull()
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  const diagnostics = page.locator('.connectivity-diagnostics')
  const summary = diagnostics.locator('summary')
  const iconPath = () => summary.locator('svg path').getAttribute('d')
  const textX = () => summary.evaluate((node) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
    let textNode: Text | null = null
    while (walker.nextNode()) {
      if (walker.currentNode.textContent?.includes('查看诊断信息')) {
        textNode = walker.currentNode as Text
        break
      }
    }
    if (!textNode) return null
    const range = document.createRange()
    range.selectNodeContents(textNode)
    return range.getBoundingClientRect().x
  })
  const collapsedX = await textX()
  await expect.poll(iconPath).toBe('M9 18C11 16 13 14 15 12C13 10 11 8 9 6')
  expect(await summary.evaluate((node) => getComputedStyle(node).listStyleType)).toBe('none')
  const idleBackground = await summary.evaluate((node) => getComputedStyle(node).backgroundColor)
  if (process.env.EOTION_VISUAL_QA_DIR) await page.screenshot({ path: `${process.env.EOTION_VISUAL_QA_DIR}/connectivity-500-${reducedMotion}-collapsed.png` })

  await summary.hover()
  expect(await summary.evaluate((node) => node.matches(':hover'))).toBe(true)
  expect(await summary.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe(idleBackground)
  await summary.focus()
  expect(await summary.evaluate((node) => node.matches(':focus'))).toBe(true)
  await summary.press('Enter')
  expect(await summary.evaluate((node) => node.matches(':focus-visible'))).toBe(true)
  expect(await summary.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('solid')
  await expect(diagnostics).toHaveAttribute('open', '')
  await expect.poll(iconPath).toBe('M6 9C8 11 10 13 12 15C14 13 16 11 18 9')
  expect(await textX()).toBe(collapsedX)
  if (process.env.EOTION_VISUAL_QA_DIR) await page.screenshot({ path: `${process.env.EOTION_VISUAL_QA_DIR}/connectivity-500-${reducedMotion}-expanded.png` })
  await summary.press('Space')
  await expect(diagnostics).not.toHaveAttribute('open', '')
  await summary.press('Space')
  await expect(diagnostics).toHaveAttribute('open', '')
  expect(await textX()).toBe(collapsedX)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.setViewportSize({ width: 1366, height: 900 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  if (process.env.EOTION_VISUAL_QA_DIR) await page.screenshot({ path: `${process.env.EOTION_VISUAL_QA_DIR}/connectivity-500-${reducedMotion}-desktop.png` })
  expect(pageErrors).toEqual([])

  api.controls.unavailable = 0
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(page.getByText('还没有页面')).toBeVisible()
})

for (const status of [500, 502, 503]) test(`open editor survives backend ${status} and keeps local operations`, async ({ page }) => {
  const api = await mockApi(page)
  await page.goto(`/#/app/${workspace.id}`)
  await expect(page.getByText('还没有页面')).toBeVisible()
  await page.getByRole('button', { name: '新建根页面' }).click()
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  api.controls.unavailable = status
  const editor = page.locator('.eotion-editor-content .tiptap')
  await editor.fill('服务失联仍可编辑')
  await expect.poll(() => page.evaluate(async () => {
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    const local = await useProductSyncStore().store()
    return JSON.stringify(await local.listBlocksByPage(location.hash.split('/').at(-1)!))
  })).toContain('服务失联仍可编辑')
  await expect(page.getByRole('button', { name: /离线 · 本地已保存/ })).toBeVisible()
  await expect(editor).toContainText('服务失联仍可编辑')
  await editor.evaluate((node) => node.setAttribute('data-retained-editor', 'yes'))
  await page.evaluate(async () => {
    const { useAuthStore } = await import('/src/stores/auth.ts')
    await useAuthStore().retryRestore()
  })
  await expect(editor).toHaveAttribute('data-retained-editor', 'yes')
  await page.reload()
  await expect(editor).toContainText('服务失联仍可编辑')
  api.controls.unavailable = 0
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  expect(JSON.stringify(api.server.blocks)).toContain('服务失联仍可编辑')
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
  await expect.poll(() => page.evaluate(async () => {
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    const local = await useProductSyncStore().store()
    return JSON.stringify(await local.listBlocksByPage(location.hash.split('/').at(-1)!))
  })).toContain('离线正文')
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
  const editor = page.locator('.eotion-editor-content .tiptap')
  await editor.fill('移动 WebView 本地正文')
  await expect.poll(() => page.evaluate(async () => {
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    const local = await useProductSyncStore().store()
    return JSON.stringify(await local.listBlocksByPage(location.hash.split('/').at(-1)!))
  })).toContain('移动 WebView 本地正文')
  await page.reload()
  await expect(editor).toContainText('移动 WebView 本地正文')
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
  await page.getByRole('menu', { name: 'Alpha 的操作' }).getByRole('menuitem', { name: '重命名' }).click()
  await page.getByLabel('页面标题').fill('Offline Alpha')
  await page.getByRole('button', { name: '保存标题' }).click()
  await expect(page.locator('.product-page-title')).toHaveText(['Offline Alpha', 'Bravo'])

  await page.getByRole('button', { name: '页面操作：Bravo' }).click()
  await page.getByRole('menu', { name: 'Bravo 的操作' }).getByRole('menuitem', { name: '移动' }).click()
  await page.getByRole('radiogroup', { name: '移动到' }).getByRole('radio', { name: 'Offline Alpha', exact: true }).check()
  await page.getByRole('button', { name: '移动', exact: true }).click()
  await expect(page.getByRole('treeitem', { name: /Bravo/ })).toHaveAttribute('aria-level', '2')

  await page.getByRole('button', { name: '页面操作：Bravo' }).click()
  await page.getByRole('menu', { name: 'Bravo 的操作' }).getByRole('menuitem', { name: '删除' }).click()
  await page.getByRole('dialog', { name: '删除页面？' }).getByRole('button', { name: '删除', exact: true }).click()
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
