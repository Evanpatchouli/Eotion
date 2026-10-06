import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import type { HydratedDocument } from 'mongoose'
import { Schema as MongooseSchema } from 'mongoose'

@Schema({ collection: 'mcp_mutation_receipts', timestamps: true, versionKey: false })
export class McpMutationReceiptEntity {
  @Prop({ type: String, required: true, unique: true })
  id!: string

  @Prop({ type: String, required: true })
  userId!: string

  @Prop({ type: String, required: true, enum: ['eotion_create_page', 'eotion_update_page'] })
  tool!: 'eotion_create_page' | 'eotion_update_page'

  @Prop({ type: String, required: true })
  idempotencyKey!: string

  @Prop({ type: String, required: true })
  requestHash!: string

  @Prop({ type: String, required: true, enum: ['committed'] })
  status!: 'committed'

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  result!: unknown

  createdAt!: Date
  updatedAt!: Date
}

export type McpMutationReceiptDocument = HydratedDocument<McpMutationReceiptEntity>
export const McpMutationReceiptSchema = SchemaFactory.createForClass(McpMutationReceiptEntity)
McpMutationReceiptSchema.index({ userId: 1, tool: 1, idempotencyKey: 1 }, { unique: true })
