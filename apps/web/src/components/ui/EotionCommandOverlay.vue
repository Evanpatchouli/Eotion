<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  label?: string
  shortcut?: boolean
  dismissible?: boolean
}>(), {
  label: '命令',
  shortcut: true,
  dismissible: true,
})

const open = defineModel<boolean>('open', { default: false })
const dialogElement = ref<HTMLDialogElement | null>(null)
let previouslyFocusedElement: HTMLElement | null = null
let expectedCloseEvents = 0

function isFocusable(element: HTMLElement) {
  if (element.tabIndex < 0 || element.getClientRects().length === 0) return false
  if (element.matches(':disabled, [hidden], [aria-hidden="true"], [inert]')) return false
  if (element.closest('[hidden], [aria-hidden="true"], [inert]')) return false
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const style = window.getComputedStyle(current)
    if (style.display === 'none' || style.visibility === 'hidden') return false
  }
  return true
}

function focusableElements() {
  const dialog = dialogElement.value
  if (!dialog) return []

  return [...dialog.querySelectorAll<HTMLElement>(
    'a[href], button, input, select, textarea, [tabindex]:not([tabindex^="-"]), [contenteditable="true"]',
  )].filter(isFocusable).sort((a, b) => (a.tabIndex || Infinity) - (b.tabIndex || Infinity))
}

function restoreFocus() {
  const element = previouslyFocusedElement
  previouslyFocusedElement = null
  if (!element?.isConnected || element === document.body) return
  if (element.matches(':disabled, [hidden]') || element.closest('[inert], [aria-hidden="true"], [hidden]')) return
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const style = window.getComputedStyle(current)
    if (style.display === 'none' || style.visibility === 'hidden') return
  }
  element.focus({ preventScroll: true })
}

function syncDialog(isOpen: boolean) {
  const dialog = dialogElement.value
  if (!dialog) return

  if (isOpen) {
    if (dialog.open) return
    previouslyFocusedElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    dialog.showModal()
    if (focusableElements().length === 0) dialog.focus()
    return
  }

  if (dialog.open) {
    expectedCloseEvents += 1
    dialog.close()
  } else {
    restoreFocus()
  }
}

function close() {
  if (props.dismissible && open.value) open.value = false
}

function onDialogCancel(event: Event) {
  event.preventDefault()
  close()
}

function onDialogKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (event.isComposing || event.keyCode === 229) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    event.preventDefault()
    event.stopPropagation()
    close()
    return
  }

  if (event.key === 'Tab') {
    const items = focusableElements()
    if (items.length === 0) {
      event.preventDefault()
      dialogElement.value?.focus()
    } else if (event.shiftKey && (document.activeElement === items[0] || document.activeElement === dialogElement.value)) {
      event.preventDefault()
      items.at(-1)?.focus()
    } else if (!event.shiftKey && (document.activeElement === items.at(-1) || document.activeElement === dialogElement.value)) {
      event.preventDefault()
      items[0]?.focus()
    }
  }
}

function onDialogClose() {
  if (expectedCloseEvents > 0) {
    expectedCloseEvents -= 1
    if (!open.value) restoreFocus()
    return
  }

  if (open.value) open.value = false
  restoreFocus()
}

function hasAnotherModalDialog() {
  return [...document.querySelectorAll<HTMLDialogElement>('dialog')]
    .some(dialog => dialog !== dialogElement.value && dialog.open && dialog.matches(':modal'))
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (
    event.key.toLowerCase() !== 'k'
    || !(event.ctrlKey || event.metaKey)
    || event.altKey
    || event.shiftKey
    || event.repeat
    || event.isComposing
    || event.defaultPrevented
    || !props.shortcut
    || open.value
    || hasAnotherModalDialog()
  ) return

  event.preventDefault()
  open.value = true
}

function addShortcutListener() {
  if (props.shortcut) document.addEventListener('keydown', onDocumentKeydown)
}

function removeShortcutListener() {
  document.removeEventListener('keydown', onDocumentKeydown)
}

watch(open, syncDialog, { flush: 'post' })

watch(() => props.shortcut, enabled => {
  removeShortcutListener()
  if (enabled) addShortcutListener()
})

onMounted(() => {
  syncDialog(open.value)
  addShortcutListener()
})

onBeforeUnmount(() => {
  removeShortcutListener()
  const dialog = dialogElement.value
  if (dialog?.open) {
    expectedCloseEvents += 1
    dialog.close()
  }
  restoreFocus()
})
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialogElement"
      class="eotion-command-overlay"
      :aria-label="label"
      aria-modal="true"
      tabindex="-1"
      @cancel="onDialogCancel"
      @close="onDialogClose"
      @keydown="onDialogKeydown"
    ><slot :close="close" /></dialog>
  </Teleport>
</template>

<style scoped>
.eotion-command-overlay {
  box-sizing: border-box;
  width: min(calc(100% - 32px), 40rem);
  max-width: none;
  max-height: calc(100dvh - 32px);
  overflow: auto;
  padding: var(--e-space-6);
  border: var(--e-border-width) solid var(--e-color-border);
  border-radius: var(--e-radius-dialog);
  background: var(--e-color-elevated);
  color: var(--e-color-text-primary);
  font: var(--e-type-ui-weight) var(--e-type-ui-size) / var(--e-type-ui-line) var(--e-type-family);
}

.eotion-command-overlay:focus-visible {
  outline: var(--e-focus-ring-width) solid var(--e-color-focus);
  outline-offset: 1px;
}

.eotion-command-overlay::backdrop {
  background: var(--e-color-overlay);
}
</style>
