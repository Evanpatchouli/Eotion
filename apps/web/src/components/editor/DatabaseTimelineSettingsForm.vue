<script setup lang="ts">
import type { DatabasePropertyResponse } from '@eotion/contracts'
import type { DatabaseTimelineViewOptions, DatabaseViewConfig, TimelineShiftMode } from '@eotion/domain/database'
import { computed, ref, watch } from 'vue'
import DatabaseSettingsSelect from './DatabaseSettingsSelect.vue'
import EotionSwitch from '../ui/EotionSwitch.vue'
import EotionIconButton from '../ui/EotionIconButton.vue'
import { IconName } from '../ui/icons'

const props = defineProps<{
  config: DatabaseViewConfig
  properties: readonly DatabasePropertyResponse[]
  databaseId: string
  disabled?: boolean
  saving?: boolean
  error?: string
}>()
const emit = defineEmits<{ save: [config: DatabaseViewConfig] }>()

type TimelineOptions = NonNullable<DatabaseTimelineViewOptions['timeline']>
type FrozenOptions = NonNullable<TimelineOptions['frozenTable']>
type DependencyOptions = NonNullable<TimelineOptions['dependency']>

const draft = ref<TimelineOptions>({})
const baseline = ref<TimelineOptions>({})
const isDirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(baseline.value))
const orderedProperties = computed(() => {
  const order = draft.value.frozenTable?.propertyOrder
  if (!order) return [...props.properties]
  const ordered = order
    .map(id => props.properties.find(property => property.id === id))
    .filter((property): property is DatabasePropertyResponse => Boolean(property))
  const unordered = props.properties.filter(property => !order.includes(property.id))
  return [...ordered, ...unordered]
})
const visibleIds = computed(() => draft.value.frozenTable?.visibleProperties ?? props.properties.map(property => property.id))
const titleProperty = computed(() => props.properties.find(property => property.type === 'title'))
const selfRelations = computed(() => props.properties.filter(property => property.type === 'relation'
  && (property.config as { targetDatabaseId?: unknown } | null)?.targetDatabaseId === props.databaseId))
const dependencyEnabled = computed(() => Boolean(draft.value.dependency))
const dependencyPropertyId = computed(() => draft.value.dependency?.propertyId ?? '')

watch(() => [props.config, props.properties, props.databaseId] as const, () => {
  const options = props.config.options as DatabaseTimelineViewOptions | undefined
  draft.value = options?.timeline ?? {}
  baseline.value = draft.value
}, { immediate: true })

function updateFrozen(update: Partial<FrozenOptions>): void {
  const frozen = draft.value.frozenTable ?? { visible: false, visibleProperties: null, propertyOrder: null }
  draft.value = { ...draft.value, frozenTable: { ...frozen, ...update } }
}

function toggleProperty(propertyId: string): void {
  const property = props.properties.find(item => item.id === propertyId)
  if (!property || property.type === 'title') return
  const next = new Set(visibleIds.value)
  if (next.has(propertyId)) next.delete(propertyId)
  else next.add(propertyId)
  if (titleProperty.value) next.add(titleProperty.value.id)
  updateFrozen({ visibleProperties: next.size === props.properties.length ? null : [...next] })
}

function moveProperty(propertyId: string, delta: number): void {
  const current = orderedProperties.value.map(property => property.id)
  const index = current.indexOf(propertyId)
  const target = index + delta
  if (index < 0 || target < 0 || target >= current.length) return
  const [id] = current.splice(index, 1)
  if (!id) return
  current.splice(target, 0, id)
  const defaultOrder = props.properties.map(property => property.id)
  updateFrozen({ propertyOrder: current.every((item, itemIndex) => item === defaultOrder[itemIndex]) ? null : current })
}

function setDependencyEnabled(enabled: boolean): void {
  if (!enabled) {
    const timeline = { ...draft.value }
    delete timeline.dependency
    draft.value = timeline
    return
  }
  const propertyId = selfRelations.value.some(property => property.id === dependencyPropertyId.value)
    ? dependencyPropertyId.value
    : selfRelations.value[0]?.id ?? ''
  if (!propertyId) return
  draft.value = {
    ...draft.value,
    dependency: { propertyId, direction: 'depends-on', shiftMode: 'shift_when_overlapping', avoidWeekends: false },
  }
}

function updateDependency(update: Partial<DependencyOptions>): void {
  if (!draft.value.dependency) return
  draft.value = { ...draft.value, dependency: { ...draft.value.dependency, ...update } }
}

function save(): void {
  if (!isDirty.value) return
  const outer = { ...((props.config.options as Record<string, unknown> | undefined) ?? {}) }
  outer.timeline = draft.value
  emit('save', { ...props.config, options: outer })
}
defineExpose({ save, isDirty })
</script>

<template>
  <section class="eotion-database-settings timeline-settings" role="group" aria-label="时间线设置" @click.stop>
    <div class="timeline-settings__section">
      <div class="timeline-settings__switch-row">
        <div><strong>冻结表格</strong><p>在时间线左侧显示属性列。</p></div>
        <EotionSwitch :model-value="draft.frozenTable?.visible === true" label="显示冻结表格" :disabled="disabled || saving" @update:model-value="updateFrozen({ visible: $event })" />
      </div>
      <div class="timeline-settings__columns" role="group" aria-label="冻结表格属性">
        <div v-for="(property, index) in orderedProperties" :key="property.id" class="timeline-settings__property">
          <label><input type="checkbox" :checked="property.type === 'title' || visibleIds.includes(property.id)" :disabled="property.type === 'title' || disabled || saving" @change="toggleProperty(property.id)"><span>{{ property.type === 'title' ? '标题（始终显示）' : property.name }}</span></label>
          <div class="timeline-settings__order">
            <EotionIconButton :name="IconName.ArrowUp" :label="`上移属性 ${property.name}`" :disabled="index === 0 || disabled || saving" @click="moveProperty(property.id, -1)" />
            <EotionIconButton :name="IconName.ArrowDown" :label="`下移属性 ${property.name}`" :disabled="index === orderedProperties.length - 1 || disabled || saving" @click="moveProperty(property.id, 1)" />
          </div>
        </div>
      </div>
    </div>

    <div class="timeline-settings__section">
      <div class="timeline-settings__switch-row">
        <div><strong>依赖关系</strong><p>使用本数据库中的关联属性连接记录。</p></div>
        <EotionSwitch :model-value="dependencyEnabled" label="启用时间线依赖关系" :disabled="disabled || saving || (!dependencyEnabled && !selfRelations.length)" @update:model-value="setDependencyEnabled" />
      </div>
      <p v-if="!selfRelations.length" class="timeline-settings__hint">当前数据库没有关联到自身的关联属性。请先在“属性”中新增关联属性，并将目标数据库设为当前数据库。</p>
      <template v-else-if="draft.dependency">
        <DatabaseSettingsSelect :model-value="draft.dependency.propertyId" :options="selfRelations.map(property => ({ value: property.id, label: property.name }))" label="依赖关联属性" :disabled="disabled || saving" @update:model-value="updateDependency({ propertyId: $event })" />
        <DatabaseSettingsSelect :model-value="draft.dependency.direction" :options="[{ value: 'depends-on', label: '记录关联其前置项' }, { value: 'blocks', label: '记录关联其后续项' }]" label="依赖方向" :disabled="disabled || saving" @update:model-value="updateDependency({ direction: $event as DependencyOptions['direction'] })" />
        <DatabaseSettingsSelect :model-value="draft.dependency.shiftMode" :options="[{ value: 'shift_when_overlapping', label: '仅重叠时偏移' }, { value: 'shift_and_keep_gap', label: '偏移并保持间隔' }, { value: 'no_auto_shift', label: '不自动偏移' }]" label="自动调整日期" :disabled="disabled || saving" @update:model-value="updateDependency({ shiftMode: $event as TimelineShiftMode })" />
        <div class="timeline-settings__switch-row timeline-settings__compact-switch"><span>避免周末</span><EotionSwitch :model-value="draft.dependency.avoidWeekends" label="避免周末" :disabled="disabled || saving" @update:model-value="updateDependency({ avoidWeekends: $event })" /></div>
      </template>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.timeline-settings { display: grid; gap: 18px; }
.timeline-settings__section { display: grid; gap: 10px; }
.timeline-settings__section + .timeline-settings__section { padding-top: 14px; border-top: 1px solid var(--border-editor); }
.timeline-settings__switch-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.timeline-settings__switch-row strong { font-size: 13px; }
.timeline-settings__switch-row p, .timeline-settings__hint { margin: 3px 0 0; color: var(--editor-text-muted); font-size: 12px; line-height: 1.5; }
.timeline-settings__columns { display: grid; gap: 2px; }
.timeline-settings__property { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 40px; }
.timeline-settings__property label { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 12px; }
.timeline-settings__property label span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.timeline-settings__property input { accent-color: var(--e-color-accent); }
.timeline-settings__order { display: flex; gap: 2px; }
.timeline-settings__compact-switch { min-height: 36px; font-size: 12px; }
</style>
