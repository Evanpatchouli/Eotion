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
}

/** All editor node names accepted in a stored block document. */
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
  if (typeof props !== 'object' || props === null || Array.isArray(props)) return false
  if (Object.keys(props).length !== 1 || !Object.hasOwn(props, 'node')) return false
  const node = (props as Record<string, unknown>).node
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return false
  const record = node as Record<string, unknown>
  if (record.type !== 'eotionCallout' || Object.keys(record).some((key) => !['type', 'attrs', 'content'].includes(key))) return false
  if (!validateCalloutAttrs(record.attrs)) return false
  if (record.content === undefined) return true
  if (!Array.isArray(record.content)) return false
  return record.content.every((child: unknown) => {
    if (typeof child !== 'object' || child === null || Array.isArray(child)) return false
    const inline = child as Record<string, unknown>
    if (inline.type === 'hardBreak') return Object.keys(inline).length === 1
    if (inline.type !== 'text' || typeof inline.text !== 'string' || Object.keys(inline).some((key) => !['type', 'text', 'marks'].includes(key))) return false
    if (inline.marks === undefined) return true
    return Array.isArray(inline.marks) && inline.marks.every(validCalloutMark)
  })
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

/** Type-specific persisted props checks live with the block registry. */
export function validateBlockProps(type: BlockType, props: unknown): boolean {
  return type === 'callout' ? validateCalloutBlockProps(props) : true
}
