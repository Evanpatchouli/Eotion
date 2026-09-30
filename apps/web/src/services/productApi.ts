import { ApiError, EotionApiClient } from '@eotion/sdk'
import { preserveActivePageEditor } from '../editor/activePageEditor'

export const api = new EotionApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
})

let onSessionExpired: (() => void) | null = null

export function setSessionExpiredHandler(handler: () => void): void {
  onSessionExpired = handler
}

export function isTransientServiceUnavailable(error: unknown): boolean {
  // Explicit temporary backend failures; authentication/permission errors never qualify.
  return error instanceof TypeError
    || (error instanceof ApiError && [500, 502, 503, 504].includes(error.statusCode))
}

export function expireSessionFromApi(): void {
  preserveActivePageEditor()
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
