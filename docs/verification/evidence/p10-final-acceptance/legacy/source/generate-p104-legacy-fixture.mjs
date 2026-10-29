/** Reproduce P6 receipt fixtures with the actual pre-extraction runner at 2aad764.
 * P4_TEST_MONGODB_URI must point to a disposable, private replica set (not 27017).
 * Only the historical runner is substituted; Mongo, permissions, CAS, HTTP and MCP
 * are real. Never invokes the current McpMutationService to create these receipts.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { createRequire, Module } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(root, 'apps/api/package.json'))
const ts = require('typescript')
const { NestFactory } = require('@nestjs/core')
const { FastifyAdapter } = require('@nestjs/platform-fastify')
const { getConnectionToken } = require('@nestjs/mongoose')
const { Client, StreamableHTTPClientTransport } = require('@modelcontextprotocol/client')
const serviceDir = join(root, 'apps/api/dist/modules/server-domain/services')
const { DocumentMutationService } = require(join(serviceDir, 'document-mutation.service.js'))
const { PageService } = require(join(serviceDir, 'page.service.js'))
const { BlockService } = require(join(serviceDir, 'block.service.js'))
const { WorkspacePermissionService } = require(join(serviceDir, 'workspace-permission.service.js'))
const { McpMutationRepository } = require(join(serviceDir, '../repositories/mcp-mutation.repository.js'))
const historicalSha = '2aad764b1c5028c9ed2175da8f02d1871d42b2bc'
const sourcePath = 'apps/api/src/modules/server-domain/services/document-mutation.service.ts'
const source = execFileSync('git', ['show', `${historicalSha}:${sourcePath}`], { cwd: root, encoding: 'utf8' })
const sourceSha256 = createHash('sha256').update(source).digest('hex')
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  experimentalDecorators: true, emitDecoratorMetadata: true,
} }).outputText
const filename = join(serviceDir, 'p104-historical-document-mutation.cjs')
const historicalModule = new Module(filename)
historicalModule.filename = filename
historicalModule.paths = Module._nodeModulePaths(serviceDir)
historicalModule._compile(compiled, filename)
const LegacyDocumentMutationService = historicalModule.exports.DocumentMutationService

assert.ok(process.env.P4_TEST_MONGODB_URI, 'an explicit private replica set URI is required')
const uri = new URL(process.env.P4_TEST_MONGODB_URI)
assert.equal(uri.hostname, '127.0.0.1')
assert.ok(uri.port && uri.port !== '27017')
uri.pathname = `/eotion_p104_legacy_${randomUUID().replaceAll('-', '')}`
process.env.MONGODB_URI = uri.toString()
process.env.WEB_ORIGIN = 'https://p104-legacy.example.test'
const evidence = await mkdtemp(join(tmpdir(), 'eotion-p104-legacy-'))
let app, connection, client, token
const vectors = []
const provenance = { sourceCommit: historicalSha, sourcePath, sourceSha256,
  generator: 'scripts/generate-p104-legacy-fixture.mjs', databaseName: uri.pathname.slice(1),
  mongoPort: Number(uri.port), startedAt: new Date().toISOString(),
  historicalRunnerExecuted: true, currentRunnerUsedToCreateReceipts: false,
  mockTransactions: false, outcome: 'FAIL', databaseDropped: false }
try {
  const { AppModule } = require(join(root, 'apps/api/dist/app.module.js'))
  app = await NestFactory.create(AppModule, new FastifyAdapter(), { logger: false })
  app.setGlobalPrefix('api')
  await app.listen(0, '127.0.0.1')
  const baseUrl = `http://127.0.0.1:${app.getHttpServer().address().port}`
  connection = app.get(getConnectionToken())
  const hello = await connection.db.admin().command({ hello: 1 })
  assert.equal(hello.isWritablePrimary, true)
  assert.ok(hello.setName)
  provenance.replicaSet = hello.setName
  const historical = new LegacyDocumentMutationService(connection, app.get(McpMutationRepository),
    app.get(PageService), app.get(BlockService), app.get(WorkspacePermissionService))
  const current = app.get(DocumentMutationService)
  current.create = historical.create.bind(historical)
  current.update = historical.update.bind(historical)
  const http = async (route, body, cookie) => {
    const response = await fetch(`${baseUrl}/api${route}`, { method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) })
    assert.equal(response.ok, true, `fixture HTTP ${route}: ${response.status}`)
    return { body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  const email = `legacy-${randomUUID()}@example.test`, password = `P104-${randomUUID()}!`
  await http('/auth/register', { email, password })
  const { cookie } = await http('/auth/login', { email, password })
  await http('/workspaces', { id: 'mcp-write-a-one', name: 'P6 historical fixture' }, cookie)
  token = (await http('/mcp/tokens', { name: 'P6 fixture generator' }, cookie)).body.token
  client = new Client({ name: 'p104-historical-receipt-generator', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }))
  const call = async (name, payload, capture = true) => {
    const result = await client.callTool({ name, arguments: payload })
    assert.equal(result.isError, undefined, JSON.stringify(result.content))
    const receipt = await connection.db.collection('mcp_mutation_receipts').findOne({ tool: name, idempotencyKey: payload.idempotencyKey })
    assert.equal(receipt?.status, 'committed')
    assert.deepEqual(receipt.result, result.structuredContent)
    if (capture) vectors.push({ tool: name, idempotencyKey: payload.idempotencyKey,
      requestHash: receipt.requestHash, payload, result: receipt.result })
    return result.structuredContent
  }
  await call('eotion_create_page', { workspaceId: 'mcp-write-a-one', parentPageId: null,
    title: 'Legacy P6 create', idempotencyKey: 'p6-legacy-create-static',
    blocks: [{ type: 'paragraph', text: 'from P6' }] })
  const updatePage = await call('eotion_create_page', { workspaceId: 'mcp-write-a-one', parentPageId: null,
    title: 'Legacy P6 update seed', idempotencyKey: 'p6-legacy-update-seed',
    blocks: [{ type: 'paragraph', text: 'before P6 update' }] }, false)
  await call('eotion_update_page', { pageId: updatePage.id, expectedUpdatedAt: updatePage.updatedAt,
    title: 'Legacy P6 updated', blocks: [{ id: updatePage.blocks[0].id, type: 'paragraph', text: 'updated by P6' }],
    idempotencyKey: 'p6-legacy-update-static' })
  assert.equal(vectors.length, 2)
  provenance.outcome = 'PASS'
  const fixture = `/** Actual committed receipts produced through tools/call using the historical\n * DocumentMutationService at ${historicalSha}.\n * Old source SHA256: ${sourceSha256}.\n * See p6-mutation-receipts.provenance.json; never regenerate with the current runner.\n */\nexport const P6_LEGACY_RECEIPTS = ${JSON.stringify(vectors, null, 2)} as const;\n`
  await writeFile(join(root, 'apps/api/src/modules/mcp/fixtures/p6-mutation-receipts.fixture.ts'), fixture)
} catch (error) {
  provenance.failure = String(error)
  process.exitCode = 1
} finally {
  await client?.close().catch(() => {})
  if (connection) {
    assert.match(connection.name, /^eotion_p104_legacy_[a-f0-9]+$/)
    await connection.dropDatabase()
    provenance.databaseDropped = true
  }
  await app?.close()
  token = undefined
  provenance.finishedAt = new Date().toISOString()
  await writeFile(join(evidence, 'historical-document-mutation.ts'), source)
  await writeFile(join(evidence, 'vectors.json'), JSON.stringify(vectors, null, 2))
  await writeFile(join(evidence, 'provenance.json'), JSON.stringify(provenance, null, 2))
  if (provenance.outcome === 'PASS') await writeFile(join(root, 'apps/api/src/modules/mcp/fixtures/p6-mutation-receipts.provenance.json'), JSON.stringify(provenance, null, 2) + '\n')
  process.stdout.write(JSON.stringify({ ...provenance, evidence }) + '\n')
}
