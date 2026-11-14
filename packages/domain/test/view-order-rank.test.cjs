'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const {
  compareViewOrderPosition,
  isViewOrderRank,
  positionBetween,
  rankBetween,
} = require('../dist/view-order-rank.js')

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

function validRanksThrough(maxLength) {
  const ranks = []
  for (let length = 1; length <= maxLength; length += 1) {
    for (let prefix = 0; prefix < 2 ** (length - 1); prefix += 1) {
      const bits = length === 1 ? '' : prefix.toString(2).padStart(length - 1, '0')
      ranks.push(`${bits}1`)
    }
  }
  return ranks
}

test('view order ranks are nonempty ASCII binary strings ending in 1', () => {
  for (const valid of ['1', '01', '11', '001', '101', '111']) assert.equal(isViewOrderRank(valid), true, valid)
  for (const invalid of ['', '0', '10', '2', 'a1', '１', null, undefined, 1, new String('1')]) {
    assert.equal(isViewOrderRank(invalid), false, String(invalid))
  }
})

test('rankBetween handles unbounded neighbors and preserves ASCII order', () => {
  assert.equal(rankBetween(null, null), '1')
  assert.equal(rankBetween(null, '101'), '0101')
  assert.equal(rankBetween('101', null), '1011')
  assert.equal(rankBetween('1', '11'), '101')
  assert.equal(rankBetween('101', '111'), '1011')
  assert.equal(compareAscii('01', '1'), -1)
  assert.equal(compareAscii('101', '11'), -1)
})

test('rankBetween returns a valid strict rank for every ordered pair through length 8', () => {
  const ranks = validRanksThrough(8).sort(compareAscii)
  for (let lowerIndex = 0; lowerIndex < ranks.length; lowerIndex += 1) {
    for (let upperIndex = lowerIndex + 1; upperIndex < ranks.length; upperIndex += 1) {
      const lower = ranks[lowerIndex]
      const upper = ranks[upperIndex]
      const middle = rankBetween(lower, upper)
      assert.equal(isViewOrderRank(middle), true, `${lower} < ${middle} < ${upper}`)
      assert.equal(compareAscii(lower, middle), -1, `${lower} < ${middle} < ${upper}`)
      assert.equal(compareAscii(middle, upper), -1, `${lower} < ${middle} < ${upper}`)
    }
  }
})

test('rankBetween rejects invalid, equal, and reversed neighbors with TypeError', () => {
  for (const [lower, upper] of [
    ['', null],
    ['0', null],
    [null, '10'],
    [null, 'x1'],
    ['11', '11'],
    ['11', '1'],
    ['1', '01'],
    [1, '11'],
    ['1', 11],
  ]) {
    assert.throws(() => rankBetween(lower, upper), TypeError, `${String(lower)}, ${String(upper)}`)
  }
})

test('1000 repeated insertions in the same narrowing gap remain valid and ordered', () => {
  const inserted = []
  const lower = '1'
  let upper = '11'
  for (let index = 0; index < 1000; index += 1) {
    const rank = rankBetween(lower, upper)
    assert.equal(isViewOrderRank(rank), true)
    assert.equal(compareAscii(lower, rank), -1)
    assert.equal(compareAscii(rank, upper), -1)
    inserted.unshift(rank)
    upper = rank
  }
  const ordered = [lower, ...inserted, '11']
  for (let index = 1; index < ordered.length; index += 1) {
    assert.equal(isViewOrderRank(ordered[index]), true)
    assert.equal(compareAscii(ordered[index - 1], ordered[index]), -1)
  }
})

test('view positions compare slot ordinals before ASCII ranks', () => {
  assert.equal(compareViewOrderPosition({ slotOrdinal: 0, rank: '11' }, { slotOrdinal: 1, rank: '1' }), -1)
  assert.equal(compareViewOrderPosition({ slotOrdinal: 2, rank: '01' }, { slotOrdinal: 2, rank: '1' }), -1)
  assert.equal(compareViewOrderPosition({ slotOrdinal: 2, rank: '1' }, { slotOrdinal: 2, rank: '1' }), 0)
  assert.equal(compareViewOrderPosition({ slotOrdinal: 2, rank: '1' }, { slotOrdinal: 2, rank: '01' }), 1)
})

test('positionBetween handles empty, first, last, cross-slot, and same-slot boundaries', () => {
  assert.deepEqual(positionBetween(null, null), { slotOrdinal: 0, rank: '1' })
  assert.deepEqual(positionBetween(null, { slotOrdinal: 0, rank: '1' }), { slotOrdinal: 0, rank: '01' })
  assert.deepEqual(positionBetween(null, { slotOrdinal: 3, rank: '1' }), { slotOrdinal: 0, rank: '1' })
  assert.deepEqual(positionBetween({ slotOrdinal: 2, rank: '1' }, null), { slotOrdinal: 2, rank: '11' })
  assert.deepEqual(positionBetween(
    { slotOrdinal: 2, rank: '1' },
    { slotOrdinal: 3, rank: '1' },
  ), { slotOrdinal: 2, rank: '11' })
  assert.deepEqual(positionBetween(
    { slotOrdinal: 2, rank: '1' },
    { slotOrdinal: 2, rank: '11' },
  ), { slotOrdinal: 2, rank: '101' })
})

test('positionBetween supports 2048 adjacent same-slot insertions in order', () => {
  const positions = [{ slotOrdinal: 0, rank: '1' }]
  const right = { slotOrdinal: 0, rank: '11' }
  for (let index = 0; index < 2048; index += 1) {
    const next = positionBetween(positions.at(-1), right)
    assert.equal(compareViewOrderPosition(positions.at(-1), next), -1)
    assert.equal(compareViewOrderPosition(next, right), -1)
    positions.push(next)
  }
  for (let index = 1; index < positions.length; index += 1) {
    assert.equal(compareViewOrderPosition(positions[index - 1], positions[index]), -1)
  }
})

test('a position in a new ordinal slot follows every existing position', () => {
  const existing = [
    { slotOrdinal: 0, rank: '111' },
    { slotOrdinal: 1, rank: '1' },
    { slotOrdinal: 4, rank: '101' },
    { slotOrdinal: 8, rank: '11' },
  ]
  const nextRecord = { slotOrdinal: Math.max(...existing.map(({ slotOrdinal }) => slotOrdinal)) + 1, rank: '1' }
  for (const position of existing) assert.equal(compareViewOrderPosition(position, nextRecord), -1)
})

test('view position helpers reject unsafe slots, invalid ranks, and unordered boundaries', () => {
  const invalidPositions = [
    { slotOrdinal: -1, rank: '1' },
    { slotOrdinal: 1.5, rank: '1' },
    { slotOrdinal: Number.MAX_SAFE_INTEGER + 1, rank: '1' },
    { slotOrdinal: 0, rank: '10' },
  ]
  for (const invalid of invalidPositions) {
    assert.throws(() => compareViewOrderPosition(invalid, { slotOrdinal: 1, rank: '1' }), TypeError)
    assert.throws(() => positionBetween(invalid, null), TypeError)
  }
  for (const [left, right] of [
    [{ slotOrdinal: 0, rank: '1' }, { slotOrdinal: 0, rank: '1' }],
    [{ slotOrdinal: 1, rank: '1' }, { slotOrdinal: 0, rank: '11' }],
    [{ slotOrdinal: 1, rank: '11' }, { slotOrdinal: 1, rank: '1' }],
  ]) {
    assert.throws(() => positionBetween(left, right), TypeError)
  }
})
