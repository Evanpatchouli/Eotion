import { expect, test, type Page } from '@playwright/test'

async function mountResizeTimeline(page: Page, value: { start: string; end: string }, deferred = false): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.clock.setFixedTime(new Date('2026-10-13T00:00:00.000Z'))
  await page.goto('/login')
  await page.evaluate(async ({ initialValue, deferred }) => {
    const Vue = await import('/node_modules/.vite/deps/vue.js')
    const { default: Timeline } = await import('/src/components/editor/DatabaseTimelineView.vue')
    const records = Vue.ref([{ id: 'range', pageId: 'page-range', version: 1,
      properties: { title: 'Range', date: initialValue } }])
    const commits: unknown[] = []
    let releaseCommit: (() => void) | null = null
    Object.assign(window, { timelineResizeCommits: commits, timelineResizeCompleted: false,
      releaseTimelineResize: () => releaseCommit?.() })
    const host = document.createElement('div')
    host.className = 'document-wrap'
    host.style.cssText = 'height:600px;overflow:auto;width:600px'
    document.body.append(host)
    Vue.createApp({ render: () => Vue.h(Timeline, {
      databaseId: 'db', scope: 'scope', records: records.value,
      properties: [{ id: 'title', type: 'title', name: 'Name' }, { id: 'date', type: 'date', name: 'Date' }],
      config: { filters: [], sorts: [], visibleProperties: null, propertyOrder: null,
        options: { timeline: { scale: 'month', dateSource: { mode: 'date-property', propertyId: 'date' } } } },
      formatValue: (value: unknown) => String(value ?? ''), selectedPageId: null, activeEditRecordId: null,
      writable: true, viewBusy: false, databaseVersion: 1,
      prepareDrag: (recordId: string) => ({ scope: 'scope', recordId, propertyId: 'date', expectedDatabaseVersion: 1,
        expectedRecordVersion: records.value[0]!.version, originalValue: records.value[0]!.properties.date,
        viewIdentityEpoch: 1, viewRoot: host }),
      prepareSchedule: () => null,
      moveRecord: async (command: { recordId: string; value: { start: string; end: string } }) => {
        commits.push(command.value)
        if (deferred) await new Promise<void>(resolve => { releaseCommit = resolve })
        records.value = [{ ...records.value[0]!, version: records.value[0]!.version + 1,
          properties: { ...records.value[0]!.properties, date: command.value } }]
        Object.assign(window, { timelineResizeCompleted: true })
        return true
      },
      captureDependency: () => null, mutateDependency: async () => false,
      captureOrder: () => null, reorderRecord: async () => false,
    }) }).mount(host)
  }, { initialValue: value, deferred })
}

async function resizeBy(page: Page, selector: string, dx: number): Promise<void> {
  const handle = page.locator(selector)
  await handle.scrollIntoViewIfNeeded()
  const bounds = await handle.boundingBox()
  if (!bounds) throw new Error(`Missing resize handle: ${selector}`)
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y, { steps: 5 })
  await page.mouse.up()
}

test('reveals the resized end after a successful commit clips that end', async ({ page }) => {
  await mountResizeTimeline(page, { start: '2026-10-12', end: '2026-10-14' })
  const timeline = page.getByTestId('database-timeline')
  const scroll = timeline.getByTestId('timeline-scroll')
  await expect(scroll).toHaveAttribute('data-visible-start', /\d+/)
  const before = await scroll.getAttribute('data-visible-start')
  await resizeBy(page, '[data-testid="timeline-resize-end"][data-record-id="range"]', 36 * 8)
  await expect.poll(() => page.evaluate(() => (window as any).timelineResizeCommits.length)).toBe(1)
  await expect(timeline.locator('[data-testid="timeline-resize-end"][data-record-id="range"]')).toBeVisible()
  await expect.poll(() => scroll.getAttribute('data-visible-start')).not.toBe(before)
})

test('does not navigate when resizing the visible end while only the start is clipped', async ({ page }) => {
  await mountResizeTimeline(page, { start: '2026-10-01', end: '2026-10-14' })
  const timeline = page.getByTestId('database-timeline')
  const scroll = timeline.getByTestId('timeline-scroll')
  await expect(scroll).toHaveAttribute('data-visible-start', /\d+/)
  const before = await scroll.getAttribute('data-visible-start')
  await expect(timeline.locator('[data-testid="timeline-offscreen-left"][data-record-id="range"]')).toBeVisible()
  await resizeBy(page, '[data-testid="timeline-resize-end"][data-record-id="range"]', 36)
  await expect.poll(() => page.evaluate(() => (window as any).timelineResizeCommits.length)).toBe(1)
  await expect(scroll).toHaveAttribute('data-visible-start', before!)
})

test('reveals the resized start after a successful commit clips that start', async ({ page }) => {
  await mountResizeTimeline(page, { start: '2026-10-12', end: '2026-10-14' })
  const timeline = page.getByTestId('database-timeline')
  const scroll = timeline.getByTestId('timeline-scroll')
  await expect(scroll).toHaveAttribute('data-visible-start', /\d+/)
  const before = await scroll.getAttribute('data-visible-start')
  await resizeBy(page, '[data-testid="timeline-resize-start"][data-record-id="range"]', -36 * 8)
  await expect.poll(() => page.evaluate(() => (window as any).timelineResizeCommits.length)).toBe(1)
  await expect(timeline.locator('[data-testid="timeline-resize-start"][data-record-id="range"]')).toBeVisible()
  await expect.poll(() => scroll.getAttribute('data-visible-start')).not.toBe(before)
})

test('does not navigate when resizing the visible start while only the end is clipped', async ({ page }) => {
  await mountResizeTimeline(page, { start: '2026-10-12', end: '2026-10-25' })
  const timeline = page.getByTestId('database-timeline')
  const scroll = timeline.getByTestId('timeline-scroll')
  await expect(scroll).toHaveAttribute('data-visible-start', /\d+/)
  const before = await scroll.getAttribute('data-visible-start')
  await expect(timeline.locator('[data-testid="timeline-offscreen-right"][data-record-id="range"]')).toBeVisible()
  await resizeBy(page, '[data-testid="timeline-resize-start"][data-record-id="range"]', -36)
  await expect.poll(() => page.evaluate(() => (window as any).timelineResizeCommits.length)).toBe(1)
  await expect(scroll).toHaveAttribute('data-visible-start', before!)
})

test('keeps user horizontal navigation made while a clipped-end save is pending', async ({ page }) => {
  await mountResizeTimeline(page, { start: '2026-10-12', end: '2026-10-14' }, true)
  const timeline = page.getByTestId('database-timeline')
  const scroll = timeline.getByTestId('timeline-scroll')
  await expect(scroll).toHaveAttribute('data-visible-start', /\d+/)
  const before = await scroll.getAttribute('data-visible-start')
  await resizeBy(page, '[data-testid="timeline-resize-end"][data-record-id="range"]', 36 * 8)
  await expect.poll(() => page.evaluate(() => (window as any).timelineResizeCommits.length)).toBe(1)
  await scroll.evaluate((element: HTMLElement) => { element.scrollLeft += 300; element.dispatchEvent(new Event('scroll')) })
  await expect.poll(() => scroll.getAttribute('data-visible-start')).not.toBe(before)
  const navigatedStart = await scroll.getAttribute('data-visible-start')
  await page.evaluate(() => { (window as any).releaseTimelineResize() })
  await expect.poll(() => page.evaluate(() => (window as any).timelineResizeCompleted)).toBe(true)
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await expect(scroll).toHaveAttribute('data-visible-start', navigatedStart!)
})

test('delayed clipped-end success still reveals when the user has not navigated', async ({ page }) => {
  await mountResizeTimeline(page, { start: '2026-10-12', end: '2026-10-14' }, true)
  const timeline = page.getByTestId('database-timeline')
  const scroll = timeline.getByTestId('timeline-scroll')
  await expect(scroll).toHaveAttribute('data-visible-start', /\d+/)
  const before = await scroll.getAttribute('data-visible-start')
  await resizeBy(page, '[data-testid="timeline-resize-end"][data-record-id="range"]', 36 * 8)
  await expect.poll(() => page.evaluate(() => (window as any).timelineResizeCommits.length)).toBe(1)
  await page.evaluate(() => { (window as any).releaseTimelineResize() })
  await expect.poll(() => page.evaluate(() => (window as any).timelineResizeCompleted)).toBe(true)
  await expect.poll(() => scroll.getAttribute('data-visible-start')).not.toBe(before)
  await expect(timeline.locator('[data-testid="timeline-resize-end"][data-record-id="range"]')).toBeVisible()
})
