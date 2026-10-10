import { expect, test } from '@playwright/test'
import { resolve } from 'node:path'

const storageModuleUrl = `/@fs/${resolve('../..', 'packages/storage/src/index.ts').replaceAll('\\', '/')}`

test('IndexedDB navigation leaves record pages available for direct opening', async ({ page }) => {
  await page.goto('/#/__dev/storage-p3')
  const result = await page.evaluate(async () => {
    const { IndexedDbLocalStore } = await import('/src/storage/indexedDbStore.ts')
    const store = await IndexedDbLocalStore.open(`navigation-${crypto.randomUUID()}`)
    const now = '2026-01-01T00:00:00.000Z'
    const ordinary = { id: 'ordinary', workspaceId: 'ws', parentPageId: null, orderKey: 'a', title: 'Ordinary', updatedAt: now }
    const record = { id: 'record', workspaceId: 'ws', parentPageId: null, orderKey: 'b', title: 'Record', role: 'database-record' as const, updatedAt: now }
    try {
      await store.replaceWorkspaceSnapshot('ws', [ordinary, record], [])
      return { navigation: (await store.listNavigationPagesByWorkspace('ws')).map(page => page.id), all: (await store.listPagesByWorkspace('ws')).map(page => page.id), direct: (await store.getPage('record'))?.role }
    } finally { store.close() }
  })
  expect(result).toEqual({ navigation: ['ordinary'], all: ['ordinary', 'record'], direct: 'database-record' })
})

test('IndexedDB move and workspace hydrate preserve unrelated data and local operation identity', async ({ page }) => {
  await page.goto('/#/__dev/storage-p3')
  const result = await page.evaluate(async () => {
    const { IndexedDbLocalStore } = await import('/src/storage/indexedDbStore.ts')
    const name = `p5-hydrate-${crypto.randomUUID()}`
    const store = await IndexedDbLocalStore.open(name)
    const now = '2026-01-01T00:00:00.000Z'
    const record = (id: string, workspaceId: string, parentPageId: string | null = null) => ({ id, workspaceId, parentPageId, orderKey: 'a', title: id, updatedAt: now })
    try {
      await store.upsertPage(record('root', 'ws'))
      await store.upsertPage(record('child', 'ws', 'root'))
      await store.upsertPage(record('other', 'else'))
      await store.upsertPage(record('ephemeral', 'local-empty'))
      await store.deletePage('local-empty', 'ephemeral')
      const localEmptyPresent = await store.hasWorkspaceSnapshot('local-empty')
      const first = await store.getPendingOperations()
      let rejectedMove = 0
      for (const parent of ['root', 'child', 'other', 'missing']) {
        try { await store.movePage('ws', 'root', parent, 'b') } catch { rejectedMove += 1 }
      }
      const unchanged = (await store.getPendingOperations()).length === first.length && (await store.getPage('root'))?.orderKey === 'a'
      await store.movePage('ws', 'child', null, 'b')
      const moved = await store.getPendingOperations()
      let rejectedHydrate = false
      try { await store.replaceWorkspaceSnapshot('ws', [], []) } catch { rejectedHydrate = true }
      for (const op of moved.filter((op) => op.workspaceId === 'ws')) await store.markOperationSynced(op.id)
      let rejectedCollision = false
      try { await store.replaceWorkspaceSnapshot('ws', [record('other', 'ws')], []) } catch { rejectedCollision = true }
      await store.replaceWorkspaceSnapshot('ws', [record('server', 'ws')], [])
      const hydrated = (await store.listPagesByWorkspace('ws')).map((item) => item.id)
      const untouched = (await store.listPagesByWorkspace('else')).map((item) => item.id)
      await store.replaceWorkspaceSnapshot('ws', [], [])
      const emptyPresent = await store.hasWorkspaceSnapshot('ws')
      const neverPresent = await store.hasWorkspaceSnapshot('never')
      await store.upsertPage(record('later', 'ws'))
      const pending = await store.getPendingOperations()
      return { rejectedMove, unchanged, moveKind: moved.at(-1)?.kind, moveSequence: moved.at(-1)?.sequence, rejectedHydrate, rejectedCollision, hydrated, untouched, emptyPresent, localEmptyPresent, neverPresent, pendingSequence: pending.at(-1)?.sequence, sameClient: pending.at(-1)?.clientId === first[0]?.clientId }
    } finally { store.close() }
  })
  expect(result).toEqual({ rejectedMove: 4, unchanged: true, moveKind: 'page.move', moveSequence: 6, rejectedHydrate: true, rejectedCollision: true, hydrated: ['server'], untouched: ['other'], emptyPresent: true, localEmptyPresent: true, neverPresent: false, pendingSequence: 7, sameClient: true })
})

test('IndexedDB content and operation log survive reopen, reject partial writes, and reconnect once', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/#/__dev/storage-p3')
  await expect(page.getByRole('heading', { name: 'P3 本地优先存储' })).toBeVisible()
  await expect(page.getByText('IndexedDB')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Bridge diagnostics' })).toHaveCount(0)
  await page.getByRole('button', { name: '创建 / 更新页面' }).click()
  await expect(page.getByRole('heading', { name: 'Pages' }).locator('..')).toContainText('p3-demo-page')
  await page.reload()
  await expect(page.getByText('IndexedDB')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pages' }).locator('..')).toContainText('p3-demo-page')

  const result = await page.evaluate(async (storageUrl) => {
    const { IndexedDbLocalStore } = await import('/src/storage/indexedDbStore.ts')
    const { createLocalId, reconnectPending } = await import(/* @vite-ignore */ storageUrl)
    const dbName = `p3-test-${createLocalId()}`
    let store = await IndexedDbLocalStore.open(dbName)
    const page = { id: 'p', workspaceId: 'ws', parentPageId: null, orderKey: 'a', title: 'First', updatedAt: new Date().toISOString() }
    const block = { id: 'b', workspaceId: 'ws', pageId: 'p', parentBlockId: null, type: 'paragraph' as const, orderKey: 'a', props: { node: { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] } }, createdAt: page.updatedAt, updatedAt: page.updatedAt }
    await store.upsertPage(page)
    await store.upsertBlock(block)
    await store.upsertPage({ ...page, title: 'Updated' })
    store.close()
    store = await IndexedDbLocalStore.open(dbName)
    const persisted = (await store.getPage('p'))?.title === 'Updated' && (await store.listBlocksByPage('p')).length === 1
    const before = await store.getPendingOperations()
    let rejected = false
    try { await store.upsertBlock({ ...block, id: 'orphan', pageId: 'missing' }) } catch { rejected = true }
    const after = await store.getPendingOperations()
    const sent: string[] = []
    const offline = await reconnectPending(store, { async send() { throw new Error('offline') } })
    const onlineTransport = { async send(op: { id: string }) { sent.push(op.id) } }
    const [first, second] = await Promise.all([reconnectPending(store, onlineTransport), reconnectPending(store, onlineTransport)])
    const repeat = await reconnectPending(store, onlineTransport)
    const remaining = await store.getPendingOperations()
    await store.deleteBlock('ws', 'b')
    await store.deletePage('ws', 'p')
    const deleted = await store.getPage('p') === undefined && (await store.listBlocksByPage('p')).length === 0
    const deleteOps = await store.getPendingOperations()
    const other = await IndexedDbLocalStore.open(dbName)
    await store.markOperationSynced(deleteOps[0].id)
    await other.markOperationFailed(deleteOps[0].id)
    const noSyncedRegression = (await store.getPendingOperations()).length === 1
    other.close()
    store.close()
    const orderedStore = await IndexedDbLocalStore.open(`${dbName}-order`)
    await orderedStore.upsertPage(page)
    await orderedStore.upsertBlock({ ...block, id: 'lower', orderKey: 'a' })
    await orderedStore.upsertBlock({ ...block, id: 'upper', orderKey: 'B' })
    await orderedStore.upsertBlock({ ...block, id: 'bmp', orderKey: '\uE000' })
    await orderedStore.upsertBlock({ ...block, id: 'astral', orderKey: '\u{10000}' })
    const blockOrder = (await orderedStore.listBlocksByPage('p')).map((item) => item.id)
    orderedStore.close()
    return { persisted, rejected, before: before.map((op) => op.sequence), after: after.map((op) => op.sequence), offline, first, second, repeat, sent, remaining: remaining.length, deleted, deleteKinds: deleteOps.map((op) => op.kind), noSyncedRegression, blockOrder }
  }, storageModuleUrl)

  expect(result.persisted).toBe(true)
  expect(result.rejected).toBe(true)
  expect(result.before).toEqual([1, 2, 3])
  expect(result.after).toEqual([1, 2, 3])
  expect(result.offline).toEqual({ synced: 0, failed: 1 })
  expect(result.first).toEqual({ synced: 3, failed: 0 })
  expect(result.second).toEqual(result.first)
  expect(result.repeat).toEqual({ synced: 0, failed: 0 })
  expect(new Set(result.sent).size).toBe(3)
  expect(result.remaining).toBe(0)
  expect(result.deleted).toBe(true)
  expect(result.deleteKinds).toEqual(['block.delete', 'page.delete'])
  expect(result.noSyncedRegression).toBe(true)
  expect(result.blockOrder).toEqual(['upper', 'lower', 'bmp', 'astral'])
  expect(errors).toEqual([])
})

test('Page and Block creation works when crypto.randomUUID is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
  })
  await page.goto('/#/__dev/workspace')

  const result = await page.evaluate(async (storageUrl) => {
    const { createLocalId, reconnectPending } = await import(/* @vite-ignore */ storageUrl)
    const { IndexedDbLocalStore } = await import('/src/storage/indexedDbStore.ts')
    const dbName = `p3-no-random-uuid-${createLocalId()}`
    let store = await IndexedDbLocalStore.open(dbName)
    const now = new Date().toISOString()
    const pageRecord = { id: createLocalId(), workspaceId: 'ws', parentPageId: null, orderKey: 'a', title: 'Offline page', updatedAt: now }
    const block = {
      id: createLocalId(), workspaceId: 'ws', pageId: pageRecord.id, parentBlockId: null, type: 'paragraph' as const,
      orderKey: 'a', props: { node: { type: 'paragraph', content: [{ type: 'text', text: 'Offline block' }] } }, createdAt: now, updatedAt: now,
    }
    await store.upsertPage(pageRecord)
    await store.upsertBlock(block)
    const before = await store.getPendingOperations()
    store.close()

    store = await IndexedDbLocalStore.open(dbName)
    const savedPage = await store.getPage(pageRecord.id)
    const savedBlock = await store.getBlock(block.id)
    await reconnectPending(store, { async send() { throw new Error('offline') } })
    const afterFailure = await store.getPendingOperations()
    const sent: string[] = []
    await reconnectPending(store, { async send(operation) { sent.push(operation.id) } })
    store.close()

    return {
      randomUUID: typeof crypto.randomUUID,
      pageId: savedPage?.id,
      blockId: savedBlock?.id,
      expectedPageId: pageRecord.id,
      expectedBlockId: block.id,
      ids: before.map((operation) => operation.id),
      failedIds: afterFailure.map((operation) => operation.id),
      sent,
      clientIds: before.map((operation) => operation.clientId),
    }
  }, storageModuleUrl)

  expect(result.randomUUID).toBe('undefined')
  expect(result.pageId).toBe(result.expectedPageId)
  expect(result.blockId).toBe(result.expectedBlockId)
  expect(new Set([result.pageId, result.blockId, ...result.ids, ...result.clientIds]).size).toBe(5)
  expect(result.failedIds).toEqual(result.ids)
  expect(result.sent).toEqual(result.ids)
})

test('mobile WebView runtime uses the shared IndexedDB store without storage bridge requests', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
    ;(window as typeof window & { __storageBridgeRequests?: number }).__storageBridgeRequests = 0
    window.addEventListener('message', (event) => {
      if (typeof event.data === 'string' && event.data.includes('eotion.mobile.storage.v1')) {
        ;(window as typeof window & { __storageBridgeRequests: number }).__storageBridgeRequests += 1
      }
    })
  })

  await page.goto('/?eotionRuntime=mobile-webview#/__dev/storage-p3')
  await expect(page.getByText('Mobile WebView')).toBeVisible()
  await expect(page.getByText('IndexedDB')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Bridge diagnostics' })).toHaveCount(0)
  expect(await page.evaluate(async () => {
    const { createLocalStore } = await import('/src/storage/createLocalStore.ts')
    const selected = await createLocalStore()
    return { adapter: selected.adapter, storeType: selected.store.constructor.name }
  })).toEqual({ adapter: 'IndexedDB', storeType: 'IndexedDbLocalStore' })
  await page.getByRole('button', { name: '创建 / 更新页面' }).click()
  await expect(page.getByRole('heading', { name: 'Pages' }).locator('..')).toContainText('p3-demo-page')
  await page.getByRole('button', { name: '创建 / 更新区块' }).click()
  await expect(page.getByRole('heading', { name: 'Blocks by page' }).locator('..')).toContainText('p3-demo-block')
  await expect(page.getByRole('heading', { name: 'Pending / failed operations (2)' })).toBeVisible()
  expect(await page.evaluate(() => (window as typeof window & { __storageBridgeRequests: number }).__storageBridgeRequests)).toBe(0)

  await page.reload()
  await expect(page.getByText('Mobile WebView')).toBeVisible()
  await expect(page.getByText('IndexedDB')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pages' }).locator('..')).toContainText('p3-demo-page')
  await expect(page.getByRole('heading', { name: 'Blocks by page' }).locator('..')).toContainText('p3-demo-block')
  await expect(page.getByRole('heading', { name: 'Pending / failed operations (2)' })).toBeVisible()

  await page.goto('/#/__dev/storage-p3')
  await expect(page.locator('.p3-demo > p').first()).toContainText('Runtime: Web · Adapter: IndexedDB')
  await expect(page.getByText('IndexedDB')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pages' }).locator('..')).toContainText('p3-demo-page')
  await expect(page.getByRole('heading', { name: 'Blocks by page' }).locator('..')).toContainText('p3-demo-block')
})

test('P3 query helper reloads with the same origin, query context, hash route, and IndexedDB data', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?eotionRuntime=mobile-webview&existing=kept#/__dev/storage-p3')
  await expect(page.getByText('IndexedDB')).toBeVisible()
  await page.getByRole('button', { name: '创建 / 更新页面' }).click()
  await page.getByRole('button', { name: '创建 / 更新区块' }).click()
  await expect(page.getByRole('heading', { name: 'Pending / failed operations (2)' })).toBeVisible()

  const before = new URL(page.url())
  await Promise.all([
    page.waitForEvent('load'),
    page.getByRole('button', { name: '修改 Query 并 Reload' }).click(),
  ])
  const after = new URL(page.url())
  expect(after.origin).toBe(before.origin)
  expect(after.pathname).toBe(before.pathname)
  expect(after.hash).toBe(before.hash)
  expect(after.searchParams.get('eotionRuntime')).toBe('mobile-webview')
  expect(after.searchParams.get('existing')).toBe('kept')
  expect(after.searchParams.get('p3QueryTest')).toMatch(/^\d+$/)
  await expect(page.locator('.p3-url-info')).toContainText(`Origin: ${before.origin}`)
  await expect(page.locator('.p3-url-info')).toContainText(`Query: ${after.search}`)
  await expect(page.locator('.p3-url-info')).toContainText(`Hash: ${before.hash}`)
  await expect(page.getByText('Mobile WebView')).toBeVisible()
  await expect(page.getByText('IndexedDB')).toBeVisible()
  await page.getByRole('button', { name: '重新读取' }).click()
  await expect(page.getByRole('heading', { name: 'Pages' }).locator('..')).toContainText('p3-demo-page')
  await expect(page.getByRole('heading', { name: 'Blocks by page' }).locator('..')).toContainText('p3-demo-block')
  await expect(page.getByRole('heading', { name: 'Pending / failed operations (2)' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

  await Promise.all([
    page.waitForEvent('load'),
    page.getByRole('button', { name: '修改 Query 并 Reload' }).click(),
  ])
  const updated = new URL(page.url())
  expect(updated.origin).toBe(before.origin)
  expect(updated.pathname).toBe(before.pathname)
  expect(updated.hash).toBe(before.hash)
  expect(updated.searchParams.get('eotionRuntime')).toBe('mobile-webview')
  expect(updated.searchParams.get('existing')).toBe('kept')
  expect(updated.searchParams.getAll('p3QueryTest')).toHaveLength(1)
  expect(updated.searchParams.get('p3QueryTest')).not.toBe(after.searchParams.get('p3QueryTest'))
  await expect(page.getByRole('heading', { name: 'Pending / failed operations (2)' })).toBeVisible()
})

test('P3 clear data removes persisted content and oplog and restarts sequencing', async ({ page }) => {
  await page.goto('/#/__dev/storage-p3')
  await page.getByRole('button', { name: '创建 / 更新页面' }).click()
  await page.getByRole('button', { name: '创建 / 更新区块' }).click()
  await expect(page.getByRole('heading', { name: 'Pending / failed operations (2)' })).toBeVisible()

  await page.getByRole('button', { name: '清除数据' }).click()
  await expect(page.getByRole('status')).toHaveText('数据已清除')
  await expect(page.getByRole('heading', { name: 'Pages' }).locator('..')).not.toContainText('p3-demo-page')
  await expect(page.getByRole('heading', { name: 'Blocks by page' }).locator('..')).not.toContainText('p3-demo-block')
  await expect(page.getByRole('heading', { name: 'Pending / failed operations (0)' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Pending / failed operations (0)' })).toBeVisible()
  await page.getByRole('button', { name: '创建 / 更新页面' }).click()
  await expect(page.getByRole('heading', { name: 'Pending / failed operations (1)' }).locator('..')).toContainText('"sequence": 1')
})

test('P3 clear waits for an in-flight reconnect', async ({ page }) => {
  await page.goto('/#/__dev/storage-p3')
  await page.getByRole('button', { name: '创建 / 更新页面' }).click()
  await expect(page.getByRole('heading', { name: 'Pending / failed operations (1)' })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Offline' }).uncheck()
  await page.evaluate(async () => {
    const { createLocalStore } = await import('/src/storage/createLocalStore.ts')
    const { store } = await createLocalStore()
    const prototype = Object.getPrototypeOf(store)
    const original = prototype.markOperationSynced
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    ;(window as typeof window & { releaseP3Reconnect?: () => void }).releaseP3Reconnect = release
    prototype.markOperationSynced = async function (id: string) {
      await gate
      return original.call(this, id)
    }
  })
  await page.getByRole('button', { name: 'Reconnect（并发两次）' }).click()
  await expect(page.getByRole('button', { name: '清除数据' })).toBeDisabled()
  await page.evaluate(() => (window as typeof window & { releaseP3Reconnect: () => void }).releaseP3Reconnect())
  await expect(page.getByRole('button', { name: '清除数据' })).toBeEnabled()
  await page.getByRole('button', { name: '清除数据' }).click()
  await expect(page.getByRole('status')).toHaveText('数据已清除')
  await expect(page.getByRole('heading', { name: 'Fake transport sent IDs (0)' })).toBeVisible()
})

test('IndexedDB file cleanup waits for source sync, respects references, and survives v1 upgrade', async ({ page }) => {
  await page.goto('/#/__dev/storage-p3')
  const result = await page.evaluate(async () => {
    const { IndexedDbLocalStore } = await import('/src/storage/indexedDbStore.ts')
    const name = `file-cleanup-${crypto.randomUUID()}`
    const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1)
      request.onupgradeneeded = () => {
        const db = request.result
        db.createObjectStore('pages', { keyPath: 'id' })
        const blocks = db.createObjectStore('blocks', { keyPath: 'id' })
        blocks.createIndex('pageId', 'pageId')
        db.createObjectStore('operations', { keyPath: 'id' })
        db.createObjectStore('meta')
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const legacyPage = { id: 'legacy-page', workspaceId: 'ws', parentPageId: null, orderKey: 'a', title: 'Legacy', updatedAt: '2026-01-01T00:00:00.000Z' }
    const legacyBlock = { id: 'legacy-block', workspaceId: 'ws', pageId: 'legacy-page', parentBlockId: null, type: 'paragraph', orderKey: 'a', props: {}, createdAt: legacyPage.updatedAt, updatedAt: legacyPage.updatedAt }
    legacy.transaction(['pages', 'blocks', 'meta'], 'readwrite').objectStore('pages').put(legacyPage)
    legacy.transaction('blocks', 'readwrite').objectStore('blocks').put(legacyBlock)
    legacy.close()

    const store = await IndexedDbLocalStore.open(name)
    const migrated = (await store.getPage('legacy-page'))?.title === 'Legacy' && (await store.getBlock('legacy-block'))?.id === 'legacy-block'
    const now = new Date().toISOString()
    const pageRecord = { id: 'p', workspaceId: 'ws', parentPageId: null, orderKey: 'a', title: 'Page', updatedAt: now }
    const image = (id: string, fileId: string) => ({ id, workspaceId: 'ws', pageId: 'p', parentBlockId: null, type: 'image' as const, orderKey: id, props: { node: { type: 'eotionImage', attrs: { fileId, name: 'image.png', mimeType: 'image/png', size: 1, url: 'https://objects.example.test/image.png' } } }, createdAt: now, updatedAt: now })
    await store.upsertPage(pageRecord)
    await store.upsertBlock({ ...image('paragraph', 'ignored-file-id'), type: 'paragraph' as const, props: { node: { type: 'paragraph' } } })
    await store.deleteBlock('ws', 'paragraph')
    const paragraphNoCleanup = (await store.listFileCleanups()).length === 0
    await store.upsertBlock(image('b1', 'shared-file'))
    await store.upsertBlock(image('bShared', 'shared-file'))
    await store.upsertBlock(image('b2', 'page-file-a'))
    await store.upsertBlock(image('b3', 'page-file-b'))
    for (const operation of await store.getPendingOperations()) await store.markOperationSynced(operation.id)
    await store.deleteBlock('ws', 'b1')
    const deleteBlockOp = (await store.getPendingOperations()).at(-1)!
    const beforeAck = await store.listReadyFileCleanups()
    await store.markOperationSynced(deleteBlockOp.id)
    const referenced = await store.listReadyFileCleanups()
    await store.deleteBlock('ws', 'bShared')
    await store.markOperationSynced((await store.getPendingOperations()).at(-1)!.id)
    const afterRemoved = await store.listReadyFileCleanups()
    await store.failFileCleanup('ws', 'shared-file', 'offline')
    const error = (await store.listFileCleanups()).find((item) => item.fileId === 'shared-file')?.lastError
    await store.completeFileCleanup('ws', 'shared-file')
    await store.upsertBlock(image('replace', 'replace-file'))
    await store.upsertBlock({ ...image('replace', ''), type: 'paragraph', props: { node: { type: 'paragraph', content: [{ type: 'text', text: 'replaced' }] } } })
    const replaceOp = (await store.getPendingOperations()).at(-1)!
    const replaceGate = (await store.listFileCleanups()).find((item) => item.fileId === 'replace-file')
    await store.markOperationSynced((await store.getPendingOperations()).at(-1)!.id)
    const replacementReady = await store.listReadyFileCleanups()
    await store.upsertBlock(image('b4', 'page-file-c'))
    for (const operation of await store.getPendingOperations()) await store.markOperationSynced(operation.id)
    await store.deletePage('ws', 'p')
    const pageDelete = (await store.getPendingOperations()).at(-1)!
    const pageTasks = (await store.listFileCleanups()).filter((item) => item.fileId.startsWith('page-file-'))
    const pageBeforeAck = (await store.listReadyFileCleanups()).filter((item) => item.fileId.startsWith('page-file-'))
    await store.markOperationSynced(pageDelete.id)
    const pageReady = (await store.listReadyFileCleanups()).filter((item) => item.fileId.startsWith('page-file-'))
    await store.enqueueFileCleanup('ws', 'compensate')
    await store.enqueueFileCleanup('ws', 'compensate')
    await store.enqueueFileCleanup('else', 'compensate')
    const compensation = (await store.listReadyFileCleanups()).filter((item) => item.fileId === 'compensate')
    await store.clearAllData()
    const cleared = await store.listFileCleanups()
    store.close()
    return { migrated, paragraphNoCleanup, beforeAck: beforeAck.map((item) => item.fileId), referenced: referenced.map((item) => item.fileId), afterRemoved: afterRemoved.map((item) => item.fileId), error, replaceSource: replaceGate?.sourceOperationId, replaceExpected: replaceOp.id, replacementReady: replacementReady.some((item) => item.fileId === 'replace-file'), pageTasks: pageTasks.map((item) => item.fileId).sort(), pageBeforeAck: pageBeforeAck.map((item) => item.fileId), pageReady: pageReady.map((item) => item.fileId).sort(), compensation: compensation.map((item) => item.workspaceId).sort(), cleared }
  })

  expect(result.migrated).toBe(true)
  expect(result.paragraphNoCleanup).toBe(true)
  expect(result.beforeAck).toEqual([])
  expect(result.referenced).toEqual([])
  expect(result.afterRemoved).toEqual(['shared-file'])
  expect(result.error).toBe('offline')
  expect(result.replaceSource).toBe(result.replaceExpected)
  expect(result.replacementReady).toBe(true)
  expect(result.pageTasks).toEqual(['page-file-a', 'page-file-b', 'page-file-c'])
  expect(result.pageBeforeAck).toEqual([])
  expect(result.pageReady).toEqual(['page-file-a', 'page-file-b', 'page-file-c'])
  expect(result.compensation).toEqual(['else', 'ws'])
  expect(result.cleared).toEqual([])
})
