<script setup lang="ts">
import type { DatabasePropertyResponse, DatabaseRecordCellUpdateRequest, DatabaseTableResponse } from '@eotion/contracts'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type ComponentPublicInstance } from 'vue'
import { createLocalId } from '@eotion/storage'
import { RouterLink, useRouter } from 'vue-router'

import {
  createProductDatabaseProperty, createProductDatabaseRecord, deleteProductDatabaseProperty,
  isProductDatabaseRecordCreationUncertain, loadProductDatabaseTable, prepareProductDatabaseRecordPage,
  updateProductDatabaseProperty, updateProductDatabaseRecordCell,
} from '../../services/productDatabases'
import { ApiError, errorMessage } from '../../services/productApi'
import { useAuthStore } from '../../stores/auth'
import { DATABASE_RECORD_CREATED_EVENT, DATABASE_UPDATED_EVENT, type DatabaseRecordCreatedDetail, type DatabaseUpdatedDetail } from '../../editor/databaseEvents'
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'

const props = defineProps(nodeViewProps)
const auth = useAuthStore()
type TableRecord = DatabaseTableResponse['records'][number]
const router = useRouter()
const workspaceId = computed(() => String(props.extension.options.workspaceId ?? ''))
const databaseId = computed(() => String(props.node.attrs.databaseId ?? ''))
const viewId = computed(() => String(props.node.attrs.viewId ?? ''))
const title = ref('数据库')
const viewName = ref('表格')
const databaseVersion = ref(1)
const addableProperties = [
  { type: 'text', label: '文本' }, { type: 'number', label: '数字' }, { type: 'checkbox', label: '复选框' },
  { type: 'select', label: '选择' }, { type: 'date', label: '日期' },
] as const
const properties = ref<DatabasePropertyResponse[]>([])
const records = ref<TableRecord[]>([])
const nextCursor = ref<string | null>(null)
const loading = ref(false)
const loadingMore = ref(false)
const creating = ref(false)
const loadError = ref('')
const mutationError = ref('')
const refreshError = ref('')
const moreError = ref('')
const online = ref(navigator.onLine)
const staleReadonly = ref(false)
const creationUncertain = computed(() => isProductDatabaseRecordCreationUncertain(auth.user?.id ?? '', workspaceId.value, databaseId.value))
const writable = computed(() => online.value && !staleReadonly.value && !loading.value && !savingCell.value)
const addTitleMode = ref(false)
const addTitleDraft = ref('')
const propertyMenuId = ref('')
const propertyMenuStyle = ref<Record<string, string>>({})
const propertyNameDraft = ref('')
const optionNameDraft = ref('')
const optionEditId = ref('')
const optionEditName = ref('')
const cellEdit = ref<{ recordId: string; propertyId: string; value: string } | null>(null)
const cellPopover = ref<{ recordId: string; propertyId: string } | null>(null)
const cellPopoverStyle = ref<Record<string, string>>({})
const cellDraftError = ref('')
const savingCell = ref(false)
const returnFocusTo = ref<HTMLElement | null>(null)
const cellInput = ref<HTMLInputElement | null>(null)
const cellDraft = computed({ get: () => cellEdit.value?.value ?? '', set: value => { if (cellEdit.value) cellEdit.value.value = value } })
let requestEpoch = 0

function selectBlock(): void {
  const position = props.getPos?.()
  if (typeof position === 'number') props.editor.chain().focus().setNodeSelection(position).run()
}

async function openRecordPage(event: MouseEvent, pageId: string): Promise<void> {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  const workspace = workspaceId.value
  try {
    await prepareProductDatabaseRecordPage(workspace, pageId)
    if (workspaceId.value !== workspace) throw new Error('登录状态或工作区已切换，请刷新后重试。')
    await router.push({ name: 'product-page', params: { workspaceId: workspace, pageId } })
  } catch (cause) { mutationError.value = errorMessage(cause, '暂时无法打开记录页面，请联网后重试。') }
}

function formatValue(value: unknown, property: DatabasePropertyResponse): string {
  if (value === null || value === undefined || value === '') return '—'
  if (property.type === 'checkbox') return value === true ? '已完成' : '未完成'
  if (property.type === 'select') return property.options?.find(option => option.id === value)?.name ?? '—'
  return String(value)
}
function getCellValue(record: TableRecord, propertyId: string): unknown {
  return Object.hasOwn(record.properties, propertyId) ? record.properties[propertyId] : undefined
}

async function fetchWindow(cursor?: string) {
  return loadProductDatabaseTable(workspaceId.value, databaseId.value, viewId.value, { limit: 25, ...(cursor ? { cursor } : {}) })
}

async function loadTable(append = false): Promise<void> {
  if (append && (loadingMore.value || loading.value || staleReadonly.value)) return
  const workspace = workspaceId.value
  const database = databaseId.value
  const view = viewId.value
  const userId = auth.user?.id
  if (!workspace || !database || !view) return
  const epoch = ++requestEpoch
  if (append) { loadingMore.value = true; moreError.value = '' }
  else { loading.value = true; loadError.value = ''; moreError.value = '' }
  try {
    const result = await loadProductDatabaseTable(workspace, database, view, { limit: 25, ...(append && nextCursor.value ? { cursor: nextCursor.value } : {}) })
    if (epoch !== requestEpoch || auth.user?.id !== userId || workspaceId.value !== workspace || databaseId.value !== database || viewId.value !== view) return
    title.value = result.database.name
    databaseVersion.value = result.database.version
    viewName.value = result.view.name
    properties.value = result.properties
    if (append) records.value = [...records.value, ...result.records.filter(record => !records.value.some(existing => existing.id === record.id))]
    else records.value = result.records
    nextCursor.value = result.nextCursor
    staleReadonly.value = false
    refreshError.value = ''
  } catch (cause) {
    if (epoch === requestEpoch) {
      const message = !navigator.onLine ? '离线时无法读取数据库。' : errorMessage(cause, '暂时无法加载数据库。')
      if (append) moreError.value = message
      else loadError.value = message
    }
  } finally { if (epoch === requestEpoch) { loading.value = false; loadingMore.value = false } }
}

async function refreshLoadedWindow(): Promise<void> {
  const desiredCount = records.value.length
  const epoch = ++requestEpoch
  const identity = [workspaceId.value, databaseId.value, viewId.value, auth.user?.id].join('\u0000')
  staleReadonly.value = true
  cellPopover.value = null
  propertyMenuId.value = ''
  loading.value = false
  loadingMore.value = false
  moreError.value = ''
  let cursor: string | undefined
  const refreshed: TableRecord[] = []
  let nextDatabaseVersion = databaseVersion.value
  let nextTitle = title.value
  let nextViewName = viewName.value
  let nextProperties = properties.value
  try {
    do {
      const result = await loadProductDatabaseTable(workspaceId.value, databaseId.value, viewId.value, { limit: 25, ...(cursor ? { cursor } : {}) })
      if (epoch !== requestEpoch || identity !== [workspaceId.value, databaseId.value, viewId.value, auth.user?.id].join('\u0000')) return
      nextTitle = result.database.name
      nextDatabaseVersion = result.database.version
      nextViewName = result.view.name
      nextProperties = result.properties
      for (const record of result.records) if (!refreshed.some(existing => existing.id === record.id)) refreshed.push(record)
      cursor = result.nextCursor ?? undefined
    } while (cursor && refreshed.length < desiredCount)
    if (epoch !== requestEpoch || identity !== [workspaceId.value, databaseId.value, viewId.value, auth.user?.id].join('\u0000')) return
    records.value = refreshed
    title.value = nextTitle
    databaseVersion.value = nextDatabaseVersion
    viewName.value = nextViewName
    properties.value = nextProperties
    nextCursor.value = cursor ?? null
    staleReadonly.value = false
    refreshError.value = ''
  } catch (cause) {
    if (epoch === requestEpoch) {
      staleReadonly.value = true
      refreshError.value = `更新未完成，已保留当前内容并切换为只读。${errorMessage(cause, '请重试加载。')}`
    }
  }
}

async function createRecord(): Promise<void> {
  if (creating.value || creationUncertain.value || !writable.value) return
  const cleanTitle = addTitleDraft.value.trim()
  if (!cleanTitle || cleanTitle.length > 200) return
  creating.value = true
  mutationError.value = ''
  try {
    const result = await createProductDatabaseRecord(workspaceId.value, databaseId.value, cleanTitle)
    addTitleMode.value = false
    addTitleDraft.value = ''
    if (result.refreshWarning) mutationError.value = result.refreshWarning
  } catch (cause) {
    mutationError.value = errorMessage(cause, '无法新建记录，请重试。')
    if (creationUncertain.value || (cause instanceof Error && cause.message.includes('登录状态或工作区已切换'))) addTitleMode.value = false
  } finally { creating.value = false }
}
function onNewRecordEnter(event: KeyboardEvent): void {
  event.preventDefault()
  if (event.isComposing || event.keyCode === 229) return
  void createRecord()
}

function cancelNewRecord(): void { addTitleMode.value = false; addTitleDraft.value = '' }

function openPropertyMenu(property: DatabasePropertyResponse, event: MouseEvent): void {
  if (!writable.value) return
  if (propertyMenuId.value === property.id) { propertyMenuId.value = ''; return }
  propertyMenuId.value = property.id
  returnFocusTo.value = event.currentTarget as HTMLElement
  propertyMenuStyle.value = anchoredStyle(event.currentTarget as HTMLElement)
  propertyNameDraft.value = property.name
  optionNameDraft.value = ''
  optionEditId.value = ''
  event.stopPropagation()
}

function anchoredStyle(anchor: HTMLElement): Record<string, string> {
  const rect = anchor.getBoundingClientRect()
  const width = Math.min(280, window.innerWidth - 16)
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
  const top = rect.bottom + 4 + 220 > window.innerHeight ? Math.max(8, rect.top - 224) : rect.bottom + 4
  return { position: 'fixed', left: `${left}px`, top: `${top}px`, width: `${width}px`, maxHeight: `${Math.max(120, window.innerHeight - top - 8)}px`, overflowY: 'auto' }
}

async function savePropertyName(property: DatabasePropertyResponse): Promise<void> {
  const name = propertyNameDraft.value.trim()
  if (!name || name.length > 100) return
  mutationError.value = ''
  try {
    await updateProductDatabaseProperty(workspaceId.value, databaseId.value, property.id, {
      name, expectedDatabaseVersion: databaseVersion.value, expectedPropertyVersion: property.version,
    })
    propertyMenuId.value = ''
  } catch (cause) {
    if (cause instanceof ApiError && cause.statusCode === 409) { await refreshLoadedWindow(); mutationError.value = '属性已变化，已刷新版本，请确认后重试。' }
    else mutationError.value = errorMessage(cause, '属性未更新，请重试。')
  }
}

async function addProperty(type: 'text' | 'number' | 'checkbox' | 'select' | 'date'): Promise<void> {
  if (!writable.value) return
  mutationError.value = ''
  const labels = { text: '文本', number: '数字', checkbox: '复选框', select: '选择', date: '日期' }
  try {
    await createProductDatabaseProperty(workspaceId.value, databaseId.value, {
      id: createLocalId(), name: labels[type], type, expectedDatabaseVersion: databaseVersion.value,
      ...(type === 'select' ? { options: [] } : {}),
    })
    propertyMenuId.value = ''
  } catch (cause) {
    if (cause instanceof ApiError && cause.statusCode === 409) { await refreshLoadedWindow(); mutationError.value = '数据库结构已变化，已刷新版本，请重试。' }
    else mutationError.value = errorMessage(cause, '属性未创建，请重试。')
  }
}

async function deleteProperty(property: DatabasePropertyResponse): Promise<void> {
  mutationError.value = ''
  try {
    await deleteProductDatabaseProperty(workspaceId.value, databaseId.value, property.id, {
      expectedDatabaseVersion: databaseVersion.value, expectedPropertyVersion: property.version,
    })
    propertyMenuId.value = ''
  } catch (cause) {
    if (cause instanceof ApiError && cause.statusCode === 409) { await refreshLoadedWindow(); mutationError.value = '属性已变化，已刷新版本，请确认后重试。' }
    else mutationError.value = errorMessage(cause, '属性未删除，请重试。')
  }
}

async function addSelectOption(property: DatabasePropertyResponse): Promise<void> {
  const name = optionNameDraft.value.trim()
  if (!name || name.length > 100) return
  const options = [...(property.options ?? []), { id: createLocalId(), name }]
  try {
    await updateProductDatabaseProperty(workspaceId.value, databaseId.value, property.id, {
      options, expectedDatabaseVersion: databaseVersion.value, expectedPropertyVersion: property.version,
    })
    optionNameDraft.value = ''
  } catch (cause) {
    if (cause instanceof ApiError && cause.statusCode === 409) { await refreshLoadedWindow(); mutationError.value = '属性已变化，已刷新版本，请确认后重试。' }
    else mutationError.value = errorMessage(cause, '选项未创建，请重试。')
  }
}

async function saveSelectOptions(property: DatabasePropertyResponse, options: Array<{ id: string; name: string }>): Promise<void> {
  try {
    await updateProductDatabaseProperty(workspaceId.value, databaseId.value, property.id, {
      options, expectedDatabaseVersion: databaseVersion.value, expectedPropertyVersion: property.version,
    })
    optionEditId.value = ''
  } catch (cause) {
    if (cause instanceof ApiError && cause.statusCode === 409) { await refreshLoadedWindow(); mutationError.value = '属性已变化，已刷新版本，请确认后重试。' }
    else mutationError.value = errorMessage(cause, '选项未更新，请重试。')
  }
}

function startCellEdit(record: TableRecord, property: DatabasePropertyResponse): void {
  if (!writable.value || property.type === 'checkbox' || property.type === 'select') return
  cellPopover.value = null
  cellDraftError.value = ''
  const current = getCellValue(record, property.id)
  cellEdit.value = { recordId: record.id, propertyId: property.id, value: current == null ? '' : String(current) }
  void nextTick(() => cellInput.value?.focus())
}
function setCellInputRef(element: Element | ComponentPublicInstance | null): void {
  cellInput.value = element instanceof HTMLInputElement ? element : null
}

function cancelCellEdit(): void { cellEdit.value = null; cellDraftError.value = '' }
function isEditingCell(record: TableRecord, property: DatabasePropertyResponse): boolean { return cellEdit.value?.recordId === record.id && cellEdit.value?.propertyId === property.id }
function isOpenSelect(record: TableRecord, property: DatabasePropertyResponse): boolean { return cellPopover.value?.recordId === record.id && cellPopover.value?.propertyId === property.id }

async function saveCell(record: TableRecord, property: DatabasePropertyResponse, forceNull = false): Promise<void> {
  if (savingCell.value || !cellEdit.value || !writable.value) return
  const raw = cellEdit.value.value
  const normalized = raw.trim()
  let value: string | number | boolean | null = forceNull || normalized === '' ? null : raw
  if (property.type === 'number' && value !== null) {
    const number = Number(normalized)
    if (!Number.isFinite(number)) { cellDraftError.value = '请输入有效数字。'; return }
    value = number
  }
  if (property.type === 'title' && (value === null || String(value).trim() === '' || String(value).trim().length > 200)) {
    cellDraftError.value = '标题必须为 1–200 个字符。'
    return
  }
  if (property.type === 'date' && value !== null) {
    const date = String(value)
    const parsed = /^\d{4}-\d{2}-\d{2}$/u.test(date) ? new Date(`${date}T00:00:00.000Z`) : null
    if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) { cellDraftError.value = '请选择有效日期。'; return }
  }
  const expectedValue = property.type === 'title' && value !== null ? String(value).trim() : value
  const latestRecord = records.value.find(item => item.id === record.id) ?? record
  savingCell.value = true
  cellDraftError.value = ''
  mutationError.value = ''
  try {
    const input: DatabaseRecordCellUpdateRequest = {
      value: expectedValue,
      expectedDatabaseVersion: databaseVersion.value,
      expectedRecordVersion: latestRecord.version,
      ...(property.type === 'title' ? { expectedPageUpdatedAt: latestRecord.pageVersion } : {}),
    }
    const result = await updateProductDatabaseRecordCell(workspaceId.value, databaseId.value, latestRecord.id, property.id, input)
    databaseVersion.value = result.database.version
    if ('refreshWarning' in result && result.refreshWarning) mutationError.value = result.refreshWarning
    cellEdit.value = null
    cellPopover.value = null
  } catch (cause) {
    if (cause instanceof ApiError && cause.statusCode === 409) {
      await refreshLoadedWindow()
      cellDraftError.value = '内容已变化，已刷新版本；检查草稿后再次保存。'
    } else if (cause instanceof ApiError && cause.statusCode >= 400 && cause.statusCode < 500) {
      cellDraftError.value = errorMessage(cause, '内容未保存，请重试。')
    } else {
      await refreshLoadedWindow()
      const refreshed = records.value.find(item => item.id === record.id)
      const confirmedValue = refreshed ? getCellValue(refreshed, property.id) : undefined
      if (refreshed && (expectedValue === null ? confirmedValue == null : confirmedValue === expectedValue)) {
        cellEdit.value = null
        cellDraftError.value = ''
      } else {
        cellDraftError.value = '提交结果暂未确认，已刷新记录；请核对当前值后再编辑。'
      }
    }
  } finally { savingCell.value = false }
}
function onCellEnter(event: KeyboardEvent, record: TableRecord, property: DatabasePropertyResponse): void {
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  void saveCell(record, property)
}

async function toggleCheckbox(record: TableRecord, property: DatabasePropertyResponse): Promise<void> {
  if (!writable.value) return
  try {
    const result = await updateProductDatabaseRecordCell(workspaceId.value, databaseId.value, record.id, property.id, {
      value: getCellValue(record, property.id) !== true, expectedDatabaseVersion: databaseVersion.value, expectedRecordVersion: record.version,
    })
    databaseVersion.value = result.database.version
  } catch (cause) {
    if (cause instanceof ApiError && cause.statusCode === 409) { await refreshLoadedWindow(); mutationError.value = '记录已变化，已刷新版本，请重新操作。' }
    else { mutationError.value = errorMessage(cause, '内容未保存，请重试。') }
  }
}

async function chooseSelect(record: TableRecord, property: DatabasePropertyResponse, optionId: string | null): Promise<void> {
  try {
    const result = await updateProductDatabaseRecordCell(workspaceId.value, databaseId.value, record.id, property.id, {
      value: optionId, expectedDatabaseVersion: databaseVersion.value, expectedRecordVersion: record.version,
    })
    databaseVersion.value = result.database.version
    cellPopover.value = null
  } catch (cause) {
    if (cause instanceof ApiError && cause.statusCode === 409) { await refreshLoadedWindow(); mutationError.value = '记录已变化，已刷新版本，请重新选择。' }
    else { mutationError.value = errorMessage(cause, '内容未保存，请重试。') }
  }
}

function onDatabaseChanged(event: Event): void {
  const detail = (event as CustomEvent<DatabaseRecordCreatedDetail | DatabaseUpdatedDetail>).detail
  if (detail?.workspaceId === workspaceId.value && detail.databaseId === databaseId.value) void refreshLoadedWindow()
}
function toggleCellPopover(record: TableRecord, property: DatabasePropertyResponse, event: MouseEvent): void {
  if (!writable.value) return
  if (isOpenSelect(record, property)) { cellPopover.value = null; return }
  returnFocusTo.value = event.currentTarget as HTMLElement
  cellPopoverStyle.value = anchoredStyle(event.currentTarget as HTMLElement)
  cellPopover.value = { recordId: record.id, propertyId: property.id }
}
function togglePropertyCreator(event: MouseEvent): void {
  if (!writable.value) return
  if (propertyMenuId.value === '__add') { propertyMenuId.value = ''; return }
  returnFocusTo.value = event.currentTarget as HTMLElement
  propertyMenuStyle.value = anchoredStyle(event.currentTarget as HTMLElement)
  propertyMenuId.value = '__add'
}
function onRecordCreated(event: Event): void { onDatabaseChanged(event) }
function onOnlineChange(): void {
  online.value = navigator.onLine
  if (!online.value) { propertyMenuId.value = ''; cellPopover.value = null }
  else void loadTable()
}
function onEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (cellEdit.value) cancelCellEdit()
  const hadPopover = Boolean(cellPopover.value || propertyMenuId.value)
  if (cellPopover.value) cellPopover.value = null
  if (propertyMenuId.value) propertyMenuId.value = ''
  if (hadPopover) void nextTick(() => returnFocusTo.value?.focus())
  if (addTitleMode.value) cancelNewRecord()
}
function onOutsidePointer(event: PointerEvent): void {
  if ((event.target as HTMLElement | null)?.closest('.eotion-database') || (event.target as HTMLElement | null)?.closest('.eotion-database-popover')) return
  propertyMenuId.value = ''
  cellPopover.value = null
}
function closePopoversForViewportChange(): void {
  const anchor = returnFocusTo.value
  if (!anchor?.isConnected) { propertyMenuId.value = ''; cellPopover.value = null; return }
  const style = anchoredStyle(anchor)
  if (propertyMenuId.value) propertyMenuStyle.value = style
  if (cellPopover.value) cellPopoverStyle.value = style
}

onMounted(() => {
  window.addEventListener(DATABASE_RECORD_CREATED_EVENT, onRecordCreated)
  window.addEventListener(DATABASE_UPDATED_EVENT, onDatabaseChanged)
  window.addEventListener('online', onOnlineChange)
  window.addEventListener('offline', onOnlineChange)
  window.addEventListener('keydown', onEscape)
  window.addEventListener('pointerdown', onOutsidePointer)
  window.addEventListener('scroll', closePopoversForViewportChange, true)
  window.addEventListener('resize', closePopoversForViewportChange)
  void loadTable()
})
onBeforeUnmount(() => {
  requestEpoch += 1
  window.removeEventListener(DATABASE_RECORD_CREATED_EVENT, onRecordCreated)
  window.removeEventListener(DATABASE_UPDATED_EVENT, onDatabaseChanged)
  window.removeEventListener('online', onOnlineChange)
  window.removeEventListener('offline', onOnlineChange)
  window.removeEventListener('keydown', onEscape)
  window.removeEventListener('pointerdown', onOutsidePointer)
  window.removeEventListener('scroll', closePopoversForViewportChange, true)
  window.removeEventListener('resize', closePopoversForViewportChange)
})
watch([workspaceId, databaseId, viewId, () => auth.user?.id], () => {
  requestEpoch += 1
  cellEdit.value = null
  cellPopover.value = null
  propertyMenuId.value = ''
  addTitleMode.value = false
  addTitleDraft.value = ''
  mutationError.value = ''
  refreshError.value = ''
  staleReadonly.value = false
  loading.value = false
  loadingMore.value = false
  returnFocusTo.value = null
  void loadTable()
})
</script>

<template>
  <NodeViewWrapper class="eotion-database" :data-cell-popover="cellPopover?.propertyId ?? ''" contenteditable="false" aria-label="数据库视图">
    <header class="eotion-database-header">
      <span class="eotion-database-mark" aria-hidden="true" @click.stop="selectBlock">▦</span>
      <span class="eotion-database-copy" @click.stop="selectBlock"><strong>{{ title }}</strong><small>{{ viewName }}</small></span>
      <form v-if="addTitleMode" class="eotion-database-new" @submit.prevent="createRecord">
        <input v-model="addTitleDraft" autofocus maxlength="200" aria-label="记录标题" placeholder="记录标题" :disabled="creating || !writable" @keydown.enter="onNewRecordEnter" @keydown.esc.prevent="cancelNewRecord">
        <button type="submit" :disabled="creating || !writable || !addTitleDraft.trim()">{{ creating ? '正在新建…' : '创建' }}</button>
        <button type="button" :disabled="creating" @click="cancelNewRecord">取消</button>
      </form>
      <button v-else class="eotion-database-add" type="button" :disabled="creating || creationUncertain || !writable" @pointerdown.stop @mousedown.stop @click.stop="addTitleMode = true; addTitleDraft = ''">+ 新建记录</button>
      <div class="eotion-database-properties-menu">
        <button type="button" aria-label="添加属性" :disabled="!writable" @click.stop="togglePropertyCreator($event)">属性</button>
        <Teleport to="body"><div v-if="propertyMenuId === '__add'" class="eotion-database-popover eotion-database-teleport" :style="propertyMenuStyle" role="group" aria-label="添加属性类型">
          <button v-for="item in addableProperties" :key="item.type" type="button" @click.stop="addProperty(item.type)">{{ item.label }}</button>
        </div></Teleport>
      </div>
    </header>
    <p v-if="!online && !loading && !loadError" class="eotion-database-offline" role="status">离线 · 数据库只读，已加载内容仍可查看</p>
    <p v-if="refreshError" class="eotion-database-error" role="alert"><span>{{ refreshError }}</span><button type="button" @click.stop="void refreshLoadedWindow()">重试刷新</button></p>
    <p v-if="loading" class="eotion-database-state" role="status">正在加载数据库…</p>
    <div v-else-if="loadError" class="eotion-database-error" role="alert"><span>{{ loadError }}</span><button type="button" @click.stop="loadTable()">重试加载</button></div>
    <template v-else>
      <p v-if="mutationError || creationUncertain" class="eotion-database-error" role="alert">{{ mutationError || '上次记录创建结果尚未确认，请联网并刷新页面后确认。' }}</p>
      <div v-if="properties.length" class="eotion-database-scroll" data-testid="database-table-scroll" role="region" aria-label="数据库记录" tabindex="0" @pointerdown.stop>
        <table class="eotion-database-table">
          <thead><tr>
            <th v-for="property in properties" :key="property.id" scope="col">
              <button class="eotion-database-property-trigger" type="button" :disabled="!writable" @click.stop="openPropertyMenu(property, $event)">{{ property.name }}⌄</button>
              <Teleport to="body"><div v-if="propertyMenuId === property.id" class="eotion-database-popover eotion-database-teleport eotion-database-property-menu" :style="propertyMenuStyle" @click.stop>
                <form @submit.prevent="savePropertyName(property)"><input v-model="propertyNameDraft" maxlength="100" aria-label="属性名称"><button type="submit">重命名</button></form>
                <template v-if="property.type === 'select'">
                  <div v-for="option in property.options ?? []" :key="option.id" class="eotion-database-option-edit">
                    <input v-if="optionEditId === option.id" v-model="optionEditName" :aria-label="`重命名选项 ${option.name}`" maxlength="100">
                    <span v-else>{{ option.name }}</span>
                    <button v-if="optionEditId !== option.id" type="button" @click="optionEditId = option.id; optionEditName = option.name">重命名</button>
                    <button v-if="optionEditId === option.id" type="button" @click="saveSelectOptions(property, (property.options ?? []).map(item => item.id === option.id ? { ...item, name: optionEditName.trim() || item.name } : item))">保存</button>
                    <button type="button" @click="saveSelectOptions(property, (property.options ?? []).filter(item => item.id !== option.id))">删除</button>
                  </div>
                  <form @submit.prevent="addSelectOption(property)"><input v-model="optionNameDraft" aria-label="新选项名称" maxlength="100" placeholder="新选项"><button type="submit">添加</button></form>
                </template>
                <button v-if="property.type !== 'title'" type="button" class="danger" @click="deleteProperty(property)">删除属性</button>
              </div></Teleport>
            </th>
          </tr></thead>
          <tbody>
            <tr v-for="record in records" :key="record.id">
              <td v-for="property in properties" :key="property.id">
                <template v-if="property.type === 'title' && !isEditingCell(record, property)"><button class="eotion-database-cell-button" type="button" :disabled="!writable" :aria-label="`编辑${property.name}：${formatValue(getCellValue(record, property.id), property)}`" @click.stop="startCellEdit(record, property)">{{ formatValue(getCellValue(record, property.id), property) }}</button><RouterLink class="eotion-database-title" :aria-label="`打开记录页面：${formatValue(getCellValue(record, property.id), property)}`" :to="{ name: 'product-page', params: { workspaceId, pageId: record.pageId } }" @pointerdown.stop @mousedown.stop @click.capture="openRecordPage($event, record.pageId)"></RouterLink></template>
                <input v-else-if="isEditingCell(record, property)" v-model="cellDraft" :ref="setCellInputRef" class="eotion-database-cell-input" :type="property.type === 'date' ? 'date' : 'text'" :inputmode="property.type === 'number' ? 'decimal' : undefined" :aria-label="`${property.name} 值`" :disabled="savingCell || !writable" @keydown.enter="onCellEnter($event, record, property)" @keydown.esc.prevent="cancelCellEdit" @blur="saveCell(record, property)">
                <button v-else-if="property.type === 'checkbox'" class="eotion-database-cell-button" type="button" :disabled="!writable" :aria-pressed="getCellValue(record, property.id) === true" @click.stop="toggleCheckbox(record, property)">{{ formatValue(getCellValue(record, property.id), property) }}</button>
                <button v-else-if="property.type === 'select'" class="eotion-database-cell-button" type="button" :disabled="!writable" @click.stop="toggleCellPopover(record, property, $event)">{{ formatValue(getCellValue(record, property.id), property) }}</button>
                <button v-else-if="property.type === 'title'" class="eotion-database-cell-button" type="button" :disabled="!writable" @click.stop="startCellEdit(record, property)">{{ formatValue(getCellValue(record, property.id), property) }}</button>
                <button v-else class="eotion-database-cell-button" type="button" :disabled="!writable" @click.stop="startCellEdit(record, property)">{{ formatValue(getCellValue(record, property.id), property) }}</button>
                <Teleport to="body"><div v-if="isOpenSelect(record, property)" class="eotion-database-popover eotion-database-teleport eotion-database-cell-menu" :style="cellPopoverStyle">
                  <button type="button" @click.stop="chooseSelect(record, property, null)">清除</button>
                  <button v-for="option in property.options ?? []" :key="option.id" type="button" @click.stop="chooseSelect(record, property, option.id)">{{ option.name }}</button>
                </div></Teleport>
                <button v-if="isEditingCell(record, property)" class="eotion-database-cell-save" type="button" :disabled="savingCell || !writable" @pointerdown.prevent @click.stop="saveCell(record, property)">保存</button>
                <button v-if="isEditingCell(record, property) && property.type === 'date'" class="eotion-database-cell-save" type="button" :disabled="savingCell || !writable" @pointerdown.prevent @click.stop="saveCell(record, property, true)">清除</button>
                <small v-if="isEditingCell(record, property) && cellDraftError" class="eotion-database-cell-error" role="alert">{{ cellDraftError }} <button type="button" @click.stop="saveCell(record, property)">重试</button></small>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="records.length === 0" class="eotion-database-state">暂无记录</p>
      <p v-else-if="!properties.length" class="eotion-database-state">这个数据库还没有可显示的属性。</p>
      <div v-if="moreError" class="eotion-database-error" role="alert"><span>{{ moreError }}</span><button type="button" :disabled="loadingMore" @click.stop="loadTable(true)">重试加载更多</button></div>
      <button v-if="nextCursor" class="eotion-database-more" type="button" :disabled="loadingMore || loading || staleReadonly || !online" @click.stop="loadTable(true)">{{ loadingMore ? '正在加载…' : '加载更多' }}</button>
    </template>
  </NodeViewWrapper>
</template>

<style scoped>
.eotion-database { display:block; min-width:0; margin:12px 0; overflow:hidden; border:1px solid var(--border-editor); border-radius:9px; background:var(--surface-raised); color:var(--editor-text); }
.eotion-database-header { display:flex; min-height:58px; align-items:center; gap:12px; padding:10px 14px; }
.eotion-database-mark { display:grid; width:34px; height:34px; flex:0 0 auto; place-items:center; border-radius:7px; background:var(--surface-editor-hover); color:var(--editor-muted); font-size:20px; }
.eotion-database-copy { display:grid; min-width:0; flex:1; gap:3px; }.eotion-database-copy strong { overflow:hidden; font-size:13px; font-weight:600; text-overflow:ellipsis; white-space:nowrap; }.eotion-database-copy small { color:var(--editor-muted); font-size:12px; }
.eotion-database-add,.eotion-database-more,.eotion-database-error button,.eotion-database-new button,.eotion-database-properties-menu>button { min-height:32px; border:1px solid var(--border-editor); border-radius:6px; padding:5px 9px; background:var(--surface-editor-hover); color:inherit; font:inherit; cursor:pointer; }
.eotion-database-add:disabled,.eotion-database-more:disabled,.eotion-database-error button:disabled,button:disabled { opacity:.6; cursor:default; }
.eotion-database-new { display:flex; flex-wrap:wrap; gap:5px; }.eotion-database-new input { width:160px; min-height:32px; }.eotion-database-properties-menu { position:relative; }
.eotion-database-scroll { max-width:100%; overflow-x:auto; overscroll-behavior-inline:contain; border-top:1px solid var(--border-editor); }.eotion-database-table { width:max-content; min-width:100%; border-collapse:collapse; font-size:13px; }.eotion-database-table th,.eotion-database-table td { position:relative; width:180px; min-width:180px; max-width:260px; overflow-wrap:anywhere; border-right:1px solid var(--border-editor); border-bottom:1px solid var(--border-editor); padding:8px 11px; text-align:left; vertical-align:top; }.eotion-database-table th { color:var(--editor-muted); font-size:12px; font-weight:600; }.eotion-database-property-trigger,.eotion-database-cell-button { min-height:28px; border:0; padding:2px 4px; background:transparent; color:inherit; text-align:left; font:inherit; cursor:pointer; }.eotion-database-title { color:inherit; text-decoration:underline; text-decoration-color:var(--editor-muted); text-underline-offset:2px; }.eotion-database-cell-input { box-sizing:border-box; width:100%; min-height:32px; border:1px solid var(--border-editor); border-radius:4px; padding:4px 6px; color:inherit; font:inherit; }.eotion-database-cell-error { display:block; color:var(--danger); }
.eotion-database-popover { z-index:10000; display:grid; min-width:170px; max-width:min(280px,80vw); gap:5px; border:1px solid var(--border-editor); border-radius:8px; padding:8px; background:var(--surface-raised); box-shadow:var(--e-shadow-popover,0 8px 24px #0002); color:var(--editor-text); }.eotion-database-popover button { min-height:32px; border:0; border-radius:4px; padding:5px 8px; background:transparent; color:inherit; text-align:left; font:inherit; cursor:pointer; }.eotion-database-popover button:hover { background:var(--surface-editor-hover); }.eotion-database-popover form,.eotion-database-option-edit { display:flex; align-items:center; gap:4px; }.eotion-database-popover input { min-width:0; width:100%; min-height:32px; }.eotion-database-popover .danger { color:var(--danger); }.eotion-database-title-edit,.eotion-database-cell-save { margin-left:6px; min-height:28px; border:0; background:transparent; color:var(--editor-muted); font:inherit; cursor:pointer; }
.eotion-database-title-edit::before { content:'✎'; }
.eotion-database-title { text-decoration:none; }.eotion-database-title::before { content:'↗'; display:inline-block; margin-left:4px; color:var(--editor-muted); }
.eotion-database-cell-input,.eotion-database-popover input { background:var(--surface-raised); color:var(--editor-text); }
.eotion-database-popover button { flex-shrink:0; white-space:nowrap; }
.eotion-database-popover form input { flex:1; width:auto; }
.eotion-database-option-edit span { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.eotion-database-table tr:last-child td { border-bottom:0; }.eotion-database-state,.eotion-database-error { margin:0; padding:12px 14px; color:var(--editor-muted); font-size:13px; }.eotion-database-offline { margin:0; border-top:1px solid var(--border-editor); padding:7px 14px; color:var(--editor-muted); font-size:12px; }.eotion-database-error { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; color:var(--danger); }.eotion-database-more { margin:10px 14px; }
@media (max-width:767px) { .eotion-database-header { gap:8px; padding:9px 10px; flex-wrap:wrap; }.eotion-database-add { min-height:36px; padding-inline:7px; }.eotion-database-table th,.eotion-database-table td { width:160px; min-width:160px; }.eotion-database-cell-button,.eotion-database-property-trigger,.eotion-database-popover button { min-height:44px; }.eotion-database-cell-input { min-height:44px; } }
</style>
