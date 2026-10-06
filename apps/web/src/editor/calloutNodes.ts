import { Node, mergeAttributes, type Editor } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'

import CalloutNodeView from '../components/editor/CalloutNodeView.vue'

function convertCalloutToParagraph(editor: Editor): boolean {
  const { state, view } = editor
  const { selection, schema } = state
  const { $from, $to } = selection
  if ($from.parent.type.name !== 'eotionCallout' || $to.parent !== $from.parent) return false
  if (!selection.empty || $from.parentOffset !== 0) return false
  const paragraph = schema.nodes.paragraph
  if (!paragraph) return false
  const transaction = state.tr.setNodeMarkup($from.before(), paragraph, { blockId: $from.parent.attrs.blockId })
  view.dispatch(transaction)
  return true
}

/** Inline text callout; its content stays within this leaf block. */
export const EotionCallout = Node.create({
  name: 'eotionCallout',
  group: 'block',
  content: 'inline*',
  defining: true,
  addAttributes() {
    return {
      icon: { default: '💡' },
      tone: { default: 'neutral' },
    }
  },
  parseHTML() { return [] },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-eotion-callout': 'true' }, HTMLAttributes), 0]
  },
  addNodeView() { return VueNodeViewRenderer(CalloutNodeView) },
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { $from, empty } = this.editor.state.selection
        if (!empty || $from.parent.type.name !== 'eotionCallout') return false
        if ($from.parent.content.size === 0) return convertCalloutToParagraph(this.editor)
        return this.editor.chain().splitBlock().setNode('paragraph').run()
      },
      Backspace: () => convertCalloutToParagraph(this.editor),
    }
  },
})
