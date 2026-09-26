import { nanoid } from 'nanoid'

/** Generates IDs for local records and operations. */
export function createLocalId(): string {
  return nanoid()
}
