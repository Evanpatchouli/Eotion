import type { PageResponse } from '@eotion/contracts'
import { createLocalId } from '@eotion/storage'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { nextOrderKey } from '../utils/pageTree'
import { useProductSyncStore } from './productSync'

export const DEFAULT_PAGE_TITLE = '无标题'
export const OFFLINE_WORKSPACE_MESSAGE = '此工作区尚未保存到本机，当前离线无法打开。'

export const useProductPagesStore = defineStore('product-pages', () => {
  const forWorkspaceId = ref('')
  const items = ref<PageResponse[]>([])
  const loaded = ref(false)
  const loading = ref(false)
  const error = ref('')
  const createPending = ref(false), createError = ref('')
  const renamePending = ref(false), renameError = ref('')
  const movePending = ref(false), moveError = ref('')
  const deletePending = ref(false), deleteError = ref('')
  let epoch = 0
  let loadPromise: Promise<void> | null = null

  function reset(): void {
    epoch += 1
    forWorkspaceId.value = ''
    items.value = []
    loaded.value = false
    loading.value = false
    error.value = ''
    loadPromise = null
  }

  async function refresh(workspaceId = forWorkspaceId.value): Promise<void> {
    if (!workspaceId || workspaceId !== forWorkspaceId.value) return
    const requestEpoch = epoch
    const local = await useProductSyncStore().store()
    if (requestEpoch !== epoch || workspaceId !== forWorkspaceId.value) return
    if (!loaded.value) {
      if (loading.value || !(await local.hasWorkspaceSnapshot(workspaceId))) return
      if (requestEpoch !== epoch || workspaceId !== forWorkspaceId.value) return
      await load(workspaceId)
      return
    }
    const pages = await local.listPagesByWorkspace(workspaceId)
    if (requestEpoch === epoch) items.value = pages as PageResponse[]
  }

  function load(workspaceId: string, force = false): Promise<void> {
    if (workspaceId === forWorkspaceId.value && loaded.value && !force) return Promise.resolve()
    if (workspaceId === forWorkspaceId.value && loadPromise && !force) return loadPromise
    const requestEpoch = ++epoch
    forWorkspaceId.value = workspaceId
    items.value = []
    loaded.value = false
    loading.value = true
    error.value = ''
    const request = (async () => {
      try {
        const sync = useProductSyncStore()
        const ready = await sync.prepare(workspaceId)
        if (requestEpoch !== epoch) return
        if (!ready) {
          error.value = sync.state === 'offline' ? OFFLINE_WORKSPACE_MESSAGE : (sync.error || '暂时无法加载工作区快照，请重试。')
          return
        }
        items.value = await (await sync.store()).listPagesByWorkspace(workspaceId) as PageResponse[]
        loaded.value = true
      } catch (cause) {
        if (requestEpoch === epoch) error.value = cause instanceof Error ? cause.message : '无法加载本地页面。'
      } finally {
        if (requestEpoch === epoch) { loading.value = false; loadPromise = null }
      }
    })()
    loadPromise = request
    return request
  }

  async function create(workspaceId: string, parentPageId: string | null): Promise<PageResponse | null> {
    if (workspaceId !== forWorkspaceId.value || !loaded.value || loading.value || createPending.value) return null
    createPending.value = true
    createError.value = ''
    const requestEpoch = epoch
    try {
      const now = new Date().toISOString()
      const created: PageResponse = {
        id: createLocalId(), workspaceId, parentPageId, title: DEFAULT_PAGE_TITLE,
        orderKey: nextOrderKey(items.value.filter((page) => page.parentPageId === parentPageId)),
        createdAt: now, updatedAt: now,
      }
      await (await useProductSyncStore().store()).upsertPage(created)
      if (requestEpoch === epoch) items.value.push(created)
      useProductSyncStore().localMutation()
      return requestEpoch === epoch ? created : null
    } catch (cause) {
      if (requestEpoch === epoch) createError.value = cause instanceof Error ? cause.message : '创建页面失败。'
      return null
    } finally { if (requestEpoch === epoch) createPending.value = false }
  }

  async function rename(workspaceId: string, pageId: string, title: string): Promise<PageResponse | null> {
    if (workspaceId !== forWorkspaceId.value || renamePending.value) return null
    const trimmed = title.trim()
    renameError.value = !trimmed ? '请输入页面标题。' : trimmed.length > 200 ? '页面标题不能超过 200 个字符。' : ''
    if (renameError.value) return null
    const old = items.value.find((item) => item.id === pageId)
    if (!old) return null
    renamePending.value = true
    const requestEpoch = epoch
    try {
      const updated = { ...old, title: trimmed, updatedAt: new Date().toISOString() }
      await (await useProductSyncStore().store()).upsertPage(updated)
      if (requestEpoch === epoch) items.value = items.value.map((item) => item.id === pageId ? updated : item)
      useProductSyncStore().localMutation()
      return requestEpoch === epoch ? updated : null
    } catch (cause) {
      if (requestEpoch === epoch) renameError.value = cause instanceof Error ? cause.message : '重命名页面失败。'
      return null
    } finally { if (requestEpoch === epoch) renamePending.value = false }
  }

  async function move(workspaceId: string, pageId: string, parentPageId: string | null): Promise<PageResponse | null> {
    if (workspaceId !== forWorkspaceId.value || movePending.value) return null
    const old = items.value.find((item) => item.id === pageId)
    if (!old) return null
    movePending.value = true
    moveError.value = ''
    const requestEpoch = epoch
    try {
      const orderKey = nextOrderKey(items.value.filter((page) => page.parentPageId === parentPageId && page.id !== pageId))
      await (await useProductSyncStore().store()).movePage(workspaceId, pageId, parentPageId, orderKey)
      const updated = { ...old, parentPageId, orderKey, updatedAt: new Date().toISOString() }
      if (requestEpoch === epoch) items.value = items.value.map((item) => item.id === pageId ? updated : item)
      useProductSyncStore().localMutation()
      return requestEpoch === epoch ? updated : null
    } catch (cause) {
      if (requestEpoch === epoch) moveError.value = cause instanceof Error ? cause.message : '移动页面失败。'
      return null
    } finally { if (requestEpoch === epoch) movePending.value = false }
  }

  async function remove(workspaceId: string, pageId: string): Promise<boolean> {
    if (workspaceId !== forWorkspaceId.value || deletePending.value) return false
    deletePending.value = true
    deleteError.value = ''
    const requestEpoch = epoch
    try {
      await (await useProductSyncStore().store()).deletePage(workspaceId, pageId)
      if (requestEpoch === epoch) items.value = items.value.filter((item) => item.id !== pageId)
      useProductSyncStore().localMutation()
      return requestEpoch === epoch
    } catch (cause) {
      if (requestEpoch === epoch) deleteError.value = cause instanceof Error ? cause.message : '删除页面失败。'
      return false
    } finally { if (requestEpoch === epoch) deletePending.value = false }
  }

  function pageById(pageId: string): PageResponse | null { return items.value.find((page) => page.id === pageId) ?? null }
  return { forWorkspaceId, items, loaded, loading, error, createPending, createError, renamePending, renameError, movePending, moveError, deletePending, deleteError, load, refresh, reset, create, rename, move, remove, pageById }
})
