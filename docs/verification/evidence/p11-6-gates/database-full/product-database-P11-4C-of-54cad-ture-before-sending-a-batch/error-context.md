# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: product-database.spec.ts >> P11.4C offline and changed view config reject a prepared gesture before sending a batch
- Location: tests\product-database.spec.ts:5343:1

# Error details

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator:  locator('#database-block-p114b-depends-on-block').getByTestId('database-timeline').locator('[data-testid="timeline-bar"][data-record-id="p114b-a"]')
Expected: "dragging"
Received: "idle"
Timeout:  5000ms

Call log:
  - Expect "toHaveAttribute" locator('#database-block-p114b-depends-on-block').getByTestId('database-timeline').locator('[data-testid="timeline-bar"][data-record-id="p114b-a"]') with timeout 5000ms
  - waiting for locator('#database-block-p114b-depends-on-block').getByTestId('database-timeline').locator('[data-testid="timeline-bar"][data-record-id="p114b-a"]')
    14 × locator resolved to <button type="button" aria-busy="false" data-kind="point" data-v-86fc7b45="" data-marker="true" data-saving="false" aria-pressed="false" data-draggable="true" data-drag-state="idle" data-record-id="p114b-a" data-testid="timeline-bar" data-interaction-phase="idle" title="Alpha · 2026-10-13 · 2026-10-13" aria-label="Alpha · 2026-10-13 · 2026-10-13" class="eotion-timeline-bar eotion-timeline-bar--marker is-draggable">…</button>
       - unexpected value "idle"

```

```yaml
- button "Alpha · 2026-10-13 · 2026-10-13": Alpha 2026-10-13
```

# Test source

```ts
  5252 |           const bar = timeline.locator('[data-testid="timeline-bar"][data-record-id="p114b-a"]')
  5253 |           const bounds = await bar.boundingBox()
  5254 |           if (!bounds) throw new Error('Expected P11.4D read-only Date bar')
  5255 |           await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  5256 |           await page.mouse.down()
  5257 |           await page.mouse.move(bounds.x + bounds.width / 2 + pxPerMs('month') * 4 * 86_400_000, bounds.y + bounds.height / 2, { steps: 4 })
  5258 |           await page.mouse.up()
  5259 |         } else {
  5260 |           await expect(timeline.locator('[data-testid="timeline-dependency-handle"]')).toHaveCount(0)
  5261 |         }
  5262 |         await expect.poll(() => p114cBatchPosts(api).length).toBe(1)
  5263 |       }
  5264 |     })
  5265 |   }
  5266 | }
  5267 | 
  5268 | for (const action of ['active Date', 'Dependency create'] as const) {
  5269 |   test(`P11.4D ${action} keeps the confirmed non-commit message when canonical refresh fails`, async ({ page }) => {
  5270 |     const { timeline, api } = await p114bFixture(page, 'depends-on', undefined, { cellBatchMutationOutcome: 'not_committed' }, 'shift_when_overlapping')
  5271 |     const databaseBlock = page.locator('#database-block-p114b-depends-on-block')
  5272 |     api.failTableLoads = 1
  5273 |     if (action === 'active Date') {
  5274 |       const bar = timeline.locator('[data-testid="timeline-bar"][data-record-id="p114b-a"]')
  5275 |       await dragTimelineBar(page, bar, pxPerMs('month') * 4 * 86_400_000)
  5276 |     } else {
  5277 |       await p114bConnect(page, timeline, 'p114b-a', 'p114b-b')
  5278 |       await page.mouse.up()
  5279 |     }
  5280 |     await expect.poll(() => p114cBatchPosts(api).length).toBe(1)
  5281 |     await expect(databaseBlock.getByRole('alert').filter({ hasText: '提交结果已确认未执行，但刷新未完成，请重新加载。' })).toHaveCount(1)
  5282 |     if (action === 'active Date') {
  5283 |       const bar = timeline.locator('[data-testid="timeline-bar"][data-record-id="p114b-a"]')
  5284 |       const bounds = await bar.boundingBox()
  5285 |       if (!bounds) throw new Error('Expected P11.4D stale Date bar')
  5286 |       await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  5287 |       await page.mouse.down()
  5288 |       await page.mouse.move(bounds.x + bounds.width / 2 + pxPerMs('month') * 4 * 86_400_000, bounds.y + bounds.height / 2, { steps: 4 })
  5289 |       await page.mouse.up()
  5290 |     } else {
  5291 |       await expect(timeline.locator('[data-testid="timeline-dependency-handle"]')).toHaveCount(0)
  5292 |     }
  5293 |     await expect.poll(() => p114cBatchPosts(api).length).toBe(1)
  5294 |     expect(p114cBatchPosts(api)).toHaveLength(1)
  5295 |     expect(p114cCellPatches(api)).toHaveLength(0)
  5296 |   })
  5297 | }
  5298 | 
  5299 | for (const action of ['active Date', 'Dependency create'] as const) {
  5300 | test(`P11.4D ${action} confirmed non-commit cannot report into a changed view scope`, async ({ page }) => {
  5301 |   const { timeline, api, timelineView } = await p114bFixture(page, 'depends-on', undefined, { cellBatchMutationOutcome: 'not_committed' }, 'shift_when_overlapping')
  5302 |   let signalRefreshStarted!: () => void
  5303 |   let releaseRefresh!: () => void
  5304 |   const refreshStarted = new Promise<void>(resolve => { signalRefreshStarted = resolve })
  5305 |   const refreshGate = new Promise<void>(resolve => { releaseRefresh = resolve })
  5306 |   await page.route(url => url.pathname.endsWith(`/views/${timelineView.id}/table`) && url.searchParams.get('limit') === '25', async route => {
  5307 |     signalRefreshStarted()
  5308 |     await refreshGate
  5309 |     await route.fallback()
  5310 |   })
  5311 |   if (action === 'active Date') {
  5312 |     const bar = timeline.locator('[data-testid="timeline-bar"][data-record-id="p114b-a"]')
  5313 |     await dragTimelineBar(page, bar, pxPerMs('month') * 4 * 86_400_000)
  5314 |   } else {
  5315 |     await p114bConnect(page, timeline, 'p114b-a', 'p114b-b')
  5316 |     await page.mouse.up()
  5317 |   }
  5318 |   await expect.poll(() => p114cBatchPosts(api).length).toBe(1)
  5319 |   await refreshStarted
  5320 |   await page.evaluate((targetViewId) => {
  5321 |     const root = document.querySelector('.eotion-editor') as (Element & { __vueParentComponent?: { exposed?: { editor?: any } } }) | null
  5322 |     const exposedEditor = root?.__vueParentComponent?.exposed?.editor
  5323 |     const editor = exposedEditor?.commands ? exposedEditor : exposedEditor?.value
  5324 |     if (!editor?.view) throw new Error('Expected active Tiptap editor')
  5325 |     let position = -1
  5326 |     let attrs: Record<string, unknown> | undefined
  5327 |     editor.state.doc.descendants((node: { type: { name: string }; attrs: Record<string, unknown> }, nodePosition: number) => {
  5328 |       if (position < 0 && node.type.name === 'eotionDatabase') { position = nodePosition; attrs = node.attrs }
  5329 |     })
  5330 |     if (position < 0 || !attrs) throw new Error('Expected database node')
  5331 |     editor.view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, { ...attrs, viewId: targetViewId }))
  5332 |   }, 'p114b-depends-on-table-view')
  5333 |   releaseRefresh()
  5334 |   const databaseBlock = page.locator('#database-block-p114b-depends-on-block')
  5335 |   await expect(databaseBlock).toHaveAttribute('data-view-id', 'p114b-depends-on-table-view')
  5336 |   await expect(databaseBlock.locator('table')).toBeVisible()
  5337 |   await expect(databaseBlock.getByRole('alert')).toHaveCount(0)
  5338 |   expect(p114cBatchPosts(api)).toHaveLength(1)
  5339 |   expect(p114cCellPatches(api)).toHaveLength(0)
  5340 | })
  5341 | }
  5342 | 
  5343 | test('P11.4C offline and changed view config reject a prepared gesture before sending a batch', async ({ page }) => {
  5344 |   const { timeline, api, timelineView } = await p114bFixture(page, 'depends-on', undefined, {}, 'shift_when_overlapping')
  5345 |   const bar = timeline.locator('[data-testid="timeline-bar"][data-record-id="p114b-a"]')
  5346 |   const gesture = async (deltaDays: number) => {
  5347 |     const bounds = await bar.boundingBox()
  5348 |     if (!bounds) throw new Error('Expected P11.4C fence bar')
  5349 |     await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  5350 |     await page.mouse.down()
  5351 |     await page.mouse.move(bounds.x + bounds.width / 2 + pxPerMs('month') * deltaDays * 86_400_000, bounds.y + bounds.height / 2, { steps: 5 })
> 5352 |     await expect(bar).toHaveAttribute('data-drag-state', 'dragging')
       |                       ^ Error: expect(locator).toHaveAttribute(expected) failed
  5353 |   }
  5354 |   await gesture(4)
  5355 |   await page.context().setOffline(true)
  5356 |   await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  5357 |   await expect(bar).toHaveAttribute('data-drag-state', 'idle')
  5358 |   await page.mouse.up()
  5359 |   expect(p114cBatchPosts(api)).toHaveLength(0)
  5360 |   await page.context().setOffline(false)
  5361 |   await page.evaluate(() => window.dispatchEvent(new Event('online')))
  5362 |   await gesture(4)
  5363 |   api.databases[0]!.version += 1
  5364 |   api.views.find(item => item.id === timelineView.id)!.version += 1
  5365 |   await page.mouse.up()
  5366 |   await expect.poll(() => p114cBatchPosts(api).length).toBe(1)
  5367 |   expect(p114cCellPatches(api)).toHaveLength(0)
  5368 |   expect(api.databases[0]?.version).toBe(2)
  5369 |   expect(api.records.find(item => item.id === 'p114b-a')?.properties['root-date']).toBe('2026-10-13')
  5370 | })
  5371 | 
  5372 | test('P11.3B resize handles remain hittable at the native Timeline viewport edges', async ({ page }) => {
  5373 |   await page.setViewportSize({ width: 1440, height: 900 })
  5374 |   await page.clock.setFixedTime(new Date('2026-10-13T00:00:00.000Z'))
  5375 |   const date = property('p113b-edge-date', rootDatabase.id, 'Date', 'date')
  5376 |   const timelineView = view('p113b-edge-view', rootDatabase.id, 'Resize edge handles', {
  5377 |     ...DEFAULT_DATABASE_VIEW_CONFIG,
  5378 |     options: { timeline: { scale: 'month', dateSource: { mode: 'date-property', propertyId: date.id } } },
  5379 |   }, 'timeline')
  5380 |   const item = record('p113b-edge-record', rootDatabase.id, 'p113b-edge-page', { 'root-title': 'Edge range', [date.id]: { start: '2026-10-13', end: '2026-10-14' } })
  5381 |   const api = await installApi(page, [block('p113b-edge-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100)], {
  5382 |     databases: [rootDatabase], views: [timelineView], properties: [...rootProperties, date], records: [item],
  5383 |   })
  5384 |   api.pages.push({ ...pageRecord, id: item.pageId, title: 'Edge range', role: 'database-record' })
  5385 |   await page.goto('/#/app/database-workspace/page/database-page')
  5386 |   const timeline = page.locator('#database-block-p113b-edge-block').getByTestId('database-timeline')
  5387 |   const scroller = timeline.getByTestId('timeline-scroll')
  5388 |   const bar = timeline.locator(`[data-testid="timeline-bar"][data-record-id="${item.id}"]`)
  5389 |   await expect(bar).toBeVisible()
  5390 |   const alignAtEdge = async (handle: Locator, edge: 'left' | 'right') => {
  5391 |     const viewport = await scroller.boundingBox()
  5392 |     const before = await handle.boundingBox()
  5393 |     if (!viewport || !before) throw new Error(`Expected ${edge} resize handle before native-scroll alignment`)
  5394 |     const edgeX = edge === 'left' ? viewport.x + 1 : viewport.x + viewport.width - 1
  5395 |     const centerX = before.x + before.width / 2
  5396 |     await scroller.evaluate((element, shift) => { (element as HTMLElement).scrollLeft += shift }, centerX - edgeX)
  5397 |     await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  5398 |     const aligned = await handle.boundingBox()
  5399 |     if (!aligned) throw new Error(`Expected ${edge} resize handle after scrolling its endpoint to the viewport edge`)
  5400 |     const x = aligned.x + aligned.width / 2
  5401 |     const y = aligned.y + aligned.height / 2
  5402 |     const expectedHitCenter = edge === 'left' ? viewport.x + 6 : viewport.x + viewport.width - 6
  5403 |     expect(Math.abs(x - expectedHitCenter)).toBeLessThanOrEqual(2)
  5404 |     const hit = await page.evaluate(({ x, y, testId }) => Boolean(testId && document.elementFromPoint(x, y)?.closest(`[data-testid="${testId}"]`)), { x, y, testId: await handle.getAttribute('data-testid') })
  5405 |     expect(hit).toBe(true)
  5406 |     return { x, y }
  5407 |   }
  5408 |   const startHandle = timeline.locator(`[data-testid="timeline-resize-start"][data-record-id="${item.id}"]`)
  5409 |   const endHandle = timeline.locator(`[data-testid="timeline-resize-end"][data-record-id="${item.id}"]`)
  5410 |   const patches = () => api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith(`/records/${item.id}/cells/${date.id}`)).length
  5411 |   const beforeEdgeResize = patches()
  5412 |   const start = await alignAtEdge(startHandle, 'left')
  5413 |   await page.mouse.move(start.x, start.y)
  5414 |   await page.mouse.down()
  5415 |   await page.mouse.move(start.x - pxPerMs('month') * 86_400_000, start.y, { steps: 4 })
  5416 |   await expect(bar).toHaveAttribute('data-drag-state', 'dragging')
  5417 |   await expect(bar).toHaveAttribute('data-preview-date', /2026-10-12/u)
  5418 |   expect(patches()).toBe(beforeEdgeResize)
  5419 |   await page.mouse.up()
  5420 |   await expect(bar).toHaveAttribute('data-drag-state', 'idle')
  5421 |   await expect.poll(() => api.records[0]?.properties[date.id]).toEqual({ start: '2026-10-12', end: '2026-10-14' })
  5422 |   expect(patches()).toBe(beforeEdgeResize + 1)
  5423 | 
  5424 |   const end = await alignAtEdge(endHandle, 'right')
  5425 |   await page.mouse.move(end.x, end.y)
  5426 |   await page.mouse.down()
  5427 |   await page.mouse.move(end.x + pxPerMs('month') * 86_400_000, end.y, { steps: 4 })
  5428 |   await expect(bar).toHaveAttribute('data-drag-state', 'dragging')
  5429 |   await expect(bar).toHaveAttribute('data-preview-date', /2026-10-15/u)
  5430 |   expect(patches()).toBe(beforeEdgeResize + 1)
  5431 |   await page.mouse.up()
  5432 |   await expect.poll(() => api.records[0]?.properties[date.id]).toEqual({ start: '2026-10-12', end: '2026-10-15' })
  5433 |   expect(patches()).toBe(beforeEdgeResize + 2)
  5434 | })
  5435 | 
  5436 | test('Timeline keeps the viewport centered across navigation, rebase, resize, locale, and local-day updates', async ({ page }) => {
  5437 |   await page.setViewportSize({ width: 1440, height: 900 })
  5438 |   await page.clock.install({ time: new Date('2026-10-13T12:00:00.000Z') })
  5439 |   const timelineView = view('viewport-timeline', rootDatabase.id, 'Timeline', { ...DEFAULT_DATABASE_VIEW_CONFIG }, 'timeline')
  5440 |   const tableView = view('viewport-table', rootDatabase.id, 'Table', { ...DEFAULT_DATABASE_VIEW_CONFIG }, 'table')
  5441 |   const pageErrors: string[] = []
  5442 |   page.on('pageerror', error => pageErrors.push(error.message))
  5443 |   await installApi(page, [block('viewport-timeline-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100)], {
  5444 |     databases: [rootDatabase], views: [timelineView, tableView], properties: rootProperties, records: [],
  5445 |   })
  5446 |   await page.goto('/#/app/database-workspace/page/database-page')
  5447 |   await page.clock.runFor(100)
  5448 |   const database = page.locator('#database-block-viewport-timeline-block')
  5449 |   const timeline = database.getByTestId('database-timeline')
  5450 |   const scroller = timeline.getByTestId('timeline-scroll')
  5451 |   await expect(timeline).toBeVisible()
  5452 |   await page.clock.runFor(100)
```