import { defineStore } from 'pinia'
import { reactive } from 'vue'

// Device-local UI preference. Encode IDs separately to avoid key collisions.
const toolbarKey = (userId: string, workspaceId: string) =>
  `eotion:editor-toolbar:${encodeURIComponent(userId)}:${encodeURIComponent(workspaceId)}`

export const usePreferencesStore = defineStore('preferences', () => {
  const values = reactive<Record<string, boolean>>({})

  function toolbarVisible(userId: string, workspaceId: string): boolean {
    if (!userId || !workspaceId) return false
    const key = toolbarKey(userId, workspaceId)
    if (!(key in values)) {
      try { values[key] = localStorage.getItem(key) === 'true' }
      catch { values[key] = false }
    }
    return values[key] ?? false
  }

  function setToolbarVisible(userId: string, workspaceId: string, visible: boolean): void {
    if (!userId || !workspaceId) return
    const key = toolbarKey(userId, workspaceId)
    values[key] = visible
    try { localStorage.setItem(key, String(visible)) }
    catch { /* Preserve this session's choice if device storage is unavailable. */ }
  }

  return { toolbarVisible, setToolbarVisible }
})
