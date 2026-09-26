type ZoomEnvironment = Pick<ImportMetaEnv, 'VITE_DISABLE_DOUBLE_TAP_ZOOM' | 'VITE_DISABLE_PINCH_ZOOM'>

const originalViewportContent = new WeakMap<HTMLMetaElement, string>()

/** Applies Web-only touch preferences before the app mounts. */
export function applyWebRuntimePreferences(env: ZoomEnvironment = import.meta.env): void {
  document.documentElement.classList.toggle(
    'eotion-disable-double-tap-zoom',
    env.VITE_DISABLE_DOUBLE_TAP_ZOOM === 'true',
  )

  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
  if (!viewport) return

  let original = originalViewportContent.get(viewport)
  if (original === undefined) {
    original = viewport.content
    originalViewportContent.set(viewport, original)
  }
  viewport.content = env.VITE_DISABLE_PINCH_ZOOM === 'true'
    ? `${original}, maximum-scale=1.0, user-scalable=no`
    : original
}
