import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import { BLOCK_NODE_NAMES } from '@eotion/domain/block-types'

import ToggleNodeView from '../components/editor/ToggleNodeView.vue'

/**
 * Toggle is a normal block that owns child blocks. Its own summary lives inside
 * props.node; every further editor child becomes its own block with
 * parentBlockId set to this block. The node name must stay in sync with
 * nodeTypeForBlock('toggle').
 */
export const EotionToggle = Node.create({
  name: 'eotionToggle',
  group: 'block',
  // ProseMirror content expressions are sequences unless alternatives are joined
  // with "|", so the registry's block list becomes (a | b | ...)+.
  content: `(${BLOCK_NODE_NAMES.join(' | ')})+`,
  defining: true,
  addAttributes() { return {} },
  parseHTML() { return [] },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-eotion-toggle': 'true' }, HTMLAttributes), 0]
  },
  addNodeView() { return VueNodeViewRenderer(ToggleNodeView) },
})
