export type ActivePageEditorSession = {
  workspaceId: string
  pageId: string
  flush: () => Promise<boolean>
  preserve: () => void
}

const active = new Set<ActivePageEditorSession>()
const flushing = new WeakMap<ActivePageEditorSession, Promise<boolean>>()

/** Multiple document surfaces can coexist while a Record is open in an overlay. */
export function registerActivePageEditor(session: ActivePageEditorSession): () => void {
  active.add(session)
  return () => {
    active.delete(session)
    flushing.delete(session)
  }
}

export function preserveActivePageEditor(): void {
  for (const session of active) session.preserve()
}

function flushSession(session: ActivePageEditorSession): Promise<boolean> {
  const current = flushing.get(session)
  if (current) return current
  const request = session.flush().finally(() => {
    if (flushing.get(session) === request) flushing.delete(session)
  })
  flushing.set(session, request)
  return request
}

export async function flushActivePageEditor(workspaceId?: string, pageId?: string): Promise<boolean> {
  const matches = [...active].filter(session =>
    (!workspaceId || session.workspaceId === workspaceId) && (!pageId || session.pageId === pageId))
  if (matches.length === 0) return true
  const results = await Promise.all(matches.map(flushSession))
  return results.every(Boolean)
}
