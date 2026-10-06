import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import { join } from 'node:path'
import { registerProductionProtocol } from './production-protocol'
import { SqliteLocalStore } from './sqlite-store'

declare const __EOTION_DESKTOP_API_ORIGIN__: string

function registerStorageBridge(store: SqliteLocalStore): void {
  const trusted = (senderId: number, frame: Electron.WebFrameMain | null): void => {
    const window = BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.id === senderId)
    if (!window || frame !== window.webContents.mainFrame) throw new Error('Untrusted storage IPC sender')
  }
  const handle = <T extends unknown[]>(name: string, run: (...args: T) => Promise<unknown>): void => {
    ipcMain.handle(`eotion:storage:${name}`, (event, ...args: T) => {
      trusted(event.sender.id, event.senderFrame)
      return run(...args)
    })
  }

  handle('getPage', (id: string) => store.getPage(id))
  handle('clearAllData', () => store.clearAllData())
  handle('listPages', () => store.listPages())
  handle('listPagesByWorkspace', (workspaceId: string) => store.listPagesByWorkspace(workspaceId))
  handle('hasWorkspaceSnapshot', (workspaceId: string) => store.hasWorkspaceSnapshot(workspaceId))
  handle('upsertPage', (page: Parameters<SqliteLocalStore['upsertPage']>[0]) => store.upsertPage(page))
  handle('movePage', (workspaceId: string, id: string, parentPageId: string | null, orderKey: string) => store.movePage(workspaceId, id, parentPageId, orderKey))
  handle('deletePage', (workspaceId: string, id: string) => store.deletePage(workspaceId, id))
  handle('replaceWorkspaceSnapshot', (workspaceId: string, pages: Parameters<SqliteLocalStore['replaceWorkspaceSnapshot']>[1], blocks: Parameters<SqliteLocalStore['replaceWorkspaceSnapshot']>[2]) => store.replaceWorkspaceSnapshot(workspaceId, pages, blocks))
  handle('getBlock', (id: string) => store.getBlock(id))
  handle('listBlocksByPage', (pageId: string) => store.listBlocksByPage(pageId))
  handle('upsertBlock', (block: Parameters<SqliteLocalStore['upsertBlock']>[0]) => store.upsertBlock(block))
  handle('moveBlock', (workspaceId: string, id: string, parentBlockId: string | null, orderKey: string) => store.moveBlock(workspaceId, id, parentBlockId, orderKey))
  handle('deleteBlock', (workspaceId: string, id: string) => store.deleteBlock(workspaceId, id))
  handle('getPendingOperations', () => store.getPendingOperations())
  handle('markOperationSynced', (id: string) => store.markOperationSynced(id))
  handle('markOperationFailed', (id: string) => store.markOperationFailed(id))
  handle('enqueueFileCleanup', (workspaceId: string, fileId: string) => store.enqueueFileCleanup(workspaceId, fileId))
  handle('listFileCleanups', () => store.listFileCleanups())
  handle('listReadyFileCleanups', () => store.listReadyFileCleanups())
  handle('completeFileCleanup', (workspaceId: string, fileId: string) => store.completeFileCleanup(workspaceId, fileId))
  handle('failFileCleanup', (workspaceId: string, fileId: string, error: string) => store.failFileCleanup(workspaceId, fileId, error))
}

function createWindow() {
  const appIconPath = join(__dirname, '../../resources/icon.png')
  const window = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 390,
    minHeight: 620,
    show: false,
    backgroundColor: '#ffffff',
    icon: appIconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.once('ready-to-show', () => window.show())

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.on('will-frame-navigate', (event) => event.preventDefault())

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else if (productionOrigin) {
    void window.loadURL(`${productionOrigin}/`)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

let productionOrigin: string | undefined

app.whenReady().then(async () => {
  const store = new SqliteLocalStore(join(app.getPath('userData'), 'eotion-local.sqlite'))
  registerStorageBridge(store)
  app.on('before-quit', () => store.close())

  if (!process.env.ELECTRON_RENDERER_URL) {
    const configuredOrigin = process.env.EOTION_DESKTOP_API_ORIGIN?.trim() || __EOTION_DESKTOP_API_ORIGIN__.trim()
    if (!configuredOrigin) {
      console.error('EOTION_DESKTOP_API_ORIGIN is not configured; opening the bundled file renderer')
    } else {
      try {
        const origin = await registerProductionProtocol(session.defaultSession, join(__dirname, '../renderer'), configuredOrigin)
        productionOrigin = origin.origin
      } catch (error) {
        console.error('Unable to enable the production HTTPS renderer protocol; opening the bundled file renderer', error)
      }
    }
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
