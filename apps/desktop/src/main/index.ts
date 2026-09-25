import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { SqliteLocalStore } from './sqlite-store'

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
  handle('listPages', () => store.listPages())
  handle('upsertPage', (page: Parameters<SqliteLocalStore['upsertPage']>[0]) => store.upsertPage(page))
  handle('deletePage', (id: string) => store.deletePage(id))
  handle('getBlock', (id: string) => store.getBlock(id))
  handle('listBlocksByPage', (pageId: string) => store.listBlocksByPage(pageId))
  handle('upsertBlock', (block: Parameters<SqliteLocalStore['upsertBlock']>[0]) => store.upsertBlock(block))
  handle('deleteBlock', (id: string) => store.deleteBlock(id))
  handle('getPendingOperations', () => store.getPendingOperations())
  handle('markOperationSynced', (id: string) => store.markOperationSynced(id))
  handle('markOperationFailed', (id: string) => store.markOperationFailed(id))
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 390,
    minHeight: 620,
    show: false,
    backgroundColor: '#ffffff',
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

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  const store = new SqliteLocalStore(join(app.getPath('userData'), 'eotion-local.sqlite'))
  registerStorageBridge(store)
  app.on('before-quit', () => store.close())
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
