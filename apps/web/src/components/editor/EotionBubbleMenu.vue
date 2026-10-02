<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { isSafeLinkHref } from '../../editor/link'
import EotionIcon from '../ui/EotionIcon.vue'

const props = defineProps<{ editor: Editor; composing: boolean; enabled: boolean }>()

const hiddenSelection = ref<string | null>(null)
const activeMarks = ['bold', 'italic', 'strike', 'code'] as const
const editorRevision = ref(0)
const editingLink = ref(false)
const linkHref = ref('')
const linkError = ref('')
const linkInput = ref<HTMLInputElement | null>(null)
const menuElement = ref<HTMLElement | null>(null)
let linkSelection: { from: number; to: number } | null = null
const pluginKey = 'eotionSelectionBubble'
let editorDom: HTMLElement | null = null

function selectionKey(state: Editor['state']): string {
  const { from, to } = state.selection
  return `${from}:${to}`
}

function hasSelectedText(state: Editor['state']): boolean {
  const { from, to } = state.selection
  let hasText = false
  state.doc.nodesBetween(from, to, (node, position, parent) => {
    const selected = node.isText ? node.text?.slice(Math.max(0, from - position), Math.min(node.nodeSize, to - position)).trim() : ''
    if (selected && activeMarks.some(name => state.schema.marks[name] && parent?.type.allowsMarkType(state.schema.marks[name]))) {
      hasText = true
      return false
    }
    return !hasText
  })
  return hasText
}

function shouldShow({ editor, state }: { editor: Editor; state: Editor['state'] }): boolean {
  if (!props.enabled) return false
  const selection = state.selection
  const key = selectionKey(state)
  if (hiddenSelection.value && hiddenSelection.value !== key) {
    hiddenSelection.value = null
  }

  if (props.composing || (!editor.isFocused && !editingLink.value) || !(selection instanceof TextSelection) || selection.empty) return false
  if (hiddenSelection.value === key || !hasSelectedText(state)) return false
  if (typeof document !== 'undefined' && document.querySelector('.p2-slash-menu')) return false
  return true
}

const floatingOptions = {
  placement: 'top' as const,
  offset: 8,
  flip: { padding: 8 },
  shift: { padding: 8 },
}

function hideForCurrentSelection(): void {
  editingLink.value = false
  linkSelection = null
  hiddenSelection.value = selectionKey(props.editor.state)
  props.editor.commands.setMeta(pluginKey, 'hide')
}

function openLinkEditor(): void {
  const { from, to } = props.editor.state.selection
  linkSelection = { from, to }
  linkHref.value = String(props.editor.getAttributes('link').href ?? '')
  linkError.value = ''
  editingLink.value = true
  nextTick(() => linkInput.value?.focus())
}

function restoreSelection(): void {
  if (!linkSelection) return
  props.editor.chain().setTextSelection(linkSelection).focus().run()
}

function cancelLinkEdit(): void {
  editingLink.value = false
  linkError.value = ''
  restoreSelection()
  linkSelection = null
}

function applyLink(): void {
  const href = linkHref.value.trim()
  if (!isSafeLinkHref(href)) {
    linkError.value = '请输入有效的 http 或 https 链接'
    linkInput.value?.focus()
    return
  }
  restoreSelection()
  props.editor.chain().setLink({ href }).run()
  editingLink.value = false
  linkSelection = null
}

function removeLink(): void {
  restoreSelection()
  props.editor.chain().unsetLink().run()
  editingLink.value = false
  linkSelection = null
}

function onOutsideFocus(event: FocusEvent): void {
  if (!editingLink.value || !(event.target instanceof Node)) return
  if (menuElement.value?.contains(event.target) || editorDom?.contains(event.target)) return
  hideForCurrentSelection()
}

function onOutsidePointer(event: PointerEvent): void {
  if (!editingLink.value || !(event.target instanceof Node) || menuElement.value?.contains(event.target)) return
  hideForCurrentSelection()
}

function onEditorKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  const { selection } = props.editor.state
  if (!selection.empty && hasSelectedText(props.editor.state)) {
    hideForCurrentSelection()
    event.preventDefault()
    event.stopPropagation()
  }
}

function onCompositionStart(): void {
  props.editor.commands.setMeta(pluginKey, 'hide')
}

onMounted(() => {
  editorDom = props.editor.view.dom
  editorDom.addEventListener('keydown', onEditorKeydown)
  editorDom.addEventListener('compositionstart', onCompositionStart, true)
  document.addEventListener('focusin', onOutsideFocus, true)
  document.addEventListener('pointerdown', onOutsidePointer, true)
  props.editor.on('transaction', updatePressedMarks)
})

onBeforeUnmount(() => {
  editorDom?.removeEventListener('keydown', onEditorKeydown)
  editorDom?.removeEventListener('compositionstart', onCompositionStart, true)
  document.removeEventListener('focusin', onOutsideFocus, true)
  document.removeEventListener('pointerdown', onOutsidePointer, true)
  editorDom = null
  props.editor.off('transaction', updatePressedMarks)
})

function updatePressedMarks(): void {
  editorRevision.value += 1
}

watch(() => props.composing, composing => {
  if (composing) hideForCurrentSelection()
})

watch(() => props.enabled, (enabled, wasEnabled) => {
  if (!enabled && wasEnabled) hideForCurrentSelection()
})

const pressed = computed(() => {
  // Mark state is owned by the editor, so invalidate this snapshot on transactions.
  editorRevision.value
  return {
    bold: props.editor.isActive('bold'),
    italic: props.editor.isActive('italic'),
    strike: props.editor.isActive('strike'),
    code: props.editor.isActive('code'),
    link: props.editor.isActive('link'),
  }
})
</script>

<template>
  <BubbleMenu
    :editor="editor"
    :plugin-key="pluginKey"
    :should-show="shouldShow"
    :options="floatingOptions"
    class="eotion-bubble-menu-host"
    @keydown.esc="onEditorKeydown"
  >
    <div ref="menuElement" class="eotion-bubble-menu" role="toolbar" aria-label="选区格式">
      <template v-if="!editingLink">
        <button type="button" aria-label="粗体" :aria-pressed="pressed.bold" @mousedown.prevent @click="editor.chain().focus().toggleBold().run()"><EotionIcon name="bold" :size="16" /></button>
        <button type="button" aria-label="斜体" :aria-pressed="pressed.italic" @mousedown.prevent @click="editor.chain().focus().toggleItalic().run()"><EotionIcon name="italic" :size="16" /></button>
        <button type="button" aria-label="删除线" :aria-pressed="pressed.strike" @mousedown.prevent @click="editor.chain().focus().toggleStrike().run()"><EotionIcon name="strike" :size="16" /></button>
        <button type="button" aria-label="行内代码" :aria-pressed="pressed.code" @mousedown.prevent @click="editor.chain().focus().toggleCode().run()"><EotionIcon name="code" :size="16" /></button>
        <button type="button" aria-label="链接" :aria-pressed="pressed.link" @mousedown.prevent @click="openLinkEditor"><EotionIcon name="link" :size="16" /></button>
      </template>
      <form v-else class="eotion-bubble-link-form" @submit.prevent="applyLink">
        <input ref="linkInput" v-model="linkHref" type="text" inputmode="url" aria-label="链接地址" placeholder="https://example.com" autocomplete="url" spellcheck="false" @input="linkError = ''" @keydown.esc.stop.prevent="cancelLinkEdit" />
        <button type="submit" aria-label="应用链接" title="应用链接" @mousedown.prevent><EotionIcon name="check" :size="16" /></button>
        <button v-if="pressed.link" type="button" aria-label="移除链接" title="移除链接" @mousedown.prevent @click="removeLink"><EotionIcon name="trash" :size="16" /></button>
        <button type="button" aria-label="取消链接编辑" title="取消" @mousedown.prevent @click="cancelLinkEdit"><EotionIcon name="x" :size="16" /></button>
        <span v-if="linkError" class="eotion-bubble-link-error" role="alert">{{ linkError }}</span>
      </form>
    </div>
  </BubbleMenu>
</template>

<style scoped>
.eotion-bubble-menu-host { z-index: 25; }
.eotion-bubble-menu { display: flex; align-items: center; gap: 2px; padding: 4px; border: 1px solid var(--e-color-border); border-radius: var(--e-radius-control); background: var(--e-color-surface); box-shadow: var(--shadow-menu); color: var(--e-color-text-primary); }
.eotion-bubble-menu button { display: inline-flex; width: 32px; height: 32px; align-items: center; justify-content: center; border: 0; border-radius: var(--e-radius-control); background: transparent; color: var(--e-color-text-secondary); cursor: pointer; }
.eotion-bubble-menu button:hover, .eotion-bubble-menu button[aria-pressed="true"] { background: var(--e-color-selected); color: var(--e-color-text-primary); }
.eotion-bubble-menu button:focus-visible { outline: var(--e-focus-ring-width) solid var(--e-color-focus); outline-offset: 1px; }
.eotion-bubble-link-form { position: relative; display: flex; min-width: 0; align-items: center; gap: 2px; }
.eotion-bubble-link-form input { box-sizing: border-box; width: min(220px, calc(100vw - 160px)); min-width: 0; height: 32px; border: 0; border-radius: var(--e-radius-control); padding: 0 8px; background: var(--e-color-surface-subtle); color: var(--e-color-text-primary); font: 400 14px / 1.4 var(--e-type-family); outline: none; }
.eotion-bubble-link-form input:focus-visible { outline: var(--e-focus-ring-width) solid var(--e-color-focus); outline-offset: -2px; }
.eotion-bubble-link-form button { flex: 0 0 32px; }
.eotion-bubble-link-error { position: absolute; top: calc(100% + 8px); left: 0; max-width: min(280px, calc(100vw - 24px)); padding: 5px 8px; border: 1px solid var(--e-color-border); border-radius: var(--e-radius-control); background: var(--e-color-surface); color: var(--e-color-text-primary); box-shadow: var(--shadow-menu); font: 400 12px / 1.4 var(--e-type-family); white-space: nowrap; }
</style>
