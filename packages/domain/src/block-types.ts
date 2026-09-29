export const BLOCK_TYPES = [
  'paragraph',
  'heading',
  'bulleted-list',
  'numbered-list',
  'todo',
  'quote',
  'code',
  'image',
  'divider',
] as const

export type BlockType = (typeof BLOCK_TYPES)[number]
