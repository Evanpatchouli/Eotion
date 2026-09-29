import { ApiError, EotionApiClient } from '@eotion/sdk'

export const api = new EotionApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
})

let onSessionExpired: (() => void) | null = null

export function setSessionExpiredHandler(handler: () => void): void {
  onSessionExpired = handler
}

export function expireSessionFromApi(): void {
  onSessionExpired?.()
}

export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error && error.message && !/^(failed to fetch|load failed|networkerror)/i.test(error.message)) {
    return error.message
  }
  return fallback
}

export { ApiError }
