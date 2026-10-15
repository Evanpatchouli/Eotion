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
  anchor: HTMLElement | null
  recordId: string
  testId: string | null
}>

/**
 * `pressedElement` is the element the pointer went down on. The browser focuses a
 * button only after the pointerdown handler returns, so reading
 * `document.activeElement` here would usually capture the previous element (or the
 * body) and make the restore a no-op.
 */
export function captureTimelineBarFocus(recordId: string, pressedElement: HTMLElement | null): TimelineBarFocusReference {
  const active = typeof document === 'undefined' ? null : document.activeElement
  const element = pressedElement ?? (active instanceof HTMLElement ? active : null)
  return Object.freeze({
    element,
    anchor: element?.closest<HTMLElement>('.eotion-timeline-bar-anchor') ?? null,
    recordId,
    testId: element?.dataset.testid ?? null,
  })
}

/**
 * Restore the captured control after a mutation only when the interaction itself
 * dropped focus. Returns true when focus ended up on that control or its fallback.
 */
export function restoreTimelineBarFocus(reference: TimelineBarFocusReference): boolean {
  const { element, anchor, recordId, testId } = reference
  if (!anchor || !anchor.isConnected) return false
  const controls = Array.from(anchor.querySelectorAll<HTMLElement>('[data-record-id][data-testid]'))
  const matchesReference = (candidate: HTMLElement | null): candidate is HTMLElement => Boolean(
    candidate
    && candidate.isConnected
    && anchor.contains(candidate)
    && candidate.dataset.recordId === recordId,
  )
  const sameControl = matchesReference(element) && element.dataset.testid === testId
    ? element
    : controls.find(candidate => matchesReference(candidate) && candidate.dataset.testid === testId) ?? null
  const target = sameControl ?? controls
    .find(candidate => matchesReference(candidate) && candidate.dataset.testid === 'timeline-bar') ?? null
  if (!target) return false
  const active = document.activeElement
  if (active === target) return true
  if (active !== null && active !== document.body) return false
  try {
    target.focus({ preventScroll: true })
    return document.activeElement === target
  } catch {
    return false
  }
}
