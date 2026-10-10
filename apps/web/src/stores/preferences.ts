import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { defaultDeviceOpeningConfig, isOpeningMode, normalizeOpeningConfig, type DeviceOpeningConfig, type ProductLayoutMode } from '../components/ui/productOverlay'

// Device-local UI preference. Encode IDs separately to avoid key collisions.
const toolbarKey = (userId: string, workspaceId: string) =>
  `eotion:editor-toolbar:${encodeURIComponent(userId)}:${encodeURIComponent(workspaceId)}`

export type DatabaseOpeningTarget = 'record' | 'property'
const databaseOpeningKey = (userId: string, workspaceId: string, databaseId: string, target: DatabaseOpeningTarget) =>
  `eotion:database-opening:${encodeURIComponent(userId)}:${encodeURIComponent(workspaceId)}:${encodeURIComponent(databaseId)}:${target}`

export const usePreferencesStore = defineStore('preferences', () => {
  const values = reactive<Record<string, boolean>>({})
  const openingValues = reactive<Record<string, DeviceOpeningConfig>>({})

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

  function databaseOpening(userId: string, workspaceId: string, databaseId: string, target: DatabaseOpeningTarget): DeviceOpeningConfig {
    if (!userId || !workspaceId || !databaseId) return { ...defaultDeviceOpeningConfig }
    const key = databaseOpeningKey(userId, workspaceId, databaseId, target)
    if (!(key in openingValues)) {
      try { openingValues[key] = normalizeOpeningConfig(JSON.parse(localStorage.getItem(key) ?? 'null')) }
      catch { openingValues[key] = { ...defaultDeviceOpeningConfig } }
    }
    return openingValues[key]!
  }

  function setDatabaseOpening(userId: string, workspaceId: string, databaseId: string, target: DatabaseOpeningTarget, layout: ProductLayoutMode, mode: DeviceOpeningConfig[ProductLayoutMode]): void {
    if (!userId || !workspaceId || !databaseId || !isOpeningMode(layout, mode)) return
    const key = databaseOpeningKey(userId, workspaceId, databaseId, target)
    const next = { ...databaseOpening(userId, workspaceId, databaseId, target), [layout]: mode }
    openingValues[key] = next
    try { localStorage.setItem(key, JSON.stringify(next)) }
    catch { /* Preserve this session's choice if device storage is unavailable. */ }
  }

  return { toolbarVisible, setToolbarVisible, databaseOpening, setDatabaseOpening }
})
