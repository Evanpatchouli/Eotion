const assert = require('node:assert/strict')
const test = require('node:test')
const ts = require('typescript')

require.extensions['.ts'] = (module, filename) => {
  const source = require('node:fs').readFileSync(filename, 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  module._compile(compiled, filename)
}

const { SqliteLocalStore } = require('./sqlite-store.ts')
const { buildPageTree, flattenPageTree } = require('../../../web/src/utils/pageTree.ts')

const WORKSPACE_ID = 'benchmark-workspace'
const PAGE_COUNTS = [0, 1_000, 5_000, 10_000]
const RUNS = 3
const NAVIGATION_SQL = "SELECT document FROM pages WHERE json_extract(document, '$.workspaceId') = ? AND (json_extract(document, '$.role') IS NULL OR json_extract(document, '$.role') <> 'database-record') ORDER BY id"

function page(index, role) {
  return {
    id: `page-${String(index).padStart(5, '0')}`,
    workspaceId: WORKSPACE_ID,
    parentPageId: null,
    orderKey: String(index).padStart(5, '0'),
    title: `Benchmark page ${index}`,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...(role ? { role } : {}),
  }
}

function percentileMedian(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function summarize(values) {
  return {
    minMs: Number(Math.min(...values).toFixed(3)),
    medianMs: Number(percentileMedian(values).toFixed(3)),
    maxMs: Number(Math.max(...values).toFixed(3)),
  }
}

async function timeRuns(action) {
  const times = []
  let value
  for (let run = 0; run < RUNS; run += 1) {
    const startedAt = process.hrtime.bigint()
    value = await action()
    times.push(Number(process.hrtime.bigint() - startedAt) / 1_000_000)
  }
  return { timing: summarize(times), value }
}

function queryPlan(database, sql) {
  return database.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(WORKSPACE_ID)
    .map((row) => row.detail)
}

function planIndex(details) {
  return details.find((detail) => /USING (?:COVERING )?INDEX/.test(detail)) ?? 'none'
}

// SQLite EXPLAIN QUERY PLAN has no actual row-visit counter. This only reports
// the known workspace fixture rows relevant to the displayed plan.
function workspaceCandidateCountFromPlan(details, totalPages, workspacePages) {
  const detail = details.join(' ')
  if (/SCAN pages\b/.test(detail)) return totalPages
  if (/SEARCH pages USING INDEX navigation_pages_by_workspace/.test(detail)) return workspacePages
  return null
}

async function benchmarkCase(recordCount, fixture) {
  const store = new SqliteLocalStore(':memory:')
  try {
    const database = store.database
    const insert = database.prepare('INSERT INTO pages (id, document) VALUES (?, ?)')
    const isRoleAware = fixture !== 'legacy-roleless-raw'
    database.exec('BEGIN')
    try {
      for (let index = 0; index < 50 + recordCount; index += 1) {
        const isRecord = index >= 50
        const role = isRecord && isRoleAware ? 'database-record' : undefined
        const value = page(index, role)
        insert.run(value.id, JSON.stringify(value))
      }
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }

    const totalPages = 50 + recordCount
    const expectedNavigationCount = fixture === 'legacy-roleless-raw' ? totalPages : 50
    const listSql = 'SELECT document FROM pages ORDER BY id'
    const listPlan = database.prepare(`EXPLAIN QUERY PLAN ${listSql}`).all().map((row) => row.detail)
    const navigationPlan = queryPlan(database, NAVIGATION_SQL)
    const listWorkspaceCandidates = workspaceCandidateCountFromPlan(listPlan, totalPages, totalPages)
    const navigationWorkspaceCandidates = workspaceCandidateCountFromPlan(navigationPlan, totalPages, totalPages)

    let jsonParseCount = 0
    const originalParse = JSON.parse
    JSON.parse = function countedParse(...args) {
      jsonParseCount += 1
      return originalParse.apply(this, args)
    }
    let listResult
    let navigationResult
    try {
      const list = await timeRuns(() => store.listPagesByWorkspace(WORKSPACE_ID))
      const listParseCount = jsonParseCount
      jsonParseCount = 0
      const navigation = await timeRuns(() => store.listNavigationPagesByWorkspace(WORKSPACE_ID))
      const navigationParseCount = jsonParseCount
      listResult = { ...list, parseCount: listParseCount / RUNS }
      navigationResult = { ...navigation, parseCount: navigationParseCount / RUNS }
    } finally {
      JSON.parse = originalParse
    }

    assert.equal(listResult.value.length, totalPages)
    assert.equal(navigationResult.value.length, expectedNavigationCount)
    const tree = await timeRuns(() => {
      const nodes = buildPageTree(navigationResult.value)
      return flattenPageTree(nodes, new Set(navigationResult.value.map(({ id }) => id)))
    })
    assert.equal(tree.value.length, expectedNavigationCount)

    return {
      fixture,
      recordPages: recordCount,
      targetWorkspacePages: totalPages,
      runs: RUNS,
      listPagesByWorkspace: {
        returnedCount: listResult.value.length,
        workspaceCandidateCountFromPlan: listWorkspaceCandidates,
        parseCountPerRun: listResult.parseCount,
        materializedCountPerRun: listResult.parseCount,
        ...listResult.timing,
      },
      listNavigationPagesByWorkspace: {
        returnedCount: navigationResult.value.length,
        workspaceCandidateCountFromPlan: navigationWorkspaceCandidates,
        parseCountPerRun: navigationResult.parseCount,
        materializedCountPerRun: navigationResult.parseCount,
        navigationCount: navigationResult.value.length,
        ...navigationResult.timing,
      },
      pageTreeBuildAndFlatten: {
        returnedCount: tree.value.length,
        ...tree.timing,
      },
      queryPlans: {
        listPagesByWorkspace: { detail: listPlan, index: planIndex(listPlan), usesTempBTree: listPlan.some((line) => line.includes('USE TEMP B-TREE')) },
        listNavigationPagesByWorkspace: { detail: navigationPlan, index: planIndex(navigationPlan), usesTempBTree: navigationPlan.some((line) => line.includes('USE TEMP B-TREE')) },
      },
    }
  } finally {
    store.close()
  }
}

test('benchmark isolated SQLite page reads and shared PageTree for role-aware and legacy snapshots', async () => {
  const results = []
  for (const recordCount of PAGE_COUNTS) {
    for (const fixture of ['new-role', 'legacy-roleless-raw', 'legacy-server-snapshot-projected']) {
      results.push(await benchmarkCase(recordCount, fixture))
    }
  }
  console.log(`SQLite page benchmark (milliseconds; each metric uses ${RUNS} runs):\n${JSON.stringify(results, null, 2)}`)
})
