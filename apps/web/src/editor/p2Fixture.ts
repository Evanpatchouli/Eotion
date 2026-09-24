import type { JSONContent } from '@tiptap/core'

export const P2_FIXTURE_BLOCK_COUNT = 5_000

export interface P2FixtureStats {
  textBlocks: number
  paragraphs: number
  headings: number
  listItems: number
  formattedTextBlocks: number
}

/**
 * A block is one editable text block: a paragraph or heading, including the
 * paragraph inside a list item. List containers and list items are not counted
 * again. Every tenth block starts a repeatable heading / prose / list pattern.
 */
export function createP2Fixture(blockCount = P2_FIXTURE_BLOCK_COUNT): {
  document: JSONContent
  stats: P2FixtureStats
} {
  if (!Number.isSafeInteger(blockCount) || blockCount < 1) {
    throw new RangeError('P2 fixture block count must be a positive safe integer')
  }

  const content: JSONContent[] = []
  const stats: P2FixtureStats = {
    textBlocks: blockCount,
    paragraphs: 0,
    headings: 0,
    listItems: 0,
    formattedTextBlocks: 0,
  }

  for (let index = 0; index < blockCount; index += 1) {
    const position = index % 10
    const label = `P2 block ${String(index + 1).padStart(4, '0')}`

    if (position === 0) {
      content.push({
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: `${label} — heading` }],
      })
      stats.headings += 1
      continue
    }

    if (position === 4) {
      const items: JSONContent[] = []
      for (let offset = 0; offset < 2 && index + offset < blockCount; offset += 1) {
        const itemLabel = `P2 block ${String(index + offset + 1).padStart(4, '0')}`
        items.push({
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: `${itemLabel} — list item` }],
          }],
        })
        stats.listItems += 1
        stats.paragraphs += 1
      }
      content.push({ type: 'bulletList', content: items })
      index += items.length - 1
      continue
    }

    const formatted = position === 2 || position === 7
    content.push({
      type: 'paragraph',
      content: [{
        type: 'text',
        text: `${label} — repeatable editing fixture text.`,
        ...(formatted ? { marks: [{ type: position === 2 ? 'bold' : 'italic' }] } : {}),
      }],
    })
    stats.paragraphs += 1
    if (formatted) stats.formattedTextBlocks += 1
  }

  return { document: { type: 'doc', content }, stats }
}
