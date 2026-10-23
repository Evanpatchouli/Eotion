/** P10.3 real SDK Client acceptance against the built API and a private Mongo process.
 * Run after pnpm build:api: node scripts/verify-p103-mcp.mjs
 * Requires mongod (P103_MONGOD may override its path). Never connects to port 27017.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const apiDir = join(root, 'apps/api')
const require = createRequire(join(apiDir, 'package.json'))
const mongoose = require('mongoose')
const { Client, StreamableHTTPClientTransport } = require('@modelcontextprotocol/client')
const evidence = await mkdtemp(join(tmpdir(), 'eotion-p103-client-'))
const dbPath = join(evidence, 'mongo-data')
await mkdir(dbPath)
const mongod = process.env.P103_MONGOD || (process.platform === 'win32'
  ? 'C:/Program Files/MongoDB/Server/8.2/bin/mongod.exe' : 'mongod')
const databaseName = `eotion_p103_client_${randomUUID().replaceAll('-', '')}`
const replicaName = `p103_${randomUUID().slice(0, 8)}`
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
let mongo, api, connection, baseUrl, token
let outcome = 'FAIL'
let databaseDropped = false

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
  owned.push({ name, pid: processChild.pid, command, args, startedAt: new Date().toISOString() })
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
    WEB_ORIGIN: 'https://p103.example.test', NODE_ENV: 'test',
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
  const value = new Client({ name: 'eotion-p103-built-client', version: '1.0.0' })
  await value.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } }, ...(customFetch ? { fetch: customFetch } : {}),
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
try {
  await startMongo(true)
  await startApi(replicaUri, 'replica')
  const email = `p103-${randomUUID()}@example.test`, password = `p103-private-${randomUUID()}`
  await http('/auth/register', 'POST', { email, password })
  const { cookie } = await http('/auth/login', 'POST', { email, password })
  await http('/workspaces', 'POST', { id: 'p103-workspace', name: 'P10.3 isolated acceptance' }, cookie)
  await http('/workspaces/p103-workspace/pages', 'POST', { id: 'p103-host', parentPageId: null, title: 'Host unchanged', orderKey: '0000' }, cookie)
  const fixture = await http('/workspaces/p103-workspace/pages/p103-host/databases', 'POST', {
    id: 'p103-database', name: 'P10.3 original', titlePropertyId: 'p103-title', viewId: 'p103-table',
    blockId: 'p103-block', orderKey: '0000', parentBlockId: null,
  }, cookie)
  token = (await http('/mcp/tokens', 'POST', { name: 'P10.3 private Client' }, cookie)).body.token
  let sdk = await client()
  const tools = (await sdk.listTools()).tools
  assert.deepEqual(tools.map(tool => tool.name).sort(), expectedTools)
  results.push({ name: 'tools/list', names: tools.map(tool => tool.name).sort() })
  const scope = { workspaceId: 'p103-workspace', databaseId: 'p103-database' }
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
  const rollup = (await write('eotion_create_property', { name: 'Count', type: 'rollup', config: { relationPropertyId: relation.id, targetPropertyId: 'p103-title', aggregation: 'count' } })).result.property
  const dateValue = { start: '2026-10-23T08:00:00.000Z', end: '2026-10-25T08:00:00.000Z', timeZone: 'Asia/Shanghai' }
  const created = await write('eotion_create_record', { title: 'Initial title', properties: {
    [text.id]: '文'.repeat(20001), [date.id]: dateValue, [select.id]: 'option-100', [relation.id]: [first.result.record.id],
  } })
  let record = await call(sdk, 'eotion_get_record', { ...scope, recordId: created.result.record.id })
  assert.equal(record.properties[text.id].length, 20001); assert.deepEqual(record.properties[date.id], dateValue)
  assert.deepEqual(record.properties[relation.id], [first.result.record.id]); assert.equal(record.properties[formula.id], 7); assert.equal(record.properties[rollup.id], 1)
  record = (await write('eotion_update_record_cell', { recordId: record.id, propertyId: text.id, value: 'Written by real MCP Client', expectedRecordVersion: record.version })).result.record
  record = (await write('eotion_update_record_cell', { recordId: record.id, propertyId: 'p103-title', value: 'Canonical Page title', expectedRecordVersion: record.version, expectedPageUpdatedAt: record.pageVersion })).result.record
  const renamedProperty = await write('eotion_update_property', { propertyId: text.id, name: 'Updated notes', expectedPropertyVersion: text.version })
  assert.equal(renamedProperty.result.property.name, 'Updated notes')
  let board
  for (const type of ['table', 'list', 'board', 'timeline']) {
    const options = { future: { preserved: [1, 'yes'] }, ...(type === 'board' ? { groupByPropertyId: select.id } : {}),
      ...(type === 'timeline' ? { timeline: { dateSource: { mode: 'date-property', propertyId: date.id }, scale: 'month' } } : {}) }
    const made = await write('eotion_create_view', { name: `MCP ${type}`, type, config: { ...config, options } })
    if (type === 'board') board = made.result.view
  }
  board = (await write('eotion_update_view', { viewId: board.id, name: 'Renamed Board', expectedViewVersion: board.version })).result.view
  assert.deepEqual(board.config.options.future, { preserved: [1, 'yes'] }); assert.equal(board.config.options.groupByPropertyId, select.id)
  board = (await write('eotion_update_view', { viewId: board.id, config: { ...board.config, sorts: [{ propertyId: 'p103-title', direction: 'desc' }] }, expectedViewVersion: board.version })).result.view
  assert.deepEqual(board.config.options.future, { preserved: [1, 'yes'] })
  const renamed = await write('eotion_rename_database', { name: 'P10.3 renamed by MCP' })
  schema = await call(sdk, 'eotion_get_database_schema', scope)
  assert.equal(schema.database.name, 'P10.3 renamed by MCP'); assert.equal(schema.database.version, version)
  const page = await call(sdk, 'eotion_get_page', { pageId: record.pageId })
  assert.equal(page.title, 'Canonical Page title')
  const host = await call(sdk, 'eotion_get_page', { pageId: 'p103-host' }); assert.equal(host.title, 'Host unchanged')
  const table = await call(sdk, 'eotion_query_database', { ...scope, viewId: 'p103-table', filters: [], sorts: [] })
  assert.equal(table.records.length, 2)
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
      throw new Error('P10.3 injected network response loss after response drained')
    }
    return response
  })
  await assert.rejects(lossy.callTool({ name: 'eotion_create_record', arguments: lostArgs }), /response loss/)
  assert.equal(dropped, true)
  const lost = await call(sdk, 'eotion_create_record', lostArgs); version = lost.database.version
  assert.equal(await connection.db.collection('database_records').countDocuments(), 3)
  await stopApi()
  await startApi(replicaUri, 'restart')
  sdk = await client()
  assert.deepEqual(await call(sdk, 'eotion_create_record', lostArgs), lost)
  assert.deepEqual(await call(sdk, 'eotion_create_record', created.args), created.result)
  const stored = await connection.db.collection('database_records').findOne({ id: record.id })
  assert.equal(Object.hasOwn(stored.properties, 'p103-title'), false)
  assert.equal(await connection.db.collection('pages').countDocuments({ role: 'database-record' }), 3)
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
    assert.match(connection.name, /^eotion_p103_client_[a-f0-9]+$/)
    await connection.dropDatabase().then(() => { databaseDropped = true }).catch(error => { results.push({ name: 'cleanup-db-failure', message: String(error) }); process.exitCode = 1 })
    await connection.close(); connection = undefined
  }
  await stopMongo().catch(error => { results.push({ name: 'cleanup-mongo-failure', message: String(error) }); process.exitCode = 1 })
  token = undefined
  await writeFile(join(evidence, 'transcript.json'), JSON.stringify(results, null, 2))
  const summary = { outcome: process.exitCode ? 'FAIL' : outcome, checks: results.length, evidence, databaseName, mongoPort, owned,
    processesExited: owned.every(item => item.pid && !(() => { try { process.kill(item.pid, 0); return true } catch { return false } })()),
    cleanup: { databaseDropped, credentialsLogged: false }, version: '0.0.1', buildNumber: 2 }
  await writeFile(join(evidence, 'summary.json'), JSON.stringify(summary, null, 2))
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}
