import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'
import type { DatabaseViewConfig } from '@eotion/domain'

@Schema({ collection: 'database_views', timestamps: true, versionKey: false })
export class DatabaseViewEntity {
  @Prop({ type: String, required: true, unique: true }) id!: string
  @Prop({ type: String, required: true }) workspaceId!: string
  @Prop({ type: String, required: true }) databaseId!: string
  @Prop({ type: String, required: true }) name!: string
  @Prop({ type: String, required: true, enum: ['table'] }) type!: 'table'
  @Prop({ type: Object, required: false }) config?: DatabaseViewConfig
  @Prop({ type: Number, required: true, default: 1 }) version!: number
  @Prop({ type: Number, required: true, default: 0 }) referenceFence!: number
  createdAt!: Date
  updatedAt!: Date
}

export type DatabaseViewDocument = HydratedDocument<DatabaseViewEntity>
export const DatabaseViewSchema = SchemaFactory.createForClass(DatabaseViewEntity)
DatabaseViewSchema.index({ workspaceId: 1, databaseId: 1, id: 1 })
