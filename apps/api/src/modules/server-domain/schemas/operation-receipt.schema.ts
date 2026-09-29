import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import type { HydratedDocument } from 'mongoose'

@Schema({ collection: 'operation_receipts', versionKey: false })
export class OperationReceiptEntity {
  @Prop({ type: String, required: true })
  userId!: string

  @Prop({ type: String, required: true })
  workspaceId!: string

  @Prop({ type: String, required: true })
  id!: string

  @Prop({ type: String, required: true })
  fingerprint!: string

  @Prop({ type: String, required: true })
  clientId!: string

  @Prop({ type: Number, required: true })
  sequence!: number

  @Prop({ type: String, required: true })
  kind!: string

  @Prop({ type: Date, required: true })
  appliedAt!: Date
}

export type OperationReceiptDocument = HydratedDocument<OperationReceiptEntity>
export const OperationReceiptSchema = SchemaFactory.createForClass(OperationReceiptEntity)
OperationReceiptSchema.index({ userId: 1, id: 1 }, { unique: true })
