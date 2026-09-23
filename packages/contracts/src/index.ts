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
