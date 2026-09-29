import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { UserRecord } from '../types'
import { UserRepository } from '../repositories/user.repository'
import { SessionRepository } from '../repositories/session.repository'
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password.util'

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function isValidEmail(email: string): boolean {
  const atIndex = email.indexOf('@')
  return atIndex > 0 && atIndex === email.lastIndexOf('@') && atIndex < email.length - 1 && !/\s/.test(email)
}

@Injectable()
export class AuthService {
  constructor(private readonly users: UserRepository, private readonly sessions: SessionRepository) {}

  async register(email: string, password: string): Promise<UserRecord> {
    const normalizedEmail = normalizeEmail(email)
    if (!isValidEmail(normalizedEmail)) throw new BadRequestException('Invalid email')
    if (password.length === 0) throw new BadRequestException('Password must not be empty')

    const passwordHash = await hashPassword(password)
    try {
      return await this.users.create(normalizedEmail, passwordHash)
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
        throw new ConflictException('An account with this email already exists')
      }
      throw new InternalServerErrorException('Unable to register account')
    }
  }

  async authenticate(email: string, password: string): Promise<UserRecord> {
    const normalizedEmail = normalizeEmail(email)
    const authRecord = normalizedEmail ? await this.users.findAuthenticationByEmail(normalizedEmail) : null
    const passwordMatches = await verifyPassword(password, authRecord?.passwordHash ?? DUMMY_PASSWORD_HASH)
    if (!authRecord || !passwordMatches) {
      throw new UnauthorizedException('Invalid credentials')
    }
    return authRecord.user
  }

  async login(email: string, password: string): Promise<{ token: string; expiresAt: Date }> {
    const user = await this.authenticate(email, password)
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS)
    await this.sessions.create({
      id: randomUUID(),
      userId: user.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt,
      revokedAt: null,
    })
    return { token, expiresAt }
  }
}
