import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'
import type { DatabaseRecordValues } from '@eotion/domain'

@Schema({ collection: 'database_records', timestamps: true, versionKey: false })
export class DatabaseRecordEntity {
  @Prop({ type: String, required: true, unique: true }) id!: string
  @Prop({ type: String, required: true }) workspaceId!: string
  @Prop({ type: String, required: true }) databaseId!: string
  @Prop({ type: String, required: true }) pageId!: string
  @Prop({ type: Object, required: true, default: {} }) properties!: DatabaseRecordValues
  @Prop({ type: [{ _id: false, p: { type: String, required: true }, v: { type: String, required: true } }], default: undefined }) queryTokens?: { p: string; v: string }[]
  @Prop({ type: Number }) queryTokenSourceVersion?: number
  @Prop({ type: Number, required: true, default: 1 }) version!: number
  @Prop({ type: Number, required: true, min: 1 }) creationOrdinal!: number
  createdAt!: Date
  updatedAt!: Date
}

export type DatabaseRecordDocument = HydratedDocument<DatabaseRecordEntity>
export const DatabaseRecordSchema = SchemaFactory.createForClass(DatabaseRecordEntity)
DatabaseRecordSchema.index({ workspaceId: 1, databaseId: 1, id: 1 })
DatabaseRecordSchema.index({ workspaceId: 1, pageId: 1 })
DatabaseRecordSchema.index({ workspaceId: 1, databaseId: 1, creationOrdinal: 1 }, { unique: true, partialFilterExpression: { creationOrdinal: { $type: 'number' } } })
DatabaseRecordSchema.index({ workspaceId: 1, databaseId: 1, creationOrdinal: 1, id: 1 })
DatabaseRecordSchema.index({ workspaceId: 1, databaseId: 1, 'queryTokens.p': 1, 'queryTokens.v': 1, creationOrdinal: 1, id: 1 }, { collation: { locale: 'simple' } })
