import { EDITOR_NODE_RULES } from '@eotion/domain/block-types'
import { Blockquote } from '@tiptap/extension-blockquote'
import { ListItem, OrderedList } from '@tiptap/extension-list'

/**
 * ProseMirror content expression for one registry rule, or undefined for a leaf.
 * Tiptap ships wider defaults (listItem: 'paragraph block*', blockquote: 'block+'),
 * so without this a paste, an input rule ('# ' / '> ' / '```') or a Markdown
 * shortcut could build a node the editor codec and the server would refuse,
 * leaving the whole page unsaveable. The registry stays the single source, exactly
 * like the table cell content model.
 */
function childExpression(nodeType: string): string | undefined {
  const children = EDITOR_NODE_RULES[nodeType]?.children
  if (!children || children.length === 0) return undefined
  return `(${children.join(' | ')})+`
}

/** List items accept only the block types the block registry declares. */
export const EotionListItem = ListItem.extend({ content: childExpression('listItem') })

/** A quote holds only the block types the block registry declares. */
export const EotionBlockquote = Blockquote.extend({ content: childExpression('blockquote') })

/** Positive safe integer from an HTML attribute, or the fallback. */
export function positiveInteger(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * Eotion has no ordered-list style variants and no fractional start values: the
 * codec and MCP read accept only a null `type` and a safe positive integer
 * `start`. Tiptap defaults parse `<ol type="A">` / list-style-type and even
 * `start="abc"` out of pasted HTML, which would produce a block the page could
 * never save or expose through MCP.
 */
export const EotionOrderedList = OrderedList.extend({
  addAttributes() {
    const parent = (this.parent?.() ?? {}) as Record<string, { parseHTML?: unknown } | undefined>
    return {
      ...parent,
      type: { ...parent.type, default: null, rendered: false, parseHTML: () => null },
      start: {
        ...parent.start,
        default: 1,
        parseHTML: (element: HTMLElement) => positiveInteger(element.getAttribute('start'), 1),
      },
    }
  },
})
