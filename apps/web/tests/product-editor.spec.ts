import { expect, test, type Page, type Route } from '@playwright/test'
import type { AuthUserDto, BlockResponse, PageResponse, WorkspaceResponse } from '@eotion/contracts'

const now = '2026-09-30T00:00:00.000Z'
const later = '2027-09-30T00:00:00.000Z'
const user: AuthUserDto = { id: 'user-ava', email: 'ava@example.com', createdAt: now, updatedAt: now }
const workspace: WorkspaceResponse = { id: 'ws-a', name: 'Ava space', ownerId: user.id, createdAt: now, updatedAt: now }

function pageRecord(id: string, title: string, order: number): PageResponse {
  return { id, workspaceId: workspace.id, parentPageId: null, title, orderKey: String(order).padStart(16, '0'), createdAt: now, updatedAt: now }
}

function block(pageId: string, id: string, order: number, node: Record<string, unknown>): BlockResponse {
  return {
    id, pageId, workspaceId: workspace.id, parentBlockId: null, type: node.type === 'heading' ? 'heading' : node.type === 'bulletList' ? 'bulleted-list' : 'paragraph',
    orderKey: String(order).padStart(16, '0'), props: { node }, createdAt: now, updatedAt: now,
  }
}

type ApiControls = {
  blockListFailures: number
  blockListDelayMs: number
  blockListGate: Promise<void> | null
  mutationFailures: number
  mutationDelayMs: number
  unauthorized: boolean
  activeMutations: number
  maxConcurrentMutations: number
  lostCreateResponses: number
  lostDeleteResponses: number
  pageMutationUnauthorized: boolean
}

async function installApi(page: Page, options: { pages?: PageResponse[]; blocks?: BlockResponse[] } = {}) {
  const pages = [...(options.pages ?? [pageRecord('page-a', 'Alpha', 1), pageRecord('page-b', 'Bravo', 2)])]
  const blocks = [...(options.blocks ?? [])]
  const requests: Array<{ method: string; path: string; body?: any }> = []
  const controls: ApiControls = { blockListFailures: 0, blockListDelayMs: 0, blockListGate: null, mutationFailures: 0, mutationDelayMs: 0, unauthorized: false, activeMutations: 0, maxConcurrentMutations: 0, lostCreateResponses: 0, lostDeleteResponses: 0, pageMutationUnauthorized: false }
  const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  const error = (status: number, message: string) => ({ statusCode: status, message, error: status === 401 ? 'Unauthorized' : 'Internal Server Error' })
  const wait = async (ms: number) => { if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms)) }

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    let body: any
    if (request.postData()) { try { body = request.postDataJSON() } catch { body = undefined } }
    requests.push({ method: request.method(), path, body })
    if (path === '/api/auth/me' && request.method() === 'GET') return json(route, 200, user)
    if (path === '/api/auth/login' && request.method() === 'POST') {
      controls.unauthorized = false
      return json(route, 200, { user, expiresAt: later })
    }
    if (path === '/api/workspaces' && request.method() === 'GET') return json(route, 200, [workspace])
    if (path === `/api/workspaces/${workspace.id}/pages` && request.method() === 'GET') return json(route, 200, pages)

    const pageMatch = path.match(/^\/api\/workspaces\/([^/]+)\/pages\/([^/]+)$/)
    if (pageMatch && request.method() === 'PATCH' && controls.pageMutationUnauthorized) {
      controls.pageMutationUnauthorized = false
      return json(route, 401, error(401, 'Session expired'))
    }
    if (pageMatch && request.method() === 'GET') {
      const record = pages.find((item) => item.id === decodeURIComponent(pageMatch[2]!))
      return record ? json(route, 200, record) : json(route, 404, error(404, 'Page not found'))
    }

    const blockMatch = path.match(/^\/api\/workspaces\/([^/]+)\/pages\/([^/]+)\/blocks(?:\/([^/]+))?$/)
    if (blockMatch) {
      const pageId = decodeURIComponent(blockMatch[2]!)
      const blockId = blockMatch[3] ? decodeURIComponent(blockMatch[3]) : null
      if (controls.unauthorized) return json(route, 401, error(401, 'Session expired'))
      if (request.method() === 'GET' && !blockId) {
        await wait(controls.blockListDelayMs)
        if (controls.blockListGate) await controls.blockListGate
        if (controls.blockListFailures > 0) {
          controls.blockListFailures -= 1
          return json(route, 503, error(503, 'Block list failed'))
        }
        return json(route, 200, blocks.filter((item) => item.pageId === pageId))
      }
      if (request.method() === 'GET' && blockId) {
        const existing = blocks.find((item) => item.id === blockId && item.pageId === pageId)
        return existing ? json(route, 200, existing) : json(route, 404, error(404, 'Block not found'))
      }
      if (request.method() !== 'GET') {
        controls.activeMutations += 1
        controls.maxConcurrentMutations = Math.max(controls.maxConcurrentMutations, controls.activeMutations)
        await wait(controls.mutationDelayMs)
        controls.activeMutations -= 1
        if (controls.mutationFailures > 0) {
          controls.mutationFailures -= 1
          return json(route, 503, error(503, 'Block save failed'))
        }
      }
      if (request.method() === 'POST' && !blockId) {
        if (blocks.some((item) => item.id === body.id)) return json(route, 409, error(409, 'Duplicate block id'))
        const created: BlockResponse = { ...body, pageId, workspaceId: workspace.id, createdAt: now, updatedAt: later }
        blocks.push(created)
        if (controls.lostCreateResponses > 0) {
          controls.lostCreateResponses -= 1
          return route.abort('failed')
        }
        return json(route, 201, created)
      }
      if (request.method() === 'PATCH' && blockId) {
        const existing = blocks.find((item) => item.id === blockId && item.pageId === pageId)
        if (!existing) return json(route, 404, error(404, 'Block not found'))
        Object.assign(existing, body, { updatedAt: later })
        return json(route, 200, existing)
      }
      if (request.method() === 'DELETE' && blockId) {
        const index = blocks.findIndex((item) => item.id === blockId && item.pageId === pageId)
        if (index === -1) return json(route, 404, error(404, 'Block not found'))
        blocks.splice(index, 1)
        if (controls.lostDeleteResponses > 0) {
          controls.lostDeleteResponses -= 1
          return route.abort('failed')
        }
        return route.fulfill({ status: 204 })
      }
    }
    return json(route, 404, error(404, 'Not found'))
  })
  return { controls, pages, blocks, requests }
}

const editor = (page: Page) => page.locator('.eotion-editor-content .tiptap')
const blockRequests = (requests: Awaited<ReturnType<typeof installApi>>['requests']) => requests.filter((request) => /\/blocks(?:\/[^/]+)?$/.test(request.path))

test('empty page loads without mutations, then debounces edits with a stable block identity', async ({ page }) => {
  const api = await installApi(page, { pages: [pageRecord('page-a', 'Alpha', 1)], blocks: [] })
  await page.goto('/#/app/ws-a/page/page-a')
  await expect(page.getByRole('status').filter({ hasText: '已保存' })).toBeVisible()
  await expect(editor(page)).toBeVisible()
  expect(blockRequests(api.requests).filter((request) => request.method !== 'GET')).toHaveLength(0)

  await editor(page).click()
  await editor(page).pressSequentially('First version')
  await editor(page).press('Control+A')
  await editor(page).pressSequentially('Updated once')
  await editor(page).press('Control+A')
  await editor(page).pressSequentially('Final text')
  await expect.poll(() => api.blocks.filter((item) => item.pageId === 'page-a').length, { timeout: 4000 }).toBe(1)
  const first = api.blocks[0]!
  const createdRequest = blockRequests(api.requests).find((request) => request.method === 'POST')!
  expect(createdRequest.body.id).toBe(first.id)

  await expect.poll(() => api.blocks[0]?.props.node, { timeout: 4000 }).toMatchObject({ content: [{ text: 'Final text' }] })
  expect(api.blocks).toHaveLength(1)
  expect(api.blocks[0]?.id).toBe(first.id)
  expect(blockRequests(api.requests).filter((request) => request.method === 'POST')).toHaveLength(1)
})

test('persists marks, heading and list structure and restores them after reload', async ({ page }) => {
  const api = await installApi(page, {
    pages: [pageRecord('page-a', 'Alpha', 1)],
    blocks: [
      block('page-a', 'stable-heading-id', 1, { type: 'paragraph', content: [{ type: 'text', text: 'Formatted title' }] }),
      block('page-a', 'stable-list-id', 2, { type: 'paragraph', content: [{ type: 'text', text: 'List item' }] }),
    ],
  })
  await page.goto('/#/app/ws-a/page/page-a')
  const body = editor(page)
  await expect(body).toBeVisible()
  await body.locator('p').first().click()
  await body.press('Home')
  await body.press('Shift+End')
  await body.press('Control+B')
  await page.getByRole('button', { name: '二级标题' }).click()
  await body.locator('p').last().click()
  await page.getByRole('button', { name: '项目列表' }).click()
  await expect.poll(() => api.blocks.some((item) => item.type === 'bulleted-list') && api.blocks.some((item) => item.type === 'heading'), { timeout: 5000 }).toBe(true)
  expect(api.blocks.map((item) => item.id)).toContain('stable-heading-id')
  expect(api.blocks.map((item) => item.id)).toContain('stable-list-id')
  await expect.poll(() => JSON.stringify(api.blocks)).toContain('bold')

  await page.reload()
  await expect(editor(page).locator('h2 strong')).toContainText('Formatted title')
  await expect(editor(page).locator('ul li')).toContainText('List item')
})

test('inserts in the middle, deletes a block and keeps the displayed order', async ({ page }) => {
  const api = await installApi(page, {
    pages: [pageRecord('page-a', 'Alpha', 1)],
    blocks: [
      block('page-a', 'block-a', 1, { type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] }),
      block('page-a', 'block-b', 2, { type: 'paragraph', content: [{ type: 'text', text: 'Bravo' }] }),
    ],
  })
  await page.goto('/#/app/ws-a/page/page-a')
  const body = editor(page)
  await expect(body.locator(':scope > p')).toHaveText(['Alpha', 'Bravo'])
  await body.locator('p').first().click()
  await body.press('End')
  await body.press('Enter')
  await body.pressSequentially('Between')
  await expect.poll(() => api.blocks.length, { timeout: 5000 }).toBe(3)
  await expect.poll(() => [...api.blocks].sort((a, b) => a.orderKey.localeCompare(b.orderKey)).map((item) => (item.props.node as any).content?.[0]?.text), { timeout: 5000 }).toEqual(['Alpha', 'Between', 'Bravo'])

  await body.locator('p').nth(1).click()
  await body.press('Home')
  await body.press('Shift+End')
  await body.press('Backspace')
  await body.press('Backspace')
  await expect.poll(() => api.blocks.length, { timeout: 5000 }).toBe(2)
  await expect.poll(() => [...api.blocks].sort((a, b) => a.orderKey.localeCompare(b.orderKey)).map((item) => (item.props.node as any).content?.[0]?.text), { timeout: 5000 }).toEqual(['Alpha', 'Bravo'])
})

test('flushes edits on page navigation and isolates the next page document', async ({ page }) => {
  const api = await installApi(page)
  api.controls.mutationDelayMs = 120
  await page.goto('/#/app/ws-a/page/page-a')
  await editor(page).click()
  await editor(page).pressSequentially('Saved on navigation')
  await page.getByRole('button', { name: 'Bravo', exact: true }).click()
  await expect(page).toHaveURL(/page\/page-b$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Bravo' })).toBeVisible()
  expect(api.blocks).toHaveLength(1)
  expect(api.blocks[0]).toMatchObject({ pageId: 'page-a', props: { node: { content: [{ text: 'Saved on navigation' }] } } })
  await expect(editor(page)).toHaveText('')
  expect(api.requests.some((request) => request.method === 'POST' && request.path.includes('/page/page-b/blocks'))).toBe(false)
})

test('ignores a late response from the previous page load', async ({ page }) => {
  const api = await installApi(page, {
    blocks: [
      block('page-a', 'block-a', 1, { type: 'paragraph', content: [{ type: 'text', text: 'Old page body' }] }),
      block('page-b', 'block-b', 1, { type: 'paragraph', content: [{ type: 'text', text: 'Current page body' }] }),
    ],
  })
  let release!: () => void
  api.controls.blockListGate = new Promise<void>((resolve) => { release = resolve })
  await page.goto('/#/app/ws-a/page/page-a')
  await expect(page.getByRole('heading', { level: 1, name: 'Alpha' })).toBeVisible()
  await page.getByRole('button', { name: 'Bravo', exact: true }).click()
  await expect(page).toHaveURL(/page\/page-b$/)
  api.controls.blockListGate = null
  release()
  await expect(editor(page)).toContainText('Current page body')
  await expect(editor(page)).not.toContainText('Old page body')
})

test('retries save and load failures, and returns to login on a block API 401', async ({ page }) => {
  const api = await installApi(page, { pages: [pageRecord('page-a', 'Alpha', 1), pageRecord('page-b', 'Bravo', 2)] })
  api.controls.mutationFailures = 2
  await page.goto('/#/app/ws-a/page/page-a')
  await editor(page).click()
  await editor(page).pressSequentially('Retry me')
  await expect(page.getByRole('alert')).toContainText('Block save failed')
  await editor(page).pressSequentially(' latest')
  await expect.poll(() => blockRequests(api.requests).filter((request) => request.method === 'POST').length, { timeout: 5000 }).toBe(2)
  await expect(page.getByRole('button', { name: '重试保存' })).toBeVisible()
  await page.getByRole('button', { name: '重试保存' }).click()
  await expect.poll(() => api.blocks.length, { timeout: 5000 }).toBe(1)
  expect(api.blocks[0]?.props.node).toMatchObject({ content: [{ text: 'Retry me latest' }] })

  await page.getByRole('button', { name: 'Bravo', exact: true }).click()
  await expect(page).toHaveURL(/page\/page-b$/)
  await expect(editor(page)).toBeVisible()
  api.controls.blockListFailures = 1
  await page.getByRole('button', { name: 'Alpha', exact: true }).click()
  await expect(page).toHaveURL(/page\/page-a$/)
  await expect(page.getByRole('alert')).toContainText('Block list failed')
  await page.getByRole('button', { name: '重试加载' }).click()
  await expect(editor(page)).toBeVisible()

  api.controls.unauthorized = true
  await page.reload()
  await expect(page).toHaveURL(/#\/login$/)
})

test('keeps mobile editor within 390px and defers persistence during composition', async ({ page }) => {
  const api = await installApi(page, { pages: [pageRecord('page-a', 'Alpha', 1)] })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/app/ws-a/page/page-a')
  await expect(page.getByRole('toolbar', { name: '触摸编辑工具栏' })).toBeVisible()
  const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }))
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport)

  const body = editor(page)
  await body.dispatchEvent('compositionstart', { data: '' })
  await body.click()
  await body.pressSequentially('Composing text')
  await page.waitForTimeout(650)
  expect(blockRequests(api.requests).filter((request) => request.method !== 'GET')).toHaveLength(0)
  await body.dispatchEvent('compositionend', { data: 'Composing text' })
  await expect.poll(() => api.blocks.length, { timeout: 5000 }).toBe(1)
  expect(api.blocks[0]?.props.node).toMatchObject({ content: [{ text: 'Composing text' }] })
})

test('keeps the P2 fixture, slash command and undo path available', async ({ page }) => {
  await page.goto('/#/__dev/editor-p2')
  await page.getByRole('button', { name: '加载 5,000 区块' }).click()
  await expect(page.getByLabel('加载指标')).toContainText('5000')
  const body = page.locator('.eotion-editor-content .tiptap')
  await body.locator('p').last().click()
  await body.press('Home')
  await body.pressSequentially('/')
  await expect(page.locator('.p2-slash-menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.p2-slash-menu')).toHaveCount(0)
  await body.pressSequentially('Undo me')
  await body.press('Control+Z')
  await expect(body).not.toContainText('Undo me')
})

test('edits only the changed block and serializes a newer edit behind an in-flight save', async ({ page }) => {
  const api = await installApi(page, {
    pages: [pageRecord('page-a', 'Alpha', 1)],
    blocks: [
      block('page-a', 'first-id', 1, { type: 'paragraph', content: [{ type: 'text', text: 'First' }] }),
      block('page-a', 'second-id', 2, { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] }),
    ],
  })
  api.controls.mutationDelayMs = 350
  await page.goto('/#/app/ws-a/page/page-a')
  await editor(page).locator('p').first().click()
  await editor(page).press('End')
  await editor(page).pressSequentially(' A')
  await expect.poll(() => blockRequests(api.requests).filter((request) => request.method === 'PATCH').length, { timeout: 4000 }).toBe(1)
  await editor(page).pressSequentially(' B')
  await expect.poll(() => (api.blocks.find((item) => item.id === 'first-id')?.props.node as any)?.content?.[0]?.text, { timeout: 5000 }).toBe('First A B')
  expect(api.controls.maxConcurrentMutations).toBe(1)
  expect(blockRequests(api.requests).filter((request) => request.method === 'PATCH' && request.path.endsWith('/second-id'))).toHaveLength(0)
  expect(blockRequests(api.requests).filter((request) => request.method === 'PATCH').every((request) => !('orderKey' in request.body))).toBe(true)
  expect(api.blocks.find((item) => item.id === 'second-id')?.orderKey).toBe(String(2).padStart(16, '0'))
})

test('keeps legacy order keys during an ordinary text edit', async ({ page }) => {
  const old = block('page-a', 'legacy-id', 1, { type: 'paragraph', content: [{ type: 'text', text: 'Legacy' }] })
  old.orderKey = 'old-key'
  const api = await installApi(page, { pages: [pageRecord('page-a', 'Alpha', 1)], blocks: [old] })
  await page.goto('/#/app/ws-a/page/page-a')
  await editor(page).click()
  await editor(page).press('End')
  await editor(page).pressSequentially(' edit')
  await expect.poll(() => (api.blocks[0]?.props.node as any)?.content?.[0]?.text, { timeout: 4000 }).toBe('Legacy edit')
  expect(api.blocks[0]?.orderKey).toBe('old-key')
  expect(blockRequests(api.requests).find((request) => request.method === 'PATCH')?.body).not.toHaveProperty('orderKey')
})

test('refuses unsupported persisted blocks without opening a writable blank editor', async ({ page }) => {
  const unsupported: BlockResponse = {
    ...block('page-a', 'image-id', 1, { type: 'paragraph' }),
    type: 'image',
    props: { node: { type: 'image', attrs: { src: 'preserve-this' } } },
  }
  const api = await installApi(page, { pages: [pageRecord('page-a', 'Alpha', 1)], blocks: [unsupported] })
  await page.goto('/#/app/ws-a/page/page-a')
  await expect(page.getByRole('alert')).toContainText('尚不支持编辑')
  await expect(editor(page)).toHaveCount(0)
  expect(blockRequests(api.requests).filter((request) => request.method !== 'GET')).toHaveLength(0)
  expect(api.blocks[0]?.props).toEqual(unsupported.props)
})

test('pasting a block into another page assigns a new server Block ID', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const api = await installApi(page, {
    blocks: [block('page-a', 'source-block-id', 1, { type: 'paragraph', content: [{ type: 'text', text: 'Copy me' }] })],
  })
  await page.goto('/#/app/ws-a/page/page-a')
  await expect(editor(page)).toContainText('Copy me')
  await editor(page).click()
  await editor(page).press('Control+A')
  await editor(page).press('Control+C')
  await page.getByRole('button', { name: 'Bravo', exact: true }).click()
  await expect(editor(page)).toBeVisible()
  await editor(page).click()
  await editor(page).press('Control+V')
  await expect.poll(() => api.blocks.filter((item) => item.pageId === 'page-b').length, { timeout: 5000 }).toBe(1)
  expect(api.blocks.find((item) => item.pageId === 'page-b')?.id).not.toBe('source-block-id')
  expect(api.blocks.find((item) => item.pageId === 'page-b')?.props.node).toMatchObject({ content: [{ text: 'Copy me' }] })
})

test('reconciles a committed create whose response was lost before retrying', async ({ page }) => {
  const api = await installApi(page, { pages: [pageRecord('page-a', 'Alpha', 1)] })
  api.controls.lostCreateResponses = 1
  await page.goto('/#/app/ws-a/page/page-a')
  await editor(page).click()
  await editor(page).pressSequentially('Kept content')
  await expect(page.getByRole('button', { name: '重试保存' })).toBeVisible()
  expect(api.blocks).toHaveLength(1)
  await page.getByRole('button', { name: '重试保存' }).click()
  await expect(page.getByRole('status').filter({ hasText: '已保存' })).toBeVisible()
  expect(blockRequests(api.requests).filter((request) => request.method === 'POST')).toHaveLength(1)
  expect(blockRequests(api.requests).filter((request) => request.method === 'GET' && /\/blocks\/[^/]+$/.test(request.path))).toHaveLength(1)
  await page.reload()
  await expect(editor(page)).toContainText('Kept content')
})

test('reconciles a committed delete whose response was lost before retrying', async ({ page }) => {
  const api = await installApi(page, {
    pages: [pageRecord('page-a', 'Alpha', 1)],
    blocks: [
      block('page-a', 'first-id', 1, { type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] }),
      block('page-a', 'second-id', 2, { type: 'paragraph', content: [{ type: 'text', text: 'Bravo' }] }),
    ],
  })
  api.controls.lostDeleteResponses = 1
  await page.goto('/#/app/ws-a/page/page-a')
  await editor(page).locator('p').last().click()
  await editor(page).press('Home')
  await editor(page).press('Backspace')
  await expect(page.getByRole('button', { name: '重试保存' })).toBeVisible()
  expect(api.blocks).toHaveLength(1)
  await page.getByRole('button', { name: '重试保存' }).click()
  await expect(page.getByRole('status').filter({ hasText: '已保存' })).toBeVisible()
  expect(blockRequests(api.requests).filter((request) => request.method === 'DELETE')).toHaveLength(1)
})

test('waits for an in-flight create and the later undo before leaving the page', async ({ page }) => {
  const api = await installApi(page)
  api.controls.mutationDelayMs = 350
  await page.goto('/#/app/ws-a/page/page-a')
  await editor(page).click()
  await editor(page).pressSequentially('A')
  await expect.poll(() => blockRequests(api.requests).filter((request) => request.method === 'POST').length, { timeout: 4000 }).toBe(1)
  await editor(page).press('Control+Z')
  await expect(editor(page)).toHaveText('')
  await page.getByRole('button', { name: 'Bravo', exact: true }).click()
  await expect(page).toHaveURL(/page\/page-b$/)
  expect(api.blocks.filter((item) => item.pageId === 'page-a')).toHaveLength(0)
  expect(api.controls.maxConcurrentMutations).toBe(1)
})

test('keeps a dirty draft across session expiry and saves it after the same user logs in', async ({ page }) => {
  const api = await installApi(page, { pages: [pageRecord('page-a', 'Alpha', 1)] })
  await page.goto('/#/app/ws-a/page/page-a')
  await expect(editor(page)).toBeVisible()
  api.controls.unauthorized = true
  await editor(page).click()
  await editor(page).pressSequentially('Unsaved after expiry')
  await expect(page).toHaveURL(/#\/login\?redirect=/)
  await page.getByLabel('邮箱').fill('ava@example.com')
  await page.getByLabel('密码', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/#\/app\/ws-a\/page\/page-a$/)
  await expect(editor(page)).toContainText('Unsaved after expiry')
  await expect.poll(() => (api.blocks[0]?.props.node as any)?.content?.[0]?.text, { timeout: 5000 }).toBe('Unsaved after expiry')
})

test('preserves unsaved editor content when another product API expires the session', async ({ page }) => {
  const api = await installApi(page, { pages: [pageRecord('page-a', 'Alpha', 1)] })
  await page.goto('/#/app/ws-a/page/page-a')
  await expect(editor(page)).toBeVisible()
  await editor(page).dispatchEvent('compositionstart', { data: '' })
  await editor(page).pressSequentially('Draft from another API')
  api.controls.pageMutationUnauthorized = true
  await page.getByRole('button', { name: '页面操作：Alpha' }).click()
  await page.locator('.product-page-menu').getByRole('button', { name: '重命名' }).click()
  await page.getByLabel('页面标题').fill('Changed title')
  await page.getByRole('button', { name: '保存标题' }).click()
  await expect(page).toHaveURL(/#\/login\?redirect=/)
  expect(api.blocks).toHaveLength(0)
  await page.getByLabel('邮箱').fill('ava@example.com')
  await page.getByLabel('密码', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/#\/app\/ws-a\/page\/page-a$/)
  await expect(editor(page)).toContainText('Draft from another API')
  await expect.poll(() => (api.blocks[0]?.props.node as any)?.content?.[0]?.text, { timeout: 5000 }).toBe('Draft from another API')
})
