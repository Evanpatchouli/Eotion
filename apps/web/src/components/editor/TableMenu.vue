<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{ editor: Editor; composing: boolean }>()

const open = ref(false)
const revision = ref(0)
const menuElement = ref<HTMLElement | null>(null)
const pluginKey = 'eotionTableBubble'
let editorDom: HTMLElement | null = null

const floatingOptions = {
  placement: 'top' as const,
  offset: 8,
  flip: { padding: 8 },
  shift: { padding: 8 },
}

function shouldShow({ editor, state }: { editor: Editor; state: Editor['state'] }): boolean {
  if (props.composing || !editor.isEditable || !editor.isFocused) {
    open.value = false
    return false
  }
  // Row/column controls belong to an empty cursor inside a table; a text
  // selection keeps the formatting bubble menu instead of stacking two menus.
  const show = state.selection.empty && editor.isActive('table')
  if (!show) open.value = false
  return show
}

/**
 * Removing the table that is a page's only block would leave an invalid empty
 * document (page) or an empty toggle, so the table is replaced by a paragraph
 * whenever it is its container's only child.
 */
function deleteTable(): void {
  const { state, view } = props.editor
  const { $from } = state.selection
  let depth = $from.depth
  while (depth > 0 && $from.node(depth).type.name !== 'table') depth -= 1
  if (depth === 0) return
  const from = $from.before(depth)
  const to = $from.after(depth)
  const paragraph = state.schema.nodes.paragraph
  const isOnlyChild = $from.node(depth - 1).childCount === 1
  const transaction = isOnlyChild && paragraph
    ? state.tr.replaceWith(from, to, paragraph.create())
    : state.tr.delete(from, to)
  transaction.setSelection(TextSelection.near(transaction.doc.resolve(from)))
  view.dispatch(transaction.scrollIntoView())
  props.editor.commands.focus()
}

type TableAction = 'rowBefore' | 'rowAfter' | 'rowDelete' | 'colBefore' | 'colAfter' | 'colDelete' | 'tableDelete'

function run(action: TableAction): void {
  open.value = false
  const chain = props.editor.chain().focus()
  if (action === 'rowBefore') chain.addRowBefore().run()
  else if (action === 'rowAfter') chain.addRowAfter().run()
  else if (action === 'rowDelete') chain.deleteRow().run()
  else if (action === 'colBefore') chain.addColumnBefore().run()
  else if (action === 'colAfter') chain.addColumnAfter().run()
  else if (action === 'colDelete') chain.deleteColumn().run()
  else deleteTable()
  revision.value += 1
}

const availability = computed(() => {
  revision.value
  const editor = props.editor
  const can = () => props.editor.can()
  return {
    rowBefore: can().addRowBefore(),
    rowAfter: can().addRowAfter(),
    rowDelete: can().deleteRow(),
    colBefore: can().addColumnBefore(),
    colAfter: can().addColumnAfter(),
    colDelete: can().deleteColumn(),
    tableDelete: editor.isActive('table'),
  }
})

function updateRevision(): void {
  revision.value += 1
}

function onOutsidePointer(event: PointerEvent): void {
  if (!open.value || !(event.target instanceof Node)) return
  if (menuElement.value?.contains(event.target) || editorDom?.contains(event.target)) return
  open.value = false
}

onMounted(() => {
  editorDom = props.editor.view.dom
  props.editor.on('transaction', updateRevision)
  document.addEventListener('pointerdown', onOutsidePointer, true)
})

onBeforeUnmount(() => {
  props.editor.off('transaction', updateRevision)
  document.removeEventListener('pointerdown', onOutsidePointer, true)
  editorDom = null
})
</script>

<template>
  <BubbleMenu
    :editor="editor"
    :plugin-key="pluginKey"
    :should-show="shouldShow"
    :options="floatingOptions"
    class="eotion-table-menu-host"
  >
    <div ref="menuElement" class="eotion-table-menu" role="toolbar" aria-label="表格操作">
      <button
        type="button"
        class="eotion-table-menu-trigger"
        aria-label="表格操作"
        :aria-expanded="open"
        @mousedown.prevent
        @click="open = !open"
      >表格 ⋯</button>
      <div v-if="open" class="eotion-table-menu-popover" contenteditable="false">
        <button type="button" aria-label="在上方插入行" :disabled="!availability.rowBefore" @mousedown.prevent @click="run('rowBefore')">上方插入行</button>
        <button type="button" aria-label="在下方插入行" :disabled="!availability.rowAfter" @mousedown.prevent @click="run('rowAfter')">下方插入行</button>
        <button type="button" aria-label="删除当前行" :disabled="!availability.rowDelete" @mousedown.prevent @click="run('rowDelete')">删除行</button>
        <button type="button" aria-label="在左侧插入列" :disabled="!availability.colBefore" @mousedown.prevent @click="run('colBefore')">左侧插入列</button>
        <button type="button" aria-label="在右侧插入列" :disabled="!availability.colAfter" @mousedown.prevent @click="run('colAfter')">右侧插入列</button>
        <button type="button" aria-label="删除当前列" :disabled="!availability.colDelete" @mousedown.prevent @click="run('colDelete')">删除列</button>
        <button type="button" class="eotion-table-menu-danger" aria-label="删除表格" :disabled="!availability.tableDelete" @mousedown.prevent @click="run('tableDelete')">删除表格</button>
      </div>
    </div>
  </BubbleMenu>
</template>

<style scoped>
.eotion-table-menu-host { z-index: 24; }
.eotion-table-menu { position: relative; display: flex; align-items: center; padding: 3px; border: 1px solid var(--e-color-border); border-radius: var(--e-radius-control); background: var(--e-color-surface); box-shadow: var(--shadow-menu); }
.eotion-table-menu-trigger { display: inline-flex; min-height: 30px; align-items: center; border: 0; border-radius: var(--e-radius-control); padding: 0 10px; background: transparent; color: var(--e-color-text-secondary); font: 500 13px / 1.4 var(--e-type-family); cursor: pointer; white-space: nowrap; }
.eotion-table-menu-trigger:hover, .eotion-table-menu-trigger[aria-expanded="true"] { background: var(--e-color-selected); color: var(--e-color-text-primary); }
.eotion-table-menu-trigger:focus-visible, .eotion-table-menu-popover button:focus-visible { outline: var(--e-focus-ring-width) solid var(--e-color-focus); outline-offset: -2px; }
.eotion-table-menu-popover { position: absolute; z-index: 12; top: calc(100% + 6px); left: 0; display: grid; min-width: 168px; gap: 2px; padding: 5px; border: 1px solid var(--e-color-border); border-radius: var(--e-radius-control); background: var(--e-color-surface); box-shadow: var(--shadow-menu); }
.eotion-table-menu-popover button { display: block; width: 100%; min-height: 34px; border: 0; border-radius: var(--e-radius-control); padding: 0 10px; background: transparent; color: var(--e-color-text-primary); font: 500 13px / 1.4 var(--e-type-family); text-align: left; cursor: pointer; }
.eotion-table-menu-popover button:hover:not(:disabled) { background: var(--e-color-hover); }
.eotion-table-menu-popover button:disabled { cursor: default; opacity: .45; }
.eotion-table-menu-popover .eotion-table-menu-danger { color: var(--danger); }
@media (max-width: 767px), (pointer: coarse) {
  .eotion-table-menu-trigger { min-height: 44px; }
  .eotion-table-menu-popover { min-width: min(196px, calc(100vw - 32px)); }
  .eotion-table-menu-popover button { min-height: 44px; }
}
</style>
