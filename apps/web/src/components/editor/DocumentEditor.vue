<script setup lang="ts">
import { EditorContent } from '@tiptap/vue-3'

import '../../styles/editor-content.css'
import type { EditorDocument } from '../../editor/editorDocument'
import { useDocumentEditor } from '../../editor/useDocumentEditor'

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

const { editor, focus } = useDocumentEditor({
  content: props.content,
  editable: () => props.editable,
  ariaLabel: props.ariaLabel,
  onUpdate: document => emit('update', document),
})

defineExpose({ focus })
</script>

<template>
  <EditorContent :editor="editor" class="document-editor" />
</template>

<style scoped>
.document-editor :deep(.tiptap) { min-height: 320px; }
</style>
