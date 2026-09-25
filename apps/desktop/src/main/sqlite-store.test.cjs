const assert = require('node:assert/strict')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const test = require('node:test')
const ts = require('typescript')

require.extensions['.ts'] = (module, filename) => {
  const source = require('node:fs').readFileSync(filename, 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  module._compile(compiled, filename)
}
const { SqliteLocalStore } = require('./sqlite-store.ts')

test('SQLite persists content and ordered operations across reopening', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'eotion-sqlite-'))
  const path = join(directory, 'local.sqlite')
  const page = { id: 'page-1', title: 'First', updatedAt: '2026-01-01T00:00:00.000Z' }
  const block = {
    id: 'block-1', pageId: page.id, type: 'paragraph', orderKey: 'a',
    props: { text: 'offline' }, createdAt: page.updatedAt, updatedAt: page.updatedAt,
  }

  try {
    let store = new SqliteLocalStore(path)
    await store.upsertPage(page)
    await store.upsertBlock(block)
    const before = await store.getPendingOperations()
    assert.deepEqual(before.map((op) => op.sequence), [1, 2])
    assert.deepEqual(before.map((op) => op.kind), ['page.upsert', 'block.upsert'])
    assert.equal(before[0]?.clientId, before[1]?.clientId)
    assert.deepEqual(before[1]?.payload, block)
    store.close()

    store = new SqliteLocalStore(path)
    assert.deepEqual(await store.getPage(page.id), page)
    assert.deepEqual(await store.listBlocksByPage(page.id), [block])
    assert.deepEqual(await store.getPendingOperations(), before)
    await store.markOperationFailed(before[0].id)
    await store.markOperationSynced(before[1].id)
    assert.deepEqual((await store.getPendingOperations()).map((op) => op.id), [before[0].id])
    await store.deletePage(page.id)
    assert.equal(await store.getPage(page.id), undefined)
    assert.equal(await store.getBlock(block.id), undefined)
    const pending = await store.getPendingOperations()
    assert.deepEqual(pending.map((op) => op.sequence), [1, 3])
    assert.equal(pending[1]?.clientId, before[0]?.clientId)
    assert.deepEqual(pending[1]?.target, { type: 'page', id: page.id })
    store.close()
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('failed content write rolls back its operation and sequence', async () => {
  const store = new SqliteLocalStore(':memory:')
  try {
    await assert.rejects(store.upsertBlock({
      id: 'orphan', pageId: 'missing', type: 'paragraph', orderKey: 'a', props: {},
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    }))
    assert.deepEqual(await store.getPendingOperations(), [])
    await store.upsertPage({ id: 'real', title: 'Saved', updatedAt: '2026-01-01T00:00:00.000Z' })
    assert.deepEqual((await store.getPendingOperations()).map((op) => op.sequence), [1])
  } finally {
    store.close()
  }
})
