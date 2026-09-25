import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reconnectPending, type LocalStore, type StorageOperation } from './index.ts'

function operation(sequence: number): StorageOperation {
  return {
    id: `op-${sequence}`,
    clientId: 'device-1',
    sequence,
    kind: 'page.delete',
    target: { type: 'page', id: `page-${sequence}` },
    payload: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    status: 'pending',
  }
}

function queueStore(operations: StorageOperation[]) {
  const queue = structuredClone(operations)
  const store: Pick<LocalStore, 'getPendingOperations' | 'markOperationSynced' | 'markOperationFailed'> = {
    async getPendingOperations() {
      return queue.filter(({ status }) => status !== 'synced')
    },
    async markOperationSynced(id) {
      const item = queue.find((value) => value.id === id)
      assert.ok(item)
      item.status = 'synced'
    },
    async markOperationFailed(id) {
      const item = queue.find((value) => value.id === id)
      assert.ok(item)
      item.status = 'failed'
    },
  }
  return { store: store as LocalStore, queue }
}

test('reconnect sends persisted operations in order and does not duplicate after reconnect', async () => {
  const { store, queue } = queueStore([operation(1), operation(2)])
  const sent: string[] = []
  const transport = { async send(item: StorageOperation) { sent.push(item.id) } }

  assert.deepEqual(await reconnectPending(store, transport), { synced: 2, failed: 0 })
  assert.deepEqual(await reconnectPending(store, transport), { synced: 0, failed: 0 })
  assert.deepEqual(sent, ['op-1', 'op-2'])
  assert.deepEqual(queue.map(({ status }) => status), ['synced', 'synced'])
  assert.equal(queue.length, 2)
})

test('failure remains retryable and blocks later operations until the next reconnect', async () => {
  const { store, queue } = queueStore([operation(1), operation(2)])
  const sent: string[] = []
  let offline = true
  const transport = {
    async send(item: StorageOperation) {
      sent.push(item.id)
      if (offline) throw new Error('offline')
    },
  }

  assert.deepEqual(await reconnectPending(store, transport), { synced: 0, failed: 1 })
  assert.deepEqual(queue.map(({ status }) => status), ['failed', 'pending'])
  offline = false
  assert.deepEqual(await reconnectPending(store, transport), { synced: 2, failed: 0 })
  assert.deepEqual(sent, ['op-1', 'op-1', 'op-2'])
  assert.deepEqual(queue.map(({ id }) => id), ['op-1', 'op-2'])
  assert.equal(queue.length, 2)
})

test('concurrent reconnects for one store share a single send attempt', async () => {
  const { store } = queueStore([operation(1)])
  let sends = 0
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const transport = {
    async send() {
      sends += 1
      await gate
    },
  }

  const first = reconnectPending(store, transport)
  const second = reconnectPending(store, transport)
  assert.strictEqual(second, first)
  release()
  assert.deepEqual(await first, { synced: 1, failed: 0 })
  assert.equal(sends, 1)
})

test('separate store instances do not share the in-flight attempt', async () => {
  const { store, queue } = queueStore([operation(1)])
  const other = { ...store } as LocalStore
  const sent: string[] = []
  let bothSending!: () => void
  const started = new Promise<void>((resolve) => { bothSending = resolve })
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const transport = {
    async send(item: StorageOperation) {
      sent.push(item.id)
      if (sent.length === 2) bothSending()
      await gate
    },
  }

  const first = reconnectPending(store, transport)
  const second = reconnectPending(other, transport)
  assert.notStrictEqual(second, first)
  await started
  assert.deepEqual(sent, ['op-1', 'op-1'])
  release()
  assert.deepEqual(await Promise.all([first, second]), [
    { synced: 1, failed: 0 },
    { synced: 1, failed: 0 },
  ])
  assert.equal(queue.length, 1)
})

test('retry after a delivered send and failed local acknowledgement keeps the operation id', async () => {
  const { store, queue } = queueStore([operation(1)])
  const markSynced = store.markOperationSynced.bind(store)
  let failAcknowledgement = true
  store.markOperationSynced = async (id) => {
    if (failAcknowledgement) {
      failAcknowledgement = false
      throw new Error('local acknowledgement failed')
    }
    await markSynced(id)
  }
  const sent: string[] = []
  const transport = { async send(item: StorageOperation) { sent.push(item.id) } }

  await assert.rejects(reconnectPending(store, transport), /local acknowledgement failed/)
  assert.deepEqual(queue.map(({ id, status }) => ({ id, status })), [{ id: 'op-1', status: 'pending' }])
  assert.deepEqual(await reconnectPending(store, transport), { synced: 1, failed: 0 })
  assert.deepEqual(sent, ['op-1', 'op-1'])
  assert.equal(queue.length, 1)
})
