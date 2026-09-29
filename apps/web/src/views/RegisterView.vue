<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import eotionIconUrl from '../assets/eotion-icon.png'
import { api, errorMessage } from '../services/productApi'
import '../styles/product.css'

const router = useRouter()
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const pending = ref(false)
const error = ref('')
const passwordsMatch = computed(() => password.value === confirmPassword.value)
const canSubmit = computed(() => email.value.trim().length > 0 && password.value.length > 0 && confirmPassword.value.length > 0 && passwordsMatch.value && !pending.value)

async function submit() {
  if (!canSubmit.value) return
  pending.value = true
  error.value = ''
  const registeredEmail = email.value.trim()
  try {
    await api.auth.register({ email: registeredEmail, password: password.value })
    await router.replace({ name: 'login', query: { email: registeredEmail } })
  } catch (cause: unknown) {
    error.value = errorMessage(cause, '注册失败，请稍后重试。')
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <main class="product-login-page">
    <section class="product-login-card" aria-labelledby="register-title">
      <div class="product-login-brand"><img :src="eotionIconUrl" class="brand-mark brand-mark--image" alt="" aria-hidden="true" /><span>Eotion</span></div>
      <h1 id="register-title">注册 Eotion</h1>
      <p class="product-login-copy">创建账号，开始整理你的工作区。</p>
      <form class="product-form" @submit.prevent="submit">
        <label class="product-field">
          <span>邮箱</span>
          <input v-model="email" aria-label="邮箱" type="email" autocomplete="email" inputmode="email" required />
        </label>
        <label class="product-field">
          <span>密码</span>
          <input v-model="password" aria-label="密码" type="password" autocomplete="new-password" required />
        </label>
        <label class="product-field">
          <span>确认密码</span>
          <input v-model="confirmPassword" aria-label="确认密码" type="password" autocomplete="new-password" required />
        </label>
        <p v-if="confirmPassword && !passwordsMatch" class="product-message product-message--error" role="alert">两次输入的密码不一致。</p>
        <p v-if="error" class="product-message product-message--error" role="alert">{{ error }}</p>
        <button class="product-button product-button--primary product-login-submit" type="submit" :disabled="!canSubmit">
          {{ pending ? '正在注册…' : '注册' }}
        </button>
      </form>
      <p class="product-auth-switch"><RouterLink to="/login">已有账号，前往登录</RouterLink></p>
    </section>
  </main>
</template>
