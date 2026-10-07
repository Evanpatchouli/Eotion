import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

@Schema({ collection: 'database_records', timestamps: true, versionKey: false })
export class DatabaseRecordEntity {
  @Prop({ type: String, required: true, unique: true }) id!: string
  @Prop({ type: String, required: true }) workspaceId!: string
  @Prop({ type: String, required: true }) databaseId!: string
  @Prop({ type: String, required: true }) pageId!: string
  @Prop({ type: Object, required: true, default: {} }) properties!: Record<string, string | number | boolean | null>
  @Prop({ type: Number, required: true, default: 1 }) version!: number
  createdAt!: Date
  updatedAt!: Date
}

export type DatabaseRecordDocument = HydratedDocument<DatabaseRecordEntity>
export const DatabaseRecordSchema = SchemaFactory.createForClass(DatabaseRecordEntity)
DatabaseRecordSchema.index({ workspaceId: 1, databaseId: 1, id: 1 })
DatabaseRecordSchema.index({ workspaceId: 1, pageId: 1 })
