import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { test } from 'node:test'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { getConnectionToken, getModelToken, MongooseModule } from '@nestjs/mongoose'
import type { Connection, Model } from 'mongoose'
import type { DatabaseViewConfig } from '@eotion/domain'
import { ServerDomainModule } from './server-domain.module'
import { DatabaseEntity } from './schemas/database.schema'
import { DatabasePropertyEntity } from './schemas/database-property.schema'
import { DatabaseRecordEntity } from './schemas/database-record.schema'
import { DatabaseViewEntity } from './schemas/database-view.schema'
import { PageEntity } from './schemas/page.schema'
import { DatabaseService } from './services/database.service'
import { AuthService } from './services/auth.service'
import { PageService } from './services/page.service'
import { WorkspaceService } from './services/workspace.service'

const uri = new URL(process.env.P4_TEST_MONGODB_URI?.trim() || 'mongodb://127.0.0.1:27017')
const databaseName = `eotion_database_perf_${randomUUID().replaceAll('-', '')}`
uri.pathname = `/${databaseName}`

@Module({ imports: [MongooseModule.forRoot(uri.toString()), ServerDomainModule] })
class DatabasePerformanceTestModule {}

type ProfileEntry = {
  ns?: string
  millis?: number
  planSummary?: string
  usedDisk?: boolean
  docsExamined?: number
  keysExamined?: number
  nreturned?: number
  command?: Record<string, unknown> & { pipeline?: Array<Record<string, unknown>> }
  originatingCommand?: Record<string, unknown> & { pipeline?: Array<Record<string, unknown>> }
}

const summarizeFilter = (filter: unknown) => {
  if (!filter || typeof filter !== 'object' || Array.isArray(filter)) return null
  return Object.fromEntries(Object.entries(filter as Record<string, unknown>).map(([key, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [key, typeof value]
    return [key, Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([operator, operand]) => [operator, Array.isArray(operand) ? `array(${operand.length})` : typeof operand]))]
  }))
}

const stageNames = (entry: ProfileEntry): string[] => {
  const pipeline = entry.command?.pipeline ?? entry.originatingCommand?.pipeline ?? []
  return pipeline.flatMap(stage => Object.keys(stage))
}

const summarizeProfile = (rows: ProfileEntry[]) => {
  const namespaces = new Map<string, { millis: number; docsExamined: number; keysExamined: number; nreturned: number; aggregateStages: Set<string> }>()
  for (const row of rows) {
    const namespace = row.ns ?? 'unavailable'
    const summary = namespaces.get(namespace) ?? { millis: 0, docsExamined: 0, keysExamined: 0, nreturned: 0, aggregateStages: new Set<string>() }
    summary.millis += row.millis ?? 0
    summary.docsExamined += row.docsExamined ?? 0
    summary.keysExamined += row.keysExamined ?? 0
    summary.nreturned += row.nreturned ?? 0
    stageNames(row).forEach(stage => summary.aggregateStages.add(stage))
    namespaces.set(namespace, summary)
  }
  return Object.fromEntries([...namespaces.entries()].map(([namespace, summary]) => [namespace, {
    ...summary,
    aggregateStages: [...summary.aggregateStages],
  }]))
}

const explainSummary = (value: unknown): { stages: string[]; totalDocsExamined: number } => {
  const stages: string[] = []
  let totalDocsExamined = 0
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    const record = node as Record<string, unknown>
    if (typeof record.stage === 'string') stages.push(record.stage)
    if (typeof record.totalDocsExamined === 'number') totalDocsExamined = Math.max(totalDocsExamined, record.totalDocsExamined)
    for (const child of Object.values(record)) {
      if (Array.isArray(child)) child.forEach(visit)
      else visit(child)
    }
  }
  visit(value)
  return { stages: [...new Set(stages)], totalDocsExamined }
}

test('P8.6 database Mongo performance acceptance at 5k and 10k records', async t => {
  const app = await NestFactory.createApplicationContext(DatabasePerformanceTestModule, { logger: false })
  const connection = app.get<Connection>(getConnectionToken())
  const databases = app.get(DatabaseService)
  const auth = app.get(AuthService)
  const pages = app.get(PageService)
  const workspaces = app.get(WorkspaceService)
  const databaseModel = app.get<Model<unknown>>(getModelToken(DatabaseEntity.name))
  const propertyModel = app.get<Model<unknown>>(getModelToken(DatabasePropertyEntity.name))
  const recordModel = app.get<Model<unknown>>(getModelToken(DatabaseRecordEntity.name))
  const viewModel = app.get<Model<unknown>>(getModelToken(DatabaseViewEntity.name))
  const pageModel = app.get<Model<unknown>>(getModelToken(PageEntity.name))
  await Promise.all([databaseModel.init(), propertyModel.init(), recordModel.init(), viewModel.init(), pageModel.init()])
  let profilerEnabled = false
  let profilerAvailable = false
  try {
    await connection.db!.command({ profile: 2, slowms: 0 })
    profilerEnabled = true
    profilerAvailable = true
  } catch (error) {
    console.log(`[P8.6 perf] profiler unavailable: ${error instanceof Error ? error.message : String(error)}`)
  }
  t.after(async () => {
    try {
      if (profilerEnabled) await connection.db!.command({ profile: 0 })
      await connection.dropDatabase()
    } finally {
      await app.close()
    }
  })

  const owner = await auth.register(`database-perf-${randomUUID()}@example.com`, 'correct horse battery staple')
  const workspaceId = `perf-ws-${randomUUID()}`
  const homePageId = `perf-home-${randomUUID()}`
  await workspaces.create(owner.id, { id: workspaceId, name: 'Database performance acceptance' })
  await pages.create(owner.id, workspaceId, { id: homePageId, parentPageId: null, title: 'Performance fixture', orderKey: 'a' })
  const measurements: Array<Record<string, unknown>> = []

  const measure = async <T>(label: string, operation: () => Promise<T>): Promise<T> => {
    const profileCollection = connection.db!.collection<ProfileEntry>('system.profile')
    const previousProfile = profilerAvailable
      ? await profileCollection.find({}, { projection: { ts: 1 } }).sort({ ts: -1 }).limit(1).next() as (ProfileEntry & { ts?: Date }) | null
      : null
    if (previousProfile?.ts) await new Promise(resolve => setTimeout(resolve, 2))
    const startedAt = previousProfile?.ts ?? new Date()
    const start = performance.now()
    const result = await operation()
    const elapsedMs = Number((performance.now() - start).toFixed(2))
    let profile: Record<string, unknown> = { operations: 'unavailable' }
    if (profilerAvailable) {
      const rows = await profileCollection.find({ ts: { $gt: startedAt }, ns: { $regex: `^${databaseName}\\.` } }).toArray()
      profile = {
        operations: rows.length,
        byNamespace: summarizeProfile(rows),
        databaseAndPageQueries: rows
          .filter(row => row.ns?.endsWith('.database_records') || row.ns?.endsWith('.pages'))
          .map(row => ({
            collection: row.ns?.split('.').at(-1),
            operation: Object.keys(row.command ?? {}).find(key => ['find', 'aggregate', 'getMore', 'count'].includes(key)) ?? 'other',
            planSummary: row.planSummary ?? null,
            usedDisk: row.usedDisk ?? null,
            filter: summarizeFilter(row.command?.filter ?? row.originatingCommand?.filter),
            docsExamined: row.docsExamined ?? 0,
            keysExamined: row.keysExamined ?? 0,
            nreturned: row.nreturned ?? 0,
          })),
      }
    }
    const entry = { operation: label, elapsedMs, profile }
    measurements.push(entry)
    console.log(`[P8.6 perf] ${JSON.stringify(entry)}`)
    return result
  }

  const setConfig = async (databaseId: string, viewId: string, config: DatabaseViewConfig) => {
    const database = (await databases.find(owner.id, workspaceId, databaseId))!
    const view = (await databases.listViews(owner.id, workspaceId, databaseId)).find(item => item.id === viewId)!
    return databases.updateView(owner.id, workspaceId, databaseId, viewId, {
      config,
      expectedDatabaseVersion: database.version,
      expectedViewVersion: view.version,
    })
  }

  for (const size of [5_000, 10_000]) {
    const suffix = `${size}-${randomUUID()}`
    const databaseId = `perf-db-${suffix}`
    const viewId = `perf-view-${suffix}`
    const titleId = `perf-title-${suffix}`
    const homeId = homePageId
    const created = await databases.createInPage(owner.id, workspaceId, homeId, {
      id: databaseId, name: `Performance ${size}`, titlePropertyId: titleId, viewId, blockId: `perf-block-${suffix}`, orderKey: `perf-${size}`, parentBlockId: null,
    })
    const text = await databases.createProperty(owner.id, workspaceId, databaseId, { id: `perf-text-${suffix}`, name: 'Text', type: 'text', expectedDatabaseVersion: created.database.version })
    const number = await databases.createProperty(owner.id, workspaceId, databaseId, { id: `perf-number-${suffix}`, name: 'Number', type: 'number', expectedDatabaseVersion: text.database.version })
    const checkbox = await databases.createProperty(owner.id, workspaceId, databaseId, { id: `perf-checkbox-${suffix}`, name: 'Checkbox', type: 'checkbox', expectedDatabaseVersion: number.database.version })
    const select = await databases.createProperty(owner.id, workspaceId, databaseId, { id: `perf-select-${suffix}`, name: 'Select', type: 'select', options: [{ id: 'even', name: 'Even' }, { id: 'odd', name: 'Odd' }], expectedDatabaseVersion: checkbox.database.version })
    const date = await databases.createProperty(owner.id, workspaceId, databaseId, { id: `perf-date-${suffix}`, name: 'Date', type: 'date', expectedDatabaseVersion: select.database.version })
    const relation = await databases.createProperty(owner.id, workspaceId, databaseId, { id: `perf-relation-${suffix}`, name: 'Related', type: 'relation', config: { targetDatabaseId: databaseId }, expectedDatabaseVersion: date.database.version })
    const ids = Array.from({ length: size }, (_, index) => `perf-row-${suffix}-${String(index).padStart(5, '0')}`)
    const timestamp = new Date()
    for (let offset = 0; offset < size; offset += 1000) {
      const end = Math.min(offset + 1000, size)
      const pageRows = Array.from({ length: end - offset }, (_, localIndex) => {
        const index = offset + localIndex
        const id = ids[index]!
        return { id: `perf-page-${suffix}-${String(index).padStart(5, '0')}`, workspaceId, parentPageId: null, title: `Row ${String(index).padStart(5, '0')}`, orderKey: String(index).padStart(8, '0'), version: 1, createdAt: timestamp, updatedAt: timestamp }
      })
      const recordRows = Array.from({ length: end - offset }, (_, localIndex) => {
        const index = offset + localIndex
        const linkedIds = index < 100 ? ids.slice((index % 100) * 50, (index % 100) * 50 + 50) : []
        return {
          id: ids[index]!, workspaceId, databaseId, pageId: `perf-page-${suffix}-${String(index).padStart(5, '0')}`,
          properties: {
            [text.property.id]: `text-${index % 100}`,
            [number.property.id]: index + 1,
            [checkbox.property.id]: index % 2 === 0,
            [select.property.id]: index % 2 === 0 ? 'even' : 'odd',
            [date.property.id]: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
            [relation.property.id]: linkedIds,
          }, version: 1, createdAt: timestamp, updatedAt: timestamp,
        }
      })
      await pageModel.insertMany(pageRows, { ordered: true })
      await recordModel.insertMany(recordRows, { ordered: true })
    }

    const navigationPages = await measure(`${size}: sidebar page tree`, () => pages.listNavigation(owner.id, workspaceId))
    assert.deepEqual(navigationPages.map(page => page.id), [homePageId], 'record count must not expand the sidebar')
    const navigationDatabases = await databases.listNavigationWindow(owner.id, workspaceId, { limit: 10 })
    assert.equal(navigationDatabases.items.length, size === 5_000 ? 1 : 2)
    assert.equal(navigationDatabases.items.find(item => item.id === databaseId)?.parentPageId, homePageId)
    assert.ok(await pages.find(owner.id, workspaceId, `perf-page-${suffix}-00000`), 'legacy record pages remain directly accessible')

    const tableConfig = { filters: [], sorts: [], visibleProperties: null, propertyOrder: null } satisfies DatabaseViewConfig
    const defaultPage = await measure(`${size}: default table first page`, () => databases.getTable(owner.id, workspaceId, databaseId, viewId, { limit: 100 }))
    assert.equal(defaultPage.records.length, 100)
    assert.ok(defaultPage.nextCursor)
    const defaultNext = await measure(`${size}: default table next page`, () => databases.getTable(owner.id, workspaceId, databaseId, viewId, { limit: 100, cursor: defaultPage.nextCursor! }))
    assert.equal(defaultNext.records.length, 100)
    assert.equal(new Set([...defaultPage.records, ...defaultNext.records].map(row => row.id)).size, 200)
    await measure(`${size}: default query explain`, async () => {
      try {
        const explained = await recordModel.find({ workspaceId, databaseId }).sort({ id: 1 }).limit(101).explain('executionStats')
        const summary = explainSummary(explained)
        console.log(`[P8.6 perf] ${size}: default explain ${JSON.stringify(summary)}`)
        return summary
      } catch (error) {
        const unavailable = { stages: ['unavailable'], totalDocsExamined: -1, reason: error instanceof Error ? error.message : String(error) }
        console.log(`[P8.6 perf] ${size}: default explain ${JSON.stringify(unavailable)}`)
        return unavailable
      }
    })

    const filterConfig: DatabaseViewConfig = { ...tableConfig, filters: [{ propertyId: number.property.id, operator: 'gt', value: size / 2 }] }
    await setConfig(databaseId, viewId, filterConfig)
    const filtered = await measure(`${size}: Filter`, () => databases.getTable(owner.id, workspaceId, databaseId, viewId, { limit: 100 }))
    assert.equal(filtered.records.length, 100)
    assert.ok(filtered.records.every(row => (row.properties[number.property.id] as number) > size / 2))

    const sortConfig: DatabaseViewConfig = { ...tableConfig, sorts: [{ propertyId: number.property.id, direction: 'desc' }, { propertyId: titleId, direction: 'asc' }] }
    await setConfig(databaseId, viewId, sortConfig)
    const sorted = await measure(`${size}: two-level Sort`, () => databases.getTable(owner.id, workspaceId, databaseId, viewId, { limit: 100 }))
    assert.equal(sorted.records.length, 100)
    assert.deepEqual(sorted.records.slice(0, 3).map(row => row.properties[number.property.id]), [size, size - 1, size - 2])

    await setConfig(databaseId, viewId, { ...sortConfig, filters: filterConfig.filters })
    const filteredSorted = await measure(`${size}: Filter + Sort`, () => databases.getTable(owner.id, workspaceId, databaseId, viewId, { limit: 100 }))
    assert.equal(filteredSorted.records.length, 100)
    assert.deepEqual(filteredSorted.records.slice(0, 3).map(row => row.properties[number.property.id]), [size, size - 1, size - 2])

    if (size === 5_000) {
      const candidates = await measure(`${size}: Relation candidate search`, () => databases.listRecordOptions(owner.id, workspaceId, databaseId, { search: 'Row', limit: 50 }))
      assert.equal(candidates.items.length, 50)
      assert.ok(candidates.nextCursor)
    } else {
      await measure(`${size}: Relation candidate search over-bound`, async () => {
        await assert.rejects(databases.listRecordOptions(owner.id, workspaceId, databaseId, { search: 'Row', limit: 50 }), /maximum of 5000 candidate records/)
      })
    }
    const resolvedIds = ids.slice(size - 50)
    const resolved = await measure(`${size}: resolve 50 relation titles`, () => databases.resolveRecordOptions(owner.id, workspaceId, databaseId, { recordIds: resolvedIds }))
    assert.equal(resolved.items.length, 50)
    assert.ok(resolved.items.every(item => item.title.startsWith('Row ')))

    const rollup = await databases.createProperty(owner.id, workspaceId, databaseId, { id: `perf-rollup-${suffix}`, name: 'Related total', type: 'rollup', config: { relationPropertyId: relation.property.id, targetPropertyId: number.property.id, aggregation: 'sum' }, expectedDatabaseVersion: (await databases.find(owner.id, workspaceId, databaseId))!.version })
    const formula = await databases.createProperty(owner.id, workspaceId, databaseId, { id: `perf-formula-${suffix}`, name: 'Double total', type: 'formula', config: { expression: { kind: 'binary', operator: '*', left: { kind: 'property', propertyId: rollup.property.id }, right: { kind: 'literal', value: 2 } }, resultType: 'number' }, expectedDatabaseVersion: rollup.database.version })
    await setConfig(databaseId, viewId, tableConfig)
    const derived = await measure(`${size}: derived table 100 rows / 5000 linked targets`, () => databases.getTable(owner.id, workspaceId, databaseId, viewId, { limit: 100 }))
    assert.equal(derived.records.length, 100)
    assert.equal((derived.records[0]!.properties[rollup.property.id] as number), 1_275)
    assert.equal((derived.records[0]!.properties[formula.property.id] as number), 2_550)
    assert.equal((derived.records[99]!.properties[rollup.property.id] as number), 248_775)
    assert.equal((derived.records[99]!.properties[formula.property.id] as number), 497_550)

    const cleanupProperty = await databases.createProperty(owner.id, workspaceId, databaseId, { id: `perf-cleanup-${suffix}`, name: 'Cleanup', type: 'text', expectedDatabaseVersion: (await databases.find(owner.id, workspaceId, databaseId))!.version })
    await measure(`${size}: property cleanup`, () => databases.deleteProperty(owner.id, workspaceId, databaseId, cleanupProperty.property.id, { expectedDatabaseVersion: cleanupProperty.database.version, expectedPropertyVersion: cleanupProperty.property.version }))

    const targetId = ids[0]!
    const targetBefore = await databases.getTable(owner.id, workspaceId, databaseId, viewId, { limit: 100 })
    const targetRecord = targetBefore.records.find(row => row.id === targetId)
    assert.ok(targetRecord)
    const beforeTargetCleanupDatabase = (await databases.find(owner.id, workspaceId, databaseId))!
    await measure(`${size}: Relation target cleanup`, () => databases.deleteRecord(owner.id, workspaceId, databaseId, targetId, { expectedDatabaseVersion: beforeTargetCleanupDatabase.version, expectedRecordVersion: targetRecord.version }))
    assert.equal(await recordModel.findOne({ workspaceId, databaseId, id: targetId }).lean(), null)
    assert.equal(await recordModel.findOne({ workspaceId, databaseId, [`properties.${relation.property.id}`]: targetId }).lean(), null)

    if (size === 10_000) {
      const extras = ['cleanup-over-bound-a', 'cleanup-over-bound-b'].map(id => ({ id: `${id}-${suffix}`, workspaceId, databaseId, pageId: `${id}-page-${suffix}`, properties: {}, version: 1, createdAt: timestamp, updatedAt: timestamp }))
      await recordModel.insertMany(extras, { ordered: true })
      const overflowProperty = await databases.createProperty(owner.id, workspaceId, databaseId, { id: `perf-cleanup-overflow-${suffix}`, name: 'Cleanup overflow', type: 'text', expectedDatabaseVersion: (await databases.find(owner.id, workspaceId, databaseId))!.version })
      const beforeOverflowPropertyDelete = (await databases.find(owner.id, workspaceId, databaseId))!
      await measure(`${size}: property cleanup over-bound fail-closed`, async () => {
        await assert.rejects(databases.deleteProperty(owner.id, workspaceId, databaseId, overflowProperty.property.id, { expectedDatabaseVersion: beforeOverflowPropertyDelete.version, expectedPropertyVersion: overflowProperty.property.version }), /maximum of 10000 records for property cleanup/)
      })
      assert.equal((await databases.find(owner.id, workspaceId, databaseId))?.version, beforeOverflowPropertyDelete.version, 'over-bound property cleanup rolls back its Database version bump')
      assert.ok((await databases.listProperties(owner.id, workspaceId, databaseId)).some(property => property.id === overflowProperty.property.id), 'over-bound property cleanup leaves its Property intact')
      const dependentTargetId = ids[51]!
      const dependentRecord = await recordModel.findOne({ workspaceId, databaseId, id: dependentTargetId }).lean() as { version: number } | null
      assert.ok(dependentRecord)
      const beforeOverBoundDelete = (await databases.find(owner.id, workspaceId, databaseId))!
      await measure(`${size}: Relation cleanup over-bound fail-closed`, async () => {
        await assert.rejects(databases.deleteRecord(owner.id, workspaceId, databaseId, dependentTargetId, { expectedDatabaseVersion: beforeOverBoundDelete.version, expectedRecordVersion: dependentRecord.version }), /maximum of 10000 scanned records/)
      })
      assert.ok(await recordModel.findOne({ workspaceId, databaseId, id: dependentTargetId }).lean(), 'over-bound cleanup leaves its target record intact')
      assert.ok(await recordModel.findOne({ workspaceId, databaseId, id: ids[1]!, [`properties.${relation.property.id}`]: dependentTargetId }).lean(), 'over-bound cleanup leaves incoming Relation values intact')
      await recordModel.deleteMany({ workspaceId, databaseId, id: { $in: extras.map(row => row.id) } })
    }

    if (profilerAvailable) {
      const profile = await connection.db!.collection<ProfileEntry>('system.profile').find({ ns: { $regex: `^${databaseName}\\.` } }).toArray()
      const summary = { operations: profile.length, byNamespace: summarizeProfile(profile) }
      console.log(`[P8.6 perf] ${size}: profiler cumulative ${JSON.stringify(summary)}`)
    }
    assert.equal((await databases.find(owner.id, workspaceId, databaseId))?.id, databaseId)
  }

  assert.equal(measurements.length > 0, true)
})
