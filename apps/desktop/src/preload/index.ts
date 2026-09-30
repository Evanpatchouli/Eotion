import { contextBridge, ipcRenderer } from 'electron'
import type { LocalStore } from '@eotion/storage'

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
  deleteBlock: (workspaceId, id) => ipcRenderer.invoke('eotion:storage:deleteBlock', workspaceId, id),
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
