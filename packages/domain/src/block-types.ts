export const BLOCK_TYPES = [
  'paragraph',
  'heading',
  'bulleted-list',
  'numbered-list',
  'todo',
  'quote',
  'code',
  'image',
  'file',
  'divider',
  'toggle',
  'callout',
  'table',
] as const

export type BlockType = (typeof BLOCK_TYPES)[number]

/**
 * Editor node name for every block type. This is the single mapping shared by
 * the Tiptap schema, the editor codec, the server domain and the MCP contract,
 * so one block type can never mean different things per layer.
 */
export const BLOCK_NODE_TYPES: Record<BlockType, string> = {
  paragraph: 'paragraph',
  heading: 'heading',
  'bulleted-list': 'bulletList',
  'numbered-list': 'orderedList',
  todo: 'eotionTodo',
  quote: 'blockquote',
  code: 'codeBlock',
  image: 'eotionImage',
  file: 'eotionFile',
  divider: 'horizontalRule',
  toggle: 'eotionToggle',
  callout: 'eotionCallout',
  table: 'table',
}

/** Every editor node name that a block document may contain, block nodes first. */
export const BLOCK_NODE_NAMES: readonly string[] = BLOCK_TYPES.map((type) => BLOCK_NODE_TYPES[type])

/** Identifiers used by the slash menu and the fixed/touch toolbars. */
export type BlockCommandId =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'bulletList'
  | 'orderedList'
  | 'todo'
  | 'quote'
  | 'codeBlock'
  | 'horizontalRule'
  | 'toggle'
  | 'callout'
  | 'table'
  | 'image'
  | 'file'

export interface BlockCommandSpec {
  id: BlockCommandId
  /** The block type this command creates. */
  type: BlockType
  label: string
  group: '基础' | '块' | '媒体'
  icon: string
  search?: string
}

/**
 * What a block type can do, independent of any layer. Consumers must read this
 * registry instead of scattering per-type if/switch statements.
 */
export interface BlockCapability {
  type: BlockType
  nodeType: string
  /** The block owns inline text at its own level. */
  hasText: boolean
  /** The block may own child blocks in the block tree. */
  allowsChildren: boolean
  /** Block types accepted as direct children; empty when allowsChildren is false. */
  allowedChildTypes: readonly BlockType[]
  /** The type can be created from the slash menu. */
  slash: boolean
  mcp: { readable: boolean; writable: boolean }
  /** The block references a stored attachment file. */
  attachment: boolean
  /**
   * The editor node keeps its own editor-internal structure (table rows/cells)
   * that is never part of the page block tree. Such interior nodes carry no
   * blockId, never take part in block.move/parentBlockId and must not be treated
   * as page blocks by keyboard/indent/drag handling.
   */
  internalContent: boolean
}

function capability(type: BlockType, patch: Partial<Omit<BlockCapability, 'type' | 'nodeType'>> = {}): BlockCapability {
  return {
    type,
    nodeType: BLOCK_NODE_TYPES[type],
    hasText: false,
    allowsChildren: false,
    allowedChildTypes: [],
    slash: true,
    mcp: { readable: true, writable: true },
    attachment: false,
    internalContent: false,
    ...patch,
  }
}

export const BLOCK_CAPABILITIES: Record<BlockType, BlockCapability> = {
  paragraph: capability('paragraph', { hasText: true }),
  heading: capability('heading', { hasText: true }),
  'bulleted-list': capability('bulleted-list', { hasText: true }),
  'numbered-list': capability('numbered-list', { hasText: true }),
  todo: capability('todo', { hasText: true }),
  quote: capability('quote', { hasText: true }),
  code: capability('code', { hasText: true }),
  // Attachments and nested blocks are readable but not yet writable through MCP.
  image: capability('image', { attachment: true, mcp: { readable: true, writable: false } }),
  file: capability('file', { attachment: true, mcp: { readable: true, writable: false } }),
  divider: capability('divider'),
  // Toggle is the first block type that owns child blocks. Reusing the existing
  // parentBlockId field keeps the tree model identical to the page tree.
  toggle: capability('toggle', { hasText: true, allowsChildren: true, allowedChildTypes: BLOCK_TYPES, mcp: { readable: true, writable: false } }),
  callout: capability('callout', { hasText: true }),
  // One table is one block. Rows and cells are editor-internal nodes owned by
  // the table node, so the page block tree never sees them.
  table: capability('table', { internalContent: true, mcp: { readable: true, writable: false } }),
}

export interface EditorNodeRule {
  /** Attribute names accepted by the node, excluding the shared blockIdentity attribute. */
  attrs: readonly string[]
  /** Allowed direct child node names, or null for a leaf node. */
  children: readonly string[] | null
}

/**
 * Node-level content model for the editor document. It is the single source for
 * editability (web codec) and for MCP read validation, so both layers accept
 * exactly the same documents.
 */
export const EDITOR_NODE_RULES: Record<string, EditorNodeRule> = {
  text: { attrs: [], children: null },
  hardBreak: { attrs: [], children: null },
  paragraph: { attrs: [], children: ['text', 'hardBreak'] },
  heading: { attrs: ['level'], children: ['text', 'hardBreak'] },
  bulletList: { attrs: [], children: ['listItem'] },
  orderedList: { attrs: ['start', 'type'], children: ['listItem'] },
  listItem: { attrs: [], children: ['paragraph', 'bulletList', 'orderedList'] },
  blockquote: { attrs: [], children: ['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'codeBlock', 'horizontalRule'] },
  codeBlock: { attrs: ['language'], children: ['text'] },
  horizontalRule: { attrs: [], children: null },
  eotionImage: { attrs: ['fileId', 'name', 'mimeType', 'size', 'url'], children: null },
  eotionFile: { attrs: ['fileId', 'name', 'mimeType', 'size', 'url'], children: null },
  eotionTodo: { attrs: ['checked'], children: ['text', 'hardBreak'] },
  eotionToggle: { attrs: [], children: BLOCK_NODE_NAMES },
  eotionCallout: { attrs: ['icon', 'tone'], children: ['text', 'hardBreak'] },
  // Table rows/cells are editor-internal nodes of the table block. Cells hold
  // plain paragraphs only, so a cell can never smuggle in another block.
  table: { attrs: [], children: ['tableRow'] },
  tableRow: { attrs: [], children: ['tableCell', 'tableHeader'] },
  tableCell: { attrs: ['colspan', 'rowspan', 'colwidth'], children: ['paragraph'] },
  tableHeader: { attrs: ['colspan', 'rowspan', 'colwidth'], children: ['paragraph'] },
}

/**
 * All editor node names accepted in a stored block document. `EDITOR_NODE_NAMES`
 * minus `BLOCK_NODE_NAMES` (text/hardBreak, listItem and the table rows/cells)
 * are editor-internal: they belong to a block's own content, never to the page
 * block tree.
 */
export const EDITOR_NODE_NAMES: readonly string[] = Object.keys(EDITOR_NODE_RULES)

/** Slash menu order and labels. Attachment commands are filtered by workspace availability. */
export const BLOCK_COMMANDS: readonly BlockCommandSpec[] = [
  { id: 'paragraph', type: 'paragraph', label: '文本', group: '基础', icon: 'text', search: 'text paragraph' },
  { id: 'heading1', type: 'heading', label: '一级标题', group: '基础', icon: 'heading', search: 'h1 heading' },
  { id: 'heading2', type: 'heading', label: '二级标题', group: '基础', icon: 'heading', search: 'h2 heading' },
  { id: 'bulletList', type: 'bulleted-list', label: '项目列表', group: '基础', icon: 'list', search: 'bullet list' },
  { id: 'orderedList', type: 'numbered-list', label: '编号列表', group: '基础', icon: 'list-ordered', search: 'ordered numbered list' },
  { id: 'todo', type: 'todo', label: '待办', group: '基础', icon: 'list-todo', search: 'todo task' },
  { id: 'quote', type: 'quote', label: '引用', group: '块', icon: 'quote', search: 'quote' },
  { id: 'codeBlock', type: 'code', label: '代码块', group: '块', icon: 'code', search: 'code' },
  { id: 'toggle', type: 'toggle', label: '折叠列表', group: '块', icon: 'chevron-right', search: 'toggle collapse fold' },
  { id: 'callout', type: 'callout', label: '提示块', group: '块', icon: 'info', search: 'callout tip info' },
  { id: 'table', type: 'table', label: '表格', group: '块', icon: 'table', search: 'table grid sheet' },
  { id: 'horizontalRule', type: 'divider', label: '分割线', group: '块', icon: 'minus', search: 'divider rule' },
  { id: 'image', type: 'image', label: '图片', group: '媒体', icon: 'image', search: 'image photo' },
  { id: 'file', type: 'file', label: '文件', group: '媒体', icon: 'file-text', search: 'file attachment' },
]

const blockTypeByNode = new Map<string, BlockType>(BLOCK_TYPES.map((type) => [BLOCK_NODE_TYPES[type], type]))

export function isBlockType(value: unknown): value is BlockType {
  return typeof value === 'string' && (BLOCK_TYPES as readonly string[]).includes(value)
}

export function blockCapability(type: BlockType): BlockCapability {
  return BLOCK_CAPABILITIES[type]
}

export function nodeTypeForBlock(type: BlockType): string {
  return BLOCK_NODE_TYPES[type]
}

export function blockTypeForNode(nodeType: string): BlockType | undefined {
  return blockTypeByNode.get(nodeType)
}

export function editorNodeRule(nodeType: string): EditorNodeRule | undefined {
  return EDITOR_NODE_RULES[nodeType]
}

export function blockAllowsChildren(type: BlockType): boolean {
  return BLOCK_CAPABILITIES[type].allowsChildren
}

/** The block's editor node owns editor-internal structure instead of page blocks. */
export function blockHasInternalContent(type: BlockType): boolean {
  return BLOCK_CAPABILITIES[type].internalContent
}

export function isAllowedChildBlockType(parentType: BlockType, childType: BlockType): boolean {
  const capability = BLOCK_CAPABILITIES[parentType]
  return capability.allowsChildren && capability.allowedChildTypes.includes(childType)
}

export function isAttachmentBlockType(type: BlockType): boolean {
  return BLOCK_CAPABILITIES[type].attachment
}

export function isMcpReadableBlockType(type: BlockType): boolean {
  return BLOCK_CAPABILITIES[type].mcp.readable
}

export function isMcpWritableBlockType(type: BlockType): boolean {
  return BLOCK_CAPABILITIES[type].mcp.writable
}

export function slashCommands(): readonly BlockCommandSpec[] {
  return BLOCK_COMMANDS.filter((command) => BLOCK_CAPABILITIES[command.type].slash)
}

export type CalloutTone = 'neutral' | 'info' | 'warning'

/** Validate persisted callout attributes after the caller removes blockId. */
export function validateCalloutAttrs(attrs: unknown): attrs is { icon: string; tone: CalloutTone } {
  if (typeof attrs !== 'object' || attrs === null || Array.isArray(attrs)) return false
  const value = attrs as Record<string, unknown>
  if (Object.keys(value).length !== 2 || !Object.hasOwn(value, 'icon') || !Object.hasOwn(value, 'tone')) return false
  return typeof value.icon === 'string'
    && value.icon.length >= 1
    && value.icon.length <= 32
    && !/[\u0000-\u001f\u007f-\u009f]/u.test(value.icon)
    && (value.tone === 'neutral' || value.tone === 'info' || value.tone === 'warning')
}

/** Block props use the shared editor node wrapper; blockId is stored by the editor identity layer. */
export function validateCalloutBlockProps(props: unknown): boolean {
  return validateBlockProps('callout', props)
}

function validCalloutMark(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const mark = value as Record<string, unknown>
  if (Object.keys(mark).some((key) => !['type', 'attrs'].includes(key))) return false
  if (!['bold', 'italic', 'strike', 'code', 'link'].includes(String(mark.type))) return false
  const attrs = mark.attrs === undefined ? {} : mark.attrs
  if (typeof attrs !== 'object' || attrs === null || Array.isArray(attrs)) return false
  const entries = attrs as Record<string, unknown>
  if (mark.type !== 'link') return Object.keys(entries).length === 0
  if (Object.keys(entries).length !== 1 || typeof entries.href !== 'string' || !/^https?:\/\//i.test(entries.href) || /\s|[\u0000-\u001f\u007f]/u.test(entries.href)) return false
  try {
    const url = new URL(entries.href)
    return !!url.hostname && (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password
  } catch {
    return false
  }
}

const TABLE_ATTRS = ['colspan', 'rowspan', 'colwidth'] as const

/**
 * One shared size budget for a table. The web codec, the domain props validator,
 * the editor paste guard and the MCP read contract all read it, so no layer can
 * accept a grid another layer would refuse.
 */
export const TABLE_LIMITS = {
  maxRows: 1000,
  maxCellsPerRow: 200,
  maxParagraphsPerCell: 100,
} as const

/** Cell span/width attributes are shared by the domain validator, the web codec and MCP read. */
export function validateTableCellAttrs(attrs: unknown): boolean {
  if (typeof attrs !== 'object' || attrs === null || Array.isArray(attrs)) return false
  const value = attrs as Record<string, unknown>
  if (Object.keys(value).some((key) => !(TABLE_ATTRS as readonly string[]).includes(key))) return false
  for (const span of ['colspan', 'rowspan'] as const) {
    const size = value[span]
    if (size !== undefined && (!Number.isSafeInteger(size) || (size as number) < 1)) return false
  }
  const colwidth = value.colwidth
  if (colwidth === undefined || colwidth === null) return true
  return Array.isArray(colwidth) && colwidth.every((width) => Number.isSafeInteger(width) && (width as number) >= 0)
}

/**
 * Validate a persisted table block. Rows and cells live inside the single
 * table node, so this is the only place that may accept or reject them.
 */
export function validateTableBlockProps(props: unknown): boolean {
  return validateBlockProps('table', props)
}

const MAX_EDITOR_NODE_DEPTH = 64
const MAX_EDITOR_NODE_COUNT = 100_000
const SAFE_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'] as const

interface ValidationBudget { count: number }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateAttachmentAttrs(attrs: unknown, nodeType: string): boolean {
  if (!isRecord(attrs)) return false
  const expected = ['fileId', 'name', 'mimeType', 'size', 'url']
  if (Object.keys(attrs).length !== expected.length || expected.some((key) => !Object.hasOwn(attrs, key))) return false
  if (typeof attrs.fileId !== 'string' || attrs.fileId.trim().length < 1 || attrs.fileId.trim().length > 256) return false
  if (typeof attrs.name !== 'string' || attrs.name.trim().length < 1 || attrs.name.trim().length > 200) return false
  if (typeof attrs.mimeType !== 'string' || attrs.mimeType.trim().length < 1 || attrs.mimeType.trim().length > 256) return false
  if (typeof attrs.size !== 'number' || !Number.isSafeInteger(attrs.size) || attrs.size < 0) return false
  if (typeof attrs.url !== 'string') return false
  try {
    const url = new URL(attrs.url)
    if (!url.hostname || (url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) return false
  } catch {
    return false
  }
  return nodeType !== 'eotionImage' || (SAFE_IMAGE_MIME_TYPES as readonly string[]).includes(attrs.mimeType)
}

function validateNodeAttrs(type: string, attrs: unknown): boolean {
  if (attrs !== undefined && !isRecord(attrs)) return false
  const value = (attrs ?? {}) as Record<string, unknown>
  const rule = EDITOR_NODE_RULES[type]
  if (!rule || Object.keys(value).some((key) => !rule.attrs.includes(key))) return false

  if (type === 'heading' && value.level !== undefined && (!Number.isSafeInteger(value.level) || (value.level as number) < 1 || (value.level as number) > 6)) return false
  if (type === 'orderedList') {
    if (value.start !== undefined && !Number.isSafeInteger(value.start)) return false
    if (value.type !== undefined && value.type !== null) return false
  }
  if (type === 'eotionTodo' && typeof value.checked !== 'boolean') return false
  if (type === 'codeBlock' && value.language !== undefined && value.language !== null && typeof value.language !== 'string') return false
  if (type === 'eotionCallout' && !validateCalloutAttrs(value)) return false
  if (type === 'eotionImage' || type === 'eotionFile') return validateAttachmentAttrs(value, type)
  if (type === 'tableCell' || type === 'tableHeader') return validateTableCellAttrs(value)
  return true
}

function validateEditorNode(value: unknown, budget: ValidationBudget, depth: number): value is Record<string, unknown> {
  if (depth > MAX_EDITOR_NODE_DEPTH || ++budget.count > MAX_EDITOR_NODE_COUNT || !isRecord(value)) return false
  const node = value
  if (typeof node.type !== 'string') return false
  const type = node.type
  const rule = EDITOR_NODE_RULES[type]
  if (!rule || Object.keys(node).some((key) => !['type', 'text', 'attrs', 'content', 'marks'].includes(key))) return false
  if (!validateNodeAttrs(type, node.attrs)) return false
  if (type === 'text') {
    if (typeof node.text !== 'string' || node.content !== undefined) return false
  } else if (node.text !== undefined) return false
  if ((type === 'eotionImage' || type === 'eotionFile') && node.content !== undefined) return false

  if (type === 'text' || type === 'hardBreak') {
    if (node.marks !== undefined && (!Array.isArray(node.marks) || !node.marks.every(validCalloutMark))) return false
  } else if (node.marks !== undefined) return false

  const children = node.content
  if (children !== undefined && !Array.isArray(children)) return false
  if (rule.children === null && Array.isArray(children) && children.length > 0) return false
  const list = (children ?? []) as unknown[]
  if (list.some((child) => !isRecord(child) || typeof child.type !== 'string' || !rule.children?.includes(child.type))) return false

  // Older persisted toggles may omit the empty summary; the codec restores a paragraph.
  if (type === 'eotionToggle' && list.length > 1) return false
  if (type === 'table' && (list.length < 1 || list.length > TABLE_LIMITS.maxRows)) return false
  if (type === 'tableRow' && (list.length < 1 || list.length > TABLE_LIMITS.maxCellsPerRow)) return false
  if ((type === 'tableCell' || type === 'tableHeader') && (list.length < 1 || list.length > TABLE_LIMITS.maxParagraphsPerCell)) return false

  for (const child of list) {
    if (type === 'eotionToggle') {
      const childType = blockTypeForNode((child as Record<string, unknown>).type as string)
      if (childType && blockCapability(childType).allowsChildren) return false
    }
    if (!validateEditorNode(child, budget, depth + 1)) return false
  }
  return true
}

/** Validate a strict persisted block wrapper using the shared editor registry. */
export function validateBlockProps(type: BlockType, props: unknown): boolean {
  try {
    if (!isRecord(props) || Object.keys(props).length !== 1 || !Object.hasOwn(props, 'node')) return false
    const node = props.node
    if (!isRecord(node) || node.type !== BLOCK_NODE_TYPES[type]) return false
    return validateEditorNode(node, { count: 0 }, 0)
  } catch {
    return false
  }
}
