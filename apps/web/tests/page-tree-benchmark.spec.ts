import { expect, test } from '@playwright/test'

type Mode = 'new-role' | 'legacy-raw-roleless' | 'legacy-server-projected'

type Measurement = { minMs: number; medianMs: number; maxMs: number }

type BenchmarkRow = {
  mode: Mode
  records: number
  workspacePageCount: number
  directLocalRead: Measurement
  navigationProjection: Measurement
  productPagesHydration: Measurement
  pageTreeBuildAndFlatten: Measurement
  directReadMaterializedCount: number
  navigationProjectionReadInCount: number
  navigationResultCount: number
  hydrationReadInCount: number
  hydrationResultMaterializedCount: number
  finalTreeItemCount: number
  rolePreservedRecordCount: number
}

test('IndexedDB workspace pages and PageTree benchmark (isolated fixtures)', async ({ page }) => {
  // This test only uses random, task-owned databases. API requests are blocked;
  // ProductPagesStore.prepare/store are replaced with ready state and this fixture.
  await page.route('**/api/**', route => route.abort())
  await page.goto('/')

  const report = await page.evaluate(async () => {
    const { IndexedDbLocalStore } = await import('/src/storage/indexedDbStore.ts')
    const { useProductPagesStore } = await import('/src/stores/productPages.ts')
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    const { buildPageTree, flattenPageTree } = await import('/src/utils/pageTree.ts')

    const workspaceId = 'page-tree-benchmark-workspace'
    const pageCount = 50
    const recordSizes = [0, 1_000, 5_000, 10_000]
    const modes = ['new-role', 'legacy-raw-roleless', 'legacy-server-projected'] as const
    const stamp = '2026-10-11T00:00:00.000Z'
    const orderKey = (value: number) => String(value).padStart(16, '0')
    const assert = (condition: boolean, message: string) => {
      if (!condition) throw new Error(message)
    }
    const summarize = (samples: number[]): Measurement => {
      const sorted = [...samples].sort((a, b) => a - b)
      return {
        minMs: Number(sorted[0]!.toFixed(3)),
        medianMs: Number(sorted[Math.floor(sorted.length / 2)]!.toFixed(3)),
        maxMs: Number(sorted.at(-1)!.toFixed(3)),
      }
    }
    const deleteDatabase = (name: string) => new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error(`Isolated benchmark database is blocked: ${name}`))
    })

    const piniaPages = useProductPagesStore()
    const sync = useProductSyncStore()
    const rows: BenchmarkRow[] = []

    for (const mode of modes) {
      for (const recordCount of recordSizes) {
        const databaseName = `eotion-page-tree-benchmark-${crypto.randomUUID()}`
        const store = await IndexedDbLocalStore.open(databaseName)
        // Seed through IndexedDB directly to avoid generating 10k oplog writes.
        // All measured reads below go through the production adapter methods.
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(databaseName)
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
        const tx = database.transaction('pages', 'readwrite')
        const pages = tx.objectStore('pages')
        for (let index = 0; index < pageCount + recordCount; index += 1) {
          const isRecord = index >= pageCount
          const record: Record<string, unknown> = {
            id: `${isRecord ? 'record' : 'page'}-${index}`,
            workspaceId,
            parentPageId: null,
            orderKey: orderKey(index),
            title: `${isRecord ? 'Record' : 'Page'} ${index}`,
            createdAt: stamp,
            updatedAt: stamp,
          }
          if (isRecord && mode !== 'legacy-raw-roleless') record.role = 'database-record'
          pages.put(record)
        }
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
          tx.onabort = () => reject(tx.error ?? new Error('Benchmark seed transaction aborted'))
        })
        database.close()

        sync.prepare = async () => true
        sync.store = async () => store
        piniaPages.reset()

        const fullReadSamples: number[] = []
        const navigationSamples: number[] = []
        const hydrationSamples: number[] = []
        const treeSamples: number[] = []
        let navigationResultCount = 0
        let hydrationResultMaterializedCount = 0
        let finalTreeItemCount = 0
        let rolePreservedRecordCount = 0

        for (let run = 0; run < 3; run += 1) {
          let start = performance.now()
          const allPages = await store.listPagesByWorkspace(workspaceId)
          fullReadSamples.push(performance.now() - start)
          assert(allPages.length === pageCount + recordCount, `Expected ${pageCount + recordCount} direct local pages, got ${allPages.length}`)

          start = performance.now()
          const navigationPages = await store.listNavigationPagesByWorkspace(workspaceId)
          navigationSamples.push(performance.now() - start)
          navigationResultCount = navigationPages.length

          rolePreservedRecordCount = allPages.filter(item =>
            item.id.startsWith('record-') && item.role === 'database-record',
          ).length

          start = performance.now()
          await piniaPages.load(workspaceId, true)
          hydrationSamples.push(performance.now() - start)
          assert(piniaPages.loaded, 'ProductPagesStore.load did not mark the fixture loaded')
          assert(piniaPages.items.length === pageCount + recordCount, `Unexpected hydration item count: ${piniaPages.items.length}`)
          hydrationResultMaterializedCount = piniaPages.items.length + piniaPages.navigationItems.length

          start = performance.now()
          const tree = buildPageTree(piniaPages.navigationItems)
          const flattened = flattenPageTree(tree, new Set(piniaPages.navigationItems.map(item => item.id)))
          treeSamples.push(performance.now() - start)
          finalTreeItemCount = flattened.length
        }

        const expectedNavigationCount = mode === 'legacy-raw-roleless' ? pageCount + recordCount : pageCount
        assert(navigationResultCount === expectedNavigationCount, `${mode} returned ${navigationResultCount} navigation rows; expected ${expectedNavigationCount}`)
        assert(finalTreeItemCount === expectedNavigationCount, `${mode} flattened ${finalTreeItemCount} rows; expected ${expectedNavigationCount}`)
        assert(rolePreservedRecordCount === (mode === 'legacy-raw-roleless' ? 0 : recordCount), `${mode} role preservation count mismatch`)

        rows.push({
          mode,
          records: recordCount,
          workspacePageCount: pageCount + recordCount,
          directLocalRead: summarize(fullReadSamples),
          navigationProjection: summarize(navigationSamples),
          productPagesHydration: summarize(hydrationSamples),
          pageTreeBuildAndFlatten: summarize(treeSamples),
          // Both adapter calls read/materialize all workspace rows; the nav call
          // then filters its returned array. ProductPages.load performs both calls.
          directReadMaterializedCount: pageCount + recordCount,
          navigationProjectionReadInCount: pageCount + recordCount,
          navigationResultCount,
          hydrationReadInCount: (pageCount + recordCount) * 2,
          hydrationResultMaterializedCount,
          finalTreeItemCount,
          rolePreservedRecordCount,
        })

        piniaPages.reset()
        store.close()
        await deleteDatabase(databaseName)
      }
    }

    return {
      browser: navigator.userAgent,
      runsPerMeasurement: 3,
      pageReadyLatency: 'unavailable: this page is only a benchmark harness; no product UI ready event is measured.',
      rows,
    }
  })

  console.log(`PAGE_TREE_BENCHMARK ${JSON.stringify(report)}`)
  expect(report.rows).toHaveLength(12)
  expect(report.pageReadyLatency).toContain('unavailable')
})
