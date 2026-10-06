import { expect, test, type Page, type Route } from '@playwright/test'
import type { AuthUserDto, PageResponse, WorkspaceResponse } from '@eotion/contracts'

const stamp = '2026-09-30T00:00:00.000Z'
const user: AuthUserDto = { id: 'user-slash', email: 'slash@example.com', createdAt: stamp, updatedAt: stamp }
const workspace: WorkspaceResponse = { id: 'ws-slash', name: 'Slash space', ownerId: user.id, createdAt: stamp, updatedAt: stamp }
const pageRecord: PageResponse = {
  id: 'page-slash', workspaceId: workspace.id, parentPageId: null, title: 'Slash',
  orderKey: '0000000000000001', createdAt: stamp, updatedAt: stamp,
}

async function installApi(page: Page) {
  const pages: PageResponse[] = [pageRecord]
  const blocks: any[] = []
  const json = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/auth/me' && request.method() === 'GET') return json(route, user)
    if (path === '/api/workspaces' && request.method() === 'GET') return json(route, [workspace])
    if (path === `/api/sync/workspaces/${workspace.id}/snapshot` && request.method() === 'GET') return json(route, { pages, blocks })
    if (path === '/api/sync/operations' && request.method() === 'POST') {
      const operation = request.postDataJSON() as { id: string; kind: string; workspaceId: string; payload: any }
      const payload = operation.payload
      if (operation.kind === 'block.upsert') {
        const index = blocks.findIndex((item) => item.id === payload.id)
        const record = { ...payload, workspaceId: operation.workspaceId, parentBlockId: payload.parentBlockId ?? null, createdAt: stamp, updatedAt: stamp }
        if (index < 0) blocks.push(record)
        else blocks[index] = record
      } else if (operation.kind === 'block.move') {
        const block = blocks.find((item) => item.id === payload.id)
        if (block) Object.assign(block, { parentBlockId: payload.parentBlockId, orderKey: payload.orderKey })
      } else if (operation.kind === 'block.delete') {
        const index = blocks.findIndex((item) => item.id === payload.id)
        if (index >= 0) blocks.splice(index, 1)
      }
      return json(route, { id: operation.id, status: 'applied' })
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
  })
}

const body = (page: Page) => page.locator('.eotion-editor-content .tiptap')
const menu = (page: Page) => page.locator('.p2-slash-menu')
const option = (page: Page, name: string) => menu(page).getByRole('option', { name, exact: true })

async function openSlash(page: Page, target: ReturnType<Page['locator']>) {
  await target.click()
  await page.keyboard.press('/')
  await expect(menu(page)).toBeVisible()
}

test('slash commands follow root, quote, list item and toggle summary/child contexts', async ({ page }) => {
  await installApi(page)
  await page.goto('/#/app/ws-slash/page/page-slash')
  const editor = body(page)
  await expect(editor).toBeVisible()

  await openSlash(page, editor.locator(':scope > p').first())
  await expect(option(page, '提示块')).toBeVisible()
  await expect(option(page, '折叠列表')).toBeVisible()
  await expect(option(page, '图片')).toBeVisible()
  await expect(option(page, '文件')).toBeVisible()
  await option(page, '引用').click()

  await openSlash(page, editor.locator('blockquote p').first())
  await expect(option(page, '提示块')).toHaveCount(0)
  await expect(option(page, '折叠列表')).toHaveCount(0)
  await expect(option(page, '一级标题')).toBeVisible()
  await page.keyboard.press('Escape')

  // The root trailing paragraph is the next sibling after the quote.
  await openSlash(page, editor.locator(':scope > p').last())
  await option(page, '项目列表').click()
  await openSlash(page, editor.locator('ul li p').first())
  await expect(option(page, '一级标题')).toHaveCount(0)
  await expect(option(page, '引用')).toHaveCount(0)
  await expect(option(page, '提示块')).toHaveCount(0)
  await expect(option(page, '图片')).toHaveCount(0)
  await page.keyboard.press('Escape')

  // Use the root trailing paragraph to create a toggle and inspect its summary.
  await openSlash(page, editor.locator(':scope > p').last())
  await option(page, '折叠列表').click()
  const toggleParagraphs = editor.locator('.eotion-toggle p')
  await openSlash(page, toggleParagraphs.first())
  await expect(option(page, '折叠列表')).toHaveCount(0)
  await expect(option(page, '提示块')).toBeVisible()
  await expect(option(page, '图片')).toHaveCount(0)
  await page.keyboard.press('Escape')

  await toggleParagraphs.first().click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await openSlash(page, editor.locator('.eotion-toggle p').nth(1))
  await expect(option(page, '折叠列表')).toBeVisible()
  await expect(option(page, '提示块')).toBeVisible()
  await expect(option(page, '图片')).toHaveCount(0)
  await expect(option(page, '文件')).toHaveCount(0)
})

test.describe('touch block commands', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('touch toolbar cannot create a block the codec rejects inside a list item', async ({ page }) => {
    await installApi(page)
    await page.goto('/#/app/ws-slash/page/page-slash')
    const editor = body(page)
    await openSlash(page, editor.locator(':scope > p').first())
    await option(page, '项目列表').click()
    const item = editor.locator('ul li p').first()
    await expect(item).toBeVisible()
    await item.click()
    await page.keyboard.press('End')
    const toolbar = page.getByRole('toolbar', { name: '触摸编辑工具栏' })
    await expect(toolbar).toBeVisible()
    await toolbar.getByRole('button', { name: '二级标题（H2）' }).click()
    await expect(editor.locator('h2')).toHaveCount(0)
    await expect(editor.locator('ul li p')).toHaveCount(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})
