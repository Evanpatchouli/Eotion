const assert = require('node:assert/strict')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { DatabaseSync } = require('node:sqlite')
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
  const page = { id: 'page-1', workspaceId: 'workspace-1', parentPageId: null, orderKey: 'a', title: 'First', updatedAt: '2026-01-01T00:00:00.000Z' }
  const block = {
    id: 'block-1', workspaceId: page.workspaceId, pageId: page.id, parentBlockId: null, type: 'paragraph', orderKey: 'a',
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
    assert.deepEqual(before[1]?.payload, {
      id: block.id, pageId: block.pageId, parentBlockId: null, type: block.type, orderKey: block.orderKey, props: block.props,
    })
    store.close()

    store = new SqliteLocalStore(path)
    assert.deepEqual(await store.getPage(page.id), page)
    assert.deepEqual(await store.listBlocksByPage(page.id), [block])
    assert.deepEqual(await store.getPendingOperations(), before)
    await store.markOperationFailed(before[0].id)
    await store.markOperationSynced(before[1].id)
    assert.deepEqual((await store.getPendingOperations()).map((op) => op.id), [before[0].id])
    await store.deletePage(page.workspaceId, page.id)
    assert.equal(await store.getPage(page.id), undefined)
    assert.equal(await store.getBlock(block.id), undefined)
    const pending = await store.getPendingOperations()
    assert.deepEqual(pending.map((op) => op.sequence), [1, 3])
    assert.equal(pending[1]?.clientId, before[0]?.clientId)
    assert.deepEqual(pending[1]?.payload, { id: page.id })
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
    await store.upsertPage({ id: 'real', workspaceId: 'ws', parentPageId: null, orderKey: 'a', title: 'Saved', updatedAt: '2026-01-01T00:00:00.000Z' })
    assert.deepEqual((await store.getPendingOperations()).map((op) => op.sequence), [1])
  } finally {
    store.close()
  }
})

test('clearAllData resets SQLite content, operations, and identity', async () => {
  const store = new SqliteLocalStore(':memory:')
  try {
    const page = { id: 'p', workspaceId: 'ws', parentPageId: null, orderKey: 'a', title: 'Demo', updatedAt: '2026-01-01T00:00:00.000Z' }
    await store.upsertPage(page)
    await store.upsertBlock({ id: 'b', workspaceId: 'ws', pageId: 'p', parentBlockId: null, type: 'paragraph', orderKey: 'a', props: {}, createdAt: page.updatedAt, updatedAt: page.updatedAt })
    const previousClientId = (await store.getPendingOperations())[0].clientId
    await store.clearAllData()
    assert.deepEqual(await store.listPages(), [])
    assert.deepEqual(await store.listBlocksByPage('p'), [])
    assert.deepEqual(await store.getPendingOperations(), [])
    await store.upsertPage(page)
    const [operation] = await store.getPendingOperations()
    assert.equal(operation.sequence, 1)
    assert.notEqual(operation.clientId, previousClientId)
  } finally {
    store.close()
  }
})

test('SQLite upgrades the old operation table without inventing missing sync fields', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'eotion-sqlite-legacy-'))
  const path = join(directory, 'local.sqlite')
  try {
    const legacy = new DatabaseSync(path)
    legacy.exec(`CREATE TABLE operations (
      id TEXT PRIMARY KEY, client_id TEXT NOT NULL, sequence INTEGER NOT NULL UNIQUE,
      kind TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL,
      payload TEXT, created_at TEXT NOT NULL, status TEXT NOT NULL
    )`)
    legacy.prepare(`INSERT INTO operations
      (id, client_id, sequence, kind, target_type, target_id, payload, created_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('legacy-op', 'legacy-client', 1, 'page.upsert', 'page', 'legacy-page',
        JSON.stringify({ id: 'legacy-page', title: 'Old page', updatedAt: '2026-01-01T00:00:00.000Z' }),
        '2026-01-01T00:00:00.000Z', 'pending')
    legacy.close()

    const store = new SqliteLocalStore(path)
    const [operation] = await store.getPendingOperations()
    assert.equal(operation.id, 'legacy-op')
    assert.equal(operation.clientId, 'legacy-client')
    assert.equal(operation.sequence, 1)
    assert.equal(operation.workspaceId, undefined)
    assert.equal(operation.payload.title, 'Old page')
    await store.replaceWorkspaceSnapshot('current-workspace', [], [])
    assert.equal(await store.hasWorkspaceSnapshot('current-workspace'), true)
    assert.equal((await store.getPendingOperations())[0].id, 'legacy-op')
    store.close()
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('SQLite move creates one page.move and rejects invalid ancestry without changing sequence', async () => {
  const store = new SqliteLocalStore(':memory:')
  const now = '2026-01-01T00:00:00.000Z'
  const page = (id, workspaceId, parentPageId = null) => ({ id, workspaceId, parentPageId, orderKey: 'a', title: id, updatedAt: now })
  try {
    await store.upsertPage(page('root', 'ws'))
    await store.upsertPage(page('child', 'ws', 'root'))
    await store.upsertPage(page('other', 'else'))
    const before = await store.getPendingOperations()
    for (const parent of ['root', 'other', 'missing']) {
      await assert.rejects(store.movePage('ws', 'root', parent, 'b'))
    }
    await assert.rejects(store.movePage('ws', 'root', 'child', 'b'))
    assert.deepEqual(await store.getPage('root'), page('root', 'ws'))
    assert.deepEqual(await store.getPendingOperations(), before)
    await store.movePage('ws', 'child', null, 'b')
    assert.equal((await store.getPage('child')).parentPageId, null)
    assert.equal((await store.getPage('child')).orderKey, 'b')
    const after = await store.getPendingOperations()
    assert.deepEqual(after.map((op) => op.sequence), [1, 2, 3, 4])
    assert.equal(after[3].kind, 'page.move')
    assert.deepEqual(after[3].payload, { id: 'child', parentPageId: null, orderKey: 'b' })
  } finally {
    store.close()
  }
})

test('SQLite snapshot replacement is workspace scoped, atomic, and preserves operation identity', async () => {
  const store = new SqliteLocalStore(':memory:')
  const now = '2026-01-01T00:00:00.000Z'
  const page = (id, workspaceId) => ({ id, workspaceId, parentPageId: null, orderKey: 'a', title: id, updatedAt: now })
  const block = (id, workspaceId, pageId) => ({ id, workspaceId, pageId, parentBlockId: null, type: 'paragraph', orderKey: 'a', props: {}, createdAt: now, updatedAt: now })
  try {
    await store.upsertPage(page('old', 'ws'))
    await store.upsertBlock(block('old-block', 'ws', 'old'))
    await store.upsertPage(page('other', 'else'))
    const operations = await store.getPendingOperations()
    await assert.rejects(store.replaceWorkspaceSnapshot('ws', [page('new', 'ws')], []), /unsynced/)
    assert.deepEqual(await store.listPagesByWorkspace('ws'), [page('old', 'ws')])
    for (const operation of operations.filter((op) => op.workspaceId === 'ws')) await store.markOperationSynced(operation.id)
    await assert.rejects(store.replaceWorkspaceSnapshot('ws', [page('other', 'ws')], []), /another workspace/)
    await assert.rejects(store.replaceWorkspaceSnapshot('ws', [page('broken', 'ws')], [block('bad', 'ws', 'missing')]), /Invalid/)
    const circular = { ...page('circular', 'ws') }
    circular.self = circular
    await assert.rejects(store.replaceWorkspaceSnapshot('ws', [circular], []), /circular/i)
    assert.deepEqual(await store.listPagesByWorkspace('ws'), [page('old', 'ws')])
    assert.deepEqual(await store.listBlocksByPage('old'), [block('old-block', 'ws', 'old')])
    assert.equal(await store.hasWorkspaceSnapshot('ws'), true)
    assert.equal(await store.hasWorkspaceSnapshot('never'), false)
    await store.replaceWorkspaceSnapshot('ws', [page('new', 'ws')], [block('new-block', 'ws', 'new')])
    assert.deepEqual(await store.listPagesByWorkspace('ws'), [page('new', 'ws')])
    assert.equal(await store.getBlock('old-block'), undefined)
    assert.deepEqual(await store.listBlocksByPage('new'), [block('new-block', 'ws', 'new')])
    assert.deepEqual(await store.listPagesByWorkspace('else'), [page('other', 'else')])
    assert.deepEqual(await store.getPendingOperations(), operations.filter((op) => op.workspaceId === 'else'))
    await store.replaceWorkspaceSnapshot('ws', [], [])
    assert.equal(await store.hasWorkspaceSnapshot('ws'), true)
    assert.deepEqual(await store.listPagesByWorkspace('ws'), [])
    await store.upsertPage(page('after', 'ws'))
    const [pendingOther, pendingAfter] = await store.getPendingOperations()
    assert.equal(pendingOther.id, operations[2].id)
    assert.equal(pendingAfter.sequence, 4)
    assert.equal(pendingAfter.clientId, operations[0].clientId)
  } finally {
    store.close()
  }
})

test('SQLite keeps a locally created workspace cached after its last page is deleted', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'eotion-sqlite-empty-'))
  const path = join(directory, 'local.sqlite')
  try {
    let store = new SqliteLocalStore(path)
    await store.upsertPage({ id: 'only', workspaceId: 'ws', parentPageId: null, orderKey: 'a', title: 'Only', updatedAt: '2026-01-01T00:00:00.000Z' })
    await store.deletePage('ws', 'only')
    store.close()
    store = new SqliteLocalStore(path)
    assert.deepEqual(await store.listPagesByWorkspace('ws'), [])
    assert.equal(await store.hasWorkspaceSnapshot('ws'), true)
    store.close()
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('SQLite file cleanup gates follow local mutations and preserve failure state', async () => {
  const now = '2026-01-01T00:00:00.000Z'
  const page = (id, workspaceId = 'ws') => ({ id, workspaceId, parentPageId: null, orderKey: 'a', title: id, updatedAt: now })
  const block = (id, fileId, pageId = 'p', workspaceId = 'ws') => ({
    id, workspaceId, pageId, parentBlockId: null, type: 'image', orderKey: 'a',
    props: { node: { attrs: fileId ? { fileId } : {} } }, createdAt: now, updatedAt: now,
  })
  const directory = mkdtempSync(join(tmpdir(), 'eotion-sqlite-cleanup-'))
  const path = join(directory, 'local.sqlite')
  let persistent
  try {
      persistent = new SqliteLocalStore(path)
      await persistent.upsertPage(page('p'))
      await persistent.upsertBlock({ ...block('paragraph', 'ignored-file-id'), type: 'paragraph' })
      await persistent.deleteBlock('ws', 'paragraph')
      assert.deepEqual(await persistent.listFileCleanups(), [])
      await persistent.upsertBlock(block('one', 'file-one'))
      await persistent.deleteBlock('ws', 'one')
      const afterDelete = (await persistent.getPendingOperations()).at(-1)
      assert.equal((await persistent.listFileCleanups())[0].sourceOperationId, afterDelete.id)
      persistent.close()
      persistent = undefined
      persistent = new SqliteLocalStore(path)
      assert.equal((await persistent.listReadyFileCleanups()).some((item) => item.fileId === 'page-file-a'), false)
      await persistent.markOperationSynced(afterDelete.id)
      assert.deepEqual((await persistent.listReadyFileCleanups()).map((item) => item.fileId), ['file-one'])
      await persistent.failFileCleanup('ws', 'file-one', 'remote delete failed')
      assert.equal((await persistent.listFileCleanups())[0].lastError, 'remote delete failed')
      await persistent.completeFileCleanup('ws', 'file-one')
      assert.deepEqual(await persistent.listFileCleanups(), [])

      await persistent.enqueueFileCleanup('ws', 'compensation')
      await persistent.enqueueFileCleanup('ws', 'compensation')
      assert.equal((await persistent.listReadyFileCleanups()).length, 1)
      await persistent.enqueueFileCleanup('other', 'compensation')
      assert.deepEqual((await persistent.listReadyFileCleanups()).map((item) => item.workspaceId).sort(), ['other', 'ws'])

      await persistent.upsertBlock(block('two', 'replace-me'))
      const upsert = (await persistent.getPendingOperations()).at(-1)
      await persistent.upsertBlock({ ...block('two', undefined), type: 'paragraph', props: { text: 'replaced' } })
      const replacement = (await persistent.getPendingOperations()).at(-1)
      assert.equal((await persistent.listFileCleanups()).find((item) => item.fileId === 'replace-me').sourceOperationId, replacement.id)
      assert.equal((await persistent.listReadyFileCleanups()).some((item) => item.fileId === 'replace-me'), false)
      await persistent.markOperationSynced(replacement.id)
      assert.equal((await persistent.listReadyFileCleanups()).some((item) => item.fileId === 'replace-me'), true)

      await persistent.upsertBlock(block('three', 'page-file-a'))
      await persistent.upsertBlock(block('four', 'page-file-b'))
      const pageDeleteBefore = await persistent.getPendingOperations()
      await persistent.markOperationSynced(pageDeleteBefore.at(-1).id)
      await persistent.deletePage('ws', 'p')
      const pageDelete = (await persistent.getPendingOperations()).at(-1)
      const pageFiles = (await persistent.listFileCleanups()).filter((item) => item.fileId.startsWith('page-file-'))
      assert.equal(pageFiles.length, 2)
      assert.ok(pageFiles.every((item) => item.sourceOperationId === pageDelete.id))
      assert.equal((await persistent.listReadyFileCleanups()).some((item) => item.fileId.startsWith('page-file-')), false)
      await persistent.markOperationSynced(pageDelete.id)
      const ready = await persistent.listReadyFileCleanups()
      assert.ok(ready.some((item) => item.fileId === 'page-file-a'))
      assert.ok(ready.some((item) => item.fileId === 'page-file-b'))
      await persistent.clearAllData()
      assert.deepEqual(await persistent.listFileCleanups(), [])
  } finally {
    persistent?.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
