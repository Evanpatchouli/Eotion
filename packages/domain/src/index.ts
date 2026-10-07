export type Id = string

export interface PageSummary {
  id: Id
  title: string
  icon?: string
  updatedAt: string
}

import type { BlockType } from './block-types'

export {
  BLOCK_CAPABILITIES,
  BLOCK_COMMANDS,
  BLOCK_NODE_NAMES,
  BLOCK_NODE_TYPES,
  BLOCK_TYPES,
  EDITOR_NODE_NAMES,
  EDITOR_NODE_RULES,
  TABLE_LIMITS,
  blockAllowsChildren,
  blockCapability,
  blockHasInternalContent,
  blockTypeForNode,
  editorNodeRule,
  isAllowedChildBlockType,
  isAttachmentBlockType,
  isBlockType,
  isMcpReadableBlockType,
  isMcpWritableBlockType,
  nodeTypeForBlock,
  slashCommands,
  validateCalloutAttrs,
  validateCalloutBlockProps,
  validateBlockProps,
  validateDatabaseReferenceAttrs,
  validateDatabaseBlockProps,
  validateTableCellAttrs,
  validateTableBlockProps,
} from './block-types'
export type { BlockCapability, BlockCommandId, BlockCommandSpec, BlockType, CalloutTone, EditorNodeRule } from './block-types'
export {
  isValidDatabase,
  isValidDatabaseProperty,
  isValidDatabasePropertyDefinition,
  isValidDatabaseRecord,
  isValidDatabaseView,
  validateDatabaseRecordValues,
} from './database'
export type {
  Database,
  DatabaseProperty,
  DatabasePropertyDefinition,
  DatabasePropertyType,
  DatabasePropertyValue,
  DatabaseRecord,
  DatabaseRecordValues,
  DatabaseSelectOption,
  DatabaseView,
} from './database'
export {
  blockDepthMap,
  buildBlockTree,
  descendantIds,
  flattenBlockTree,
  orderForDeletion,
  parentOf,
  parentRejection,
  parentRejectionMessage,
  validateBlockTree,
} from './block-tree'
export type { BlockLink, BlockTreeOrderLink, BlockTreeNode, ParentRejection } from './block-tree'
export { assignBlockOrder, assignBlockTreeOrder, nextOrderKey } from './order'

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
  displayName: string
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
