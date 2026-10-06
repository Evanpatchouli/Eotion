import { expect, test, type Page, type Route } from '@playwright/test'
import type { AuthUserDto, BlockResponse, PageResponse, WorkspaceResponse } from '@eotion/contracts'

const now = '2026-09-30T00:00:00.000Z'
const later = '2027-09-30T00:00:00.000Z'
const user: AuthUserDto = { id: 'user-ava', email: 'ava@example.com', createdAt: now, updatedAt: now }
const workspace: WorkspaceResponse = { id: 'ws-a', name: 'Ava space', ownerId: user.id, createdAt: now, updatedAt: now }
const pageRecord: PageResponse = {
  id: 'page-a', workspaceId: workspace.id, parentPageId: null, title: 'Alpha',
  orderKey: '0000000000000001', createdAt: now, updatedAt: now,
}

/** Minimal sync API double with nested-free block.upsert plus the P7.1 block.move kind. */
async function installApi(page: Page, seed: BlockResponse[] = []) {
  const pages: PageResponse[] = [pageRecord]
  const blocks: BlockResponse[] = [...seed]
  const requests: Array<{ kind: string; payload: any }> = []
  const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/auth/me' && request.method() === 'GET') return json(route, 200, user)
    if (path === '/api/workspaces' && request.method() === 'GET') return json(route, 200, [workspace])
    if (path === `/api/sync/workspaces/${workspace.id}/snapshot` && request.method() === 'GET') {
      return json(route, 200, { pages, blocks: blocks.map((block) => ({ ...block })) })
    }
    if (path === '/api/sync/operations' && request.method() === 'POST') {
      const operation = request.postDataJSON() as { id: string; kind: string; workspaceId: string; payload: any }
      const payload = operation.payload
      requests.push({ kind: operation.kind, payload })
      const existing = blocks.find((item) => item.id === payload.id)
      if (operation.kind === 'block.upsert') {
        const record: BlockResponse = { ...payload, workspaceId: operation.workspaceId, parentBlockId: payload.parentBlockId ?? null, createdAt: existing?.createdAt ?? now, updatedAt: later }
        const index = blocks.findIndex((item) => item.id === record.id)
        if (index < 0) blocks.push(record)
        else blocks[index] = record
      } else if (operation.kind === 'block.move') {
        if (existing) Object.assign(existing, { parentBlockId: payload.parentBlockId, orderKey: payload.orderKey, updatedAt: later })
      } else if (operation.kind === 'block.delete') {
        const index = blocks.findIndex((item) => item.id === payload.id)
        if (index >= 0) blocks.splice(index, 1)
      } else if (operation.kind === 'page.upsert') {
        const index = pages.findIndex((item) => item.id === payload.id)
        if (index < 0) pages.push({ ...payload, workspaceId: operation.workspaceId, createdAt: now, updatedAt: later })
        else pages[index] = { ...pages[index]!, ...payload, updatedAt: later }
      }
      return json(route, 200, { id: operation.id, status: 'applied' })
    }
    return json(route, 404, { statusCode: 404, message: 'Not found' })
  })
  return { pages, blocks, requests }
}

const editor = (page: Page) => page.locator('.eotion-editor-content .tiptap')

test('toggle creates, nests, survives reload and folds without becoming block data', async ({ page }) => {
  const browserErrors: string[] = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  const api = await installApi(page)
  await page.goto('/#/app/ws-a/page/page-a')
  const body = editor(page)
  await expect(body).toBeVisible()
  await body.click()
  await body.pressSequentially('/')
  await page.locator('.p2-slash-menu').getByRole('option', { name: '折叠列表', exact: true }).click()
  await expect(body.locator('.eotion-toggle')).toBeVisible()
  await body.pressSequentially('Summary')
  await body.press('Enter')
  await body.pressSequentially('Child')
  await expect(body.locator('.eotion-toggle p')).toHaveText(['Summary', 'Child'])

  // The child is a real block with parentBlockId, not content of the summary.
  // Wrapping also leaves the usual trailing empty paragraph, exactly like Quote.
  await expect.poll(() => api.blocks.length, { timeout: 5000 }).toBe(3)
  const toggle = api.blocks.find((item) => item.type === 'toggle')!
  const children = api.blocks.filter((item) => item.parentBlockId === toggle.id)
  expect(children).toHaveLength(1)
  expect(children[0]!.type).toBe('paragraph')
  expect((toggle.props.node as any).content).toHaveLength(1)

  await page.reload()
  await expect(editor(page).locator('.eotion-toggle p')).toHaveText(['Summary', 'Child'])

  const chevron = page.locator('.eotion-toggle-chevron')
  await expect(chevron).toHaveAttribute('aria-expanded', 'true')
  await chevron.click()
  await expect(chevron).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('.eotion-toggle p').nth(1)).toBeHidden()
  expect(JSON.stringify(api.blocks)).not.toContain('collapsed')

  // Fold state is local preference: it survives reload without touching the tree.
  await page.reload()
  await expect(page.locator('.eotion-toggle p')).toHaveText(['Summary', 'Child'])
  await expect(page.locator('.eotion-toggle-chevron')).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('.eotion-toggle p').nth(1)).toBeHidden()
  await page.locator('.eotion-toggle-chevron').click()
  await expect(page.locator('.eotion-toggle p').nth(1)).toBeVisible()

  // Clearing the document removes nested blocks without leaving an orphan.
  const clearing = editor(page)
  await clearing.click()
  await clearing.press('Control+A')
  await clearing.press('Backspace')
  await expect.poll(() => api.blocks.every((item) => (item.parentBlockId ?? null) === null), { timeout: 5000 }).toBe(true)
  expect(api.blocks).toHaveLength(1)
  expect(api.requests.some((request) => request.kind === 'block.delete')).toBe(true)
  expect(browserErrors).toEqual([])
})

test('editing inside a toggle keeps the existing block identities', async ({ page }) => {
  const api = await installApi(page)
  await page.goto('/#/app/ws-a/page/page-a')
  const body = editor(page)
  await body.click()
  await body.pressSequentially('/')
  await page.locator('.p2-slash-menu').getByRole('option', { name: '折叠列表', exact: true }).click()
  await body.pressSequentially('Summary')
  await body.press('Enter')
  await body.pressSequentially('Child')
  await expect.poll(() => api.blocks.length, { timeout: 5000 }).toBe(3)
  const toggle = api.blocks.find((item) => item.type === 'toggle')!
  const child = api.blocks.find((item) => item.parentBlockId === toggle.id)!

  // Adding a second child runs the identity repair path. The parent toggle must
  // not hand its id to the first child, and no existing block may be recreated.
  const childParagraph = body.locator('.eotion-toggle p').nth(1)
  await childParagraph.click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Second child')
  await expect.poll(() => api.blocks.filter((item) => item.parentBlockId === toggle.id).length, { timeout: 5000 }).toBe(2)
  expect(api.blocks.find((item) => item.id === toggle.id)?.type).toBe('toggle')
  expect(api.blocks.find((item) => item.id === child.id)?.type).toBe('paragraph')
  await expect(body.locator('.eotion-toggle p')).toHaveText(['Summary', 'Child', 'Second child'])
  await page.reload()
  await expect(editor(page).locator('.eotion-toggle p')).toHaveText(['Summary', 'Child', 'Second child'])
})

test('local store enforces nested block invariants and records one block.move', async ({ page }) => {
  await page.goto('/#/__dev/storage-p3')
  const result = await page.evaluate(async () => {
    const { IndexedDbLocalStore } = await import('/src/storage/indexedDbStore.ts')
    const store = await IndexedDbLocalStore.open(`p71-move-${crypto.randomUUID()}`)
    const stamp = new Date().toISOString()
    const pageMeta = (id: string, orderKey: string) => ({ id, workspaceId: 'ws', parentPageId: null, orderKey, title: id, updatedAt: stamp })
    const blockRecord = (id: string, pageId: string, parentBlockId: string | null, orderKey: string, type = 'paragraph') =>
      ({ id, workspaceId: 'ws', pageId, parentBlockId, type, orderKey, props: { node: { type: 'paragraph' } }, createdAt: stamp, updatedAt: stamp })
    const outcome = { rejected: [] as string[], immutableParent: false, paragraphParent: false, moveCount: 0, movePayload: null as unknown, movedParent: 'unset', snapshotRejections: [] as string[] }
    try {
      await store.upsertPage(pageMeta('page-1', 'a'))
      await store.upsertPage(pageMeta('page-2', 'b'))
      await store.upsertBlock(blockRecord('toggle', 'page-1', null, '000000000000000000000000000100', 'toggle'))
      await store.upsertBlock(blockRecord('a', 'page-1', 'toggle', '000000000000000000000000000100'))
      await store.upsertBlock(blockRecord('b', 'page-1', 'toggle', '000000000000000000000000000200'))
      await store.upsertBlock(blockRecord('flat', 'page-1', null, '000000000000000000000000000300'))
      await store.upsertBlock(blockRecord('off-page', 'page-2', null, '000000000000000000000000000100'))

      try { await store.upsertBlock(blockRecord('a', 'page-1', null, '000000000000000000000000000100')) }
      catch { outcome.immutableParent = true }

      // A local create must reject a parent type that cannot own children, not
      // only a missing or off-page parent.
      try { await store.upsertBlock(blockRecord('child-of-flat', 'page-1', 'flat', '000000000000000000000000000900')) }
      catch { outcome.paragraphParent = true }

      const baseline = (await store.getPendingOperations()).length
      const cases: Array<[string, string, string]> = [
        ['self', 'toggle', 'toggle'],
        ['cycle', 'toggle', 'a'],
        ['missing', 'a', 'does-not-exist'],
        ['off-page', 'a', 'off-page'],
        ['flat-parent', 'a', 'flat'],
      ]
      for (const [label, id, parent] of cases) {
        try { await store.moveBlock('ws', id, parent, '000000000000000000000000000400') }
        catch { outcome.rejected.push(label) }
      }
      if ((await store.getPendingOperations()).length !== baseline) outcome.rejected.push('unexpected-op')

      await store.moveBlock('ws', 'a', null, '000000000000000000000000000500')
      const moves = (await store.getPendingOperations()).filter((operation) => operation.kind === 'block.move')
      outcome.moveCount = moves.length
      outcome.movePayload = moves[0]?.payload
      const moved = await store.getBlock('a')
      outcome.movedParent = moved ? moved.parentBlockId ?? null : 'missing-block'

      for (const operation of await store.getPendingOperations()) await store.markOperationSynced(operation.id)
      const snap = (id: string, parentBlockId: string | null, pageId = 'page-1') => blockRecord(id, pageId, parentBlockId, '000000000000000000000000000100')
      try { await store.replaceWorkspaceSnapshot('ws', [pageMeta('page-1', 'a')], [snap('x', 'x')]) } catch { outcome.snapshotRejections.push('self') }
      try { await store.replaceWorkspaceSnapshot('ws', [pageMeta('page-1', 'a')], [snap('x', 'y'), snap('y', 'x')]) } catch { outcome.snapshotRejections.push('cycle') }
      try { await store.replaceWorkspaceSnapshot('ws', [pageMeta('page-1', 'a'), pageMeta('page-2', 'b')], [snap('x', null, 'page-1'), snap('y', 'x', 'page-2')]) } catch { outcome.snapshotRejections.push('cross-page') }
    } finally { store.close() }
    return outcome
  })
  expect(result).toEqual({
    rejected: ['self', 'cycle', 'missing', 'off-page', 'flat-parent'],
    immutableParent: true,
    paragraphParent: true,
    moveCount: 1,
    movePayload: { id: 'a', pageId: 'page-1', parentBlockId: null, orderKey: '000000000000000000000000000500' },
    movedParent: null,
    snapshotRejections: ['self', 'cycle', 'cross-page'],
  })
})

test('block codec round-trips nested toggles and refuses unrepresentable structure', async ({ page }) => {
  await page.goto('/#/__dev/editor-foundation')
  const result = await page.evaluate(async () => {
    const { blocksToDocument, documentToBlocks } = await import('/src/editor/blockCodec.ts')
    const stamp = new Date().toISOString()
    const summary = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
    const record = (id: string, type: string, node: unknown, parentBlockId: string | null, orderKey: string) =>
      ({ id, workspaceId: 'ws', pageId: 'page-1', parentBlockId, type, orderKey, props: { node }, createdAt: stamp, updatedAt: stamp })
    const blocks = [
      record('root', 'paragraph', summary('Root'), null, '000000000000000000000000000100'),
      record('toggle-1', 'toggle', { type: 'eotionToggle', content: [summary('Outer')] }, null, '000000000000000000000000000200'),
      record('child-a', 'paragraph', summary('First child'), 'toggle-1', '000000000000000000000000000100'),
      record('toggle-2', 'toggle', { type: 'eotionToggle', content: [summary('Inner')] }, 'toggle-1', '000000000000000000000000000200'),
      record('child-c', 'paragraph', summary('Inner child'), 'toggle-2', '000000000000000000000000000100'),
    ]
    const document = blocksToDocument(blocks)
    const shape = (node: any): any => ({
      type: node.type,
      id: node.attrs?.blockId ?? null,
      children: (node.content ?? []).map(shape),
    })
    const decoded = documentToBlocks(document, blocks, false).map((block) => ({ id: block.id, type: block.type, parentBlockId: block.parentBlockId }))
    const order = new Map(blocks.map((block) => [block.id, block.orderKey]))
    const restored = blocksToDocument(documentToBlocks(document, blocks, false).map((block) => ({ ...block, orderKey: order.get(block.id)! })))
    const stable = JSON.stringify(restored) === JSON.stringify(document)

    // Leaf blocks round-trip unchanged: no injected content array may turn an
    // image, file or divider into an unsaveable node.
    const image = record('image-1', 'image', { type: 'eotionImage', attrs: { fileId: 'file-1', name: 'x.png', mimeType: 'image/png', size: 10, url: 'https://objects.example.test/x' } }, null, '000000000000000000000000000300')
    const divider = record('divider-1', 'divider', { type: 'horizontalRule' }, null, '000000000000000000000000000400')
    const leaves = blocksToDocument([image, divider])
    const leafShape = leaves.content.map((node) => ({ type: node.type, id: node.attrs?.blockId ?? null, hasContent: Object.prototype.hasOwnProperty.call(node, 'content') }))
    const leafRoundTrip = documentToBlocks(leaves, [image, divider], true).map((block) => ({ id: block.id, type: block.type }))
    let unsafeAttachment = false
    try { blocksToDocument([record('bad', 'image', { type: 'eotionImage', attrs: { fileId: 'f', name: 'x.png', mimeType: 'image/png', size: 10, url: 'javascript:alert(1)' } }, null, 'a')]) }
    catch { unsafeAttachment = true }

    // A rootless cycle must fail the load closed instead of opening an empty page.
    let cyclicTree = false
    try { blocksToDocument([record('cycle-a', 'paragraph', summary('A'), 'cycle-b', 'a'), record('cycle-b', 'paragraph', summary('B'), 'cycle-a', 'a')]) }
    catch { cyclicTree = true }

    // A child-owning node can never be another block's summary: it becomes a real
    // child block so its own children stay in the block tree.
    const nestedSummaryDocument = {
      type: 'doc',
      content: [{
        type: 'eotionToggle', attrs: { blockId: 'outer' },
        content: [{
          type: 'eotionToggle', attrs: { blockId: 'inner' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Inner' }] }],
        }],
      }],
    }
    const nestedSummary = documentToBlocks(nestedSummaryDocument, [], true).map((block) => ({
      id: block.id, type: block.type, parentBlockId: block.parentBlockId, summary: (block.props as any).node.content[0].type,
    }))

    let paragraphWithChild = false
    try { blocksToDocument([record('p', 'paragraph', summary('P'), null, 'a'), record('c', 'paragraph', summary('C'), 'p', 'a')]) }
    catch { paragraphWithChild = true }
    let orphan = false
    try { blocksToDocument([record('c', 'paragraph', summary('C'), 'missing', 'a')]) }
    catch { orphan = true }
    let unknownType = false
    try { blocksToDocument([record('x', 'database', summary('X'), null, 'a')]) }
    catch { unknownType = true }
    return { shape: shape(document.content[1]), decoded, stable, leafShape, leafRoundTrip, unsafeAttachment, cyclicTree, nestedSummary, paragraphWithChild, orphan, unknownType }
  })
  expect(result).toEqual({
    shape: {
      type: 'eotionToggle',
      id: 'toggle-1',
      children: [
        { type: 'paragraph', id: null, children: [{ type: 'text', id: null, children: [] }] },
        { type: 'paragraph', id: 'child-a', children: [{ type: 'text', id: null, children: [] }] },
        {
          type: 'eotionToggle',
          id: 'toggle-2',
          children: [
            { type: 'paragraph', id: null, children: [{ type: 'text', id: null, children: [] }] },
            { type: 'paragraph', id: 'child-c', children: [{ type: 'text', id: null, children: [] }] },
          ],
        },
      ],
    },
    decoded: [
      { id: 'root', type: 'paragraph', parentBlockId: null },
      { id: 'toggle-1', type: 'toggle', parentBlockId: null },
      { id: 'child-a', type: 'paragraph', parentBlockId: 'toggle-1' },
      { id: 'toggle-2', type: 'toggle', parentBlockId: 'toggle-1' },
      { id: 'child-c', type: 'paragraph', parentBlockId: 'toggle-2' },
    ],
    stable: true,
    leafShape: [
      { type: 'eotionImage', id: 'image-1', hasContent: false },
      { type: 'horizontalRule', id: 'divider-1', hasContent: false },
    ],
    leafRoundTrip: [
      { id: 'image-1', type: 'image' },
      { id: 'divider-1', type: 'divider' },
    ],
    unsafeAttachment: true,
    cyclicTree: true,
    nestedSummary: [
      { id: 'outer', type: 'toggle', parentBlockId: null, summary: 'paragraph' },
      { id: 'inner', type: 'toggle', parentBlockId: 'outer', summary: 'paragraph' },
    ],
    paragraphWithChild: true,
    orphan: true,
    unknownType: true,
  })
})
