import { BadRequestException, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Req, UnsupportedMediaTypeException, UseGuards, Body } from '@nestjs/common'
import { FileUpdateRequestSchema, FileUploadMetadataSchema } from '@eotion/contracts'
import type { FastifyRequest } from 'fastify'
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

@Controller('workspaces/:workspaceId/files')
@UseGuards(SessionAuthGuard)
export class FileController {
  constructor(private readonly files: FileMetadataService) {}

  @Post()
  upload(@CurrentUser() user: UserRecord, @Param('workspaceId') workspaceId: string, @Req() request: FastifyRequest) {
    if (request.headers['content-type'] !== 'application/octet-stream') throw new UnsupportedMediaTypeException('Expected application/octet-stream')
    const input = parseBody(FileUploadMetadataSchema, {
      id: decodedHeader(request, 'x-eotion-file-id'),
      name: decodedHeader(request, 'x-eotion-file-name'),
    })
    const rawLength = request.headers['content-length']
    const contentLength = rawLength === undefined ? undefined : Number(rawLength)
    if (contentLength !== undefined && (!Number.isSafeInteger(contentLength) || contentLength < 0)) throw new BadRequestException('Invalid content length')
    return this.files.create(user.id, parseId(workspaceId), { ...input, stream: request.body as Readable, contentLength })
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
