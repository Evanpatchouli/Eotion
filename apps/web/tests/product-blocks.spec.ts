import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Locator, type Page, type Route } from '@playwright/test'
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
  let apiOffline = false
  const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('**/api/**', async (route) => {
    if (apiOffline) return route.abort('internetdisconnected')
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/auth/me' && request.method() === 'GET') return json(route, 200, user)
    if (path === '/api/workspaces' && request.method() === 'GET') return json(route, 200, [workspace])
    if (path === `/api/workspaces/${workspace.id}/database-navigation` && request.method() === 'GET') return json(route, 200, { items: [], nextCursor: null })
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
  return { pages, blocks, requests, setOffline: (offline: boolean) => { apiOffline = offline } }
}

const editor = (page: Page) => page.locator('.eotion-editor-content .tiptap')

async function selectCalloutText(callout: Locator) {
  await callout.evaluate((node) => {
    node.closest<HTMLElement>('.tiptap')!.focus()
    const range = document.createRange()
    range.selectNodeContents(node)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
  })
}

async function setCalloutCaret(callout: Locator, offset: number) {
  await callout.evaluate((node, caretOffset) => {
    const text = node.firstChild
    if (!text || text.nodeType !== Node.TEXT_NODE) throw new Error('Expected one text node in callout content')
    node.closest<HTMLElement>('.tiptap')!.focus()
    const range = document.createRange()
    range.setStart(text, caretOffset)
    range.collapse(true)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
  }, offset)
}

async function captureCalloutScreenshot(page: Page, name: string) {
  const directory = process.env.EOTION_VISUAL_QA_DIR
  if (!directory) return
  await mkdir(directory, { recursive: true })
  await page.screenshot({ path: path.join(directory, `${name}.png`), animations: 'disabled' })
}

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
  // Wait for the converged tree instead of sampling a mid-delete state.
  await expect.poll(() => api.blocks.map((item) => item.parentBlockId ?? null), { timeout: 5000 }).toEqual([null])
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
      ({ id, workspaceId: 'ws', pageId, parentBlockId, type, orderKey, props: { node: type === 'toggle' ? { type: 'eotionToggle', content: [{ type: 'paragraph' }] } : { type: 'paragraph' } }, createdAt: stamp, updatedAt: stamp })
    const outcome = { rejected: [] as string[], immutableParent: false, paragraphParent: false, childOwnerReplacement: false, moveCount: 0, movePayload: null as unknown, movedParent: 'unset', snapshotRejections: [] as string[] }
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

      // A toggle with children cannot be replaced by a leaf block type.
      try {
        await store.upsertBlock({
          ...blockRecord('toggle', 'page-1', null, '000000000000000000000000000100', 'callout'),
          props: { node: { type: 'eotionCallout', attrs: { icon: '💡', tone: 'neutral' }, content: [{ type: 'text', text: 'Replacement' }] } },
        })
      } catch { outcome.childOwnerReplacement = true }

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
    childOwnerReplacement: true,
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
    let invalidDatabaseReference = false
    try { blocksToDocument([record('x', 'database', { type: 'eotionDatabase', attrs: { databaseId: 'db-1' } }, null, 'a')]) }
    catch { invalidDatabaseReference = true }
    return { shape: shape(document.content[1]), decoded, stable, leafShape, leafRoundTrip, unsafeAttachment, cyclicTree, nestedSummary, paragraphWithChild, orphan, invalidDatabaseReference }
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
    invalidDatabaseReference: true,
  })
})

test('callout slash creation edits icon and tone, keeps identity, and supports desktop selection formatting', async ({ page }) => {
  const api = await installApi(page)
  const browserErrors: string[] = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()) })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/#/app/ws-a/page/page-a')
  const body = editor(page)
  await body.click()
  await body.pressSequentially('/')
  await page.locator('.p2-slash-menu').getByRole('option', { name: '提示块', exact: true }).click()

  const callout = body.locator('.eotion-callout')
  const content = callout.locator('.eotion-callout-content')
  await expect(callout).toBeVisible()
  await expect(callout).toHaveAttribute('data-tone', 'neutral')
  await content.click()
  await page.keyboard.type('A useful note')
  await expect(content).toHaveText('A useful note')
  await expect.poll(() => JSON.stringify(api.blocks.find((item) => item.type === 'callout')?.props.node), { timeout: 5000 }).toContain('A useful note')
  const original = api.blocks.find((item) => item.type === 'callout')!
  const originalId = original.id
  const originalOrderKey = original.orderKey

  await callout.getByRole('button', { name: '提示块设置' }).click()
  await page.getByRole('textbox', { name: '提示块图标' }).fill('🚀')
  await page.getByRole('combobox', { name: '提示块语气' }).selectOption('warning')
  await expect(callout).toHaveAttribute('data-tone', 'warning')
  await expect.poll(() => {
    const saved = api.blocks.find((item) => item.id === originalId)
    return saved?.props.node
  }, { timeout: 5000 }).toMatchObject({ attrs: { icon: '🚀', tone: 'warning' } })

  await selectCalloutText(content)
  const selectionBubble = page.getByRole('toolbar', { name: '选区格式' })
  await expect(selectionBubble).toBeVisible()
  await selectionBubble.getByRole('button', { name: '粗体' }).click()
  await expect(content.locator('strong')).toHaveText('A useful note')
  await expect.poll(() => JSON.stringify(api.blocks.find((item) => item.id === originalId)?.props.node), { timeout: 5000 }).toContain('"type":"bold"')
  await expect.poll(() => api.blocks.find((item) => item.id === originalId)?.orderKey, { timeout: 5000 }).toBe(originalOrderKey)
  expect(api.blocks.find((item) => item.id === originalId)?.type).toBe('callout')
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  await captureCalloutScreenshot(page, 'p72-callout-desktop')

  await page.reload()
  const reloadedCallout = editor(page).locator('.eotion-callout')
  await expect(reloadedCallout).toHaveAttribute('data-tone', 'warning')
  await expect(reloadedCallout.locator('.eotion-callout-content strong')).toHaveText('A useful note')
  const reloadedBlock = api.blocks.find((item) => item.id === originalId)!
  expect(reloadedBlock.orderKey).toBe(originalOrderKey)
  expect((reloadedBlock.props.node as any).attrs).toEqual({ icon: '🚀', tone: 'warning' })
  await reloadedCallout.getByRole('button', { name: '提示块设置' }).click()
  await expect(page.getByRole('textbox', { name: '提示块图标' })).toHaveValue('🚀')
  expect(browserErrors).toEqual([])
})

test('callout Enter converts empty blocks, exits at the end, and splits mid-text with stable identity', async ({ page }) => {
  const api = await installApi(page)
  await page.goto('/#/app/ws-a/page/page-a')
  const body = editor(page)
  await body.click()
  await body.pressSequentially('/')
  await page.locator('.p2-slash-menu').getByRole('option', { name: '提示块', exact: true }).click()
  const emptyCallout = body.locator('.eotion-callout')
  await expect.poll(() => api.blocks.find((item) => item.type === 'callout')?.id, { timeout: 5000 }).toBeTruthy()
  const emptyId = api.blocks.find((item) => item.type === 'callout')!.id
  await emptyCallout.locator('.eotion-callout-content').click()
  await page.keyboard.press('Enter')
  await expect(body.locator('.eotion-callout')).toHaveCount(0)
  await expect.poll(() => api.blocks.find((item) => item.id === emptyId)?.type, { timeout: 5000 }).toBe('paragraph')

  // A populated callout exits to a paragraph at end while keeping the left block.
  await body.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  await body.pressSequentially('/')
  await page.locator('.p2-slash-menu').getByRole('option', { name: '提示块', exact: true }).click()
  let callout = body.locator('.eotion-callout').last()
  let content = callout.locator('.eotion-callout-content')
  await body.pressSequentially('End split')
  await expect(content).toHaveText('End split')
  await callout.getByRole('button', { name: '提示块设置' }).click()
  await page.getByRole('textbox', { name: '提示块图标' }).fill('🚀')
  await page.getByRole('combobox', { name: '提示块语气' }).selectOption('warning')
  await expect.poll(() => api.blocks.filter((item) => item.type === 'callout').length, { timeout: 5000 }).toBe(1)
  const endCallout = api.blocks.find((item) => item.type === 'callout')!
  await setCalloutCaret(content, 'End split'.length)
  await page.keyboard.press('Enter')
  await expect(body.locator('.eotion-callout')).toHaveCount(1)
  await expect(body.locator('.eotion-callout').last().locator('.eotion-callout-content')).toHaveText('End split')
  await expect.poll(() => api.blocks.find((item) => item.id === endCallout.id)?.type, { timeout: 5000 }).toBe('callout')
  expect(api.blocks.find((item) => item.id === endCallout.id)?.orderKey).toBe(endCallout.orderKey)
  expect((api.blocks.find((item) => item.id === endCallout.id)?.props.node as any).attrs).toEqual({ icon: '🚀', tone: 'warning' })
  await page.keyboard.type('Exit')
  await expect(body.locator('p').filter({ hasText: 'Exit' })).toHaveText('Exit')
  await expect.poll(() => api.blocks.find((item) => item.type === 'paragraph' && JSON.stringify(item.props.node).includes('Exit')), { timeout: 5000 }).toBeTruthy()
  const endParagraph = api.blocks.find((item) => item.type === 'paragraph' && JSON.stringify(item.props.node).includes('Exit'))!
  expect(endParagraph.id).not.toBe(endCallout.id)

  // Enter in the middle creates a paragraph for the suffix and preserves the
  // original callout identity on the prefix.
  await body.locator('p').last().click()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  await body.pressSequentially('/')
  await page.locator('.p2-slash-menu').getByRole('option', { name: '提示块', exact: true }).click()
  callout = body.locator('.eotion-callout').last()
  content = callout.locator('.eotion-callout-content')
  await body.pressSequentially('BeforeAfter')
  await expect(content).toHaveText('BeforeAfter')
  await expect.poll(() => api.blocks.filter((item) => item.type === 'callout').length, { timeout: 5000 }).toBe(2)
  const midCallout = api.blocks.filter((item) => item.type === 'callout').at(-1)!
  await setCalloutCaret(content, 'Before'.length)
  await page.keyboard.press('Enter')
  await expect(body.locator('.eotion-callout').last().locator('.eotion-callout-content')).toHaveText('Before')
  await expect(body.locator('p').filter({ hasText: 'After' })).toHaveText('After')
  await expect.poll(() => api.blocks.find((item) => item.id === midCallout.id)?.type, { timeout: 5000 }).toBe('callout')
  await expect.poll(() => api.blocks.find((item) => item.type === 'paragraph' && JSON.stringify(item.props.node).includes('After')), { timeout: 5000 }).toBeTruthy()
  const midParagraph = api.blocks.find((item) => item.type === 'paragraph' && JSON.stringify(item.props.node).includes('After'))!
  expect(midParagraph.id).not.toBe(midCallout.id)
  await setCalloutCaret(body.locator('.eotion-callout').last().locator('.eotion-callout-content'), 0)
  await page.keyboard.press('Backspace')
  await expect(body.locator('.eotion-callout')).toHaveCount(1)
  await expect(body.locator('p').filter({ hasText: 'Before' })).toBeVisible()
  await expect.poll(() => api.blocks.find((item) => item.id === midCallout.id)?.type, { timeout: 5000 }).toBe('paragraph')
})

test('Shift+Enter stays inside callout and select-all Backspace deletes cleanly across reload', async ({ page }) => {
  const api = await installApi(page)
  await page.goto('/#/app/ws-a/page/page-a')
  const body = editor(page)
  await body.click()
  await body.pressSequentially('/')
  await page.locator('.p2-slash-menu').getByRole('option', { name: '提示块', exact: true }).click()
  let content = body.locator('.eotion-callout .eotion-callout-content')
  await body.pressSequentially('First line')
  await expect(content).toHaveText('First line')
  await expect.poll(() => api.blocks.find((item) => item.type === 'callout')?.id, { timeout: 5000 }).toBeTruthy()
  const calloutId = api.blocks.find((item) => item.type === 'callout')!.id
  await setCalloutCaret(content, 'First line'.length)
  await page.keyboard.press('Shift+Enter')
  await body.pressSequentially('Second line')
  await expect(content.locator('br')).toHaveCount(1)
  await expect(content).toContainText('First lineSecond line')
  await expect.poll(() => api.blocks.find((item) => item.id === calloutId)?.type, { timeout: 5000 }).toBe('callout')
  await expect.poll(() => JSON.stringify(api.blocks.find((item) => item.id === calloutId)?.props.node), { timeout: 5000 }).toContain('hardBreak')
  await page.reload()
  content = editor(page).locator('.eotion-callout .eotion-callout-content')
  await expect(content.locator('br')).toHaveCount(1)
  await expect(content).toContainText('First lineSecond line')

  await editor(page).click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Backspace')
  await expect(editor(page).locator('.eotion-callout')).toHaveCount(0)
  await expect.poll(() => api.blocks.filter((item) => item.type === 'callout').length, { timeout: 5000 }).toBe(0)
  await page.reload()
  await expect(editor(page).locator('.eotion-callout')).toHaveCount(0)
  await expect(editor(page).locator('p').first()).toBeVisible()
  expect(api.blocks.every((item) => (item.parentBlockId ?? null) === null)).toBe(true)
})

test('formatting a callout selection across Shift+Enter preserves marked hardBreak through domain and reload', async ({ page }) => {
  const api = await installApi(page)
  await page.goto('/#/app/ws-a/page/page-a')
  const body = editor(page)
  await body.click()
  await body.pressSequentially('/')
  await page.locator('.p2-slash-menu').getByRole('option', { name: '提示块', exact: true }).click()
  await page.keyboard.type('Before')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.type('After')
  await selectCalloutText(body.locator('.eotion-callout-content'))
  await page.keyboard.press('Control+b')
  await expect.poll(() => api.blocks.find((block) => block.type === 'callout')?.props.node).toMatchObject({
    content: [
      { type: 'text', text: 'Before', marks: [{ type: 'bold' }] },
      { type: 'hardBreak', marks: [{ type: 'bold' }] },
      { type: 'text', text: 'After', marks: [{ type: 'bold' }] },
    ],
  })
  const props = api.blocks.find((block) => block.type === 'callout')!.props
  const domainAccepted = await page.evaluate(async ({ value, moduleUrl }) => {
    const { validateCalloutBlockProps } = await import(/* @vite-ignore */ moduleUrl)
    return validateCalloutBlockProps(value)
  }, { value: props, moduleUrl: `/@fs/${path.resolve('../../packages/domain/src/block-types.ts').replaceAll('\\', '/')}` })
  expect(domainAccepted).toBe(true)
  await page.reload()
  await expect(editor(page).locator('.eotion-callout-content strong')).toHaveText('BeforeAfter')
  await expect(editor(page).locator('.eotion-callout-content strong br')).toHaveCount(1)
})

test('callout touch editing keeps the mobile toolbar available and avoids selection bubble overflow', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window)
    window.matchMedia = (query: string) => {
      const result = nativeMatchMedia(query)
      if (query === '(pointer: coarse)') Object.defineProperty(result, 'matches', { configurable: true, value: true })
      return result
    }
  })
  const api = await installApi(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/app/ws-a/page/page-a')
  await expect(page.locator('.product-shell')).toHaveAttribute('data-layout', 'mobile')
  await expect(page.locator('.product-shell')).toHaveAttribute('data-input', 'touch')
  const touchToolbar = page.getByRole('toolbar', { name: '触摸编辑工具栏' })
  await expect(touchToolbar).toBeVisible()

  const body = editor(page)
  await body.click()
  await body.pressSequentially('/')
  await page.locator('.p2-slash-menu').getByRole('option', { name: '提示块', exact: true }).click()
  const content = body.locator('.eotion-callout .eotion-callout-content')
  await content.click()
  await page.keyboard.type('Touch callout')
  await expect(content).toHaveText('Touch callout')
  await expect.poll(() => api.blocks.some((item) => item.type === 'callout'), { timeout: 5000 }).toBe(true)
  await selectCalloutText(content)
  await expect(page.getByRole('toolbar', { name: '选区格式' })).toHaveCount(0)
  await expect(touchToolbar.getByRole('button', { name: '粗体' })).toBeVisible()
  await touchToolbar.getByRole('button', { name: '粗体' }).click()
  await expect(content.locator('strong')).toHaveText('Touch callout')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await captureCalloutScreenshot(page, 'p72-callout-mobile')
})

test('callout block saves locally offline, reloads from IndexedDB, syncs online and reloads from snapshot', async ({ page }) => {
  const api = await installApi(page)
  await page.goto('/#/app/ws-a/page/page-a')
  const body = editor(page)
  await body.click()
  await body.pressSequentially('/')
  await page.locator('.p2-slash-menu').getByRole('option', { name: '提示块', exact: true }).click()
  const callout = body.locator('.eotion-callout')
  const content = callout.locator('.eotion-callout-content')
  await content.click()
  await page.keyboard.type('Saved offline')
  await expect(content).toHaveText('Saved offline')
  await callout.getByRole('button', { name: '提示块设置' }).click()
  await page.getByRole('textbox', { name: '提示块图标' }).fill('📌')
  await page.getByRole('combobox', { name: '提示块语气' }).selectOption('info')
  await expect.poll(() => JSON.stringify(api.blocks.find((item) => item.type === 'callout')?.props.node), { timeout: 5000 }).toContain('Saved offline')
  await expect.poll(() => JSON.stringify(api.blocks.find((item) => item.type === 'callout')?.props.node), { timeout: 5000 }).toContain('"tone":"info"')
  const serverCallout = api.blocks.find((item) => item.type === 'callout')!
  const calloutId = serverCallout.id
  const originalOrderKey = serverCallout.orderKey

  api.setOffline(true)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('status').filter({ hasText: '离线 · 本地已保存' })).toBeVisible()
  await setCalloutCaret(content, 'Saved offline'.length)
  await page.keyboard.type(' after reload')
  await expect.poll(() => page.evaluate(async () => {
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    const local = await useProductSyncStore().store()
    return JSON.stringify(await local.listBlocksByPage('page-a'))
  }), { timeout: 5000 }).toContain('Saved offline after reload')

  await page.reload()
  const offlineContent = editor(page).locator('.eotion-callout .eotion-callout-content')
  await expect(offlineContent).toContainText('Saved offline after reload')
  await expect(editor(page).locator('.eotion-callout')).toHaveAttribute('data-tone', 'info')
  const offlineIdentity = await page.evaluate(async (id) => {
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    const local = await useProductSyncStore().store()
    const block = await local.getBlock(id)
    return block ? { id: block.id, orderKey: block.orderKey, type: block.type, props: block.props } : null
  }, calloutId)
  expect(offlineIdentity).toMatchObject({ id: calloutId, orderKey: originalOrderKey, type: 'callout', props: { node: { type: 'eotionCallout', attrs: { icon: '📌', tone: 'info' } } } })

  api.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  await expect.poll(() => JSON.stringify(api.blocks.find((item) => item.id === calloutId)?.props.node), { timeout: 5000 }).toContain('Saved offline after reload')
  await expect.poll(() => api.blocks.find((item) => item.id === calloutId)?.orderKey, { timeout: 5000 }).toBe(originalOrderKey)
  await page.reload()
  await expect(editor(page).locator('.eotion-callout .eotion-callout-content')).toContainText('Saved offline after reload')
  await expect(editor(page).locator('.eotion-callout')).toHaveAttribute('data-tone', 'info')
})

test('callout codec validates attributes and round-trips as a leaf and toggle child', async ({ page }) => {
  await page.goto('/#/__dev/editor-foundation')
  const result = await page.evaluate(async () => {
    const { blocksToDocument, documentToBlocks } = await import('/src/editor/blockCodec.ts')
    const stamp = new Date().toISOString()
    const record = (id: string, type: string, node: unknown, parentBlockId: string | null, orderKey: string) =>
      ({ id, workspaceId: 'ws', pageId: 'page-1', parentBlockId, type, orderKey, props: { node }, createdAt: stamp, updatedAt: stamp })
    const paragraph = { type: 'paragraph', content: [{ type: 'text', text: 'Summary' }] }
    const blocks = [
      record('callout-root', 'callout', { type: 'eotionCallout', attrs: { icon: '💡', tone: 'neutral' }, content: [{ type: 'text', text: 'Root callout' }] }, null, '000000000000000000000000000100'),
      record('toggle-root', 'toggle', { type: 'eotionToggle', content: [paragraph] }, null, '000000000000000000000000000200'),
      record('callout-child', 'callout', { type: 'eotionCallout', attrs: { icon: '⚠️', tone: 'warning' }, content: [{ type: 'text', text: 'Nested callout' }] }, 'toggle-root', '000000000000000000000000000100'),
    ]
    const document = blocksToDocument(blocks)
    const decoded = documentToBlocks(document, blocks, false)
    const encodedShape = decoded.map((block) => ({ id: block.id, type: block.type, parentBlockId: block.parentBlockId, node: (block.props as any).node }))
    const invalidNodes = [
      { type: 'eotionCallout', attrs: { icon: '💡', tone: 'bad' }, content: [{ type: 'text', text: 'Invalid tone' }] },
      { type: 'eotionCallout', attrs: { icon: '', tone: 'neutral' }, content: [{ type: 'text', text: 'Empty icon' }] },
      { type: 'eotionCallout', attrs: { icon: '💡', tone: 'info', extra: true }, content: [{ type: 'text', text: 'Unknown attr' }] },
    ]
    const rejected: boolean[] = []
    for (const [index, node] of invalidNodes.entries()) {
      try { blocksToDocument([record(`bad-${index}`, 'callout', node, null, 'a')]) ; rejected.push(false) }
      catch { rejected.push(true) }
    }
    return {
      shape: document.content?.map((node: any) => ({ type: node.type, blockId: node.attrs?.blockId, childTypes: node.content?.map((child: any) => child.type) })),
      encodedShape,
      rejected,
    }
  })
  expect(result).toEqual({
    shape: [
      { type: 'eotionCallout', blockId: 'callout-root', childTypes: ['text'] },
      { type: 'eotionToggle', blockId: 'toggle-root', childTypes: ['paragraph', 'eotionCallout'] },
    ],
    encodedShape: [
      { id: 'callout-root', type: 'callout', parentBlockId: null, node: { type: 'eotionCallout', attrs: { icon: '💡', tone: 'neutral' }, content: [{ type: 'text', text: 'Root callout' }] } },
      { id: 'toggle-root', type: 'toggle', parentBlockId: null, node: { type: 'eotionToggle', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Summary' }] }] } },
      { id: 'callout-child', type: 'callout', parentBlockId: 'toggle-root', node: { type: 'eotionCallout', attrs: { icon: '⚠️', tone: 'warning' }, content: [{ type: 'text', text: 'Nested callout' }] } },
    ],
    rejected: [true, true, true],
  })
})

test('IndexedDB workspace snapshot round-trips callout attrs and nested callout blocks', async ({ page }) => {
  await page.goto('/#/__dev/storage-p3')
  const result = await page.evaluate(async () => {
    const { IndexedDbLocalStore } = await import('/src/storage/indexedDbStore.ts')
    const dbName = `p72-callout-snapshot-${crypto.randomUUID()}`
    const store = await IndexedDbLocalStore.open(dbName)
    const stamp = new Date().toISOString()
    const pageMeta = { id: 'page', workspaceId: 'ws', parentPageId: null, orderKey: 'a', title: 'Page', updatedAt: stamp }
    const block = (id: string, type: string, parentBlockId: string | null, orderKey: string, node: unknown) => ({
      id, workspaceId: 'ws', pageId: 'page', parentBlockId, type, orderKey, props: { node }, createdAt: stamp, updatedAt: stamp,
    })
    const blocks = [
      block('toggle', 'toggle', null, '000000000000000000000000000100', { type: 'eotionToggle', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Summary' }] }] }),
      block('callout', 'callout', 'toggle', '000000000000000000000000000100', { type: 'eotionCallout', attrs: { icon: '📌', tone: 'info' }, content: [{ type: 'text', text: 'Stored child' }] }),
    ]
    try {
      await store.replaceWorkspaceSnapshot('ws', [pageMeta], blocks as any)
      store.close()
      const reopened = await IndexedDbLocalStore.open(dbName)
      const beforeOps = await reopened.getPendingOperations()
      let invalidSnapshotRejected = false
      try {
        await reopened.replaceWorkspaceSnapshot('ws', [pageMeta], [
          blocks[0],
          block('bad-callout', 'callout', 'toggle', '000000000000000000000000000200', { type: 'eotionCallout', attrs: { icon: '💡', tone: 'unsupported' }, content: [{ type: 'text', text: 'Unsafe' }] }),
        ] as any)
      } catch { invalidSnapshotRejected = true }
      let invalidAttrsRejected = false
      try {
        await reopened.upsertBlock(block('bad-callout', 'callout', null, '000000000000000000000000000200', { type: 'eotionCallout', attrs: { icon: '💡', tone: 'unsupported' }, content: [{ type: 'text', text: 'Unsafe' }] }) as any)
      } catch { invalidAttrsRejected = true }
      let childOwnerReplacementRejected = false
      try {
        const toggle = await reopened.getBlock('toggle')
        await reopened.upsertBlock({
          ...toggle!,
          type: 'callout',
          props: { node: { type: 'eotionCallout', attrs: { icon: '💡', tone: 'neutral' }, content: [{ type: 'text', text: 'Replacement' }] } },
        } as any)
      } catch { childOwnerReplacementRejected = true }
      const saved = await reopened.listBlocksByPage('page')
      const present = await reopened.hasWorkspaceSnapshot('ws')
      const afterOps = await reopened.getPendingOperations()
      reopened.close()
      return {
        present,
        invalidSnapshotRejected,
        invalidAttrsRejected,
        childOwnerReplacementRejected,
        noOperationsForRejectedWrites: afterOps.length === beforeOps.length,
        saved: saved.map((item) => ({ id: item.id, type: item.type, parentBlockId: item.parentBlockId, props: item.props })).sort((left, right) => left.id.localeCompare(right.id)),
      }
    } finally { store.close() }
  })
  expect(result).toEqual({
    present: true,
    invalidSnapshotRejected: true,
    invalidAttrsRejected: true,
    childOwnerReplacementRejected: true,
    noOperationsForRejectedWrites: true,
    saved: [
      { id: 'callout', type: 'callout', parentBlockId: 'toggle', props: { node: { type: 'eotionCallout', attrs: { icon: '📌', tone: 'info' }, content: [{ type: 'text', text: 'Stored child' }] } } },
      { id: 'toggle', type: 'toggle', parentBlockId: null, props: { node: { type: 'eotionToggle', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Summary' }] }] } } },
    ],
  })
})

test('code block language survives codec conversion, editing and reload', async ({ page }) => {
  const code = {
    id: 'code-language', pageId: 'page-a', workspaceId: workspace.id, parentBlockId: null, type: 'code', orderKey: '0000000000000001',
    props: { node: { type: 'codeBlock', attrs: { language: 'typescript' }, content: [{ type: 'text', text: 'const before = 1' }] } },
    createdAt: now, updatedAt: now,
  } as BlockResponse
  const api = await installApi(page, [code])
  await page.goto('/#/app/ws-a/page/page-a')
  await expect(page).toHaveURL(/#\/app\/ws-a\/page\/page-a$/)
  await expect(editor(page)).toBeVisible()
  const codecResult = await page.evaluate(async (seed) => {
    const { blocksToDocument, documentToBlocks } = await import('/src/editor/blockCodec.ts')
    const document = blocksToDocument([seed])
    const encoded = documentToBlocks(document, [seed], false)[0]
    return { attrs: (encoded?.props as any)?.node?.attrs, text: (encoded?.props as any)?.node?.content?.[0]?.text }
  }, code)
  expect(codecResult).toEqual({ attrs: { language: 'typescript' }, text: 'const before = 1' })
  const body = editor(page)
  const codeBlock = body.locator('pre')
  await expect(codeBlock).toContainText('const before = 1')
  await codeBlock.click()
  await page.keyboard.press('End')
  await page.keyboard.type('; // edited')
  await expect(codeBlock).toContainText('const before = 1; // edited')
  await expect.poll(() => JSON.stringify(api.blocks.find((item) => item.id === code.id)?.props.node), { timeout: 5000 }).toContain('; // edited')
  await expect.poll(() => JSON.stringify(api.blocks.find((item) => item.id === code.id)?.props.node), { timeout: 5000 }).toContain('"language":"typescript"')
  await expect(body.locator('pre')).toContainText('; // edited')
  await page.reload()
  await expect(editor(page).locator('pre')).toContainText('const before = 1; // edited')
  expect((api.blocks.find((item) => item.id === code.id)?.props.node as any).attrs).toEqual({ language: 'typescript' })
})
test('table codec round-trips one grid block and refuses grids the server would reject', async ({ page }) => {
  await page.goto('/#/__dev/editor-foundation')
  const result = await page.evaluate(async () => {
    const { blocksToDocument, documentToBlocks } = await import('/src/editor/blockCodec.ts')
    const stamp = new Date().toISOString()
    const cell = (type: string, text: string) => ({
      type,
      attrs: { colspan: 1, rowspan: 1, colwidth: null },
      content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
    })
    const tableNode = (rows: string[][]) => ({
      type: 'table',
      content: rows.map((cells, rowIndex) => ({ type: 'tableRow', content: cells.map((text) => cell(rowIndex === 0 ? 'tableHeader' : 'tableCell', text)) })),
    })
    const record = (id: string, type: string, node: unknown, parentBlockId: string | null, orderKey: string) =>
      ({ id, workspaceId: 'ws', pageId: 'page-1', parentBlockId, type, orderKey, props: { node }, createdAt: stamp, updatedAt: stamp })
    const stored = tableNode([['A', 'B'], ['C', 'D']])
    const table = record('table-1', 'table', stored, null, 'a')

    const document = blocksToDocument([table])
    const loaded = document.content![0] as any
    const encoded = documentToBlocks(document, [table], true)

    const toggle = record('toggle-1', 'toggle', { type: 'eotionToggle', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Parent' }] }] }, null, 'a')
    const nested = record('table-2', 'table', tableNode([['X']]), 'toggle-1', 'a')
    const nestedDecoded = documentToBlocks(blocksToDocument([toggle, nested]), [toggle, nested], true)
      .map((block) => ({ id: block.id, type: block.type, parentBlockId: block.parentBlockId }))

    const encodedNode = encoded[0]!.props.node
    // The web codec must enforce the same size budget the domain props validator
    // does, otherwise a large HTML paste could make a whole page unsaveable.
    const bigCell = (paragraphs: number) => ({ type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: Array.from({ length: paragraphs }, () => ({ type: 'paragraph' })) })
    const rowOf = (cells: number) => ({ type: 'tableRow', content: Array.from({ length: cells }, () => ({ type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph' }] })) })
    const tooManyRows = { type: 'table', content: Array.from({ length: 1001 }, () => rowOf(1)) }
    const tooManyCells = { type: 'table', content: [rowOf(201)] }
    const tooManyParagraphs = { type: 'table', content: [{ type: 'tableRow', content: [bigCell(101)] }] }
    const atRowLimit = { type: 'table', content: Array.from({ length: 1000 }, () => rowOf(1)) }
    const atCellLimit = { type: 'table', content: [rowOf(200)] }
    const atParagraphLimit = { type: 'table', content: [{ type: 'tableRow', content: [bigCell(100)] }] }
    // Stored props and re-encoded props may order object keys differently, so the
    // reload check compares the canonical shape instead of raw JSON text.
    const canonical = (value: any): any => Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === 'object'
        ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
        : value
    const stable = JSON.stringify(canonical(blocksToDocument(encoded.map((block) => ({ ...block, orderKey: 'a' }))))) === JSON.stringify(canonical(document))
    const rejects = (blocks: unknown[]) => { try { blocksToDocument(blocks as any); return false } catch { return true } }
    return {
      loaded: {
        type: loaded.type,
        id: loaded.attrs.blockId,
        rowTypes: loaded.content.map((row: any) => row.type),
        cellTypes: loaded.content[0].content.map((item: any) => item.type),
        paragraphTypes: loaded.content[0].content[0].content.map((item: any) => item.type),
      },
      encoded: encoded.map((block) => ({ id: block.id, type: block.type, parentBlockId: block.parentBlockId })),
      encodedNode,
      stable,
      nestedDecoded,
      rejects: {
        headingInCell: rejects([record('t', 'table', { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'heading', attrs: { level: 2 } }] }] }] }, null, 'a')]),
        emptyTable: rejects([record('t', 'table', { type: 'table', content: [] }, null, 'a')]),
        emptyRow: rejects([record('t', 'table', { type: 'table', content: [{ type: 'tableRow', content: [] }] }, null, 'a')]),
        cellWithoutParagraph: rejects([record('t', 'table', { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [] }] }] }, null, 'a')]),
        badSpan: rejects([record('t', 'table', { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', attrs: { colspan: 0 }, content: [{ type: 'paragraph' }] }] }] }, null, 'a')]),
        unknownCellAttr: rejects([record('t', 'table', { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', attrs: { align: 'left' }, content: [{ type: 'paragraph' }] }] }] }, null, 'a')]),
        nestedIdentity: rejects([record('t', 'table', { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', attrs: { blockId: 'inner' } }] }] }] }, null, 'a')]),
        childOnTable: rejects([record('t', 'table', tableNode([['A']]), null, 'a'), record('p', 'paragraph', { type: 'paragraph' }, 't', 'b')]),
        tooManyRows: rejects([record('t', 'table', tooManyRows, null, 'a')]),
        tooManyCells: rejects([record('t', 'table', tooManyCells, null, 'a')]),
        tooManyParagraphs: rejects([record('t', 'table', tooManyParagraphs, null, 'a')]),
      },
      acceptedAtLimits: [atRowLimit, atCellLimit, atParagraphLimit].map((node) => rejects([record('t', 'table', node, null, 'a')])),
    }
  })
  expect(result).toEqual({
    loaded: {
      type: 'table',
      id: 'table-1',
      rowTypes: ['tableRow', 'tableRow'],
      cellTypes: ['tableHeader', 'tableHeader'],
      paragraphTypes: ['paragraph'],
    },
    encoded: [{ id: 'table-1', type: 'table', parentBlockId: null }],
    encodedNode: {
      type: 'table',
      content: [
        { type: 'tableRow', content: [
          { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }] },
          { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }] },
        ] },
        { type: 'tableRow', content: [
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'C' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'D' }] }] },
        ] },
      ],
    },
    stable: true,
    nestedDecoded: [
      { id: 'toggle-1', type: 'toggle', parentBlockId: null },
      { id: 'table-2', type: 'table', parentBlockId: 'toggle-1' },
    ],
    rejects: {
      headingInCell: true,
      emptyTable: true,
      emptyRow: true,
      cellWithoutParagraph: true,
      badSpan: true,
      unknownCellAttr: true,
      nestedIdentity: true,
      childOnTable: true,
      tooManyRows: true,
      tooManyCells: true,
      tooManyParagraphs: true,
    },
    acceptedAtLimits: [false, false, false],
  })
})
