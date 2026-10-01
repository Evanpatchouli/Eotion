<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch, type ComponentPublicInstance } from 'vue'

const props = withDefaults(defineProps<{
  disabled?: boolean
  label?: string
  panelWidth?: string
  mode?: 'menu' | 'dialog'
}>(), {
  disabled: false,
  label: '菜单',
  mode: 'menu',
})

const open = defineModel<boolean>('open', { default: false })
const panelId = useId()
const triggerElement = ref<HTMLElement | null>(null)
const panelElement = ref<HTMLElement | null>(null)
const position = ref({ left: 0, top: 0, maxHeight: 0, placement: 'bottom' as 'bottom' | 'top' })
let resizeObserver: ResizeObserver | undefined
let disposed = false
let pendingFocus: 'initial' | 'first' | 'last' | null = null

function setTriggerElement(element: Element | ComponentPublicInstance | null) {
  const nativeElement = element instanceof Element ? element : element?.$el
  triggerElement.value = nativeElement instanceof HTMLElement ? nativeElement : null
}

const triggerProps = computed(() => ({
  ref: setTriggerElement,
  type: 'button',
  'aria-haspopup': props.mode,
  'aria-expanded': open.value,
  'aria-controls': panelId,
  'aria-disabled': props.disabled || undefined,
  disabled: props.disabled || undefined,
  onClick: toggle,
  onKeydown: onTriggerKeydown,
}))

function toggle() {
  if (props.disabled) return
  if (open.value) {
    pendingFocus = null
    open.value = false
  } else {
    pendingFocus = 'initial'
    open.value = true
  }
}

function close(restoreFocus = true) {
  if (!open.value) return
  pendingFocus = null
  open.value = false
  if (restoreFocus) void nextTick(() => { if (!disposed) triggerElement.value?.focus() })
}

function menuItems() {
  const selector = props.mode === 'dialog'
    ? '[data-popover-item]:not([aria-disabled="true"]):not(:disabled)'
    : '[role="menuitem"]:not([aria-disabled="true"]):not(:disabled)'
  return [...(panelElement.value?.querySelectorAll<HTMLElement>(selector) ?? [])]
}

function focusMenuItem(edge: 'first' | 'last' | 'initial') {
  const items = menuItems()
  if (!items.length) {
    if (props.mode === 'dialog') panelElement.value?.focus()
    return
  }
  if (edge === 'initial') {
    const safeItem = items.find(item => !item.matches('[data-danger="true"], [data-destructive="true"], [data-variant="danger"], .eotion-button--danger'))
    safeItem?.focus()
    return
  }
  items[edge === 'first' ? 0 : items.length - 1]?.focus()
}

function onTriggerKeydown(event: KeyboardEvent) {
  if (props.disabled) return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const edge = event.key === 'ArrowDown' ? 'first' : 'last'
    if (open.value) {
      pendingFocus = null
      focusMenuItem(edge)
    } else {
      pendingFocus = edge
      open.value = true
    }
  }
}

function onPanelKeydown(event: KeyboardEvent) {
  if (event.key === 'Tab') {
    if (props.mode === 'menu') {
      close(false)
      return
    }
    const focusable = [...(panelElement.value?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"]):not([aria-disabled="true"])') ?? [])]
      .filter(item => !item.hidden && item.getAttribute('aria-hidden') !== 'true')
    const first = focusable[0]
    const last = focusable.at(-1)
    if (!first || !last) return
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }

  const items = menuItems()
  const activeIndex = items.indexOf(document.activeElement as HTMLElement)
  if (props.mode === 'dialog' && activeIndex === -1) return
  if (event.key === 'Home') {
    event.preventDefault()
    items[0]?.focus()
  } else if (event.key === 'End') {
    event.preventDefault()
    items.at(-1)?.focus()
  } else if (event.key === 'ArrowDown' && items.length) {
    event.preventDefault()
    items[(activeIndex + 1 + items.length) % items.length]?.focus()
  } else if (event.key === 'ArrowUp' && items.length) {
    event.preventDefault()
    items[(activeIndex <= 0 ? items.length - 1 : activeIndex - 1)]?.focus()
  }
}

function updatePosition() {
  const trigger = triggerElement.value
  const panel = panelElement.value
  if (!trigger || !panel) return

  const rect = trigger.getBoundingClientRect()
  const panelRect = panel.getBoundingClientRect()
  const panelStyle = window.getComputedStyle(panel)
  const borderHeight = Number.parseFloat(panelStyle.borderTopWidth) + Number.parseFloat(panelStyle.borderBottomWidth)
  const naturalHeight = panel.scrollHeight + borderHeight
  const margin = 8
  const gap = 6
  const below = window.innerHeight - rect.bottom - gap - margin
  const above = rect.top - gap - margin
  const placement = naturalHeight <= below || below >= above ? 'bottom' : 'top'
  const maxHeight = Math.max(0, placement === 'bottom' ? below : above)
  const viewportTop = placement === 'bottom'
    ? Math.min(rect.bottom + gap, window.innerHeight - margin)
    : Math.max(margin, rect.top - gap - Math.min(naturalHeight, maxHeight))
  const left = Math.max(margin, Math.min(rect.left, window.innerWidth - panelRect.width - margin))
  position.value = { left: left + window.scrollX, top: viewportTop + window.scrollY, maxHeight, placement }
}

function onOutsideClick(event: MouseEvent) {
  const target = event.target as Node | null
  if (target && !triggerElement.value?.contains(target) && !panelElement.value?.contains(target)) {
    const element = target instanceof Element ? target : target.parentElement
    const receivesPointerFocus = Boolean(element?.closest('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [contenteditable="true"], [tabindex]:not([tabindex="-1"])'))
    close(!receivesPointerFocus)
  }
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}

function addPositionListeners() {
  window.addEventListener('resize', updatePosition)
  window.addEventListener('scroll', updatePosition, true)
  document.addEventListener('click', onOutsideClick)
  document.addEventListener('keydown', onDocumentKeydown)
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(updatePosition)
    if (triggerElement.value) resizeObserver.observe(triggerElement.value)
    if (panelElement.value) resizeObserver.observe(panelElement.value)
  }
}

function removePositionListeners() {
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition, true)
  document.removeEventListener('click', onOutsideClick)
  document.removeEventListener('keydown', onDocumentKeydown)
  resizeObserver?.disconnect()
  resizeObserver = undefined
}

watch(open, async (isOpen) => {
  if (!isOpen) {
    pendingFocus = null
    removePositionListeners()
    return
  }
  await nextTick()
  if (disposed || !open.value) return
  updatePosition()
  addPositionListeners()
  focusMenuItem(pendingFocus ?? 'initial')
  pendingFocus = null
})

watch(() => props.disabled, (disabled) => {
  if (disabled) close(false)
})

onBeforeUnmount(() => {
  disposed = true
  removePositionListeners()
})
</script>

<template>
  <span class="eotion-popover-anchor">
    <slot name="trigger" :toggle="toggle" :open="open" :trigger-props="triggerProps" />
  </span>
  <Teleport to="body">
    <div
      v-if="open"
      ref="panelElement"
      :id="panelId"
      class="eotion-popover-panel"
      :role="mode"
      :tabindex="mode === 'dialog' ? -1 : undefined"
      :aria-label="label"
      :data-placement="position.placement"
      :style="{ left: `${position.left}px`, top: `${position.top}px`, maxHeight: `${position.maxHeight}px`, ...(panelWidth ? { width: panelWidth } : {}) }"
      @keydown="onPanelKeydown"
    ><slot :close="close" /></div>
  </Teleport>
</template>

<style scoped>
.eotion-popover-anchor { display: contents; }
.eotion-popover-panel {
  position: absolute;
  z-index: 1000;
  min-width: 160px;
  max-width: calc(100vw - 16px);
  overflow: auto;
  padding: var(--e-space-1);
  border: var(--e-border-width) solid var(--e-color-border);
  border-radius: var(--e-radius-popover);
  background: var(--e-color-elevated);
  box-shadow: var(--e-shadow-popover);
  color: var(--e-color-text-primary);
  font: var(--e-type-ui-weight) var(--e-type-ui-size) / var(--e-type-ui-line) var(--e-type-family);
}
</style>
