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

test('universal block chrome reveals on hover and focus and inserts editable root siblings with undo', async ({ page }) => {
  test.setTimeout(90_000)
  const text = (value: string) => [{ type: 'text', text: value }]
  const ordinary = (id: string, type: string, node: unknown, order: number): BlockResponse => ({
    ...paragraph(id, id, order), type, props: { node },
  })
  const blocks = [
    paragraph('plus-paragraph', 'Paragraph', 100),
    ordinary('plus-heading', 'heading', { type: 'heading', attrs: { level: 2 }, content: text('Heading') }, 200),
    ordinary('plus-callout', 'callout', { type: 'eotionCallout', attrs: { icon: '💡', tone: 'neutral' }, content: text('Callout') }, 300),
    ordinary('plus-bullet', 'bulleted-list', { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: text('Bullet') }] }] }, 400),
    ordinary('plus-ordered', 'numbered-list', { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: text('Ordered') }] }] }, 500),
    ordinary('plus-todo', 'todo', { type: 'eotionTodo', attrs: { checked: false }, content: text('Todo') }, 600),
    ordinary('plus-quote', 'quote', { type: 'blockquote', content: [{ type: 'paragraph', content: text('Quote') }] }, 700),
    ordinary('plus-code', 'code', { type: 'codeBlock', content: text('Code') }, 800),
    ordinary('plus-divider', 'divider', { type: 'horizontalRule' }, 900),
    ordinary('plus-table', 'table', { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: text('Cell') }] }] }] }, 1000),
  ]
  const server = { blocks, offline: false, requests: [] as { path: string; kind?: string }[] }
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await installApi(page, server)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(pageUrl())
  const body = editor(page)
  await expect(body).toBeVisible()
  for (const block of blocks) {
    const insert = body.locator(`[data-eotion-block-insert="${block.id}"]`)
    const anchor = body.locator('.eotion-block-drag-anchor').filter({ has: page.locator(`[data-eotion-block-insert="${block.id}"]`) })
    const handle = anchor.locator('[data-eotion-drag-handle]')
    const content = anchor.locator('xpath=following-sibling::*[1]')
    await content.scrollIntoViewIfNeeded()
    await page.mouse.click(1, 1)
    await expect.poll(() => insert.evaluate(element => getComputedStyle(element).opacity)).toBe('0')
    await expect.poll(() => handle.evaluate(element => getComputedStyle(element).opacity)).toBe('0')
    const before = await content.boundingBox()
    await content.hover()
    await expect.poll(() => insert.evaluate(element => getComputedStyle(element).opacity)).toBe('1')
    await expect.poll(() => handle.evaluate(element => getComputedStyle(element).opacity)).toBe('1')
    expect(await content.boundingBox()).toEqual(before)
    const [plusBox, dragBox] = await Promise.all([insert.boundingBox(), handle.boundingBox()])
    expect(plusBox!.x + plusBox!.width).toBeLessThanOrEqual(dragBox!.x)
    expect(dragBox!.x + dragBox!.width).toBeLessThanOrEqual(before!.x)
    const travelY = before!.y + Math.min(before!.height / 2, 12)
    await page.mouse.move(before!.x - 2, travelY)
    await page.mouse.move(dragBox!.x + 12, travelY)
    await page.mouse.move(dragBox!.x - 2, travelY)
    await page.mouse.move(plusBox!.x + 12, plusBox!.y + 12)
    expect(await insert.evaluate(element => element.contains(document.elementFromPoint(element.getBoundingClientRect().x + 12, element.getBoundingClientRect().y + 12)))).toBe(true)
    await expect.poll(() => handle.evaluate(element => getComputedStyle(element).opacity)).toBe('1')
    const screenshotDirectory = process.env.EOTION_VISUAL_QA_DIR
    if (screenshotDirectory && block.id === 'plus-paragraph') {
      await mkdir(screenshotDirectory, { recursive: true })
      await page.screenshot({ path: path.join(screenshotDirectory, 'universal-plus-desktop.png') })
    }
    await insert.focus()
    await page.mouse.move(1, 1)
    await expect(insert).toBeFocused()
    await expect.poll(() => handle.evaluate(element => getComputedStyle(element).opacity)).toBe('1')
    expect(await insert.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none')
    await insert.click()
    const sibling = content.locator('xpath=following-sibling::*[not(contains(@class,"eotion-block-drag-anchor"))][1]')
    await expect(sibling).toHaveJSProperty('tagName', 'P')
    expect(await sibling.evaluate(element => element.contains(window.getSelection()?.anchorNode ?? null))).toBe(true)
    const insertedId = await sibling.evaluate(element => element.previousElementSibling?.querySelector<HTMLElement>('[data-eotion-block-insert]')?.dataset.eotionBlockInsert)
    expect(insertedId).toBeTruthy()
    await expect.poll(() => server.blocks.find(item => item.id === insertedId)?.parentBlockId).toBeNull()
    await page.keyboard.press('Control+Z')
    await expect.poll(() => server.blocks.some(item => item.id === insertedId)).toBe(false)
    await page.keyboard.press('Control+Y')
    await expect(sibling).toHaveJSProperty('tagName', 'P')
    expect(await sibling.evaluate(element => element.contains(window.getSelection()?.anchorNode ?? null))).toBe(true)
    await page.keyboard.type(`After ${block.id}`)
    await expect(sibling).toHaveText(`After ${block.id}`)
    await expect.poll(() => server.blocks.find(item => JSON.stringify(item.props).includes(`After ${block.id}`))?.parentBlockId).toBeNull()
    expect(server.blocks.find(item => item.id === block.id)?.type).toBe(block.type)
  }
  expect(errors).toEqual([])
})

test('universal chrome follows the caret block while the editor is focused', async ({ page }) => {
  const server = { blocks: [paragraph('focus-root', 'Root', 50), toggle('focus-parent', 'Parent', 100), paragraph('focus-child', 'Child', 100, 'focus-parent')], offline: false, requests: [] as { path: string; kind?: string }[] }
  await installApi(page, server)
  await page.goto(pageUrl())
  const body = editor(page)
  for (const [id, text] of [['focus-root', 'Root'], ['focus-child', 'Child']]) {
    await putCaretAtStart(body.getByText(text!, { exact: true }))
    await page.mouse.move(1, 1)
    await expect.poll(() => body.locator(`[data-eotion-block-insert="${id}"]`).evaluate(element => getComputedStyle(element).opacity)).toBe('1')
    await expect.poll(() => body.locator(`[data-eotion-drag-handle="${id}"]`).evaluate(element => getComputedStyle(element).opacity)).toBe('1')
  }
  await page.mouse.click(1, 1)
  await expect.poll(() => body.locator('[data-eotion-block-insert="focus-child"]').evaluate(element => getComputedStyle(element).opacity)).toBe('0')
})

test('universal plus keeps nested siblings and inserts after the whole toggle with stable IDs', async ({ page }) => {
  const server = { blocks: [paragraph('plus-before', 'Before parent', 50), toggle('plus-parent', 'Parent', 100), paragraph('plus-child', 'Child', 100, 'plus-parent'), paragraph('plus-next', 'Next', 200, 'plus-parent'), paragraph('plus-tail', 'Tail', 200)], offline: false, requests: [] as { path: string; kind?: string }[] }
  await installApi(page, server)
  await page.goto(pageUrl())
  const body = editor(page)
  await body.getByText('Child', { exact: true }).hover()
  await expect.poll(async () => {
    const [control, child] = await Promise.all([body.locator('[data-eotion-block-insert="plus-child"]').boundingBox(), body.getByText('Child', { exact: true }).boundingBox()])
    return Math.abs(control!.y - child!.y)
  }).toBeLessThanOrEqual(1)
  await body.locator('[data-eotion-block-insert="plus-child"]').click()
  await page.keyboard.type('New nested sibling')
  await expect(body.locator('.eotion-toggle p')).toHaveText(['Parent', 'Child', 'New nested sibling', 'Next'])
  await expect.poll(() => server.blocks.find(item => JSON.stringify(item.props).includes('New nested sibling'))?.parentBlockId).toBe('plus-parent')
  const nestedId = server.blocks.find(item => JSON.stringify(item.props).includes('New nested sibling'))!.id
  expect(nestedId).toBeTruthy()
  await body.getByText('Parent', { exact: true }).hover()
  await body.locator('[data-eotion-block-insert="plus-parent"]').click()
  await expect(body.locator(':scope > p')).toHaveText(['Before parent', '', 'Tail'])
  await page.keyboard.press('Control+Z')
  await expect(body.locator(':scope > p')).toHaveText(['Before parent', 'Tail'])
  await page.keyboard.press('Control+Y')
  await expect(body.locator(':scope > p')).toHaveText(['Before parent', '', 'Tail'])
  await page.keyboard.type('After whole toggle')
  await expect(body.locator(':scope > p')).toHaveText(['Before parent', 'After whole toggle', 'Tail'])
  await expect.poll(() => server.blocks.find(item => JSON.stringify(item.props).includes('After whole toggle'))?.parentBlockId).toBeNull()
  expect(server.blocks.find(item => item.id === 'plus-child')?.parentBlockId).toBe('plus-parent')
  await page.reload()
  await expect(editor(page).locator('.eotion-toggle p')).toHaveText(['Parent', 'Child', 'New nested sibling', 'Next'])
  expect(server.blocks.find(item => item.id === nestedId)?.parentBlockId).toBe('plus-parent')
})

test('universal block chrome stays hidden without layout space at phone width', async ({ page }) => {
  const server = { blocks: [toggle('phone-parent', 'Parent', 100), paragraph('phone-child', 'Child', 100, 'phone-parent'), paragraph('phone-root', 'Root', 200)], offline: false, requests: [] as { path: string; kind?: string }[] }
  await installApi(page, server)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(pageUrl())
  const body = editor(page)
  await expect(body).toBeVisible()
  for (const id of ['phone-parent', 'phone-child', 'phone-root']) {
    await expect(body.locator(`[data-eotion-block-insert="${id}"]`)).toBeHidden()
    await expect(body.locator(`[data-eotion-drag-handle="${id}"]`)).toBeHidden()
  }
  expect(await body.evaluate(element => Array.from(element.querySelectorAll('.eotion-block-drag-anchor')).every(anchor => getComputedStyle(anchor).position === 'absolute' && anchor.getBoundingClientRect().width === 0))).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  const screenshotDirectory = process.env.EOTION_VISUAL_QA_DIR
  if (screenshotDirectory) {
    await mkdir(screenshotDirectory, { recursive: true })
    await page.screenshot({ path: path.join(screenshotDirectory, 'universal-plus-phone.png') })
  }
  const root = body.getByText('Root', { exact: true })
  const before = await root.boundingBox()
  await body.locator('.eotion-block-drag-anchor').evaluateAll(anchors => anchors.forEach(anchor => anchor.remove()))
  expect(await root.boundingBox()).toEqual(before)
})

test.describe('universal coarse tablet chrome boundary', () => {
  test.use({ viewport: { width: 820, height: 844 }, hasTouch: true })
  test('ordinary controls remain hidden and do not squeeze or cover content', async ({ page }) => {
    const server = { blocks: [toggle('tablet-parent', 'Parent', 100), paragraph('tablet-child', 'Child', 100, 'tablet-parent'), paragraph('tablet-root', 'Root', 200)], offline: false, requests: [] as { path: string; kind?: string }[] }
    await installApi(page, server)
    await page.goto(pageUrl())
    const body = editor(page)
    await expect(body).toBeVisible()
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
    await expect(body.locator('[data-eotion-block-insert]')).toHaveCount(3)
    for (const id of ['tablet-parent', 'tablet-child', 'tablet-root']) {
      await expect(body.locator(`[data-eotion-block-insert="${id}"]`)).toBeHidden()
      await expect(body.locator(`[data-eotion-drag-handle="${id}"]`)).toBeHidden()
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(820)
  })
})
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
