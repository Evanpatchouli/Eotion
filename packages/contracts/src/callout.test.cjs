'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const {
  BLOCK_TYPES,
  BlockCreateRequestSchema,
  BlockUpdateRequestSchema,
  ServerBlockRecordSchema,
  SyncOperationSchema,
  WorkspaceSnapshotResponseSchema,
} = require('../dist/index.js')

const props = { node: { type: 'eotionCallout', attrs: { icon: '💡', tone: 'neutral' }, content: [{ type: 'text', text: 'note' }] } }
const block = { id: 'block-1', parentBlockId: null, type: 'callout', orderKey: 'a', props }

function validProps(type, text = 'body') {
  const inline = [{ type: 'text', text }]
  const paragraph = { type: 'paragraph', content: inline }
  const node = {
    paragraph: { type: 'paragraph', content: inline },
    heading: { type: 'heading', attrs: { level: 1 }, content: inline },
    'bulleted-list': { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph] }] },
    'numbered-list': { type: 'orderedList', attrs: { start: 1, type: null }, content: [{ type: 'listItem', content: [paragraph] }] },
    todo: { type: 'eotionTodo', attrs: { checked: false }, content: inline },
    quote: { type: 'blockquote', content: [paragraph] },
    code: { type: 'codeBlock', attrs: { language: null }, content: inline },
    image: { type: 'eotionImage', attrs: { fileId: 'file-image', name: 'image.png', mimeType: 'image/png', size: 12, url: 'https://private.invalid/image' } },
    file: { type: 'eotionFile', attrs: { fileId: 'file-doc', name: 'doc.pdf', mimeType: 'application/pdf', size: 12, url: 'https://private.invalid/file' } },
    divider: { type: 'horizontalRule' },
    toggle: { type: 'eotionToggle', content: [paragraph] },
    callout: { type: 'eotionCallout', attrs: { icon: '💡', tone: 'neutral' }, content: inline },
    table: { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [paragraph] }] }] },
    database: { type: 'eotionDatabase', attrs: { databaseId: 'database-1', viewId: 'view-1' } },
  }[type]
  return { node }
}

function invalidProps(type, failure) {
  const node = structuredClone(validProps(type).node)
  if (failure === 'node') node.type = type === 'paragraph' ? 'heading' : 'paragraph'
  else if (failure === 'attrs') node.attrs = { ...(node.attrs ?? {}), unexpected: true }
  else node.content = [{ type: 'unsupportedChild' }]
  return { node }
}

function blockFor(type, blockProps) {
  return { id: 'block-1', parentBlockId: null, type, orderKey: 'a', props: blockProps }
}

function syncUpsert(type, blockProps) {
  return {
    id: 'op-1', clientId: 'device-1', sequence: 1, workspaceId: 'workspace-1', createdAt: '2026-01-01T00:00:00.000Z',
    kind: 'block.upsert', payload: { ...blockFor(type, blockProps), pageId: 'page-1' },
  }
}

function serverRecord(type, blockProps) {
  return {
    ...blockFor(type, blockProps), pageId: 'page-1', workspaceId: 'workspace-1',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

test('callout attrs round-trip through create, sync and snapshot contracts', () => {
  assert.deepEqual(BlockCreateRequestSchema.parse(block), block)
  const operation = {
    id: 'op-1', clientId: 'device-1', sequence: 1, workspaceId: 'workspace-1', createdAt: '2026-01-01T00:00:00.000Z',
    kind: 'block.upsert', payload: { ...block, pageId: 'page-1' },
  }
  assert.deepEqual(SyncOperationSchema.parse(operation), operation)
  const record = { ...block, pageId: 'page-1', workspaceId: 'workspace-1', createdAt: operation.createdAt, updatedAt: operation.createdAt }
  assert.deepEqual(ServerBlockRecordSchema.parse(record), record)
  const snapshot = { pages: [], blocks: [record] }
  assert.deepEqual(WorkspaceSnapshotResponseSchema.parse(snapshot), snapshot)
})

test('callout attrs are rejected at all typed contract boundaries', () => {
  const invalidProps = { node: { type: 'eotionCallout', attrs: { icon: 'bad\nicon', tone: 'info' } } }
  assert.equal(BlockCreateRequestSchema.safeParse({ ...block, props: invalidProps }).success, false)
  assert.equal(BlockCreateRequestSchema.safeParse({ ...block, props: { node: { type: 'eotionCallout', attrs: { blockId: 'block-1', icon: '💡', tone: 'neutral' } } } }).success, false)
  assert.equal(BlockCreateRequestSchema.safeParse({ ...block, props: { node: { type: 'eotionCallout', attrs: { icon: '💡', tone: 'neutral' }, content: [{ type: 'paragraph' }] } } }).success, false)
  assert.equal(BlockUpdateRequestSchema.safeParse({ type: 'callout', props: invalidProps }).success, false)
  assert.equal(SyncOperationSchema.safeParse({
    id: 'op-1', clientId: 'device-1', sequence: 1, workspaceId: 'workspace-1', createdAt: '2026-01-01T00:00:00.000Z',
    kind: 'block.upsert', payload: { ...block, pageId: 'page-1', props: invalidProps },
  }).success, false)
  assert.equal(ServerBlockRecordSchema.safeParse({
    ...block, pageId: 'page-1', workspaceId: 'workspace-1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', props: invalidProps,
  }).success, false)
})

test('all registered block types enforce matching node, attrs, and child content at contract boundaries', () => {
  assert.equal(BLOCK_TYPES.length, 14)
  for (const type of BLOCK_TYPES) {
    const valid = validProps(type, `valid ${type}`)
    assert.equal(BlockCreateRequestSchema.safeParse(blockFor(type, valid)).success, true, `${type} create`)
    assert.equal(BlockUpdateRequestSchema.safeParse({ type, props: valid }).success, true, `${type} update`)
    assert.equal(SyncOperationSchema.safeParse(syncUpsert(type, valid)).success, true, `${type} sync`)
    assert.equal(ServerBlockRecordSchema.safeParse(serverRecord(type, valid)).success, true, `${type} server record`)

    for (const failure of ['node', 'attrs', 'child']) {
      const invalid = invalidProps(type, failure)
      assert.equal(BlockCreateRequestSchema.safeParse(blockFor(type, invalid)).success, false, `${type} create rejects ${failure}`)
      assert.equal(BlockUpdateRequestSchema.safeParse({ type, props: invalid }).success, false, `${type} update rejects ${failure}`)
      assert.equal(SyncOperationSchema.safeParse(syncUpsert(type, invalid)).success, false, `${type} sync rejects ${failure}`)
      assert.equal(ServerBlockRecordSchema.safeParse(serverRecord(type, invalid)).success, false, `${type} record rejects ${failure}`)
    }
  }
})
