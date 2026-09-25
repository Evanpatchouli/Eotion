import { contextBridge, ipcRenderer } from 'electron'
import type { LocalStore } from '@eotion/storage'

const storage: LocalStore = {
  getPage: (id) => ipcRenderer.invoke('eotion:storage:getPage', id),
  listPages: () => ipcRenderer.invoke('eotion:storage:listPages'),
  upsertPage: (page) => ipcRenderer.invoke('eotion:storage:upsertPage', page),
  deletePage: (id) => ipcRenderer.invoke('eotion:storage:deletePage', id),
  getBlock: (id) => ipcRenderer.invoke('eotion:storage:getBlock', id),
  listBlocksByPage: (pageId) => ipcRenderer.invoke('eotion:storage:listBlocksByPage', pageId),
  upsertBlock: (block) => ipcRenderer.invoke('eotion:storage:upsertBlock', block),
  deleteBlock: (id) => ipcRenderer.invoke('eotion:storage:deleteBlock', id),
  getPendingOperations: () => ipcRenderer.invoke('eotion:storage:getPendingOperations'),
  markOperationSynced: (id) => ipcRenderer.invoke('eotion:storage:markOperationSynced', id),
  markOperationFailed: (id) => ipcRenderer.invoke('eotion:storage:markOperationFailed', id),
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
