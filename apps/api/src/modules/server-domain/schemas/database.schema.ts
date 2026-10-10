import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

@Schema({ collection: 'databases', timestamps: true, versionKey: false })
export class DatabaseEntity {
  @Prop({ type: String, required: true, unique: true }) id!: string
  @Prop({ type: String, required: true }) workspaceId!: string
  @Prop({ type: String, required: true }) name!: string
  @Prop({ type: Number, required: true, default: 1 }) version!: number
  @Prop({ type: Number, required: true, default: 0 }) advancedReferenceFence!: number
  createdAt!: Date
  updatedAt!: Date
}

export type DatabaseDocument = HydratedDocument<DatabaseEntity>
export const DatabaseSchema = SchemaFactory.createForClass(DatabaseEntity)
DatabaseSchema.index({ workspaceId: 1, id: 1 })
