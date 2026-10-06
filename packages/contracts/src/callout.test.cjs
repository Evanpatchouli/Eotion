'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const {
  BlockCreateRequestSchema,
  BlockUpdateRequestSchema,
  ServerBlockRecordSchema,
  SyncOperationSchema,
  WorkspaceSnapshotResponseSchema,
} = require('../dist/index.js')

const props = { node: { type: 'eotionCallout', attrs: { icon: '💡', tone: 'neutral' }, content: [{ type: 'text', text: 'note' }] } }
const block = { id: 'block-1', parentBlockId: null, type: 'callout', orderKey: 'a', props }

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
