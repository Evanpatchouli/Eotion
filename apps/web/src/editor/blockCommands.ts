import type { Editor } from '@tiptap/core'
import type { BlockCommandId } from '@eotion/domain/block-types'
import { isBlockCommandAllowed, isBlockCommandRangeSafe } from './blockCommandContext'

/** Commands that create a block. Attachment commands are handled by the attachment picker. */
export type BlockCommand = Exclude<BlockCommandId, 'image' | 'file'>

/** The same supported block commands back Slash and the optional fixed toolbar. */
export function runBlockCommand(editor: Editor, command: BlockCommand, range?: { from: number; to: number }): boolean {
  if (!isBlockCommandAllowed(editor, command, range?.from)) return false
  // The transform must stay inside one compatible structural parent. Slash passes
  // its own range; the toolbars must be checked against the current selection.
  const safety = range ?? (editor.state.selection.empty ? undefined : { from: editor.state.selection.from, to: editor.state.selection.to })
  if (safety && !isBlockCommandRangeSafe(editor, command, safety.from, safety.to)) return false
  const chain = editor.chain().focus()
  if (range) chain.deleteRange(range)
  switch (command) {
    case 'paragraph': return chain.setParagraph().run()
    case 'heading1': return chain.setHeading({ level: 1 }).run()
    case 'heading2': return chain.setHeading({ level: 2 }).run()
    case 'bulletList': return chain.setParagraph().toggleBulletList().run()
    case 'orderedList': return chain.setParagraph().toggleOrderedList().run()
    case 'todo': return chain.setNode('eotionTodo', { checked: false }).run()
    case 'quote': return chain.setBlockquote().run()
    case 'codeBlock': return chain.setCodeBlock().run()
    case 'horizontalRule': return chain.setHorizontalRule().run()
    // A toggle wraps the current block as its summary; Enter then creates children.
    case 'toggle': return chain.wrapIn('eotionToggle').run()
    case 'callout': return chain.setNode('eotionCallout', { icon: '💡', tone: 'neutral' }).run()
    // One table is one block: a 3x3 grid with a header row is the smallest
    // useful default, and the cursor starts in the first cell.
    case 'table': return chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    // Database references are inserted through the async slash chooser.
    case 'database': return false
  }
}
