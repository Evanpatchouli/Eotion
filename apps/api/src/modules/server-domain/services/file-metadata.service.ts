import { BadGatewayException, ConflictException, Inject, Injectable, Logger, PayloadTooLargeException, ServiceUnavailableException } from '@nestjs/common'
import { createHash, randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import type { FileMetadata } from '../types'
import { FileMetadataRepository } from '../repositories/file-metadata.repository'
import { FILE_OBJECT_STORAGE, type FileObjectStorage } from './file-object-storage'
import { WorkspacePermissionService } from './workspace-permission.service'

const DEFAULT_MAX_UPLOAD_BYTES = 20 * 1024 * 1024
const UPLOAD_MIME_TYPE = 'application/octet-stream'
const MIME_SNIFF_PREFIX_BYTES = 512
const keySegment = (value: string) => createHash('sha256').update(value).digest('hex')
type PendingUpload = { settled: Promise<void>; objectAbsent: boolean }

function bufferChunk(chunk: Buffer | Uint8Array | string): Buffer {
  return typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
}

function sniffMimeType(prefix: Buffer): string {
  if (prefix.length >= 8 && prefix.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (prefix.length >= 3 && prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff) return 'image/jpeg'
  if (prefix.length >= 12 && prefix.toString('ascii', 0, 4) === 'RIFF' && prefix.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  if (prefix.length >= 6 && ['GIF87a', 'GIF89a'].includes(prefix.toString('ascii', 0, 6))) return 'image/gif'
  if (prefix.length >= 16 && prefix.toString('ascii', 4, 8) === 'ftyp') {
    const boxSize = prefix.readUInt32BE(0)
    if (boxSize >= 16 && boxSize <= MIME_SNIFF_PREFIX_BYTES && prefix.length >= boxSize && (boxSize - 16) % 4 === 0) {
      const brands = [prefix.toString('ascii', 8, 12)]
      for (let offset = 16; offset + 4 <= Math.min(boxSize, prefix.length); offset += 4) brands.push(prefix.toString('ascii', offset, offset + 4))
      if (brands.some((brand) => brand === 'avif' || brand === 'avis')) return 'image/avif'
    }
  }
  return UPLOAD_MIME_TYPE
}

async function sniffStream(stream: Readable, signal?: AbortSignal): Promise<{ stream: Readable; mimeType: string; cleanup: () => void; destroy: () => void }> {
  const iterator = stream[Symbol.asyncIterator]()
  const replay: Buffer[] = []
  const prefix: Buffer[] = []
  let prefixSize = 0
  let ended = false
  const onAbort = () => { if (!stream.destroyed) stream.destroy(new Error('Upload aborted')) }
  if (signal?.aborted) onAbort()
  else signal?.addEventListener('abort', onAbort, { once: true })

  try {
    while (prefixSize < MIME_SNIFF_PREFIX_BYTES) {
      const next = await iterator.next()
      if (next.done) { ended = true; break }
      const chunk = bufferChunk(next.value as Buffer | Uint8Array | string)
      replay.push(chunk)
      const remaining = MIME_SNIFF_PREFIX_BYTES - prefixSize
      const prefixChunk = chunk.subarray(0, remaining)
      prefix.push(prefixChunk)
      prefixSize += prefixChunk.length
    }
  } catch (error) {
    signal?.removeEventListener('abort', onAbort)
    if (!stream.destroyed && !stream.readableEnded) stream.destroy()
    try { await iterator.return?.() } catch { /* Preserve the stream read error. */ }
    throw error
  }

  const mimeType = sniffMimeType(Buffer.concat(prefix, prefixSize))
  const replayStream = Readable.from((async function* () {
    for (const chunk of replay) yield chunk
    if (!ended) {
      while (true) {
        const next = await iterator.next()
        if (next.done) return
        yield next.value
      }
    }
  })())
  return {
    stream: replayStream,
    mimeType,
    cleanup: () => signal?.removeEventListener('abort', onAbort),
    destroy: () => {
      signal?.removeEventListener('abort', onAbort)
      if (!replayStream.destroyed && !replayStream.readableEnded) replayStream.destroy()
      if (!stream.destroyed && !stream.readableEnded) stream.destroy()
    },
  }
}

@Injectable()
export class FileMetadataService {
  private readonly logger = new Logger(FileMetadataService.name)
  private readonly pendingUploads = new Map<string, PendingUpload>()

  constructor(
    private readonly files: FileMetadataRepository,
    private readonly permissions: WorkspacePermissionService,
    @Inject(FILE_OBJECT_STORAGE) private readonly storage: FileObjectStorage,
  ) {}

  async create(userId: string, workspaceId: string, input: { id: string; name: string; mimeTypeHint?: string; stream: Readable; contentLength?: number; signal?: AbortSignal }): Promise<FileMetadata> {
    const key = this.uploadKey(workspaceId, input.id)
    const previous = this.pendingUploads.get(key)
    const state: PendingUpload = { settled: Promise.resolve(), objectAbsent: false }
    const operation = Promise.resolve().then(async () => {
      if (previous) await previous.settled.catch(() => {})
      return this.createUploadedFile(userId, workspaceId, input, () => { state.objectAbsent = true })
    })
    state.settled = operation.then(() => {}, () => {})
    this.pendingUploads.set(key, state)
    try {
      return await operation
    } finally {
      if (this.pendingUploads.get(key) === state) this.pendingUploads.delete(key)
    }
  }

  private async createUploadedFile(userId: string, workspaceId: string, input: { id: string; name: string; mimeTypeHint?: string; stream: Readable; contentLength?: number; signal?: AbortSignal }, markObjectAbsent: () => void): Promise<FileMetadata> {
    await this.permissions.assertCanWrite(userId, workspaceId)
    this.storage.assertConfigured()
    const maxBytes = this.maxUploadBytes()
    if (input.contentLength !== undefined && input.contentLength > maxBytes) throw new PayloadTooLargeException('File exceeds upload limit')
    let sniffed: Awaited<ReturnType<typeof sniffStream>>
    try {
      sniffed = await sniffStream(input.stream, input.signal)
    } catch (error) {
      markObjectAbsent()
      throw error
    }
    const prefix = process.env.ALI_OSS_OBJECT_PREFIX?.trim().replace(/^\/+|\/+$/g, '') || 'eotion'
    const requestedKey = `${prefix}/workspaces/${keySegment(workspaceId)}/files/${keySegment(input.id)}/${randomUUID()}`
    let size = 0
    let exceeded = false
    const counted = Readable.from((async function* () {
      for await (const chunk of sniffed.stream) {
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
      uploaded = await this.storage.upload({ stream: counted, objectKey: requestedKey, mimeType: sniffed.mimeType, fileName: input.name, signal: input.signal })
    } catch (error) {
      counted.destroy()
      sniffed.destroy()
      if (exceeded) throw new PayloadTooLargeException('File exceeds upload limit')
      if (error instanceof ServiceUnavailableException) throw error
      this.logger.error('File object upload failed')
      throw new BadGatewayException('File object upload failed')
    }
    sniffed.cleanup()
    const clientId = process.env.ALI_OSS_CLIENT_ID?.trim()
    const expectedKey = requestedKey.startsWith(`${clientId}/`) ? requestedKey : `${clientId}/${requestedKey}`
    if (uploaded.objectKey !== expectedKey) {
      this.logger.error('File object upload returned an unexpected object key; uploaded object may require manual cleanup')
      throw new BadGatewayException('File object upload returned an unexpected object key')
    }
    let file: FileMetadata
    try {
      file = await this.files.create({ id: input.id, workspaceId, ownerId: userId, name: input.name, mimeType: sniffed.mimeType, size, objectKey: uploaded.objectKey, url: uploaded.url })
    } catch {
      let persisted: FileMetadata | null
      try {
        persisted = await this.files.findInWorkspace(workspaceId, input.id)
      } catch {
        this.logger.error('File metadata create outcome could not be verified; uploaded object retained for safety')
        throw new ServiceUnavailableException('File metadata creation outcome is uncertain')
      }
      if (persisted?.objectKey === uploaded.objectKey) {
        file = persisted
      } else {
        try {
          await this.storage.delete(uploaded.objectKey)
          markObjectAbsent()
        } catch {
          this.logger.error('File metadata create failed and object cleanup failed')
          throw new ServiceUnavailableException('File metadata creation and object cleanup failed')
        }
        this.logger.error('File metadata create failed; uploaded object cleaned up')
        throw new ServiceUnavailableException('File metadata creation failed')
      }
    }
    if (input.signal?.aborted) {
      try {
        await this.storage.delete(uploaded.objectKey)
        markObjectAbsent()
        const deleted = await this.files.deleteInWorkspace(workspaceId, input.id, uploaded.objectKey)
        if (!deleted) throw new Error('File metadata cleanup did not remove the uploaded record')
      } catch {
        this.logger.error('File upload was aborted after metadata creation and cleanup failed')
        throw new ServiceUnavailableException('File upload was aborted and created data cleanup failed')
      }
      throw new ServiceUnavailableException('File upload was aborted')
    }
    return file
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
    const key = this.uploadKey(workspaceId, id)
    const pendingAtStart = this.pendingUploads.get(key)
    await this.permissions.assertCanWrite(userId, workspaceId)
    const pending = this.pendingUploads.get(key) ?? pendingAtStart
    if (pending) await pending.settled.catch(() => {})
    this.storage.assertConfigured()
    const file = await this.files.findInWorkspace(workspaceId, id)
    if (!file) return pending?.objectAbsent ?? false
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

  private uploadKey(workspaceId: string, fileId: string): string {
    return JSON.stringify([workspaceId, fileId])
  }
}
