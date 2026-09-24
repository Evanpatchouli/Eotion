<script setup lang="ts">
import { EditorContent, useEditor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'

const editor = useEditor({
  extensions: [StarterKit],
  content: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: '在这里输入文字，尝试段落、标题和项目列表。' }],
      },
    ],
  },
  editorProps: {
    attributes: {
      'aria-label': 'P2 Tiptap 编辑区域',
      spellcheck: 'false',
    },
  },
})

defineExpose({ editor })
</script>

<template>
  <section class="p2-editor" aria-label="Tiptap 编辑器">
    <div class="p2-editor-toolbar" role="toolbar" aria-label="块类型">
      <button
        type="button"
        :aria-pressed="editor?.isActive('paragraph') ?? false"
        :disabled="!editor"
        @click="editor?.chain().focus().setParagraph().run()"
      >段落</button>
      <button
        type="button"
        :aria-pressed="editor?.isActive('heading', { level: 2 }) ?? false"
        :disabled="!editor"
        @click="editor?.chain().focus().toggleHeading({ level: 2 }).run()"
      >二级标题</button>
      <button
        type="button"
        :aria-pressed="editor?.isActive('bulletList') ?? false"
        :disabled="!editor"
        @click="editor?.chain().focus().toggleBulletList().run()"
      >项目列表</button>
    </div>
    <EditorContent :editor="editor" class="p2-editor-content" />
  </section>
</template>

<style scoped>
.p2-editor { border: 1px solid #e5e5e1; border-radius: 10px; background: #fff; }
.p2-editor-toolbar { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px; border-bottom: 1px solid #e5e5e1; }
.p2-editor-toolbar button { min-height: 32px; padding: 5px 10px; border: 1px solid #deded9; border-radius: 6px; background: #fff; cursor: pointer; }
.p2-editor-toolbar button[aria-pressed="true"] { border-color: #7290d1; background: #eef3ff; }
.p2-editor-toolbar button:disabled { cursor: default; opacity: .5; }
.p2-editor-content { min-height: 260px; padding: 20px 22px; line-height: 1.75; }
.p2-editor-content :deep(.tiptap) { min-height: 220px; outline: none; overflow-wrap: anywhere; }
.p2-editor-content :deep(.tiptap > :first-child) { margin-top: 0; }
.p2-editor-content :deep(.tiptap ul) { padding-left: 1.5em; }
.p2-editor-content :deep(.tiptap h2) { line-height: 1.3; }
</style>
