import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { SessionDocument, SessionEntity } from '../schemas/session.schema'

export interface SessionRecord {
  id: string
  userId: string
  tokenHash: string
  expiresAt: Date
  revokedAt: Date | null
}

@Injectable()
export class SessionRepository {
  constructor(@InjectModel(SessionEntity.name) private readonly model: Model<SessionDocument>) {}

  async create(record: SessionRecord): Promise<void> {
    await this.model.create(record)
  }

  async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const doc = await this.model.findOne({ tokenHash }).select('+tokenHash').exec()
    return doc
      ? { id: doc.id, userId: doc.userId, tokenHash: doc.tokenHash, expiresAt: doc.expiresAt, revokedAt: doc.revokedAt }
      : null
  }

  async revokeByTokenHash(tokenHash: string, revokedAt: Date): Promise<void> {
    await this.model.updateOne({ tokenHash, revokedAt: null }, { $set: { revokedAt } }).exec()
  }
}
