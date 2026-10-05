import type { AuthUserDto } from '@eotion/contracts'
import { ApiError } from '@eotion/sdk'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { api, errorMessage, isTransientServiceUnavailable, setSessionExpiredHandler } from '../services/productApi'
import { useProductWorkspacesStore } from './productWorkspaces'
import { useProductSyncStore } from './productSync'

const cachedIdentityKey = 'eotion:last-authenticated-user'
function cacheUser(user: AuthUserDto | null): void {
  try {
    if (user) localStorage.setItem(cachedIdentityKey, JSON.stringify(user))
    else localStorage.removeItem(cachedIdentityKey)
  } catch { /* Storage can be unavailable. */ }
}
function cachedUser(): AuthUserDto | null {
  try {
    const value = localStorage.getItem(cachedIdentityKey)
    const user: unknown = value ? JSON.parse(value) : null
    if (user && typeof user === 'object' && 'id' in user && 'email' in user && typeof user.id === 'string' && typeof user.email === 'string') {
      const displayName = 'displayName' in user && typeof user.displayName === 'string' ? user.displayName.trim() : ''
      return { ...user, displayName: displayName || user.email.split('@')[0] || 'Eotion 用户' } as AuthUserDto
    }
  } catch { /* Corrupt or unavailable cache is ignored. */ }
  return null
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUserDto | null>(null)
  const status = ref<'idle' | 'restoring' | 'ready'>('idle')
  const restoreError = ref('')
  const restoreDiagnosticDetail = ref('')
  const loginPending = ref(false)
  const logoutPending = ref(false)
  const error = ref('')
  const offline = ref(false)
  const profilePending = ref(false)
  const passwordPending = ref(false)
  const settingsError = ref('')
  const passwordUpdated = ref(false)

  let epoch = 0
  let restorePromise: Promise<void> | null = null

  function ensureSession(): Promise<void> {
    if (status.value === 'ready') return Promise.resolve()
    if (restorePromise) return restorePromise

    const requestEpoch = epoch
    status.value = 'restoring'
    restoreError.value = ''
    restoreDiagnosticDetail.value = ''
    const request = api.auth.me().then((currentUser) => {
      if (requestEpoch !== epoch) return
      user.value = currentUser
      offline.value = false
      cacheUser(currentUser)
      status.value = 'ready'
    }).catch((cause: unknown) => {
      if (requestEpoch !== epoch) return
      if (cause instanceof ApiError && cause.statusCode === 401) {
        expire()
        return
      }
      if (isTransientServiceUnavailable(cause)) {
        const remembered = cachedUser()
        if (remembered) {
          user.value = remembered
          offline.value = true
          status.value = 'ready'
          return
        }
      }
      restoreError.value = errorMessage(cause, '暂时无法连接服务，请重试。')
      restoreDiagnosticDetail.value = cause instanceof Error ? (cause.stack || `${cause.name}: ${cause.message}`) : String(cause)
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
    restoreDiagnosticDetail.value = ''
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
      passwordUpdated.value = false
      offline.value = false
      cacheUser(response.user)
      status.value = 'ready'
      restoreError.value = ''
      restoreDiagnosticDetail.value = ''
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

  async function updateProfile(displayName: string): Promise<boolean> {
    settingsError.value = ''
    if (profilePending.value || !user.value) return false
    if (offline.value) { settingsError.value = '当前离线，联网后才能保存昵称。'; return false }
    profilePending.value = true
    const requestEpoch = epoch
    try {
      const updated = await api.auth.updateProfile({ displayName })
      if (requestEpoch !== epoch) return false
      user.value = updated
      cacheUser(updated)
      return true
    } catch (cause: unknown) {
      if (requestEpoch === epoch) {
        if (cause instanceof ApiError && cause.statusCode === 401) expire()
        else settingsError.value = isTransientServiceUnavailable(cause) ? '暂时无法连接服务，请联网后重试。' : errorMessage(cause, '昵称保存失败，请重试。')
      }
      return false
    } finally { profilePending.value = false }
  }

  async function changePassword(currentPassword: string, newPassword: string): Promise<boolean> {
    settingsError.value = ''
    if (passwordPending.value || !user.value) return false
    if (offline.value) { settingsError.value = '当前离线，联网后才能修改密码。'; return false }
    passwordPending.value = true
    const requestEpoch = epoch
    try {
      await api.auth.changePassword({ currentPassword, newPassword })
      if (requestEpoch !== epoch) return false
      expire()
      passwordUpdated.value = true
      return true
    } catch (cause: unknown) {
      if (requestEpoch === epoch) {
        if (cause instanceof ApiError && cause.statusCode === 401) expire()
        else settingsError.value = isTransientServiceUnavailable(cause) ? '暂时无法连接服务，请联网后重试。' : errorMessage(cause, '修改密码失败，请重试。')
      }
      return false
    } finally { passwordPending.value = false }
  }

  function expire(): void {
    epoch += 1
    restorePromise = null
    user.value = null
    offline.value = false
    cacheUser(null)
    status.value = 'ready'
    restoreError.value = ''
    restoreDiagnosticDetail.value = ''
    error.value = ''
    useProductWorkspacesStore().reset()
    useProductSyncStore().configure('', false)
  }

  setSessionExpiredHandler(expire)

  return { user, status, restoreError, restoreDiagnosticDetail, loginPending, logoutPending, profilePending, passwordPending, passwordUpdated, settingsError, error, offline, ensureSession, retryRestore, login, logout, updateProfile, changePassword, expire }
})
