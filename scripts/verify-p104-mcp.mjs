/** P10.4 built API + official MCP Client/Inspector acceptance.
 * Run after pnpm build:api: node scripts/verify-p104-mcp.mjs
 * Requires mongod (P104_MONGOD may override its path) and the official MCP Inspector CLI
 * (P104_INSPECTOR may override its entry). Never connects to port 27017.
 */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const apiDir = join(root, 'apps/api')
const require = createRequire(join(apiDir, 'package.json'))
const mongoose = require('mongoose')
const { Client, StreamableHTTPClientTransport } = require('@modelcontextprotocol/client')
const inspectorEntry = process.env.P104_INSPECTOR || 'C:/Users/31250/AppData/Local/pnpm-cache/dlx/415612ac9c907e9cebea4cf4ffe9475f/mvjgoxp7-1310/node_modules/.pnpm/@modelcontextprotocol+inspector@2.12.0/node_modules/@modelcontextprotocol/inspector/clients/cli/build/index.js'
const inspectorWrapper = join(tmpdir(), `eotion-p104-inspector-wrapper-${randomUUID()}.mjs`)
const evidence = await mkdtemp(join(tmpdir(), 'eotion-p104-client-'))
const dbPath = join(evidence, 'mongo-data')
await mkdir(dbPath)
const mongod = process.env.P104_MONGOD || (process.platform === 'win32'
  ? 'C:/Program Files/MongoDB/Server/8.2/bin/mongod.exe' : 'mongod')
const databaseName = `eotion_p104_client_${randomUUID().replaceAll('-', '')}`
const replicaName = `p104_${randomUUID().slice(0, 8)}`
const expectedTools = [
  'eotion_list_workspaces', 'eotion_list_pages', 'eotion_search_pages', 'eotion_get_page',
  'eotion_create_page', 'eotion_update_page', 'eotion_list_databases', 'eotion_get_database_schema',
  'eotion_query_database', 'eotion_get_record', 'eotion_resolve_relation_records',
  'eotion_create_record', 'eotion_update_record_cell', 'eotion_create_property',
  'eotion_update_property', 'eotion_create_view', 'eotion_update_view', 'eotion_rename_database',
].sort()
const results = []
const clients = new Set()
const owned = []
let mongo, api, connection, baseUrl, token, outsiderToken
let outcome = 'FAIL'
let databaseDropped = false
let inspectorVersion = 'unknown'
let inspectorSha256
let inspectorCallIndex = 0

function step(name, details = {}) {
  results.push({ name, ...details })
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
  assert.notEqual(value, 27017)
  return value
}
const mongoPort = await port()
const mongoBase = `mongodb://127.0.0.1:${mongoPort}`
const replicaUri = `${mongoBase}/${databaseName}?directConnection=true&replicaSet=${replicaName}`
const standaloneUri = `${mongoBase}/${databaseName}?directConnection=true`

function child(command, args, name, env = process.env) {
  const log = createWriteStream(join(evidence, `${name}.log`), { flags: 'wx' })
  const processChild = spawn(command, args, { cwd: apiDir, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  processChild.stdout.pipe(log, { end: false }); processChild.stderr.pipe(log, { end: false })
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
async function connect(uri) {
  const next = mongoose.createConnection(uri, { serverSelectionTimeoutMS: 1200 })
  try { await next.asPromise(); return next }
  catch (error) { await next.close().catch(() => {}); throw error }
}
async function startMongo(replica) {
  mongo = child(mongod, ['--dbpath', dbPath, '--bind_ip', '127.0.0.1', '--port', String(mongoPort),
    ...(replica ? ['--replSet', replicaName] : [])], replica ? 'mongo-replica' : 'mongo-standalone')
  let ready
  for (let attempt = 0; attempt < 80; attempt++) {
    if (mongo.exitCode !== null) throw new Error('Private mongod exited during startup')
    try { ready = await connect(`${mongoBase}/admin?directConnection=true`); break } catch { await delay(250) }
  }
  assert.ok(ready, 'private mongod must become reachable')
  if (replica) {
    await ready.db.admin().command({ replSetInitiate: { _id: replicaName, members: [{ _id: 0, host: `127.0.0.1:${mongoPort}` }] } })
    let hello
    for (let attempt = 0; attempt < 120; attempt++) {
      hello = await ready.db.admin().command({ hello: 1 })
      if (hello.isWritablePrimary) break
      await delay(250)
    }
    assert.equal(hello?.setName, replicaName); assert.equal(hello?.isWritablePrimary, true)
  } else {
    const hello = await ready.db.admin().command({ hello: 1 })
    assert.equal(hello.setName, undefined); assert.notEqual(hello.msg, 'isdbgrid')
  }
  await ready.close()
  connection = await connect(replica ? replicaUri : standaloneUri)
}
async function stopMongo() {
  if (!mongo || mongo.exitCode !== null) return
  const admin = await connect(`${mongoBase}/admin?directConnection=true`)
  try { await admin.db.admin().command({ shutdown: 1 }) } catch (error) {
    if (!/closed|connection|shutdown|interrupted|ECONNRESET/i.test(String(error))) throw error
  } finally { await admin.close().catch(() => {}) }
  await Promise.race([mongo.done, delay(30000, undefined, { ref: false }).then(() => { throw new Error('Private Mongo did not shut down') })])
}
async function startApi(uri, label) {
  const apiPort = await port()
  baseUrl = `http://127.0.0.1:${apiPort}`
  api = child(process.execPath, ['dist/main.js'], `api-${label}`, {
    ...process.env, MONGODB_URI: uri, HOST: '127.0.0.1', PORT: String(apiPort),
    WEB_ORIGIN: 'https://p104.example.test', NODE_ENV: 'test',
  })
  let ready = false
  for (let attempt = 0; attempt < 120; attempt++) {
    if (api.exitCode !== null) throw new Error('Built API exited during startup')
    try {
      const response = await fetch(`${baseUrl}/api/health`)
      if (response.ok) { const health = await response.json(); assert.equal(health.version, '0.0.1'); assert.equal(health.buildNumber, 2); ready = true; break }
    } catch {}
    await delay(250)
  }
  assert.ok(ready, 'built API must become healthy')
}
async function stopApi() {
  for (const client of clients) await client.close().catch(() => {})
  clients.clear()
  if (api && api.exitCode === null) {
    api.kill('SIGTERM')
    await Promise.race([api.done, delay(15000, undefined, { ref: false }).then(() => { throw new Error('Owned API did not exit') })])
  }
}
async function http(route, method = 'GET', body, cookie) {
  const response = await fetch(`${baseUrl}/api${route}`, { method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  assert.ok(response.ok, `HTTP fixture ${method} ${route}: ${response.status}`)
  return { body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';', 1)[0] }
}
async function client(customFetch) {
  const value = new Client({ name: 'eotion-p104-built-client', version: '1.0.0' })
  await value.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } }, ...(customFetch ? { fetch: customFetch } : {}),
  }))
  clients.add(value)
  return value
}
async function clientFor(bearer, name) {
  const value = new Client({ name, version: '1.0.0' })
  await value.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${bearer}` } },
  }))
  clients.add(value)
  return value
}
async function call(value, name, args, errorPattern) {
  const result = await value.callTool({ name, arguments: args })
  const text = result.content.filter(item => item.type === 'text').map(item => item.text).join('\n')
  if (errorPattern) { assert.equal(result.isError, true, text); assert.match(text, errorPattern) }
  else { assert.equal(result.isError, undefined, text); assert.ok(result.structuredContent) }
  results.push({ name, arguments: args, result, expectedError: errorPattern?.source })
  return result.structuredContent
}
async function snapshot() {
  const names = ['databases', 'database_records', 'database_properties', 'database_views', 'pages', 'blocks', 'mcp_mutation_receipts', 'database_cell_mutation_receipts']
  const entries = []
  for (const name of names) entries.push([name, await connection.db.collection(name).find().sort({ id: 1 }).toArray()])
  return JSON.stringify(Object.fromEntries(entries))
}

function extractInspectorPayload(value) {
  if (!value || typeof value !== 'object') return value
  if (Object.hasOwn(value, 'structuredContent')) return value.structuredContent
  if (Array.isArray(value.content)) {
    for (const item of value.content) {
      if (item?.type !== 'text' || typeof item.text !== 'string') continue
      try { return JSON.parse(item.text) } catch {}
    }
  }
  for (const key of ['result', 'data', 'response', 'toolResult']) {
    if (Object.hasOwn(value, key)) {
      const nested = extractInspectorPayload(value[key])
      if (nested !== undefined) return nested
    }
  }
  return value
}

async function inspector(protocolEra, method, { toolName, toolArgs } = {}) {
  const index = ++inspectorCallIndex
  const safeName = `${String(index).padStart(2, '0')}-${protocolEra}-${method}-${toolName || 'session'}`.replaceAll(/[^a-zA-Z0-9_-]/g, '_')
  const args = [`${baseUrl}/mcp`, '--transport', 'http', '--method', method, '--format', 'json', '--quiet', '--stored-auth-only', '--protocol-era', protocolEra]
  if (toolName) args.push('--tool-name', toolName, '--tool-args-json', JSON.stringify(toolArgs))
  const childProcess = spawn(process.execPath, [inspectorWrapper, ...args], {
    cwd: apiDir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, EOTION_MCP_TOKEN: token, P104_INSPECTOR_ENTRY: inspectorEntry },
  })
  const ownedChild = {
    name: `inspector-${safeName}`, pid: childProcess.pid, command: process.execPath,
    args: [inspectorWrapper, ...args], startedAt: new Date().toISOString(), osStartedAt: null,
  }
  owned.push(ownedChild)
  childProcess.once('exit', (code, signal) => { ownedChild.exitCode = code; ownedChild.signal = signal; ownedChild.exitedAt = new Date().toISOString() })
  ownedChild.osStartedAt = osStartedAt(childProcess.pid)
  let stdout = '', stderr = ''
  childProcess.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk })
  childProcess.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk })
  const exited = new Promise((done, reject) => {
      childProcess.once('error', reject)
      childProcess.once('exit', (code, signal) => done({ code, signal }))
  })
  let result = await Promise.race([exited, delay(60000, undefined, { ref: false }).then(() => undefined)])
  if (!result) {
    childProcess.kill('SIGTERM')
    result = await Promise.race([exited, delay(5000, undefined, { ref: false }).then(() => undefined)])
    if (!result) { childProcess.kill('SIGKILL'); result = await exited }
    throw new Error(`Official Inspector timed out and was stopped: ${safeName} (${result.signal || result.code})`)
  }
  assert.equal(stdout.includes(token) || stderr.includes(token), false, `Inspector output must not contain the bearer token (${safeName})`)
  await writeFile(join(evidence, `inspector-${safeName}.stdout.txt`), stdout)
  await writeFile(join(evidence, `inspector-${safeName}.stderr.txt`), stderr)
  await writeFile(join(evidence, `inspector-${safeName}.exit.json`), JSON.stringify({ ...result, exitCode: result.code, command: [process.execPath, inspectorWrapper, ...args], bearerTokenInCommand: false }, null, 2))
  step('official-inspector', { protocolEra, method, toolName: toolName || null, args: toolArgs || null, exitCode: result.code, signal: result.signal, stdoutFile: `inspector-${safeName}.stdout.txt`, stderrFile: `inspector-${safeName}.stderr.txt`, tokenInOutput: false })
  assert.equal(result.code, 0, `Inspector ${safeName} failed: ${stderr || stdout}`)
  if (method === 'initialize' && !stdout.trim()) return { raw: null, payload: null }
  let parsed
  try { parsed = JSON.parse(stdout.trim()) }
  catch (error) { throw new Error(`Inspector ${safeName} did not return JSON: ${String(error)}; stdout=${stdout}`) }
  return { raw: parsed, payload: extractInspectorPayload(parsed) }
}
try {
  await startMongo(true)
  await startApi(replicaUri, 'replica')
  const email = `p104-${randomUUID()}@example.test`, password = `p104-private-${randomUUID()}`
  await http('/auth/register', 'POST', { email, password })
  const { cookie } = await http('/auth/login', 'POST', { email, password })
  await http('/workspaces', 'POST', { id: 'p104-workspace', name: 'P10.4 isolated acceptance' }, cookie)
  await http('/workspaces/p104-workspace/pages', 'POST', { id: 'p104-host', parentPageId: null, title: 'Host unchanged', orderKey: '0000' }, cookie)
  const fixture = await http('/workspaces/p104-workspace/pages/p104-host/databases', 'POST', {
    id: 'p104-database', name: 'P10.4 original', titlePropertyId: 'p104-title', viewId: 'p104-table',
    blockId: 'p104-block', orderKey: '0000', parentBlockId: null,
  }, cookie)
  token = (await http('/mcp/tokens', 'POST', { name: 'P10.4 owner acceptance Client' }, cookie)).body.token
  assert.ok(typeof token === 'string' && token.length > 0)

  const outsiderEmail = `p104-outsider-${randomUUID()}@example.test`
  const outsiderPassword = `p104-private-${randomUUID()}`
  await http('/auth/register', 'POST', { email: outsiderEmail, password: outsiderPassword })
  const { cookie: outsiderCookie } = await http('/auth/login', 'POST', { email: outsiderEmail, password: outsiderPassword })
  await http('/workspaces', 'POST', { id: 'p104-outsider-workspace', name: 'P10.4 outsider workspace' }, outsiderCookie)
  outsiderToken = (await http('/mcp/tokens', 'POST', { name: 'P10.4 outsider acceptance Client' }, outsiderCookie)).body.token
  assert.ok(typeof outsiderToken === 'string' && outsiderToken.length > 0)

  await writeFile(inspectorWrapper, [
    "import { pathToFileURL } from 'node:url'",
    "const bearer = process.env.EOTION_MCP_TOKEN",
    "if (!bearer) throw new Error('EOTION_MCP_TOKEN is required')",
    "process.argv[1] = process.env.P104_INSPECTOR_ENTRY",
    "process.argv.push('--header', `Authorization: Bearer ${bearer}`)",
    "await import(pathToFileURL(process.env.P104_INSPECTOR_ENTRY).href)",
    '',
  ].join('\n'))
  const inspectorPackagePath = join(dirname(dirname(dirname(dirname(inspectorEntry)))), 'package.json')
  try {
    const inspectorPackage = JSON.parse(await readFile(inspectorPackagePath, 'utf8'))
    inspectorVersion = inspectorPackage.version || 'unknown'
  } catch {}
  const inspectorSource = await readFile(inspectorEntry)
  inspectorSha256 = createHash('sha256').update(inspectorSource).digest('hex')

  let sdk = await client()
  const tools = (await sdk.listTools()).tools
  assert.deepEqual(tools.map(tool => tool.name).sort(), expectedTools)
  results.push({ name: 'tools/list', names: tools.map(tool => tool.name).sort() })
  const scope = { workspaceId: 'p104-workspace', databaseId: 'p104-database' }

  const p6Created = await call(sdk, 'eotion_create_page', {
    workspaceId: scope.workspaceId, title: 'P10.4 P6 compatibility page', idempotencyKey: randomUUID(),
  })
  const p6Updated = await call(sdk, 'eotion_update_page', {
    pageId: p6Created.id, title: 'P10.4 P6 updated page', expectedUpdatedAt: p6Created.updatedAt, idempotencyKey: randomUUID(),
  })
  const p6ReadBack = await call(sdk, 'eotion_get_page', { pageId: p6Created.id })
  assert.deepEqual(p6ReadBack, p6Updated, 'P6 create/update DTO must match a subsequent get_page result')
  results.push({ name: 'p6-create-update-get-compatibility', pageId: p6Created.id, sameAsFirstUpdateDto: true })

  const config = { filters: [], sorts: [], visibleProperties: null, propertyOrder: null }
  let schema = await call(sdk, 'eotion_get_database_schema', scope)
  let version = schema.database.version
  assert.equal(version, fixture.body.database.version)
  const write = async (name, data, key = randomUUID()) => {
    const args = { ...scope, expectedDatabaseVersion: version, idempotencyKey: key, ...data }
    const result = await call(sdk, name, args); version = result.database.version
    return { args, result }
  }
  const first = await write('eotion_create_record', { title: 'First title' })
  const text = (await write('eotion_create_property', { name: 'Notes', type: 'text' })).result.property
  const date = (await write('eotion_create_property', { name: 'Date', type: 'date' })).result.property
  const select = (await write('eotion_create_property', { name: 'Status', type: 'select', options: Array.from({ length: 101 }, (_, index) => ({ id: `option-${index}`, name: `Option ${index}` })) })).result.property
  const relation = (await write('eotion_create_property', { name: 'Links', type: 'relation', config: { targetDatabaseId: scope.databaseId } })).result.property
  const formula = (await write('eotion_create_property', { name: 'Computed', type: 'formula', config: { expression: { kind: 'literal', value: 7 }, resultType: 'number' } })).result.property
  const rollup = (await write('eotion_create_property', { name: 'Count', type: 'rollup', config: { relationPropertyId: relation.id, targetPropertyId: 'p104-title', aggregation: 'count' } })).result.property
  const dateValue = { start: '2026-10-23T08:00:00.000Z', end: '2026-10-25T08:00:00.000Z', timeZone: 'Asia/Shanghai' }
  const created = await write('eotion_create_record', { title: 'Initial title', properties: {
    [text.id]: '文'.repeat(20001), [date.id]: dateValue, [select.id]: 'option-100', [relation.id]: [first.result.record.id],
  } })
  let record = await call(sdk, 'eotion_get_record', { ...scope, recordId: created.result.record.id })
  assert.equal(record.properties[text.id].length, 20001); assert.deepEqual(record.properties[date.id], dateValue)
  assert.deepEqual(record.properties[relation.id], [first.result.record.id]); assert.equal(record.properties[formula.id], 7); assert.equal(record.properties[rollup.id], 1)
  record = (await write('eotion_update_record_cell', { recordId: record.id, propertyId: text.id, value: 'Written by real MCP Client', expectedRecordVersion: record.version })).result.record
  record = (await write('eotion_update_record_cell', { recordId: record.id, propertyId: 'p104-title', value: 'Canonical Page title', expectedRecordVersion: record.version, expectedPageUpdatedAt: record.pageVersion })).result.record
  const renamedProperty = await write('eotion_update_property', { propertyId: text.id, name: 'Updated notes', expectedPropertyVersion: text.version })
  assert.equal(renamedProperty.result.property.name, 'Updated notes')
  let board
  const views = []
  for (const type of ['table', 'list', 'board', 'timeline']) {
    const options = { future: { preserved: [1, 'yes'] }, ...(type === 'board' ? { groupByPropertyId: select.id } : {}),
      ...(type === 'timeline' ? { timeline: { dateSource: { mode: 'date-property', propertyId: date.id }, scale: 'month' } } : {}) }
    const made = await write('eotion_create_view', { name: `MCP ${type}`, type, config: { ...config, options } })
    views.push(made.result.view)
    if (type === 'board') board = made.result.view
  }
  board = (await write('eotion_update_view', { viewId: board.id, name: 'Renamed Board', expectedViewVersion: board.version })).result.view
  assert.deepEqual(board.config.options.future, { preserved: [1, 'yes'] }); assert.equal(board.config.options.groupByPropertyId, select.id)
  board = (await write('eotion_update_view', { viewId: board.id, config: { ...board.config, sorts: [{ propertyId: 'p104-title', direction: 'desc' }] }, expectedViewVersion: board.version })).result.view
  assert.deepEqual(board.config.options.future, { preserved: [1, 'yes'] })
  const renamed = await write('eotion_rename_database', { name: 'P10.4 renamed by MCP' })
  schema = await call(sdk, 'eotion_get_database_schema', scope)
  assert.equal(schema.database.name, 'P10.4 renamed by MCP'); assert.equal(schema.database.version, version)
  const page = await call(sdk, 'eotion_get_page', { pageId: record.pageId })
  assert.equal(page.title, 'Canonical Page title')
  const host = await call(sdk, 'eotion_get_page', { pageId: 'p104-host' }); assert.equal(host.title, 'Host unchanged')
  const table = await call(sdk, 'eotion_query_database', { ...scope, viewId: 'p104-table', filters: [], sorts: [] })
  assert.equal(table.records.length, 2)

  const savedTable = (await write('eotion_update_view', {
    viewId: views.find(view => view.type === 'table').id,
    config: { ...views.find(view => view.type === 'table').config,
      filters: [{ propertyId: 'p104-title', operator: 'contains', value: 'Canonical' }],
      sorts: [{ propertyId: 'p104-title', direction: 'desc' }],
    },
    expectedViewVersion: views.find(view => view.type === 'table').version,
  })).result.view
  for (const view of views) {
    const query = await call(sdk, 'eotion_query_database', { ...scope, viewId: view.id, filters: [], sorts: [] })
    assert.equal(query.records.length, 2, `built MCP query must read ${view.type}`)
  }
  const filtersOnly = await call(sdk, 'eotion_query_database', {
    ...scope, viewId: savedTable.id, filters: [{ propertyId: text.id, operator: 'contains', value: 'Written by real MCP Client' }], propertyIds: [text.id],
  })
  assert.deepEqual(filtersOnly.effectiveQuery.sorts, [{ propertyId: 'p104-title', direction: 'desc' }])
  assert.deepEqual(filtersOnly.properties.map(property => property.id).sort(), ['p104-title', text.id].sort(), 'propertyIds must include the Title property')
  assert.equal(filtersOnly.records.length, 1)
  const sortsOnly = await call(sdk, 'eotion_query_database', {
    ...scope, viewId: savedTable.id, sorts: [{ propertyId: 'p104-title', direction: 'asc' }],
  })
  assert.deepEqual(sortsOnly.effectiveQuery.filters, [{ propertyId: 'p104-title', operator: 'contains', value: 'Canonical' }])
  assert.equal(sortsOnly.records.length, 1)
  const emptyQuery = await call(sdk, 'eotion_query_database', {
    ...scope, viewId: savedTable.id, filters: [{ propertyId: 'p104-title', operator: 'contains', value: 'no-such-p104-title' }], sorts: [],
  })
  assert.equal(emptyQuery.records.length, 0)

  const firstQueryPage = await call(sdk, 'eotion_query_database', {
    ...scope, viewId: 'p104-table', filters: [], sorts: [{ propertyId: 'p104-title', direction: 'asc' }],
    propertyIds: [text.id], limit: 1,
  })
  assert.equal(firstQueryPage.records.length, 1)
  assert.equal(firstQueryPage.records[0].properties['p104-title'], 'Canonical Page title')
  assert.deepEqual(firstQueryPage.properties.map(property => property.id).sort(), ['p104-title', text.id].sort())
  assert.ok(firstQueryPage.nextCursor)
  const secondQueryPage = await call(sdk, 'eotion_query_database', {
    ...scope, viewId: 'p104-table', filters: [], sorts: [{ propertyId: 'p104-title', direction: 'asc' }],
    limit: 1, cursor: firstQueryPage.nextCursor,
  })
  assert.equal(secondQueryPage.records.length, 1)
  assert.equal(secondQueryPage.records[0].properties['p104-title'], 'First title')
  assert.notEqual(secondQueryPage.records[0].id, firstQueryPage.records[0].id)
  assert.equal(secondQueryPage.nextCursor, null)
  const changedDatabase = await write('eotion_create_record', { title: 'P10.4 invalidates old query cursor' })
  const staleCursor = await call(sdk, 'eotion_query_database', {
    ...scope, viewId: 'p104-table', filters: [], sorts: [{ propertyId: 'p104-title', direction: 'asc' }],
    limit: 1, cursor: firstQueryPage.nextCursor,
  }, /^CONFLICT:/)
  assert.equal(staleCursor, undefined)
  step('mcp-query-acceptance', { fourViewsReadable: true, temporaryFilterAndSortReplacement: true, titleProjection: true, emptyResult: true, paginationCursorRejectedAfterWrite: true, insertedRecordId: changedDatabase.result.record.id })

  const beforeReplay = await snapshot()
  assert.deepEqual(await call(sdk, 'eotion_create_record', created.args), created.result)
  assert.deepEqual(await call(sdk, 'eotion_rename_database', renamed.args), renamed.result)
  await call(sdk, 'eotion_rename_database', { ...renamed.args, name: 'Different payload' }, /^CONFLICT:/)
  await call(sdk, 'eotion_create_record', { ...created.args, idempotencyKey: randomUUID() }, /^CONFLICT:/)
  assert.equal(await snapshot(), beforeReplay)

  const lostArgs = { ...scope, expectedDatabaseVersion: version, idempotencyKey: randomUUID(), title: 'Lost response record' }
  let dropped = false
  const lossy = await client(async (url, init) => {
    const response = await fetch(url, init)
    const request = typeof init?.body === 'string' ? JSON.parse(init.body) : null
    if (request?.method === 'tools/call' && request.params?.arguments?.idempotencyKey === lostArgs.idempotencyKey) {
      assert.ok(response.ok); await response.arrayBuffer(); dropped = true
      throw new Error('P10.4 injected network response loss after response drained')
    }
    return response
  })
  await assert.rejects(lossy.callTool({ name: 'eotion_create_record', arguments: lostArgs }), /response loss/)
  assert.equal(dropped, true)
  const lost = await call(sdk, 'eotion_create_record', lostArgs); version = lost.database.version
  assert.equal(await connection.db.collection('database_records').countDocuments(), 4)
  await stopApi()
  await startApi(replicaUri, 'restart')
  sdk = await client()
  assert.deepEqual(await call(sdk, 'eotion_create_record', lostArgs), lost)
  assert.deepEqual(await call(sdk, 'eotion_create_record', created.args), created.result)
  const stored = await connection.db.collection('database_records').findOne({ id: record.id })
  assert.equal(Object.hasOwn(stored.properties, 'p104-title'), false)

  for (const protocolEra of ['legacy', 'modern']) {
    const initialized = await inspector(protocolEra, 'initialize')
    step('inspector-initialize', { protocolEra, responseType: typeof initialized.payload })
    const discovery = await inspector(protocolEra, 'tools/list')
    const discoveredTools = discovery.payload.tools
    assert.ok(Array.isArray(discoveredTools), `Inspector ${protocolEra} tools/list must expose tools`)
    assert.deepEqual(discoveredTools.map(tool => tool.name).sort(), expectedTools)
    const inspectorSchema = await inspector(protocolEra, 'tools/call', {
      toolName: 'eotion_get_database_schema', toolArgs: scope,
    })
    assert.equal(inspectorSchema.payload.database.id, scope.databaseId)
    step('inspector-discovery-read', { protocolEra, tools: discoveredTools.length, databaseId: inspectorSchema.payload.database.id })
  }
  const inspectorWriteArgs = {
    ...scope, expectedDatabaseVersion: version, idempotencyKey: randomUUID(), title: 'Official Inspector created record',
  }
  const inspectorCreated = await inspector('modern', 'tools/call', {
    toolName: 'eotion_create_record', toolArgs: inspectorWriteArgs,
  })
  assert.equal(inspectorCreated.payload.record.properties['p104-title'], 'Official Inspector created record')
  version = inspectorCreated.payload.database.version
  const inspectorRead = await inspector('modern', 'tools/call', {
    toolName: 'eotion_get_record', toolArgs: { ...scope, recordId: inspectorCreated.payload.record.id },
  })
  assert.equal(inspectorRead.payload.properties['p104-title'], 'Official Inspector created record')
  const inspectorReplay = await inspector('modern', 'tools/call', {
    toolName: 'eotion_create_record', toolArgs: inspectorWriteArgs,
  })
  assert.deepEqual(inspectorReplay.payload, inspectorCreated.payload, 'Inspector same-key replay must return first DTO')
  step('inspector-write-read-replay', { recordId: inspectorCreated.payload.record.id, sameKeyReplayMatches: true, inspectorVersion, inspectorEntry, inspectorSha256 })

  const outsiderClient = await clientFor(outsiderToken, 'eotion-p104-outsider-client')
  const ownerSnapshotBeforeDenied = await snapshot()
  const ownerDatabaseDenied = await outsiderClient.callTool({ name: 'eotion_get_database_schema', arguments: scope })
  const missingDatabaseDenied = await outsiderClient.callTool({ name: 'eotion_get_database_schema', arguments: { ...scope, databaseId: 'p104-database-does-not-exist' } })
  const errorText = result => result.content.filter(item => item.type === 'text').map(item => item.text).join('\n')
  const ownerDeniedText = errorText(ownerDatabaseDenied)
  const missingDeniedText = errorText(missingDatabaseDenied)
  assert.equal(ownerDatabaseDenied.isError, true)
  assert.equal(missingDatabaseDenied.isError, true)
  assert.match(ownerDeniedText, /^NOT_FOUND:/)
  assert.equal(ownerDeniedText, missingDeniedText, 'cross-user and missing Database denials must be indistinguishable')
  assert.equal(await snapshot(), ownerSnapshotBeforeDenied, 'cross-user denial must not change owner business state')
  step('second-user-not-found-equivalence', { ownerAndMissingErrorsEqual: true, ownerStateUnchanged: true })

  assert.equal(await connection.db.collection('pages').countDocuments({ role: 'database-record' }), 5)
  const beforeStandalone = await snapshot()
  await stopApi(); await connection.close(); connection = undefined
  await stopMongo(); await startMongo(false); await startApi(standaloneUri, 'standalone')
  sdk = await client()
  const standaloneInputs = [
    ['eotion_create_record', { title: 'Rejected' }],
    ['eotion_update_record_cell', { recordId: record.id, propertyId: text.id, value: 'Rejected', expectedRecordVersion: record.version }],
    ['eotion_create_property', { name: 'Rejected', type: 'text' }],
    ['eotion_update_property', { propertyId: text.id, name: 'Rejected', expectedPropertyVersion: renamedProperty.result.property.version }],
    ['eotion_create_view', { name: 'Rejected', type: 'table' }],
    ['eotion_update_view', { viewId: board.id, name: 'Rejected', expectedViewVersion: board.version }],
    ['eotion_rename_database', { name: 'Rejected' }],
  ]
  for (const [name, data] of standaloneInputs) await call(sdk, name, { ...scope, expectedDatabaseVersion: version, idempotencyKey: randomUUID(), ...data }, /^UNAVAILABLE:.*(?:replica set|transactions)/i)
  await call(sdk, 'eotion_create_page', { workspaceId: scope.workspaceId, title: 'Rejected Page', idempotencyKey: randomUUID() }, /Page writes require MongoDB replica set transactions/)
  await call(sdk, 'eotion_update_page', { pageId: host.id, title: 'Rejected Page title', expectedUpdatedAt: host.updatedAt, idempotencyKey: randomUUID() }, /Page writes require MongoDB replica set transactions/)
  assert.equal(await snapshot(), beforeStandalone, 'real standalone must reject every write before changing any business entity/version/receipt')
  results.push({ name: 'standalone/read-only-audit', unchanged: true, databaseWriteToolsRejected: 7, pageWriteToolsRejected: 2 })
  outcome = 'PASS'
} catch (error) {
  results.push({ name: 'failure', message: String(error), stack: error?.stack })
  process.exitCode = 1
} finally {
  await stopApi().catch(error => { results.push({ name: 'cleanup-api-failure', message: String(error) }); process.exitCode = 1 })
  if (connection) {
    assert.match(connection.name, /^eotion_p104_client_[a-f0-9]+$/)
    await connection.dropDatabase().then(() => { databaseDropped = true }).catch(error => { results.push({ name: 'cleanup-db-failure', message: String(error) }); process.exitCode = 1 })
    await connection.close(); connection = undefined
  }
  await stopMongo().catch(error => { results.push({ name: 'cleanup-mongo-failure', message: String(error) }); process.exitCode = 1 })
  token = undefined
  outsiderToken = undefined
  await writeFile(join(evidence, 'transcript.json'), JSON.stringify(results, null, 2))
  const processesExited = owned.every(item => Object.hasOwn(item, 'exitCode') || item.signal !== null && item.signal !== undefined)
  if (!processesExited) {
    results.push({ name: 'cleanup-owned-process-check-failure', message: 'At least one owned child process is still running.' })
    process.exitCode = 1
    await writeFile(join(evidence, 'transcript.json'), JSON.stringify(results, null, 2))
  }
  const summary = {
    outcome: process.exitCode ? 'FAIL' : outcome, checks: results.length, evidence, databaseName, mongoPort, owned,
    processesExited,
    inspector: { version: inspectorVersion, entry: inspectorEntry, sha256: inspectorSha256, wrapper: inspectorWrapper, tokenPassedOnlyThroughEnvironment: true },
    cleanup: { databaseDropped, credentialsLogged: false, tokensStoredInMemoryOnly: true }, version: '0.0.1', buildNumber: 2,
  }
  await writeFile(join(evidence, 'summary.json'), JSON.stringify(summary, null, 2))
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}
