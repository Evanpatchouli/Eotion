import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PageRecord, ServerBlockRecord } from '../server-domain/types'
import { assertMcpResultSize, toMcpBlock, toMcpBlocks, toMcpPageSummary } from './mcp-read.contract'

const page = {
  id: 'page-1', workspaceId: 'workspace-1', title: 'A page', parentPageId: null,
  updatedAt: '2026-10-06T00:00:00.000Z', createdAt: '2026-10-05T00:00:00.000Z', orderKey: 'private-order',
} satisfies PageRecord

function block(type: string, node: unknown, id = `block-${type}`): ServerBlockRecord {
  return {
    id, workspaceId: 'workspace-1', pageId: 'page-1', parentBlockId: null, type: type as ServerBlockRecord['type'],
    orderKey: 'private-order', createdAt: '2026-10-05T00:00:00.000Z', updatedAt: '2026-10-06T00:00:00.000Z',
    props: { node },
  }
}

test('MCP page summary exposes only its stable public fields', () => {
  assert.deepEqual(toMcpPageSummary(page), {
    id: 'page-1', workspaceId: 'workspace-1', title: 'A page', parentPageId: null, updatedAt: '2026-10-06T00:00:00.000Z',
  })
})

test('MCP block mapper renders all ten supported block types and preserves order and readable content', () => {
  const blocks = [
    block('paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'line one' }, { type: 'hardBreak' }, { type: 'text', text: 'line two' }] }),
    block('heading', { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Heading' }] }),
    block('bulleted-list', { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }] }] }),
    block('numbered-list', { type: 'orderedList', attrs: { start: 4, type: null }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'second' }] }] }] }),
    block('quote', { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'cited' }] }] }),
    block('code', { type: 'codeBlock', attrs: { language: null }, content: [{ type: 'text', text: 'const x = 1' }] }),
    block('divider', { type: 'horizontalRule' }),
    block('image', { type: 'eotionImage', attrs: { fileId: 'file-image', name: 'image.png', mimeType: 'image/png', size: 12, url: 'https://private.invalid/signed' } }),
    block('file', { type: 'eotionFile', attrs: { fileId: 'file-doc', name: 'doc.pdf', mimeType: 'application/pdf', size: 34, url: 'https://private.invalid/signed' } }),
    block('todo', { type: 'eotionTodo', attrs: { checked: true }, content: [{ type: 'text', text: 'done' }] }),
  ]
  const mapped = toMcpBlocks(blocks)
  assert.deepEqual(mapped.map(({ type }) => type), ['paragraph', 'heading', 'bulleted-list', 'numbered-list', 'quote', 'code', 'divider', 'image', 'file', 'todo'])
  assert.deepEqual(mapped.map(({ id }) => id), blocks.map(({ id }) => id))
  assert.equal(mapped[0]!.text, 'line one\nline two')
  assert.equal(mapped[1]!.level, 3)
  assert.equal(mapped[2]!.text, '• one\n• two')
  assert.equal(mapped[3]!.text, '4. first\n5. second')
  assert.equal(mapped[3]!.start, 4)
  assert.equal(mapped[4]!.text, '> cited')
  assert.equal(mapped[5]!.text, 'const x = 1')
  assert.equal(mapped[5]!.language, undefined)
  assert.equal(mapped[6]!.text, '')
  assert.deepEqual({ fileId: mapped[7]!.fileId, name: mapped[7]!.name, mimeType: mapped[7]!.mimeType, size: mapped[7]!.size }, {
    fileId: 'file-image', name: 'image.png', mimeType: 'image/png', size: 12,
  })
  assert.equal(mapped[8]!.fileId, 'file-doc')
  assert.equal(mapped[9]!.checked, true)
  assert.equal(mapped[9]!.text, 'done')
  assert.doesNotMatch(JSON.stringify(mapped), /workspaceId|pageId|parentBlockId|orderKey|createdAt|updatedAt|signed|props|url|node|blockId/)
})

test('MCP mapper rejects unsupported, malformed, nested, and oversized data without passthrough', () => {
  assert.throws(() => toMcpBlock(block('paragraph', { type: 'paragraph', attrs: { blockId: 'internal' } })))
  assert.throws(() => toMcpBlock(block('paragraph', { type: 'unknown', content: [] })))
  assert.throws(() => toMcpBlock({ ...block('paragraph', { type: 'paragraph' }), parentBlockId: 'parent' }))
  assert.throws(() => toMcpBlocks([block('paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(100_001) }] })]))
  assert.throws(() => toMcpBlocks(Array.from({ length: 1001 }, (_, index) => block('divider', { type: 'horizontalRule' }, `block-${index}`))))
  assert.throws(() => assertMcpResultSize({ text: 'x'.repeat(1024 * 1024) }))
})

test('MCP mapper accepts the depth and cumulative node limits, then rejects the next level or node', () => {
  const nestedQuote = (depth: number): unknown => depth === 1
    ? { type: 'blockquote' }
    : { type: 'blockquote', content: [nestedQuote(depth - 1)] }
  assert.equal(toMcpBlock(block('quote', nestedQuote(32))).type, 'quote')
  assert.throws(() => toMcpBlock(block('quote', nestedQuote(33))))

  const atLimit = Array.from({ length: 1000 }, (_, index) => block('paragraph', {
    type: 'paragraph', content: Array.from({ length: 9 }, () => ({ type: 'hardBreak' })),
  }, `at-${index}`))
  assert.equal(toMcpBlocks(atLimit).length, 1000)
  const overLimit = Array.from({ length: 1000 }, (_, index) => block('paragraph', {
    type: 'paragraph', content: Array.from({ length: 10 }, () => ({ type: 'hardBreak' })),
  }, `over-${index}`))
  assert.throws(() => toMcpBlocks(overLimit))
})

test('MCP mapper stops when the cumulative block DTO JSON exceeds one MiB', () => {
  const body = 'x'.repeat(60_000)
  const blocks = Array.from({ length: 18 }, (_, index) => block('paragraph', {
    type: 'paragraph', content: [{ type: 'text', text: body }],
  }, `large-${index}`))
  assert.throws(() => toMcpBlocks(blocks))
})
