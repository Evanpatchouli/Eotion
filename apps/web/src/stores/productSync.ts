import { EotionOperationTransport } from '@eotion/sdk'
import { reconnectPending, type LocalStore } from '@eotion/storage'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { flushActivePageEditor } from '../editor/activePageEditor'
import { api, errorMessage, expireSessionFromApi, ApiError } from '../services/productApi'
import { createLocalStore } from '../storage/createLocalStore'
import { useAuthStore } from './auth'
import { useProductWorkspacesStore } from './productWorkspaces'

let localStorePromise: Promise<LocalStore> | null = null
function localStore(): Promise<LocalStore> {
  localStorePromise ??= createLocalStore().then(({ store }) => store).catch((error: unknown) => {
    localStorePromise = null
    throw error
  })
  return localStorePromise
}

export const useProductSyncStore = defineStore('product-sync', () => {
  const state = ref<'idle' | 'syncing' | 'synced' | 'offline' | 'failed'>('idle')
  const pending = ref(0)
  const error = ref('')
  const revision = ref(0)
  const snapshotRevision = ref(0)
  let userId = ''
  let activeWorkspaceId = ''
  let identityEpoch = 0
  let offlineIdentity = false
  let running: Promise<void> | null = null
  let requested = false
  let timer: ReturnType<typeof setTimeout> | null = null

  function configure(id: string, offline: boolean): void {
    if (userId !== id) {
      identityEpoch += 1
      userId = id
      activeWorkspaceId = ''
      requested = false
      if (timer) clearTimeout(timer)
      timer = null
      state.value = offline ? 'offline' : 'idle'
      error.value = ''
      pending.value = 0
    }
    offlineIdentity = offline
    if (id && !offline) requestSync()
  }

  async function store(): Promise<LocalStore> { return localStore() }

  async function updatePending(): Promise<void> {
    const accessible = new Set(useProductWorkspacesStore().items.map((item) => item.id))
    pending.value = (await (await store()).getPendingOperations()).filter((op) => accessible.has(op.workspaceId)).length
  }

  function localMutation(): void {
    revision.value += 1
    void updatePending().catch(() => undefined)
    requestSync()
  }

  async function prepare(workspaceId: string): Promise<boolean> {
    activeWorkspaceId = workspaceId
    const local = await store()
    if (await local.hasWorkspaceSnapshot(workspaceId)) {
      requestSync()
      return true
    }
    if (offlineIdentity || !navigator.onLine) {
      state.value = 'offline'
      return false
    }
    // Session restore may already be fetching this first snapshot. Reuse that
    // run instead of requesting a second pull while the editor starts loading.
    const activeRun = running
    const activeEpoch = identityEpoch
    if (activeRun) {
      await activeRun
      if (activeEpoch === identityEpoch) return local.hasWorkspaceSnapshot(workspaceId)
    }
    await runSync()
    return local.hasWorkspaceSnapshot(workspaceId)
  }

  function leaveWorkspace(): void { activeWorkspaceId = '' }

  function requestSync(delay = 250): void {
    if (!userId) return
    requested = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { timer = null; void runSync() }, delay)
  }

  async function runSync(): Promise<void> {
    if (!userId) return
    if (timer) { clearTimeout(timer); timer = null }
    requested = true
    if (running) return running
    let deferRetry = false
    running = (async () => {
      while (requested && userId) {
        requested = false
        const activeUser = userId
        const activeEpoch = identityEpoch
        const currentIdentity = () => activeEpoch === identityEpoch && activeUser === userId && useAuthStore().user?.id === activeUser
        if (!navigator.onLine) { state.value = 'offline'; return }
        state.value = 'syncing'
        error.value = ''
        try {
          // A fresh server list authorizes every send. Cached metadata is display-only.
          const authorized = await api.workspaces.list()
          if (!currentIdentity()) return
          const ids = new Set(authorized.filter((item) => item.ownerId === activeUser).map((item) => item.id))
          useProductWorkspacesStore().acceptServerList(authorized, activeUser)
          const local = await store()
          const transport = new EotionOperationTransport(api)
          const result = await reconnectPending(local, {
            send: async (operation) => {
              if (!currentIdentity() || !ids.has(operation.workspaceId)) throw new Error('Sync identity changed')
              try {
                await transport.send(operation)
                if (!currentIdentity()) throw new Error('Sync identity changed')
              }
              catch (cause) {
                if (cause instanceof ApiError && cause.statusCode === 401) expireSessionFromApi()
                throw cause
              }
            },
          }, ids)
          if (!currentIdentity()) return
          await updatePending()
          if (result.failed || pending.value) {
            state.value = 'failed'
            error.value = '同步失败，本地内容安全。'
            return
          }
          const id = activeWorkspaceId
          if (id && ids.has(id)) {
            if (!currentIdentity()) return
            if (!(await flushActivePageEditor(id))) { state.value = 'idle'; return }
            // The editor may have committed new operations while we were
            // flushing; those must be pushed before any snapshot is read.
            if ((await local.getPendingOperations()).some((op) => op.workspaceId === id)) {
              requested = true
              deferRetry = true
              return
            }
            const snapshot = await api.sync.snapshot(id)
            if (!currentIdentity()) return
            if (id !== activeWorkspaceId) { requested = true; continue }
            if (!(await flushActivePageEditor(id))) { state.value = 'idle'; return }
            try {
              await local.replaceWorkspaceSnapshot(id, snapshot.pages, snapshot.blocks)
            } catch (cause) {
              if ((await local.getPendingOperations()).some((op) => op.workspaceId === id)) {
                requested = true
                deferRetry = true
                return
              }
              throw cause
            }
            revision.value += 1
            snapshotRevision.value += 1
          }
          if (!requested) state.value = 'synced'
        } catch (cause) {
          if (cause instanceof ApiError && cause.statusCode === 401) {
            expireSessionFromApi()
            return
          }
          state.value = !navigator.onLine || cause instanceof TypeError ? 'offline' : 'failed'
          error.value = errorMessage(cause, '同步失败，本地内容安全。')
          return
        }
      }
    })().finally(() => {
      running = null
      if (requested && userId) requestSync(deferRetry ? 250 : 0)
    })
    return running
  }

  function retry(): void { requestSync(0) }
  return { state, pending, error, revision, snapshotRevision, configure, store, updatePending, localMutation, prepare, leaveWorkspace, requestSync, runSync, retry }
})
