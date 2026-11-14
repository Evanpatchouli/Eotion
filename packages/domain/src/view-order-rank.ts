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
