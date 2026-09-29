import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

@Schema({ collection: 'filemetadatas', timestamps: true, versionKey: false })
export class FileMetadataEntity {
  @Prop({ type: String, required: true, unique: true })
  id!: string

  @Prop({ type: String, required: true })
  workspaceId!: string

  @Prop({ type: String, required: true })
  ownerId!: string

  @Prop({ type: String, required: true })
  name!: string

  @Prop({ type: String, required: true })
  mimeType!: string

  @Prop({ type: Number, required: true, min: 0 })
  size!: number

  @Prop({ type: String, required: true })
  objectKey!: string

  @Prop({ type: String })
  url?: string

  createdAt!: Date
  updatedAt!: Date
}

export type FileMetadataDocument = HydratedDocument<FileMetadataEntity>
export const FileMetadataSchema = SchemaFactory.createForClass(FileMetadataEntity)
FileMetadataSchema.index({ workspaceId: 1 })
