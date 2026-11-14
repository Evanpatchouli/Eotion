import type { DatabaseViewGroupKey } from '@eotion/contracts'
import { TIMELINE_ROW_HEIGHT } from './layout'
import type { TimelineItemProjection } from './projection'

export type TimelineGroupSection = {
  key: DatabaseViewGroupKey
  label: string
  collapsed: boolean
  items: readonly TimelineItemProjection[]
}

export type TimelineGroupHeader = {
  key: DatabaseViewGroupKey
  label: string
  collapsed: boolean
  rowIndex: number
  top: number
  height: number
}

export type TimelineGroupRowLayout = {
  headers: TimelineGroupHeader[]
  items: TimelineItemProjection[]
  rowCount: number
}

/** Places group headers and records on one shared 48px visual row axis. */
export function layoutTimelineGroupSections(sections: readonly TimelineGroupSection[]): TimelineGroupRowLayout {
  const headers: TimelineGroupHeader[] = []
  const items: TimelineItemProjection[] = []
  const groupIds = new Set<string>()
  const recordIds = new Set<string>()
  let rowIndex = 0

  for (const section of sections) {
    const { key } = section
    if (key.kind !== 'ungrouped' && key.kind !== 'option') throw new TypeError('Invalid Timeline group key')
    const groupId = JSON.stringify(key.kind === 'option' ? ['option', key.optionId] : ['ungrouped'])
    if (groupIds.has(groupId)) throw new TypeError('Duplicate Timeline group key')
    groupIds.add(groupId)
    headers.push({ key, label: section.label, collapsed: section.collapsed, rowIndex, top: rowIndex * TIMELINE_ROW_HEIGHT, height: TIMELINE_ROW_HEIGHT })
    rowIndex += 1
    for (const item of section.items) {
      if (recordIds.has(item.recordId)) throw new TypeError('Duplicate Timeline record id')
      recordIds.add(item.recordId)
      if (section.collapsed) continue
      items.push({ ...item, rowIndex })
      rowIndex += 1
    }
  }

  return { headers, items, rowCount: rowIndex }
}
