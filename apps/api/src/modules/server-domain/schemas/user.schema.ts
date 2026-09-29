import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

@Schema({ collection: 'users', timestamps: true, versionKey: false })
export class UserEntity {
  @Prop({ type: String, required: true, unique: true })
  id!: string

  @Prop({ type: String, required: true, unique: true, lowercase: true, trim: true })
  email!: string

  @Prop({ type: String, required: true, select: false })
  passwordHash!: string

  createdAt!: Date
  updatedAt!: Date
}

export type UserDocument = HydratedDocument<UserEntity>
export const UserSchema = SchemaFactory.createForClass(UserEntity)
