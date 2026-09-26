import { expect, test } from '@playwright/test'
import { resolve } from 'node:path'

const storageModuleUrl = `/@fs/${resolve('../..', 'packages/storage/src/index.ts').replaceAll('\\', '/')}`

test('IndexedDB content and operation log survive reopen, reject partial writes, and reconnect once', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/#/__dev/storage-p3')
  await expect(page.getByRole('heading', { name: 'P3 本地优先存储' })).toBeVisible()
  await expect(page.getByText('Web IndexedDB')).toBeVisible()
  await page.getByRole('button', { name: '创建 / 更新页面' }).click()
  await expect(page.getByRole('heading', { name: 'Pages' }).locator('..')).toContainText('p3-demo-page')
  await page.reload()
  await expect(page.getByText('Web IndexedDB')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pages' }).locator('..')).toContainText('p3-demo-page')

  const result = await page.evaluate(async (storageUrl) => {
    const { IndexedDbLocalStore } = await import('/src/storage/indexedDbStore.ts')
    const { createLocalId, reconnectPending } = await import(/* @vite-ignore */ storageUrl)
    const dbName = `p3-test-${createLocalId()}`
    let store = await IndexedDbLocalStore.open(dbName)
    const page = { id: 'p', title: 'First', updatedAt: new Date().toISOString() }
    const block = { id: 'b', pageId: 'p', type: 'paragraph' as const, orderKey: 'a', props: { text: 'hello' }, createdAt: page.updatedAt, updatedAt: page.updatedAt }
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
    await store.deleteBlock('b')
    await store.deletePage('p')
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
  await page.goto('/')

  const result = await page.evaluate(async (storageUrl) => {
    const { createLocalId, reconnectPending } = await import(/* @vite-ignore */ storageUrl)
    const { IndexedDbLocalStore } = await import('/src/storage/indexedDbStore.ts')
    const dbName = `p3-no-random-uuid-${createLocalId()}`
    let store = await IndexedDbLocalStore.open(dbName)
    const now = new Date().toISOString()
    const pageRecord = { id: createLocalId(), title: 'Offline page', updatedAt: now }
    const block = {
      id: createLocalId(), pageId: pageRecord.id, type: 'paragraph' as const,
      orderKey: 'a', props: { text: 'Offline block' }, createdAt: now, updatedAt: now,
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

test('mobile WebView marker selects the typed bridge instead of IndexedDB', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
    window.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return
      const request = JSON.parse(event.data)
      if (request.channel !== 'eotion.mobile.storage.v1') return
      window.__eotionMobileStorageReceive?.({
        channel: request.channel, kind: 'response', id: request.id, method: request.method,
        ok: false, error: { code: 'unavailable', message: 'test shell has no native storage' },
      })
    })
  })
  await page.goto('/?eotionRuntime=mobile-webview#/__dev/storage-p3')
  await expect(page.getByText('Mobile typed bridge (platform storage unavailable)')).toBeVisible()
  await expect(page.getByRole('status')).toContainText('unavailable')
})
