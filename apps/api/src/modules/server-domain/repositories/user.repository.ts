import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { randomUUID } from 'node:crypto'
import { Model } from 'mongoose'
import type { UserRecord } from '../types'
import { UserDocument, UserEntity } from '../schemas/user.schema'

type UserAuthenticationRecord = { user: UserRecord; passwordHash: string }

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
    const doc = await this.model.findOne({ email }).select('+passwordHash').exec()
    return doc ? { user: this.toRecord(doc), passwordHash: doc.passwordHash } : null
  }

  async findById(id: string): Promise<UserRecord | null> {
    const doc = await this.model.findOne({ id }).exec()
    return doc ? this.toRecord(doc) : null
  }

  private toRecord(doc: UserDocument): UserRecord {
    return { id: doc.id, email: doc.email, createdAt: doc.createdAt.toISOString(), updatedAt: doc.updatedAt.toISOString() }
  }
}
