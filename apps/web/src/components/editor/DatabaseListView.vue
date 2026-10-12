<script setup lang="ts">
import type { DatabasePropertyResponse, DatabaseViewRecordsResponse } from '@eotion/contracts'
import type { DatabaseViewConfig } from '@eotion/domain/database'
import { computed } from 'vue'

type ListRecord = DatabaseViewRecordsResponse['records'][number]

const props = defineProps<{
  records: ListRecord[]
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
  if (props.config.visibleProperties === null) return orderedDetails.slice(0, 3)
  const visible = new Set(props.config.visibleProperties)
  return orderedDetails.filter(property => visible.has(property.id))
})

function cellValue(record: ListRecord, property: DatabasePropertyResponse): string {
  return props.formatValue(record.properties[property.id], property)
}

function openRecord(event: MouseEvent, pageId: string): void {
  emit('openRecord', event, pageId)
}
</script>

<template>
  <div class="eotion-database-list" data-testid="database-list" role="list" aria-label="数据库记录" @pointerdown.stop>
    <article v-for="record in records" :key="record.id" class="eotion-database-list-record" :data-record-id="record.id" role="listitem">
      <button
        class="eotion-database-list-title"
        type="button"
        :aria-label="`打开记录：${titleProperty ? cellValue(record, titleProperty) || '无标题' : '无标题'}`"
        @click="openRecord($event, record.pageId)"
      >
        <span class="eotion-database-list-title-text">{{ titleProperty ? cellValue(record, titleProperty) || '无标题' : '无标题' }}</span>
        <span class="eotion-database-list-open" aria-hidden="true">↗</span>
      </button>
      <dl v-if="detailProperties.length" class="eotion-database-list-properties">
        <div v-for="property in detailProperties" :key="property.id" class="eotion-database-list-property">
          <dt>{{ property.name }}</dt>
          <dd>{{ cellValue(record, property) || '—' }}</dd>
        </div>
      </dl>
    </article>
    <p v-if="records.length === 0" class="eotion-database-state">暂无记录</p>
  </div>
</template>

<style scoped>
.eotion-database-list { display:grid; gap:0; border-top:1px solid var(--border-editor); }
.eotion-database-list-record { display:grid; grid-template-columns:minmax(180px,1.1fr) minmax(0,2fr); gap:20px; align-items:center; min-width:0; border-bottom:1px solid var(--border-editor); padding:14px; }
.eotion-database-list-record:last-of-type { border-bottom:0; }
.eotion-database-list-title { display:flex; min-width:0; align-items:center; gap:8px; border:0; padding:5px 0; background:transparent; color:inherit; text-align:left; font:inherit; font-weight:600; cursor:pointer; }
.eotion-database-list-title:hover .eotion-database-list-title-text,.eotion-database-list-title:focus-visible .eotion-database-list-title-text { text-decoration:underline; text-underline-offset:3px; }
.eotion-database-list-title-text { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.eotion-database-list-open { flex:0 0 auto; color:var(--editor-muted); font-size:16px; font-weight:400; }
.eotion-database-list-properties { display:flex; flex-wrap:wrap; gap:8px 22px; min-width:0; margin:0; }
.eotion-database-list-property { display:grid; grid-template-columns:max-content minmax(0,1fr); gap:6px; min-width:120px; max-width:240px; }
.eotion-database-list-property dt { color:var(--editor-muted); font-size:12px; }
.eotion-database-list-property dd { min-width:0; overflow:hidden; margin:0; text-overflow:ellipsis; white-space:nowrap; }
.eotion-database-list .eotion-database-state { border-bottom:0; }
@media (max-width:767px) {
  .eotion-database-list-record { grid-template-columns:minmax(0,1fr); gap:8px; padding:12px 10px; }
  .eotion-database-list-properties { display:grid; grid-template-columns:minmax(0,1fr); gap:7px; }
  .eotion-database-list-property { grid-template-columns:minmax(72px,max-content) minmax(0,1fr); max-width:none; }
  .eotion-database-list-title { min-height:44px; }
}
</style>
