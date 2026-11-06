/** P10.4 built Web + built API + official MCP Client acceptance.
 * Run after pnpm build:api and pnpm --filter @eotion/web build:
 *   node scripts/verify-p104-web-mcp.mjs
 * Uses only private randomized Mongo ports/databases; never connects to 27017.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { execFileSync, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const apiDir = join(root, 'apps/api')
const webDir = join(root, 'apps/web')
const requireApi = createRequire(join(apiDir, 'package.json'))
const requireWeb = createRequire(join(webDir, 'package.json'))
const mongoose = requireApi('mongoose')
const { Client, StreamableHTTPClientTransport } = requireApi('@modelcontextprotocol/client')
const { chromium, expect } = requireWeb('@playwright/test')
const evidence = await mkdtemp(join(tmpdir(), 'eotion-p104-web-mcp-'))
const dbPath = join(evidence, 'mongo-data')
await mkdir(dbPath)

const suffix = randomUUID().replaceAll('-', '').slice(0, 16)
const databaseName = `eotion_p104_${suffix}`
const workspaceId = `p104-workspace-${suffix}`
const hostPageId = `p104-host-${suffix}`
const databaseId = `p104-database-${suffix}`
const titlePropertyId = `p104-title-${suffix}`
const tableViewId = `p104-table-${suffix}`
const databaseBlockId = `p104-block-${suffix}`
const email = `p104-${suffix}@example.test`
const password = `P104-private-${randomUUID()}!`
const mongoExecutable = process.env.P104_MONGOD || (process.platform === 'win32'
  ? 'C:/Program Files/MongoDB/Server/8.2/bin/mongod.exe' : 'mongod')
const results = []
const owned = []
const clients = new Set()
let mongo, api, preview, connection, browser, context, page, mcp, baseUrl, webUrl, token
let databaseDropped = false
let outcome = 'FAIL'
const consoleErrors = []
const pageErrors = []
const browserLoginResponses = []
const expectedUnauthenticatedSession401s = []
const authenticatedSession200s = []
let webAuthenticated = false
let webLoginSucceeded = false
const webPort = await port()
webUrl = `http://127.0.0.1:${webPort}`

function record(name, details = {}) {
  results.push({ step: name, at: new Date().toISOString(), ...details })
}

function osStartedAt(pid) {
  if (process.platform !== 'win32') return null
  const command = `(Get-Process -Id ${Number(pid)}).StartTime.ToUniversalTime().ToString('o')`
  return execFileSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true }).trim()
}

async function port() {
  const server = createServer()
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done) })
  const value = server.address().port
  await new Promise(done => server.close(done))
  assert.notEqual(value, 27017, 'private services must never use the default Mongo port')
  return value
}

function child(command, args, name, cwd, env = process.env) {
  const log = createWriteStream(join(evidence, `${name}.log`), { flags: 'wx' })
  const processChild = spawn(command, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  processChild.stdout.pipe(log, { end: false })
  processChild.stderr.pipe(log, { end: false })
  processChild.done = new Promise((done, reject) => {
    processChild.once('error', reject)
    processChild.once('exit', (code, signal) => { log.end(); done({ code, signal }) })
  })
  const identity = { name, pid: processChild.pid, command, args, startedAt: new Date().toISOString(), osStartedAt: null }
  owned.push(identity)
  processChild.once('exit', (code, signal) => { identity.exitCode = code; identity.signal = signal; identity.exitedAt = new Date().toISOString() })
  identity.osStartedAt = osStartedAt(processChild.pid)
  return processChild
}

async function connectMongo(uri) {
  const next = mongoose.createConnection(uri, { serverSelectionTimeoutMS: 1200 })
  try { await next.asPromise(); return next }
  catch (error) { await next.close().catch(() => {}); throw error }
}

const mongoPort = await port()
const mongoBase = `mongodb://127.0.0.1:${mongoPort}`
const replicaName = `p104_${suffix}`
const mongoUri = `${mongoBase}/${databaseName}?directConnection=true&replicaSet=${replicaName}`

async function startMongo() {
  mongo = child(mongoExecutable, ['--dbpath', dbPath, '--bind_ip', '127.0.0.1', '--port', String(mongoPort), '--replSet', replicaName], 'mongo', root)
  let admin
  for (let attempt = 0; attempt < 100; attempt++) {
    if (mongo.exitCode !== null) throw new Error('Private mongod exited during startup')
    try { admin = await connectMongo(`${mongoBase}/admin?directConnection=true`); break } catch { await delay(250) }
  }
  assert.ok(admin, 'private mongod must become reachable')
  try {
    await admin.db.admin().command({ replSetInitiate: { _id: replicaName, members: [{ _id: 0, host: `127.0.0.1:${mongoPort}` }] } })
    let hello
    for (let attempt = 0; attempt < 120; attempt++) {
      hello = await admin.db.admin().command({ hello: 1 })
      if (hello.isWritablePrimary) break
      await delay(250)
    }
    assert.equal(hello?.setName, replicaName)
    assert.equal(hello?.isWritablePrimary, true)
  } finally { await admin.close() }
  connection = await connectMongo(mongoUri)
  record('private-mongo-ready', { port: mongoPort, databaseName, replicaSet: replicaName })
}

async function stopMongo() {
  if (!mongo || mongo.exitCode !== null) return
  const admin = await connectMongo(`${mongoBase}/admin?directConnection=true`)
  try { await admin.db.admin().command({ shutdown: 1 }) }
  catch (error) {
    if (!/closed|connection|shutdown|interrupted|ECONNRESET/i.test(String(error))) throw error
  } finally { await admin.close().catch(() => {}) }
  await Promise.race([mongo.done, delay(30000, undefined, { ref: false }).then(() => { throw new Error('Private Mongo did not shut down') })])
}

async function startApi() {
  const apiPort = await port()
  baseUrl = `http://127.0.0.1:${apiPort}`
  api = child(process.execPath, ['dist/main.js'], 'api', apiDir, {
    ...process.env, MONGODB_URI: mongoUri, HOST: '127.0.0.1', PORT: String(apiPort),
    WEB_ORIGIN: webUrl, NODE_ENV: 'test',
  })
  let ready = false
  for (let attempt = 0; attempt < 120; attempt++) {
    if (api.exitCode !== null) throw new Error('Built API exited during startup')
    try {
      const response = await fetch(`${baseUrl}/api/health`)
      if (response.ok) {
        const health = await response.json()
        assert.equal(health.version, '0.0.1')
        assert.equal(health.buildNumber, 2)
        ready = true
        break
      }
    } catch {}
    await delay(250)
  }
  assert.ok(ready, 'built API must become healthy')
  record('built-api-ready', { url: baseUrl, version: '0.0.1', buildNumber: 2 })
}

async function startPreview() {
  preview = child(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], 'web', webDir, {
    ...process.env, EOTION_API_PROXY_TARGET: baseUrl, WEB_ORIGIN: webUrl,
  })
  let ready = false
  for (let attempt = 0; attempt < 120; attempt++) {
    if (preview.exitCode !== null) throw new Error('Built Vite preview exited during startup')
    try { const response = await fetch(webUrl); if (response.ok) { ready = true; break } } catch {}
    await delay(250)
  }
  assert.ok(ready, 'built Vite preview must become reachable')
  record('built-web-ready', { url: webUrl, apiProxyTarget: baseUrl })
}

async function stopProcess(processChild, label) {
  if (!processChild || processChild.exitCode !== null) return
  processChild.kill('SIGTERM')
  await Promise.race([processChild.done, delay(15000, undefined, { ref: false }).then(() => { throw new Error(`Owned ${label} process did not exit`) })])
}

async function http(route, method = 'GET', body, cookie) {
  const response = await fetch(`${baseUrl}/api${route}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  let parsed
  try { parsed = text ? JSON.parse(text) : undefined } catch { parsed = text }
  assert.ok(response.ok, `HTTP fixture ${method} ${route}: ${response.status}`)
  return { body: parsed, cookie: response.headers.get('set-cookie')?.split(';', 1)[0], status: response.status }
}

async function mcpClient() {
  const client = new Client({ name: 'eotion-p104-built-web-client', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }))
  clients.add(client)
  return client
}

async function call(name, args, errorPattern) {
  const result = await mcp.callTool({ name, arguments: args })
  const text = result.content.filter(item => item.type === 'text').map(item => item.text).join('\n')
  if (errorPattern) {
    assert.equal(result.isError, true, `${name} should reject this stale input: ${text}`)
    assert.match(text, errorPattern)
    record('tools/call-rejected', { name, arguments: args, error: text, expectedError: errorPattern.source })
    return undefined
  }
  assert.equal(result.isError, undefined, `${name}: ${text}`)
  assert.ok(result.structuredContent, `${name} returned no structured content`)
  record('tools/call', { name, arguments: args, result: result.structuredContent })
  return result.structuredContent
}

async function assertVisible(locator, label) {
  await locator.waitFor({ state: 'visible', timeout: 20000 })
  record('web-visible', { label })
}

try {
  await startMongo()
  await startApi()
  // HTTP is used only for the account/session and empty product fixtures. The auth
  // login body and issued MCP token are deliberately omitted from all evidence/logs.
  await http('/auth/register', 'POST', { email, password })
  record('http-account-created', { email })
  const { cookie } = await http('/auth/login', 'POST', { email, password })
  assert.ok(cookie, 'HTTP fixture login must issue a session cookie')
  await http('/workspaces', 'POST', { id: workspaceId, name: 'P10.4 Web + MCP acceptance' }, cookie)
  await http(`/workspaces/${workspaceId}/pages`, 'POST', { id: hostPageId, parentPageId: null, title: 'P10.4 host page', orderKey: '0000' }, cookie)
  const createdDatabase = await http(`/workspaces/${workspaceId}/pages/${hostPageId}/databases`, 'POST', {
    id: databaseId, name: 'P10.4 acceptance database', titlePropertyId, viewId: tableViewId,
    blockId: databaseBlockId, orderKey: '0001', parentBlockId: null,
  }, cookie)
  const tokenResult = await http('/mcp/tokens', 'POST', { name: 'P10.4 private acceptance client' }, cookie)
  token = tokenResult.body.token
  assert.ok(typeof token === 'string' && token.length > 0)
  record('http-fixtures-ready', { workspaceId, hostPageId, databaseId, initialDatabaseVersion: createdDatabase.body.database.version, tokenStoredInMemory: true })

  await startPreview()
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  record('browser-launched', { channel: 'chrome', version: browser.version() })
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, baseURL: webUrl })
  page = await context.newPage()
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('pageerror', error => pageErrors.push(String(error)))
  page.on('response', response => {
    const url = new URL(response.url())
    const status = response.status()
    if (url.pathname === '/api/auth/login' && response.request().method() === 'POST') {
      browserLoginResponses.push({ path: url.pathname, status })
      if (status === 201) webLoginSucceeded = true
    }
    if (url.pathname === '/api/auth/me') {
      if (!webAuthenticated && status === 401) expectedUnauthenticatedSession401s.push({ path: url.pathname, status })
      if (webLoginSucceeded && status === 200) authenticatedSession200s.push({ path: url.pathname, status })
    }
  })
  await page.goto(`${webUrl}/#/login?redirect=%2Fapp%2F${workspaceId}%2Fpage%2F${hostPageId}`)
  await page.getByRole('textbox', { name: '邮箱' }).fill(email)
  await page.getByLabel('密码', { exact: true }).fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL(new RegExp(`#?/app/${workspaceId}/page/${hostPageId}$`), { timeout: 20000 })
  webAuthenticated = true
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true })
  const editor = page.locator('.eotion-editor-content .tiptap')
  await assertVisible(editor, 'formal host page editor after Web login')
  const dbNode = page.locator('.eotion-editor-content .eotion-database').first()
  await assertVisible(dbNode, 'HTTP-created empty database block on host page')
  await expect(dbNode).toHaveAttribute('data-view-ready', 'true')

  await editor.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('P10.4 persisted host paragraph')
  await page.keyboard.press('Control+Enter')
  await page.waitForTimeout(1200)
  assert.ok(await editor.getByText('P10.4 persisted host paragraph', { exact: true }).count())
  record('web-host-paragraph-created', { text: 'P10.4 persisted host paragraph' })

  mcp = await mcpClient()
  const listed = await mcp.listTools()
  assert.ok(listed.tools.some(tool => tool.name === 'eotion_create_record'))
  record('official-client-tools-list', { count: listed.tools.length, hasP10WriteTool: true })
  const scope = { workspaceId, databaseId }
  let schema = await call('eotion_get_database_schema', scope)
  let version = schema.database.version
  const write = async (name, data, key = randomUUID()) => {
    const args = { ...scope, expectedDatabaseVersion: version, idempotencyKey: key, ...data }
    const result = await call(name, args)
    version = result.database.version
    return { args, result }
  }
  const createdRecord = await write('eotion_create_record', { title: 'P10.4 MCP initial title' })
  let recordDto = createdRecord.result.record
  const textProperty = (await write('eotion_create_property', { name: 'MCP Notes', type: 'text' })).result.property
  const selectProperty = (await write('eotion_create_property', {
    name: 'MCP Status', type: 'select', options: [{ id: 'p104-open', name: 'Open' }],
  })).result.property
  const dateProperty = (await write('eotion_create_property', { name: 'MCP Date', type: 'date' })).result.property
  recordDto = (await write('eotion_update_record_cell', {
    recordId: recordDto.id, propertyId: textProperty.id, value: 'Ordinary cell written by MCP', expectedRecordVersion: recordDto.version,
  })).result.record
  recordDto = (await write('eotion_update_record_cell', {
    recordId: recordDto.id, propertyId: titlePropertyId, value: 'MCP canonical title', expectedRecordVersion: recordDto.version,
    expectedPageUpdatedAt: recordDto.pageVersion,
  })).result.record
  const updatedProperty = (await write('eotion_update_property', {
    propertyId: textProperty.id, name: 'MCP Notes Updated', expectedPropertyVersion: textProperty.version,
  })).result.property
  const views = []
  for (const type of ['table', 'list', 'board', 'timeline']) {
    const config = { filters: [], sorts: [], visibleProperties: null, propertyOrder: null,
      ...(type === 'board' ? { options: { groupByPropertyId: selectProperty.id } } : {}),
      ...(type === 'timeline' ? { options: { timeline: { dateSource: { mode: 'date-property', propertyId: dateProperty.id }, scale: 'month' } } } : {}),
    }
    const made = await write('eotion_create_view', { name: `MCP ${type}`, type, config })
    views.push(made.result.view)
  }
  const updatedView = (await write('eotion_update_view', {
    viewId: views[0].id, name: 'MCP table updated', expectedViewVersion: views[0].version,
  })).result.view
  record('mcp-representative-writes-complete', { recordId: recordDto.id, propertyId: updatedProperty.id, viewTypes: views.map(view => view.type), updatedViewId: updatedView.id })

  const today = new Date().toISOString().slice(0, 10)
  recordDto = (await write('eotion_update_record_cell', {
    recordId: recordDto.id, propertyId: dateProperty.id, value: today, expectedRecordVersion: recordDto.version,
  })).result.record
  const siblingRecord = (await write('eotion_create_record', { title: 'P10.4 MCP cursor sibling' })).result.record
  const renamedDatabase = await write('eotion_rename_database', { name: 'P10.4 renamed through MCP' })
  assert.equal(renamedDatabase.result.database.name, 'P10.4 renamed through MCP')
  schema = await call('eotion_get_database_schema', scope)
  assert.equal(schema.database.name, 'P10.4 renamed through MCP')
  version = schema.database.version
  const querySorts = [{ propertyId: titlePropertyId, direction: 'asc' }]
  const firstQueryPage = await call('eotion_query_database', {
    ...scope, viewId: tableViewId, filters: [], sorts: querySorts, limit: 1,
  })
  assert.equal(firstQueryPage.records.length, 1)
  assert.ok(firstQueryPage.nextCursor, 'two persisted Records must produce a second query page')
  record('mcp-cursor-created-before-web-mutation', { cursorCreated: true, recordCount: 2, nextCursorStoredInMemory: true })

  await page.reload()
  await page.waitForURL(new RegExp(`#?/app/${workspaceId}/page/${hostPageId}$`), { timeout: 20000 })
  const reloadedEditor = page.locator('.eotion-editor-content .tiptap')
  await assertVisible(reloadedEditor, 'host page after reload')
  await assertVisible(reloadedEditor.getByText('P10.4 persisted host paragraph', { exact: true }), 'persisted host paragraph')
  const reloadedDb = page.locator('.eotion-editor-content .eotion-database').first()
  await expect(reloadedDb).toHaveAttribute('data-view-ready', 'true')
  await expect(reloadedDb).toContainText('MCP canonical title')
  await expect(reloadedDb).toContainText('P10.4 MCP cursor sibling')
  await expect(reloadedDb).toContainText('Ordinary cell written by MCP')
  await expect(reloadedDb).toContainText('MCP Notes Updated')
  await expect(reloadedDb).toContainText(today)
  await expect(reloadedDb.locator('.eotion-database-copy')).toContainText('P10.4 renamed through MCP')
  await page.screenshot({ path: join(evidence, 'web-after-mcp-writes.png'), fullPage: true, animations: 'disabled' })
  record('web-reloaded-mcp-record-property-visible', { recordId: recordDto.id, title: 'MCP canonical title', date: today, ordinaryCell: 'Ordinary cell written by MCP', propertyName: updatedProperty.name, databaseName: schema.database.name })

  // Open the MCP-created row and perform a real browser form edit of its Title.
  await reloadedDb.getByRole('button', { name: '打开记录：MCP canonical title', exact: true }).click()
  const drawer = page.locator('[data-overlay-mode="drawer"]')
  await assertVisible(drawer, 'MCP-created record opened from Web')
  const titleInput = drawer.getByRole('textbox', { name: '记录标题' })
  await expect(titleInput).toHaveValue('MCP canonical title')
  await titleInput.fill('Web changed canonical title')
  await titleInput.press('Enter')
  await expect(reloadedDb).toContainText('Web changed canonical title')
  await drawer.getByRole('button', { name: '关闭记录' }).click()
  await expect(drawer).toHaveCount(0)
  const freshSchema = await call('eotion_get_database_schema', scope)
  version = freshSchema.database.version
  await call('eotion_update_record_cell', {
    ...scope, expectedDatabaseVersion: version, idempotencyKey: randomUUID(), recordId: recordDto.id,
    propertyId: titlePropertyId, value: 'Rejected stale MCP title', expectedRecordVersion: recordDto.version,
    expectedPageUpdatedAt: recordDto.pageVersion,
  }, /^CONFLICT:/)
  const staleCursor = await call('eotion_query_database', {
    ...scope, viewId: tableViewId, filters: [], sorts: querySorts, limit: 1, cursor: firstQueryPage.nextCursor,
  }, /^CONFLICT:/)
  assert.equal(staleCursor, undefined)
  const mcpRecord = await call('eotion_get_record', { ...scope, recordId: recordDto.id })
  assert.equal(mcpRecord.properties[titlePropertyId], 'Web changed canonical title')
  assert.equal(mcpRecord.properties[textProperty.id], 'Ordinary cell written by MCP')
  assert.equal(mcpRecord.properties[dateProperty.id], today)
  const mcpPage = await call('eotion_get_page', { pageId: recordDto.pageId })
  assert.equal(mcpPage.title, mcpRecord.properties[titlePropertyId], 'P6 get_page and P10 get_record share the Web-edited canonical Title')
  record('web-title-read-back-through-mcp', { recordId: recordDto.id, pageId: recordDto.pageId, title: mcpPage.title })
  const renamedSchema = await call('eotion_get_database_schema', scope)
  assert.equal(renamedSchema.database.name, 'P10.4 renamed through MCP')
  const hostAfterRename = await call('eotion_get_page', { pageId: hostPageId })
  assert.equal(hostAfterRename.title, 'P10.4 host page')
  assert.ok(JSON.stringify(hostAfterRename).includes('P10.4 persisted host paragraph'))
  record('rename-preserves-host-and-body', { databaseName: renamedSchema.database.name, hostTitle: hostAfterRename.title, hostBodyPersisted: true })
  await page.screenshot({ path: join(evidence, 'web-title-edited.png'), fullPage: true, animations: 'disabled' })

  // Select each MCP-created view through the formal Web view selector, proving all
  // four view records survive refresh and are readable by the same renderer.
  for (const view of [updatedView, ...views.slice(1)]) {
    const trigger = reloadedDb.getByRole('button', { name: '切换视图', exact: true })
    await trigger.click()
    const menu = page.getByRole('group', { name: '数据库视图', exact: true })
    await menu.getByRole('button', { name: view.name, exact: true }).click()
    await expect(reloadedDb).toHaveAttribute('data-view-ready', 'true')
    await expect(reloadedDb).toContainText('Web changed canonical title')
    record('web-view-readable', { viewId: view.id, type: view.type, name: view.name })
  }
  const tableTrigger = reloadedDb.getByRole('button', { name: '切换视图', exact: true })
  await tableTrigger.click()
  await page.getByRole('group', { name: '数据库视图', exact: true }).getByRole('button', { name: updatedView.name, exact: true }).click()
  await expect(reloadedDb).toHaveAttribute('data-view-ready', 'true')
  await page.reload()
  await page.waitForURL(new RegExp(`#?/app/${workspaceId}/page/${hostPageId}$`), { timeout: 20000 })
  const afterRefresh = page.locator('.eotion-editor-content .eotion-database').first()
  await assertVisible(afterRefresh, 'database reference after final refresh')
  await expect(page.locator('.eotion-editor-content .tiptap').getByText('P10.4 persisted host paragraph', { exact: true })).toBeVisible()
  await expect(afterRefresh).toContainText('Web changed canonical title')
  await expect(afterRefresh.locator('.eotion-database-copy')).toContainText('P10.4 renamed through MCP')
  await expect(afterRefresh).toContainText('P10.4 MCP cursor sibling')
  await expect(afterRefresh).toContainText(today)
  await page.screenshot({ path: join(evidence, 'web-final-refresh.png'), fullPage: true, animations: 'disabled' })

  // Read-only Mongo audit: compare persisted entities and the single canonical Page title.
  const collections = ['databases', 'database_records', 'database_properties', 'database_views', 'pages', 'blocks']
  const audit = {}
  for (const name of collections) {
    audit[name] = await connection.db.collection(name).find({ workspaceId }).sort({ id: 1 }).toArray()
  }
  assert.equal(audit.database_records.length, 2)
  assert.equal(audit.database_properties.length, 4)
  assert.equal(audit.database_views.length, 5)
  assert.equal(audit.pages.find(item => item.id === recordDto.pageId)?.title, 'Web changed canonical title')
  assert.equal(audit.pages.find(item => item.id === siblingRecord.pageId)?.title, 'P10.4 MCP cursor sibling')
  assert.equal(Object.hasOwn(audit.database_records.find(item => item.id === recordDto.id).properties, titlePropertyId), false, 'Title must remain canonical on Page')
  assert.ok(audit.blocks.some(item => item.pageId === hostPageId && JSON.stringify(item.props).includes('P10.4 persisted host paragraph')))
  assert.ok(audit.blocks.some(item => item.id === databaseBlockId && item.props?.node?.attrs?.databaseId === databaseId))
  assert.equal(audit.databases.find(item => item.id === databaseId)?.name, 'P10.4 renamed through MCP')
  record('readonly-mongo-audit', { counts: Object.fromEntries(collections.map(name => [name, audit[name].length])), titleStoredOnPageOnly: true, hostParagraphPersisted: true, databaseReferencePersisted: true, databaseName: 'P10.4 renamed through MCP' })

  const expectedAuth401ConsoleErrors = consoleErrors.filter(message => /Failed to load resource: the server responded with a status of 401 \(Unauthorized\)/u.test(message))
  const unexpectedConsoleErrors = consoleErrors.filter(message => !/Failed to load resource: the server responded with a status of 401 \(Unauthorized\)/u.test(message))
  const consoleAndPageErrors = { consoleErrors, pageErrors, browserLoginResponses, expectedUnauthenticatedSession401s, authenticatedSession200s, unexpectedConsoleErrors }
  await writeFile(join(evidence, 'browser-errors.json'), JSON.stringify(consoleAndPageErrors, null, 2))
  assert.deepEqual(pageErrors, [], 'browser pageerror list must be empty')
  assert.equal(browserLoginResponses.length, 1)
  assert.equal(browserLoginResponses[0].status, 201, 'Web login form must receive a successful login response')
  assert.equal(expectedUnauthenticatedSession401s.length, 1, 'login page must perform one unauthenticated session probe')
  assert.equal(expectedAuth401ConsoleErrors.length, expectedUnauthenticatedSession401s.length, 'the only 401 console error must match the pre-login /api/auth/me probe')
  assert.ok(authenticatedSession200s.length >= 1, 'a refreshed Web session must receive successful /api/auth/me after form login')
  assert.deepEqual(unexpectedConsoleErrors, [], 'browser console errors outside the unauthenticated session probe must be empty')
  await context.tracing.stop({ path: join(evidence, 'trace.zip') })
  record('browser-errors-and-trace', { consoleErrors: consoleErrors.length, browserLoginStatus: browserLoginResponses[0].status, expectedUnauthenticatedSession401s: expectedUnauthenticatedSession401s.length, authenticatedSession200s: authenticatedSession200s.length, unexpectedConsoleErrors: unexpectedConsoleErrors.length, pageErrors: pageErrors.length, trace: 'trace.zip' })
  outcome = 'PASS'
} catch (error) {
  record('failure', { message: String(error), stack: error?.stack })
  process.exitCode = 1
  if (page) await page.screenshot({ path: join(evidence, 'failure.png'), fullPage: true, animations: 'disabled' }).catch(() => {})
  if (context) await context.tracing.stop({ path: join(evidence, 'trace-failure.zip') }).catch(() => {})
} finally {
  for (const client of clients) await client.close().catch(error => { record('cleanup-client-failure', { message: String(error) }); process.exitCode = 1 })
  clients.clear()
  if (browser) await browser.close().catch(error => { record('cleanup-browser-failure', { message: String(error) }); process.exitCode = 1 })
  await stopProcess(preview, 'Vite preview').catch(error => { record('cleanup-web-failure', { message: String(error) }); process.exitCode = 1 })
  await stopProcess(api, 'API').catch(error => { record('cleanup-api-failure', { message: String(error) }); process.exitCode = 1 })
  if (connection) {
    assert.equal(connection.name, databaseName)
    await connection.dropDatabase().then(() => { databaseDropped = true }).catch(error => { record('cleanup-db-failure', { message: String(error) }); process.exitCode = 1 })
    await connection.close().catch(() => {})
    connection = undefined
  }
  await stopMongo().catch(error => { record('cleanup-mongo-failure', { message: String(error) }); process.exitCode = 1 })
  token = undefined
  const expectedConsole401Pattern = /Failed to load resource: the server responded with a status of 401 \(Unauthorized\)/u
  await writeFile(join(evidence, 'browser-errors.json'), JSON.stringify({
    consoleErrors, pageErrors, browserLoginResponses, expectedUnauthenticatedSession401s, authenticatedSession200s,
    unexpectedConsoleErrors: consoleErrors.filter(message => !expectedConsole401Pattern.test(message)),
  }, null, 2))
  await writeFile(join(evidence, 'transcript.json'), JSON.stringify(results, null, 2))
  const hashes = []
  for (const name of await readdir(evidence)) {
    if (name === 'mongo-data' || name === 'artifacts-sha256.json' || name === 'summary.json') continue
    const content = await readFile(join(evidence, name)).catch(() => undefined)
    if (content) hashes.push({ file: name, sha256: createHash('sha256').update(content).digest('hex') })
  }
  const ownScript = await readFile(fileURLToPath(import.meta.url))
  hashes.push({ file: 'scripts/verify-p104-web-mcp.mjs', sha256: createHash('sha256').update(ownScript).digest('hex') })
  await writeFile(join(evidence, 'artifacts-sha256.json'), JSON.stringify(hashes, null, 2))
  const summary = {
    outcome: process.exitCode ? 'FAIL' : outcome,
    checks: results.length,
    evidence,
    webUrl,
    apiUrl: baseUrl,
    mongoPort,
    databaseName,
    owned,
    processesExited: owned.every(item => Object.hasOwn(item, 'exitCode') || item.signal !== null && item.signal !== undefined),
    cleanup: { databaseDropped, credentialsLogged: false, tokenStoredInMemoryOnly: true },
  }
  await writeFile(join(evidence, 'summary.json'), JSON.stringify(summary, null, 2))
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}
