import { BadGatewayException, ConflictException, Inject, Injectable, Logger, PayloadTooLargeException, ServiceUnavailableException } from '@nestjs/common'
import { createHash, randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import type { FileMetadata } from '../types'
import { FileMetadataRepository } from '../repositories/file-metadata.repository'
import { FILE_OBJECT_STORAGE, type FileObjectStorage } from './file-object-storage'
import { WorkspacePermissionService } from './workspace-permission.service'

const DEFAULT_MAX_UPLOAD_BYTES = 20 * 1024 * 1024
const UPLOAD_MIME_TYPE = 'application/octet-stream'
const keySegment = (value: string) => createHash('sha256').update(value).digest('hex')

@Injectable()
export class FileMetadataService {
  private readonly logger = new Logger(FileMetadataService.name)

  constructor(
    private readonly files: FileMetadataRepository,
    private readonly permissions: WorkspacePermissionService,
    @Inject(FILE_OBJECT_STORAGE) private readonly storage: FileObjectStorage,
  ) {}

  async create(userId: string, workspaceId: string, input: { id: string; name: string; stream: Readable; contentLength?: number }): Promise<FileMetadata> {
    await this.permissions.assertCanWrite(userId, workspaceId)
    this.storage.assertConfigured()
    const maxBytes = this.maxUploadBytes()
    if (input.contentLength !== undefined && input.contentLength > maxBytes) throw new PayloadTooLargeException('File exceeds upload limit')
    const prefix = process.env.ALI_OSS_OBJECT_PREFIX?.trim().replace(/^\/+|\/+$/g, '') || 'eotion'
    const requestedKey = `${prefix}/workspaces/${keySegment(workspaceId)}/files/${keySegment(input.id)}/${randomUUID()}`
    let size = 0
    let exceeded = false
    const counted = Readable.from((async function* () {
      for await (const chunk of input.stream) {
        const bytes = typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length
        size += bytes
        if (size > maxBytes) {
          exceeded = true
          throw new Error('upload limit exceeded')
        }
        yield chunk
      }
    })())
    let uploaded: { objectKey: string; url: string }
    try {
      uploaded = await this.storage.upload({ stream: counted, objectKey: requestedKey, mimeType: UPLOAD_MIME_TYPE })
    } catch (error) {
      if (exceeded) throw new PayloadTooLargeException('File exceeds upload limit')
      if (error instanceof ServiceUnavailableException) throw error
      this.logger.error('File object upload failed')
      throw new BadGatewayException('File object upload failed')
    }
    const clientId = process.env.ALI_OSS_CLIENT_ID?.trim()
    const expectedKey = requestedKey.startsWith(`${clientId}/`) ? requestedKey : `${clientId}/${requestedKey}`
    if (uploaded.objectKey !== expectedKey) {
      this.logger.error('File object upload returned an unexpected object key; uploaded object may require manual cleanup')
      throw new BadGatewayException('File object upload returned an unexpected object key')
    }
    try {
      return await this.files.create({ id: input.id, workspaceId, ownerId: userId, name: input.name, mimeType: UPLOAD_MIME_TYPE, size, objectKey: uploaded.objectKey, url: uploaded.url })
    } catch {
      let persisted: FileMetadata | null
      try {
        persisted = await this.files.findInWorkspace(workspaceId, input.id)
      } catch {
        this.logger.error('File metadata create outcome could not be verified; uploaded object retained for safety')
        throw new ServiceUnavailableException('File metadata creation outcome is uncertain')
      }
      if (persisted?.objectKey === uploaded.objectKey) return persisted
      try {
        await this.storage.delete(uploaded.objectKey)
      } catch {
        this.logger.error('File metadata create failed and object cleanup failed')
        throw new ServiceUnavailableException('File metadata creation and object cleanup failed')
      }
      this.logger.error('File metadata create failed; uploaded object cleaned up')
      throw new ServiceUnavailableException('File metadata creation failed')
    }
  }

  async find(userId: string, workspaceId: string, id: string) {
    await this.permissions.assertCanRead(userId, workspaceId)
    this.storage.assertConfigured()
    return this.files.findInWorkspace(workspaceId, id)
  }

  async list(userId: string, workspaceId: string) {
    await this.permissions.assertCanRead(userId, workspaceId)
    this.storage.assertConfigured()
    return this.files.listByWorkspace(workspaceId)
  }

  async update(userId: string, workspaceId: string, id: string, patch: { name: string }) {
    await this.permissions.assertCanWrite(userId, workspaceId)
    this.storage.assertConfigured()
    return this.files.updateInWorkspace(workspaceId, id, patch)
  }

  async delete(userId: string, workspaceId: string, id: string): Promise<boolean> {
    await this.permissions.assertCanWrite(userId, workspaceId)
    this.storage.assertConfigured()
    const file = await this.files.findInWorkspace(workspaceId, id)
    if (!file) return false
    try {
      await this.storage.delete(file.objectKey)
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error
      this.logger.error('File object deletion failed')
      throw new BadGatewayException('File object deletion failed')
    }
    let deleted: boolean
    try {
      deleted = await this.files.deleteInWorkspace(workspaceId, id, file.objectKey)
    } catch {
      this.logger.error('File object deleted but metadata deletion failed; retry required')
      throw new ServiceUnavailableException('File metadata deletion failed; retry required')
    }
    if (!deleted) throw new ConflictException('File changed during deletion')
    return true
  }

  private maxUploadBytes(): number {
    const raw = process.env.ALI_OSS_MAX_UPLOAD_BYTES?.trim()
    if (!raw) return DEFAULT_MAX_UPLOAD_BYTES
    const value = Number(raw)
    if (!Number.isSafeInteger(value) || value <= 0) throw new ServiceUnavailableException('File upload limit is invalid')
    return value
  }
}
