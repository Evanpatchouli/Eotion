import type { WorkspaceResponse } from '@eotion/contracts'
import { ApiError } from '@eotion/sdk'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { createLocalId } from '@eotion/storage'
import { api, errorMessage, expireSessionFromApi } from '../services/productApi'

const preferredWorkspaceKey = (userId: string) => `eotion:preferred-workspace:${userId}`

export const useProductWorkspacesStore = defineStore('product-workspaces', () => {
  const items = ref<WorkspaceResponse[]>([])
  const loaded = ref(false)
  const loading = ref(false)
  const error = ref('')
  const createPending = ref(false)
  const renamePending = ref(false)
  const mutationError = ref('')

  let sessionEpoch = 0
  let loadRequestId = 0
  let loadPromise: Promise<void> | null = null

  function load(force = false): Promise<void> {
    if (loaded.value && !force) return Promise.resolve()
    if (loading.value && loadPromise && !force) return loadPromise

    const requestEpoch = sessionEpoch
    const requestId = ++loadRequestId
    loading.value = true
    error.value = ''
    const request = api.workspaces.list().then((workspaces) => {
      if (requestEpoch !== sessionEpoch || requestId !== loadRequestId) return
      items.value = workspaces
      loaded.value = true
    }).catch((cause: unknown) => {
      if (requestEpoch !== sessionEpoch || requestId !== loadRequestId) return
      error.value = errorMessage(cause, '无法加载工作区，请重试。')
      if (cause instanceof ApiError && cause.statusCode === 401) expireSessionFromApi()
    }).finally(() => {
      if (requestEpoch === sessionEpoch && requestId === loadRequestId) {
        loading.value = false
        loadPromise = null
      }
    })
    loadPromise = request
    return request
  }

  function reset(): void {
    sessionEpoch += 1
    loadRequestId += 1
    items.value = []
    loaded.value = false
    loading.value = false
    error.value = ''
    createPending.value = false
    renamePending.value = false
    mutationError.value = ''
    loadPromise = null
  }

  async function create(name: string): Promise<WorkspaceResponse | null> {
    if (createPending.value) return null
    const trimmedName = name.trim()
    mutationError.value = ''
    if (!trimmedName || trimmedName.length > 200) {
      mutationError.value = !trimmedName ? '请输入工作区名称。' : '工作区名称不能超过 200 个字符。'
      return null
    }
    createPending.value = true
    const requestEpoch = sessionEpoch
    try {
      const workspace = await api.workspaces.create({ id: createLocalId(), name: trimmedName })
      if (requestEpoch !== sessionEpoch) return null
      items.value.push(workspace)
      loaded.value = true
      return workspace
    } catch (cause: unknown) {
      if (requestEpoch === sessionEpoch) {
        mutationError.value = errorMessage(cause, '创建工作区失败，请重试。')
        if (cause instanceof ApiError && cause.statusCode === 401) expireSessionFromApi()
      }
      return null
    } finally {
      if (requestEpoch === sessionEpoch) createPending.value = false
    }
  }

  async function rename(id: string, name: string): Promise<WorkspaceResponse | null> {
    if (renamePending.value) return null
    const trimmedName = name.trim()
    mutationError.value = ''
    if (!trimmedName || trimmedName.length > 200) {
      mutationError.value = !trimmedName ? '请输入工作区名称。' : '工作区名称不能超过 200 个字符。'
      return null
    }
    renamePending.value = true
    const requestEpoch = sessionEpoch
    try {
      const workspace = await api.workspaces.update(id, { name: trimmedName })
      if (requestEpoch !== sessionEpoch) return null
      const index = items.value.findIndex((item) => item.id === id)
      if (index !== -1) items.value[index] = workspace
      return workspace
    } catch (cause: unknown) {
      if (requestEpoch === sessionEpoch) {
        mutationError.value = errorMessage(cause, '重命名工作区失败，请重试。')
        if (cause instanceof ApiError && cause.statusCode === 401) expireSessionFromApi()
      }
      return null
    } finally {
      if (requestEpoch === sessionEpoch) renamePending.value = false
    }
  }

  function preferredId(userId: string): string | null {
    if (!userId || items.value.length === 0) return null
    try {
      const rememberedId = localStorage.getItem(preferredWorkspaceKey(userId))
      if (rememberedId && items.value.some((item) => item.id === rememberedId)) return rememberedId
    } catch {
      // Storage availability does not affect workspace selection.
    }
    return items.value[0]?.id ?? null
  }

  function remember(userId: string, id: string): void {
    if (!userId || !items.value.some((item) => item.id === id)) return
    try {
      localStorage.setItem(preferredWorkspaceKey(userId), id)
    } catch {
      // Storage availability does not affect workspace selection.
    }
  }

  return { items, loaded, loading, error, createPending, renamePending, mutationError, load, reset, create, rename, preferredId, remember }
})
