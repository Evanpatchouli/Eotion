import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertMcpWritePayloadSize } from './mcp-write.contract'
import {
  McpCreatePropertyInputSchema,
  McpCreatePropertyOutputSchema,
  McpCreateRecordInputSchema,
  McpCreateRecordOutputSchema,
  McpCreateViewInputSchema,
  McpCreateViewOutputSchema,
  McpRenameDatabaseInputSchema,
  McpRenameDatabaseOutputSchema,
  McpUpdatePropertyInputSchema,
  McpUpdatePropertyOutputSchema,
  McpUpdateRecordCellInputSchema,
  McpUpdateRecordCellOutputSchema,
  McpUpdateViewInputSchema,
  McpUpdateViewOutputSchema,
} from './mcp-database-write.contract'

const common = {
  workspaceId: 'workspace-1', databaseId: 'database-1', expectedDatabaseVersion: 3, idempotencyKey: 'mutation-1',
}
const viewConfig = { filters: [], sorts: [], visibleProperties: null, propertyOrder: null }

test('all seven database write input contracts accept their strict documented shapes', () => {
  assert.equal(McpCreateRecordInputSchema.safeParse({ ...common, title: 'Record', properties: { text: 'large' } }).success, true)
  assert.equal(McpUpdateRecordCellInputSchema.safeParse({
    ...common, recordId: 'record-1', propertyId: 'text', value: null, expectedRecordVersion: 2,
    expectedPageUpdatedAt: '2026-10-23T10:00:00.000Z',
  }).success, true)
  assert.equal(McpCreatePropertyInputSchema.safeParse({ ...common, name: 'Notes', type: 'text' }).success, true)
  assert.equal(McpCreatePropertyInputSchema.safeParse({
    ...common, name: 'Status', type: 'select', options: [{ id: 'open', name: 'Open' }],
  }).success, true)
  assert.equal(McpUpdatePropertyInputSchema.safeParse({ ...common, propertyId: 'notes', expectedPropertyVersion: 1, name: 'Notes 2' }).success, true)
  assert.equal(McpCreateViewInputSchema.safeParse({ ...common, name: 'Table', type: 'table' }).success, true)
  assert.equal(McpUpdateViewInputSchema.safeParse({ ...common, viewId: 'view-1', expectedViewVersion: 1, name: 'Board' }).success, true)
  assert.equal(McpRenameDatabaseInputSchema.safeParse({ ...common, name: 'Projects' }).success, true)
})

test('all seven write results use strict read DTO projections', () => {
  const timestamp = '2026-10-23T10:00:00.000Z'
  const database = { id: 'database-1', workspaceId: 'workspace-1', name: 'Projects', version: 4, createdAt: timestamp, updatedAt: timestamp }
  const record = {
    id: 'record-1', databaseId: database.id, workspaceId: database.workspaceId, pageId: 'page-1', properties: { title: 'Record' },
    version: 1, createdAt: timestamp, updatedAt: timestamp, pageVersion: timestamp,
  }
  const property = { id: 'property-1', databaseId: database.id, workspaceId: database.workspaceId, name: 'Notes', type: 'text', version: 1, createdAt: timestamp, updatedAt: timestamp }
  const view = { id: 'view-1', databaseId: database.id, workspaceId: database.workspaceId, name: 'Table', type: 'table', version: 1, createdAt: timestamp, updatedAt: timestamp, config: viewConfig }
  const recordOutput = { database, record }
  const propertyOutput = { database, property }
  const viewOutput = { database, view }
  for (const schema of [McpCreateRecordOutputSchema, McpUpdateRecordCellOutputSchema]) {
    assert.equal(schema.safeParse(recordOutput).success, true)
    assert.equal(schema.safeParse({ ...recordOutput, receipt: 'internal' }).success, false)
  }
  for (const schema of [McpCreatePropertyOutputSchema, McpUpdatePropertyOutputSchema]) assert.equal(schema.safeParse(propertyOutput).success, true)
  for (const schema of [McpCreateViewOutputSchema, McpUpdateViewOutputSchema]) assert.equal(schema.safeParse(viewOutput).success, true)
  assert.equal(McpRenameDatabaseOutputSchema.safeParse({ database }).success, true)
  assert.equal(McpRenameDatabaseOutputSchema.safeParse({ database, repositoryId: 'internal' }).success, false)
})

test('database write inputs reject unknown fields, null patches, omitted cells, and caller entity IDs', () => {
  assert.equal(McpCreateRecordInputSchema.safeParse({ ...common, title: 'Record', extra: true }).success, false)
  assert.equal(McpCreateRecordInputSchema.safeParse({ ...common, title: 'Record', id: 'caller-id' }).success, false)
  assert.equal(McpCreatePropertyInputSchema.safeParse({ ...common, name: 'Notes', type: 'text', id: 'caller-id' }).success, false)
  assert.equal(McpCreateViewInputSchema.safeParse({ ...common, name: 'View', type: 'table', id: 'caller-id' }).success, false)
  assert.equal(McpUpdateRecordCellInputSchema.safeParse({ ...common, recordId: 'r', propertyId: 'p', expectedRecordVersion: 1 }).success, false)
  assert.equal(McpUpdatePropertyInputSchema.safeParse({ ...common, propertyId: 'p', expectedPropertyVersion: 1 }).success, false)
  assert.equal(McpUpdateViewInputSchema.safeParse({ ...common, viewId: 'v', expectedViewVersion: 1 }).success, false)
  assert.equal(McpUpdatePropertyInputSchema.safeParse({ ...common, propertyId: 'p', expectedPropertyVersion: 1, options: null }).success, false)
  assert.equal(McpUpdatePropertyInputSchema.safeParse({ ...common, propertyId: 'p', expectedPropertyVersion: 1, config: null }).success, false)
  assert.equal(McpUpdateViewInputSchema.safeParse({ ...common, viewId: 'v', expectedViewVersion: 1, config: null }).success, false)
  assert.equal(McpCreatePropertyInputSchema.safeParse({ ...common, name: 'Relation', type: 'relation', config: null }).success, false)
  assert.equal(McpCreateViewInputSchema.safeParse({ ...common, name: 'View', type: 'table', config: null }).success, false)
  assert.equal(McpCreateViewInputSchema.safeParse({ ...common, name: 'View', type: 'table', config: { ...viewConfig, options: null } }).success, false)
  assert.equal(McpUpdatePropertyInputSchema.safeParse({ ...common, propertyId: 'p', expectedPropertyVersion: 1, type: 'text', name: 'x' }).success, false)
  assert.equal(McpUpdateViewInputSchema.safeParse({ ...common, viewId: 'v', expectedViewVersion: 1, type: 'board', name: 'x' }).success, false)
  assert.equal(McpCreateRecordInputSchema.safeParse({ ...common, workspaceId: ' workspace-1', title: 'Record' }).success, false)
  assert.equal(McpCreateRecordInputSchema.safeParse({ ...common, title: 'Record', properties: { ' property-1 ': 'value' } }).success, false)
  assert.equal(McpUpdateRecordCellInputSchema.safeParse({ ...common, recordId: 'r', propertyId: 'p', value: [' record-1'], expectedRecordVersion: 1 }).success, false)
})

test('property config validates strict domain shapes and does not cap Select option counts', () => {
  assert.equal(McpCreatePropertyInputSchema.safeParse({
    ...common, name: 'Relation', type: 'relation', config: { targetDatabaseId: 'target-db' },
  }).success, true)
  assert.equal(McpCreatePropertyInputSchema.safeParse({
    ...common, name: 'Relation', type: 'relation', config: { targetDatabaseId: 'target-db', extra: true },
  }).success, false)
  assert.equal(McpCreatePropertyInputSchema.safeParse({
    ...common, name: 'Notes', type: 'text', config: { targetDatabaseId: 'target-db' },
  }).success, false)
  assert.equal(McpCreatePropertyInputSchema.safeParse({
    ...common, name: 'Status', type: 'select', options: Array.from({ length: 101 }, (_, index) => ({ id: `option-${index}`, name: `Option ${index}` })),
  }).success, true)
  assert.equal(McpCreatePropertyInputSchema.safeParse({
    ...common, name: 'Status', type: 'select', options: [{ id: 'same', name: 'A' }, { id: 'same', name: 'B' }],
  }).success, false)
})

test('View config keeps unknown extension options and strictly validates its full replacement shape', () => {
  assert.equal(McpCreateViewInputSchema.safeParse({
    ...common, name: 'Timeline', type: 'timeline', config: { ...viewConfig, options: { custom: { color: 'violet' } } },
  }).success, true)
  assert.equal(McpUpdateViewInputSchema.safeParse({
    ...common, viewId: 'view-1', expectedViewVersion: 1, config: { filters: [], sorts: [], visibleProperties: null, propertyOrder: null, extra: true },
  }).success, false)
  assert.equal(McpUpdateViewInputSchema.safeParse({
    ...common, viewId: 'view-1', expectedViewVersion: 1, config: { filters: [], sorts: [], visibleProperties: null },
  }).success, false)
  assert.equal(McpUpdateViewInputSchema.safeParse({
    ...common, viewId: 'view-1', expectedViewVersion: 1, config: { ...viewConfig, options: { timeline: { unknown: true } } },
  }).success, false)
})

test('record text has no extra length cap and input guard measures UTF-8 JSON bytes', () => {
  assert.equal(McpCreateRecordInputSchema.safeParse({ ...common, title: 'Record', properties: { notes: 'x'.repeat(20_001) } }).success, true)
  const fits = { text: 'é'.repeat(512 * 1024 - 8) }
  assert.equal(assertMcpWritePayloadSize(fits), fits)
  assert.throws(() => assertMcpWritePayloadSize({ text: 'é'.repeat(512 * 1024) }), /too large/)
})
