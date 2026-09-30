import { BadRequestException, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Req, Res, UnsupportedMediaTypeException, UseGuards, Body } from '@nestjs/common'
import { FileUpdateRequestSchema, FileUploadMetadataSchema } from '@eotion/contracts'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Readable } from 'node:stream'
import { FileMetadataService } from '../server-domain/services/file-metadata.service'
import type { UserRecord } from '../server-domain/types'
import { CurrentUser, SessionAuthGuard } from './auth.transport'
import { parseBody, parseId } from './validation'

function decodedHeader(request: FastifyRequest, name: string): string {
  const value = request.headers[name]
  if (typeof value !== 'string') throw new BadRequestException('Invalid file upload metadata')
  try { return decodeURIComponent(value) }
  catch { throw new BadRequestException('Invalid file upload metadata') }
}

function normalizedMimeHint(request: FastifyRequest): string | undefined {
  const value = request.headers['x-eotion-file-mime-type']
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new BadRequestException('Invalid file upload metadata')
  let decoded: string
  try { decoded = decodeURIComponent(value) }
  catch { throw new BadRequestException('Invalid file upload metadata') }
  const [rawMimeType, ...parameters] = decoded.split(';')
  const mimeType = rawMimeType.trim().toLowerCase()
  const validParameters = parameters.every((parameter) => /^\s*[a-z0-9!#$&^_.+-]+\s*=\s*(?:"[^"\r\n]*"|[a-z0-9!#$&^_.+-]+)\s*$/i.test(parameter))
  if (decoded.length > 512 || mimeType.length > 256 || (mimeType && !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mimeType)) || !validParameters) {
    throw new BadRequestException('Invalid file upload metadata')
  }
  return mimeType || undefined
}

@Controller('workspaces/:workspaceId/files')
@UseGuards(SessionAuthGuard)
export class FileController {
  constructor(private readonly files: FileMetadataService) {}

  @Post()
  async upload(@CurrentUser() user: UserRecord, @Param('workspaceId') workspaceId: string, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    if (request.headers['content-type'] !== 'application/octet-stream') throw new UnsupportedMediaTypeException('Expected application/octet-stream')
    const input = parseBody(FileUploadMetadataSchema, {
      id: decodedHeader(request, 'x-eotion-file-id'),
      name: decodedHeader(request, 'x-eotion-file-name'),
    })
    const mimeTypeHint = normalizedMimeHint(request)
    const rawLength = request.headers['content-length']
    const contentLength = rawLength === undefined ? undefined : Number(rawLength)
    if (contentLength !== undefined && (!Number.isSafeInteger(contentLength) || contentLength < 0)) throw new BadRequestException('Invalid content length')
    const controller = new AbortController()
    const abort = () => controller.abort()
    const onRequestClose = () => { if (!request.raw.complete) abort() }
    const onResponseClose = () => { if (!reply.raw.writableFinished) abort() }
    request.raw.on('aborted', abort)
    request.raw.on('close', onRequestClose)
    reply.raw.on('close', onResponseClose)
    if (request.raw.aborted || request.raw.destroyed && !request.raw.complete || reply.raw.destroyed && !reply.raw.writableFinished) abort()
    try {
      return await this.files.create(user.id, parseId(workspaceId), { ...input, mimeTypeHint, stream: request.body as Readable, contentLength, signal: controller.signal })
    } finally {
      request.raw.off('aborted', abort)
      request.raw.off('close', onRequestClose)
      reply.raw.off('close', onResponseClose)
    }
  }

  @Get()
  list(@CurrentUser() user: UserRecord, @Param('workspaceId') workspaceId: string) {
    return this.files.list(user.id, parseId(workspaceId))
  }

  @Get(':fileId')
  async get(@CurrentUser() user: UserRecord, @Param('workspaceId') workspaceId: string, @Param('fileId') fileId: string) {
    const file = await this.files.find(user.id, parseId(workspaceId), parseId(fileId))
    if (!file) throw new NotFoundException('File not found')
    return file
  }

  @Patch(':fileId')
  async update(@CurrentUser() user: UserRecord, @Param('workspaceId') workspaceId: string, @Param('fileId') fileId: string, @Body() body: unknown) {
    const input = parseBody(FileUpdateRequestSchema, body)
    const file = await this.files.update(user.id, parseId(workspaceId), parseId(fileId), input)
    if (!file) throw new NotFoundException('File not found')
    return file
  }

  @Delete(':fileId')
  async delete(@CurrentUser() user: UserRecord, @Param('workspaceId') workspaceId: string, @Param('fileId') fileId: string) {
    const deleted = await this.files.delete(user.id, parseId(workspaceId), parseId(fileId))
    if (!deleted) throw new NotFoundException('File not found')
    return { deleted: true }
  }
}
