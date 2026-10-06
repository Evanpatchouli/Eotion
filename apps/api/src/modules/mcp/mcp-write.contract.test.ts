import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ServerBlockRecord } from '../server-domain/types'
import { toDocumentBlocks } from '../server-domain/services/document-block-codec'
import { GetPageOutputSchema, toMcpBlock } from './mcp-read.contract'
import {
  assertMcpWritePayloadSize,
  CreatePageInputSchema,
  UpdatePageInputSchema,
} from './mcp-write.contract'

test('create and update page input schemas enforce strict stable write shapes', () => {
  const create = CreatePageInputSchema.parse({
    workspaceId: ' workspace-1 ', parentPageId: null, title: '  Page  ', idempotencyKey: ' key-1 ', blocks: [],
  })
  assert.equal(create.workspaceId, 'workspace-1')
  assert.equal(create.title, 'Page')
  assert.equal(create.blocks.length, 0)
  assert.deepEqual(CreatePageInputSchema.parse({ workspaceId: 'workspace-1', title: 'Page', idempotencyKey: 'key-1' }).blocks, [])
  assert.equal(UpdatePageInputSchema.safeParse({ pageId: 'page-1', expectedUpdatedAt: '2026-10-06T12:00:00.000Z', idempotencyKey: 'key-2', title: ' Renamed ' }).success, true)
  assert.equal(UpdatePageInputSchema.safeParse({ pageId: 'page-1', expectedUpdatedAt: '2026-10-06T12:00:00.000Z', idempotencyKey: 'key-2', blocks: [] }).success, true)

  for (const value of [
    { workspaceId: 'w', title: '  ', idempotencyKey: 'k' },
    { workspaceId: 'w', title: 'x', idempotencyKey: 'k', extra: true },
    { workspaceId: 'w', title: 'x', idempotencyKey: 'k', blocks: [{ type: 'paragraph', id: 'caller-id', text: 'x' }] },
    { workspaceId: 'w', title: 'x', idempotencyKey: 'k', blocks: [{ type: 'image', text: 'x' }] },
  ]) assert.equal(CreatePageInputSchema.safeParse(value).success, false)

  const timestamp = '2026-10-06T12:00:00.000Z'
  for (const value of [
    { pageId: 'p', expectedUpdatedAt: timestamp, idempotencyKey: 'k' },
    { pageId: 'p', expectedUpdatedAt: 'yesterday', idempotencyKey: 'k', title: 'x' },
    { pageId: 'p', expectedUpdatedAt: timestamp, idempotencyKey: 'k', title: 'x', extra: true },
    { pageId: 'p', expectedUpdatedAt: timestamp, idempotencyKey: 'k', blocks: [{ type: 'image', id: 'b', text: '' }] },
  ]) assert.equal(UpdatePageInputSchema.safeParse(value).success, false)
})

test('writable block schemas enforce content limits and block-specific attributes', () => {
  const create = (block: unknown) => CreatePageInputSchema.safeParse({ workspaceId: 'w', title: 'p', idempotencyKey: 'k', blocks: [block] }).success
  assert.equal(create({ type: 'heading', level: 6, text: 'title' }), true)
  assert.equal(create({ type: 'heading', level: 7, text: 'title' }), false)
  assert.equal(create({ type: 'todo', checked: false, text: '' }), true)
  assert.equal(create({ type: 'code', text: 'x', language: 'a'.repeat(128) }), true)
  assert.equal(create({ type: 'code', text: 'x', language: 'a'.repeat(129) }), false)
  assert.equal(create({ type: 'numbered-list', start: Number.MAX_SAFE_INTEGER, items: ['one'] }), true)
  assert.equal(create({ type: 'numbered-list', start: Number.MAX_SAFE_INTEGER + 1, items: ['one'] }), false)
  assert.equal(create({ type: 'numbered-list', start: 0, items: ['one'] }), false)
  assert.equal(create({ type: 'bulleted-list', items: ['x'], text: '• display only' }), true)
  assert.equal(create({ type: 'bulleted-list', items: [] }), false)
  assert.equal(create({ type: 'quote', paragraphs: ['one', 'two'] }), true)
  assert.equal(create({ type: 'quote', text: 'one\ntwo' }), true)
  assert.equal(create({ type: 'quote', paragraphs: ['x'], extra: true }), false)
  assert.equal(create({ type: 'paragraph', text: 'x'.repeat(100_001) }), false)
  assert.equal(create({ type: 'paragraph', text: 'x', extra: true }), false)
})

test('callout write accepts only stable icon, tone and plain text', () => {
  const base = { workspaceId: 'w', title: 'p', idempotencyKey: 'k' }
  const parseCreate = (value: unknown) => CreatePageInputSchema.safeParse({ ...base, blocks: [value] })
  const parsed = parseCreate({ type: 'callout', text: 'line one\nline two' })
  assert.equal(parsed.success, true)
  if (parsed.success) assert.deepEqual(parsed.data.blocks[0], { type: 'callout', text: 'line one\nline two', icon: '💡', tone: 'neutral' })
  assert.equal(parseCreate({ type: 'callout', text: 'x', icon: '⚠️', tone: 'warning' }).success, true)
  const update = (value: unknown) => UpdatePageInputSchema.safeParse({ pageId: 'p', expectedUpdatedAt: '2026-10-06T12:00:00.000Z', idempotencyKey: 'k', blocks: [value] }).success
  assert.equal(update({ type: 'callout', id: 'b', text: '', icon: 'i', tone: 'info' }), true)
  for (const value of [
    { type: 'callout', text: 'x', icon: '' },
    { type: 'callout', text: 'x', icon: 'x'.repeat(33) },
    { type: 'callout', text: 'x', icon: 'x\n' },
    { type: 'callout', text: 'x', tone: 'danger' },
    { type: 'callout', text: 'x', attrs: { icon: 'x', tone: 'info' } },
    { type: 'callout', text: 'x', content: [{ type: 'text', text: 'x' }] },
    { type: 'callout', text: 'x', parentBlockId: 'parent' },
  ]) {
    assert.equal(parseCreate(value).success, false)
    assert.equal(update(value), false)
  }
})

test('callout write converts to the editor node and reads back through the stable DTO', () => {
  const parsed = CreatePageInputSchema.parse({
    workspaceId: 'w', title: 'p', idempotencyKey: 'k',
    blocks: [{ type: 'callout', icon: '⚠️', tone: 'warning', text: 'first\nsecond' }],
  })
  const [mapped] = toDocumentBlocks(parsed.blocks)
  assert.deepEqual(mapped, {
    type: 'callout', props: { node: {
      type: 'eotionCallout', attrs: { icon: '⚠️', tone: 'warning' },
      content: [{ type: 'text', text: 'first' }, { type: 'hardBreak' }, { type: 'text', text: 'second' }],
    } },
  })
  const record: ServerBlockRecord = {
    id: 'b', workspaceId: 'w', pageId: 'p', parentBlockId: null, type: 'callout',
    orderKey: 'a', createdAt: 'now', updatedAt: 'now', props: mapped!.props,
  }
  assert.deepEqual(toMcpBlock(record), {
    id: 'b', type: 'callout', text: 'first\nsecond', icon: '⚠️', tone: 'warning', parentBlockId: null, depth: 0,
  })
})

test('write mapper makes TipTap JSON at the boundary and preserves structural list and quote data', () => {
  const createInput = CreatePageInputSchema.parse({
    workspaceId: 'workspace-1', title: 'Page', idempotencyKey: 'key',
    blocks: [
      { type: 'paragraph', text: 'Hello' },
      { type: 'paragraph', text: 'line one\nline two' },
      { type: 'code', text: 'line one\nline two' },
      { type: 'numbered-list', start: 3, items: ['literal 1. alpha', 'beta'] },
      { type: 'quote', paragraphs: ['first', 'second'] },
    ],
  })
  const mapped = toDocumentBlocks(createInput.blocks)
  assert.deepEqual(mapped, [
    { type: 'paragraph', props: { node: { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] } } },
    { type: 'paragraph', props: { node: { type: 'paragraph', content: [{ type: 'text', text: 'line one' }, { type: 'hardBreak' }, { type: 'text', text: 'line two' }] } } },
    { type: 'code', props: { node: { type: 'codeBlock', content: [{ type: 'text', text: 'line one\nline two' }] } } },
    { type: 'numbered-list', props: { node: { type: 'orderedList', attrs: { start: 3 }, content: [
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'literal 1. alpha' }] }] },
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'beta' }] }] },
    ] } } },
    { type: 'quote', props: { node: { type: 'blockquote', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'first' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'second' }] },
    ] } } },
  ])
  const literal = CreatePageInputSchema.parse({ workspaceId: 'w', title: 'p', idempotencyKey: 'k', blocks: [{ type: 'bulleted-list', items: ['• literal item'], text: '• display text' }] })
  assert.deepEqual(toDocumentBlocks(literal.blocks)[0]!.props.node, {
    type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '• literal item' }] }] }],
  })
  const updateInput = UpdatePageInputSchema.parse({
    pageId: 'page-1', expectedUpdatedAt: '2026-10-06T12:00:00.000Z', idempotencyKey: 'update-key',
    blocks: [{ type: 'paragraph', id: 'stable-block', text: 'updated' }],
  })
  assert.deepEqual(toDocumentBlocks(updateInput.blocks!), [{
    id: 'stable-block', type: 'paragraph', props: { node: { type: 'paragraph', content: [{ type: 'text', text: 'updated' }] } },
  }])
  assert.equal(JSON.stringify(mapped).includes('orderKey'), false)
})

test('read DTO round-trips flat lists and quote paragraphs while legacy nested text stays readable', () => {
  const record = (type: string, node: Record<string, unknown>): ServerBlockRecord => ({
    id: `block-${type}`, workspaceId: 'workspace-1', pageId: 'page-1', parentBlockId: null,
    type: type as ServerBlockRecord['type'], orderKey: 'key', createdAt: 'now', updatedAt: 'now', props: { node },
  })
  const list = toMcpBlock(record('bulleted-list', {
    type: 'bulletList', content: [
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'alpha' }] }] },
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'beta' }] }] },
    ],
  }))
  assert.deepEqual(list.items, ['alpha', 'beta'])
  const quote = toMcpBlock(record('quote', {
    type: 'blockquote', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'one' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'two' }] },
    ],
  }))
  assert.deepEqual(quote.paragraphs, ['one', 'two'])
  const legacyNested = toMcpBlock(record('bulleted-list', {
    type: 'bulletList', content: [{ type: 'listItem', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'outer' }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'inner' }] }] }] },
    ] }],
  }))
  assert.equal(legacyNested.items, undefined)
  assert.match(legacyNested.text, /outer[\s\S]*inner/)
})

test('read DTO omits write-only structure for unsupported or over-limit list and quote shapes', () => {
  const record = (type: string, node: Record<string, unknown>): ServerBlockRecord => ({
    id: `block-${type}`, workspaceId: 'workspace-1', pageId: 'page-1', parentBlockId: null,
    type: type as ServerBlockRecord['type'], orderKey: 'key', createdAt: 'now', updatedAt: 'now', props: { node },
  })
  const pageResult = (block: ServerBlockRecord) => GetPageOutputSchema.parse({
    id: 'page-1', workspaceId: 'workspace-1', title: 'Page', parentPageId: null, updatedAt: 'now',
    blocks: [toMcpBlock(block)],
  })

  const multipleParagraphs = pageResult(record('bulleted-list', {
    type: 'bulletList', content: [{ type: 'listItem', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'first' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'second' }] },
    ] }],
  })).blocks[0]!
  assert.equal(multipleParagraphs.items, undefined)
  assert.equal(multipleParagraphs.text, '• first\nsecond')

  const manyItems = Array.from({ length: 1001 }, (_, index) => ({
    type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: `item-${index}` }] }],
  }))
  const manyListBlock = pageResult(record('numbered-list', { type: 'orderedList', content: manyItems })).blocks[0]!
  assert.equal(manyListBlock.items, undefined)
  assert.match(manyListBlock.text, /^1\. item-0[\s\S]*1001\. item-1000$/)

  const manyParagraphs = Array.from({ length: 1001 }, (_, index) => ({
    type: 'paragraph', content: [{ type: 'text', text: `quote-${index}` }],
  }))
  const manyQuoteBlock = pageResult(record('quote', { type: 'blockquote', content: manyParagraphs })).blocks[0]!
  assert.equal(manyQuoteBlock.paragraphs, undefined)
  assert.match(manyQuoteBlock.text, /^> quote-0[\s\S]*> quote-1000$/)

  const emptyListBlock = pageResult(record('bulleted-list', { type: 'bulletList', content: [] })).blocks[0]!
  assert.equal(emptyListBlock.items, undefined)
  assert.equal(emptyListBlock.text, '')
  const emptyQuoteBlock = pageResult(record('quote', { type: 'blockquote', content: [] })).blocks[0]!
  assert.equal(emptyQuoteBlock.paragraphs, undefined)
  assert.equal(emptyQuoteBlock.text, '')
})

test('write payload byte guard rejects serialized UTF-8 JSON over one MiB', () => {
  const fitting = { text: 'é'.repeat(512 * 1024 - 8) }
  assert.equal(assertMcpWritePayloadSize(fitting), fitting)
  assert.throws(() => assertMcpWritePayloadSize({ text: 'é'.repeat(512 * 1024) }), /too large/)
})

test('write codec rejects expanded node and cumulative block text limits before mutation', () => {
  assert.throws(() => toDocumentBlocks([{ type: 'paragraph', text: '\n'.repeat(10_000) }]), /too many content nodes/)
  assert.throws(() => toDocumentBlocks([{ type: 'bulleted-list', items: ['a'.repeat(60_000), 'b'.repeat(60_000)] }]), /text too large/)
  assert.equal(toDocumentBlocks([{ type: 'paragraph', text: '\n'.repeat(9999) }]).length, 1)
})
