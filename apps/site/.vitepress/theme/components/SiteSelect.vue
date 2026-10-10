<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'

export interface SiteSelectOption {
  value: string
  label: string
}

const props = withDefaults(defineProps<{
  id: string
  modelValue: string
  options: SiteSelectOption[]
  ariaLabel: string
}>(), {
  options: () => [],
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const optionButtons = ref<HTMLButtonElement[]>([])
const open = ref(false)
const activeIndex = ref(0)
const listboxId = computed(() => `${props.id}-listbox`)
const selected = computed(() => props.options.find((option) => option.value === props.modelValue) ?? props.options[0])

function setOptionRef(element: HTMLButtonElement | null, index: number): void {
  if (element) optionButtons.value[index] = element
}
function focusActive(): void {
  void nextTick(() => optionButtons.value[activeIndex.value]?.focus())
}
function openMenu(index?: number): void {
  const selectedIndex = props.options.findIndex((option) => option.value === props.modelValue)
  activeIndex.value = index ?? Math.max(0, selectedIndex)
  open.value = true
  focusActive()
}
function closeMenu(restoreFocus = false): void {
  open.value = false
  if (restoreFocus) void nextTick(() => trigger.value?.focus())
}
function choose(value: string): void {
  emit('update:modelValue', value)
  closeMenu(true)
}
function move(delta: number): void {
  if (!props.options.length) return
  activeIndex.value = (activeIndex.value + delta + props.options.length) % props.options.length
  focusActive()
}
function onTriggerKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const selectedIndex = Math.max(0, props.options.findIndex((option) => option.value === props.modelValue))
    openMenu(event.key === 'ArrowDown'
      ? Math.min(props.options.length - 1, selectedIndex + 1)
      : Math.max(0, selectedIndex - 1))
    return
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    open.value ? closeMenu() : openMenu()
  }
}
function onOptionKeydown(event: KeyboardEvent, option: SiteSelectOption): void {
  if (event.key === 'ArrowDown') { event.preventDefault(); move(1); return }
  if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); return }
  if (event.key === 'Home') { event.preventDefault(); activeIndex.value = 0; focusActive(); return }
  if (event.key === 'End') { event.preventDefault(); activeIndex.value = props.options.length - 1; focusActive(); return }
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(option.value); return }
  if (event.key === 'Escape') { event.preventDefault(); closeMenu(true); return }
  if (event.key === 'Tab') closeMenu()
}
function onDocumentPointerDown(event: PointerEvent): void {
  if (!root.value?.contains(event.target as Node)) closeMenu()
}

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown))
onUnmounted(() => document.removeEventListener('pointerdown', onDocumentPointerDown))
</script>

<template>
  <div ref="root" class="site-select">
    <button
      ref="trigger"
      class="site-select-trigger"
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      :aria-label="ariaLabel"
      :aria-expanded="open"
      :aria-controls="listboxId"
      :data-value="modelValue"
      @click="open ? closeMenu() : openMenu()"
      @keydown="onTriggerKeydown"
    >
      <span>{{ selected?.label ?? modelValue }}</span>
      <svg class="site-select-chevron" viewBox="0 0 16 16" aria-hidden="true">
        <path d="m4 6 4 4 4-4" />
      </svg>
    </button>
    <div v-if="open" class="site-select-popover">
      <div :id="listboxId" class="site-select-options" role="listbox" :aria-label="ariaLabel">
        <button
          v-for="(option, index) in options"
          :key="option.value"
          :ref="(element) => setOptionRef(element as HTMLButtonElement | null, index)"
          class="site-select-option"
          type="button"
          role="option"
          :aria-selected="option.value === modelValue"
          :tabindex="index === activeIndex ? 0 : -1"
          @click="choose(option.value)"
          @focus="activeIndex = index"
          @keydown="onOptionKeydown($event, option)"
        >
          <span>{{ option.label }}</span>
          <svg v-if="option.value === modelValue" class="site-select-check" viewBox="0 0 16 16" aria-hidden="true">
            <path d="m3.5 8.2 2.7 2.7 6.3-6.3" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>
