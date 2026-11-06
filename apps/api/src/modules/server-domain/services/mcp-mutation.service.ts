import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { InjectConnection } from '@nestjs/mongoose'
import { createHash, randomUUID } from 'node:crypto'
import type { ClientSession, Connection } from 'mongoose'

import { McpMutationRepository, type McpMutationReceiptRecord, type McpMutationTool } from '../repositories/mcp-mutation.repository'
import { supportsTransactions } from './mongo-transactions'

type MutationKey = Pick<McpMutationReceiptRecord, 'userId' | 'tool' | 'idempotencyKey'>
type AccessCheck = (session?: ClientSession) => Promise<void>

function canonical(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new BadRequestException('Mutation request is not JSON serializable')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map((item) => item === undefined ? 'null' : canonical(item)).join(',')}]`
  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  }
  throw new BadRequestException('Mutation request is not JSON serializable')
}

function requestHash(tool: McpMutationTool, payload: unknown): string {
  return createHash('sha256').update(canonical({ tool, payload })).digest('hex')
}

function hasLabel(error: unknown, label: string): boolean {
  return typeof error === 'object' && error !== null
    && 'hasErrorLabel' in error && typeof error.hasErrorLabel === 'function'
    && error.hasErrorLabel(label)
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

@Injectable()
export class McpMutationService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly receipts: McpMutationRepository,
  ) {}

  async execute<T>(userId: string, tool: McpMutationTool, idempotencyKey: string, payload: unknown,
    assertAccess: AccessCheck, operation: (session: ClientSession) => Promise<T>): Promise<T> {
    const hash = requestHash(tool, payload)
    const key: MutationKey = { userId, tool, idempotencyKey }
    await this.receipts.ensureReady()
    if (!(await supportsTransactions(this.connection))) {
      throw new ServiceUnavailableException('MCP mutations require MongoDB replica set transactions')
    }

    const session = await this.connection.startSession()
    try {
      try {
        let result!: T
        await session.withTransaction(async () => {
          await assertAccess(session)
          const replay = await this.receipts.find(key, session)
          if (replay) {
            if (replay.requestHash !== hash) throw new ConflictException('Idempotency key already used with different content')
            result = replay.result as T
            return
          }
          result = await operation(session)
          await this.receipts.create({ id: randomUUID(), ...key, requestHash: hash, status: 'committed', result }, session)
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } })
        return result
      } catch (error) {
        if (hasLabel(error, 'UnknownTransactionCommitResult')) {
          throw new ServiceUnavailableException('MCP mutation commit outcome is unconfirmed; retry with the original idempotency key and payload')
        }
        if (isTransactionUnsupported(error)) throw new ServiceUnavailableException('MCP mutations require MongoDB replica set transactions')
        if (!isDuplicateKey(error)) throw error
        await assertAccess()
        const receipt = await this.receipts.find(key)
        if (!receipt) throw error
        if (receipt.requestHash !== hash) throw new ConflictException('Idempotency key already used with different content')
        return receipt.result as T
      }
    } finally {
      await session.endSession()
    }
  }
}
