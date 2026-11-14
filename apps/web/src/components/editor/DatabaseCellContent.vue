<script setup lang="ts">
import type { DatabasePropertyResponse, DatabaseViewRecordsResponse } from '@eotion/contracts'
import type { ComponentPublicInstance } from 'vue'

type RecordRow = DatabaseViewRecordsResponse['records'][number]
defineProps<{
  record: RecordRow
  property: DatabasePropertyResponse
  displayText: string
  propertyName: string
  value: unknown
  mode: 'table' | 'timeline'
  touch: boolean
  disabled: boolean
  saving: boolean
  selected: boolean
  editing: boolean
  draft: string
  error: string
}>()
const emit = defineEmits<{
  edit: [event: MouseEvent]
  openRecord: [event: MouseEvent]
  updateDraft: [value: string]
  inputRef: [element: Element | null]
  save: []
  cancel: []
  enter: [event: KeyboardEvent]
  checkbox: []
  select: [event: MouseEvent]
  relation: [event: MouseEvent]
}>()
function inputRef(element: Element | ComponentPublicInstance | null): void { emit('inputRef', element instanceof Element ? element : null) }
function onInput(event: Event): void { emit('updateDraft', (event.target as HTMLInputElement).value) }
</script>

<template>
  <div class="eotion-database-cell-content" :class="{ 'is-title': property.type === 'title', 'is-touch': touch, 'is-timeline': mode === 'timeline' }">
    <template v-if="property.type === 'title'">
      <input v-if="editing" :value="draft" :ref="inputRef" class="eotion-database-cell-input" type="text" :aria-label="`${propertyName} 值`"
        :disabled="saving || disabled" @input="onInput" @keydown.enter="emit('enter', $event)" @keydown.tab.stop @keydown.esc.prevent="emit('cancel')" @blur="emit('save')">
      <button v-else class="eotion-database-cell-button eotion-database-title-body" type="button" :disabled="disabled"
        :aria-label="`编辑${propertyName}：${displayText}`" @click.stop="emit('edit', $event)">{{ displayText }}</button>
      <button class="eotion-database-title-detail" type="button" :tabindex="editing ? -1 : 0"
        :aria-label="`打开记录：${displayText}`" :aria-pressed="mode === 'timeline' ? selected : undefined" @pointerdown.stop @mousedown.stop @click.stop="emit('openRecord', $event)"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M7 7h10v10" /></svg></button>
    </template>
    <template v-else-if="editing && property.type === 'date' && mode === 'table'"><slot name="date-editor" /></template>
    <input v-else-if="editing && property.type !== 'date'" :value="draft" :ref="inputRef" class="eotion-database-cell-input"
      :inputmode="property.type === 'number' ? 'decimal' : undefined" :aria-label="`${propertyName} 值`" :disabled="saving || disabled"
      @input="onInput" @keydown.enter="emit('enter', $event)" @keydown.tab.stop @keydown.esc.prevent="emit('cancel')" @blur="emit('save')">
    <button v-else-if="property.type === 'checkbox'" class="eotion-database-cell-button" type="button" :disabled="disabled"
      :aria-pressed="value === true" @click.stop="emit('checkbox')">{{ displayText }}</button>
    <button v-else-if="property.type === 'select'" class="eotion-database-cell-button" type="button" :disabled="disabled"
      @click.stop="emit('select', $event)">{{ displayText }}</button>
    <button v-else-if="property.type === 'relation'" class="eotion-database-cell-button" type="button" :disabled="disabled"
      :aria-label="`编辑关联 ${property.name}`" @click.stop="emit('relation', $event)">{{ displayText }}</button>
    <span v-else-if="property.type === 'rollup' || property.type === 'formula'" class="eotion-database-derived-value"
      :aria-label="`${property.name}，只读`">{{ displayText }}</span>
    <span v-else-if="editing && property.type === 'date'" class="eotion-database-cell-button" aria-live="polite">{{ displayText }}</span>
    <button v-else class="eotion-database-cell-button" type="button" :disabled="disabled"
      :aria-label="property.type === 'date' ? `编辑${propertyName}：${displayText}` : undefined" @click.stop="emit('edit', $event)">{{ displayText }}</button>
    <button v-if="editing && property.type !== 'date'" class="eotion-database-cell-save" type="button" tabindex="-1"
      :disabled="saving || disabled" @pointerdown.prevent @click.stop="emit('save')">保存</button>
    <small v-if="editing && error" class="eotion-database-cell-error" role="alert">{{ error }} <button type="button" @click.stop="emit('save')">重试</button></small>
  </div>
</template>

<style scoped>
.eotion-database-cell-content { display:block; min-width:0; }
.eotion-database-cell-content.is-title { display:flex; align-items:center; gap:4px; }
.eotion-database-cell-content.is-timeline { width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.eotion-database-cell-button { box-sizing:border-box; width:100%; min-height:28px; border:0; padding:2px 4px; background:transparent; color:inherit; text-align:left; font:inherit; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:pointer; }
.eotion-database-cell-button:disabled { cursor:default; }
.eotion-database-cell-input { box-sizing:border-box; width:100%; min-width:0; min-height:32px; border:1px solid var(--border-editor); border-radius:4px; padding:4px 6px; background:var(--surface-raised); color:var(--editor-text); font:inherit; }
.eotion-database-title-body { flex:1 1 auto; min-width:0; }
.eotion-database-title-detail { display:inline-flex; flex:0 0 28px; width:28px; min-width:28px; min-height:28px; align-items:center; justify-content:center; border:0; border-radius:5px; padding:0; background:transparent; color:var(--editor-muted); font:inherit; opacity:0; cursor:pointer; }
.eotion-database-cell-content:hover .eotion-database-title-detail,.eotion-database-cell-content:focus-within .eotion-database-title-detail,.is-touch .eotion-database-title-detail { opacity:1; }
.is-touch .eotion-database-title-detail { flex-basis:44px; width:44px; min-width:44px; min-height:44px; }
.eotion-database-title-detail:hover,.eotion-database-title-detail:focus-visible { background:var(--surface-editor-hover); color:var(--editor-text); }
.eotion-database-derived-value { display:block; min-height:28px; padding:2px 4px; color:var(--editor-muted); overflow:hidden; text-overflow:ellipsis; }
.eotion-database-cell-save { margin-left:6px; min-height:28px; border:0; background:transparent; color:var(--editor-muted); font:inherit; cursor:pointer; }
.eotion-database-cell-error { display:block; color:var(--danger); white-space:normal; }
@media (hover:none) { .eotion-database-title-detail { flex-basis:44px; width:44px; min-width:44px; min-height:44px; opacity:1; } }
@media (max-width:767px) { .eotion-database-cell-button,.eotion-database-cell-input { min-height:44px; } }
</style>
