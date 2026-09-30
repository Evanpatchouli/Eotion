import { expect, test, type Locator, type Page, type Route } from '@playwright/test'
import type { AuthUserDto, PageResponse, WorkspaceResponse } from '@eotion/contracts'

const now = '2026-09-30T00:00:00.000Z'
const later = '2027-09-30T00:00:00.000Z'

const ava: AuthUserDto = { id: 'user-ava', email: 'ava@example.com', createdAt: now, updatedAt: now }

/** Mirrors the client's fixed-width order key so assertions read the real wire value. */
function key(value: number): string {
  return String(value).padStart(16, '0')
}

function workspace(id: string, name: string): WorkspaceResponse {
  return { id, name, ownerId: ava.id, createdAt: now, updatedAt: now }
}

function pageRecord(id: string, workspaceId: string, title: string, parentPageId: string | null, orderKey: string): PageResponse {
  return { id, workspaceId, parentPageId, title, orderKey, createdAt: now, updatedAt: now }
}

type MockOptions = {
  workspaces?: WorkspaceResponse[]
  pages?: PageResponse[]
}

type PageControls = {
  snapshotFailures: number
  snapshotDelayMs: number
  pushFailures: number
  pushDelayMs: number
}

async function installApi(page: Page, options: MockOptions = {}) {
  const workspaces = [...(options.workspaces ?? [])]
  const pages = [...(options.pages ?? [])]
  const controls: PageControls = {
    snapshotFailures: 0,
    snapshotDelayMs: 0,
    pushFailures: 0,
    pushDelayMs: 0,
  }
  const requests: Array<{ method: string; path: string; body?: unknown }> = []
  const wait = async (milliseconds: number) => {
    if (milliseconds > 0) await new Promise((resolve) => setTimeout(resolve, milliseconds))
  }
  const json = async (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  const fail = (status: number, message: string) => ({ statusCode: status, message, error: status < 500 ? 'Bad Request' : 'Internal Server Error' })
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    let body: unknown
    if (request.postData()) {
      try { body = request.postDataJSON() } catch { body = undefined }
    }
    requests.push({ method, path, body })

    if (path === '/api/auth/me' && method === 'GET') return json(route, 200, ava)
    if (path === '/api/workspaces' && method === 'GET') return json(route, 200, workspaces)
    const snapshotMatch = path.match(/^\/api\/sync\/workspaces\/([^/]+)\/snapshot$/)
    if (snapshotMatch && method === 'GET') {
      await wait(controls.snapshotDelayMs)
      if (controls.snapshotFailures > 0) {
        controls.snapshotFailures -= 1
        return json(route, 503, fail(503, 'Snapshot failed'))
      }
      const workspaceId = decodeURIComponent(snapshotMatch[1]!)
      return json(route, 200, { pages: pages.filter((record) => record.workspaceId === workspaceId), blocks: [] })
    }
    if (path === '/api/sync/operations' && method === 'POST') {
      await wait(controls.pushDelayMs)
      if (controls.pushFailures > 0) {
        controls.pushFailures -= 1
        return json(route, 503, fail(503, 'Sync failed'))
      }
      const operation = body as { id: string; kind: string; payload: Record<string, unknown> }
      const payload = operation.payload
      const id = String(payload.id)
      if (operation.kind === 'page.upsert') {
        const existing = pages.find((record) => record.id === id)
        const created: PageResponse = {
          id, workspaceId: String(operation.workspaceId), parentPageId: payload.parentPageId as string | null,
          title: String(payload.title), orderKey: String(payload.orderKey), createdAt: existing?.createdAt ?? now, updatedAt: later,
        }
        const index = pages.findIndex((record) => record.id === id)
        if (index < 0) pages.push(created); else pages[index] = created
      } else if (operation.kind === 'page.move') {
        const record = pages.find((item) => item.id === id)
        if (record) { record.parentPageId = payload.parentPageId as string | null; record.orderKey = String(payload.orderKey); record.updatedAt = later }
      } else if (operation.kind === 'page.delete') {
        const index = pages.findIndex((record) => record.id === id)
        if (index >= 0) pages.splice(index, 1)
      }
      return json(route, 200, { id: operation.id, status: 'applied' })
    }

    return json(route, 404, fail(404, 'Not found'))
  })

  return { controls, pages, workspaces, requests }
}

/** The tree item whose page link carries exactly this title. */
function treeItem(page: Page, title: string): Locator {
  return page.locator('[role="treeitem"]').filter({ has: page.getByRole('button', { name: title, exact: true }) })
}

async function openPageMenu(page: Page, title: string): Promise<void> {
  await treeItem(page, title).getByRole('button', { name: `页面操作：${title}` }).click()
}

async function openAction(page: Page, title: string, action: string): Promise<void> {
  await openPageMenu(page, title)
  await page.locator('.product-page-menu').getByRole('button', { name: action }).click()
}

test('shows an empty page tree, then creates a root page and opens it', async ({ page }) => {
  const api = await installApi(page, { workspaces: [workspace('ws-a', 'Ava space')] })
  await page.goto('/#/app')
  await expect(page).toHaveURL(/#\/app\/ws-a$/)
  await expect(page.getByText('还没有页面')).toBeVisible()
  await expect(page.getByRole('button', { name: '新建根页面' })).toBeEnabled()

  await page.getByRole('button', { name: '新建根页面' }).click()
  await expect(page).toHaveURL(/#\/app\/ws-a\/page\/[^/]+$/)
  await expect(page.getByRole('heading', { level: 1, name: '无标题' })).toBeVisible()
  await expect(treeItem(page, '无标题').getByRole('button', { name: '无标题', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect.poll(() => api.pages).toHaveLength(1)
  expect(api.pages[0]).toMatchObject({ workspaceId: 'ws-a', parentPageId: null, title: '无标题', orderKey: key(1) })
  expect(api.requests.find((request) => request.path === '/api/sync/operations' && (request.body as any)?.kind === 'page.upsert')?.body).toMatchObject({ payload: { parentPageId: null, title: '无标题' } })
})

for (const { name, orderKeys, expectedKey } of [
  { name: 'canonical', orderKeys: [key(1), key(2)], expectedKey: key(3) },
  { name: 'legacy letters', orderKeys: ['a', 'b'], expectedKey: 'b0' },
  { name: 'unpadded numbers', orderKeys: ['1', '2', '10'], expectedKey: '20' },
]) {
  test(`appends a root page after ${name} order keys`, async ({ page }) => {
    const api = await installApi(page, {
      workspaces: [workspace('ws-a', 'Ava space')],
      pages: orderKeys.map((orderKey, index) => pageRecord(`page-${index}`, 'ws-a', `Existing ${index}`, null, orderKey)),
    })
    await page.goto('/#/app/ws-a')
    await expect(page.getByRole('button', { name: '新建根页面' })).toBeEnabled()
    await page.getByRole('button', { name: '新建根页面' }).click()
    await expect(page.locator('.product-page-link .product-page-title').last()).toHaveText('无标题')
    await expect.poll(() => api.pages.at(-1)?.orderKey).toBe(expectedKey)
  })
}

test('keeps appending after legacy keys across consecutive creates', async ({ page }) => {
  const api = await installApi(page, {
    workspaces: [workspace('ws-a', 'Ava space')],
    pages: [pageRecord('page-a', 'ws-a', 'Alpha', null, 'a'), pageRecord('page-b', 'ws-a', 'Bravo', null, 'b')],
  })
  await page.goto('/#/app/ws-a')
  const add = page.getByRole('button', { name: '新建根页面' })
  await expect(add).toBeEnabled()
  await add.click()
  await expect(add).toBeEnabled()
  await add.click()
  await expect(page.locator('.product-page-link .product-page-title')).toHaveText(['Alpha', 'Bravo', '无标题', '无标题'])
  await expect.poll(() => api.pages.length).toBe(4)
  expect(api.pages.slice(-2).map((record) => record.orderKey)).toEqual(['b0', 'b00'])
})

test('disables root creation until the page list has loaded successfully', async ({ page }) => {
  const api = await installApi(page, { workspaces: [workspace('ws-a', 'Ava space')] })
  api.controls.snapshotDelayMs = 500
  await page.goto('/#/app/ws-a')
  const add = page.getByRole('button', { name: '新建根页面' })
  await expect(page.getByText('正在加载页面…')).toBeVisible()
  await expect(add).toBeDisabled()
  await expect(page.getByText('还没有页面')).toBeVisible()
  await expect(add).toBeEnabled()
  expect(api.requests.filter((request) => request.path === '/api/sync/operations')).toHaveLength(0)
})

test('creates a child page under a page and keeps the hierarchy and sibling order', async ({ page }) => {
  const api = await installApi(page, {
    workspaces: [workspace('ws-a', 'Ava space')],
    pages: [pageRecord('page-b', 'ws-a', 'Bravo', null, key(2)), pageRecord('page-a', 'ws-a', 'Alpha', null, key(1))],
  })
  await page.goto('/#/app/ws-a')
  const titles = page.locator('.product-page-link .product-page-title')
  await expect(titles).toHaveText(['Alpha', 'Bravo'])

  await openPageMenu(page, 'Alpha')
  await page.locator('.product-page-menu').getByRole('button', { name: '新建子页面' }).click()
  await expect(page).toHaveURL(/#\/app\/ws-a\/page\/[A-Za-z0-9_-]{21}$/)
  await expect(titles).toHaveText(['Alpha', '无标题', 'Bravo'])
  await expect(treeItem(page, '无标题')).toHaveAttribute('aria-level', '2')
  await expect(treeItem(page, 'Alpha')).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('heading', { level: 1, name: '无标题' })).toBeVisible()
  await expect.poll(() => api.pages.find((record) => record.parentPageId === 'page-a')).toMatchObject({ workspaceId: 'ws-a', title: '无标题', orderKey: key(1) })
})

test('collapses and expands a parent without losing the selected page', async ({ page }) => {
  await installApi(page, {
    workspaces: [workspace('ws-a', 'Ava space')],
    pages: [pageRecord('page-a', 'ws-a', 'Alpha', null, key(1)), pageRecord('page-a1', 'ws-a', 'Alpha child', 'page-a', key(1))],
  })
  await page.goto('/#/app/ws-a/page/page-a1')
  await expect(page.getByRole('heading', { level: 1, name: 'Alpha child' })).toBeVisible()
  await expect(treeItem(page, 'Alpha')).toHaveAttribute('aria-expanded', 'true')

  await page.getByRole('button', { name: '收起Alpha的子页面' }).click()
  await expect(treeItem(page, 'Alpha child')).toHaveCount(0)
  await expect(treeItem(page, 'Alpha')).toHaveAttribute('aria-expanded', 'false')
  await page.getByRole('button', { name: '展开Alpha的子页面' }).click()
  await expect(treeItem(page, 'Alpha child')).toHaveAttribute('aria-level', '2')
})

test('opens a page from the tree and restores the same page and tree after a reload', async ({ page }) => {
  await installApi(page, {
    workspaces: [workspace('ws-a', 'Ava space')],
    pages: [pageRecord('page-a', 'ws-a', 'Alpha', null, key(1)), pageRecord('page-a1', 'ws-a', 'Alpha child', 'page-a', key(1))],
  })
  await page.goto('/#/app/ws-a')
  await page.getByRole('button', { name: '展开Alpha的子页面' }).click()
  await treeItem(page, 'Alpha child').getByRole('button', { name: 'Alpha child', exact: true }).click()
  await expect(page).toHaveURL(/#\/app\/ws-a\/page\/page-a1$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Alpha child' })).toBeVisible()
  await expect(page.locator('.breadcrumb')).toHaveText('Ava space / Alpha child')

  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Alpha child' })).toBeVisible()
  await expect(treeItem(page, 'Alpha child').getByRole('button', { name: 'Alpha child', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(treeItem(page, 'Alpha')).toHaveAttribute('aria-expanded', 'true')
})

test('reports an unavailable page instead of rendering a blank screen', async ({ page }) => {
  await installApi(page, { workspaces: [workspace('ws-a', 'Ava space')] })
  await page.goto('/#/app/ws-a/page/page-missing')
  await expect(page.getByRole('heading', { level: 1, name: '无法打开这个页面' })).toBeVisible()
  await page.getByRole('link', { name: '返回工作区' }).click()
  await expect(page).toHaveURL(/#\/app\/ws-a$/)
})

test('renames a page with trimming, validation, pending state, and error recovery', async ({ page }) => {
  const api = await installApi(page, {
    workspaces: [workspace('ws-a', 'Ava space')],
    pages: [pageRecord('page-a', 'ws-a', 'Alpha', null, key(1))],
  })
  await page.goto('/#/app/ws-a/page/page-a')
  await openAction(page, 'Alpha', '重命名')

  const title = page.getByLabel('页面标题')
  const save = page.getByRole('button', { name: '保存标题' })
  await expect(title).toHaveValue('Alpha')
  await title.fill('   ')
  await expect(save).toBeDisabled()
  await title.fill('Alpha')
  await expect(save).toBeDisabled()

  await title.fill('  Renamed  ')
  api.controls.pushDelayMs = 200
  await save.click()
  await expect(treeItem(page, 'Renamed').getByRole('button', { name: 'Renamed', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { level: 1, name: 'Renamed' })).toBeVisible()
  await expect(page.locator('.breadcrumb')).toHaveText('Ava space / Renamed')
  await expect.poll(() => api.pages[0]?.title).toBe('Renamed')

  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Renamed' })).toBeVisible()

  api.controls.pushFailures = 1000000
  await openAction(page, 'Renamed', '重命名')
  await page.getByLabel('页面标题').fill('Failing')
  await page.getByRole('button', { name: '保存标题' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Failing' })).toBeVisible()
  await expect(page.getByRole('button', { name: /同步失败/ })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Failing' })).toBeVisible()
  await expect(page.getByRole('button', { name: /同步失败/ })).toBeVisible()
  api.controls.pushFailures = 0
  await page.getByRole('button', { name: /同步失败/ }).click()
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  await expect.poll(() => api.pages[0]?.title).toBe('Failing')
})

test('moves a page under another page and back to the root', async ({ page }) => {
  const api = await installApi(page, {
    workspaces: [workspace('ws-a', 'Ava space')],
    pages: [
      pageRecord('page-a', 'ws-a', 'Alpha', null, key(1)),
      pageRecord('page-a1', 'ws-a', 'Alpha child', 'page-a', key(1)),
      pageRecord('page-b', 'ws-a', 'Bravo', null, key(2)),
    ],
  })
  await page.goto('/#/app/ws-a/page/page-a1')

  await openAction(page, 'Alpha child', '移动')
  const select = page.getByLabel('移动到')
  await expect(select.locator('option')).toHaveText(['根级', 'Alpha', 'Bravo'])
  await select.selectOption('page-b')
  await page.getByRole('button', { name: '移动', exact: true }).click()

  await expect(treeItem(page, 'Alpha child')).toHaveAttribute('aria-level', '2')
  await expect(treeItem(page, 'Alpha child').getByRole('button', { name: 'Alpha child', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('.breadcrumb')).toHaveText('Ava space / Alpha child')
  await expect(treeItem(page, 'Bravo')).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('.product-page-inline-form')).toHaveCount(0)
  await expect.poll(() => api.pages.find((record) => record.id === 'page-a1')).toMatchObject({ parentPageId: 'page-b' })
  expect(api.requests.find((request) => request.path === '/api/sync/operations' && (request.body as any)?.kind === 'page.move')?.body).toMatchObject({ payload: { id: 'page-a1', parentPageId: 'page-b', orderKey: key(1) } })

  await page.reload()
  await expect(treeItem(page, 'Alpha child')).toHaveAttribute('aria-level', '2')

  await openAction(page, 'Alpha child', '移动')
  await page.getByLabel('移动到').selectOption('')
  await page.getByRole('button', { name: '移动', exact: true }).click()
  await expect(treeItem(page, 'Alpha child')).toHaveAttribute('aria-level', '1')
  await expect.poll(() => api.pages.find((record) => record.id === 'page-a1')).toMatchObject({ parentPageId: null, orderKey: key(3) })
})

test('never offers the page itself or its descendants and preserves a local move when sync fails', async ({ page }) => {
  const api = await installApi(page, {
    workspaces: [workspace('ws-a', 'Ava space')],
    pages: [
      pageRecord('page-a', 'ws-a', 'Alpha', null, key(1)),
      pageRecord('page-a1', 'ws-a', 'Alpha child', 'page-a', key(1)),
      pageRecord('page-b', 'ws-a', 'Bravo', null, key(2)),
    ],
  })
  await page.goto('/#/app/ws-a/page/page-a')
  await openAction(page, 'Alpha', '移动')
  await expect(page.getByLabel('移动到').locator('option')).toHaveText(['根级', 'Bravo'])

  api.controls.pushFailures = 1000000
  await page.getByLabel('移动到').selectOption('page-b')
  await page.getByRole('button', { name: '移动', exact: true }).click()
  await expect(page.locator('.product-page-inline-form')).toHaveCount(0)
  await expect(treeItem(page, 'Alpha')).toHaveAttribute('aria-level', '2')
  await expect(page.getByRole('button', { name: /同步失败/ })).toBeVisible()
  await page.reload()
  await expect(treeItem(page, 'Alpha')).toHaveAttribute('aria-level', '2')
  await expect(page.getByRole('button', { name: /同步失败/ })).toBeVisible()
  api.controls.pushFailures = 0
  await page.getByRole('button', { name: /同步失败/ }).click()
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
})

test('keeps page trees isolated per workspace and drops the previous page id', async ({ page }) => {
  await installApi(page, {
    workspaces: [workspace('ws-a', 'Ava space'), workspace('ws-b', 'Project room')],
    pages: [pageRecord('page-a', 'ws-a', 'Alpha', null, key(1)), pageRecord('page-b', 'ws-b', 'Bravo', null, key(1))],
  })
  await page.goto('/#/app/ws-a/page/page-a')
  await expect(page.getByRole('heading', { level: 1, name: 'Alpha' })).toBeVisible()

  await page.getByRole('button', { name: '切换工作区' }).click()
  await page.getByRole('list', { name: '可用工作区' }).getByRole('button', { name: 'Project room' }).click()
  await expect(page).toHaveURL(/#\/app\/ws-b$/)
  await expect(page.locator('.product-page-link .product-page-title')).toHaveText(['Bravo'])
  await expect(page.getByText('Alpha')).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1, name: 'Bravo' })).toHaveCount(0)

  await page.reload()
  await expect(page).toHaveURL(/#\/app\/ws-b$/)
  await expect(page.locator('.product-page-link .product-page-title')).toHaveText(['Bravo'])
})

test('deletes a leaf page, rejects a page with children, and recovers the route', async ({ page }) => {
  const api = await installApi(page, {
    workspaces: [workspace('ws-a', 'Ava space')],
    pages: [
      pageRecord('page-a', 'ws-a', 'Alpha', null, key(1)),
      pageRecord('page-a1', 'ws-a', 'Alpha child', 'page-a', key(1)),
      pageRecord('page-b', 'ws-a', 'Bravo', null, key(2)),
    ],
  })
  await page.goto('/#/app/ws-a/page/page-a1')

  await openAction(page, 'Alpha', '删除')
  await page.getByRole('button', { name: '确认删除' }).click()
  await expect(page.locator('.product-page-confirm').getByRole('alert')).toContainText('Page page-a has child pages')
  await expect(treeItem(page, 'Alpha')).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 1, name: 'Alpha child' })).toBeVisible()
  await page.getByRole('button', { name: '取消' }).click()
  await expect(page.locator('.product-page-confirm')).toHaveCount(0)

  // Deleting the open child page falls back to its parent page.
  await openAction(page, 'Alpha child', '删除')
  await page.getByRole('button', { name: '确认删除' }).click()
  await expect(page).toHaveURL(/#\/app\/ws-a\/page\/page-a$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Alpha' })).toBeVisible()
  await expect(treeItem(page, 'Alpha child')).toHaveCount(0)
  await expect.poll(() => api.pages.some((record) => record.id === 'page-a1')).toBe(false)

  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Alpha' })).toBeVisible()

  // Deleting an open root page returns to the workspace home.
  await openAction(page, 'Alpha', '删除')
  await page.getByRole('button', { name: '确认删除' }).click()
  await expect(page).toHaveURL(/#\/app\/ws-a$/)
  await expect(page.locator('.product-page-link .product-page-title')).toHaveText(['Bravo'])
  await expect(page.getByText('还没有页面')).toHaveCount(0)
})

test('reports page tree load failures and retries', async ({ page }) => {
  const api = await installApi(page, { workspaces: [workspace('ws-a', 'Ava space')] })
  api.controls.snapshotFailures = 1
  await page.goto('/#/app/ws-a')
  await expect(page.locator('.product-pages-section').getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: '新建根页面' })).toBeDisabled()
  await page.locator('.product-pages-section').getByRole('button', { name: '重试' }).click()
  await expect(page.locator('.product-pages-section').getByRole('alert')).toHaveCount(0)
  await expect(page.getByText('还没有页面')).toBeVisible()
  await expect(page.getByRole('button', { name: '新建根页面' })).toBeEnabled()

  // A cached snapshot remains usable when the server cannot refresh it.
  await page.goto('/#/app/ws-a/page/page-x')
  await expect(page.getByRole('heading', { level: 1, name: '无法打开这个页面' })).toBeVisible()
})

test('closes the mobile sidebar after opening a page from the tree', async ({ page }) => {
  await installApi(page, {
    workspaces: [workspace('ws-a', 'Ava space')],
    pages: [pageRecord('page-a', 'ws-a', 'Alpha', null, key(1))],
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/app/ws-a')
  await page.getByRole('button', { name: '打开导航菜单' }).click()
  await expect(page.getByLabel('工作区导航')).toHaveClass(/sidebar--open/)

  await treeItem(page, 'Alpha').getByRole('button', { name: 'Alpha', exact: true }).click()
  await expect(page).toHaveURL(/#\/app\/ws-a\/page\/page-a$/)
  await expect(page.getByLabel('工作区导航')).not.toHaveClass(/sidebar--open/)
  await expect(page.getByRole('heading', { level: 1, name: 'Alpha' })).toBeVisible()
  const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }))
  expect(widths.content).toBeLessThanOrEqual(widths.viewport)
})
