<script setup lang="ts">
import { ref } from 'vue'
import type { Editor } from '@tiptap/core'

import EotionEditor from './EotionEditor.vue'
import type { EditorDocument } from '../../editor/editorDocument'

defineProps<{ touchToolbar: boolean }>()

const surface = ref<InstanceType<typeof EotionEditor> | null>(null)
const composing = ref(false)
const compositionEvents = ref<string[]>([])
const compositionTransactions = ref(0)
const selection = ref({ from: 0, to: 0, empty: true })
const lastInputLatencyMs = ref<number | null>(null)
const longPressObservation = ref('尚无')
const keyboardInset = ref(0)
let pendingInputStart: number | null = null
let touchStartedAt: number | null = null

const initialContent: EditorDocument = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: '在这里输入文字，尝试段落、标题和项目列表。' }] }],
}

function onComposition(active: boolean, event: CompositionEvent) {
  composing.value = active
  compositionEvents.value = [...compositionEvents.value.slice(-11), `${event.type}${event.data ? ` (${event.data})` : ''}`]
}

function onBeforeInput(input: InputEvent) {
  if (!composing.value && !input.isComposing && input.inputType === 'insertText' && input.data?.length === 1) {
    pendingInputStart = performance.now()
  }
}

function onTransaction(changed: boolean) {
  if (composing.value) compositionTransactions.value += 1
  if (changed && pendingInputStart !== null) {
    const start = pendingInputStart
    pendingInputStart = null
    requestAnimationFrame(() => { lastInputLatencyMs.value = Math.round((performance.now() - start) * 10) / 10 })
  }
}

function onPointer(event: PointerEvent) {
  if (event.pointerType !== 'touch') return
  if (event.type === 'pointerdown') {
    touchStartedAt = performance.now()
  } else if (touchStartedAt !== null) {
    const duration = Math.round(performance.now() - touchStartedAt)
    if (duration >= 500) longPressObservation.value = `触摸持续 ${duration} ms；请检查原生选择手柄与菜单`
    touchStartedAt = null
  }
}

defineExpose({
  get editor(): Editor | null { return surface.value?.editor ?? null },
  lastInputLatencyMs,
})
</script>

<template>
  <div class="p2-editor">
    <EotionEditor
      ref="surface"
      :content="initialContent"
      :touch-toolbar="touchToolbar"
      aria-label="P2 Tiptap 编辑区域"
      @composition="onComposition"
      @transaction="onTransaction"
      @selection="(from, to, empty) => selection = { from, to, empty }"
      @before-input="onBeforeInput"
      @pointer="onPointer"
      @context-menu="longPressObservation = '收到原生 contextmenu；未阻止默认行为'"
      @keyboard-inset="keyboardInset = $event"
    />
    <div class="p2-editor-observation" aria-label="输入与选择观测">
      <span>composition: {{ composing ? '进行中' : '未进行' }}</span>
      <span>selection: {{ selection.from }}–{{ selection.to }} ({{ selection.empty ? '光标' : '选区' }})</span>
      <span>composition 中 transaction: {{ compositionTransactions }}</span>
      <span>事件: {{ compositionEvents.length ? compositionEvents.join(' → ') : '尚无' }}</span>
      <span>最近单字符输入至下一帧: {{ lastInputLatencyMs === null ? '尚无' : `${lastInputLatencyMs} ms` }}</span>
      <span>长按观察: {{ longPressObservation }}</span>
      <span>可视视口底部遮挡: {{ keyboardInset }} px</span>
    </div>
  </div>
</template>

<style scoped>
.p2-editor-observation { display: flex; flex-wrap: wrap; gap: 6px 14px; padding: 10px; border: 1px solid #e5e5e1; border-top: 0; border-radius: 0 0 10px 10px; color: #62655f; font-size: 12px; overflow-wrap: anywhere; }
</style>
