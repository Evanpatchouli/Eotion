import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { randomUUID } from 'node:crypto'
import { ClientSession, Model } from 'mongoose'
import type { UserRecord } from '../types'
import { UserDocument, UserEntity } from '../schemas/user.schema'

type UserAuthenticationRecord = { user: UserRecord; passwordHash: string; credentialVersion: number }

@Injectable()
export class UserRepository {
  constructor(@InjectModel(UserEntity.name) private readonly model: Model<UserDocument>) {}

  async create(email: string, passwordHash: string): Promise<UserRecord> {
    return this.toRecord(await this.model.create({ id: randomUUID(), email, passwordHash }))
  }

  async existsById(id: string): Promise<boolean> {
    return (await this.model.exists({ id })) !== null
  }

  async findAuthenticationByEmail(email: string): Promise<UserAuthenticationRecord | null> {
    const doc = await this.model.findOne({ email }).select('+passwordHash +credentialVersion').exec()
    return doc ? { user: this.toRecord(doc), passwordHash: doc.passwordHash, credentialVersion: doc.credentialVersion ?? 0 } : null
  }

  async findAuthenticationById(id: string): Promise<UserAuthenticationRecord | null> {
    const doc = await this.model.findOne({ id }).select('+passwordHash +credentialVersion').exec()
    return doc ? { user: this.toRecord(doc), passwordHash: doc.passwordHash, credentialVersion: doc.credentialVersion ?? 0 } : null
  }

  async findCredentialVersionById(id: string): Promise<number | null> {
    const doc = await this.model.findOne({ id }).select('+credentialVersion').exec()
    return doc ? doc.credentialVersion ?? 0 : null
  }

  async findById(id: string): Promise<UserRecord | null> {
    const doc = await this.model.findOne({ id }).exec()
    return doc ? this.toRecord(doc) : null
  }

  async updateDisplayName(id: string, displayName: string): Promise<UserRecord | null> {
    const doc = await this.model.findOneAndUpdate({ id }, { $set: { displayName } }, { returnDocument: 'after', runValidators: true }).exec()
    return doc ? this.toRecord(doc) : null
  }

  async updatePasswordHash(id: string, previousHash: string, passwordHash: string, session: ClientSession): Promise<boolean> {
    const result = await this.model.updateOne({ id, passwordHash: previousHash }, { $set: { passwordHash }, $inc: { credentialVersion: 1 } }, { session }).exec()
    return result.modifiedCount === 1
  }

  private toRecord(doc: UserDocument): UserRecord {
    return {
      id: doc.id,
      email: doc.email,
      displayName: doc.displayName?.trim() || doc.email.split('@')[0]!.slice(0, 64),
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    }
  }
}
