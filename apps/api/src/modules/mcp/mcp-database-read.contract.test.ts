import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  McpGetDatabaseSchemaOutputSchema,
  McpGetRecordOutputSchema,
  McpListDatabasesInputSchema,
  McpListDatabasesOutputSchema,
  McpQueryDatabaseInputSchema,
  McpResolveRelationRecordsInputSchema,
} from './mcp-database-read.contract'

test('MCP database list contract is bounded and strict', () => {
  assert.deepEqual(McpListDatabasesInputSchema.parse({ workspaceId: 'workspace-1' }), {
    workspaceId: 'workspace-1', limit: 25,
  })
  assert.equal(McpListDatabasesInputSchema.safeParse({ workspaceId: 'workspace-1', limit: 101 }).success, false)
  assert.equal(McpListDatabasesInputSchema.safeParse({ workspaceId: 'workspace-1', userId: 'forged' }).success, false)
  assert.equal(McpListDatabasesOutputSchema.safeParse({ items: [], nextCursor: null }).success, true)
})

test('MCP query contract requires operator-compatible filter shapes and unique sorts', () => {
  const base = { workspaceId: 'workspace-1', databaseId: 'database-1', viewId: 'view-1' }
  assert.deepEqual(McpQueryDatabaseInputSchema.parse(base), { ...base, limit: 25 })
  assert.equal(McpQueryDatabaseInputSchema.safeParse({
    ...base, filters: [{ propertyId: 'title', operator: 'contains' }],
  }).success, false)
  assert.equal(McpQueryDatabaseInputSchema.safeParse({
    ...base, filters: [{ propertyId: 'title', operator: 'is_empty', value: 'unexpected' }],
  }).success, false)
  assert.equal(McpQueryDatabaseInputSchema.safeParse({
    ...base, sorts: [
      { propertyId: 'title', direction: 'asc' },
      { propertyId: 'title', direction: 'desc' },
    ],
  }).success, false)
  assert.equal(McpQueryDatabaseInputSchema.safeParse({
    ...base, filters: [{ propertyId: 'title', operator: 'contains', value: 'Alpha' }],
    sorts: [{ propertyId: 'title', direction: 'asc' }], propertyIds: ['title', 'title'],
  }).success, false)
  assert.equal(McpQueryDatabaseInputSchema.safeParse({
    ...base, extra: true,
  }).success, false)
})

test('MCP relation resolver is a strict discriminated union with bounded unique ids', () => {
  assert.equal(McpResolveRelationRecordsInputSchema.safeParse({
    mode: 'search', workspaceId: 'workspace-1', databaseId: 'database-1', search: 'Alpha',
  }).success, true)
  assert.equal(McpResolveRelationRecordsInputSchema.safeParse({
    mode: 'resolve', workspaceId: 'workspace-1', databaseId: 'database-1', recordIds: ['record-1'],
  }).success, true)
  assert.equal(McpResolveRelationRecordsInputSchema.safeParse({
    mode: 'resolve', workspaceId: 'workspace-1', databaseId: 'database-1', recordIds: ['record-1', 'record-1'],
  }).success, false)
  assert.equal(McpResolveRelationRecordsInputSchema.safeParse({
    mode: 'unknown', workspaceId: 'workspace-1', databaseId: 'database-1',
  }).success, false)
})

test('MCP database schema output rejects malformed or internal-only fields', () => {
  const database = {
    id: 'database-1', workspaceId: 'workspace-1', name: 'Projects', version: 1,
    createdAt: '2026-10-22T00:00:00.000Z', updatedAt: '2026-10-22T00:00:00.000Z',
  }
  const title = {
    id: 'title', databaseId: 'database-1', workspaceId: 'workspace-1', name: 'Title', type: 'title',
    version: 1, createdAt: database.createdAt, updatedAt: database.updatedAt,
  }
  const view = {
    id: 'view-1', databaseId: 'database-1', workspaceId: 'workspace-1', name: 'Table',
    type: 'table', version: 1, createdAt: database.createdAt, updatedAt: database.updatedAt,
    config: { filters: [], sorts: [], visibleProperties: null, propertyOrder: null },
  }
  const valid = {
    database, properties: [title], views: [view],
    capabilities: { viewTypes: ['table', 'list', 'board', 'timeline'], supportsTemporaryFiltersAndSorts: true },
  }
  assert.equal(McpGetDatabaseSchemaOutputSchema.safeParse(valid).success, true)
  assert.equal(McpGetDatabaseSchemaOutputSchema.safeParse({ ...valid, internalRepository: {} }).success, false)
  assert.equal(McpGetDatabaseSchemaOutputSchema.safeParse({
    ...valid, capabilities: { viewTypes: ['gallery'], supportsTemporaryFiltersAndSorts: true },
  }).success, false)

  const select = {
    id: 'status', databaseId: database.id, workspaceId: database.workspaceId, name: 'Status', type: 'select',
    version: 1, createdAt: database.createdAt, updatedAt: database.updatedAt,
    options: Array.from({ length: 101 }, (_, index) => ({ id: `option-${index}`, name: `Option ${index}` })),
  }
  assert.equal(McpGetDatabaseSchemaOutputSchema.safeParse({ ...valid, properties: [title, select] }).success, true)
})

test('MCP record output accepts a legal text value over 20,000 characters', () => {
  const createdAt = '2026-10-22T00:00:00.000Z'
  const longText = 'x'.repeat(20_001)
  assert.equal(McpGetRecordOutputSchema.safeParse({
    id: 'record-1', databaseId: 'database-1', workspaceId: 'workspace-1', pageId: 'page-1',
    properties: { title: 'Boundary record', notes: longText }, version: 1,
    createdAt, updatedAt: createdAt, pageVersion: createdAt,
  }).success, true)
})
