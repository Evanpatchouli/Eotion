import type { PageResponse } from '@eotion/contracts'
import { ApiError } from '@eotion/sdk'
import { createLocalId } from '@eotion/storage'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { api, errorMessage, expireSessionFromApi } from '../services/productApi'
import { nextOrderKey } from '../utils/pageTree'

export const DEFAULT_PAGE_TITLE = '无标题'

/**
 * Page state for one workspace at a time.
 *
 * The store is keyed by workspace: switching workspaces clears the previous
 * list immediately, and every mutation checks that it still belongs to the
 * active workspace so a stale response cannot leak pages across workspaces.
 */
export const useProductPagesStore = defineStore('product-pages', () => {
  const forWorkspaceId = ref('')
  const items = ref<PageResponse[]>([])
  const loaded = ref(false)
  const loading = ref(false)
  const error = ref('')

  const createPending = ref(false)
  const createError = ref('')
  const renamePending = ref(false)
  const renameError = ref('')
  const movePending = ref(false)
  const moveError = ref('')
  const deletePending = ref(false)
  const deleteError = ref('')

  let epoch = 0
  let loadRequestId = 0
  let loadPromise: Promise<void> | null = null

  function clearMutationState(): void {
    createPending.value = false
    createError.value = ''
    renamePending.value = false
    renameError.value = ''
    movePending.value = false
    moveError.value = ''
    deletePending.value = false
    deleteError.value = ''
  }

  function replace(updated: PageResponse): void {
    const index = items.value.findIndex((page) => page.id === updated.id)
    if (index !== -1) items.value[index] = updated
  }

  function expired(cause: unknown): void {
    if (cause instanceof ApiError && cause.statusCode === 401) expireSessionFromApi()
  }

  function load(workspaceId: string, force = false): Promise<void> {
    if (workspaceId === forWorkspaceId.value && loaded.value && !force) return Promise.resolve()
    if (workspaceId === forWorkspaceId.value && loading.value && loadPromise && !force) return loadPromise

    epoch += 1
    const requestEpoch = epoch
    const requestId = ++loadRequestId
    forWorkspaceId.value = workspaceId
    items.value = []
    loaded.value = false
    loading.value = true
    error.value = ''
    clearMutationState()
    const request = api.pages.list(workspaceId).then((pages) => {
      if (requestEpoch !== epoch || requestId !== loadRequestId) return
      items.value = pages
      loaded.value = true
    }).catch((cause: unknown) => {
      if (requestEpoch !== epoch || requestId !== loadRequestId) return
      error.value = errorMessage(cause, '无法加载页面，请重试。')
      expired(cause)
    }).finally(() => {
      if (requestEpoch === epoch && requestId === loadRequestId) {
        loading.value = false
        loadPromise = null
      }
    })
    loadPromise = request
    return request
  }

  function reset(): void {
    epoch += 1
    loadRequestId += 1
    forWorkspaceId.value = ''
    items.value = []
    loaded.value = false
    loading.value = false
    error.value = ''
    clearMutationState()
    loadPromise = null
  }

  async function create(workspaceId: string, parentPageId: string | null): Promise<PageResponse | null> {
    if (workspaceId !== forWorkspaceId.value || !loaded.value || loading.value || error.value || createPending.value) return null
    createPending.value = true
    createError.value = ''
    const requestEpoch = epoch
    try {
      const siblings = items.value.filter((page) => page.parentPageId === parentPageId)
      const created = await api.pages.create(workspaceId, {
        id: createLocalId(),
        parentPageId,
        title: DEFAULT_PAGE_TITLE,
        orderKey: nextOrderKey(siblings),
      })
      if (requestEpoch !== epoch) return null
      items.value.push(created)
      return created
    } catch (cause: unknown) {
      if (requestEpoch === epoch) {
        createError.value = errorMessage(cause, '创建页面失败，请重试。')
        expired(cause)
      }
      return null
    } finally {
      if (requestEpoch === epoch) createPending.value = false
    }
  }

  async function rename(workspaceId: string, pageId: string, title: string): Promise<PageResponse | null> {
    if (workspaceId !== forWorkspaceId.value) return null
    const trimmedTitle = title.trim()
    renameError.value = ''
    if (!trimmedTitle || trimmedTitle.length > 200) {
      renameError.value = !trimmedTitle ? '请输入页面标题。' : '页面标题不能超过 200 个字符。'
      return null
    }
    if (renamePending.value) return null
    renamePending.value = true
    const requestEpoch = epoch
    try {
      const updated = await api.pages.update(workspaceId, pageId, { title: trimmedTitle })
      if (requestEpoch !== epoch) return null
      replace(updated)
      return updated
    } catch (cause: unknown) {
      if (requestEpoch === epoch) {
        renameError.value = errorMessage(cause, '重命名页面失败，请重试。')
        expired(cause)
      }
      return null
    } finally {
      if (requestEpoch === epoch) renamePending.value = false
    }
  }

  async function move(workspaceId: string, pageId: string, parentPageId: string | null): Promise<PageResponse | null> {
    if (workspaceId !== forWorkspaceId.value || movePending.value) return null
    movePending.value = true
    moveError.value = ''
    const requestEpoch = epoch
    try {
      const siblings = items.value.filter((page) => page.parentPageId === parentPageId && page.id !== pageId)
      const moved = await api.pages.move(workspaceId, pageId, { parentPageId, orderKey: nextOrderKey(siblings) })
      if (requestEpoch !== epoch) return null
      replace(moved)
      return moved
    } catch (cause: unknown) {
      if (requestEpoch === epoch) {
        moveError.value = errorMessage(cause, '移动页面失败，请重试。')
        expired(cause)
      }
      return null
    } finally {
      if (requestEpoch === epoch) movePending.value = false
    }
  }

  async function remove(workspaceId: string, pageId: string): Promise<boolean> {
    if (workspaceId !== forWorkspaceId.value || deletePending.value) return false
    deletePending.value = true
    deleteError.value = ''
    const requestEpoch = epoch
    try {
      await api.pages.delete(workspaceId, pageId)
      if (requestEpoch !== epoch) return false
      items.value = items.value.filter((page) => page.id !== pageId)
      return true
    } catch (cause: unknown) {
      if (requestEpoch === epoch) {
        deleteError.value = errorMessage(cause, '删除页面失败，请重试。')
        expired(cause)
      }
      return false
    } finally {
      if (requestEpoch === epoch) deletePending.value = false
    }
  }

  function pageById(pageId: string): PageResponse | null {
    return items.value.find((page) => page.id === pageId) ?? null
  }

  return {
    forWorkspaceId,
    items,
    loaded,
    loading,
    error,
    createPending,
    createError,
    renamePending,
    renameError,
    movePending,
    moveError,
    deletePending,
    deleteError,
    load,
    reset,
    create,
    rename,
    move,
    remove,
    pageById,
  }
})
