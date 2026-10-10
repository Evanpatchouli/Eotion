import { expect, test, type Locator, type Page, type Route } from '@playwright/test'
import type { AuthUserDto, PageResponse, WorkspaceResponse } from '@eotion/contracts'
import { mkdir } from 'node:fs/promises'

const now = '2026-09-30T00:00:00.000Z'
const later = '2027-09-30T00:00:00.000Z'

const ava: AuthUserDto = { id: 'user-ava', email: 'ava@example.com', createdAt: now, updatedAt: now }
const browserErrors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  browserErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
})

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page) ?? []).toEqual([])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})

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
    const databaseNavigationMatch = path.match(/^\/api\/workspaces\/([^/]+)\/database-navigation$/)
    if (databaseNavigationMatch && method === 'GET') return json(route, 200, { items: [], nextCursor: null })
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

function moveTarget(page: Page, title: string): Locator {
  return page.getByRole('radiogroup', { name: '移动到' }).getByRole('radio', { name: title, exact: true })
}

async function treeGeometry(page: Page): Promise<Array<{ x: number; y: number; width: number; height: number }>> {
  const boxes = await page.locator('[role="treeitem"]').evaluateAll((rows) => rows.map((row) => {
    const box = row.getBoundingClientRect()
    return { x: box.x, y: box.y, width: box.width, height: box.height }
  }))
  return boxes
}

function expectSameGeometry(actual: Awaited<ReturnType<typeof treeGeometry>>, expected: Awaited<ReturnType<typeof treeGeometry>>): void {
  expect(actual).toHaveLength(expected.length)
  for (const [index, box] of actual.entries()) {
    expect(box.x).toBeCloseTo(expected[index]!.x, 1)
    expect(box.y).toBeCloseTo(expected[index]!.y, 1)
    expect(box.width).toBeCloseTo(expected[index]!.width, 1)
    expect(box.height).toBeCloseTo(expected[index]!.height, 1)
  }
}

async function openPageMenu(page: Page, title: string): Promise<void> {
  await treeItem(page, title).getByRole('button', { name: `页面操作：${title}` }).click()
}

async function openAction(page: Page, title: string, action: string): Promise<void> {
  await openPageMenu(page, title)
  await page.locator('.product-page-menu').getByRole('menuitem', { name: action }).click()
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
  await page.locator('.product-page-menu').getByRole('menuitem', { name: '新建子页面' }).click()
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
  await expect(page.getByRole('button', { name: /离线 · 本地已保存/ })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Failing' })).toBeVisible()
  await expect(page.getByRole('button', { name: /离线 · 本地已保存/ })).toBeVisible()
  api.controls.pushFailures = 0
  await page.getByRole('button', { name: /离线 · 本地已保存/ }).click()
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  await expect.poll(() => api.pages[0]?.title).toBe('Failing')
})

test('rename focuses automatically, submits with Enter, and cancels without writing on Escape or outside click', async ({ page }) => {
  const api = await installApi(page, {
    workspaces: [workspace('ws-a', '工作空间')],
    pages: [pageRecord('page-a', 'ws-a', '研究计划', null, key(1))],
  })
  await page.goto('/#/app/ws-a/page/page-a')
  const operationCount = () => api.requests.filter((request) => request.path === '/api/sync/operations').length
  const initialOperationCount = operationCount()

  await openAction(page, '研究计划', '重命名')
  const title = page.getByLabel('页面标题')
  await expect(title).toBeFocused()
  await title.fill('取消的标题')
  await title.press('Escape')
  await expect(title).toHaveCount(0)
  await expect(treeItem(page, '研究计划')).toHaveCount(1)
  expect(operationCount()).toBe(initialOperationCount)

  await openAction(page, '研究计划', '重命名')
  await expect(title).toBeFocused()
  await title.fill('外部点击取消')
  await page.getByRole('heading', { level: 1, name: '研究计划' }).click()
  await expect(title).toHaveCount(0)
  expect(operationCount()).toBe(initialOperationCount)

  await openAction(page, '研究计划', '重命名')
  await expect(title).toBeFocused()
  await title.fill('已提交计划')
  await title.press('Enter')
  await expect(page.getByRole('heading', { level: 1, name: '已提交计划' })).toBeVisible()
  await expect.poll(() => api.pages[0]?.title).toBe('已提交计划')
  expect(operationCount()).toBe(initialOperationCount + 1)
})

test('keeps page tree rows steady through rename, move and delete controls and captures desktop states', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  await page.setViewportSize({ width: 1440, height: 900 })
  const api = await installApi(page, {
    workspaces: [workspace('ws-a', '工作空间')],
    pages: [
      pageRecord('page-project', 'ws-a', '研究计划', null, key(1)),
      pageRecord('page-notes', 'ws-a', '实验记录', 'page-project', key(1)),
      pageRecord('page-draft', 'ws-a', '实验草稿', 'page-notes', key(1)),
      pageRecord('page-reference', 'ws-a', '参考资料', null, key(2)),
    ],
  })
  await page.goto('/#/app/ws-a/page/page-project')
  await page.getByRole('button', { name: '展开研究计划的子页面' }).click()
  await page.getByRole('button', { name: '展开实验记录的子页面' }).click()
  const visualDir = process.env.EOTION_VISUAL_QA_DIR
  if (visualDir) await mkdir(visualDir, { recursive: true })
  const screenshot = async (name: string) => {
    if (visualDir) await page.screenshot({ path: `${visualDir}/${name}.png`, fullPage: true })
  }

  let before = await treeGeometry(page)
  await openAction(page, '研究计划', '重命名')
  expectSameGeometry(await treeGeometry(page), before)
  await screenshot('rename')
  await expect(page.getByRole('button', { name: '保存标题' })).toHaveCSS('min-height', '28px')
  const title = page.getByLabel('页面标题')
  await title.fill('项目路线图')
  await title.press('Escape')
  await expect(title).toHaveCount(0)
  expectSameGeometry(await treeGeometry(page), before)

  before = await treeGeometry(page)
  await openAction(page, '研究计划', '移动')
  const targets = page.getByRole('radiogroup', { name: '移动到' })
  await expect(targets.locator('select')).toHaveCount(0)
  await expect(moveTarget(page, '根级')).toBeChecked()
  await expect(moveTarget(page, '研究计划')).toHaveCount(0)
  await expect(moveTarget(page, '实验记录')).toHaveCount(0)
  await expect(moveTarget(page, '实验草稿')).toHaveCount(0)
  await expect(moveTarget(page, '参考资料')).toBeVisible()
  await moveTarget(page, '参考资料').check()
  expectSameGeometry(await treeGeometry(page), before)
  await expect.poll(() => api.requests.filter((request) => request.path === '/api/sync/operations' && (request.body as any)?.kind === 'page.move')).toHaveLength(0)
  await screenshot('move')
  await page.getByRole('heading', { level: 1, name: '研究计划' }).click()
  await expect(targets).toHaveCount(0)
  expectSameGeometry(await treeGeometry(page), before)

  await openAction(page, '研究计划', '移动')
  await moveTarget(page, '参考资料').check()
  await page.keyboard.press('Escape')
  await expect(targets).toHaveCount(0)
  expectSameGeometry(await treeGeometry(page), before)

  await openAction(page, '参考资料', '移动')
  await expect(moveTarget(page, '根级')).toBeFocused()
  const padding = async (name: string) => moveTarget(page, name).evaluate(element => Number.parseFloat(getComputedStyle(element.parentElement!).paddingLeft))
  expect(await padding('实验记录')).toBeGreaterThan(await padding('研究计划'))
  expect(await padding('实验草稿')).toBeGreaterThan(await padding('实验记录'))
  await screenshot('move-hierarchy')
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(targets).toHaveCount(0)
  expectSameGeometry(await treeGeometry(page), before)

  const originalX = (await treeItem(page, '研究计划').locator('.product-page-title').boundingBox())!.x
  await openAction(page, '研究计划', '移动')
  await moveTarget(page, '参考资料').check()
  await page.getByRole('button', { name: '移动', exact: true }).click()
  await expect(treeItem(page, '研究计划')).toHaveAttribute('aria-level', '2')
  expect((await treeItem(page, '研究计划').locator('.product-page-title').boundingBox())!.x).toBeGreaterThan(originalX)
  await expect.poll(() => api.pages.find((record) => record.id === 'page-project')?.parentPageId).toBe('page-reference')

  before = await treeGeometry(page)
  await openAction(page, '实验记录', '删除')
  const dialog = page.getByRole('dialog', { name: '删除页面？' })
  const cancel = dialog.getByRole('button', { name: '取消' })
  const remove = dialog.getByRole('button', { name: '删除', exact: true })
  await expect(cancel).toBeFocused()
  expectSameGeometry(await treeGeometry(page), before)
  await page.keyboard.press('Shift+Tab')
  await expect(remove).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(cancel).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  expectSameGeometry(await treeGeometry(page), before)

  await openAction(page, '实验记录', '删除')
  const openDialog = page.getByRole('dialog', { name: '删除页面？' })
  await screenshot('delete')
  await page.mouse.click(8, 8)
  await expect(openDialog).toBeVisible()
  expectSameGeometry(await treeGeometry(page), before)
  await openDialog.getByRole('button', { name: '取消' }).click()
  await expect(openDialog).toHaveCount(0)
  expectSameGeometry(await treeGeometry(page), before)
  expect(consoleErrors).toEqual([])
})

for (const width of [1440, 390]) {
test(`pending rename and move retain their surface and focus on Escape at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 })
  await installApi(page, {
    workspaces: [workspace('ws-a', '工作空间')],
    pages: [pageRecord('page-a', 'ws-a', '工作笔记', null, key(1)), pageRecord('page-b', 'ws-a', '阅读清单', null, key(2))],
  })
  await page.goto('/#/app/ws-a/page/page-a')
  await expect(page.locator('.eotion-editor-content')).toBeVisible()
  if (width < 768) await page.getByRole('button', { name: '打开导航菜单' }).click()
  for (const action of ['重命名', '移动']) {
    await page.evaluate(async (mode) => {
      const { useProductPagesStore } = await import('/src/stores/productPages.ts')
      const store = useProductPagesStore()
      let finish!: () => void
      const waiting = new Promise<void>(resolve => { finish = resolve })
      ;(window as any).__finishPageAction = finish
      if (mode === '重命名') {
        store.rename = async () => {
          store.renamePending = true
          await waiting
          store.renamePending = false
          store.renameError = '标题保存失败'
          return null
        }
      } else {
        store.move = async () => {
          store.movePending = true
          await waiting
          store.movePending = false
          store.moveError = '页面移动失败'
          return null
        }
      }
    }, action)
    await openAction(page, '工作笔记', action)
    if (action === '重命名') await page.getByLabel('页面标题').fill('新标题')
    else await moveTarget(page, '阅读清单').check()
    const popover = page.getByRole('dialog', { name: action === '重命名' ? '重命名页面' : '移动页面' })
    await popover.getByRole('button', { name: action === '重命名' ? '保存标题' : '移动', exact: true }).click()
    await expect(popover.getByRole('button', { name: '取消' })).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(popover).toBeVisible()
    await expect(page.locator('button[aria-label="页面操作：工作笔记"]')).not.toBeFocused()
    await page.evaluate(() => (window as any).__finishPageAction())
    await expect(popover.getByRole('alert')).toContainText('失败')
    await popover.getByRole('button', { name: '取消' }).click()
    await expect(popover).toHaveCount(0)
  }
})
}

test('keeps delete confirmation open while editor flush is pending and blocks duplicate flushes', async ({ page }) => {
  const api = await installApi(page, {
    workspaces: [workspace('ws-a', '工作空间')],
    pages: [pageRecord('page-a', 'ws-a', '待删除页面', null, key(1))],
  })
  await page.goto('/#/app/ws-a/page/page-a')
  await expect(page.getByRole('heading', { level: 1, name: '待删除页面' })).toBeVisible()
  await expect(page.locator('.eotion-editor-content')).toBeVisible()
  await page.evaluate(async () => {
    const { registerActivePageEditor } = await import('/src/editor/activePageEditor.ts')
    let finish!: (saved: boolean) => void
    let calls = 0
    const waiting = new Promise<boolean>((resolve) => { finish = resolve })
    const dispose = registerActivePageEditor({
      workspaceId: 'ws-a',
      pageId: 'page-a',
      flush: () => { calls += 1; return waiting },
      preserve: () => undefined,
    })
    ;(window as any).__deleteFlushFixture = { finish, calls: () => calls, dispose }
  })

  await openAction(page, '待删除页面', '删除')
  const dialog = page.getByRole('dialog', { name: '删除页面？' })
  const remove = dialog.locator('button.eotion-button--danger')
  const cancel = dialog.getByRole('button', { name: '取消' })
  await remove.click()
  await expect.poll(() => page.evaluate(() => (window as any).__deleteFlushFixture.calls())).toBe(1)
  await expect(cancel).toBeDisabled()
  await expect(remove).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await cancel.evaluate((element) => (element as HTMLButtonElement).click())
  await expect(dialog).toBeVisible()
  await remove.evaluate((element) => (element as HTMLButtonElement).click())
  await expect.poll(() => page.evaluate(() => (window as any).__deleteFlushFixture.calls())).toBe(1)

  await page.evaluate(() => (window as any).__deleteFlushFixture.finish(false))
  await expect(dialog.getByRole('alert')).toContainText('正文尚未保存')
  await expect(dialog).toBeVisible()
  expect(api.requests.some((request) => request.path === '/api/sync/operations' && (request.body as any)?.kind === 'page.delete')).toBe(false)
  await page.evaluate(() => (window as any).__deleteFlushFixture.dispose())
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
  const targets = page.getByRole('radiogroup', { name: '移动到' })
  await expect(targets.getByRole('radio')).toHaveCount(3)
  await expect(moveTarget(page, 'Alpha')).toBeChecked()
  await expect(moveTarget(page, 'Alpha')).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('button', { name: '取消', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(moveTarget(page, 'Alpha')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(moveTarget(page, 'Bravo')).toBeChecked()
  await page.keyboard.press('ArrowUp')
  await expect(moveTarget(page, 'Alpha')).toBeChecked()
  await expect(moveTarget(page, '根级')).toBeVisible()
  await expect(moveTarget(page, 'Bravo')).toBeVisible()
  await moveTarget(page, 'Bravo').check()
  await expect.poll(() => api.requests.filter((request) => request.path === '/api/sync/operations' && (request.body as any)?.kind === 'page.move')).toHaveLength(0)
  await page.getByRole('button', { name: '移动', exact: true }).click()

  await expect(treeItem(page, 'Alpha child')).toHaveAttribute('aria-level', '2')
  await expect(treeItem(page, 'Alpha child').getByRole('button', { name: 'Alpha child', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('.breadcrumb')).toHaveText('Ava space / Alpha child')
  await expect(treeItem(page, 'Bravo')).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('radiogroup', { name: '移动到' })).toHaveCount(0)
  await expect.poll(() => api.pages.find((record) => record.id === 'page-a1')).toMatchObject({ parentPageId: 'page-b' })
  expect(api.requests.find((request) => request.path === '/api/sync/operations' && (request.body as any)?.kind === 'page.move')?.body).toMatchObject({ payload: { id: 'page-a1', parentPageId: 'page-b', orderKey: key(1) } })

  await page.reload()
  await expect(treeItem(page, 'Alpha child')).toHaveAttribute('aria-level', '2')

  await openAction(page, 'Alpha child', '移动')
  await moveTarget(page, '根级').check()
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
  const targets = page.getByRole('radiogroup', { name: '移动到' })
  await expect(targets.getByRole('radio')).toHaveCount(2)
  await expect(moveTarget(page, 'Bravo')).toBeVisible()
  await expect(moveTarget(page, 'Alpha')).toHaveCount(0)
  await expect(moveTarget(page, 'Alpha child')).toHaveCount(0)

  api.controls.pushFailures = 1000000
  await moveTarget(page, 'Bravo').check()
  await page.getByRole('button', { name: '移动', exact: true }).click()
  await expect(page.getByRole('radiogroup', { name: '移动到' })).toHaveCount(0)
  await expect(treeItem(page, 'Alpha')).toHaveAttribute('aria-level', '2')
  await expect(page.getByRole('button', { name: /离线 · 本地已保存/ })).toBeVisible()
  await page.reload()
  await expect(treeItem(page, 'Alpha')).toHaveAttribute('aria-level', '2')
  await expect(page.getByRole('button', { name: /离线 · 本地已保存/ })).toBeVisible()
  api.controls.pushFailures = 0
  // Automatic recovery can replace the offline button before Playwright clicks it.
  // Trigger the existing connectivity path and assert the recovered server state.
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  await expect.poll(() => api.pages.find(record => record.id === 'page-a')?.parentPageId).toBe('page-b')
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
  const deleteDialog = page.getByRole('dialog', { name: '删除页面？' })
  await deleteDialog.getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '删除页面？' }).getByRole('alert')).toContainText('Page page-a has child pages')
  await expect(treeItem(page, 'Alpha')).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 1, name: 'Alpha child' })).toBeVisible()
  await page.getByRole('dialog', { name: '删除页面？' }).getByRole('button', { name: '取消' }).click()
  await expect(page.getByRole('dialog', { name: '删除页面？' })).toHaveCount(0)

  // Deleting the open child page falls back to its parent page.
  await openAction(page, 'Alpha child', '删除')
  await page.getByRole('dialog', { name: '删除页面？' }).getByRole('button', { name: '删除', exact: true }).click()
  await expect(page).toHaveURL(/#\/app\/ws-a\/page\/page-a$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Alpha' })).toBeVisible()
  await expect(treeItem(page, 'Alpha child')).toHaveCount(0)
  await expect.poll(() => api.pages.some((record) => record.id === 'page-a1')).toBe(false)

  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Alpha' })).toBeVisible()

  // Deleting an open root page returns to the workspace home.
  await openAction(page, 'Alpha', '删除')
  await page.getByRole('dialog', { name: '删除页面？' }).getByRole('button', { name: '删除', exact: true }).click()
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

test.describe('touch page action dialogs', () => {
test.use({ hasTouch: true })
test('mobile move dialog stays compact with only three destinations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await installApi(page, {
    workspaces: [workspace('ws-a', '工作空间')],
    pages: [
      pageRecord('page-a', 'ws-a', '备忘录', null, key(1)),
      pageRecord('page-b', 'ws-a', 'Page 1', null, key(2)),
      pageRecord('page-b1', 'ws-a', 'Sub page 1', 'page-b', key(1)),
    ],
  })
  await page.goto('/#/app/ws-a/page/page-a')
  await expect(page.locator('.eotion-editor-content')).toBeVisible()
  await page.getByRole('button', { name: '打开导航菜单' }).click()
  await openAction(page, '备忘录', '移动')
  const move = page.getByRole('dialog', { name: '移动页面' })
  const options = move.getByRole('radiogroup', { name: '移动到' })
  await expect(options.getByRole('radio')).toHaveCount(3)
  expect(await move.evaluate(element => element.getBoundingClientRect().height)).toBeLessThan(320)
  expect(await options.evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true)
  const lastOption = await move.locator('.product-page-move-option').last().boundingBox()
  const actions = await move.locator('.product-popover-form__actions').boundingBox()
  expect(lastOption).not.toBeNull()
  expect(actions).not.toBeNull()
  expect(actions!.y - (lastOption!.y + lastOption!.height)).toBeLessThan(24)
  await expect(move.getByRole('button', { name: '取消' })).toBeInViewport()
  const visualDir = process.env.EOTION_VISUAL_QA_DIR
  if (visualDir) {
    await mkdir(visualDir, { recursive: true })
    await page.screenshot({ path: `${visualDir}/mobile-move-compact.png`, animations: 'disabled' })
  }
  await page.keyboard.press('Escape')
  await expect(move).toBeHidden()
})

test('mobile page actions use modal dialogs with focus, stable tree and a scrollable destination list', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  const consoleErrors: string[] = []
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  const api = await installApi(page, {
    workspaces: [workspace('ws-a', '工作空间')],
    pages: [
      pageRecord('page-a', 'ws-a', '工作笔记', null, key(1)),
      pageRecord('page-a1', 'ws-a', '今日记录', 'page-a', key(1)),
      pageRecord('page-a2', 'ws-a', '记录草稿', 'page-a1', key(1)),
      ...Array.from({ length: 30 }, (_, index) => pageRecord(`target-${index}`, 'ws-a', `阅读清单 ${index + 1}`, null, key(index + 2))),
    ],
  })
  await page.goto('/#/app/ws-a/page/page-a1')
  await expect(page.locator('.eotion-editor-content')).toBeVisible()
  await page.getByRole('button', { name: '打开导航菜单' }).click()
  await expect.poll(() => page.locator('.product-sidebar').evaluate(element => element.getBoundingClientRect().x)).toBe(0)
  const before = await treeGeometry(page)
  const visualDir = process.env.EOTION_VISUAL_QA_DIR
  if (visualDir) await mkdir(visualDir, { recursive: true })
  const screenshot = async (name: string) => {
    if (visualDir) await page.screenshot({ path: `${visualDir}/${name}.png`, animations: 'disabled' })
  }
  await openAction(page, '今日记录', '重命名')
  const rename = page.getByRole('dialog', { name: '重命名页面' })
  await expect(rename).toHaveAttribute('aria-modal', 'true')
  expect(await rename.evaluate(element => element.matches(':modal'))).toBe(true)
  await expect(page.locator('.eotion-popover-panel')).toHaveCount(0)
  const title = rename.getByLabel('页面标题')
  await expect(title).toBeFocused()
  expectSameGeometry(await treeGeometry(page), before)
  await expect(rename.getByRole('button', { name: '保存标题' })).toHaveCSS('min-height', '36px')
  await title.fill('今日计划')
  await page.keyboard.press('Shift+Tab')
  await expect(rename.getByRole('button', { name: '取消' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(title).toBeFocused()
  await screenshot('mobile-rename')
  await page.mouse.click(4, 4)
  await expect(rename).toBeVisible()
  await title.press('Enter')
  await expect(rename).toBeHidden()
  await expect(page.getByRole('heading', { level: 1, name: '今日计划' })).toBeVisible()
  await expect.poll(() => api.pages.find(record => record.id === 'page-a1')?.title).toBe('今日计划')
  await expect(page.getByRole('button', { name: '页面操作：今日计划' })).toBeFocused()

  const moveBefore = await treeGeometry(page)
  await openAction(page, '今日计划', '移动')
  const move = page.getByRole('dialog', { name: '移动页面' })
  expect(await move.evaluate(element => element.matches(':modal'))).toBe(true)
  await expect(moveTarget(page, '工作笔记')).toBeChecked()
  await expect(moveTarget(page, '工作笔记')).toBeFocused()
  await expect(moveTarget(page, '今日计划')).toHaveCount(0)
  await expect(moveTarget(page, '记录草稿')).toHaveCount(0)
  await expect(move.locator('select')).toHaveCount(0)
  expectSameGeometry(await treeGeometry(page), moveBefore)
  await page.keyboard.press('Shift+Tab')
  await expect(move.getByRole('button', { name: '取消' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(moveTarget(page, '工作笔记')).toBeFocused()
  const options = move.getByRole('radiogroup', { name: '移动到' })
  expect(await options.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
  expect(await move.evaluate(element => element.getBoundingClientRect().height)).toBeLessThanOrEqual(544)
  await screenshot('mobile-move')
  await page.setViewportSize({ width: 390, height: 380 })
  expect(await move.evaluate(element => element.getBoundingClientRect().height)).toBeLessThanOrEqual(348)
  await moveTarget(page, '阅读清单 30').check()
  const submit = move.getByRole('button', { name: '移动', exact: true })
  await expect(submit).toBeInViewport()
  await expect(move.getByRole('button', { name: '取消' })).toBeInViewport()
  expect(await move.evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true)
  await screenshot('mobile-move-short')
  await submit.click()
  await expect(move).toBeHidden()
  await expect.poll(() => api.pages.find(record => record.id === 'page-a1')?.parentPageId).toBe('target-29')
  expect(consoleErrors).toEqual([])
})
})

test('page action presentation uses the mobile breakpoint and preserves an open draft across resize', async ({ page }) => {
  await installApi(page, {
    workspaces: [workspace('ws-a', '工作空间')],
    pages: [pageRecord('page-a', 'ws-a', '工作笔记', null, key(1))],
  })
  await page.setViewportSize({ width: 767, height: 844 })
  await page.goto('/#/app/ws-a/page/page-a')
  await expect(page.locator('.eotion-editor-content')).toBeVisible()
  await page.getByRole('button', { name: '打开导航菜单' }).click()
  await openAction(page, '工作笔记', '重命名')
  const rename = page.getByRole('dialog', { name: '重命名页面' })
  expect(await rename.evaluate(element => element.matches(':modal'))).toBe(true)
  await rename.getByLabel('页面标题').fill('保留的草稿')
  await page.setViewportSize({ width: 768, height: 844 })
  await expect(rename.getByLabel('页面标题')).toHaveValue('保留的草稿')
  expect(await rename.evaluate(element => element.matches(':modal'))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(rename).toBeHidden()
  await openAction(page, '工作笔记', '移动')
  const move = page.getByRole('dialog', { name: '移动页面' })
  expect(await move.evaluate(element => element.matches(':modal'))).toBe(false)
  await expect(move).toHaveClass(/eotion-popover-panel/)
  await move.getByRole('button', { name: '取消' }).click()
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
