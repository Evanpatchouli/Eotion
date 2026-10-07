import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

@Schema({ collection: 'database_properties', timestamps: true, versionKey: false })
export class DatabasePropertyEntity {
  @Prop({ type: String, required: true, unique: true }) id!: string
  @Prop({ type: String, required: true }) workspaceId!: string
  @Prop({ type: String, required: true }) databaseId!: string
  @Prop({ type: String, required: true }) name!: string
  @Prop({ type: String, required: true, enum: ['title', 'text', 'number', 'checkbox', 'select', 'date'] }) type!: string
  @Prop({ type: [{ id: String, name: String }], default: undefined }) options?: { id: string; name: string }[]
  @Prop({ type: Number, required: true, default: 1 }) version!: number
  createdAt!: Date
  updatedAt!: Date
}

export type DatabasePropertyDocument = HydratedDocument<DatabasePropertyEntity>
export const DatabasePropertySchema = SchemaFactory.createForClass(DatabasePropertyEntity)
DatabasePropertySchema.index({ workspaceId: 1, databaseId: 1, id: 1 })
DatabasePropertySchema.index({ databaseId: 1, type: 1 }, { unique: true, partialFilterExpression: { type: 'title' } })
