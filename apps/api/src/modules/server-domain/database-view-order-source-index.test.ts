import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createConnection } from 'mongoose'
import {
  DATABASE_VIEW_ORDER_SOURCE_RECORD_INDEX,
  DatabaseViewOrderOverrideEntity,
  DatabaseViewOrderOverrideSchema,
} from './schemas/database-view-order.schema'

const configuredUri = process.env.P4_TEST_MONGODB_URI?.trim()
assert.ok(configuredUri, 'P4_TEST_MONGODB_URI must explicitly name an isolated MongoDB instance')
const uri = new URL(configuredUri)
uri.pathname = `/eotion_view_order_source_index_${randomUUID().replaceAll('-', '')}`

test('source/record covering index is index-only in both directions while source remains unique', async t => {
  const connection = await createConnection(uri.toString()).asPromise()
  t.after(async () => { try { await connection.dropDatabase() } finally { await connection.close() } })
  const model = connection.model(DatabaseViewOrderOverrideEntity.name, DatabaseViewOrderOverrideSchema)
  await model.init()
  const collection = model.collection
  const scope = { workspaceId: 'workspace', databaseId: 'database', orderScopeId: 'scope' }
  const indexes = await collection.indexes()
  const collectionInfo = await connection.db!.listCollections({ name: collection.collectionName }, { nameOnly: false }).next()
  assert.ok(collectionInfo)
  const defaultLocale = collectionInfo.options?.collation?.locale ?? 'simple'
  const effectiveLocale = (index: (typeof indexes)[number] | undefined) => index?.collation?.locale ?? defaultLocale
  const covering = indexes.find(index => index.name === DATABASE_VIEW_ORDER_SOURCE_RECORD_INDEX)
  assert.deepEqual(covering?.key, { workspaceId: 1, databaseId: 1, orderScopeId: 1, sourceCreationOrdinal: 1, recordId: 1 })
  assert.equal(covering?.unique, undefined)
  assert.equal(effectiveLocale(covering), 'simple')
  const uniqueSource = indexes.find(index => index.key?.sourceCreationOrdinal === 1 && index.key?.recordId === undefined)
  assert.equal(uniqueSource?.unique, true)
  assert.equal(effectiveLocale(uniqueSource), 'simple')

  const rows = [1, 3, 8].map(ordinal => ({ ...scope, sourceCreationOrdinal: ordinal, recordId: `record-${ordinal}`,
    joinKey: { ...scope, recordId: `record-${ordinal}` }, slotOrdinal: ordinal + 10, rank: '1' }))
  await collection.insertMany(rows)
  for (const sign of [1, -1] as const) {
    const filter = { ...scope, sourceCreationOrdinal: { $gte: 1, $lte: 8 } }
    const options = { projection: { _id: 0, sourceCreationOrdinal: 1, recordId: 1 },
      hint: DATABASE_VIEW_ORDER_SOURCE_RECORD_INDEX, collation: { locale: 'simple' } }
    const sort = { sourceCreationOrdinal: sign as 1 | -1, recordId: sign as 1 | -1 }
    const found = await collection.find(filter, options).sort(sort).toArray()
    assert.deepEqual(found, (sign === 1 ? rows : [...rows].reverse()).map(row => ({
      sourceCreationOrdinal: row.sourceCreationOrdinal, recordId: row.recordId,
    })))
    const explained = await collection.find(filter, options).sort(sort).explain('executionStats')
    assert.equal(explained.executionStats?.totalDocsExamined, 0, `direction ${sign} must be covered`)
    assert.equal(explained.executionStats?.totalKeysExamined, rows.length)
  }

  await assert.rejects(collection.insertOne({ ...scope, sourceCreationOrdinal: 3, recordId: 'another-record',
    joinKey: { ...scope, recordId: 'another-record' }, slotOrdinal: 99, rank: '1' }), /duplicate key/i)
})
