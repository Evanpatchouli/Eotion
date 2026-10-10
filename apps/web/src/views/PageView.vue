<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { RouterLink, onBeforeRouteLeave, onBeforeRouteUpdate, useRoute } from 'vue-router'
import { createLocalId } from '@eotion/storage'
import { assignBlockTreeOrder } from '@eotion/domain/order'
import type { DatabaseReferenceAttrs } from '@eotion/domain/database'
import type { DatabaseViewResponse } from '@eotion/contracts'

import EotionEditor from '../components/editor/EotionEditor.vue'
import EotionButton from '../components/ui/EotionButton.vue'
import EotionIcon from '../components/ui/EotionIcon.vue'
import EotionCommandOverlay from '../components/ui/EotionCommandOverlay.vue'
import { IconName } from '../components/ui/icons'
import { useRuntimeContext } from '../composables/useRuntimeContext'
import { registerActivePageEditor } from '../editor/activePageEditor'
import { flushAttachmentCleanups, pendingAttachmentCleanups } from '../editor/attachmentCleanup'
import type { EditorDocument } from '../editor/editorDocument'
import { PagePersistence, type SaveStatus } from '../editor/pagePersistence'
import { documentToBlocks } from '../editor/blockCodec'
import { clearPageDraft, hasPendingPageDraft, pendingPageDraft } from '../editor/pendingPageDraft'
import { useAuthStore } from '../stores/auth'
import { useProductPagesStore } from '../stores/productPages'
import { useProductWorkspacesStore } from '../stores/productWorkspaces'
import { useProductSyncStore } from '../stores/productSync'
import { usePreferencesStore } from '../stores/preferences'
import { ApiError, api, errorMessage } from '../services/productApi'
import { isProductDatabaseInsertionUncertain, markProductDatabaseInsertionUncertain } from '../services/productDatabases'
import { notifyDatabaseUpdated } from '../editor/databaseEvents'

type DatabaseInsertionRequest = { document: EditorDocument; blockId: string }
type DatabaseChoice = { kind: 'create'; name: string } | { kind: 'link'; databaseId: string; viewId: string } | null

const surfaceProps = withDefaults(defineProps<{
  embeddedWorkspaceId?: string
  embeddedPageId?: string
  embedded?: boolean
}>(), {
  embeddedWorkspaceId: '',
  embeddedPageId: '',
  embedded: false,
})

const route = useRoute()
const pages = useProductPagesStore()
const auth = useAuthStore()
const workspaces = useProductWorkspacesStore()
const sync = useProductSyncStore()
const preferences = usePreferencesStore()
const { layoutMode, inputMode } = useRuntimeContext()

const workspaceId = computed(() => surfaceProps.embeddedWorkspaceId || (typeof route.params.workspaceId === 'string' ? route.params.workspaceId : ''))
const pageId = computed(() => surfaceProps.embeddedPageId || (typeof route.params.pageId === 'string' ? route.params.pageId : ''))
const page = computed(() => pages.items.find((item) => item.id === pageId.value) ?? null)
const currentWorkspace = computed(() => workspaces.items.find((item) => item.id === workspaceId.value) ?? null)
const settled = computed(() => pages.loaded && pages.forWorkspaceId === workspaceId.value)
const loadError = computed(() => pages.forWorkspaceId === workspaceId.value ? pages.error : '')

const document = ref<EditorDocument | null>(null)
const blockLoading = ref(false)
const blockError = ref('')
const saveStatus = ref<SaveStatus>('loading')
const saveError = ref('')
const persistence = shallowRef<PagePersistence | null>(null)
let removeActive: (() => void) | null = null
let loadController: AbortController | null = null
let loadEpoch = 0
const editorRevision = ref(0)
const databaseDialogOpen = ref(false)
const databaseBusy = ref(false)
const databaseMode = ref<'start' | 'create' | 'databases' | 'views'>('start')
const databaseName = ref('无标题数据库')
const databaseList = ref<Array<{ id: string; name: string }>>([])
const databaseCursor = ref<string | null>(null)
const databaseListLoading = ref(false)
const databaseSelectedId = ref('')
const databaseViews = ref<DatabaseViewResponse[]>([])
const databaseViewsLoading = ref(false)
const databaseError = ref('')
const databaseRecoveryError = ref('')
let resolveDatabaseChoice: ((choice: DatabaseChoice) => void) | null = null
let databaseRequest: DatabaseInsertionRequest | null = null
let databaseEpoch = 0

const databaseCreationUncertain = computed(() => isProductDatabaseInsertionUncertain(auth.user?.id ?? '', workspaceId.value, pageId.value))

function mayHaveCommitted(error: unknown): boolean {
  return !(error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500)
}

function confirmedDatabaseReference(
  block: Awaited<ReturnType<typeof api.blocks.get>>,
  workspace: string,
  page: string,
  blockId: string,
  parentBlockId: string | null,
  orderKey: string,
  databaseId: string,
  viewId: string,
): boolean {
  const node = (block.props as { node?: { type?: string; attrs?: Record<string, unknown> } }).node
  return block.id === blockId && block.workspaceId === workspace && block.pageId === page &&
    block.type === 'database' && block.parentBlockId === parentBlockId && block.orderKey === orderKey &&
    node?.type === 'eotionDatabase' && node.attrs?.databaseId === databaseId && node.attrs?.viewId === viewId
}

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

function onEditorUpdate(updated: EditorDocument): void {
  persistence.value?.update(updated)
}

async function commitAttachment(blockId: string): Promise<boolean> {
  const current = persistence.value
  const workspace = workspaceId.value
  const id = pageId.value
  if (!current) return false
  await current.flush()
  // A later unrelated mutation can fail after this attachment was committed.
  // Check its durable identity instead of compensating a valid local block.
  const block = await (await sync.store()).getBlock(blockId)
  return !!block && block.workspaceId === workspace && block.pageId === id &&
    (block.type === 'image' || block.type === 'file')
}

async function loadDatabaseChoices(append = false): Promise<void> {
  if (!navigator.onLine) { databaseError.value = '离线时无法读取数据库列表。'; return }
  const epoch = databaseEpoch
  databaseListLoading.value = true
  databaseError.value = ''
  try {
    const result = await api.databases.listDatabases(workspaceId.value, { limit: 50, ...(append && databaseCursor.value ? { cursor: databaseCursor.value } : {}) })
    if (epoch !== databaseEpoch || !databaseDialogOpen.value) return
    databaseList.value = append ? [...databaseList.value, ...result.items] : result.items
    databaseCursor.value = result.nextCursor
  } catch (cause) {
    if (epoch === databaseEpoch) databaseError.value = errorMessage(cause, '无法加载数据库列表，请重试。')
  } finally {
    if (epoch === databaseEpoch) databaseListLoading.value = false
  }
}

async function selectDatabase(databaseId: string): Promise<void> {
  const epoch = databaseEpoch
  const workspace = workspaceId.value
  databaseSelectedId.value = databaseId
  databaseMode.value = 'views'
  databaseViews.value = []
  databaseViewsLoading.value = true
  databaseError.value = ''
  try {
    const result = await api.databases.listDatabaseViews(workspace, databaseId)
    if (epoch !== databaseEpoch || workspaceId.value !== workspace || databaseSelectedId.value !== databaseId) return
    databaseViews.value = result.filter((view) => view.type === 'table')
  } catch (cause) {
    if (epoch === databaseEpoch && workspaceId.value === workspace) databaseError.value = errorMessage(cause, '无法加载数据库视图，请重试。')
  } finally {
    if (epoch === databaseEpoch && databaseSelectedId.value === databaseId) databaseViewsLoading.value = false
  }
}

function resolveDatabase(choice: DatabaseChoice): void {
  const resolve = resolveDatabaseChoice
  resolveDatabaseChoice = null
  databaseDialogOpen.value = false
  resolve?.(choice)
}

watch(databaseDialogOpen, open => {
  if (!open && resolveDatabaseChoice) resolveDatabase(null)
})

async function createDatabaseReference(request: DatabaseInsertionRequest): Promise<DatabaseReferenceAttrs | null> {
  if (databaseCreationUncertain.value) {
    throw new Error('上次数据库操作结果尚未确认，请联网并刷新页面后确认；正文可继续编辑。')
  }
  if (!persistence.value || databaseBusy.value || !page.value) return null
  const operationWorkspaceId = workspaceId.value
  const operationPageId = pageId.value
  const operationUserId = auth.user?.id ?? ''
  const operationCurrent = (epoch: number) => epoch === databaseEpoch && workspaceId.value === operationWorkspaceId &&
    pageId.value === operationPageId && auth.user?.id === operationUserId
  databaseBusy.value = true
  databaseRequest = request
  databaseRecoveryError.value = ''
  databaseMode.value = 'start'
  databaseName.value = '无标题数据库'
  databaseError.value = ''
  const epoch = ++databaseEpoch
  databaseDialogOpen.value = true
  const choice = await new Promise<DatabaseChoice>((resolve) => { resolveDatabaseChoice = resolve })
  if (!choice || !operationCurrent(epoch) || !databaseRequest) {
    databaseBusy.value = false
    databaseRequest = null
    return null
  }

  try {
    if (!navigator.onLine) throw new Error('离线时无法创建或链接数据库。')
    const current = persistence.value
    if (!current || !(await current.flush())) throw new Error('请先保存当前页面，再创建或链接数据库。')
    if (!operationCurrent(epoch)) throw new Error('登录状态或页面已切换，请重新插入数据库。')
    await sync.runSync()
    if (!operationCurrent(epoch)) throw new Error('登录状态或页面已切换，请重新插入数据库。')
    const local = await sync.store()
    const pending = (await local.getPendingOperations()).filter((operation) => operation.workspaceId === operationWorkspaceId)
    if (!operationCurrent(epoch)) throw new Error('登录状态或页面已切换，请重新插入数据库。')
    if (!navigator.onLine || sync.state !== 'synced' || pending.length > 0) {
      throw new Error('当前页面还有内容待同步。请先完成同步，再重试数据库操作。')
    }
    if (!operationCurrent(epoch)) throw new Error('登录状态或页面已切换，请重新插入数据库。')

    const baseline = await local.listBlocksByPage(operationPageId)
    const candidateBlocks = assignBlockTreeOrder(
      documentToBlocks(request.document, baseline, true),
      new Map(baseline.map((block) => [block.id, block.orderKey])),
    )
    const block = candidateBlocks.find((item) => item.id === request.blockId)
    if (!block || block.type !== 'database' || !/^\d{30}$/.test(block.orderKey)) throw new Error('无法确定数据库引用的位置，请重试。')

    if (choice.kind === 'create') {
      const databaseId = createLocalId()
      const viewId = createLocalId()
      let result: Awaited<ReturnType<typeof api.databases.createDatabaseInPage>>
      try {
        result = await api.databases.createDatabaseInPage(operationWorkspaceId, operationPageId, {
          id: databaseId,
          name: choice.name.trim() || '无标题数据库',
          titlePropertyId: createLocalId(),
          viewId,
          blockId: block.id,
          orderKey: block.orderKey,
          parentBlockId: block.parentBlockId,
        })
      } catch (cause) {
        if (!mayHaveCommitted(cause)) throw cause
        if (!operationCurrent(epoch)) {
          markProductDatabaseInsertionUncertain(operationUserId, operationWorkspaceId, operationPageId)
          throw new Error('登录状态或页面已切换，上次数据库操作结果尚未确认。请返回原页面并刷新确认。')
        }
        try {
          const existing = await api.blocks.get(operationWorkspaceId, operationPageId, block.id)
          if (confirmedDatabaseReference(existing, operationWorkspaceId, operationPageId, block.id, block.parentBlockId, block.orderKey, databaseId, viewId)) {
            if (!operationCurrent(epoch)) {
              markProductDatabaseInsertionUncertain(operationUserId, operationWorkspaceId, operationPageId)
              throw new Error('登录状态或页面已切换，请刷新页面确认数据库引用。')
            }
            notifyDatabaseUpdated({ workspaceId: operationWorkspaceId, databaseId })
            return { databaseId, viewId }
          }
        } catch {
          // A 404 or failed verification cannot prove the transaction did not commit.
        }
        markProductDatabaseInsertionUncertain(operationUserId, operationWorkspaceId, operationPageId)
        throw new Error('上次数据库操作结果尚未确认，请联网并刷新页面后确认；正文可继续编辑。')
      }
      if (!operationCurrent(epoch)) {
        markProductDatabaseInsertionUncertain(operationUserId, operationWorkspaceId, operationPageId)
        throw new Error('数据库已创建，但登录状态已切换。请返回原页面并刷新确认。')
      }
      if (result.block.id !== block.id || result.block.parentBlockId !== block.parentBlockId || result.block.orderKey !== block.orderKey) {
        throw new Error('数据库已创建，但服务端返回的引用位置不一致。请保留页面并重试保存。')
      }
      notifyDatabaseUpdated({ workspaceId: operationWorkspaceId, databaseId: result.database.id })
      return { databaseId: result.database.id, viewId: result.view.id }
    }

    let result: Awaited<ReturnType<typeof api.databases.linkDatabaseInPage>>
    try {
      result = await api.databases.linkDatabaseInPage(operationWorkspaceId, operationPageId, {
        databaseId: choice.databaseId,
        viewId: choice.viewId,
        blockId: block.id,
        orderKey: block.orderKey,
        parentBlockId: block.parentBlockId,
      })
    } catch (cause) {
      if (!mayHaveCommitted(cause)) throw cause
      if (!operationCurrent(epoch)) {
        markProductDatabaseInsertionUncertain(operationUserId, operationWorkspaceId, operationPageId)
        throw new Error('登录状态或页面已切换，上次数据库操作结果尚未确认。请返回原页面并刷新确认。')
      }
      try {
        const existing = await api.blocks.get(operationWorkspaceId, operationPageId, block.id)
        if (confirmedDatabaseReference(existing, operationWorkspaceId, operationPageId, block.id, block.parentBlockId, block.orderKey, choice.databaseId, choice.viewId)) {
          if (!operationCurrent(epoch)) {
            markProductDatabaseInsertionUncertain(operationUserId, operationWorkspaceId, operationPageId)
            throw new Error('登录状态或页面已切换，请刷新页面确认数据库引用。')
          }
          return { databaseId: choice.databaseId, viewId: choice.viewId }
        }
      } catch {
        // A 404 or failed verification cannot prove the transaction did not commit.
      }
      markProductDatabaseInsertionUncertain(operationUserId, operationWorkspaceId, operationPageId)
      throw new Error('上次数据库操作结果尚未确认，请联网并刷新页面后确认；正文可继续编辑。')
    }
    if (!operationCurrent(epoch)) {
      markProductDatabaseInsertionUncertain(operationUserId, operationWorkspaceId, operationPageId)
      throw new Error('数据库已链接，但登录状态已切换。请返回原页面并刷新确认。')
    }
    if (result.block.id !== block.id || result.block.parentBlockId !== block.parentBlockId || result.block.orderKey !== block.orderKey) {
      throw new Error('引用已链接，但服务端返回的位置不一致。请保留页面并重试保存。')
    }
    return { databaseId: choice.databaseId, viewId: choice.viewId }
  } catch (cause) {
    databaseRecoveryError.value = errorMessage(cause, '数据库操作失败，请重试。')
    databaseRequest = null
    databaseBusy.value = false
    throw new Error(databaseRecoveryError.value)
  }
}

watch(() => auth.user?.id, (userId, previousUserId) => {
  if (previousUserId !== undefined && userId !== previousUserId && databaseBusy.value) {
    databaseEpoch += 1
    resolveDatabase(null)
  }
})

async function commitDatabaseReference(blockId: string): Promise<boolean> {
  const current = persistence.value
  if (!current || !databaseRequest || databaseRequest.blockId !== blockId) return false
  const saved = await current.flush()
  const local = await sync.store()
  const stored = await local.getBlock(blockId)
  if (!stored) sync.requestSync(0)
  databaseRequest = null
  databaseBusy.value = false
  return saved && !!stored
}

function onCreateDatabaseChoice(): void {
  resolveDatabase({ kind: 'create', name: databaseName.value })
}

function beforeUnload(event: BeforeUnloadEvent): void {
  if (!databaseBusy.value && !persistence.value?.hasPendingWork && pendingAttachmentCleanups.value.length === 0) return
  event.preventDefault()
  event.returnValue = ''
}

async function guardNavigation(): Promise<boolean> {
  if (databaseBusy.value) return false
  if (!auth.user) return true
  if (!(await flushAttachmentCleanups())) return false
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
  if (!settled.value || !page.value || !current || current.hasPendingWork || databaseBusy.value) return
  void (async () => {
    const blocks = await (await sync.store()).listBlocksByPage(id)
    if (persistence.value !== current || pageId.value !== id || workspaceId.value !== workspace || current.hasPendingWork || databaseBusy.value) return
    if (!current.matchesLocalBlocks(blocks)) await loadBlocks()
  })()
})
window.addEventListener('beforeunload', beforeUnload)
onBeforeUnmount(() => {
  databaseEpoch += 1
  resolveDatabaseChoice?.(null)
  resolveDatabaseChoice = null
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
    <div class="product-state-icon" aria-hidden="true"><EotionIcon name="search" :size="24" /></div>
    <h1 id="page-unavailable-title">无法打开这个页面</h1>
    <p class="lead">它可能已被删除，或者不属于当前工作区。</p>
    <div class="product-state-actions">
      <RouterLink class="product-button product-button--primary" :to="{ name: 'product-workspace', params: { workspaceId } }">返回工作区</RouterLink>
    </div>
  </section>
  <div v-else class="document product-editor-page" :class="{ 'product-editor-page--embedded': embedded }">
    <p class="product-section-label">{{ currentWorkspace?.name ?? '工作区' }}</p>
    <div class="product-editor-heading"><h1>{{ page.title }}</h1></div>
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
        :workspace-id="workspaceId"
        :fixed-toolbar="layoutMode !== 'mobile' && preferences.toolbarVisible(auth.user?.id ?? '', workspaceId)"
        :commit-attachment="commitAttachment"
        :create-database-reference="createDatabaseReference"
        :commit-database-reference="commitDatabaseReference"
        :touch-toolbar="layoutMode === 'mobile' || inputMode !== 'mouse'"
        :autofocus="embedded || route.query.edit === 'record'"
        aria-label="页面正文编辑区域"
        @update="onEditorUpdate"
        @composition="(active) => persistence?.setComposing(active)"
      />
    </template>
  </div>
  <EotionCommandOverlay v-model:open="databaseDialogOpen" label="数据库" :shortcut="false" :dismissible="!databaseListLoading">
    <div class="database-command">
      <h2>数据库</h2>
      <template v-if="databaseMode === 'start'">
        <div class="database-command-choices" role="group" aria-label="数据库操作">
          <button class="database-command-option" type="button" @click="databaseMode = 'create'">创建新数据库</button>
          <button class="database-command-option" type="button" @click="databaseMode = 'databases'; databaseList = []; databaseCursor = null; loadDatabaseChoices()">链接现有数据库</button>
        </div>
      </template>
      <form v-else-if="databaseMode === 'create'" class="database-command-form" @submit.prevent="onCreateDatabaseChoice">
        <div class="database-command-create-header">
          <EotionButton class="database-command-back" variant="ghost" type="button" @click="databaseMode = 'start'"><EotionIcon :name="IconName.ArrowLeft" :size="16" />返回</EotionButton>
          <div class="database-command-actions">
            <EotionButton variant="ghost" type="button" @click="resolveDatabase(null)">取消</EotionButton>
            <EotionButton variant="primary" type="submit">创建数据库</EotionButton>
          </div>
        </div>
        <label for="database-name">数据库名称</label>
        <input id="database-name" v-model="databaseName" aria-label="数据库名称" maxlength="200" autofocus>
      </form>
      <template v-else-if="databaseMode === 'databases'">
        <button class="database-command-back" type="button" @click="databaseMode = 'start'">返回</button>
        <p v-if="databaseListLoading" role="status">正在加载数据库列表…</p>
        <p v-if="databaseError" role="alert">{{ databaseError }} <button type="button" @click="loadDatabaseChoices()">重试</button></p>
        <ul class="database-command-list">
          <li v-for="item in databaseList" :key="item.id"><button type="button" @click="selectDatabase(item.id)">{{ item.name }}</button></li>
        </ul>
        <p v-if="!databaseListLoading && !databaseList.length && !databaseError">没有可链接的数据库。</p>
        <button v-if="databaseCursor" type="button" :disabled="databaseListLoading" @click="loadDatabaseChoices(true)">{{ databaseListLoading ? '正在加载…' : '加载更多数据库' }}</button>
      </template>
      <template v-else>
        <button class="database-command-back" type="button" @click="databaseMode = 'databases'">返回数据库列表</button>
        <p v-if="databaseError" role="alert">{{ databaseError }} <button type="button" @click="selectDatabase(databaseSelectedId)">重试</button></p>
        <p v-else-if="databaseViewsLoading" role="status">正在加载表格视图…</p>
        <ul class="database-command-list">
          <li v-for="view in databaseViews" :key="view.id"><button type="button" @click="resolveDatabase({ kind: 'link', databaseId: databaseSelectedId, viewId: view.id })">{{ view.name === 'Table' ? '表格视图' : view.name }}</button></li>
        </ul>
        <p v-if="!databaseViewsLoading && !databaseViews.length && !databaseError">这个数据库没有可链接的表格视图。</p>
      </template>
      <button v-if="databaseMode !== 'create'" class="database-command-cancel" type="button" @click="resolveDatabase(null)">取消</button>
    </div>
  </EotionCommandOverlay>
</template>

<style scoped>
.database-command { display: grid; gap: 10px; }
.database-command h2 { margin: 0 0 4px; font-size: 18px; font-weight: 600; }
.database-command-choices { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.database-command-option, .database-command-form input, .database-command-list button, .database-command-cancel, .database-command > button { min-height: 40px; border: 1px solid var(--e-color-border); border-radius: var(--e-radius-control); padding: 8px 11px; background: var(--e-color-surface); color: var(--e-color-text-primary); font: inherit; text-align: left; cursor: pointer; }
.database-command-option:hover, .database-command-list button:hover { background: var(--surface-editor-hover); }
.database-command-form { display: grid; gap: 8px; }
.database-command-form label { color: var(--e-color-text-muted); font-size: 13px; }
.database-command-form input { box-sizing: border-box; width: 100%; }
.database-command-create-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.database-command-back { justify-self: start; }
.database-command-actions { display: flex; justify-content: flex-end; gap: 8px; }
.database-command-list { display: grid; max-height: min(45dvh, 360px); overflow: auto; gap: 4px; margin: 0; padding: 0; list-style: none; }
.database-command-list button { width: 100%; }
.database-command-cancel { justify-self: end; }
@media (max-width: 420px) {
  .database-command-choices { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .database-command-option { padding-inline: 8px; text-align: center; }
  .database-command-create-header { align-items: flex-start; }
  .database-command-actions { gap: 4px; }
}
</style>
