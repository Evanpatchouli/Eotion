import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import type { HydratedDocument } from 'mongoose'

@Schema({ collection: 'database_view_order_overrides', versionKey: false })
export class DatabaseViewOrderOverrideEntity {
  @Prop({ type: String, required: true }) workspaceId!: string
  @Prop({ type: String, required: true }) databaseId!: string
  @Prop({ type: String, required: true }) orderScopeId!: string
  @Prop({ type: String, required: true }) recordId!: string
  @Prop({ type: Number, required: true, min: 1 }) sourceCreationOrdinal!: number
  @Prop({ type: Object, required: true }) joinKey!: { workspaceId: string; databaseId: string; orderScopeId: string; recordId: string }
  @Prop({ type: Number, required: true, min: 0 }) slotOrdinal!: number
  @Prop({ type: String, required: true, maxlength: 1_048_576, match: /^[01]*1$/u }) rank!: string
}

export type DatabaseViewOrderOverrideDocument = HydratedDocument<DatabaseViewOrderOverrideEntity>
export const DatabaseViewOrderOverrideSchema = SchemaFactory.createForClass(DatabaseViewOrderOverrideEntity)
export const DATABASE_VIEW_ORDER_SOURCE_RECORD_INDEX = 'view_order_source_record_cover'
DatabaseViewOrderOverrideSchema.index({ workspaceId: 1, databaseId: 1, orderScopeId: 1, recordId: 1 }, { unique: true, collation: { locale: 'simple' } })
DatabaseViewOrderOverrideSchema.index({ joinKey: 1 }, { unique: true, collation: { locale: 'simple' } })
DatabaseViewOrderOverrideSchema.index({ workspaceId: 1, databaseId: 1, orderScopeId: 1, sourceCreationOrdinal: 1 }, { unique: true, collation: { locale: 'simple' } })
DatabaseViewOrderOverrideSchema.index({ workspaceId: 1, databaseId: 1, orderScopeId: 1, sourceCreationOrdinal: 1, recordId: 1 },
  { name: DATABASE_VIEW_ORDER_SOURCE_RECORD_INDEX, collation: { locale: 'simple' } })
DatabaseViewOrderOverrideSchema.index({ workspaceId: 1, databaseId: 1, orderScopeId: 1, slotOrdinal: 1, rank: 1 }, { unique: true, collation: { locale: 'simple' } })
DatabaseViewOrderOverrideSchema.index({ workspaceId: 1, databaseId: 1, recordId: 1, orderScopeId: 1 }, { collation: { locale: 'simple' } })

@Schema({ collection: 'database_view_order_cleanup_jobs', timestamps: true, versionKey: false })
export class DatabaseViewOrderCleanupJobEntity {
  @Prop({ type: String, required: true }) workspaceId!: string
  @Prop({ type: String, required: true }) databaseId!: string
  @Prop({ type: String, required: true }) orderScopeId!: string
  createdAt!: Date
  updatedAt!: Date
}

export type DatabaseViewOrderCleanupJobDocument = HydratedDocument<DatabaseViewOrderCleanupJobEntity>
export const DatabaseViewOrderCleanupJobSchema = SchemaFactory.createForClass(DatabaseViewOrderCleanupJobEntity)
DatabaseViewOrderCleanupJobSchema.index({ workspaceId: 1, databaseId: 1, orderScopeId: 1 }, { unique: true, collation: { locale: 'simple' } })
