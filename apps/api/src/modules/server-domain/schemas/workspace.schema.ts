import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

@Schema({ collection: 'workspaces', timestamps: true, versionKey: false })
export class WorkspaceEntity {
  @Prop({ type: String, required: true, unique: true })
  id!: string

  @Prop({ type: String, required: true })
  name!: string

  @Prop({ type: String, required: true })
  ownerId!: string

  createdAt!: Date
  updatedAt!: Date
}

export type WorkspaceDocument = HydratedDocument<WorkspaceEntity>
export const WorkspaceSchema = SchemaFactory.createForClass(WorkspaceEntity)
WorkspaceSchema.index({ ownerId: 1 })
