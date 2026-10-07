import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PageRecord, ServerBlockRecord } from '../server-domain/types'
import { GetPageOutputSchema, assertMcpResultSize, toMcpBlock, toMcpBlocks, toMcpPageSummary } from './mcp-read.contract'

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
  ].map((entry, index) => ({ ...entry, orderKey: String(index).padStart(2, '0') }))
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
  assert.ok(mapped.every((entry) => entry.parentBlockId === null && entry.depth === 0))
  assert.doesNotMatch(JSON.stringify(mapped), /workspaceId|pageId|orderKey|createdAt|updatedAt|signed|props|url|node|blockId/)
})

test('MCP database read exposes only stable references and rejects malformed data', () => {
  const record = block('database', { type: 'eotionDatabase', attrs: { databaseId: 'database-1', viewId: 'view-1' } }, 'database-block')
  const dto = toMcpBlock(record)
  assert.deepEqual(dto, {
    id: 'database-block', type: 'database', text: '', databaseId: 'database-1', viewId: 'view-1', parentBlockId: null, depth: 0,
  })
  assert.equal(GetPageOutputSchema.safeParse({ ...toMcpPageSummary(page), blocks: [dto] }).success, true)
  assert.doesNotMatch(JSON.stringify(dto), /"data"\s*:|props|node|record|property|url|blockId/)

  for (const attrs of [
    { databaseId: 'database-1' },
    { databaseId: 'database-1', viewId: ' ' },
    { databaseId: 'database-1', viewId: 'view-1', data: [] },
  ]) assert.throws(() => toMcpBlock(block('database', { type: 'eotionDatabase', attrs })))

  const extraField = { ...dto, data: [] }
  const extraContent = { ...dto, text: 'rows' }
  const invalidSummary = { type: 'database', text: '', databaseId: 'database-1', viewId: ' view-1' }
  assert.equal(GetPageOutputSchema.safeParse({ ...toMcpPageSummary(page), blocks: [extraField] }).success, false)
  assert.equal(GetPageOutputSchema.safeParse({ ...toMcpPageSummary(page), blocks: [extraContent] }).success, false)
  const toggle = toMcpBlock(block('toggle', { type: 'eotionToggle', content: [{ type: 'eotionDatabase', attrs: { databaseId: 'database-1', viewId: 'view-1' } }] }))
  assert.deepEqual(toggle.summary, [{ type: 'database', text: '', databaseId: 'database-1', viewId: 'view-1' }])
  assert.equal(GetPageOutputSchema.safeParse({ ...toMcpPageSummary(page), blocks: [{ ...toggle, summary: [invalidSummary] }] }).success, false)
})

test('MCP mapper rejects unsupported, malformed, and oversized data without passthrough', () => {
  assert.throws(() => toMcpBlock(block('paragraph', { type: 'paragraph', attrs: { blockId: 'internal' } })))
  assert.throws(() => toMcpBlock(block('paragraph', { type: 'unknown', content: [] })))
  const nested = toMcpBlock({ ...block('paragraph', { type: 'paragraph' }), parentBlockId: 'parent' })
  assert.equal(nested.parentBlockId, 'parent')
  assert.equal(nested.depth, 0)
  assert.throws(() => toMcpBlocks([block('paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(100_001) }] })]))
  assert.throws(() => toMcpBlocks(Array.from({ length: 1001 }, (_, index) => block('divider', { type: 'horizontalRule' }, `block-${index}`))))
  assert.throws(() => assertMcpResultSize({ text: 'x'.repeat(1024 * 1024) }))
})

test('MCP mapper reads nested toggle blocks depth first and exposes parent ids', () => {
  const summary = { type: 'eotionToggle', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Summary' }] }] }
  const toggle = { ...block('toggle', summary, 'block-toggle'), orderKey: 'a' }
  const root = { ...block('paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'Root' }] }, 'block-root'), orderKey: 'a' }
  const child = { ...block('toggle', { type: 'eotionToggle', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Child' }] }] }, 'block-child'), parentBlockId: 'block-toggle', orderKey: 'b' }
  const grandchild = { ...block('paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'Grandchild' }] }, 'block-grandchild'), parentBlockId: 'block-child', orderKey: 'a' }

  // Deliberately shuffled: descendants arrive before their parents.
  const mapped = toMcpBlocks([grandchild, child, toggle, root])
  assert.deepEqual(mapped.map(({ id }) => id), ['block-root', 'block-toggle', 'block-child', 'block-grandchild'])
  assert.deepEqual(mapped.map(({ parentBlockId }) => parentBlockId), [null, null, 'block-toggle', 'block-child'])
  assert.deepEqual(mapped.map(({ depth }) => depth), [0, 0, 1, 2])
  assert.equal(mapped[1]!.type, 'toggle')
  assert.equal(mapped[1]!.text, 'Summary')
  assert.deepEqual(mapped[1]!.summary, [{ type: 'paragraph', text: 'Summary' }])
  assert.equal(mapped[2]!.text, 'Child')
  assert.equal(GetPageOutputSchema.parse({ ...toMcpPageSummary(page), blocks: mapped }).blocks.length, 4)
})

test('MCP toggle summary preserves public content for plain, nested list, quote, table and callout', () => {
  const paragraph = { type: 'paragraph', content: [{ type: 'text', text: 'Plain' }] }
  const list = { type: 'bulletList', content: [{ type: 'listItem', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
    { type: 'orderedList', attrs: { start: 3, type: null }, content: [{ type: 'listItem', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Nested' }] },
    ] }] },
  ] }] }
  const quote = { type: 'blockquote', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Quoted' }] },
    { type: 'blockquote', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Inner' }] }] },
  ] }
  const table = tableNode([['A', 'B'], ['1', '2']])
  const callout = { type: 'eotionCallout', attrs: { icon: '💡', tone: 'info' }, content: [{ type: 'text', text: 'Note' }] }
  const cases = [paragraph, list, quote, table, callout]
  const results = cases.map((summary, index) => toMcpBlock(block('toggle', { type: 'eotionToggle', content: [summary] }, `summary-${index}`)))

  assert.equal(results[0]!.text, 'Plain')
  assert.deepEqual(results[0]!.summary, [{ type: 'paragraph', text: 'Plain' }])
  assert.equal(results[1]!.text, '') // Legacy text stays inline-only for a non-inline summary.
  assert.deepEqual(results[1]!.summary?.[0]?.entries, [{ parts: [
    { type: 'paragraph', text: 'First' },
    { type: 'numbered-list', text: '3. Nested', items: ['Nested'], start: 3, entries: [{ parts: [{ type: 'paragraph', text: 'Nested' }] }] },
  ] }])
  assert.deepEqual(results[2]!.summary?.[0]?.children, [
    { type: 'paragraph', text: 'Quoted' },
    { type: 'quote', text: '> Inner', children: [{ type: 'heading', text: 'Inner', level: 2 }] },
  ])
  assert.deepEqual(results[3]!.summary, [{ type: 'table', text: 'A\tB\n1\t2', rows: [['A', 'B'], ['1', '2']] }])
  assert.deepEqual(results[4]!.summary, [{ type: 'callout', text: 'Note', icon: '💡', tone: 'info' }])
  assert.equal(GetPageOutputSchema.safeParse({ ...toMcpPageSummary(page), blocks: results }).success, true)
  assert.doesNotMatch(JSON.stringify(results), /props|node|blockId|orderKey|eotionToggle|eotionCallout|tableRow|tableCell|attrs|marks/)
})

test('MCP toggle summary restores legacy empty summaries and rejects malformed content', () => {
  const valid = { type: 'paragraph', content: [{ type: 'text', text: 'ok' }] }
  for (const content of [undefined, []]) {
    const dto = toMcpBlock(block('toggle', { type: 'eotionToggle', ...(content === undefined ? {} : { content }) }))
    assert.equal(dto.text, '')
    assert.deepEqual(dto.summary, [{ type: 'paragraph', text: '' }])
  }
  for (const content of [[valid, valid], [{ type: 'eotionToggle', content: [valid] }],
    [{ type: 'table', content: [{ type: 'tableRow', content: [] }] }],
    [{ type: 'eotionCallout', attrs: { icon: '!', tone: 'unknown' } }]]) {
    assert.throws(() => toMcpBlock(block('toggle', { type: 'eotionToggle', ...(content === undefined ? {} : { content }) })), /Unsupported block/)
  }
})

test('MCP output schema rejects unsupported or incomplete toggle summary DTOs', () => {
  const dto = toMcpBlock(block('toggle', { type: 'eotionToggle', content: [{ type: 'paragraph' }] }))
  const parses = (summary: unknown) => GetPageOutputSchema.safeParse({ ...toMcpPageSummary(page), blocks: [{ ...dto, summary }] }).success
  for (const summary of [
    [{ type: 'toggle', text: 'nested' }],
    [{ type: 'table', text: 'A' }],
    [{ type: 'callout', text: 'A', icon: '!', tone: 'info', rows: [['A']] }],
    [{ type: 'bulleted-list', text: '• A' }],
    [{ type: 'quote', text: '> A' }],
    [{ type: 'paragraph', text: 'A', children: [] }],
    [{ type: 'paragraph', text: 'A', props: { node: {} } }],
  ]) assert.equal(parses(summary), false)
  assert.equal(parses([{ type: 'paragraph', text: '' }]), true)
})

test('MCP mapper fails closed on a rootless parent cycle instead of returning a partial page', () => {
  const first = { ...block('paragraph', { type: 'paragraph' }, 'cycle-a'), parentBlockId: 'cycle-b' }
  const second = { ...block('paragraph', { type: 'paragraph' }, 'cycle-b'), parentBlockId: 'cycle-a' }
  assert.throws(() => toMcpBlocks([first, second]), /Unsupported block/)
})

test('MCP mapper fails closed when a block refers to a missing parent', () => {
  const orphan = { ...block('paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'orphan' }] }, 'orphan'), parentBlockId: 'missing-parent' }
  assert.throws(() => toMcpBlocks([orphan]), /Unsupported block/)
})

test('MCP nested read preserves moved order and marked hardBreak plain text', () => {
  const parent = block('toggle', { type: 'eotionToggle', content: [{ type: 'paragraph' }] }, 'parent')
  const child = { ...block('callout', { type: 'eotionCallout', attrs: { icon: '💡', tone: 'info' }, content: [
    { type: 'text', text: 'first', marks: [{ type: 'bold' }] },
    { type: 'hardBreak', marks: [{ type: 'bold' }] }, { type: 'text', text: 'second' },
  ] }, 'child'), parentBlockId: parent.id, orderKey: 'b' }
  const peer = { ...block('paragraph', { type: 'paragraph' }, 'peer'), parentBlockId: parent.id, orderKey: 'a' }
  const mapped = toMcpBlocks([child, parent, peer])
  assert.deepEqual(mapped.map(({ id, depth, parentBlockId }) => ({ id, depth, parentBlockId })), [
    { id: 'parent', depth: 0, parentBlockId: null }, { id: 'peer', depth: 1, parentBlockId: 'parent' },
    { id: 'child', depth: 1, parentBlockId: 'parent' },
  ])
  assert.equal(mapped[2]!.text, 'first\nsecond')
})

test('MCP mapper rejects a child attached to a leaf callout', () => {
  const parent = block('callout', { type: 'eotionCallout', attrs: { icon: '💡', tone: 'neutral' }, content: [{ type: 'text', text: 'parent' }] }, 'callout-parent')
  const child = { ...block('paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'child' }] }, 'paragraph-child'), parentBlockId: parent.id }
  assert.throws(() => toMcpBlocks([parent, child]), /Unsupported block/)
})

test('MCP callout read exposes only stable icon, tone and plain text', () => {
  const callout = block('callout', {
    type: 'eotionCallout', attrs: { icon: '💡', tone: 'info' },
    content: [{ type: 'text', text: 'first' }, { type: 'hardBreak' }, { type: 'text', text: 'second' }],
  })
  const dto = toMcpBlock(callout)
  assert.deepEqual(dto, { id: callout.id, type: 'callout', text: 'first\nsecond', icon: '💡', tone: 'info', parentBlockId: null, depth: 0 })
  assert.equal(GetPageOutputSchema.safeParse({ ...toMcpPageSummary(page), blocks: [dto] }).success, true)
  assert.doesNotMatch(JSON.stringify(dto), /attrs|content|node|props|marks/)
  for (const attrs of [
    undefined, {}, { icon: '', tone: 'info' }, { icon: 'x'.repeat(33), tone: 'info' },
    { icon: 'x\n', tone: 'info' }, { icon: 'x', tone: 'danger' }, { icon: 'x', tone: 'info', private: true },
  ]) assert.throws(() => toMcpBlock(block('callout', { type: 'eotionCallout', ...(attrs === undefined ? {} : { attrs }) })), /Unsupported block/)
  assert.throws(() => toMcpBlock(block('callout', { type: 'eotionCallout', attrs: { icon: 'x', tone: 'neutral' }, content: [{ type: 'paragraph' }] })), /Unsupported block/)
})

test('MCP mapper accepts the depth and cumulative node limits, then rejects the next level or node', () => {
  const nestedQuote = (depth: number): unknown => depth === 1
    ? { type: 'blockquote', content: [{ type: 'paragraph' }] }
    : { type: 'blockquote', content: [nestedQuote(depth - 1)] }
  assert.equal(toMcpBlock(block('quote', nestedQuote(31))).type, 'quote')
  assert.throws(() => toMcpBlock(block('quote', nestedQuote(32))))

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
function tableNode(rows: string[][]) {
  return {
    type: 'table',
    content: rows.map((cells, rowIndex) => ({
      type: 'tableRow',
      content: cells.map((text) => ({
        type: rowIndex === 0 ? 'tableHeader' : 'tableCell',
        attrs: { colspan: 1, rowspan: 1, colwidth: null },
        content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
      })),
    })),
  }
}

test('MCP table read exposes a stable rows grid and never the editor AST', () => {
  const table = block('table', tableNode([['A', 'B'], ['C', 'D']]))
  const dto = toMcpBlock(table)
  assert.deepEqual(dto, {
    id: table.id, type: 'table', text: 'A\tB\nC\tD', rows: [['A', 'B'], ['C', 'D']], parentBlockId: null, depth: 0,
  })
  assert.equal(GetPageOutputSchema.safeParse({ ...toMcpPageSummary(page), blocks: [dto] }).success, true)
  assert.doesNotMatch(JSON.stringify(dto), /attrs|content|node|props|marks|tableRow|tableCell|colspan/)

  // Multi-paragraph cells join with a newline; empty cells stay empty strings.
  const multiline = toMcpBlock(block('table', {
    type: 'table',
    content: [{ type: 'tableRow', content: [
      { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'one' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'two' }] },
      ] },
      { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph' }] },
    ] }],
  }))
  assert.deepEqual(multiline.rows, [['one\ntwo', '']])
})

test('MCP reads a full P7 mixed page depth first with stable parent ids and no internal leaks', () => {
  const order = (value: string) => value.padStart(4, '0')
  const entry = (id: string, type: string, node: unknown, key: string, parentBlockId: string | null = null) => ({
    ...block(type, node, id), parentBlockId, orderKey: order(key),
  })
  const mixed: ServerBlockRecord[] = [
    entry('mix-heading', 'heading', { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Mixed' }] }, '10'),
    entry('mix-intro', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'Intro' }] }, '20'),
    entry('mix-list', 'bulleted-list', { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bullet' }] }] }] }, '30'),
    entry('mix-todo', 'todo', { type: 'eotionTodo', attrs: { checked: true }, content: [{ type: 'text', text: 'Task' }] }, '40'),
    entry('mix-quote', 'quote', { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quoted' }] }] }, '50'),
    entry('mix-code', 'code', { type: 'codeBlock', attrs: { language: 'typescript' }, content: [{ type: 'text', text: 'const x = 1' }] }, '60'),
    entry('mix-callout', 'callout', { type: 'eotionCallout', attrs: { icon: '🚀', tone: 'warning' }, content: [{ type: 'text', text: 'Note' }] }, '70'),
    entry('mix-toggle', 'toggle', { type: 'eotionToggle', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Summary' }] }] }, '80'),
    entry('mix-child', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'Child' }] }, '10', 'mix-toggle'),
    entry('mix-inner', 'toggle', { type: 'eotionToggle', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Inner' }] }] }, '20', 'mix-toggle'),
    entry('mix-grandchild', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'Grandchild' }] }, '10', 'mix-inner'),
    entry('mix-nested-table', 'table', tableNode([['N1', 'N2']]), '30', 'mix-toggle'),
    entry('mix-table', 'table', tableNode([['H1', 'H2'], ['A1', 'A2']]), '90'),
    entry('mix-divider', 'divider', { type: 'horizontalRule' }, '100'),
    entry('mix-tail', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'Tail' }] }, '110'),
  ]
  // Descendants deliberately arrive before their parents, exactly like a shuffled server read.
  const shuffled = [...mixed].reverse()
  const mapped = toMcpBlocks(shuffled)
  assert.deepEqual(mapped.map(({ id }) => id), [
    'mix-heading', 'mix-intro', 'mix-list', 'mix-todo', 'mix-quote', 'mix-code', 'mix-callout', 'mix-toggle',
    'mix-child', 'mix-inner', 'mix-grandchild', 'mix-nested-table', 'mix-table', 'mix-divider', 'mix-tail',
  ])
  assert.deepEqual(mapped.map(({ depth }) => depth), [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 1, 0, 0, 0])
  assert.deepEqual(mapped.map(({ parentBlockId }) => parentBlockId), [
    null, null, null, null, null, null, null, null, 'mix-toggle', 'mix-toggle', 'mix-inner', 'mix-toggle', null, null, null,
  ])
  const byId = new Map(mapped.map((dto) => [dto.id, dto]))
  assert.equal(byId.get('mix-heading')?.level, 1)
  assert.equal(byId.get('mix-list')?.text, '• Bullet')
  assert.equal(byId.get('mix-todo')?.checked, true)
  assert.equal(byId.get('mix-quote')?.text, '> Quoted')
  assert.equal(byId.get('mix-code')?.language, 'typescript')
  assert.deepEqual({ icon: byId.get('mix-callout')?.icon, tone: byId.get('mix-callout')?.tone }, { icon: '🚀', tone: 'warning' })
  assert.equal(byId.get('mix-toggle')?.text, 'Summary')
  assert.deepEqual(byId.get('mix-table')?.rows, [['H1', 'H2'], ['A1', 'A2']])
  assert.deepEqual(byId.get('mix-nested-table')?.rows, [['N1', 'N2']])
  assert.equal(byId.get('mix-divider')?.text, '')
  assert.equal(GetPageOutputSchema.parse({ ...toMcpPageSummary(page), blocks: mapped }).blocks.length, 15)
  // The read DTO never leaks the editor AST, props, order keys or internal cell structure.
  assert.doesNotMatch(JSON.stringify(mapped), /props|node|blockId|orderKey|eotionToggle|eotionCallout|tableRow|tableCell|attrs/)
})

test('Toggle summary preserves legacy empty and large list/quote structures within read budgets', () => {
  const paragraph = { type: 'paragraph', content: [{ type: 'text', text: 'x' }] }
  for (const count of [0, 1001]) {
    for (const summary of [
      { type: 'bulletList', content: Array.from({ length: count }, () => ({ type: 'listItem', content: [paragraph] })) },
      { type: 'blockquote', content: Array.from({ length: count }, () => paragraph) },
    ]) {
      const dto = toMcpBlock(block('toggle', { type: 'eotionToggle', content: [summary] }))
      const parsed = GetPageOutputSchema.parse({ ...toMcpPageSummary(page), blocks: [dto] }).blocks[0]!
      assert.equal((parsed.summary![0]!.entries ?? parsed.summary![0]!.children)!.length, count)
    }
  }
})

test('MCP table read stays nested under a toggle and rejects non-grid content', () => {
  const parent = block('toggle', { type: 'eotionToggle', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Parent' }] }] }, 'table-parent')
  const child = { ...block('table', tableNode([['A']]), 'table-child'), parentBlockId: parent.id, orderKey: 'a' }
  const mapped = toMcpBlocks([child, parent])
  assert.deepEqual(mapped.map(({ id, type, depth, parentBlockId }) => ({ id, type, depth, parentBlockId })), [
    { id: 'table-parent', type: 'toggle', depth: 0, parentBlockId: null },
    { id: 'table-child', type: 'table', depth: 1, parentBlockId: 'table-parent' },
  ])

  // A cell may only hold plain paragraphs.
  assert.throws(() => toMcpBlock(block('table', {
    type: 'table',
    content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'heading', attrs: { level: 2 } }] }] }],
  })), /Unsupported block/)
  assert.throws(() => toMcpBlock(block('table', { type: 'table', content: [{ type: 'tableRow', content: [] }] })), /Unsupported block/)
  // Span attributes are validated, not passed through.
  assert.throws(() => toMcpBlock(block('table', {
    type: 'table',
    content: [{ type: 'tableRow', content: [{ type: 'tableCell', attrs: { colspan: 0 }, content: [{ type: 'paragraph' }] }] }],
  })), /Unsupported block/)
  assert.throws(() => toMcpBlock(block('table', {
    type: 'table',
    content: [{ type: 'tableRow', content: [{ type: 'tableCell', attrs: { align: 'left' }, content: [{ type: 'paragraph' }] }] }],
  })), /Unsupported block/)
  // A table can never be a child of a leaf block.
  const callout = block('callout', { type: 'eotionCallout', attrs: { icon: '💡', tone: 'neutral' }, content: [{ type: 'text', text: 'x' }] }, 'leaf-callout')
  assert.throws(() => toMcpBlocks([callout, { ...block('table', tableNode([['A']]), 'nested-table'), parentBlockId: callout.id }]), /Unsupported block/)
})
