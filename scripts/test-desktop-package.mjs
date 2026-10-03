import assert from 'node:assert/strict'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

// Read-only production API checks; all SQLite writes use a disposable profile.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { _electron: electron, chromium, expect } = createRequire(resolve(root, 'apps/web/package.json'))('@playwright/test')
const executablePath = process.argv[2] && resolve(process.argv[2])
if (!executablePath) throw new Error('Usage: node scripts/test-desktop-package.mjs <packaged Eotion.exe>')
assert.ok((await stat(executablePath)).size > 0)
const profile = await mkdtemp(resolve(tmpdir(), 'eotion-package-smoke-'))
const env = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined))
delete env.ELECTRON_RENDERER_URL
delete env.ELECTRON_RUN_AS_NODE
delete env.EOTION_DESKTOP_API_ORIGIN
const origin = 'https://eotion.evanpatchouli.space'
let app
const portable = /-portable\.exe$/i.test(executablePath)
async function launch() {
  if (!portable) return electron.launch({ executablePath, args: [`--user-data-dir=${profile}`], env, timeout: 60_000 })
  // NSIS portable launches a child executable and does not forward its debugger
  // stderr. Attach to that child's renderer rather than waiting on the wrapper.
  const server = createServer()
  await new Promise((ready) => server.listen(0, '127.0.0.1', ready))
  const port = server.address().port
  await new Promise((done) => server.close(done))
  const child = spawn(executablePath, [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'], { env, windowsHide: true, stdio: 'ignore' })
  let launchError
  child.on('error', (error) => { launchError = error })
  const closeChild = async () => {
    if (child.exitCode !== null || launchError) return
    await new Promise((done) => {
      const kill = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      kill.once('exit', done)
      kill.once('error', done)
    })
  }
  try {
    const deadline = Date.now() + 60_000
    let ready = false
    while (Date.now() < deadline) {
      if (launchError) throw launchError
      if (child.exitCode !== null) throw new Error(`Portable exited with ${child.exitCode}`)
      try { ready = (await fetch(`http://127.0.0.1:${port}/json/version`)).ok } catch { /* self-extraction is in progress */ }
      if (ready) break
      await delay(200)
    }
    assert.ok(ready, 'Portable renderer did not become ready')
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
    return {
      firstWindow: async () => {
        const pageDeadline = Date.now() + 30_000
        while (Date.now() < pageDeadline) {
          const page = browser.contexts().flatMap((context) => context.pages())[0]
          if (page) return page
          await delay(100)
        }
        throw new Error('Portable did not create a renderer window')
      },
      close: async () => { await browser.close(); await closeChild() },
    }
  } catch (error) {
    await closeChild()
    throw error
  }
}
try {
  app = await launch()
  const metadata = portable ? { launch: 'portable-self-extraction', executablePath } : await app.evaluate(({ app }) => ({ packaged: app.isPackaged, version: app.getVersion(), path: app.getAppPath() }))
  const version = createRequire(import.meta.url)(resolve(root, 'package.json')).version
  if (!portable) {
    assert.equal(metadata.packaged, true)
    assert.equal(metadata.version, version)
    assert.match(metadata.path, /app\.asar$/)
  }
  const page = await app.firstWindow()
  await expect(page.getByRole('heading', { name: '登录 Eotion' })).toBeVisible({ timeout: 30_000 })
  assert.equal(new URL(page.url()).origin, origin)
  const connectivity = await page.evaluate(async () => {
    const health = await fetch('/api/health')
    const me = await fetch('/api/auth/me', { credentials: 'include' })
    return { health: health.status, me: me.status, healthBody: await health.json() }
  })
  assert.equal(connectivity.health, 200)
  assert.equal(connectivity.me, 401)
  const id = 'packaged-smoke-page'
  await page.evaluate(async (id) => {
    const store = window.eotionDesktop.storage
    await store.upsertPage({ id, workspaceId: 'packaged-smoke-workspace', parentPageId: null, orderKey: 'a0', title: 'Packaged SQLite smoke', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
  }, id)
  await app.close()
  app = await launch()
  const reopened = await app.firstWindow()
  await expect(reopened.getByRole('heading', { name: '登录 Eotion' })).toBeVisible({ timeout: 30_000 })
  const stored = await reopened.evaluate(async (id) => ({ page: await window.eotionDesktop.storage.getPage(id), ops: await window.eotionDesktop.storage.getPendingOperations() }), id)
  assert.equal(stored.page.title, 'Packaged SQLite smoke')
  assert.ok(stored.ops.some((op) => op.kind === 'page.upsert' && op.payload.id === id))
  console.log(JSON.stringify({ executablePath, ...metadata, origin, connectivity, sqliteRestart: 'PASS', preload: 'PASS', renderer: 'PASS' }))
} finally {
  await app?.close()
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
}
