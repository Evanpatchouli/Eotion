import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { InjectConnection, InjectModel } from '@nestjs/mongoose'
import type { SyncOperation } from '@eotion/contracts'
import type { WorkspaceSnapshotResponse } from '@eotion/contracts'
import { createHash } from 'node:crypto'
import type { ClientSession, Connection, Model } from 'mongoose'

import { OperationReceiptEntity, type OperationReceiptDocument } from '../schemas/operation-receipt.schema'
import { BlockService } from './block.service'
import { PageService } from './page.service'
import { WorkspacePermissionService } from './workspace-permission.service'

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

@Injectable()
export class SyncService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(OperationReceiptEntity.name) private readonly receipts: Model<OperationReceiptDocument>,
    private readonly pages: PageService,
    private readonly blocks: BlockService,
    private readonly permissions: WorkspacePermissionService,
  ) {}

  async snapshot(userId: string, workspaceId: string): Promise<WorkspaceSnapshotResponse> {
    await this.permissions.assertCanRead(userId, workspaceId)
    const [pages, blocks] = await Promise.all([
      this.pages.list(userId, workspaceId),
      this.blocks.listByWorkspace(userId, workspaceId),
    ])
    return { pages, blocks }
  }

  async apply(userId: string, operation: SyncOperation): Promise<{ id: string; applied: true }> {
    const { workspaceId, id } = operation
    await this.permissions.assertCanWrite(userId, workspaceId)
    await this.receipts.init()
    const fingerprint = createHash('sha256').update(canonical(operation)).digest('hex')
    const key = { userId, id }
    const checkReceipt = async (): Promise<boolean> => {
      const receipt = await this.receipts.findOne(key).lean().exec()
      if (!receipt) return false
      if (receipt.fingerprint !== fingerprint) throw new ConflictException('Operation ID already used with different content')
      return true
    }
    if (await checkReceipt()) return { id, applied: true }

    const session = await this.connection.startSession()
    try {
      try {
        await session.withTransaction(async () => {
          await this.receipts.create([{ ...key, workspaceId, fingerprint, clientId: operation.clientId, sequence: operation.sequence, kind: operation.kind, appliedAt: new Date() }], { session })
          await this.applyMutation(userId, operation, session)
        })
      } catch (error) {
        // A concurrent request may have committed the same receipt. A business
        // resource unique conflict has no receipt and must retain its error.
        if (isTransactionUnsupported(error)) {
          throw new ServiceUnavailableException('Sync requires MongoDB replica set transactions')
        }
        if (!isDuplicateKey(error) || !(await checkReceipt())) throw error
      }
      return { id, applied: true }
    } finally {
      await session.endSession()
    }
  }

  private async applyMutation(userId: string, operation: SyncOperation, session: ClientSession): Promise<void> {
    switch (operation.kind) {
      case 'page.upsert':
        await this.pages.upsertSnapshot(userId, operation.workspaceId, operation.payload, session)
        break
      case 'page.delete':
        await this.pages.delete(userId, operation.workspaceId, operation.payload.id, session)
        break
      case 'page.move':
        if (!(await this.pages.move(userId, operation.workspaceId, operation.payload.id, operation.payload, session))) {
          throw new NotFoundException('Page not found in workspace')
        }
        break
      case 'block.upsert':
        await this.blocks.upsertSnapshot(userId, operation.workspaceId, operation.payload, session)
        break
      case 'block.delete':
        await this.blocks.delete(userId, operation.workspaceId, operation.payload.id, session)
        break
    }
  }
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000
}

function isTransactionUnsupported(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  if ('message' in error && typeof error.message === 'string' && error.message.includes('Transaction numbers are only allowed')) return true
  if ('originalError' in error && isTransactionUnsupported(error.originalError)) return true
  return 'errorResponse' in error && isTransactionUnsupported(error.errorResponse)
}
