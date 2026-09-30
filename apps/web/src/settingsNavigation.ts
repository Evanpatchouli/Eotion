import type { LocationQueryValue } from 'vue-router'

// Settings only returns to an Eotion product route, never to a supplied URL.
const productPath = /^\/app(?:\/[A-Za-z0-9_-]+(?:\/page\/[A-Za-z0-9_-]+)?)?$/

export function safeProductReturnTo(value: LocationQueryValue | LocationQueryValue[] | undefined): string {
  return typeof value === 'string' && productPath.test(value) ? value : '/app'
}
