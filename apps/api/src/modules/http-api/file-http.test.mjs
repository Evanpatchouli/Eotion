import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { getConnectionToken } from '@nestjs/mongoose'
import { ApiError, EotionApiClient } from '../../../../../packages/sdk/src/index.ts'

const secret = `secret-${randomUUID()}`
const token = `token-${randomUUID()}`

function testMongoUri() {
  const base = process.env.P4_TEST_MONGODB_URI?.trim()
  assert.ok(base, 'P4_TEST_MONGODB_URI must point to a MongoDB replica set')
  const uri = new URL(base)
  uri.pathname = `/eotion_file_http_test_${randomUUID().replaceAll('-', '')}`
  return uri.toString()
}

function fakeOss() {
  const objects = new Map()
  const uploaded = []
  const deleted = []
  const abortedUploads = []
  let failUpload = false
  let failDelete = false
  let returnSignedUrl = false
  let tokenDelayMs = 0
  let onUploadChunk
  let uploadResponseBarrier
  const tokenClients = new Map()
  const server = createServer(async (request, response) => {
    const chunks = []
    const isUpload = request.url === '/api/oss/upload-stream' && request.method === 'POST'
    request.on('aborted', () => {
      if (isUpload) abortedUploads.push(Buffer.concat(chunks).length)
    })
    try {
      for await (const chunk of request) {
        chunks.push(chunk)
        if (isUpload) onUploadChunk?.()
      }
    } catch {
      response.destroy()
      return
    }
    const bytes = Buffer.concat(chunks)
    const send = (status, body) => {
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(body))
    }
    if (request.url === '/api/auth/token' && request.method === 'POST') {
      const clientId = request.headers['x-client-id']
      assert.ok(clientId === 'eotion-test-client' || clientId === 'eotion')
      assert.ok(JSON.parse(bytes.toString()).sign)
      if (tokenDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, tokenDelayMs))
      const accessToken = clientId === 'eotion' ? `${token}-eotion` : token
      tokenClients.set(accessToken, clientId)
      return send(200, { tokenType: 'Bearer', accessToken, expiresAt: new Date(Date.now() + 3600000).toISOString(), expiresIn: 3600, clientId })
    }
    const authenticatedClientId = tokenClients.get(request.headers.authorization?.replace(/^Bearer /, ''))
    assert.ok(authenticatedClientId)
    if (request.url === '/api/oss/upload-stream' && request.method === 'POST') {
      if (failUpload) return send(503, { message: 'synthetic upload failure' })
      const requestedKey = request.headers['x-object-key']
      assert.ok(requestedKey)
      assert.ok(requestedKey.split('/').every((segment) => segment !== '.' && segment !== '..'))
      const objectKey = requestedKey.startsWith(`${authenticatedClientId}/`)
        ? requestedKey : `${authenticatedClientId}/${requestedKey}`
      objects.set(objectKey, bytes)
      const unicodeName = request.headers['x-file-name-utf8']
      const fileName = unicodeName === undefined ? request.headers['x-file-name'] : decodeURIComponent(unicodeName.slice("UTF-8''".length))
      uploaded.push({ objectKey, bytes, mimeType: request.headers['content-type'], fileName, unicodeName })
      if (uploadResponseBarrier) await uploadResponseBarrier()
      const url = returnSignedUrl
        ? `https://objects.example.test/${objectKey}?Expires=123&Signature=temporary`
        : `https://objects.example.test/${objectKey}`
      return send(200, { objectKey, url, bucket: 'test-bucket' })
    }
    if (request.url === '/api/oss/object' && request.method === 'DELETE') {
      const { objectKey } = JSON.parse(bytes.toString())
      deleted.push(objectKey)
      if (failDelete) return send(503, { message: `synthetic delete failure ${secret} ${token}` })
      objects.delete(objectKey)
      return send(200, { objectKey, deleted: true })
    }
    return send(404, { message: 'unknown fake OSS route' })
  })
  return {
    server, objects, uploaded, deleted, abortedUploads,
    set failUpload(value) { failUpload = value },
    set failDelete(value) { failDelete = value },
    set returnSignedUrl(value) { returnSignedUrl = value },
    set tokenDelayMs(value) { tokenDelayMs = value },
    set onUploadChunk(value) { onUploadChunk = value },
    set uploadResponseBarrier(value) { uploadResponseBarrier = value },
  }
}

async function jsonRequest(baseUrl, path, method, cookie, body, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const raw = await response.text()
  return { status: response.status, body: raw ? JSON.parse(raw) : undefined, raw, headers: response.headers }
}

async function session(baseUrl, email) {
  const credentials = { email, password: 'correct horse battery staple' }
  assert.equal((await jsonRequest(baseUrl, '/api/auth/register', 'POST', undefined, credentials)).status, 201)
  const login = await jsonRequest(baseUrl, '/api/auth/login', 'POST', undefined, credentials)
  assert.equal(login.status, 201)
  const cookie = login.headers.get('set-cookie')?.split(';', 1)[0]
  assert.ok(cookie)
  return { cookie, user: login.body.user ?? login.body }
}

function clientWithCookie(baseUrl, cookie) {
  return new EotionApiClient({
    baseUrl,
    fetch: (input, init = {}) => fetch(input, {
      ...init,
      headers: { ...init.headers, cookie },
    }),
  })
}

function assertSafe(value) {
  const serialized = JSON.stringify(value)
  assert.ok(!serialized.includes(secret), 'client response exposed OSS client secret')
  assert.ok(!serialized.includes(token), 'client response exposed OSS bearer token')
}

function file(name = 'résumé #1.txt', text = 'file bytes') {
  return new File([text], name, { type: 'text/plain' })
}

test('File HTTP lifecycle uses the real ali-oss-server SDK and preserves OSS/Mongo failure semantics', async (t) => {
  assert.equal(typeof createRequire(import.meta.url)('@ali-oss-server/sdk').AliOssServerSdk, 'function')
  assert.ok(!readFileSync(new URL('../server-domain/services/file-object-storage.ts', import.meta.url), 'utf8').includes('new Function('))
  const environment = Object.fromEntries(['MONGODB_URI', 'NODE_ENV', 'WEB_ORIGIN', 'ALI_OSS_SERVER_URL', 'ALI_OSS_CLIENT_ID', 'ALI_OSS_CLIENT_SECRET', 'ALI_OSS_MAX_UPLOAD_BYTES'].map((key) => [key, process.env[key]]))
  const oss = fakeOss()
  await new Promise((resolve) => oss.server.listen(0, '127.0.0.1', resolve))
  const ossAddress = oss.server.address()
  assert.ok(ossAddress && typeof ossAddress === 'object')
  process.env.MONGODB_URI = testMongoUri()
  delete process.env.NODE_ENV
  process.env.WEB_ORIGIN = 'https://trusted.example.test'
  process.env.ALI_OSS_SERVER_URL = `http://127.0.0.1:${ossAddress.port}`
  process.env.ALI_OSS_CLIENT_ID = 'eotion-test-client'
  process.env.ALI_OSS_CLIENT_SECRET = secret
  let app
  let connection
  try {
    const { AppModule } = await import('../../../dist/app.module.js')
    app = await NestFactory.create(AppModule, new FastifyAdapter(), { logger: false })
    app.setGlobalPrefix('api')
    await app.listen(0, '127.0.0.1')
    const address = app.getHttpServer().address()
    assert.ok(address && typeof address === 'object')
    const baseUrl = `http://127.0.0.1:${address.port}`
    connection = app.get(getConnectionToken())
    const files = connection.db.collection('files')
    const owner = await session(baseUrl, `file-owner-${randomUUID()}@example.test`)
    const foreign = await session(baseUrl, `file-foreign-${randomUUID()}@example.test`)
    const client = clientWithCookie(baseUrl, owner.cookie)
    const foreignClient = clientWithCookie(baseUrl, foreign.cookie)
    const workspaceId = `ws-${randomUUID()}`
    await client.workspaces.create({ id: workspaceId, name: 'File workspace' })
    await t.test('chunked stream exceeding limit returns 413 without crashing API', async () => {
      const id = `file-${randomUUID()}`
      const previousLimit = process.env.ALI_OSS_MAX_UPLOAD_BYTES
      process.env.ALI_OSS_MAX_UPLOAD_BYTES = '4'
      oss.tokenDelayMs = 100
      const previousUploads = oss.uploaded.length
      try {
        const response = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/files`, {
          method: 'POST',
          headers: {
            cookie: owner.cookie,
            'content-type': 'application/octet-stream',
            'x-eotion-file-id': encodeURIComponent(id),
            'x-eotion-file-name': encodeURIComponent('chunked.txt'),
            'x-eotion-file-mime-type': encodeURIComponent('text/plain'),
          },
          body: Readable.from([Buffer.from('ab'), Buffer.from('cdefghi')]),
          duplex: 'half',
          signal: AbortSignal.timeout(5000),
        })
        assert.equal(response.status, 413)
        assertSafe(await response.json())
      } finally {
        oss.tokenDelayMs = 0
        if (previousLimit === undefined) delete process.env.ALI_OSS_MAX_UPLOAD_BYTES
        else process.env.ALI_OSS_MAX_UPLOAD_BYTES = previousLimit
      }
      assert.equal((await jsonRequest(baseUrl, '/api/health', 'GET')).status, 200)
      assert.equal(await files.countDocuments({ id }), 0)
      assert.equal(oss.uploaded.length, previousUploads)
    })
    await t.test('authenticated CRUD, ownership, client DTO boundaries, and unique keys', async () => {
      const route = `/api/workspaces/${workspaceId}/files`
      assert.equal((await jsonRequest(baseUrl, route, 'GET')).status, 401)
      assert.equal((await jsonRequest(baseUrl, route, 'GET', foreign.cookie)).status, 404)
      assert.equal((await jsonRequest(baseUrl, route, 'POST', foreign.cookie, undefined, {
        'content-type': 'application/octet-stream', 'x-eotion-file-id': 'foreign', 'x-eotion-file-name': 'foreign.txt', 'x-eotion-file-mime-type': 'text%2Fplain',
      })).status, 404)
      const id = `file-${randomUUID()}`
      const created = await client.files.upload(workspaceId, id, file())
      assert.equal(created.id, id)
      assert.equal(created.workspaceId, workspaceId)
      assert.equal(created.ownerId, owner.user.id)
      assert.equal(created.name, 'résumé #1.txt')
      assert.equal(created.mimeType, 'application/octet-stream')
      assert.equal(created.size, 10)
      assert.equal(created.url, 'https://objects.example.test/' + created.objectKey)
      assert.match(created.objectKey, /workspaces\/.*\/files\//)
      assert.deepEqual(oss.objects.get(created.objectKey), Buffer.from('file bytes'))
      assert.equal(oss.uploaded.at(-1).mimeType, 'application/octet-stream')
      assert.equal(oss.uploaded.at(-1).fileName, 'résumé #1.txt')
      assertSafe(created)
      assert.deepEqual(await client.files.list(workspaceId), [created])
      assert.deepEqual(await client.files.get(workspaceId, id), created)
      await assert.rejects(foreignClient.files.get(workspaceId, id), (error) => error instanceof ApiError && error.statusCode === 404)
      await assert.rejects(foreignClient.files.update(workspaceId, id, { name: 'stolen' }), (error) => error instanceof ApiError && error.statusCode === 404)
      await assert.rejects(foreignClient.files.delete(workspaceId, id), (error) => error instanceof ApiError && error.statusCode === 404)
      for (const field of ['workspaceId', 'ownerId', 'mimeType', 'size', 'objectKey', 'url']) {
        const forged = await jsonRequest(baseUrl, `${route}/${id}`, 'PATCH', owner.cookie, { name: 'bad', [field]: 'attacker-value' })
        assert.equal(forged.status, 400, `${field} must be rejected`)
        assertSafe(forged.body)
      }
      const spoofedUpload = await jsonRequest(baseUrl, route, 'POST', owner.cookie, { id: 'spoof', name: 'x', objectKey: 'attacker-key' })
      assert.ok(spoofedUpload.status >= 400)
      const renamed = await client.files.update(workspaceId, id, { name: 'renamed.txt' })
      assert.equal(renamed.name, 'renamed.txt')
      assert.equal(renamed.objectKey, created.objectKey)
      assert.equal((await files.findOne({ id })).objectKey, created.objectKey)
      const sibling = await client.files.upload(workspaceId, `file-${randomUUID()}`, file())
      assert.notEqual(sibling.objectKey, created.objectKey)
      await client.files.delete(workspaceId, id)
      assert.equal(oss.objects.has(created.objectKey), false)
      assert.equal(await files.countDocuments({ id }), 0)
      await assert.rejects(client.files.get(workspaceId, id), (error) => error instanceof ApiError && error.statusCode === 404)
    })

    await t.test('Unicode file name survives HTTP upload and metadata persistence', async () => {
      const id = `file-${randomUUID()}`
      const name = '项目资料 你好.txt'
      const bytes = '中文内容 🌐'
      const created = await client.files.upload(workspaceId, id, file(name, bytes))
      assert.equal(created.name, name)
      assert.equal(created.mimeType, 'application/octet-stream')
      assert.equal(created.size, Buffer.byteLength(bytes))
      assert.deepEqual(oss.objects.get(created.objectKey), Buffer.from(bytes))
      assert.equal(oss.uploaded.at(-1).fileName, name)
      assert.ok(oss.uploaded.at(-1).unicodeName?.startsWith("UTF-8''"))
      assert.equal((await files.findOne({ id })).name, name)
      assert.deepEqual(await client.files.get(workspaceId, id), created)
      assertSafe(created)
    })

    await t.test('ASCII and emoji names reach ali-oss-server unchanged', async () => {
      for (const name of ['plain #1.txt', 'emoji 🌐.txt']) {
        const id = `file-${randomUUID()}`
        await client.files.upload(workspaceId, id, file(name, 'name check'))
        assert.equal(oss.uploaded.at(-1).fileName, name)
        assert.equal(oss.uploaded.at(-1).unicodeName === undefined, name === 'plain #1.txt')
      }
    })

    await t.test('client abort stops upstream stream and API handles the next upload', async () => {
      const id = `file-${randomUUID()}`
      const route = `${baseUrl}/api/workspaces/${workspaceId}/files`
      const controller = new AbortController()
      let releaseBody
      let sawUpstreamChunk
      const bodyRelease = new Promise((resolve) => { releaseBody = resolve })
      const upstreamChunk = new Promise((resolve) => { sawUpstreamChunk = resolve })
      const abortedBefore = oss.abortedUploads.length
      const uploadedBefore = oss.uploaded.length
      oss.onUploadChunk = sawUpstreamChunk
      const pending = fetch(route, {
        method: 'POST',
        headers: {
          cookie: owner.cookie,
          'content-type': 'application/octet-stream',
          'x-eotion-file-id': encodeURIComponent(id),
          'x-eotion-file-name': encodeURIComponent('cancel.txt'),
        },
        body: Readable.from((async function* () {
          yield Buffer.alloc(64 * 1024, 1)
          await bodyRelease
          yield Buffer.alloc(1024 * 1024, 2)
        })()),
        duplex: 'half',
        signal: controller.signal,
      })
      try {
        await Promise.race([upstreamChunk, new Promise((_, reject) => setTimeout(() => reject(new Error('upstream did not receive first chunk')), 5000))])
        controller.abort()
        releaseBody()
        await assert.rejects(pending, (error) => error.name === 'AbortError')
        await Promise.race([
          (async () => { while (oss.abortedUploads.length === abortedBefore) await new Promise((resolve) => setTimeout(resolve, 20)) })(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('upstream upload was not aborted')), 5000)),
        ])
        assert.equal(oss.uploaded.length, uploadedBefore)
        assert.ok(oss.abortedUploads.at(-1) < 1024 * 1024)
        assert.equal(await files.countDocuments({ id }), 0)
        assert.equal((await jsonRequest(baseUrl, '/api/health', 'GET')).status, 200)
        const next = await client.files.upload(workspaceId, `file-${randomUUID()}`, file('after-abort.txt'))
        assert.equal(oss.objects.has(next.objectKey), true)
      } finally {
        controller.abort()
        releaseBody()
        oss.onUploadChunk = undefined
        await pending.catch(() => {})
      }
    })

    await t.test('abort with uncertain upstream result retains object for safe reconciliation', async () => {
      const id = `file-${randomUUID()}`
      const controller = new AbortController()
      let releaseResponse
      let upstreamStored
      const responseRelease = new Promise((resolve) => { releaseResponse = resolve })
      const stored = new Promise((resolve) => { upstreamStored = resolve })
      oss.uploadResponseBarrier = () => { upstreamStored(); return responseRelease }
      const pending = client.files.upload(workspaceId, id, file('uncertain.txt'), controller.signal)
      try {
        await Promise.race([stored, new Promise((_, reject) => setTimeout(() => reject(new Error('upstream did not store object')), 5000))])
        const key = oss.uploaded.at(-1).objectKey
        const deletionsBefore = oss.deleted.length
        controller.abort()
        await assert.rejects(pending)
        releaseResponse()
        assert.equal(await files.countDocuments({ id }), 0)
        assert.equal(oss.objects.has(key), true)
        assert.equal(oss.deleted.length, deletionsBefore)
      } finally {
        controller.abort()
        releaseResponse()
        oss.uploadResponseBarrier = undefined
        await pending.catch(() => {})
      }
    })

    await t.test('disconnect during session lookup never starts an upstream upload', async () => {
      const { SessionService } = await import('../../../dist/modules/server-domain/services/session.service.js')
      const sessions = app.get(SessionService)
      const originalResolve = sessions.resolve.bind(sessions)
      let releaseLookup
      let lookupStarted
      const lookupRelease = new Promise((resolve) => { releaseLookup = resolve })
      const started = new Promise((resolve) => { lookupStarted = resolve })
      sessions.resolve = async (...args) => {
        lookupStarted()
        await lookupRelease
        return originalResolve(...args)
      }
      const controller = new AbortController()
      const uploadsBefore = oss.uploaded.length
      const pending = fetch(`${baseUrl}/api/workspaces/${workspaceId}/files`, {
        method: 'POST',
        headers: {
          cookie: owner.cookie,
          'content-type': 'application/octet-stream',
          'x-eotion-file-id': encodeURIComponent(`file-${randomUUID()}`),
          'x-eotion-file-name': encodeURIComponent('early-abort.txt'),
        },
        body: Buffer.from('complete request body'),
        signal: controller.signal,
      })
      try {
        await Promise.race([started, new Promise((_, reject) => setTimeout(() => reject(new Error('session lookup did not start')), 5000))])
        controller.abort()
        await assert.rejects(pending, (error) => error.name === 'AbortError')
        releaseLookup()
        await new Promise((resolve) => setTimeout(resolve, 100))
        assert.equal(oss.uploaded.length, uploadsBefore)
      } finally {
        controller.abort()
        releaseLookup()
        sessions.resolve = originalResolve
        await pending.catch(() => {})
      }
      assert.equal((await jsonRequest(baseUrl, '/api/health', 'GET')).status, 200)
    })

    await t.test('forged MIME headers cannot turn untrusted bytes into active content', async () => {
      for (const claimedMime of ['text/html', 'image/png']) {
        const id = `file-${randomUUID()}`
        const response = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/files`, {
          method: 'POST',
          headers: {
            cookie: owner.cookie,
            'content-type': 'application/octet-stream',
            'x-eotion-file-id': encodeURIComponent(id),
            'x-eotion-file-name': encodeURIComponent('payload.bin'),
            'x-eotion-file-mime-type': encodeURIComponent(claimedMime),
          },
          body: Buffer.from('<script>alert(1)</script>'),
        })
        assert.equal(response.status, 201)
        const record = await response.json()
        assert.equal(record.mimeType, 'application/octet-stream')
        assert.equal((await files.findOne({ id })).mimeType, 'application/octet-stream')
        assert.equal(oss.uploaded.at(-1).mimeType, 'application/octet-stream')
        assertSafe(record)
      }
    })

    await t.test('dot-segment file ID produces a safe namespace and uploads successfully', async () => {
      const created = await client.files.upload(workspaceId, '.', file('dot.txt', 'dot ID'))
      assert.equal(created.id, '.')
      assert.ok(created.objectKey.split('/').every((segment) => segment !== '.' && segment !== '..'))
      assert.deepEqual(oss.objects.get(created.objectKey), Buffer.from('dot ID'))
      assert.equal((await files.findOne({ id: '.' })).objectKey, created.objectKey)
    })

    await t.test('upload failure leaves no metadata; Mongo failure cleans up exactly this upload', async () => {
      const id = `file-${randomUUID()}`
      oss.failUpload = true
      await assert.rejects(client.files.upload(workspaceId, id, file()))
      oss.failUpload = false
      assert.equal(await files.countDocuments({ id }), 0)
      const existing = await client.files.upload(workspaceId, id, file('same.txt', 'first object'))
      const deletionsBefore = oss.deleted.length
      await assert.rejects(client.files.upload(workspaceId, id, file('same.txt', 'second object')))
      assert.equal(await files.countDocuments({ id }), 1)
      assert.equal(oss.objects.has(existing.objectKey), true)
      assert.equal(oss.deleted.length, deletionsBefore + 1)
      assert.notEqual(oss.deleted.at(-1), existing.objectKey)
      assert.equal(oss.objects.has(oss.deleted.at(-1)), false)
    })

    await t.test('metadata create failure after upload cleans only its returned object key', async () => {
      const id = `file-${randomUUID()}`
      const { FileMetadataRepository } = await import('../../../dist/modules/server-domain/repositories/file-metadata.repository.js')
      const repository = app.get(FileMetadataRepository)
      const originalCreate = repository.create.bind(repository)
      repository.create = async () => { throw new Error('synthetic Mongo create failure') }
      const previousUploads = oss.uploaded.length
      const previousDeletes = oss.deleted.length
      try {
        await assert.rejects(client.files.upload(workspaceId, id, file()))
      } finally {
        repository.create = originalCreate
      }
      assert.equal(await files.countDocuments({ id }), 0)
      assert.equal(oss.uploaded.length, previousUploads + 1)
      const uploadedKey = oss.uploaded.at(-1).objectKey
      assert.equal(oss.deleted.length, previousDeletes + 1)
      assert.equal(oss.deleted.at(-1), uploadedKey)
      assert.equal(oss.objects.has(uploadedKey), false)
    })

    await t.test('post-write repository error never deletes the persisted object', async () => {
      const id = `file-${randomUUID()}`
      const { FileMetadataRepository } = await import('../../../dist/modules/server-domain/repositories/file-metadata.repository.js')
      const repository = app.get(FileMetadataRepository)
      const originalCreate = repository.create.bind(repository)
      repository.create = async (input) => {
        await originalCreate(input)
        throw new Error('synthetic error after Mongo acknowledgement')
      }
      const deletionsBefore = oss.deleted.length
      let result
      try {
        result = await client.files.upload(workspaceId, id, file('post-write.txt', 'still present')).catch((error) => error)
      } finally {
        repository.create = originalCreate
      }
      const stored = await files.findOne({ id })
      assert.ok(stored, 'Mongo metadata was committed before the synthetic error')
      assert.equal(oss.objects.has(stored.objectKey), true)
      assert.deepEqual(oss.objects.get(stored.objectKey), Buffer.from('still present'))
      assert.equal(oss.deleted.length, deletionsBefore)
      if (result instanceof Error) {
        assert.ok(result instanceof ApiError)
        assert.ok(result.statusCode >= 400)
        assertSafe(result.details)
      } else {
        assert.equal(result.id, id)
        assert.equal(result.objectKey, stored.objectKey)
        assertSafe(result)
      }
    })

    await t.test('uncertain metadata outcome retains object and returns a safe error', async () => {
      const id = `file-${randomUUID()}`
      const { FileMetadataRepository } = await import('../../../dist/modules/server-domain/repositories/file-metadata.repository.js')
      const repository = app.get(FileMetadataRepository)
      const originalCreate = repository.create.bind(repository)
      const originalFind = repository.findInWorkspace.bind(repository)
      repository.create = async (input) => {
        await originalCreate(input)
        throw new Error('synthetic acknowledgement error')
      }
      repository.findInWorkspace = async () => { throw new Error('synthetic readback error') }
      const deletionsBefore = oss.deleted.length
      let error
      try {
        error = await client.files.upload(workspaceId, id, file()).catch((caught) => caught)
      } finally {
        repository.create = originalCreate
        repository.findInWorkspace = originalFind
      }
      assert.ok(error instanceof ApiError)
      assert.equal(error.statusCode, 503)
      assertSafe(error.details)
      const stored = await files.findOne({ id })
      assert.ok(stored)
      assert.equal(oss.objects.has(stored.objectKey), true)
      assert.equal(oss.deleted.length, deletionsBefore)
    })

    await t.test('upload size limit rejects before storage or metadata write', async () => {
      const id = `file-${randomUUID()}`
      const previousLimit = process.env.ALI_OSS_MAX_UPLOAD_BYTES
      process.env.ALI_OSS_MAX_UPLOAD_BYTES = '4'
      const previousUploads = oss.uploaded.length
      try {
        await assert.rejects(client.files.upload(workspaceId, id, file()), (error) => error instanceof ApiError && error.statusCode === 413)
      } finally {
        if (previousLimit === undefined) delete process.env.ALI_OSS_MAX_UPLOAD_BYTES
        else process.env.ALI_OSS_MAX_UPLOAD_BYTES = previousLimit
      }
      assert.equal(oss.uploaded.length, previousUploads)
      assert.equal(await files.countDocuments({ id }), 0)
    })

    await t.test('missing OSS configuration leaves health and workspace API available', async () => {
      const configured = Object.fromEntries(['ALI_OSS_SERVER_URL', 'ALI_OSS_CLIENT_ID', 'ALI_OSS_CLIENT_SECRET'].map((key) => [key, process.env[key]]))
      for (const key of Object.keys(configured)) delete process.env[key]
      let unconfiguredApp
      try {
        const { AppModule } = await import('../../../dist/app.module.js')
        unconfiguredApp = await NestFactory.create(AppModule, new FastifyAdapter(), { logger: false })
        unconfiguredApp.setGlobalPrefix('api')
        await unconfiguredApp.listen(0, '127.0.0.1')
        const unconfiguredAddress = unconfiguredApp.getHttpServer().address()
        assert.ok(unconfiguredAddress && typeof unconfiguredAddress === 'object')
        const unconfiguredUrl = `http://127.0.0.1:${unconfiguredAddress.port}`
        assert.equal((await jsonRequest(unconfiguredUrl, '/api/health', 'GET')).status, 200)
        const localOwner = await session(unconfiguredUrl, `no-oss-${randomUUID()}@example.test`)
        const localClient = clientWithCookie(unconfiguredUrl, localOwner.cookie)
        const localWorkspaceId = `ws-${randomUUID()}`
        await localClient.workspaces.create({ id: localWorkspaceId, name: 'Works without OSS' })
        const unavailable = (error) => error instanceof ApiError && error.statusCode === 503
        const localFileId = `file-${randomUUID()}`
        await assert.rejects(localClient.files.upload(localWorkspaceId, localFileId, file()), unavailable)
        await assert.rejects(localClient.files.list(localWorkspaceId), unavailable)
        await assert.rejects(localClient.files.get(localWorkspaceId, localFileId), unavailable)
        await assert.rejects(localClient.files.update(localWorkspaceId, localFileId, { name: 'rename.txt' }), unavailable)
        await assert.rejects(localClient.files.delete(localWorkspaceId, localFileId), unavailable)
        assert.equal((await localClient.workspaces.get(localWorkspaceId)).name, 'Works without OSS')
      } finally {
        await unconfiguredApp?.close()
        for (const [key, value] of Object.entries(configured)) {
          if (value === undefined) delete process.env[key]
          else process.env[key] = value
        }
      }
    })

    await t.test('client ID equal to object prefix avoids duplicate upstream namespace', async () => {
      const previousClientId = process.env.ALI_OSS_CLIENT_ID
      const previousPrefix = process.env.ALI_OSS_OBJECT_PREFIX
      process.env.ALI_OSS_CLIENT_ID = 'eotion'
      process.env.ALI_OSS_OBJECT_PREFIX = 'eotion'
      let matchingApp
      try {
        const { AppModule } = await import('../../../dist/app.module.js')
        matchingApp = await NestFactory.create(AppModule, new FastifyAdapter(), { logger: false })
        matchingApp.setGlobalPrefix('api')
        await matchingApp.listen(0, '127.0.0.1')
        const matchingAddress = matchingApp.getHttpServer().address()
        assert.ok(matchingAddress && typeof matchingAddress === 'object')
        const matchingUrl = `http://127.0.0.1:${matchingAddress.port}`
        const matchingOwner = await session(matchingUrl, `matching-prefix-${randomUUID()}@example.test`)
        const matchingClient = clientWithCookie(matchingUrl, matchingOwner.cookie)
        const matchingWorkspaceId = `ws-${randomUUID()}`
        const id = `file-${randomUUID()}`
        await matchingClient.workspaces.create({ id: matchingWorkspaceId, name: 'Matching namespace' })
        const record = await matchingClient.files.upload(matchingWorkspaceId, id, file('prefix.txt', 'one prefix'))
        assert.ok(record.objectKey.startsWith('eotion/'))
        assert.ok(!record.objectKey.startsWith('eotion/eotion/'))
        assert.equal((await files.findOne({ id })).objectKey, record.objectKey)
        assert.deepEqual(oss.objects.get(record.objectKey), Buffer.from('one prefix'))
        assertSafe(record)
      } finally {
        await matchingApp?.close()
        if (previousClientId === undefined) delete process.env.ALI_OSS_CLIENT_ID
        else process.env.ALI_OSS_CLIENT_ID = previousClientId
        if (previousPrefix === undefined) delete process.env.ALI_OSS_OBJECT_PREFIX
        else process.env.ALI_OSS_OBJECT_PREFIX = previousPrefix
      }
    })

    await t.test('cleanup failure is visible without leaking credentials', async () => {
      const id = `file-${randomUUID()}`
      const existing = await client.files.upload(workspaceId, id, file())
      oss.failDelete = true
      const response = await jsonRequest(baseUrl, `/api/workspaces/${workspaceId}/files`, 'POST', owner.cookie, undefined, {
        'content-type': 'application/octet-stream', 'x-eotion-file-id': id, 'x-eotion-file-name': 'again.txt', 'x-eotion-file-mime-type': 'text%2Fplain',
      })
      oss.failDelete = false
      assert.ok(response.status >= 400)
      assert.match(response.raw, /cleanup|delete|storage|object/i)
      assertSafe(response.body)
      assert.equal((await files.findOne({ id })).objectKey, existing.objectKey)
      assert.equal(oss.objects.has(existing.objectKey), true)
    })

    await t.test('OSS delete failure retains metadata and retry completes', async () => {
      const id = `file-${randomUUID()}`
      const created = await client.files.upload(workspaceId, id, file())
      oss.failDelete = true
      const failed = await jsonRequest(baseUrl, `/api/workspaces/${workspaceId}/files/${id}`, 'DELETE', owner.cookie)
      oss.failDelete = false
      assert.ok(failed.status >= 400)
      assertSafe(failed.body)
      assert.equal((await files.findOne({ id })).objectKey, created.objectKey)
      assert.equal(oss.objects.has(created.objectKey), true)
      await client.files.delete(workspaceId, id)
      assert.equal(await files.countDocuments({ id }), 0)
      assert.equal(oss.objects.has(created.objectKey), false)
    })

    await t.test('Mongo delete failure after OSS success remains retryable', async () => {
      const id = `file-${randomUUID()}`
      const created = await client.files.upload(workspaceId, id, file())
      const { FileMetadataRepository } = await import('../../../dist/modules/server-domain/repositories/file-metadata.repository.js')
      const repository = app.get(FileMetadataRepository)
      const originalDelete = repository.deleteInWorkspace.bind(repository)
      repository.deleteInWorkspace = async () => { throw new Error('synthetic Mongo delete failure') }
      try {
        await assert.rejects(client.files.delete(workspaceId, id))
      } finally {
        repository.deleteInWorkspace = originalDelete
      }
      assert.equal((await files.findOne({ id })).objectKey, created.objectKey)
      assert.equal(oss.objects.has(created.objectKey), false)
      await client.files.delete(workspaceId, id)
      assert.equal(await files.countDocuments({ id }), 0)
      assert.equal(oss.deleted.filter((key) => key === created.objectKey).length, 2)
    })

    await t.test('stale concurrent delete cannot remove a replacement with the same file ID', async () => {
      const id = `file-${randomUUID()}`
      const original = await client.files.upload(workspaceId, id, file('original.txt', 'object A'))
      const { FileMetadataRepository } = await import('../../../dist/modules/server-domain/repositories/file-metadata.repository.js')
      const repository = app.get(FileMetadataRepository)
      const originalDelete = repository.deleteInWorkspace.bind(repository)
      let enterPausedDelete
      let releasePausedDelete
      const pausedDeleteEntered = new Promise((resolve) => { enterPausedDelete = resolve })
      const pausedDeleteRelease = new Promise((resolve) => { releasePausedDelete = resolve })
      let first = true
      repository.deleteInWorkspace = async (...args) => {
        if (first) {
          first = false
          enterPausedDelete()
          await pausedDeleteRelease
        }
        return originalDelete(...args)
      }
      let timeout
      try {
        const staleDelete = client.files.delete(workspaceId, id).then(
          () => null,
          (error) => error,
        )
        await Promise.race([
          pausedDeleteEntered,
          new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('first delete did not reach Mongo barrier')), 5000) }),
        ])
        await client.files.delete(workspaceId, id)
        assert.equal(await files.countDocuments({ id }), 0)
        assert.equal(oss.objects.has(original.objectKey), false)
        const replacement = await client.files.upload(workspaceId, id, file('replacement.txt', 'object B'))
        assert.notEqual(replacement.objectKey, original.objectKey)
        releasePausedDelete()
        const staleOutcome = await staleDelete
        if (staleOutcome !== null) {
          assert.ok(staleOutcome instanceof ApiError)
          assert.ok(staleOutcome.statusCode >= 400)
          assertSafe(staleOutcome.details)
        }
        assert.equal((await files.findOne({ id })).objectKey, replacement.objectKey)
        assert.equal(oss.objects.has(replacement.objectKey), true)
        assert.deepEqual(oss.objects.get(replacement.objectKey), Buffer.from('object B'))
      } finally {
        clearTimeout(timeout)
        releasePausedDelete()
        repository.deleteInWorkspace = originalDelete
      }
    })

    await t.test('concurrent duplicate file IDs never delete the winning object', async () => {
      const id = `file-${randomUUID()}`
      const results = await Promise.allSettled([
        client.files.upload(workspaceId, id, file('same.txt', 'first concurrent')),
        client.files.upload(workspaceId, id, file('same.txt', 'second concurrent')),
      ])
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
      assert.equal(results.filter((result) => result.status === 'rejected').length, 1)
      const winner = results.find((result) => result.status === 'fulfilled').value
      assert.equal((await files.findOne({ id })).objectKey, winner.objectKey)
      assert.equal(oss.objects.has(winner.objectKey), true)
      assert.equal(oss.uploaded.filter((entry) => entry.objectKey === winner.objectKey).length, 1)
      assert.ok(oss.deleted.every((key) => key !== winner.objectKey))
    })
  } finally {
    try { await connection?.dropDatabase() }
    finally { await app?.close() }
    oss.server.close()
    await once(oss.server, 'close')
    for (const [key, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
