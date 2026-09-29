// Keep the runtime values in JavaScript so the Nest CommonJS build can load
// them on every supported Node version without TypeScript source stripping.
export const BLOCK_TYPES = /** @type {const} */ ([
  'paragraph', 'heading', 'bulleted-list', 'numbered-list', 'todo',
  'quote', 'code', 'image', 'divider',
])
