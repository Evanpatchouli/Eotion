import { compareViewOrderPosition, isViewOrderRank } from '@eotion/domain'

export type ManualOrderDirection = 'after' | 'before'
export type ManualOrderKey = { ordinal: number; recordId: string }
export type ManualOrderTuple = { position: { slotOrdinal: number; rank: string }; recordId: string }
export type ManualOrderDefaultRow = { id: string; position: { slotOrdinal: number; rank: string } }

export class ManualOrderIndexCorruptionError extends Error {
  constructor(message: string) {
    super(`Manual order index corruption: ${message}`)
    this.name = 'ManualOrderIndexCorruptionError'
  }
}

export type ManualOrderIndexStreamInput<Row extends ManualOrderDefaultRow> = {
  direction: ManualOrderDirection
  take: number
  ordinalRange: { min: number; max: number }
  boundary?: ManualOrderTuple
  remote?: ManualOrderTuple
  excludeRecordId?: string
  batchSize?: number
  // Both callbacks use an exclusive ordinal cursor in the requested direction.
  // They must use the same database/session/scope and return keys in strict order.
  fetchRecordKeys: (afterOrdinal: number | undefined, limit: number) => Promise<readonly ManualOrderKey[]>
  fetchOverrideKeys: (afterOrdinal: number | undefined, limit: number) => Promise<readonly ManualOrderKey[]>
  // Must fail if a candidate acquired an override or its source identity is corrupt.
  verifyDefaultCandidates: (keys: readonly ManualOrderKey[]) => Promise<void>
  // Must apply the exact group, record, page, and title predicates before projection.
  filterAndProject: (keys: readonly ManualOrderKey[]) => Promise<readonly Row[]>
}

export type ManualOrderIndexStreamResult<Row extends ManualOrderDefaultRow> = {
  rows: Row[]
  debug: { recordKeys: number; overrideKeys: number; recordBatches: number; overrideBatches: number; candidateBatches: number; candidates: number }
}

function compareTuple(left: ManualOrderTuple, right: ManualOrderTuple): number {
  return compareViewOrderPosition(left.position, right.position)
    || Buffer.compare(Buffer.from(left.recordId, 'utf8'), Buffer.from(right.recordId, 'utf8'))
}

function assertTuple(value: ManualOrderTuple | undefined, name: string): void {
  if (value === undefined) return
  if (!value || !Number.isSafeInteger(value.position?.slotOrdinal) || value.position.slotOrdinal < 0
    || !isViewOrderRank(value.position.rank) || typeof value.recordId !== 'string' || !value.recordId) {
    throw new TypeError(`Invalid ${name} manual order tuple`)
  }
}

/** Reads only index keys for covered records; projection happens only for defaults. */
export async function readManualOrderDefaultIndexStream<Row extends ManualOrderDefaultRow>(
  input: ManualOrderIndexStreamInput<Row>,
): Promise<ManualOrderIndexStreamResult<Row>> {
  const { min, max } = input.ordinalRange
  if (input.direction !== 'after' && input.direction !== 'before') throw new TypeError('Invalid manual order direction')
  if (!Number.isSafeInteger(input.take) || input.take < 1) throw new TypeError('Invalid manual order take')
  if (!Number.isSafeInteger(min) || min < 1 || !Number.isSafeInteger(max) || max < min) throw new TypeError('Invalid manual order ordinal range')
  const batchSize = input.batchSize ?? 256
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1024) throw new TypeError('Invalid manual order batch size')
  assertTuple(input.boundary, 'boundary')
  assertTuple(input.remote, 'remote')
  const sign = input.direction === 'after' ? 1 : -1
  const debug = { recordKeys: 0, overrideKeys: 0, recordBatches: 0, overrideBatches: 0, candidateBatches: 0, candidates: 0 }
  const rows: Row[] = []
  let keyLimit = Math.min(batchSize, Math.max(16, input.take))

  const makeStream = (kind: 'record' | 'override', fetch: ManualOrderIndexStreamInput<Row>['fetchRecordKeys']) => {
    let batch: readonly ManualOrderKey[] = []
    let index = 0
    let cursor: number | undefined
    let exhausted = false
    const peek = async (): Promise<ManualOrderKey | undefined> => {
      while (index >= batch.length && !exhausted) {
        // Keep a short nonempty page live: only an empty keyset page proves EOF.
        batch = await fetch(cursor, keyLimit)
        if (kind === 'record') debug.recordBatches++
        else debug.overrideBatches++
        if (batch.length > keyLimit) throw new ManualOrderIndexCorruptionError(`${kind} batch exceeded its limit`)
        let previous = cursor
        for (const key of batch) {
          if (!Number.isSafeInteger(key.ordinal) || key.ordinal < min || key.ordinal > max
            || typeof key.recordId !== 'string' || !key.recordId
            || (previous !== undefined && sign * (key.ordinal - previous) <= 0)) {
            throw new ManualOrderIndexCorruptionError(`${kind} keys are invalid or out of order`)
          }
          previous = key.ordinal
        }
        index = 0
        if (batch.length === 0) exhausted = true
        else cursor = batch.at(-1)!.ordinal
        if (kind === 'record') debug.recordKeys += batch.length
        else debug.overrideKeys += batch.length
      }
      return batch[index]
    }
    const shift = async (): Promise<ManualOrderKey | undefined> => {
      const key = await peek()
      if (key) index++
      return key
    }
    return { peek, shift }
  }

  const records = makeStream('record', input.fetchRecordKeys)
  const overrides = makeStream('override', input.fetchOverrideKeys)
  let target = Math.min(batchSize, input.take)
  let candidates: ManualOrderKey[] = []
  const flush = async (): Promise<void> => {
    if (!candidates.length) return
    const keys = candidates
    candidates = []
    debug.candidateBatches++
    debug.candidates += keys.length
    await input.verifyDefaultCandidates(keys)
    const projected = await input.filterAndProject(keys)
    const byId = new Map(keys.map(key => [key.recordId, key]))
    const accepted = new Map<string, Row>()
    for (const row of projected) {
      const key = byId.get(row.id)
      if (!key || accepted.has(row.id) || row.position?.slotOrdinal !== key.ordinal || row.position.rank !== '1') {
        throw new ManualOrderIndexCorruptionError('projected default row does not match its candidate')
      }
      accepted.set(row.id, row)
    }
    for (const key of keys) {
      const row = accepted.get(key.recordId)
      if (row) rows.push(row)
    }
    if (accepted.size === 0) {
      target = Math.min(batchSize, Math.max(1, target * 2))
      keyLimit = Math.max(keyLimit, target)
    } else target = Math.min(batchSize, Math.max(1, input.take - rows.length))
  }

  while (rows.length < input.take) {
    const record = await records.shift()
    if (!record) {
      // An override source in the scanned range without its Record is corrupt.
      const source = await overrides.peek()
      if (source && (!input.remote || sign * (source.ordinal - input.remote.position.slotOrdinal) <= 0)) {
        throw new ManualOrderIndexCorruptionError('override source has no Record')
      }
      break
    }
    let override = await overrides.peek()
    if (override && sign * (override.ordinal - record.ordinal) < 0) {
      throw new ManualOrderIndexCorruptionError('override source has no Record')
    }
    // The remote slot bounds the default stream. Keep its own slot for the
    // complete rank/ID comparison below, but stop once the ordinal passes it.
    if (input.remote && sign * (record.ordinal - input.remote.position.slotOrdinal) > 0) break
    if (override?.ordinal === record.ordinal) {
      if (override.recordId !== record.recordId) throw new ManualOrderIndexCorruptionError('override source Record identity differs')
      await overrides.shift()
      keyLimit = Math.min(batchSize, keyLimit * 2)
      continue
    }
    const tuple = { position: { slotOrdinal: record.ordinal, rank: '1' }, recordId: record.recordId }
    if (record.recordId === input.excludeRecordId
      || (input.boundary && sign * compareTuple(tuple, input.boundary) <= 0)
      || (input.remote && sign * compareTuple(tuple, input.remote) > 0)) continue
    candidates.push(record)
    if (candidates.length >= target) await flush()
  }
  if (rows.length < input.take) await flush()
  return { rows: rows.slice(0, input.take), debug }
}
