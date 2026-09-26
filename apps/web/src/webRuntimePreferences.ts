type ZoomEnvironment = Pick<ImportMetaEnv, 'VITE_ALLOW_PAGE_ZOOM'>

const originalViewportContent = new WeakMap<HTMLMetaElement, string>()

/** Applies Web-only touch preferences before the app mounts. */
export function applyWebRuntimePreferences(env: ZoomEnvironment = import.meta.env): void {
  const allowPageZoom = env.VITE_ALLOW_PAGE_ZOOM !== 'false'
  document.documentElement.classList.toggle(
    'eotion-page-zoom-disabled',
    !allowPageZoom,
  )

  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
  if (!viewport) return

  let original = originalViewportContent.get(viewport)
  if (original === undefined) {
    original = viewport.content
    originalViewportContent.set(viewport, original)
  }
  viewport.content = allowPageZoom ? original : `${original}, maximum-scale=1.0, user-scalable=no`
}
