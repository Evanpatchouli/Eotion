import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

@Schema({ collection: 'sessions', timestamps: true, versionKey: false })
export class SessionEntity {
  @Prop({ type: String, required: true, unique: true })
  id!: string

  @Prop({ type: String, required: true })
  userId!: string

  @Prop({ type: String, required: true, unique: true, select: false })
  tokenHash!: string

  @Prop({ type: Date, required: true })
  expiresAt!: Date

  @Prop({ type: Date, default: null })
  revokedAt!: Date | null

  createdAt!: Date
  updatedAt!: Date
}

export type SessionDocument = HydratedDocument<SessionEntity>
export const SessionSchema = SchemaFactory.createForClass(SessionEntity)
SessionSchema.index({ userId:  1 })
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
