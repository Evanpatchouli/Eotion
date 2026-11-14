'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { isViewOrderRank, rankBetween } = require('../dist/view-order-rank.js')

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
