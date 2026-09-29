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
    <p class="lead">使用左侧页面树创建、整理和打开页面。正文编辑会在 P5.3 接入。</p>
    <div class="product-coming-soon"><span class="product-coming-soon-mark" aria-hidden="true">▤</span><div><strong>页面树</strong><p>创建、重命名、移动和删除工作区页面</p></div><span>已开放</span></div>
  </section>
</template>
