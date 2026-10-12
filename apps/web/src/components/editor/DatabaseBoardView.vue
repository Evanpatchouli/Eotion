<script setup lang="ts">
import type { DatabasePropertyResponse, DatabaseViewRecordsResponse } from '@eotion/contracts'
import type { DatabaseViewConfig } from '@eotion/domain/database'
import { computed } from 'vue'

type BoardRecord = DatabaseViewRecordsResponse['records'][number]

const props = defineProps<{
  records: BoardRecord[]
  properties: DatabasePropertyResponse[]
  config: DatabaseViewConfig
  formatValue: (value: unknown, property: DatabasePropertyResponse) => string
}>()

const emit = defineEmits<{
  openRecord: [event: MouseEvent, pageId: string]
}>()

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

  if (unassigned.length) groups.push({ id: null, name: '未分组', records: unassigned })
  return groups
})

function cellValue(record: BoardRecord, property: DatabasePropertyResponse): string {
  const value = Object.hasOwn(record.properties, property.id) ? record.properties[property.id] : null
  return props.formatValue(value, property)
}

function openRecord(event: MouseEvent, pageId: string): void {
  emit('openRecord', event, pageId)
}
</script>

<template>
  <div class="eotion-database-board" data-testid="database-board" @pointerdown.stop>
    <p v-if="!groupingProperty" class="eotion-database-state">尚未配置分组属性</p>
    <div v-else-if="columns.length" class="eotion-database-board-columns">
      <section
        v-for="column in columns"
        :key="column.id === null ? 'empty:' : `option:${column.id}`"
        class="eotion-database-board-column"
        :data-option-id="column.id ?? ''"
        :aria-label="column.name"
      >
        <h3 class="eotion-database-board-column-title"><span class="eotion-database-board-column-name">{{ column.name }}</span><span>{{ column.records.length }}</span></h3>
        <article v-for="record in column.records" :key="record.id" class="eotion-database-board-card" :data-record-id="record.id">
          <button
            class="eotion-database-board-card-title"
            type="button"
            :aria-label="`打开记录：${titleProperty ? cellValue(record, titleProperty) || '无标题' : '无标题'}`"
            @click="openRecord($event, record.pageId)"
          >
            {{ titleProperty ? cellValue(record, titleProperty) || '无标题' : '无标题' }}
          </button>
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
.eotion-database-board-column { box-sizing:border-box; display:grid; flex:0 0 260px; gap:8px; min-width:240px; max-width:320px; border:1px solid var(--border-editor); border-radius:8px; padding:8px; background:var(--surface-editor-hover); }
.eotion-database-board-column-title { display:flex; align-items:center; justify-content:space-between; gap:8px; min-width:0; margin:0; padding:3px 2px 7px; color:var(--editor-text); font-size:13px; font-weight:600; }
.eotion-database-board-column-title span { color:var(--editor-muted); font-size:12px; font-weight:400; }
.eotion-database-board-column-title .eotion-database-board-column-name { min-width:0; overflow-wrap:anywhere; color:inherit; font-size:inherit; font-weight:inherit; }
.eotion-database-board-card { min-width:0; border:1px solid var(--border-editor); border-radius:6px; padding:10px; background:var(--surface-raised); color:var(--editor-text); }
.eotion-database-board-card-title { display:block; width:100%; min-height:32px; border:0; padding:4px 0; background:transparent; color:inherit; text-align:left; font:inherit; font-weight:600; overflow-wrap:anywhere; cursor:pointer; }
.eotion-database-board-card-title:hover,.eotion-database-board-card-title:focus-visible { text-decoration:underline; text-underline-offset:3px; }
.eotion-database-board-properties { display:grid; gap:7px; min-width:0; margin:7px 0 0; }
.eotion-database-board-property { display:grid; gap:2px; min-width:0; }
.eotion-database-board-property dt { color:var(--editor-muted); font-size:11px; }
.eotion-database-board-property dd { min-width:0; margin:0; overflow-wrap:anywhere; font-size:12px; }
.eotion-database-board .eotion-database-state { margin:0; padding:12px 14px; color:var(--editor-muted); font-size:13px; }
@media (max-width:767px) {
  .eotion-database-board-columns { flex-direction:column; gap:8px; overflow-x:hidden; padding:10px; }
  .eotion-database-board-column { flex:0 0 auto; width:100%; min-width:0; max-width:none; }
  .eotion-database-board-card-title { min-height:44px; }
}
</style>
