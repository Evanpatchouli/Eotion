import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { createRequire } from 'node:module'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer as createHttpsServer, request as httpsRequest, type Server as HttpsServer } from 'node:https'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { mkdtempSync, rmSync } from 'node:fs'

const apiRoot = resolve('../api')
const desktopRoot = resolve('../desktop')
const rendererRoot = resolve('../desktop/out/renderer')
const apiEntry = resolve('../api/dist/main.js')
const testRequire = createRequire(resolve('../api/package.json'))
const dotenv = testRequire('dotenv') as { parse(input: string): Record<string, string> }
const envFile = resolve('../api/.env')
const configEnv = existsSync(envFile) ? dotenv.parse(readFileSync(envFile, 'utf8')) : {}
const sourceMongoUri = process.env.P4_TEST_MONGODB_URI?.trim() || configEnv.MONGODB_URI?.trim()
const mongoUri = new URL(sourceMongoUri || 'mongodb://127.0.0.1:27017/?replicaSet=rs0')
const databaseName = `eotion_desktop_prod_${randomUUID().replaceAll('-', '')}`
mongoUri.pathname = `/${databaseName}`
const isolatedMongoUri = mongoUri.toString()
const frontOrigin = 'https://localhost:7447'
const apiOrigin = 'http://127.0.0.1:7147'
const tlsKeyPath = process.env.EOTION_TEST_TLS_KEY
const tlsCertPath = process.env.EOTION_TEST_TLS_CERT
const tlsPfxPath = process.env.EOTION_TEST_TLS_PFX
const spkiHash = process.env.EOTION_TEST_TLS_SPKI
const port = 7447
const apiPort = 7147
const password = `Desktop-${randomUUID()}!a9`
const email = `desktop-${randomUUID()}@example.test`
const localProfilePrefix = 'eotion-desktop-prod-'

if (!existsSync(apiEntry)) throw new Error('Build apps/api before running desktop-production-real acceptance.')
if (!existsSync(resolve(rendererRoot, 'index.html'))) throw new Error('Build apps/desktop before running desktop-production-real acceptance.')
if (tlsPfxPath ? !existsSync(tlsPfxPath) : !(tlsKeyPath && tlsCertPath && existsSync(tlsKeyPath) && existsSync(tlsCertPath))) {
  throw new Error('Set EOTION_TEST_TLS_PFX or both EOTION_TEST_TLS_KEY and EOTION_TEST_TLS_CERT.')
}
if (spkiHash && !/^[A-Za-z0-9+/]+={0,2}$/.test(spkiHash)) throw new Error('EOTION_TEST_TLS_SPKI must be a base64 SPKI SHA-256 hash.')

type ProxyEvidence = { method: string; path: string; origin: string; kind?: string; status?: number }
const evidence: ProxyEvidence[] = []
const rendererErrors: string[] = []
const nonApiRequests: string[] = []
let apiProcess: ChildProcess | undefined
let httpsServer: HttpsServer | undefined
let profileRoot: string | undefined

function tlsOptions() {
  if (tlsPfxPath) return { pfx: readFileSync(tlsPfxPath), passphrase: '' }
  return { key: readFileSync(tlsKeyPath!), cert: readFileSync(tlsCertPath!) }
}

function createFrontServer(): HttpsServer {
  return createHttpsServer(tlsOptions(), (incoming, outgoing) => {
    const pathname = new URL(incoming.url ?? '/', frontOrigin).pathname
    if (pathname.startsWith('/api/')) {
      const chunks: Buffer[] = []
      incoming.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
      incoming.on('end', () => {
        const body = Buffer.concat(chunks)
        const parsedBody = (() => {
          if (incoming.headers['content-type']?.includes('application/json') && body.length) {
            try { return JSON.parse(body.toString('utf8')) as { kind?: unknown } } catch { return undefined }
          }
          return undefined
        })()
        const record: ProxyEvidence = {
          method: incoming.method ?? 'GET', path: pathname,
          origin: incoming.headers.origin === undefined ? '<absent>' : incoming.headers.origin,
          ...(typeof parsedBody?.kind === 'string' ? { kind: parsedBody.kind } : {}),
        }
        evidence.push(record)
        const proxyHeaders = { ...incoming.headers }
        delete proxyHeaders.connection
        delete proxyHeaders['transfer-encoding']
        proxyHeaders.host = new URL(frontOrigin).host
        if (body.length) proxyHeaders['content-length'] = String(body.length)
        else delete proxyHeaders['content-length']
        const upstream = httpRequest(`${apiOrigin}${incoming.url}`, {
          method: incoming.method,
          headers: proxyHeaders,
        }, (response) => {
          record.status = response.statusCode ?? 502
          outgoing.writeHead(response.statusCode ?? 502, response.headers)
          response.pipe(outgoing)
        })
        upstream.on('error', () => {
          record.status = 502
          if (!outgoing.headersSent) outgoing.writeHead(502, { 'content-type': 'application/json' })
          outgoing.end(JSON.stringify({ statusCode: 502, message: 'API unavailable' }))
        })
        if (body.length) upstream.write(body)
        upstream.end()
      })
      return
    }

    nonApiRequests.push(pathname)
    outgoing.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' })
    outgoing.end('Bundled Electron renderer must not request network assets.')
  })
}

async function listenFront(): Promise<void> {
  httpsServer = createFrontServer()
  await new Promise<void>((resolveListen, reject) => {
    httpsServer!.once('error', reject)
    httpsServer!.listen(port, () => {
      httpsServer!.off('error', reject)
      resolveListen()
    })
  })
}

async function closeFront(): Promise<void> {
  const server = httpsServer
  if (!server) return
  httpsServer = undefined
  const closed = new Promise<void>((resolveClose) => server.close(() => resolveClose()))
  server.closeAllConnections()
  await closed
}

async function frontConnectionError(): Promise<string> {
  return new Promise((resolveError) => {
    const request = httpsRequest(frontOrigin, { rejectUnauthorized: false }, (response) => {
      response.resume()
      resolveError(`HTTP_${response.statusCode ?? 'unknown'}`)
    })
    request.once('error', (error: NodeJS.ErrnoException) => resolveError(error.code ?? 'unknown-network-error'))
    request.end()
  })
}

async function waitForApi(child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Production API exited before readiness (code ${child.exitCode}).`)
    try {
      const response = await fetch(`${apiOrigin}/api/health`)
      if (response.ok) return
    } catch { /* API is still booting. */ }
    await delay(250)
  }
  throw new Error('Production API did not become ready within 30 seconds.')
}

function launchElectron(profile: string, useConfiguredOrigin = true): Promise<ElectronApplication> {
  const executable = process.platform === 'win32' ? 'electron.exe'
    : process.platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : 'electron'
  const args = [resolve(desktopRoot, 'out/main/index.js'), `--user-data-dir=${profile}`]
  if (spkiHash) args.push(`--ignore-certificate-errors-spki-list=${spkiHash}`)
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
  if (useConfiguredOrigin) env.EOTION_DESKTOP_API_ORIGIN = frontOrigin
  else delete env.EOTION_DESKTOP_API_ORIGIN
  delete env.ELECTRON_RENDERER_URL
  return electron.launch({ executablePath: resolve(desktopRoot, 'node_modules/electron/dist', executable), args, env })
}

async function killTree(app: ElectronApplication): Promise<void> {
  const child = app.process()
  if (child.exitCode !== null) return
  const exited = new Promise<void>((resolveExit) => child.once('exit', () => resolveExit()))
  if (process.platform === 'win32' && child.pid) {
    await new Promise<void>((resolveKill, reject) => {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
      killer.once('error', reject)
      killer.once('exit', (code) => code === 0 ? resolveKill() : reject(new Error(`taskkill exited with ${code}`)))
    })
  } else {
    child.kill('SIGKILL')
  }
  if (child.exitCode === null) await exited
}

async function registerAndLogin(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: '登录 Eotion' })).toBeVisible()
  await page.getByRole('link', { name: '没有账号，立即注册' }).click()
  await expect(page.getByRole('heading', { name: '注册 Eotion' })).toBeVisible()
  await page.getByRole('textbox', { name: '邮箱' }).fill(email)
  await page.getByLabel('密码', { exact: true }).fill(password)
  await page.getByLabel('确认密码').fill(password)
  await page.getByRole('button', { name: '注册', exact: true }).click()
  await expect(page).toHaveURL(/#\/login/)
  await page.getByLabel('密码', { exact: true }).fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/#\/app/)
}

async function login(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: '登录 Eotion' })).toBeVisible()
  await page.getByRole('textbox', { name: '邮箱' }).fill(email)
  await page.getByLabel('密码', { exact: true }).fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/#\/app/)
}

async function openProduct(page: Page, workspaceId: string, pageId: string): Promise<void> {
  await page.getByRole('treeitem').filter({ has: page.getByRole('button', { name: '无标题', exact: true }) })
    .getByRole('button', { name: '无标题', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`#\\/app\\/${workspaceId}\\/page\\/${pageId}$`))
  try {
    await expect(page.locator('.eotion-editor-content .tiptap')).toBeVisible()
  } catch (error) {
    const diagnostics = await page.evaluate(async () => ({
      url: location.href,
      body: document.body.innerText,
      authMe: await fetch('/api/auth/me', { credentials: 'include' }).then((response) => response.status).catch(() => 'network-error'),
    }))
    console.log('Electron route diagnostic', JSON.stringify({ diagnostics, recentApi: evidence.slice(-12), rendererErrors }))
    throw error
  }
}

function captureRendererErrors(page: Page): void {
  page.on('console', (message) => { if (message.type() === 'error') rendererErrors.push(message.text()) })
  page.on('pageerror', (error) => rendererErrors.push(error.message))
}

async function pendingCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const bridge = (window as Window & { eotionDesktop?: { storage: { getPendingOperations(): Promise<unknown[]> } } }).eotionDesktop
    if (!bridge) throw new Error('Desktop storage bridge is missing.')
    return (await bridge.storage.getPendingOperations()).length
  })
}

async function pendingJson(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const bridge = (window as Window & { eotionDesktop?: { storage: { getPendingOperations(): Promise<unknown[]> } } }).eotionDesktop
    if (!bridge) throw new Error('Desktop storage bridge is missing.')
    return JSON.stringify(await bridge.storage.getPendingOperations())
  })
}

async function stopApi(): Promise<void> {
  if (!apiProcess || apiProcess.exitCode !== null) return
  const child = apiProcess
  apiProcess = undefined
  const exited = new Promise<void>((resolveExit) => child.once('exit', () => resolveExit()))
  if (process.platform === 'win32' && child.pid) {
    await new Promise<void>((resolveKill) => {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
      killer.once('exit', () => resolveKill())
      killer.once('error', () => resolveKill())
    })
  } else {
    child.kill('SIGTERM')
    if (child.exitCode === null) await exited
  }
}

test('built Electron uses secure real API sessions and restores SQLite edits across offline restarts', async () => {
  const requireFromApi = createRequire(resolve('../api/package.json'))
  const mongoose = requireFromApi('mongoose') as {
    connect(uri: string): Promise<unknown>
    connection: { dropDatabase(): Promise<unknown> }
    disconnect(): Promise<unknown>
  }
  const launchOptions = {
    cwd: apiRoot,
    env: {
      ...process.env,
      NODE_ENV: 'production', PORT: String(apiPort), HOST: '127.0.0.1',
      MONGODB_URI: isolatedMongoUri, WEB_ORIGIN: frontOrigin, API_ORIGIN: frontOrigin,
      ALI_OSS_SERVER_URL: 'http://127.0.0.1:7199', ALI_OSS_CLIENT_ID: 'desktop-production-test',
      ALI_OSS_CLIENT_SECRET: 'synthetic-desktop-production-test',
    },
    stdio: 'ignore' as const,
    windowsHide: true,
  }
  profileRoot = mkdtempSync(resolve(tmpdir(), localProfilePrefix))
  let app: ElectronApplication | undefined
  const firstProfile = resolve(profileRoot, 'primary')
  const secondProfile = resolve(profileRoot, 'secondary')
  try {
    apiProcess = spawn(process.execPath, [apiEntry], launchOptions)
    await waitForApi(apiProcess)
    await listenFront()

    app = await launchElectron(firstProfile)
    let page = await app.firstWindow()
    captureRendererErrors(page)
    await expect.poll(() => page.evaluate(() => location.origin)).toBe(frontOrigin)
    const mainSafety = await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]!
      return {
        url: window.webContents.getURL(),
        webPreferences: (window.webContents as unknown as { getLastWebPreferences(): Record<string, unknown> }).getLastWebPreferences(),
        devRendererUrl: process.env.ELECTRON_RENDERER_URL ?? null,
      }
    })
    expect(new URL(mainSafety.url).origin).toBe(frontOrigin)
    expect(mainSafety.devRendererUrl).toBeNull()
    expect(mainSafety.webPreferences).toMatchObject({ contextIsolation: true, nodeIntegration: false, sandbox: true })
    expect(mainSafety.webPreferences.webSecurity).not.toBe(false)

    await registerAndLogin(page)
    const jsCookieSurface = await page.evaluate(async ({ email, password }) => {
      const response = await fetch('/api/auth/login', {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      return { status: response.status, documentCookie: document.cookie, setCookie: response.headers.get('set-cookie') }
    }, { email, password })
    expect(jsCookieSurface.status).toBe(201)
    expect(jsCookieSurface.documentCookie).toBe('')
    expect(jsCookieSurface.setCookie).toBeNull()
    expect(await page.evaluate(async () => (await fetch('/api/auth/me', { credentials: 'include' })).status)).toBe(200)
    const sessionMetadata = (await page.context().cookies(`${frontOrigin}/api`)).filter((cookie) => cookie.name === 'eotion_session')
      .map(({ name, httpOnly, secure, sameSite, path }) => ({ name, httpOnly, secure, sameSite, path }))
    expect(sessionMetadata).toEqual([{ name: 'eotion_session', httpOnly: true, secure: true, sameSite: 'Lax', path: '/api' }])

    const logoutRequestsBeforeProbe = evidence.filter((event) => event.path === '/api/auth/logout').length
    const foreignOriginProbe = await app.evaluate(async ({ BrowserWindow }, logoutUrl: string) => {
      const probeWindow = new BrowserWindow({
        show: false,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
      })
      try {
        await probeWindow.loadURL('data:text/html,<p>untrusted initiator</p>')
        const script = `(async()=>{try{const response=await fetch(${JSON.stringify(logoutUrl)},{method:'POST',credentials:'include'});return {readable:true,status:response.status}}catch{return {readable:false,status:null}}})()`
        return await probeWindow.webContents.executeJavaScript(script) as { readable: boolean; status: number | null }
      } finally {
        probeWindow.destroy()
      }
    }, `${frontOrigin}/api/auth/logout`)
    expect(foreignOriginProbe.status).not.toBe(200)
    expect(evidence.filter((event) => event.path === '/api/auth/logout')).toHaveLength(logoutRequestsBeforeProbe)
    await expect.poll(() => page.evaluate(async () => (await fetch('/api/auth/me', { credentials: 'include' })).status)).toBe(200)

    await page.getByRole('textbox', { name: '工作区名称' }).fill('Production Electron Workspace')
    await page.getByRole('button', { name: '创建工作区' }).click()
    await expect(page).toHaveURL(/#\/app\/[^/]+$/)
    const workspaceId = new URL(page.url()).hash.split('/').at(-1)!
    await page.getByRole('button', { name: '新建根页面' }).click()
    const editor = page.locator('.eotion-editor-content .tiptap')
    await expect(editor).toBeVisible()
    const pageId = new URL(page.url()).hash.split('/').at(-1)!
    await editor.fill('Production first edit')
    await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
    await expect.poll(() => pendingCount(page)).toBe(0)
    await expect.poll(() => evidence.some((event) => event.path === '/api/sync/operations' && event.method === 'POST'))
      .toBe(true)

    await app.close()
    app = undefined

    app = await launchElectron(firstProfile)
    page = await app.firstWindow()
    captureRendererErrors(page)
    await expect.poll(() => page.evaluate(async () => (await fetch('/api/auth/me', { credentials: 'include' })).status)).toBe(200)
    await openProduct(page, workspaceId, pageId)
    await expect(page.locator('.eotion-editor-content .tiptap')).toContainText('Production first edit')

    await closeFront()
    const refusedConnection = await frontConnectionError()
    expect(refusedConnection).toBe('ECONNREFUSED')
    const offlineEditor = page.locator('.eotion-editor-content .tiptap')
    await offlineEditor.fill('Production first edit\nOffline edit persisted')
    await expect.poll(() => pendingCount(page)).toBeGreaterThan(0)
    await expect.poll(() => pendingJson(page)).toContain('Offline edit persisted')
    await killTree(app)
    app = undefined
    const offlineDatabase = readFileSync(resolve(firstProfile, 'eotion-local.sqlite'))
    expect(offlineDatabase.subarray(0, 16).toString('binary')).toBe('SQLite format 3\0')

    app = await launchElectron(firstProfile)
    page = await app.firstWindow()
    captureRendererErrors(page)
    await expect.poll(() => page.evaluate(() => location.origin)).toBe(frontOrigin)
    await openProduct(page, workspaceId, pageId)
    await expect(page.locator('.eotion-editor-content .tiptap')).toContainText('Offline edit persisted')
    await page.locator('.eotion-editor-content .tiptap').fill('Production first edit\nOffline edit persisted\nContinued offline')
    await expect.poll(() => pendingCount(page)).toBeGreaterThan(0)
    await expect.poll(() => pendingJson(page)).toContain('Continued offline')
    await expect.poll(() => readFileSync(resolve(firstProfile, 'eotion-local.sqlite')).subarray(0, 16).toString('binary'))
      .toBe('SQLite format 3\0')

    const syncStart = evidence.length
    await listenFront()
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible({ timeout: 30_000 })
    await expect.poll(() => pendingCount(page), { timeout: 20_000 }).toBe(0)
    const pageSync = evidence.slice(syncStart).filter((event) => event.path === '/api/sync/operations' || event.path.endsWith(`/api/sync/workspaces/${workspaceId}/snapshot`))
    const latestPush = pageSync.map((event) => event.path === '/api/sync/operations' && event.method === 'POST').lastIndexOf(true)
    const latestPull = pageSync.map((event) => event.path.endsWith(`/api/sync/workspaces/${workspaceId}/snapshot`) && event.method === 'GET').lastIndexOf(true)
    expect(latestPush).toBeGreaterThanOrEqual(0)
    expect(latestPull).toBeGreaterThan(latestPush)
    await killTree(app)
    app = undefined

    app = await launchElectron(secondProfile)
    page = await app.firstWindow()
    captureRendererErrors(page)
    await login(page)
    await openProduct(page, workspaceId, pageId)
    await expect(page.locator('.eotion-editor-content .tiptap')).toContainText('Continued offline')
    await killTree(app)
    app = undefined

    const fallbackProfile = resolve(profileRoot, 'file-fallback')
    app = await launchElectron(fallbackProfile, false)
    page = await app.firstWindow()
    captureRendererErrors(page)
    const fileOrigin = await page.evaluate(() => location.protocol)
    expect(fileOrigin).toBe('file:')
    const negative = await page.evaluate(async ({ url, email, password }) => {
      try {
        const loginResponse = await fetch(`${url}/api/auth/login`, {
          method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })
        try {
          const sessionResponse = await fetch(`${url}/api/auth/me`, { credentials: 'include' })
          return { loginReadable: true, loginStatus: loginResponse.status, sessionReadable: true, sessionStatus: sessionResponse.status }
        } catch {
          return { loginReadable: true, loginStatus: loginResponse.status, sessionReadable: false, sessionStatus: null }
        }
      } catch {
        return { loginReadable: false, loginStatus: null, sessionReadable: false, sessionStatus: null }
      }
    }, { url: frontOrigin, email, password })
    const fileOriginRequests = evidence.filter((event) => event.path === '/api/auth/login' || event.path === '/api/auth/me')
      .slice(-2).map(({ method, path, origin, status }) => ({ method, path, origin, status }))
    expect(negative.sessionReadable).toBe(true)
    expect(negative.sessionStatus).toBe(401)
    expect(fileOriginRequests.some((event) => event.path === '/api/auth/login')).toBe(true)
    expect(fileOriginRequests.some((event) => event.path === '/api/auth/me' && event.status === 401)).toBe(true)
    await killTree(app)
    app = undefined

    const operationEvidence = evidence.filter((event) => event.path === '/api/sync/operations').length
    const snapshotEvidence = evidence.filter((event) => event.path.endsWith(`/api/sync/workspaces/${workspaceId}/snapshot`)).length
    const productionWrites = evidence.filter((event) => event.path === '/api/sync/operations' && event.method === 'POST')
    expect(productionWrites.length).toBeGreaterThan(0)
    expect(productionWrites.every((event) => event.origin === frontOrigin)).toBe(true)
    expect(nonApiRequests).toEqual([])
    console.log(JSON.stringify({
      productionOrigin: frontOrigin,
      runtime: 'Electron built entry; ELECTRON_RENDERER_URL absent',
      secureCookie: { httpOnly: true, secure: true, sameSite: 'Lax', path: '/api' },
      offlineRestart: 'SQLite edit restored; pending queue flushed before snapshot pull',
      secondaryProfile: 'final page text verified',
      fileOriginComparison: { protocol: fileOrigin, sessionStatus: negative.sessionStatus, sessionReadable: negative.sessionReadable },
      realApiRequests: evidence.length,
      syncPushRequests: operationEvidence,
      snapshotPullRequests: snapshotEvidence,
      syncWriteOrigin: productionWrites[0]?.origin,
      refusedConnection,
      networkRendererAssetRequests: nonApiRequests.length,
      foreignInitiatorLogoutForwarded: evidence.some((event) => event.path === '/api/auth/logout'),
      fileOriginRequests,
    }, null, 2))
  } finally {
    if (app) await killTree(app).catch(() => undefined)
    await closeFront().catch(() => undefined)
    await stopApi()
    try {
      await mongoose.connect(isolatedMongoUri)
      await mongoose.connection.dropDatabase()
    } finally {
      await mongoose.disconnect().catch(() => undefined)
      if (profileRoot) {
        const resolvedProfileRoot = resolve(profileRoot)
        const tempRoot = resolve(tmpdir())
        if (!resolvedProfileRoot.startsWith(`${tempRoot}${process.platform === 'win32' ? '\\' : '/'}`)
          || !resolvedProfileRoot.split(/[\\/]/).at(-1)?.startsWith(localProfilePrefix)) {
          throw new Error('Refusing to remove an Electron profile outside the acceptance temporary directory.')
        }
        rmSync(resolvedProfileRoot, { recursive: true, force: true })
      }
    }
  }
})
