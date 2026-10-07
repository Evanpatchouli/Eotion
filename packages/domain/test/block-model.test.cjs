'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  BLOCK_COMMANDS,
  BLOCK_CAPABILITIES,
  BLOCK_NODE_NAMES,
  BLOCK_NODE_TYPES,
  BLOCK_TYPES,
  EDITOR_NODE_NAMES,
  EDITOR_NODE_RULES,
  TABLE_LIMITS,
  blockAllowsChildren,
  blockTypeForNode,
  isAllowedChildBlockType,
  nodeTypeForBlock,
  blockHasInternalContent,
  validateCalloutAttrs,
  validateCalloutBlockProps,
  validateTableCellAttrs,
  validateTableBlockProps,
  validateBlockProps,
} = require('../dist/block-types.js')
const {
  blockDepthMap,
  buildBlockTree,
  descendantIds,
  flattenBlockTree,
  orderForDeletion,
  parentRejection,
  parentRejectionMessage,
  validateBlockTree,
} = require('../dist/block-tree.js')
const { assignBlockTreeOrder } = require('../dist/order.js')

test('every block type has one capability and one editor node mapping', () => {
  for (const type of BLOCK_TYPES) {
    const capability = BLOCK_CAPABILITIES[type]
    assert.ok(capability, type)
    assert.equal(capability.type, type)
    assert.equal(capability.nodeType, BLOCK_NODE_TYPES[type])
    assert.equal(nodeTypeForBlock(type), capability.nodeType)
    assert.equal(blockTypeForNode(capability.nodeType), type)
  }
  assert.equal(new Set(BLOCK_NODE_NAMES).size, BLOCK_TYPES.length)
  for (const node of BLOCK_NODE_NAMES) assert.ok(EDITOR_NODE_NAMES.includes(node), node)
})

test('the editor node model covers inline nodes and the full block set', () => {
  for (const inline of ['text', 'hardBreak', 'listItem']) assert.ok(EDITOR_NODE_RULES[inline], inline)
  assert.deepEqual([...EDITOR_NODE_RULES.eotionToggle.children], [...BLOCK_NODE_NAMES])
  assert.equal(EDITOR_NODE_RULES.eotionImage.children, null)
  assert.deepEqual([...EDITOR_NODE_RULES.paragraph.children], ['text', 'hardBreak'])
})

test('only toggle owns child blocks today and every block type stays slash addressable', () => {
  const childOwners = BLOCK_TYPES.filter((type) => blockAllowsChildren(type))
  assert.deepEqual(childOwners, ['toggle'])
  assert.deepEqual([...BLOCK_CAPABILITIES.toggle.allowedChildTypes], [...BLOCK_TYPES])
  assert.deepEqual(BLOCK_CAPABILITIES.paragraph.allowedChildTypes, [])
  assert.deepEqual(BLOCK_TYPES.filter((type) => BLOCK_CAPABILITIES[type].attachment), ['image', 'file'])
  assert.equal(BLOCK_CAPABILITIES.toggle.mcp.readable, true)
  assert.equal(BLOCK_CAPABILITIES.toggle.mcp.writable, false)
  // The MCP write contract today only accepts these types.
  assert.deepEqual(
    BLOCK_TYPES.filter((type) => BLOCK_CAPABILITIES[type].mcp.writable),
    ['paragraph', 'heading', 'bulleted-list', 'numbered-list', 'todo', 'quote', 'code', 'divider', 'callout'],
  )
  assert.ok(BLOCK_COMMANDS.length > 0)
  assert.equal(new Set(BLOCK_COMMANDS.map((command) => command.id)).size, BLOCK_COMMANDS.length)
  for (const command of BLOCK_COMMANDS) assert.ok(BLOCK_TYPES.includes(command.type), command.type)
  assert.ok(BLOCK_COMMANDS.some((command) => command.id === 'toggle' && command.type === 'toggle'))
})

test('callout is a writable inline leaf with strict icon and tone attributes', () => {
  assert.equal(BLOCK_NODE_TYPES.callout, 'eotionCallout')
  assert.deepEqual(EDITOR_NODE_RULES.eotionCallout.children, ['text', 'hardBreak'])
  assert.equal(BLOCK_CAPABILITIES.callout.hasText, true)
  assert.equal(BLOCK_CAPABILITIES.callout.allowsChildren, false)
  assert.equal(BLOCK_CAPABILITIES.callout.mcp.readable, true)
  assert.equal(BLOCK_CAPABILITIES.callout.mcp.writable, true)
  assert.deepEqual(BLOCK_COMMANDS.find(({ id }) => id === 'callout'), {
    id: 'callout', type: 'callout', label: '提示块', group: '块', icon: 'info', search: 'callout tip info',
  })
  for (const tone of ['neutral', 'info', 'warning']) assert.equal(validateCalloutAttrs({ icon: '💡', tone }), true)
  for (const attrs of [null, {}, { icon: '', tone: 'info' }, { icon: 'x'.repeat(33), tone: 'info' },
    { icon: 'bad\nicon', tone: 'info' }, { icon: '💡', tone: 'danger' }, { icon: '💡', tone: 'info', extra: true }]) {
    assert.equal(validateCalloutAttrs(attrs), false)
  }
  assert.equal(validateCalloutBlockProps({ node: { type: 'eotionCallout', attrs: { icon: '💡', tone: 'neutral' }, content: [{ type: 'text', text: 'note', marks: [{ type: 'bold' }] }, { type: 'hardBreak' }] } }), true)
  assert.equal(validateCalloutBlockProps({ node: { type: 'eotionCallout', attrs: { blockId: 'b1', icon: '💡', tone: 'neutral' } } }), false)
  assert.equal(validateCalloutBlockProps({ node: { type: 'eotionCallout', attrs: { icon: '💡', tone: 'danger' } } }), false)
  assert.equal(validateCalloutBlockProps({ node: { type: 'eotionCallout', attrs: { icon: '💡', tone: 'neutral' }, content: [{ type: 'paragraph' }] } }), false)
})

test('table is one self-contained block whose rows and cells are editor-internal', () => {
  assert.equal(BLOCK_NODE_TYPES.table, 'table')
  assert.equal(BLOCK_CAPABILITIES.table.internalContent, true)
  assert.equal(BLOCK_CAPABILITIES.table.allowsChildren, false)
  assert.equal(BLOCK_CAPABILITIES.table.mcp.readable, true)
  assert.equal(BLOCK_CAPABILITIES.table.mcp.writable, false)
  assert.deepEqual([...EDITOR_NODE_RULES.table.children], ['tableRow'])
  assert.deepEqual([...EDITOR_NODE_RULES.tableRow.children], ['tableCell', 'tableHeader'])
  assert.deepEqual([...EDITOR_NODE_RULES.tableCell.children], ['paragraph'])
  assert.deepEqual([...EDITOR_NODE_RULES.tableCell.attrs], ['colspan', 'rowspan', 'colwidth'])
  // Only the table owns editor-internal structure today.
  assert.deepEqual(BLOCK_TYPES.filter((type) => blockHasInternalContent(type)), ['table'])
  // Editor-internal names are exactly the stored editor nodes that are not blocks.
  assert.deepEqual(EDITOR_NODE_NAMES.filter((name) => !BLOCK_NODE_NAMES.includes(name)), ['text', 'hardBreak', 'listItem', 'tableRow', 'tableCell', 'tableHeader'])
  assert.deepEqual(BLOCK_COMMANDS.find(({ id }) => id === 'table'), {
    id: 'table', type: 'table', label: '表格', group: '块', icon: 'table', search: 'table grid sheet',
  })
})

test('table props validation keeps the grid a strict grid of paragraphs', () => {
  const cell = (type, text, attrs = { colspan: 1, rowspan: 1, colwidth: null }) => ({
    type,
    attrs,
    content: [{ type: 'paragraph', content: text ? [{ type: 'text', text, marks: [{ type: 'bold' }] }] : [] }],
  })
  // table([[cells...], [cells...]]) builds a real grid: one row node per array.
  const table = (rows) => ({ node: { type: 'table', content: rows.map((cells) => ({ type: 'tableRow', content: cells })) } })
  const good = table([[cell('tableHeader', 'A'), cell('tableHeader', 'B')], [cell('tableCell', 'C'), cell('tableCell', 'D')]])
  assert.equal(validateTableBlockProps(good), true)
  assert.equal(validateBlockProps('table', good), true)
  assert.equal(validateBlockProps('paragraph', { anything: true }), false)

  // Structure: exactly one table node, at least one row and one cell per row.
  for (const invalid of [
    null,
    {},
    { node: { type: 'table', attrs: { blockId: 'b1' }, content: [] } },
    table([]),
    table([[]]),
    { node: { type: 'table', content: [{ type: 'tableRow' }] } },
    { node: { type: 'eotionCallout', attrs: { icon: '💡', tone: 'neutral' } } },
  ]) {
    assert.equal(validateTableBlockProps(invalid), false)
  }
  // Cells hold plain paragraphs only; no nested block may get inside a cell.
  assert.equal(validateTableBlockProps(table([[cell('tableCell', 'A', undefined)]])), true)
  for (const child of [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'h' }] },
    { type: 'eotionToggle', content: [{ type: 'paragraph' }] },
    { type: 'table', content: [] },
    { type: 'eotionImage', attrs: { fileId: 'f' } },
  ]) {
    assert.equal(validateTableBlockProps({ node: { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [child] }] }] } }), false)
  }
  assert.equal(validateTableBlockProps(table([[{ type: 'tableCell', content: [] }]])), false)
  assert.equal(validateTableBlockProps(table([[{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }], attrs: { colspan: 0 } }]])), false)
  assert.equal(validateTableBlockProps(table([[{ type: 'tableCell', content: [{ type: 'paragraph' }], attrs: { colspan: 1, rowspan: 1, colwidth: [40, -1] } }]])), false)
})

test('validateBlockProps strictly validates all registered block node shapes', () => {
  const inline = [{ type: 'text', text: 'body', marks: [{ type: 'bold' }] }, { type: 'hardBreak' }]
  const paragraph = { type: 'paragraph', content: inline }
  const cell = { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: inline }] }
  const validNodes = {
    paragraph,
    heading: { type: 'heading', attrs: { level: 2 }, content: inline },
    'bulleted-list': { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: inline }] }] },
    'numbered-list': { type: 'orderedList', attrs: { start: 3, type: null }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: inline }] }] },
    todo: { type: 'eotionTodo', attrs: { checked: false }, content: inline },
    quote: { type: 'blockquote', content: [{ type: 'paragraph', content: inline }] },
    code: { type: 'codeBlock', attrs: { language: null }, content: [{ type: 'text', text: 'const x = 1' }] },
    image: { type: 'eotionImage', attrs: { fileId: 'file-1', name: 'photo.png', mimeType: 'image/png', size: 0, url: 'https://example.com/photo.png' } },
    file: { type: 'eotionFile', attrs: { fileId: 'file-2', name: 'notes.txt', mimeType: 'text/plain', size: 12, url: 'https://example.com/notes.txt' } },
    divider: { type: 'horizontalRule' },
    toggle: { type: 'eotionToggle', content: [paragraph] },
    callout: { type: 'eotionCallout', attrs: { icon: '💡', tone: 'neutral' }, content: inline },
    table: { type: 'table', content: [{ type: 'tableRow', content: [cell] }] },
  }
  for (const type of BLOCK_TYPES) {
    assert.equal(validateBlockProps(type, { node: validNodes[type] }), true, `${type} accepts a formal node`)
    assert.equal(validateBlockProps(type, { node: type === 'paragraph' ? validNodes.heading : validNodes.paragraph }), false, `${type} rejects a mismatched root`)
    assert.equal(validateBlockProps(type, { node: { ...validNodes[type], unexpected: true } }), false, `${type} rejects unknown node keys`)
  }

  const invalidAttrs = {
    paragraph: { attrs: { blockId: 'inside-props' } },
    heading: { attrs: { level: 1.5 } },
    'bulleted-list': { attrs: { start: 2 } },
    'numbered-list': { attrs: { start: Number.MAX_SAFE_INTEGER + 1 } },
    todo: { attrs: { checked: 'false' } },
    quote: { attrs: { blockId: 'inside-props' } },
    code: { attrs: { language: 123 } },
    image: { attrs: { ...validNodes.image.attrs, size: Number.MAX_SAFE_INTEGER + 1 } },
    file: { attrs: { ...validNodes.file.attrs, url: 'javascript:alert(1)' } },
    divider: { attrs: { blockId: 'inside-props' } },
    toggle: { attrs: { blockId: 'inside-props' } },
    callout: { attrs: { icon: '💡', tone: 'danger' } },
    table: { attrs: { blockId: 'inside-props' } },
  }
  for (const type of BLOCK_TYPES) {
    assert.equal(validateBlockProps(type, { node: { ...validNodes[type], ...invalidAttrs[type] } }), false, `${type} rejects invalid attrs`)
  }

  for (const type of ['paragraph', 'heading', 'todo', 'code', 'image', 'file', 'divider', 'callout']) {
    assert.equal(validateBlockProps(type, { node: { ...validNodes[type], content: [{ type: 'paragraph' }] } }), false, `${type} rejects an illegal child`)
  }
  assert.equal(validateBlockProps('bulleted-list', { node: { type: 'bulletList', content: [{ type: 'paragraph' }] } }), false)
  assert.equal(validateBlockProps('numbered-list', { node: { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'heading', attrs: { level: 2 } }] }] } }), false)
  assert.equal(validateBlockProps('quote', { node: { type: 'blockquote', content: [{ type: 'table' }] } }), false)
  for (const [type, nodeType] of [['bulleted-list', 'bulletList'], ['numbered-list', 'orderedList'], ['quote', 'blockquote']]) {
    assert.equal(validateBlockProps(type, { node: { type: nodeType, content: [] } }), true, 'preserve legacy empty container reads')
  }
  assert.equal(validateBlockProps('toggle', { node: { type: 'eotionToggle', content: [] } }), true)
  assert.equal(validateBlockProps('toggle', { node: { type: 'eotionToggle', content: [{ type: 'eotionToggle', content: [paragraph] }] } }), false)
  assert.equal(validateBlockProps('table', { node: { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'heading', attrs: { level: 1 } }] }] }] }] } }), false)
  assert.equal(validateBlockProps('paragraph', { node: { type: 'paragraph' } }), true)
  assert.equal(validateBlockProps('code', { node: { type: 'codeBlock' } }), true)
  assert.equal(validateBlockProps('paragraph', { node: { type: 'paragraph', marks: [] } }), false)
  assert.equal(validateBlockProps('paragraph', { node: { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] }] } }), true)
  assert.equal(validateBlockProps('paragraph', { node: { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'https://example.com', target: '_blank' } }] }] } }), false)
})

test('toggle accepts the single stored summary shape emitted by the formal codec', () => {
  const summary = { type: 'paragraph', content: [{ type: 'text', text: 'summary' }] }
  assert.equal(validateBlockProps('toggle', { node: { type: 'eotionToggle', content: [summary] } }), true)
  assert.equal(validateBlockProps('toggle', { node: { type: 'eotionToggle' } }), true)
  const nestedList = { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] }
  assert.equal(validateBlockProps('bulleted-list', { node: { type: 'bulletList', content: [{ type: 'listItem', content: [nestedList] }] } }), true)
  assert.equal(validateBlockProps('toggle', { node: { type: 'eotionToggle', content: [summary, { type: 'paragraph' }] } }), false)
  assert.equal(validateBlockProps('toggle', { node: { type: 'eotionToggle', content: [{ type: 'paragraph' }, { type: 'table', content: [] }] } }), false)
})

test('props validation rejects malformed content and bounds recursive input', () => {
  for (const node of [
    { type: 'paragraph', content: 'text' },
    { type: 'paragraph', attrs: null },
    { type: 'paragraph', content: [null] },
    { type: 'paragraph', content: [{ type: 'text', text: 'x', content: [] }] },
  ]) assert.equal(validateBlockProps('paragraph', { node }), false)
  let deep = { type: 'paragraph' }
  for (let depth = 0; depth < 66; depth++) deep = { type: 'blockquote', content: [deep] }
  assert.equal(validateBlockProps('quote', { node: deep }), false)
  const cyclic = { type: 'blockquote', content: [] }
  cyclic.content.push(cyclic)
  assert.equal(validateBlockProps('quote', { node: cyclic }), false)
  assert.equal(validateBlockProps('paragraph', { node: { type: 'paragraph', content: Array.from({ length: 100_001 }, () => ({ type: 'text', text: 'x' })) } }), false)
})

test('the shared table size budget is pinned and enforced at its boundaries', () => {
  assert.deepEqual(TABLE_LIMITS, { maxRows: 1000, maxCellsPerRow: 200, maxParagraphsPerCell: 100 })
  const oneCell = { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph' }] }
  const rowsOf = (count) => ({ node: { type: 'table', content: Array.from({ length: count }, () => ({ type: 'tableRow', content: [oneCell] })) } })
  const cellsInRow = (count) => ({ node: { type: 'table', content: [{ type: 'tableRow', content: Array.from({ length: count }, () => oneCell) }] } })
  const paragraphsInCell = (count) => ({ node: { type: 'table', content: [{ type: 'tableRow', content: [{ ...oneCell, content: Array.from({ length: count }, () => ({ type: 'paragraph' })) }] }] } })
  assert.equal(validateTableBlockProps(rowsOf(TABLE_LIMITS.maxRows)), true)
  assert.equal(validateTableBlockProps(rowsOf(TABLE_LIMITS.maxRows + 1)), false)
  assert.equal(validateTableBlockProps(cellsInRow(TABLE_LIMITS.maxCellsPerRow)), true)
  assert.equal(validateTableBlockProps(cellsInRow(TABLE_LIMITS.maxCellsPerRow + 1)), false)
  assert.equal(validateTableBlockProps(paragraphsInCell(TABLE_LIMITS.maxParagraphsPerCell)), true)
  assert.equal(validateTableBlockProps(paragraphsInCell(TABLE_LIMITS.maxParagraphsPerCell + 1)), false)
})

test('cell span attributes are validated by one shared rule', () => {
  assert.equal(validateTableCellAttrs({}), true)
  assert.equal(validateTableCellAttrs({ colspan: 2, rowspan: 1, colwidth: [40] }), true)
  assert.equal(validateTableCellAttrs({ colspan: 1, rowspan: 1, colwidth: null }), true)
  for (const attrs of [null, [], { colspan: 0 }, { rowspan: -1 }, { colspan: 1.5 }, { colwidth: 40 }, { colwidth: [40, -1] }, { align: 'left' }]) {
    assert.equal(validateTableCellAttrs(attrs), false)
  }
})

test('callout hardBreak preserves the same safe marks as text and rejects malformed marks', () => {
  const props = (inline) => ({ node: { type: 'eotionCallout', attrs: { icon: '💡', tone: 'info' }, content: [inline] } })
  for (const mark of [{ type: 'bold' }, { type: 'italic' }, { type: 'strike' }, { type: 'code' }, { type: 'link', attrs: { href: 'https://example.com/' } }]) {
    assert.equal(validateCalloutBlockProps(props({ type: 'hardBreak', marks: [mark] })), true)
  }
  for (const inline of [{ type: 'hardBreak', marks: [{ type: 'unknown' }] },
    { type: 'hardBreak', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] },
    { type: 'hardBreak', marks: 'bold' }, { type: 'hardBreak', text: 'bad' }]) {
    assert.equal(validateCalloutBlockProps(props(inline)), false)
  }
})

test('only child-owning parents accept the declared child types', () => {
  for (const type of BLOCK_TYPES) assert.equal(isAllowedChildBlockType('toggle', type), true, type)
  assert.equal(isAllowedChildBlockType('paragraph', 'paragraph'), false)
  assert.equal(isAllowedChildBlockType('heading', 'todo'), false)
  assert.equal(isAllowedChildBlockType('quote', 'toggle'), false)
})

function link(id, parentBlockId, orderKey, pageId = 'page-1') {
  return { id, pageId, parentBlockId, orderKey }
}

test('a flat list rebuilds one deterministic depth-first tree', () => {
  const blocks = [
    link('b', null, '0002'),
    link('a', null, '0001'),
    link('d', 'a', '0002'),
    link('c', 'a', '0001'),
  ]
  assert.deepEqual(flattenBlockTree(blocks).map((block) => block.id), ['a', 'c', 'd', 'b'])
  const tree = buildBlockTree(blocks)
  assert.deepEqual(tree.map((node) => node.block.id), ['a', 'b'])
  assert.deepEqual(tree[0].children.map((node) => node.block.id), ['c', 'd'])
  assert.deepEqual(blockDepthMap(blocks).get('d'), 1)
  assert.deepEqual(blockDepthMap(blocks).get('a'), 0)
  assert.deepEqual(descendantIds(blocks, 'a'), ['c', 'd'])
})

test('sibling order falls back to id when order keys tie', () => {
  const blocks = [link('z', null, '0001'), link('a', null, '0001')]
  assert.deepEqual(flattenBlockTree(blocks).map((block) => block.id), ['a', 'z'])
})

test('self-parent, missing parent, cross-page parent, cycle and duplicate ids are rejected', () => {
  assert.throws(() => validateBlockTree([link('a', 'a', '1')]), /cannot be its own parent/)
  assert.throws(() => validateBlockTree([link('a', 'missing', '1')]), /Parent block missing is missing/)
  assert.throws(
    () => validateBlockTree([link('a', null, '1'), link('b', 'a', '2', 'page-2')]),
    /belongs to a different page/,
  )
  assert.throws(
    () => validateBlockTree([link('a', 'b', '1'), link('b', 'a', '2')]),
    /cyclic parent/,
  )
  assert.throws(() => validateBlockTree([link('a', null, '1'), link('a', null, '2')]), /Duplicate block id/)
  assert.throws(() => validateBlockTree([link('a', null, '1')], 'other-page'), /belongs to a different page/)
})

test('parent rejections carry the reason and a stable message', () => {
  const blocks = [link('a', null, '1'), link('b', 'a', '2'), link('c', 'b', '3')]
  assert.equal(parentRejection(blocks, 'a', 'a'), 'self')
  assert.equal(parentRejection(blocks, 'a', 'nope'), 'missing')
  // a -> b -> c, so a can never move under its own child or grandchild.
  assert.equal(parentRejection(blocks, 'a', 'c'), 'cycle')
  assert.equal(parentRejection(blocks, 'a', 'b'), 'cycle')
  assert.equal(parentRejection(blocks, 'c', 'a'), null)
  assert.equal(parentRejection(blocks, 'b', null), null)
  assert.equal(parentRejection([link('a', null, '1'), link('x', null, '2', 'page-2')], 'a', 'x', 'page-1'), 'cross-page')
  assert.match(parentRejectionMessage('cycle', 'a', 'c'), /descendant/)
  assert.match(parentRejectionMessage('cross-page', 'a', 'x'), /different page/)
})

test('deletion order removes children before parents', () => {
  const blocks = [link('root', null, '1'), link('child', 'root', '1'), link('grandchild', 'child', '1')]
  assert.deepEqual(orderForDeletion(blocks, blocks).map((block) => block.id), ['grandchild', 'child', 'root'])
})

test('tree order is assigned per sibling group and preserves previous keys', () => {
  const decoded = [
    { id: 'root1', parentBlockId: null, orderKey: '' },
    { id: 'child1', parentBlockId: 'root1', orderKey: '' },
    { id: 'child2', parentBlockId: 'root1', orderKey: '' },
    { id: 'root2', parentBlockId: null, orderKey: '' },
  ]
  const assigned = assignBlockTreeOrder(decoded, new Map())
  assert.deepEqual(assigned.map((block) => block.id), decoded.map((block) => block.id))
  const byId = new Map(assigned.map((block) => [block.id, block.orderKey]))
  assert.ok(byId.get('root1') < byId.get('root2'))
  assert.ok(byId.get('child1') < byId.get('child2'))
  assert.equal(byId.get('root1'), byId.get('child1'))

  const previous = new Map([
    ['root1', '000000000000000000000000000100'],
    ['root2', '000000000000000000000000000200'],
    ['child1', '000000000000000000000000000700'],
    ['child2', '000000000000000000000000000800'],
  ])
  const kept = assignBlockTreeOrder(decoded, previous)
  for (const block of kept) assert.equal(block.orderKey, previous.get(block.id))
})

test('moving the last of 1000 siblings to the front allocates only one new gap key', () => {
  const blocks = Array.from({ length: 1000 }, (_, index) => ({ id: `b-${index}`, parentBlockId: null, orderKey: '' }))
  const initial = assignBlockTreeOrder(blocks, new Map())
  const previous = new Map(initial.map((block) => [block.id, block.orderKey]))
  const moved = [blocks.at(-1), ...blocks.slice(0, -1)]
  const result = assignBlockTreeOrder(moved, previous)
  assert.equal(result.filter((block) => block.orderKey !== previous.get(block.id)).length, 1)
  assert.ok(result.every((block, index) => index === 0 || result[index - 1].orderKey < block.orderKey))
  assert.deepEqual(assignBlockTreeOrder(result, new Map(result.map((block) => [block.id, block.orderKey]))), result)
})
