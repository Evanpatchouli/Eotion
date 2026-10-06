import { z } from 'zod'
import type { PageRecord, ServerBlockRecord } from '../server-domain/types'

const idSchema = z.string().trim().min(1).max(128)
const cursorSchema = z.string().trim().min(1).max(128)

export const ListPagesInputSchema = z.strictObject({
  workspaceId: idSchema,
  cursor: cursorSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
})

export const SearchPagesInputSchema = z.strictObject({
  workspaceId: idSchema,
  query: z.string().trim().min(1).max(200),
  cursor: cursorSchema.optional(),
  limit: z.number().int().min(1).max(100).default(20),
})

export const GetPageInputSchema = z.strictObject({ pageId: idSchema })

export const McpPageSummarySchema = z.strictObject({
  id: z.string(),
  workspaceId: z.string(),
  title: z.string(),
  parentPageId: z.string().nullable(),
  updatedAt: z.string(),
})

const McpBlockTypeSchema = z.enum(['paragraph', 'heading', 'bulleted-list', 'numbered-list', 'quote', 'code', 'divider', 'image', 'file', 'todo'])
const McpBlockBaseSchema = z.strictObject({
  id: z.string(), type: McpBlockTypeSchema, text: z.string(),
  items: z.array(z.string()).max(1000).optional(),
  paragraphs: z.array(z.string()).max(1000).optional(),
})
export const McpBlockSchema = McpBlockBaseSchema.extend({
  level: z.number().int().min(1).max(6).optional(),
  checked: z.boolean().optional(),
  language: z.string().optional(),
  start: z.number().int().optional(),
  fileId: z.string().optional(),
  name: z.string().optional(),
  mimeType: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
})

export const ListPagesOutputSchema = z.strictObject({ items: z.array(McpPageSummarySchema), nextCursor: z.string().nullable() })
export const GetPageOutputSchema = z.strictObject({ ...McpPageSummarySchema.shape, blocks: z.array(McpBlockSchema) })

export type McpPageSummary = z.infer<typeof McpPageSummarySchema>
export type McpBlock = z.infer<typeof McpBlockSchema>
export type ListPagesOutput = z.infer<typeof ListPagesOutputSchema>
export type GetPageOutput = z.infer<typeof GetPageOutputSchema>

const MAX_BLOCKS = 1000
const MAX_TEXT_CHARS = 100_000
const MAX_NODE_DEPTH = 32
const MAX_NODES = 10_000
const MAX_RESULT_BYTES = 1024 * 1024

const blockTypeToNode: Record<string, string> = {
  paragraph: 'paragraph',
  heading: 'heading',
  'bulleted-list': 'bulletList',
  'numbered-list': 'orderedList',
  quote: 'blockquote',
  code: 'codeBlock',
  divider: 'horizontalRule',
  image: 'eotionImage',
  file: 'eotionFile',
  todo: 'eotionTodo',
}

const nodeTypeSet = new Set(Object.values(blockTypeToNode).concat(['text', 'hardBreak', 'listItem']))
const safeImageMimeTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'])
const allowedAttrs: Record<string, readonly string[]> = {
  paragraph: [], heading: ['level'], bulletList: [], orderedList: ['start', 'type'], listItem: [],
  blockquote: [], codeBlock: ['language'], hardBreak: [], horizontalRule: [],
  eotionImage: ['fileId', 'name', 'mimeType', 'size', 'url'], eotionFile: ['fileId', 'name', 'mimeType', 'size', 'url'],
  eotionTodo: ['checked'], text: [],
}
const allowedChildren: Record<string, readonly string[] | null> = {
  text: null, paragraph: ['text', 'hardBreak'], heading: ['text', 'hardBreak'],
  bulletList: ['listItem'], orderedList: ['listItem'], listItem: ['paragraph', 'bulletList', 'orderedList'],
  blockquote: ['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'codeBlock', 'horizontalRule'],
  codeBlock: ['text'], hardBreak: null, horizontalRule: null, eotionImage: null, eotionFile: null,
  eotionTodo: ['text', 'hardBreak'],
}

type JsonNode = { type: string; text?: string; attrs?: Record<string, unknown>; content?: JsonNode[]; marks?: unknown[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readNode(value: unknown, depth: number, counter: { nodes: number; textChars: number }): JsonNode {
  if (depth > MAX_NODE_DEPTH || ++counter.nodes > MAX_NODES || !isRecord(value)) throw new Error('Unsupported block')
  const { type, text, attrs, content, marks, ...extra } = value
  if (Object.keys(extra).length || typeof type !== 'string' || !nodeTypeSet.has(type)) throw new Error('Unsupported block')
  if (marks !== undefined) {
    if (!Array.isArray(marks) || marks.some((mark) => {
      if (!isRecord(mark) || Object.keys(mark).some((key) => key !== 'type' && key !== 'attrs') || !['bold', 'italic', 'strike', 'code', 'link'].includes(String(mark.type))) return true
      const markAttrs = mark.attrs === undefined ? {} : mark.attrs
      if (!isRecord(markAttrs)) return true
      if (mark.type !== 'link') return Object.keys(markAttrs).length > 0
      const href = markAttrs.href
      if (Object.keys(markAttrs).length !== 1 || typeof href !== 'string' || !/^https?:\/\//i.test(href) || /\s|[\u0000-\u001f\u007f]/u.test(href)) return true
      try {
        const url = new URL(href)
        return !url.hostname || (url.protocol !== 'http:' && url.protocol !== 'https:') || !!url.username || !!url.password
      } catch {
        return true
      }
    })) throw new Error('Unsupported block')
  }
  if (type === 'text' ? typeof text !== 'string' : text !== undefined) throw new Error('Unsupported block')
  if (typeof text === 'string') {
    counter.textChars += text.length
    if (counter.textChars > MAX_TEXT_CHARS) throw new Error('Block text too large')
  }
  if (attrs !== undefined && !isRecord(attrs)) throw new Error('Unsupported block')
  const cleanAttrs = attrs ? { ...attrs } : undefined
  if (cleanAttrs && Object.keys(cleanAttrs).some((key) => key === 'blockId' || !allowedAttrs[type]!.includes(key))) throw new Error('Unsupported block')
  if (content !== undefined && (!Array.isArray(content) || content.some((child) => !isRecord(child) || typeof child.type !== 'string' || !allowedChildren[type]?.includes(child.type)))) throw new Error('Unsupported block')
  if ((allowedChildren[type] === null || !allowedChildren[type]) && content !== undefined && content.length > 0) throw new Error('Unsupported block')
  if (type === 'heading' && cleanAttrs?.level !== undefined && ![1, 2, 3, 4, 5, 6].includes(Number(cleanAttrs.level))) throw new Error('Unsupported block')
  if (type === 'eotionTodo' && typeof cleanAttrs?.checked !== 'boolean') throw new Error('Unsupported block')
  if (type === 'orderedList' && cleanAttrs?.type !== undefined && cleanAttrs.type !== null) throw new Error('Unsupported block')
  if (type === 'eotionImage' || type === 'eotionFile') {
    if (typeof cleanAttrs?.fileId !== 'string' || !cleanAttrs.fileId.trim() || cleanAttrs.fileId.length > 256
      || typeof cleanAttrs.name !== 'string' || !cleanAttrs.name.trim() || cleanAttrs.name.length > 200
      || typeof cleanAttrs.mimeType !== 'string' || !cleanAttrs.mimeType.trim() || cleanAttrs.mimeType.length > 256
      || !Number.isSafeInteger(cleanAttrs.size) || Number(cleanAttrs.size) < 0
      || typeof cleanAttrs.url !== 'string') throw new Error('Unsupported block')
    try {
      const url = new URL(cleanAttrs.url)
      if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) throw new Error('Unsupported block')
    } catch {
      throw new Error('Unsupported block')
    }
    if (type === 'eotionImage' && !safeImageMimeTypes.has(String(cleanAttrs.mimeType).trim().toLowerCase())) throw new Error('Unsupported block')
  }
  if (type === 'codeBlock' && cleanAttrs?.language !== undefined && cleanAttrs.language !== null && typeof cleanAttrs.language !== 'string') throw new Error('Unsupported block')
  if (type === 'orderedList' && cleanAttrs?.start !== undefined && !Number.isSafeInteger(cleanAttrs.start)) throw new Error('Unsupported block')
  return {
    type,
    ...(typeof text === 'string' ? { text } : {}),
    ...(cleanAttrs ? { attrs: cleanAttrs } : {}),
    ...(Array.isArray(content) ? { content: content.map((child) => readNode(child, depth + 1, counter)) } : {}),
  }
}

function inlineText(nodes: JsonNode[] = []): string {
  return nodes.map((node) => node.type === 'hardBreak' ? '\n' : node.type === 'text' ? node.text ?? '' : '').join('')
}

function renderList(node: JsonNode, depth: number): string {
  const ordered = node.type === 'orderedList'
  const start = ordered && Number.isSafeInteger(node.attrs?.start) ? Number(node.attrs?.start) : 1
  return (node.content ?? []).map((item, index) => {
    const indent = '  '.repeat(depth)
    const marker = ordered ? `${start + index}. ` : '• '
    const parts: string[] = []
    for (const child of item.content ?? []) {
      if (child.type === 'paragraph') parts.push(inlineText(child.content))
      else if (child.type === 'bulletList' || child.type === 'orderedList') parts.push(renderList(child, depth + 1))
    }
    const body = parts.shift() ?? ''
    const nested = parts.length ? `\n${parts.join('\n')}` : ''
    return `${indent}${marker}${body}${nested}`
  }).join('\n')
}

function renderQuote(node: JsonNode, depth = 0): string {
  return (node.content ?? []).map((child) => {
    let text: string
    if (child.type === 'paragraph' || child.type === 'heading') text = inlineText(child.content)
    else if (child.type === 'bulletList' || child.type === 'orderedList') text = renderList(child, depth)
    else if (child.type === 'blockquote') text = renderQuote(child, depth + 1)
    else if (child.type === 'codeBlock') text = inlineText(child.content)
    else text = ''
    return text.split('\n').map((line) => `${'  '.repeat(depth)}> ${line}`).join('\n')
  }).join('\n')
}

function textFor(type: string, node: JsonNode): string {
  if (type === 'bulleted-list' || type === 'numbered-list') return renderList(node, 0)
  if (type === 'quote') return renderQuote(node)
  if (type === 'code') return inlineText(node.content)
  if (type === 'divider' || type === 'image' || type === 'file') return ''
  return inlineText(node.content)
}

function listItems(node: JsonNode): string[] | undefined {
  const items = node.content ?? []
  if (items.length < 1 || items.length > 1000 || items.some((item) => item.content?.length !== 1 || item.content[0]?.type !== 'paragraph')) return undefined
  return items.map((item) => inlineText(item.content![0]!.content))
}

function quoteParagraphs(node: JsonNode): string[] | undefined {
  const content = node.content ?? []
  if (content.length < 1 || content.length > 1000 || content.some((child) => child.type !== 'paragraph')) return undefined
  return content.map((child) => inlineText(child.content))
}

export function toMcpPageSummary(page: PageRecord): McpPageSummary {
  return { id: page.id, workspaceId: page.workspaceId, title: page.title, parentPageId: page.parentPageId, updatedAt: page.updatedAt }
}

export function toMcpBlock(block: ServerBlockRecord, counter = { nodes: 0 }): McpBlock {
  if (block.parentBlockId != null) throw new Error('Unsupported nested block')
  const expectedNode = blockTypeToNode[block.type]
  if (!expectedNode || !isRecord(block.props) || Object.keys(block.props).length !== 1 || !('node' in block.props)) throw new Error('Unsupported block')
  const textCounter = { nodes: counter.nodes, textChars: 0 }
  const node = readNode(block.props.node, 1, textCounter)
  counter.nodes = textCounter.nodes
  if (node.type !== expectedNode) throw new Error('Unsupported block')
  const dto: McpBlock = { id: block.id, type: block.type, text: textFor(block.type, node) }
  if (block.type === 'bulleted-list' || block.type === 'numbered-list') {
    const items = listItems(node)
    if (items) dto.items = items
  }
  if (block.type === 'quote') {
    const paragraphs = quoteParagraphs(node)
    if (paragraphs) dto.paragraphs = paragraphs
  }
  const attrs = node.attrs ?? {}
  if (block.type === 'heading' && attrs.level !== undefined) dto.level = Number(attrs.level)
  if (block.type === 'todo') dto.checked = Boolean(attrs.checked)
  if (block.type === 'code' && typeof attrs.language === 'string') dto.language = attrs.language
  if (block.type === 'numbered-list' && typeof attrs.start === 'number') dto.start = attrs.start
  if (block.type === 'image' || block.type === 'file') {
    dto.fileId = String(attrs.fileId)
    dto.name = String(attrs.name)
    dto.mimeType = String(attrs.mimeType)
    dto.size = Number(attrs.size)
  }
  if (dto.text.length > MAX_TEXT_CHARS) throw new Error('Block text too large')
  return dto
}

export function assertMcpResultSize<T>(result: T): T {
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_RESULT_BYTES) throw new Error('MCP result too large')
  return result
}

export function toMcpBlocks(blocks: ServerBlockRecord[]): McpBlock[] {
  if (blocks.length > MAX_BLOCKS) throw new Error('Too many blocks')
  const counter = { nodes: 0 }
  const mapped: McpBlock[] = []
  let mappedBytes = 2 // JSON array brackets
  for (const block of blocks) {
    const dto = toMcpBlock(block, counter)
    mappedBytes += Buffer.byteLength(JSON.stringify(dto), 'utf8') + (mapped.length ? 1 : 0)
    if (mappedBytes > MAX_RESULT_BYTES) throw new Error('MCP result too large')
    mapped.push(dto)
  }
  return mapped
}
