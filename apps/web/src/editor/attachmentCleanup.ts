import { ref } from 'vue'
import { useProductSyncStore } from '../stores/productSync'

// Storage failure must not turn navigation into loss of a known server file.
// Keep the intent across component lifetimes until the durable adapter recovers.
export const pendingAttachmentCleanups = ref<Array<{ workspaceId: string; fileId: string }>>([])

export async function enqueueAttachmentCleanup(workspaceId: string, fileId: string): Promise<boolean> {
  if (!pendingAttachmentCleanups.value.some((item) => item.workspaceId === workspaceId && item.fileId === fileId)) {
    pendingAttachmentCleanups.value.push({ workspaceId, fileId })
  }
  try {
    const sync = useProductSyncStore()
    await (await sync.store()).enqueueFileCleanup(workspaceId, fileId)
    pendingAttachmentCleanups.value = pendingAttachmentCleanups.value.filter((item) => item.workspaceId !== workspaceId || item.fileId !== fileId)
    sync.requestSync(0)
    return true
  } catch { return false }
}

export async function flushAttachmentCleanups(): Promise<boolean> {
  for (const item of [...pendingAttachmentCleanups.value]) await enqueueAttachmentCleanup(item.workspaceId, item.fileId)
  return pendingAttachmentCleanups.value.length === 0
}

function protectUnstoredCleanup(event: BeforeUnloadEvent): void {
  if (!pendingAttachmentCleanups.value.length) return
  event.preventDefault()
  event.returnValue = ''
}

window.addEventListener('beforeunload', protectUnstoredCleanup)
window.addEventListener('online', flushAttachmentCleanups)
if (import.meta.hot) import.meta.hot.dispose(() => {
  window.removeEventListener('beforeunload', protectUnstoredCleanup)
  window.removeEventListener('online', flushAttachmentCleanups)
})
