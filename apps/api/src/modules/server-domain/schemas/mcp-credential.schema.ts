import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

@Schema({ collection: 'mcp_credentials', versionKey: false })
export class McpCredentialEntity {
  @Prop({ type: String, required: true, unique: true })
  id!: string

  @Prop({ type: String, required: true })
  userId!: string

  @Prop({ type: String, required: true })
  name!: string

  @Prop({ type: String, required: true, unique: true, select: false })
  tokenHash!: string

  @Prop({ type: Date, required: true })
  createdAt!: Date

  @Prop({ type: Date, default: null })
  lastUsedAt!: Date | null

  @Prop({ type: Date, default: null })
  revokedAt!: Date | null
}

export type McpCredentialDocument = HydratedDocument<McpCredentialEntity>
export const McpCredentialSchema = SchemaFactory.createForClass(McpCredentialEntity)
McpCredentialSchema.index({ userId: 1 })
