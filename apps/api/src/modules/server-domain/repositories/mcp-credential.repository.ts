import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { McpCredentialDocument, McpCredentialEntity } from '../schemas/mcp-credential.schema'

export interface McpCredentialRecord {
  id: string
  userId: string
  name: string
  tokenHash: string
  createdAt: Date
  lastUsedAt: Date | null
  revokedAt: Date | null
}

@Injectable()
export class McpCredentialRepository {
  constructor(@InjectModel(McpCredentialEntity.name) private readonly model: Model<McpCredentialDocument>) {}

  async create(record: McpCredentialRecord): Promise<void> {
    await this.model.create(record)
  }

  async findByTokenHash(tokenHash: string): Promise<McpCredentialRecord | null> {
    const doc = await this.model.findOne({ tokenHash }).select('+tokenHash').exec()
    return doc
      ? {
          id: doc.id,
          userId: doc.userId,
          name: doc.name,
          tokenHash: doc.tokenHash,
          createdAt: doc.createdAt,
          lastUsedAt: doc.lastUsedAt,
          revokedAt: doc.revokedAt,
        }
      : null
  }

  async touchIfActive(id: string, lastUsedAt: Date): Promise<boolean> {
    const result = await this.model.updateOne({ id, revokedAt: null }, { $set: { lastUsedAt } }).exec()
    return result.matchedCount === 1
  }

  async revokeByIdAndUserId(id: string, userId: string, revokedAt: Date): Promise<void> {
    await this.model.updateOne({ id, userId, revokedAt: null }, { $set: { revokedAt } }).exec()
  }
}
