export type Id = string

export interface PageSummary {
  id: Id
  title: string
  icon?: string
  updatedAt: string
}

export type BlockType =
  | 'paragraph'
  | 'heading'
  | 'bulleted-list'
  | 'numbered-list'
  | 'todo'
  | 'quote'
  | 'code'
  | 'image'
  | 'divider'

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
