import type { JSONContent } from '@tiptap/core'

const drafts = new Map<string, JSONContent>()
const key = (userId: string, workspaceId: string, pageId: string) => `${userId}:${workspaceId}:${pageId}`

function beforeUnload(event: BeforeUnloadEvent): void {
  if (drafts.size === 0) return
  event.preventDefault()
  event.returnValue = ''
}

export function rememberPageDraft(userId: string, workspaceId: string, pageId: string, document: JSONContent): void {
  drafts.set(key(userId, workspaceId, pageId), structuredClone(document))
  window.addEventListener('beforeunload', beforeUnload)
}

export function pendingPageDraft(userId: string, workspaceId: string, pageId: string): JSONContent | null {
  return drafts.get(key(userId, workspaceId, pageId)) ?? null
}

export function clearPageDraft(userId: string, workspaceId: string, pageId: string): void {
  drafts.delete(key(userId, workspaceId, pageId))
  if (drafts.size === 0) window.removeEventListener('beforeunload', beforeUnload)
}

export function hasPendingPageDraft(): boolean {
  return drafts.size > 0
}
