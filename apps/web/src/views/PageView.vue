<script setup lang="ts">
import type { JSONContent } from '@tiptap/core'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { RouterLink, onBeforeRouteLeave, onBeforeRouteUpdate, useRoute } from 'vue-router'

import EotionEditor from '../components/editor/EotionEditor.vue'
import { useRuntimeContext } from '../composables/useRuntimeContext'
import { registerActivePageEditor } from '../editor/activePageEditor'
import { PagePersistence, type SaveStatus } from '../editor/pagePersistence'
import { clearPageDraft, hasPendingPageDraft, pendingPageDraft } from '../editor/pendingPageDraft'
import { useAuthStore } from '../stores/auth'
import { useProductPagesStore } from '../stores/productPages'
import { useProductWorkspacesStore } from '../stores/productWorkspaces'
import { useProductSyncStore } from '../stores/productSync'

const route = useRoute()
const pages = useProductPagesStore()
const auth = useAuthStore()
const workspaces = useProductWorkspacesStore()
const sync = useProductSyncStore()
const { layoutMode, inputMode } = useRuntimeContext()

const workspaceId = computed(() => typeof route.params.workspaceId === 'string' ? route.params.workspaceId : '')
const pageId = computed(() => typeof route.params.pageId === 'string' ? route.params.pageId : '')
const page = computed(() => pages.items.find((item) => item.id === pageId.value) ?? null)
const currentWorkspace = computed(() => workspaces.items.find((item) => item.id === workspaceId.value) ?? null)
const settled = computed(() => pages.loaded && pages.forWorkspaceId === workspaceId.value)
const loadError = computed(() => pages.forWorkspaceId === workspaceId.value ? pages.error : '')

const document = ref<JSONContent | null>(null)
const blockLoading = ref(false)
const blockError = ref('')
const saveStatus = ref<SaveStatus>('loading')
const saveError = ref('')
const persistence = shallowRef<PagePersistence | null>(null)
let removeActive: (() => void) | null = null
let loadController: AbortController | null = null
let loadEpoch = 0
const editorRevision = ref(0)

function releaseCurrent(): void {
  loadController?.abort()
  loadController = null
  removeActive?.()
  removeActive = null
  persistence.value?.dispose()
  persistence.value = null
}

async function loadBlocks(): Promise<void> {
  const epoch = ++loadEpoch
  editorRevision.value += 1
  releaseCurrent()
  document.value = null
  blockError.value = ''
  if (!settled.value || !page.value) return

  const controller = new AbortController()
  loadController = controller
  const ownerId = auth.user?.id ?? ''
  const current = new PagePersistence(ownerId, workspaceId.value, pageId.value, (status, error) => {
    if (epoch !== loadEpoch) return
    saveStatus.value = status
    saveError.value = error
  })
  persistence.value = current
  removeActive = registerActivePageEditor({ workspaceId: workspaceId.value, pageId: pageId.value, flush: () => current.flush(), preserve: () => current.preserveDraft() })
  blockLoading.value = true
  try {
    const loaded = await current.load(controller.signal)
    if (epoch === loadEpoch) {
      const draft = pendingPageDraft(ownerId, workspaceId.value, pageId.value)
      document.value = draft ?? loaded
      if (draft) {
        current.update(draft)
        clearPageDraft(ownerId, workspaceId.value, pageId.value)
      }
    }
  } catch {
    if (epoch === loadEpoch && !controller.signal.aborted) blockError.value = current.error || '无法加载区块，请重试。'
  } finally {
    if (epoch === loadEpoch) blockLoading.value = false
  }
}

function onEditorUpdate(updated: JSONContent): void {
  persistence.value?.update(updated)
}

function beforeUnload(event: BeforeUnloadEvent): void {
  if (!persistence.value?.hasPendingWork) return
  event.preventDefault()
  event.returnValue = ''
}

async function guardNavigation(): Promise<boolean> {
  if (!auth.user && hasPendingPageDraft()) return true
  if (!persistence.value?.hasPendingWork) return true
  return persistence.value.flush()
}

onBeforeRouteUpdate(guardNavigation)
onBeforeRouteLeave(guardNavigation)

watch([workspaceId, pageId, settled, () => !!page.value], () => { void loadBlocks() }, { immediate: true })
watch(() => sync.snapshotRevision, () => {
  const current = persistence.value
  const id = pageId.value
  const workspace = workspaceId.value
  if (!settled.value || !page.value || !current || current.hasPendingWork) return
  void (async () => {
    const blocks = await (await sync.store()).listBlocksByPage(id)
    if (persistence.value !== current || pageId.value !== id || workspaceId.value !== workspace || current.hasPendingWork) return
    if (!current.matchesLocalBlocks(blocks)) await loadBlocks()
  })()
})
window.addEventListener('beforeunload', beforeUnload)
onBeforeUnmount(() => {
  loadEpoch += 1
  releaseCurrent()
  useProductSyncStore().requestSync(0)
  window.removeEventListener('beforeunload', beforeUnload)
})
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
  <div v-else class="document product-editor-page">
    <p class="product-section-label">{{ currentWorkspace?.name ?? '工作区' }}</p>
    <div class="product-editor-heading"><h1>{{ page.title }}</h1><span v-if="!blockError" class="product-save-status" role="status">{{ saveStatus === 'loading' ? '正在加载…' : saveStatus === 'saved' ? '已保存到本地' : saveStatus === 'saving' ? '正在保存…' : '本地保存失败' }}</span></div>
    <p v-if="blockError" class="product-message product-message--error" role="alert">{{ blockError }}</p>
    <button v-if="blockError" class="product-button" type="button" :disabled="blockLoading" @click="loadBlocks">{{ blockLoading ? '正在重试…' : '重试加载' }}</button>
    <p v-else-if="blockLoading || !document" class="product-loading" role="status">正在加载正文…</p>
    <template v-else>
      <div v-if="saveStatus === 'error'" class="product-editor-error" role="alert">
        <span>{{ saveError || '保存失败，请重试。' }}</span>
        <button class="product-text-button" type="button" @click="persistence?.retry()">重试保存</button>
      </div>
      <EotionEditor
        :key="`${workspaceId}:${pageId}:${editorRevision}`"
        :content="document"
        :touch-toolbar="layoutMode === 'mobile' || inputMode !== 'mouse'"
        aria-label="页面正文编辑区域"
        @update="onEditorUpdate"
        @composition="(active) => persistence?.setComposing(active)"
      />
    </template>
  </div>
</template>
