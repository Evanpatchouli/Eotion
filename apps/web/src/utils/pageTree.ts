import type { PageResponse } from '@eotion/contracts'

export interface PageTreeNode {
  page: PageResponse
  children: PageTreeNode[]
}

export interface PageTreeRow {
  page: PageResponse
  depth: number
  hasChildren: boolean
  expanded: boolean
}

/** Fixed-width zero padding keeps lexicographic order identical to numeric order. */
const ORDER_KEY_WIDTH = 16
const CANONICAL_ORDER_KEY = /^\d{16}$/

function comparePages(a: PageResponse, b: PageResponse): number {
  if (a.orderKey !== b.orderKey) return a.orderKey < b.orderKey ? -1 : 1
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
}

/**
 * Builds the page tree from a workspace page list.
 *
 * A parent reference that is missing from the list is treated as a root so a
 * stale reference cannot hide a page. The visited guard bounds malformed data.
 */
export function buildPageTree(pages: PageResponse[]): PageTreeNode[] {
  const knownIds = new Set(pages.map((page) => page.id))
  const childrenByParent = new Map<string, PageResponse[]>()
  const roots: PageResponse[] = []
  for (const page of pages) {
    const parentId = page.parentPageId
    if (parentId === null || parentId === page.id || !knownIds.has(parentId)) {
      roots.push(page)
      continue
    }
    const siblings = childrenByParent.get(parentId)
    if (siblings) siblings.push(page)
    else childrenByParent.set(parentId, [page])
  }
  roots.sort(comparePages)
  for (const siblings of childrenByParent.values()) siblings.sort(comparePages)

  const visited = new Set<string>()
  const build = (page: PageResponse): PageTreeNode | null => {
    if (visited.has(page.id)) return null
    visited.add(page.id)
    const children = (childrenByParent.get(page.id) ?? []).map(build).filter((node): node is PageTreeNode => node !== null)
    return { page, children }
  }
  return roots.map(build).filter((node): node is PageTreeNode => node !== null)
}

/** Flattens the tree into visible rows, skipping the children of collapsed pages. */
export function flattenPageTree(nodes: PageTreeNode[], expanded: ReadonlySet<string>, depth = 0): PageTreeRow[] {
  const rows: PageTreeRow[] = []
  for (const node of nodes) {
    const hasChildren = node.children.length > 0
    const isExpanded = hasChildren && expanded.has(node.page.id)
    rows.push({ page: node.page, depth, hasChildren, expanded: isExpanded })
    if (isExpanded) rows.push(...flattenPageTree(node.children, expanded, depth + 1))
  }
  return rows
}

/** Appends after the current last sibling. Siblings are ordered by orderKey, then id. */
export function nextOrderKey(siblings: PageResponse[]): string {
  if (siblings.every((sibling) => CANONICAL_ORDER_KEY.test(sibling.orderKey))) {
    const highest = siblings.reduce((max, sibling) => {
      const value = BigInt(sibling.orderKey)
      return value > max ? value : max
    }, 0n)
    const next = String(highest + 1n)
    if (next.length <= ORDER_KEY_WIDTH) return next.padStart(ORDER_KEY_WIDTH, '0')
  }

  // The tree compares keys as strings. Extending the largest key also handles
  // legacy keys and the fixed-width range limit without rewriting old pages.
  const highest = siblings.reduce((max, sibling) => sibling.orderKey > max ? sibling.orderKey : max, '')
  return `${highest}0`
}

/** Collects the page itself plus every page below it. */
export function collectSubtreeIds(pages: PageResponse[], pageId: string): Set<string> {
  const childrenByParent = new Map<string, string[]>()
  for (const page of pages) {
    if (page.parentPageId === null) continue
    const children = childrenByParent.get(page.parentPageId)
    if (children) children.push(page.id)
    else childrenByParent.set(page.parentPageId, [page.id])
  }
  const collected = new Set<string>()
  const queue = [pageId]
  while (queue.length > 0) {
    const current = queue.shift()!
    if (collected.has(current)) continue
    collected.add(current)
    queue.push(...(childrenByParent.get(current) ?? []))
  }
  return collected
}
