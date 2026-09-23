import type { HealthResponse } from '@eotion/contracts'

export interface EotionApiClientOptions {
  baseUrl: string
}

export class EotionApiClient {
  readonly baseUrl: string

  constructor(options: EotionApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
  }

  async health(signal?: AbortSignal): Promise<HealthResponse> {
    const response = await fetch(`${this.baseUrl}/api/health`, { signal })
    if (!response.ok) throw new Error(`Eotion API health failed: ${response.status}`)
    return response.json() as Promise<HealthResponse>
  }
}
