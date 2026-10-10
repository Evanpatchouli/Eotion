import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

@Schema({ collection: 'pages', timestamps: true, versionKey: false })
export class PageEntity {
  @Prop({ type: String, required: true, unique: true })
  id!: string

  @Prop({ type: String, required: true })
  workspaceId!: string

  @Prop({ type: String, default: null })
  parentPageId!: string | null

  @Prop({ type: String, required: true })
  title!: string

  @Prop({ type: String })
  icon?: string

  @Prop({ type: String, enum: ['database-record'] })
  role?: 'database-record'

  @Prop({ type: String, required: true })
  orderKey!: string

  @Prop({ type: Number, default: 0 })
  structureFence!: number

  createdAt!: Date
  updatedAt!: Date
}

export type PageDocument = HydratedDocument<PageEntity>
export const PageSchema = SchemaFactory.createForClass(PageEntity)
PageSchema.index({ workspaceId: 1, parentPageId: 1, orderKey: 1, id: 1 })
PageSchema.index({ workspaceId: 1, id: 1 })
