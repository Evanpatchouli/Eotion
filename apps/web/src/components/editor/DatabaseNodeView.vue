<script setup lang="ts">
import type { DatabasePropertyResponse, DatabaseRecordCellUpdateRequest, DatabaseTableResponse, DatabaseViewCreateRequest, DatabaseViewResponse, DatabaseResponse } from '@eotion/contracts'
import { DEFAULT_DATABASE_VIEW_CONFIG, isValidFormulaExpression, validateDatabasePropertyDependencies, validateDatabaseViewConfig, type DatabaseFilter, type DatabaseFilterOperator, type DatabaseViewConfig, type DatabasePropertyType, type DatabasePropertyConfig, type DatabaseFormulaResultType, type FormulaExpression } from '@eotion/domain/database'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type ComponentPublicInstance } from 'vue'
import { createLocalId } from '@eotion/storage'
import { RouterLink, useRouter } from 'vue-router'

import {
  createProductDatabaseProperty, createProductDatabaseRecord, deleteProductDatabaseProperty,
  createProductDatabaseView, deleteProductDatabaseView, listProductDatabaseViews,
  clearProductDatabaseViewDeleteState, getProductDatabaseViewDeleteState, setProductDatabaseViewDeleteState,
  isProductDatabaseRecordCreationUncertain, loadProductDatabaseTable, prepareProductDatabaseRecordPage,
  updateProductDatabaseProperty, updateProductDatabaseRecordCell, updateProductDatabaseView,
  listProductDatabases, listProductRelationCandidates, resolveProductRelationTitles,
} from '../../services/productDatabases'
import { ApiError, errorMessage } from '../../services/productApi'
import { useAuthStore } from '../../stores/auth'
import { useProductSyncStore } from '../../stores/productSync'
import { DATABASE_RECORD_CREATED_EVENT, DATABASE_UPDATED_EVENT, notifyDatabaseUpdated, type DatabaseRecordCreatedDetail, type DatabaseUpdatedDetail } from '../../editor/databaseEvents'
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'

const props = defineProps(nodeViewProps)
const auth = useAuthStore()
type TableRecord = DatabaseTableResponse['records'][number]
const router = useRouter()
const workspaceId = computed(() => String(props.extension.options.workspaceId ?? ''))
const databaseId = computed(() => String(props.node.attrs.databaseId ?? ''))
const viewId = computed(() => String(props.node.attrs.viewId ?? ''))
const blockId = computed(() => String(props.node.attrs.blockId ?? ''))
const scopedViewDeleteState = computed(() => {
  const state = getProductDatabaseViewDeleteState(blockId.value)
  return state && state.userId === (auth.user?.id ?? '') && state.workspaceId === workspaceId.value && state.databaseId === databaseId.value ? state : undefined
})
const title = ref('数据库')
const viewName = ref('表格')
const viewVersion = ref(1)
const viewConfig = ref<DatabaseViewConfig>({ ...DEFAULT_DATABASE_VIEW_CONFIG })
const views = ref<DatabaseViewResponse[]>([])
const viewMenuOpen = ref(false)
const viewMenuStyle = ref<Record<string, string>>({})
const viewControlsOpen = ref<'filters' | 'sorts' | 'columns' | ''>('')
const controlStyle = ref<Record<string, string>>({})
const viewSubmitting = ref(false)
const viewBusy = computed(() => !props.editor.isEditable || !online.value || staleReadonly.value || loading.value || loadingMore.value || savingCell.value || creating.value || viewSubmitting.value || scopedViewDeleteState.value?.status === 'pending')
const visibleViewCount = computed(() => viewConfig.value.filters.length)
const sortViewCount = computed(() => viewConfig.value.sorts.length)
const displayProperties = computed(() => {
  const all = properties.value
  const orderedIds = viewConfig.value.propertyOrder ?? []
  const ordered = [...orderedIds.map(id => all.find(property => property.id === id)).filter((property): property is DatabasePropertyResponse => Boolean(property)), ...all.filter(property => !orderedIds.includes(property.id))]
  const visible = viewConfig.value.visibleProperties
  return visible === null ? ordered : ordered.filter(property => property.type === 'title' || visible.includes(property.id))
})
const filterDrafts = ref<DatabaseFilter[]>([])
const sortDrafts = ref<DatabaseViewConfig['sorts']>([])
const columnDraft = ref<{ visible: string[]; order: string[] }>({ visible: [], order: [] })
const renameViewDraft = ref('')
const viewError = ref('')
const visibleViewError = computed(() => viewError.value || (scopedViewDeleteState.value?.status === 'failed' && scopedViewDeleteState.value.replacementViewId === viewId.value ? scopedViewDeleteState.value.error : ''))
const pendingCreateView = ref<DatabaseViewCreateRequest | null>(null)
const databaseVersion = ref(1)
const addableProperties = [
  { type: 'text', label: '文本' }, { type: 'number', label: '数字' }, { type: 'checkbox', label: '复选框' },
  { type: 'select', label: '选择' }, { type: 'date', label: '日期' },
  { type: 'relation', label: '关联' }, { type: 'rollup', label: '汇总' }, { type: 'formula', label: '公式' },
] as const
type AdvancedType = 'relation' | 'rollup' | 'formula'
type RelationOption = { recordId: string; pageId: string; title: string }
const propertyConfigType = ref<AdvancedType | ''>('')
const propertyConfigEditId = ref('')
const propertyConfigName = ref('')
const propertyConfigError = ref('')
const targetDatabases = ref<DatabaseResponse[]>([])
const targetDatabaseCursor = ref<string | null>(null)
const targetDatabaseId = ref('')
const targetProperties = ref<DatabasePropertyResponse[]>([])
const targetPropertySchemas = new Map<string, DatabasePropertyResponse[]>()
const targetLoading = ref(false)
const targetError = ref('')
const relationPropertyId = ref('')
const targetPropertyId = ref('')
const rollupAggregation = ref<'count' | 'count_values' | 'sum' | 'avg' | 'min' | 'max'>('count')
const formulaDraft = ref('')
const formulaResultType = ref<DatabaseFormulaResultType>('string')
const formulaProperties = computed(() => properties.value.filter(property => property.type !== 'relation'))
const relationProperties = computed(() => properties.value.filter(property => property.type === 'relation'))
const rollupTargetDatabaseId = computed(() => (relationProperties.value.find(property => property.id === relationPropertyId.value)?.config as { targetDatabaseId?: string } | undefined)?.targetDatabaseId ?? '')
const rollupTargets = computed(() => rollupTargetDatabaseId.value === databaseId.value ? properties.value : targetProperties.value)
const rollupBaseTargets = computed(() => rollupTargets.value.filter(property => !['relation', 'rollup', 'formula'].includes(property.type)))
const validRollupAggregations = computed(() => {
  const target = rollupBaseTargets.value.find(property => property.id === targetPropertyId.value)
  return target?.type === 'number' ? ['count', 'count_values', 'sum', 'avg', 'min', 'max'] : ['count', 'count_values']
})
const relationPicker = ref<{ recordId: string; propertyId: string } | null>(null)
const relationSearch = ref('')
const relationOptions = ref<RelationOption[]>([])
const relationNextCursor = ref<string | null>(null)
const relationLoading = ref(false)
const relationError = ref('')
const relationTitleError = ref('')
const relationTitles = ref(new Map<string, RelationOption>())
let relationRequestEpoch = 0
let relationTitleEpoch = 0
let selectedTitleEpoch = 0
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
const writable = computed(() => online.value && !staleReadonly.value && !loading.value && !savingCell.value && !viewSubmitting.value)
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
  if (property.type === 'relation') return Array.isArray(value) ? `${value.slice(0, 3).map(id => getRelationTitle(property, id)?.title ?? '关联记录').join('、')}${value.length > 3 ? ` +${value.length - 3}` : ''}` || '—' : '—'
  if (property.type === 'checkbox') return value === true ? '已完成' : '未完成'
  if (property.type === 'select') return property.options?.find(option => option.id === value)?.name ?? '—'
  return String(value)
}
function relationTitleKey(property: DatabasePropertyResponse, recordId: string): string {
  return `${(property.config as { targetDatabaseId: string }).targetDatabaseId}\u0000${recordId}`
}
function getRelationTitle(property: DatabasePropertyResponse, recordId: string): RelationOption | undefined {
  return relationTitles.value.get(relationTitleKey(property, recordId))
}
function getCellValue(record: TableRecord, propertyId: string): unknown {
  return Object.hasOwn(record.properties, propertyId) ? record.properties[propertyId] : undefined
}

async function resolveVisibleRelationTitles(): Promise<void> {
  const epoch = ++relationTitleEpoch
  if (!online.value) return
  const grouped = new Map<string, string[]>()
  let budget = 500
  for (const property of displayProperties.value.filter(item => item.type === 'relation')) {
    const targetId = (property.config as { targetDatabaseId: string }).targetDatabaseId
    for (const record of records.value) for (const id of Array.isArray(getCellValue(record, property.id)) ? (getCellValue(record, property.id) as string[]).slice(0, 3) : []) {
      const ids = grouped.get(targetId) ?? []
      if (!ids.includes(id) && budget > 0) { ids.push(id); grouped.set(targetId, ids); budget -= 1 }
    }
  }
  relationTitleError.value = ''
  const batches = [...grouped].flatMap(([targetId, ids]) => Array.from({ length: Math.ceil(ids.length / 50) }, (_, index) => ({ targetId, ids: ids.slice(index * 50, index * 50 + 50) }))).slice(0, 10)
  for (let index = 0; index < batches.length; index += 3) {
    await Promise.all(batches.slice(index, index + 3).map(async ({ targetId, ids }) => {
      try {
        const result = await resolveProductRelationTitles(workspaceId.value, targetId, ids)
        if (epoch !== relationTitleEpoch) return
        for (const item of result.items) relationTitles.value.set(`${targetId}\u0000${item.recordId}`, item)
      } catch (cause) { if (epoch === relationTitleEpoch) relationTitleError.value = errorMessage(cause, '关联标题加载失败，请重试。') }
    }))
  }
}
async function resolveSelectedRelationTitles(record: TableRecord, property: DatabasePropertyResponse): Promise<void> {
  const ids = getCellValue(record, property.id)
  if (!online.value || !Array.isArray(ids) || !ids.length) return
  const epoch = ++selectedTitleEpoch
  const targetId = (property.config as { targetDatabaseId: string }).targetDatabaseId
  const identity = [auth.user?.id, workspaceId.value, databaseId.value, viewId.value, record.id, property.id].join('\u0000')
  try {
    const result = await resolveProductRelationTitles(workspaceId.value, targetId, ids)
    if (epoch !== selectedTitleEpoch || identity !== [auth.user?.id, workspaceId.value, databaseId.value, viewId.value, relationPicker.value?.recordId, relationPicker.value?.propertyId].join('\u0000')) return
    for (const item of result.items) relationTitles.value.set(`${targetId}\u0000${item.recordId}`, item)
    relationTitleError.value = ''
  } catch (cause) { if (epoch === selectedTitleEpoch && identity === [auth.user?.id, workspaceId.value, databaseId.value, viewId.value, relationPicker.value?.recordId, relationPicker.value?.propertyId].join('\u0000')) relationTitleError.value = errorMessage(cause, '关联标题加载失败，请重试。') }
}
function closeRelationPicker(): void { relationPicker.value = null; selectedTitleEpoch += 1 }

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
    viewVersion.value = result.view.version
    viewConfig.value = result.view.config ?? { ...DEFAULT_DATABASE_VIEW_CONFIG }
    properties.value = result.properties
    if (append) records.value = [...records.value, ...result.records.filter(record => !records.value.some(existing => existing.id === record.id))]
    else records.value = result.records
    nextCursor.value = result.nextCursor
    void resolveVisibleRelationTitles()
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
  let nextViewVersion = viewVersion.value
  let nextViewConfig = viewConfig.value
  let nextProperties = properties.value
  try {
    do {
      const result = await loadProductDatabaseTable(workspaceId.value, databaseId.value, viewId.value, { limit: 25, ...(cursor ? { cursor } : {}) })
      if (epoch !== requestEpoch || identity !== [workspaceId.value, databaseId.value, viewId.value, auth.user?.id].join('\u0000')) return
      nextTitle = result.database.name
      nextDatabaseVersion = result.database.version
      nextViewName = result.view.name
      nextViewVersion = result.view.version
      nextViewConfig = result.view.config ?? { ...DEFAULT_DATABASE_VIEW_CONFIG }
      nextProperties = result.properties
      for (const record of result.records) if (!refreshed.some(existing => existing.id === record.id)) refreshed.push(record)
      cursor = result.nextCursor ?? undefined
    } while (cursor && refreshed.length < desiredCount)
    if (epoch !== requestEpoch || identity !== [workspaceId.value, databaseId.value, viewId.value, auth.user?.id].join('\u0000')) return
    records.value = refreshed
    title.value = nextTitle
    databaseVersion.value = nextDatabaseVersion
    viewName.value = nextViewName
    viewVersion.value = nextViewVersion
    viewConfig.value = nextViewConfig
    properties.value = nextProperties
    nextCursor.value = cursor ?? null
    void resolveVisibleRelationTitles()
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

function anchoredStyle(anchor: HTMLElement, preferredWidth = 280): Record<string, string> {
  const rect = anchor.getBoundingClientRect()
  const width = Math.min(preferredWidth, window.innerWidth - 16)
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
  const top = rect.bottom + 4 + 220 > window.innerHeight ? Math.max(8, rect.top - 224) : rect.bottom + 4
  return { position: 'fixed', left: `${left}px`, top: `${top}px`, width: `${width}px`, maxHeight: `${Math.max(120, window.innerHeight - top - 8)}px`, overflowY: 'auto' }
}

function filterOperators(property: DatabasePropertyResponse): DatabaseFilterOperator[] {
  if (property.type === 'relation') return ['is_empty', 'is_not_empty']
  if (property.type === 'number') return ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_not_empty']
  if (property.type === 'checkbox') return ['checked', 'unchecked']
  if (property.type === 'date') return ['is', 'before', 'after', 'is_empty', 'is_not_empty']
  if (property.type === 'select') return property.options?.length ? ['is', 'is_not', 'is_empty', 'is_not_empty'] : ['is_empty', 'is_not_empty']
  return ['is', 'is_not', 'contains', 'does_not_contain', 'is_empty', 'is_not_empty']
}
function operatorLabel(operator: DatabaseFilterOperator): string {
  return ({ is: '是', is_not: '不是', contains: '包含', does_not_contain: '不包含', is_empty: '为空', is_not_empty: '不为空', eq: '=', ne: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤', checked: '已勾选', unchecked: '未勾选', before: '早于', after: '晚于' })[operator]
}
function needsFilterValue(operator: DatabaseFilterOperator): boolean { return operator !== 'is_empty' && operator !== 'is_not_empty' && operator !== 'checked' && operator !== 'unchecked' }
function openViewMenu(event: MouseEvent): void {
  if (viewBusy.value) return
  if (viewMenuOpen.value) { viewMenuOpen.value = false; return }
  returnFocusTo.value = event.currentTarget as HTMLElement
  viewMenuStyle.value = anchoredStyle(event.currentTarget as HTMLElement)
  viewMenuOpen.value = true
  viewError.value = ''
  void refreshViewList()
}
async function refreshViewList(): Promise<void> {
  try { views.value = await listProductDatabaseViews(workspaceId.value, databaseId.value) }
  catch (cause) { viewError.value = errorMessage(cause, '无法加载视图列表，请重试。') }
}
function openViewControls(kind: 'filters' | 'sorts' | 'columns', event: MouseEvent): void {
  if (viewBusy.value) return
  if (viewControlsOpen.value === kind) { viewControlsOpen.value = ''; return }
  returnFocusTo.value = event.currentTarget as HTMLElement
  controlStyle.value = anchoredStyle(event.currentTarget as HTMLElement, window.innerWidth < 768 ? 374 : 320)
  if (kind === 'filters') filterDrafts.value = viewConfig.value.filters.map(filter => ({ ...filter }))
  if (kind === 'sorts') sortDrafts.value = viewConfig.value.sorts.map(sort => ({ ...sort }))
  if (kind === 'columns') columnDraft.value = {
    visible: viewConfig.value.visibleProperties === null ? properties.value.map(property => property.id) : [...viewConfig.value.visibleProperties],
    order: viewConfig.value.propertyOrder === null ? properties.value.map(property => property.id) : [...viewConfig.value.propertyOrder, ...properties.value.map(property => property.id).filter(id => !viewConfig.value.propertyOrder!.includes(id))],
  }
  viewControlsOpen.value = kind
}
function switchView(targetId: string, force = false): void {
  if ((!force && viewBusy.value) || (force && (!props.editor.isEditable || !online.value || savingCell.value)) || targetId === viewId.value) { viewMenuOpen.value = false; return }
  if (!force && blockId.value) clearProductDatabaseViewDeleteState(blockId.value)
  viewError.value = ''
  records.value = []
  nextCursor.value = null
  loadError.value = ''
  refreshError.value = ''
  properties.value = []
  viewMenuOpen.value = false
  viewControlsOpen.value = ''
  props.updateAttributes({ viewId: targetId })
}
async function createView(): Promise<void> {
  if (viewBusy.value) return
  const workspace = workspaceId.value
  const database = databaseId.value
  const userId = auth.user?.id
  if (!userId) return
  pendingCreateView.value ??= { id: createLocalId(), name: `表格 ${views.value.length + 1}`, type: 'table', config: { ...DEFAULT_DATABASE_VIEW_CONFIG }, expectedDatabaseVersion: databaseVersion.value }
  viewSubmitting.value = true
  viewError.value = ''
  try {
    let created = views.value.find(item => item.id === pendingCreateView.value?.id)
    if (!created) {
      try {
        const result = await createProductDatabaseView(workspace, database, { ...pendingCreateView.value, expectedDatabaseVersion: databaseVersion.value })
        if (auth.user?.id !== userId || workspaceId.value !== workspace || databaseId.value !== database) throw new Error('登录状态或工作区已切换，请刷新后重试。')
        databaseVersion.value = result.database.version
        created = result.view
      } catch (cause) {
        const uncertain = !(cause instanceof ApiError && cause.statusCode >= 400 && cause.statusCode < 500)
        if (!uncertain) throw cause
        const confirmed = await listProductDatabaseViews(workspace, database)
        if (auth.user?.id !== userId || workspaceId.value !== workspace || databaseId.value !== database) throw new Error('登录状态或工作区已切换，请刷新后重试。')
        created = confirmed.find(item => item.id === pendingCreateView.value?.id)
        if (!created) throw new Error('视图创建结果暂未确认。请刷新视图列表后重试。')
        views.value = confirmed
        notifyDatabaseUpdated({ workspaceId: workspace, databaseId: database })
      }
    }
    pendingCreateView.value = null
    if (!views.value.some(item => item.id === created!.id)) views.value = [...views.value, created!]
    viewSubmitting.value = false
    switchView(created.id, true)
  } catch (cause) {
    await handleViewMutationError(cause, '视图未创建，请重试。')
  } finally { viewSubmitting.value = false }
}
async function handleViewMutationError(cause: unknown, fallback: string): Promise<void> {
  if (cause instanceof ApiError && cause.statusCode === 409) {
    await refreshLoadedWindow()
    await refreshViewList()
    viewError.value = `数据库或视图已变化，已刷新版本。${errorMessage(cause, '请重试。')}`
  } else viewError.value = errorMessage(cause, fallback)
}
async function renameView(view: DatabaseViewResponse): Promise<void> {
  const name = renameViewDraft.value.trim()
  if (!name || name.length > 100 || viewBusy.value) return
  viewSubmitting.value = true
  viewError.value = ''
  try {
    const result = await updateProductDatabaseView(workspaceId.value, databaseId.value, view.id, { name, expectedDatabaseVersion: databaseVersion.value, expectedViewVersion: view.version })
    databaseVersion.value = result.database.version
    viewVersion.value = result.view.version
    viewName.value = result.view.name
    views.value = views.value.map(item => item.id === view.id ? result.view : item)
    renameViewDraft.value = ''
  } catch (cause) { await handleViewMutationError(cause, '视图名称未更新，请重试。') }
  finally { viewSubmitting.value = false }
}
async function deleteView(view: DatabaseViewResponse): Promise<void> {
  if (viewBusy.value || views.value.length < 2) return
  const workspace = workspaceId.value
  const database = databaseId.value
  const userId = auth.user?.id
  const block = blockId.value
  const fromViewId = viewId.value
  if (!userId || !block) return
  const deletingCurrent = view.id === fromViewId
  const replacement = deletingCurrent ? views.value.find(item => item.id !== view.id) : undefined
  if (deletingCurrent && !replacement) return
  viewSubmitting.value = true
  viewError.value = ''
  if (deletingCurrent) setProductDatabaseViewDeleteState({ userId, workspaceId: workspace, databaseId: database, blockId: block, fromViewId, replacementViewId: replacement!.id, status: 'pending', error: '' })
  try {
    if (deletingCurrent) {
      switchView(replacement!.id, true)
      const sync = useProductSyncStore()
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await sync.runSync()
        if (sync.state === 'synced' && sync.pending === 0) break
      }
      if (auth.user?.id !== userId || workspaceId.value !== workspace || databaseId.value !== database || blockId.value !== block || viewId.value !== replacement!.id) throw new Error('登录状态或工作区已切换，请刷新后重试。')
      if (sync.state !== 'synced' || sync.pending > 0) throw new Error('视图引用尚未同步，暂不能删除。')
    }
    if (auth.user?.id !== userId || workspaceId.value !== workspace || databaseId.value !== database || blockId.value !== block) throw new Error('登录状态或工作区已切换，请刷新后重试。')
    const result = await deleteProductDatabaseView(workspace, database, view.id, { expectedDatabaseVersion: databaseVersion.value, expectedViewVersion: view.version })
    if (auth.user?.id !== userId || workspaceId.value !== workspace || databaseId.value !== database || blockId.value !== block || (deletingCurrent && viewId.value !== replacement!.id)) throw new Error('登录状态或工作区已切换，请刷新后重试。')
    databaseVersion.value = result.database.version
    views.value = views.value.filter(item => item.id !== view.id)
    if (deletingCurrent) clearProductDatabaseViewDeleteState(block)
  } catch (cause) {
    const sameScope = auth.user?.id === userId && workspaceId.value === workspace && databaseId.value === database && blockId.value === block
    const unknownOutcome = !(cause instanceof ApiError && cause.statusCode >= 400 && cause.statusCode < 500)
    if (sameScope && unknownOutcome) {
      try {
        const latestViews = await listProductDatabaseViews(workspace, database)
        if (auth.user?.id !== userId || workspaceId.value !== workspace || databaseId.value !== database) throw new Error('登录状态或工作区已切换，请刷新后重试。')
        views.value = latestViews
        if (!latestViews.some(item => item.id === view.id)) {
          if (deletingCurrent) clearProductDatabaseViewDeleteState(block)
          notifyDatabaseUpdated({ workspaceId: workspace, databaseId: database })
          await refreshLoadedWindow()
          return
        }
      } catch (readCause) {
        const message = `删除结果暂未确认。${errorMessage(readCause, '请刷新视图列表后重试。')}`
        viewError.value = message
        if (deletingCurrent && sameScope) setProductDatabaseViewDeleteState({ userId, workspaceId: workspace, databaseId: database, blockId: block, fromViewId, replacementViewId: replacement!.id, status: 'failed', error: message })
        return
      }
    }
    if (cause instanceof ApiError && cause.statusCode === 409) {
      const message = `${errorMessage(cause, '数据库或视图已变化。')} 若该视图仍被其它数据库块引用，请先切换这些引用并同步后重试。`
      viewError.value = message
      if (sameScope) { await refreshLoadedWindow(); await refreshViewList() }
      viewError.value = message
      if (deletingCurrent && sameScope) setProductDatabaseViewDeleteState({ userId, workspaceId: workspace, databaseId: database, blockId: block, fromViewId, replacementViewId: replacement!.id, status: 'failed', error: message })
    } else {
      const message = errorMessage(cause, '视图未删除。若仍有数据库块引用此视图，请先将这些引用切换到其他视图并同步，再重试。')
      viewError.value = message
      if (deletingCurrent && sameScope) setProductDatabaseViewDeleteState({ userId, workspaceId: workspace, databaseId: database, blockId: block, fromViewId, replacementViewId: replacement!.id, status: 'failed', error: message })
    }
  } finally {
    viewSubmitting.value = false
    const pendingState = getProductDatabaseViewDeleteState(block)
    if (pendingState?.userId === userId && pendingState.workspaceId === workspace && pendingState.databaseId === database && pendingState.fromViewId === fromViewId && pendingState.status === 'pending' && (auth.user?.id !== userId || workspaceId.value !== workspace || databaseId.value !== database || blockId.value !== block)) clearProductDatabaseViewDeleteState(block)
  }
}
function addFilter(): void {
  if (filterDrafts.value.length >= 20 || !properties.value.length) return
  const property = properties.value.find(item => !['formula', 'rollup'].includes(item.type))
  if (!property) return
  const operator = filterOperators(property)[0]!
  const filter: DatabaseFilter = { propertyId: property.id, operator, ...(needsFilterValue(operator) ? { value: property.type === 'number' ? 0 : property.type === 'select' ? property.options?.[0]?.id ?? '' : '' } : {}) }
  filterDrafts.value.push(filter)
}
function changeFilterProperty(index: number, propertyId: string): void {
  const property = properties.value.find(item => item.id === propertyId)
  if (!property) return
  const operator = filterOperators(property)[0]!
  filterDrafts.value[index] = { propertyId, operator, ...(needsFilterValue(operator) ? { value: property.type === 'number' ? 0 : property.type === 'select' ? property.options?.[0]?.id ?? '' : '' } : {}) }
}
function changeFilterOperator(index: number, operator: DatabaseFilterOperator): void {
  const filter = filterDrafts.value[index]
  const property = properties.value.find(item => item.id === filter?.propertyId)
  if (!filter || !property) return
  if (needsFilterValue(operator)) filter.value = property.type === 'number' ? 0 : property.type === 'select' ? property.options?.[0]?.id ?? '' : ''
  else delete filter.value
  filter.operator = operator
}
function setFilterValue(index: number, raw: string): void {
  const filter = filterDrafts.value[index]
  const property = properties.value.find(item => item.id === filter?.propertyId)
  if (!filter || !property) return
  filter.value = property.type === 'number' ? (raw === '' ? 0 : Number(raw)) : raw
}
function addSort(): void {
  const available = properties.value.find(property => !['relation', 'rollup', 'formula'].includes(property.type) && !sortDrafts.value.some(sort => sort.propertyId === property.id))
  if (!available || sortDrafts.value.length >= 10) return
  sortDrafts.value.push({ propertyId: available.id, direction: 'asc' })
}
function moveSort(index: number, delta: number): void {
  const target = index + delta
  if (target < 0 || target >= sortDrafts.value.length) return
  const next = [...sortDrafts.value]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item!)
  sortDrafts.value = next
}
async function saveViewConfig(next: DatabaseViewConfig): Promise<void> {
  if (viewBusy.value) return
  for (const filter of next.filters) {
    const property = properties.value.find(item => item.id === filter.propertyId)
    if (property?.type === 'number' && typeof filter.value === 'number' && !Number.isFinite(filter.value)) {
      viewError.value = '数字筛选条件需要有效数字。'
      return
    }
    if (property?.type === 'date' && typeof filter.value === 'string' && filter.operator !== 'is_empty' && filter.operator !== 'is_not_empty' && !/^\d{4}-\d{2}-\d{2}$/u.test(filter.value)) {
      viewError.value = '请选择有效日期；如需匹配空值，请选择“为空”。'
      return
    }
  }
  if (!validateDatabaseViewConfig(next, properties.value)) {
    viewError.value = '筛选或列设置与属性类型不匹配，请检查后重试。'
    return
  }
  viewSubmitting.value = true
  viewError.value = ''
  try {
    const result = await updateProductDatabaseView(workspaceId.value, databaseId.value, viewId.value, { config: next, expectedDatabaseVersion: databaseVersion.value, expectedViewVersion: viewVersion.value })
    databaseVersion.value = result.database.version
    viewVersion.value = result.view.version
    viewConfig.value = result.view.config ?? next
    viewControlsOpen.value = ''
  } catch (cause) { await handleViewMutationError(cause, '视图设置未保存，请重试。') }
  finally { viewSubmitting.value = false }
}
function saveFilters(): void {
  void saveViewConfig({ ...viewConfig.value, filters: filterDrafts.value.map(filter => ({ ...filter })) })
}
function saveSorts(): void {
  void saveViewConfig({ ...viewConfig.value, sorts: sortDrafts.value.map(sort => ({ ...sort })) })
}
function toggleColumn(propertyId: string): void {
  const property = properties.value.find(item => item.id === propertyId)
  if (!property || property.type === 'title') return
  columnDraft.value.visible = columnDraft.value.visible.includes(propertyId)
    ? columnDraft.value.visible.filter(id => id !== propertyId)
    : [...columnDraft.value.visible, propertyId]
}
function moveColumn(propertyId: string, delta: number): void {
  const index = columnDraft.value.order.indexOf(propertyId)
  const target = index + delta
  if (index < 0 || target < 0 || target >= columnDraft.value.order.length) return
  const next = [...columnDraft.value.order]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item!)
  columnDraft.value.order = next
}
function saveColumns(): void {
  const ids = properties.value.map(property => property.id)
  const visibleProperties = columnDraft.value.visible.length === ids.length ? null : [...new Set(['', ...columnDraft.value.visible].filter(Boolean))]
  const propertyOrder = columnDraft.value.order.every((id, index) => id === ids[index]) ? null : [...columnDraft.value.order]
  void saveViewConfig({ ...viewConfig.value, visibleProperties, propertyOrder })
}

function closePropertyConfig(): void { propertyConfigType.value = ''; propertyConfigEditId.value = ''; propertyConfigError.value = '' }
async function loadTargetDatabases(cursor?: string): Promise<void> {
  targetLoading.value = true; targetError.value = ''
  try {
    const result = await listProductDatabases(workspaceId.value, cursor)
    targetDatabases.value = cursor ? [...targetDatabases.value, ...result.items] : result.items
    targetDatabaseCursor.value = result.nextCursor
  } catch (cause) { targetError.value = errorMessage(cause, '暂时无法加载目标数据库。') }
  finally { targetLoading.value = false }
}
async function loadTargetProperties(targetId: string): Promise<void> {
  targetProperties.value = []; targetError.value = ''
  if (!targetId || targetId === databaseId.value) return
  targetLoading.value = true
  try {
    const schema = await fetchTargetSchema(targetId)
    if (targetId === (propertyConfigType.value === 'relation' ? targetDatabaseId.value : rollupTargetDatabaseId.value)) targetProperties.value = schema
  } catch (cause) { targetError.value = errorMessage(cause, '暂时无法读取目标属性。') }
  finally { targetLoading.value = false }
}
async function fetchTargetSchema(targetId: string): Promise<DatabasePropertyResponse[]> {
  const views = await listProductDatabaseViews(workspaceId.value, targetId)
  if (!views.length) throw new Error('目标数据库没有可读取的视图。')
  const table = await loadProductDatabaseTable(workspaceId.value, targetId, views[0]!.id, { limit: 1 })
  targetPropertySchemas.set(targetId, table.properties)
  return table.properties
}
function openAdvancedProperty(type: AdvancedType, property?: DatabasePropertyResponse): void {
  propertyMenuId.value = ''
  propertyConfigType.value = type
  propertyConfigEditId.value = property?.id ?? ''
  propertyConfigName.value = property?.name ?? ({ relation: '关联', rollup: '汇总', formula: '公式' })[type]
  propertyConfigError.value = ''
  targetDatabaseId.value = type === 'relation' ? (property?.config as { targetDatabaseId?: string } | undefined)?.targetDatabaseId ?? databaseId.value : databaseId.value
  relationPropertyId.value = type === 'rollup' ? (property?.config as { relationPropertyId?: string } | undefined)?.relationPropertyId ?? relationProperties.value[0]?.id ?? '' : ''
  targetPropertyId.value = type === 'rollup' ? (property?.config as { targetPropertyId?: string } | undefined)?.targetPropertyId ?? '' : ''
  rollupAggregation.value = type === 'rollup' ? (property?.config as { aggregation?: typeof rollupAggregation.value } | undefined)?.aggregation ?? 'count' : 'count'
  formulaDraft.value = type === 'formula' ? JSON.stringify((property?.config as { expression?: FormulaExpression } | undefined)?.expression ?? { kind: 'literal', value: '' }, null, 2) : ''
  formulaResultType.value = type === 'formula' ? (property?.config as { resultType?: DatabaseFormulaResultType } | undefined)?.resultType ?? 'string' : 'string'
  if (type === 'relation') void loadTargetDatabases()
  if (type === 'rollup' && rollupTargetDatabaseId.value) void loadTargetProperties(rollupTargetDatabaseId.value)
}
function insertFormulaProperty(propertyId: string): void {
  const node = JSON.stringify({ kind: 'property', propertyId }, null, 2)
  formulaDraft.value = node
  propertyConfigError.value = ''
}
function formulaTemplate(kind: 'add' | 'if' | 'empty' | 'concat'): void {
  const property = formulaProperties.value.find(item => item.type === 'number') ?? formulaProperties.value[0]
  const refNode: FormulaExpression = property ? { kind: 'property', propertyId: property.id } : { kind: 'literal', value: 0 }
  const templates: Record<typeof kind, FormulaExpression> = {
    add: { kind: 'binary', operator: '+', left: refNode, right: { kind: 'literal', value: 1 } },
    if: { kind: 'if', condition: { kind: 'literal', value: true }, then: refNode, else: { kind: 'literal', value: null } },
    empty: { kind: 'call', name: 'empty', args: [refNode] },
    concat: { kind: 'call', name: 'concat', args: [{ kind: 'literal', value: '' }, { kind: 'literal', value: '' }] },
  }
  formulaDraft.value = JSON.stringify(templates[kind], null, 2)
}
function buildPropertyConfig(): DatabasePropertyConfig | null {
  if (propertyConfigType.value === 'relation') return targetDatabaseId.value ? { targetDatabaseId: targetDatabaseId.value } : null
  if (propertyConfigType.value === 'rollup') return relationPropertyId.value && targetPropertyId.value && validRollupAggregations.value.includes(rollupAggregation.value)
    ? { relationPropertyId: relationPropertyId.value, targetPropertyId: targetPropertyId.value, aggregation: rollupAggregation.value } : null
  if (propertyConfigType.value === 'formula') {
    try {
      const expression: unknown = JSON.parse(formulaDraft.value)
      return isValidFormulaExpression(expression) ? { expression, resultType: formulaResultType.value } : null
    } catch { return null }
  }
  return null
}
async function saveAdvancedProperty(): Promise<void> {
  if (!writable.value || !propertyConfigType.value) return
  const name = propertyConfigName.value.trim()
  const config = buildPropertyConfig()
  if (!name || name.length > 100 || !config) { propertyConfigError.value = '请填写有效名称和配置。'; return }
  const existing = properties.value.find(item => item.id === propertyConfigEditId.value)
  const candidate: DatabasePropertyResponse = existing ? { ...existing, name, config } : {
    id: createLocalId(), workspaceId: workspaceId.value, databaseId: databaseId.value, name,
    type: propertyConfigType.value, config, version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }
  const nextProperties = [...properties.value.filter(item => item.id !== candidate.id), candidate]
  const relationById = new Map(nextProperties.filter(item => item.type === 'relation').map(item => [item.id, item]))
  const targetIds = [...new Set(nextProperties.filter(item => item.type === 'rollup').map(item => {
    const relationId = (item.config as { relationPropertyId: string }).relationPropertyId
    return (relationById.get(relationId)?.config as { targetDatabaseId?: string } | undefined)?.targetDatabaseId
  }).filter((id): id is string => Boolean(id) && id !== databaseId.value))]
  targetLoading.value = true
  try { await Promise.all(targetIds.map(fetchTargetSchema)) }
  catch (cause) { propertyConfigError.value = errorMessage(cause, '目标属性暂时无法读取，请重试。'); targetLoading.value = false; return }
  targetLoading.value = false
  const resolver = (id: string) => id === databaseId.value ? nextProperties : targetPropertySchemas.get(id)
  if (!validateDatabasePropertyDependencies(nextProperties, resolver)) {
    propertyConfigError.value = '属性引用、类型或公式结果不匹配；请检查目标属性与结果类型。'; return
  }
  propertyConfigError.value = ''
  try {
    if (existing) await updateProductDatabaseProperty(workspaceId.value, databaseId.value, existing.id, { name, config, expectedDatabaseVersion: databaseVersion.value, expectedPropertyVersion: existing.version })
    else await createProductDatabaseProperty(workspaceId.value, databaseId.value, { id: candidate.id, name, type: propertyConfigType.value, config, expectedDatabaseVersion: databaseVersion.value })
    closePropertyConfig()
  } catch (cause) {
    if (cause instanceof ApiError && cause.statusCode === 409 && /version|stale|concurrent/iu.test(cause.message)) { await refreshLoadedWindow(); propertyConfigError.value = '数据库结构已变化，已刷新版本，请确认后重试。' }
    else if (cause instanceof ApiError && cause.statusCode === 409) propertyConfigError.value = `${errorMessage(cause, '属性仍被引用。')} 请先修改依赖属性，再重试。`
    else propertyConfigError.value = errorMessage(cause, '属性未保存，请重试。')
  }
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
    if (cause instanceof ApiError && cause.statusCode === 409 && /version|stale|concurrent/iu.test(cause.message)) { await refreshLoadedWindow(); mutationError.value = '属性已变化，已刷新版本，请确认后重试。' }
    else if (cause instanceof ApiError && cause.statusCode === 409) mutationError.value = `${errorMessage(cause, '属性仍被引用。')} 请先修改依赖属性，再重试。`
    else if (cause instanceof ApiError && cause.statusCode === 400 && /dependenc/iu.test(cause.message)) mutationError.value = '该属性仍被公式或汇总引用。请先修改依赖属性，再删除。'
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
  if (!writable.value || ['checkbox', 'select', 'relation', 'rollup', 'formula'].includes(property.type)) return
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

async function loadRelationOptions(append = false): Promise<void> {
  const picker = relationPicker.value
  if (!picker) return
  const property = properties.value.find(item => item.id === picker.propertyId)
  const targetId = (property?.config as { targetDatabaseId?: string } | undefined)?.targetDatabaseId
  if (!targetId) return
  const epoch = ++relationRequestEpoch
  relationLoading.value = true; relationError.value = ''
  try {
    const result = await listProductRelationCandidates(workspaceId.value, targetId, relationSearch.value.trim(), append ? relationNextCursor.value ?? undefined : undefined)
    if (epoch !== relationRequestEpoch || relationPicker.value?.recordId !== picker.recordId || relationPicker.value?.propertyId !== picker.propertyId) return
    relationOptions.value = append ? [...relationOptions.value, ...result.items] : result.items
    relationNextCursor.value = result.nextCursor
    for (const item of result.items) relationTitles.value.set(`${targetId}\u0000${item.recordId}`, item)
  } catch (cause) { if (epoch === relationRequestEpoch) relationError.value = errorMessage(cause, '关联记录加载失败，请重试。') }
  finally { if (epoch === relationRequestEpoch) relationLoading.value = false }
}
function openRelationPicker(record: TableRecord, property: DatabasePropertyResponse, event: MouseEvent): void {
  if (!writable.value) return
  closeRelationPicker()
  returnFocusTo.value = event.currentTarget as HTMLElement
  cellPopoverStyle.value = anchoredStyle(event.currentTarget as HTMLElement, 320)
  relationPicker.value = { recordId: record.id, propertyId: property.id }
  relationSearch.value = ''; relationOptions.value = []; relationNextCursor.value = null
  void resolveSelectedRelationTitles(record, property)
  void loadRelationOptions()
}
async function setRelation(record: TableRecord, property: DatabasePropertyResponse, id: string): Promise<void> {
  if (!writable.value || savingCell.value) return
  const current = Array.isArray(getCellValue(record, property.id)) ? getCellValue(record, property.id) as string[] : []
  const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id]
  if (next.length > 50) { relationError.value = '每条记录最多关联 50 条。'; return }
  savingCell.value = true; relationError.value = ''
  try {
    const result = await updateProductDatabaseRecordCell(workspaceId.value, databaseId.value, record.id, property.id, {
      value: next, expectedDatabaseVersion: databaseVersion.value, expectedRecordVersion: record.version,
    })
    databaseVersion.value = result.database.version
    await refreshLoadedWindow()
  } catch (cause) {
    if (cause instanceof ApiError && cause.statusCode === 409) { await refreshLoadedWindow(); relationError.value = '记录已变化，已刷新版本，请重新选择。' }
    else relationError.value = errorMessage(cause, '关联未保存，请重试。')
  } finally { savingCell.value = false }
}

function onDatabaseChanged(event: Event): void {
  const detail = (event as CustomEvent<DatabaseRecordCreatedDetail | DatabaseUpdatedDetail>).detail
  if (detail?.workspaceId !== workspaceId.value) return
  if (detail.databaseId === databaseId.value || properties.value.some(property => property.type === 'relation' && (property.config as { targetDatabaseId: string }).targetDatabaseId === detail.databaseId)) void refreshLoadedWindow()
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
  closeRelationPicker()
  if (propertyMenuId.value === '__add') { propertyMenuId.value = ''; return }
  returnFocusTo.value = event.currentTarget as HTMLElement
  propertyMenuStyle.value = anchoredStyle(event.currentTarget as HTMLElement)
  propertyMenuId.value = '__add'
}
function onRecordCreated(event: Event): void { onDatabaseChanged(event) }
function onOnlineChange(): void {
  online.value = navigator.onLine
  if (!online.value) { propertyMenuId.value = ''; cellPopover.value = null; closeRelationPicker(); viewMenuOpen.value = false; viewControlsOpen.value = '' }
  else void loadTable()
}
function onEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (cellEdit.value) cancelCellEdit()
  const hadPopover = Boolean(cellPopover.value || relationPicker.value || propertyMenuId.value || viewMenuOpen.value || viewControlsOpen.value)
  if (cellPopover.value) cellPopover.value = null
  closeRelationPicker()
  if (propertyMenuId.value) propertyMenuId.value = ''
  viewMenuOpen.value = false
  viewControlsOpen.value = ''
  if (hadPopover) void nextTick(() => returnFocusTo.value?.focus())
  if (addTitleMode.value) cancelNewRecord()
}
function onOutsidePointer(event: PointerEvent): void {
  if ((event.target as HTMLElement | null)?.closest('.eotion-database') || (event.target as HTMLElement | null)?.closest('.eotion-database-popover')) return
  propertyMenuId.value = ''
  cellPopover.value = null
  closeRelationPicker()
  viewMenuOpen.value = false
  viewControlsOpen.value = ''
}
function closePopoversForViewportChange(): void {
  const anchor = returnFocusTo.value
  if (!anchor?.isConnected) { propertyMenuId.value = ''; cellPopover.value = null; return }
  const style = anchoredStyle(anchor)
  const controlsAnchorStyle = anchoredStyle(anchor, window.innerWidth < 768 ? 374 : 320)
  if (propertyMenuId.value) propertyMenuStyle.value = style
  if (cellPopover.value) cellPopoverStyle.value = style
  if (relationPicker.value) cellPopoverStyle.value = anchoredStyle(anchor, 320)
  if (viewMenuOpen.value) viewMenuStyle.value = style
  if (viewControlsOpen.value) controlStyle.value = controlsAnchorStyle
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
  relationRequestEpoch += 1
  relationTitleEpoch += 1
  selectedTitleEpoch += 1
  window.removeEventListener(DATABASE_RECORD_CREATED_EVENT, onRecordCreated)
  window.removeEventListener(DATABASE_UPDATED_EVENT, onDatabaseChanged)
  window.removeEventListener('online', onOnlineChange)
  window.removeEventListener('offline', onOnlineChange)
  window.removeEventListener('keydown', onEscape)
  window.removeEventListener('pointerdown', onOutsidePointer)
  window.removeEventListener('scroll', closePopoversForViewportChange, true)
  window.removeEventListener('resize', closePopoversForViewportChange)
})
watch([workspaceId, databaseId, viewId, () => auth.user?.id], (current, previous) => {
  requestEpoch += 1
  cellEdit.value = null
  cellPopover.value = null
  closeRelationPicker()
  closePropertyConfig()
  relationTitles.value = new Map<string, RelationOption>()
  relationRequestEpoch += 1
  relationTitleEpoch += 1
  propertyMenuId.value = ''
  viewMenuOpen.value = false
  viewControlsOpen.value = ''
  if (current[0] !== previous[0] || current[1] !== previous[1] || current[3] !== previous[3]) viewError.value = ''
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
      <div class="eotion-database-view-controls">
        <button type="button" class="eotion-database-control-trigger" aria-label="切换视图" :disabled="viewBusy" @click.stop="openViewMenu($event)">{{ viewName }} <span aria-hidden="true">⌄</span></button>
        <button type="button" class="eotion-database-control-trigger" :aria-label="`筛选${visibleViewCount ? `，${visibleViewCount} 个条件` : ''}`" :disabled="viewBusy" @click.stop="openViewControls('filters', $event)">Filter<span v-if="visibleViewCount" class="eotion-database-count">{{ visibleViewCount }}</span></button>
        <button type="button" class="eotion-database-control-trigger" :aria-label="`排序${sortViewCount ? `，${sortViewCount} 个条件` : ''}`" :disabled="viewBusy" @click.stop="openViewControls('sorts', $event)">Sort<span v-if="sortViewCount" class="eotion-database-count">{{ sortViewCount }}</span></button>
        <button type="button" class="eotion-database-control-trigger" aria-label="视图列设置" :disabled="viewBusy" @click.stop="openViewControls('columns', $event)">…</button>
        <Teleport to="body"><section v-if="viewMenuOpen" class="eotion-database-popover eotion-database-teleport eotion-database-view-menu" :style="viewMenuStyle" role="group" aria-label="数据库视图" @click.stop>
          <strong>视图</strong>
          <button v-for="item in views" :key="item.id" type="button" class="eotion-database-view-option" :aria-current="item.id === viewId ? 'true' : undefined" @click.stop="switchView(item.id)">{{ item.name }}<span v-if="item.id === viewId">当前</span></button>
          <p v-if="!views.length && !viewError" class="eotion-database-view-hint">正在加载视图…</p>
          <button type="button" :disabled="viewBusy || views.length >= 100" @click.stop="createView">＋ 新建视图</button>
          <form v-if="views.find(item => item.id === viewId)" class="eotion-database-view-rename" @submit.prevent="renameView(views.find(item => item.id === viewId)!)">
            <label :for="`database-view-name-${viewId}`">重命名当前视图</label>
            <input :id="`database-view-name-${viewId}`" v-model="renameViewDraft" maxlength="100" :placeholder="viewName" aria-label="当前视图名称">
            <button type="submit" :disabled="viewBusy || !renameViewDraft.trim()">保存名称</button>
            <button type="button" class="danger" :disabled="viewBusy || views.length < 2" @click.stop="deleteView(views.find(item => item.id === viewId)!)">删除视图</button>
          </form>
        </section></Teleport>
        <Teleport to="body"><section v-if="viewControlsOpen === 'filters'" class="eotion-database-popover eotion-database-teleport eotion-database-settings" :style="controlStyle" role="group" aria-label="筛选条件" @click.stop>
          <strong>所有筛选条件都需匹配</strong>
          <div v-for="(filter, index) in filterDrafts" :key="`${index}-${filter.propertyId}`" class="eotion-database-filter-row">
            <select :value="filter.propertyId" :aria-label="`筛选属性 ${index + 1}`" @change="changeFilterProperty(index, ($event.target as HTMLSelectElement).value)"><option v-for="property in properties" :key="property.id" :value="property.id" :disabled="property.type === 'rollup' || property.type === 'formula'">{{ property.name }}{{ property.type === 'rollup' || property.type === 'formula' ? '（暂不支持筛选）' : '' }}</option></select>
            <select :value="filter.operator" :aria-label="`筛选条件 ${index + 1}`" @change="changeFilterOperator(index, ($event.target as HTMLSelectElement).value as DatabaseFilterOperator)"><option v-for="operator in filterOperators(properties.find(item => item.id === filter.propertyId)!)" :key="operator" :value="operator">{{ operatorLabel(operator) }}</option></select>
            <template v-if="needsFilterValue(filter.operator)">
              <select v-if="properties.find(item => item.id === filter.propertyId)?.type === 'select'" class="eotion-database-filter-value" :value="filter.value" :aria-label="`筛选值 ${index + 1}`" @change="setFilterValue(index, ($event.target as HTMLSelectElement).value)"><option v-for="option in properties.find(item => item.id === filter.propertyId)?.options ?? []" :key="option.id" :value="option.id">{{ option.name }}</option></select>
              <input v-else class="eotion-database-filter-value" :value="filter.value" :type="properties.find(item => item.id === filter.propertyId)?.type === 'number' ? 'number' : properties.find(item => item.id === filter.propertyId)?.type === 'date' ? 'date' : 'text'" :aria-label="`筛选值 ${index + 1}`" @input="setFilterValue(index, ($event.target as HTMLInputElement).value)">
            </template>
            <button type="button" :aria-label="`删除筛选条件 ${index + 1}`" @click.stop="filterDrafts.splice(index, 1)">×</button>
          </div>
          <button type="button" :disabled="filterDrafts.length >= 20" @click.stop="addFilter">＋ 添加筛选条件</button>
          <button type="button" :disabled="viewBusy" @click.stop="saveFilters">保存筛选</button>
        </section></Teleport>
        <Teleport to="body"><section v-if="viewControlsOpen === 'sorts'" class="eotion-database-popover eotion-database-teleport eotion-database-settings" :style="controlStyle" role="group" aria-label="排序条件" @click.stop>
          <strong>排序优先级（顶部优先）</strong>
          <div v-for="(sort, index) in sortDrafts" :key="`${index}-${sort.propertyId}`" class="eotion-database-sort-row">
            <select v-model="sort.propertyId" :aria-label="`排序属性 ${index + 1}`"><option v-for="property in properties" :key="property.id" :value="property.id" :disabled="['relation', 'rollup', 'formula'].includes(property.type) || sortDrafts.some((other, otherIndex) => otherIndex !== index && other.propertyId === property.id)">{{ property.name }}{{ ['relation', 'rollup', 'formula'].includes(property.type) ? '（暂不支持排序）' : '' }}</option></select>
            <select v-model="sort.direction" :aria-label="`排序方向 ${index + 1}`"><option value="asc">升序</option><option value="desc">降序</option></select>
            <button type="button" :aria-label="`排序上移 ${index + 1}`" :disabled="index === 0" @click.stop="moveSort(index, -1)">↑</button>
            <button type="button" :aria-label="`排序下移 ${index + 1}`" :disabled="index === sortDrafts.length - 1" @click.stop="moveSort(index, 1)">↓</button>
            <button type="button" :aria-label="`删除排序 ${index + 1}`" @click.stop="sortDrafts.splice(index, 1)">×</button>
          </div>
          <button type="button" :disabled="sortDrafts.length >= 10 || sortDrafts.length >= properties.filter(property => !['relation', 'rollup', 'formula'].includes(property.type)).length" @click.stop="addSort">＋ 添加排序</button>
          <button type="button" :disabled="viewBusy" @click.stop="saveSorts">保存排序</button>
        </section></Teleport>
        <Teleport to="body"><section v-if="viewControlsOpen === 'columns'" class="eotion-database-popover eotion-database-teleport eotion-database-settings" :style="controlStyle" role="group" aria-label="列设置" @click.stop>
          <strong>显示与排列</strong>
          <div v-for="(propertyId, index) in columnDraft.order" :key="propertyId" class="eotion-database-column-row">
            <label><input type="checkbox" :checked="columnDraft.visible.includes(propertyId)" :disabled="properties.find(item => item.id === propertyId)?.type === 'title'" @change="toggleColumn(propertyId)">{{ properties.find(item => item.id === propertyId)?.name }}</label>
            <button type="button" :aria-label="`列上移 ${properties.find(item => item.id === propertyId)?.name}`" :disabled="index === 0" @click.stop="moveColumn(propertyId, -1)">↑</button>
            <button type="button" :aria-label="`列下移 ${properties.find(item => item.id === propertyId)?.name}`" :disabled="index === columnDraft.order.length - 1" @click.stop="moveColumn(propertyId, 1)">↓</button>
          </div>
          <button type="button" :disabled="viewBusy" @click.stop="saveColumns">保存列设置</button>
        </section></Teleport>
      </div>
      <form v-if="addTitleMode" class="eotion-database-new" @submit.prevent="createRecord">
        <input v-model="addTitleDraft" autofocus maxlength="200" aria-label="记录标题" placeholder="记录标题" :disabled="creating || !writable" @keydown.enter="onNewRecordEnter" @keydown.esc.prevent="cancelNewRecord">
        <button type="submit" :disabled="creating || !writable || !addTitleDraft.trim()">{{ creating ? '正在新建…' : '创建' }}</button>
        <button type="button" :disabled="creating" @click="cancelNewRecord">取消</button>
      </form>
      <button v-else class="eotion-database-add" type="button" :disabled="creating || creationUncertain || !writable" @pointerdown.stop @mousedown.stop @click.stop="addTitleMode = true; addTitleDraft = ''">+ 新建记录</button>
      <div class="eotion-database-properties-menu">
        <button type="button" aria-label="添加属性" :disabled="!writable" @click.stop="togglePropertyCreator($event)">属性</button>
        <Teleport to="body"><div v-if="propertyMenuId === '__add'" class="eotion-database-popover eotion-database-teleport" :style="propertyMenuStyle" role="group" aria-label="添加属性类型">
          <button v-for="item in addableProperties" :key="item.type" type="button" @click.stop="['relation', 'rollup', 'formula'].includes(item.type) ? openAdvancedProperty(item.type as AdvancedType) : addProperty(item.type as 'text' | 'number' | 'checkbox' | 'select' | 'date')">{{ item.label }}</button>
        </div></Teleport>
      </div>
    </header>
    <section v-if="propertyConfigType" class="eotion-database-advanced" role="group" :aria-label="`配置${propertyConfigType === 'relation' ? '关联' : propertyConfigType === 'rollup' ? '汇总' : '公式'}属性`" @pointerdown.stop>
      <div class="eotion-database-advanced-heading"><strong>{{ propertyConfigEditId ? '编辑' : '添加' }}{{ propertyConfigType === 'relation' ? '关联' : propertyConfigType === 'rollup' ? '汇总' : '公式' }}属性</strong><button type="button" @click="closePropertyConfig">关闭</button></div>
      <label>属性名称<input v-model="propertyConfigName" maxlength="100" :disabled="!writable"></label>
      <template v-if="propertyConfigType === 'relation'">
        <label>目标数据库<select v-model="targetDatabaseId" :disabled="!writable || targetLoading"><option :value="databaseId">当前数据库：{{ title }}</option><option v-for="item in targetDatabases.filter(item => item.id !== databaseId)" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
        <button v-if="targetDatabaseCursor" type="button" :disabled="targetLoading" @click="loadTargetDatabases(targetDatabaseCursor)">更多数据库</button>
        <p>可关联当前数据库中的记录；保存后在单元格中搜索并选择记录。</p>
      </template>
      <template v-if="propertyConfigType === 'rollup'">
        <label>关联属性<select v-model="relationPropertyId" :disabled="!writable" @change="targetPropertyId = ''; loadTargetProperties(rollupTargetDatabaseId)"><option value="">请选择</option><option v-for="item in relationProperties" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
        <label>目标属性<select v-model="targetPropertyId" :disabled="!writable || targetLoading"><option value="">请选择</option><option v-for="item in rollupBaseTargets" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
        <label>汇总方式<select v-model="rollupAggregation" :disabled="!writable"><option v-for="item in validRollupAggregations" :key="item" :value="item">{{ ({ count: '关联数量', count_values: '非空值数量', sum: '求和', avg: '平均值', min: '最小值', max: '最大值' } as Record<string, string>)[item] }}</option></select></label>
        <p>汇总列只读；仅可选择目标数据库中的基础属性。</p>
      </template>
      <template v-if="propertyConfigType === 'formula'">
        <p>公式使用结构化表达式 JSON，引用属性 ID；不会执行 JavaScript。可从模板开始编辑。</p>
        <div class="eotion-database-formula-tools"><button type="button" @click="formulaTemplate('add')">数字相加模板</button><button type="button" @click="formulaTemplate('if')">条件模板</button><button type="button" @click="formulaTemplate('empty')">空值模板</button><button type="button" @click="formulaTemplate('concat')">文本拼接模板</button></div>
        <label>插入属性<select aria-label="插入公式属性" @change="insertFormulaProperty(($event.target as HTMLSelectElement).value)"><option value="">选择属性</option><option v-for="item in formulaProperties.filter(item => item.id !== propertyConfigEditId)" :key="item.id" :value="item.id">{{ item.name }}（{{ item.type }}）</option></select></label>
        <label>表达式<textarea v-model="formulaDraft" rows="8" spellcheck="false" :disabled="!writable"></textarea></label>
        <label>结果类型<select v-model="formulaResultType" :disabled="!writable"><option value="string">文本</option><option value="number">数字</option><option value="boolean">布尔值</option><option value="date">日期</option><option value="null">空值</option></select></label>
        <p>支持 literal、property、binary、unary、if、call；空值、除零与无效运行结果显示为 —。</p>
      </template>
      <p v-if="targetLoading" role="status">正在加载属性…</p>
      <p v-if="targetError" role="alert">{{ targetError }} <button type="button" @click="propertyConfigType === 'rollup' ? loadTargetProperties(rollupTargetDatabaseId) : loadTargetDatabases()">重试</button></p>
      <p v-if="propertyConfigError" role="alert">{{ propertyConfigError }}</p>
      <button type="button" :disabled="!writable || targetLoading" @click="saveAdvancedProperty">保存属性</button>
    </section>
    <p v-if="visibleViewError" class="eotion-database-error" role="alert">{{ visibleViewError }}</p>
    <p v-if="!online && !loading && !loadError" class="eotion-database-offline" role="status">离线 · 数据库只读，已加载内容仍可查看</p>
    <p v-if="refreshError" class="eotion-database-error" role="alert"><span>{{ refreshError }}</span><button type="button" @click.stop="void refreshLoadedWindow()">重试刷新</button></p>
    <p v-if="loading" class="eotion-database-state" role="status">正在加载数据库…</p>
    <div v-else-if="loadError" class="eotion-database-error" role="alert"><span>{{ loadError }}</span><button type="button" @click.stop="loadTable()">重试加载</button></div>
    <template v-else>
      <p v-if="mutationError || creationUncertain" class="eotion-database-error" role="alert">{{ mutationError || '上次记录创建结果尚未确认，请联网并刷新页面后确认。' }}</p>
      <div v-if="properties.length" class="eotion-database-scroll" data-testid="database-table-scroll" role="region" aria-label="数据库记录" tabindex="0" @pointerdown.stop>
        <table class="eotion-database-table">
          <thead><tr>
            <th v-for="property in displayProperties" :key="property.id" scope="col">
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
                <button v-if="['relation', 'rollup', 'formula'].includes(property.type)" type="button" @click="openAdvancedProperty(property.type as AdvancedType, property)">编辑{{ property.type === 'relation' ? '关联' : property.type === 'rollup' ? '汇总' : '公式' }}设置</button>
                <button v-if="property.type !== 'title'" type="button" class="danger" @click="deleteProperty(property)">删除属性</button>
              </div></Teleport>
            </th>
          </tr></thead>
          <tbody>
            <tr v-for="record in records" :key="record.id">
              <td v-for="property in displayProperties" :key="property.id">
                <template v-if="property.type === 'title' && !isEditingCell(record, property)"><button class="eotion-database-cell-button" type="button" :disabled="!writable" :aria-label="`编辑${property.name}：${formatValue(getCellValue(record, property.id), property)}`" @click.stop="startCellEdit(record, property)">{{ formatValue(getCellValue(record, property.id), property) }}</button><RouterLink class="eotion-database-title" :aria-label="`打开记录页面：${formatValue(getCellValue(record, property.id), property)}`" :to="{ name: 'product-page', params: { workspaceId, pageId: record.pageId } }" @pointerdown.stop @mousedown.stop @click.capture="openRecordPage($event, record.pageId)"></RouterLink></template>
                <input v-else-if="isEditingCell(record, property)" v-model="cellDraft" :ref="setCellInputRef" class="eotion-database-cell-input" :type="property.type === 'date' ? 'date' : 'text'" :inputmode="property.type === 'number' ? 'decimal' : undefined" :aria-label="`${property.name} 值`" :disabled="savingCell || !writable" @keydown.enter="onCellEnter($event, record, property)" @keydown.esc.prevent="cancelCellEdit" @blur="saveCell(record, property)">
                <button v-else-if="property.type === 'checkbox'" class="eotion-database-cell-button" type="button" :disabled="!writable" :aria-pressed="getCellValue(record, property.id) === true" @click.stop="toggleCheckbox(record, property)">{{ formatValue(getCellValue(record, property.id), property) }}</button>
                <button v-else-if="property.type === 'select'" class="eotion-database-cell-button" type="button" :disabled="!writable" @click.stop="toggleCellPopover(record, property, $event)">{{ formatValue(getCellValue(record, property.id), property) }}</button>
                <button v-else-if="property.type === 'relation'" class="eotion-database-cell-button" type="button" :disabled="!writable" :aria-label="`编辑关联 ${property.name}`" @click.stop="openRelationPicker(record, property, $event)">{{ formatValue(getCellValue(record, property.id), property) }}</button>
                <span v-else-if="property.type === 'rollup' || property.type === 'formula'" class="eotion-database-derived-value" :aria-label="`${property.name}，只读`">{{ formatValue(getCellValue(record, property.id), property) }}</span>
                <button v-else-if="property.type === 'title'" class="eotion-database-cell-button" type="button" :disabled="!writable" @click.stop="startCellEdit(record, property)">{{ formatValue(getCellValue(record, property.id), property) }}</button>
                <button v-else class="eotion-database-cell-button" type="button" :disabled="!writable" @click.stop="startCellEdit(record, property)">{{ formatValue(getCellValue(record, property.id), property) }}</button>
                <Teleport to="body"><div v-if="isOpenSelect(record, property)" class="eotion-database-popover eotion-database-teleport eotion-database-cell-menu" :style="cellPopoverStyle">
                  <button type="button" @click.stop="chooseSelect(record, property, null)">清除</button>
                  <button v-for="option in property.options ?? []" :key="option.id" type="button" @click.stop="chooseSelect(record, property, option.id)">{{ option.name }}</button>
                </div></Teleport>
                <Teleport to="body"><section v-if="relationPicker?.recordId === record.id && relationPicker?.propertyId === property.id" class="eotion-database-popover eotion-database-teleport eotion-database-relation-picker" :style="cellPopoverStyle" role="group" :aria-label="`关联记录：${property.name}`" @click.stop>
                  <strong>关联记录 <small>最多 50 条</small></strong>
                  <label>搜索记录<input v-model="relationSearch" maxlength="200" placeholder="输入标题" @keydown.enter.prevent="loadRelationOptions()"></label>
                  <button type="button" :disabled="relationLoading" @click="loadRelationOptions()">搜索</button>
                  <div v-for="id in Array.isArray(getCellValue(record, property.id)) ? getCellValue(record, property.id) as string[] : []" :key="id" class="eotion-database-relation-selected"><span>{{ getRelationTitle(property, id)?.title ?? id }}</span><button type="button" :disabled="savingCell" :aria-label="`移除关联 ${getRelationTitle(property, id)?.title ?? id}`" @click="setRelation(record, property, id)">移除</button><RouterLink v-if="getRelationTitle(property, id)" :to="{ name: 'product-page', params: { workspaceId, pageId: getRelationTitle(property, id)?.pageId } }" @click.capture="openRecordPage($event, getRelationTitle(property, id)!.pageId)">打开</RouterLink></div>
                  <p v-if="relationLoading" role="status">正在加载关联记录…</p>
                  <p v-if="relationError" role="alert">{{ relationError }} <button type="button" @click="loadRelationOptions()">重试</button></p>
                  <p v-if="relationTitleError" role="alert">{{ relationTitleError }} <button type="button" @click="resolveSelectedRelationTitles(record, property)">重试标题</button></p>
                  <button v-for="option in relationOptions" :key="option.recordId" type="button" :disabled="savingCell || (Array.isArray(getCellValue(record, property.id)) && (getCellValue(record, property.id) as string[]).includes(option.recordId))" @click="setRelation(record, property, option.recordId)">{{ option.title }}</button>
                  <button v-if="relationNextCursor" type="button" :disabled="relationLoading" @click="loadRelationOptions(true)">加载更多</button>
                  <button type="button" @click="closeRelationPicker">完成</button>
                </section></Teleport>
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
.eotion-database-advanced { display:grid; gap:10px; border-top:1px solid var(--border-editor); padding:14px; font-size:13px; }
.eotion-database-advanced-heading { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.eotion-database-advanced label { display:grid; gap:5px; min-width:0; color:var(--editor-muted); }
.eotion-database-advanced input,.eotion-database-advanced select,.eotion-database-advanced textarea { box-sizing:border-box; width:100%; min-width:0; min-height:36px; border:1px solid var(--border-editor); border-radius:5px; padding:6px 8px; background:var(--surface-raised); color:var(--editor-text); font:inherit; }
.eotion-database-advanced textarea { min-height:150px; resize:vertical; font-family:ui-monospace,monospace; }
.eotion-database-advanced p { margin:0; color:var(--editor-muted); }
.eotion-database-advanced p[role="alert"] { color:var(--danger); }
.eotion-database-advanced button { min-height:32px; justify-self:start; border:1px solid var(--border-editor); border-radius:5px; padding:5px 9px; background:var(--surface-editor-hover); color:inherit; font:inherit; cursor:pointer; }
.eotion-database-formula-tools { display:flex; flex-wrap:wrap; gap:5px; }
.eotion-database-derived-value { display:block; min-height:28px; padding:2px 4px; color:var(--editor-muted); }
.eotion-database-relation-picker { width:min(320px,calc(100vw - 16px)); }
.eotion-database-relation-picker label { display:grid; gap:4px; }
.eotion-database-relation-picker p { margin:0; font-size:12px; }
.eotion-database-relation-selected { display:flex; align-items:center; gap:5px; min-width:0; border-bottom:1px solid var(--border-editor); }
.eotion-database-relation-selected span { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.eotion-database-relation-selected a { color:inherit; font-size:12px; }
.eotion-database-header { display:flex; min-height:58px; align-items:center; gap:12px; padding:10px 14px; }
.eotion-database-mark { display:grid; width:34px; height:34px; flex:0 0 auto; place-items:center; border-radius:7px; background:var(--surface-editor-hover); color:var(--editor-muted); font-size:20px; }
.eotion-database-copy { display:grid; min-width:0; flex:1; gap:3px; }.eotion-database-copy strong { overflow:hidden; font-size:13px; font-weight:600; text-overflow:ellipsis; white-space:nowrap; }.eotion-database-copy small { color:var(--editor-muted); font-size:12px; }
.eotion-database-add,.eotion-database-more,.eotion-database-error button,.eotion-database-new button,.eotion-database-properties-menu>button { min-height:32px; border:1px solid var(--border-editor); border-radius:6px; padding:5px 9px; background:var(--surface-editor-hover); color:inherit; font:inherit; cursor:pointer; }
.eotion-database-add:disabled,.eotion-database-more:disabled,.eotion-database-error button:disabled,button:disabled { opacity:.6; cursor:default; }
.eotion-database-new { display:flex; flex-wrap:wrap; gap:5px; }.eotion-database-new input { width:160px; min-height:32px; }.eotion-database-properties-menu { position:relative; }
.eotion-database-view-controls { display:flex; align-items:center; gap:4px; flex:0 1 auto; }
.eotion-database-control-trigger { min-height:32px; border:1px solid transparent; border-radius:6px; padding:5px 8px; background:transparent; color:inherit; font:inherit; cursor:pointer; white-space:nowrap; }
.eotion-database-control-trigger:hover,.eotion-database-view-option[aria-current="true"] { background:var(--surface-editor-hover); }
.eotion-database-control-trigger:disabled { opacity:.55; cursor:default; }
.eotion-database-count { display:inline-grid; min-width:17px; height:17px; margin-left:4px; place-items:center; border-radius:9px; background:var(--surface-editor-hover); color:var(--editor-muted); font-size:11px; }
.eotion-database-view-menu { width:min(300px, calc(100vw - 16px)); }
.eotion-database-view-option { display:flex!important; align-items:center; justify-content:space-between; gap:8px; }
.eotion-database-view-option span,.eotion-database-view-hint { color:var(--editor-muted); font-size:12px; }
.eotion-database-view-rename { display:grid!important; grid-template-columns:minmax(0,1fr) auto; gap:5px!important; border-top:1px solid var(--border-editor); padding-top:8px; }
.eotion-database-view-rename label { grid-column:1/-1; color:var(--editor-muted); font-size:12px; }
.eotion-database-view-rename input { min-width:0; }
.eotion-database-view-rename .danger,.eotion-database-view-error { color:var(--danger); }
.eotion-database-settings { width:min(374px, calc(100vw - 16px)); }
.eotion-database-filter-row { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr) 36px; align-items:center; gap:5px; min-width:0; }
.eotion-database-sort-row { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr) repeat(3,32px); align-items:center; gap:4px; min-width:0; }
.eotion-database-column-row { display:flex; align-items:center; gap:4px; min-width:0; }
.eotion-database-filter-row select,.eotion-database-filter-row input,.eotion-database-sort-row select { box-sizing:border-box; min-width:0; width:100%; min-height:36px; }
.eotion-database-filter-value { grid-column:1/3; grid-row:2; }
.eotion-database-filter-row>button { grid-column:3; grid-row:1; }
.eotion-database-filter-row button,.eotion-database-sort-row button,.eotion-database-column-row button { min-width:30px; min-height:32px; border:0; border-radius:4px; background:var(--surface-editor-hover); color:inherit; font:inherit; cursor:pointer; }
.eotion-database-column-row label { display:flex; align-items:center; gap:8px; min-width:0; flex:1; min-height:32px; overflow-wrap:normal; word-break:normal; white-space:normal; }
.eotion-database-column-row label input[type="checkbox"] { box-sizing:border-box; flex:0 0 18px; width:18px; min-width:18px; height:18px; min-height:18px; margin:0; }
.eotion-database-settings>button { margin-top:3px; }
.eotion-database-scroll { max-width:100%; overflow-x:auto; overscroll-behavior-inline:contain; border-top:1px solid var(--border-editor); }.eotion-database-table { width:max-content; min-width:100%; border-collapse:collapse; font-size:13px; }.eotion-database-table th,.eotion-database-table td { position:relative; width:180px; min-width:180px; max-width:260px; overflow-wrap:anywhere; border-right:1px solid var(--border-editor); border-bottom:1px solid var(--border-editor); padding:8px 11px; text-align:left; vertical-align:top; }.eotion-database-table th { color:var(--editor-muted); font-size:12px; font-weight:600; }.eotion-database-property-trigger,.eotion-database-cell-button { min-height:28px; border:0; padding:2px 4px; background:transparent; color:inherit; text-align:left; font:inherit; cursor:pointer; }.eotion-database-title { color:inherit; text-decoration:underline; text-decoration-color:var(--editor-muted); text-underline-offset:2px; }.eotion-database-cell-input { box-sizing:border-box; width:100%; min-height:32px; border:1px solid var(--border-editor); border-radius:4px; padding:4px 6px; color:inherit; font:inherit; }.eotion-database-cell-error { display:block; color:var(--danger); }
.eotion-database-popover { z-index:10000; display:grid; min-width:170px; max-width:min(280px,80vw); gap:5px; border:1px solid var(--border-editor); border-radius:8px; padding:8px; background:var(--surface-raised); box-shadow:var(--e-shadow-popover,0 8px 24px #0002); color:var(--editor-text); }.eotion-database-popover button { min-height:32px; border:0; border-radius:4px; padding:5px 8px; background:transparent; color:inherit; text-align:left; font:inherit; cursor:pointer; }.eotion-database-popover button:hover { background:var(--surface-editor-hover); }.eotion-database-popover form,.eotion-database-option-edit { display:flex; align-items:center; gap:4px; }.eotion-database-popover input { min-width:0; width:100%; min-height:32px; }.eotion-database-popover .danger { color:var(--danger); }.eotion-database-title-edit,.eotion-database-cell-save { margin-left:6px; min-height:28px; border:0; background:transparent; color:var(--editor-muted); font:inherit; cursor:pointer; }
.eotion-database-title-edit::before { content:'✎'; }
.eotion-database-title { text-decoration:none; }.eotion-database-title::before { content:'↗'; display:inline-block; margin-left:4px; color:var(--editor-muted); }
.eotion-database-cell-input,.eotion-database-popover input { background:var(--surface-raised); color:var(--editor-text); }
.eotion-database-popover button { flex-shrink:0; white-space:nowrap; }
.eotion-database-popover form input { flex:1; width:auto; }
.eotion-database-option-edit span { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.eotion-database-table tr:last-child td { border-bottom:0; }.eotion-database-state,.eotion-database-error { margin:0; padding:12px 14px; color:var(--editor-muted); font-size:13px; }.eotion-database-offline { margin:0; border-top:1px solid var(--border-editor); padding:7px 14px; color:var(--editor-muted); font-size:12px; }.eotion-database-error { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; color:var(--danger); }.eotion-database-more { margin:10px 14px; }
@media (max-width:767px) { .eotion-database-header { gap:6px; padding:9px 10px; flex-wrap:wrap; }.eotion-database-copy { flex-basis:calc(100% - 56px); }.eotion-database-view-controls { order:3; max-width:100%; overflow-x:auto; }.eotion-database-control-trigger { min-height:44px; padding-inline:8px; }.eotion-database-add { min-height:44px; padding-inline:7px; }.eotion-database-new { order:4; }.eotion-database-table th,.eotion-database-table td { width:160px; min-width:160px; }.eotion-database-cell-button,.eotion-database-property-trigger,.eotion-database-popover button { min-height:44px; }.eotion-database-cell-input { min-height:44px; }.eotion-database-filter-row { grid-template-columns:minmax(0,1fr) minmax(0,1fr) 44px; }.eotion-database-sort-row { grid-template-columns:minmax(0,1fr) minmax(0,1fr) 44px; }.eotion-database-filter-row select,.eotion-database-filter-row input,.eotion-database-sort-row select { min-height:44px; }.eotion-database-filter-row>button,.eotion-database-sort-row button,.eotion-database-column-row button { min-width:44px; min-height:44px; }.eotion-database-column-row label { min-height:44px; }.eotion-database-sort-row button:nth-of-type(1) { grid-column:1; grid-row:2; }.eotion-database-sort-row button:nth-of-type(2) { grid-column:2; grid-row:2; }.eotion-database-sort-row button:nth-of-type(3) { grid-column:3; grid-row:2; } }
</style>
