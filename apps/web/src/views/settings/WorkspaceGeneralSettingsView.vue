<script setup lang="ts">
import { computed } from 'vue'
import type { WorkspaceResponse } from '@eotion/contracts'
import { useAuthStore } from '../../stores/auth'
import { usePreferencesStore } from '../../stores/preferences'

const props = defineProps<{ workspace?: WorkspaceResponse | null, workspaceLoading?: boolean }>()
const auth = useAuthStore()
const preferences = usePreferencesStore()
const visible = computed(() => props.workspace && auth.user ? preferences.toolbarVisible(auth.user.id, props.workspace.id) : false)

function toggle() {
  if (!props.workspace || !auth.user) return
  preferences.setToolbarVisible(auth.user.id, props.workspace.id, !visible.value)
}
</script>

<template>
  <div class="settings-page">
    <div class="settings-page-heading"><h1>通用</h1><p>调整当前工作区在这台设备上的编辑体验。</p></div>
    <section class="settings-section" aria-labelledby="settings-workspace-heading">
      <div class="settings-section-heading"><h2 id="settings-workspace-heading">工作空间</h2><p v-if="workspace">当前配置：<strong>{{ workspace.name }}</strong></p><p v-else>{{ workspaceLoading ? '正在确认工作区…' : '无法确定当前工作区。请先返回工作区并从那里打开设置。' }}</p></div>
      <div v-if="workspace" class="settings-setting-row">
        <div class="settings-setting-copy"><strong id="settings-toolbar-label">显示固定编辑工具栏</strong><p id="settings-toolbar-description">在文档顶部显示常用格式和插入操作。关闭后仍可通过 / 命令、快捷键和上下文操作使用编辑功能。</p></div>
        <button class="settings-switch" type="button" role="switch" :aria-checked="visible" aria-labelledby="settings-toolbar-label" aria-describedby="settings-toolbar-description" @click="toggle"><span /></button>
      </div>
    </section>
  </div>
</template>
