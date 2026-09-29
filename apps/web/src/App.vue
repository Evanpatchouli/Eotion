<script setup lang="ts">
import { RouterView, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from './stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const isDevRoute = () => route.path.startsWith('/__dev')

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
  <div class="app-viewport" :data-route="route.name">
    <div v-if="!isDevRoute() && auth.status === 'restoring'" role="status" class="session-state">
      正在恢复登录状态…
    </div>
    <div v-else-if="!isDevRoute() && auth.restoreError" role="alert" class="session-state">
      <p>{{ auth.restoreError }}</p>
      <button type="button" @click="retryRestore">重试</button>
    </div>
    <RouterView v-else />
  </div>
</template>
