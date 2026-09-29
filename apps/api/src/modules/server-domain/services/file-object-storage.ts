import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { AliOssServerSdk } from '@ali-oss-server/sdk'
import type { Readable } from 'node:stream'

export interface FileObjectStorage {
  assertConfigured(): void
  upload(input: { stream: Readable; objectKey: string; mimeType: string; fileName: string; signal?: AbortSignal }): Promise<{ objectKey: string; url: string }>
  delete(objectKey: string): Promise<void>
}

export const FILE_OBJECT_STORAGE = Symbol('FILE_OBJECT_STORAGE')

@Injectable()
export class AliOssObjectStorage implements FileObjectStorage {
  private readonly config: { serverBaseUrl: string; clientId: string; clientSecret: string } | null
  private sdk: AliOssServerSdk | null = null

  constructor() {
    const serverBaseUrl = process.env.ALI_OSS_SERVER_URL?.trim()
    const clientId = process.env.ALI_OSS_CLIENT_ID?.trim()
    const clientSecret = process.env.ALI_OSS_CLIENT_SECRET?.trim()
    let validUrl = false
    try {
      const url = new URL(serverBaseUrl ?? '')
      validUrl = url.protocol === 'http:' || url.protocol === 'https:'
    } catch { /* File operations report the configuration error. */ }
    this.config = serverBaseUrl && clientId && clientSecret && validUrl
      ? { serverBaseUrl, clientId, clientSecret }
      : null
  }

  assertConfigured(): void {
    if (!this.config) throw new ServiceUnavailableException('File storage is not configured')
  }

  async upload(input: { stream: Readable; objectKey: string; mimeType: string; fileName: string; signal?: AbortSignal }): Promise<{ objectKey: string; url: string }> {
    const sdk = this.requireSdk()
    const result = await sdk.uploadStream({ stream: input.stream, objectKey: input.objectKey, mimeType: input.mimeType, fileName: input.fileName, signal: input.signal, randomFilename: false })
    return { objectKey: result.objectKey, url: result.url }
  }

  async delete(objectKey: string): Promise<void> {
    await this.requireSdk().deleteObject(objectKey)
  }

  private requireSdk(): AliOssServerSdk {
    this.assertConfigured()
    return this.sdk ??= new AliOssServerSdk(this.config!)
  }
}
