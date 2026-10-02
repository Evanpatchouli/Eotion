<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import EotionIcon from '../components/ui/EotionIcon.vue'
import { IconName } from '../components/ui/icons'
import { useRuntimeContext } from '../composables/useRuntimeContext'
import { safeProductReturnTo } from '../settingsNavigation'
import { useAuthStore } from '../stores/auth'
import { useProductWorkspacesStore } from '../stores/productWorkspaces'
import { useTheme } from '../theme'
import '../styles/settings.css'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const workspaces = useProductWorkspacesStore()
const { themePreference } = useTheme()
const { layoutMode } = useRuntimeContext()
const isIndex = computed(() => route.name === 'settings-index')
const returnTo = computed(() => safeProductReturnTo(route.query.returnTo))
const requestedWorkspace = computed(() => typeof route.query.workspaceId === 'string' ? route.query.workspaceId : '')
const currentWorkspace = computed(() => workspaces.items.find((item) => item.id === requestedWorkspace.value && item.ownerId === auth.user?.id) ?? null)
const navQuery = computed(() => ({ returnTo: returnTo.value, ...(currentWorkspace.value ? { workspaceId: currentWorkspace.value.id } : requestedWorkspace.value ? { workspaceId: requestedWorkspace.value } : {}) }))
const isCompactDetail = computed(() => layoutMode.value === 'mobile' && !isIndex.value)
const backTo = computed(() => isCompactDetail.value ? { name: 'settings-index', query: navQuery.value } : returnTo.value)
const backLabel = computed(() => isCompactDetail.value ? '返回设置列表' : '返回工作区')
const entries = [
  { group: '个人', items: [{ label: '账号资料', name: 'settings-profile', icon: IconName.User }] },
  { group: '外观', items: [{ label: '外观', name: 'settings-appearance', icon: IconName.Appearance }] },
  { group: '工作空间', items: [{ label: '通用', name: 'settings-workspace-general', icon: IconName.Workspace }] },
]

watch(() => auth.user, (user) => {
  if (!user) void router.replace({ name: 'login', query: auth.passwordUpdated ? { notice: 'password-updated' } : undefined })
})
onMounted(() => { void workspaces.load() })
</script>

<template>
  <div class="settings-shell">
    <header class="settings-topbar">
      <RouterLink class="settings-exit" :to="backTo" :aria-label="backLabel"><EotionIcon :name="IconName.ArrowLeft" :size="18" /><span>{{ backLabel }}</span></RouterLink>
      <div class="settings-topbar-title"><EotionIcon :name="IconName.Settings" :size="18" /><strong>设置</strong></div>
      <span class="settings-topbar-spacer" aria-hidden="true" />
    </header>
    <div class="settings-frame" :class="{ 'settings-frame--index': isIndex }">
      <nav class="settings-nav" aria-label="设置导航">
        <div class="settings-nav-content">
          <section v-for="section in entries" :key="section.group" class="settings-nav-group">
            <h2>{{ section.group }}</h2>
            <RouterLink v-for="entry in section.items" :key="entry.name" class="settings-nav-item" :to="{ name: entry.name, query: navQuery }" :aria-current="route.name === entry.name || (isIndex && entry.name === 'settings-profile') ? 'page' : undefined">
              <EotionIcon :name="entry.icon" :size="18" /><span>{{ entry.label }}</span>
              <span v-if="entry.name === 'settings-appearance'" class="settings-nav-value">{{ themePreference === 'system' ? '跟随系统' : themePreference === 'light' ? '浅色' : '深色' }}</span>
              <EotionIcon class="settings-nav-chevron" :name="IconName.ChevronRight" :size="16" />
            </RouterLink>
          </section>
          <section class="settings-nav-group">
            <h2>功能</h2>
            <div class="settings-nav-item settings-nav-item--reserved"><EotionIcon :name="IconName.Mcp" :size="18" /><span>MCP</span><span class="settings-nav-value">即将推出</span></div>
            <div class="settings-nav-item settings-nav-item--reserved"><EotionIcon :name="IconName.Agent" :size="18" /><span>Agent</span><span class="settings-nav-value">即将推出</span></div>
          </section>
        </div>
      </nav>
      <main class="settings-detail" id="settings-detail">
        <RouterView :workspace="currentWorkspace" :workspace-loading="workspaces.loading" />
      </main>
    </div>
  </div>
</template>
