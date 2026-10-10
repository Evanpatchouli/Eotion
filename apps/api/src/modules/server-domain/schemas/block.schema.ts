import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { BLOCK_TYPES } from '@eotion/domain'
import { HydratedDocument } from 'mongoose'

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

  @Prop({ type: String, required: true, enum: BLOCK_TYPES })
  type!: string

  @Prop({ type: String, required: true })
  orderKey!: string

  @Prop({ type: Object, required: true, default: {} })
  props!: Record<string, unknown>

  @Prop({ type: Number, default: 0 })
  structureFence!: number

  createdAt!: Date
  updatedAt!: Date
}

export type BlockDocument = HydratedDocument<BlockEntity>
export const BlockSchema = SchemaFactory.createForClass(BlockEntity)
BlockSchema.index({ workspaceId: 1, pageId: 1, parentBlockId: 1, orderKey: 1, id: 1 })
BlockSchema.index({ workspaceId: 1, type: 1, 'props.node.attrs.databaseId': 1, createdAt: 1, id: 1 })
