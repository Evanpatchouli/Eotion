<script setup lang="ts">
import type { UploadPlaceholderTask } from '../../editor/uploadPlaceholders'
import EotionIcon from '../ui/EotionIcon.vue'

defineProps<{
  task: UploadPlaceholderTask
  cancel: () => void
  retry: () => void
  remove: () => void
}>()
</script>

<template>
  <span class="eotion-upload-placeholder" :data-upload-id="task.id" contenteditable="false">
    <span class="eotion-upload-item">
      <img v-if="task.objectUrl" :src="task.objectUrl" :alt="task.file.name" class="eotion-upload-preview">
      <EotionIcon v-else :name="task.file.type.startsWith('image/') ? 'image' : 'file-text'" :size="20" />
      <span class="eotion-upload-copy">
        <strong>{{ task.file.name }}</strong>
        <span role="status" :data-phase="task.phase">{{ task.phase === 'uploading' ? '正在上传…' : task.phase === 'saving' ? (task.error || '正在保存附件…') : task.phase === 'success' ? '已保存' : task.phase === 'cancelled' ? '已取消' : `上传失败 · ${task.error}` }}</span>
      </span>
      <span v-if="task.phase === 'uploading' || task.phase === 'saving'" class="eotion-upload-spinner" aria-hidden="true"></span>
      <button v-if="task.phase === 'uploading'" type="button" :aria-label="`取消上传 ${task.file.name}`" @mousedown.stop @click.stop="cancel"><EotionIcon name="x" :size="16" /></button>
      <template v-else-if="task.phase === 'failed'">
        <button type="button" :aria-label="`重试上传 ${task.file.name}`" @mousedown.stop @click.stop="retry"><EotionIcon name="refresh" :size="16" /> 重试</button>
        <button type="button" :aria-label="`移除 ${task.file.name}`" @mousedown.stop @click.stop="remove"><EotionIcon name="x" :size="16" /></button>
      </template>
      <button v-else-if="task.phase === 'cancelled'" type="button" :aria-label="`移除 ${task.file.name}`" @mousedown.stop @click.stop="remove"><EotionIcon name="x" :size="16" /></button>
    </span>
  </span>
</template>
