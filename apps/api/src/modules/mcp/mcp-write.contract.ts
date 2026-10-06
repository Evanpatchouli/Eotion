import { z } from 'zod'

const idSchema = z.string().trim().min(1).max(128)
const titleSchema = z.string().trim().min(1).max(200)
const textSchema = z.string().max(100_000)
const languageSchema = z.string().max(128)
const listItemsSchema = z.array(textSchema).min(1).max(1000)

const CreateBlockSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('paragraph'), text: textSchema }),
  z.strictObject({ type: z.literal('heading'), text: textSchema, level: z.number().int().min(1).max(6) }),
  z.strictObject({ type: z.literal('todo'), text: textSchema, checked: z.boolean() }),
  z.strictObject({ type: z.literal('code'), text: textSchema, language: languageSchema.optional() }),
  z.strictObject({ type: z.literal('divider'), text: z.literal('').optional() }),
  z.strictObject({ type: z.literal('bulleted-list'), items: listItemsSchema, text: textSchema.optional() }),
  z.strictObject({ type: z.literal('numbered-list'), items: listItemsSchema, start: z.number().int().safe().positive().optional(), text: textSchema.optional() }),
  z.strictObject({ type: z.literal('quote'), paragraphs: listItemsSchema.optional(), text: textSchema.optional() })
    .refine((block) => block.paragraphs !== undefined || block.text !== undefined, { message: 'quote requires paragraphs or text' }),
])

const UpdateBlockSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('paragraph'), id: idSchema.optional(), text: textSchema }),
  z.strictObject({ type: z.literal('heading'), id: idSchema.optional(), text: textSchema, level: z.number().int().min(1).max(6) }),
  z.strictObject({ type: z.literal('todo'), id: idSchema.optional(), text: textSchema, checked: z.boolean() }),
  z.strictObject({ type: z.literal('code'), id: idSchema.optional(), text: textSchema, language: languageSchema.optional() }),
  z.strictObject({ type: z.literal('divider'), id: idSchema.optional(), text: z.literal('').optional() }),
  z.strictObject({ type: z.literal('bulleted-list'), id: idSchema.optional(), items: listItemsSchema, text: textSchema.optional() }),
  z.strictObject({ type: z.literal('numbered-list'), id: idSchema.optional(), items: listItemsSchema, start: z.number().int().safe().positive().optional(), text: textSchema.optional() }),
  z.strictObject({ type: z.literal('quote'), id: idSchema.optional(), paragraphs: listItemsSchema.optional(), text: textSchema.optional() })
    .refine((block) => block.paragraphs !== undefined || block.text !== undefined, { message: 'quote requires paragraphs or text' }),
])

export const CreatePageInputSchema = z.strictObject({
  workspaceId: idSchema,
  parentPageId: idSchema.nullable().optional(),
  title: titleSchema,
  blocks: z.array(CreateBlockSchema).max(1000).default([]),
  idempotencyKey: z.string().trim().min(1).max(128),
})

const UpdatePageFieldsSchema = z.strictObject({
  pageId: idSchema,
  expectedUpdatedAt: z.iso.datetime(),
  idempotencyKey: z.string().trim().min(1).max(128),
  title: titleSchema.optional(),
  blocks: z.array(UpdateBlockSchema).max(1000).optional(),
})

export const UpdatePageInputSchema = UpdatePageFieldsSchema.refine(
  (input) => input.title !== undefined || input.blocks !== undefined,
  { message: 'at least one of title or blocks is required' },
)

export type CreateBlockInput = z.infer<typeof CreateBlockSchema>
export type UpdateBlockInput = z.infer<typeof UpdateBlockSchema>
export type CreatePageInput = z.infer<typeof CreatePageInputSchema>
export type UpdatePageInput = z.infer<typeof UpdatePageInputSchema>

const MAX_WRITE_PAYLOAD_BYTES = 1024 * 1024

/** Reject oversized MCP JSON arguments before domain conversion or persistence. */
export function assertMcpWritePayloadSize<T>(payload: T): T {
  if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > MAX_WRITE_PAYLOAD_BYTES) throw new Error('MCP write payload too large')
  return payload
}
