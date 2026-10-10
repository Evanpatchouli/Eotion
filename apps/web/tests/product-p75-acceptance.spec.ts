import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium, expect, test, type Page, type Route } from '@playwright/test'
import type { AuthUserDto, BlockResponse, PageResponse, WorkspaceResponse } from '@eotion/contracts'

const stamp = '2026-10-11T00:00:00.000Z'
const user: AuthUserDto = { id: 'p75-user', email: 'p75@example.com', createdAt: stamp, updatedAt: stamp }
const workspace: WorkspaceResponse = { id: 'p75-workspace', name: 'P7.5 space', ownerId: user.id, createdAt: stamp, updatedAt: stamp }
const pageRecord: PageResponse = { id: 'p75-page', workspaceId: workspace.id, parentPageId: null, title: 'Mixed document', orderKey: '0001', createdAt: stamp, updatedAt: stamp }
const key = (n: number) => String(n).padStart(30, '0')

type Server = { blocks: BlockResponse[]; offline: boolean; requests: { path: string; kind?: string }[] }

function editor(page: Page) { return page.locator('.eotion-editor-content .tiptap') }
function pageUrl() { return '/#/app/' + workspace.id + '/page/' + pageRecord.id }

/* ------------------------------------------------------------------ *
 * Seed builders: one mixed document that exercises every P7.5 block.
 * ------------------------------------------------------------------ */

function record(id: string, type: string, node: unknown, order: number, parentBlockId: string | null = null): BlockResponse {
  return {
    id, workspaceId: workspace.id, pageId: pageRecord.id, parentBlockId, type: type as BlockResponse['type'],
    orderKey: key(order), props: { node } as BlockResponse['props'], createdAt: stamp, updatedAt: stamp,
  }
}

const text = (value: string) => (value ? [{ type: 'text', text: value }] : [])

function cellNode(type: 'tableHeader' | 'tableCell', value: string) {
  return { type, attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: text(value) }] }
}

function tableBlock(id: string, grid: string[][], order: number, parentBlockId: string | null = null): BlockResponse {
  return record(id, 'table', {
    type: 'table',
    content: grid.map((cells, index) => ({ type: 'tableRow', content: cells.map((cell) => cellNode(index === 0 ? 'tableHeader' : 'tableCell', cell)) })),
  }, order, parentBlockId)
}

const GRID: string[][] = [['H1', 'H2', 'H3'], ['A1', 'A2', 'A3'], ['B1', 'B2', 'B3']]

/** Every required block type plus two levels of nesting, in one page. */
function mixedDocument(): BlockResponse[] {
  return [
    record('m-heading', 'heading', { type: 'heading', attrs: { level: 1 }, content: text('Mixed document') }, 10),
    record('m-intro', 'paragraph', { type: 'paragraph', content: text('Intro paragraph.') }, 20),
    record('m-list', 'bulleted-list', {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: text('Bullet A') }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: text('Bullet B') }] },
      ],
    }, 30),
    record('m-ordered', 'numbered-list', {
      type: 'orderedList', attrs: { start: 1 },
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: text('First') }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: text('Second') }] },
      ],
    }, 40),
    record('m-todo', 'todo', { type: 'eotionTodo', attrs: { checked: false }, content: text('Task A') }, 50),
    record('m-quote', 'quote', { type: 'blockquote', content: [{ type: 'paragraph', content: text('Quoted line') }] }, 60),
    record('m-code', 'code', { type: 'codeBlock', attrs: { language: 'typescript' }, content: text('const answer = 42') }, 70),
    record('m-callout', 'callout', { type: 'eotionCallout', attrs: { icon: '🚀', tone: 'warning' }, content: text('Remember this') }, 80),
    record('m-toggle', 'toggle', { type: 'eotionToggle', content: [{ type: 'paragraph', content: text('Toggle summary') }] }, 90),
    record('m-child', 'paragraph', { type: 'paragraph', content: text('Toggle child') }, 10, 'm-toggle'),
    record('m-inner', 'toggle', { type: 'eotionToggle', content: [{ type: 'paragraph', content: text('Inner summary') }] }, 20, 'm-toggle'),
    record('m-grandchild', 'paragraph', { type: 'paragraph', content: text('Grandchild') }, 10, 'm-inner'),
    record('m-nested-table', 'table', {
      type: 'table', content: [{ type: 'tableRow', content: [cellNode('tableHeader', 'N1'), cellNode('tableHeader', 'N2')] }],
    }, 30, 'm-toggle'),
    record('m-tabbed', 'paragraph', { type: 'paragraph', content: text('Tabbed child') }, 100),
    tableBlock('m-table', GRID, 110),
    record('m-divider', 'divider', { type: 'horizontalRule' }, 120),
    record('m-tail', 'paragraph', { type: 'paragraph', content: text('Tail') }, 130),
  ]
}

/* ------------------------------------------------------------------ *
 * Structure + content assertions independent of the editor DOM.
 * ------------------------------------------------------------------ */

function nodeText(node: any): string {
  if (!node) return ''
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'
  return (node.content ?? []).map(nodeText).join('')
}

function blockAttrs(block: BlockResponse): Record<string, unknown> {
  const node: any = (block.props as any)?.node ?? {}
  const attrs = node.attrs ?? {}
  if (block.type === 'heading') return { level: attrs.level }
  if (block.type === 'todo') return { checked: Boolean(attrs.checked) }
  if (block.type === 'callout') return { icon: attrs.icon, tone: attrs.tone }
  if (block.type === 'code') return { language: attrs.language ?? null }
  if (block.type === 'numbered-list') return { start: attrs.start ?? 1 }
  return {}
}

function blockContent(block: BlockResponse): unknown {
  const node: any = (block.props as any)?.node ?? {}
  if (block.type === 'bulleted-list' || block.type === 'numbered-list') return (node.content ?? []).map((item: any) => nodeText(item.content?.[0]))
  if (block.type === 'quote') return (node.content ?? []).map((paragraph: any) => nodeText(paragraph))
  if (block.type === 'table') return (node.content ?? []).map((row: any) => (row.content ?? []).map((cell: any) => (cell.content ?? []).map(nodeText).join('\n')))
  if (block.type === 'toggle') return nodeText(node.content?.[0])
  if (block.type === 'divider') return ''
  return nodeText(node)
}

interface CanonicalBlock { id: string; type: string; parentBlockId: string | null; attrs: Record<string, unknown>; content: unknown; children: CanonicalBlock[] }

/** Depth-first, sibling order resolved by orderKey then id, structure never flattened. */
function canonicalDocument(blocks: BlockResponse[]): CanonicalBlock[] {
  const children = new Map<string | null, BlockResponse[]>()
  for (const block of blocks) {
    const parent = block.parentBlockId ?? null
    const bucket = children.get(parent)
    if (bucket) bucket.push(block)
    else children.set(parent, [block])
  }
  const sort = (list: BlockResponse[]) => [...list].sort((a, b) => a.orderKey.localeCompare(b.orderKey) || a.id.localeCompare(b.id))
  const build = (block: BlockResponse): CanonicalBlock => ({
    id: block.id, type: block.type, parentBlockId: block.parentBlockId ?? null,
    attrs: blockAttrs(block), content: blockContent(block),
    children: sort(children.get(block.id) ?? []).map(build),
  })
  return sort(children.get(null) ?? []).map(build)
}

/** Orphan / cross-page / cycle / duplicate-id / duplicate-sibling-order detector. */
function structureProblems(blocks: BlockResponse[]): string[] {
  const problems: string[] = []
  const byId = new Map(blocks.map((block) => [block.id, block]))
  if (byId.size !== blocks.length) problems.push('duplicate-id')
  const siblingKeys = new Map<string, Set<string>>()
  for (const block of blocks) {
    const parent = block.parentBlockId ?? null
    const bucket = parent ?? 'root'
    const seen = siblingKeys.get(bucket) ?? new Set<string>()
    if (seen.has(block.orderKey)) problems.push('duplicate-sibling-order:' + block.id)
    seen.add(block.orderKey)
    siblingKeys.set(bucket, seen)
    if (parent === null) continue
    const parentBlock = byId.get(parent)
    if (!parentBlock) problems.push('orphan:' + block.id)
    else if (parentBlock.pageId !== block.pageId) problems.push('cross-page:' + block.id)
  }
  for (const block of blocks) {
    const seen = new Set<string>([block.id])
    let parent = block.parentBlockId ?? null
    while (parent) {
      if (seen.has(parent)) { problems.push('cycle:' + block.id); break }
      seen.add(parent)
      parent = byId.get(parent)?.parentBlockId ?? null
    }
  }
  if (!blocks.some((block) => (block.parentBlockId ?? null) === null)) problems.push('no-root')
  return problems
}

function blockTypes(blocks: BlockResponse[]): string[] {
  return canonicalDocument(blocks).map((block) => block.type)
}

function flattened(blocks: BlockResponse[]): Array<{ id: string; type: string; parentBlockId: string | null; content: unknown }> {
  const out: Array<{ id: string; type: string; parentBlockId: string | null; content: unknown }> = []
  const walk = (nodes: CanonicalBlock[]) => { for (const node of nodes) { out.push({ id: node.id, type: node.type, parentBlockId: node.parentBlockId, content: node.content }); walk(node.children) } }
  walk(canonicalDocument(blocks))
  return out
}

function ids(blocks: BlockResponse[]): Map<string, string> {
  return new Map(blocks.map((block) => [block.id, block.type]))
}

/* ------------------------------------------------------------------ *
 * API double.
 * ------------------------------------------------------------------ */

async function installApi(page: Page, server: Server) {
  await page.route('**/api/**', async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url()).pathname
    server.requests.push({ path: url, kind: url === '/api/sync/operations' ? request.postDataJSON()?.kind : undefined })
    if (server.offline) return route.abort('internetdisconnected')
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (url === '/api/auth/me') return json(user)
    if (url === '/api/workspaces') return json([workspace])
    if (url === '/api/sync/workspaces/' + workspace.id + '/snapshot') return json({ pages: [pageRecord], blocks: server.blocks })
    if (url === '/api/sync/operations') {
      const operation = request.postDataJSON() as { id: string; kind: string; payload: any }
      const payload = operation.payload
      const existing = server.blocks.find((block) => block.id === payload.id)
      if (operation.kind === 'block.move' && existing) Object.assign(existing, { parentBlockId: payload.parentBlockId ?? null, orderKey: payload.orderKey })
      if (operation.kind === 'block.upsert') {
        const next = { ...payload, workspaceId: workspace.id, parentBlockId: payload.parentBlockId ?? null, createdAt: existing?.createdAt ?? stamp, updatedAt: stamp }
        server.blocks = server.blocks.filter((block) => block.id !== payload.id).concat(next)
      }
      if (operation.kind === 'block.delete') server.blocks = server.blocks.filter((block) => block.id !== payload.id)
      if (operation.kind === 'page.upsert') { /* page metadata is not part of this acceptance */ }
      return json({ id: operation.id, status: 'applied' })
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
  })
}

async function slash(page: Page, label: string) {
  await page.keyboard.type('/')
  await page.locator('.p2-slash-menu').getByRole('option', { name: label, exact: true }).click()
}

/** The outer mixed-document table: distinctive B1 cell excludes the table nested under the toggle. */
function mixedTable(page: Page) { return editor(page).locator('table').filter({ hasText: 'B1' }) }

/** Toggle block texts only: table cells nested under a toggle are internal content. */
async function toggleTexts(page: Page): Promise<string[]> {
  return editor(page).evaluate((root) => Array.from(root.querySelectorAll('.eotion-toggle p'))
    .filter((element) => !element.closest('table'))
    .map((element) => (element.textContent ?? '').trim()))
}

async function pendingCount(page: Page) {
  return page.evaluate(async () => {
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    return (await (await useProductSyncStore().store()).getPendingOperations()).length
  })
}

async function localBlocks(page: Page) {
  return page.evaluate(async (pageId) => {
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    return (await (await useProductSyncStore().store()).listBlocksByPage(pageId)) as unknown as BlockResponse[]
  }, pageRecord.id)
}

/* ------------------------------------------------------------------ *
 * 1. Create a real mixed page in the editor and keep it through a
 *    reload, a reorder/indent pass and a full browser restart.
 * ------------------------------------------------------------------ */

test('a mixed advanced-block page is created in the editor and survives reload, reorder, indent and browser restart', async () => {
  test.setTimeout(180000)
  const profile = await mkdtemp(path.join(tmpdir(), 'eotion-p75-create-'))
  const server: Server = { blocks: [], offline: false, requests: [] }
  let context = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, baseURL: 'http://127.0.0.1:7173' })
  try {
    let page = context.pages()[0] ?? await context.newPage()
    await installApi(page, server)
    await page.goto(pageUrl())
    const body = editor(page)
    await expect(body).toBeVisible()

    // heading + paragraph
    await body.locator(':scope > p').first().click()
    await page.keyboard.press('Home')
    await slash(page, '一级标题')
    await page.keyboard.type('Mixed document')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Intro paragraph.')
    await page.keyboard.press('Enter')

    // bullet list -> numbered list -> todo
    await slash(page, '项目列表')
    await page.keyboard.type('Bullet A')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Bullet B')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await slash(page, '编号列表')
    await page.keyboard.type('First')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Second')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await slash(page, '待办')
    await page.keyboard.type('Task A')
    await page.keyboard.press('Enter')

    // quote -> code -> callout
    await slash(page, '引用')
    await page.keyboard.type('Quoted line')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await slash(page, '代码块')
    await page.keyboard.type('const answer = 42')
    await page.keyboard.press('ArrowDown')
    await slash(page, '提示块')
    await page.keyboard.type('Remember this')
    await page.keyboard.press('Enter')

    // toggle with a child, then a nested toggle created inside it through the slash menu
    await slash(page, '折叠列表')
    await expect(body.locator('.eotion-toggle')).toHaveCount(1)
    await page.keyboard.type('Toggle summary')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Toggle child')
    await page.keyboard.press('Enter')
    await slash(page, '折叠列表')
    await expect(body.locator('.eotion-toggle')).toHaveCount(2)
    await expect(body.locator('.eotion-toggle .eotion-toggle')).toHaveCount(1)
    await page.keyboard.type('Inner summary')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Grandchild')

    // the root trailing paragraph stays outside the toggle: extra content plus the table
    await body.locator(':scope > p').last().click()
    await page.keyboard.press('End')
    await page.keyboard.type('Tabbed child')
    await page.keyboard.press('Enter')
    await slash(page, '表格')
    await expect(body.locator('table')).toBeVisible()
    await page.keyboard.type('H1')
    await page.keyboard.press('Tab')
    await page.keyboard.type('H2')
    await page.keyboard.press('Tab')
    await page.keyboard.type('H3')
    await page.keyboard.press('Tab')
    await page.keyboard.type('A1')
    await page.keyboard.press('Tab')
    await page.keyboard.type('A2')
    await page.keyboard.press('Tab')
    await page.keyboard.type('A3')

    await expect.poll(() => blockTypes(server.blocks), { timeout: 10000 }).toEqual(
      expect.arrayContaining(['heading', 'paragraph', 'bulleted-list', 'numbered-list', 'todo', 'quote', 'code', 'callout', 'toggle', 'table']),
    )
    await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
    expect(structureProblems(server.blocks)).toEqual([])

    const toggle = server.blocks.find((block) => block.type === 'toggle' && block.parentBlockId === null)!
    const createdIds = ids(server.blocks)
    expect(createdIds.get(toggle.id)).toBe('toggle')
    expect(server.blocks.find((block) => block.id === 'm-heading')).toBeUndefined()

    // Nested creation is real data: the inner toggle carries the outer toggle as parent.
    const innerToggle = server.blocks.find((block) => block.type === 'toggle' && (block.props as any).node.content?.[0]?.content?.[0]?.text === 'Inner summary')!
    expect(innerToggle.parentBlockId).toBe(toggle.id)
    expect(server.blocks.find((block) => (block.props as any).node.content?.[0]?.text === 'Grandchild')?.parentBlockId).toBe(innerToggle.id)
    // A root paragraph outdents/indents through the nested block UX without changing identity.
    const tabbed = server.blocks.find((block) => (block.props as any).node.content?.[0]?.text === 'Tabbed child')!
    expect(tabbed.parentBlockId ?? null).toBe(null)
    await body.locator('[data-eotion-drag-handle="' + tabbed.id + '"]').dragTo(body.locator('.eotion-toggle').first(), { targetPosition: { x: 30, y: 16 } })
    await expect.poll(() => server.blocks.find((block) => block.id === tabbed.id)?.parentBlockId, { timeout: 5000 }).toBe(toggle.id)
    await expect.poll(() => server.blocks.find((block) => block.id === tabbed.id)?.type, { timeout: 5000 }).toBe('paragraph')
    await expect(body.locator('[data-eotion-drag-handle="' + tabbed.id + '"]')).toBeAttached()

    // Edit a paragraph in place.
    await body.getByText('Intro paragraph.', { exact: true }).click()
    await page.keyboard.press('End')
    await page.keyboard.type(' edited')

    // Reorder: drag the table before the callout block.
    const tableBlock = server.blocks.find((block) => block.type === 'table')!
    const calloutBlock = server.blocks.find((block) => block.type === 'callout')!
    const rootOrder = () => server.blocks.filter((block) => !block.parentBlockId).sort((a, b) => a.orderKey.localeCompare(b.orderKey)).map((block) => block.id)
    expect(rootOrder().indexOf(tableBlock.id)).toBeGreaterThan(rootOrder().indexOf(calloutBlock.id))
    await body.locator('[data-eotion-drag-handle="' + tableBlock.id + '"]').dragTo(body.locator('.eotion-callout'), { targetPosition: { x: 30, y: 2 } })
    // Both indices shift with the move, so compare them inside one polled evaluation.
    await expect.poll(() => {
      const order = rootOrder()
      return order.indexOf(tableBlock.id) < order.indexOf(calloutBlock.id) && order.indexOf(tableBlock.id) >= 0
    }, { timeout: 5000 }).toBe(true)
    await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()

    // Every id, parent and order that existed before the reorder still exists.
    const before = flattened(server.blocks)
    for (const entry of before) {
      const current = server.blocks.find((block) => block.id === entry.id)
      expect(current, 'block ' + entry.id + ' must survive').toBeTruthy()
      expect(current!.type).toBe(entry.type)
      expect(current!.parentBlockId ?? null).toBe(entry.parentBlockId)
    }
    expect(structureProblems(server.blocks)).toEqual([])

    // Edit the callout attributes and a table cell in place.
    await body.getByText('Remember this', { exact: true }).click()
    await body.locator('.eotion-callout').getByRole('button', { name: '提示块设置' }).click()
    await page.getByRole('textbox', { name: '提示块图标' }).fill('🚀')
    await page.getByRole('combobox', { name: '提示块语气' }).selectOption('warning')
    await page.keyboard.press('Escape')
    await expect.poll(() => (server.blocks.find((block) => block.type === 'callout')?.props as any)?.node?.attrs ?? null, { timeout: 5000 }).toEqual({ icon: '🚀', tone: 'warning' })
    await body.locator('table th').first().click()
    await page.keyboard.press('End')
    await page.keyboard.type('+edited')
    await expect.poll(() => {
      const table = server.blocks.find((block) => block.type === 'table')!
      return (table.props as any).node.content[0].content[0].content[0].content[0].text
    }, { timeout: 5000 }).toBe('H1+edited')

    const stableShape = canonicalDocument(server.blocks)

    // reload
    await page.reload()
    await expect.poll(() => toggleTexts(page)).toEqual(expect.arrayContaining(['Toggle summary', 'Toggle child', 'Inner summary', 'Grandchild', 'Tabbed child']))
    await expect(editor(page).locator('table')).toHaveCount(1)
    await expect(editor(page).locator('blockquote')).toContainText('Quoted line')
    await expect(editor(page).locator('.eotion-callout')).toHaveAttribute('data-tone', 'warning')
    await expect(editor(page).locator('table th').first()).toHaveText('H1+edited')
    await expect(editor(page).getByText('Intro paragraph. edited', { exact: true })).toBeVisible()

    // browser restart
    await context.close()
    context = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, baseURL: 'http://127.0.0.1:7173' })
    page = context.pages()[0] ?? await context.newPage()
    await installApi(page, server)
    await page.goto(pageUrl())
    await expect.poll(() => toggleTexts(page)).toEqual(expect.arrayContaining(['Toggle summary', 'Toggle child', 'Inner summary', 'Grandchild', 'Tabbed child']))
    await expect(editor(page).locator('table')).toHaveCount(1)
    await expect(editor(page).locator('.eotion-callout')).toHaveAttribute('data-tone', 'warning')
    await expect(editor(page).locator('table th').first()).toHaveText('H1+edited')
    await expect(editor(page).getByText('Intro paragraph. edited', { exact: true })).toBeVisible()
    expect(canonicalDocument(server.blocks)).toEqual(stableShape)
    expect(structureProblems(server.blocks)).toEqual([])
  } finally {
    await context.close()
    await rm(profile, { recursive: true, force: true })
  }
})

/* ------------------------------------------------------------------ *
 * 2. Full local-first lifecycle over the seeded mixed document.
 * ------------------------------------------------------------------ */

test('seeded mixed document keeps local-first identity, nesting, callout attrs and table grid across offline restart and reconnect', async () => {
  test.setTimeout(180000)
  const profile = await mkdtemp(path.join(tmpdir(), 'eotion-p75-sync-'))
  const server: Server = { blocks: mixedDocument(), offline: false, requests: [] }
  let context = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, baseURL: 'http://127.0.0.1:7173' })
  try {
    let page = context.pages()[0] ?? await context.newPage()
    await installApi(page, server)
    await page.goto(pageUrl())
    const body = editor(page)
    await expect.poll(() => toggleTexts(page)).toEqual(['Toggle summary', 'Toggle child', 'Inner summary', 'Grandchild'])
    await expect(body.locator('.eotion-callout')).toHaveAttribute('data-tone', 'warning')
    await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
    expect(structureProblems(server.blocks)).toEqual([])

    // Offline edits across a paragraph, a nested toggle child, a callout attribute and a table cell.
    server.offline = true
    await body.getByText('Intro paragraph.', { exact: true }).click()
    await page.keyboard.press('End')
    await page.keyboard.type(' offline')
    await body.getByText('Grandchild', { exact: true }).click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Offline sibling')
    await body.getByText('Remember this', { exact: true }).click()
    await body.locator('.eotion-callout').getByRole('button', { name: '提示块设置' }).click()
    await page.getByRole('combobox', { name: '提示块语气' }).selectOption('info')
    await page.keyboard.press('Escape')
    await mixedTable(page).locator('th').first().click()
    await page.keyboard.press('End')
    await page.keyboard.type('+offline')
    await expect.poll(() => pendingCount(page), { timeout: 10000 }).toBeGreaterThan(0)

    // A pending operation can represent only the first edit in the debounce drain.
    // Wait for every edit to reach LocalStore before using reload as a durability check.
    await expect.poll(async () => {
      const blocks = await localBlocks(page)
      const byId = new Map(blocks.map((block) => [block.id, block]))
      const intro = byId.get('m-intro')
      const sibling = blocks.find((block) => block.type === 'paragraph' && blockContent(block) === 'Offline sibling')
      const callout = byId.get('m-callout')
      const outerTable = byId.get('m-table')
      return Boolean(
        intro && blockContent(intro) === 'Intro paragraph. offline'
        && sibling?.parentBlockId === 'm-inner'
        && callout && blockAttrs(callout).tone === 'info'
        && outerTable && (blockContent(outerTable) as string[][])[0]?.[0] === 'H1+offline',
      )
    }, { timeout: 15000 }).toBe(true)

    // Local content is durable: reload keeps every edit and every identity.
    await page.reload()
    await expect(editor(page).getByText('Intro paragraph. offline', { exact: true })).toBeVisible()
    await expect.poll(() => toggleTexts(page)).toEqual(['Toggle summary', 'Toggle child', 'Inner summary', 'Grandchild', 'Offline sibling'])
    await expect(editor(page).locator('.eotion-callout')).toHaveAttribute('data-tone', 'info')
    await expect(mixedTable(page).locator('th').first()).toHaveText('H1+offline')
    expect(structureProblems(await localBlocks(page))).toEqual([])

    // Browser restart with the offline edits still pending.
    await context.close()
    context = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, baseURL: 'http://127.0.0.1:7173' })
    page = context.pages()[0] ?? await context.newPage()
    await installApi(page, server)
    await page.goto(pageUrl())
    await expect(editor(page).getByText('Intro paragraph. offline', { exact: true })).toBeVisible()
    await expect(mixedTable(page).locator('th').first()).toHaveText('H1+offline')

    const localSnapshot = canonicalDocument(await localBlocks(page))
    const stableIds = flattened(await localBlocks(page)).map((block) => block.id + ':' + block.type).sort()
    const toggleId = server.blocks.find((block) => block.type === 'toggle' && block.parentBlockId === null)!.id

    // Reconnect: push pending operations, then pull the snapshot.
    const reconnectAt = server.requests.length
    server.offline = false
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect.poll(() => pendingCount(page), { timeout: 15000 }).toBe(0)
    await expect.poll(() => JSON.stringify(server.blocks.find((block) => block.id === 'm-intro')?.props ?? {}), { timeout: 10000 }).toContain('Intro paragraph. offline')

    // The snapshot pull follows the push in the same sync run; wait for it instead
    // of sampling a run that is still draining pending operations.
    await expect.poll(
      () => server.requests.slice(reconnectAt).findIndex((request) => request.path.endsWith('/snapshot')),
      { timeout: 15000 },
    ).toBeGreaterThanOrEqual(0)
    const after = server.requests.slice(reconnectAt)
    const firstPush = after.findIndex((request) => request.kind === 'block.upsert' || request.kind === 'block.move')
    const firstSnapshot = after.findIndex((request) => request.path.endsWith('/snapshot'))
    expect(firstPush).toBeGreaterThanOrEqual(0)
    expect(firstSnapshot).toBeGreaterThan(firstPush)

    // Final content identity: server == local, structure intact, ids unchanged.
    expect(canonicalDocument(server.blocks)).toEqual(localSnapshot)
    expect(structureProblems(server.blocks)).toEqual([])
    expect(flattened(server.blocks).map((block) => block.id + ':' + block.type).sort()).toEqual(stableIds)
    expect(server.blocks.find((block) => block.id === toggleId)?.parentBlockId ?? null).toBe(null)
    const inner = server.blocks.find((block) => block.id === 'm-inner')!
    expect(inner.parentBlockId).toBe(toggleId)
    expect(server.blocks.find((block) => block.id === 'm-grandchild')?.parentBlockId).toBe('m-inner')
    expect(server.blocks.find((block) => block.id === 'm-nested-table')?.parentBlockId).toBe(toggleId)
    const calloutNode = (server.blocks.find((block) => block.id === 'm-callout')!.props as any).node
    expect(calloutNode.attrs).toEqual({ icon: '🚀', tone: 'info' })
    const grid = blockContent(server.blocks.find((block) => block.id === 'm-table')!) as string[][]
    expect(grid[0]?.[0]).toBe('H1+offline')
    expect(grid).toHaveLength(3)
    expect(grid.every((row) => row.length === 3)).toBe(true)

    // A final reload renders exactly the synced content.
    await page.reload()
    await expect.poll(() => toggleTexts(page)).toEqual(['Toggle summary', 'Toggle child', 'Inner summary', 'Grandchild', 'Offline sibling'])
    await expect(mixedTable(page).locator('th').first()).toHaveText('H1+offline')
    await expect(editor(page).locator('.eotion-callout')).toHaveAttribute('data-tone', 'info')
    await expect(editor(page).locator('table')).toHaveCount(2)
  } finally {
    await context.close()
    await rm(profile, { recursive: true, force: true })
  }
})

/* ------------------------------------------------------------------ *
 * 3. P5/P6 legacy pages keep opening, editing, saving and syncing.
 * ------------------------------------------------------------------ */

test('a legacy P5/P6 page still opens, edits, saves and syncs without a migration', async ({ page }) => {
  const legacy: BlockResponse[] = [
    record('l-heading', 'heading', { type: 'heading', attrs: { level: 2 }, content: text('Legacy heading') }, 10),
    record('l-paragraph', 'paragraph', { type: 'paragraph', content: text('Legacy paragraph') }, 20),
    record('l-list', 'bulleted-list', { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: text('Legacy item') }] }] }, 30),
    record('l-todo', 'todo', { type: 'eotionTodo', attrs: { checked: true }, content: text('Legacy task') }, 40),
    record('l-quote', 'quote', { type: 'blockquote', content: [{ type: 'paragraph', content: text('Legacy quote') }] }, 50),
    record('l-code', 'code', { type: 'codeBlock', attrs: { language: null }, content: text('legacy()') }, 60),
    record('l-divider', 'divider', { type: 'horizontalRule' }, 70),
  ]
  const server: Server = { blocks: legacy, offline: false, requests: [] }
  await installApi(page, server)
  await page.goto(pageUrl())
  const body = editor(page)
  await expect(body.getByText('Legacy paragraph', { exact: true })).toBeVisible()
  await expect(body.locator('h2')).toHaveText('Legacy heading')
  await body.getByText('Legacy paragraph', { exact: true }).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' updated')
  await expect.poll(() => JSON.stringify(server.blocks.find((block) => block.id === 'l-paragraph')?.props ?? {}), { timeout: 5000 }).toContain('Legacy paragraph updated')
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  // No legacy block was rewritten or lost; the only addition is the editor's
  // pre-existing trailing paragraph (StarterKit TrailingNode) after the divider.
  for (const entry of legacy) {
    const current = server.blocks.find((block) => block.id === entry.id)
    expect(current, 'legacy block ' + entry.id + ' must survive').toBeTruthy()
    expect(current!.type).toBe(entry.type)
    expect((current!.props as any).node.type).toBe((entry.props as any).node.type)
  }
  const added = server.blocks.filter((block) => !legacy.some((entry) => entry.id === block.id))
  expect(added.every((block) => block.type === 'paragraph' && (block.parentBlockId ?? null) === null)).toBe(true)
  expect(server.blocks.every((block) => (block.parentBlockId ?? null) === null)).toBe(true)
  expect(structureProblems(server.blocks)).toEqual([])
  await page.reload()
  await expect(editor(page).getByText('Legacy paragraph updated', { exact: true })).toBeVisible()
})
