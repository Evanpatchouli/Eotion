import type { LocalStore } from '@eotion/storage'

export interface HealthResponse {
  name: string
  status: 'ok'
  timestamp: string
  runtime: string
  mongo: 'configured' | 'disabled'
  redis: 'reserved'
  kafka: 'reserved'
}

export type ClientRuntime = 'web' | 'electron' | 'mobile-webview'

export const MOBILE_P1_CHANNEL = 'eotion.mobile.p1' as const

export interface MobileP1Ping {
  channel: typeof MOBILE_P1_CHANNEL
  kind: 'ping'
  id: string
  sentAt: number
}

export interface MobileP1Pong {
  channel: typeof MOBILE_P1_CHANNEL
  kind: 'pong'
  id: string
  sentAt: number
  receivedAt: number
}

export const MOBILE_STORAGE_CHANNEL = 'eotion.mobile.storage.v1' as const

type LocalStoreMethod = {
  [Method in keyof LocalStore]: LocalStore[Method] extends (...args: never[]) => unknown
    ? {
        method: Method
        args: Parameters<LocalStore[Method]>
        result: Awaited<ReturnType<LocalStore[Method]>>
      }
    : never
}[keyof LocalStore]

/** Typed RPC envelope sent from the shared Web UI to a native Mobile WebView host. */
export type MobileStorageRequest = LocalStoreMethod extends infer Entry
  ? Entry extends { method: infer Method; args: infer Args }
    ? {
        channel: typeof MOBILE_STORAGE_CHANNEL
        kind: 'request'
        id: string
        method: Method
        args: Args
      }
    : never
  : never

export type MobileStorageSuccessResponse<Method extends keyof LocalStore = keyof LocalStore> = {
  [Name in Method]: {
    channel: typeof MOBILE_STORAGE_CHANNEL
    kind: 'response'
    id: string
    method: Name
    ok: true
    result: Awaited<ReturnType<LocalStore[Name]>>
  }
}[Method]

export interface MobileStorageUnavailableResponse {
  channel: typeof MOBILE_STORAGE_CHANNEL
  kind: 'response'
  id: string
  method: keyof LocalStore
  ok: false
  error: {
    code: 'unavailable'
    message: string
  }
}

export type MobileStorageResponse =
  | MobileStorageSuccessResponse
  | MobileStorageUnavailableResponse

const MOBILE_STORAGE_METHODS: ReadonlySet<string> = new Set([
  'getPage',
  'listPages',
  'upsertPage',
  'deletePage',
  'getBlock',
  'listBlocksByPage',
  'upsertBlock',
  'deleteBlock',
  'getPendingOperations',
  'markOperationSynced',
  'markOperationFailed',
])

/** Runtime check for data crossing the WebView message boundary. */
export function isMobileStorageRequest(value: unknown): value is MobileStorageRequest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<MobileStorageRequest>
  return candidate.channel === MOBILE_STORAGE_CHANNEL &&
    candidate.kind === 'request' &&
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    candidate.id.length <= 128 &&
    typeof candidate.method === 'string' &&
    MOBILE_STORAGE_METHODS.has(candidate.method) &&
    Array.isArray(candidate.args)
}
