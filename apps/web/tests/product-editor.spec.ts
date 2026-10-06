import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Locator, type Page, type Route } from '@playwright/test'
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
  snapshotFailures: number
  snapshotDelayMs: number
  snapshotGate: Promise<void> | null
  mutationFailures: number
  mutationDelayMs: number
  unauthorized: boolean
  activeMutations: number
  maxConcurrentMutations: number
}

async function installApi(page: Page, options: { pages?: PageResponse[]; blocks?: BlockResponse[] } = {}) {
  const pages = [...(options.pages ?? [pageRecord('page-a', 'Alpha', 1), pageRecord('page-b', 'Bravo', 2)])]
  const blocks = [...(options.blocks ?? [])]
  const requests: Array<{ method: string; path: string; body?: any }> = []
  const controls: ApiControls = { snapshotFailures: 0, snapshotDelayMs: 0, snapshotGate: null, mutationFailures: 0, mutationDelayMs: 0, unauthorized: false, activeMutations: 0, maxConcurrentMutations: 0 }
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
    if (path === `/api/sync/workspaces/${workspace.id}/snapshot` && request.method() === 'GET') {
      await wait(controls.snapshotDelayMs)
      if (controls.snapshotGate) await controls.snapshotGate
      if (controls.snapshotFailures > 0) {
        controls.snapshotFailures -= 1
        return json(route, 503, error(503, 'Snapshot failed'))
      }
      return json(route, 200, { pages, blocks })
    }
    if (path === '/api/sync/operations' && request.method() === 'POST') {
      controls.activeMutations += 1
      controls.maxConcurrentMutations = Math.max(controls.maxConcurrentMutations, controls.activeMutations)
      await wait(controls.mutationDelayMs)
      controls.activeMutations -= 1
      if (controls.unauthorized) return json(route, 401, error(401, 'Session expired'))
      if (controls.mutationFailures > 0) {
        controls.mutationFailures -= 1
        return json(route, 503, error(503, 'Sync failed'))
      }
      const operation = body as { id: string; kind: string; workspaceId: string; payload: any }
      const payload = operation.payload
      if (operation.kind === 'block.upsert') {
        const existing = blocks.find((item) => item.id === payload.id)
        const record: BlockResponse = { ...payload, workspaceId: operation.workspaceId, parentBlockId: payload.parentBlockId ?? null, createdAt: existing?.createdAt ?? now, updatedAt: later }
        const index = blocks.findIndex((item) => item.id === record.id)
        if (index < 0) blocks.push(record); else blocks[index] = record
      } else if (operation.kind === 'block.delete') {
        const index = blocks.findIndex((item) => item.id === payload.id)
        if (index >= 0) blocks.splice(index, 1)
      } else if (operation.kind === 'page.upsert') {
        const existing = pages.find((item) => item.id === payload.id)
        const record: PageResponse = { ...payload, workspaceId: operation.workspaceId, createdAt: existing?.createdAt ?? now, updatedAt: later }
        const index = pages.findIndex((item) => item.id === record.id)
        if (index < 0) pages.push(record); else pages[index] = record
      } else if (operation.kind === 'page.move') {
        const record = pages.find((item) => item.id === payload.id)
        if (record) Object.assign(record, { parentPageId: payload.parentPageId, orderKey: payload.orderKey, updatedAt: later })
      } else if (operation.kind === 'page.delete') {
        const index = pages.findIndex((item) => item.id === payload.id)
        if (index >= 0) pages.splice(index, 1)
      }
      return json(route, 200, { id: operation.id, status: 'applied' })
    }
    return json(route, 404, error(404, 'Not found'))
  })
  return { controls, pages, blocks, requests }
}

const editor = (page: Page) => page.locator('.eotion-editor-content .tiptap')
const bubble = (page: Page) => page.getByRole('toolbar', { name: '选区格式' })
const blockRequests = (requests: Awaited<ReturnType<typeof installApi>>['requests']) => requests.filter((request) => request.path === '/api/sync/operations' && ['block.upsert', 'block.delete'].includes((request.body as any)?.kind))

async function selectParagraphText(paragraph: Locator) {
  await paragraph.evaluate(node => {
    const body = node.closest<HTMLElement>('.tiptap')!
    body.focus()
    const range = document.createRange()
    range.selectNodeContents(node)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
  })
}

async function canvasScreenshot(page: Page, name: string) {
  const directory = process.env.EOTION_VISUAL_QA_DIR
  if (!directory) return
  await mkdir(directory, { recursive: true })
  await page.screenshot({ path: path.join(directory, `${name}.png`), animations: 'disabled' })
}

async function pasteHtml(target: Locator, html: string, text: string) {
  await target.click()
  await target.press('Control+End')
  await target.evaluate((element, clipboard) => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/html', clipboard.html)
    clipboardData.setData('text/plain', clipboard.text)
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }))
  }, { html, text })
}

test('product page keeps title and editor in one open reading column across themes and mobile', async ({ page }) => {
  const browserErrors: string[] = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  await installApi(page, {
    pages: [pageRecord('page-a', 'Quiet Studio 文档', 1)],
    blocks: [block('page-a', 'block-a', 1, { type: 'paragraph', content: [{ type: 'text', text: '正文直接从画布开始。' }] })],
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/#/app/ws-a/page/page-a')
  await expect(page).toHaveTitle('Eotion')
  await expect(page).toHaveURL(/#\/app\/ws-a\/page\/page-a$/)
  await expect(editor(page)).toContainText('正文直接从画布开始。')
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  await expect(page.locator('.eotion-editor-toolbar')).toHaveCount(0)

  const desktop = await page.evaluate(() => {
    const readingColumn = document.querySelector('.product-editor-page')!
    const title = document.querySelector('.product-editor-heading')!
    const shell = document.querySelector('.eotion-editor')!
    const content = document.querySelector('.eotion-editor-content')!
    const body = document.querySelector('.eotion-editor-content .tiptap')!
    const shellStyle = getComputedStyle(shell)
    const contentStyle = getComputedStyle(content)
    const bodyStyle = getComputedStyle(body)
    return {
      columnWidth: readingColumn.getBoundingClientRect().width,
      titleLeft: title.getBoundingClientRect().left,
      editorLeft: body.getBoundingClientRect().left,
      border: shellStyle.borderTopWidth,
      radius: shellStyle.borderTopLeftRadius,
      background: shellStyle.backgroundColor,
      shadow: shellStyle.boxShadow,
      padding: contentStyle.paddingLeft,
      bodyFont: bodyStyle.font,
      bodyColor: bodyStyle.color,
    }
  })
  expect(desktop.columnWidth).toBeGreaterThanOrEqual(720)
  expect(desktop.columnWidth).toBeLessThanOrEqual(740)
  expect(desktop.editorLeft).toBe(desktop.titleLeft)
  expect(desktop).toMatchObject({ border: '0px', radius: '0px', background: 'rgba(0, 0, 0, 0)', shadow: 'none', padding: '0px' })
  expect(await page.evaluate(() => {
    const title = document.querySelector('.product-editor-heading h1')!.getBoundingClientRect()
    const heading = document.querySelector('.product-editor-heading')!.getBoundingClientRect()
    return title.left >= heading.left && title.right <= heading.right
  })).toBe(true)
  await canvasScreenshot(page, 'p583-desktop-light')

  await page.setViewportSize({ width: 1024, height: 768 })
  await expect(page.locator('.product-shell')).toHaveAttribute('data-layout', 'tablet')
  const readingWidth = () => page.locator('.product-editor-page').evaluate(node => node.getBoundingClientRect().width)
  await expect.poll(readingWidth).toBe(740)
  await page.getByRole('button', { name: '收起侧边栏' }).click()
  await expect.poll(readingWidth).toBe(740)
  await page.getByRole('button', { name: '展开侧边栏' }).click()
  await page.setViewportSize({ width: 1440, height: 900 })

  await page.evaluate(() => {
    localStorage.setItem('eotion:theme', 'dark')
    localStorage.setItem('eotion:editor-toolbar:user-ava:ws-a', 'true')
  })
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('.eotion-editor-toolbar')).toBeVisible()
  expect(await page.locator('.eotion-editor-toolbar').evaluate(node => {
    const style = getComputedStyle(node)
    return { border: style.borderBottomWidth, background: style.backgroundColor, shadow: style.boxShadow }
  })).toEqual({ border: '0px', background: 'rgba(0, 0, 0, 0)', shadow: 'none' })
  await canvasScreenshot(page, 'p583-desktop-dark-toolbar')

  await page.evaluate(() => localStorage.setItem('eotion:theme', 'light'))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window)
    window.matchMedia = (query: string) => {
      const result = nativeMatchMedia(query)
      if (query === '(pointer: coarse)') Object.defineProperty(result, 'matches', { configurable: true, value: true })
      return result
    }
  })
  await page.reload()
  await expect(page.locator('.eotion-editor-toolbar')).toHaveCount(0)
  await expect(page.getByRole('toolbar', { name: '触摸编辑工具栏' })).toBeVisible()
  const mobile = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    titleLeft: document.querySelector('.product-editor-heading')!.getBoundingClientRect().left,
    editorLeft: document.querySelector('.eotion-editor-content .tiptap')!.getBoundingClientRect().left,
  }))
  expect(mobile.documentWidth).toBeLessThanOrEqual(mobile.viewportWidth)
  expect(mobile.editorLeft).toBe(mobile.titleLeft)
  await canvasScreenshot(page, 'p583-mobile-390-light')

  await page.goto('/#/__dev/editor-foundation')
  await expect(page.locator('.document-editor .tiptap')).toBeVisible()
  const foundationBody = await page.locator('.document-editor .tiptap').evaluate(node => {
    const style = getComputedStyle(node)
    return { font: style.font, color: style.color }
  })
  expect(foundationBody).toEqual({ font: desktop.bodyFont, color: desktop.bodyColor })
  expect(browserErrors).toEqual([])
})

test('product page shows one sync status and keeps local save errors retryable', async ({ page }) => {
  await installApi(page, {
    pages: [pageRecord('page-a', 'Alpha', 1)],
    blocks: [block('page-a', 'block-a', 1, { type: 'paragraph', content: [{ type: 'text', text: '已有正文' }] })],
  })
  await page.goto('/#/app/ws-a/page/page-a')
  await expect(editor(page)).toContainText('已有正文')
  const syncStatus = page.locator('.product-sync-status')
  await expect(syncStatus).toHaveCount(1)
  await expect(syncStatus).toHaveAttribute('data-state', 'synced')
  await expect(syncStatus).toHaveText('已同步')
  await expect(page.getByText('已同步', { exact: true })).toHaveCount(1)
  await expect(page.getByText('已保存到本地', { exact: true })).toHaveCount(0)

  await page.context().setOffline(true)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(syncStatus).toHaveAttribute('data-state', 'offline')
  await expect(syncStatus).toContainText('离线 · 本地已保存')
  await expect(page.locator('.product-editor-heading .product-save-status')).toHaveCount(0)
  await expect(page.getByText('离线 · 本地已保存', { exact: true })).toHaveCount(1)

  await page.evaluate(async () => {
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    const local = await useProductSyncStore().store()
    const upsertBlock = local.upsertBlock.bind(local)
    let failOnce = true
    local.upsertBlock = async (record) => {
      if (failOnce) {
        failOnce = false
        throw new Error('Injected local save failure')
      }
      return upsertBlock(record)
    }
  })

  await editor(page).fill('Retry local save')
  const saveError = page.getByRole('alert')
  await expect(saveError).toContainText('Injected local save failure')
  const retrySave = page.getByRole('button', { name: '重试保存' })
  await expect(retrySave).toBeEnabled()
  await retrySave.click()
  await expect.poll(() => page.evaluate(async () => {
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    const local = await useProductSyncStore().store()
    return JSON.stringify(await local.listBlocksByPage('page-a'))
  })).toContain('Retry local save')
  await expect(saveError).toHaveCount(0)
})

test('pasting safe links keeps links and strips underline across save and reload', async ({ page }) => {
  const api = await installApi(page, { pages: [pageRecord('page-a', 'Alpha', 1)], blocks: [] })
  await page.goto('/#/app/ws-a/page/page-a')
  const body = editor(page)
  await expect(body).toBeVisible()

  const pastedText = '粘贴内容保持纯文本'
  await pasteHtml(body, `<p><a href="https://example.com" title="来源" target="_self"><u>${pastedText}</u></a></p>`, pastedText)
  await expect(body).toContainText(pastedText)
  await expect(body.locator('a')).toHaveAttribute('href', 'https://example.com')
  await expect(body.locator('u')).toHaveCount(0)
  await expect.poll(() => api.blocks.some((item) => JSON.stringify(item.props.node).includes(pastedText)), { timeout: 5000 }).toBe(true)

  const savedNodes = api.blocks.map((item) => item.props.node)
  expect(JSON.stringify(savedNodes)).toContain(pastedText)
  expect(JSON.stringify(savedNodes)).toContain('"type":"link"')
  expect(JSON.stringify(savedNodes)).not.toMatch(/"type"\s*:\s*"underline"/)
  expect(JSON.stringify(savedNodes)).toContain('"href":"https://example.com"')

  await page.reload()
  await expect(editor(page)).toContainText(pastedText)
  await expect(editor(page).locator('a')).toHaveAttribute('href', 'https://example.com')
  await expect(editor(page).locator('u')).toHaveCount(0)
})

test('empty page loads without mutations, then debounces edits with a stable block identity', async ({ page }) => {
  const api = await installApi(page, { pages: [pageRecord('page-a', 'Alpha', 1)], blocks: [] })
  await page.goto('/#/app/ws-a/page/page-a')
  await expect(editor(page)).toBeVisible()
  expect(api.requests.some((request) => request.path.endsWith('/snapshot'))).toBe(true)
  expect(blockRequests(api.requests)).toHaveLength(0)

  await editor(page).click()
  await editor(page).pressSequentially('First version')
  await editor(page).press('Control+A')
  await editor(page).pressSequentially('Updated once')
  await editor(page).press('Control+A')
  await editor(page).pressSequentially('Final text')
  await expect.poll(() => api.blocks.filter((item) => item.pageId === 'page-a').length, { timeout: 4000 }).toBe(1)
  const first = api.blocks[0]!
  const createdRequest = blockRequests(api.requests).find((request) => (request.body as any).kind === 'block.upsert')!
  expect((createdRequest.body as any).payload.id).toBe(first.id)

  await expect.poll(() => api.blocks[0]?.props.node, { timeout: 4000 }).toMatchObject({ content: [{ text: 'Final text' }] })
  expect(api.blocks).toHaveLength(1)
  expect(api.blocks[0]?.id).toBe(first.id)
  expect(blockRequests(api.requests).filter((request) => (request.body as any).kind === 'block.upsert' && (request.body as any).payload.id === first.id)).toHaveLength(1)
})

test('persists marks, heading and list structure and restores them after reload', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('eotion:editor-toolbar:user-ava:ws-a', 'true'))
  const api = await installApi(page, {
    pages: [pageRecord('page-a', 'Alpha', 1)],
    blocks: [
      block('page-a', 'stable-heading-id', 1, { type: 'paragraph', content: [{ type: 'text', text: 'Formatted title' }] }),
      block('page-a', 'stable-list-id', 2, { type: 'paragraph', content: [{ type: 'text', text: 'List item' }] }),
    ],
  })
  await page.goto('/#/app/ws-a/page/page-a')
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  const body = editor(page)
  await expect(body).toBeVisible()
  await body.locator('p').first().evaluate((paragraph) => {
    paragraph.focus()
    const range = document.createRange()
    range.selectNodeContents(paragraph)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
  })
  await page.keyboard.press('Control+B')
  await expect(body.locator('strong')).toContainText('Formatted title')
  await page.getByRole('button', { name: 'H2' }).click()
  await body.locator('p').last().click()
  await page.getByRole('button', { name: '列表', exact: true }).click()
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
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  const body = editor(page)
  await expect(body.locator(':scope > p')).toHaveText(['Alpha', 'Bravo'])
  await body.locator('p').first().evaluate((paragraph) => {
    paragraph.focus()
    const range = document.createRange()
    range.selectNodeContents(paragraph)
    range.collapse(false)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
  })
  await page.keyboard.press('Enter')
  await page.keyboard.type('Between')
  await expect.poll(() => api.blocks.length, { timeout: 5000 }).toBe(3)
  await expect.poll(() => [...api.blocks].sort((a, b) => a.orderKey.localeCompare(b.orderKey)).map((item) => (item.props.node as any).content?.[0]?.text), { timeout: 5000 }).toEqual(['Alpha', 'Between', 'Bravo'])

  await body.locator('p').nth(1).evaluate((paragraph) => {
    paragraph.focus()
    const range = document.createRange()
    range.selectNodeContents(paragraph)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
  })
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Backspace')
  await expect.poll(() => api.blocks.length, { timeout: 5000 }).toBe(2)
  await expect.poll(() => [...api.blocks].sort((a, b) => a.orderKey.localeCompare(b.orderKey)).map((item) => (item.props.node as any).content?.[0]?.text), { timeout: 5000 }).toEqual(['Alpha', 'Bravo'])
})

test('flushes edits on page navigation and isolates the next page document', async ({ page }) => {
  const api = await installApi(page)
  api.controls.mutationDelayMs = 120
  await page.goto('/#/app/ws-a/page/page-a')
  await editor(page).click()
  await page.keyboard.type('Saved on navigation')
  await page.getByRole('button', { name: 'Bravo', exact: true }).click()
  await expect(page).toHaveURL(/page\/page-b$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Bravo' })).toBeVisible()
  await expect.poll(() => api.blocks.length, { timeout: 5000 }).toBe(1)
  expect(api.blocks).toHaveLength(1)
  expect(api.blocks[0]).toMatchObject({ pageId: 'page-a', props: { node: { content: [{ text: 'Saved on navigation' }] } } })
  await expect(editor(page)).toHaveText('')
  expect(blockRequests(api.requests).some((request) => (request.body as any).workspaceId === workspace.id && (request.body as any).payload.pageId === 'page-b')).toBe(false)
})

test('reads both page bodies from the workspace snapshot without mixing them on navigation', async ({ page }) => {
  const api = await installApi(page, {
    blocks: [
      block('page-a', 'block-a', 1, { type: 'paragraph', content: [{ type: 'text', text: 'Old page body' }] }),
      block('page-b', 'block-b', 1, { type: 'paragraph', content: [{ type: 'text', text: 'Current page body' }] }),
    ],
  })
  await page.goto('/#/app/ws-a/page/page-a')
  await expect(editor(page)).toContainText('Old page body')
  await page.getByRole('button', { name: 'Bravo', exact: true }).click()
  await expect(page).toHaveURL(/page\/page-b$/)
  await expect(editor(page)).toContainText('Current page body')
  await expect(editor(page)).not.toContainText('Old page body')
})

test('keeps local editor content when sync fails and retries sync', async ({ page }) => {
  const api = await installApi(page, { pages: [pageRecord('page-a', 'Alpha', 1), pageRecord('page-b', 'Bravo', 2)] })
  api.controls.mutationFailures = 1000000
  await page.goto('/#/app/ws-a/page/page-a')
  await editor(page).click()
  await editor(page).pressSequentially('Retry me')
  await expect(page.getByRole('button', { name: /离线 · 本地已保存/ })).toBeVisible()
  await expect(editor(page)).toContainText('Retry me')
  await page.reload()
  await expect(editor(page)).toContainText('Retry me')
  await expect(page.getByRole('button', { name: /离线 · 本地已保存/ })).toBeVisible()
  api.controls.mutationFailures = 0
  await page.getByRole('button', { name: /离线 · 本地已保存/ }).click()
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  await expect.poll(() => api.blocks.length, { timeout: 5000 }).toBe(1)
  expect(api.blocks[0]?.props.node).toMatchObject({ content: [{ text: 'Retry me' }] })

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
  expect(blockRequests(api.requests)).toHaveLength(0)
  await body.dispatchEvent('compositionend', { data: 'Composing text' })
  await expect.poll(() => api.blocks.length, { timeout: 5000 }).toBe(1)
  expect(api.blocks[0]?.props.node).toMatchObject({ content: [{ text: 'Composing text' }] })
})

test('touch toolbar and mobile heading stay compact across themes, short viewport and keyboard inset', async ({ page }) => {
  const title = 'Quiet Studio 文档 — 一个需要正常换行的很长很长的页面标题'
  await installApi(page, { pages: [pageRecord('page-a', title, 1)] })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/app/ws-a/page/page-a')
  const toolbar = page.getByRole('toolbar', { name: '触摸编辑工具栏' })
  await expect(toolbar).toBeVisible()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  expect(await toolbar.getByRole('button').allTextContents()).toEqual(['', '', '文本', '2标题', '列表', '', ''])
  for (const name of ['粗体', '斜体', '文本', '二级标题（H2）', '列表', '插入图片', '插入文件']) {
    const button = toolbar.getByRole('button', { name })
    await expect(button).toBeVisible()
    const size = await button.evaluate(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height }))
    expect(size.width).toBeGreaterThanOrEqual(44)
    expect(size.height).toBeGreaterThanOrEqual(44)
    expect(await button.evaluate(node => getComputedStyle(node).borderTopWidth)).toBe('0px')
  }
  const headingButton = toolbar.getByRole('button', { name: '二级标题（H2）' })
  await expect(headingButton).toHaveAccessibleName('二级标题（H2）')
  await expect(headingButton.locator('[aria-hidden="true"] sub')).toHaveText('2')
  const headingLayout = await page.evaluate(() => {
    const title = document.querySelector('.product-editor-heading h1')!.getBoundingClientRect()
    const heading = document.querySelector('.product-editor-heading')!.getBoundingClientRect()
    return { titleRight: title.right, headingRight: heading.right, titleHeight: title.height, documentWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth }
  })
  expect(headingLayout.titleRight).toBeLessThanOrEqual(headingLayout.headingRight)
  expect(headingLayout.titleHeight).toBeGreaterThan(40)
  expect(headingLayout.documentWidth).toBeLessThanOrEqual(headingLayout.viewportWidth)
  expect(await toolbar.evaluate(node => node.scrollWidth)).toBeGreaterThan(await toolbar.evaluate(node => node.clientWidth))
  await canvasScreenshot(page, 'p584-mobile-light-long-title')

  await editor(page).click()
  await editor(page).pressSequentially('Touch formatting')
  await toolbar.getByRole('button', { name: '粗体' }).click()
  await expect(toolbar.getByRole('button', { name: '粗体' })).toHaveAttribute('aria-pressed', 'true')
  await expect(toolbar.getByRole('button', { name: '文本' })).toHaveAttribute('aria-pressed', 'true')
  await headingButton.click()
  await expect(headingButton).toHaveAttribute('aria-pressed', 'true')
  await expect(editor(page).locator('h2')).toContainText('Touch formatting')
  await expect(editor(page).locator('h1')).toHaveCount(0)
  await expect(toolbar.getByRole('button', { name: '文本' })).toHaveAttribute('aria-pressed', 'false')
  await toolbar.getByRole('button', { name: '列表' }).click()
  await expect(toolbar.getByRole('button', { name: '列表' })).toHaveAttribute('aria-pressed', 'true')
  await toolbar.getByRole('button', { name: '文本' }).click()

  await page.setViewportSize({ width: 390, height: 520 })
  await page.evaluate(() => document.documentElement.style.setProperty('--safe-bottom', '20px'))
  const shortViewport = await toolbar.evaluate(node => {
    const rect = node.getBoundingClientRect()
    return { bottom: rect.bottom, height: rect.height, paddingBottom: getComputedStyle(node).paddingBottom, pageWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth }
  })
  expect(shortViewport.bottom).toBe(520)
  expect(shortViewport.height).toBeGreaterThanOrEqual(70)
  expect(shortViewport.paddingBottom).toBe('26px')
  expect(shortViewport.pageWidth).toBeLessThanOrEqual(shortViewport.viewportWidth)
  await canvasScreenshot(page, 'p584-mobile-short-safe-area')

  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, 'height', { configurable: true, value: 300 })
    window.visualViewport!.dispatchEvent(new Event('resize'))
  })
  await expect.poll(() => toolbar.evaluate(node => getComputedStyle(node).bottom)).toBe('220px')
  await expect.poll(() => page.evaluate(() => {
    const selection = window.getSelection()!
    const range = selection.getRangeAt(0).cloneRange()
    range.collapse(false)
    return range.getBoundingClientRect().bottom + 12 <= document.querySelector('.eotion-touch-toolbar')!.getBoundingClientRect().top
  })).toBe(true)
  for (let index = 0; index < 20; index += 1) await editor(page).press('Enter')
  await editor(page).pressSequentially('Last visible line')
  await expect(editor(page)).toContainText('Last visible line')
  await expect.poll(() => page.evaluate(() => {
    const range = window.getSelection()!.getRangeAt(0).cloneRange()
    range.collapse(false)
    return range.getBoundingClientRect().bottom + 12 <= document.querySelector('.eotion-touch-toolbar')!.getBoundingClientRect().top
  })).toBe(true)
  expect(await page.locator('.document-wrap').evaluate(node => node.scrollTop)).toBeGreaterThan(0)
  await canvasScreenshot(page, 'p584-mobile-keyboard-inset')

  await page.evaluate(() => localStorage.setItem('eotion:theme', 'dark'))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(toolbar).toBeVisible()
  await canvasScreenshot(page, 'p584-mobile-dark')
})

test('touch caret visibility does not depend on keyboard inset and requires editor focus', async ({ page }) => {
  await installApi(page, { pages: [pageRecord('page-a', 'Alpha', 1)] })
  await page.setViewportSize({ width: 390, height: 640 })
  await page.goto('/#/app/ws-a/page/page-a')
  const body = editor(page)
  const toolbar = page.getByRole('toolbar', { name: '触摸编辑工具栏' })
  await body.click()
  await body.pressSequentially('Visible caret')
  const initial = await page.evaluate(() => ({
    scrollTop: document.querySelector('.document-wrap')!.scrollTop,
    keyboardPadding: getComputedStyle(document.querySelector('.eotion-editor')!).getPropertyValue('--touch-keyboard-inset').trim(),
  }))
  expect(initial.keyboardPadding).toBe('0px')
  await page.evaluate(async () => {
    window.dispatchEvent(new Event('resize'))
    window.dispatchEvent(new Event('scroll'))
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  })
  expect(await page.locator('.document-wrap').evaluate(node => node.scrollTop)).toBe(initial.scrollTop)

  await toolbar.evaluate(node => node.style.setProperty('bottom', '400px', 'important'))
  await body.evaluate(node => (node as HTMLElement).blur())
  await page.evaluate(async () => {
    window.dispatchEvent(new Event('scroll'))
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  })
  expect(await page.locator('.document-wrap').evaluate(node => node.scrollTop)).toBe(initial.scrollTop)
  await toolbar.evaluate(node => node.style.setProperty('bottom', '0px', 'important'))

  await body.click()
  await body.press('Control+End')
  for (let line = 0; line < 20; line += 1) {
    await body.pressSequentially(`Line ${line}`)
    await body.press('Enter')
  }
  await body.locator('p').nth(10).click()
  await body.press('End')
  await page.evaluate(async () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))))
  const beforeObstruction = await page.evaluate(() => {
    const selection = window.getSelection()!
    const range = selection.getRangeAt(0).cloneRange()
    range.collapse(false)
    const caret = range.getBoundingClientRect()
    const toolbar = document.querySelector<HTMLElement>('.eotion-touch-toolbar')!
    const top = caret.bottom - 8
    toolbar.style.setProperty('bottom', `${window.innerHeight - toolbar.getBoundingClientRect().height - top}px`, 'important')
    const overlap = Math.ceil(caret.bottom + 12 - toolbar.getBoundingClientRect().top)
    return { scrollTop: document.querySelector('.document-wrap')!.scrollTop, overlap }
  })
  expect(beforeObstruction.overlap).toBeGreaterThan(0)
  await body.dispatchEvent('compositionend', { data: 'Caret behind toolbar' })
  await expect.poll(() => page.locator('.document-wrap').evaluate(node => node.scrollTop)).toBe(beforeObstruction.scrollTop + beforeObstruction.overlap)
  await expect.poll(() => page.evaluate(() => {
    const selection = window.getSelection()
    const range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null
    if (!range) return false
    range.collapse(false)
    const caret = range.getBoundingClientRect()
    const toolbarTop = document.querySelector('.eotion-touch-toolbar')!.getBoundingClientRect().top
    return caret.bottom + 12 <= toolbarTop
  })).toBe(true)
  expect(await page.locator('.eotion-editor').evaluate(node => getComputedStyle(node).getPropertyValue('--touch-keyboard-inset').trim())).toBe('0px')

  const settledScrollTop = await page.locator('.document-wrap').evaluate(node => node.scrollTop)
  await page.evaluate(async () => {
    window.dispatchEvent(new Event('resize'))
    window.dispatchEvent(new Event('scroll'))
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  })
  expect(await page.locator('.document-wrap').evaluate(node => node.scrollTop)).toBe(settledScrollTop)

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.reload()
  await expect(page.getByRole('toolbar', { name: '触摸编辑工具栏' })).toHaveCount(0)
  await body.click()
  await body.pressSequentially('Desktop caret')
  const desktopScrollTop = await page.locator('.document-wrap').evaluate(node => node.scrollTop)
  await page.evaluate(async () => {
    window.dispatchEvent(new Event('resize'))
    window.dispatchEvent(new Event('scroll'))
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  })
  expect(await page.locator('.document-wrap').evaluate(node => node.scrollTop)).toBe(desktopScrollTop)
})

test('keeps the P2 fixture, slash command and undo path available', async ({ page }) => {
  await page.goto('/#/__dev/editor-p2')
  await page.getByRole('button', { name: '加载 5,000 区块' }).click()
  await expect(page.getByLabel('加载指标')).toContainText('5000', { timeout: 15000 })
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

test('slash lists Chinese grouped commands, filters, navigates and respects IME and Escape', async ({ page }) => {
  await installApi(page, { pages: [pageRecord('page-a', 'Alpha', 1)] })
  await page.goto('/#/app/ws-a/page/page-a')
  const body = editor(page)
  await body.click()
  await body.pressSequentially('/')
  const menu = page.locator('.p2-slash-menu')
  await expect(bubble(page)).toHaveCount(0)
  await expect(menu.getByRole('option')).toHaveText([
    '文本', '一级标题', '二级标题', '项目列表', '编号列表', '待办', '引用', '代码块', '折叠列表', '分割线', '图片', '文件',
  ])
  await expect(menu.locator('.p2-slash-group')).toHaveText(['基础', '块', '媒体'])
  await page.keyboard.press('ArrowUp')
  await expect(menu.getByRole('option', { name: '文件' })).toHaveAttribute('aria-selected', 'true')
  expect(await menu.evaluate(node => {
    const selected = node.querySelector('[aria-selected="true"]')!.getBoundingClientRect()
    const visible = node.getBoundingClientRect()
    return selected.top >= visible.top && selected.bottom <= visible.bottom
  })).toBe(true)
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await body.press('Control+A')
  await body.press('Backspace')
  await body.evaluate(node => node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })))
  await body.pressSequentially('/')
  await expect(menu).toHaveCount(0)
  await body.evaluate(node => node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })))
  await body.press('Control+A')
  await body.press('Backspace')
  await body.pressSequentially('/列表')
  await expect(menu.getByRole('option')).toHaveText(['项目列表', '编号列表', '折叠列表'])
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('option', { name: '编号列表' })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowUp')
  await expect(menu.getByRole('option', { name: '项目列表' })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(body.locator('ol')).toBeVisible()
})

test('desktop toolbar and slash stay compact in light, dark and mobile layouts', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('eotion:editor-toolbar:user-ava:ws-a', 'true'))
  await installApi(page, { pages: [pageRecord('page-a', 'Alpha', 1)] })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/#/app/ws-a/page/page-a')
  const toolbar = page.locator('.eotion-editor-toolbar')
  await expect(toolbar.getByRole('button')).toHaveText(['文本', 'H1', 'H2', '列表', '编号列表', '图片', '文件'])
  await editor(page).click()
  await editor(page).pressSequentially('/')
  await expect(page.locator('.p2-slash-menu')).toBeVisible()
  expect(await page.locator('.p2-slash-menu').evaluate(node => node.getBoundingClientRect().width)).toBeGreaterThanOrEqual(200)
  await canvasScreenshot(page, 'p585-desktop-light')
  await page.evaluate(() => localStorage.setItem('eotion:theme', 'dark'))
  await page.reload()
  await editor(page).click()
  await editor(page).press('Control+A')
  await editor(page).pressSequentially('/')
  await expect(page.locator('.p2-slash-menu')).toBeVisible()
  await canvasScreenshot(page, 'p585-desktop-dark')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => localStorage.setItem('eotion:theme', 'light'))
  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window)
    window.matchMedia = (query: string) => {
      const result = nativeMatchMedia(query)
      if (query === '(pointer: coarse)') Object.defineProperty(result, 'matches', { configurable: true, value: true })
      return result
    }
  })
  await page.reload()
  await expect(toolbar).toHaveCount(0)
  await expect(page.getByRole('toolbar', { name: '触摸编辑工具栏' }).getByRole('button')).toHaveCount(7)
  await editor(page).click()
  await editor(page).press('Control+A')
  await editor(page).pressSequentially('/')
  await expect(page.locator('.p2-slash-menu')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await canvasScreenshot(page, 'p585-mobile-slash')
  await page.evaluate(() => localStorage.setItem('eotion:theme', 'dark'))
  await page.reload()
  await editor(page).click()
  await editor(page).press('Control+A')
  await editor(page).pressSequentially('/')
  await expect(page.locator('.p2-slash-menu')).toBeVisible()
  await page.keyboard.press('ArrowUp')
  await expect(page.locator('.p2-slash-menu').getByRole('option', { name: '文件' })).toHaveAttribute('aria-selected', 'true')
  await canvasScreenshot(page, 'p585-mobile-slash-media')
})

test('fixed toolbar converts a list item back to a top-level paragraph', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('eotion:editor-toolbar:user-ava:ws-a', 'true'))
  await installApi(page, { pages: [pageRecord('page-a', 'Alpha', 1)] })
  await page.goto('/#/app/ws-a/page/page-a')
  const body = editor(page)
  await body.click()
  await body.pressSequentially('List item')
  await page.locator('.eotion-editor-toolbar').getByRole('button', { name: '编号列表' }).click()
  await expect(body.locator('ol')).toBeVisible()
  await page.locator('.eotion-editor-toolbar').getByRole('button', { name: '文本' }).click()
  await expect(body.locator(':scope > p').first()).toHaveText('List item')
  await expect(body.locator('ol')).toHaveCount(0)
})

for (const { label, type, selector } of [
  { label: '文本', type: 'paragraph', selector: 'p' },
  { label: '一级标题', type: 'heading', selector: 'h1' },
  { label: '二级标题', type: 'heading', selector: 'h2' },
  { label: '项目列表', type: 'bulleted-list', selector: 'ul' },
  { label: '编号列表', type: 'numbered-list', selector: 'ol' },
  { label: '待办', type: 'todo', selector: '.attachment-todo' },
  { label: '引用', type: 'quote', selector: 'blockquote' },
  { label: '代码块', type: 'code', selector: 'pre' },
  { label: '折叠列表', type: 'toggle', selector: '.eotion-toggle' },
  { label: '分割线', type: 'divider', selector: 'hr' },
]) {
  test(`slash ${label} saves and reloads the supported block`, async ({ page }) => {
    const api = await installApi(page, { pages: [pageRecord('page-a', 'Alpha', 1)] })
    await page.goto('/#/app/ws-a/page/page-a')
    const body = editor(page)
    await body.click()
    await body.pressSequentially('/')
    await page.locator('.p2-slash-menu').getByRole('option', { name: label, exact: true }).click()
    await expect(body.locator(selector)).toBeVisible()
    if (type === 'todo') await body.getByRole('checkbox', { name: '完成事项' }).check()
    if (type !== 'todo' && type !== 'divider') await body.pressSequentially(`P585 ${label}`)
    await expect.poll(() => api.blocks.some(block => block.type === type), { timeout: 5000 }).toBe(true)
    const saved = api.blocks.find(block => block.type === type)!
    if (label === '一级标题') expect((saved.props.node as any).attrs?.level).toBe(1)
    if (label === '二级标题') expect((saved.props.node as any).attrs?.level).toBe(2)
    if (type === 'numbered-list') expect((saved.props.node as any).attrs).toEqual({ start: 1 })
    if (type === 'todo') expect((saved.props.node as any).attrs?.checked).toBe(true)
    await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
    await page.reload()
    await expect(editor(page).locator(selector)).toBeVisible()
    if (type === 'todo') await expect(editor(page).getByRole('checkbox', { name: '完成事项' })).toBeChecked()
  })
}

for (const { shortcut, mark, selector } of [
  { shortcut: 'Control+Shift+S', mark: 'strike', selector: 's' },
  { shortcut: 'Control+E', mark: 'code', selector: 'code' },
]) {
  test(`${mark} keyboard command saves and reloads its mark`, async ({ page }) => {
    const api = await installApi(page, { pages: [pageRecord('page-a', 'Alpha', 1)] })
    await page.goto('/#/app/ws-a/page/page-a')
    await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
    const body = editor(page)
    await body.click()
    await body.pressSequentially(mark)
    await expect(body.locator('p').first()).toHaveText(mark)
    await selectParagraphText(body.locator('p').first())
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(mark)
    await page.keyboard.press(shortcut)
    await expect(body.locator(selector)).toHaveText(mark)
    await expect.poll(() => api.blocks.some(block => JSON.stringify(block.props.node).includes(`"type":"${mark}"`)), { timeout: 5000 }).toBe(true)
    await page.reload()
    await expect(editor(page).locator(selector)).toHaveText(mark)
  })
}

test('selection bubble toggles existing marks, combines marks and reloads saved content', async ({ page }) => {
  const api = await installApi(page, {
    pages: [pageRecord('page-a', 'Alpha', 1)],
    blocks: [
      block('page-a', 'bubble-a', 1, { type: 'paragraph', content: [{ type: 'text', text: 'Combined marks' }] }),
      block('page-a', 'bubble-b', 2, { type: 'paragraph', content: [{ type: 'text', text: 'Inline code' }] }),
    ],
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/#/app/ws-a/page/page-a')
  await expect(page.locator('.product-shell')).toHaveAttribute('data-layout', 'desktop')
  await expect(page.locator('.product-shell')).toHaveAttribute('data-input', 'mouse')
  const body = editor(page)
  const menu = bubble(page)
  await expect(menu).toHaveCount(0)
  await selectParagraphText(body.locator('p').first())
  await expect(menu).toBeVisible()
  await canvasScreenshot(page, 'p586-desktop-light-selection')
  await expect(menu.getByRole('button')).toHaveCount(5)
  const buttonSize = await menu.getByRole('button', { name: '粗体' }).evaluate(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height }))
  expect(buttonSize).toEqual({ width: 32, height: 32 })
  await menu.getByRole('button', { name: '粗体' }).click()
  await expect(menu.getByRole('button', { name: '粗体' })).toHaveAttribute('aria-pressed', 'true')
  await expect(body.locator('p').first().locator('strong')).toHaveText('Combined marks')
  await menu.getByRole('button', { name: '粗体' }).click()
  await expect(menu.getByRole('button', { name: '粗体' })).toHaveAttribute('aria-pressed', 'false')
  await expect(body.locator('p').first().locator('strong')).toHaveCount(0)
  for (const name of ['粗体', '斜体', '删除线']) {
    await menu.getByRole('button', { name }).click()
    await expect(menu.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true')
  }
  await expect(body.locator('p').first().locator('strong em s')).toHaveText('Combined marks')
  await canvasScreenshot(page, 'p586-multiple-active-marks')

  await selectParagraphText(body.locator('p').nth(1))
  await expect(menu).toBeVisible()
  await menu.getByRole('button', { name: '行内代码' }).click()
  await expect(menu.getByRole('button', { name: '行内代码' })).toHaveAttribute('aria-pressed', 'true')
  await expect(body.locator('p').nth(1).locator('code')).toHaveText('Inline code')
  await expect.poll(() => api.blocks.map(item => JSON.stringify(item.props.node)), { timeout: 5000 }).toEqual([
    expect.stringContaining('"type":"bold"'),
    expect.stringContaining('"type":"code"'),
  ])
  expect(JSON.stringify(api.blocks[0]?.props.node)).toContain('"type":"italic"')
  expect(JSON.stringify(api.blocks[0]?.props.node)).toContain('"type":"strike"')
  await page.reload()
  await expect(editor(page).locator('p').first().locator('strong em s')).toHaveText('Combined marks')
  await expect(editor(page).locator('p').nth(1).locator('code')).toHaveText('Inline code')
})

test('selection bubble creates, edits, removes and combines links across save and reload', async ({ page }) => {
  const api = await installApi(page, {
    pages: [pageRecord('page-a', 'Alpha', 1)],
    blocks: [
      block('page-a', 'link-a', 1, { type: 'paragraph', content: [{ type: 'text', text: 'Link text' }] }),
      block('page-a', 'link-b', 2, { type: 'paragraph', content: [{ type: 'text', text: 'Bold link' }] }),
    ],
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/#/app/ws-a/page/page-a')
  const body = editor(page)
  const menu = bubble(page)
  const paragraph = body.locator('p').first()

  await selectParagraphText(paragraph)
  await expect(menu).toBeVisible()
  await menu.getByRole('button', { name: '链接' }).click()
  const input = page.getByRole('textbox', { name: '链接地址' })
  await expect(input).toBeVisible()
  await expect(input).toBeFocused()
  await canvasScreenshot(page, 'p587-desktop-light-link-editing')
  await input.fill('https://first.example/path')
  await input.press('Enter')
  await expect(paragraph.locator('a')).toHaveAttribute('href', 'https://first.example/path')
  await expect.poll(() => JSON.stringify(api.blocks.find(item => item.id === 'link-a')?.props.node)).toContain('"href":"https://first.example/path"')

  const pageUrl = page.url()
  await paragraph.locator('a').click()
  await expect(page).toHaveURL(pageUrl)
  await page.reload()
  const reloadedParagraph = editor(page).locator('p').first()
  await expect(reloadedParagraph.locator('a')).toHaveAttribute('href', 'https://first.example/path')

  await selectParagraphText(reloadedParagraph)
  await expect(bubble(page).getByRole('button', { name: '链接' })).toHaveAttribute('aria-pressed', 'true')
  await bubble(page).getByRole('button', { name: '链接' }).click()
  const editInput = page.getByRole('textbox', { name: '链接地址' })
  await expect(editInput).toHaveValue('https://first.example/path')
  await editInput.fill('https://cancelled.example')
  await editInput.press('Escape')
  await expect(bubble(page).getByRole('button', { name: '链接' })).toBeVisible()
  await expect(reloadedParagraph.locator('a')).toHaveAttribute('href', 'https://first.example/path')

  await bubble(page).getByRole('button', { name: '链接' }).click()
  await page.getByRole('textbox', { name: '链接地址' }).fill('https://cancelled.example')
  await page.getByRole('button', { name: '取消链接编辑' }).click()
  await expect(reloadedParagraph.locator('a')).toHaveAttribute('href', 'https://first.example/path')

  await bubble(page).getByRole('button', { name: '链接' }).click()
  await page.getByRole('textbox', { name: '链接地址' }).fill('https://updated.example')
  await page.getByRole('button', { name: '应用链接' }).click()
  await expect(reloadedParagraph.locator('a')).toHaveAttribute('href', 'https://updated.example')
  await expect.poll(() => JSON.stringify(api.blocks.find(item => item.id === 'link-a')?.props.node)).toContain('"href":"https://updated.example"')

  await page.evaluate(() => localStorage.setItem('eotion:theme', 'dark'))
  await page.reload()
  const darkParagraph = editor(page).locator('p').first()
  await selectParagraphText(darkParagraph)
  await bubble(page).getByRole('button', { name: '链接' }).click()
  await expect(page.getByRole('textbox', { name: '链接地址' })).toHaveValue('https://updated.example')
  await canvasScreenshot(page, 'p587-desktop-dark-link-editing')
  await page.getByRole('button', { name: '移除链接' }).click()
  await expect(darkParagraph).toHaveText('Link text')
  await expect(darkParagraph.locator('a')).toHaveCount(0)
  await expect.poll(() => JSON.stringify(api.blocks.find(item => item.id === 'link-a')?.props.node)).not.toContain('"type":"link"')
  await page.reload()
  await expect(editor(page).locator('p').first()).toHaveText('Link text')
  await expect(editor(page).locator('p').first().locator('a')).toHaveCount(0)

  const combinedParagraph = editor(page).locator('p').nth(1)
  await selectParagraphText(combinedParagraph)
  await bubble(page).getByRole('button', { name: '粗体' }).click()
  await selectParagraphText(combinedParagraph)
  await bubble(page).getByRole('button', { name: '链接' }).click()
  await page.getByRole('textbox', { name: '链接地址' }).fill('http://combined.example')
  await page.getByRole('textbox', { name: '链接地址' }).press('Enter')
  await expect(combinedParagraph.locator('a strong')).toHaveText('Bold link')
  await expect.poll(() => JSON.stringify(api.blocks.find(item => item.id === 'link-b')?.props.node)).toContain('"type":"bold"')
  await expect.poll(() => JSON.stringify(api.blocks.find(item => item.id === 'link-b')?.props.node)).toContain('"type":"link"')
  const persistedLinkMark = (api.blocks.find(item => item.id === 'link-b')?.props.node as any).content[0].marks.find((mark: any) => mark.type === 'link')
  expect(persistedLinkMark.attrs).toEqual({ href: 'http://combined.example' })
  await page.reload()
  await expect(editor(page).locator('p').nth(1).locator('a strong')).toHaveText('Bold link')
})

test('link editor rejects unsafe schemes and persisted links or mark attributes fail closed', async ({ page }) => {
  const api = await installApi(page, {
    pages: [pageRecord('page-a', 'Alpha', 1)],
    blocks: [block('page-a', 'unsafe-link', 1, { type: 'paragraph', content: [{ type: 'text', text: 'Reject this' }] })],
  })
  await page.goto('/#/app/ws-a/page/page-a')
  const paragraph = editor(page).locator('p')
  await selectParagraphText(paragraph)
  await bubble(page).getByRole('button', { name: '链接' }).click()
  const input = page.getByRole('textbox', { name: '链接地址' })
  for (const href of ['javascript:alert(1)', 'data:text/html,unsafe', 'file:///etc/passwd']) {
    await input.fill(href)
    await page.getByRole('button', { name: '应用链接' }).click()
    await expect(input).toBeVisible()
    await expect(paragraph.locator('a')).toHaveCount(0)
  }
  expect(blockRequests(api.requests).some(request => JSON.stringify(request.body).match(/javascript:|data:text\/html|file:\/\//))).toBe(false)

  const invalidNodes = [
    { type: 'paragraph', content: [{ type: 'text', text: 'bad scheme', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'bad data scheme', marks: [{ type: 'link', attrs: { href: 'data:text/html,unsafe' } }] }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'bad file scheme', marks: [{ type: 'link', attrs: { href: 'file:///etc/passwd' } }] }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'unknown link attr', marks: [{ type: 'link', attrs: { href: 'https://example.com', title: 'unknown' } }] }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'unknown bold attr', marks: [{ type: 'bold', attrs: { level: 1 } }] }] },
  ]
  for (const [index, node] of invalidNodes.entries()) {
    api.blocks.splice(0, api.blocks.length, block('page-a', `invalid-${index}`, 1, node))
    await page.reload()
    await expect(page.getByRole('alert')).toContainText('尚不支持编辑')
    await expect(editor(page)).toHaveCount(0)
    expect(blockRequests(api.requests)).toHaveLength(0)
  }
})

test('selection bubble hides on collapse, blur, Escape and IME; stays in viewport in light and dark', async ({ page }) => {
  const browserErrors: string[] = []
  page.on('pageerror', error => browserErrors.push(error.message))
  await installApi(page, { pages: [pageRecord('page-a', 'Alpha', 1)], blocks: [block('page-a', 'bubble-a', 1, { type: 'paragraph', content: [{ type: 'text', text: 'Selection near viewport edge' }] })] })
  await page.setViewportSize({ width: 800, height: 420 })
  await page.goto('/#/app/ws-a/page/page-a')
  await expect(page.locator('.product-shell')).toHaveAttribute('data-layout', 'tablet')
  await expect(page.locator('.product-shell')).toHaveAttribute('data-input', 'mouse')
  const body = editor(page)
  const menu = bubble(page)
  await body.locator('p').click()
  await expect(menu).toHaveCount(0)
  await selectParagraphText(body.locator('p'))
  await expect(menu).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.product-shell')).toHaveAttribute('data-layout', 'mobile')
  await expect(menu).toHaveCount(0)
  await expect(page.getByRole('toolbar', { name: '触摸编辑工具栏' }).getByRole('button')).toHaveCount(7)
  await page.setViewportSize({ width: 800, height: 420 })
  await expect(page.locator('.product-shell')).toHaveAttribute('data-layout', 'tablet')
  await body.locator('p').click()
  await expect(menu).toHaveCount(0)
  await selectParagraphText(body.locator('p'))
  await expect(menu).toBeVisible()
  const position = await menu.evaluate(node => {
    const rect = node.getBoundingClientRect()
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight }
  })
  expect(position.left).toBeGreaterThanOrEqual(0)
  expect(position.right).toBeLessThanOrEqual(position.width)
  expect(position.top).toBeGreaterThanOrEqual(0)
  expect(position.bottom).toBeLessThanOrEqual(position.height)
  await body.locator('p').evaluate(node => { (node as HTMLElement).style.textAlign = 'right' })
  await selectParagraphText(body.locator('p'))
  await expect(menu).toBeVisible()
  const rightEdge = await menu.boundingBox()
  expect(rightEdge).not.toBeNull()
  expect(rightEdge!.x + rightEdge!.width).toBeLessThanOrEqual(800)
  await body.locator('p').evaluate(node => { (node as HTMLElement).style.textAlign = '' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await selectParagraphText(body.locator('p'))
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await body.locator('p').click()
  await expect(menu).toHaveCount(0)
  await selectParagraphText(body.locator('p'))
  await expect(menu).toBeVisible()
  await page.locator('.eotion-bubble-menu-host').focus()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await body.locator('p').click()
  await selectParagraphText(body.locator('p'))
  await expect(menu).toBeVisible()
  await menu.getByRole('button', { name: '粗体' }).focus()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await body.locator('p').click()
  await selectParagraphText(body.locator('p'))
  await expect(menu).toBeVisible()
  await body.evaluate(node => node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })))
  await expect(menu).toHaveCount(0)
  await body.evaluate(node => node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })))
  await body.evaluate(node => (node as HTMLElement).blur())
  await expect(menu).toHaveCount(0)
  await page.evaluate(() => localStorage.setItem('eotion:theme', 'dark'))
  await page.reload()
  await selectParagraphText(editor(page).locator('p'))
  await expect(bubble(page)).toBeVisible()
  await canvasScreenshot(page, 'p586-desktop-dark-selection')
  expect(browserErrors).toEqual([])
})

test('tablet coarse pointer hides selection bubble and keeps touch toolbar available', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window)
    window.matchMedia = (query: string) => {
      const result = nativeMatchMedia(query)
      if (query === '(pointer: coarse)') Object.defineProperty(result, 'matches', { configurable: true, value: true })
      return result
    }
  })
  await installApi(page, { pages: [pageRecord('page-a', 'Alpha', 1)], blocks: [block('page-a', 'bubble-a', 1, { type: 'paragraph', content: [{ type: 'text', text: 'Tablet selection' }] })] })
  await page.setViewportSize({ width: 800, height: 1024 })
  await page.goto('/#/app/ws-a/page/page-a')
  await expect(page.locator('.product-shell')).toHaveAttribute('data-layout', 'tablet')
  await expect(page.locator('.product-shell')).toHaveAttribute('data-input', 'hybrid')
  await selectParagraphText(editor(page).locator('p'))
  await expect(bubble(page)).toHaveCount(0)
  await expect(page.getByRole('toolbar', { name: '触摸编辑工具栏' }).getByRole('button')).toHaveCount(7)
})

test('mobile selection bubble stays hidden without horizontal overflow and leaves touch toolbar available', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window)
    window.matchMedia = (query: string) => {
      const result = nativeMatchMedia(query)
      if (query === '(pointer: coarse)') Object.defineProperty(result, 'matches', { configurable: true, value: true })
      return result
    }
  })
  await installApi(page, { pages: [pageRecord('page-a', 'Alpha', 1)], blocks: [block('page-a', 'bubble-a', 1, { type: 'paragraph', content: [{ type: 'text', text: 'Mobile selection' }] })] })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/app/ws-a/page/page-a')
  await expect(page.locator('.product-shell')).toHaveAttribute('data-layout', 'mobile')
  await expect(page.locator('.product-shell')).toHaveAttribute('data-input', 'touch')
  await selectParagraphText(editor(page).locator('p'))
  await expect(bubble(page)).toHaveCount(0)
  await expect(page.getByRole('toolbar', { name: '触摸编辑工具栏' }).getByRole('button')).toHaveCount(7)
  await pasteHtml(editor(page), '<p><a href="https://touch.example">Touch link</a></p>', 'Touch link')
  await expect(editor(page).locator('a')).toHaveAttribute('href', 'https://touch.example')
  await expect(bubble(page)).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await canvasScreenshot(page, 'p587-mobile-link')
})

test('non-formatable code block and attachment selection never open the text formatting bubble', async ({ page }) => {
  const attachment = block('page-a', 'bubble-image', 2, {
    type: 'eotionImage', attrs: { fileId: 'image-file', name: 'image.png', mimeType: 'image/png', size: 10, url: 'https://example.com/image.png' },
  })
  attachment.type = 'image'
  const codeBlock = block('page-a', 'bubble-code-block', 3, { type: 'codeBlock', content: [{ type: 'text', text: 'No marks here' }] })
  codeBlock.type = 'code'
  await installApi(page, {
    pages: [pageRecord('page-a', 'Alpha', 1)],
    blocks: [block('page-a', 'bubble-text', 1, { type: 'paragraph', content: [{ type: 'text', text: 'Format this' }] }), attachment, codeBlock],
  })
  await page.goto('/#/app/ws-a/page/page-a')
  await selectParagraphText(editor(page).locator('p'))
  await expect(bubble(page)).toBeVisible()
  await page.locator('.attachment-image .attachment-caption-name').click()
  await expect(bubble(page)).toHaveCount(0)
  await selectParagraphText(editor(page).locator('pre'))
  await expect(bubble(page)).toHaveCount(0)
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
  await expect.poll(() => blockRequests(api.requests).filter((request) => (request.body as any).kind === 'block.upsert' && (request.body as any).payload.id === 'first-id').length, { timeout: 4000 }).toBe(1)
  await editor(page).locator('p').first().click()
  await editor(page).press('End')
  await editor(page).pressSequentially(' B')
  await expect.poll(() => (api.blocks.find((item) => item.id === 'first-id')?.props.node as any)?.content?.[0]?.text, { timeout: 5000 }).toBe('First A B')
  expect(api.controls.maxConcurrentMutations).toBe(1)
  expect(blockRequests(api.requests).filter((request) => (request.body as any).kind === 'block.upsert' && (request.body as any).payload.id === 'second-id')).toHaveLength(0)
  expect(blockRequests(api.requests).filter((request) => (request.body as any).kind === 'block.upsert').every((request) => 'props' in (request.body as any).payload)).toBe(true)
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
  expect((blockRequests(api.requests).find((request) => (request.body as any).kind === 'block.upsert')?.body as any).payload.orderKey).toBe('old-key')
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
  expect(blockRequests(api.requests)).toHaveLength(0)
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

test('keeps a locally committed block after failed sync and retries the same operation', async ({ page }) => {
  const api = await installApi(page, { pages: [pageRecord('page-a', 'Alpha', 1)] })
  api.controls.mutationFailures = 1000000
  await page.goto('/#/app/ws-a/page/page-a')
  await editor(page).click()
  await editor(page).pressSequentially('Kept content')
  await expect(page.getByRole('button', { name: /离线 · 本地已保存/ })).toBeVisible()
  await expect(editor(page)).toContainText('Kept content')
  const failedOperation = blockRequests(api.requests).find((request) => (request.body as any).kind === 'block.upsert')!
  expect(api.blocks).toHaveLength(0)
  await page.reload()
  await expect(editor(page)).toContainText('Kept content')
  await expect(page.getByRole('button', { name: /离线 · 本地已保存/ })).toBeVisible()
  api.controls.mutationFailures = 0
  await page.getByRole('button', { name: /离线 · 本地已保存/ }).click()
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  await expect.poll(() => api.blocks.length).toBe(1)
  const retriedOperation = blockRequests(api.requests).filter((request) => (request.body as any).kind === 'block.upsert').at(-1)!
  expect((retriedOperation.body as any).id).toBe((failedOperation.body as any).id)
  expect(api.blocks[0]?.props.node).toMatchObject({ content: [{ text: 'Kept content' }] })
})

test('keeps a local block deletion after failed sync and restores shared state after retry', async ({ page }) => {
  const api = await installApi(page, {
    pages: [pageRecord('page-a', 'Alpha', 1)],
    blocks: [
      block('page-a', 'first-id', 1, { type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] }),
      block('page-a', 'second-id', 2, { type: 'paragraph', content: [{ type: 'text', text: 'Bravo' }] }),
    ],
  })
  await page.goto('/#/app/ws-a/page/page-a')
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  api.controls.mutationFailures = 50
  await editor(page).click()
  await editor(page).locator('p').last().click()
  await editor(page).press('Control+A')
  await editor(page).press('Backspace')
  await expect(page.getByRole('button', { name: /离线 · 本地已保存/ })).toBeVisible()
  await expect(editor(page)).toHaveText('')
  expect(api.blocks).toHaveLength(2)
  await page.reload()
  await expect(editor(page)).toHaveText('')
  await expect(page.getByRole('button', { name: /离线 · 本地已保存/ })).toBeVisible()
  api.controls.mutationFailures = 0
  await page.getByRole('button', { name: /离线 · 本地已保存/ }).click()
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  await expect.poll(() => api.blocks.length).toBe(1)
  expect(api.blocks[0]).toMatchObject({ type: 'paragraph', props: { node: { type: 'paragraph' } } })
  const operations = blockRequests(api.requests)
  const deletes = operations.filter((request) => (request.body as any).kind === 'block.delete')
  expect(deletes.map((request) => (request.body as any).payload.id).sort()).toEqual(['first-id', 'second-id'])
  const emptyParagraphUpsert = operations.find((request) => (request.body as any).kind === 'block.upsert')
  expect((emptyParagraphUpsert?.body as any).payload.props.node).toEqual({ type: 'paragraph' })
  expect(operations.findIndex((request) => (request.body as any).kind === 'block.upsert')).toBeLessThan(operations.findIndex((request) => (request.body as any).kind === 'block.delete'))
})

test('flushes the newest local edit before leaving during an in-flight create', async ({ page }) => {
  const api = await installApi(page)
  api.controls.mutationDelayMs = 350
  await page.goto('/#/app/ws-a/page/page-a')
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  await editor(page).click()
  await page.locator('.eotion-editor').evaluate((node) => {
    node.setAttribute('data-root-marker', 'mounted')
    node.querySelector('.eotion-editor-content')?.setAttribute('data-content-marker', 'mounted')
  })
  const editorLifecycle = async () => page.evaluate(() => ({
    root: document.querySelector('.eotion-editor')?.getAttribute('data-root-marker'),
    content: document.querySelector('.eotion-editor-content')?.getAttribute('data-content-marker'),
    blockLoading: Array.from(document.querySelectorAll('.product-loading')).some((node) => node.textContent?.includes('正文')),
    editor: document.querySelector('.tiptap')?.textContent,
  }))
  await page.keyboard.type('A')
  await expect.poll(() => blockRequests(api.requests).filter((request) => (request.body as any).kind === 'block.upsert').length, { timeout: 4000 }).toBe(1)
  const afterFirstUpsert = await editorLifecycle()
  expect(afterFirstUpsert.root).toBe('mounted')
  expect(afterFirstUpsert.content).toBe('mounted')
  expect(afterFirstUpsert.blockLoading).toBe(false)
  await editor(page).click()
  await editor(page).press('End')
  await editor(page).pressSequentially('B')
  await expect(editor(page)).toHaveText('AB')
  await page.waitForTimeout(650)
  const local = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const req = indexedDB.open('eotion-local-p3'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
    const tx = db.transaction(['blocks', 'operations'], 'readonly')
    const read = (name: string) => new Promise<unknown[]>((resolve, reject) => { const req = tx.objectStore(name).getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
    const [blocks, operations] = await Promise.all([read('blocks'), read('operations')])
    return { blocks, operations }
  })
  expect((local.blocks as any[]).find((item) => item.pageId === 'page-a')?.props.node).toMatchObject({ content: [{ text: 'AB' }] })
  expect((local.operations as any[]).some((operation) => operation.status === 'pending' && (operation.payload as any).props?.node?.content?.[0]?.text === 'AB')).toBe(true)
  const lifecycle = await editorLifecycle()
  expect(lifecycle.root).toBe('mounted')
  expect(lifecycle.content).toBe('mounted')
  await page.getByRole('button', { name: 'Bravo', exact: true }).click()
  await expect(page).toHaveURL(/page\/page-b$/)
  await expect.poll(() => (api.blocks.find((item) => item.pageId === 'page-a')?.props.node as any)?.content?.[0]?.text, { timeout: 5000 }).toBe('AB')
  expect(api.blocks.find((item) => item.pageId === 'page-a')?.props.node).toMatchObject({ content: [{ text: 'AB' }] })
  expect(api.controls.maxConcurrentMutations).toBe(1)
})

test('keeps a dirty draft across session expiry and saves it after the same user logs in', async ({ page }) => {
  const api = await installApi(page, { pages: [pageRecord('page-a', 'Alpha', 1)] })
  await page.goto('/#/app/ws-a/page/page-a')
  await expect(editor(page)).toBeVisible()
  api.controls.unauthorized = true
  await editor(page).click()
  await editor(page).pressSequentially('Unsaved after expiry')
  await expect(page).toHaveURL(/#\/login(?:\?redirect=.*)?$/)
  await page.getByLabel('邮箱').fill('ava@example.com')
  await page.getByLabel('密码', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/#\/app(?:\/ws-a)?$/)
  await page.getByRole('button', { name: 'Alpha', exact: true }).click()
  await expect(page).toHaveURL(/#\/app\/ws-a\/page\/page-a$/)
  await expect(editor(page)).toContainText('Unsaved after expiry')
  await expect.poll(() => (api.blocks[0]?.props.node as any)?.content?.[0]?.text, { timeout: 5000 }).toBe('Unsaved after expiry')
})

test('preserves a locally saved IME draft when page metadata sync expires the session', async ({ page }) => {
  const api = await installApi(page, { pages: [pageRecord('page-a', 'Alpha', 1)] })
  await page.goto('/#/app/ws-a/page/page-a')
  await expect(editor(page)).toBeVisible()
  await editor(page).dispatchEvent('compositionstart', { data: '' })
  await editor(page).pressSequentially('Draft from another API')
  api.controls.unauthorized = true
  await editor(page).dispatchEvent('compositionend', { data: 'Draft from another API' })
  await expect.poll(() => page.evaluate(async () => {
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    const local = await useProductSyncStore().store()
    return JSON.stringify(await local.listBlocksByPage('page-a'))
  })).toContain('Draft from another API')
  await page.getByRole('button', { name: '页面操作：Alpha' }).click()
  await page.locator('.product-page-menu').getByRole('menuitem', { name: '重命名' }).click()
  await page.getByLabel('页面标题').fill('Changed title')
  await page.getByRole('button', { name: '保存标题' }).click()
  await expect(page).toHaveURL(/#\/login(?:\?redirect=.*)?$/)
  expect(api.blocks).toHaveLength(0)
  await page.getByLabel('邮箱').fill('ava@example.com')
  await page.getByLabel('密码', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/#\/app(?:\/ws-a)?$/)
  await page.getByRole('button', { name: 'Changed title', exact: true }).click()
  await expect(page).toHaveURL(/#\/app\/ws-a\/page\/page-a$/)
  await expect(editor(page)).toContainText('Draft from another API')
  await expect.poll(() => (api.blocks[0]?.props.node as any)?.content?.[0]?.text, { timeout: 5000 }).toBe('Draft from another API')
})
