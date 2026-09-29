<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import eotionIconUrl from '../assets/eotion-icon.png'
import { useAuthStore } from '../stores/auth'
import '../styles/product.css'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const email = ref('')
const password = ref('')
const passwordInput = ref<HTMLInputElement | null>(null)
const canSubmit = computed(() => email.value.trim().length > 0 && password.value.length > 0 && !auth.loginPending)

function applyRegistrationEmail(value: unknown) {
  if (typeof value !== 'string') return
  email.value = value
  password.value = ''
  void nextTick(() => passwordInput.value?.focus())
}

onMounted(() => applyRegistrationEmail(route.query.email))
watch(() => route.query.email, applyRegistrationEmail)

function internalAppRedirect(): string {
  const value = route.query.redirect
  if (typeof value !== 'string' || !(value === '/app' || value.startsWith('/app/'))) return '/app'
  return value
}

async function submit() {
  if (!canSubmit.value) return
  const loggedIn = await auth.login(email.value.trim(), password.value)
  if (loggedIn) await router.replace(internalAppRedirect())
}

async function retrySession() {
  await auth.retryRestore()
  if (auth.user) await router.replace(internalAppRedirect())
}
</script>

<template>
  <main class="product-login-page">
    <section class="product-login-card" aria-labelledby="login-title">
      <div class="product-login-brand"><img :src="eotionIconUrl" class="brand-mark brand-mark--image" alt="" aria-hidden="true" /><span>Eotion</span></div>
      <h1 id="login-title">登录 Eotion</h1>
      <p class="product-login-copy">登录后继续整理你的工作区。</p>
      <div v-if="auth.restoreError" class="product-restore-error">
        <p class="product-message product-message--error" role="alert">{{ auth.restoreError }}</p>
        <button class="product-text-button" type="button" @click="retrySession">重试</button>
      </div>
      <form class="product-form" @submit.prevent="submit">
        <label class="product-field">
          <span>邮箱</span>
          <input v-model="email" aria-label="邮箱" type="email" autocomplete="username" inputmode="email" required />
        </label>
        <label class="product-field">
          <span>密码</span>
          <input ref="passwordInput" v-model="password" aria-label="密码" type="password" autocomplete="current-password" required />
        </label>
        <p v-if="auth.error" class="product-message product-message--error" role="alert">{{ auth.error }}</p>
        <button class="product-button product-button--primary product-login-submit" type="submit" :disabled="!canSubmit">
          {{ auth.loginPending ? '正在登录…' : '登录' }}
        </button>
      </form>
      <p class="product-auth-switch"><RouterLink to="/register">没有账号，立即注册</RouterLink></p>
    </section>
  </main>
</template>
