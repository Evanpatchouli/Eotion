<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'

import eotionIconUrl from '../assets/eotion-icon.png'
import EotionIcon from '../components/ui/EotionIcon.vue'
import EotionNavItem from '../components/ui/EotionNavItem.vue'
import EotionPopover from '../components/ui/EotionPopover.vue'
import EotionContextMenu from '../components/ui/EotionContextMenu.vue'
import { IconName } from '../components/ui/icons'
import PageTree from '../components/product/PageTree.vue'
import SyncStatus from '../components/product/SyncStatus.vue'
import WorkspaceCreateForm from '../components/product/WorkspaceCreateForm.vue'
import WorkspaceRenameForm from '../components/product/WorkspaceRenameForm.vue'
import { useRuntimeContext } from '../composables/useRuntimeContext'
import { flushActivePageEditor } from '../editor/activePageEditor'
import { flushAttachmentCleanups, pendingAttachmentCleanups } from '../editor/attachmentCleanup'
import { hasPendingPageDraft } from '../editor/pendingPageDraft'
import { useAuthStore } from '../stores/auth'
import { useProductPagesStore } from '../stores/productPages'
import { useProductWorkspacesStore } from '../stores/productWorkspaces'
import { useProductSyncStore } from '../stores/productSync'
import '../styles/product.css'
import '../styles/product-shell.css'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const workspaces = useProductWorkspacesStore()
const pages = useProductPagesStore()
const sync = useProductSyncStore()
const { layoutMode, inputMode, runtime } = useRuntimeContext()
const showDiagnosticDetails = import.meta.env.VITE_SHOW_DIAGNOSTIC_DETAILS === 'true'
const cleanupDiagnosticText = computed(() => {
  const diagnostic = sync.cleanupDiagnostic
  return [
    `syncState: ${sync.state}`,
    `pendingOperations: ${sync.pending}`,
    `cleanupPending: ${sync.cleanupPending}`,
    `cleanupError: ${sync.cleanupError || 'none'}`,
    `cleanupReady: ${diagnostic.ready}`,
    `cleanupAttempted: ${diagnostic.attempted}`,
    `cleanupDeleteSucceeded: ${diagnostic.deleteSucceeded}`,
    `cleanupDeleteFailed: ${diagnostic.deleteFailed}`,
    `cleanupSkippedOffline: ${diagnostic.skippedOffline}`,
    `cleanupSkippedUnauthorized: ${diagnostic.skippedUnauthorized}`,
    `cleanupSkippedBackoff: ${diagnostic.skippedBackoff}`,
    `cleanupSkippedEditorFlush: ${diagnostic.skippedEditorFlush}`,
    `cleanupSkippedPendingOperations: ${diagnostic.skippedPendingOperations}`,
    `cleanupSkippedBecameNotReady: ${diagnostic.skippedBecameNotReady}`,
    `cleanupSkippedIdentityChanged: ${diagnostic.skippedIdentityChanged}`,
    `cleanupLastError: ${diagnostic.lastError || 'none'}`,
    `navigatorOnline: ${navigator.onLine}`,
  ].join('\n')
})

const mobileNavOpen = ref(false)
const desktopSidebarCollapsed = ref(false)
const sidebarCollapseButton = ref<HTMLButtonElement | null>(null)
const sidebarReopenButton = ref<HTMLButtonElement | null>(null)
const switcherOpen = ref(false)
const formMode = ref<'create' | 'rename' | null>(null)
const operationError = ref('')
const operationStatus = ref('')
const logoutError = ref('')
const routeRevision = ref(0)
const workspaceId = computed(() => typeof route.params.workspaceId === 'string' ? route.params.workspaceId : '')
const currentWorkspace = computed(() => workspaces.items.find((item) => item.id === workspaceId.value) ?? null)
const workspaceActionItems = computed(() => [
  { label: '新建工作区', icon: IconName.Plus, disabled: !workspaces.loaded, action: () => { formMode.value = formMode.value === 'create' ? null : 'create'; operationError.value = '' } },
  ...(currentWorkspace.value ? [{ label: '重命名当前工作区', icon: IconName.Rename, disabled: !workspaces.loaded, action: () => { formMode.value = formMode.value === 'rename' ? null : 'rename'; operationError.value = '' } }] : []),
])
const isUnavailable = computed(() => Boolean(workspaceId.value) && !currentWorkspace.value && workspaces.loaded)
const pageId = computed(() => typeof route.params.pageId === 'string' ? route.params.pageId : '')
const breadcrumb = computed(() => {
  const workspaceName = currentWorkspace.value?.name ?? (workspaceId.value ? '工作区不可用' : '工作区')
  const pageTitle = pages.items.find((item) => item.id === pageId.value)?.title
  return pageTitle ? `${workspaceName} / ${pageTitle}` : workspaceName
})
const sidebarHidden = computed(() => layoutMode.value === 'mobile'
  ? !mobileNavOpen.value
  : desktopSidebarCollapsed.value)

async function toggleDesktopSidebar() {
  desktopSidebarCollapsed.value = !desktopSidebarCollapsed.value
  switcherOpen.value = false
  await nextTick()
  if (desktopSidebarCollapsed.value) sidebarReopenButton.value?.focus()
  else sidebarCollapseButton.value?.focus()
}

function closeMobileNav() {
  mobileNavOpen.value = false
  switcherOpen.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && !event.defaultPrevented && mobileNavOpen.value) closeMobileNav()
}
function onConnection(): void { sync.requestSync(0) }
function onAttention(): void { if (document.visibilityState === 'visible') sync.requestSync() }

async function retryWorkspaces(): Promise<void> {
  await workspaces.load(true)
  if (workspaces.loaded) sync.retry()
}

function resetRouteUi() {
  formMode.value = null
  switcherOpen.value = false
  operationError.value = ''
  logoutError.value = ''
  closeMobileNav()
}

async function selectWorkspace(id: string) {
  const selected = workspaces.items.find((item) => item.id === id)
  if (!selected || !auth.user) return
  operationStatus.value = ''
  workspaces.remember(auth.user.id, selected.id)
  resetRouteUi()
  await router.push({ name: 'product-workspace', params: { workspaceId: selected.id } })
}

async function createWorkspace(name: string) {
  const sourceRevision = routeRevision.value
  operationError.value = ''
  const created = await workspaces.create(name)
  if (sourceRevision !== routeRevision.value) return
  if (!created) {
    operationError.value = workspaces.mutationError || '无法创建工作区，请重试。'
    return
  }
  operationStatus.value = '工作区已创建'
  if (auth.user) workspaces.remember(auth.user.id, created.id)
  formMode.value = null
  switcherOpen.value = false
  closeMobileNav()
  await router.push({ name: 'product-workspace', params: { workspaceId: created.id } })
}

async function renameWorkspace(name: string) {
  if (!currentWorkspace.value) return
  const sourceRevision = routeRevision.value
  operationError.value = ''
  const renamed = await workspaces.rename(currentWorkspace.value.id, name)
  if (sourceRevision !== routeRevision.value) return
  if (!renamed) {
    operationError.value = workspaces.mutationError || '无法更新工作区名称，请重试。'
    return
  }
  operationStatus.value = '工作区名称已更新'
  formMode.value = null
}

async function logout() {
  logoutError.value = ''
  if (!(await flushActivePageEditor())) {
    logoutError.value = '正文尚未保存，请在页面中重试保存后再退出。'
    return
  }
  const loggedOut = await auth.logout()
  if (!loggedOut) {
    logoutError.value = auth.error || '无法退出登录，请重试。'
    return
  }
  await router.replace({ name: 'login' })
}

async function openSettings() {
  operationError.value = ''
  if (!(await flushActivePageEditor())) {
    operationError.value = '正文尚未保存，请重试后打开设置。'
    return
  }
  await router.push({ name: 'settings-index', query: { returnTo: route.path, ...(currentWorkspace.value ? { workspaceId: currentWorkspace.value.id } : {}) } })
}

watch(() => route.fullPath, () => {
  routeRevision.value += 1
  resetRouteUi()
})

watch(layoutMode, () => { switcherOpen.value = false })

watch(() => auth.user, (user) => {
  sync.configure(user?.id ?? '', auth.offline)
  if (user) return
  const redirect = hasPendingPageDraft() ? route.fullPath : ''
  workspaces.reset()
  pages.reset()
  void router.replace({ name: 'login', query: redirect ? { redirect } : undefined })
}, { immediate: true })

watch(() => auth.offline, (offline) => {
  sync.configure(auth.user?.id ?? '', offline)
})

watch(() => sync.revision, () => { void pages.refresh() })

// The page list always belongs to exactly one workspace; switching drops the previous one.
watch(() => currentWorkspace.value?.id ?? '', (id) => {
  if (id) void pages.load(id)
  else { sync.leaveWorkspace(); pages.reset() }
}, { immediate: true })

watch(() => [workspaces.loaded, workspaceId.value, auth.user?.id, currentWorkspace.value?.id] as const, ([loaded, id, userId, currentId]) => {
  if (currentId && userId) workspaces.remember(userId, currentId)
  if (!loaded || id || !userId) return
  const preferredId = workspaces.preferredId(userId)
  if (preferredId && workspaces.items.some((item) => item.id === preferredId)) {
    void router.replace({ name: 'product-workspace', params: { workspaceId: preferredId } })
  }
}, { immediate: true })

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('online', onConnection)
  window.addEventListener('focus', onAttention)
  document.addEventListener('visibilitychange', onAttention)
  void workspaces.load()
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('online', onConnection)
  window.removeEventListener('focus', onAttention)
  document.removeEventListener('visibilitychange', onAttention)
})
</script>

<template>
  <div class="workspace-shell product-shell" :class="{ 'product-shell--sidebar-collapsed': layoutMode !== 'mobile' && desktopSidebarCollapsed }" :data-layout="layoutMode" :data-input="inputMode" :data-runtime="runtime">
    <aside class="sidebar product-sidebar" :class="{ 'sidebar--open': mobileNavOpen }" :aria-hidden="sidebarHidden" :inert="sidebarHidden" aria-label="工作区导航">
      <div class="brand-row">
        <img :src="eotionIconUrl" class="brand-mark brand-mark--image" alt="" aria-hidden="true" />
        <strong>Eotion</strong>
        <div class="product-user-identity">
          <span class="product-user-name" :title="auth.user?.displayName">{{ auth.user?.displayName }}</span>
          <span class="product-user-email" :title="auth.user?.email">{{ auth.user?.email }}</span>
        </div>
        <button ref="sidebarCollapseButton" class="icon-button product-sidebar-collapse" type="button" aria-label="收起侧边栏" title="收起侧边栏" @click="toggleDesktopSidebar"><EotionIcon :name="IconName.SidebarClose" /></button>
        <button class="icon-button sidebar-close" type="button" aria-label="关闭导航菜单" @click="closeMobileNav"><EotionIcon :name="IconName.X" /></button>
      </div>

      <div class="product-sidebar-section">
        <span class="product-section-label">工作区</span>
        <EotionPopover v-model:open="switcherOpen" mode="dialog" context label="工作区切换" panel-width="240px">
          <template #trigger="{ triggerProps, openAt }">
            <div class="product-workspace-trigger" @contextmenu="formMode = null; operationError = ''; openAt($event)">
              <span class="product-workspace-avatar" aria-hidden="true">{{ currentWorkspace?.name.slice(0, 1) || 'E' }}</span>
              <span class="product-workspace-name">{{ currentWorkspace?.name ?? (workspaces.loading ? '正在加载…' : '选择工作区') }}</span>
              <button v-bind="triggerProps" class="product-chevron product-page-menu-trigger" type="button" aria-label="切换工作区" @click="formMode = null; operationError = ''"><EotionIcon :name="IconName.More" /></button>
            </div>
          </template>
          <div class="product-workspace-popover">
          <p v-if="workspaces.loading" class="product-message" role="status">正在加载工作区…</p>
          <p v-else-if="workspaces.items.length === 0" class="product-message">还没有工作区</p>
          <ul v-else class="product-workspace-list" aria-label="可用工作区">
            <li v-for="item in workspaces.items" :key="item.id">
              <EotionNavItem :active="item.id === workspaceId" row-class="product-workspace-option-row" class="product-workspace-option" role="button" data-popover-item @click="selectWorkspace(item.id)">
                <template #icon><span class="product-workspace-avatar" aria-hidden="true">{{ item.name.slice(0, 1) }}</span></template>
                <span class="product-workspace-name">{{ item.name }}</span>
                <template #trailing><span v-if="item.id === workspaceId" class="product-check" aria-label="当前工作区"><EotionIcon :name="IconName.Check" :size="16" /></span></template>
              </EotionNavItem>
            </li>
          </ul>
          <div class="product-switcher-actions">
            <EotionContextMenu :items="workspaceActionItems" item-role="button" />
          </div>
          <WorkspaceCreateForm v-if="formMode === 'create' && workspaces.loaded" :pending="workspaces.createPending" :error="operationError || workspaces.mutationError" @submit="createWorkspace" />
          <WorkspaceRenameForm v-if="formMode === 'rename' && currentWorkspace && workspaces.loaded" :initial-name="currentWorkspace.name" :pending="workspaces.renamePending" :error="operationError || workspaces.mutationError" @submit="renameWorkspace" />
          </div>
        </EotionPopover>
      </div>

      <div class="product-page-scroll"><PageTree @navigate="closeMobileNav" /></div>

      <div class="sidebar-footer product-sidebar-footer">
        <EotionNavItem class="product-text-button product-settings-entry" @click="openSettings">
          <template #icon><EotionIcon :name="IconName.Settings" :size="16" /></template>设置
        </EotionNavItem>
        <EotionNavItem class="product-text-button product-logout" :disabled="auth.logoutPending" @click="logout">
          <template #icon><EotionIcon :name="IconName.LogOut" :size="16" /></template>{{ auth.logoutPending ? '正在退出…' : '退出登录' }}
        </EotionNavItem>
        <p v-if="logoutError" class="product-message product-message--error" role="alert">{{ logoutError }}</p>
      </div>
    </aside>

    <div v-if="mobileNavOpen" class="sidebar-scrim" aria-hidden="true" @click="closeMobileNav" />

    <main class="main-pane">
      <header class="topbar product-topbar">
        <button class="icon-button mobile-menu" type="button" aria-label="打开导航菜单" @click="mobileNavOpen = true"><EotionIcon :name="IconName.Menu" /></button>
        <button v-if="layoutMode !== 'mobile' && desktopSidebarCollapsed" ref="sidebarReopenButton" class="icon-button product-sidebar-reopen" type="button" aria-label="展开侧边栏" title="展开侧边栏" @click="toggleDesktopSidebar"><EotionIcon :name="IconName.SidebarOpen" /></button>
        <div class="breadcrumb">{{ breadcrumb }}</div>
        <SyncStatus />
      </header>

      <article class="document-wrap">
      <p v-if="pendingAttachmentCleanups.length" class="product-message product-cleanup-status" role="alert">
        附件清理尚未写入本机，请重试后再关闭页面。
        <button class="product-text-button product-sync-action" type="button" @click="flushAttachmentCleanups"><EotionIcon name="refresh" :size="16" />重试记录清理</button>
      </p>
      <p v-if="sync.cleanupPending" class="product-message product-cleanup-status" role="status">
        {{ sync.cleanupError || `${sync.cleanupPending} 个附件待清理，联网同步后自动重试。` }}
        <button class="product-text-button product-sync-action" type="button" @click="sync.retry()"><EotionIcon name="refresh" :size="16" />重试清理</button>
      </p>
      <details v-if="showDiagnosticDetails" class="product-cleanup-diagnostics">
        <summary>附件清理诊断</summary>
        <pre>{{ cleanupDiagnosticText }}</pre>
      </details>
      <p v-if="operationStatus" class="product-message product-message--success product-operation-status" role="status">{{ operationStatus }}</p>
        <section v-if="workspaces.error" class="document product-state" aria-labelledby="workspace-load-error-title">
          <h1 id="workspace-load-error-title">暂时无法加载工作区</h1>
          <p class="lead" role="alert">{{ workspaces.error }}</p>
          <button class="product-button product-button--primary" type="button" :disabled="workspaces.loading" @click="retryWorkspaces">{{ workspaces.loading ? '正在重试…' : '重试' }}</button>
        </section>
        <section v-else-if="workspaces.loading && !workspaces.loaded" class="product-loading" role="status">正在加载工作区…</section>
        <section v-else-if="isUnavailable" class="document product-state" aria-labelledby="workspace-unavailable-title">
          <div class="product-state-icon" aria-hidden="true"><EotionIcon :name="IconName.Search" :size="24" /></div>
          <h1 id="workspace-unavailable-title">无法打开这个工作区</h1>
          <p class="lead">它可能已被移除，或暂时无法使用。你可以返回工作区列表并选择其他工作区。</p>
          <div class="product-state-actions"><RouterLink class="product-button product-button--primary" :to="{ name: 'product-home' }">返回工作区</RouterLink><button v-for="item in workspaces.items" :key="item.id" class="product-button" type="button" @click="selectWorkspace(item.id)">{{ item.name }}</button></div>
        </section>
        <section v-else-if="!workspaceId && workspaces.loaded && workspaces.items.length === 0" class="document product-state" aria-labelledby="workspace-create-title">
          <div class="product-state-icon" aria-hidden="true"><EotionIcon :name="IconName.Plus" :size="24" /></div>
          <h1 id="workspace-create-title">创建你的第一个工作区</h1>
          <p class="lead">工作区可以帮助你整理页面和想法。先为它取一个容易辨认的名字。</p>
          <WorkspaceCreateForm :pending="workspaces.createPending" :error="operationError || workspaces.mutationError" @submit="createWorkspace" />
        </section>
        <RouterView v-else />
      </article>
    </main>
  </div>
</template>

<style scoped>
.brand-row { gap: 8px; }
.brand-row > .brand-mark, .brand-row > strong { flex: none; }
.product-user-identity { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 3px; margin-left: 3px; }
.product-user-identity > span { display: block; width: 100%; white-space: nowrap; }
.product-user-name { max-width: 100%; overflow: hidden; color: var(--e-color-text-primary); font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.product-user-email { color: var(--e-color-text-muted); }
.product-cleanup-diagnostics { margin: 8px 0 12px; color: var(--e-color-text-muted); font-size: 12px; }
.product-cleanup-diagnostics summary { width: fit-content; cursor: pointer; }
.product-cleanup-diagnostics pre { margin: 8px 0 0; overflow-wrap: anywhere; white-space: pre-wrap; font: 12px/1.55 ui-monospace, SFMono-Regular, Consolas, monospace; }
.product-settings-entry { display: inline-flex; min-height: 32px; align-items: center; gap: 7px; }
</style>
