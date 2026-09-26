import { nanoid } from 'nanoid'

/** Generates IDs for local records and transient storage bridge requests. */
export function createLocalId(): string {
  return nanoid()
}
