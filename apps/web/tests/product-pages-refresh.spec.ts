import { expect, test } from '@playwright/test'

test('refreshes a product pages load serially when sync revisions arrive during hydration', async ({ page }) => {
  await page.route('**/api/**', route => route.abort())
  await page.goto('/')

  const result = await page.evaluate(async () => {
    const { watch } = await import('/node_modules/.vite/deps/vue.js')
    const { IndexedDbLocalStore } = await import('/src/storage/indexedDbStore.ts')
    const { useProductPagesStore } = await import('/src/stores/productPages.ts')
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')

    const databaseName = `eotion-product-pages-refresh-${crypto.randomUUID()}`
    const workspaceId = 'refresh-workspace'
    const stamp = '2026-10-11T00:00:00.000Z'
    const deferred = <T = void>() => {
      let resolve!: (value: T) => void
      const promise = new Promise<T>(done => { resolve = done })
      return { promise, resolve }
    }
    const assert = (condition: boolean, message: string) => {
      if (!condition) throw new Error(message)
    }
    const waitFor = async (condition: () => boolean, message: string) => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (condition()) return
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      }
      throw new Error(message)
    }
    const deleteDatabase = (name: string) => new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error(`IndexedDB database is blocked: ${name}`))
    })

    const pages = useProductPagesStore()
    const sync = useProductSyncStore()
    const store = await IndexedDbLocalStore.open(databaseName)
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const tx = database.transaction('pages', 'readwrite')
    const pageRows = tx.objectStore('pages')
    const fixtureRows: Array<Record<string, unknown>> = []
    const orderKey = (value: number) => String(value).padStart(16, '0')
    for (let index = 0; index < 10_050; index += 1) {
      const isRecord = index >= 50
      const row = {
        id: `${isRecord ? 'record' : 'page'}-${index}`,
        workspaceId,
        parentPageId: null,
        title: `${isRecord ? 'Record' : 'Page'} ${index}`,
        orderKey: orderKey(index),
        createdAt: stamp,
        updatedAt: stamp,
      }
      fixtureRows.push(row)
      pageRows.put(row)
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('Fixture seed transaction aborted'))
    })
    database.close()

    sync.prepare = async () => true
    sync.store = async () => store
    const originalPages = store.listPagesByWorkspace.bind(store)
    const originalNavigation = store.listNavigationPagesByWorkspace.bind(store)
    const gates = [deferred(), deferred()]
    const entered = [deferred(), deferred()]
    let pageReads = 0
    let navigationReads = 0
    let firstReadNavigationCount = 0
    store.listPagesByWorkspace = async (id: string) => {
      if (!readingNavigation) pageReads += 1
      const rows = await originalPages(id)
      return rows
    }
    let readingNavigation = false
    store.listNavigationPagesByWorkspace = async (id: string) => {
      navigationReads += 1
      readingNavigation = true
      let rows
      try { rows = await originalNavigation(id) } finally { readingNavigation = false }
      if (navigationReads === 1) firstReadNavigationCount = rows.length
      const pair = navigationReads - 1
      if (pair < gates.length) {
        entered[pair]!.resolve()
        await gates[pair]!.promise
      }
      return rows
    }

    const stopWatching = watch(() => sync.revision, () => { void pages.refresh() }, { flush: 'sync' })
    try {
      const loading = pages.load(workspaceId)
      await entered[0]!.promise
      const readCountsBeforeReuse = { pageReads, navigationReads }
      const reusedLoading = pages.load(workspaceId)
      assert(pageReads === readCountsBeforeReuse.pageReads && navigationReads === readCountsBeforeReuse.navigationReads,
        'same-workspace in-flight load started duplicate reads')
      assert(firstReadNavigationCount === 10_050,
        `expected the first gated navigation read to contain 10050 roleless records, got ${firstReadNavigationCount}`)

      // Simulate a snapshot replacing legacy roleless records with database-record rows.
      await store.replaceWorkspaceSnapshot(workspaceId, fixtureRows.map(row =>
        String(row.id).startsWith('record-') ? { ...row, role: 'database-record' } as any : row as any,
      ), [])

      // Multiple sync revisions coalesce into one serialized follow-up read.
      sync.revision += 1
      sync.revision += 1
      sync.revision += 1
      gates[0]!.resolve()
      await waitFor(() => navigationReads >= 2, 'the queued refresh did not start a second paired read')
      await entered[1]!.promise

      // A revision during the trailing read must schedule another serialized pass.
      sync.revision += 1
      gates[1]!.resolve()
      await loading
      await reusedLoading
      await waitFor(() => !pages.loading, 'pages store remained loading after refresh completed')

      const normalReadCounts = { pageReads, navigationReads }
      await pages.load(workspaceId)
      assert(pageReads === normalReadCounts.pageReads && navigationReads === normalReadCounts.navigationReads,
        'a normal already-loaded load performed extra IndexedDB reads')
      assert(pages.loaded, 'pages store did not finish loading')
      assert(pages.items.length === 10_050, `expected 10050 directly openable pages, got ${pages.items.length}`)
      assert((pages.pageById('record-10049') as any)?.role === 'database-record', 'direct page lookup lost the database record role')
      assert(pages.navigationItems.length === 50, `expected 50 navigation pages, got ${pages.navigationItems.length}`)
      assert(pageReads === 3 && navigationReads === 3,
        `expected three serialized paired reads, got ${pageReads} page and ${navigationReads} navigation reads`)
      return { itemCount: pages.items.length, navigationCount: pages.navigationItems.length, pageReads, navigationReads }
    } finally {
      stopWatching()
      pages.reset()
      store.close()
      await deleteDatabase(databaseName)
    }
  })

  expect(result).toEqual({ itemCount: 10_050, navigationCount: 50, pageReads: 3, navigationReads: 3 })
})

test('stale product pages loads cannot overwrite a newer workspace or a reset store', async ({ page }) => {
  await page.route('**/api/**', route => route.abort())
  await page.goto('/')

  const result = await page.evaluate(async () => {
    const { IndexedDbLocalStore } = await import('/src/storage/indexedDbStore.ts')
    const { useProductPagesStore } = await import('/src/stores/productPages.ts')
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    const databaseName = `eotion-product-pages-fence-${crypto.randomUUID()}`
    const stamp = '2026-10-11T00:00:00.000Z'
    let releaseOld!: () => void
    const gate = new Promise<void>(resolve => { releaseOld = resolve })
    let oldReadEntered!: () => void
    const oldEntered = new Promise<void>(resolve => { oldReadEntered = resolve })
    const deleteDatabase = (name: string) => new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error(`IndexedDB database is blocked: ${name}`))
    })
    const pages = useProductPagesStore()
    const sync = useProductSyncStore()
    const store = await IndexedDbLocalStore.open(databaseName)
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const tx = database.transaction('pages', 'readwrite')
    tx.objectStore('pages').put({ id: 'old-page', workspaceId: 'old', parentPageId: null, title: 'Old', orderKey: '1', createdAt: stamp, updatedAt: stamp })
    tx.objectStore('pages').put({ id: 'new-page', workspaceId: 'new', parentPageId: null, title: 'New', orderKey: '1', createdAt: stamp, updatedAt: stamp })
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    database.close()
    sync.prepare = async () => true
    sync.store = async () => store
    const originalNavigation = store.listNavigationPagesByWorkspace.bind(store)
    const navigationReads = new Map<string, number>()
    store.listNavigationPagesByWorkspace = async (id: string) => {
      navigationReads.set(id, (navigationReads.get(id) ?? 0) + 1)
      const rows = await originalNavigation(id)
      if (id === 'old') { oldReadEntered(); await gate }
      return rows
    }
    try {
      const oldLoad = pages.load('old')
      await oldEntered
      await pages.refresh('old')
      await pages.load('new')
      releaseOld()
      await oldLoad
      const afterWorkspaceSwitch = { workspaceId: pages.forWorkspaceId, titles: pages.items.map(item => item.title), loading: pages.loading }
      const switchReadCounts = { old: navigationReads.get('old') ?? 0, new: navigationReads.get('new') ?? 0 }

      pages.reset()
      let releaseReset!: () => void
      let resetReadEntered!: () => void
      const resetEntered = new Promise<void>(resolve => { resetReadEntered = resolve })
      const resetGate = new Promise<void>(resolve => { releaseReset = resolve })
      store.listNavigationPagesByWorkspace = async (id: string) => {
        const rows = await originalNavigation(id)
        if (id === 'old') { resetReadEntered(); await resetGate }
        return rows
      }
      const resetLoad = pages.load('old')
      await resetEntered
      await pages.refresh('old')
      pages.reset()
      releaseReset()
      await resetLoad
      return {
        afterWorkspaceSwitch,
        switchReadCounts,
        afterReset: { workspaceId: pages.forWorkspaceId, itemCount: pages.items.length, loading: pages.loading },
      }
    } finally {
      pages.reset()
      store.close()
      await deleteDatabase(databaseName)
    }
  })

  expect(result.afterWorkspaceSwitch).toEqual({ workspaceId: 'new', titles: ['New'], loading: false })
  expect(result.switchReadCounts).toEqual({ old: 1, new: 1 })
  expect(result.afterReset).toEqual({ workspaceId: '', itemCount: 0, loading: false })
})
