import { BadRequestException } from '@nestjs/common'

/** Reject Mongo update operators and fields outside a repository's explicit patch contract. */
export function assertUpdateFields(patch: object, allowed: readonly string[]): void {
  if (Object.getPrototypeOf(patch) !== Object.prototype || Object.keys(patch).some((key) => !allowed.includes(key))) {
    throw new BadRequestException('Unsupported update field')
  }
}
