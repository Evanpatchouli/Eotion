import { contextBridge, ipcRenderer } from 'electron'
import type { LocalStore } from '@eotion/storage'

type ThemeDocument = {
  documentElement: { dataset: Record<string, string | undefined> }
  addEventListener: (type: 'DOMContentLoaded', listener: () => void, options: { once: true }) => void
}
type ThemeObserver = {
  observe: (target: object, options: { attributes: boolean; attributeFilter: string[] }) => void
}
type ThemeObserverConstructor = new (callback: () => void) => ThemeObserver

const pageDocument = (globalThis as typeof globalThis & { document: ThemeDocument }).document
const PageMutationObserver = (globalThis as typeof globalThis & { MutationObserver: ThemeObserverConstructor }).MutationObserver
let lastTheme: string | undefined

function syncTheme(): void {
  const theme = pageDocument.documentElement.dataset.theme
  if ((theme !== 'light' && theme !== 'dark') || theme === lastTheme) return
  lastTheme = theme
  ipcRenderer.send('eotion:appearance:theme', theme)
}

pageDocument.addEventListener('DOMContentLoaded', () => {
  syncTheme()
  const observer = new PageMutationObserver(syncTheme)
  observer.observe(pageDocument.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
}, { once: true })

const storage: LocalStore = {
  clearAllData: () => ipcRenderer.invoke('eotion:storage:clearAllData'),
  getPage: (id) => ipcRenderer.invoke('eotion:storage:getPage', id),
  listPages: () => ipcRenderer.invoke('eotion:storage:listPages'),
  listPagesByWorkspace: (workspaceId) => ipcRenderer.invoke('eotion:storage:listPagesByWorkspace', workspaceId),
  hasWorkspaceSnapshot: (workspaceId) => ipcRenderer.invoke('eotion:storage:hasWorkspaceSnapshot', workspaceId),
  upsertPage: (page) => ipcRenderer.invoke('eotion:storage:upsertPage', page),
  movePage: (workspaceId, id, parentPageId, orderKey) => ipcRenderer.invoke('eotion:storage:movePage', workspaceId, id, parentPageId, orderKey),
  deletePage: (workspaceId, id) => ipcRenderer.invoke('eotion:storage:deletePage', workspaceId, id),
  replaceWorkspaceSnapshot: (workspaceId, pages, blocks) => ipcRenderer.invoke('eotion:storage:replaceWorkspaceSnapshot', workspaceId, pages, blocks),
  getBlock: (id) => ipcRenderer.invoke('eotion:storage:getBlock', id),
  listBlocksByPage: (pageId) => ipcRenderer.invoke('eotion:storage:listBlocksByPage', pageId),
  upsertBlock: (block) => ipcRenderer.invoke('eotion:storage:upsertBlock', block),
  moveBlock: (workspaceId, id, parentBlockId, orderKey) => ipcRenderer.invoke('eotion:storage:moveBlock', workspaceId, id, parentBlockId, orderKey),
  deleteBlock: (workspaceId, id) => ipcRenderer.invoke('eotion:storage:deleteBlock', workspaceId, id),
  getPendingOperations: () => ipcRenderer.invoke('eotion:storage:getPendingOperations'),
  markOperationSynced: (id) => ipcRenderer.invoke('eotion:storage:markOperationSynced', id),
  markOperationFailed: (id) => ipcRenderer.invoke('eotion:storage:markOperationFailed', id),
  enqueueFileCleanup: (workspaceId, fileId) => ipcRenderer.invoke('eotion:storage:enqueueFileCleanup', workspaceId, fileId),
  listFileCleanups: () => ipcRenderer.invoke('eotion:storage:listFileCleanups'),
  listReadyFileCleanups: () => ipcRenderer.invoke('eotion:storage:listReadyFileCleanups'),
  completeFileCleanup: (workspaceId, fileId) => ipcRenderer.invoke('eotion:storage:completeFileCleanup', workspaceId, fileId),
  failFileCleanup: (workspaceId, fileId, error) => ipcRenderer.invoke('eotion:storage:failFileCleanup', workspaceId, fileId, error),
}

contextBridge.exposeInMainWorld('eotionDesktop', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  storage,
})
