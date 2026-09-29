import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { SessionService } from '../server-domain/services/session.service'
import type { UserRecord } from '../server-domain/types'

export const SESSION_COOKIE = 'eotion_session'
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export function readSessionCookie(header: string | undefined): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0 || part.slice(0, separator).trim() !== SESSION_COOKIE) continue
    const value = part.slice(separator + 1).trim()
    return TOKEN_PATTERN.test(value) ? value : null
  }
  return null
}

export function serializeSessionCookie(token: string, expiresAt: Date): string {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${SESSION_COOKIE}=${token}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Expires=${expiresAt.toUTCString()}${secure}`
}

export function clearSessionCookie(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${SESSION_COOKIE}=; Path=/api; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`
}

export interface AuthenticatedRequest extends FastifyRequest {
  authenticatedUser?: UserRecord
  sessionToken?: string
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const token = readSessionCookie(request.headers.cookie)
    const user = token ? await this.sessions.resolve(token) : null
    if (!token || !user) throw new UnauthorizedException('Authentication required')
    request.sessionToken = token
    request.authenticatedUser = user
    return true
  }
}

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): UserRecord => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
  if (!request.authenticatedUser) throw new UnauthorizedException('Authentication required')
  return request.authenticatedUser
})

export function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
  reply.header('Set-Cookie', serializeSessionCookie(token, expiresAt))
}
