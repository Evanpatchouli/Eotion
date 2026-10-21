const initialFocusRoots: HTMLElement[] = []

/** Only synchronous overlay opening focus is exempt from a user's focus claim. */
export function withOverlayInitialFocus(root: HTMLElement, action: () => void): void {
  const length = initialFocusRoots.length
  initialFocusRoots.push(root)
  try { action() } finally { initialFocusRoots.length = length }
}

export function isOverlayInitialFocusTarget(target: EventTarget | null): boolean {
  return target instanceof Node && initialFocusRoots.some(root => root.contains(target))
}
