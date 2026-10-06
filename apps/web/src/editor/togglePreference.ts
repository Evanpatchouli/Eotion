import { ref } from 'vue'

/** Collapse state is local UI preference, never part of the block's canonical data. */
const STORAGE_KEY = 'eotion:collapsed-toggles'

function load(): ReadonlySet<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed.filter((id): id is string => typeof id === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

const collapsed = ref<ReadonlySet<string>>(load())

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsed.value]))
  } catch {
    // Private mode or a full quota must never break editing.
  }
}

export function isToggleCollapsed(blockId: string): boolean {
  return collapsed.value.has(blockId)
}

export function setToggleCollapsed(blockId: string, value: boolean): void {
  const next = new Set(collapsed.value)
  if (value) next.add(blockId)
  else next.delete(blockId)
  collapsed.value = next
  persist()
}

export function toggleToggleCollapsed(blockId: string): void {
  setToggleCollapsed(blockId, !collapsed.value.has(blockId))
}
