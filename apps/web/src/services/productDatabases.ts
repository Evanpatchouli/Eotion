import { createLocalId } from '@eotion/storage'
import { nextOrderKey } from '../utils/pageTree'

import { notifyDatabaseRecordCreated } from '../editor/databaseEvents'
import { reactive } from 'vue'
import { ApiError, api } from './productApi'
import { useProductPagesStore } from '../stores/productPages'
import { useProductSyncStore } from '../stores/productSync'
import { useAuthStore } from '../stores/auth'

const uncertainRecordScopes = reactive(new Set<string>())
const uncertainDatabaseInsertionScopes = reactive(new Set<string>())
const uncertainRecordMessage = '上次记录创建结果尚未确认，请联网并刷新页面后确认。'

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

export async function createProductDatabaseRecord(workspaceId: string, databaseId: string): Promise<{ refreshWarning?: string }> {
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
    title: '无标题',
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
