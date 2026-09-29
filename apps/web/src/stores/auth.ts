import type { AuthUserDto } from '@eotion/contracts'
import { ApiError } from '@eotion/sdk'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { api, errorMessage, setSessionExpiredHandler } from '../services/productApi'
import { useProductWorkspacesStore } from './productWorkspaces'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUserDto | null>(null)
  const status = ref<'idle' | 'restoring' | 'ready'>('idle')
  const restoreError = ref('')
  const loginPending = ref(false)
  const logoutPending = ref(false)
  const error = ref('')

  let epoch = 0
  let restorePromise: Promise<void> | null = null

  function ensureSession(): Promise<void> {
    if (status.value === 'ready') return Promise.resolve()
    if (restorePromise) return restorePromise

    const requestEpoch = epoch
    status.value = 'restoring'
    restoreError.value = ''
    const request = api.auth.me().then((currentUser) => {
      if (requestEpoch !== epoch) return
      user.value = currentUser
      status.value = 'ready'
    }).catch((cause: unknown) => {
      if (requestEpoch !== epoch) return
      if (cause instanceof ApiError && cause.statusCode === 401) {
        user.value = null
        status.value = 'ready'
        return
      }
      restoreError.value = errorMessage(cause, '暂时无法连接服务，请重试。')
      status.value = 'ready'
    }).finally(() => {
      if (restorePromise === request) restorePromise = null
    })
    restorePromise = request
    return request
  }

  async function retryRestore(): Promise<void> {
    epoch += 1
    restorePromise = null
    status.value = 'idle'
    restoreError.value = ''
    await ensureSession()
  }

  async function login(email: string, password: string): Promise<boolean> {
    if (loginPending.value) return false
    loginPending.value = true
    error.value = ''
    const requestEpoch = ++epoch
    restorePromise = null
    try {
      const response = await api.auth.login({ email, password })
      if (requestEpoch !== epoch) return false
      user.value = response.user
      status.value = 'ready'
      restoreError.value = ''
      useProductWorkspacesStore().reset()
      return true
    } catch (cause: unknown) {
      if (requestEpoch === epoch) error.value = errorMessage(cause, '登录失败，请稍后重试。')
      return false
    } finally {
      loginPending.value = false
    }
  }

  async function logout(): Promise<boolean> {
    if (logoutPending.value) return false
    logoutPending.value = true
    error.value = ''
    const requestEpoch = epoch
    try {
      await api.auth.logout()
      if (requestEpoch !== epoch) return false
      expire()
      return true
    } catch (cause: unknown) {
      if (requestEpoch === epoch) error.value = errorMessage(cause, '注销失败，请重试。')
      return false
    } finally {
      logoutPending.value = false
    }
  }

  function expire(): void {
    epoch += 1
    restorePromise = null
    user.value = null
    status.value = 'ready'
    restoreError.value = ''
    error.value = ''
    useProductWorkspacesStore().reset()
  }

  setSessionExpiredHandler(expire)

  return { user, status, restoreError, loginPending, logoutPending, error, ensureSession, retryRestore, login, logout, expire }
})
