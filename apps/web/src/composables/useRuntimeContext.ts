import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

export type LayoutMode = 'desktop' | 'tablet' | 'mobile'
export type InputMode = 'mouse' | 'touch' | 'hybrid'
export type Runtime = 'web' | 'electron' | 'mobile-webview'

function getLayoutMode(width: number): LayoutMode {
  if (width < 768) return 'mobile'
  if (width < 1200) return 'tablet'
  return 'desktop'
}

export function useRuntimeContext() {
  const width = ref(typeof window === 'undefined' ? 1440 : window.innerWidth)
  const coarsePointer = ref(false)

  const refresh = () => {
    width.value = window.innerWidth
    coarsePointer.value = window.matchMedia('(pointer: coarse)').matches
  }

  onMounted(() => {
    refresh()
    window.addEventListener('resize', refresh, { passive: true })
  })

  onBeforeUnmount(() => window.removeEventListener('resize', refresh))

  const runtime = computed<Runtime>(() => {
    if (window.eotionDesktop) return 'electron'
    if (window.navigator.userAgent.includes('EotionMobile')) return 'mobile-webview'
    return 'web'
  })

  const layoutMode = computed(() => getLayoutMode(width.value))
  const inputMode = computed<InputMode>(() => {
    if (!coarsePointer.value) return 'mouse'
    return width.value >= 768 ? 'hybrid' : 'touch'
  })

  return { width, runtime, layoutMode, inputMode }
}
