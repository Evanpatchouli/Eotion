<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import EotionIcon from '../ui/EotionIcon.vue'

const props = defineProps<{ editor: Editor; composing: boolean; enabled: boolean }>()

const hiddenSelection = ref<string | null>(null)
const activeMarks = ['bold', 'italic', 'strike', 'code'] as const
const editorRevision = ref(0)
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

  if (props.composing || !editor.isFocused || !(selection instanceof TextSelection) || selection.empty) return false
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
  hiddenSelection.value = selectionKey(props.editor.state)
  props.editor.commands.setMeta(pluginKey, 'hide')
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
  props.editor.on('transaction', updatePressedMarks)
})

onBeforeUnmount(() => {
  editorDom?.removeEventListener('keydown', onEditorKeydown)
  editorDom?.removeEventListener('compositionstart', onCompositionStart, true)
  editorDom = null
  props.editor.off('transaction', updatePressedMarks)
})

function updatePressedMarks(): void {
  editorRevision.value += 1
}

watch(() => props.composing, composing => {
  if (composing) props.editor.commands.setMeta(pluginKey, 'hide')
})

watch(() => props.enabled, (enabled, wasEnabled) => {
  if (!enabled && wasEnabled) props.editor.commands.setMeta(pluginKey, 'hide')
})

const pressed = computed(() => {
  // Mark state is owned by the editor, so invalidate this snapshot on transactions.
  editorRevision.value
  return {
    bold: props.editor.isActive('bold'),
    italic: props.editor.isActive('italic'),
    strike: props.editor.isActive('strike'),
    code: props.editor.isActive('code'),
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
    <div class="eotion-bubble-menu" role="toolbar" aria-label="选区格式">
      <button type="button" aria-label="粗体" :aria-pressed="pressed.bold" @mousedown.prevent @click="editor.chain().focus().toggleBold().run()"><EotionIcon name="bold" :size="16" /></button>
      <button type="button" aria-label="斜体" :aria-pressed="pressed.italic" @mousedown.prevent @click="editor.chain().focus().toggleItalic().run()"><EotionIcon name="italic" :size="16" /></button>
      <button type="button" aria-label="删除线" :aria-pressed="pressed.strike" @mousedown.prevent @click="editor.chain().focus().toggleStrike().run()"><EotionIcon name="strike" :size="16" /></button>
      <button type="button" aria-label="行内代码" :aria-pressed="pressed.code" @mousedown.prevent @click="editor.chain().focus().toggleCode().run()"><EotionIcon name="code" :size="16" /></button>
    </div>
  </BubbleMenu>
</template>

<style scoped>
.eotion-bubble-menu-host { z-index: 25; }
.eotion-bubble-menu { display: flex; align-items: center; gap: 2px; padding: 4px; border: 1px solid var(--e-color-border); border-radius: var(--e-radius-control); background: var(--e-color-surface); box-shadow: var(--shadow-menu); color: var(--e-color-text-primary); }
.eotion-bubble-menu button { display: inline-flex; width: 32px; height: 32px; align-items: center; justify-content: center; border: 0; border-radius: var(--e-radius-control); background: transparent; color: var(--e-color-text-secondary); cursor: pointer; }
.eotion-bubble-menu button:hover, .eotion-bubble-menu button[aria-pressed="true"] { background: var(--e-color-selected); color: var(--e-color-text-primary); }
.eotion-bubble-menu button:focus-visible { outline: var(--e-focus-ring-width) solid var(--e-color-focus); outline-offset: 1px; }
</style>
