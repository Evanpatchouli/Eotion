import { expect, test } from '@playwright/test'
import { openTimelineVisual } from './helpers/timelineVisual'

test.use({ locale: 'zh-CN', timezoneId: 'Asia/Shanghai' })

test('时间轴显示今天、周末和单日期标题，导航不修改记录', async ({ page }) => {
  const writes: string[] = []
  page.on('request', request => {
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method()) && new URL(request.url()).pathname.includes('/databases/')) writes.push(request.url())
  })
  await openTimelineVisual(page, { width: 1440, height: 900, theme: 'light' })
  const timeline = page.getByTestId('database-timeline')
  await expect(timeline).toHaveAttribute('data-scale', 'month')
  await expect(timeline.locator('[data-today="true"]')).toHaveCount(1)
  await expect(timeline.getByTestId('timeline-today-line')).toBeVisible()

  const weekends = timeline.getByTestId('timeline-weekend')
  await expect.poll(() => weekends.count()).toBeGreaterThan(0)
  const boundaries = await weekends.evaluateAll(elements => elements.map(element => Number(element.getAttribute('data-boundary-ms'))))
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', weekday: 'short' })
  expect(boundaries.every(instant => ['Sat', 'Sun'].includes(formatter.format(new Date(instant))))).toBe(true)

  const marker = timeline.getByTestId('timeline-bar').filter({ hasText: '上线评审' })
  await expect(marker).toHaveAttribute('data-marker', 'true')
  await expect(marker.locator('.eotion-timeline-bar-title')).toBeVisible()
  const titleBox = await marker.locator('.eotion-timeline-bar-title').boundingBox()
  expect(titleBox?.width).toBeGreaterThan(10)

  await timeline.getByLabel('时间轴刻度').selectOption('week')
  await expect(timeline).toHaveAttribute('data-scale', 'week')
  await timeline.getByLabel('下一个时间段').click()
  await timeline.getByRole('button', { name: '今天', exact: true }).click()
  await expect(timeline.locator('[data-today="true"]')).toHaveCount(1)
  expect(writes).toEqual([])
})
