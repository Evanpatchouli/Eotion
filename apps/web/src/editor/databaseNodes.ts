import { Node } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'

import DatabaseNodeView from '../components/editor/DatabaseNodeView.vue'

/** Read-only reference to a database view. Database rows are not editor blocks. */
export const EotionDatabase = Node.create<{ workspaceId: string; onViewChange?: (viewId: string) => void }>({
  name: 'eotionDatabase',
  addOptions() { return { workspaceId: '', onViewChange: undefined } },
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      databaseId: { default: null, rendered: false },
      viewId: { default: null, rendered: false },
    }
  },
  // HTML paste is not a trusted source of database references.
  parseHTML() { return [] },
  renderHTML() { return ['div', { 'data-eotion-database': 'true' }] },
  addNodeView() { return VueNodeViewRenderer(DatabaseNodeView) },
})
