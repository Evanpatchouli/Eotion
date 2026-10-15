import { expect, test } from '@playwright/test'
import type { DatabaseProperty, DatabaseViewConfig } from '@eotion/domain/database'
import { layoutTimelineDependency, projectTimelineDependencies, selectTimelineDependencyEdges, type TimelineDependencyEdge } from '../src/components/editor/timeline/dependency'
import { layoutTimelineItem, type TimelineItemGeometry, type TimelineRowWindow } from '../src/components/editor/timeline/layout'
import type { TimelineItemProjection, TimelineRecordInput } from '../src/components/editor/timeline/projection'
import { createViewport, rebaseViewport, updateViewport, viewportTransform } from '../src/components/editor/timeline/viewport'
import type { TimelineScaleId } from '../src/components/editor/timeline/types'

const databaseId = 'db'
const relationProperty: DatabaseProperty = {
  id: 'dependency', databaseId, workspaceId: 'ws', name: 'Dependency', type: 'relation',
  config: { targetDatabaseId: databaseId }, version: 1, createdAt: '', updatedAt: '',
}
const schema = [relationProperty]

function view(direction: 'depends-on' | 'blocks' = 'depends-on', propertyId = 'dependency'): DatabaseViewConfig {
  return { filters: [], sorts: [], visibleProperties: null, propertyOrder: null, options: { timeline: {
    dependency: { propertyId, direction, shiftMode: 'no_auto_shift', avoidWeekends: false },
  } } }
}

function record(id: string, relation: unknown): TimelineRecordInput {
  return { id, pageId: `page-${id}`, properties: { dependency: relation } } as unknown as TimelineRecordInput
}

function project(records: readonly TimelineRecordInput[], config = view(), properties = schema) {
  return projectTimelineDependencies({ databaseId, properties, records, config })
}

function geometry(id: string, rowIndex: number, rawX: number, rawWidth = 0, kind: 'point' | 'range' = 'point', extra: Partial<TimelineItemGeometry> = {}): TimelineItemGeometry {
  const rowTop = rowIndex * 48
  return {
    recordId: id, rowIndex, kind, rawX, rawWidth, x: rawX, width: rawWidth,
    rowTop, top: rowTop + 8, height: 32, clippedLeft: false, clippedRight: false,
    ...(kind === 'point' ? { marker: true } : {}), ...extra,
  }
}

const edge = (predecessorRecordId: string, successorRecordId: string): TimelineDependencyEdge => ({
  id: JSON.stringify(['dependency', predecessorRecordId, successorRecordId]), predecessorRecordId, successorRecordId,
})

test('dependency projection requires valid Timeline options and an authorized self-relation schema property', () => {
  const records = [record('a', []), record('b', ['a'])]
  expect(project(records, { filters: [], sorts: [], visibleProperties: null, propertyOrder: null })).toEqual([])
  expect(project(records, { ...view(), options: { timeline: { dependency: { propertyId: 'dependency', direction: 'other' } } } as never })).toEqual([])
  expect(project(records, view('depends-on', 'missing'))).toEqual([])
  expect(project(records, view(), [{ ...relationProperty, databaseId: 'foreign' }])).toEqual([])
  expect(project(records, view(), [{ ...relationProperty, type: 'text', config: undefined }])).toEqual([])
  expect(project(records, view(), [{ ...relationProperty, config: { targetDatabaseId: 'other' } }])).toEqual([])
  expect(project(records, view(), [])).toEqual([])
  // Invalid unrelated date/sort references do not invalidate the independently checked timeline namespace.
  expect(project(records, { ...view(), sorts: [{ propertyId: 'missing', direction: 'asc' }] })).toEqual([edge('a', 'b')])
})

test('projection accepts only relation wire arrays, filters unusable links, deduplicates, and sorts deterministically', () => {
  const records = [
    record('a', ['b', 'b', 'a', '', 3, 'not-loaded', 'c']),
    record('b', 'a'),
    record('c', ['a']),
    record('d', []),
  ]
  const original = structuredClone(records)
  const edges = project(records)
  const permuted = project([
    record('d', []), record('c', ['a']), record('b', 'a'), record('a', ['c', 3, 'not-loaded', '', 'a', 'b', 'b']),
  ])
  expect(edges).toEqual([edge('a', 'c'), edge('b', 'a'), edge('c', 'a')].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  expect(permuted).toEqual(edges)
  expect(project(records, view('blocks'))).toEqual([edge('a', 'b'), edge('a', 'c'), edge('c', 'a')].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  expect(project([record('a', []), record('b', null)])).toEqual([])
  expect(records).toEqual(original)

  const frozenRecords = Object.freeze(records.map(item => Object.freeze({
    ...item,
    properties: Object.freeze({ ...item.properties, dependency: Array.isArray(item.properties.dependency) ? Object.freeze([...item.properties.dependency]) : item.properties.dependency }),
  }))) as unknown as readonly TimelineRecordInput[]
  expect(project(frozenRecords)).toEqual(edges)
})

test('geometry routes point/range combinations using raw endpoints and rejects invalid anchors', () => {
  const cases: Array<[TimelineItemGeometry, TimelineItemGeometry, number, number]> = [
    [geometry('a', 0, 20), geometry('b', 1, 80), 20, 80],
    [geometry('a', 0, 20), geometry('b', 1, 80, 12, 'range'), 20, 80],
    [geometry('a', 0, 20, 30, 'range'), geometry('b', 1, 80), 50, 80],
    [geometry('a', 0, 20, 30, 'range'), geometry('b', 1, 80, 10, 'range'), 50, 80],
  ]
  for (const [predecessor, successor, startX, endX] of cases) {
    const result = layoutTimelineDependency(predecessor, successor, 200)
    expect(result?.start.x).toBe(startX)
    expect(result?.end.x).toBe(endX)
    expect(result?.path).toContain(`M ${startX} `)
  }
  const clippedSource = geometry('a', 0, 30, 70, 'range', { x: 40, width: 20, clippedLeft: true, clippedRight: true })
  const clippedTarget = geometry('b', 1, 150, 0, 'point', { x: 150, offscreen: 'right' })
  expect(layoutTimelineDependency(clippedSource, clippedTarget, 200)?.start.x).toBe(100)
  expect(layoutTimelineDependency(geometry('a', 0, -1), geometry('b', 1, 80), 200)).toBeNull()
  expect(layoutTimelineDependency(geometry('a', 0, 20), geometry('b', 1, 201), 200)).toBeNull()
  expect(layoutTimelineDependency(geometry('a', 0, Number.NaN), geometry('b', 1, 80), 200)).toBeNull()
  expect(layoutTimelineDependency(geometry('a', 0, 20), geometry('a', 1, 80), 200)).toBeNull()
})

test('geometry uses forward midpoint and deterministic bounded detours for backward and near links', () => {
  const forward = layoutTimelineDependency(geometry('a', 0, 20), geometry('b', 1, 100), 120)
  expect(forward?.path).toContain('H 60 V')
  const backward = layoutTimelineDependency(geometry('z', 0, 100), geometry('a', 1, 50), 120)
  expect(backward?.path).toContain('H 112 V 48 H 38 V 72 H 50')
  const near = layoutTimelineDependency(geometry('a', 0, 30), geometry('b', 1, 50), 120)
  expect(near?.path).toContain('V 48 H 38 V 72 H 50')
  const predecessorBelow = layoutTimelineDependency(geometry('a', 5, 100), geometry('b', 0, 50), 120)
  expect(predecessorBelow?.path).toBe('M 100 264 H 112 V 144 H 38 V 24 H 50')
  const distantRows = layoutTimelineDependency(geometry('a', 0, 100), geometry('b', 5, 50), 120)
  expect(distantRows?.path).toContain('V 144 H 38')
  const sameYAbove = layoutTimelineDependency(geometry('a', 0, 20), geometry('b', 0, 20), 120)
  const sameYBelow = layoutTimelineDependency(geometry('b', 0, 20), geometry('a', 0, 20), 120)
  expect(sameYAbove?.path).toContain('V 12 ')
  expect(sameYBelow?.path).toContain('V 36 ')
  for (const result of [forward, backward, near, predecessorBelow, distantRows, sameYAbove, sameYBelow]) {
    expect(result).not.toBeNull()
    const commands = [...result!.path.matchAll(/([MHV]) (-?\d+(?:\.\d+)?)/gu)]
    expect(commands.every(match => Number.isFinite(Number(match[2])))).toBe(true)
    expect(commands.filter(match => match[1] !== 'V').every(match => Number(match[2]) >= 0 && Number(match[2]) <= 120)).toBe(true)
  }
})

test('window selection keeps intersecting spans, focused endpoints, and offscreen anchors while requiring both geometries', () => {
  const edges = [edge('outside-top', 'outside-bottom'), edge('before', 'first'), edge('last', 'after'), edge('focus', 'outside-focus'), edge('absent', 'first'), edge('outside-a', 'outside-b')]
  const geometries = new Map<string, TimelineItemGeometry>([
    ['outside-top', geometry('outside-top', 0, 10)], ['outside-bottom', geometry('outside-bottom', 9, 90)],
    ['before', geometry('before', 1, 10)], ['first', geometry('first', 2, 30)],
    ['last', geometry('last', 5, 50)], ['after', geometry('after', 8, 80)],
    ['focus', geometry('focus', 20, 40)], ['outside-focus', geometry('outside-focus', 30, 60, 0, 'point', { offscreen: 'right' })],
    ['outside-a', geometry('outside-a', 10, 20)], ['outside-b', geometry('outside-b', 11, 40)],
  ])
  const window: TimelineRowWindow = { first: 2, last: 6, top: 96, height: 192, totalHeight: 48 * 31, focusedRowIndex: 20 }
  expect(selectTimelineDependencyEdges(edges, geometries, window, 100)).toEqual(edges.slice(0, 4))
  expect(selectTimelineDependencyEdges([edge('before', 'after')], geometries, { ...window, focusedRowIndex: null }, 100)).toEqual([edge('before', 'after')])
  expect(selectTimelineDependencyEdges([edge('before', 'first')], geometries, window, 100)).toEqual([edge('before', 'first')])
  expect(selectTimelineDependencyEdges([edge('outside-a', 'outside-b')], geometries, { ...window, focusedRowIndex: null }, 100)).toEqual([])
})

test('dependency anchors follow shared item layout through scale changes and viewport rebases', () => {
  const startMs = Date.parse('2024-03-10T12:00:00Z')
  const endMs = Date.parse('2024-03-13T12:00:00Z')
  const predecessor = { recordId: 'range', kind: 'range', start: { kind: 'datetime', instantMs: startMs, sourceTimeZone: 'UTC' }, end: { kind: 'datetime', instantMs: endMs, sourceTimeZone: 'UTC' }, precision: 'datetime', explicitZeroDuration: false } as TimelineItemProjection
  const successor = { recordId: 'point', kind: 'point', start: { kind: 'datetime', instantMs: endMs, sourceTimeZone: 'UTC' }, end: null } as TimelineItemProjection
  const temporal = (recordId: string, start: number, end: number | null) => ({ recordId, startMs: start, visualEndMs: end })
  const layoutAt = (scale: TimelineScaleId, rebase: boolean) => {
    const initial = createViewport({ width: 900, centerMs: startMs, scale: 'day', displayTimeZone: 'UTC' })
    const base = initial && updateViewport(initial, { scale })
    if (!base) throw new Error('Expected viewport update')
    const nearEdge = { ...base, scrollLeft: 12 }
    const state = rebase ? rebaseViewport(nearEdge) : nearEdge
    const transform = viewportTransform(state)
    const before = layoutTimelineItem(predecessor as Extract<TimelineItemProjection, { kind: 'point' | 'range' }>, temporal('range', startMs, endMs), 0, transform)
    const after = layoutTimelineItem(successor as Extract<TimelineItemProjection, { kind: 'point' | 'range' }>, temporal('point', endMs, null), 1, transform)
    const dependency = layoutTimelineDependency(before, after, 200_000)
    expect(dependency?.start.x).toBeCloseTo(before.rawX + before.rawWidth, 6)
    expect(dependency?.end.x).toBeCloseTo(after.rawX, 6)
    return { before, after, dependency, scrollLeft: state.scrollLeft }
  }

  for (const scale of ['day', 'week'] as const) {
    const direct = layoutAt(scale, false)
    const rebased = layoutAt(scale, true)
    expect(rebased.dependency?.start.x - rebased.scrollLeft).toBeCloseTo(direct.dependency!.start.x - direct.scrollLeft, 6)
    expect(rebased.dependency?.end.x - rebased.scrollLeft).toBeCloseTo(direct.dependency!.end.x - direct.scrollLeft, 6)
  }
})

test('500-record projection stays a deterministic pure count at moderate density', () => {
  const records = Array.from({ length: 500 }, (_, index) => record(`r${index}`, index > 0 && index % 3 === 0 ? [`r${index - 1}`, `r${index - 2}`] : []))
  const first = project(records)
  const second = project(records)
  expect(first).toHaveLength(332)
  expect(first).toEqual(second)
})
