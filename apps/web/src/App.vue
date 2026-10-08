<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from './stores/auth'
import { useRuntimeContext } from './composables/useRuntimeContext'
import EotionIcon from './components/ui/EotionIcon.vue'
import './styles/product.css'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { runtime } = useRuntimeContext()
const diagnosticsOpen = ref(false)
const showDiagnosticDetails = import.meta.env.VITE_SHOW_DIAGNOSTIC_DETAILS === 'true'

function toggleDiagnostics(event: Event) {
  diagnosticsOpen.value = (event.currentTarget as HTMLDetailsElement).open
}

const isDevRoute = () => route.path.startsWith('/__dev')
const isProductShellRoute = computed(() => /^\/app(?:\/|$)/.test(route.path)
  && Boolean(auth.user))
const showDesktopFallbackTitlebar = computed(() => runtime.value === 'electron'
  && !isProductShellRoute.value)

async function retryRestore() {
  await auth.retryRestore()
  if (auth.restoreError) return
  if (route.meta.requiresAuth && !auth.user) {
    await router.replace({ name: 'login', query: { redirect: route.fullPath } })
    return
  }
  if ((route.name === 'login' || route.name === 'register') && auth.user) {
    if (route.name === 'register') {
      await router.replace('/app')
      return
    }
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : ''
    const redirectPath = redirect.split(/[?#]/, 1)[0] ?? ''
    await router.replace(redirectPath === '/app' || redirectPath.startsWith('/app/') ? redirect : '/app')
  }
}
</script>

<template>
  <div class="app-viewport" :class="{ 'app-viewport--desktop-titlebar': showDesktopFallbackTitlebar }" :data-runtime="runtime" :data-route="route.name">
    <header v-if="showDesktopFallbackTitlebar" class="desktop-fallback-titlebar">Eotion</header>
    <main v-if="!isDevRoute() && !auth.user && auth.status === 'restoring'" role="status" class="connectivity-state" :class="{ 'desktop-fallback-content': showDesktopFallbackTitlebar }">
      <section class="connectivity-card">
        <div class="connectivity-brand">
          <span class="connectivity-mark connectivity-mark--loading"><EotionIcon name="refresh" :size="20" /></span>
          <span>Eotion</span>
        </div>
        <p class="connectivity-copy">正在恢复登录状态…</p>
      </section>
    </main>
    <main v-else-if="!isDevRoute() && !auth.user && auth.restoreError" role="alert" class="connectivity-state" :class="{ 'desktop-fallback-content': showDesktopFallbackTitlebar }">
      <section class="connectivity-card" aria-labelledby="connectivity-title">
        <div class="connectivity-brand">
          <span class="connectivity-mark"><EotionIcon name="alert" :size="20" /></span>
          <span>Eotion</span>
        </div>
        <h1 id="connectivity-title">暂时无法连接 Eotion</h1>
        <p class="connectivity-copy">无法验证登录状态，请检查服务或网络后重试</p>
        <button class="product-button product-button--primary connectivity-retry" type="button" :disabled="auth.status === 'restoring'" @click="retryRestore">
          {{ auth.status === 'restoring' ? '正在重试…' : '重试' }}
        </button>
        <details v-if="showDiagnosticDetails" class="connectivity-diagnostics" @toggle="toggleDiagnostics">
          <summary>
            <span class="connectivity-diagnostics-icon"><EotionIcon :name="diagnosticsOpen ? 'chevron-down' : 'chevron-right'" :size="16" /></span>
            <span>查看诊断信息</span>
          </summary>
          <pre>{{ auth.restoreDiagnosticDetail || auth.restoreError }}</pre>
        </details>
      </section>
    </main>
    <RouterView v-else :class="{ 'desktop-fallback-content': showDesktopFallbackTitlebar }" />
  </div>
</template>

<style scoped>
.connectivity-state {
  display: grid;
  min-height: 100%;
  place-items: center;
  padding: 24px;
  background: var(--surface-muted);
}

.app-viewport--desktop-titlebar {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
}

.desktop-fallback-titlebar {
  display: flex;
  height: 44px;
  min-height: 44px;
  flex: none;
  align-items: center;
  padding-left: calc(14px + env(titlebar-area-x, 0px));
  padding-right: calc(14px + max(0px, 100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw)));
  background: var(--e-color-canvas);
  color: var(--e-color-text-primary);
  font: var(--e-type-ui-weight) var(--e-type-ui-size) / var(--e-type-ui-line) var(--e-type-family);
  -webkit-app-region: drag;
}

.desktop-fallback-content {
  min-height: 0;
  flex: 1;
}

.app-viewport--desktop-titlebar > .connectivity-state,
.app-viewport--desktop-titlebar > .product-login-page {
  min-height: 0;
}

.connectivity-card {
  width: min(100%, 390px);
  padding: 30px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-raised);
  box-shadow: var(--shadow-card);
}

.connectivity-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 28px;
  font-size: 15px;
  font-weight: 700;
}

.connectivity-mark {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-subtle);
  color: var(--text-secondary);
}

.connectivity-mark--loading {
  animation: connectivity-spin 1.4s linear infinite;
}

.connectivity-card h1 {
  margin: 0 0 8px;
  font-size: clamp(24px, 7vw, 29px);
  letter-spacing: -.025em;
}

.connectivity-copy {
  margin: 0;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.65;
}

.connectivity-retry {
  width: 100%;
  margin-top: 24px;
}

.connectivity-diagnostics {
  margin-top: 18px;
  color: var(--text-muted);
  font-size: 12px;
}

.connectivity-diagnostics summary {
  display: flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  min-height: 28px;
  padding: 2px 4px;
  border-radius: 4px;
  list-style: none;
  cursor: pointer;
}

.connectivity-diagnostics summary::-webkit-details-marker { display: none; }
.connectivity-diagnostics summary::marker { content: ''; }

.connectivity-diagnostics summary:hover,
.connectivity-diagnostics[open] summary {
  background: var(--surface-muted);
  color: var(--text-secondary);
}

.connectivity-diagnostics summary:focus-visible {
  outline: 2px solid var(--text-muted);
  outline-offset: 2px;
}

.connectivity-diagnostics-icon {
  display: flex;
  flex: 0 0 16px;
  width: 16px;
  height: 16px;
}

.connectivity-diagnostics pre {
  margin: 10px 0 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  color: var(--text-muted);
  font: inherit;
  line-height: 1.55;
}

@keyframes connectivity-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .connectivity-mark--loading { animation: none; }
}

@media (max-width: 420px) {
  .connectivity-state { padding: 18px; }
  .connectivity-card { padding: 26px 22px; }
}
</style>
