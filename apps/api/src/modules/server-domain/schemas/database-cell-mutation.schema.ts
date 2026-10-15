import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import type { HydratedDocument } from 'mongoose'

@Schema({ collection: 'database_cell_mutation_receipts', timestamps: true, versionKey: false })
export class DatabaseCellMutationReceiptEntity {
  @Prop({ type: String, required: true }) userId!: string
  @Prop({ type: String, required: true }) workspaceId!: string
  @Prop({ type: String, required: true }) databaseId!: string
  @Prop({ type: String, required: true }) mutationId!: string
  @Prop({ type: String, required: true }) requestHash!: string
  @Prop({ type: String, required: true, enum: ['pending', 'committed', 'not_committed'] }) status!: 'pending' | 'committed' | 'not_committed'
  createdAt!: Date
  updatedAt!: Date
}

export type DatabaseCellMutationReceiptDocument = HydratedDocument<DatabaseCellMutationReceiptEntity>
export const DatabaseCellMutationReceiptSchema = SchemaFactory.createForClass(DatabaseCellMutationReceiptEntity)
DatabaseCellMutationReceiptSchema.index({ userId: 1, workspaceId: 1, databaseId: 1, mutationId: 1 }, { unique: true })
