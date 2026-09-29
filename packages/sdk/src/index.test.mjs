import assert from 'node:assert/strict'
import { test } from 'node:test'
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
