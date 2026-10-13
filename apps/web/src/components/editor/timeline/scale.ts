import { TIMELINE_VIEW_SCALES } from '@eotion/domain/database'
import type { Scale, TimelineScaleId, UnitStep } from './types'

const step = (unit: UnitStep['unit'], amount = 1): UnitStep => ({ unit, amount })

export const TIMELINE_SCALES: Record<TimelineScaleId, Scale> = {
  hour: { id: 'hour', majorUnit: step('day'), minorUnit: step('hour'), pxPerHour: 48, navigationUnit: step('day'), futureSnapUnit: step('minute', 15) },
  day: { id: 'day', majorUnit: step('day'), minorUnit: step('hour', 6), pxPerHour: 16, navigationUnit: step('day'), futureSnapUnit: step('hour') },
  week: { id: 'week', majorUnit: step('week'), minorUnit: step('day'), pxPerHour: 4, navigationUnit: step('week'), futureSnapUnit: step('day') },
  biweek: { id: 'biweek', majorUnit: step('week'), minorUnit: step('day'), pxPerHour: 8 / 3, navigationUnit: step('week', 2), futureSnapUnit: step('day') },
  month: { id: 'month', majorUnit: step('month'), minorUnit: step('day'), pxPerHour: 1.5, navigationUnit: step('month'), futureSnapUnit: step('day') },
  quarter: { id: 'quarter', majorUnit: step('quarter'), minorUnit: step('week'), pxPerHour: 0.5, navigationUnit: step('month', 3), futureSnapUnit: step('day') },
  year: { id: 'year', majorUnit: step('year'), minorUnit: step('month'), pxPerHour: 1 / 12, navigationUnit: step('year'), futureSnapUnit: step('month') },
}

export function getTimelineScale(id: TimelineScaleId): Scale {
  return TIMELINE_SCALES[id]
}

export function pxPerMs(id: TimelineScaleId): number {
  return getTimelineScale(id).pxPerHour / 3_600_000
}

export function getWeekStart(locale: string): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  try {
    const LocaleCtor = Intl.Locale as typeof Intl.Locale & { prototype: Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } } }
    const value = new LocaleCtor(locale) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } }
    const info = typeof value.getWeekInfo === 'function' ? value.getWeekInfo() : value.weekInfo
    if (info && info.firstDay >= 1 && info.firstDay <= 7) return (info.firstDay % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6
  } catch { /* Invalid / unsupported locale uses the documented fallback. */ }
  const normalized = locale.toLowerCase().replace('_', '-')
  if (normalized === 'en-us' || normalized.startsWith('en-us-')) return 0
  return 1
}

export { TIMELINE_VIEW_SCALES }
