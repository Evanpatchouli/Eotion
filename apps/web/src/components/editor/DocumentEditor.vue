<script setup lang="ts">
import { EditorContent, useEditor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { watch } from 'vue'

import { cloneEditorDocument, type EditorDocument } from '../../editor/editorDocument'

const props = withDefaults(defineProps<{
  content: EditorDocument
  editable?: boolean
  ariaLabel?: string
}>(), {
  editable: true,
  ariaLabel: '文档编辑器',
})

const emit = defineEmits<{
  update: [document: EditorDocument]
}>()

const editor = useEditor({
  extensions: [StarterKit.configure({ link: false, underline: false })],
  content: cloneEditorDocument(props.content),
  editable: props.editable,
  editorProps: {
    attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': props.ariaLabel },
  },
  onUpdate: ({ editor }) => emit('update', cloneEditorDocument(editor.getJSON() as EditorDocument)),
})

watch(() => props.editable, editable => {
  editor.value?.setEditable(editable, false)
})

function focus(): void {
  editor.value?.commands.focus()
}

defineExpose({ focus })
</script>

<template>
  <EditorContent :editor="editor" class="document-editor" />
</template>

<style scoped>
.document-editor { min-width: 0; }
.document-editor :deep(.tiptap) { min-width: 0; min-height: 320px; outline: none; overflow-wrap: anywhere; color: var(--e-color-text-primary); font: var(--e-type-body-weight) var(--e-type-body-size) / var(--e-type-body-line) var(--e-type-family); }
.document-editor :deep(.tiptap > :first-child) { margin-top: 0; }
.document-editor :deep(.tiptap h1) { font-size: var(--e-type-page-title-size); line-height: var(--e-type-page-title-line); font-weight: var(--e-type-page-title-weight); letter-spacing: var(--e-type-page-title-tracking); }
.document-editor :deep(.tiptap h2) { font-size: var(--e-type-heading-1-size); line-height: var(--e-type-heading-1-line); font-weight: var(--e-type-heading-1-weight); }
.document-editor :deep(.tiptap ul), .document-editor :deep(.tiptap ol) { padding-left: 1.5em; }
.document-editor :deep(.tiptap blockquote) { margin-inline: 0; padding-left: var(--e-space-4); border-left: 2px solid var(--e-color-border); color: var(--e-color-text-secondary); }
.document-editor :deep(.tiptap pre) { max-width: 100%; overflow-x: auto; padding: var(--e-space-3); background: var(--e-color-surface-subtle); font: 13px/1.6 ui-monospace, SFMono-Regular, Consolas, monospace; }
.document-editor :deep(.tiptap code) { overflow-wrap: anywhere; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
</style>
