import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EotionApiClient } from './index.ts'

test('database cell batch mutation sends one scoped JSON request and exposes receipt lookup', async () => {
  const requests = []
  const client = new EotionApiClient({
    baseUrl: 'https://eotion.test/',
    fetch: async (input, init) => {
      requests.push(new Request(input, init))
      if (requests.length === 1) return Response.json({ message: 'temporarily unavailable' }, { status: 503 })
      return Response.json({ mutationId: 'mutation/1', status: 'uncertain' })
    },
  })
  const input = {
    mutationId: 'mutation/1',
    expectedDatabaseVersion: 7,
    records: [{ recordId: 'record/1', expectedRecordVersion: 3, cells: [{ propertyId: 'due date', value: { start: '2026-10-16', end: '2026-10-18' } }] }],
    context: { viewId: 'view/1', expectedViewVersion: 4 },
  }
  const controller = new AbortController()

  await assert.rejects(client.databases.mutateDatabaseCells('workspace/1', 'database/1', input, controller.signal), error => error.statusCode === 503)
  assert.equal(requests.length, 1, 'mutation is not retried after an uncertain transport result')
  const receipt = await client.databases.getDatabaseCellMutationReceipt('workspace/1', 'database/1', 'mutation/1', controller.signal)

  assert.deepEqual(requests.map(request => [request.method, request.url]), [
    ['POST', 'https://eotion.test/api/workspaces/workspace%2F1/databases/database%2F1/cell-mutations'],
    ['GET', 'https://eotion.test/api/workspaces/workspace%2F1/databases/database%2F1/cell-mutations/mutation%2F1'],
  ])
  assert.deepEqual(await requests[0].json(), input)
  assert.equal(requests[0].credentials, 'include')
  assert.equal(requests[1].credentials, 'include')
  assert.equal(receipt.status, 'uncertain')
})
