import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { BLOCK_NODE_NAMES, blockCapability, blockTypeForNode } from '@eotion/domain/block-types'
import { createLocalId } from '@eotion/storage'

type NodeRange = { offset: number; end: number; id: unknown; type: string }

/** A node owns server block identity when it is a root block or a child of a child-owning block. */
function ownsBlocks(typeName: string): boolean {
  if (typeName === 'doc') return true
  const type = blockTypeForNode(typeName)
  return type !== undefined && blockCapability(type).allowsChildren
}

/** Every server block node in the document, at any depth, with its absolute position. */
function collectBlockNodes(doc: ProseMirrorNode): NodeRange[] {
  const found: NodeRange[] = []
  const walk = (parent: ProseMirrorNode, contentStart: number): void => {
    const parentOwnsBlocks = ownsBlocks(parent.type.name)
    parent.forEach((node, offset) => {
      const start = contentStart + offset
      if (parentOwnsBlocks && blockTypeForNode(node.type.name) !== undefined) {
        found.push({ offset: start, end: start + node.nodeSize, id: node.attrs.blockId, type: node.type.name })
      }
      if (node.childCount && ownsBlocks(node.type.name)) walk(node, start + 1)
    })
  }
  walk(doc, 0)
  return found
}

/**
 * Collected range containing pos. Nested ranges overlap at a child's start, so a
 * range that keeps the previous node type wins; otherwise the deepest match is
 * the node that now occupies that position.
 */
function rangeAt(ranges: readonly NodeRange[], pos: number, previousType?: string): NodeRange | undefined {
  let deepest: NodeRange | undefined
  let sameType: NodeRange | undefined
  for (const range of ranges) {
    if (range.offset > pos || pos >= range.end) continue
    if (!deepest || range.offset > deepest.offset) deepest = range
    if (previousType !== undefined && range.type === previousType && (!sameType || range.offset > sameType.offset)) sameType = range
  }
  return sameType ?? deepest
}

/**
 * A server block owns one stable Block ID across split, paste and nesting.
 * Identity lives in editor JSON, never in clipboard HTML, so pasting a block
 * into another page always receives a fresh ID.
 */
export const BlockIdentity = Extension.create({
  name: 'blockIdentity',
  addGlobalAttributes() {
    return [{
      types: [...BLOCK_NODE_NAMES],
      attributes: {
        blockId: {
          default: null,
          rendered: false,
          // Identity is assigned by this extension only: pasted HTML must never
          // inject a server block id that could collide with an existing block.
          parseHTML: () => null,
        },
      },
    }]
  },
  addProseMirrorPlugins() {
    return [new Plugin({
      appendTransaction: (transactions, oldState, state) => {
        if (transactions.every((change) => !change.docChanged)) return null
        const current = collectBlockNodes(state.doc)
        const seenIds = new Set<string>()
        let needsRepair = false
        for (const range of current) {
          if (typeof range.id !== 'string' || !range.id || seenIds.has(range.id)) { needsRepair = true; break }
          seenIds.add(range.id)
        }
        if (!needsRepair) return null
        const inherited = new Map<number, string>()
        for (const previous of collectBlockNodes(oldState.doc)) {
          if (typeof previous.id !== 'string' || !previous.id) continue
          // Non-leaf blocks have an interior position; atoms and other one-token
          // leaves do not. Mapping `offset + 1` for those leaves lands exactly
          // at the next sibling, so a repair transaction can steal their ID.
          let mapped = previous.offset + (previous.end - previous.offset > 1 ? 1 : 0)
          for (const change of transactions) {
            const result = change.mapping.mapResult(mapped, 1)
            if (result.deleted) { mapped = -1; break }
            mapped = result.pos
          }
          if (mapped < 0) continue
          const target = rangeAt(current, mapped, previous.type)
          if (target && !inherited.has(target.offset)) inherited.set(target.offset, previous.id)
        }
        const preferred = new Map([...inherited].map(([offset, id]) => [id, offset]))
        const seen = new Set<string>()
        let transaction = state.tr
        for (const range of current) {
          const keepId = typeof range.id === 'string' && !!range.id && !seen.has(range.id) && (preferred.get(range.id) === undefined || preferred.get(range.id) === range.offset)
          const candidate = inherited.get(range.offset)
          const nextId = keepId ? range.id as string : candidate && !seen.has(candidate) ? candidate : createLocalId()
          seen.add(nextId)
          if (keepId) continue
          const node = state.doc.nodeAt(range.offset)
          if (!node) continue
          transaction = transaction.setNodeMarkup(range.offset, undefined, { ...node.attrs, blockId: nextId })
        }
        return transaction.docChanged ? transaction : null
      },
    })]
  },
})
