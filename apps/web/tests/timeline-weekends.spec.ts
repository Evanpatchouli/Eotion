import { expect, test } from '@playwright/test'
import { calendarBoundary, timeToX } from '../src/components/editor/timeline/coordinates'
import { generateTimelineTicks } from '../src/components/editor/timeline/ruler'
import { pxPerMs } from '../src/components/editor/timeline/scale'
import type { Transform } from '../src/components/editor/timeline/types'
import { timelineLocalDate, timelineWeekendBands } from '../src/components/editor/timeline/weekends'

const instant = (date: string) => Date.parse(date)
const transform = (zone = 'UTC'): Transform => ({
  originMs: instant('2026-10-01T00:00:00.000Z'), pxPerMs: pxPerMs('month'), scrollLeft: 0,
  width: 1800, scale: 'month', generation: 0, displayTimeZone: zone,
})

test('wide month view keeps both days of every visible weekend when ruler labels are sampled', () => {
  const view = transform()
  const ticks = generateTimelineTicks({ transform: view, overscanStartMs: instant('2026-09-01T00:00:00Z'),
    overscanEndMs: instant('2026-12-01T00:00:00Z'), locale: 'zh-CN', weekStart: 1, budget: 80 })
  const bands = timelineWeekendBands('2026-10-01', '2026-11-19', view)
  expect(bands.map(band => band.date)).toEqual([
    '2026-10-03', '2026-10-04', '2026-10-10', '2026-10-11', '2026-10-17', '2026-10-18',
    '2026-10-24', '2026-10-25', '2026-10-31', '2026-11-01', '2026-11-07', '2026-11-08',
    '2026-11-14', '2026-11-15',
  ])
  expect(bands.some(band => !ticks.minor.some(tick => tick.boundaryMs === band.boundaryMs))).toBe(true)
  for (const band of bands) {
    expect(band.x).toBe(timeToX(calendarBoundary(band.date, 'UTC').instantMs, view))
    expect(band.width).toBeCloseTo(36)
  }
})

test('weekend widths follow display-zone DST and exclude unrelated scales', () => {
  const view = transform('America/New_York')
  const spring = timelineWeekendBands('2024-03-09', '2024-03-10', view)
  const autumn = timelineWeekendBands('2024-11-02', '2024-11-03', view)
  expect(spring.map(band => band.date)).toEqual(['2024-03-09', '2024-03-10'])
  expect(spring[1]!.width / view.pxPerMs).toBe(23 * 3_600_000)
  expect(autumn[1]!.width / view.pxPerMs).toBe(25 * 3_600_000)
  expect(timelineWeekendBands('2024-03-09', '2024-03-10', { ...view, scale: 'year' })).toEqual([])
  expect(timelineWeekendBands('2024-03-10', '2024-03-09', view)).toEqual([])
  expect(timelineLocalDate(instant('2026-10-18T16:30:00Z'), 'Asia/Shanghai')).toBe('2026-10-19')
})
