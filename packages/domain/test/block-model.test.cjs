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
  blockAllowsChildren,
  blockTypeForNode,
  isAllowedChildBlockType,
  nodeTypeForBlock,
  validateCalloutAttrs,
  validateCalloutBlockProps,
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
