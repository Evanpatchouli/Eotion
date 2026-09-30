import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FileUpdateRequestSchema, FileUploadMetadataSchema, PageMoveRequestSchema, SyncOperationSchema, WorkspaceSnapshotResponseSchema } from '@eotion/contracts'
import { ApiError, EotionApiClient, EotionOperationTransport } from './index.ts'

test('login sends JSON to the auth endpoint with session credentials enabled', async () => {
  let request
  const client = new EotionApiClient({
    baseUrl: 'https://eotion.test/',
    fetch: async (input, init) => {
      request = new Request(input, init)
      return Response.json({
        user: { id: 'user-1', email: 'a@example.com', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
        expiresAt: '2026-01-02T00:00:00.000Z',
      })
    },
  })

  await client.auth.login({ email: 'a@example.com', password: 'secret' })

  assert.ok(request)
  assert.equal(request.url, 'https://eotion.test/api/auth/login')
  assert.equal(request.method, 'POST')
  assert.equal(request.credentials, 'include')
  assert.deepEqual(await request.json(), { email: 'a@example.com', password: 'secret' })
})

test('API error responses become ApiError values carrying the server status', async () => {
  const client = new EotionApiClient({
    baseUrl: 'https://eotion.test',
    fetch: async () => Response.json({ statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' }, { status: 401 }),
  })

  await assert.rejects(client.auth.me(), (error) => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.statusCode, 401)
    assert.equal(error.message, 'Unauthorized')
    return true
  })
})

test('logout accepts the API 204 response', async () => {
  let credentials
  const client = new EotionApiClient({
    baseUrl: 'https://eotion.test',
    fetch: async (_input, init) => {
      credentials = init?.credentials
      return new Response(null, { status: 204 })
    },
  })

  assert.equal(await client.auth.logout(), undefined)
  assert.equal(credentials, 'include')
})

test('file upload sends a raw File body and encoded metadata headers', async () => {
  let request
  let forwardedSignal
  const fileRecord = {
    id: 'file/1', workspaceId: 'workspace-1', ownerId: 'user-1', name: 'résumé #1.png',
    mimeType: 'image/png', size: 3, objectKey: 'workspaces/workspace-1/files/file-1/unique',
    url: 'https://objects.example/file', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }
  const controller = new AbortController()
  const file = new File(['abc'], 'résumé #1.png', { type: 'image/png' })
  const client = new EotionApiClient({
    baseUrl: 'https://eotion.test/',
    fetch: async (input, init) => {
      request = new Request(input, init)
      forwardedSignal = init.signal
      return Response.json(fileRecord)
    },
  })

  const uploaded = await client.files.upload('workspace 1', 'file/1', file, controller.signal)

  assert.deepEqual(uploaded, fileRecord)
  assert.equal(request.url, 'https://eotion.test/api/workspaces/workspace%201/files')
  assert.equal(request.method, 'POST')
  assert.equal(request.credentials, 'include')
  assert.equal(request.headers.get('content-type'), 'application/octet-stream')
  assert.equal(request.headers.get('x-eotion-file-id'), 'file%2F1')
  assert.equal(request.headers.get('x-eotion-file-name'), 'r%C3%A9sum%C3%A9%20%231.png')
  assert.equal(request.headers.has('x-eotion-file-mime-type'), false)
  assert.deepEqual(new Uint8Array(await request.arrayBuffer()), new Uint8Array([97, 98, 99]))
  assert.equal(forwardedSignal, controller.signal)
})

test('file metadata APIs use workspace routes, credentials, abort signals, and accept DELETE 204', async () => {
  const calls = []
  const signals = []
  const fileRecord = {
    id: 'file-1', workspaceId: 'workspace-1', ownerId: 'user-1', name: 'renamed.txt',
    mimeType: 'text/plain', size: 3, objectKey: 'workspaces/workspace-1/files/file-1/unique',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }
  const controller = new AbortController()
  const client = new EotionApiClient({
    baseUrl: 'https://eotion.test',
    fetch: async (input, init) => {
      const request = new Request(input, init)
      calls.push(request)
      signals.push(init.signal)
      return request.method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json(request.method === 'GET' && request.url.endsWith('/files') ? [fileRecord] : fileRecord)
    },
  })

  assert.deepEqual(await client.files.list('workspace-1', controller.signal), [fileRecord])
  assert.deepEqual(await client.files.get('workspace-1', 'file/1', controller.signal), fileRecord)
  assert.deepEqual(await client.files.update('workspace-1', 'file/1', { name: 'renamed.txt' }, controller.signal), fileRecord)
  assert.equal(await client.files.delete('workspace-1', 'file/1', controller.signal), undefined)
  assert.deepEqual(calls.map((request) => [request.method, new URL(request.url).pathname]), [
    ['GET', '/api/workspaces/workspace-1/files'],
    ['GET', '/api/workspaces/workspace-1/files/file%2F1'],
    ['PATCH', '/api/workspaces/workspace-1/files/file%2F1'],
    ['DELETE', '/api/workspaces/workspace-1/files/file%2F1'],
  ])
  for (const request of calls) assert.equal(request.credentials, 'include')
  assert.deepEqual(await calls[2].json(), { name: 'renamed.txt' })
  assert.equal(signals[0], controller.signal)
})

test('page move and delete use the dedicated move route and accept DELETE 204', async () => {
  const calls = []
  const pageRecord = {
    id: 'page-1', workspaceId: 'workspace-1', parentPageId: 'page-2', title: 'Page',
    icon: null, orderKey: 'c', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }
  const client = new EotionApiClient({
    baseUrl: 'https://eotion.test',
    fetch: async (input, init) => {
      const request = new Request(input, init)
      calls.push(request)
      return request.method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json(pageRecord)
    },
  })

  assert.deepEqual(await client.pages.move('workspace 1', 'page/1', { parentPageId: 'page-2', orderKey: 'c' }), pageRecord)
  assert.equal(await client.pages.delete('workspace 1', 'page/1'), undefined)

  assert.deepEqual(calls.map((request) => [request.method, new URL(request.url).pathname]), [
    ['PATCH', '/api/workspaces/workspace%201/pages/page%2F1/move'],
    ['DELETE', '/api/workspaces/workspace%201/pages/page%2F1'],
  ])
  for (const request of calls) assert.equal(request.credentials, 'include')
  assert.deepEqual(await calls[0].json(), { parentPageId: 'page-2', orderKey: 'c' })
})

test('page move schema requires a nullable parent and rejects server-managed fields', () => {
  assert.deepEqual(PageMoveRequestSchema.parse({ parentPageId: null, orderKey: 'c' }), { parentPageId: null, orderKey: 'c' })
  assert.equal(PageMoveRequestSchema.safeParse({ parentPageId: 'page-1' }).success, false)
  assert.equal(PageMoveRequestSchema.safeParse({ parentPageId: 'page-1', orderKey: 'c' }).success, true)
  for (const forged of [{ orderKey: 'c', workspaceId: 'ws-1' }, { orderKey: 'c', id: 'page-9' }, { orderKey: 'c', title: 'Renamed' }]) {
    assert.equal(PageMoveRequestSchema.safeParse({ parentPageId: null, ...forged }).success, false)
  }
})

test('block delete encodes all scoped IDs, includes credentials, forwards abort signal, and accepts 204', async () => {
  let request
  let signal
  const controller = new AbortController()
  const client = new EotionApiClient({
    baseUrl: 'https://eotion.test/',
    fetch: async (input, init) => {
      request = new Request(input, init)
      signal = init.signal
      return new Response(null, { status: 204 })
    },
  })

  assert.equal(await client.blocks.delete('workspace 1', 'page/1', 'block#1', controller.signal), undefined)
  assert.equal(request.url, 'https://eotion.test/api/workspaces/workspace%201/pages/page%2F1/blocks/block%231')
  assert.equal(request.method, 'DELETE')
  assert.equal(request.credentials, 'include')
  assert.equal(signal, controller.signal)
})

test('file request schemas reject client supplied server-managed metadata', () => {
  assert.deepEqual(FileUploadMetadataSchema.parse({ id: 'file-1', name: 'a.txt' }), {
    id: 'file-1', name: 'a.txt',
  })
  assert.equal(FileUploadMetadataSchema.safeParse({
    id: 'file-1', name: 'a.txt', mimeType: 'image/png', workspaceId: 'workspace-1', objectKey: 'client-key',
  }).success, false)
  assert.deepEqual(FileUpdateRequestSchema.parse({ name: 'renamed.txt' }), { name: 'renamed.txt' })
  for (const field of ['objectKey', 'ownerId', 'workspaceId', 'url', 'size', 'mimeType']) {
    assert.equal(FileUpdateRequestSchema.safeParse({ name: 'renamed.txt', [field]: 'forged' }).success, false)
  }
  assert.equal(FileUpdateRequestSchema.safeParse({}).success, false)
})

test('sync transport sends canonical operation without local status and rejects legacy oplog', async () => {
  const requests = []
  const client = new EotionApiClient({
    baseUrl: 'https://eotion.test',
    fetch: async (input, init) => {
      requests.push(new Request(input, init))
      return Response.json({ id: 'op-1', applied: true })
    },
  })
  const transport = new EotionOperationTransport(client)
  const operation = {
    id: 'op-1', clientId: 'client-1', sequence: 3, workspaceId: 'ws-1',
    createdAt: '2026-01-01T00:00:00.000Z', kind: 'page.upsert',
    payload: { id: 'page-1', parentPageId: null, title: 'Page', icon: null, orderKey: 'a' },
    status: 'pending',
  }
  await transport.send(operation)
  assert.equal(requests[0].url, 'https://eotion.test/api/sync/operations')
  assert.equal(requests[0].credentials, 'include')
  assert.deepEqual(await requests[0].json(), (({ status, ...wire }) => wire)(operation))
  await assert.rejects(transport.send({ ...operation, workspaceId: undefined }))
  assert.equal(requests.length, 1)
})

test('sync snapshot uses the scoped read route with session credentials and abort signal', async () => {
  let request
  let signal
  const controller = new AbortController()
  const snapshot = { pages: [], blocks: [] }
  const client = new EotionApiClient({
    baseUrl: 'https://eotion.test/',
    fetch: async (input, init) => {
      request = new Request(input, init)
      signal = init.signal
      return Response.json(snapshot)
    },
  })

  assert.deepEqual(await client.sync.snapshot('workspace/1', controller.signal), snapshot)
  assert.equal(request.url, 'https://eotion.test/api/sync/workspaces/workspace%2F1/snapshot')
  assert.equal(request.method, 'GET')
  assert.equal(request.credentials, 'include')
  assert.equal(signal, controller.signal)
  assert.deepEqual(WorkspaceSnapshotResponseSchema.parse(snapshot), snapshot)
})

test('page.move is a strict canonical sync operation and transport preserves its ID', async () => {
  const requests = []
  const client = new EotionApiClient({
    baseUrl: 'https://eotion.test',
    fetch: async (input, init) => {
      requests.push(new Request(input, init))
      return Response.json({ id: 'move-op', applied: true })
    },
  })
  const operation = {
    id: 'move-op', clientId: 'client-1', sequence: 4, workspaceId: 'ws-1',
    createdAt: '2026-01-01T00:00:00.000Z', kind: 'page.move',
    payload: { id: 'page-1', parentPageId: null, orderKey: 'z' },
    status: 'pending',
  }
  await new EotionOperationTransport(client).send(operation)
  const { status: _status, ...wire } = operation
  assert.deepEqual(await requests[0].json(), wire)
  assert.equal(SyncOperationSchema.safeParse(wire).success, true)
  assert.equal(SyncOperationSchema.safeParse({ ...wire, payload: { ...wire.payload, title: 'forged' } }).success, false)
})
