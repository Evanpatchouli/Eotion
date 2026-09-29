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
  pageListFailures: number
  pageListDelayMs: number
  createFailures: number
  createDelayMs: number
  renameFailures: number
  renameDelayMs: number
  moveDelayMs: number
  /** When set, the next move is rejected with this server error. */
  moveFailureMessage: string | null
  deleteFailures: number
}

async function installApi(page: Page, options: MockOptions = {}) {
  const workspaces = [...(options.workspaces ?? [])]
  const pages = [...(options.pages ?? [])]
  const controls: PageControls = {
    pageListFailures: 0,
    pageListDelayMs: 0,
    createFailures: 0,
    createDelayMs: 0,
    renameFailures: 0,
    renameDelayMs: 0,
    moveDelayMs: 0,
    moveFailureMessage: null,
    deleteFailures: 0,
  }
  const requests: Array<{ method: string; path: string; body?: unknown }> = []
  const wait = async (milliseconds: number) => {
    if (milliseconds > 0) await new Promise((resolve) => setTimeout(resolve, milliseconds))
  }
  const json = async (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  const fail = (status: number, message: string) => ({ statusCode: status, message, error: status < 500 ? 'Bad Request' : 'Internal Server Error' })
  const inWorkspace = (workspaceId: string) => pages.filter((record) => record.workspaceId === workspaceId)

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

    const listMatch = path.match(/^\/api\/workspaces\/([^/]+)\/pages$/)
    if (listMatch) {
      const workspaceId = decodeURIComponent(listMatch[1]!)
      if (method === 'GET') {
        await wait(controls.pageListDelayMs)
        if (controls.pageListFailures > 0) {
          controls.pageListFailures -= 1
          return json(route, 503, fail(503, 'Page list failed'))
        }
        return json(route, 200, inWorkspace(workspaceId))
      }
      if (method === 'POST') {
        await wait(controls.createDelayMs)
        if (controls.createFailures > 0) {
          controls.createFailures -= 1
          return json(route, 503, fail(503, 'Create failed'))
        }
        const input = body as { id: string; parentPageId: string | null; title: string; orderKey: string }
        if (input.parentPageId !== null && !inWorkspace(workspaceId).some((record) => record.id === input.parentPageId)) {
          return json(route, 400, fail(400, 'Parent page must belong to the same workspace'))
        }
        const created: PageResponse = { ...pageRecord(input.id, workspaceId, input.title, input.parentPageId, input.orderKey), updatedAt: later }
        pages.push(created)
        return json(route, 201, created)
      }
    }

    const moveMatch = path.match(/^\/api\/workspaces\/([^/]+)\/pages\/([^/]+)\/move$/)
    if (moveMatch && method === 'PATCH') {
      await wait(controls.moveDelayMs)
      const workspaceId = decodeURIComponent(moveMatch[1]!)
      const pageId = decodeURIComponent(moveMatch[2]!)
      if (controls.moveFailureMessage) {
        const message = controls.moveFailureMessage
        controls.moveFailureMessage = null
        return json(route, 400, fail(400, message))
      }
      const record = inWorkspace(workspaceId).find((item) => item.id === pageId)
      if (!record) return json(route, 404, fail(404, 'Page not found'))
      const input = body as { parentPageId: string | null; orderKey: string }
      if (input.parentPageId === pageId) return json(route, 400, fail(400, 'A page cannot be its own parent'))
      if (input.parentPageId !== null) {
        if (!inWorkspace(workspaceId).some((item) => item.id === input.parentPageId)) {
          return json(route, 400, fail(400, 'Parent page must belong to the same workspace'))
        }
        let cursor: string | null = input.parentPageId
        while (cursor !== null) {
          if (cursor === pageId) return json(route, 400, fail(400, 'A page cannot be moved under its own descendant'))
          cursor = inWorkspace(workspaceId).find((item) => item.id === cursor)?.parentPageId ?? null
        }
      }
      record.parentPageId = input.parentPageId
      record.orderKey = input.orderKey
      record.updatedAt = later
      return json(route, 200, record)
    }

    const pageMatch = path.match(/^\/api\/workspaces\/([^/]+)\/pages\/([^/]+)$/)
    const blockListMatch = path.match(/^\/api\/workspaces\/([^/]+)\/pages\/([^/]+)\/blocks$/)
    if (blockListMatch && method === 'GET') return json(route, 200, [])
    if (pageMatch) {
      const workspaceId = decodeURIComponent(pageMatch[1]!)
      const pageId = decodeURIComponent(pageMatch[2]!)
      const record = inWorkspace(workspaceId).find((item) => item.id === pageId)
      if (method === 'GET') return record ? json(route, 200, record) : json(route, 404, fail(404, 'Page not found'))
      if (method === 'PATCH') {
        await wait(controls.renameDelayMs)
        if (controls.renameFailures > 0) {
          controls.renameFailures -= 1
          return json(route, 503, fail(503, 'Rename failed'))
        }
        if (!record) return json(route, 404, fail(404, 'Page not found'))
        const input = body as { title?: string; parentPageId?: string | null }
        if ('parentPageId' in input) return json(route, 400, fail(400, 'Moving a page is not supported here; use the move endpoint'))
        record.title = input.title ?? record.title
        record.updatedAt = later
        return json(route, 200, record)
      }
      if (method === 'DELETE') {
        if (controls.deleteFailures > 0) {
          controls.deleteFailures -= 1
          return json(route, 503, fail(503, 'Delete failed'))
        }
        if (!record) return json(route, 404, fail(404, 'Page not found'))
        if (inWorkspace(workspaceId).some((item) => item.parentPageId === pageId)) {
          return json(route, 400, fail(400, 'Delete child pages first'))
        }
        pages.splice(pages.indexOf(record), 1)
        return json(route, 200, { deleted: true })
      }
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
  expect(api.pages).toHaveLength(1)
  expect(api.pages[0]).toMatchObject({ workspaceId: 'ws-a', parentPageId: null, title: '无标题', orderKey: key(1) })
  expect(api.requests.find((request) => request.path === '/api/workspaces/ws-a/pages' && request.method === 'POST')?.body).toMatchObject({ parentPageId: null, title: '无标题' })
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
    expect(api.pages.at(-1)?.orderKey).toBe(expectedKey)
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
  expect(api.pages.slice(-2).map((record) => record.orderKey)).toEqual(['b0', 'b00'])
})

test('disables root creation until the page list has loaded successfully', async ({ page }) => {
  const api = await installApi(page, { workspaces: [workspace('ws-a', 'Ava space')] })
  api.controls.pageListDelayMs = 500
  await page.goto('/#/app/ws-a')
  const add = page.getByRole('button', { name: '新建根页面' })
  await expect(page.getByText('正在加载页面…')).toBeVisible()
  await expect(add).toBeDisabled()
  await expect(page.getByText('还没有页面')).toBeVisible()
  await expect(add).toBeEnabled()
  expect(api.requests.filter((request) => request.method === 'POST' && request.path === '/api/workspaces/ws-a/pages')).toHaveLength(0)
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
  expect(api.pages.find((record) => record.parentPageId === 'page-a')).toMatchObject({ workspaceId: 'ws-a', title: '无标题', orderKey: key(1) })
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
  api.controls.renameDelayMs = 200
  await save.click()
  await expect(page.getByRole('button', { name: '正在保存…' })).toBeDisabled()
  await expect(treeItem(page, 'Renamed').getByRole('button', { name: 'Renamed', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { level: 1, name: 'Renamed' })).toBeVisible()
  await expect(page.locator('.breadcrumb')).toHaveText('Ava space / Renamed')
  expect(api.pages[0]?.title).toBe('Renamed')

  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Renamed' })).toBeVisible()

  api.controls.renameFailures = 1
  await openAction(page, 'Renamed', '重命名')
  await page.getByLabel('页面标题').fill('Failing')
  await page.getByRole('button', { name: '保存标题' }).click()
  const renameForm = page.locator('.product-page-inline-form')
  await expect(renameForm.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Renamed' })).toBeVisible()
  await expect(renameForm).toBeVisible()

  await page.getByRole('button', { name: '保存标题' }).click()
  await expect(renameForm).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1, name: 'Failing' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Failing' })).toBeVisible()
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
  expect(api.pages.find((record) => record.id === 'page-a1')).toMatchObject({ parentPageId: 'page-b' })
  expect(api.requests.find((request) => request.path === '/api/workspaces/ws-a/pages/page-a1/move')?.body).toEqual({ parentPageId: 'page-b', orderKey: key(1) })

  await page.reload()
  await expect(treeItem(page, 'Alpha child')).toHaveAttribute('aria-level', '2')

  await openAction(page, 'Alpha child', '移动')
  await page.getByLabel('移动到').selectOption('')
  await page.getByRole('button', { name: '移动', exact: true }).click()
  await expect(treeItem(page, 'Alpha child')).toHaveAttribute('aria-level', '1')
  expect(api.pages.find((record) => record.id === 'page-a1')).toMatchObject({ parentPageId: null, orderKey: key(3) })
})

test('never offers the page itself or its descendants as a move destination and surfaces a rejected move', async ({ page }) => {
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

  api.controls.moveFailureMessage = 'A page cannot be moved under its own descendant'
  await page.getByLabel('移动到').selectOption('page-b')
  await page.getByRole('button', { name: '移动', exact: true }).click()
  await expect(page.locator('.product-page-inline-form').getByRole('alert')).toContainText('A page cannot be moved under its own descendant')
  await expect(treeItem(page, 'Alpha')).toHaveAttribute('aria-level', '1')
  await expect(page.getByRole('button', { name: '移动', exact: true })).toBeEnabled()
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
  await expect(page.locator('.product-page-confirm').getByRole('alert')).toContainText('Delete child pages first')
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
  expect(api.pages.some((record) => record.id === 'page-a1')).toBe(false)

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
  api.controls.pageListFailures = 1
  await page.goto('/#/app/ws-a')
  await expect(page.locator('.product-pages-section').getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: '新建根页面' })).toBeDisabled()
  await page.locator('.product-pages-section').getByRole('button', { name: '重试' }).click()
  await expect(page.locator('.product-pages-section').getByRole('alert')).toHaveCount(0)
  await expect(page.getByText('还没有页面')).toBeVisible()
  await expect(page.getByRole('button', { name: '新建根页面' })).toBeEnabled()

  // The page route reports the same failure instead of showing a blank document.
  api.controls.pageListFailures = 1
  await page.goto('/#/app/ws-a/page/page-x')
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: '暂时无法加载页面' })).toBeVisible()
  await page.locator('.document').getByRole('button', { name: '重试' }).click()
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
