import type { Editor } from '@tiptap/core'

export type BlockCommand = 'paragraph' | 'heading1' | 'heading2' | 'bulletList' | 'orderedList' | 'todo' | 'blockquote' | 'codeBlock' | 'horizontalRule'

/** The same supported block commands back Slash and the optional fixed toolbar. */
export function runBlockCommand(editor: Editor, command: BlockCommand, range?: { from: number; to: number }): boolean {
  const chain = editor.chain().focus()
  if (range) chain.deleteRange(range)
  switch (command) {
    case 'paragraph': return chain.setParagraph().run()
    case 'heading1': return chain.setHeading({ level: 1 }).run()
    case 'heading2': return chain.setHeading({ level: 2 }).run()
    case 'bulletList': return chain.setParagraph().toggleBulletList().run()
    case 'orderedList': return chain.setParagraph().toggleOrderedList().run()
    case 'todo': return chain.setNode('eotionTodo', { checked: false }).run()
    case 'blockquote': return chain.setBlockquote().run()
    case 'codeBlock': return chain.setCodeBlock().run()
    case 'horizontalRule': return chain.setHorizontalRule().run()
  }
}
