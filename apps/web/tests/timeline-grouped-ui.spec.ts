import { expect, test } from '@playwright/test'

test('Timeline groups share visual rows and expose independent loading controls', async ({ page }) => {
  await page.goto('/login')
  await page.evaluate(async () => {
    const Vue = await import('/node_modules/.vite/deps/vue.js')
    const { default: Timeline } = await import('/src/components/editor/DatabaseTimelineView.vue')
    const record = (id: string) => ({ id, version: 1, pageId: `page-${id}`, properties: { title: id, date: '2026-11-15' } })
    const groups = Vue.ref([
      { key: { kind: 'option', optionId: 'open' }, label: 'Open', collapsed: false, records: [record('a'), record('b')], nextCursor: 'next', hasLoaded: true, loading: false, error: null },
      { key: { kind: 'option', optionId: 'done' }, label: 'Done', collapsed: false, records: [record('c')], nextCursor: null, hasLoaded: true, loading: false, error: null },
      { key: { kind: 'ungrouped' }, label: 'Empty', collapsed: false, records: [], nextCursor: null, hasLoaded: false, loading: false, error: 'Network error' },
    ])
    const events: unknown[][] = []
    Object.assign(window, { timelineGroups: groups, timelineGroupEvents: events })
    const host = document.createElement('div')
    host.className = 'document-wrap'
    host.style.cssText = 'height:700px;overflow:auto;width:1000px'
    document.body.append(host)
    Vue.createApp({ render: () => Vue.h(Timeline, {
      databaseId: 'db', scope: 'scope', records: [], properties: [{ id: 'title', type: 'title', name: 'Name' }, { id: 'date', type: 'date', name: 'Date' }],
      config: { filters: [], sorts: [], visibleProperties: null, propertyOrder: null, options: { timeline: { dateSource: { mode: 'date-property', propertyId: 'date' }, frozenTable: { visible: true } } } },
      formatValue: (value: unknown) => String(value ?? ''), selectedPageId: null, activeEditRecordId: null,
      writable: true, viewBusy: false, databaseVersion: 1, groupWindows: groups.value,
      prepareDrag: () => null, prepareSchedule: () => null, moveRecord: async () => false,
      captureDependency: () => null, mutateDependency: async () => false,
      captureOrder: () => null, reorderRecord: async () => false,
      onToggleGroup: (...args: unknown[]) => events.push(['toggle', ...args]),
      onLoadGroupMore: (...args: unknown[]) => events.push(['load', ...args]),
    }) }).mount(host)
  })
  const timeline = page.getByTestId('database-timeline')
  await expect(timeline.locator('[data-testid="timeline-canvas-body"]')).toHaveAttribute('data-row-window-total-height', '288')
  await expect(timeline.locator('[data-timeline-group-header]')).toHaveCount(6)
  await expect(timeline.locator('[data-timeline-row]')).toHaveCount(3)
  await expect(timeline.locator('[data-timeline-row][data-record-id="a"]')).toHaveAttribute('data-row-index', '1')
  await expect(timeline.locator('[data-timeline-frozen-row][data-record-id="c"]')).toHaveAttribute('data-row-index', '4')
  const positions = await timeline.evaluate(element => {
    const grid = element.querySelector<HTMLElement>('[data-timeline-row][data-record-id="c"]')!
    const frozen = element.querySelector<HTMLElement>('[data-timeline-frozen-row][data-record-id="c"]')!
    return [grid.getBoundingClientRect().top, frozen.getBoundingClientRect().top]
  })
  expect(positions[0]).toBeCloseTo(positions[1], 0)
  await timeline.locator('[data-testid="timeline-canvas-body"]').getByRole('button', { name: '重试' }).click()
  await timeline.locator('[data-testid="timeline-canvas-body"]').getByRole('button', { name: '折叠分组：Done' }).click()
  expect(await page.evaluate(() => (window as any).timelineGroupEvents)).toEqual([
    ['load', { kind: 'ungrouped' }], ['toggle', { kind: 'option', optionId: 'done' }, true],
  ])
})

test('Timeline sends one grouped move and omits anchors under explicit sort', async ({ page }) => {
  await page.goto('/login')
  await page.evaluate(async () => {
    const Vue = await import('/node_modules/.vite/deps/vue.js')
    const { default: Timeline } = await import('/src/components/editor/DatabaseTimelineView.vue')
    const record = (id: string) => ({ id, version: 1, pageId: `page-${id}`, properties: { title: id, date: '2026-11-15' } })
    const config = { filters: [], sorts: [{ propertyId: 'title', direction: 'asc' }], visibleProperties: null, propertyOrder: null, options: { timeline: { dateSource: { mode: 'date-property', propertyId: 'date' } } } }
    const events: unknown[][] = []
    Object.assign(window, { timelineGroupEvents: events })
    const host = document.createElement('div')
    host.className = 'document-wrap'
    host.style.cssText = 'height:700px;overflow:auto;width:1000px'
    document.body.append(host)
    Vue.createApp({ render: () => Vue.h(Timeline, {
      databaseId: 'db', scope: 'scope', records: [], properties: [{ id: 'title', type: 'title', name: 'Name' }, { id: 'date', type: 'date', name: 'Date' }],
      config, formatValue: (value: unknown) => String(value ?? ''), selectedPageId: null, activeEditRecordId: null,
      writable: true, viewBusy: false, databaseVersion: 1,
      groupWindows: [
        { key: { kind: 'option', optionId: 'open' }, label: 'Open', collapsed: false, records: [record('a')], nextCursor: null, hasLoaded: true, loading: false, error: null },
        { key: { kind: 'option', optionId: 'done' }, label: 'Done', collapsed: false, records: [record('c')], nextCursor: null, hasLoaded: true, loading: false, error: null },
      ],
      prepareDrag: () => null, prepareSchedule: () => null, moveRecord: async () => false,
      captureDependency: () => null, mutateDependency: async () => false,
      captureOrder: () => null, reorderRecord: async () => { events.push(['reorder']); return true },
      captureGroupMove: () => ({ scope: 'scope', userId: 'u', workspaceId: 'w', databaseId: 'db', viewId: 'v', blockId: 'b', viewIdentityEpoch: 1,
        viewRoot: host, expectedDatabaseVersion: 1, expectedViewVersion: 1, expectedRecordVersion: 1, configIdentity: JSON.stringify(config) }),
      moveGroupedRecord: async (...args: unknown[]) => { events.push(['move', ...args.slice(1)]); return true },
    }) }).mount(host)
  })
  const timeline = page.getByTestId('database-timeline')
  await timeline.locator('[data-testid="timeline-order-handle"][data-record-id="a"]').dragTo(timeline.locator('[data-timeline-row][data-record-id="c"]'), { targetPosition: { x: 5, y: 4 } })
  await expect.poll(() => page.evaluate(() => (window as any).timelineGroupEvents)).toEqual([
    ['move', 'a', { kind: 'option', optionId: 'open' }, { kind: 'option', optionId: 'done' }, undefined, undefined],
  ])
  await timeline.locator('[data-testid="timeline-order-handle"][data-record-id="a"]').press('ArrowDown')
  expect(await page.evaluate(() => (window as any).timelineGroupEvents)).toHaveLength(1)
})

test('Timeline routes manual order, cross-group anchors, empty headers and keyboard group choice', async ({ page }) => {
  await page.goto('/login')
  await page.evaluate(async () => {
    const Vue = await import('/node_modules/.vite/deps/vue.js')
    const { default: Timeline } = await import('/src/components/editor/DatabaseTimelineView.vue')
    const record = (id: string) => ({ id, version: 1, pageId: `page-${id}`, properties: { title: id, date: '2026-11-15' } })
    const config = { filters: [], sorts: [], visibleProperties: null, propertyOrder: null, options: { timeline: { dateSource: { mode: 'date-property', propertyId: 'date' } } } }
    const events: unknown[][] = []
    const scope = Vue.ref('scope')
    Object.assign(window, { timelineGroupEvents: events, timelineScope: scope })
    const host = document.createElement('div')
    host.className = 'document-wrap'
    host.style.cssText = 'height:700px;overflow:auto;width:1000px'
    document.body.append(host)
    const capture = () => ({ scope: scope.value, userId: 'u', workspaceId: 'w', databaseId: 'db', viewId: 'v', blockId: 'b', viewIdentityEpoch: 1,
      viewRoot: host, expectedDatabaseVersion: 1, expectedViewVersion: 1, configIdentity: JSON.stringify(config) })
    Vue.createApp({ render: () => Vue.h(Timeline, {
      databaseId: 'db', scope: scope.value, records: [], properties: [{ id: 'title', type: 'title', name: 'Name' }, { id: 'date', type: 'date', name: 'Date' }],
      config, formatValue: (value: unknown) => String(value ?? ''), selectedPageId: null, activeEditRecordId: null,
      writable: true, viewBusy: false, databaseVersion: 1,
      groupWindows: [
        { key: { kind: 'option', optionId: 'open' }, label: 'Open', collapsed: false, records: [record('a'), record('b')], nextCursor: null, hasLoaded: true, loading: false, error: null },
        { key: { kind: 'option', optionId: 'done' }, label: 'Done', collapsed: false, records: [record('c')], nextCursor: null, hasLoaded: true, loading: false, error: null },
        { key: { kind: 'ungrouped' }, label: 'Empty', collapsed: false, records: [], nextCursor: null, hasLoaded: true, loading: false, error: null },
      ],
      prepareDrag: () => null, prepareSchedule: () => null, moveRecord: async () => false,
      captureDependency: () => null, mutateDependency: async () => false,
      captureOrder: capture, reorderRecord: async (...args: unknown[]) => { events.push(['reorder', ...args.slice(1)]); return true },
      captureGroupMove: () => ({ ...capture(), expectedRecordVersion: 1 }),
      moveGroupedRecord: async (...args: unknown[]) => { events.push(['move', ...args.slice(1)]); return true },
    }) }).mount(host)
  })
  const timeline = page.getByTestId('database-timeline')
  const handle = timeline.locator('[data-testid="timeline-order-handle"][data-record-id="a"]')
  await handle.press('ArrowDown')
  await handle.dragTo(timeline.locator('[data-timeline-row][data-record-id="c"]'), { targetPosition: { x: 5, y: 4 } })
  await handle.dragTo(timeline.locator('[data-testid="timeline-canvas-body"] [data-timeline-group-header][data-row-index="5"]'), { targetPosition: { x: 5, y: 24 } })
  await timeline.getByRole('combobox', { name: '移动a到分组' }).selectOption('["option","done"]')
  expect(await page.evaluate(() => (window as any).timelineGroupEvents)).toEqual([
    ['reorder', 'a', 'b', 'after'],
    ['move', 'a', { kind: 'option', optionId: 'open' }, { kind: 'option', optionId: 'done' }, 'c', 'before'],
    ['move', 'a', { kind: 'option', optionId: 'open' }, { kind: 'ungrouped' }, undefined, undefined],
    ['move', 'a', { kind: 'option', optionId: 'open' }, { kind: 'option', optionId: 'done' }, 'c', 'before'],
  ])
  const bounds = await handle.boundingBox()
  if (!bounds) throw new Error('Order handle missing')
  await page.mouse.move(bounds.x + 8, bounds.y + 15)
  await page.mouse.down()
  await page.evaluate(() => { (window as any).timelineScope.value = 'other-view' })
  await page.mouse.move(bounds.x + 8, bounds.y + 170)
  await page.mouse.up()
  expect(await page.evaluate(() => (window as any).timelineGroupEvents)).toHaveLength(4)
})

test('Timeline keeps a focused virtual record and group controls reachable on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 })
  await page.goto('/login')
  await page.evaluate(async () => {
    const Vue = await import('/node_modules/.vite/deps/vue.js')
    const { default: Timeline } = await import('/src/components/editor/DatabaseTimelineView.vue')
    const records = Array.from({ length: 205 }, (_, index) => ({ id: `r${index}`, version: 1, pageId: `p${index}`,
      properties: { title: `Record ${index}`, date: '2026-11-15' } }))
    const host = document.createElement('div')
    host.className = 'document-wrap'
    host.style.cssText = 'height:450px;overflow:auto;width:370px'
    document.body.append(host)
    Vue.createApp({ render: () => Vue.h(Timeline, {
      databaseId: 'db', scope: 'scope', records: [], properties: [{ id: 'title', type: 'title', name: 'Name' }, { id: 'date', type: 'date', name: 'Date' }],
      config: { filters: [], sorts: [], visibleProperties: null, propertyOrder: null, options: { timeline: { dateSource: { mode: 'date-property', propertyId: 'date' } } } },
      formatValue: (value: unknown) => String(value ?? ''), selectedPageId: null, activeEditRecordId: 'r199',
      writable: false, viewBusy: false, databaseVersion: 1,
      groupWindows: [{ key: { kind: 'ungrouped' }, label: 'All', collapsed: false, records, nextCursor: null, hasLoaded: true, loading: false, error: null }],
      prepareDrag: () => null, prepareSchedule: () => null, moveRecord: async () => false,
      captureDependency: () => null, mutateDependency: async () => false,
      captureOrder: () => null, reorderRecord: async () => false,
    }) }).mount(host)
  })
  const timeline = page.getByTestId('database-timeline')
  await expect(timeline.getByTestId('timeline-frozen-table')).toHaveCount(0)
  await expect(timeline.locator('[data-testid="timeline-canvas-body"]')).toHaveAttribute('data-row-window-total-height', String(206 * 48))
  await expect(timeline.locator('[data-timeline-row][data-record-id="r199"]')).toHaveAttribute('data-row-index', '200')
  expect(await timeline.locator('[data-timeline-row]').count()).toBeLessThan(40)
  await expect(timeline.getByRole('button', { name: '折叠分组：All' })).toBeVisible()
  await timeline.getByTestId('timeline-scroll').evaluate((element: HTMLElement) => { element.scrollLeft = 400; element.dispatchEvent(new Event('scroll')) })
  await expect.poll(() => timeline.evaluate(element => {
    const scroller = element.querySelector<HTMLElement>('[data-testid="timeline-scroll"]')!
    const header = element.querySelector<HTMLElement>('[data-testid="timeline-canvas-body"] [data-timeline-group-header]')!
    return Math.abs(scroller.getBoundingClientRect().left - header.getBoundingClientRect().left)
  })).toBeLessThan(2)
})

test('Timeline observes only visible expanded groups and disconnects on unmount', async ({ page }) => {
  await page.goto('/login')
  const result = await page.evaluate(async () => {
    const Vue = await import('/node_modules/.vite/deps/vue.js')
    const { default: Timeline } = await import('/src/components/editor/DatabaseTimelineView.vue')
    const instances: Array<{ targets: Set<Element>; disconnected: boolean; fire: () => void }> = []
    class ControlledObserver {
      targets = new Set<Element>()
      callback: IntersectionObserverCallback
      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback
        instances.push({ targets: this.targets, disconnected: false, fire: () => this.callback(
          [...this.targets].map(target => ({ target, isIntersecting: true })) as IntersectionObserverEntry[], this as unknown as IntersectionObserver) })
      }
      observe(target: Element) { this.targets.add(target) }
      disconnect() { this.targets.clear(); instances.find(item => item.targets === this.targets)!.disconnected = true }
    }
    Object.assign(window, { IntersectionObserver: ControlledObserver })
    const events: unknown[] = []
    const host = document.createElement('div')
    host.className = 'document-wrap'
    host.style.cssText = 'height:500px;overflow:auto;width:800px'
    document.body.append(host)
    const app = Vue.createApp({ render: () => Vue.h(Timeline, {
      databaseId: 'db', scope: 'scope', records: [], properties: [],
      config: { filters: [], sorts: [], visibleProperties: null, propertyOrder: null }, formatValue: () => '',
      selectedPageId: null, activeEditRecordId: null, writable: false, viewBusy: false, databaseVersion: 1,
      groupWindows: [
        { key: { kind: 'option', optionId: 'open' }, label: 'Open', collapsed: false, records: [], nextCursor: null, hasLoaded: false, loading: false, error: null },
        { key: { kind: 'option', optionId: 'closed' }, label: 'Closed', collapsed: true, records: [], nextCursor: null, hasLoaded: false, loading: false, error: null },
      ],
      prepareDrag: () => null, prepareSchedule: () => null, moveRecord: async () => false,
      captureDependency: () => null, mutateDependency: async () => false,
      captureOrder: () => null, reorderRecord: async () => false,
      onGroupVisible: (key: unknown) => events.push(key),
    }) })
    app.mount(host)
    await Vue.nextTick()
    for (const instance of instances) if (!instance.disconnected) instance.fire()
    const seen = [...events]
    app.unmount()
    await Vue.nextTick()
    return { seen, allDisconnected: instances.every(instance => instance.disconnected) }
  })
  expect(result).toEqual({ seen: [{ kind: 'option', optionId: 'open' }], allDisconnected: true })
})

test('Timeline pending group moves remain owned by their scope epoch', async ({ page }) => {
  await page.goto('/login')
  await page.evaluate(async () => {
    const Vue = await import('/node_modules/.vite/deps/vue.js')
    const { default: Timeline } = await import('/src/components/editor/DatabaseTimelineView.vue')
    const scope = Vue.ref('A')
    const resolvers: Array<() => void> = []
    const config = { filters: [], sorts: [], visibleProperties: null, propertyOrder: null }
    Object.assign(window, { pendingScope: scope, resolveMoves: resolvers })
    const host = document.createElement('div')
    host.className = 'document-wrap'
    host.style.cssText = 'height:500px;overflow:auto;width:800px'
    document.body.append(host)
    Vue.createApp({ render: () => Vue.h(Timeline, {
      databaseId: 'db', scope: scope.value, records: [], properties: [{ id: 'title', type: 'title', name: 'Name' }], config,
      formatValue: (value: unknown) => String(value ?? ''), selectedPageId: null, activeEditRecordId: null,
      writable: true, viewBusy: false, databaseVersion: 1,
      groupWindows: [
        { key: { kind: 'option', optionId: 'open' }, label: 'Open', collapsed: false,
          records: [{ id: 'a', version: 1, pageId: 'pa', properties: { title: 'a' } }], nextCursor: null, hasLoaded: true, loading: false, error: null },
        { key: { kind: 'option', optionId: 'done' }, label: 'Done', collapsed: false, records: [], nextCursor: null, hasLoaded: true, loading: false, error: null },
      ],
      prepareDrag: () => null, prepareSchedule: () => null, moveRecord: async () => false,
      captureDependency: () => null, mutateDependency: async () => false,
      captureOrder: () => null, reorderRecord: async () => false,
      captureGroupMove: () => ({ scope: scope.value, userId: 'u', workspaceId: 'w', databaseId: 'db', viewId: 'v', blockId: 'b', viewIdentityEpoch: 1,
        viewRoot: host, expectedDatabaseVersion: 1, expectedViewVersion: 1, expectedRecordVersion: 1, configIdentity: JSON.stringify(config) }),
      moveGroupedRecord: () => new Promise<boolean>(resolve => { resolvers.push(() => resolve(true)) }),
    }) }).mount(host)
  })
  const select = page.getByRole('combobox', { name: '移动a到分组' })
  const request = async () => select.evaluate((element: HTMLSelectElement) => {
    element.value = '["option","done"]'
    element.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await request()
  await expect(select).toBeDisabled()
  await page.evaluate(() => { (window as any).pendingScope.value = 'B' })
  await expect(select).toBeEnabled()
  await request()
  await expect(select).toBeDisabled()
  await page.evaluate(() => { (window as any).resolveMoves[0]() })
  await expect(select).toBeDisabled()
  await page.evaluate(() => { (window as any).resolveMoves[1]() })
  await expect(select).toBeEnabled()
  await page.evaluate(() => { (window as any).pendingScope.value = 'A' })
  await request()
  await expect(select).toBeDisabled()
  await page.evaluate(() => { (window as any).pendingScope.value = 'B' })
  await page.evaluate(() => { (window as any).pendingScope.value = 'A' })
  await expect(select).toBeEnabled()
  await request()
  await expect(select).toBeDisabled()
  await page.evaluate(() => { (window as any).resolveMoves[2]() })
  await expect(select).toBeDisabled()
  await page.evaluate(() => { (window as any).resolveMoves[3]() })
  await expect(select).toBeEnabled()
})

test('coarse pointer has separate 48px controls and leaves date dragging on the grid', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 700 } })
  const page = await context.newPage()
  await page.goto('/login')
  await page.evaluate(async () => {
    const Vue = await import('/node_modules/.vite/deps/vue.js')
    const { default: Timeline } = await import('/src/components/editor/DatabaseTimelineView.vue')
    const date = new Date().toISOString().slice(0, 10)
    const record = (id: string) => ({ id, version: 1, pageId: `p${id}`, properties: { title: id, date } })
    const config = { filters: [], sorts: [{ propertyId: 'title', direction: 'asc' }], visibleProperties: null, propertyOrder: null,
      options: { timeline: { dateSource: { mode: 'date-property', propertyId: 'date' } } } }
    const events: unknown[][] = []
    Object.assign(window, { touchTimelineEvents: events })
    const host = document.createElement('div')
    host.className = 'document-wrap'
    host.style.cssText = 'height:500px;overflow:auto;width:370px'
    document.body.append(host)
    Vue.createApp({ render: () => Vue.h(Timeline, {
      databaseId: 'db', scope: 'scope', records: [], properties: [{ id: 'title', type: 'title', name: 'Name' }, { id: 'date', type: 'date', name: 'Date' }],
      config, formatValue: (value: unknown) => String(value ?? ''), selectedPageId: null, activeEditRecordId: null,
      writable: true, viewBusy: false, databaseVersion: 1,
      groupWindows: [
        { key: { kind: 'option', optionId: 'open' }, label: 'Open', collapsed: false, records: [record('a')], nextCursor: null, hasLoaded: true, loading: false, error: null },
        { key: { kind: 'option', optionId: 'done' }, label: 'Done', collapsed: false, records: [record('c')], nextCursor: null, hasLoaded: true, loading: false, error: null },
      ],
      prepareDrag: (recordId: string) => ({ scope: 'scope', recordId, propertyId: 'date', expectedDatabaseVersion: 1,
        expectedRecordVersion: 1, originalValue: date, viewIdentityEpoch: 1, viewRoot: host }),
      prepareSchedule: () => null, moveRecord: async (...args: unknown[]) => { events.push(['date', ...args]); return true },
      captureDependency: () => null, mutateDependency: async () => false,
      captureOrder: () => null, reorderRecord: async () => false,
      captureGroupMove: () => ({ scope: 'scope', userId: 'u', workspaceId: 'w', databaseId: 'db', viewId: 'v', blockId: 'b', viewIdentityEpoch: 1,
        viewRoot: host, expectedDatabaseVersion: 1, expectedViewVersion: 1, expectedRecordVersion: 1, configIdentity: JSON.stringify(config) }),
      moveGroupedRecord: async (...args: unknown[]) => { events.push(['group', ...args.slice(1)]); return true },
    }) }).mount(host)
  })
  const timeline = page.getByTestId('database-timeline')
  const handle = timeline.locator('[data-testid="timeline-order-handle"][data-record-id="a"]')
  const select = timeline.getByRole('combobox', { name: '移动a到分组' })
  const bar = timeline.locator('[data-testid="timeline-bar"][data-record-id="a"]')
  await expect(bar).toBeVisible()
  await handle.scrollIntoViewIfNeeded()
  const hit = await timeline.evaluate(element => {
    const handle = element.querySelector<HTMLElement>('[data-testid="timeline-order-handle"][data-record-id="a"]')!
    const select = element.querySelector<HTMLElement>('.eotion-timeline-group-select[data-record-id="a"]')!
    const scroller = element.querySelector<HTMLElement>('[data-testid="timeline-scroll"]')!
    const bar = element.querySelector<HTMLElement>('[data-testid="timeline-bar"][data-record-id="a"]')!
    const check = (node: HTMLElement) => {
      const rect = node.getBoundingClientRect()
      return { width: rect.width, height: rect.height, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2,
        hit: document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('[data-testid="timeline-order-handle"], .eotion-timeline-group-select, [data-testid="timeline-bar"]') === node }
    }
    return { handle: check(handle), select: check(select), bar: check(bar), railRight: select.getBoundingClientRect().right, gridLeft: scroller.getBoundingClientRect().left }
  })
  expect(hit.handle.width).toBeGreaterThanOrEqual(44)
  expect(hit.handle.height).toBeGreaterThanOrEqual(44)
  expect(hit.select.width).toBeGreaterThanOrEqual(44)
  expect(hit.select.height).toBeGreaterThanOrEqual(44)
  expect(hit.handle.hit, JSON.stringify(hit)).toBe(true)
  expect(hit.select.hit, JSON.stringify(hit)).toBe(true)
  expect(hit.bar.hit, JSON.stringify(hit)).toBe(true)
  expect(hit.railRight).toBeLessThanOrEqual(hit.gridLeft + 1)
  const session = await context.newCDPSession(page)
  const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) => session.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
  })
  const target = await timeline.locator('[data-timeline-row][data-record-id="c"]').boundingBox()
  if (!target) throw new Error('Target row missing')
  await touch('touchStart', hit.handle.x, hit.handle.y)
  await touch('touchMove', hit.handle.x, target.y + 5)
  await touch('touchEnd', hit.handle.x, target.y + 5)
  await expect.poll(() => page.evaluate(() => (window as any).touchTimelineEvents.filter((event: unknown[]) => event[0] === 'group').length)).toBe(1)
  await touch('touchStart', hit.bar.x, hit.bar.y)
  await touch('touchMove', hit.bar.x + 60, hit.bar.y)
  await touch('touchEnd', hit.bar.x + 60, hit.bar.y)
  await expect.poll(() => page.evaluate(() => (window as any).touchTimelineEvents.filter((event: unknown[]) => event[0] === 'date').length)).toBe(1)
  await expect(select).toBeVisible()
  await context.close()
})
