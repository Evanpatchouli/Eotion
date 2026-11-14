import { expect, test } from '@playwright/test'

test('Board renders independent windows and emits anchored drag and keyboard reorder intents', async ({ page }) => {
  await page.goto('/login')
  await page.evaluate(async () => {
    const Vue = await import('/node_modules/.vite/deps/vue.js')
    const { default: Board } = await import('/src/components/editor/DatabaseBoardView.vue')
    const record = (id: string) => ({ id, pageId: `page-${id}`, properties: { title: id } })
    const groups = Vue.ref([
      { key: { kind: 'option', optionId: 'open' }, label: 'Open', collapsed: false, records: [record('a'), record('b')], nextCursor: 'next', hasLoaded: true, loading: false, error: null },
      { key: { kind: 'option', optionId: 'done' }, label: 'Done', collapsed: false, records: [record('c')], nextCursor: null, hasLoaded: true, loading: false, error: null },
      { key: { kind: 'ungrouped' }, label: 'Ungrouped', collapsed: true, records: [], nextCursor: null, hasLoaded: false, loading: false, error: null },
    ])
    const events: unknown[][] = []
    Object.assign(window, { boardEvents: events, boardGroups: groups })
    const host = document.createElement('div')
    document.body.append(host)
    Vue.createApp({ render: () => Vue.h(Board, {
      records: [], properties: [{ id: 'title', type: 'title', name: 'Name' }],
      config: { filters: [], sorts: [], visibleProperties: null, propertyOrder: null, options: { groupByPropertyId: 'status' } },
      formatValue: (value: unknown) => String(value ?? ''), writable: true, groupWindows: groups.value,
      onMoveGroup: (...args: unknown[]) => events.push(['moveGroup', ...args]),
      onReorderGroup: (...args: unknown[]) => events.push(['reorderGroup', ...args]),
      onToggleGroup: (...args: unknown[]) => events.push(['toggleGroup', ...args]),
      onLoadGroupMore: (...args: unknown[]) => events.push(['loadGroupMore', ...args]),
    }) }).mount(host)
  })
  const board = page.getByTestId('database-board')
  await expect(board.locator('[data-group-key]')).toHaveCount(3)
  await expect(board).toContainText('已加载 2')
  await board.getByRole('button', { name: '下移记录：a' }).click()
  await board.locator('[data-record-id="a"]').dragTo(board.locator('[data-record-id="c"]'), { targetPosition: { x: 50, y: 4 } })
  await board.getByRole('button', { name: '折叠分组：Done' }).click()
  await board.getByRole('button', { name: '加载更多' }).click()
  expect(await page.evaluate(() => (window as any).boardEvents)).toEqual([
    ['reorderGroup', 'a', 'b', 'after'],
    ['moveGroup', 'a', { kind: 'option', optionId: 'open' }, { kind: 'option', optionId: 'done' }, 'c', 'before'],
    ['toggleGroup', { kind: 'option', optionId: 'done' }, true],
    ['loadGroupMore', { kind: 'option', optionId: 'open' }],
  ])
  await expect(board.locator('[data-record-id="a"]')).toHaveCount(1)
})

test('Board sorted cross-group drag omits anchor and empty groups expose loading state', async ({ page }) => {
  await page.goto('/login')
  await page.evaluate(async () => {
    const Vue = await import('/node_modules/.vite/deps/vue.js')
    const { default: Board } = await import('/src/components/editor/DatabaseBoardView.vue')
    const record = (id: string) => ({ id, pageId: `page-${id}`, properties: { title: id } })
    const events: unknown[][] = []
    Object.assign(window, { boardEvents: events })
    const host = document.createElement('div')
    document.body.append(host)
    Vue.createApp({ render: () => Vue.h(Board, {
      records: [], properties: [{ id: 'title', type: 'title', name: 'Name' }],
      config: { filters: [], sorts: [{ propertyId: 'title', direction: 'asc' }], visibleProperties: null, propertyOrder: null, options: { groupByPropertyId: 'status' } },
      formatValue: (value: unknown) => String(value ?? ''), writable: true,
      groupWindows: [
        { key: { kind: 'option', optionId: 'open' }, label: 'Open', collapsed: false, records: [record('a')], nextCursor: null, hasLoaded: true, loading: false, error: null },
        { key: { kind: 'option', optionId: 'done' }, label: 'Done', collapsed: false, records: [record('c')], nextCursor: null, hasLoaded: true, loading: false, error: null },
        { key: { kind: 'ungrouped' }, label: 'Empty', collapsed: false, records: [], nextCursor: null, hasLoaded: false, loading: true, error: null },
      ],
      onMoveGroup: (...args: unknown[]) => events.push(['moveGroup', ...args]),
      onReorderGroup: (...args: unknown[]) => events.push(['reorderGroup', ...args]),
    }) }).mount(host)
  })
  const board = page.getByTestId('database-board')
  await expect(board).toContainText('正在加载…')
  await expect(board.getByRole('button', { name: '上移记录：a' })).toHaveCount(0)
  await board.locator('[data-record-id="a"]').dragTo(board.locator('[data-record-id="c"]'))
  expect(await page.evaluate(() => (window as any).boardEvents)).toEqual([
    ['moveGroup', 'a', { kind: 'option', optionId: 'open' }, { kind: 'option', optionId: 'done' }],
  ])
})

test('Board offers an explicit load control when intersection observation is unavailable', async ({ page }) => {
  await page.goto('/login')
  await page.evaluate(async () => {
    const Vue = await import('/node_modules/.vite/deps/vue.js')
    const { default: Board } = await import('/src/components/editor/DatabaseBoardView.vue')
    Object.assign(window, { IntersectionObserver: undefined })
    const events: unknown[][] = []
    Object.assign(window, { boardEvents: events })
    const host = document.createElement('div')
    document.body.append(host)
    Vue.createApp({ render: () => Vue.h(Board, {
      records: [], properties: [], config: { filters: [], sorts: [], visibleProperties: null, propertyOrder: null },
      formatValue: () => '', writable: false,
      groupWindows: [{ key: { kind: 'ungrouped' }, label: 'Empty', collapsed: false, records: [], nextCursor: null, hasLoaded: false, loading: false, error: null }],
      onGroupVisible: (...args: unknown[]) => events.push(['groupVisible', ...args]),
    }) }).mount(host)
  })
  const board = page.getByTestId('database-board')
  await expect(board).toContainText('尚未加载')
  await board.getByRole('button', { name: '加载分组' }).click()
  expect(await page.evaluate(() => (window as any).boardEvents)).toEqual([['groupVisible', { kind: 'ungrouped' }]])
})

test('Board requests only expanded groups observed in the viewport', async ({ page }) => {
  await page.goto('/login')
  await page.evaluate(async () => {
    const Vue = await import('/node_modules/.vite/deps/vue.js')
    const { default: Board } = await import('/src/components/editor/DatabaseBoardView.vue')
    const events: unknown[][] = []
    Object.assign(window, { boardEvents: events })
    const host = document.createElement('div')
    document.body.append(host)
    Vue.createApp({ render: () => Vue.h(Board, {
      records: [], properties: [], config: { filters: [], sorts: [], visibleProperties: null, propertyOrder: null },
      formatValue: () => '', writable: false,
      groupWindows: [
        { key: { kind: 'option', optionId: 'open' }, label: 'Open', collapsed: false, records: [], nextCursor: null, hasLoaded: false, loading: false, error: null },
        { key: { kind: 'option', optionId: 'closed' }, label: 'Closed', collapsed: true, records: [], nextCursor: null, hasLoaded: false, loading: false, error: null },
      ],
      onGroupVisible: (...args: unknown[]) => events.push(['groupVisible', ...args]),
    }) }).mount(host)
  })
  await page.getByTestId('database-board').locator('[data-group-key]').first().scrollIntoViewIfNeeded()
  await expect.poll(() => page.evaluate(() => (window as any).boardEvents)).toEqual([
    ['groupVisible', { kind: 'option', optionId: 'open' }],
  ])
})

test('Board keeps one observer across a mounted hook group update', async ({ page }) => {
  await page.goto('/login')
  const result = await page.evaluate(async () => {
    const Vue = await import('/node_modules/.vite/deps/vue.js')
    const { default: Board } = await import('/src/components/editor/DatabaseBoardView.vue')
    const instances: Array<{ targets: Set<Element>; disconnected: boolean; fire: () => void }> = []
    class ControlledObserver {
      targets = new Set<Element>()
      disconnected = false
      callback: IntersectionObserverCallback
      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback
        instances.push({ targets: this.targets, disconnected: this.disconnected, fire: () => this.callback(
          [...this.targets].map(target => ({ target, isIntersecting: true })) as IntersectionObserverEntry[], this as unknown as IntersectionObserver) })
      }
      observe(target: Element) { this.targets.add(target) }
      unobserve(target: Element) { this.targets.delete(target) }
      disconnect() { this.disconnected = true; this.targets.clear(); instances.find(item => item.targets === this.targets)!.disconnected = true }
    }
    Object.assign(window, { IntersectionObserver: ControlledObserver })
    const group = (label: string) => ({ key: { kind: 'ungrouped' }, label, collapsed: false, records: [], nextCursor: null, hasLoaded: false, loading: false, error: null })
    const groups = Vue.ref([group('First')])
    const show = Vue.ref(false)
    const events: unknown[][] = []
    const host = document.createElement('div')
    document.body.append(host)
    Vue.createApp({ render: () => show.value ? Vue.h(Board, {
      records: [], properties: [], config: { filters: [], sorts: [], visibleProperties: null, propertyOrder: null },
      formatValue: () => '', writable: false, groupWindows: groups.value,
      onGroupVisible: (...args: unknown[]) => events.push(args),
      onVnodeMounted: () => { groups.value = [group('Second')] },
    }) : null }).mount(host)
    show.value = true
    await Vue.nextTick()
    await Vue.nextTick()
    await Vue.nextTick()
    for (const instance of instances) if (!instance.disconnected) instance.fire()
    const active = instances.filter(item => !item.disconnected).length
    show.value = false
    await Vue.nextTick()
    return { created: instances.length, active, disconnected: instances.every(item => item.disconnected), events }
  })
  expect(result.created).toBeGreaterThan(0)
  expect(result.active).toBe(1)
  expect(result.disconnected).toBe(true)
  expect(result.events).toEqual([[{ kind: 'ungrouped' }]])
})
