/**
 * Structural block-tree helpers shared by the local stores, the server domain
 * and read contracts. This module deliberately has no runtime imports so the
 * browser, Electron and Node builds can all consume it directly.
 */

/** The minimum shape needed to express block parentage. */
export interface BlockLink {
  id: string
  pageId?: string
  parentBlockId?: string | null
}

export interface BlockTreeOrderLink extends BlockLink {
  orderKey?: string
}

export interface BlockTreeNode<T> {
  block: T
  children: BlockTreeNode<T>[]
}

export type ParentRejection = 'self' | 'missing' | 'cross-page' | 'cycle'

export function parentOf(block: BlockLink): string | null {
  return block.parentBlockId ?? null
}

function indexById(blocks: readonly BlockLink[]): Map<string, BlockLink> {
  const byId = new Map<string, BlockLink>()
  for (const block of blocks) {
    if (byId.has(block.id)) throw new Error(`Duplicate block id ${block.id}`)
    byId.set(block.id, block)
  }
  return byId
}

/**
 * Returns why `parentBlockId` is not an acceptable parent for `blockId`, or
 * null when the link is valid. Callers map the code to their own error type.
 */
export function parentRejection(
  blocks: readonly BlockLink[],
  blockId: string,
  parentBlockId: string | null,
  pageId?: string,
): ParentRejection | null {
  if (parentBlockId === null) return null
  if (parentBlockId === blockId) return 'self'
  const byId = indexById(blocks)
  const targetPage = pageId ?? byId.get(blockId)?.pageId
  const visited = new Set<string>([blockId])
  let current: string | null = parentBlockId
  while (current !== null) {
    if (visited.has(current)) return 'cycle'
    visited.add(current)
    const parent = byId.get(current)
    if (!parent) return 'missing'
    if (targetPage !== undefined && parent.pageId !== undefined && parent.pageId !== targetPage) return 'cross-page'
    current = parentOf(parent)
  }
  return null
}

const PARENT_REJECTION_MESSAGES: Record<ParentRejection, (blockId: string, parentBlockId: string) => string> = {
  self: (blockId) => `Block ${blockId} cannot be its own parent`,
  missing: (blockId, parentBlockId) => `Parent block ${parentBlockId} is unavailable for block ${blockId}`,
  'cross-page': (blockId, parentBlockId) => `Parent block ${parentBlockId} belongs to a different page than block ${blockId}`,
  cycle: (blockId) => `Block ${blockId} cannot move under its own descendant`,
}

export function parentRejectionMessage(reason: ParentRejection, blockId: string, parentBlockId: string): string {
  return PARENT_REJECTION_MESSAGES[reason](blockId, parentBlockId)
}

/** Rejects self-parent, missing parent, cross-page parent and cycles across a whole set. */
export function validateBlockTree(blocks: readonly BlockLink[], pageId?: string): void {
  const byId = indexById(blocks)
  for (const block of blocks) {
    if (pageId !== undefined && block.pageId !== undefined && block.pageId !== pageId) {
      throw new Error(`Block ${block.id} belongs to a different page`)
    }
    const parentBlockId = parentOf(block)
    if (parentBlockId === null) continue
    if (parentBlockId === block.id) throw new Error(`Block ${block.id} cannot be its own parent`)
    const visited = new Set<string>([block.id])
    let current: string | null = parentBlockId
    while (current !== null) {
      if (visited.has(current)) throw new Error(`Block ${block.id} has a cyclic parent`)
      visited.add(current)
      const parent = byId.get(current)
      if (!parent) throw new Error(`Parent block ${current} is missing`)
      if (block.pageId !== undefined && parent.pageId !== undefined && parent.pageId !== block.pageId) {
        throw new Error(`Parent block ${current} belongs to a different page than block ${block.id}`)
      }
      current = parentOf(parent)
    }
  }
}

/**
 * All descendants of one block, depth first. Siblings are visited in id order
 * because this helper only sees parentage, not order keys.
 */
export function descendantIds(blocks: readonly BlockLink[], rootId: string): string[] {
  const childrenOf = new Map<string, string[]>()
  for (const block of blocks) {
    const parent = parentOf(block)
    if (parent === null) continue
    const siblings = childrenOf.get(parent)
    if (siblings) siblings.push(block.id)
    else childrenOf.set(parent, [block.id])
  }
  for (const siblings of childrenOf.values()) siblings.sort()
  const result: string[] = []
  const visited = new Set<string>([rootId])
  const pending = [...(childrenOf.get(rootId) ?? [])]
  while (pending.length) {
    const id = pending.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    result.push(id)
    pending.push(...(childrenOf.get(id) ?? []))
  }
  return result
}

function siblingComparator<T extends BlockTreeOrderLink>(left: T, right: T): number {
  const leftKey = left.orderKey ?? ''
  const rightKey = right.orderKey ?? ''
  if (leftKey !== rightKey) return leftKey < rightKey ? -1 : 1
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

/**
 * Rebuilds the block tree from a flat list. Siblings are ordered by orderKey
 * then id, so the same list always produces the same tree. A block whose parent
 * is absent from the list is surfaced as a root instead of being dropped.
 */
export function buildBlockTree<T extends BlockTreeOrderLink>(blocks: readonly T[]): BlockTreeNode<T>[] {
  const byId = new Map<string, T>()
  for (const block of blocks) byId.set(block.id, block)
  const childrenOf = new Map<string, T[]>()
  const roots: T[] = []
  for (const block of blocks) {
    const parent = parentOf(block)
    if (parent === null || !byId.has(parent)) {
      roots.push(block)
      continue
    }
    const siblings = childrenOf.get(parent)
    if (siblings) siblings.push(block)
    else childrenOf.set(parent, [block])
  }
  const visited = new Set<string>()
  const attach = (block: T): BlockTreeNode<T> => {
    visited.add(block.id)
    const children = (childrenOf.get(block.id) ?? [])
      .filter((child) => !visited.has(child.id))
      .sort(siblingComparator)
      .map(attach)
    return { block, children }
  }
  return roots.sort(siblingComparator).map(attach)
}

/** Depth-first block order: parents before their children, siblings by orderKey. */
export function flattenBlockTree<T extends BlockTreeOrderLink>(blocks: readonly T[]): T[] {
  const ordered: T[] = []
  const walk = (nodes: readonly BlockTreeNode<T>[]): void => {
    for (const node of nodes) {
      ordered.push(node.block)
      walk(node.children)
    }
  }
  walk(buildBlockTree(blocks))
  return ordered
}

/** Depth of every block in the tree; roots are 0. Used to delete children first. */
export function blockDepthMap(blocks: readonly BlockLink[]): Map<string, number> {
  const byId = new Map<string, BlockLink>()
  for (const block of blocks) byId.set(block.id, block)
  const depths = new Map<string, number>()
  const pending = new Set<string>()
  const resolve = (block: BlockLink): number => {
    const cached = depths.get(block.id)
    if (cached !== undefined) return cached
    if (pending.has(block.id)) return 0
    pending.add(block.id)
    const parent = parentOf(block)
    const parentBlock = parent === null ? undefined : byId.get(parent)
    const depth = parentBlock && parentBlock.id !== block.id ? resolve(parentBlock) + 1 : 0
    pending.delete(block.id)
    depths.set(block.id, depth)
    return depth
  }
  for (const block of blocks) resolve(block)
  return depths
}

/** Orders a deletion set so children are removed before their parents. */
export function orderForDeletion<T extends BlockLink>(blocks: readonly T[], deleting: readonly T[]): T[] {
  const depths = blockDepthMap(blocks)
  return [...deleting].sort((left, right) => {
    const depth = (depths.get(right.id) ?? 0) - (depths.get(left.id) ?? 0)
    return depth !== 0 ? depth : left.id < right.id ? -1 : left.id > right.id ? 1 : 0
  })
}
