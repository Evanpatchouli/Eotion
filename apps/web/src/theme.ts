import { readonly, ref } from 'vue'

export type ThemePreference = 'system' | 'light' | 'dark'
type ResolvedTheme = 'light' | 'dark'

const storageKey = 'eotion:theme'
const systemThemeQuery = '(prefers-color-scheme: dark)'

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(storageKey)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

const preference = ref<ThemePreference>(readPreference())
const resolved = ref<ResolvedTheme>('light')
export const themePreference = readonly(preference)
export const resolvedTheme = readonly(resolved)

let systemMedia: MediaQueryList | undefined
let initialized = false

function applyTheme(): void {
  const theme = preference.value === 'system'
    ? (systemMedia?.matches ? 'dark' : 'light')
    : preference.value
  resolved.value = theme
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#242424' : '#f7f7f5')
}

function onSystemThemeChange(): void {
  if (preference.value === 'system') applyTheme()
}

export function initializeTheme(): void {
  if (initialized) return
  initialized = true
  systemMedia = window.matchMedia(systemThemeQuery)
  systemMedia.addEventListener('change', onSystemThemeChange)
  applyTheme()
}

export function setThemePreference(value: ThemePreference): void {
  preference.value = value
  try {
    localStorage.setItem(storageKey, value)
  } catch {
    // The in-memory preference remains usable when storage is blocked.
  }
  if (!initialized) initializeTheme()
  else applyTheme()
}

export function useTheme() {
  return { themePreference, resolvedTheme, setThemePreference }
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    systemMedia?.removeEventListener('change', onSystemThemeChange)
    initialized = false
  })
}
