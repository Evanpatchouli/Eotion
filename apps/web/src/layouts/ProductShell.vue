<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'

import eotionIconUrl from '../assets/eotion-icon.png'
import PageTree from '../components/product/PageTree.vue'
import WorkspaceCreateForm from '../components/product/WorkspaceCreateForm.vue'
import WorkspaceRenameForm from '../components/product/WorkspaceRenameForm.vue'
import { useRuntimeContext } from '../composables/useRuntimeContext'
import { flushActivePageEditor } from '../editor/activePageEditor'
import { hasPendingPageDraft } from '../editor/pendingPageDraft'
import { useAuthStore } from '../stores/auth'
import { useProductPagesStore } from '../stores/productPages'
import { useProductWorkspacesStore } from '../stores/productWorkspaces'
import { useProductSyncStore } from '../stores/productSync'
import '../styles/product.css'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const workspaces = useProductWorkspacesStore()
const pages = useProductPagesStore()
const sync = useProductSyncStore()
const { layoutMode, inputMode, runtime } = useRuntimeContext()

const mobileNavOpen = ref(false)
const switcherOpen = ref(false)
const formMode = ref<'create' | 'rename' | null>(null)
const operationError = ref('')
const operationStatus = ref('')
const logoutError = ref('')
const routeRevision = ref(0)
const workspaceId = computed(() => typeof route.params.workspaceId === 'string' ? route.params.workspaceId : '')
const currentWorkspace = computed(() => workspaces.items.find((item) => item.id === workspaceId.value) ?? null)
const isUnavailable = computed(() => Boolean(workspaceId.value) && !currentWorkspace.value && workspaces.loaded)
const pageId = computed(() => typeof route.params.pageId === 'string' ? route.params.pageId : '')
const breadcrumb = computed(() => {
  const workspaceName = currentWorkspace.value?.name ?? (workspaceId.value ? '工作区不可用' : '工作区')
  const pageTitle = pages.items.find((item) => item.id === pageId.value)?.title
  return pageTitle ? `${workspaceName} / ${pageTitle}` : workspaceName
})
const sidebarHidden = computed(() => layoutMode.value === 'mobile' && !mobileNavOpen.value)

function closeMobileNav() {
  mobileNavOpen.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && mobileNavOpen.value) closeMobileNav()
}
function onConnection(): void { sync.requestSync(0) }
function onAttention(): void { if (document.visibilityState === 'visible') sync.requestSync() }

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

watch(() => route.fullPath, () => {
  routeRevision.value += 1
  resetRouteUi()
})

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
  <div class="workspace-shell product-shell" :data-layout="layoutMode" :data-input="inputMode" :data-runtime="runtime">
    <aside class="sidebar product-sidebar" :class="{ 'sidebar--open': mobileNavOpen }" :aria-hidden="sidebarHidden" :inert="sidebarHidden" aria-label="工作区导航">
      <div class="brand-row">
        <img :src="eotionIconUrl" class="brand-mark brand-mark--image" alt="" aria-hidden="true" />
        <strong>Eotion</strong>
        <button class="icon-button sidebar-close" type="button" aria-label="关闭导航菜单" @click="closeMobileNav">×</button>
      </div>

      <div class="product-sidebar-section">
        <span class="product-section-label">工作区</span>
        <button class="product-workspace-trigger" type="button" aria-label="切换工作区" :aria-expanded="switcherOpen" @click="switcherOpen = !switcherOpen; formMode = null; operationError = ''">
          <span class="product-workspace-avatar" aria-hidden="true">{{ currentWorkspace?.name.slice(0, 1) || 'E' }}</span>
          <span class="product-workspace-name">{{ currentWorkspace?.name ?? (workspaces.loading ? '正在加载…' : '选择工作区') }}</span>
          <span class="product-chevron" aria-hidden="true">⌄</span>
        </button>
        <div v-if="switcherOpen" class="product-switcher-panel">
          <p v-if="workspaces.loading" class="product-message" role="status">正在加载工作区…</p>
          <p v-else-if="workspaces.items.length === 0" class="product-message">还没有工作区</p>
          <ul v-else class="product-workspace-list" aria-label="可用工作区">
            <li v-for="item in workspaces.items" :key="item.id">
              <button class="product-workspace-option" type="button" :aria-current="item.id === workspaceId ? 'page' : undefined" @click="selectWorkspace(item.id)">
                <span class="product-workspace-avatar" aria-hidden="true">{{ item.name.slice(0, 1) }}</span>
                <span class="product-workspace-name">{{ item.name }}</span>
                <span v-if="item.id === workspaceId" class="product-check" aria-label="当前工作区">✓</span>
              </button>
            </li>
          </ul>
          <div class="product-switcher-actions">
            <button class="product-text-button" type="button" :disabled="!workspaces.loaded" @click="formMode = formMode === 'create' ? null : 'create'; operationError = ''">新建工作区</button>
            <button v-if="currentWorkspace" class="product-text-button" type="button" :disabled="!workspaces.loaded" @click="formMode = formMode === 'rename' ? null : 'rename'; operationError = ''">重命名当前工作区</button>
          </div>
          <WorkspaceCreateForm v-if="formMode === 'create' && workspaces.loaded" :pending="workspaces.createPending" :error="operationError || workspaces.mutationError" @submit="createWorkspace" />
          <WorkspaceRenameForm v-if="formMode === 'rename' && currentWorkspace && workspaces.loaded" :initial-name="currentWorkspace.name" :pending="workspaces.renamePending" :error="operationError || workspaces.mutationError" @submit="renameWorkspace" />
        </div>
      </div>

      <PageTree @navigate="closeMobileNav" />

      <div class="sidebar-footer product-sidebar-footer">
        <span class="product-user-email">{{ auth.user?.email }}</span>
        <button class="product-text-button product-logout" type="button" :disabled="auth.logoutPending" @click="logout">{{ auth.logoutPending ? '正在退出…' : '退出登录' }}</button>
        <p v-if="logoutError" class="product-message product-message--error" role="alert">{{ logoutError }}</p>
      </div>
    </aside>

    <div v-if="mobileNavOpen" class="sidebar-scrim" aria-hidden="true" @click="closeMobileNav" />

    <main class="main-pane">
      <header class="topbar product-topbar">
        <button class="icon-button mobile-menu" type="button" aria-label="打开导航菜单" @click="mobileNavOpen = true">☰</button>
        <div class="breadcrumb">{{ breadcrumb }}</div>
        <button v-if="sync.state === 'failed' || sync.state === 'offline'" class="product-text-button" type="button" @click="sync.retry()">{{ sync.state === 'offline' ? '离线 · 本地已保存' : `同步失败 · ${sync.pending} 项待同步 · 重试` }}</button>
        <span v-else class="product-save-status" role="status">{{ sync.state === 'syncing' ? '正在同步…' : sync.pending ? `${sync.pending} 项待同步` : sync.state === 'synced' ? '已同步' : '' }}</span>
      </header>

      <article class="document-wrap">
        <p v-if="operationStatus" class="product-message product-message--success product-operation-status" role="status">{{ operationStatus }}</p>
        <section v-if="workspaces.error" class="document product-state" aria-labelledby="workspace-load-error-title">
          <h1 id="workspace-load-error-title">暂时无法加载工作区</h1>
          <p class="lead" role="alert">{{ workspaces.error }}</p>
          <button class="product-button product-button--primary" type="button" :disabled="workspaces.loading" @click="workspaces.load(true)">{{ workspaces.loading ? '正在重试…' : '重试' }}</button>
        </section>
        <section v-else-if="workspaces.loading && !workspaces.loaded" class="product-loading" role="status">正在加载工作区…</section>
        <section v-else-if="isUnavailable" class="document product-state" aria-labelledby="workspace-unavailable-title">
          <div class="product-state-icon" aria-hidden="true">⌕</div>
          <h1 id="workspace-unavailable-title">无法打开这个工作区</h1>
          <p class="lead">它可能已被移除，或暂时无法使用。你可以返回工作区列表并选择其他工作区。</p>
          <div class="product-state-actions"><RouterLink class="product-button product-button--primary" :to="{ name: 'product-home' }">返回工作区</RouterLink><button v-for="item in workspaces.items" :key="item.id" class="product-button" type="button" @click="selectWorkspace(item.id)">{{ item.name }}</button></div>
        </section>
        <section v-else-if="!workspaceId && workspaces.loaded && workspaces.items.length === 0" class="document product-state" aria-labelledby="workspace-create-title">
          <div class="product-state-icon" aria-hidden="true">＋</div>
          <h1 id="workspace-create-title">创建你的第一个工作区</h1>
          <p class="lead">工作区可以帮助你整理页面和想法。先为它取一个容易辨认的名字。</p>
          <WorkspaceCreateForm :pending="workspaces.createPending" :error="operationError || workspaces.mutationError" @submit="createWorkspace" />
        </section>
        <RouterView v-else />
      </article>
    </main>
  </div>
</template>
