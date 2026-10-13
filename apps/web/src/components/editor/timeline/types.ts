import { TIMELINE_VIEW_SCALES } from '@eotion/domain/database'

export type TimelineScaleId = typeof TIMELINE_VIEW_SCALES[number]
export type CalendarUnit = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year'
export type UnitStep = { unit: CalendarUnit; amount: number }

export type Scale = {
  id: TimelineScaleId
  majorUnit: UnitStep
  minorUnit: UnitStep
  pxPerHour: number
  navigationUnit: UnitStep
  futureSnapUnit: UnitStep
}

export type Transform = {
  originMs: number
  pxPerMs: number
  scrollLeft: number
  width: number
  scale: TimelineScaleId
  generation: number
  displayTimeZone: string
}

export type ViewportState = {
  width: number
  scrollLeft: number
  originMs: number
  scale: TimelineScaleId
  visibleStartMs: number
  visibleEndMs: number
  overscanStartMs: number
  overscanEndMs: number
  generation: number
  displayTimeZone: string
}

export type Tick = {
  key: string
  level: 'major' | 'minor'
  unit: CalendarUnit
  boundaryMs: number
  spanEndMs: number
  x: number
  width: number
  label: string
}

export type TimelineTransform = Transform
export type TimelineViewportState = ViewportState
export type TimelineTick = Tick
