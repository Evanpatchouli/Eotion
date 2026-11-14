import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError, EotionApiClient } from './index.ts'

const timestamp = '2026-11-15T00:00:00.000Z'
const response = {
  database: { id: 'db/1', workspaceId: 'workspace/1', name: 'Tasks', version: 3, createdAt: timestamp, updatedAt: timestamp },
  view: {
    id: 'view#1', databaseId: 'db/1', workspaceId: 'workspace/1', name: 'All tasks', type: 'table',
    config: { filters: [], sorts: [], visibleProperties: null, propertyOrder: null },
    version: 2, createdAt: timestamp, updatedAt: timestamp,
  },
}
const input = {
  recordId: 'record/1',
  anchorRecordId: 'record#2',
  placement: 'after',
  expectedDatabaseVersion: 3,
  expectedViewVersion: 2,
}

test('view record reorder uses the scoped JSON route, forwards signal, and parses the response', async () => {
  const calls = []
  const controller = new AbortController()
  const client = new EotionApiClient({
    baseUrl: 'https://eotion.test/',
    fetch: async (url, init) => {
      calls.push({ url, init, request: new Request(url, init) })
      return Response.json(response)
    },
  })

  assert.deepEqual(await client.databases.reorderDatabaseViewRecord('workspace/1', 'db/1', 'view#1', input, controller.signal), response)
  assert.equal(calls[0].url, 'https://eotion.test/api/workspaces/workspace%2F1/databases/db%2F1/views/view%231/record-order')
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(calls[0].init.signal, controller.signal)
  assert.equal(calls[0].init.credentials, 'include')
  assert.deepEqual(await calls[0].request.json(), input)
})

test('view record reorder rejects invalid input and malformed responses, and preserves API errors', async () => {
  let calls = 0
  const client = new EotionApiClient({
    baseUrl: 'https://eotion.test',
    fetch: async () => {
      calls += 1
      return Response.json(response)
    },
  })
  await assert.rejects(client.databases.reorderDatabaseViewRecord('ws-1', 'db-1', 'view-1', { ...input, recordId: input.anchorRecordId }))
  assert.equal(calls, 0)
  const invalidResponseClient = new EotionApiClient({
    baseUrl: 'https://eotion.test',
    fetch: async () => Response.json({ ...response, view: { ...response.view, version: 0 } }),
  })
  await assert.rejects(invalidResponseClient.databases.reorderDatabaseViewRecord('ws-1', 'db-1', 'view-1', input))

  const failureClient = new EotionApiClient({
    baseUrl: 'https://eotion.test',
    fetch: async () => Response.json({ statusCode: 409, message: 'Version conflict', error: 'Conflict' }, { status: 409 }),
  })
  await assert.rejects(failureClient.databases.reorderDatabaseViewRecord('ws-1', 'db-1', 'view-1', input), error => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.statusCode, 409)
    assert.equal(error.message, 'Version conflict')
    return true
  })
})

test('view record reorder rejects valid responses from a different view or database', async () => {
  const cases = [
    { ...response, view: { ...response.view, id: 'other-view' } },
    { ...response, database: { ...response.database, id: 'other-db' }, view: { ...response.view, databaseId: 'other-db' } },
  ]
  for (const body of cases) {
    const client = new EotionApiClient({ baseUrl: 'https://eotion.test', fetch: async () => Response.json(body) })
    await assert.rejects(client.databases.reorderDatabaseViewRecord('workspace/1', 'db/1', 'view#1', input), TypeError)
  }
})
