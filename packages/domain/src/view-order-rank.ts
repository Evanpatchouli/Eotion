/**
 * Sparse ordering keys for generic Views. Keys use only ASCII `0` and `1`
 * and end in `1`, so JavaScript's string comparison matches Mongo simple
 * collation for these values.
 */
export function isViewOrderRank(value: unknown): value is string {
  return typeof value === 'string' && /^[01]*1$/.test(value)
}

/** Returns a valid rank strictly between the supplied neighbors. */
export function rankBetween(lower: string | null, upper: string | null): string {
  if (lower !== null && !isViewOrderRank(lower)) throw new TypeError('Invalid lower view order rank')
  if (upper !== null && !isViewOrderRank(upper)) throw new TypeError('Invalid upper view order rank')
  if (lower !== null && upper !== null && !(lower < upper)) {
    throw new TypeError('Lower view order rank must be less than upper view order rank')
  }

  if (lower === null && upper === null) return '1'
  if (lower === null) return `0${upper}`
  if (upper === null) return `${lower}1`
  if (upper.startsWith(lower)) return `${lower}0${upper.slice(lower.length)}`
  return `${lower}1`
}

export interface ViewOrderPosition {
  slotOrdinal: number
  rank: string
}

function assertViewOrderPosition(value: ViewOrderPosition, name: string): void {
  if (value === null || typeof value !== 'object'
    || !Number.isSafeInteger(value.slotOrdinal) || value.slotOrdinal < 0
    || !isViewOrderRank(value.rank)) {
    throw new TypeError(`Invalid ${name} view order position`)
  }
}

/** Compares positions by ordinal first, then by ASCII rank. */
export function compareViewOrderPosition(left: ViewOrderPosition, right: ViewOrderPosition): number {
  assertViewOrderPosition(left, 'left')
  assertViewOrderPosition(right, 'right')
  if (left.slotOrdinal < right.slotOrdinal) return -1
  if (left.slotOrdinal > right.slotOrdinal) return 1
  return left.rank < right.rank ? -1 : left.rank > right.rank ? 1 : 0
}

/** Returns a valid position strictly between the supplied neighbors. */
export function positionBetween(
  left: ViewOrderPosition | null,
  right: ViewOrderPosition | null,
): ViewOrderPosition {
  if (left !== null) assertViewOrderPosition(left, 'left')
  if (right !== null) assertViewOrderPosition(right, 'right')
  if (left !== null && right !== null && compareViewOrderPosition(left, right) >= 0) {
    throw new TypeError('Left view order position must be less than right view order position')
  }

  if (left === null) {
    if (right === null) return { slotOrdinal: 0, rank: '1' }
    if (right.slotOrdinal > 0) return { slotOrdinal: 0, rank: '1' }
    return { slotOrdinal: 0, rank: rankBetween(null, right.rank) }
  }
  if (right === null || right.slotOrdinal > left.slotOrdinal) {
    return { slotOrdinal: left.slotOrdinal, rank: rankBetween(left.rank, null) }
  }
  return { slotOrdinal: left.slotOrdinal, rank: rankBetween(left.rank, right.rank) }
}
