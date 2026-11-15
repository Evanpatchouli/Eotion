<script setup lang="ts">
import type { DatabasePropertyResponse, DatabaseViewGroupKey, DatabaseViewRecordsResponse } from '@eotion/contracts'
import type { DatabaseViewConfig } from '@eotion/domain/database'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import DatabaseSettingsSelect from './DatabaseSettingsSelect.vue'
import { databaseGroupKeyId, type DatabaseGroupWindow } from './databaseGroupWindows'

type BoardRecord = DatabaseViewRecordsResponse['records'][number]

const props = defineProps<{
  records: BoardRecord[]
  properties: DatabasePropertyResponse[]
  config: DatabaseViewConfig
  formatValue: (value: unknown, property: DatabasePropertyResponse) => string
  writable: boolean
  groupWindows?: readonly DatabaseGroupWindow[]
}>()

const emit = defineEmits<{
  openRecord: [event: MouseEvent, pageId: string]
  changeGroup: [recordId: string, optionId: string | null]
  groupVisible: [key: DatabaseViewGroupKey]
  toggleGroup: [key: DatabaseViewGroupKey, collapsed: boolean]
  loadGroupMore: [key: DatabaseViewGroupKey]
  moveGroup: [recordId: string, sourceKey: DatabaseViewGroupKey, targetKey: DatabaseViewGroupKey, anchorRecordId?: string, placement?: 'before' | 'after']
  reorderGroup: [recordId: string, anchorRecordId: string, placement: 'before' | 'after']
}>()

const draggedRecordId = ref<string | null>(null)
const draggedGroupPropertyId = ref<string | null>(null)
const dropTargetId = ref<string | null>(null)
const hasDropTarget = ref(false)
const boardCardTransferType = 'application/x-eotion-board-card'
const boardRoot = ref<HTMLElement | null>(null)
const groupedDrag = ref<{ recordId: string; sourceId: string } | null>(null)
const groupedTarget = ref<{ groupId: string; anchorId?: string; placement?: 'before' | 'after' } | null>(null)
const observerUnavailable = ref(false)
let groupObserver: IntersectionObserver | null = null
let observerEpoch = 0
let disposed = false

const titleProperty = computed(() => props.properties.find(property => property.type === 'title'))
const orderedProperties = computed(() => {
  const order = props.config.propertyOrder ?? []
  return [
    ...order.map(id => props.properties.find(property => property.id === id)).filter((property): property is DatabasePropertyResponse => Boolean(property)),
    ...props.properties.filter(property => !order.includes(property.id)),
  ]
})
const detailProperties = computed(() => {
  const titleId = titleProperty.value?.id
  const orderedDetails = orderedProperties.value.filter(property => property.id !== titleId)
  if (props.config.visibleProperties === null) return orderedDetails
  const visible = new Set(props.config.visibleProperties)
  return orderedDetails.filter(property => visible.has(property.id))
})
const groupingProperty = computed(() => {
  const propertyId = props.config.options?.groupByPropertyId
  return props.properties.find(property => property.id === propertyId && property.type === 'select')
})
const columns = computed(() => {
  const property = groupingProperty.value
  if (!property) return []

  const options = property.options ?? []
  const assigned = new Set(options.map(option => option.id))
  const groups: Array<{ id: string | null; name: string; records: BoardRecord[] }> = options.map(option => ({
    id: option.id,
    name: option.name,
    records: props.records.filter(record => {
      if (!Object.hasOwn(record.properties, property.id)) return false
      return record.properties[property.id] === option.id
    }),
  }))
  const unassigned = props.records.filter(record => {
    if (!Object.hasOwn(record.properties, property.id)) return true
    const value = record.properties[property.id]
    return value === null || typeof value !== 'string' || !assigned.has(value)
  })

  groups.push({ id: null, name: '未分组', records: unassigned })
  return groups
})

watch(() => [props.records, props.properties, props.config, props.writable], clearDragState, { deep: true })
watch(() => props.groupWindows, () => { clearDragState(); void observeGroups() }, { deep: true, flush: 'post' })

onMounted(() => { void observeGroups() })
onBeforeUnmount(() => { disposed = true; observerEpoch++; groupObserver?.disconnect(); groupObserver = null })

async function observeGroups(): Promise<void> {
  const epoch = ++observerEpoch
  groupObserver?.disconnect()
  groupObserver = null
  if (!props.groupWindows || typeof IntersectionObserver === 'undefined') {
    observerUnavailable.value = Boolean(props.groupWindows)
    return
  }
  observerUnavailable.value = false
  await nextTick()
  if (disposed || epoch !== observerEpoch || !props.groupWindows || !boardRoot.value) return
  const observer = new IntersectionObserver(entries => {
    if (disposed || epoch !== observerEpoch) return
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const id = (entry.target as HTMLElement).dataset.groupKey
      const group = props.groupWindows?.find(item => databaseGroupKeyId(item.key) === id)
      if (group && !group.collapsed && !group.hasLoaded && !group.loading && !group.error) {
        emit('groupVisible', group.key)
        observer.unobserve(entry.target)
      }
    }
  })
  groupObserver = observer
  for (const element of boardRoot.value.querySelectorAll<HTMLElement>('[data-group-key]')) observer.observe(element)
}

function clearDragState(): void {
  draggedRecordId.value = null
  draggedGroupPropertyId.value = null
  dropTargetId.value = null
  hasDropTarget.value = false
  groupedDrag.value = null
  groupedTarget.value = null
}

function findGroup(id: string): DatabaseGroupWindow | undefined {
  return props.groupWindows?.find(group => databaseGroupKeyId(group.key) === id)
}

function groupKeyId(key: DatabaseViewGroupKey): string { return databaseGroupKeyId(key) }

function groupedOptions(sourceId: string) {
  return (props.groupWindows ?? []).filter(group => databaseGroupKeyId(group.key) !== sourceId)
    .map(group => ({ value: databaseGroupKeyId(group.key), label: group.label }))
}

function moveWithPicker(recordId: string, sourceId: string, targetId: string): void {
  const source = findGroup(sourceId)
  const target = findGroup(targetId)
  if (props.writable && source && target && sourceId !== targetId) emit('moveGroup', recordId, source.key, target.key)
}

function reorderWithButton(group: DatabaseGroupWindow, recordId: string, direction: -1 | 1): void {
  if (!props.writable || props.config.sorts.length) return
  const index = group.records.findIndex(record => record.id === recordId)
  const neighbor = group.records[index + direction]
  if (index >= 0 && neighbor) emit('reorderGroup', recordId, neighbor.id, direction < 0 ? 'before' : 'after')
}

function groupedDragStart(event: DragEvent, recordId: string, sourceId: string): void {
  event.stopPropagation()
  if (!props.writable || !event.dataTransfer || !findGroup(sourceId)?.records.some(record => record.id === recordId)) {
    event.preventDefault(); clearDragState(); return
  }
  groupedDrag.value = { recordId, sourceId }
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData(boardCardTransferType, 'card')
}

function groupedDragOver(event: DragEvent, targetId: string, anchorId?: string): void {
  event.stopPropagation()
  const drag = groupedDrag.value
  const target = findGroup(targetId)
  if (!props.writable || !drag || !target || !event.dataTransfer?.types.includes(boardCardTransferType)) return
  if (drag.sourceId === targetId && (props.config.sorts.length > 0 || !anchorId || anchorId === drag.recordId)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  const rect = anchorId ? (event.currentTarget as HTMLElement).getBoundingClientRect() : null
  groupedTarget.value = { groupId: targetId, ...(anchorId ? { anchorId, placement: event.clientY < rect!.top + rect!.height / 2 ? 'before' : 'after' } as const : {}) }
}

function groupedDrop(event: DragEvent, targetId: string, anchorId?: string): void {
  event.stopPropagation()
  event.preventDefault()
  const drag = groupedDrag.value
  const source = drag && findGroup(drag.sourceId)
  const target = findGroup(targetId)
  const valid = event.dataTransfer?.getData(boardCardTransferType) === 'card'
  if (props.writable && valid && drag && source?.records.some(record => record.id === drag.recordId) && target) {
    if (drag.sourceId !== targetId) {
      if (anchorId && !props.config.sorts.length && target.records.some(record => record.id === anchorId)) {
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
        emit('moveGroup', drag.recordId, source.key, target.key, anchorId, event.clientY < rect.top + rect.height / 2 ? 'before' : 'after')
      } else emit('moveGroup', drag.recordId, source.key, target.key)
    } else if (anchorId && !props.config.sorts.length && anchorId !== drag.recordId && target.records.some(record => record.id === anchorId)) {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
      emit('reorderGroup', drag.recordId, anchorId, event.clientY < rect.top + rect.height / 2 ? 'before' : 'after')
    }
  }
  clearDragState()
}

function cellValue(record: BoardRecord, property: DatabasePropertyResponse): string {
  const value = Object.hasOwn(record.properties, property.id) ? record.properties[property.id] : null
  return props.formatValue(value, property)
}

function openRecord(event: MouseEvent, pageId: string): void {
  emit('openRecord', event, pageId)
}

function groupValue(record: BoardRecord, property: DatabasePropertyResponse): string {
  const value = Object.hasOwn(record.properties, property.id) ? record.properties[property.id] : null
  return typeof value === 'string' && property.options?.some(option => option.id === value) ? value : ''
}

function groupOptions(property: DatabasePropertyResponse) {
  return [
    { value: '', label: '未分组' },
    ...(property.options ?? []).map(option => ({ value: option.id, label: option.name })),
  ]
}

function onCardDragStart(event: DragEvent, record: BoardRecord): void {
  event.stopPropagation()
  const propertyId = groupingProperty.value?.id
  if (!props.writable || !propertyId || !event.dataTransfer) {
    event.preventDefault()
    clearDragState()
    return
  }
  draggedRecordId.value = record.id
  draggedGroupPropertyId.value = propertyId
  dropTargetId.value = null
  hasDropTarget.value = false
  event.dataTransfer.effectAllowed = 'move'
  // The transferred value is only a marker. The record identity stays in this component.
  event.dataTransfer.setData(boardCardTransferType, 'card')
}

function onCardDragEnd(event: DragEvent): void {
  event.stopPropagation()
  clearDragState()
}

function onColumnDragOver(event: DragEvent, optionId: string | null): void {
  event.stopPropagation()
  if (!props.writable || !draggedRecordId.value || !event.dataTransfer?.types.includes(boardCardTransferType)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  hasDropTarget.value = true
  dropTargetId.value = optionId
}

function onColumnDragLeave(event: DragEvent, optionId: string | null): void {
  event.stopPropagation()
  const nextTarget = event.relatedTarget
  if (nextTarget instanceof Node && (event.currentTarget as HTMLElement).contains(nextTarget)) return
  if (hasDropTarget.value && dropTargetId.value === optionId) {
    hasDropTarget.value = false
    dropTargetId.value = null
  }
}

function onColumnDrop(event: DragEvent, optionId: string | null): void {
  event.stopPropagation()
  event.preventDefault()
  const recordId = draggedRecordId.value
  const propertyId = groupingProperty.value?.id
  const validTransfer = event.dataTransfer?.getData(boardCardTransferType) === 'card'
  const recordExists = recordId !== null && props.records.some(record => record.id === recordId)
  if (props.writable && validTransfer && recordExists && propertyId && draggedGroupPropertyId.value === propertyId) {
    emit('changeGroup', recordId, optionId)
  }
  clearDragState()
}

function updateGroup(recordId: string, value: string): void {
  emit('changeGroup', recordId, value === '' ? null : value)
}
</script>

<template>
  <div ref="boardRoot" class="eotion-database-board" data-testid="database-board" @pointerdown.stop @dragstart.stop @dragover.stop @drop.stop>
    <div v-if="groupWindows" class="eotion-database-board-columns">
      <section
        v-for="group in groupWindows" :key="groupKeyId(group.key)"
        class="eotion-database-board-column" :data-group-key="groupKeyId(group.key)"
        :aria-label="group.label"
        :class="{ 'is-drop-target': groupedTarget?.groupId === groupKeyId(group.key) }"
        @dragover="groupedDragOver($event, groupKeyId(group.key))"
        @drop="groupedDrop($event, groupKeyId(group.key))"
      >
        <h3 class="eotion-database-board-column-title">
          <button type="button" class="eotion-database-board-collapse" :aria-expanded="!group.collapsed" :aria-label="`${group.collapsed ? '展开' : '折叠'}分组：${group.label}`" @click="emit('toggleGroup', group.key, !group.collapsed)">{{ group.collapsed ? '▸' : '▾' }} <span class="eotion-database-board-column-name">{{ group.label }}</span></button>
          <span v-if="group.hasLoaded">{{ group.nextCursor === null ? group.records.length : `已加载 ${group.records.length}` }}</span>
        </h3>
        <template v-if="!group.collapsed">
          <p v-if="group.loading && !group.hasLoaded" class="eotion-database-state" role="status">正在加载…</p>
          <p v-else-if="!group.hasLoaded && !group.error" class="eotion-database-state">尚未加载</p>
          <p v-if="group.error" class="eotion-database-state" role="alert">{{ group.error }}</p>
          <button v-if="group.error || observerUnavailable && !group.hasLoaded && !group.loading" type="button" class="eotion-database-board-action" @click="emit('groupVisible', group.key)">{{ group.error ? '重试加载' : '加载分组' }}</button>
          <p v-if="group.hasLoaded && group.records.length === 0" class="eotion-database-state">暂无记录</p>
          <article
            v-for="(record, index) in group.records" :key="record.id"
            class="eotion-database-board-card" :data-record-id="record.id"
            :class="{ 'is-drop-anchor': groupedTarget?.groupId === groupKeyId(group.key) && groupedTarget.anchorId === record.id }"
            :draggable="writable" @dragstart="groupedDragStart($event, record.id, groupKeyId(group.key))"
            @dragend="clearDragState" @dragover="groupedDragOver($event, groupKeyId(group.key), record.id)"
            @drop="groupedDrop($event, groupKeyId(group.key), record.id)"
          >
            <button class="eotion-database-board-card-title" type="button" :aria-label="`打开记录：${titleProperty ? cellValue(record, titleProperty) || '无标题' : '无标题'}`" @click="openRecord($event, record.pageId)">{{ titleProperty ? cellValue(record, titleProperty) || '无标题' : '无标题' }}</button>
            <DatabaseSettingsSelect v-if="writable && groupedOptions(groupKeyId(group.key)).length" class="eotion-database-board-group-select" model-value="" :options="groupedOptions(groupKeyId(group.key))" :label="`移动记录分组：${group.label}`" @update:model-value="moveWithPicker(record.id, groupKeyId(group.key), $event)" />
            <div v-if="writable && !config.sorts.length" class="eotion-database-board-order-actions">
              <button type="button" :disabled="index === 0" :aria-label="`上移记录：${record.id}`" @click="reorderWithButton(group, record.id, -1)">上移</button>
              <button type="button" :disabled="index === group.records.length - 1" :aria-label="`下移记录：${record.id}`" @click="reorderWithButton(group, record.id, 1)">下移</button>
            </div>
            <dl v-if="detailProperties.length" class="eotion-database-board-properties"><div v-for="property in detailProperties" :key="property.id" class="eotion-database-board-property"><dt>{{ property.name }}</dt><dd>{{ cellValue(record, property) || '—' }}</dd></div></dl>
          </article>
          <button v-if="group.hasLoaded && group.nextCursor !== null" type="button" class="eotion-database-board-action" :disabled="group.loading" @click="emit('loadGroupMore', group.key)">{{ group.loading ? '正在加载…' : '加载更多' }}</button>
        </template>
      </section>
    </div>
    <p v-else-if="!groupingProperty" class="eotion-database-state">尚未配置分组属性</p>
    <div v-else-if="columns.length" class="eotion-database-board-columns">
      <section
        v-for="column in columns"
        :key="column.id === null ? 'empty:' : `option:${column.id}`"
        class="eotion-database-board-column"
        :data-option-id="column.id ?? ''"
        :aria-label="column.name"
        :class="{ 'is-drop-target': hasDropTarget && dropTargetId === column.id }"
        @dragover="onColumnDragOver($event, column.id)"
        @dragleave="onColumnDragLeave($event, column.id)"
        @drop="onColumnDrop($event, column.id)"
      >
        <h3 class="eotion-database-board-column-title"><span class="eotion-database-board-column-name">{{ column.name }}</span><span>{{ column.records.length }}</span></h3>
        <article v-for="record in column.records" :key="record.id" class="eotion-database-board-card" :data-record-id="record.id" :draggable="writable" @dragstart="onCardDragStart($event, record)" @dragend="onCardDragEnd">
          <button
            class="eotion-database-board-card-title"
            type="button"
            :aria-label="`打开记录：${titleProperty ? cellValue(record, titleProperty) || '无标题' : '无标题'}`"
            @click="openRecord($event, record.pageId)"
          >
            {{ titleProperty ? cellValue(record, titleProperty) || '无标题' : '无标题' }}
          </button>
          <DatabaseSettingsSelect
            v-if="groupingProperty"
            class="eotion-database-board-group-select"
            :model-value="groupValue(record, groupingProperty)"
            :options="groupOptions(groupingProperty)"
            label="移动记录分组"
            :disabled="!writable"
            @update:model-value="updateGroup(record.id, $event)"
          />
          <dl v-if="detailProperties.length" class="eotion-database-board-properties">
            <div v-for="property in detailProperties" :key="property.id" class="eotion-database-board-property">
              <dt>{{ property.name }}</dt>
              <dd>{{ cellValue(record, property) || '—' }}</dd>
            </div>
          </dl>
        </article>
      </section>
    </div>
    <p v-else class="eotion-database-state">暂无可显示的分组选项或记录。</p>
  </div>
</template>

<style scoped>
.eotion-database-board { min-width:0; max-width:100%; overflow:hidden; border-top:1px solid var(--border-editor); }
.eotion-database-board-columns { display:flex; align-items:flex-start; gap:12px; max-width:100%; min-width:0; overflow-x:auto; padding:12px; overscroll-behavior-inline:contain; }
.eotion-database-board-column { box-sizing:border-box; display:grid; flex:0 0 260px; gap:8px; min-width:240px; max-width:320px; min-height:96px; border:1px solid var(--border-editor); border-radius:8px; padding:8px; background:var(--surface-editor-hover); transition:border-color .12s ease,background-color .12s ease; }
.eotion-database-board-column.is-drop-target { border-color:var(--e-color-focus); background:color-mix(in srgb,var(--e-color-focus) 9%,var(--surface-editor-hover)); }
.eotion-database-board-card.is-drop-anchor { border-color:var(--e-color-focus); }
.eotion-database-board-collapse { min-width:0; border:0; background:transparent; color:inherit; font:inherit; font-weight:inherit; text-align:left; overflow-wrap:anywhere; cursor:pointer; }
.eotion-database-board-action,.eotion-database-board-order-actions button { min-height:32px; border:1px solid var(--border-editor); border-radius:5px; padding:5px 8px; background:var(--surface-raised); color:var(--editor-text); font:inherit; font-size:12px; cursor:pointer; }
.eotion-database-board-order-actions { display:flex; gap:6px; margin-top:8px; }
.eotion-database-board-order-actions button:disabled { opacity:.5; cursor:default; }
.eotion-database-board-column-title { display:flex; align-items:center; justify-content:space-between; gap:8px; min-width:0; margin:0; padding:3px 2px 7px; color:var(--editor-text); font-size:13px; font-weight:600; }
.eotion-database-board-column-title span { color:var(--editor-muted); font-size:12px; font-weight:400; }
.eotion-database-board-column-title .eotion-database-board-column-name { min-width:0; overflow-wrap:anywhere; color:inherit; font-size:inherit; font-weight:inherit; }
.eotion-database-board-card { min-width:0; border:1px solid var(--border-editor); border-radius:6px; padding:10px; background:var(--surface-raised); color:var(--editor-text); }
.eotion-database-board-card[draggable="true"] { cursor:grab; }
.eotion-database-board-card[draggable="true"]:active { cursor:grabbing; }
.eotion-database-board-card-title { display:block; width:100%; min-height:32px; border:0; padding:4px 0; background:transparent; color:inherit; text-align:left; font:inherit; font-weight:600; overflow-wrap:anywhere; cursor:pointer; }
.eotion-database-board-card-title:hover,.eotion-database-board-card-title:focus-visible { text-decoration:underline; text-underline-offset:3px; }
.eotion-database-board-group-select { margin-top:8px; }
.eotion-database-board-properties { display:grid; gap:7px; min-width:0; margin:7px 0 0; }
.eotion-database-board-property { display:grid; gap:2px; min-width:0; }
.eotion-database-board-property dt { color:var(--editor-muted); font-size:11px; }
.eotion-database-board-property dd { min-width:0; margin:0; overflow-wrap:anywhere; font-size:12px; }
.eotion-database-board .eotion-database-state { margin:0; padding:12px 14px; color:var(--editor-muted); font-size:13px; }
@media (max-width:767px) {
  .eotion-database-board-columns { flex-direction:column; gap:8px; overflow-x:hidden; padding:10px; }
  .eotion-database-board-column { flex:0 0 auto; width:100%; min-width:0; max-width:none; }
  .eotion-database-board-card-title { min-height:44px; }
  .eotion-database-board-action,.eotion-database-board-order-actions button { min-height:44px; }
}
</style>
