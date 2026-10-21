import { expect, test, type Page } from 'C:/Users/31250/Work/Eotion/apps/web/node_modules/@playwright/test/index.js'
import { openTimelineVisual, timelineVisualSelectors } from 'C:/Users/31250/Work/Eotion/apps/web/tests/helpers/timelineVisual'

test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })

async function captureTimeline(page: Page, options: { width: number; height: number; theme: 'light' | 'dark'; allUnscheduled?: boolean }, filename: string): Promise<void> {
  await openTimelineVisual(page, options)
  const databaseBlock = page.locator(`#database-block-${timelineVisualSelectors.blockId}`)
  const timeline = databaseBlock.getByTestId('database-timeline')
  const scroller = timeline.getByTestId('timeline-scroll')
  await expect(timeline).toBeVisible()
  await expect.poll(() => scroller.evaluate(element => element.offsetHeight - element.clientHeight)).toBeGreaterThan(0)
  await expect(timeline.locator('[data-timeline-frozen-row]')).toHaveCount(5)
  if (!options.allUnscheduled) {
    await expect(timeline.locator('[data-testid="timeline-bar"]')).toHaveCount(options.width === 390 ? 3 : 4)
    await expect(timeline.locator('[data-testid="timeline-unscheduled-row"]')).toHaveCount(1)
    await expect(timeline.locator('[data-testid="timeline-dependency-path"]')).toHaveCount(1)
  } else {
    await expect(timeline.getByText('暂无记录')).toHaveCount(0)
    await expect(timeline.locator('[data-testid="timeline-unscheduled-row"]')).toHaveCount(5)
  }
  if (options.width === 390) {
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.evaluate(async () => document.fonts.ready)
  try { await expect(page).toHaveScreenshot(filename) } finally { const actualPath = test.info().outputPath(filename); await page.screenshot({ path: actualPath, animations: 'disabled', caret: 'hide', scale: 'css' }); await test.info().attach('diagnostic-actual', { path: actualPath, contentType: 'image/png' }) }
}

test('Timeline desktop light', async ({ page }) => {
  await captureTimeline(page, { width: 1440, height: 900, theme: 'light' }, 'timeline-desktop-light.png')
})

test('Timeline desktop dark', async ({ page }) => {
  await captureTimeline(page, { width: 1440, height: 900, theme: 'dark' }, 'timeline-desktop-dark.png')
})

test('Timeline tablet light', async ({ page }) => {
  await captureTimeline(page, { width: 1024, height: 900, theme: 'light' }, 'timeline-tablet-light.png')
})

test.describe('Timeline mobile touch context', () => {
  test.use({ hasTouch: true, isMobile: true })

  test('Timeline mobile light', async ({ page }) => {
    await captureTimeline(page, { width: 390, height: 844, theme: 'light' }, 'timeline-mobile-light.png')
  })

  test('Timeline mobile dark', async ({ page }) => {
    await captureTimeline(page, { width: 390, height: 844, theme: 'dark' }, 'timeline-mobile-dark.png')
  })
})

test('Timeline all unscheduled', async ({ page }) => {
  await captureTimeline(page, { width: 1440, height: 900, theme: 'light', allUnscheduled: true }, 'timeline-all-unscheduled-desktop-light.png')
})
