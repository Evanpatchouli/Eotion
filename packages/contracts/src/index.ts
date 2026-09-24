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
