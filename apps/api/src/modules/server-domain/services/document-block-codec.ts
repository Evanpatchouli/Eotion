import type { ServerBlockRecord } from '../types'

type TextBlock = { type: 'paragraph' | 'heading' | 'todo' | 'code'; text: string; id?: string; level?: number; checked?: boolean; language?: string }
type ListBlock = { type: 'bulleted-list' | 'numbered-list'; items: string[]; text?: string; id?: string; start?: number }
type QuoteBlock = { type: 'quote'; paragraphs?: string[]; text?: string; id?: string }
type CalloutBlock = { type: 'callout'; text: string; icon: string; tone: 'neutral' | 'info' | 'warning'; id?: string }
export type DocumentBlockDto = TextBlock | ListBlock | QuoteBlock | CalloutBlock | { type: 'divider'; id?: string }
export type DocumentBlockInput = Pick<ServerBlockRecord, 'type' | 'props'> & { id?: string }

function textContent(text: string, preserveNewlines = false): Record<string, unknown>[] {
  const lines = preserveNewlines ? [text] : text.split('\n')
  return lines.flatMap((line, index) => [
    ...(index ? [{ type: 'hardBreak' }] : []),
    ...(line.length ? [{ type: 'text', text: line }] : []),
  ])
}

function toNode(block: DocumentBlockDto): Record<string, unknown> {
  switch (block.type) {
    case 'paragraph': return { type: 'paragraph', content: textContent(block.text) }
    case 'heading': return { type: 'heading', attrs: { level: block.level }, content: textContent(block.text) }
    case 'todo': return { type: 'eotionTodo', attrs: { checked: block.checked }, content: textContent(block.text) }
    case 'code': return { type: 'codeBlock', ...(block.language === undefined ? {} : { attrs: { language: block.language } }), content: textContent(block.text, true) }
    case 'callout': return { type: 'eotionCallout', attrs: { icon: block.icon, tone: block.tone }, content: textContent(block.text) }
    case 'divider': return { type: 'horizontalRule' }
    case 'bulleted-list':
    case 'numbered-list': {
      const items = block.items
      const ordered = block.type === 'numbered-list'
      return {
        type: ordered ? 'orderedList' : 'bulletList',
        ...(ordered && block.start !== undefined ? { attrs: { start: block.start } } : {}),
        content: items.map((text) => ({ type: 'listItem', content: [{ type: 'paragraph', content: textContent(text) }] })),
      }
    }
    case 'quote': {
      const paragraphs = block.paragraphs ?? (block.text === undefined ? [] : block.text.split('\n'))
      return { type: 'blockquote', content: paragraphs.map((text) => ({ type: 'paragraph', content: textContent(text) })) }
    }
  }
}

/** Convert stable block DTOs to server-domain input without assigning identity or order keys. */
export function toDocumentBlocks(blocks: readonly DocumentBlockDto[]): DocumentBlockInput[] {
  let totalNodes = 0
  return blocks.map((block) => {
    const node = toNode(block)
    let textChars = 0
    const pending = [node]
    // Bound generated document complexity before opening a write transaction.
    // A short JSON payload can still expand into many hardBreak/list nodes.
    while (pending.length) {
      const current = pending.pop()!
      if (++totalNodes > 10_000) throw new Error('Document contains too many content nodes')
      if (typeof current.text === 'string') textChars += current.text.length
      if (textChars > 100_000) throw new Error('Block text too large')
      if (Array.isArray(current.content)) {
        for (const child of current.content) pending.push(child)
      }
    }
    return {
      ...(block.id === undefined ? {} : { id: block.id }),
      type: block.type as ServerBlockRecord['type'],
      props: { node },
    }
  })
}
