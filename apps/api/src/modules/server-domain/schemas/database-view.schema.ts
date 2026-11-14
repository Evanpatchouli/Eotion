import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'
import { DATABASE_VIEW_TYPES, type DatabaseViewConfig, type DatabaseViewType } from '@eotion/domain'

@Schema({ collection: 'database_views', timestamps: true, versionKey: false })
export class DatabaseViewEntity {
  @Prop({ type: String, required: true, unique: true }) id!: string
  @Prop({ type: String, required: true }) workspaceId!: string
  @Prop({ type: String, required: true }) databaseId!: string
  @Prop({ type: String, required: true }) name!: string
  @Prop({ type: String, required: true, enum: DATABASE_VIEW_TYPES }) type!: DatabaseViewType
  @Prop({ type: Object, required: false }) config?: DatabaseViewConfig
  @Prop({ type: Number, required: true, default: 1 }) version!: number
  @Prop({ type: Number, required: true, default: 0 }) referenceFence!: number
  @Prop({ type: String, required: true }) orderScopeId!: string
  @Prop({ type: Boolean, required: true, default: false }) manualOrderActive!: boolean
  createdAt!: Date
  updatedAt!: Date
}

export type DatabaseViewDocument = HydratedDocument<DatabaseViewEntity>
export const DatabaseViewSchema = SchemaFactory.createForClass(DatabaseViewEntity)
DatabaseViewSchema.index({ workspaceId: 1, databaseId: 1, id: 1 })
DatabaseViewSchema.index({ workspaceId: 1, databaseId: 1, orderScopeId: 1 }, { unique: true, partialFilterExpression: { orderScopeId: { $exists: true } } })
