import { Body, Controller, Get, InternalServerErrorException, Patch, Post, Req, Res, UseGuards } from '@nestjs/common'
import {
  ChangePasswordRequestSchema,
  LoginRequestSchema,
  ProfileUpdateRequestSchema,
  RegisterRequestSchema,
} from '@eotion/contracts'
import type { FastifyReply } from 'fastify'
import { AuthService } from '../server-domain/services/auth.service'
import { SessionService } from '../server-domain/services/session.service'
import type { UserRecord } from '../server-domain/types'
import {
  AuthenticatedRequest,
  clearSessionCookie,
  CurrentUser,
  readSessionCookie,
  SessionAuthGuard,
  setSessionCookie,
} from './auth.transport'
import { parseBody } from './validation'

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly sessions: SessionService) {}

  @Post('register')
  register(@Body() body: unknown): Promise<UserRecord> {
    const input = parseBody(RegisterRequestSchema, body)
    return this.auth.register(input.email, input.password)
  }

  @Post('login')
  async login(@Body() body: unknown, @Res({ passthrough: true }) reply: FastifyReply): Promise<{ user: UserRecord; expiresAt: string }> {
    const input = parseBody(LoginRequestSchema, body)
    const session = await this.auth.login(input.email, input.password)
    const user = await this.sessions.resolve(session.token)
    if (!user) throw new InternalServerErrorException('Unable to establish session')
    setSessionCookie(reply, session.token, session.expiresAt)
    return { user, expiresAt: session.expiresAt.toISOString() }
  }

  @Post('logout')
  async logout(@Req() request: AuthenticatedRequest, @Res() reply: FastifyReply): Promise<void> {
    const token = readSessionCookie(request.headers.cookie)
    if (token) await this.sessions.revoke(token)
    reply.header('Set-Cookie', clearSessionCookie()).code(204).send()
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  me(@CurrentUser() user: UserRecord): UserRecord {
    return user
  }

  @Patch('me')
  @UseGuards(SessionAuthGuard)
  updateProfile(@CurrentUser() user: UserRecord, @Body() body: unknown): Promise<UserRecord> {
    const input = parseBody(ProfileUpdateRequestSchema, body)
    return this.auth.updateProfile(user.id, input.displayName)
  }

  @Post('change-password')
  @UseGuards(SessionAuthGuard)
  async changePassword(
    @CurrentUser() user: UserRecord,
    @Body() body: unknown,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const input = parseBody(ChangePasswordRequestSchema, body)
    await this.auth.changePassword(user.id, input.currentPassword, input.newPassword)
    reply.header('Set-Cookie', clearSessionCookie()).code(204).send()
  }
}
