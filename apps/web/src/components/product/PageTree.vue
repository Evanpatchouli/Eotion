<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useProductPagesStore } from '../../stores/productPages'
import EotionIcon from '../ui/EotionIcon.vue'
import EotionNavItem from '../ui/EotionNavItem.vue'
import EotionPopover from '../ui/EotionPopover.vue'
import { IconName } from '../ui/icons'
import { flushActivePageEditor } from '../../editor/activePageEditor'
import { buildPageTree, flattenPageTree } from '../../utils/pageTree'
import PageMoveForm from './PageMoveForm.vue'
import PageRenameForm from './PageRenameForm.vue'

const route = useRoute()
const router = useRouter()
const pages = useProductPagesStore()
const emit = defineEmits<{ navigate: [] }>()

const expanded = ref(new Set<string>())
const menuFor = ref<string | null>(null)
const renameFor = ref<string | null>(null)
const moveFor = ref<string | null>(null)
const confirmDeleteFor = ref<string | null>(null)

const workspaceId = computed(() => typeof route.params.workspaceId === 'string' ? route.params.workspaceId : '')
const currentPageId = computed(() => typeof route.params.pageId === 'string' ? route.params.pageId : '')
const rows = computed(() => flattenPageTree(buildPageTree(pages.items), expanded.value))
const canCreate = computed(() => !!workspaceId.value && pages.forWorkspaceId === workspaceId.value && pages.loaded && !pages.loading && !pages.error && !pages.createPending)

function closePanels() {
  menuFor.value = null
  renameFor.value = null
  moveFor.value = null
  confirmDeleteFor.value = null
  pages.createError = ''
  pages.renameError = ''
  pages.moveError = ''
  pages.deleteError = ''
}

/** Keeps the selected page reachable even when its ancestors were collapsed. */
function expandAncestors(pageId: string) {
  if (!pageId) return
  const byId = new Map(pages.items.map((page) => [page.id, page]))
  const guard = new Set<string>()
  let cursor = byId.get(pageId)?.parentPageId ?? null
  while (cursor !== null && !guard.has(cursor)) {
    guard.add(cursor)
    expanded.value.add(cursor)
    cursor = byId.get(cursor)?.parentPageId ?? null
  }
}

function toggle(pageId: string) {
  if (expanded.value.has(pageId)) expanded.value.delete(pageId)
  else expanded.value.add(pageId)
  closePanels()
}

function setMenuOpen(pageId: string, isOpen: boolean) {
  if (!isOpen) {
    if (menuFor.value === pageId) closePanels()
    return
  }
  closePanels()
  menuFor.value = pageId
}

function startRename(pageId: string) {
  closePanels()
  renameFor.value = pageId
}

function startMove(pageId: string) {
  closePanels()
  moveFor.value = pageId
}

function startDelete(pageId: string) {
  closePanels()
  confirmDeleteFor.value = pageId
}

async function openPage(pageId: string) {
  closePanels()
  if (pageId !== currentPageId.value) {
    await router.push({ name: 'product-page', params: { workspaceId: workspaceId.value, pageId } })
  }
  emit('navigate')
}

async function createRoot() {
  if (!canCreate.value) return
  const created = await pages.create(workspaceId.value, null)
  if (created) await openPage(created.id)
}

async function createChild(parentPageId: string) {
  closePanels()
  const created = await pages.create(workspaceId.value, parentPageId)
  if (!created) return
  expanded.value.add(parentPageId)
  await openPage(created.id)
}

async function submitRename(pageId: string, title: string) {
  const updated = await pages.rename(workspaceId.value, pageId, title)
  if (updated) renameFor.value = null
}

async function submitMove(pageId: string, parentPageId: string | null) {
  const moved = await pages.move(workspaceId.value, pageId, parentPageId)
  if (!moved) return
  moveFor.value = null
  menuFor.value = null
  if (parentPageId !== null) expanded.value.add(parentPageId)
}

async function confirmDelete(pageId: string, parentPageId: string | null) {
  if (!(await flushActivePageEditor(workspaceId.value, pageId))) {
    pages.deleteError = '正文尚未保存，请在页面中重试保存后再删除。'
    return
  }
  const removed = await pages.remove(workspaceId.value, pageId)
  if (!removed) return
  confirmDeleteFor.value = null
  menuFor.value = null
  expanded.value.delete(pageId)
  if (currentPageId.value !== pageId) return
  if (parentPageId !== null) await router.push({ name: 'product-page', params: { workspaceId: workspaceId.value, pageId: parentPageId } })
  else await router.push({ name: 'product-workspace', params: { workspaceId: workspaceId.value } })
  emit('navigate')
}

function retry() {
  void pages.load(workspaceId.value, true)
}

watch(() => [currentPageId.value, pages.items] as const, () => expandAncestors(currentPageId.value), { immediate: true })
watch(workspaceId, () => { closePanels(); expanded.value = new Set() })
</script>

<template>
  <div class="product-sidebar-section product-pages-section">
    <div class="product-pages-heading">
      <span class="product-section-label">页面</span>
      <button class="product-add-page" type="button" aria-label="新建根页面" :disabled="!canCreate" @click="createRoot"><EotionIcon :name="IconName.Plus" /></button>
    </div>

    <p v-if="pages.createError" class="product-message product-message--error" role="alert">{{ pages.createError }}</p>

    <p v-if="pages.loading && !pages.loaded" class="product-message" role="status">正在加载页面…</p>
    <template v-else-if="pages.error">
      <p class="product-message product-message--error" role="alert">{{ pages.error }}</p>
      <button class="product-text-button" type="button" :disabled="pages.loading" @click="retry">{{ pages.loading ? '正在重试…' : '重试' }}</button>
    </template>
    <p v-else-if="pages.loaded && pages.items.length === 0" class="product-page-placeholder"><EotionIcon :name="IconName.FileText" :size="16" /><span>还没有页面</span></p>
    <ul v-else class="product-page-tree" role="tree" aria-label="页面树">
      <li v-for="row in rows" :key="row.page.id" class="product-page-node" role="treeitem" :aria-level="row.depth + 1" :aria-selected="row.page.id === currentPageId" :aria-expanded="row.hasChildren ? row.expanded : undefined">
        <EotionPopover
          :open="menuFor === row.page.id"
          context
          :label="`${row.page.title} 的操作`"
          @update:open="setMenuOpen(row.page.id, $event)"
        >
          <template #trigger="{ triggerProps, openAt }">
            <div class="product-page-context" @contextmenu="openAt">
              <EotionNavItem
                :active="row.page.id === currentPageId"
                row-class="product-page-row"
                :row-style="{ paddingLeft: `${8 + row.depth * 14}px` }"
                class="product-page-link"
                type="button"
                @click="openPage(row.page.id)"
              >
                <template v-if="row.hasChildren" #leading>
                  <button class="product-page-toggle" type="button" :aria-label="`${row.expanded ? '收起' : '展开'}${row.page.title}的子页面`" :aria-expanded="row.expanded" @click.stop="toggle(row.page.id)">
                    <span class="product-page-disclosure-icon" aria-hidden="true">
                      <span v-if="row.page.icon" class="product-page-icon">{{ row.page.icon }}</span>
                      <EotionIcon v-else class="product-page-icon" :name="IconName.FileText" :size="16" />
                    </span>
                    <EotionIcon class="product-page-disclosure-chevron" :name="row.expanded ? IconName.ChevronDown : IconName.ChevronRight" :size="16" />
                  </button>
                </template>
                <template v-if="!row.hasChildren" #icon>
                  <span class="product-page-leading-icon" aria-hidden="true">
                    <span v-if="row.page.icon" class="product-page-icon">{{ row.page.icon }}</span>
                    <EotionIcon v-else class="product-page-icon" :name="IconName.FileText" :size="16" />
                  </span>
                </template>
                <span class="product-page-title">{{ row.page.title }}</span>
                <template #trailing>
                  <button v-bind="triggerProps" class="product-page-menu-trigger" type="button" :aria-label="`页面操作：${row.page.title}`" @click.stop><EotionIcon :name="IconName.More" /></button>
                </template>
              </EotionNavItem>
            </div>
          </template>
          <div class="product-page-menu">
            <button class="product-text-button" type="button" role="menuitem" :disabled="pages.createPending" @click="createChild(row.page.id)">新建子页面</button>
            <button class="product-text-button" type="button" role="menuitem" @click="startRename(row.page.id)">重命名</button>
            <button class="product-text-button" type="button" role="menuitem" @click="startMove(row.page.id)">移动</button>
            <button class="product-text-button product-text-button--danger" type="button" role="menuitem" data-danger="true" @click="startDelete(row.page.id)">删除</button>
          </div>
        </EotionPopover>

        <PageRenameForm v-if="renameFor === row.page.id" :initial-title="row.page.title" :pending="pages.renamePending" :error="pages.renameError" @submit="submitRename(row.page.id, $event)" @cancel="renameFor = null" />
        <PageMoveForm v-if="moveFor === row.page.id" :pages="pages.items" :page-id="row.page.id" :current-parent-id="row.page.parentPageId" :pending="pages.movePending" :error="pages.moveError" @submit="submitMove(row.page.id, $event)" @cancel="moveFor = null" />

        <div v-if="confirmDeleteFor === row.page.id" class="product-page-confirm">
          <p class="product-message">确定删除“{{ row.page.title }}”吗？</p>
          <p v-if="pages.deleteError" class="product-message product-message--error" role="alert">{{ pages.deleteError }}</p>
          <div class="product-inline-actions">
            <button class="product-button product-button--primary" type="button" :disabled="pages.deletePending" @click="confirmDelete(row.page.id, row.page.parentPageId)">{{ pages.deletePending ? '正在删除…' : '确认删除' }}</button>
            <button class="product-button" type="button" :disabled="pages.deletePending" @click="confirmDeleteFor = null; pages.deleteError = ''">取消</button>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>
