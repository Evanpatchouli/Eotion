import { timeToX } from './coordinates'
import type { Transform } from './types'
import type { TimelineTemporalGeometry } from './geometry'
import type { TimelineItemProjection } from './projection'

export const TIMELINE_ROW_HEIGHT = 48
export const TIMELINE_BAR_HEIGHT = 32
export const TIMELINE_HEADER_HEIGHT = 56
const ROW_OVERSCAN = 5

export type TimelineRowWindow = {
  first: number
  last: number
  top: number
  height: number
  totalHeight: number
  focusedRowIndex: number | null
}

export type TimelineItemGeometry = {
  recordId: string
  kind: 'point' | 'range'
  x: number
  width: number
  rawX: number
  rawWidth: number
  rowIndex: number
  rowTop: number
  top: number
  height: number
  clippedLeft: boolean
  clippedRight: boolean
  offscreen?: 'left' | 'right'
  diagnostic?: 'calendar-day-skipped'
  marker?: boolean
}

export type TimelineRowGeometry = {
  item: TimelineItemProjection
  rowIndex: number
  top: number
  height: number
  geometry: TimelineItemGeometry | null
}

type ScheduledTimelineItem = Extract<TimelineItemProjection, { kind: 'point' | 'range' }>

export function timelineRowWindow(args: { count: number; visibleTop: number; visibleBottom: number; focusedRowIndex?: number | null }): TimelineRowWindow {
  const count = Math.max(0, Math.floor(args.count))
  const totalHeight = count * TIMELINE_ROW_HEIGHT
  const requestedFocus = args.focusedRowIndex
  const focusedRowIndex = requestedFocus !== undefined && requestedFocus !== null && requestedFocus >= 0 && requestedFocus < count
    ? Math.floor(requestedFocus)
    : null
  if (count < 200) return { first: 0, last: count, top: 0, height: totalHeight, totalHeight, focusedRowIndex }
  const top = Math.max(0, Math.min(totalHeight, Number.isFinite(args.visibleTop) ? args.visibleTop : 0))
  const bottom = Math.max(top, Math.min(totalHeight, Number.isFinite(args.visibleBottom) ? args.visibleBottom : top))
  const first = Math.max(0, Math.floor(top / TIMELINE_ROW_HEIGHT) - ROW_OVERSCAN)
  const last = Math.min(count, Math.ceil(bottom / TIMELINE_ROW_HEIGHT) + ROW_OVERSCAN)
  return { first, last, top: first * TIMELINE_ROW_HEIGHT, height: Math.max(0, (last - first) * TIMELINE_ROW_HEIGHT), totalHeight, focusedRowIndex }
}

function visibleIndices(items: readonly TimelineItemProjection[], window: TimelineRowWindow): number[] {
  const indices: number[] = []
  for (let index = Math.max(0, window.first); index < Math.min(items.length, window.last); index++) indices.push(index)
  const focused = window.focusedRowIndex
  if (focused !== null && focused >= 0 && focused < items.length && (focused < window.first || focused >= window.last)) indices.push(focused)
  return indices.sort((a, b) => a - b)
}

export function layoutTimelineItem(item: ScheduledTimelineItem, temporal: TimelineTemporalGeometry, rowIndex: number, state: Transform): TimelineItemGeometry {
  const rawX = timeToX(temporal.startMs, state)
  const rawEndX = temporal.visualEndMs === null ? rawX : timeToX(temporal.visualEndMs, state)
  const rawWidth = Math.max(0, rawEndX - rawX)
  const isPoint = item.kind === 'point' || rawWidth === 0
  const viewportLeft = state.scrollLeft
  const viewportRight = state.scrollLeft + Math.max(0, state.width)
  const fullyLeft = rawWidth === 0 ? rawX < viewportLeft : rawX + rawWidth <= viewportLeft
  const fullyRight = rawWidth === 0 ? rawX >= viewportRight : rawX >= viewportRight
  const offscreen = fullyLeft ? 'left' : fullyRight ? 'right' : undefined
  const x = rawWidth === 0 ? rawX : Math.max(viewportLeft, rawX)
  const right = rawWidth === 0 ? rawEndX : Math.min(viewportRight, rawEndX)
  const width = rawWidth === 0 ? 0 : Math.max(0, right - x)
  const rowTop = rowIndex * TIMELINE_ROW_HEIGHT
  return {
    recordId: item.recordId,
    kind: item.kind,
    x,
    width,
    rawX,
    rawWidth,
    rowIndex,
    rowTop,
    top: rowTop + (TIMELINE_ROW_HEIGHT - TIMELINE_BAR_HEIGHT) / 2,
    height: TIMELINE_BAR_HEIGHT,
    clippedLeft: rawX < viewportLeft && rawWidth > 0,
    clippedRight: rawEndX > viewportRight && rawWidth > 0,
    ...(offscreen ? { offscreen } : {}),
    ...(temporal.diagnostic ? { diagnostic: temporal.diagnostic } : {}),
    ...(isPoint ? { marker: true } : {}),
  }
}

export function layoutTimelineItems(items: readonly TimelineItemProjection[], temporalMap: ReadonlyMap<string, TimelineTemporalGeometry>, state: Transform, rowWindow: TimelineRowWindow): TimelineRowGeometry[] {
  return visibleIndices(items, rowWindow).map(rowIndex => {
    const item = items[rowIndex]!
    const top = rowIndex * TIMELINE_ROW_HEIGHT
    const temporal = temporalMap.get(item.recordId)
    return {
      item,
      rowIndex,
      top,
      height: TIMELINE_ROW_HEIGHT,
      geometry: item.kind === 'unscheduled' || !temporal ? null : layoutTimelineItem(item, temporal, rowIndex, state),
    }
  })
}
