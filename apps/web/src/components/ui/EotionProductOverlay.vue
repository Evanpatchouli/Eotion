<script lang="ts">
const scrollLocks = new Set<symbol>()
let originalOverflow = ''
</script>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ProductOverlayMode } from './productOverlay'

const props = withDefaults(defineProps<{
  mode: ProductOverlayMode
  label: string
  closeLabel?: string
}>(), { closeLabel: '关闭' })
const open = defineModel<boolean>('open', { default: false })
const dialog = ref<HTMLDialogElement | null>(null)
const surface = ref<HTMLElement | null>(null)
let origin: HTMLElement | null = null
let expectedClose = false
const lockToken = Symbol('product-overlay')

function isModalSurface(mode: ProductOverlayMode): boolean {
  return mode === 'modal' || mode === 'right-drawer' || mode === 'bottom-drawer'
}

function lockScroll() {
  if (scrollLocks.has(lockToken)) return
  if (scrollLocks.size === 0) originalOverflow = document.documentElement.style.overflow
  scrollLocks.add(lockToken)
  document.documentElement.style.overflow = 'hidden'
}

function unlockScroll() {
  if (!scrollLocks.delete(lockToken)) return
  if (scrollLocks.size === 0) document.documentElement.style.overflow = originalOverflow
}

function restoreFocus() {
  const target = origin
  origin = null
  if (target?.isConnected && !target.closest('[hidden], [inert], [aria-hidden="true"]')) target.focus({ preventScroll: true })
}

function close() { open.value = false }

async function syncSurface() {
  const isOpen = open.value
  if (isOpen && !origin) origin = document.activeElement instanceof HTMLElement ? document.activeElement : null
  if (isOpen && isModalSurface(props.mode)) {
    await nextTick()
    if (!open.value || !isModalSurface(props.mode)) return
    if (!dialog.value?.open) dialog.value?.showModal()
    lockScroll()
    const focusTarget = dialog.value?.querySelector<HTMLElement>('[autofocus]')
      ?? dialog.value?.querySelector<HTMLElement>('input, textarea, select, [contenteditable="true"], button:not([disabled]), [tabindex="0"]')
    focusTarget?.focus({ preventScroll: true })
  } else {
    if (dialog.value?.open) {
      expectedClose = true
      dialog.value.close()
    }
    unlockScroll()
    if (isOpen && (props.mode === 'drawer' || props.mode === 'page')) {
      await nextTick()
      surface.value?.focus({ preventScroll: true })
    }
  }
  if (!isOpen) await nextTick().then(restoreFocus)
}

function onDialogCancel(event: Event) {
  event.preventDefault()
  close()
}

function onDialogKeydown(event: KeyboardEvent) {
  if (event.key !== 'Tab' || !dialog.value) return
  const stops = [...dialog.value.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]')]
    .filter(element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden')
  const first = stops[0]
  const last = stops.at(-1)
  if (!first || !last) { event.preventDefault(); dialog.value.focus(); return }
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.value)) {
    event.preventDefault()
    first.focus()
  }
}

function onDialogClose() {
  if (expectedClose) { expectedClose = false; return }
  if (open.value) close()
}

function onBackdropClick(event: MouseEvent) {
  if (event.target !== dialog.value || !dialog.value) return
  const bounds = dialog.value.getBoundingClientRect()
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close()
}

function onWindowKeydown(event: KeyboardEvent) {
  if (!open.value || (props.mode !== 'drawer' && props.mode !== 'page') || event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return
  event.preventDefault()
  event.stopPropagation()
  close()
}

watch(() => [open.value, props.mode], () => { void syncSurface() }, { flush: 'post' })
onMounted(() => { window.addEventListener('keydown', onWindowKeydown, true); void syncSurface() })
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown, true)
  if (dialog.value?.open) { expectedClose = true; dialog.value.close() }
  unlockScroll()
  restoreFocus()
})
</script>

<template>
  <Teleport defer to="#eotion-product-page-layer">
    <section v-if="open && mode === 'page'" ref="surface" class="eotion-product-overlay eotion-product-overlay--page" :aria-label="label" data-overlay-mode="page" tabindex="-1">
      <button class="eotion-product-overlay__close eotion-product-overlay__back" type="button" :aria-label="closeLabel" @click="close">← 返回</button>
      <slot :close="close" />
    </section>
  </Teleport>
  <Teleport to="body">
    <aside v-if="open && mode === 'drawer'" ref="surface" class="eotion-product-overlay eotion-product-overlay--drawer" :aria-label="label" data-overlay-mode="drawer" tabindex="-1">
      <button class="eotion-product-overlay__close" type="button" :aria-label="closeLabel" @click="close">×</button>
      <slot :close="close" />
    </aside>
    <dialog ref="dialog" class="eotion-product-overlay eotion-product-overlay--dialog" :class="`eotion-product-overlay--${mode}`" :aria-label="label" data-overlay-mode="masked" @cancel="onDialogCancel" @close="onDialogClose" @keydown="onDialogKeydown" @click="onBackdropClick">
      <template v-if="open && isModalSurface(mode)">
        <button class="eotion-product-overlay__close" type="button" :aria-label="closeLabel" @click="close">×</button>
        <slot :close="close" />
      </template>
    </dialog>
  </Teleport>
</template>

<style scoped>
.eotion-product-overlay {
  box-sizing: border-box;
  z-index: 1000;
  overflow: auto;
  overscroll-behavior: contain;
  padding: var(--e-space-6);
  background: var(--e-color-elevated);
  color: var(--e-color-text-primary);
  border: var(--e-border-width) solid var(--e-color-border);
  font: var(--e-type-ui-weight) var(--e-type-ui-size) / var(--e-type-ui-line) var(--e-type-family);
}
.eotion-product-overlay--drawer {
  position: fixed;
  inset: 0 0 0 auto;
  width: min(460px, 42vw);
  height: 100dvh;
  box-shadow: -8px 0 24px rgb(0 0 0 / 8%);
}
.eotion-product-overlay--dialog {
  max-width: none;
  max-height: none;
  margin: auto;
}
.eotion-product-overlay--dialog::backdrop { background: var(--e-color-overlay); }
.eotion-product-overlay--modal {
  width: min(720px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  border-radius: var(--e-radius-dialog);
}
.eotion-product-overlay--right-drawer {
  position: fixed;
  inset: 0 0 0 auto;
  width: var(--mobile-sidebar-width);
  height: 100dvh;
  margin: 0;
}
.eotion-product-overlay--bottom-drawer {
  position: fixed;
  inset: auto 0 0;
  width: 100vw;
  max-height: min(85dvh, 760px);
  margin: 0;
  padding-bottom: calc(var(--e-space-6) + env(safe-area-inset-bottom));
  border-radius: var(--e-radius-dialog) var(--e-radius-dialog) 0 0;
}
.eotion-product-overlay--page { position: absolute; inset: 0; width: 100%; min-height: 100%; pointer-events: auto; }
.eotion-product-overlay__close {
  display: block;
  margin: 0 0 var(--e-space-4) auto;
  border: 0;
  border-radius: var(--e-radius-control);
  background: transparent;
  color: var(--e-color-text-secondary);
  font: inherit;
  font-size: 24px;
  cursor: pointer;
}
.eotion-product-overlay__close:hover { background: var(--e-color-hover); color: var(--e-color-text-primary); }
.eotion-product-overlay__back { margin: 0 0 var(--e-space-6); font-size: inherit; }
.eotion-product-overlay__close:focus-visible, .eotion-product-overlay:focus-visible { outline: var(--e-focus-ring-width) solid var(--e-color-focus); }
@media (max-width: 767px) {
  .eotion-product-overlay--modal { width: calc(100vw - 24px); max-height: calc(100dvh - 24px); }
}
</style>
