import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function configuredOrigins(): Set<string> {
  return new Set((process.env.WEB_ORIGIN ?? '').split(',').map((item) => item.trim()).filter(Boolean))
}

function configuredApiOrigin(): string | null {
  const value = process.env.API_ORIGIN?.trim()
  if (!value) return null
  try {
    const origin = new URL(value).origin
    return origin === value ? origin : null
  } catch {
    return null
  }
}

@Injectable()
export class SameOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>()
    const origin = request.headers.origin
    if (SAFE_METHODS.has(request.method.toUpperCase()) || !origin) return true

    const allowlist = configuredOrigins()
    if (allowlist.has(origin) || origin === configuredApiOrigin()) return true
    try {
      const parsed = new URL(origin)
      const protocol = process.env.NODE_ENV === 'production' ? 'https' : request.protocol
      const host = request.headers.host
      if (parsed.origin === `${protocol}://${host}`) return true
    } catch {
      // Invalid Origin values are rejected below.
    }
    throw new ForbiddenException('Cross-origin request rejected')
  }
}
