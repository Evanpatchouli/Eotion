<script setup lang="ts">
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'

defineProps(nodeViewProps)
</script>

<template>
  <NodeViewWrapper class="eotion-database" contenteditable="false" aria-label="数据库视图">
    <span class="eotion-database-mark" aria-hidden="true">▦</span>
    <span class="eotion-database-copy">
      <strong>数据库视图</strong>
      <small>数据库内容暂不可编辑</small>
    </span>
  </NodeViewWrapper>
</template>

<style scoped>
.eotion-database { display: flex; min-height: 58px; align-items: center; gap: 12px; margin: 12px 0; border: 1px solid var(--border-editor); border-radius: 9px; padding: 10px 14px; background: var(--surface-raised); color: var(--editor-text); }
.eotion-database-mark { display: grid; width: 34px; height: 34px; flex: 0 0 auto; place-items: center; border-radius: 7px; background: var(--surface-editor-hover); color: var(--editor-muted); font-size: 20px; }
.eotion-database-copy { display: grid; gap: 3px; }
.eotion-database-copy strong { font-size: 13px; font-weight: 600; }
.eotion-database-copy small { color: var(--editor-muted); font-size: 12px; }
</style>
