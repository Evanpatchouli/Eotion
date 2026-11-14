import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError, EotionApiClient } from './index.ts'

const timestamp = '2026-11-15T00:00:00.000Z'
const database = { id: 'db/1', workspaceId: 'ws/1', name: 'Tasks', version: 3, createdAt: timestamp, updatedAt: timestamp }
const view = { id: 'view#1', databaseId: 'db/1', workspaceId: 'ws/1', name: 'Timeline', type: 'timeline',
  config: { filters: [], sorts: [], visibleProperties: null, propertyOrder: null, options: { groupByPropertyId: 'status' } },
  version: 2, createdAt: timestamp, updatedAt: timestamp }
const title = { id: 'title', databaseId: 'db/1', workspaceId: 'ws/1', name: 'Name', type: 'title', version: 1, createdAt: timestamp, updatedAt: timestamp }
const select = { id: 'status', databaseId: 'db/1', workspaceId: 'ws/1', name: 'Status', type: 'select', options: [{ id: 'open/1', name: 'Open' }, { id: 'closed', name: 'Closed' }], version: 1, createdAt: timestamp, updatedAt: timestamp }
const record = { id: 'row/1', databaseId: 'db/1', workspaceId: 'ws/1', pageId: 'page/1', properties: { title: 'Task', status: 'open/1' }, version: 1, createdAt: timestamp, updatedAt: timestamp, pageVersion: timestamp }
const groupResponse = { database, view, properties: [title, select], records: [record], nextCursor: null, group: { kind: 'option', optionId: 'open/1' } }

test('group records GET encodes option and cursor, forwards signal, and parses response', async () => {
  const calls = []
  const controller = new AbortController()
  const client = new EotionApiClient({ baseUrl: 'https://eotion.test/', fetch: async (url, init) => {
    calls.push({ url, init })
    return Response.json(groupResponse)
  } })
  assert.deepEqual(await client.databases.getDatabaseViewGroupRecords('ws/1', 'db/1', 'view#1', { kind: 'option', optionId: 'open/1' }, { limit: 25, cursor: 'opaque/+==' }, controller.signal), groupResponse)
  assert.equal(calls[0].init.method, 'GET')
  assert.equal(calls[0].init.signal, controller.signal)
  assert.equal(calls[0].init.credentials, 'include')
  const url = new URL(calls[0].url)
  assert.equal(url.pathname, '/api/workspaces/ws%2F1/databases/db%2F1/views/view%231/group-records')
  assert.deepEqual([...url.searchParams.entries()], [['groupKind', 'option'], ['optionId', 'open/1'], ['limit', '25'], ['cursor', 'opaque/+==']])
})

test('group records rejects invalid keys before fetch and invalid response after fetch', async () => {
  let calls = 0
  const client = new EotionApiClient({ baseUrl: 'https://eotion.test', fetch: async () => { calls++; return Response.json(groupResponse) } })
  await assert.rejects(client.databases.getDatabaseViewGroupRecords('ws', 'db', 'view', { kind: 'ungrouped', optionId: 'open' }))
  await assert.rejects(client.databases.getDatabaseViewGroupRecords('ws', 'db', 'view', { kind: 'option', optionId: 'open' }, { limit: 101 }))
  assert.equal(calls, 0)
  const invalid = new EotionApiClient({ baseUrl: 'https://eotion.test', fetch: async () => Response.json({ ...groupResponse, group: { kind: 'ungrouped' } }) })
  await assert.rejects(invalid.databases.getDatabaseViewGroupRecords('ws', 'db', 'view', { kind: 'option', optionId: 'open/1' }))
})

test('group records rejects valid but mismatched view, database, workspace, or group responses', async () => {
  const cases = [
    { ...groupResponse, view: { ...view, id: 'other-view' } },
    { ...groupResponse, database: { ...database, id: 'other-db' }, view: { ...view, databaseId: 'other-db' },
      properties: [title, select].map(property => ({ ...property, databaseId: 'other-db' })), records: [{ ...record, databaseId: 'other-db' }] },
    { ...groupResponse, database: { ...database, workspaceId: 'other-ws' }, view: { ...view, workspaceId: 'other-ws' },
      properties: [title, select].map(property => ({ ...property, workspaceId: 'other-ws' })), records: [{ ...record, workspaceId: 'other-ws' }] },
    { ...groupResponse, records: [], group: { kind: 'option', optionId: 'closed' } },
  ]
  for (const response of cases) {
    const client = new EotionApiClient({ baseUrl: 'https://eotion.test', fetch: async () => Response.json(response) })
    await assert.rejects(client.databases.getDatabaseViewGroupRecords('ws/1', 'db/1', 'view#1', { kind: 'option', optionId: 'open/1' }), TypeError)
  }
})

test('ungrouped query omits optionId and accepts an empty group window', async () => {
  let requested
  const client = new EotionApiClient({ baseUrl: 'https://eotion.test', fetch: async url => {
    requested = new URL(url)
    return Response.json({ ...groupResponse, group: { kind: 'ungrouped' }, records: [] })
  } })
  const result = await client.databases.getDatabaseViewGroupRecords('ws/1', 'db/1', 'view#1', { kind: 'ungrouped' })
  assert.deepEqual(result.group, { kind: 'ungrouped' })
  assert.equal(requested.searchParams.get('groupKind'), 'ungrouped')
  assert.equal(requested.searchParams.has('optionId'), false)
})

test('cross-group move validates request, posts scoped JSON, parses response and preserves API errors', async () => {
  const calls = []
  const response = { database, view, record: { ...record, properties: { title: 'Task', status: null } } }
  const client = new EotionApiClient({ baseUrl: 'https://eotion.test', fetch: async (url, init) => {
    calls.push(new Request(url, init))
    return Response.json(response)
  } })
  const input = { recordId: 'row/1', sourceGroup: { kind: 'option', optionId: 'open/1' }, targetGroup: { kind: 'ungrouped' },
    anchorRecordId: 'row/2', placement: 'after', expectedDatabaseVersion: 3, expectedViewVersion: 2, expectedRecordVersion: 1 }
  assert.deepEqual(await client.databases.moveDatabaseViewRecordGroup('ws/1', 'db/1', 'view#1', input), response)
  assert.equal(new URL(calls[0].url).pathname, '/api/workspaces/ws%2F1/databases/db%2F1/views/view%231/record-group')
  assert.equal(calls[0].method, 'POST')
  assert.deepEqual(await calls[0].json(), input)
  await assert.rejects(client.databases.moveDatabaseViewRecordGroup('ws', 'db', 'view', { ...input, targetGroup: input.sourceGroup }))
  assert.equal(calls.length, 1)
  const failed = new EotionApiClient({ baseUrl: 'https://eotion.test', fetch: async () => Response.json({ statusCode: 409, message: 'Version conflict', error: 'Conflict' }, { status: 409 }) })
  await assert.rejects(failed.databases.moveDatabaseViewRecordGroup('ws', 'db', 'view', input), error => error instanceof ApiError && error.statusCode === 409)
})

test('cross-group move validates returned scope, record identity, grouping config, and target value', async () => {
  const input = { recordId: 'row/1', sourceGroup: { kind: 'option', optionId: 'open/1' }, targetGroup: { kind: 'ungrouped' },
    expectedDatabaseVersion: 3, expectedViewVersion: 2, expectedRecordVersion: 1 }
  const moved = { database, view, record: { ...record, properties: { title: 'Task', status: null } } }
  const cases = [
    { ...moved, view: { ...view, id: 'other-view' } },
    { ...moved, database: { ...database, id: 'other-db' }, view: { ...view, databaseId: 'other-db' }, record: { ...moved.record, databaseId: 'other-db' } },
    { ...moved, record: { ...moved.record, id: 'other-record' } },
    { ...moved, record },
    { ...moved, view: { ...view, type: 'table' } },
    { ...moved, view: { ...view, config: { ...view.config, options: {} } } },
  ]
  for (const response of cases) {
    const client = new EotionApiClient({ baseUrl: 'https://eotion.test', fetch: async () => Response.json(response) })
    await assert.rejects(client.databases.moveDatabaseViewRecordGroup('ws/1', 'db/1', 'view#1', input), TypeError)
  }
  const optionInput = { ...input, sourceGroup: { kind: 'ungrouped' }, targetGroup: { kind: 'option', optionId: 'open/1' } }
  const optionClient = new EotionApiClient({ baseUrl: 'https://eotion.test', fetch: async () => Response.json({ ...moved, record }) })
  assert.equal((await optionClient.databases.moveDatabaseViewRecordGroup('ws/1', 'db/1', 'view#1', optionInput)).record.properties.status, 'open/1')
  const missingClient = new EotionApiClient({ baseUrl: 'https://eotion.test', fetch: async () => Response.json({ ...moved, record: { ...record, properties: { title: 'Task' } } }) })
  assert.equal((await missingClient.databases.moveDatabaseViewRecordGroup('ws/1', 'db/1', 'view#1', input)).record.properties.status, undefined)
})
