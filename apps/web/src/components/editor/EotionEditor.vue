<script setup lang="ts">
import type { JSONContent } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { exitSuggestion } from '@tiptap/suggestion'
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { BlockIdentity } from '../../editor/blockIdentity'
import { createSlashCommand } from '../../editor/slashCommand'

const props = defineProps<{ content: JSONContent; touchToolbar: boolean; ariaLabel?: string }>()
const emit = defineEmits<{
  update: [document: JSONContent]
  composition: [active: boolean, event: CompositionEvent]
  transaction: [changed: boolean]
  selection: [from: number, to: number, empty: boolean]
  beforeInput: [event: InputEvent]
  pointer: [event: PointerEvent]
  contextMenu: []
  keyboardInset: [pixels: number]
}>()

const composing = ref(false)
const keyboardInset = ref(0)

function updateKeyboardInset() {
  const viewport = window.visualViewport
  keyboardInset.value = viewport
    ? Math.max(0, Math.round(window.innerHeight - viewport.offsetTop - viewport.height))
    : 0
  emit('keyboardInset', keyboardInset.value)
}

onMounted(() => {
  updateKeyboardInset()
  window.visualViewport?.addEventListener('resize', updateKeyboardInset)
  window.visualViewport?.addEventListener('scroll', updateKeyboardInset)
})
onBeforeUnmount(() => {
  window.visualViewport?.removeEventListener('resize', updateKeyboardInset)
  window.visualViewport?.removeEventListener('scroll', updateKeyboardInset)
})

function updateSelection() {
  if (!editor.value) return
  const { from, to, empty } = editor.value.state.selection
  emit('selection', from, to, empty)
}

const editor = useEditor({
  extensions: [StarterKit, BlockIdentity, createSlashCommand(() => composing.value)],
  content: props.content,
  editorProps: {
    attributes: {
      'aria-label': props.ariaLabel ?? 'Tiptap 编辑区域',
      spellcheck: 'false',
    },
  },
  onCreate: updateSelection,
  onSelectionUpdate: updateSelection,
  onUpdate: ({ editor }) => emit('update', editor.getJSON()),
  onTransaction: ({ transaction }) => emit('transaction', transaction.docChanged),
})

function onCompositionStart(event: CompositionEvent) {
  composing.value = true
  if (editor.value) exitSuggestion(editor.value.view)
  emit('composition', true, event)
}

function onCompositionEnd(event: CompositionEvent) {
  composing.value = false
  emit('composition', false, event)
  if (editor.value) emit('update', editor.value.getJSON())
}

defineExpose({ editor })
</script>

<template>
  <section class="eotion-editor" aria-label="Tiptap 编辑器">
    <div class="eotion-editor-toolbar" role="toolbar" aria-label="块类型">
      <button type="button" :aria-pressed="editor?.isActive('paragraph') ?? false" :disabled="!editor" @click="editor?.chain().focus().setParagraph().run()">段落</button>
      <button type="button" :aria-pressed="editor?.isActive('heading', { level: 2 }) ?? false" :disabled="!editor" @click="editor?.chain().focus().toggleHeading({ level: 2 }).run()">二级标题</button>
      <button type="button" :aria-pressed="editor?.isActive('bulletList') ?? false" :disabled="!editor" @click="editor?.chain().focus().toggleBulletList().run()">项目列表</button>
    </div>
    <EditorContent
      :editor="editor"
      class="eotion-editor-content"
      @compositionstart="onCompositionStart"
      @compositionupdate="emit('composition', true, $event)"
      @compositionend="onCompositionEnd"
      @beforeinput="emit('beforeInput', $event)"
      @pointerdown="emit('pointer', $event)"
      @pointerup="emit('pointer', $event)"
      @pointercancel="emit('pointer', $event)"
      @contextmenu="emit('contextMenu')"
    />
    <div v-if="touchToolbar" class="eotion-touch-toolbar" role="toolbar" aria-label="触摸编辑工具栏" :style="{ bottom: `${keyboardInset}px` }">
      <button type="button" :disabled="!editor" @click="editor?.chain().focus().toggleBold().run()">粗体</button>
      <button type="button" :disabled="!editor" @click="editor?.chain().focus().toggleItalic().run()">斜体</button>
      <button type="button" :disabled="!editor" @click="editor?.chain().focus().setParagraph().run()">文本</button>
      <button type="button" :disabled="!editor" @click="editor?.chain().focus().toggleHeading({ level: 2 }).run()">标题</button>
      <button type="button" :disabled="!editor" @click="editor?.chain().focus().toggleBulletList().run()">列表</button>
    </div>
  </section>
</template>

<style scoped>
.eotion-editor { min-width: 0; border: 1px solid #e5e5e1; border-radius: 10px; background: #fff; }
.eotion-editor-toolbar { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px; border-bottom: 1px solid #e5e5e1; }
.eotion-editor-toolbar button { min-height: 32px; padding: 5px 10px; border: 1px solid #deded9; border-radius: 6px; background: #fff; cursor: pointer; }
.eotion-editor-toolbar button[aria-pressed="true"] { border-color: #7290d1; background: #eef3ff; }
.eotion-editor-toolbar button:disabled { cursor: default; opacity: .5; }
.eotion-editor-content { min-width: 0; min-height: 260px; padding: 20px 22px; line-height: 1.75; }
.eotion-editor-content :deep(.tiptap) { min-width: 0; min-height: 220px; outline: none; overflow-wrap: anywhere; }
.eotion-editor-content :deep(.tiptap > :first-child) { margin-top: 0; }
.eotion-editor-content :deep(.tiptap ul), .eotion-editor-content :deep(.tiptap ol) { padding-left: 1.5em; }
.eotion-editor-content :deep(.tiptap h2) { line-height: 1.3; }
.eotion-editor-content :deep(.tiptap pre) { max-width: 100%; overflow-x: auto; }
.eotion-touch-toolbar { position: fixed; z-index: 15; right: 0; left: 0; display: flex; gap: 6px; overflow-x: auto; padding: 9px max(12px, var(--safe-right)) calc(9px + var(--safe-bottom)) max(12px, var(--safe-left)); border-top: 1px solid #d9ded6; background: #fff; box-shadow: 0 -5px 20px #0001; }
.eotion-touch-toolbar button { flex: 1 0 auto; min-width: 54px; min-height: 42px; padding: 7px 10px; border: 1px solid #dce2d7; border-radius: 7px; background: #f7f9f5; }
.eotion-touch-toolbar button:disabled { opacity: .5; }
</style>

<style>
.p2-slash-menu { z-index: 20; min-width: 190px; padding: 5px; border: 1px solid #deded9; border-radius: 8px; background: white; box-shadow: 0 8px 24px #0002; color: #2b2e29; font-size: 13px; }
.p2-slash-item { display: block; width: 100%; padding: 8px 10px; border: 0; border-radius: 5px; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.p2-slash-item[aria-selected="true"], .p2-slash-item:hover { background: #eef3ff; }
</style>
