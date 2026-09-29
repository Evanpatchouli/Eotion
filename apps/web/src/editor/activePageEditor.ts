let active: { workspaceId: string; pageId: string; flush: () => Promise<boolean>; preserve: () => void } | null = null

export function registerActivePageEditor(session: { workspaceId: string; pageId: string; flush: () => Promise<boolean>; preserve: () => void }): () => void {
  active = session
  return () => { if (active === session) active = null }
}

export function preserveActivePageEditor(): void {
  active?.preserve()
}

export async function flushActivePageEditor(workspaceId?: string, pageId?: string): Promise<boolean> {
  if (!active || (workspaceId && active.workspaceId !== workspaceId) || (pageId && active.pageId !== pageId)) return true
  return active.flush()
}
