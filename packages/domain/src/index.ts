export type Id = string

export interface PageSummary {
  id: Id
  title: string
  icon?: string
  updatedAt: string
}

import type { BlockType } from './block-types'

export { BLOCK_TYPES } from './block-types'
export type { BlockType } from './block-types'

export interface BlockRecord {
  id: Id
  pageId: Id
  parentBlockId?: Id | null
  type: BlockType
  orderKey: string
  props: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface WorkspaceRecord {
  id: Id
  name: string
  ownerId: Id
  createdAt: string
  updatedAt: string
}

export interface UserRecord {
  id: Id
  email: string
  createdAt: string
  updatedAt: string
}

export interface PageRecord {
  id: Id
  workspaceId: Id
  parentPageId: Id | null
  title: string
  icon?: string
  orderKey: string
  createdAt: string
  updatedAt: string
}

export interface FileMetadata {
  id: Id
  workspaceId: Id
  ownerId: Id
  name: string
  mimeType: string
  size: number
  objectKey: string
  url?: string
  createdAt: string
  updatedAt: string
}

export type ServerBlockRecord = BlockRecord & { workspaceId: Id }
