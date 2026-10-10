import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium, expect, test, type Locator, type Page, type Route } from '@playwright/test'
import type { BlockResponse, PageResponse } from '@eotion/contracts'

const stamp = '2026-10-07T00:00:00.000Z'
const user = { id: 'nested-user', email: 'nested@example.com', createdAt: stamp, updatedAt: stamp }
const workspace = { id: 'nested-workspace', name: 'Nested space', ownerId: user.id, createdAt: stamp, updatedAt: stamp }
const pageRecord: PageResponse = { id: 'nested-page', workspaceId: workspace.id, parentPageId: null, title: 'Nested', orderKey: '0001', createdAt: stamp, updatedAt: stamp }
// Match the domain's canonical 30-digit block key so browser flows exercise
// the real gap-allocation path instead of the legacy full-rebalance fallback.
const key = (n: number) => String(n).padStart(30, '0')
const paragraph = (id: string, text: string, order: number, parentBlockId: string | null = null): BlockResponse => ({
  id, workspaceId: workspace.id, pageId: pageRecord.id, parentBlockId, type: 'paragraph', orderKey: key(order),
  props: { node: { type: 'paragraph', content: [{ type: 'text', text }] } }, createdAt: stamp, updatedAt: stamp,
})
const toggle = (id: string, text: string, order: number, parentBlockId: string | null = null): BlockResponse => ({
  id, workspaceId: workspace.id, pageId: pageRecord.id, parentBlockId, type: 'toggle', orderKey: key(order),
  props: { node: { type: 'eotionToggle', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } }, createdAt: stamp, updatedAt: stamp,
})

function editor(page: Page) { return page.locator('.eotion-editor-content .tiptap') }
function pageUrl() { return `/#/app/${workspace.id}/page/${pageRecord.id}` }
async function putCaretAtStart(locator: Locator) {
  await locator.evaluate((node) => {
    const text = node.firstChild
    if (!text || text.nodeType !== Node.TEXT_NODE) throw new Error('Expected a text block')
    node.closest<HTMLElement>('.tiptap')!.focus()
    const range = document.createRange()
    range.setStart(text, 0)
    range.collapse(true)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
  })
}

async function installApi(page: Page, server: { blocks: BlockResponse[]; offline: boolean; requests: { path: string; kind?: string }[] }) {
  await page.route('**/api/**', async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url()).pathname
    server.requests.push({ path: url, kind: url === '/api/sync/operations' ? request.postDataJSON()?.kind : undefined })
    if (server.offline) return route.abort('internetdisconnected')
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (url === '/api/auth/me') return json(user)
    if (url === '/api/workspaces') return json([workspace])
    if (url === `/api/sync/workspaces/${workspace.id}/snapshot`) return json({ pages: [pageRecord], blocks: server.blocks })
    if (url === '/api/sync/operations') {
      const operation = request.postDataJSON() as { id: string; kind: string; payload: any }
      const payload = operation.payload
      const existing = server.blocks.find((block) => block.id === payload.id)
      if (operation.kind === 'block.move' && existing) Object.assign(existing, { parentBlockId: payload.parentBlockId, orderKey: payload.orderKey })
      if (operation.kind === 'block.upsert') {
        const next = { ...payload, workspaceId: workspace.id, createdAt: existing?.createdAt ?? stamp, updatedAt: stamp }
        server.blocks = server.blocks.filter((block) => block.id !== payload.id).concat(next)
      }
      if (operation.kind === 'block.delete') server.blocks = server.blocks.filter((block) => block.id !== payload.id)
      return json({ id: operation.id, status: 'applied' })
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
  })
}

test('Tab and Shift+Tab move an existing block into and out of a toggle with stable identity and undo', async ({ page }) => {
  const server = { blocks: [toggle('toggle-a', 'Parent', 100), paragraph('child-a', 'Child', 200)], offline: false, requests: [] as { path: string; kind?: string }[] }
  await installApi(page, server)
  await page.goto(pageUrl())
  const child = editor(page).getByText('Child', { exact: true })
  await putCaretAtStart(child)
  await page.keyboard.press('Tab')
  await expect(editor(page).locator('.eotion-toggle').getByText('Child', { exact: true })).toBeVisible()
  await expect.poll(() => server.blocks.find((block) => block.id === 'child-a')?.parentBlockId).toBe('toggle-a')
  expect(server.blocks.find((block) => block.id === 'child-a')?.id).toBe('child-a')
  await page.keyboard.press('Control+Z')
  await expect(editor(page).locator('.eotion-toggle').getByText('Child', { exact: true })).toHaveCount(0)
  await page.keyboard.press('Control+Y')
  await expect(editor(page).locator('.eotion-toggle').getByText('Child', { exact: true })).toBeVisible()
  await page.keyboard.press('Shift+Tab')
  await expect(editor(page).locator('.eotion-toggle').getByText('Child', { exact: true })).toHaveCount(0)
  await expect.poll(() => server.blocks.find((block) => block.id === 'child-a')?.parentBlockId).toBeNull()
  expect(server.requests.some((request) => request.kind === 'block.move')).toBe(true)
  await page.reload()
  await expect(editor(page).getByText('Child', { exact: true })).toBeVisible()
  await expect(editor(page).locator('.eotion-toggle').getByText('Child', { exact: true })).toHaveCount(0)
})

test('a mid-block Tab does not change nesting', async ({ page }) => {
  const server = { blocks: [toggle('toggle-a', 'Parent', 100), paragraph('child-a', 'Child', 200)], offline: false, requests: [] as { path: string; kind?: string }[] }
  await installApi(page, server)
  await page.goto(pageUrl())
  await editor(page).getByText('Child', { exact: true }).click()
  await page.keyboard.press('End')
  await page.keyboard.press('Tab')
  expect(server.blocks.find((block) => block.id === 'child-a')?.parentBlockId).toBeNull()
  await expect(editor(page).locator('.eotion-toggle').getByText('Child', { exact: true })).toHaveCount(0)
})

test('Tab moves a toggle summary with its child subtree and stable IDs', async ({ page }) => {
  const server = { blocks: [toggle('first-toggle', 'First', 100), toggle('second-toggle', 'Second', 200), paragraph('nested-child', 'Grandchild', 100, 'second-toggle')], offline: false, requests: [] as { path: string; kind?: string }[] }
  await installApi(page, server)
  await page.goto(pageUrl())
  const body = editor(page)
  await putCaretAtStart(body.getByText('Second', { exact: true }))
  await page.keyboard.press('Tab')
  await expect.poll(() => server.blocks.find((block) => block.id === 'second-toggle')?.parentBlockId).toBe('first-toggle')
  expect(server.blocks.find((block) => block.id === 'nested-child')?.parentBlockId).toBe('second-toggle')
  await expect(body.locator('.eotion-toggle').first().getByText('Grandchild', { exact: true })).toBeVisible()
  await page.keyboard.press('Control+Z')
  await expect(body.locator('.eotion-toggle').first().getByText('Second', { exact: true })).toHaveCount(0)
  await page.keyboard.press('Control+Y')
  await expect(body.locator('.eotion-toggle').first().getByText('Grandchild', { exact: true })).toBeVisible()
  await page.keyboard.press('Shift+Tab')
  await expect.poll(() => server.blocks.find((block) => block.id === 'second-toggle')?.parentBlockId).toBeNull()
  expect(server.blocks.find((block) => block.id === 'nested-child')?.parentBlockId).toBe('second-toggle')
})

test.describe('touch nested controls', () => {
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
test('390px touch toolbar can indent and outdent from the middle of a block', async ({ page }) => {
  const server = { blocks: [toggle('toggle-a', 'Parent', 100), paragraph('child-a', 'Child', 200)], offline: false, requests: [] as { path: string; kind?: string }[] }
  await installApi(page, server)
  await page.goto(pageUrl())
  await editor(page).getByText('Child', { exact: true }).click()
  await page.keyboard.press('End')
  const toolbar = page.getByRole('toolbar', { name: '触摸编辑工具栏' })
  await expect(toolbar).toBeVisible()
  await toolbar.getByRole('button', { name: '缩进区块', exact: true }).click()
  await expect(editor(page).locator('.eotion-toggle').getByText('Child', { exact: true })).toBeVisible()
  await toolbar.getByRole('button', { name: '取消缩进区块', exact: true }).click()
  await expect(editor(page).locator('.eotion-toggle').getByText('Child', { exact: true })).toHaveCount(0)
  await expect.poll(() => server.blocks.find((block) => block.id === 'child-a')?.parentBlockId).toBeNull()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflow).toBe(false)
})
})

test('drag handle nests a block into a toggle and keeps its identity after reload', async ({ page }) => {
  const server = { blocks: [toggle('toggle-a', 'Parent', 100), paragraph('existing-child', 'Existing child', 100, 'toggle-a'), paragraph('child-a', 'Child', 200)], offline: false, requests: [] as { path: string; kind?: string }[] }
  await installApi(page, server)
  await page.goto(pageUrl())
  const body = editor(page)
  const handle = body.locator('[data-eotion-drag-handle="child-a"]')
  const target = body.locator('.eotion-toggle')
  await expect(handle).toBeAttached()
  await handle.dragTo(target, { targetPosition: { x: 30, y: 16 } })
  await expect(target.getByText('Child', { exact: true })).toBeVisible()
  await expect(target.getByText('Existing child', { exact: true })).toBeVisible()
  await expect.poll(() => server.blocks.find((block) => block.id === 'child-a')?.parentBlockId).toBe('toggle-a')
  await page.reload()
  await expect(editor(page).locator('.eotion-toggle').getByText('Child', { exact: true })).toBeVisible()
})

test('drag handle reorders siblings and moves a child back to the root', async ({ page }) => {
  const server = { blocks: [toggle('toggle-a', 'Parent', 100), paragraph('child-a', 'Child', 100, 'toggle-a'), paragraph('root-a', 'First root', 200), paragraph('root-b', 'Second root', 300)], offline: false, requests: [] as { path: string; kind?: string }[] }
  await installApi(page, server)
  await page.goto(pageUrl())
  const body = editor(page)
  const handle = body.locator('[data-eotion-drag-handle="root-b"]')
  await expect(handle).toBeAttached()
  await handle.evaluate((source) => {
    document.addEventListener('drop', () => { (window as any).__nestedSourceConnectedAtDrop = source.isConnected }, { capture: true, once: true })
  })
  await handle.dragTo(body.getByText('First root', { exact: true }), { targetPosition: { x: 10, y: 6 } })
  expect(await page.evaluate(() => (window as any).__nestedSourceConnectedAtDrop)).toBe(true)
  await expect.poll(() => {
    const roots = server.blocks.filter((block) => !block.parentBlockId).sort((a, b) => a.orderKey.localeCompare(b.orderKey))
    return roots.map((block) => block.id)
  }).toEqual(['toggle-a', 'root-b', 'root-a'])
  await body.locator('[data-eotion-drag-handle="child-a"]').dragTo(body.getByText('Second root', { exact: true }), { targetPosition: { x: 10, y: 6 } })
  await expect.poll(() => server.blocks.find((block) => block.id === 'child-a')?.parentBlockId).toBeNull()
  await expect(body.locator('.eotion-toggle').getByText('Child', { exact: true })).toHaveCount(0)
  await page.reload()
  await expect(editor(page).locator('.eotion-toggle').getByText('Child', { exact: true })).toHaveCount(0)
})

test('drag rejects self, descendant, and excessive nesting depth', async ({ page }) => {
  const chain = Array.from({ length: 9 }, (_, index) => toggle(`deep-${index}`, `Depth ${index}`, 100, index ? `deep-${index - 1}` : null))
  const server = { blocks: [toggle('outer', 'Outer', 100), toggle('inner', 'Inner', 100, 'outer'), ...chain.map((block, index) => ({ ...block, orderKey: key(index ? 100 : 200) })), paragraph('candidate', 'Candidate', 300)], offline: false, requests: [] as { path: string; kind?: string }[] }
  await installApi(page, server)
  await page.goto(pageUrl())
  const body = editor(page)
  const outer = body.locator('.eotion-toggle').filter({ hasText: 'Outer' }).first()
  const inner = body.locator('.eotion-toggle').filter({ hasText: 'Inner' }).last()
  await body.locator('[data-eotion-drag-handle="outer"]').dragTo(outer, { targetPosition: { x: 30, y: 16 } })
  await body.locator('[data-eotion-drag-handle="outer"]').dragTo(inner, { targetPosition: { x: 30, y: 16 } })
  const deepest = body.locator('.eotion-toggle').filter({ hasText: 'Depth 8' }).last()
  await body.locator('[data-eotion-drag-handle="candidate"]').dragTo(deepest, { targetPosition: { x: 30, y: 16 } })
  expect(server.blocks.find((block) => block.id === 'outer')?.parentBlockId).toBeNull()
  expect(server.blocks.find((block) => block.id === 'candidate')?.parentBlockId).toBeNull()
  await expect(body.getByText('Candidate', { exact: true })).toBeVisible()
})

test('dragging outside the editor clears its target marker without moving a block', async ({ page }) => {
  const server = { blocks: [toggle('toggle-a', 'Parent', 100), paragraph('root-a', 'Root', 200)], offline: false, requests: [] as { path: string; kind?: string }[] }
  await installApi(page, server)
  await page.goto(pageUrl())
  const body = editor(page)
  await body.locator('[data-eotion-drag-handle="root-a"]').dragTo(page.getByRole('heading', { name: 'Nested' }))
  await expect(body.locator('[data-eotion-drop-zone]')).toHaveCount(0)
  expect(server.blocks.find((block) => block.id === 'root-a')?.parentBlockId).toBeNull()
})

test('block drop indicators use the semantic accent color in light and dark themes', async ({ page }) => {
  const server = { blocks: [paragraph('indicator-source', 'Source', 100), paragraph('indicator-target', 'Target', 200)], offline: false, requests: [] as { path: string; kind?: string }[] }
  await installApi(page, server)
  await page.goto(pageUrl())
  const body = editor(page)
  const source = body.locator('[data-eotion-drag-handle="indicator-source"]')
  const target = body.getByText('Target', { exact: true })

  const assertAccentIndicator = async (theme: 'light' | 'dark') => {
    const indicator = await source.evaluate((element, value) => {
      document.documentElement.setAttribute('data-theme', value)
      const data = new DataTransfer()
      element.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: data }))
      const target = document.querySelector('.eotion-editor-content .tiptap p:last-of-type')!
      const rect = target.getBoundingClientRect()
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data, clientX: rect.left + 4, clientY: rect.top + 2 }))
      const colors = {
        zone: target.getAttribute('data-eotion-drop-zone'),
        accent: getComputedStyle(document.documentElement).getPropertyValue('--e-color-accent').trim(),
        shadow: getComputedStyle(target).boxShadow,
        accentRgb: (() => { const probe = document.createElement('span'); probe.style.color = 'var(--e-color-accent)'; document.body.append(probe); const value = getComputedStyle(probe).color; probe.remove(); return value })(),
      }
      element.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: data }))
      return colors
    }, theme)
    expect(indicator.zone).toBe('before')
    expect(indicator.shadow).toContain(indicator.accentRgb)
    await expect(target).not.toHaveAttribute('data-eotion-drop-zone')
  }

  await assertAccentIndicator('light')
  await assertAccentIndicator('dark')
})

test('Tab after a leaf block and native attachment drag do not create children', async ({ page }) => {
  const image: BlockResponse = { id: 'image-a', workspaceId: workspace.id, pageId: pageRecord.id, parentBlockId: null, type: 'image', orderKey: key(300),
    props: { node: { type: 'eotionImage', attrs: { fileId: 'image-file', name: 'photo.png', mimeType: 'image/png', size: 12, url: 'https://objects.example.test/photo.png' } } }, createdAt: stamp, updatedAt: stamp }
  const server = { blocks: [toggle('toggle-a', 'Parent', 100), paragraph('leaf-a', 'Leaf', 200), paragraph('candidate', 'Candidate', 250), image], offline: false, requests: [] as { path: string; kind?: string }[] }
  await installApi(page, server)
  await page.goto(pageUrl())
  const body = editor(page)
  await putCaretAtStart(body.getByText('Candidate', { exact: true }))
  await page.keyboard.press('Tab')
  expect(server.blocks.find((block) => block.id === 'candidate')?.parentBlockId).toBeNull()
  const attachment = body.locator('figure.attachment-image')
  await attachment.dragTo(body.locator('.eotion-toggle'), { targetPosition: { x: 30, y: 16 } })
  expect(server.blocks.find((block) => block.id === 'image-a')?.parentBlockId).toBeNull()
  await expect(body.locator('.eotion-toggle figure.attachment-image')).toHaveCount(0)
  const nestedFileDropPrevented = await body.locator('.eotion-toggle p').evaluate((target) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['image'], 'nested.png', { type: 'image/png' }))
    const rect = target.getBoundingClientRect()
    const event = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: rect.x + 4, clientY: rect.y + 4 })
    target.dispatchEvent(event)
    return event.defaultPrevented
  })
  expect(nestedFileDropPrevented).toBe(true)
  await expect(body.locator('.eotion-toggle figure.attachment-image')).toHaveCount(0)
  await attachment.click({ position: { x: 2, y: 2 } })
  await body.locator('[data-eotion-drag-handle="candidate"]').dragTo(body.locator('.eotion-toggle'), { targetPosition: { x: 30, y: 16 } })
  await expect.poll(() => server.blocks.find((block) => block.id === 'candidate')?.parentBlockId).toBe('toggle-a')
})

test('nested blocks render at desktop and phone widths in both themes', async ({ page }) => {
  const directory = process.env.EOTION_VISUAL_QA_DIR
  if (directory) await mkdir(directory, { recursive: true })
  const server = { blocks: [toggle('toggle-a', 'Project plan', 100), paragraph('child-a', 'Nested task', 100, 'toggle-a'), paragraph('root-a', 'Next section', 200)], offline: false, requests: [] as { path: string; kind?: string }[] }
  await installApi(page, server)
  for (const [width, height, mode] of [[1440, 900, 'desktop'], [390, 844, 'phone']] as const) {
    await page.setViewportSize({ width, height })
    for (const theme of ['light', 'dark'] as const) {
      await page.goto(pageUrl())
      await page.evaluate(async (choice) => {
        const { setThemePreference } = await import('/src/theme.ts')
        setThemePreference(choice)
      }, theme)
      await expect(editor(page).getByText('Nested task', { exact: true })).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await editor(page).getByText('Nested task', { exact: true }).hover()
      if (directory) await page.screenshot({ path: path.join(directory, `nested-${mode}-${theme}.png`), animations: 'disabled' })
    }
  }
})

test('offline nested move survives reload and browser restart, then pushes before snapshot pull', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'eotion-nested-'))
  const server = { blocks: [toggle('toggle-a', 'Parent', 100), paragraph('child-a', 'Child', 200)], offline: false, requests: [] as { path: string; kind?: string }[] }
  let context = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, baseURL: 'http://127.0.0.1:7173' })
  try {
    let page = context.pages()[0] ?? await context.newPage()
    await installApi(page, server)
    await page.goto(pageUrl())
    await expect(editor(page).getByText('Child', { exact: true })).toBeVisible()
    server.offline = true
    await putCaretAtStart(editor(page).getByText('Child', { exact: true }))
    await page.keyboard.press('Tab')
    await expect(editor(page).locator('.eotion-toggle').getByText('Child', { exact: true })).toBeVisible()
    const pendingMoves = () => page.evaluate(async () => {
      const { useProductSyncStore } = await import('/src/stores/productSync.ts')
      return (await (await useProductSyncStore().store()).getPendingOperations()).filter((operation) => operation.kind === 'block.move').length
    })
    await expect.poll(pendingMoves).toBeGreaterThan(0)
    await page.reload()
    await expect(editor(page).locator('.eotion-toggle').getByText('Child', { exact: true })).toBeVisible()
    await context.close()
    context = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, baseURL: 'http://127.0.0.1:7173' })
    page = context.pages()[0] ?? await context.newPage()
    await installApi(page, server)
    await page.goto(pageUrl())
    await expect(editor(page).locator('.eotion-toggle').getByText('Child', { exact: true })).toBeVisible()
    const reconnectAt = server.requests.length
    server.offline = false
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect.poll(() => server.blocks.find((block) => block.id === 'child-a')?.parentBlockId).toBe('toggle-a')
    await expect.poll(async () => (await pendingMoves())).toBe(0)
    const after = server.requests.slice(reconnectAt)
    expect(after.findIndex((request) => request.kind === 'block.move')).toBeGreaterThanOrEqual(0)
    expect(after.findIndex((request) => request.path.endsWith('/snapshot'))).toBeGreaterThan(after.findIndex((request) => request.kind === 'block.move'))
  } finally {
    await context.close()
    await rm(profile, { recursive: true, force: true })
  }
})
