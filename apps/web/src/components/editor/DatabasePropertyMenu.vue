<script setup lang="ts">
import { computed, nextTick, ref, watch, type ComponentPublicInstance } from 'vue'
import type { DatabasePropertyResponse } from '@eotion/contracts'
import type { DatabasePropertyType } from '@eotion/domain/database'
import EotionContextMenu from '../ui/EotionContextMenu.vue'
import EotionIcon from '../ui/EotionIcon.vue'
import EotionPopover from '../ui/EotionPopover.vue'
import { IconName } from '../ui/icons'

const props = defineProps<{
  property: DatabasePropertyResponse
  disabled?: boolean
  teleportTo?: string | HTMLElement
}>()
const emit = defineEmits<{
  rename: [trigger: HTMLElement | null]
  changeType: [type: DatabasePropertyType]
  delete: []
}>()
const open = ref(false)
const showingTypes = ref(false)
const localTeleportTarget = ref<HTMLElement | null>(null)
const currentTrigger = ref<HTMLElement | null>(null)
const typeList = ref<HTMLElement | null>(null)
const popoverTeleportTo = computed(() => localTeleportTarget.value ?? props.teleportTo ?? 'body')
function triggerPropsWithOverlayTarget(triggerProps: Record<string, unknown>) {
  const click = triggerProps.onClick as ((event: MouseEvent) => void) | undefined
  return {
    ...triggerProps,
    ref: (element: Element | ComponentPublicInstance | null) => {
      const nativeElement = element instanceof Element ? element : element?.$el
      const native = nativeElement instanceof HTMLElement ? nativeElement : null
      currentTrigger.value = native
      localTeleportTarget.value = native?.closest<HTMLElement>('.eotion-product-overlay') ?? null
      const forwarded = triggerProps.ref as ((element: Element | ComponentPublicInstance | null) => void) | undefined
      forwarded?.(element)
    },
    onClick: (event: MouseEvent) => {
      currentTrigger.value = event.currentTarget as HTMLElement
      localTeleportTarget.value = (event.currentTarget as HTMLElement).closest<HTMLElement>('.eotion-product-overlay')
      click?.(event)
    },
  }
}
const addableTypes: { type: DatabasePropertyType; label: string }[] = [
  { type: 'text', label: '文本' }, { type: 'number', label: '数字' }, { type: 'checkbox', label: '复选框' },
  { type: 'select', label: '选择' }, { type: 'date', label: '日期' }, { type: 'relation', label: '关联' },
  { type: 'rollup', label: '汇总' }, { type: 'formula', label: '公式' },
]
const typeIcons: Record<DatabasePropertyType, IconName> = {
  title: IconName.Text, text: IconName.Text, number: IconName.Sort, checkbox: IconName.Check,
  select: IconName.ChevronDown, date: IconName.Appearance, relation: IconName.Link,
  rollup: IconName.Code, formula: IconName.Code,
}
function items(close: (restoreFocus?: boolean) => void) {
  return [
    { label: '重命名', icon: IconName.Rename, action: () => { close(false); emit('rename', currentTrigger.value) } },
    { label: '变更类型', icon: typeIcons[props.property.type], disabled: props.property.type === 'title', title: props.property.type === 'title' ? '标题属性不能更改类型' : undefined, action: () => { showingTypes.value = true } },
    { label: '删除', icon: IconName.Trash, danger: true, disabled: props.property.type === 'title', title: props.property.type === 'title' ? '标题属性不能删除' : undefined, action: () => { close(false); emit('delete') } },
  ]
}
watch(open, (value) => { if (!value) showingTypes.value = false })
watch(showingTypes, async (value) => {
  if (!value) return
  await nextTick()
  typeList.value?.querySelector<HTMLElement>(`[data-property-type="${props.property.type}"]`)?.focus()
})
</script>

<template>
  <EotionPopover v-model:open="open" :disabled="disabled" :label="`属性设置: ${property.name}`" :teleport-to="popoverTeleportTo" panel-width="210px">
    <template #trigger="{ triggerProps }"><slot name="trigger" :trigger-props="triggerPropsWithOverlayTarget(triggerProps)" /></template>
    <template #default="{ close }">
      <div v-if="!showingTypes">
        <EotionContextMenu :items="items(close)" />
      </div>
      <div v-else ref="typeList" class="database-property-types" role="group" aria-label="更改属性类型">
        <button v-for="item in addableTypes" :key="item.type" type="button" role="menuitem" :aria-current="property.type === item.type ? 'true' : undefined" :data-property-type="item.type" data-popover-item @click.stop="close(); showingTypes = false; if (item.type !== property.type) emit('changeType', item.type)">
          <EotionIcon :name="typeIcons[item.type]" :size="16" /><span>{{ item.label }}</span><EotionIcon v-if="property.type === item.type" :name="IconName.Check" :size="16" />
        </button>
      </div>
    </template>
  </EotionPopover>
</template>

<style scoped>
.database-property-types { display:flex; flex-direction:column; gap:2px; }
.database-property-types button { display:grid; width:100%; min-height:30px; grid-template-columns:16px minmax(0,1fr) 16px; align-items:center; gap:8px; border:0; border-radius:4px; padding:5px 6px; background:transparent; color:var(--e-color-text-secondary); text-align:left; font:inherit; cursor:pointer; }
.database-property-types button:hover,.database-property-types button[aria-current="true"] { background:var(--e-color-hover); color:var(--e-color-text-primary); }
.database-property-types button[aria-current="true"] { font-weight:600; }
</style>
