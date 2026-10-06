import type { BlockCreateRequest, BlockResponse } from '@eotion/contracts'
import { AttachmentAttrsSchema, SAFE_IMAGE_MIME_TYPES } from '@eotion/contracts'
import { blockCapability, blockTypeForNode, editorNodeRule, isAttachmentBlockType, nodeTypeForBlock, validateCalloutAttrs } from '@eotion/domain/block-types'
import type { JSONContent } from '@tiptap/core'
import type { EditorDocument } from './editorDocument'
import { isSafeLinkHref } from './link'

/** One editor block: server identity, block type, sibling order and optional parent. */
export type EditorBlock = Pick<BlockCreateRequest, 'id' | 'type' | 'orderKey' | 'props' | 'parentBlockId'>

const markTypes = new Set(['bold', 'italic', 'strike', 'code', 'link'])
const UNSUPPORTED_PAGE = '此页面包含尚不支持编辑的区块。为保护原内容，编辑已暂停。'
const DUPLICATE_ATTACHMENT = '页面附件身份重复，为保护原文件，编辑已暂停。'

function compareKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

/**
 * Node-level validation shared with the server read contract: the accepted node
 * set and their content model come from the domain block registry, never from a
 * local table that can drift.
 */
function validNode(node: JSONContent): boolean {
  const type = node.type
  if (!type) return false
  const rule = editorNodeRule(type)
  if (!rule) return false
  if (type === 'text' && typeof node.text !== 'string') return false
  if (type !== 'text' && node.text !== undefined) return false
  if (Object.keys(node).some((key) => !['type', 'text', 'attrs', 'content', 'marks'].includes(key))) return false
  if (Object.keys(node.attrs ?? {}).some((attribute) => attribute !== 'blockId' && !rule.attrs.includes(attribute))) return false
  if (type === 'eotionImage' || type === 'eotionFile') {
    if (node.content !== undefined || node.marks !== undefined) return false
    const { blockId: _blockId, ...attrs } = node.attrs ?? {}
    if (!AttachmentAttrsSchema.safeParse(attrs).success) return false
    if (type === 'eotionImage' && !SAFE_IMAGE_MIME_TYPES.includes(String(attrs.mimeType) as typeof SAFE_IMAGE_MIME_TYPES[number])) return false
  }
  if (type === 'eotionTodo' && typeof node.attrs?.checked !== 'boolean') return false
  if (type === 'eotionCallout') {
    const { blockId: _blockId, ...attrs } = node.attrs ?? {}
    if (!validateCalloutAttrs(attrs)) return false
  }
  if (type === 'heading' && node.attrs?.level !== undefined && ![1, 2, 3, 4, 5, 6].includes(node.attrs.level)) return false
  // Tiptap 3 includes a null marker style on ordinary numbered lists.
  if (type === 'orderedList' && node.attrs?.type !== undefined && node.attrs.type !== null) return false
  if (node.marks?.some((mark) => {
    if (!markTypes.has(mark.type)) return true
    const attrs = mark.attrs ?? {}
    if (mark.type !== 'link') return Object.keys(attrs).length > 0
    return Object.keys(attrs).length !== 1 || typeof attrs.href !== 'string' || !isSafeLinkHref(attrs.href)
  })) return false
  const children = rule.children
  if (children === null && node.content?.length) return false
  if (node.content?.some((child) => !child.type || !children?.includes(child.type))) return false
  if (node.content?.some((child) => !validNode(child))) return false
  return true
}

function stripIdentity(node: JSONContent): JSONContent {
  const { blockId: _id, ...attrs } = node.attrs ?? {}
  if (node.type === 'orderedList' && attrs.type === null) delete attrs.type
  const { attrs: _oldAttrs, ...rest } = node
  return { ...rest, ...(Object.keys(attrs).length ? { attrs } : {}), ...(node.content ? { content: node.content.map(stripIdentity) } : {}) }
}

function hasIdentity(node: JSONContent): boolean {
  return node.attrs?.blockId !== undefined || !!node.content?.some(hasIdentity)
}

function isEmptyPlaceholder(node: JSONContent): boolean {
  return node.type === 'paragraph' && (!node.content || node.content.length === 0)
}

/** A node that owns server blocks cannot also be another block's summary. */
function isChildOwningNode(node: JSONContent): boolean {
  const type = node.type ? blockTypeForNode(node.type) : undefined
  return type !== undefined && blockCapability(type).allowsChildren
}

/** Validates one stored block and returns its editor node with identity applied. */
function blockToNode(block: BlockResponse, attachmentFileIds: Set<string>): JSONContent {
  const node = block.props?.node as JSONContent | undefined
  if (!node || Object.keys(block.props).some((key) => key !== 'node') || nodeTypeForBlock(block.type) !== node.type || !validNode(node) || hasIdentity(node)) {
    throw new Error(UNSUPPORTED_PAGE)
  }
  if (isAttachmentBlockType(block.type)) {
    const fileId = node.attrs?.fileId
    if (typeof fileId !== 'string' || attachmentFileIds.has(fileId)) throw new Error(DUPLICATE_ATTACHMENT)
    attachmentFileIds.add(fileId)
  }
  return { ...node, attrs: { ...node.attrs, blockId: block.id } }
}

/**
 * Rebuilds the editor document from the page's flat block list. Sibling order
 * comes from orderKey, nesting from parentBlockId, and any structure this editor
 * cannot represent aborts the load instead of silently dropping content.
 */
export function blocksToDocument(blocks: BlockResponse[]): EditorDocument {
  const byId = new Map(blocks.map((block) => [block.id, block]))
  const childrenOf = new Map<string, BlockResponse[]>()
  const roots: BlockResponse[] = []
  for (const block of blocks) {
    const parentId = block.parentBlockId ?? null
    if (parentId === null) {
      roots.push(block)
      continue
    }
    if (!byId.has(parentId)) throw new Error(UNSUPPORTED_PAGE)
    const children = childrenOf.get(parentId)
    if (children) children.push(block)
    else childrenOf.set(parentId, [block])
  }
  const sortSiblings = (siblings: BlockResponse[]): BlockResponse[] => siblings
    .sort((left, right) => compareKeys(left.orderKey, right.orderKey) || compareKeys(left.id, right.id))
  const attachmentFileIds = new Set<string>()
  const visited = new Set<string>()
  const build = (block: BlockResponse): JSONContent => {
    if (visited.has(block.id)) throw new Error(UNSUPPORTED_PAGE)
    visited.add(block.id)
    const node = blockToNode(block, attachmentFileIds)
    const capability = blockCapability(block.type)
    const children = sortSiblings(childrenOf.get(block.id) ?? [])
    if (!capability.allowsChildren) {
      // Leaf and self-contained blocks keep exactly the stored node. Injecting an
      // empty content array here would make the node unsaveable after a reload.
      if (children.length) throw new Error(UNSUPPORTED_PAGE)
      return node
    }
    // A child-owning block always keeps its own summary node as its first child,
    // and that summary must not itself own blocks.
    const storedSummary = node.content?.length ? node.content : [{ type: 'paragraph' }]
    const first = storedSummary[0]
    const summary = first && isChildOwningNode(first) ? [{ type: 'paragraph' }, ...storedSummary] : storedSummary
    if (!children.length) return { ...node, content: summary }
    const rule = editorNodeRule(node.type!)
    const childNodes = children.map((child) => {
      const childNode = build(child)
      if (!rule?.children?.includes(childNode.type ?? '')) throw new Error(UNSUPPORTED_PAGE)
      return childNode
    })
    return { ...node, content: [...summary, ...childNodes] }
  }
  const content = sortSiblings(roots).map(build)
  // Fail closed: a duplicate id or a parent cycle would otherwise drop blocks
  // silently and let the next save delete them.
  if (byId.size !== blocks.length || visited.size !== blocks.length) throw new Error(UNSUPPORTED_PAGE)
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
}

/**
 * The editor snapshot contains semantic block JSON, never selection/UI state.
 * A block that owns children (toggle) stores only its summary node in props and
 * emits every remaining child as its own block with parentBlockId.
 */
export function documentToBlocks(document: JSONContent, baseline: BlockResponse[], keepEmptyPlaceholder = false): EditorBlock[] {
  const content = document.content ?? []
  if (document.type !== 'doc' || content.some((node) => !node.type || !blockTypeForNode(node.type) || !validNode(node))) {
    throw new Error('编辑器包含尚不支持保存的内容。')
  }
  // Some select-all/delete transactions leave a temporarily empty doc rather
  // than an empty paragraph. Keep one existing block so clearing a page never
  // turns it into an accidental delete of every server block.
  if (baseline.length > 0 && content.length === 0) {
    return [{ id: baseline[0]!.id, type: 'paragraph', orderKey: '', parentBlockId: null, props: { node: { type: 'paragraph' } } }]
  }
  if (!keepEmptyPlaceholder && baseline.length === 0 && content.length === 1 && isEmptyPlaceholder(content[0]!)) return []
  const seen = new Set<string>()
  const fileIds = new Set<string>()
  const blocks: EditorBlock[] = []
  const walk = (nodes: JSONContent[], parentBlockId: string | null): void => {
    for (const node of nodes) {
      const type = node.type ? blockTypeForNode(node.type) : undefined
      if (!type) throw new Error('编辑器包含尚不支持保存的内容。')
      const id = node.attrs?.blockId
      if (typeof id !== 'string' || !id || seen.has(id)) throw new Error('区块身份尚未就绪，无法安全保存。')
      seen.add(id)
      if (isAttachmentBlockType(type)) {
        const fileId = node.attrs?.fileId
        if (typeof fileId !== 'string' || fileIds.has(fileId)) throw new Error('附件身份重复，无法安全保存。')
        fileIds.add(fileId)
      }
      const children = node.content ?? []
      if (!blockCapability(type).allowsChildren) {
        blocks.push({ id, type, orderKey: '', parentBlockId, props: { node: stripIdentity(node) } })
        continue
      }
      // The first child is this block's own summary. If the editor produced a
      // child-owning node there, it becomes a real child block instead so its
      // own children stay in the block tree.
      const first = children[0]
      const firstOwnsChildren = first !== undefined && isChildOwningNode(first)
      const summary = first === undefined || firstOwnsChildren ? { type: 'paragraph' } : first
      const childNodes = firstOwnsChildren ? children : children.slice(1)
      blocks.push({ id, type, orderKey: '', parentBlockId, props: { node: stripIdentity({ ...node, content: [summary] }) } })
      walk(childNodes, id)
    }
  }
  walk(content, null)
  return blocks
}
