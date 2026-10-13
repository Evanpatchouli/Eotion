import { addCalendar, timelineInstantBounds } from './coordinates'
import { getTimelineScale, pxPerMs } from './scale'
import type { TimelineScaleId, Transform, ViewportState } from './types'

export const canvasWidth = (width: number): number => Math.max(16_384, Math.min(262_144, width * 16))
const clampInstant = (ms: number, zone: string): number => {
  const bounds = timelineInstantBounds(zone)
  return Math.max(bounds.minMs, Math.min(bounds.maxMsExclusive - 1, ms))
}
const centerOf = (state: ViewportState): number => (state.visibleStartMs + state.visibleEndMs) / 2

function makeState(width: number, centerMs: number, scale: TimelineScaleId, displayTimeZone: string, generation: number): ViewportState | null {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(centerMs)) return null
  const boundedCenter = clampInstant(centerMs, displayTimeZone)
  const canvas = canvasWidth(width)
  const scrollLeft = (canvas - width) / 2
  const rho = pxPerMs(scale)
  const originMs = boundedCenter - (scrollLeft + width / 2) / rho
  const visibleStartMs = originMs + scrollLeft / rho
  const visibleEndMs = visibleStartMs + width / rho
  const overscanMs = width / (2 * rho)
  return { width, scrollLeft, originMs, scale, visibleStartMs, visibleEndMs, overscanStartMs: visibleStartMs - overscanMs, overscanEndMs: visibleEndMs + overscanMs, generation, displayTimeZone }
}

export function createViewport(input: { width: number; centerMs: number; scale: TimelineScaleId; displayTimeZone: string; generation?: number }): ViewportState | null {
  return makeState(input.width, input.centerMs, input.scale, input.displayTimeZone, input.generation ?? 0)
}

export function deriveViewport(state: ViewportState): ViewportState {
  const rho = pxPerMs(state.scale)
  const visibleStartMs = state.originMs + state.scrollLeft / rho
  const visibleEndMs = visibleStartMs + state.width / rho
  const overscanMs = state.width / (2 * rho)
  return { ...state, visibleStartMs, visibleEndMs, overscanStartMs: visibleStartMs - overscanMs, overscanEndMs: visibleEndMs + overscanMs }
}

/** Match native pixel rounding without moving the logical visible time window. */
export function alignViewportScroll(state: ViewportState, actualScrollLeft: number): ViewportState {
  if (!Number.isFinite(actualScrollLeft) || actualScrollLeft < 0 || actualScrollLeft > canvasWidth(state.width) - state.width) {
    throw new RangeError('Native scroll offset is outside the timeline canvas')
  }
  if (actualScrollLeft === state.scrollLeft) return state
  const originMs = state.originMs + (state.scrollLeft - actualScrollLeft) / pxPerMs(state.scale)
  return deriveViewport({ ...state, originMs, scrollLeft: actualScrollLeft, generation: state.generation + 1 })
}

export function updateViewport(state: ViewportState, patch: { width?: number; scrollLeft?: number; scale?: TimelineScaleId; displayTimeZone?: string }): ViewportState | null {
  const center = centerOf(state)
  const width = patch.width ?? state.width
  const scale = patch.scale ?? state.scale
  const zone = patch.displayTimeZone ?? state.displayTimeZone
  if (patch.width !== undefined || patch.scale !== undefined || patch.displayTimeZone !== undefined) {
    return makeState(width, center, scale, zone, state.generation + 1)
  }
  if (patch.scrollLeft !== undefined) {
    const scrolled = deriveViewport({ ...state, scrollLeft: patch.scrollLeft })
    const center = centerOf(scrolled)
    const bounds = timelineInstantBounds(zone)
    if (center < bounds.minMs || center >= bounds.maxMsExclusive) {
      return makeState(width, clampInstant(center, zone), scale, zone, state.generation + 1)
    }
    return rebaseViewport(scrolled)
  }
  return state
}

export function centerViewport(state: ViewportState, instantMs: number): ViewportState | null {
  return makeState(state.width, instantMs, state.scale, state.displayTimeZone, state.generation + 1)
}

export function stepViewport(state: ViewportState, direction: -1 | 1): ViewportState | null {
  const scale = getTimelineScale(state.scale)
  const target = addCalendar(centerOf(state), { ...scale.navigationUnit, amount: scale.navigationUnit.amount * direction }, state.displayTimeZone)
  return centerViewport(state, target)
}

export function rebaseViewport(state: ViewportState): ViewportState {
  state = deriveViewport(state)
  const center = centerOf(state)
  const bounds = timelineInstantBounds(state.displayTimeZone)
  if (center < bounds.minMs || center >= bounds.maxMsExclusive) {
    return makeState(state.width, clampInstant(center, state.displayTimeZone), state.scale, state.displayTimeZone, state.generation + 1) ?? state
  }
  const canvas = canvasWidth(state.width)
  const maxScroll = canvas - state.width
  const edge = maxScroll * 0.25
  if (state.scrollLeft >= edge && state.scrollLeft <= maxScroll - edge) return state
  const rho = pxPerMs(state.scale)
  const contentInstantAtLeft = state.originMs + state.scrollLeft / rho
  const scrollLeft = maxScroll / 2
  const originMs = contentInstantAtLeft - scrollLeft / rho
  return { ...deriveViewport({ ...state, originMs, scrollLeft, generation: state.generation + 1 }) }
}

export function viewportTransform(state: ViewportState): Transform {
  return { originMs: state.originMs, pxPerMs: pxPerMs(state.scale), scrollLeft: state.scrollLeft, width: state.width, scale: state.scale, generation: state.generation, displayTimeZone: state.displayTimeZone }
}
