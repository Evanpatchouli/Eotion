import { BadRequestException } from '@nestjs/common'

export function parseBody<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  try {
    return schema.parse(value)
  } catch {
    throw new BadRequestException('Invalid request body')
  }
}

export function parseId(value: string | undefined): string {
  if (!value || value.trim().length === 0) throw new BadRequestException('Invalid resource id')
  return value
}
