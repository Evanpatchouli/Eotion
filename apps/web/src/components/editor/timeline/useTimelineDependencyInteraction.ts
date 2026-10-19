import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { TimelineDependencyEdge } from './dependency'
import type { TimelineDependencyCapture, TimelineDependencyCommand } from './dependencyMutation'
import type { Transform } from './types'

type ActiveConnection = {
  mode: 'pointer' | 'keyboard'
  capture: TimelineDependencyCapture
  predecessorRecordId: string
  pointerId: number | null
  handle: HTMLElement
  root: HTMLElement
  contextEpoch: number
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
  recordTitleById: () => ReadonlyMap<string, string>
  renderedRecordIds: () => ReadonlySet<string>
  canvas: () => HTMLElement | null
  captureDependency: () => TimelineDependencyCapture | null
  mutateDependency: (command: TimelineDependencyCommand) => Promise<boolean>
}

export function useTimelineDependencyInteraction(options: Options) {
  const active = ref<ActiveConnection | null>(null)
  const targetRecordId = ref<string | null>(null)
  const pointer = ref<{ x: number; y: number } | null>(null)
  const liveMessage = ref('')
  const showKeyboardStatus = ref(false)
  const selectedEdgeId = ref<string | null>(null)
  const pending = ref(false)
  let pendingOwner: symbol | null = null
  let pendingScope: string | null = null
  let statusTimeout: ReturnType<typeof setTimeout> | null = null
  let contextEpoch = 0
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
    if (current?.mode === 'pointer' && current.handle.isConnected && current.pointerId !== null) {
      try { if (current.handle.hasPointerCapture(current.pointerId)) current.handle.releasePointerCapture(current.pointerId) } catch { /* detached */ }
    }
  }

  function cancel(announce = true): void {
    const current = active.value
    release()
    if (announce && current?.mode === 'keyboard') {
      liveMessage.value = '依赖创建已取消。'
      showKeyboardStatus.value = true
      scheduleHideKeyboardStatus()
    }
  }

  function beginPending(scope: string): symbol {
    const owner = Symbol('timeline-dependency-pending')
    pendingOwner = owner
    pendingScope = scope
    pending.value = true
    return owner
  }

  function endPending(owner: symbol): boolean {
    if (pendingOwner !== owner) return false
    pendingOwner = null
    pendingScope = null
    pending.value = false
    return true
  }

  function scheduleHideKeyboardStatus(): void {
    if (statusTimeout !== null) clearTimeout(statusTimeout)
    statusTimeout = setTimeout(() => {
      showKeyboardStatus.value = false
      statusTimeout = null
    }, 4000)
  }

  function contextCurrent(current: ActiveConnection): boolean {
    return options.writable() && options.online() && current.capture.scope === options.scope()
      && current.configKey === options.configKey()
      && options.isViewportCurrent(current.transform)
      && options.renderedRecordIds().has(current.predecessorRecordId)
      && current.contextEpoch === contextEpoch
      && options.canvas() === current.root && current.root.isConnected
  }

  function legalTargets(sourceId: string): string[] {
    const pairs = existingPairs.value
    return [...options.renderedRecordIds()].filter(id => id !== sourceId
      && !pairs.has(JSON.stringify([sourceId, id])))
  }

  function isLegalTarget(sourceId: string, targetId: string | null): targetId is string {
    return targetId !== null && legalTargets(sourceId).includes(targetId)
  }

  function makeCapture(sourceId: string, handle: HTMLElement, mode: ActiveConnection['mode'], pointerId: number | null): ActiveConnection | null {
    if (active.value || pending.value || !options.writable() || !options.online()
      || !options.renderedRecordIds().has(sourceId)) return null
    const transform = options.transform()
    const root = options.canvas()
    if (!transform || !root || !options.isViewportCurrent(transform) || !root.isConnected || !root.contains(handle)) return null
    const capture = options.captureDependency()
    if (!capture || capture.scope !== options.scope()) return null
    return { mode, capture, predecessorRecordId: sourceId, pointerId, handle, root, contextEpoch, transform: { ...transform }, configKey: options.configKey() }
  }

  function start(event: PointerEvent, predecessorRecordId: string): void {
    if (active.value || pending.value || !options.writable() || !options.online() || event.button !== 0 || event.isPrimary === false
      || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey
      || !options.renderedRecordIds().has(predecessorRecordId)) return
    const handle = event.currentTarget
    if (!(handle instanceof HTMLElement)) return
    // Capture the entire loaded-record identity/version snapshot at pointerdown.
    const current = makeCapture(predecessorRecordId, handle, 'pointer', event.pointerId)
    if (!current) return
    event.preventDefault()
    event.stopPropagation()
    active.value = current
    targetRecordId.value = null
    const controller = new AbortController()
    listeners = controller
    window.addEventListener('keydown', onKeydown, { signal: controller.signal })
    window.addEventListener('blur', () => cancel(), { signal: controller.signal })
    document.addEventListener('visibilitychange', onVisibilityChange, { signal: controller.signal })
    try { handle.setPointerCapture(event.pointerId) } catch { cancel() }
  }

  function startKeyboard(event: KeyboardEvent, predecessorRecordId: string): void {
    if ((event.key !== 'Enter' && event.key !== ' ') || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    if (active.value?.mode === 'pointer' || pending.value) return
    const handle = event.currentTarget
    if (!(handle instanceof HTMLElement)) return
    if (active.value?.mode === 'keyboard' && active.value.predecessorRecordId === predecessorRecordId
      && document.activeElement === active.value.handle) {
      event.preventDefault()
      event.stopPropagation()
      void finishKeyboard(active.value)
      return
    }
    if (active.value) return
    const current = makeCapture(predecessorRecordId, handle, 'keyboard', null)
    if (!current) return
    event.preventDefault()
    event.stopPropagation()
    active.value = current
    pointer.value = null
    showKeyboardStatus.value = true
    if (statusTimeout !== null) clearTimeout(statusTimeout)
    statusTimeout = null
    const candidates = legalTargets(predecessorRecordId)
    targetRecordId.value = candidates[0] ?? null
    liveMessage.value = candidates.length
      ? `依赖创建：${recordTitle(predecessorRecordId)}。已选择目标 ${recordTitle(candidates[0]!)}，方向键更换，Enter 或空格保存，Escape 或 Tab 取消。`
      : `依赖创建：${recordTitle(predecessorRecordId)}。当前没有可用的已排期目标；按 Escape 或 Tab 取消。`
    const controller = new AbortController()
    listeners = controller
    window.addEventListener('blur', () => cancel(), { signal: controller.signal })
    document.addEventListener('visibilitychange', onVisibilityChange, { signal: controller.signal })
  }

  function recordTitle(recordId: string): string {
    return options.recordTitleById().get(recordId) || '无标题'
  }

  async function finishKeyboard(current: ActiveConnection): Promise<void> {
    if (active.value !== current || current.mode !== 'keyboard' || document.activeElement !== current.handle) return
    const target = targetRecordId.value
    if (!isLegalTarget(current.predecessorRecordId, target)) {
      liveMessage.value = target
        ? '所选目标已不可用，请重新选择。'
        : '当前没有可用目标，依赖关系未保存。'
      targetRecordId.value = null
      return
    }
    if (!contextCurrent(current)) { cancel(); return }
    release()
    const pendingToken = beginPending(current.capture.scope)
    const samePresentation = () => current.capture.scope === options.scope() && current.contextEpoch === contextEpoch
      && current.configKey === options.configKey() && options.canvas() === current.root && current.root.isConnected
    liveMessage.value = `正在保存依赖：${recordTitle(current.predecessorRecordId)} → ${recordTitle(target)}。`
    let succeeded = false
    try {
      succeeded = await options.mutateDependency({ capture: current.capture, operation: 'create', predecessorRecordId: current.predecessorRecordId, successorRecordId: target })
    } catch {
      // The adapter owns error reporting and canonical reconciliation.
    } finally {
      const ownsPending = endPending(pendingToken)
      if (ownsPending && samePresentation()) {
        liveMessage.value = succeeded ? '依赖关系已保存。' : '依赖操作已结束，请查看提交结果提示。'
        scheduleHideKeyboardStatus()
      }
      if (ownsPending) await restoreKeyboardFocus(current)
    }
  }

  async function restoreKeyboardFocus(current: ActiveConnection): Promise<void> {
    await nextTick()
    if (current.capture.scope !== options.scope() || current.configKey !== options.configKey()
      || current.contextEpoch !== contextEpoch || options.canvas() !== current.root
      || !current.root.isConnected || !options.isViewportCurrent(current.transform)) return
    const focused = document.activeElement
    const focusWasLost = !focused || focused === document.body || focused === document.documentElement
      || focused instanceof HTMLElement && !focused.isConnected
    if (!focusWasLost) return
    const source = [...current.root.querySelectorAll<HTMLElement>('[data-testid="timeline-dependency-handle"]')]
      .find(element => element.dataset.recordId === current.predecessorRecordId)
    if (source?.isConnected) source.focus()
  }

  function onKeyboardKeydown(event: KeyboardEvent, sourceId: string): void {
    const current = active.value
    if (!current || current.mode !== 'keyboard' || current.predecessorRecordId !== sourceId
      || event.currentTarget !== current.handle || document.activeElement !== current.handle) return
    if (event.key === 'Tab') {
      cancel()
      liveMessage.value = '依赖创建已取消。'
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      cancel()
      liveMessage.value = '依赖创建已取消。'
      return
    }
    if ((event.key === 'Enter' || event.key === ' ') && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      event.preventDefault()
      event.stopPropagation()
      if (!event.repeat) void finishKeyboard(current)
      return
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      event.stopPropagation()
      const candidates = legalTargets(sourceId)
      if (!candidates.length) {
        targetRecordId.value = null
        liveMessage.value = `依赖创建：${recordTitle(sourceId)}。当前没有可用的已排期目标。`
        return
      }
      const index = candidates.indexOf(targetRecordId.value ?? '')
      const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? candidates.length - 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? (index <= 0 ? candidates.length - 1 : index - 1)
          : (index < 0 || index === candidates.length - 1 ? 0 : index + 1)
      targetRecordId.value = candidates[nextIndex]!
      liveMessage.value = `依赖创建：${recordTitle(sourceId)} → ${recordTitle(targetRecordId.value)}。方向键更换，Enter 或空格保存，Escape 或 Tab 取消。`
    }
  }

  function keydown(event: KeyboardEvent, sourceId: string): void {
    if (active.value?.mode === 'keyboard') {
      onKeyboardKeydown(event, sourceId)
      return
    }
    if (active.value?.mode === 'pointer') return
    const activationKey = (event.key === 'Enter' || event.key === ' ')
      && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
    if (activationKey && (event.repeat || pending.value)) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    startKeyboard(event, sourceId)
  }

  function blurKeyboard(event: FocusEvent, sourceId: string): void {
    const current = active.value
    if (current?.mode === 'keyboard' && current.predecessorRecordId === sourceId
      && event.currentTarget === current.handle && document.activeElement !== current.handle) cancel()
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
    const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>(
      '[data-testid="timeline-bar"], [data-testid="timeline-dependency-handle"], [data-testid="timeline-resize-start"], [data-testid="timeline-resize-end"]',
    )
    // Expanded touch controls can cover part of their own Bar. While linking,
    // those controls target that rendered Bar too; they never start a resize
    // or a second connection and cannot resolve an unloaded Record.
    const bar = hit?.matches('[data-testid="timeline-bar"]') ? hit
      : hit?.closest('[data-timeline-row]')?.querySelector<HTMLElement>('[data-testid="timeline-bar"]')
    const candidate = hit && bar && canvas.contains(bar) && hit.dataset.recordId === bar.dataset.recordId ? bar.dataset.recordId ?? null : null
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
    if (!isLegalTarget(current.predecessorRecordId, target) || !contextCurrent(current) || pending.value) return
    const pendingToken = beginPending(current.capture.scope)
    try {
      await options.mutateDependency({ capture: current.capture, operation: 'create', predecessorRecordId: current.predecessorRecordId, successorRecordId: target })
    } catch {
      // The adapter owns error reporting and canonical reconciliation.
    } finally { endPending(pendingToken) }
  }

  async function removeSelected(): Promise<void> {
    const edge = selectedEdge.value
    if (!edge || pending.value || !options.writable() || !options.online()) return
    const capture = options.captureDependency()
    if (!capture || capture.scope !== options.scope()) return
    const pendingToken = beginPending(capture.scope)
    try {
      const succeeded = await options.mutateDependency({ capture, operation: 'delete', predecessorRecordId: edge.predecessorRecordId, successorRecordId: edge.successorRecordId })
      if (succeeded && selectedEdgeId.value === edge.id) selectedEdgeId.value = null
    } catch {
      // The adapter owns error reporting and canonical reconciliation.
    } finally { endPending(pendingToken) }
  }

  function selectEdge(id: string): void { if (options.edges().some(edge => edge.id === id)) selectedEdgeId.value = id }
  function selectRelative(delta: number): void {
    const edges = options.edges()
    if (edges.length === 0) return
    const index = edges.findIndex(edge => edge.id === selectedEdgeId.value)
    selectedEdgeId.value = edges[index < 0 ? delta < 0 ? edges.length - 1 : 0 : (index + delta + edges.length) % edges.length]?.id ?? null
  }
  function onKeydown(event: KeyboardEvent): void {
    const current = active.value
    if (current?.mode === 'pointer' && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel() }
  }
  function onVisibilityChange(): void { if (document.visibilityState === 'hidden') cancel() }

  watch([options.scope, options.transform, options.configKey], () => {
    contextEpoch += 1
    const current = active.value
    if (current && !contextCurrent(current)) cancel(false)
  }, { flush: 'sync' })
  watch([options.writable, options.online], () => {
    const current = active.value
    if (current && !contextCurrent(current)) cancel(false)
  }, { flush: 'sync' })
  watch(options.edges, edges => {
    if (selectedEdgeId.value && !edges.some(edge => edge.id === selectedEdgeId.value)) selectedEdgeId.value = null
  })
  watch([options.edges, options.renderedRecordIds], () => {
    const current = active.value
    if (!current) return
    if (!options.renderedRecordIds().has(current.predecessorRecordId)) { cancel(); return }
    if (targetRecordId.value && !isLegalTarget(current.predecessorRecordId, targetRecordId.value)) {
      targetRecordId.value = null
      if (current.mode === 'keyboard') liveMessage.value = '所选目标已不可用，请使用方向键重新选择。'
    }
  }, { flush: 'sync' })
  watch(options.scope, scope => {
    selectedEdgeId.value = null
    cancel(false)
    liveMessage.value = ''
    showKeyboardStatus.value = false
    if (statusTimeout !== null) clearTimeout(statusTimeout)
    statusTimeout = null
    if (pendingScope !== null && pendingScope !== scope) {
      pendingOwner = null
      pendingScope = null
      pending.value = false
    }
  }, { flush: 'sync' })
  onBeforeUnmount(() => {
    cancel(false)
    if (statusTimeout !== null) clearTimeout(statusTimeout)
  })

  return { active, pointer, previewEdge, selectedEdge, selectedEdgeId, targetRecordId, liveMessage, showKeyboardStatus, pending, start, keydown, blurKeyboard, move, finish, cancel, selectEdge, selectRelative, removeSelected }
}
