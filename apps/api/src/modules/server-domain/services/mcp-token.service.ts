import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { McpCredentialRepository } from '../repositories/mcp-credential.repository'
import { UserRepository } from '../repositories/user.repository'
import type { CreatedMcpToken, McpTokenContext, McpTokenMetadata } from '../types/mcp-token.types'

const TOKEN_PREFIX = 'eotion_mcp_'
const TOKEN_PATTERN = /^eotion_mcp_[A-Za-z0-9_-]{43}$/

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function isCanonicalToken(token: string): boolean {
  if (!TOKEN_PATTERN.test(token)) return false
  const encoded = token.slice(TOKEN_PREFIX.length)
  const decoded = Buffer.from(encoded, 'base64url')
  return decoded.length === 32 && decoded.toString('base64url') === encoded
}

@Injectable()
export class McpTokenService {
  constructor(private readonly credentials: McpCredentialRepository, private readonly users: UserRepository) {}

  async create(userId: string, name: string): Promise<CreatedMcpToken> {
    if (typeof name !== 'string') throw new BadRequestException('Invalid token name')
    const normalizedName = name.trim()
    if (normalizedName.length < 1 || normalizedName.length > 64) throw new BadRequestException('Invalid token name')
    if (!(await this.users.existsById(userId))) throw new UnauthorizedException('Authentication required')

    const token = `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`
    const createdAt = new Date()
    const id = randomUUID()
    await this.credentials.create({
      id,
      userId,
      name: normalizedName,
      tokenHash: tokenHash(token),
      createdAt,
      lastUsedAt: null,
      revokedAt: null,
    })

    return {
      token,
      credential: { id, name: normalizedName, createdAt: createdAt.toISOString(), lastUsedAt: null },
    }
  }

  async list(userId: string): Promise<McpTokenMetadata[]> {
    if (!(await this.users.existsById(userId))) throw new UnauthorizedException('Authentication required')
    return (await this.credentials.listActiveByUserId(userId)).map((credential) => ({
      id: credential.id,
      name: credential.name,
      createdAt: credential.createdAt.toISOString(),
      lastUsedAt: credential.lastUsedAt?.toISOString() ?? null,
    }))
  }

  async resolve(token: string): Promise<McpTokenContext | null> {
    if (!isCanonicalToken(token)) return null
    const credential = await this.credentials.findByTokenHash(tokenHash(token))
    if (!credential || credential.revokedAt !== null) return null
    if (!(await this.users.existsById(credential.userId))) return null
    if (!(await this.credentials.touchIfActive(credential.id, new Date()))) return null
    return { userId: credential.userId }
  }

  async revoke(userId: string, id: string): Promise<void> {
    await this.credentials.revokeByIdAndUserId(id, userId, new Date())
  }
}
