import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Page, type Route } from '@playwright/test'
import type { AuthUserDto, BlockResponse, PageResponse, WorkspaceResponse } from '@eotion/contracts'

const now = '2026-09-30T00:00:00.000Z'
const later = '2027-09-30T00:00:00.000Z'
const user: AuthUserDto = { id: 'database-user', email: 'database@example.com', displayName: 'Database user', createdAt: now, updatedAt: now }
const workspace: WorkspaceResponse = { id: 'database-workspace', name: 'Database workspace', ownerId: user.id, createdAt: now, updatedAt: now }
const pageRecord: PageResponse = { id: 'database-page', workspaceId: workspace.id, parentPageId: null, title: 'Database references', orderKey: '0000000000000001', createdAt: now, updatedAt: now }

function block(id: string, type: BlockResponse['type'], node: Record<string, unknown>, order: number, parentBlockId: string | null = null): BlockResponse {
  return {
    id, type, pageId: pageRecord.id, workspaceId: workspace.id, parentBlockId,
    orderKey: String(order).padStart(16, '0'), props: { node }, createdAt: now, updatedAt: now,
  }
}

async function installApi(page: Page, seed: BlockResponse[]) {
  const pages = [pageRecord]
  const blocks = [...seed]
  const requests: Array<{ kind: string; payload: any }> = []
  const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === '/api/auth/me' && request.method() === 'GET') return json(route, 200, user)
    if (url.pathname === '/api/workspaces' && request.method() === 'GET') return json(route, 200, [workspace])
    if (url.pathname === `/api/sync/workspaces/${workspace.id}/snapshot` && request.method() === 'GET') return json(route, 200, { pages, blocks })
    if (url.pathname === '/api/sync/operations' && request.method() === 'POST') {
      const operation = request.postDataJSON() as { kind: string; workspaceId: string; payload: any }
      const payload = operation.payload
      requests.push({ kind: operation.kind, payload })
      const index = blocks.findIndex((item) => item.id === payload.id)
      if (operation.kind === 'block.upsert') {
        const existing = index >= 0 ? blocks[index] : undefined
        const value: BlockResponse = { ...payload, workspaceId: operation.workspaceId, parentBlockId: payload.parentBlockId ?? null, createdAt: existing?.createdAt ?? now, updatedAt: later }
        if (index < 0) blocks.push(value)
        else blocks[index] = value
      } else if (operation.kind === 'block.delete' && index >= 0) blocks.splice(index, 1)
      return json(route, 200, { id: 'database-operation', status: 'applied' })
    }
    return json(route, 404, { statusCode: 404, message: 'Not found' })
  })
  return { blocks, requests }
}

async function screenshot(page: Page, name: string) {
  const directory = process.env.EOTION_VISUAL_QA_DIR
  if (!directory) return
  await mkdir(directory, { recursive: true })
  await page.screenshot({ path: path.join(directory, `${name}.png`), animations: 'disabled', fullPage: true })
}

test('database references render and round-trip at root and under a toggle', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const api = await installApi(page, [
    block('before', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] }, 100),
    block('database-root', 'database', { type: 'eotionDatabase', attrs: { databaseId: 'database-root-id', viewId: 'view-root-id' } }, 200),
    block('toggle', 'toggle', { type: 'eotionToggle', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested references' }] }] }, 300),
    block('database-nested', 'database', { type: 'eotionDatabase', attrs: { databaseId: 'database-nested-id', viewId: 'view-nested-id' } }, 100, 'toggle'),
    block('divider', 'divider', { type: 'horizontalRule' }, 500),
    block('image', 'image', { type: 'eotionImage', attrs: { fileId: 'image-file', name: 'image.png', mimeType: 'image/png', size: 12, url: 'https://objects.example.test/image.png' } }, 600),
    block('file', 'file', { type: 'eotionFile', attrs: { fileId: 'document-file', name: 'notes.pdf', mimeType: 'application/pdf', size: 34, url: 'https://objects.example.test/notes.pdf' } }, 700),
    block('after', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'After' }] }, 400),
  ])

  await page.goto('/#/app/database-workspace/page/database-page')
  const editor = page.locator('.eotion-editor-content .tiptap')
  await expect(editor).toBeVisible()
  const placeholders = editor.locator('.eotion-database')
  await expect(placeholders).toHaveCount(2)
  await expect(placeholders).toHaveText(['▦数据库视图数据库内容暂不可编辑', '▦数据库视图数据库内容暂不可编辑'])
  await expect(editor).toContainText('Before')
  await expect(editor).toContainText('After')
  await screenshot(page, 'product-database-desktop')

  await editor.click()
  await page.keyboard.press('Control+Home')
  await page.keyboard.type('Edited ')
  await expect(editor.locator('p').first()).toContainText('Edited Before')
  await expect.poll(() => api.blocks.find((item) => item.id === 'before')?.props.node).toMatchObject({
    type: 'paragraph', content: [{ type: 'text', text: 'Edited Before' }],
  })
  await expect.poll(() => api.blocks.find((item) => item.props.node.type === 'eotionDatabase' && (item.props.node.attrs as any)?.databaseId === 'database-root-id')?.id).toBe('database-root')
  await expect.poll(() => api.blocks.find((item) => item.id === 'database-root')?.props.node).toEqual({
    type: 'eotionDatabase', attrs: { databaseId: 'database-root-id', viewId: 'view-root-id' },
  })

  await page.reload()
  await expect(page.locator('.eotion-editor-content .tiptap .eotion-database')).toHaveCount(2)
  await expect(page.locator('.eotion-editor-content .tiptap')).toContainText('Edited Before')
  expect(api.blocks.find((item) => item.id === 'database-root')?.id).toBe('database-root')
  expect(api.blocks.find((item) => item.id === 'database-nested')).toMatchObject({
    id: 'database-nested', parentBlockId: 'toggle',
    props: { node: { type: 'eotionDatabase', attrs: { databaseId: 'database-nested-id', viewId: 'view-nested-id' } } },
  })

  const rootPlaceholder = page.locator('.eotion-editor-content .tiptap .eotion-database').first()
  await rootPlaceholder.click()
  await page.keyboard.press('Backspace')
  await expect(page.locator('.eotion-editor-content .tiptap .eotion-database')).toHaveCount(1)
  await expect.poll(() => api.blocks.some((item) => item.id === 'database-root')).toBe(false)
  expect(api.blocks.map((item) => item.id)).toEqual(expect.arrayContaining(['before', 'toggle', 'database-nested', 'divider', 'image', 'file', 'after']))
  expect(errors).toEqual([])

  await page.reload()
  await expect(page.locator('.eotion-editor-content .tiptap .eotion-database')).toHaveCount(1)
  await expect(page.locator('.eotion-editor-content .tiptap')).toContainText('Edited Before')
  await expect(page.locator('.eotion-editor-content .tiptap')).toContainText('After')
  expect(api.blocks.some((item) => item.id === 'database-nested')).toBe(true)
})

test('database placeholder fits the mobile editor without horizontal overflow', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  await installApi(page, [
    block('mobile-before', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'Mobile page' }] }, 100),
    block('mobile-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: 'mobile-database-id', viewId: 'mobile-view-id' } }, 200),
  ])
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/app/database-workspace/page/database-page')
  const placeholder = page.locator('.eotion-editor-content .eotion-database')
  await expect(placeholder).toBeVisible()
  await expect(placeholder).toContainText('数据库视图')
  const widths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
    editor: document.querySelector('.eotion-editor-content')?.scrollWidth ?? 0,
    editorClient: document.querySelector('.eotion-editor-content')?.clientWidth ?? 0,
  }))
  expect(widths.document).toBeLessThanOrEqual(widths.viewport)
  expect(widths.editor).toBeLessThanOrEqual(widths.editorClient)
  expect(errors).toEqual([])
  await screenshot(page, 'product-database-mobile-390x844')
})
