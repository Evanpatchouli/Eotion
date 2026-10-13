<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { DatabaseViewResponse } from '@eotion/contracts'

import EotionEditor from '../components/editor/EotionEditor.vue'
import EotionIcon from '../components/ui/EotionIcon.vue'
import { IconName } from '../components/ui/icons'
import type { EditorDocument } from '../editor/editorDocument'
import { api, errorMessage } from '../services/productApi'

const route = useRoute()
const router = useRouter()
const workspaceId = computed(() => typeof route.params.workspaceId === 'string' ? route.params.workspaceId : '')
const databaseId = computed(() => typeof route.params.databaseId === 'string' ? route.params.databaseId : '')
const requestedViewId = computed(() => typeof route.query.view === 'string' ? route.query.view : '')
const selectedView = ref<DatabaseViewResponse | null>(null)
const databaseEditor = ref<InstanceType<typeof EotionEditor> | null>(null)
const loading = ref(false)
const loadError = ref('')
let loadedScope = ''
let requestEpoch = 0

const document = computed<EditorDocument | null>(() => selectedView.value ? ({
  type: 'doc',
  content: [{ type: 'eotionDatabase', attrs: { databaseId: databaseId.value, viewId: selectedView.value.id } }],
}) : null)

async function load(): Promise<void> {
  const workspace = workspaceId.value
  const database = databaseId.value
  const requestedView = requestedViewId.value
  const scope = `${workspace}\u0000${database}`
  const epoch = ++requestEpoch
  if (loadedScope !== scope) selectedView.value = null
  loadError.value = ''
  if (!workspace || !database) return
  loading.value = true
  try {
    const views = await api.databases.listDatabaseViews(workspace, database)
    if (epoch !== requestEpoch || workspaceId.value !== workspace || databaseId.value !== database || requestedViewId.value !== requestedView) return
    const nextView = views.find(view => view.id === requestedView) ?? views[0] ?? null
    if (nextView && selectedView.value && loadedScope === scope && databaseEditor.value) {
      if (!databaseEditor.value.switchDatabaseView(database, nextView.id)) throw new Error('暂时无法切换数据库视图，请重试。')
    }
    selectedView.value = nextView
    loadedScope = scope
    if (!selectedView.value) loadError.value = '这个数据库还没有可打开的表格视图。'
  } catch (cause) {
    if (epoch === requestEpoch) loadError.value = errorMessage(cause, '暂时无法打开数据库，请重试。')
  } finally {
    if (epoch === requestEpoch) loading.value = false
  }
}

watch([workspaceId, databaseId, requestedViewId], () => { void load() }, { immediate: true })
onBeforeUnmount(() => { requestEpoch += 1 })

function selectView(viewId: string): void {
  if (!viewId || viewId === requestedViewId.value) return
  void router.replace({ name: 'product-database', params: { workspaceId: workspaceId.value, databaseId: databaseId.value }, query: { ...route.query, view: viewId } })
}
</script>

<template>
  <section class="document database-page-view" aria-label="数据库页面">
    <p v-if="loading && !document" class="product-loading" role="status">正在加载数据库…</p>
    <section v-else-if="loadError && !document" class="product-state" aria-labelledby="database-page-error-title">
      <div class="product-state-icon" aria-hidden="true"><EotionIcon :name="IconName.Database" :size="24" /></div>
      <h1 id="database-page-error-title">无法打开数据库</h1>
      <p class="lead" role="alert">{{ loadError }}</p>
      <button class="product-button" type="button" @click="load">重试</button>
    </section>
    <EotionEditor
      v-else-if="document"
      ref="databaseEditor"
      :key="`${workspaceId}:${databaseId}`"
      :content="document"
      :workspace-id="workspaceId"
      :on-database-view-change="selectView"
      :touch-toolbar="false"
      protect-document
      aria-label="数据库表格"
      @update="() => undefined"
    />
    <p v-if="loadError && document" class="lead" role="alert">{{ loadError }} <button class="product-button" type="button" @click="load">重试</button></p>
  </section>
</template>

<style scoped>
.database-page-view { width: min(100%, 1180px); padding-inline: clamp(16px, 4vw, 56px); }
.database-page-view :deep(.eotion-block-drag-anchor) { display: none !important; }
</style>
