/** Fixed-width zero padding keeps lexicographic order identical to numeric order. */
const ORDER_KEY_WIDTH = 16
const CANONICAL_ORDER_KEY = /^\d{16}$/

/** Appends after the current last sibling. Siblings are ordered by orderKey, then id. */
export function nextOrderKey<T extends { id: string; orderKey: string }>(siblings: readonly T[]): string {
  if (siblings.every((sibling) => CANONICAL_ORDER_KEY.test(sibling.orderKey))) {
    const highest = siblings.reduce((max, sibling) => {
      const value = BigInt(sibling.orderKey)
      return value > max ? value : max
    }, 0n)
    const next = String(highest + 1n)
    if (next.length <= ORDER_KEY_WIDTH) return next.padStart(ORDER_KEY_WIDTH, '0')
  }

  // Extending the largest key handles legacy keys and the fixed-width range limit without rewriting old pages.
  const highest = siblings.reduce((max, sibling) => sibling.orderKey > max ? sibling.orderKey : max, '')
  return `${highest}0`
}

const BLOCK_ORDER_WIDTH = 30
const BLOCK_ORDER_STEP = 1_000_000_000_000n
const BLOCK_ORDER_MAX = 10n ** BigInt(BLOCK_ORDER_WIDTH) - 1n
const fixedBlockKey = new RegExp(`^\\d{${BLOCK_ORDER_WIDTH}}$`)

function parseBlockKey(key: string | undefined): bigint | null {
  return key && fixedBlockKey.test(key) ? BigInt(key) : null
}

function formatBlockKey(value: bigint): string {
  return value.toString().padStart(BLOCK_ORDER_WIDTH, '0')
}

/** Preserve existing keys whenever their order remains valid; rebalance only when no gap exists. */
export function assignBlockOrder<T extends { id: string; orderKey: string }>(blocks: readonly T[], previous: ReadonlyMap<string, string>): T[] {
  const surviving = [...previous.keys()].filter((id) => blocks.some((block) => block.id === id))
  const existing = blocks.filter((block) => previous.has(block.id)).map((block) => block.id)
  const sameOrder = surviving.length === existing.length && surviving.every((id, index) => id === existing[index])
  if (sameOrder && blocks.every((block) => previous.has(block.id))) {
    return blocks.map((block) => ({ ...block, orderKey: previous.get(block.id)! }))
  }
  if ([...previous.values()].some((key) => parseBlockKey(key) === null)) {
    return blocks.map((block, position) => ({ ...block, orderKey: formatBlockKey(BLOCK_ORDER_STEP * BigInt(position + 1)) }))
  }
  const keys = blocks.map((block) => previous.get(block.id) ?? '')
  let prior = 0n
  const allocated: bigint[] = []
  for (let index = 0; index < blocks.length; index += 1) {
    const existingKey = parseBlockKey(keys[index])
    if (existingKey !== null && existingKey > prior) {
      allocated.push(existingKey)
      prior = existingKey
      continue
    }
    let next = BLOCK_ORDER_MAX
    for (let ahead = index + 1; ahead < keys.length; ahead += 1) {
      const candidate = parseBlockKey(keys[ahead])
      if (candidate !== null && candidate > prior) {
        next = candidate
        break
      }
    }
    const chosen = next === BLOCK_ORDER_MAX && prior + BLOCK_ORDER_STEP <= BLOCK_ORDER_MAX
      ? prior + BLOCK_ORDER_STEP
      : prior + (next - prior) / 2n
    if (chosen <= prior || chosen >= next) {
      return blocks.map((block, position) => ({ ...block, orderKey: formatBlockKey(BLOCK_ORDER_STEP * BigInt(position + 1)) }))
    }
    allocated.push(chosen)
    prior = chosen
  }
  return blocks.map((block, index) => ({ ...block, orderKey: formatBlockKey(allocated[index]!) }))
}
