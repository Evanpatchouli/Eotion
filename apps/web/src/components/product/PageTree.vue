<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useProductPagesStore } from '../../stores/productPages'
import EotionIcon from '../ui/EotionIcon.vue'
import EotionNavItem from '../ui/EotionNavItem.vue'
import EotionContextMenu from '../ui/EotionContextMenu.vue'
import EotionPopover from '../ui/EotionPopover.vue'
import EotionCommandOverlay from '../ui/EotionCommandOverlay.vue'
import EotionButton from '../ui/EotionButton.vue'
import { IconName } from '../ui/icons'
import { flushActivePageEditor } from '../../editor/activePageEditor'
import { buildPageTree, flattenPageTree } from '../../utils/pageTree'
import { useRuntimeContext } from '../../composables/useRuntimeContext'
import PageMoveForm from './PageMoveForm.vue'
import PageRenameForm from './PageRenameForm.vue'

const route = useRoute()
const router = useRouter()
const pages = useProductPagesStore()
const { layoutMode, inputMode } = useRuntimeContext()
const emit = defineEmits<{ navigate: [] }>()

const expanded = ref(new Set<string>())
const activePopover = ref<{ pageId: string; mode: 'menu' | 'rename' | 'move' } | null>(null)
const formDialog = ref<{ pageId: string; mode: 'rename' | 'move' } | null>(null)
const confirmDeleteFor = ref<string | null>(null)
const deleteSubmitting = ref(false)
const hoveredPageId = ref<string | null>(null)
const focusVisiblePageId = ref<string | null>(null)

const workspaceId = computed(() => typeof route.params.workspaceId === 'string' ? route.params.workspaceId : '')
const currentPageId = computed(() => typeof route.params.pageId === 'string' ? route.params.pageId : '')
const rows = computed(() => flattenPageTree(buildPageTree(pages.items), expanded.value))
const canCreate = computed(() => !!workspaceId.value && pages.forWorkspaceId === workspaceId.value && pages.loaded && !pages.loading && !pages.error && !pages.createPending)

function showDisclosureChevron(pageId: string) {
  return inputMode.value !== 'mouse' || window.matchMedia('(hover: none)').matches
    || hoveredPageId.value === pageId || focusVisiblePageId.value === pageId
}

function disclosureIconName(pageId: string, isExpanded: boolean) {
  if (!showDisclosureChevron(pageId)) return IconName.FileText
  return isExpanded ? IconName.ChevronDown : IconName.ChevronRight
}

function onPageFocusIn(pageId: string, event: FocusEvent) {
  focusVisiblePageId.value = event.target instanceof Element && event.target.matches(':focus-visible') ? pageId : null
}

function onPageFocusOut(pageId: string, event: FocusEvent) {
  if (!(event.relatedTarget instanceof Node && event.currentTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))
    && focusVisiblePageId.value === pageId) focusVisiblePageId.value = null
}

function pageMenuItems(pageId: string) {
  return [
    { label: '新建子页面', icon: IconName.Plus, disabled: pages.createPending, action: () => createChild(pageId) },
    { label: '重命名', icon: IconName.Rename, action: () => startRename(pageId) },
    { label: '移动', icon: IconName.Move, action: () => startMove(pageId) },
    { label: '删除', icon: IconName.Trash, danger: true, action: () => startDelete(pageId) },
  ]
}

function closePanels() {
  activePopover.value = null
  formDialog.value = null
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

function setPopoverOpen(pageId: string, isOpen: boolean) {
  if (!isOpen) {
    if (activePopover.value?.pageId !== pageId) return
    if (formDialog.value?.pageId === pageId) return
    if (activePopover.value.mode === 'rename' && pages.renamePending) return
    if (activePopover.value.mode === 'move' && pages.movePending) return
    closePanels()
    return
  }
  closePanels()
  activePopover.value = { pageId, mode: 'menu' }
}

async function focusPopoverItem(mode: 'menu' | 'rename' | 'move', inDialog = false) {
  await nextTick()
  const container = inDialog ? 'dialog.eotion-command-overlay .product-page-action-dialog' : '.eotion-popover-panel'
  const selector = mode === 'rename'
    ? `${container} [data-page-rename-input]`
    : mode === 'move'
      ? `${container} input[type="radio"]:checked`
      : `${container} [data-popover-item]`
  document.querySelector<HTMLElement>(selector)?.focus()
}

async function focusPageTrigger(pageId: string) {
  await nextTick()
  document.querySelector<HTMLElement>(`[data-page-id="${CSS.escape(pageId)}"] .product-page-menu-trigger`)?.focus()
}

function dismissPopover(pageId: string) {
  if (activePopover.value?.pageId !== pageId) return
  activePopover.value = null
  void focusPageTrigger(pageId)
}

function dismissFormDialog(pageId: string) {
  if (formDialog.value?.pageId !== pageId) return
  if (formDialog.value.mode === 'rename' && pages.renamePending) return
  if (formDialog.value.mode === 'move' && pages.movePending) return
  formDialog.value = null
  pages.renameError = ''
  pages.moveError = ''
}

async function startForm(pageId: string, mode: 'rename' | 'move') {
  pages[mode === 'rename' ? 'renameError' : 'moveError'] = ''
  if (layoutMode.value !== 'mobile') {
    activePopover.value = { pageId, mode }
    void focusPopoverItem(mode)
    return
  }

  activePopover.value = null
  await nextTick()
  await focusPageTrigger(pageId)
  formDialog.value = { pageId, mode }
  await focusPopoverItem(mode, true)
}

function startRename(pageId: string) { void startForm(pageId, 'rename') }
function startMove(pageId: string) { void startForm(pageId, 'move') }

async function startDelete(pageId: string) {
  const trigger = document.querySelector<HTMLElement>(`[data-page-id="${CSS.escape(pageId)}"] .product-page-menu-trigger`)
  closePanels()
  await nextTick()
  trigger?.focus()
  pages.deleteError = ''
  confirmDeleteFor.value = pageId
}

const deleteOverlayOpen = computed({
  get: () => confirmDeleteFor.value !== null,
  set: (isOpen: boolean) => {
    if (!isOpen && !deleteSubmitting.value) {
      confirmDeleteFor.value = null
      pages.deleteError = ''
    }
  },
})

const formDialogOpen = computed({
  get: () => formDialog.value !== null,
  set: (isOpen: boolean) => {
    const current = formDialog.value
    if (!isOpen && current) dismissFormDialog(current.pageId)
  },
})
const formDialogPending = computed(() => formDialog.value?.mode === 'rename' ? pages.renamePending : pages.movePending)

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
  if (updated) {
    if (formDialog.value?.pageId === pageId && formDialog.value.mode === 'rename') dismissFormDialog(pageId)
    else dismissPopover(pageId)
  }
}

async function submitMove(pageId: string, parentPageId: string | null) {
  const moved = await pages.move(workspaceId.value, pageId, parentPageId)
  if (!moved) return
  if (formDialog.value?.pageId === pageId && formDialog.value.mode === 'move') dismissFormDialog(pageId)
  else dismissPopover(pageId)
  if (parentPageId !== null) expanded.value.add(parentPageId)
}

async function confirmDelete(pageId: string, parentPageId: string | null) {
  if (deleteSubmitting.value) return
  deleteSubmitting.value = true
  try {
    if (!(await flushActivePageEditor(workspaceId.value, pageId))) {
      pages.deleteError = '正文尚未保存，请在页面中重试保存后再删除。'
      return
    }
    const removed = await pages.remove(workspaceId.value, pageId)
    if (!removed) return
    confirmDeleteFor.value = null
    activePopover.value = null
    expanded.value.delete(pageId)
    if (currentPageId.value !== pageId) return
    if (parentPageId !== null) await router.push({ name: 'product-page', params: { workspaceId: workspaceId.value, pageId: parentPageId } })
    else await router.push({ name: 'product-workspace', params: { workspaceId: workspaceId.value } })
    emit('navigate')
  } finally {
    deleteSubmitting.value = false
  }
}

function retry() {
  void pages.load(workspaceId.value, true)
}

watch(() => [currentPageId.value, pages.items] as const, () => expandAncestors(currentPageId.value), { immediate: true })
watch(workspaceId, () => {
  closePanels()
  confirmDeleteFor.value = null
  expanded.value = new Set()
})
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
      <li v-for="row in rows" :key="row.page.id" class="product-page-node" :data-page-id="row.page.id" role="treeitem" :aria-level="row.depth + 1" :aria-selected="row.page.id === currentPageId" :aria-expanded="row.hasChildren ? row.expanded : undefined">
        <EotionPopover
          :open="activePopover?.pageId === row.page.id"
          :mode="activePopover?.pageId === row.page.id && activePopover.mode !== 'menu' ? 'dialog' : 'menu'"
          context
          :label="activePopover?.pageId === row.page.id && activePopover.mode !== 'menu' ? (activePopover.mode === 'rename' ? '重命名页面' : '移动页面') : `${row.page.title} 的操作`"
          :panel-width="activePopover?.pageId === row.page.id && activePopover.mode !== 'menu' ? '280px' : undefined"
          @update:open="setPopoverOpen(row.page.id, $event)"
        >
          <template #trigger="{ triggerProps, openAt }">
            <div class="product-page-context" @contextmenu="openAt" @mouseenter="hoveredPageId = row.page.id" @mouseleave="hoveredPageId = null" @focusin="onPageFocusIn(row.page.id, $event)" @focusout="onPageFocusOut(row.page.id, $event)">
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
                    <span v-if="row.page.icon && !showDisclosureChevron(row.page.id)" class="product-page-icon" aria-hidden="true">{{ row.page.icon }}</span>
                    <EotionIcon v-else class="product-page-icon" :name="disclosureIconName(row.page.id, row.expanded)" :size="16" />
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
          <template v-if="activePopover?.pageId !== row.page.id || activePopover.mode === 'menu'">
            <EotionContextMenu class="product-page-menu" :items="pageMenuItems(row.page.id)" />
          </template>
          <PageRenameForm
            v-if="activePopover?.pageId === row.page.id && activePopover.mode === 'rename'"
            :initial-title="row.page.title"
            :pending="pages.renamePending"
            :error="pages.renameError"
            @submit="submitRename(row.page.id, $event)"
            @cancel="dismissPopover(row.page.id)"
          />
          <PageMoveForm
            v-else-if="activePopover?.pageId === row.page.id && activePopover.mode === 'move'"
            :pages="pages.items"
            :page-id="row.page.id"
            :current-parent-id="row.page.parentPageId"
            :pending="pages.movePending"
            :error="pages.moveError"
            @submit="submitMove(row.page.id, $event)"
            @cancel="dismissPopover(row.page.id)"
          />
        </EotionPopover>
      </li>
    </ul>
    <EotionCommandOverlay v-model:open="formDialogOpen" :label="formDialog?.mode === 'rename' ? '重命名页面' : '移动页面'" :shortcut="false" :dismissible="!formDialogPending">
      <section v-if="formDialog" class="product-page-action-dialog" :aria-labelledby="`product-page-action-title-${formDialog.pageId}`">
        <h2 :id="`product-page-action-title-${formDialog.pageId}`">{{ formDialog.mode === 'rename' ? '重命名页面' : '移动页面' }}</h2>
        <PageRenameForm
          v-if="formDialog.mode === 'rename'"
          :initial-title="pages.items.find(page => page.id === formDialog?.pageId)?.title ?? ''"
          :pending="pages.renamePending"
          :error="pages.renameError"
          @submit="submitRename(formDialog.pageId, $event)"
          @cancel="dismissFormDialog(formDialog.pageId)"
        />
        <PageMoveForm
          v-else
          :pages="pages.items"
          :page-id="formDialog.pageId"
          :current-parent-id="pages.items.find(page => page.id === formDialog?.pageId)?.parentPageId ?? null"
          :pending="pages.movePending"
          :error="pages.moveError"
          @submit="submitMove(formDialog.pageId, $event)"
          @cancel="dismissFormDialog(formDialog.pageId)"
        />
      </section>
    </EotionCommandOverlay>
    <EotionCommandOverlay v-model:open="deleteOverlayOpen" label="删除页面？" :shortcut="false" :dismissible="!deleteSubmitting && !pages.deletePending">
      <section v-if="confirmDeleteFor" class="product-page-delete-dialog" aria-labelledby="product-page-delete-title">
        <h2 id="product-page-delete-title">删除页面？</h2>
        <p>确定删除“{{ pages.items.find(page => page.id === confirmDeleteFor)?.title ?? '' }}”吗？</p>
        <p v-if="pages.deleteError" class="product-message product-message--error" role="alert">{{ pages.deleteError }}</p>
        <div class="product-popover-form__actions">
          <EotionButton :disabled="deleteSubmitting || pages.deletePending" @click="deleteOverlayOpen = false">取消</EotionButton>
          <EotionButton variant="danger" :disabled="deleteSubmitting || pages.deletePending" @click="confirmDelete(confirmDeleteFor, pages.items.find(page => page.id === confirmDeleteFor)?.parentPageId ?? null)">{{ deleteSubmitting || pages.deletePending ? '正在删除…' : '删除' }}</EotionButton>
        </div>
      </section>
    </EotionCommandOverlay>
  </div>
</template>
