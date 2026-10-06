import type { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import {
  blockCapability,
  blockTypeForNode,
  editorNodeRule,
  isAllowedChildBlockType,
  isAttachmentBlockType,
  slashCommands,
  type BlockCommandId,
} from '@eotion/domain/block-types'

/** Whether a slash/toolbar command is valid at the current structural position. */
export function isBlockCommandAllowed(editor: Editor, commandId: BlockCommandId, position?: number): boolean {
  const command = slashCommands().find((item) => item.id === commandId)
  if (!command) return false

  const selection = editor.state.selection
  if (!isAttachmentBlockType(command.type) && position === undefined && selection instanceof NodeSelection && blockTypeForNode(selection.node.type.name)) {
    const selectedType = blockTypeForNode(selection.node.type.name)!
    if (blockCapability(selectedType).allowsChildren) return false
  }

  const $position = editor.state.doc.resolve(position ?? selection.from)
  const ancestors = Array.from({ length: $position.depth + 1 }, (_, index) => ({
    depth: index,
    node: $position.node(index),
  }))

  const currentBlock = [...ancestors].reverse().find(({ node }) => blockTypeForNode(node.type.name))
  if (isAttachmentBlockType(command.type)) {
    // Upload targets are root blocks (including atom/boundary selections).
    // Nested positions must never fall back to a root upload target.
    return !ancestors.some(({ node }) => node.type.name === 'blockquote' || node.type.name === 'listItem' || node.type.name === 'eotionToggle')
  }

  const structuralParent = [...ancestors]
    .reverse()
    .find(({ depth, node }) => {
      const rule = editorNodeRule(node.type.name)
      return depth < (currentBlock?.depth ?? $position.depth + 1) && rule !== undefined && rule.children !== null
    })
  const targetNodeType = blockCapability(command.type).nodeType
  if (structuralParent) {
    const rule = editorNodeRule(structuralParent.node.type.name)
    if (!rule?.children?.includes(targetNodeType)) return false

    const parentBlockType = blockTypeForNode(structuralParent.node.type.name)
    if (parentBlockType && blockCapability(parentBlockType).allowsChildren && !isAllowedChildBlockType(parentBlockType, command.type)) return false
  }

  // The first direct child is the toggle summary. Turning it into another
  // child-owning block would make the codec promote its content out of summary.
  if (blockCapability(command.type).allowsChildren) {
    const toggleAncestor = [...ancestors].reverse().find(({ node }) => node.type.name === 'eotionToggle')
    if (toggleAncestor && $position.index(toggleAncestor.depth) === 0) return false
  }

  return true
}

/** Reject block transforms whose selection crosses incompatible structural parents. */
export function isBlockCommandRangeSafe(editor: Editor, commandId: BlockCommandId, from: number, to: number): boolean {
  if (from >= to) return true
  const fromPosition = editor.state.doc.resolve(from)
  const toPosition = editor.state.doc.resolve(to)
  const parentContext = ($position: typeof fromPosition) => {
    const currentBlock = [...Array.from({ length: $position.depth + 1 }, (_, depth) => ({ depth, node: $position.node(depth) }))]
      .reverse()
      .find(({ node }) => blockTypeForNode(node.type.name))
    if (!currentBlock) return undefined
    for (let depth = currentBlock.depth - 1; depth > 0; depth -= 1) {
      const rule = editorNodeRule($position.node(depth).type.name)
      if (rule?.children !== null && rule !== undefined) return { depth, node: $position.node(depth) }
    }
    return undefined
  }
  const fromParent = parentContext(fromPosition)
  const toParent = parentContext(toPosition)
  if (fromParent?.node !== toParent?.node) return false

  const command = slashCommands().find((item) => item.id === commandId)
  if (!command || !blockCapability(command.type).allowsChildren) return true
  let containsChildOwner = false
  editor.state.doc.nodesBetween(from, to, (node) => {
    const type = blockTypeForNode(node.type.name)
    if (type && blockCapability(type).allowsChildren) containsChildOwner = true
  })
  if (containsChildOwner) return false

  let crossesToggleSummary = false
  // A child-owning transform must not span multiple direct children of one toggle.
  for (let depth = 1; depth < Math.min(fromPosition.depth, toPosition.depth); depth += 1) {
    if (fromPosition.node(depth).type.name === 'eotionToggle' && fromPosition.node(depth) === toPosition.node(depth)) {
      crossesToggleSummary = fromPosition.index(depth) !== toPosition.index(depth)
      if (crossesToggleSummary) break
    }
  }
  return !crossesToggleSummary
}
