<script lang="ts">
const scrollLocks = new Set<symbol>()
let originalOverflow = ''
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ProductOverlayMode } from './productOverlay'

const props = withDefaults(defineProps<{
  mode: ProductOverlayMode
  label?: string
  title?: string
  closeLabel?: string
  dismissible?: boolean
}>(), { closeLabel: '关闭', dismissible: true })
const open = defineModel<boolean>('open', { default: false })
const accessibleName = computed(() => props.label ?? props.title)
const visibleTitle = computed(() => props.title ?? props.label)
const dialog = ref<HTMLDialogElement | null>(null)
const drawerDialog = ref<HTMLDialogElement | null>(null)
const surface = ref<HTMLElement | null>(null)
let origin: HTMLElement | null = null
const expectedCloses = new WeakSet<HTMLDialogElement>()
const motions = new Map<HTMLElement, () => void>()
const maskedDrawers = new Set<HTMLDialogElement>()
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

function isDrawer(mode: ProductOverlayMode): boolean {
  return mode === 'drawer' || mode === 'right-drawer' || mode === 'bottom-drawer'
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function cancelMotion(element: HTMLElement) {
  motions.get(element)?.()
  motions.delete(element)
}

function waitForMotion(element: HTMLElement, duration: number, done: () => void) {
  if (reducedMotion()) { done(); return }
  // Read after the state change so an old enter transition cannot finish a new leave.
  void getComputedStyle(element).transform
  const transition = element.getAnimations().find(animation =>
    (animation as Animation & { transitionProperty?: string }).transitionProperty === 'transform',
  )
  let settled = false
  const complete = () => {
    if (settled) return
    settled = true
    window.clearTimeout(timeout)
    if (motions.get(element) === complete) motions.delete(element)
    done()
  }
  const timeout = window.setTimeout(complete, duration + 50)
  motions.set(element, complete)
  if (transition) void transition.finished.then(complete, complete)
  else complete()
}

function close() {
  if (!props.dismissible) return
  open.value = false
}

function onDrawerEnter(element: Element, done: () => void) {
  const node = element as HTMLElement
  cancelMotion(node)
  if (!origin) origin = document.activeElement instanceof HTMLElement ? document.activeElement : null
  motions.set(node, done)
  void nextTick().then(() => {
    if (node.dataset.motionState !== 'entering' || !node.isConnected || !open.value || !isDrawer(props.mode)) {
      if (motions.get(node) === done) cancelMotion(node)
      return
    }
    const hadModal = Boolean(dialog.value?.open)
    if (dialog.value?.open) { expectedCloses.add(dialog.value); dialog.value.close() }
    if (node instanceof HTMLDialogElement) {
      node.showModal()
      maskedDrawers.add(node)
      lockScroll()
    } else if (hadModal) {
      unlockScroll()
    }
    const focusTarget = node instanceof HTMLDialogElement ? node.querySelector<HTMLElement>('.eotion-product-overlay__body [autofocus]')
      ?? node.querySelector<HTMLElement>('.eotion-product-overlay__body input:not([disabled]), .eotion-product-overlay__body textarea:not([disabled]), .eotion-product-overlay__body select:not([disabled]), .eotion-product-overlay__body [contenteditable="true"], .eotion-product-overlay__body button:not([disabled]), .eotion-product-overlay__body [tabindex="0"]')
      ?? node.querySelector<HTMLElement>('.eotion-product-overlay__footer button:not([disabled]), .eotion-product-overlay__footer [tabindex="0"]')
      ?? node.querySelector<HTMLElement>('.eotion-product-overlay__body') : node
    focusTarget?.focus({ preventScroll: true })
    if (reducedMotion()) { node.dataset.motionState = 'open'; motions.delete(node); done(); return }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (node.dataset.motionState !== 'entering' || !node.isConnected) return
      node.dataset.motionState = 'open'
      waitForMotion(node, 200, done)
    }))
  })
}

function onDrawerBeforeEnter(element: Element) {
  (element as HTMLElement).dataset.motionState = 'entering'
}

function onDrawerLeave(element: Element, done: () => void) {
  const node = element as HTMLElement
  cancelMotion(node)
  node.dataset.motionState = 'leaving'
  waitForMotion(node, 170, () => {
    if (node instanceof HTMLDialogElement) {
      if (node.open) { expectedCloses.add(node); node.close() }
      maskedDrawers.delete(node)
    }
    if (!isModalSurface(props.mode) || (!open.value && maskedDrawers.size === 0)) unlockScroll()
    done()
    if (!open.value) void nextTick().then(() => { if (!open.value) restoreFocus() })
  })
}

async function syncSurface() {
  const isOpen = open.value
  if (isOpen && !origin) origin = document.activeElement instanceof HTMLElement ? document.activeElement : null
  if (isDrawer(props.mode)) {
    const wasModalOpen = Boolean(dialog.value?.open)
    if (dialog.value?.open) {
      expectedCloses.add(dialog.value)
      dialog.value.close()
      if (maskedDrawers.size === 0 && (!isOpen || props.mode === 'drawer')) unlockScroll()
    }
    if (wasModalOpen && !isOpen && maskedDrawers.size === 0) {
      await nextTick()
      if (!open.value && maskedDrawers.size === 0) restoreFocus()
    }
    return
  }
  if (isOpen && isModalSurface(props.mode)) {
    await nextTick()
    if (!open.value || !isModalSurface(props.mode)) return
    if (!dialog.value?.open) dialog.value?.showModal()
    lockScroll()
    const focusTarget = dialog.value?.querySelector<HTMLElement>('.eotion-product-overlay__body [autofocus]')
      ?? dialog.value?.querySelector<HTMLElement>('.eotion-product-overlay__body input:not([disabled]), .eotion-product-overlay__body textarea:not([disabled]), .eotion-product-overlay__body select:not([disabled]), .eotion-product-overlay__body [contenteditable="true"], .eotion-product-overlay__body button:not([disabled]), .eotion-product-overlay__body [tabindex="0"]')
      ?? dialog.value?.querySelector<HTMLElement>('.eotion-product-overlay__footer button:not([disabled]), .eotion-product-overlay__footer [tabindex="0"]')
      ?? dialog.value?.querySelector<HTMLElement>('.eotion-product-overlay__body')
    focusTarget?.focus({ preventScroll: true })
  } else {
    if (dialog.value?.open) {
      expectedCloses.add(dialog.value)
      dialog.value.close()
    }
    if (maskedDrawers.size === 0) unlockScroll()
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
  const currentDialog = event.currentTarget as HTMLDialogElement
  if (event.key === 'Escape' && (event.isComposing || event.keyCode === 229 || !props.dismissible)) {
    event.preventDefault()
    event.stopPropagation()
    return
  }
  if (event.key !== 'Tab') return
  const stops = [...currentDialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]')]
    .filter(element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden')
  const first = stops[0]
  const last = stops.at(-1)
  if (!first || !last) { event.preventDefault(); currentDialog.focus(); return }
  if (event.shiftKey && (document.activeElement === first || document.activeElement === currentDialog)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === currentDialog)) {
    event.preventDefault()
    first.focus()
  }
}

function onDialogClose(event: Event) {
  const currentDialog = event.currentTarget as HTMLDialogElement
  if (expectedCloses.delete(currentDialog)) return
  if (open.value) {
    if (props.dismissible) close()
    else void syncSurface()
  }
}

function onBackdropClick(event: MouseEvent) {
  const currentDialog = event.currentTarget as HTMLDialogElement
  if (event.target !== currentDialog) return
  const bounds = currentDialog.getBoundingClientRect()
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close()
}

function onWindowKeydown(event: KeyboardEvent) {
  if (!open.value || (props.mode !== 'drawer' && props.mode !== 'page') || event.key !== 'Escape' || event.isComposing || event.keyCode === 229 || event.defaultPrevented) return
  event.preventDefault()
  event.stopPropagation()
  close()
}

watch(() => [open.value, props.mode], () => { void syncSurface() }, { flush: 'post' })
onMounted(() => { window.addEventListener('keydown', onWindowKeydown, true); void syncSurface() })
onBeforeUnmount(() => {
  for (const finish of [...motions.values()]) finish()
  motions.clear()
  window.removeEventListener('keydown', onWindowKeydown, true)
  if (dialog.value?.open) { expectedCloses.add(dialog.value); dialog.value.close() }
  if (drawerDialog.value?.open) { expectedCloses.add(drawerDialog.value); drawerDialog.value.close() }
  maskedDrawers.clear()
  unlockScroll()
  restoreFocus()
})
</script>

<template>
  <Teleport defer to="#eotion-product-page-layer">
    <section v-if="open && mode === 'page'" ref="surface" class="eotion-product-overlay eotion-product-overlay--page" :aria-label="accessibleName" data-overlay-mode="page" tabindex="-1">
      <div class="eotion-product-overlay__shell">
        <header class="eotion-product-overlay__header">
          <h1 class="eotion-product-overlay__title">{{ visibleTitle }}</h1>
          <button class="eotion-product-overlay__close eotion-product-overlay__back" type="button" :aria-label="closeLabel" :disabled="!dismissible" @click="close">← 返回</button>
        </header>
        <div class="eotion-product-overlay__body" tabindex="-1"><slot :close="close" /></div>
        <footer v-if="$slots.footer" class="eotion-product-overlay__footer"><slot name="footer" :close="close" /></footer>
      </div>
    </section>
  </Teleport>
  <Teleport to="body">
    <Transition appear :css="false" @before-enter="onDrawerBeforeEnter" @enter="onDrawerEnter" @leave="onDrawerLeave">
      <aside v-if="open && mode === 'drawer'" ref="surface" class="eotion-product-overlay eotion-product-overlay--drawer" :aria-label="accessibleName" data-overlay-mode="drawer" tabindex="-1">
        <div class="eotion-product-overlay__shell">
          <header class="eotion-product-overlay__header">
            <h2 class="eotion-product-overlay__title">{{ visibleTitle }}</h2>
            <button class="eotion-product-overlay__close" type="button" :aria-label="closeLabel" :disabled="!dismissible" @click="close">×</button>
          </header>
          <div class="eotion-product-overlay__body" tabindex="-1"><slot :close="close" /></div>
          <footer v-if="$slots.footer" class="eotion-product-overlay__footer"><slot name="footer" :close="close" /></footer>
        </div>
      </aside>
    </Transition>
    <Transition appear :css="false" @before-enter="onDrawerBeforeEnter" @enter="onDrawerEnter" @leave="onDrawerLeave">
      <dialog v-if="open && (mode === 'right-drawer' || mode === 'bottom-drawer')" ref="drawerDialog" class="eotion-product-overlay eotion-product-overlay--dialog" :class="`eotion-product-overlay--${mode}`" :aria-label="accessibleName" data-overlay-mode="masked" @cancel="onDialogCancel" @close="onDialogClose" @keydown="onDialogKeydown" @click="onBackdropClick">
        <div class="eotion-product-overlay__shell">
          <header class="eotion-product-overlay__header">
            <h2 class="eotion-product-overlay__title">{{ visibleTitle }}</h2>
            <button class="eotion-product-overlay__close" type="button" :aria-label="closeLabel" :disabled="!dismissible" @click="close">×</button>
          </header>
          <div class="eotion-product-overlay__body" tabindex="-1"><slot :close="close" /></div>
          <footer v-if="$slots.footer" class="eotion-product-overlay__footer"><slot name="footer" :close="close" /></footer>
        </div>
      </dialog>
    </Transition>
    <dialog ref="dialog" class="eotion-product-overlay eotion-product-overlay--dialog eotion-product-overlay--modal" :aria-label="accessibleName" data-overlay-mode="masked" @cancel="onDialogCancel" @close="onDialogClose" @keydown="onDialogKeydown" @click="onBackdropClick">
      <div v-if="open && mode === 'modal'" class="eotion-product-overlay__shell">
        <header class="eotion-product-overlay__header">
          <h2 class="eotion-product-overlay__title">{{ visibleTitle }}</h2>
          <button class="eotion-product-overlay__close" type="button" :aria-label="closeLabel" :disabled="!dismissible" @click="close">×</button>
        </header>
        <div class="eotion-product-overlay__body" tabindex="-1"><slot :close="close" /></div>
        <footer v-if="$slots.footer" class="eotion-product-overlay__footer"><slot name="footer" :close="close" /></footer>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.eotion-product-overlay {
  box-sizing: border-box;
  z-index: 1000;
  /* Popovers teleport here to remain inside the native dialog top layer. */
  overflow: visible;
  overscroll-behavior: contain;
  padding: 0;
  background: var(--e-color-elevated);
  color: var(--e-color-text-primary);
  border: var(--e-border-width) solid var(--e-color-border);
  font: var(--e-type-ui-weight) var(--e-type-ui-size) / var(--e-type-ui-line) var(--e-type-family);
}
.eotion-product-overlay:not(dialog), .eotion-product-overlay--dialog[open] { display: flex; flex-direction: column; }
.eotion-product-overlay__shell {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  max-height: inherit;
  overflow: hidden;
  border-radius: inherit;
}
.eotion-product-overlay__header {
  display: flex;
  flex: none;
  min-height: 64px;
  align-items: center;
  justify-content: space-between;
  gap: var(--e-space-4);
  padding: var(--e-space-3) var(--e-space-6);
  border-bottom: var(--e-border-width) solid var(--e-color-border-subtle);
}
.eotion-product-overlay__title {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--e-color-text-primary);
  font-size: var(--e-type-heading-2-size);
  font-weight: var(--e-type-heading-2-weight);
  line-height: var(--e-type-heading-2-line);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.eotion-product-overlay__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: var(--e-space-6);
}
.eotion-product-overlay__footer {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: flex-end;
  gap: var(--e-space-2);
  padding: var(--e-space-4) var(--e-space-6);
  border-top: var(--e-border-width) solid var(--e-color-border-subtle);
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
  border-radius: var(--e-radius-dialog) var(--e-radius-dialog) 0 0;
}
.eotion-product-overlay--bottom-drawer > .eotion-product-overlay__shell { padding-bottom: env(safe-area-inset-bottom); }
.eotion-product-overlay--page { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: auto; }
.eotion-product-overlay--drawer,
.eotion-product-overlay--right-drawer,
.eotion-product-overlay--bottom-drawer {
  transition: transform 200ms ease-out;
}
.eotion-product-overlay--drawer[data-motion-state="entering"],
.eotion-product-overlay--drawer[data-motion-state="leaving"],
.eotion-product-overlay--right-drawer[data-motion-state="entering"],
.eotion-product-overlay--right-drawer[data-motion-state="leaving"] { transform: translateX(100%); }
.eotion-product-overlay--bottom-drawer[data-motion-state="entering"],
.eotion-product-overlay--bottom-drawer[data-motion-state="leaving"] { transform: translateY(100%); }
.eotion-product-overlay--drawer[data-motion-state="leaving"],
.eotion-product-overlay--right-drawer[data-motion-state="leaving"],
.eotion-product-overlay--bottom-drawer[data-motion-state="leaving"] { transition-duration: 170ms; transition-timing-function: ease-in; }
.eotion-product-overlay--right-drawer::backdrop,
.eotion-product-overlay--bottom-drawer::backdrop { opacity: 1; transition: opacity 200ms ease-out; }
.eotion-product-overlay--right-drawer[data-motion-state="entering"]::backdrop,
.eotion-product-overlay--right-drawer[data-motion-state="leaving"]::backdrop,
.eotion-product-overlay--bottom-drawer[data-motion-state="entering"]::backdrop,
.eotion-product-overlay--bottom-drawer[data-motion-state="leaving"]::backdrop { opacity: 0; }
.eotion-product-overlay--right-drawer[data-motion-state="leaving"]::backdrop,
.eotion-product-overlay--bottom-drawer[data-motion-state="leaving"]::backdrop { transition-duration: 170ms; transition-timing-function: ease-in; }
.eotion-product-overlay__close {
  flex: none;
  min-width: 36px;
  min-height: 36px;
  padding: var(--e-space-1);
  border: 0;
  border-radius: var(--e-radius-control);
  background: transparent;
  color: var(--e-color-text-secondary);
  font: inherit;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}
.eotion-product-overlay__close:hover { background: var(--e-color-hover); color: var(--e-color-text-primary); }
.eotion-product-overlay__close:disabled { color: var(--e-color-text-muted); cursor: default; }
.eotion-product-overlay__close:disabled:hover { background: transparent; }
.eotion-product-overlay__back { width: auto; padding: var(--e-space-2); font-size: var(--e-type-ui-size); line-height: var(--e-type-ui-line); }
.eotion-product-overlay__close:focus-visible, .eotion-product-overlay:focus-visible { outline: var(--e-focus-ring-width) solid var(--e-color-focus); }
@media (max-width: 767px) {
  .eotion-product-overlay--modal { width: calc(100vw - 24px); max-height: calc(100dvh - 24px); }
}
@media (prefers-reduced-motion: reduce) {
  .eotion-product-overlay--drawer,
  .eotion-product-overlay--right-drawer,
  .eotion-product-overlay--bottom-drawer,
  .eotion-product-overlay--right-drawer::backdrop,
  .eotion-product-overlay--bottom-drawer::backdrop { transition: none; }
  .eotion-product-overlay--drawer[data-motion-state],
  .eotion-product-overlay--right-drawer[data-motion-state],
  .eotion-product-overlay--bottom-drawer[data-motion-state] { transform: none; }
  .eotion-product-overlay--right-drawer[data-motion-state]::backdrop,
  .eotion-product-overlay--bottom-drawer[data-motion-state]::backdrop { opacity: 1; }
}
</style>
