<script setup lang="ts">
import { defineComponent, h, ref } from 'vue'
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/vue-3'

import EotionIcon from '../ui/EotionIcon.vue'

const props = defineProps<NodeViewProps>()
const menuOpen = ref(false)
const confirmDelete = ref(false)
const imageFailed = ref(false)
const imageLoaded = ref(false)

const attrs = () => props.node.attrs as {
  name?: string; mimeType?: string; size?: number; url?: string; checked?: boolean
}
function sizeLabel(size = 0): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}
function toggleTodo(event: Event) {
  props.updateAttributes({ checked: (event.target as HTMLInputElement).checked })
}

function mimeLabel(mime = ''): string {
  const known: Record<string, string> = {
    'application/pdf': 'PDF 文档', 'text/plain': '纯文本', 'text/csv': 'CSV 表格',
    'application/zip': 'ZIP 压缩包', 'application/json': 'JSON 文件',
  }
  return known[mime.toLowerCase()] ?? (mime.startsWith('audio/') ? '音频文件' : mime.startsWith('video/') ? '视频文件' : '文件附件')
}

const AttachmentActions = defineComponent({
  props: { menuOpen: Boolean, confirmDelete: Boolean },
  emits: ['toggle', 'askDelete', 'cancelDelete', 'delete'],
  setup(actionProps, { emit }) {
    return () => h('span', { class: 'attachment-actions', onMousedown: (event: MouseEvent) => event.stopPropagation() }, [
      h('button', { type: 'button', class: 'attachment-more', 'aria-label': '附件操作', 'aria-haspopup': 'menu', 'aria-expanded': String(actionProps.menuOpen), onClick: () => emit('toggle') }, [h(EotionIcon, { name: 'more', size: 18 })]),
      ...(actionProps.menuOpen ? [h('span', { class: 'attachment-menu', role: 'menu' }, actionProps.confirmDelete
        ? [h('span', { class: 'attachment-confirm-label' }, '删除此附件？'), h('button', { type: 'button', role: 'menuitem', onClick: () => emit('delete') }, '确认删除'), h('button', { type: 'button', role: 'menuitem', onClick: () => emit('cancelDelete') }, '取消')]
        : [h('button', { type: 'button', role: 'menuitem', onClick: () => emit('askDelete') }, [h(EotionIcon, { name: 'trash', size: 16 }), '删除'])])] : []),
    ])
  },
})
</script>

<template>
  <NodeViewWrapper v-if="node.type.name === 'eotionImage'" as="figure" class="attachment attachment-image">
    <div class="attachment-image-frame" :class="{ 'attachment-image-frame--loading': !imageLoaded && !imageFailed }">
      <span v-if="!imageLoaded && !imageFailed" class="attachment-image-skeleton" role="status">正在加载图片…</span>
      <a v-if="!imageFailed" :href="attrs().url" target="_blank" rel="noopener noreferrer" :aria-label="`在新窗口打开图片：${attrs().name || '图片附件'}`">
        <img :src="attrs().url" :alt="attrs().name || '图片附件'" loading="lazy" @load="imageLoaded = true" @error="imageFailed = true">
      </a>
      <div v-if="imageFailed" class="attachment-image-fallback" role="img" :aria-label="`无法显示图片：${attrs().name || '图片附件'}`">
        <EotionIcon name="image" :size="20" />
        <span>{{ attrs().name || '图片无法显示' }}</span>
      </div>
    </div>
    <figcaption class="attachment-caption">
      <span class="attachment-caption-name">{{ attrs().name }}</span>
      <AttachmentActions
        :menu-open="menuOpen"
        :confirm-delete="confirmDelete"
        @toggle="menuOpen = !menuOpen; confirmDelete = false"
        @ask-delete="confirmDelete = true"
        @cancel-delete="confirmDelete = false"
        @delete="deleteNode()"
      />
    </figcaption>
  </NodeViewWrapper>

  <NodeViewWrapper v-else-if="node.type.name === 'eotionTodo'" as="label" class="attachment-todo">
    <input type="checkbox" :checked="Boolean(attrs().checked)" aria-label="完成事项" @change="toggleTodo">
    <NodeViewContent as="span" class="attachment-todo-content" />
  </NodeViewWrapper>

  <NodeViewWrapper v-else as="div" class="attachment attachment-file">
    <span class="attachment-file-icon" aria-hidden="true"><EotionIcon name="file-text" :size="20" /></span>
    <a class="attachment-file-link" :href="attrs().url" target="_blank" rel="noopener noreferrer">
      <span class="attachment-file-name">{{ attrs().name }}</span>
      <span class="attachment-file-meta">{{ mimeLabel(attrs().mimeType) }} · {{ sizeLabel(attrs().size) }}</span>
    </a>
    <AttachmentActions
      :menu-open="menuOpen"
      :confirm-delete="confirmDelete"
      @toggle="menuOpen = !menuOpen; confirmDelete = false"
      @ask-delete="confirmDelete = true"
      @cancel-delete="confirmDelete = false"
      @delete="deleteNode()"
    />
  </NodeViewWrapper>
</template>

<style scoped>
.attachment { position: relative; box-sizing: border-box; max-width: 100%; margin: 14px 0; border: 1px solid var(--border-editor); border-radius: 9px; background: var(--surface-raised); color: var(--editor-text); }
.attachment-image { width: min(100%, 720px); max-width: 100%; overflow: visible; }
.attachment-image-frame { position: relative; display: grid; min-width: 160px; min-height: 96px; max-width: min(100%, 720px); max-height: 520px; place-items: center; overflow: hidden; border-radius: 8px 8px 0 0; background: var(--surface-subtle); }
.attachment-image-frame--loading { background: linear-gradient(100deg, var(--surface-editor-hover) 30%, var(--surface-editor) 50%, var(--surface-editor-hover) 70%); background-size: 220% 100%; animation: attachment-shimmer 1.5s ease-in-out infinite; }
.attachment-image-skeleton { color: var(--editor-muted); font-size: 13px; }
.attachment-image-frame a { display: block; max-width: 100%; max-height: 520px; }
.attachment-image-frame img { display: block; max-width: 100%; max-height: 520px; object-fit: contain; }
.attachment-image-fallback { display: flex; min-height: 90px; align-items: center; gap: 10px; padding: 16px; color: var(--editor-muted); }
.attachment-caption { display: flex; min-height: 34px; align-items: center; justify-content: space-between; gap: 12px; padding: 2px 8px 2px 12px; border-top: 1px solid var(--border); }
.attachment-caption-name, .attachment-file-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.attachment-caption-name { flex: 1; color: var(--text-muted); font-size: 12px; }
.attachment-file { display: flex; min-height: 62px; align-items: center; gap: 12px; padding: 10px 12px; }
.attachment-file-icon { display: grid; width: 38px; height: 38px; flex: 0 0 auto; place-items: center; border-radius: 8px; background: var(--surface-editor-hover); color: var(--editor-muted); }
.attachment-file-link { display: grid; min-width: 0; flex: 1; gap: 4px; color: inherit; text-decoration: none; }
.attachment-file-link:hover .attachment-file-name { text-decoration: underline; }
.attachment-file-meta { overflow: hidden; color: var(--editor-muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
:deep(.attachment-actions) { position: relative; display: inline-flex; flex: 0 0 auto; }
:deep(.attachment-more) { display: grid; width: 40px; height: 40px; place-items: center; border: 0; border-radius: 6px; background: transparent; color: var(--editor-muted); cursor: pointer; }
:deep(.attachment-more):hover, :deep(.attachment-more):focus-visible { background: var(--surface-editor-hover); }
:deep(.attachment-menu) { position: absolute; z-index: 12; top: calc(100% + 3px); right: 0; display: grid; min-width: 148px; gap: 2px; padding: 5px; border: 1px solid var(--border-subtle); border-radius: 8px; background: var(--surface-raised); box-shadow: var(--shadow-menu); }
:deep(.attachment-menu button) { display: flex; min-height: 34px; align-items: center; gap: 7px; border: 0; border-radius: 5px; padding: 5px 8px; background: transparent; color: var(--editor-text); text-align: left; cursor: pointer; }
:deep(.attachment-menu button):hover, :deep(.attachment-menu button):focus-visible { background: var(--surface-editor-hover); }
:deep(.attachment-confirm-label) { padding: 6px 8px 3px; color: var(--editor-muted); font-size: 12px; }
.attachment-todo { display: flex; align-items: baseline; gap: 9px; }
.attachment-todo input { width: 16px; height: 16px; accent-color: var(--editor-accent); }
.attachment-todo-content { min-width: 0; }
@media (max-width: 767px), (pointer: coarse) { :deep(.attachment-more), :deep(.attachment-menu button) { min-width: 44px; min-height: 44px; } }
@keyframes attachment-shimmer { to { background-position: -220% 0; } }
@media (prefers-reduced-motion: reduce) { .attachment-image-frame--loading { animation: none; background: var(--surface-editor-hover); } }
</style>
