import { createLocalId } from '@eotion/storage'
import type { DatabasePropertyCreateRequest, DatabasePropertyDeleteRequest, DatabasePropertyUpdateRequest, DatabaseRecordCellUpdateRequest, DatabaseViewHttpCreateRequest, DatabaseViewDeleteRequest, DatabaseViewUpdateRequest } from '@eotion/contracts'
import { nextOrderKey } from '../utils/pageTree'

import { notifyDatabaseRecordCreated, notifyDatabaseUpdated } from '../editor/databaseEvents'
import { reactive } from 'vue'
import { ApiError, api } from './productApi'
import { useProductPagesStore } from '../stores/productPages'
import { useProductSyncStore } from '../stores/productSync'
import { useAuthStore } from '../stores/auth'

export type ProductDatabaseViewDeleteState = {
  userId: string
  workspaceId: string
  databaseId: string
  blockId: string
  fromViewId: string
  replacementViewId: string
  status: 'pending' | 'failed'
  error: string
}
const databaseViewDeleteStates = reactive(new Map<string, ProductDatabaseViewDeleteState>())

export function getProductDatabaseViewDeleteState(blockId: string): ProductDatabaseViewDeleteState | undefined {
  return databaseViewDeleteStates.get(blockId)
}
export function setProductDatabaseViewDeleteState(state: ProductDatabaseViewDeleteState): void {
  databaseViewDeleteStates.set(state.blockId, state)
}
export function clearProductDatabaseViewDeleteState(blockId: string): void {
  databaseViewDeleteStates.delete(blockId)
}

const uncertainRecordScopes = reactive(new Set<string>())
const uncertainDatabaseInsertionScopes = reactive(new Set<string>())
const uncertainRecordMessage = '上次记录创建结果尚未确认，请联网并刷新页面后确认。'
const databaseMutationTails = new Map<string, Promise<unknown>>()

function serializeDatabaseMutation<T>(workspaceId: string, databaseId: string, mutation: () => Promise<T>): Promise<T> {
  const key = JSON.stringify([workspaceId, databaseId])
  const previous = databaseMutationTails.get(key) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(mutation)
  databaseMutationTails.set(key, current)
  void current.finally(() => { if (databaseMutationTails.get(key) === current) databaseMutationTails.delete(key) }).catch(() => undefined)
  return current
}

function assertOnlineAndCurrent(workspaceId: string, userId: string): void {
  if (!navigator.onLine) throw new Error('离线时数据库为只读。')
  const auth = useAuthStore()
  const pages = useProductPagesStore()
  if (auth.user?.id !== userId || pages.forWorkspaceId !== workspaceId) throw new Error('登录状态或工作区已切换，请刷新后重试。')
}

function mayHaveCommitted(error: unknown): boolean {
  return !(error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500)
}

function recordScope(userId: string, workspaceId: string, databaseId: string): string {
  return JSON.stringify([userId, workspaceId, databaseId])
}

function databaseInsertionScope(userId: string, workspaceId: string, pageId: string): string {
  return JSON.stringify([userId, workspaceId, pageId])
}

export function isProductDatabaseInsertionUncertain(userId: string, workspaceId: string, pageId: string): boolean {
  return uncertainDatabaseInsertionScopes.has(databaseInsertionScope(userId, workspaceId, pageId))
}

export function markProductDatabaseInsertionUncertain(userId: string, workspaceId: string, pageId: string): void {
  uncertainDatabaseInsertionScopes.add(databaseInsertionScope(userId, workspaceId, pageId))
}

export async function prepareProductDatabaseRecordPage(workspaceId: string, pageId: string): Promise<void> {
  const auth = useAuthStore()
  const userId = auth.user?.id
  const pages = useProductPagesStore()
  if (!userId || pages.forWorkspaceId !== workspaceId) throw new Error('登录状态或工作区已切换，请刷新后重试。')
  if (pages.items.some(page => page.id === pageId)) return

  const sync = useProductSyncStore()
  try {
    await sync.runSync()
    if (auth.user?.id !== userId || pages.forWorkspaceId !== workspaceId) {
      throw new Error('登录状态或工作区已切换，请刷新后重试。')
    }
    if (sync.state !== 'synced') throw new Error('暂时无法打开记录页面，请联网后重试。')
    await pages.refresh(workspaceId)
  } catch (cause) {
    if (cause instanceof Error && /登录状态或工作区已切换/u.test(cause.message)) throw cause
    throw new Error('暂时无法打开记录页面，请联网后重试。')
  }
  if (auth.user?.id !== userId || pages.forWorkspaceId !== workspaceId) {
    throw new Error('登录状态或工作区已切换，请刷新后重试。')
  }
  if (!pages.items.some(page => page.id === pageId)) throw new Error('暂时无法打开记录页面，请联网后重试。')
}

export function isProductDatabaseRecordCreationUncertain(userId: string, workspaceId: string, databaseId: string): boolean {
  return uncertainRecordScopes.has(recordScope(userId, workspaceId, databaseId))
}

export async function loadProductDatabaseTable(
  workspaceId: string,
  databaseId: string,
  viewId: string,
  window?: { limit?: number; cursor?: string },
) {
  const auth = useAuthStore()
  const userId = auth.user?.id
  const result = await api.databases.getDatabaseTable(workspaceId, databaseId, viewId, window)
  if (!userId || auth.user?.id !== userId) throw new Error('登录状态已切换，请重新加载数据库。')
  return result
}

export async function listProductDatabaseViews(workspaceId: string, databaseId: string) {
  const auth = useAuthStore()
  const userId = auth.user?.id
  const result = await api.databases.listDatabaseViews(workspaceId, databaseId)
  if (!userId || auth.user?.id !== userId) throw new Error('登录状态已切换，请重新加载数据库。')
  return result
}

export async function createProductDatabaseView(workspaceId: string, databaseId: string, input: DatabaseViewHttpCreateRequest) {
  const auth = useAuthStore()
  const userId = auth.user?.id
  if (!userId) throw new Error('请先登录后再编辑数据库视图。')
  return serializeDatabaseMutation(workspaceId, databaseId, async () => {
    assertOnlineAndCurrent(workspaceId, userId)
    const result = await api.databases.createDatabaseView(workspaceId, databaseId, input)
    assertOnlineAndCurrent(workspaceId, userId)
    notifyDatabaseUpdated({ workspaceId, databaseId })
    return result
  })
}

export async function updateProductDatabaseView(workspaceId: string, databaseId: string, viewId: string, input: DatabaseViewUpdateRequest) {
  const auth = useAuthStore()
  const userId = auth.user?.id
  if (!userId) throw new Error('请先登录后再编辑数据库视图。')
  return serializeDatabaseMutation(workspaceId, databaseId, async () => {
    assertOnlineAndCurrent(workspaceId, userId)
    const result = await api.databases.updateDatabaseView(workspaceId, databaseId, viewId, input)
    assertOnlineAndCurrent(workspaceId, userId)
    notifyDatabaseUpdated({ workspaceId, databaseId })
    return result
  })
}

export async function deleteProductDatabaseView(workspaceId: string, databaseId: string, viewId: string, input: DatabaseViewDeleteRequest) {
  const auth = useAuthStore()
  const userId = auth.user?.id
  if (!userId) throw new Error('请先登录后再编辑数据库视图。')
  return serializeDatabaseMutation(workspaceId, databaseId, async () => {
    assertOnlineAndCurrent(workspaceId, userId)
    const result = await api.databases.deleteDatabaseView(workspaceId, databaseId, viewId, input)
    assertOnlineAndCurrent(workspaceId, userId)
    notifyDatabaseUpdated({ workspaceId, databaseId })
    return result
  })
}

export async function createProductDatabaseRecord(workspaceId: string, databaseId: string, title: string): Promise<{ refreshWarning?: string }> {
  if (!navigator.onLine) throw new Error('离线时无法新建记录。')
  const auth = useAuthStore()
  const userId = auth.user?.id
  if (!userId) throw new Error('请先登录后再新建记录。')
  if (isProductDatabaseRecordCreationUncertain(userId, workspaceId, databaseId)) throw new Error(uncertainRecordMessage)
  const pages = useProductPagesStore()
  if (pages.forWorkspaceId !== workspaceId) throw new Error('工作区已切换，请刷新后重试。')
  const siblingPages = pages.items.filter(page => page.parentPageId === null)
  const recordId = createLocalId()
  const pageId = createLocalId()
  const input = {
    id: recordId,
    pageId,
    title: title.trim(),
    orderKey: nextOrderKey(siblingPages),
  }
  try {
    await api.databases.createDatabaseRecord(workspaceId, databaseId, input)
  } catch (cause) {
    if (!mayHaveCommitted(cause)) throw cause
    if (auth.user?.id !== userId || pages.forWorkspaceId !== workspaceId) {
      uncertainRecordScopes.add(recordScope(userId, workspaceId, databaseId))
      throw new Error('登录状态或工作区已切换，请刷新页面后确认记录状态。')
    }
    let confirmed = false
    try {
      const createdPage = await api.pages.get(workspaceId, pageId)
      confirmed = createdPage.id === pageId && createdPage.workspaceId === workspaceId
    } catch {
      // A missing page after a transient POST failure is still ambiguous: the
      // original transaction may be completing while this verification runs.
    }
    if (auth.user?.id !== userId || pages.forWorkspaceId !== workspaceId) {
      uncertainRecordScopes.add(recordScope(userId, workspaceId, databaseId))
      throw new Error('登录状态或工作区已切换，请刷新页面后确认记录状态。')
    }
    if (!confirmed) {
      uncertainRecordScopes.add(recordScope(userId, workspaceId, databaseId))
      throw new Error(uncertainRecordMessage)
    }
  }
  if (auth.user?.id !== userId || pages.forWorkspaceId !== workspaceId) {
    uncertainRecordScopes.add(recordScope(userId, workspaceId, databaseId))
    throw new Error('记录已创建，但登录状态或工作区已切换。请返回原页面并刷新确认。')
  }
  notifyDatabaseRecordCreated({ workspaceId, databaseId })
  const sync = useProductSyncStore()
  let refreshWarning = false
  try {
    await sync.runSync()
    if (sync.state !== 'synced') refreshWarning = true
  } catch {
    refreshWarning = true
  }
  try {
    await pages.refresh(workspaceId)
  } catch {
    refreshWarning = true
  }
  return refreshWarning ? { refreshWarning: '记录已创建，页面列表暂未刷新，请稍后刷新。' } : {}
}

export async function createProductDatabaseProperty(workspaceId: string, databaseId: string, input: DatabasePropertyCreateRequest) {
  const auth = useAuthStore()
  const userId = auth.user?.id
  if (!userId) throw new Error('请先登录后再编辑数据库。')
  return serializeDatabaseMutation(workspaceId, databaseId, async () => {
    assertOnlineAndCurrent(workspaceId, userId)
    const result = await api.databases.createDatabaseProperty(workspaceId, databaseId, input)
    assertOnlineAndCurrent(workspaceId, userId)
    notifyDatabaseUpdated({ workspaceId, databaseId })
    return result
  })
}

export async function updateProductDatabaseProperty(workspaceId: string, databaseId: string, propertyId: string, input: DatabasePropertyUpdateRequest) {
  const auth = useAuthStore()
  const userId = auth.user?.id
  if (!userId) throw new Error('请先登录后再编辑数据库。')
  return serializeDatabaseMutation(workspaceId, databaseId, async () => {
    assertOnlineAndCurrent(workspaceId, userId)
    const result = await api.databases.updateDatabaseProperty(workspaceId, databaseId, propertyId, input)
    assertOnlineAndCurrent(workspaceId, userId)
    notifyDatabaseUpdated({ workspaceId, databaseId })
    return result
  })
}

export async function deleteProductDatabaseProperty(workspaceId: string, databaseId: string, propertyId: string, input: DatabasePropertyDeleteRequest) {
  const auth = useAuthStore()
  const userId = auth.user?.id
  if (!userId) throw new Error('请先登录后再编辑数据库。')
  return serializeDatabaseMutation(workspaceId, databaseId, async () => {
    assertOnlineAndCurrent(workspaceId, userId)
    const result = await api.databases.deleteDatabaseProperty(workspaceId, databaseId, propertyId, input)
    assertOnlineAndCurrent(workspaceId, userId)
    notifyDatabaseUpdated({ workspaceId, databaseId })
    return result
  })
}

export async function updateProductDatabaseRecordCell(workspaceId: string, databaseId: string, recordId: string, propertyId: string, input: DatabaseRecordCellUpdateRequest) {
  const auth = useAuthStore()
  const userId = auth.user?.id
  if (!userId) throw new Error('请先登录后再编辑数据库。')
  return serializeDatabaseMutation(workspaceId, databaseId, async () => {
    assertOnlineAndCurrent(workspaceId, userId)
    const isTitle = input.expectedPageUpdatedAt !== undefined
    const sync = useProductSyncStore()
    const pages = useProductPagesStore()
    if (isTitle) {
      await sync.runSync()
      assertOnlineAndCurrent(workspaceId, userId)
      if (sync.state !== 'synced') throw new Error('页面尚未同步，标题暂不能修改。')
    }
    const result = await api.databases.updateDatabaseRecordCell(workspaceId, databaseId, recordId, propertyId, input)
    assertOnlineAndCurrent(workspaceId, userId)
    notifyDatabaseUpdated({ workspaceId, databaseId })
    let refreshWarning: string | undefined
    if (isTitle) {
      try {
        await sync.runSync()
        assertOnlineAndCurrent(workspaceId, userId)
        await pages.refresh(workspaceId)
        assertOnlineAndCurrent(workspaceId, userId)
        if (sync.state !== 'synced') refreshWarning = '标题已更新，但页面列表暂未同步。'
      } catch {
        refreshWarning = '标题已更新，但页面列表暂未同步。'
      }
    }
    return { ...result, ...(refreshWarning ? { refreshWarning } : {}) }
  })
}
