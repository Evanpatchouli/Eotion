import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { createLocalId } from '@eotion/storage'

const blockNodes = ['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'codeBlock', 'horizontalRule', 'eotionImage', 'eotionFile', 'eotionTodo']

/** A top-level node owns one stable server Block ID, including across split and paste. */
export const BlockIdentity = Extension.create({
  name: 'blockIdentity',
  addGlobalAttributes() {
    return [{
      types: blockNodes,
      attributes: {
        blockId: {
          default: null,
          // Identity lives in editor JSON, never in clipboard HTML. Pasting a
          // block into another page must receive a fresh ID.
          rendered: false,
        },
      },
    }]
  },
  addProseMirrorPlugins() {
    return [new Plugin({
      appendTransaction: (transactions, oldState, state) => {
        if (transactions.every((change) => !change.docChanged)) return null
        const currentIds = new Set<string>()
        let needsRepair = false
        state.doc.forEach((node) => {
          if (!blockNodes.includes(node.type.name)) return
          const id = node.attrs.blockId
          if (typeof id !== 'string' || !id || currentIds.has(id)) needsRepair = true
          else currentIds.add(id)
        })
        if (!needsRepair) return null
        let transaction = state.tr
        const seen = new Set<string>()
        const inherited = new Map<number, string>()
        const positions: Array<{ offset: number; end: number }> = []
        state.doc.forEach((node, offset) => { positions.push({ offset, end: offset + node.nodeSize }) })
        oldState.doc.forEach((node, offset) => {
          const id = node.attrs.blockId
          if (typeof id !== 'string' || !id) return
          let mapped = offset + 1
          for (const change of transactions) {
            const result = change.mapping.mapResult(mapped)
            if (result.deleted) return
            mapped = result.pos
          }
          let low = 0
          let high = positions.length - 1
          while (low <= high) {
            const middle = (low + high) >> 1
            const next = positions[middle]!
            if (mapped < next.offset) high = middle - 1
            else if (mapped >= next.end) low = middle + 1
            else {
              if (!inherited.has(next.offset)) inherited.set(next.offset, id)
              break
            }
          }
        })
        const preferred = new Map([...inherited].map(([offset, id]) => [id, offset]))
        state.doc.forEach((node, offset) => {
          if (!blockNodes.includes(node.type.name)) return
          const id = node.attrs.blockId
          const keepId = typeof id === 'string' && !!id && !seen.has(id) && (preferred.get(id) === undefined || preferred.get(id) === offset)
          const candidate = inherited.get(offset)
          const nextId = keepId ? id! : candidate && !seen.has(candidate) ? candidate : createLocalId()
          seen.add(nextId)
          if (keepId) return
          const attrs = { ...node.attrs, blockId: nextId }
          transaction = transaction.setNodeMarkup(offset, undefined, attrs)
        })
        return transaction.docChanged ? transaction : null
      },
    })]
  },
})
