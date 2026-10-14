/**
 * P11.3C accessible-feedback helpers.
 *
 * A Timeline pointer interaction must survive the canonical refresh that follows
 * a mutation without moving focus to the document body. The reference is taken
 * when the pointer goes down and is only re-applied when focus was actually lost
 * from the bar (not when the user moved on to the Drawer, the Frozen row or the
 * Table).
 */
export type TimelineBarFocusReference = Readonly<{
  element: HTMLElement | null
  recordId: string
}>

export function captureTimelineBarFocus(recordId: string): TimelineBarFocusReference {
  const active = typeof document === 'undefined' ? null : document.activeElement
  return Object.freeze({ element: active instanceof HTMLElement ? active : null, recordId })
}

function isTimelineInteractionElement(element: Element | null): boolean {
  return element?.closest('[data-testid="timeline-bar"], [data-testid^="timeline-resize-"]') !== null
}

/**
 * Re-focus the bar after a mutation only when the interaction itself dropped
 * focus. Returns true when focus ended up on the bar.
 */
export function restoreTimelineBarFocus(reference: TimelineBarFocusReference): boolean {
  const element = reference.element
  if (!element || !element.isConnected) return false
  if (element.dataset.recordId !== reference.recordId) return false
  const active = document.activeElement
  if (active === element) return true
  const focusMovedOn = active !== null && active !== document.body && !isTimelineInteractionElement(active)
  if (focusMovedOn) return false
  try {
    element.focus({ preventScroll: true })
    return document.activeElement === element
  } catch {
    return false
  }
}
