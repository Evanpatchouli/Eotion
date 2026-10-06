import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import type { ClientSession, Model } from 'mongoose'

import { McpMutationReceiptDocument, McpMutationReceiptEntity } from '../schemas/mcp-mutation.schema'

export type McpMutationTool = 'eotion_create_page' | 'eotion_update_page'

export interface McpMutationReceiptRecord<T = unknown> {
  id: string
  userId: string
  tool: McpMutationTool
  idempotencyKey: string
  requestHash: string
  status: 'committed'
  result: T
}

@Injectable()
export class McpMutationRepository {
  constructor(@InjectModel(McpMutationReceiptEntity.name) private readonly model: Model<McpMutationReceiptDocument>) {}

  /** Ensure the unique idempotency index is ready before any mutation starts. */
  async ensureReady(): Promise<void> {
    await this.model.init()
  }

  async find(key: Pick<McpMutationReceiptRecord, 'userId' | 'tool' | 'idempotencyKey'>, session?: ClientSession): Promise<McpMutationReceiptRecord | null> {
    const doc = await this.model.findOne(key).session(session ?? null).lean().exec()
    if (!doc) return null
    return {
      id: doc.id,
      userId: doc.userId,
      tool: doc.tool,
      idempotencyKey: doc.idempotencyKey,
      requestHash: doc.requestHash,
      status: doc.status,
      result: doc.result,
    }
  }

  async create<T>(record: McpMutationReceiptRecord<T>, session: ClientSession): Promise<void> {
    await this.model.create([record], { session })
  }
}
