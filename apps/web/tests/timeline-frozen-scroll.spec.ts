import { expect, test, type Page } from '@playwright/test'

async function mountFrozen(page: Page, narrow: boolean) {
  await page.setViewportSize(narrow ? { width: 390, height: 700 } : { width: 1280, height: 900 })
  await page.goto('/login')
  await page.evaluate(async isNarrow => {
    const Vue = await import('/node_modules/.vite/deps/vue.js')
    const { default: Frozen } = await import('/src/components/editor/timeline/FrozenTablePane.vue')
    const events: unknown[][] = []
    Object.assign(window, { frozenEvents: events })
    const host = document.createElement('div')
    document.documentElement.style.overflowY = 'auto'
    document.body.style.cssText = 'min-height:3000px;overflow-y:auto'
    host.id = 'frozen-scroll-test'
    host.style.cssText = `width:${isNarrow ? 360 : 760}px; margin:800px auto 1000px; display:flex; position:relative; --timeline-header-height:56px`
    document.body.append(host)
    const groupKey = { kind: 'ungrouped' }
    const row = { rowIndex: 1, top: 48, height: 48, item: { recordId: 'r1', pageId: 'p1', title: 'A long readable record title' } }
    const columns = [
      { id: 'name', type: 'title', name: 'Name' },
      { id: 'date', type: 'date', name: 'Date' },
      { id: 'status', type: 'select', name: 'Status' },
    ]
    Vue.createApp({ render: () => [
      Vue.h(Frozen, {
        columns, rows: [row], displayMap: new Map([['r1', new Map([['date', '2026-11-15'], ['status', 'In progress']])]]),
        groupHeaders: [{ key: groupKey, label: 'Ungrouped', collapsed: false, rowIndex: 0, top: 0, height: 48 }],
        groupWindows: [{ key: groupKey, label: 'Ungrouped', collapsed: false, records: [row.item], nextCursor: null, hasLoaded: true, loading: false, error: null }],
        bodyHeight: 240, pinY: 0, selectedPageId: null, hoveredRecordId: null, toggleDisabled: false,
        onToggleVisibility: () => events.push(['toggleVisibility']),
        onToggleGroup: (...args: unknown[]) => events.push(['toggleGroup', ...args]),
        onFocusRow: (...args: unknown[]) => events.push(['focusRow', ...args]),
      }),
      Vue.h('div', { id: 'fake-grid', style: 'position:relative; flex:1; height:296px' }, [Vue.h('div', { id: 'fake-grid-row', style: 'position:absolute;top:104px;height:48px' })]),
    ] }).mount(host)
    if (isNarrow) {
      const pane = host.querySelector<HTMLElement>('[data-testid="timeline-frozen-table"]')!
      pane.style.cssText = 'flex:0 0 120px;width:120px;min-width:0;max-width:40%'
    }
  }, narrow)
  const pane = page.getByTestId('timeline-frozen-table')
  await pane.scrollIntoViewIfNeeded()
  return { pane, scroll: page.getByTestId('timeline-frozen-scroll') }
}

for (const narrow of [false, true]) {
  test(`Frozen Table keeps readable columns and shared geometry on ${narrow ? 'mobile' : 'desktop'}`, async ({ page }) => {
    const { pane, scroll } = await mountFrozen(page, narrow)
    const measurements = await pane.evaluate(element => {
      const header = element.querySelector<HTMLElement>('[data-testid="timeline-frozen-header"]')!
      const row = element.querySelector<HTMLElement>('[data-timeline-frozen-row]')!
      const body = element.querySelector<HTMLElement>('[data-testid="timeline-frozen-body"]')!
      const scroller = element.querySelector<HTMLElement>('[data-testid="timeline-frozen-scroll"]')!
      const headerCells = [...header.querySelectorAll<HTMLElement>('.eotion-timeline-frozen-cell')]
      const rowCells = [...row.querySelectorAll<HTMLElement>('.eotion-timeline-frozen-cell')]
      return { title: headerCells[0]!.getBoundingClientRect().width, property: headerCells[1]!.getBoundingClientRect().width,
        rowTitle: rowCells[0]!.getBoundingClientRect().width, rowProperty: rowCells[1]!.getBoundingClientRect().width,
        maxScroll: scroller.scrollWidth - scroller.clientWidth, rowTop: row.getBoundingClientRect().top,
        gridTop: document.querySelector('#fake-grid-row')!.getBoundingClientRect().top,
        bodyWidth: body.getBoundingClientRect().width, paneWidth: element.getBoundingClientRect().width }
    })
    expect(measurements.title).toBeGreaterThanOrEqual(180)
    expect(measurements.property).toBeGreaterThanOrEqual(128)
    expect(measurements.rowTitle).toBe(measurements.title)
    expect(measurements.rowProperty).toBe(measurements.property)
    expect(measurements.maxScroll).toBeGreaterThan(0)
    expect(measurements.bodyWidth).toBeGreaterThan(measurements.paneWidth)
    expect(Math.abs(measurements.rowTop - measurements.gridTop)).toBeLessThan(1)

    const before = await pane.evaluate(element => {
      const header = element.querySelector<HTMLElement>('[data-testid="timeline-frozen-header"]')!
      const toggle = element.querySelector<HTMLElement>('[data-testid="timeline-frozen-toggle"]')!
      const toggleRect = toggle.getBoundingClientRect()
      const mask = getComputedStyle(toggle, '::before')
      const titleText = header.querySelector<HTMLElement>('[data-property-id="name"] span')!.getBoundingClientRect()
      const secondText = header.querySelector<HTMLElement>('[data-property-id="date"] span')!.getBoundingClientRect()
      return { headerX: header.querySelector('[data-property-id="name"]')!.getBoundingClientRect().x,
        rowX: element.querySelector('[data-timeline-frozen-row] [data-property-id="name"]')!.getBoundingClientRect().x,
        toggleX: toggleRect.x, groupX: element.querySelector('.eotion-timeline-group-toggle')!.getBoundingClientRect().x,
        maskLeft: toggleRect.left - parseFloat(mask.width), maskRight: toggleRect.left, maskWidth: parseFloat(mask.width),
        maskHeight: parseFloat(mask.height), maskColor: mask.backgroundColor, headerColor: getComputedStyle(header).backgroundColor,
        titleTextRight: titleText.right, secondTextLeft: secondText.left,
        toggleHit: toggle.contains(document.elementFromPoint(toggleRect.x + toggleRect.width / 2, toggleRect.y + toggleRect.height / 2)) }
    })
    expect(before.maskWidth).toBe(16)
    expect(before.maskHeight).toBe(56)
    expect(before.maskColor).toBe(before.headerColor)
    expect(before.toggleHit).toBe(true)
    if (narrow) expect(before.titleTextRight).toBeLessThan(before.maskLeft)
    else {
      expect(before.secondTextLeft).toBeGreaterThanOrEqual(before.maskLeft)
      expect(before.secondTextLeft).toBeLessThan(before.maskRight)
    }
    await scroll.evaluate((element, left) => { element.scrollLeft = left }, narrow ? 180 : 100)
    const revealedHeader = await pane.evaluate(element => {
      const rect = element.querySelector<HTMLElement>('[data-testid="timeline-frozen-header"] [data-property-id="date"] span')!.getBoundingClientRect()
      const pane = element.getBoundingClientRect()
      const toggle = element.querySelector<HTMLElement>('[data-testid="timeline-frozen-toggle"]')!.getBoundingClientRect()
      return { left: rect.left, right: rect.right, paneLeft: pane.left, maskLeft: toggle.left - 16 }
    })
    expect(revealedHeader.left).toBeGreaterThanOrEqual(revealedHeader.paneLeft)
    expect(revealedHeader.right).toBeLessThanOrEqual(revealedHeader.maskLeft)
    await scroll.evaluate(element => { element.scrollLeft = element.scrollWidth })
    const after = await pane.evaluate(element => {
      const toggle = element.querySelector<HTMLElement>('[data-testid="timeline-frozen-toggle"]')!
      const group = element.querySelector<HTMLElement>('.eotion-timeline-group-toggle')!
      const isHit = (target: HTMLElement) => { const rect = target.getBoundingClientRect(); return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === target || target.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)) }
      return { headerX: element.querySelector('[data-testid="timeline-frozen-header"] [data-property-id="name"]')!.getBoundingClientRect().x,
        rowX: element.querySelector('[data-timeline-frozen-row] [data-property-id="name"]')!.getBoundingClientRect().x,
        toggleX: toggle.getBoundingClientRect().x, groupX: group.getBoundingClientRect().x, toggleHit: isHit(toggle), groupHit: isHit(group) }
    })
    expect(before.headerX - after.headerX).toBeGreaterThan(0)
    expect(after.rowX - before.rowX).toBeCloseTo(after.headerX - before.headerX, 0)
    expect(after.toggleX).toBeCloseTo(before.toggleX, 0)
    expect(after.groupX).toBeCloseTo(before.groupX, 0)
    expect(after.toggleHit).toBe(true)
    expect(after.groupHit).toBe(true)
    await pane.getByRole('button', { name: '折叠左侧记录表格' }).click()
    await pane.getByRole('button', { name: '折叠分组：Ungrouped' }).click()
    expect(await page.evaluate(() => (window as any).frozenEvents.slice(0, 2))).toEqual([
      ['toggleVisibility'], ['toggleGroup', { kind: 'ungrouped' }, true],
    ])
    await scroll.evaluate(element => { element.scrollLeft = 0 })
    await pane.getByRole('button', { name: '折叠分组：Ungrouped' }).click()
    await pane.locator('.eotion-timeline-frozen-title').focus()
    const laterEvents = await page.evaluate(() => (window as any).frozenEvents)
    expect(laterEvents.filter((event: unknown[]) => event[0] === 'toggleGroup')).toEqual([
      ['toggleGroup', { kind: 'ungrouped' }, true], ['toggleGroup', { kind: 'ungrouped' }, true],
    ])
    expect(laterEvents.filter((event: unknown[]) => event[0] === 'focusRow').length).toBeGreaterThan(0)
    if (narrow) {
      await pane.hover()
      const initialY = await page.evaluate(() => window.scrollY)
      await page.mouse.wheel(0, 260)
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(initialY)
    }
  })
}
