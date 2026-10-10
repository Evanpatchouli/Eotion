<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { useRuntimeContext } from '../../composables/useRuntimeContext'
import { flushActivePageEditor } from '../../editor/activePageEditor'
import { prepareProductDatabaseRecordPage } from '../../services/productDatabases'
import { useAuthStore } from '../../stores/auth'
import { useDatabaseContentStore } from '../../stores/databaseContent'
import { usePreferencesStore } from '../../stores/preferences'
import EotionProductOverlay from '../ui/EotionProductOverlay.vue'
import { resolveOpeningMode } from '../ui/productOverlay'

const EmbeddedPageView = defineAsyncComponent(() => import('../../views/PageView.vue'))
const content = useDatabaseContentStore()
const preferences = usePreferencesStore()
const auth = useAuthStore()
const router = useRouter()
const { layoutMode } = useRuntimeContext()
const closeError = ref('')
let routedRequestId = 0

const openingMode = computed(() => {
  const target = content.record
  if (!target) return 'drawer'
  return resolveOpeningMode(
    preferences.databaseOpening(auth.user?.id ?? '', target.workspaceId, target.databaseId, 'record'),
    layoutMode.value,
  )
})
const overlayOpen = computed({
  get: () => content.record !== null && openingMode.value !== 'page',
  set: (open: boolean) => { if (!open) void closeRecord() },
})

async function closeRecord(): Promise<void> {
  const target = content.record
  if (!target) return
  closeError.value = ''
  if (!(await flushActivePageEditor(target.workspaceId, target.pageId))) {
    closeError.value = '正文尚未保存，请在记录中重试后再关闭。'
    return
  }
  content.closeRecord(target.requestId)
}

watch([() => content.record, openingMode], ([target, mode]) => {
  if (!target || mode !== 'page' || routedRequestId === target.requestId) return
  routedRequestId = target.requestId
  void (async () => {
    closeError.value = ''
    try {
      await prepareProductDatabaseRecordPage(target.workspaceId, target.pageId)
      if (content.record?.requestId !== target.requestId) return
      await router.push({ name: 'product-page', params: { workspaceId: target.workspaceId, pageId: target.pageId }, query: { edit: 'record' } })
      content.closeRecord(target.requestId)
    } catch (cause) {
      closeError.value = cause instanceof Error ? cause.message : '暂时无法打开记录页面，请重试。'
    }
  })()
}, { immediate: true })
</script>

<template>
  <EotionProductOverlay v-model:open="overlayOpen" :mode="openingMode" label="记录" close-label="关闭记录">
    <p v-if="closeError" class="database-record-host__error" role="alert">{{ closeError }}</p>
    <EmbeddedPageView
      v-if="content.record"
      embedded
      :embedded-workspace-id="content.record.workspaceId"
      :embedded-page-id="content.record.pageId"
    />
  </EotionProductOverlay>
</template>

<style scoped>
.database-record-host__error { margin: 0 0 var(--e-space-4); color: var(--e-color-danger); }
:deep(.product-editor-page--embedded) { width: min(100%, 740px); margin-inline: auto; padding: 0; }
</style>
