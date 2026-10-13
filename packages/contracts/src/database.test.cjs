'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const {
  DatabaseCreateInPageRequestSchema,
  DatabasePropertyCreateRequestSchema,
  DatabaseRecordCreateRequestSchema,
  DatabaseViewCreateRequestSchema,
  DatabaseViewHttpCreateRequestSchema,
  DatabaseViewUpdateRequestSchema,
  DatabaseViewDeleteRequestSchema,
  DatabaseViewConfigSchema,
  DatabaseLinkInPageRequestSchema,
  DatabaseRecordPageCreateRequestSchema,
  DatabaseListQuerySchema,
  DatabaseViewListQuerySchema,
  DatabaseTableQuerySchema,
  DatabaseTableResponseSchema,
  DatabaseViewRecordsQuerySchema,
  DatabaseViewRecordsResponseSchema,
  DatabaseSchema,
  DatabaseNavigationItemSchema,
  DatabaseNavigationWindowResponseSchema,
  PageCreateRequestSchema,
  PageRecordSchema,
  DatabasePropertySchema,
  DatabaseViewSchema,
  databaseRecordSchema,
  DatabaseRecordCellUpdateRequestSchema,
  DatabaseRelationCandidatesQuerySchema,
  DatabaseRelationCandidatesResponseSchema,
  DatabaseRelationTitlesRequestSchema,
  DatabaseRelationTitlesResponseSchema,
} = require('../dist/index.js')

const timestamp = '2026-01-02T03:04:05.000Z'
const property = { id: 'title-1', databaseId: 'db-1', workspaceId: 'ws-1', name: 'Name', type: 'title', version: 1, createdAt: timestamp, updatedAt: timestamp }
const database = { id: 'db-1', workspaceId: 'ws-1', name: 'Tasks', version: 1, createdAt: timestamp, updatedAt: timestamp }
const view = { id: 'view-1', databaseId: 'db-1', workspaceId: 'ws-1', name: 'All tasks', type: 'table', config: { filters: [], sorts: [], visibleProperties: null, propertyOrder: null }, version: 1, createdAt: timestamp, updatedAt: timestamp }

test('database navigation and page role have separate strict read and write contracts', () => {
  const item = { id: 'db-1', workspaceId: 'ws-1', name: 'Tasks', parentPageId: 'page-1', orderKey: 'a', viewId: 'view-1' }
  assert.deepEqual(DatabaseNavigationItemSchema.parse(item), item)
  assert.deepEqual(DatabaseNavigationWindowResponseSchema.parse({ items: [item], nextCursor: null }).items, [item])
  assert.equal(DatabaseNavigationItemSchema.safeParse({ ...item, version: 1 }).success, false)
  const page = { id: 'record-page', workspaceId: 'ws-1', parentPageId: null, title: 'Record', orderKey: 'a', role: 'database-record', createdAt: timestamp, updatedAt: timestamp }
  assert.deepEqual(PageRecordSchema.parse(page), page)
  assert.equal(PageCreateRequestSchema.safeParse({ id: page.id, parentPageId: null, title: page.title, orderKey: page.orderKey, role: page.role }).success, false)
})

test('database entity schemas reuse the strict domain validators', () => {
  assert.deepEqual(DatabaseSchema.parse(database), database)
  assert.deepEqual(DatabasePropertySchema.parse(property), property)
  assert.deepEqual(DatabaseViewSchema.parse(view), view)
  for (const type of ['list', 'board', 'timeline']) assert.deepEqual(DatabaseViewSchema.parse({ ...view, type }).type, type)
  for (const type of ['calendar', 'kanban', null]) assert.equal(DatabaseViewSchema.safeParse({ ...view, type }).success, false)
  assert.deepEqual(databaseRecordSchema([property]).parse({
    id: 'record-1', databaseId: 'db-1', workspaceId: 'ws-1', pageId: 'page-1', properties: {},
    version: 1, createdAt: timestamp, updatedAt: timestamp,
  }).properties, {})
  assert.equal(DatabaseSchema.safeParse({ ...database, extra: true }).success, false)
  assert.equal(DatabasePropertySchema.safeParse({ ...property, options: [] }).success, false)
  assert.equal(databaseRecordSchema([property]).safeParse({
    id: 'record-1', databaseId: 'db-1', workspaceId: 'ws-1', pageId: 'page-1', properties: { 'title-1': 'A task' },
    version: 1, createdAt: timestamp, updatedAt: timestamp,
  }).success, false)
})

test('database create request schemas enforce exact request shapes', () => {
  const createInPage = { id: 'db-1', name: 'Tasks', titlePropertyId: 'title-1', viewId: 'view-1', blockId: 'block-1', orderKey: 'a', parentBlockId: null }
  assert.deepEqual(DatabaseCreateInPageRequestSchema.parse(createInPage), createInPage)
  assert.equal(DatabaseCreateInPageRequestSchema.safeParse({ ...createInPage, extra: true }).success, false)

  const select = { id: 'status-1', name: 'Status', type: 'select', options: [{ id: 'open', name: 'Open' }], expectedDatabaseVersion: 1 }
  assert.deepEqual(DatabasePropertyCreateRequestSchema.parse(select), select)
  assert.equal(DatabasePropertyCreateRequestSchema.safeParse({ id: 'status-1', name: 'Status', type: 'select' }).success, false)
  assert.equal(DatabasePropertyCreateRequestSchema.safeParse({ id: 'text-1', name: 'Notes', type: 'text', options: [] }).success, false)
  assert.equal(DatabasePropertyCreateRequestSchema.safeParse({ ...select, options: [{ id: 'open', name: 'Open' }, { id: 'open', name: 'Other' }] }).success, false)

  const createRecord = { id: 'record-1', pageId: 'page-1', properties: { 'title-1': 'A task', count: 2, done: false, due: null } }
  assert.deepEqual(DatabaseRecordCreateRequestSchema.parse(createRecord), createRecord)
  assert.equal(DatabaseRecordCreateRequestSchema.safeParse({ ...createRecord, extra: true }).success, false)
  assert.equal(DatabaseRecordCreateRequestSchema.safeParse({ ...createRecord, properties: { invalid: Infinity } }).success, false)

  const dateValues = [
    { start: '2026-02-28' },
    { start: '2026-02-28', end: '2026-03-01' },
    { start: '2026-02-28T09:00:00.000Z', timeZone: 'Asia/Shanghai' },
    { start: '2026-02-28T09:00:00.000Z', end: '2026-02-28T10:00:00.000Z', timeZone: 'Asia/Shanghai' },
  ]
  for (const value of dateValues) {
    assert.equal(DatabaseRecordCreateRequestSchema.safeParse({ ...createRecord, properties: { due: value } }).success, true)
    assert.equal(DatabaseRecordCellUpdateRequestSchema.safeParse({ value, expectedDatabaseVersion: 1, expectedRecordVersion: 1 }).success, true)
  }
  const invalidDateValues = [
    { start: '2026-02-30' },
    { start: '2026-02-28', end: '2026-02-27' },
    { start: '2026-02-28', end: undefined },
    { start: '2026-02-28', unknown: true },
    { start: '2026-02-28T09:00:00.000+08:00', timeZone: 'Asia/Shanghai' },
    { start: '2026-02-28T09:00:00.000Z', timeZone: 'Not/AZone' },
    { start: '2026-02-28T09:00:00.000Z', timeZone: undefined },
  ]
  for (const value of invalidDateValues) {
    assert.equal(DatabaseRecordCreateRequestSchema.safeParse({ ...createRecord, properties: { due: value } }).success, false)
    assert.equal(DatabaseRecordCellUpdateRequestSchema.safeParse({ value, expectedDatabaseVersion: 1, expectedRecordVersion: 1 }).success, false)
  }

  const createView = { id: 'view-1', name: 'All tasks', type: 'table' }
  assert.deepEqual(DatabaseViewCreateRequestSchema.parse(createView), createView)
  assert.equal(DatabaseViewCreateRequestSchema.safeParse({ ...createView, type: 'calendar' }).success, false)
  for (const type of ['list', 'board', 'timeline']) assert.deepEqual(DatabaseViewCreateRequestSchema.parse({ ...createView, type }).type, type)
  const boardConfig = { filters: [], sorts: [], visibleProperties: null, propertyOrder: null, options: { groupByPropertyId: 'status-1', futureKey: { keep: true } } }
  assert.deepEqual(DatabaseViewCreateRequestSchema.parse({ ...createView, type: 'board', config: boardConfig }).config, boardConfig)
  const timelineConfig = { filters: [], sorts: [], visibleProperties: null, propertyOrder: null, options: { timeline: { scale: 'week' }, futureKey: { keep: true } } }
  assert.deepEqual(DatabaseViewCreateRequestSchema.parse({ ...createView, type: 'timeline', config: timelineConfig }).config, timelineConfig)
  assert.deepEqual(DatabaseViewUpdateRequestSchema.parse({ config: timelineConfig, expectedDatabaseVersion: 1, expectedViewVersion: 1 }).config, timelineConfig)
  const invalidTimelineConfig = { ...timelineConfig, options: { timeline: { scale: 'week', unsupported: true } } }
  assert.equal(DatabaseViewCreateRequestSchema.safeParse({ ...createView, type: 'timeline', config: invalidTimelineConfig }).success, false)
  assert.equal(DatabaseViewUpdateRequestSchema.safeParse({ config: invalidTimelineConfig, expectedDatabaseVersion: 1, expectedViewVersion: 1 }).success, false)
  assert.equal(DatabaseViewHttpCreateRequestSchema.safeParse(createView).success, false)
  assert.deepEqual(DatabaseViewHttpCreateRequestSchema.parse({ ...createView, expectedDatabaseVersion: 1 }), { ...createView, expectedDatabaseVersion: 1 })
  assert.equal(DatabaseViewUpdateRequestSchema.safeParse({ expectedDatabaseVersion: 1, expectedViewVersion: 1 }).success, false)
  assert.deepEqual(DatabaseViewDeleteRequestSchema.parse({ expectedDatabaseVersion: 1, expectedViewVersion: 1 }), { expectedDatabaseVersion: 1, expectedViewVersion: 1 })
  assert.equal(DatabaseViewConfigSchema.safeParse({ filters: [{ propertyId: 'p', operator: 'checked' }], sorts: [], visibleProperties: null, propertyOrder: null }).success, true)
  assert.equal(DatabaseViewConfigSchema.safeParse({ filters: [{ propertyId: 'p', operator: 'checked', value: true }], sorts: [], visibleProperties: null, propertyOrder: null }).success, false)
  const opaqueOptions = { futureKey: { nested: [1, { keep: true }] }, groupByPropertyId: 123 }
  assert.deepEqual(DatabaseViewConfigSchema.parse({ filters: [], sorts: [], visibleProperties: null, propertyOrder: null, options: opaqueOptions }).options, opaqueOptions)
  for (const options of [null, [], 'opaque', 1, true]) assert.equal(DatabaseViewConfigSchema.safeParse({ filters: [], sorts: [], visibleProperties: null, propertyOrder: null, options }).success, false)
})

test('database create request schemas reject unstable or oversized ids and names without trimming input', () => {
  const invalidId = (schema, value) => assert.equal(schema.safeParse(value).success, false)
  const validCreateInPage = { id: 'db-1', name: 'Tasks', titlePropertyId: 'title-1', viewId: 'view-1', blockId: 'block-1', orderKey: 'a', parentBlockId: null }
  invalidId(DatabaseCreateInPageRequestSchema, { ...validCreateInPage, id: ' db-1' })
  invalidId(DatabaseCreateInPageRequestSchema, { ...validCreateInPage, viewId: 'view-1 ' })
  invalidId(DatabaseCreateInPageRequestSchema, { ...validCreateInPage, parentBlockId: `x${'x'.repeat(256)}` })
  assert.equal(DatabaseCreateInPageRequestSchema.safeParse({ ...validCreateInPage, name: ' Tasks' }).success, false)
  assert.equal(DatabaseCreateInPageRequestSchema.safeParse({ ...validCreateInPage, name: 'n'.repeat(201) }).success, false)

  const property = { id: 'prop-1', name: 'Status', type: 'select', options: [{ id: 'open', name: 'Open' }], expectedDatabaseVersion: 1 }
  invalidId(DatabasePropertyCreateRequestSchema, { ...property, id: 'prop-1 ' })
  invalidId(DatabasePropertyCreateRequestSchema, { ...property, options: [{ id: ' open', name: 'Open' }] })
  assert.equal(DatabasePropertyCreateRequestSchema.safeParse({ ...property, name: ' Status' }).success, false)
  assert.equal(DatabasePropertyCreateRequestSchema.safeParse({ ...property, options: [{ id: 'open', name: 'O'.repeat(201) }] }).success, false)

  const record = { id: 'record-1', pageId: 'page-1', properties: { 'prop-1': 'open' } }
  invalidId(DatabaseRecordCreateRequestSchema, { ...record, pageId: ' page-1' })
  invalidId(DatabaseRecordCreateRequestSchema, { ...record, properties: { [`${'x'.repeat(257)}`]: 'value' } })
  invalidId(DatabaseRecordCreateRequestSchema, { ...record, id: 'r'.repeat(257) })

  const view = { id: 'view-1', name: 'All tasks', type: 'table' }
  invalidId(DatabaseViewCreateRequestSchema, { ...view, id: ' view-1' })
  assert.equal(DatabaseViewCreateRequestSchema.safeParse({ ...view, name: 'All tasks ' }).success, false)
  assert.equal(DatabaseViewCreateRequestSchema.safeParse({ ...view, name: 'V'.repeat(201) }).success, false)
})

test('database HTTP contracts strictly validate page creation, links, and bounded windows', () => {
  const link = { databaseId: 'db-1', viewId: 'view-1', blockId: 'block-2', orderKey: 'b', parentBlockId: null }
  assert.deepEqual(DatabaseLinkInPageRequestSchema.parse(link), link)
  assert.equal(DatabaseLinkInPageRequestSchema.safeParse({ ...link, viewId: ' view-1' }).success, false)
  const recordPage = { id: 'record-1', pageId: 'page-2', title: 'A task', orderKey: 'a' }
  assert.deepEqual(DatabaseRecordPageCreateRequestSchema.parse(recordPage), recordPage)
  assert.equal(DatabaseRecordPageCreateRequestSchema.safeParse({ ...recordPage, parentPageId: null }).success, false)
  const dateValues = [
    '2026-02-28',
    { start: '2026-02-28' },
    { start: '2026-02-28', end: '2026-03-01' },
    { start: '2026-02-28T09:00:00.000Z', timeZone: 'Asia/Shanghai' },
    { start: '2026-02-28T09:00:00.000Z', end: '2026-02-28T10:00:00.000Z', timeZone: 'Asia/Shanghai' },
  ]
  for (const value of dateValues) {
    const request = { ...recordPage, properties: { due: value } }
    assert.deepEqual(DatabaseRecordPageCreateRequestSchema.parse(request), request)
  }
  const invalidDateValues = [
    { start: '2026-02-28', end: undefined },
    { start: '2026-02-28', end: '2026-02-27' },
    { start: '2026-02-28', type: 'date' },
    { start: '2026-02-28', unknown: true },
    { start: '2026-02-28T09:00:00.000Z', timeZone: 'Not/AZone' },
    { start: '2026-02-28T09:00:00.000Z', timeZone: undefined },
    { start: '2026-02-28T09:00:00.000+08:00', timeZone: 'Asia/Shanghai' },
  ]
  for (const value of invalidDateValues) {
    assert.equal(DatabaseRecordPageCreateRequestSchema.safeParse({ ...recordPage, properties: { due: value } }).success, false)
  }
  assert.equal(DatabaseRecordPageCreateRequestSchema.safeParse({ ...recordPage, properties: { due: 42 } }).success, true)
  assert.deepEqual(DatabaseListQuerySchema.parse({}), { limit: 50 })
  assert.deepEqual(DatabaseListQuerySchema.parse({ limit: '12', cursor: 'db-1' }), { limit: 12, cursor: 'db-1' })
  assert.equal(DatabaseListQuerySchema.safeParse({ limit: '101' }).success, false)
  assert.equal(DatabaseListQuerySchema.safeParse({ cursor: ' db-1' }).success, false)
  assert.deepEqual(DatabaseViewListQuerySchema.parse({}), { limit: 100 })
  assert.equal(DatabaseViewListQuerySchema.safeParse({ limit: 100 }).success, true)
  assert.equal(DatabaseViewListQuerySchema.safeParse({ limit: 101 }).success, false)
  assert.equal(DatabaseTableQuerySchema.safeParse({ limit: 100 }).success, true)
  assert.equal(DatabaseTableQuerySchema.safeParse({ limit: 101 }).success, false)
  assert.equal(DatabaseTableQuerySchema.safeParse({ cursor: 'x'.repeat(256) }).success, true)
  assert.equal(DatabaseTableQuerySchema.safeParse({ cursor: 'x'.repeat(16_385) }).success, false)
})

test('database table response validates scope, property values, and the property cap', () => {
  const record = { id: 'record-1', databaseId: 'db-1', workspaceId: 'ws-1', pageId: 'page-1', properties: { 'title-1': 'A task' }, version: 1, createdAt: timestamp, updatedAt: timestamp, pageVersion: timestamp }
  const table = { database, view, properties: [property], records: [record], nextCursor: null }
  assert.deepEqual(DatabaseTableResponseSchema.parse(table), table)
  assert.equal(DatabaseTableResponseSchema.safeParse({ ...table, view: { ...view, workspaceId: 'ws-2' } }).success, false)
  assert.equal(DatabaseTableResponseSchema.safeParse({ ...table, records: [{ ...record, properties: { 'title-1': 4 } }] }).success, false)
  assert.equal(DatabaseTableResponseSchema.safeParse({ ...table, records: [{ ...record, databaseId: 'db-2' }] }).success, false)
  assert.equal(DatabaseTableResponseSchema.safeParse({ ...table, properties: [{ ...property, workspaceId: 'ws-2' }] }).success, false)
  assert.equal(DatabaseTableResponseSchema.safeParse({ ...table, properties: Array(101).fill(property) }).success, false)
  assert.equal(DatabaseTableResponseSchema.safeParse({ ...table, extra: true }).success, false)
  assert.equal(DatabaseTableResponseSchema.safeParse({ ...table, records: Array(101).fill(record) }).success, false)
})

test('database view records query is bounded, strict, and compatible with the legacy table query', () => {
  assert.deepEqual(DatabaseViewRecordsQuerySchema.parse({}), { limit: 50 })
  assert.deepEqual(DatabaseViewRecordsQuerySchema.parse({ limit: '100', cursor: 'next/1' }), { limit: 100, cursor: 'next/1' })
  assert.equal(DatabaseViewRecordsQuerySchema.safeParse({ limit: 101 }).success, false)
  assert.equal(DatabaseViewRecordsQuerySchema.safeParse({ limit: 0 }).success, false)
  assert.equal(DatabaseViewRecordsQuerySchema.safeParse({ cursor: 'x'.repeat(16_384) }).success, true)
  assert.equal(DatabaseViewRecordsQuerySchema.safeParse({ cursor: 'x'.repeat(16_385) }).success, false)
  assert.equal(DatabaseViewRecordsQuerySchema.safeParse({ cursor: ' next' }).success, false)
  assert.equal(DatabaseViewRecordsQuerySchema.safeParse({ extra: true }).success, false)
  const input = { limit: '25', cursor: 'next/1' }
  assert.deepEqual(DatabaseTableQuerySchema.parse(input), DatabaseViewRecordsQuerySchema.parse(input))
  assert.deepEqual(DatabaseTableQuerySchema.parse({}), DatabaseViewRecordsQuerySchema.parse({}))
  assert.equal(DatabaseTableQuerySchema.safeParse({ extra: true }).success, DatabaseViewRecordsQuerySchema.safeParse({ extra: true }).success)
})

test('database view records response strictly validates scope, rows, properties, and caps with table compatibility', () => {
  const record = { id: 'record-1', databaseId: 'db-1', workspaceId: 'ws-1', pageId: 'page-1', properties: { 'title-1': 'A task' }, version: 1, createdAt: timestamp, updatedAt: timestamp, pageVersion: timestamp }
  const response = { database, view, properties: [property], records: [record], nextCursor: null }
  assert.deepEqual(DatabaseViewRecordsResponseSchema.parse(response), response)
  assert.deepEqual(DatabaseTableResponseSchema.parse(response), DatabaseViewRecordsResponseSchema.parse(response))
  const invalidCases = [
    { ...response, database: { ...database, workspaceId: 'ws-2' } },
    { ...response, view: { ...view, workspaceId: 'ws-2' } },
    { ...response, view: { ...view, databaseId: 'db-2' } },
    { ...response, properties: [{ ...property, workspaceId: 'ws-2' }] },
    { ...response, properties: [{ ...property, databaseId: 'db-2' }] },
    { ...response, records: [{ ...record, workspaceId: 'ws-2' }] },
    { ...response, records: [{ ...record, databaseId: 'db-2' }] },
    { ...response, records: [{ ...record, properties: { 'title-1': 4 } }] },
    { ...response, records: [{ ...record, extra: true }] },
    { ...response, properties: Array(101).fill(property) },
    { ...response, records: Array(101).fill(record) },
    { ...response, nextCursor: 'x'.repeat(16_385) },
    { ...response, extra: true },
  ]
  for (const invalid of invalidCases) {
    assert.equal(DatabaseViewRecordsResponseSchema.safeParse(invalid).success, false)
    assert.equal(DatabaseTableResponseSchema.safeParse(invalid).success, false)
  }
  assert.equal(DatabaseViewRecordsResponseSchema.safeParse({ ...response, view: { ...view, type: 'list' } }).success, true)
  assert.equal(DatabaseViewRecordsResponseSchema.safeParse({ ...response, view: { ...view, type: 'board' } }).success, true)
  assert.equal(DatabaseViewRecordsResponseSchema.safeParse({ ...response, view: { ...view, type: 'timeline' } }).success, true)
  assert.equal(DatabaseViewRecordsResponseSchema.safeParse({ ...response, view: { ...view, type: 'calendar' } }).success, false)
  assert.equal(DatabaseViewRecordsResponseSchema.safeParse({ ...response, view: { ...view, type: 'table' } }).success, true)
})

test('board view records require a valid select grouping property while table and list options stay opaque', () => {
  const select = { id: 'status-1', databaseId: 'db-1', workspaceId: 'ws-1', name: 'Status', type: 'select', options: [{ id: 'open', name: 'Open' }], version: 1, createdAt: timestamp, updatedAt: timestamp }
  const text = { ...property, id: 'notes-1', name: 'Notes', type: 'text' }
  const boardView = { ...view, type: 'board', config: { ...view.config, options: { groupByPropertyId: 'status-1', futureKey: true } } }
  const response = { database, view: boardView, properties: [property, select, text], records: [], nextCursor: null }
  assert.equal(DatabaseViewRecordsResponseSchema.safeParse(response).success, true)
  for (const groupByPropertyId of ['missing', 'notes-1', ' db-1', 'x'.repeat(257), 42, null, undefined]) {
    const invalid = { ...response, view: { ...boardView, config: { ...boardView.config, options: { groupByPropertyId } } } }
    assert.equal(DatabaseViewRecordsResponseSchema.safeParse(invalid).success, false)
  }
  const foreignSelect = { ...select, databaseId: 'db-2' }
  assert.equal(DatabaseViewRecordsResponseSchema.safeParse({ ...response, properties: [property, foreignSelect] }).success, false)
  assert.equal(DatabaseViewRecordsResponseSchema.safeParse({ ...response, properties: [property, { ...select, workspaceId: 'ws-2' }] }).success, false)
  const selectWithoutOptions = { ...select, options: undefined }
  assert.equal(DatabaseViewRecordsResponseSchema.safeParse({ ...response, properties: [property, selectWithoutOptions] }).success, false)
  for (const type of ['table', 'list']) {
    const opaque = { ...response, view: { ...view, type, config: { ...view.config, options: { groupByPropertyId: 'groupId42' } } } }
    assert.equal(DatabaseViewRecordsResponseSchema.safeParse(opaque).success, true)
  }
})

test('timeline view responses validate timeline property semantics using the actual view type', () => {
  const due = { ...property, id: 'due-1', name: 'Due', type: 'date' }
  const timelineConfig = { ...view.config, options: { timeline: { dateSource: { mode: 'date-property', propertyId: 'due-1' } } } }
  const timelineView = { ...view, type: 'timeline', config: timelineConfig }
  const response = { database, view: timelineView, properties: [property, due], records: [], nextCursor: null }
  assert.equal(DatabaseViewRecordsResponseSchema.safeParse(response).success, true)
  const invalidTimeline = { ...response, view: { ...timelineView, config: { ...timelineConfig, options: { timeline: { dateSource: { mode: 'date-property', propertyId: 'missing' } } } } } }
  assert.equal(DatabaseViewRecordsResponseSchema.safeParse(invalidTimeline).success, false)
  const sameConfigBoard = { ...response, view: { ...timelineView, type: 'board' } }
  assert.equal(DatabaseViewRecordsResponseSchema.safeParse(sameConfigBoard).success, true)
})

test('database contracts accept exact property, row, filter, sort, and column-order limits', () => {
  const boundedProperties = [property, ...Array.from({ length: 99 }, (_, index) => ({
    ...property, id: `bounded-${index}`, name: `Bounded ${index}`, type: 'text',
  }))]
  const boundedRecord = { id: 'record-1', databaseId: 'db-1', workspaceId: 'ws-1', pageId: 'page-1', properties: { 'title-1': 'A task' }, version: 1, createdAt: timestamp, updatedAt: timestamp, pageVersion: timestamp }
  const records = Array.from({ length: 100 }, (_, index) => ({ ...boundedRecord, id: `record-${index}`, pageId: `page-${index}` }))
  const table = { database, view, properties: boundedProperties, records, nextCursor: null }
  assert.equal(DatabaseTableResponseSchema.safeParse(table).success, true)
  assert.equal(DatabaseTableResponseSchema.safeParse({ ...table, properties: [...boundedProperties, { ...property, id: 'property-101', type: 'text' }] }).success, false)
  assert.equal(DatabaseTableResponseSchema.safeParse({ ...table, records: [...records, { ...boundedRecord, id: 'record-101', pageId: 'page-101' }] }).success, false)

  const ids = Array.from({ length: 100 }, (_, index) => `property-${index}`)
  const config = {
    filters: Array.from({ length: 20 }, () => ({ propertyId: 'property-1', operator: 'is_empty' })),
    sorts: Array.from({ length: 10 }, (_, index) => ({ propertyId: `property-${index}`, direction: 'asc' })),
    visibleProperties: ids,
    propertyOrder: ids,
  }
  assert.equal(DatabaseViewConfigSchema.safeParse(config).success, true)
  assert.equal(DatabaseViewConfigSchema.safeParse({ ...config, filters: [...config.filters, config.filters[0]] }).success, false)
  assert.equal(DatabaseViewConfigSchema.safeParse({ ...config, sorts: [...config.sorts, { propertyId: 'extra-sort', direction: 'asc' }] }).success, false)
  assert.equal(DatabaseViewConfigSchema.safeParse({ ...config, visibleProperties: [...ids, 'extra-visible'] }).success, false)
  assert.equal(DatabaseViewConfigSchema.safeParse({ ...config, propertyOrder: [...ids, 'extra-order'] }).success, false)
})

test('advanced requests and projected values keep derived fields read-only', () => {
  const relation = { ...property, id: 'rel', name: 'Links', type: 'relation', config: { targetDatabaseId: 'db-2' } }
  const formula = { ...property, id: 'calc', name: 'Score', type: 'formula', config: { expression: { kind: 'literal', value: 2 }, resultType: 'number' } }
  const date = { ...property, id: 'due', name: 'Due', type: 'date' }
  assert.equal(DatabasePropertyCreateRequestSchema.safeParse({ id: 'rel', name: 'Links', type: 'relation', config: relation.config, expectedDatabaseVersion: 1 }).success, true)
  assert.equal(DatabasePropertyCreateRequestSchema.safeParse({ id: 'rel', name: 'Links', type: 'relation', expectedDatabaseVersion: 1 }).success, false)
  assert.equal(DatabaseRecordCellUpdateRequestSchema.safeParse({ value: ['r1', 'r2'], expectedDatabaseVersion: 1, expectedRecordVersion: 1 }).success, true)
  assert.equal(DatabaseRecordCellUpdateRequestSchema.safeParse({ value: ['r1', 'r1'], expectedDatabaseVersion: 1, expectedRecordVersion: 1 }).success, false)
  assert.equal(DatabaseRecordCreateRequestSchema.safeParse({ id: 'r1', pageId: 'p1', properties: { rel: Array.from({ length: 51 }, (_, i) => `r${i}`) } }).success, false)
  const dateRange = { start: '2026-01-05T23:30:00.000Z', end: '2026-01-06T01:00:00.000Z', timeZone: 'America/Los_Angeles' }
  const table = { database, view, properties: [property, relation, formula, date], records: [{ id: 'record-1', databaseId: 'db-1', workspaceId: 'ws-1', pageId: 'page-1', properties: { 'title-1': 'A task', rel: ['r1'], calc: 2, due: dateRange }, version: 1, createdAt: timestamp, updatedAt: timestamp, pageVersion: timestamp }], nextCursor: null }
  assert.equal(DatabaseTableResponseSchema.safeParse(table).success, true)
  assert.equal(DatabaseTableResponseSchema.safeParse({ ...table, records: [{ ...table.records[0], properties: { ...table.records[0].properties, calc: '2' } }] }).success, false)
  assert.equal(DatabaseTableResponseSchema.safeParse({ ...table, records: [{ ...table.records[0], properties: { ...table.records[0].properties, due: { ...dateRange, zone: 'UTC' } } }] }).success, false)
  const { pageVersion: _pageVersion, ...storedShape } = table.records[0]
  assert.equal(databaseRecordSchema(table.properties).safeParse({ ...storedShape, properties: { rel: ['r1'], calc: 2, due: dateRange } }).success, false)
})

test('relation picker contracts bound searches and title resolution', () => {
  assert.deepEqual(DatabaseRelationCandidatesQuerySchema.parse({ search: 'task' }), { search: 'task', limit: 50 })
  assert.equal(DatabaseRelationCandidatesQuerySchema.safeParse({ search: 'x'.repeat(201) }).success, false)
  assert.equal(DatabaseRelationCandidatesQuerySchema.safeParse({ limit: 51 }).success, false)
  const item = { recordId: 'r1', pageId: 'p1', title: 'Task' }
  assert.equal(DatabaseRelationCandidatesResponseSchema.safeParse({ items: [item], nextCursor: null }).success, true)
  assert.equal(DatabaseRelationTitlesRequestSchema.safeParse({ recordIds: ['r1', 'r1'] }).success, false)
  assert.equal(DatabaseRelationTitlesRequestSchema.safeParse({ recordIds: Array.from({ length: 51 }, (_, i) => `r${i}`) }).success, false)
  assert.equal(DatabaseRelationTitlesResponseSchema.safeParse({ items: [item] }).success, true)
})

test('advanced configs reject array or object enum values without coercion', () => {
  const { DatabasePropertyUpdateRequestSchema } = require('../dist/index.js')
  const version = { expectedDatabaseVersion: 1, expectedPropertyVersion: 1 }
  const configs = [
    { relationPropertyId: 'r', targetPropertyId: 'p', aggregation: ['sum'] },
    { relationPropertyId: 'r', targetPropertyId: 'p', aggregation: { toString: 'sum' } },
    { expression: { kind: 'literal', value: 2 }, resultType: ['number'] },
    { expression: { kind: 'binary', operator: ['+'], left: { kind: 'literal', value: 2 }, right: { kind: 'literal', value: 3 } }, resultType: 'boolean' },
    { expression: { kind: 'binary', operator: { toString: '+' }, left: { kind: 'literal', value: 2 }, right: { kind: 'literal', value: 3 } }, resultType: 'boolean' },
  ]
  for (const config of configs) {
    const result = DatabasePropertyUpdateRequestSchema.safeParse({ ...version, config })
    assert.equal(result.success, false)
    assert.equal(DatabasePropertyCreateRequestSchema.safeParse({ id: 'bad', name: 'Bad', type: Object.hasOwn(config, 'aggregation') ? 'rollup' : 'formula', config, expectedDatabaseVersion: 1 }).success, false)
  }
})
