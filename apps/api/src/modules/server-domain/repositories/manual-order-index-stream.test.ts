import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compareViewOrderPosition } from '@eotion/domain'
import { ManualOrderIndexCorruptionError, readManualOrderDefaultIndexStream } from './manual-order-index-stream'
import type { ManualOrderDirection, ManualOrderKey, ManualOrderTuple } from './manual-order-index-stream'

type Row = { id: string; position: { slotOrdinal: number; rank: string } }
const tuple = (row: Row): ManualOrderTuple => ({ position: row.position, recordId: row.id })
const compare = (a: ManualOrderTuple, b: ManualOrderTuple) => compareViewOrderPosition(a.position, b.position)
  || Buffer.compare(Buffer.from(a.recordId, 'utf8'), Buffer.from(b.recordId, 'utf8'))

function harness(input: {
  records: ManualOrderKey[]; overrides?: Array<ManualOrderKey & { slotOrdinal: number; rank: string }>;
  direction?: ManualOrderDirection; take?: number; boundary?: ManualOrderTuple; remote?: ManualOrderTuple;
  excludeRecordId?: string; visible?: (id: string) => boolean; batchSize?: number; shortPages?: boolean;
}) {
  const direction = input.direction ?? 'after'
  const sign = direction === 'after' ? 1 : -1
  const records = [...input.records].sort((a, b) => sign * (a.ordinal - b.ordinal))
  const overrides = [...(input.overrides ?? [])].sort((a, b) => sign * (a.ordinal - b.ordinal))
  const calls = { verify: 0, filter: 0, recordFetch: 0, overrideFetch: 0, maxCandidates: 0,
    recordLimits: [] as number[], overrideLimits: [] as number[] }
  const fetch = (keys: ManualOrderKey[], kind: 'record' | 'override') => async (after: number | undefined, limit: number) => {
    if (kind === 'record') { calls.recordFetch++; calls.recordLimits.push(limit) }
    else { calls.overrideFetch++; calls.overrideLimits.push(limit) }
    const result = keys.filter(key => after === undefined || sign * (key.ordinal - after) > 0)
    return result.slice(0, input.shortPages ? Math.min(2, limit) : limit)
  }
  const overrideById = new Map(overrides.map(key => [key.recordId, key]))
  const run = () => readManualOrderDefaultIndexStream<Row>({
    direction, take: input.take ?? 10, ordinalRange: { min: 1, max: 10_000 },
    ...(input.boundary ? { boundary: input.boundary } : {}), ...(input.remote ? { remote: input.remote } : {}),
    ...(input.excludeRecordId ? { excludeRecordId: input.excludeRecordId } : {}),
    batchSize: input.batchSize ?? 3,
    fetchRecordKeys: fetch(records, 'record'), fetchOverrideKeys: fetch(overrides, 'override'),
    verifyDefaultCandidates: async keys => {
      calls.verify++
      calls.maxCandidates = Math.max(calls.maxCandidates, keys.length)
      for (const key of keys) if (overrideById.has(key.recordId)) throw new ManualOrderIndexCorruptionError('candidate acquired an override')
    },
    filterAndProject: async keys => {
      calls.filter++
      return keys.filter(key => input.visible?.(key.recordId) ?? true).reverse()
        .map(key => ({ id: key.recordId, position: { slotOrdinal: key.ordinal, rank: '1' } }))
    },
  })
  const oracle = () => {
    const source = new Map(overrides.map(key => [key.recordId, key]))
    return input.records.filter(key => !source.has(key.recordId)).map(key => ({ id: key.recordId, position: { slotOrdinal: key.ordinal, rank: '1' } }))
      .filter(row => row.id !== input.excludeRecordId && (input.visible?.(row.id) ?? true))
      .filter(row => !input.boundary || sign * compare(tuple(row), input.boundary) > 0)
      .filter(row => !input.remote || sign * compare(tuple(row), input.remote) <= 0)
      .sort((a, b) => sign * compare(tuple(a), tuple(b))).slice(0, input.take ?? 10)
  }
  return { run, oracle, calls }
}

test('forward and reverse scan retain same-slot tuple ordering with Unicode IDs', async () => {
  const records = [
    { ordinal: 1, recordId: 'a' }, { ordinal: 2, recordId: 'é' },
    { ordinal: 3, recordId: '中' }, { ordinal: 4, recordId: '😀' },
  ]
  const overrides = [{ ordinal: 1, recordId: 'a', slotOrdinal: 2, rank: '01' }]
  const boundaries: ManualOrderTuple[] = [
    { position: { slotOrdinal: 2, rank: '01' }, recordId: 'a' },
    { position: { slotOrdinal: 2, rank: '1' }, recordId: 'a' },
    { position: { slotOrdinal: 2, rank: '11' }, recordId: 'a' },
  ]
  for (const direction of ['after', 'before'] as const) for (const boundary of boundaries) {
    const h = harness({ records, overrides, direction, boundary, take: 3 })
    assert.deepEqual((await h.run()).rows, h.oracle())
  }
  const unicodeBoundary = { position: { slotOrdinal: 2, rank: '1' }, recordId: '中' }
  const h = harness({ records, direction: 'after', boundary: unicodeBoundary })
  assert.deepEqual((await h.run()).rows, h.oracle())
})

test('cursor and remote bounds retain their boundary slot in both directions', async () => {
  const records = Array.from({ length: 8 }, (_, index) => ({ ordinal: index + 1, recordId: `r${index + 1}` }))
  for (const direction of ['after', 'before'] as const) {
    const h = harness({ records, direction, boundary: { position: { slotOrdinal: 3, rank: '01' }, recordId: 'x' },
      remote: { position: { slotOrdinal: 6, rank: '11' }, recordId: 'x' }, excludeRecordId: 'r4' })
    assert.deepEqual((await h.run()).rows, h.oracle())
  }
})

test('short pages and fully filtered candidate batches continue to the real end', async () => {
  const records = Array.from({ length: 19 }, (_, index) => ({ ordinal: index * 3 + 1, recordId: `r${index}` }))
  const overrides = records.slice(0, 15).map((key, index) => ({ ...key, slotOrdinal: 100, rank: `0${index.toString(2)}1` }))
  const h = harness({ records, overrides, shortPages: true, batchSize: 4, take: 2, visible: id => id === 'r18' })
  const result = await h.run()
  assert.deepEqual(result.rows, h.oracle())
  assert.deepEqual(result.rows.map(row => row.id), ['r18'])
  assert.ok(h.calls.recordFetch > 4)
  assert.ok(h.calls.overrideFetch > 4)
  assert.ok(h.calls.filter > 1)
  assert.ok(h.calls.maxCandidates <= 4)
  assert.equal(result.debug.candidates, 4)
})

test('sparse filters grow key pages with candidate batches', async () => {
  const records = Array.from({ length: 1_000 }, (_, index) => ({ ordinal: index + 1, recordId: `r${index}` }))
  const h = harness({ records, take: 1, batchSize: 256, visible: id => id === 'r999' })
  assert.deepEqual((await h.run()).rows.map(row => row.id), ['r999'])
  assert.deepEqual(h.calls.recordLimits, [16, 16, 32, 64, 128, 256, 256, 256, 256])
  assert.equal(h.calls.recordFetch, 9, 'the final empty page proves true EOF')
  assert.equal(h.calls.overrideFetch, 1)
})

test('loose ordinal range stops past remote slot but checks its rank and ID', async () => {
  const records = Array.from({ length: 1_000 }, (_, index) => ({ ordinal: index + 1, recordId: `r${index + 1}` }))
  for (const direction of ['after', 'before'] as const) {
    const remote = direction === 'after'
      ? { position: { slotOrdinal: 3, rank: '01' }, recordId: 'r3' }
      : { position: { slotOrdinal: 998, rank: '11' }, recordId: 'r998' }
    const h = harness({ records, direction, remote, take: 50, batchSize: 16 })
    assert.deepEqual((await h.run()).rows, h.oracle())
    assert.equal(h.calls.recordFetch, 1, `one key page is enough for ${direction}`)
    assert.ok(h.calls.filter <= 1)
  }
})

test('many default gaps and repeated moves agree with complete sorting oracle', async () => {
  let seed = 0x1984abcd
  const next = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32)
  for (let sample = 0; sample < 50; sample++) {
    const records = Array.from({ length: 120 }, (_, index) => ({ ordinal: index * 2 + 1, recordId: `id-${index}` }))
    const moved = new Set<number>()
    for (let index = 0; index < 400; index++) moved.add(Math.floor(next() * records.length))
    const overrides = [...moved].map((index, order) => ({ ...records[index]!, slotOrdinal: 300 + order,
      rank: '1' }))
    for (const direction of ['after', 'before'] as const) {
      const slot = 1 + Math.floor(next() * 240)
      const hTake = 1 + Math.floor(next() * 15)
      const hBoundary = { position: { slotOrdinal: slot, rank: next() < 0.5 ? '01' : '11' }, recordId: 'id-30' }
      const h = harness({ records, overrides, direction, take: hTake, batchSize: 7,
        boundary: hBoundary,
        visible: id => Number(id.slice(3)) % 3 === 0 })
      const defaults = (await h.run()).rows
      assert.deepEqual(defaults, h.oracle(), `default sample ${sample} ${direction}`)
      const sign = direction === 'after' ? 1 : -1
      const movedRows = overrides.map(key => ({ id: key.recordId, position: { slotOrdinal: key.slotOrdinal, rank: key.rank } }))
        .filter(row => Number(row.id.slice(3)) % 3 === 0)
        .filter(row => sign * compare(tuple(row), hBoundary) > 0)
      const merged = [...defaults, ...movedRows].sort((a, b) => sign * compare(tuple(a), tuple(b))).slice(0, hTake)
      const byMove = new Map(overrides.map(key => [key.recordId, key]))
      const fullOracle = records.map(key => {
        const move = byMove.get(key.recordId)
        return { id: key.recordId, position: move ? { slotOrdinal: move.slotOrdinal, rank: move.rank }
          : { slotOrdinal: key.ordinal, rank: '1' } }
      }).filter(row => Number(row.id.slice(3)) % 3 === 0 && sign * compare(tuple(row), hBoundary) > 0)
        .sort((a, b) => sign * compare(tuple(a), tuple(b))).slice(0, hTake)
      assert.deepEqual(merged, fullOracle, `full order sample ${sample} ${direction}`)
    }
  }
})

test('wrong source identity, orphan source, and candidate verification fail closed', async () => {
  const records = [{ ordinal: 1, recordId: 'a' }, { ordinal: 3, recordId: 'b' }]
  await assert.rejects(harness({ records, overrides: [{ ordinal: 1, recordId: 'b', slotOrdinal: 9, rank: '1' }] }).run(),
    /source Record identity differs/)
  await assert.rejects(harness({ records, overrides: [{ ordinal: 2, recordId: 'ghost', slotOrdinal: 9, rank: '1' }] }).run(),
    /source has no Record/)
  await assert.rejects(harness({ records, overrides: [{ ordinal: 4, recordId: 'ghost', slotOrdinal: 9, rank: '1' }] }).run(),
    /source has no Record/)
  await assert.rejects(readManualOrderDefaultIndexStream<Row>({ direction: 'after', take: 1, ordinalRange: { min: 1, max: 3 },
    fetchRecordKeys: async after => after === undefined ? [{ ordinal: 1, recordId: 'a' }] : [],
    fetchOverrideKeys: async () => [],
    verifyDefaultCandidates: async () => { throw new ManualOrderIndexCorruptionError('candidate acquired an override') },
    filterAndProject: async () => [] }), /candidate acquired an override/)
})

test('callback errors and invalid projection are never swallowed', async () => {
  const base = { direction: 'after' as const, take: 1, ordinalRange: { min: 1, max: 2 },
    fetchRecordKeys: async (after: number | undefined) => after === undefined ? [{ ordinal: 1, recordId: 'a' }] : [],
    fetchOverrideKeys: async () => [], verifyDefaultCandidates: async () => {} }
  await assert.rejects(readManualOrderDefaultIndexStream({ ...base,
    filterAndProject: async () => [{ id: 'other', position: { slotOrdinal: 1, rank: '1' } }] }), /projected default row/)
  await assert.rejects(readManualOrderDefaultIndexStream({ ...base,
    filterAndProject: async () => { throw new Error('read failed') } }), /read failed/)
})
