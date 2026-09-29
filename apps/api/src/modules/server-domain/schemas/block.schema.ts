import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

const blockTypes = [
  'paragraph', 'heading', 'bulleted-list', 'numbered-list', 'todo',
  'quote', 'code', 'image', 'divider',
] as const

@Schema({ collection: 'blocks', timestamps: true, versionKey: false })
export class BlockEntity {
  @Prop({ type: String, required: true, unique: true })
  id!: string

  @Prop({ type: String, required: true })
  workspaceId!: string

  @Prop({ type: String, required: true })
  pageId!: string

  @Prop({ type: String, default: null })
  parentBlockId?: string | null

  @Prop({ type: String, required: true, enum: blockTypes })
  type!: string

  @Prop({ type: String, required: true })
  orderKey!: string

  @Prop({ type: Object, required: true, default: {} })
  props!: Record<string, unknown>

  createdAt!: Date
  updatedAt!: Date
}

export type BlockDocument = HydratedDocument<BlockEntity>
export const BlockSchema = SchemaFactory.createForClass(BlockEntity)
BlockSchema.index({ workspaceId: 1, pageId: 1, parentBlockId: 1, orderKey: 1, id: 1 })
