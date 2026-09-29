<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import { useProductWorkspacesStore } from '../stores/productWorkspaces'

const route = useRoute()
const workspaces = useProductWorkspacesStore()
const workspace = computed(() => workspaces.items.find((item) => item.id === route.params.workspaceId) ?? null)
</script>

<template>
  <section class="document product-state" aria-labelledby="workspace-home-title">
    <div class="product-state-icon" aria-hidden="true">{{ workspace?.name.slice(0, 1) ?? 'E' }}</div>
    <p class="product-section-label">欢迎来到你的工作区</p>
    <h1 id="workspace-home-title">{{ workspace?.name }}</h1>
    <p class="lead">你的页面会在这里逐步展开。页面管理与编辑功能即将开放。</p>
    <div class="product-coming-soon"><span class="product-coming-soon-mark" aria-hidden="true">▤</span><div><strong>页面</strong><p>创建和整理工作区中的页面</p></div><span>即将开放</span></div>
  </section>
</template>
