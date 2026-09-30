import type { BlockResponse, BlockCreateRequest } from '@eotion/contracts'
import type { JSONContent } from '@tiptap/core'

export type EditorBlock = Pick<BlockCreateRequest, 'id' | 'type' | 'orderKey' | 'props'>

const nodeTypes = {
  paragraph: 'paragraph',
  heading: 'heading',
  bulletList: 'bulleted-list',
  orderedList: 'numbered-list',
  blockquote: 'quote',
  codeBlock: 'code',
  horizontalRule: 'divider',
} as const

const blockNodes = Object.fromEntries(Object.entries(nodeTypes).map(([node, type]) => [type, node])) as Record<string, string>
const nestedTypes = new Set(['text', 'paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'blockquote', 'codeBlock', 'hardBreak', 'horizontalRule'])
const markTypes = new Set(['bold', 'italic', 'strike', 'code'])
const allowedAttrs: Record<string, string[]> = {
  text: [], paragraph: [], heading: ['level'], bulletList: [], orderedList: ['start'],
  listItem: [], blockquote: [], codeBlock: ['language'], hardBreak: [], horizontalRule: [],
}
const allowedChildren: Record<string, string[] | null> = {
  text: null, paragraph: ['text', 'hardBreak'], heading: ['text', 'hardBreak'],
  bulletList: ['listItem'], orderedList: ['listItem'], listItem: ['paragraph', 'bulletList', 'orderedList'],
  blockquote: ['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'codeBlock', 'horizontalRule'],
  codeBlock: ['text'], hardBreak: null, horizontalRule: null,
}

function validNode(node: JSONContent): boolean {
  const type = node.type
  if (!type || !nestedTypes.has(type)) return false
  if (type === 'text' && typeof node.text !== 'string') return false
  if (type !== 'text' && node.text !== undefined) return false
  if (Object.keys(node).some((key) => !['type', 'text', 'attrs', 'content', 'marks'].includes(key))) return false
  if (Object.keys(node.attrs ?? {}).some((attribute) => attribute !== 'blockId' && !allowedAttrs[type]!.includes(attribute))) return false
  if (type === 'heading' && node.attrs?.level !== undefined && ![1, 2, 3, 4, 5, 6].includes(node.attrs.level)) return false
  if (node.marks?.some((mark) => !markTypes.has(mark.type) || Object.keys(mark.attrs ?? {}).length > 0)) return false
  const children = allowedChildren[type]
  if (children === null && node.content?.length) return false
  if (node.content?.some((child) => !child.type || !children?.includes(child.type))) return false
  if (node.content?.some((child) => !validNode(child))) return false
  return true
}

function stripIdentity(node: JSONContent): JSONContent {
  const { blockId: _id, ...attrs } = node.attrs ?? {}
  const { attrs: _oldAttrs, ...rest } = node
  return { ...rest, ...(Object.keys(attrs).length ? { attrs } : {}), ...(node.content ? { content: node.content.map(stripIdentity) } : {}) }
}

function hasIdentity(node: JSONContent): boolean {
  return node.attrs?.blockId !== undefined || !!node.content?.some(hasIdentity)
}

function isEmptyPlaceholder(node: JSONContent): boolean {
  return node.type === 'paragraph' && (!node.content || node.content.length === 0)
}

/** Server blocks are only editable when their complete JSON can be understood. */
export function blocksToDocument(blocks: BlockResponse[]): JSONContent {
  const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
  const sorted = [...blocks].sort((a, b) => compare(a.orderKey, b.orderKey) || compare(a.id, b.id))
  const content = sorted.map((block) => {
    const node = block.props.node as JSONContent | undefined
    if (block.parentBlockId || Object.keys(block.props).some((key) => key !== 'node') || !node || blockNodes[block.type] !== node.type || !validNode(node) || hasIdentity(node)) {
      throw new Error('此页面包含尚不支持编辑的区块。为保护原内容，编辑已暂停。')
    }
    return { ...node, attrs: { ...node.attrs, blockId: block.id } }
  })
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
}

/** The editor snapshot contains semantic block JSON, never selection/UI state. */
export function documentToBlocks(document: JSONContent, baseline: BlockResponse[], keepEmptyPlaceholder = false): EditorBlock[] {
  const content = document.content ?? []
  if (document.type !== 'doc' || content.some((node) => !node.type || !(node.type in nodeTypes) || !validNode(node))) {
    throw new Error('编辑器包含尚不支持保存的内容。')
  }
  // Some select-all/delete transactions leave a temporarily empty doc rather
  // than an empty paragraph. Keep one existing block so clearing a page never
  // turns it into an accidental delete of every server block.
  if (baseline.length > 0 && content.length === 0) {
    return [{ id: baseline[0]!.id, type: 'paragraph', orderKey: '', props: { node: { type: 'paragraph' } } }]
  }
  if (!keepEmptyPlaceholder && baseline.length === 0 && content.length === 1 && isEmptyPlaceholder(content[0]!)) return []
  const seen = new Set<string>()
  return content.map((node) => {
    const id = node.attrs?.blockId
    if (typeof id !== 'string' || !id || seen.has(id)) throw new Error('区块身份尚未就绪，无法安全保存。')
    seen.add(id)
    return {
      id,
      type: nodeTypes[node.type as keyof typeof nodeTypes],
      orderKey: '',
      props: { node: stripIdentity(node) },
    }
  })
}
