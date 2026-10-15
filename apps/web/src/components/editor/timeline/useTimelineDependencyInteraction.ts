import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { TimelineDependencyEdge } from './dependency'
import type { TimelineDependencyCapture, TimelineDependencyCommand } from './dependencyMutation'
import type { Transform } from './types'

type ActiveConnection = {
  capture: TimelineDependencyCapture
  predecessorRecordId: string
  pointerId: number
  handle: HTMLElement
  transform: Transform
  configKey: string
}

type Options = {
  scope: () => string
  writable: () => boolean
  online: () => boolean
  transform: () => Transform | null
  configKey: () => string
  isViewportCurrent: (transform: Transform) => boolean
  edges: () => readonly TimelineDependencyEdge[]
  renderedRecordIds: () => ReadonlySet<string>
  canvas: () => HTMLElement | null
  captureDependency: () => TimelineDependencyCapture | null
  mutateDependency: (command: TimelineDependencyCommand) => Promise<boolean>
}

export function useTimelineDependencyInteraction(options: Options) {
  const active = ref<ActiveConnection | null>(null)
  const targetRecordId = ref<string | null>(null)
  const pointer = ref<{ x: number; y: number } | null>(null)
  const selectedEdgeId = ref<string | null>(null)
  const pending = ref(false)
  const existingPairs = computed(() => new Set(options.edges().map(edge => JSON.stringify([edge.predecessorRecordId, edge.successorRecordId]))))
  let listeners: AbortController | null = null

  const selectedEdge = computed(() => options.edges().find(edge => edge.id === selectedEdgeId.value) ?? null)
  const previewEdge = computed<TimelineDependencyEdge | null>(() => {
    const source = active.value?.predecessorRecordId
    const target = targetRecordId.value
    return source && target ? { id: 'preview', predecessorRecordId: source, successorRecordId: target } : null
  })

  function release(): void {
    listeners?.abort()
    listeners = null
    const current = active.value
    active.value = null
    targetRecordId.value = null
    pointer.value = null
    if (current?.handle.isConnected) {
      try { if (current.handle.hasPointerCapture(current.pointerId)) current.handle.releasePointerCapture(current.pointerId) } catch { /* detached */ }
    }
  }

  function cancel(): void { release() }

  function contextCurrent(current: ActiveConnection): boolean {
    return options.writable() && options.online() && current.capture.scope === options.scope()
      && current.configKey === options.configKey()
      && options.isViewportCurrent(current.transform)
      && options.renderedRecordIds().has(current.predecessorRecordId)
  }

  function start(event: PointerEvent, predecessorRecordId: string): void {
    if (active.value || pending.value || !options.writable() || !options.online() || event.button !== 0 || event.isPrimary === false
      || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey
      || !options.renderedRecordIds().has(predecessorRecordId)) return
    const transform = options.transform()
    const handle = event.currentTarget
    if (!transform || !options.isViewportCurrent(transform) || !(handle instanceof HTMLElement)) return
    // Capture the entire loaded-record identity/version snapshot at pointerdown.
    const capture = options.captureDependency()
    if (!capture || capture.scope !== options.scope()) return
    event.preventDefault()
    event.stopPropagation()
    active.value = { capture, predecessorRecordId, pointerId: event.pointerId, handle, transform: { ...transform }, configKey: options.configKey() }
    const controller = new AbortController()
    listeners = controller
    window.addEventListener('keydown', onKeydown, { signal: controller.signal })
    window.addEventListener('blur', cancel, { signal: controller.signal })
    document.addEventListener('visibilitychange', onVisibilityChange, { signal: controller.signal })
    try { handle.setPointerCapture(event.pointerId) } catch { cancel() }
  }

  function move(event: PointerEvent): void {
    const current = active.value
    if (!current || event.pointerId !== current.pointerId) return
    if (!contextCurrent(current)) { cancel(); return }
    event.preventDefault()
    const canvas = options.canvas()
    if (!canvas) { cancel(); return }
    const bounds = canvas.getBoundingClientRect()
    pointer.value = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
    const bar = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-testid="timeline-bar"]')
    const candidate = bar && canvas.contains(bar) ? bar.dataset.recordId ?? null : null
    targetRecordId.value = candidate && candidate !== current.predecessorRecordId
      && options.renderedRecordIds().has(candidate)
      && !existingPairs.value.has(JSON.stringify([current.predecessorRecordId, candidate]))
      ? candidate : null
  }

  async function finish(event: PointerEvent): Promise<void> {
    const current = active.value
    if (!current || event.pointerId !== current.pointerId) return
    move(event)
    const target = targetRecordId.value
    release()
    if (!target || !contextCurrent(current) || pending.value) return
    pending.value = true
    try {
      await options.mutateDependency({ capture: current.capture, operation: 'create', predecessorRecordId: current.predecessorRecordId, successorRecordId: target })
    } catch {
      // The adapter owns error reporting and canonical reconciliation.
    } finally { pending.value = false }
  }

  async function removeSelected(): Promise<void> {
    const edge = selectedEdge.value
    if (!edge || pending.value || !options.writable() || !options.online()) return
    const capture = options.captureDependency()
    if (!capture || capture.scope !== options.scope()) return
    pending.value = true
    try {
      const succeeded = await options.mutateDependency({ capture, operation: 'delete', predecessorRecordId: edge.predecessorRecordId, successorRecordId: edge.successorRecordId })
      if (succeeded && selectedEdgeId.value === edge.id) selectedEdgeId.value = null
    } catch {
      // The adapter owns error reporting and canonical reconciliation.
    } finally { pending.value = false }
  }

  function selectEdge(id: string): void { if (options.edges().some(edge => edge.id === id)) selectedEdgeId.value = id }
  function selectRelative(delta: number): void {
    const edges = options.edges()
    if (edges.length === 0) return
    const index = edges.findIndex(edge => edge.id === selectedEdgeId.value)
    selectedEdgeId.value = edges[index < 0 ? delta < 0 ? edges.length - 1 : 0 : (index + delta + edges.length) % edges.length]?.id ?? null
  }
  function onKeydown(event: KeyboardEvent): void { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel() } }
  function onVisibilityChange(): void { if (document.visibilityState === 'hidden') cancel() }

  watch([options.scope, options.writable, options.online, options.transform, options.configKey], () => {
    const current = active.value
    if (current && !contextCurrent(current)) cancel()
  }, { flush: 'sync' })
  watch(options.edges, edges => {
    if (selectedEdgeId.value && !edges.some(edge => edge.id === selectedEdgeId.value)) selectedEdgeId.value = null
  })
  watch(options.scope, () => { selectedEdgeId.value = null; cancel() }, { flush: 'sync' })
  onBeforeUnmount(cancel)

  return { active, pointer, previewEdge, selectedEdge, selectedEdgeId, pending, start, move, finish, cancel, selectEdge, selectRelative, removeSelected }
}
