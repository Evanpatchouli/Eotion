import type { EditorBlock } from './blockCodec'

const WIDTH = 30
const STEP = 1_000_000_000_000n
const MAX = 10n ** BigInt(WIDTH) - 1n
const fixedKey = new RegExp(`^\\d{${WIDTH}}$`)

function parse(key: string | undefined): bigint | null {
  return key && fixedKey.test(key) ? BigInt(key) : null
}

function format(value: bigint): string {
  return value.toString().padStart(WIDTH, '0')
}

/** Preserve existing keys whenever their order remains valid; rebalance only when no gap exists. */
export function assignBlockOrder(blocks: EditorBlock[], previous: ReadonlyMap<string, string>): EditorBlock[] {
  const surviving = [...previous.keys()].filter((id) => blocks.some((block) => block.id === id))
  const existing = blocks.filter((block) => previous.has(block.id)).map((block) => block.id)
  const sameOrder = surviving.length === existing.length && surviving.every((id, index) => id === existing[index])
  if (sameOrder && blocks.every((block) => previous.has(block.id))) {
    return blocks.map((block) => ({ ...block, orderKey: previous.get(block.id)! }))
  }
  if ([...previous.values()].some((key) => parse(key) === null)) {
    return blocks.map((block, position) => ({ ...block, orderKey: format(STEP * BigInt(position + 1)) }))
  }
  const keys = blocks.map((block) => previous.get(block.id) ?? '')
  let prior = 0n
  const allocated: bigint[] = []
  for (let index = 0; index < blocks.length; index += 1) {
    const existing = parse(keys[index])
    if (existing !== null && existing > prior) {
      allocated.push(existing)
      prior = existing
      continue
    }
    let next = MAX
    for (let ahead = index + 1; ahead < keys.length; ahead += 1) {
      const candidate = parse(keys[ahead])
      if (candidate !== null && candidate > prior) {
        next = candidate
        break
      }
    }
    const chosen = next === MAX && prior + STEP <= MAX ? prior + STEP : prior + (next - prior) / 2n
    if (chosen <= prior || chosen >= next) return blocks.map((block, position) => ({ ...block, orderKey: format(STEP * BigInt(position + 1)) }))
    allocated.push(chosen)
    prior = chosen
  }
  return blocks.map((block, index) => ({ ...block, orderKey: format(allocated[index]!) }))
}
