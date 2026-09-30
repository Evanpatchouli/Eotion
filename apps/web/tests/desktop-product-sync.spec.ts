import { _electron as electron, expect, test, type ElectronApplication, type Page, type Route } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import type { BlockResponse, PageResponse } from '@eotion/contracts'

const now = '2026-09-30T00:00:00.000Z'
const user = { id: 'desktop-sync-user', email: 'desktop@example.test', createdAt: now, updatedAt: now }
const workspace = { id: 'desktop-sync-workspace', name: '桌面同步验收', ownerId: user.id, createdAt: now, updatedAt: now }
const preparedPage: PageResponse = {
  id: 'desktop-prepared-page', workspaceId: workspace.id, parentPageId: null,
  title: '已准备页面', orderKey: '0000000000000001', createdAt: now, updatedAt: now,
}

test('Electron SQLite keeps offline product edits through app restart and pushes before pulling', async () => {
  const profile = mkdtempSync(resolve(tmpdir(), 'eotion-p54-electron-'))
  const database = resolve(profile, 'eotion-local.sqlite')
  const server: { pages: PageResponse[]; blocks: BlockResponse[] } = { pages: [preparedPage], blocks: [] }
  const requests: Array<{ method: string; path: string; kind?: string }> = []
  const controls = { disconnected: false, unavailable: 0 }
  const executable = process.platform === 'win32' ? 'electron.exe'
    : process.platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : 'electron'
  const launch = () => electron.launch({
    executablePath: resolve('../desktop/node_modules/electron/dist', executable),
    args: [resolve('../desktop/out/main/index.js'), `--user-data-dir=${profile}`],
    env: { ...process.env, ELECTRON_RENDERER_URL: 'http://127.0.0.1:7173/#/login' },
  })
  const fulfill = (route: Route, status: number, body: unknown) => route.fulfill({
    status, contentType: 'application/json', body: JSON.stringify(body),
  })
  async function mockApi(page: Page): Promise<void> {
    await page.route('**/api/**', async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const method = request.method()
      const body = request.postData() ? request.postDataJSON() : undefined
      requests.push({ method, path, kind: body?.kind })
      if (controls.disconnected) return route.abort('failed')
      if (controls.unavailable) return fulfill(route, controls.unavailable, { statusCode: controls.unavailable, message: 'Unavailable' })
      if (path === '/api/auth/me') return fulfill(route, 200, user)
      if (path === '/api/workspaces' && method === 'GET') return fulfill(route, 200, [workspace])
      if (path === `/api/sync/workspaces/${workspace.id}/snapshot` && method === 'GET') {
        return fulfill(route, 200, server)
      }
      if (path === '/api/sync/operations' && method === 'POST') {
        const operation = body as { id: string; kind: string; payload: PageResponse | BlockResponse }
        if (operation.kind === 'page.upsert') {
          const page = operation.payload as PageResponse
          server.pages = [...server.pages.filter((item) => item.id !== page.id), {
            ...page, workspaceId: workspace.id,
            createdAt: server.pages.find((item) => item.id === page.id)?.createdAt ?? now, updatedAt: now,
          }]
        }
        if (operation.kind === 'block.upsert') {
          const block = operation.payload as BlockResponse
          server.blocks = [...server.blocks.filter((item) => item.id !== block.id), {
            ...block, workspaceId: workspace.id, parentBlockId: block.parentBlockId ?? null,
            createdAt: server.blocks.find((item) => item.id === block.id)?.createdAt ?? now, updatedAt: now,
          }]
        }
        return fulfill(route, 200, { id: operation.id, status: 'applied' })
      }
      return fulfill(route, 404, { statusCode: 404, message: 'Not found' })
    })
  }

  let app: ElectronApplication | undefined
  try {
    app = await launch()
    let page = await app.firstWindow()
    await mockApi(page)
    await page.goto(`http://127.0.0.1:7173/#/app/${workspace.id}/page/${preparedPage.id}`)
    await expect(page.getByRole('heading', { name: preparedPage.title })).toBeVisible()
    await expect(page.locator('.eotion-editor-content .tiptap')).toBeVisible()
    expect(requests.some((request) => request.path.endsWith('/snapshot'))).toBe(true)
    expect(await page.evaluate(async (id) => {
      const desktop = (window as Window & { eotionDesktop?: { storage: { hasWorkspaceSnapshot(id: string): Promise<boolean> } } }).eotionDesktop
      return Boolean(desktop && await desktop.storage.hasWorkspaceSnapshot(id))
    }, workspace.id)).toBe(true)
    expect(existsSync(database)).toBe(true)
    expect(readFileSync(database).subarray(0, 16).toString()).toBe('SQLite format 3\0')

    controls.disconnected = true
    await page.locator('.eotion-editor-content .tiptap').fill('Electron 离线正文')
    await expect(page.getByRole('status').filter({ hasText: '已保存到本地' })).toBeVisible()
    await page.getByRole('button', { name: '新建根页面' }).click()
    await expect(page.getByRole('heading', { name: '无标题' })).toBeVisible()
    const offlinePageId = new URL(page.url()).hash.split('/').at(-1)!
    expect(offlinePageId).not.toBe(preparedPage.id)
    expect(server.pages).toHaveLength(1)
    expect(server.blocks).toHaveLength(0)
    await expect.poll(() => page.evaluate(async () => {
      const desktop = (window as Window & { eotionDesktop?: { storage: { getPendingOperations(): Promise<unknown[]> } } }).eotionDesktop
      return (await desktop?.storage.getPendingOperations())?.length ?? 0
    })).toBeGreaterThanOrEqual(2)

    await app.close()
    // Restart with a reachable network and unavailable API proxy instead of a fetch failure.
    controls.disconnected = false
    controls.unavailable = 502
    app = await launch()
    page = await app.firstWindow()
    await mockApi(page)
    await page.goto(`http://127.0.0.1:7173/#/app/${workspace.id}/page/${preparedPage.id}`)
    await expect(page.locator('.eotion-editor-content .tiptap')).toContainText('Electron 离线正文')
    await expect(page.getByRole('button', { name: /离线 · 本地已保存/ })).toBeVisible()
    await expect(page.locator('.product-page-title')).toContainText(['已准备页面', '无标题'])
    expect(server.pages).toHaveLength(1)
    expect(server.blocks).toHaveLength(0)
    expect(await page.evaluate(async () => {
      const desktop = (window as Window & { eotionDesktop?: { storage: { getPendingOperations(): Promise<unknown[]> } } }).eotionDesktop
      return (await desktop?.storage.getPendingOperations())?.length ?? 0
    })).toBeGreaterThanOrEqual(2)

    const reconnectAt = requests.length
    controls.disconnected = false
    controls.unavailable = 0
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible({ timeout: 20_000 })
    await expect.poll(() => server.pages.some((item) => item.id === offlinePageId)).toBe(true)
    await expect.poll(() => JSON.stringify(server.blocks)).toContain('Electron 离线正文')
    const reconnect = requests.slice(reconnectAt)
    const pushes = reconnect.map((request, index) => request.path === '/api/sync/operations' ? index : -1).filter((index) => index >= 0)
    const snapshot = reconnect.findIndex((request) => request.path.endsWith('/snapshot'))
    expect(pushes.length).toBeGreaterThanOrEqual(2)
    expect(snapshot).toBeGreaterThan(Math.max(...pushes))
    expect(await page.evaluate(async () => {
      const desktop = (window as Window & { eotionDesktop?: { storage: { getPendingOperations(): Promise<unknown[]> } } }).eotionDesktop
      return (await desktop?.storage.getPendingOperations())?.length ?? -1
    })).toBe(0)
  } finally {
    await app?.close()
    rmSync(profile, { recursive: true, force: true })
  }
})
