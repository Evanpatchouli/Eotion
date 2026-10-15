import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import type { ClientSession, Model } from 'mongoose'
import { DatabaseCellMutationReceiptEntity, type DatabaseCellMutationReceiptDocument } from '../schemas/database-cell-mutation.schema'

export type DatabaseCellMutationReceiptKey = Pick<DatabaseCellMutationReceiptEntity, 'userId' | 'workspaceId' | 'databaseId' | 'mutationId'>

@Injectable()
export class DatabaseCellMutationRepository {
  constructor(@InjectModel(DatabaseCellMutationReceiptEntity.name) private readonly model: Model<DatabaseCellMutationReceiptDocument>) {}

  async ensureReady(): Promise<void> { await this.model.init() }

  async find(key: DatabaseCellMutationReceiptKey): Promise<Pick<DatabaseCellMutationReceiptEntity, 'requestHash' | 'status'> | null> {
    const doc = await this.model.findOne(key).lean().exec()
    return doc ? { requestHash: doc.requestHash, status: doc.status } : null
  }

  async reserve(key: DatabaseCellMutationReceiptKey, requestHash: string): Promise<void> {
    await this.model.create({ ...key, requestHash, status: 'pending' })
  }

  async commit(key: DatabaseCellMutationReceiptKey, requestHash: string, session: ClientSession): Promise<boolean> {
    return !!await this.model.findOneAndUpdate({ ...key, requestHash, status: 'pending' }, { $set: { status: 'committed' } }, { session, returnDocument: 'after' }).exec()
  }

  async fail(key: DatabaseCellMutationReceiptKey, requestHash: string): Promise<void> {
    await this.model.updateOne({ ...key, requestHash, status: 'pending' }, { $set: { status: 'not_committed' } }).exec()
  }
}
