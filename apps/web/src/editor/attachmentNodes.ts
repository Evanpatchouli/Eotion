import { Extension, Node, mergeAttributes } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import AttachmentNodeView from '../components/editor/AttachmentNodeView.vue'

const attachmentAttributes = {
  fileId: { default: null, rendered: false },
  name: { default: '', rendered: false },
  mimeType: { default: '', rendered: false },
  size: { default: 0, rendered: false },
  url: { default: '', rendered: false },
}

function attachmentNode(name: 'eotionImage' | 'eotionFile', tag: 'figure' | 'div') {
  return Node.create({
    name,
    group: 'block',
    atom: true,
    selectable: true,
    draggable: true,
    addAttributes() { return attachmentAttributes },
    parseHTML() { return [] },
    renderHTML() { return [tag, { 'data-eotion-attachment': name }] },
    addNodeView() { return VueNodeViewRenderer(AttachmentNodeView) },
  })
}

export const EotionImage = attachmentNode('eotionImage', 'figure')
export const EotionFile = attachmentNode('eotionFile', 'div')

/** Removing an attachment permanently releases its file. Text history remains
 * available, but history must never restore a reference to a released object. */
export const AttachmentLifetime = Extension.create({
  name: 'attachmentLifetime',
  addProseMirrorPlugins() {
    const released = new Set<string>()
    const fileIds = (document: ProseMirrorNode) => {
      const ids = new Set<string>()
      document.forEach((node) => {
        if (['eotionImage', 'eotionFile'].includes(node.type.name) && typeof node.attrs.fileId === 'string') ids.add(node.attrs.fileId)
      })
      return ids
    }
    return [new Plugin({
      appendTransaction(transactions, oldState, state) {
        if (!transactions.some((transaction) => transaction.docChanged)) return null
        const current = fileIds(state.doc)
        for (const id of fileIds(oldState.doc)) if (!current.has(id)) released.add(id)
        const removals: Array<{ from: number; to: number }> = []
        state.doc.forEach((node, offset) => {
          if (['eotionImage', 'eotionFile'].includes(node.type.name) && released.has(node.attrs.fileId)) removals.push({ from: offset, to: offset + node.nodeSize })
        })
        if (!removals.length) return null
        const transaction = state.tr
        for (const range of removals.reverse()) transaction.delete(range.from, range.to)
        return transaction.setMeta('addToHistory', false)
      },
    })]
  },
})

export const EotionTodo = Node.create({
  name: 'eotionTodo',
  group: 'block',
  content: 'inline*',
  defining: true,
  addAttributes() {
    return { checked: { default: false } }
  },
  parseHTML() { return [] },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-eotion-todo': 'true', 'data-checked': String(Boolean(HTMLAttributes.checked)) }, HTMLAttributes), 0]
  },
  addNodeView() { return VueNodeViewRenderer(AttachmentNodeView) },
})
