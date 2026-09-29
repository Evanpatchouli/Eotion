<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import { useProductPagesStore } from '../stores/productPages'
import { useProductWorkspacesStore } from '../stores/productWorkspaces'

const route = useRoute()
const pages = useProductPagesStore()
const workspaces = useProductWorkspacesStore()

const workspaceId = computed(() => typeof route.params.workspaceId === 'string' ? route.params.workspaceId : '')
const pageId = computed(() => typeof route.params.pageId === 'string' ? route.params.pageId : '')
const page = computed(() => pages.items.find((item) => item.id === pageId.value) ?? null)
const currentWorkspace = computed(() => workspaces.items.find((item) => item.id === workspaceId.value) ?? null)
// "Missing" may only be claimed once the loaded list provably belongs to this workspace.
const settled = computed(() => pages.loaded && pages.forWorkspaceId === workspaceId.value)
const loadError = computed(() => pages.forWorkspaceId === workspaceId.value ? pages.error : '')
</script>

<template>
  <section v-if="loadError" class="document product-state" aria-labelledby="page-load-error-title">
    <h1 id="page-load-error-title">暂时无法加载页面</h1>
    <p class="lead" role="alert">{{ loadError }}</p>
    <button class="product-button product-button--primary" type="button" :disabled="pages.loading" @click="pages.load(workspaceId, true)">{{ pages.loading ? '正在重试…' : '重试' }}</button>
  </section>
  <section v-else-if="!settled" class="product-loading" role="status">正在加载页面…</section>
  <section v-else-if="!page" class="document product-state" aria-labelledby="page-unavailable-title">
    <div class="product-state-icon" aria-hidden="true">⌕</div>
    <h1 id="page-unavailable-title">无法打开这个页面</h1>
    <p class="lead">它可能已被删除，或者不属于当前工作区。</p>
    <div class="product-state-actions">
      <RouterLink class="product-button product-button--primary" :to="{ name: 'product-workspace', params: { workspaceId } }">返回工作区</RouterLink>
    </div>
  </section>
  <div v-else class="document">
    <p class="product-section-label">{{ currentWorkspace?.name ?? '工作区' }}</p>
    <h1>{{ page.title }}</h1>
    <p class="lead">页面树与页面生命周期已可用；正文编辑器会在 P5.3 接入 Tiptap 3。</p>
    <dl class="product-page-meta">
      <div><dt>页面 ID</dt><dd>{{ page.id }}</dd></div>
      <div><dt>父页面</dt><dd>{{ page.parentPageId ?? '根级' }}</dd></div>
      <div><dt>排序键</dt><dd>{{ page.orderKey }}</dd></div>
    </dl>
    <div class="product-page-content-placeholder">内容区域占位：P5.3 Real Page Editor 将在这里接入编辑器、自动保存与本地优先读写。</div>
  </div>
</template>
