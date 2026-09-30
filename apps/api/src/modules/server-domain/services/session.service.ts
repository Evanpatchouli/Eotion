import { Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { SessionRepository } from '../repositories/session.repository'
import { UserRepository } from '../repositories/user.repository'
import type { UserRecord } from '../types'

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function isValidToken(token: string): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false
  const decoded = Buffer.from(token, 'base64url')
  return decoded.length === 32 && decoded.toString('base64url') === token
}

@Injectable()
export class SessionService {
  constructor(private readonly sessions: SessionRepository, private readonly users: UserRepository) {}

  async resolve(token: string): Promise<UserRecord | null> {
    if (!isValidToken(token)) return null
    const session = await this.sessions.findByTokenHash(tokenHash(token))
    if (!session || session.revokedAt !== null || session.expiresAt.getTime() <= Date.now()) return null
    if ((await this.users.findCredentialVersionById(session.userId)) !== session.credentialVersion) return null
    return this.users.findById(session.userId)
  }

  async revoke(token: string): Promise<void> {
    if (!isValidToken(token)) return
    await this.sessions.revokeByTokenHash(tokenHash(token), new Date())
  }
}
