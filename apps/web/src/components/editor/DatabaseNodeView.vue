<script setup lang="ts">
import type { DatabasePropertyResponse, DatabaseRecordResponse, DatabaseViewResponse } from '@eotion/contracts'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import { createProductDatabaseRecord, isProductDatabaseRecordCreationUncertain, loadProductDatabaseTable, prepareProductDatabaseRecordPage } from '../../services/productDatabases'
import { errorMessage } from '../../services/productApi'
import { useAuthStore } from '../../stores/auth'
import { DATABASE_RECORD_CREATED_EVENT, type DatabaseRecordCreatedDetail } from '../../editor/databaseEvents'
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'

const props = defineProps(nodeViewProps)
const auth = useAuthStore()
const router = useRouter()
const workspaceId = computed(() => String(props.extension.options.workspaceId ?? ''))
const databaseId = computed(() => String(props.node.attrs.databaseId ?? ''))
const viewId = computed(() => String(props.node.attrs.viewId ?? ''))
const title = ref('数据库')
const viewName = ref('表格')
const properties = ref<DatabasePropertyResponse[]>([])
const records = ref<DatabaseRecordResponse[]>([])
const nextCursor = ref<string | null>(null)
const loading = ref(false)
const loadingMore = ref(false)
const creating = ref(false)
const loadError = ref('')
const creationNotice = ref('')
const moreError = ref('')
const online = ref(navigator.onLine)
const creationUncertain = computed(() => isProductDatabaseRecordCreationUncertain(auth.user?.id ?? '', workspaceId.value, databaseId.value))
let requestEpoch = 0

function selectBlock(): void {
  const position = props.getPos?.()
  if (typeof position === 'number') props.editor.chain().focus().setNodeSelection(position).run()
}

async function openRecordPage(event: MouseEvent, pageId: string): Promise<void> {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  const workspace = workspaceId.value
  creationNotice.value = ''
  try {
    await prepareProductDatabaseRecordPage(workspace, pageId)
    if (workspaceId.value !== workspace) throw new Error('登录状态或工作区已切换，请刷新后重试。')
    await router.push({ name: 'product-page', params: { workspaceId: workspace, pageId } })
  } catch (cause) {
    creationNotice.value = errorMessage(cause, '暂时无法打开记录页面，请联网后重试。')
  }
}

function formatValue(value: unknown, property: DatabasePropertyResponse): string {
  if (value === null || value === undefined || value === '') return '—'
  if (property.type === 'checkbox') return value === true ? '已完成' : '未完成'
  if (property.type === 'select') return property.options?.find(option => option.id === value)?.name ?? '—'
  return String(value)
}

async function loadTable(append = false): Promise<void> {
  if (append && loadingMore.value) return
  const workspace = workspaceId.value
  const database = databaseId.value
  const view = viewId.value
  const userId = auth.user?.id
  if (!workspace || !database || !view) return
  const epoch = ++requestEpoch
  if (append) {
    loadingMore.value = true
    moreError.value = ''
  }
  else {
    loading.value = true
    loadError.value = ''
    moreError.value = ''
  }
  try {
    const result = await loadProductDatabaseTable(workspace, database, view, { limit: 25, ...(append && nextCursor.value ? { cursor: nextCursor.value } : {}) })
    if (epoch !== requestEpoch || auth.user?.id !== userId || workspaceId.value !== workspace || databaseId.value !== database || viewId.value !== view) return
    title.value = result.database.name
    viewName.value = result.view.name
    properties.value = result.properties
    records.value = append ? [...records.value, ...result.records] : result.records
    nextCursor.value = result.nextCursor
  } catch (cause) {
    if (epoch === requestEpoch) {
      const message = !navigator.onLine ? '离线时无法读取数据库。' : errorMessage(cause, '暂时无法加载数据库。')
      if (append) moreError.value = message
      else loadError.value = message
    }
  } finally {
    if (epoch === requestEpoch) {
      loading.value = false
      loadingMore.value = false
    }
  }
}

async function createRecord(): Promise<void> {
  if (creating.value || creationUncertain.value || !online.value) {
    if (!online.value) creationNotice.value = '离线时无法新建记录。'
    return
  }
  creating.value = true
  creationNotice.value = ''
  const workspace = workspaceId.value
  const database = databaseId.value
  try {
    const result = await createProductDatabaseRecord(workspace, database)
    if (workspaceId.value !== workspace || databaseId.value !== database) return
    if (result.refreshWarning) creationNotice.value = result.refreshWarning
  } catch (cause) {
    creationNotice.value = errorMessage(cause, '无法新建记录，请重试。')
  } finally {
    creating.value = false
  }
}

function onRecordCreated(event: Event): void {
  const detail = (event as CustomEvent<DatabaseRecordCreatedDetail>).detail
  if (detail?.workspaceId === workspaceId.value && detail.databaseId === databaseId.value) void loadTable()
}

function onOnlineChange(): void { online.value = navigator.onLine }

onMounted(() => {
  window.addEventListener(DATABASE_RECORD_CREATED_EVENT, onRecordCreated)
  window.addEventListener('online', onOnlineChange)
  window.addEventListener('offline', onOnlineChange)
  void loadTable()
})
onBeforeUnmount(() => {
  requestEpoch += 1
  window.removeEventListener(DATABASE_RECORD_CREATED_EVENT, onRecordCreated)
  window.removeEventListener('online', onOnlineChange)
  window.removeEventListener('offline', onOnlineChange)
})
watch([workspaceId, databaseId, viewId, () => auth.user?.id], () => { void loadTable() })
</script>

<template>
  <NodeViewWrapper class="eotion-database" contenteditable="false" aria-label="数据库视图">
    <header class="eotion-database-header">
      <span class="eotion-database-mark" aria-hidden="true" @click.stop="selectBlock">▦</span>
      <span class="eotion-database-copy" @click.stop="selectBlock">
        <strong>{{ title }}</strong>
        <small>{{ viewName }}</small>
      </span>
      <button class="eotion-database-add" type="button" :disabled="creating || creationUncertain || !online" @pointerdown.stop @mousedown.stop @click.stop="createRecord">
        {{ creating ? '正在新建…' : '+ 新建记录' }}
      </button>
    </header>
    <p v-if="!online && !loading && !loadError" class="eotion-database-offline" role="status">离线 · 当前显示已加载的内容</p>
    <p v-if="loading" class="eotion-database-state" role="status">正在加载数据库…</p>
    <div v-else-if="loadError" class="eotion-database-error" role="alert">
      <span>{{ loadError }}</span>
        <button type="button" @pointerdown.stop @mousedown.stop @click.stop="loadTable()">重试加载</button>
    </div>
    <template v-else>
      <p v-if="creationNotice || creationUncertain" class="eotion-database-error" role="alert">{{ creationNotice || '上次记录创建结果尚未确认，请联网并刷新页面后确认。' }}</p>
      <div v-if="properties.length" class="eotion-database-scroll" data-testid="database-table-scroll" role="region" aria-label="数据库记录" tabindex="0" @pointerdown.stop>
        <table class="eotion-database-table">
          <thead><tr><th v-for="property in properties" :key="property.id" scope="col">{{ property.name }}</th></tr></thead>
          <tbody>
            <tr v-for="record in records" :key="record.id">
              <td v-for="property in properties" :key="property.id">
                <RouterLink
                  v-if="property.type === 'title'"
                  class="eotion-database-title"
                  :to="{ name: 'product-page', params: { workspaceId, pageId: record.pageId } }"
                  @pointerdown.stop
                  @mousedown.stop
                  @click.capture="openRecordPage($event, record.pageId)"
                >{{ formatValue(record.properties[property.id], property) }}</RouterLink>
                <template v-else>{{ formatValue(record.properties[property.id], property) }}</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="records.length === 0" class="eotion-database-state">暂无记录</p>
      <p v-else-if="!properties.length" class="eotion-database-state">这个数据库还没有可显示的属性。</p>
      <div v-if="moreError" class="eotion-database-error" role="alert">
        <span>{{ moreError }}</span>
        <button type="button" :disabled="loadingMore" @pointerdown.stop @mousedown.stop @click.stop="loadTable(true)">重试加载更多</button>
      </div>
      <button v-if="nextCursor" class="eotion-database-more" type="button" :disabled="loadingMore" @pointerdown.stop @mousedown.stop @click.stop="loadTable(true)">
        {{ loadingMore ? '正在加载…' : '加载更多' }}
      </button>
    </template>
  </NodeViewWrapper>
</template>

<style scoped>
.eotion-database { display: block; min-width: 0; margin: 12px 0; overflow: hidden; border: 1px solid var(--border-editor); border-radius: 9px; background: var(--surface-raised); color: var(--editor-text); }
.eotion-database-header { display: flex; min-height: 58px; align-items: center; gap: 12px; padding: 10px 14px; }
.eotion-database-mark { display: grid; width: 34px; height: 34px; flex: 0 0 auto; place-items: center; border-radius: 7px; background: var(--surface-editor-hover); color: var(--editor-muted); font-size: 20px; }
.eotion-database-copy { display: grid; min-width: 0; flex: 1; gap: 3px; }
.eotion-database-copy strong { overflow: hidden; font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.eotion-database-copy small { color: var(--editor-muted); font-size: 12px; }
.eotion-database-add, .eotion-database-error button, .eotion-database-more { min-height: 32px; border: 1px solid var(--border-editor); border-radius: 6px; padding: 5px 9px; background: var(--surface-editor-hover); color: inherit; font: inherit; cursor: pointer; }
.eotion-database-add:disabled, .eotion-database-error button:disabled, .eotion-database-more:disabled { opacity: .6; cursor: default; }
.eotion-database-scroll { max-width: 100%; overflow-x: auto; overscroll-behavior-inline: contain; border-top: 1px solid var(--border-editor); }
.eotion-database-table { width: max-content; min-width: 100%; border-collapse: collapse; font-size: 13px; }
.eotion-database-table th, .eotion-database-table td { width: 180px; min-width: 180px; max-width: 260px; overflow-wrap: anywhere; border-right: 1px solid var(--border-editor); border-bottom: 1px solid var(--border-editor); padding: 8px 11px; text-align: left; vertical-align: top; }
.eotion-database-table th { color: var(--editor-muted); font-size: 12px; font-weight: 600; }
.eotion-database-title { color: inherit; text-decoration: underline; text-decoration-color: var(--editor-muted); text-underline-offset: 2px; }
.eotion-database-table tr:last-child td { border-bottom: 0; }
.eotion-database-state, .eotion-database-error { margin: 0; padding: 12px 14px; color: var(--editor-muted); font-size: 13px; }
.eotion-database-offline { margin: 0; border-top: 1px solid var(--border-editor); padding: 7px 14px; color: var(--editor-muted); font-size: 12px; }
.eotion-database-error { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; color: var(--danger); }
.eotion-database-more { margin: 10px 14px; }
@media (max-width: 767px) { .eotion-database-header { gap: 8px; padding: 9px 10px; } .eotion-database-add { min-height: 36px; padding-inline: 7px; } }
</style>
