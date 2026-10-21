import { computed, nextTick, onBeforeUnmount, onMounted, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'
import { floorCalendar, timeToScreenX, timeToX, addCalendar, timelineInstantBounds } from './coordinates'
import { generateTimelineTicks, timelineTickBucket } from './ruler'
import { getWeekStart } from './scale'
import { TIMELINE_ROW_HEIGHT, timelineRowWindow, type TimelineRowWindow } from './layout'
import type { TimelineScaleId, TimelineTick, TimelineViewportState, Transform } from './types'
import { alignViewportScroll, canvasWidth, centerViewport, createViewport, stepViewport, updateViewport, viewportTransform } from './viewport'

type Options = {
  root: Ref<HTMLElement | null>
  scroller: Ref<HTMLElement | null>
  rulerAnchor: Ref<HTMLElement | null>
  body: Ref<HTMLElement | null>
  scope: MaybeRefOrGetter<string>
  configuredScale: MaybeRefOrGetter<TimelineScaleId>
  rowCount: MaybeRefOrGetter<number>
  focusedRowIndex?: MaybeRefOrGetter<number | null>
}

function readLocale(): string {
  try {
    const language = document.documentElement.lang || navigator.language || 'en-US'
    new Intl.DateTimeFormat(language)
    return language
  } catch { return 'en-US' }
}

function readTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return zone || 'UTC'
  } catch { return 'UTC' }
}

export function useTimelineViewport(options: Options) {
  const state = ref<TimelineViewportState | null>(null)
  const localScaleOverride = ref<TimelineScaleId | null>(null)
  const effectiveScale = computed(() => localScaleOverride.value ?? toValue(options.configuredScale))
  const locale = ref(typeof document === 'undefined' ? 'en-US' : readLocale())
  const displayTimeZone = ref(readTimeZone())
  const todayMs = ref<number | null>(null)
  const pinY = ref(0)
  const visibleTop = ref(0)
  const visibleBottom = ref(0)
  const rowWindow = computed<TimelineRowWindow>(() => timelineRowWindow({
    count: toValue(options.rowCount),
    visibleTop: visibleTop.value,
    visibleBottom: visibleBottom.value,
    focusedRowIndex: options.focusedRowIndex ? toValue(options.focusedRowIndex) : null,
  }))
  const canvasWidthPx = computed(() => state.value ? canvasWidth(state.value.width) : 0)
  const rawTicks = ref<TimelineTick[]>([])
  const rawTickBucket = ref('')
  let epoch = 0
  let raf: number | null = null
  let scrollCommitRaf: number | null = null
  let scrollCommitSerial = 0
  let pendingScrollCommit: number | null = null
  let nativeSyncNeeded = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let resizeObserver: ResizeObserver | null = null
  let langObserver: MutationObserver | null = null
  let activeScroller: HTMLElement | null = null
  let activeHost: HTMLElement | null = null
  let cleanupListeners: (() => void) | null = null
  let lastConfiguredScale = toValue(options.configuredScale)
  let lastTickGeneration = -1
  let stopped = false
  let connectedEpoch = -1

  function currentCenter(): number | null {
    const value = state.value
    return value ? (value.visibleStartMs + value.visibleEndMs) / 2 : null
  }

  function updateToday(now = Date.now()): void {
    try { todayMs.value = floorCalendar(now, { unit: 'day', amount: 1 }, displayTimeZone.value, getWeekStart(locale.value)) }
    catch { displayTimeZone.value = 'UTC'; todayMs.value = floorCalendar(now, { unit: 'day', amount: 1 }, 'UTC', getWeekStart(locale.value)) }
  }

  function tickOptions(value: TimelineViewportState) {
    const transform = viewportTransform(value)
    return {
      transform,
      overscanStartMs: value.overscanStartMs,
      overscanEndMs: value.overscanEndMs,
      locale: locale.value,
      weekStart: getWeekStart(locale.value),
      budget: 80,
    }
  }

  function refreshTicks(force = false): void {
    const value = state.value
    if (!value) { rawTicks.value = []; rawTickBucket.value = ''; lastTickGeneration = -1; return }
    const input = tickOptions(value)
    const bucket = timelineTickBucket(input)
    const rebaseOrTransformChanged = lastTickGeneration !== value.generation
    if (!force && !rebaseOrTransformChanged && bucket === rawTickBucket.value) return
    const generated = generateTimelineTicks(input)
    rawTicks.value = [...generated.major, ...generated.minor]
    rawTickBucket.value = generated.bucketKey
    lastTickGeneration = value.generation
  }

  const screenTicks = computed<TimelineTick[]>(() => {
    const value = state.value
    if (!value) return []
    const transform: Transform = viewportTransform(value)
    return rawTicks.value.map(tick => {
      const x = timeToScreenX(tick.boundaryMs, transform)
      const endX = timeToScreenX(tick.spanEndMs, transform)
      return { ...tick, x, width: endX - x }
    })
  })

  const rulerTicks = computed(() => {
    const width = state.value?.width
    if (width === undefined) return []
    return screenTicks.value
      .filter(tick => tick.x + tick.width > 0 && tick.x < width)
      .map(tick => ({ ...tick, labelOffsetX: Math.max(0, -tick.x) }))
  })

  const todayX = computed(() => {
    if (todayMs.value === null || !state.value || todayMs.value < state.value.overscanStartMs || todayMs.value > state.value.overscanEndMs) return null
    return timeToX(todayMs.value, viewportTransform(state.value))
  })

  const periodLabel = computed(() => {
    const visibleStart = state.value?.visibleStartMs
    if (visibleStart === undefined) return ''
    const majors = rawTicks.value.filter(tick => tick.level === 'major')
    return majors.find(tick => tick.boundaryMs <= visibleStart && tick.spanEndMs > visibleStart)?.label
      ?? majors.find(tick => tick.boundaryMs >= visibleStart)?.label
      ?? majors[0]?.label
      ?? ''
  })

  function cancelScrollCommit(): void {
    scrollCommitSerial++
    pendingScrollCommit = null
    nativeSyncNeeded = false
    if (scrollCommitRaf !== null && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(scrollCommitRaf)
    scrollCommitRaf = null
  }

  function syncNativeScroll(): void {
    const snapshot = state.value
    const target = activeScroller
    if (!snapshot || !target || !target.isConnected) return
    const canvasReady = target.clientWidth > 0 && target.scrollWidth + 0.5 >= canvasWidth(snapshot.width)
    if (canvasReady && target.scrollLeft === snapshot.scrollLeft) {
      cancelScrollCommit()
      return
    }
    cancelScrollCommit()
    const capturedEpoch = epoch
    const serial = ++scrollCommitSerial
    const generation = snapshot.generation
    pendingScrollCommit = serial
    nativeSyncNeeded = true

    const commit = () => {
      scrollCommitRaf = null
      const current = state.value
      if (stopped || capturedEpoch !== epoch || serial !== scrollCommitSerial || pendingScrollCommit !== serial
        || target !== activeScroller || !target.isConnected || !current || current.generation !== generation) return
      if (target.clientWidth <= 0) {
        pendingScrollCommit = null
        return
      }

      const expectedCanvasWidth = canvasWidth(current.width)
      if (target.scrollWidth + 0.5 < expectedCanvasWidth) {
        if (typeof requestAnimationFrame !== 'undefined') scrollCommitRaf = requestAnimationFrame(commit)
        return
      }

      const maximumScroll = Math.max(0, Math.min(target.scrollWidth - target.clientWidth, canvasWidth(current.width) - current.width))
      target.scrollLeft = Math.max(0, Math.min(current.scrollLeft, maximumScroll))
      const actualScrollLeft = target.scrollLeft
      if (stopped || capturedEpoch !== epoch || serial !== scrollCommitSerial || pendingScrollCommit !== serial
        || target !== activeScroller || !target.isConnected || state.value?.generation !== generation) return
      const aligned = alignViewportScroll(state.value, actualScrollLeft)
      if (aligned && aligned !== state.value) {
        state.value = aligned
        refreshTicks(true)
      }
      pendingScrollCommit = null
      nativeSyncNeeded = false
      updatePin()
    }

    void nextTick().then(() => {
      if (stopped || capturedEpoch !== epoch || serial !== scrollCommitSerial || pendingScrollCommit !== serial
        || target !== activeScroller || !target.isConnected || state.value?.generation !== generation) return
      commit()
    })
  }

  function updatePin(): void {
    const root = options.root.value
    const ruler = options.rulerAnchor.value
    const bodyElement = options.body.value
    const host = activeHost
    if (!root?.isConnected || !ruler?.isConnected || !bodyElement?.isConnected || !host?.isConnected) { pinY.value = 0; visibleTop.value = 0; visibleBottom.value = 0; return }
    const hostRect = host.getBoundingClientRect()
    const rootRect = root.getBoundingClientRect()
    const rulerRect = ruler.getBoundingClientRect()
    const bodyRect = bodyElement.getBoundingClientRect()
    const viewportTop = Math.max(0, hostRect.top, rootRect.top)
    const viewportBottom = Math.min(window.innerHeight, hostRect.bottom, rootRect.bottom)
    if (viewportBottom <= viewportTop) { pinY.value = 0; visibleTop.value = 0; visibleBottom.value = 0; return }
    const hostScrollTop = host.scrollTop
    const hostVisibleTop = viewportTop - hostRect.top + hostScrollTop
    const rulerNaturalTop = rulerRect.top - hostRect.top + hostScrollTop - pinY.value
    const rulerHeight = ruler.offsetHeight
    const timelineBottom = bodyRect.bottom - hostRect.top + hostScrollTop
    const maxPin = Math.max(0, timelineBottom - rulerHeight - rulerNaturalTop)
    pinY.value = Math.min(maxPin, Math.max(0, hostVisibleTop - rulerNaturalTop))
    visibleTop.value = Math.max(0, viewportTop - bodyRect.top)
    visibleBottom.value = Math.max(visibleTop.value, viewportBottom - bodyRect.top)
  }

  function measure(capturedEpoch = epoch): boolean {
    if (capturedEpoch !== epoch || stopped) return false
    const root = options.root.value
    const scroller = activeScroller
    if (!root?.isConnected || !scroller?.isConnected) return false
    const width = scroller.clientWidth
    if (width <= 0) return false
    let changed = false
    if (!state.value) {
      updateToday()
      const center = todayMs.value ?? Date.now()
      state.value = createViewport({ width, centerMs: center, scale: effectiveScale.value, displayTimeZone: displayTimeZone.value })
      if (state.value) { changed = true; refreshTicks(true) }
    } else if (Math.abs(state.value.width - width) > 0.5) {
      state.value = updateViewport(state.value, { width })
      if (state.value) { changed = true; refreshTicks(true) }
    }
    updatePin()
    return changed
  }

  function cancelFrame(): void {
    if (raf !== null && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(raf)
    raf = null
  }

  function queueFrame(capturedEpoch = epoch): void {
    if (capturedEpoch !== epoch || stopped || raf !== null || typeof requestAnimationFrame === 'undefined') return
    raf = requestAnimationFrame(() => {
      raf = null
      if (capturedEpoch !== epoch || stopped) return
      const measuredChanged = measure(capturedEpoch)
      if (measuredChanged) syncNativeScroll()
      if (pendingScrollCommit !== null) { updatePin(); return }
      if (nativeSyncNeeded && state.value) { syncNativeScroll(); updatePin(); return }
      const scroller = activeScroller
      if (state.value && scroller?.isConnected && scroller.clientWidth > 0) {
        const next = updateViewport(state.value, { scrollLeft: scroller.scrollLeft })
        if (next) {
          const generationChanged = next.generation !== state.value.generation || next.originMs !== state.value.originMs
          state.value = next
          if (Math.abs(next.scrollLeft - scroller.scrollLeft) > 0.5) syncNativeScroll()
          refreshTicks(generationChanged)
        }
      }
      updatePin()
    })
  }

  function refreshEnvironment(capturedEpoch = epoch): void {
    if (capturedEpoch !== epoch || stopped) return
    const nextLocale = readLocale()
    const nextZone = readTimeZone()
    const localeChanged = nextLocale !== locale.value
    const zoneChanged = nextZone !== displayTimeZone.value
    if (!localeChanged && !zoneChanged) { updateToday(); queueFrame(capturedEpoch); return }
    const center = currentCenter()
    locale.value = nextLocale
    displayTimeZone.value = nextZone
    updateToday()
    if (state.value && center !== null) {
      if (zoneChanged) state.value = updateViewport(state.value, { displayTimeZone: nextZone })
      if (state.value) state.value = centerViewport(state.value, center)
    }
    refreshTicks(true)
    syncNativeScroll()
    queueFrame(capturedEpoch)
  }

  function scheduleHeartbeat(capturedEpoch = epoch): void {
    if (timer !== null) clearTimeout(timer)
    timer = null
    if (stopped || capturedEpoch !== epoch || typeof window === 'undefined') return
    let untilBoundary = 60_000
    try {
      const now = Date.now()
      const today = floorCalendar(now, { unit: 'day', amount: 1 }, displayTimeZone.value, getWeekStart(locale.value))
      const nextDate = addCalendar(today, { unit: 'day', amount: 1 }, displayTimeZone.value)
      const nextBoundary = floorCalendar(nextDate, { unit: 'day', amount: 1 }, displayTimeZone.value, getWeekStart(locale.value))
      untilBoundary = Math.max(1000, nextBoundary - now + 50)
    } catch { /* UTC heartbeat remains bounded. */ }
    timer = setTimeout(() => {
      timer = null
      if (capturedEpoch !== epoch || stopped) return
      refreshEnvironment(capturedEpoch)
      updateToday()
      scheduleHeartbeat(capturedEpoch)
    }, Math.min(60_000, untilBoundary))
  }

  function disconnect(): void {
    cancelScrollCommit()
    cleanupListeners?.()
    cleanupListeners = null
    resizeObserver?.disconnect()
    resizeObserver = null
    langObserver?.disconnect()
    langObserver = null
    activeScroller = null
    activeHost = null
    connectedEpoch = -1
    if (timer !== null) clearTimeout(timer)
    timer = null
    cancelFrame()
  }

  function connect(capturedEpoch = epoch): void {
    if (capturedEpoch !== epoch || stopped) return
    if (connectedEpoch === capturedEpoch) return
    const root = options.root.value
    const scroller = options.scroller.value
    if (!root?.isConnected || !scroller?.isConnected) return
    connectedEpoch = capturedEpoch
    activeScroller = scroller
    activeHost = root.closest<HTMLElement>('.document-wrap') ?? (typeof document !== 'undefined' ? document.scrollingElement as HTMLElement | null : null)

    const onScroll = () => { if (capturedEpoch === epoch && scroller.isConnected) queueFrame(capturedEpoch) }
    const host = activeHost
    const onHostScroll = () => { if (capturedEpoch === epoch) queueFrame(capturedEpoch) }
    const onEnvironment = () => refreshEnvironment(capturedEpoch)
    scroller.addEventListener('scroll', onScroll, { passive: true })
    host?.addEventListener('scroll', onHostScroll, { passive: true })
    window.addEventListener('resize', onHostScroll, { passive: true })
    window.addEventListener('focus', onEnvironment)
    window.addEventListener('pageshow', onEnvironment)
    window.addEventListener('languagechange', onEnvironment)
    document.addEventListener('visibilitychange', onEnvironment)
    cleanupListeners = () => {
      scroller.removeEventListener('scroll', onScroll)
      host?.removeEventListener('scroll', onHostScroll)
      window.removeEventListener('resize', onHostScroll)
      window.removeEventListener('focus', onEnvironment)
      window.removeEventListener('pageshow', onEnvironment)
      window.removeEventListener('languagechange', onEnvironment)
      document.removeEventListener('visibilitychange', onEnvironment)
    }

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => queueFrame(capturedEpoch))
      for (const element of [root, scroller, options.rulerAnchor.value, options.body.value, activeHost]) if (element) resizeObserver.observe(element)
    }
    if (typeof MutationObserver !== 'undefined' && document.documentElement) {
      langObserver = new MutationObserver(onEnvironment)
      langObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
    }
    measure(capturedEpoch)
    syncNativeScroll()
    scheduleHeartbeat(capturedEpoch)
  }

  function rebind(capturedEpoch = epoch): void {
    const nextEpoch = capturedEpoch === epoch ? ++epoch : capturedEpoch
    disconnect()
    connect(nextEpoch)
  }

  function bindScroller(element: HTMLElement | null): void {
    if (options.scroller.value === element) return
    options.scroller.value = element
    rebind()
  }
  function bindRulerAnchor(element: HTMLElement | null): void {
    if (options.rulerAnchor.value === element) return
    options.rulerAnchor.value = element
    rebind()
  }
  function bindBody(element: HTMLElement | null): void {
    if (options.body.value === element) return
    options.body.value = element
    rebind()
  }

  function selectScale(scale: TimelineScaleId): void {
    if (scale === effectiveScale.value) return
    const before = currentCenter()
    localScaleOverride.value = scale
    if (state.value) {
      const next = updateViewport(state.value, { scale })
      state.value = next && before !== null ? centerViewport(next, before) : next
      syncNativeScroll()
      refreshTicks(true)
    } else queueFrame()
  }

  function previous(): void { navigate(-1) }
  function next(): void { navigate(1) }
  function navigate(direction: -1 | 1): void {
    if (!state.value) return
    state.value = stepViewport(state.value, direction)
    syncNativeScroll()
    refreshTicks(true)
    queueFrame()
  }
  function today(): void {
    updateToday()
    if (!state.value || todayMs.value === null) return
    state.value = centerViewport(state.value, todayMs.value)
    syncNativeScroll()
    refreshTicks(true)
    queueFrame()
  }

  async function revealRow(rowIndex: number, isTargetCurrent: () => boolean = () => true, targetSelector = 'button'): Promise<boolean> {
    const capturedEpoch = epoch
    const capturedScope = toValue(options.scope)
    const root = options.root.value
    const bodyElement = options.body.value
    const host = activeHost
    const count = toValue(options.rowCount)
    const isCurrent = () => !stopped && capturedEpoch === epoch && capturedScope === toValue(options.scope)
      && root === options.root.value && root?.isConnected === true
      && bodyElement === options.body.value && bodyElement?.isConnected === true
      && host !== null && host === activeHost && host.isConnected && isTargetCurrent()
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= count || !root || !bodyElement || !host || !isCurrent()) return false

    const bodyRect = bodyElement.getBoundingClientRect()
    const hostRect = host.getBoundingClientRect()
    const rowTopInHost = bodyRect.top - hostRect.top + host.scrollTop + rowIndex * TIMELINE_ROW_HEIGHT
    const rulerHeight = options.rulerAnchor.value?.offsetHeight ?? 56
    const usableHeight = Math.max(TIMELINE_ROW_HEIGHT, host.clientHeight - rulerHeight)
    const targetOffset = rulerHeight + Math.max(0, (usableHeight - TIMELINE_ROW_HEIGHT) / 2)
    const maxScrollTop = Math.max(0, host.scrollHeight - host.clientHeight)
    host.scrollTop = Math.max(0, Math.min(maxScrollTop, rowTopInHost - targetOffset))
    updatePin()
    queueFrame(capturedEpoch)

    await nextTick()
    if (!isCurrent()) return false
    const row = bodyElement.querySelector<HTMLElement>(`[data-row-index="${rowIndex}"]`)
    const target = row?.querySelector<HTMLButtonElement>(targetSelector)
    if (!target?.isConnected || !isCurrent()) return false
    target.focus({ preventScroll: true })
    updatePin()
    return isCurrent() && document.activeElement === target
  }

  async function revealInstant(instantMs: number, rowIndex: number, isTargetCurrent: () => boolean = () => true): Promise<boolean> {
    const capturedEpoch = epoch
    const capturedScope = toValue(options.scope)
    const root = options.root.value
    const bodyElement = options.body.value
    const host = activeHost
    const current = state.value
    const isCurrent = () => !stopped && capturedEpoch === epoch && capturedScope === toValue(options.scope)
      && root === options.root.value && root?.isConnected === true
      && bodyElement === options.body.value && bodyElement?.isConnected === true
      && host !== null && host === activeHost && host.isConnected && isTargetCurrent()
    if (!Number.isFinite(instantMs) || !current || !isCurrent()) return false
    const bounds = timelineInstantBounds(displayTimeZone.value)
    if (instantMs < bounds.minMs || instantMs >= bounds.maxMsExclusive) return false
    const count = toValue(options.rowCount)
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= count) return false

    const centered = centerViewport(current, instantMs)
    if (!centered) return false
    state.value = centered
    refreshTicks(true)
    syncNativeScroll()
    queueFrame(capturedEpoch)
    await nextTick()
    if (!isCurrent()) return false
    return revealRow(rowIndex, isCurrent, '[data-testid="timeline-bar"]')
  }

  watch(() => toValue(options.scope), (nextScope, previousScope) => {
    if (previousScope === undefined || nextScope === previousScope) return
    const capturedEpoch = ++epoch
    disconnect()
    localScaleOverride.value = null
    state.value = null
    todayMs.value = null
    rawTicks.value = []
    rawTickBucket.value = ''
    lastConfiguredScale = toValue(options.configuredScale)
    queueMicrotask(() => connect(capturedEpoch))
  }, { flush: 'sync' })

  watch(() => toValue(options.configuredScale), (nextScale) => {
    const changed = nextScale !== lastConfiguredScale
    lastConfiguredScale = nextScale
    if (!changed) return
    const center = currentCenter()
    localScaleOverride.value = null
    if (state.value && state.value.scale !== effectiveScale.value) {
      const updated = updateViewport(state.value, { scale: effectiveScale.value })
      state.value = updated && center !== null ? centerViewport(updated, center) : updated
      syncNativeScroll()
      refreshTicks(true)
    }
  }, { flush: 'sync' })

  watch(options.root, (root) => {
    if (root?.isConnected) rebind()
  }, { flush: 'post' })

  onMounted(() => {
    const capturedEpoch = epoch
    queueMicrotask(() => {
      if (capturedEpoch === epoch && !stopped) rebind()
    })
  })

  onBeforeUnmount(() => {
    stopped = true
    epoch++
    disconnect()
  })

  return {
    state, effectiveScale, locale, displayTimeZone, ticks: rawTicks, screenTicks, rulerTicks, todayMs, todayX, pinY, periodLabel, rowWindow,
    canvasWidthPx,
    previous, next, today, selectScale, revealRow, revealInstant, bindScroller, bindRulerAnchor, bindBody,
  }
}
