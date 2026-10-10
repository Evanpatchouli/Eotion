import { defineStore } from 'pinia'
import { ref } from 'vue'

import { flushActivePageEditor } from '../editor/activePageEditor'

export type OpenDatabaseRecord = {
  workspaceId: string
  databaseId: string
  pageId: string
  requestId: number
}

export const useDatabaseContentStore = defineStore('database-content', () => {
  const record = ref<OpenDatabaseRecord | null>(null)
  let sequence = 0

  async function openRecord(workspaceId: string, databaseId: string, pageId: string): Promise<void> {
    if (!workspaceId || !databaseId || !pageId) return
    const current = record.value
    if (current && (current.workspaceId !== workspaceId || current.pageId !== pageId)
      && !(await flushActivePageEditor(current.workspaceId, current.pageId))) {
      throw new Error('当前记录正文尚未保存，请重试后再切换记录。')
    }
    record.value = { workspaceId, databaseId, pageId, requestId: ++sequence }
  }

  function closeRecord(requestId?: number): void {
    if (requestId !== undefined && record.value?.requestId !== requestId) return
    record.value = null
  }

  return { record, openRecord, closeRecord }
})
