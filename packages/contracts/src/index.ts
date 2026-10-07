import { z } from 'zod'
import { BLOCK_TYPES, validateBlockProps } from '@eotion/domain/block-types'
import {
  isValidDatabase,
  isValidDatabaseProperty,
  isValidDatabasePropertyDefinition,
  isValidDatabaseRecord,
  isValidDatabaseView,
} from '@eotion/domain/database'
import type { Database, DatabaseProperty, DatabaseRecord, DatabaseView } from '@eotion/domain/database'
export { BLOCK_TYPES }

export interface HealthResponse {
  name: string
  status: 'ok'
  version: string
  buildNumber: number
  gitSha: string
  timestamp: string
  runtime: string
  mongo: 'configured' | 'disabled'
  redis: 'reserved'
  kafka: 'reserved'
}

export type ClientRuntime = 'web' | 'electron' | 'mobile-webview'

export { MOBILE_P1_CHANNEL } from './mobile.js'
export type { MobileP1Ping, MobileP1Pong } from './mobile.js'

const idSchema = z.string().trim().min(1)
const nameSchema = z.string().trim().min(1).max(200)
const databaseStableIdSchema = z.string().min(1).max(256).refine((value) => value === value.trim(), 'Expected a stable database id')
const databaseNameSchema = z.string().min(1).max(200).refine((value) => value === value.trim(), 'Expected a stable database name')
const emailSchema = z.string().trim().min(1).max(320).pipe(z.email())
const passwordSchema = z.string().min(1).max(1024)
const displayNameSchema = z.string().trim().min(1).max(64)
const dateSchema = z.iso.datetime()
const propsSchema = z.record(z.string(), z.unknown())
const calloutPropsIssue = 'Invalid block attributes'

export const RegisterRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
}).strict()
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>

export const LoginRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
}).strict()
export type LoginRequest = z.infer<typeof LoginRequestSchema>

export const ProfileUpdateRequestSchema = z.object({
  displayName: displayNameSchema,
}).strict()
export type ProfileUpdateRequest = z.infer<typeof ProfileUpdateRequestSchema>

export const ChangePasswordRequestSchema = z.object({
  currentPassword: passwordSchema,
  newPassword: passwordSchema,
}).strict()
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>

export const WorkspaceCreateRequestSchema = z.object({
  id: idSchema,
  name: nameSchema,
}).strict()
export type WorkspaceCreateRequest = z.infer<typeof WorkspaceCreateRequestSchema>

export const WorkspaceUpdateRequestSchema = z.object({
  name: nameSchema,
}).strict()
export type WorkspaceUpdateRequest = z.infer<typeof WorkspaceUpdateRequestSchema>

export const PageCreateRequestSchema = z.object({
  id: idSchema,
  parentPageId: idSchema.nullable(),
  title: nameSchema,
  orderKey: idSchema,
  icon: z.string().trim().min(1).max(256).optional(),
}).strict()
export type PageCreateRequest = z.infer<typeof PageCreateRequestSchema>

export const PageUpdateRequestSchema = z.object({
  title: nameSchema.optional(),
  orderKey: idSchema.optional(),
  icon: z.string().trim().min(1).max(256).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field must be provided',
})
export type PageUpdateRequest = z.infer<typeof PageUpdateRequestSchema>

export const PageMoveRequestSchema = z.object({
  parentPageId: idSchema.nullable(),
  orderKey: idSchema,
}).strict()
export type PageMoveRequest = z.infer<typeof PageMoveRequestSchema>

export const BlockTypeSchema = z.enum(BLOCK_TYPES)
export type BlockType = z.infer<typeof BlockTypeSchema>

export const DatabaseSchema = z.custom<Database>(isValidDatabase)
export type DatabaseResponse = z.infer<typeof DatabaseSchema>
export const DatabasePropertySchema = z.custom<DatabaseProperty>(isValidDatabaseProperty)
export type DatabasePropertyResponse = z.infer<typeof DatabasePropertySchema>
export function databaseRecordSchema(properties: readonly DatabaseProperty[]) {
  return z.custom<DatabaseRecord>((value) => isValidDatabaseRecord(value, properties))
}
export type DatabaseRecordResponse = DatabaseRecord
export const DatabaseViewSchema = z.custom<DatabaseView>(isValidDatabaseView)
export type DatabaseViewResponse = z.infer<typeof DatabaseViewSchema>

export const DatabaseCreateInPageRequestSchema = z.object({
  id: databaseStableIdSchema,
  name: databaseNameSchema,
  titlePropertyId: databaseStableIdSchema,
  viewId: databaseStableIdSchema,
  blockId: databaseStableIdSchema,
  orderKey: idSchema,
  parentBlockId: databaseStableIdSchema.nullable(),
}).strict()
export type DatabaseCreateInPageRequest = z.infer<typeof DatabaseCreateInPageRequestSchema>

export const DatabasePropertyCreateRequestSchema = z.object({
  id: databaseStableIdSchema,
  name: databaseNameSchema,
  type: z.enum(['title', 'text', 'number', 'checkbox', 'select', 'date']),
  options: z.array(z.object({ id: databaseStableIdSchema, name: databaseNameSchema }).strict()).optional(),
}).strict().refine(isValidDatabasePropertyDefinition, { message: 'Invalid database property definition' })
export type DatabasePropertyCreateRequest = z.infer<typeof DatabasePropertyCreateRequestSchema>

export const DatabaseRecordCreateRequestSchema = z.object({
  id: databaseStableIdSchema,
  pageId: databaseStableIdSchema,
  properties: z.record(databaseStableIdSchema, z.union([z.string(), z.number().finite(), z.boolean(), z.null()])),
}).strict()
export type DatabaseRecordCreateRequest = z.infer<typeof DatabaseRecordCreateRequestSchema>

export const DatabaseViewCreateRequestSchema = z.object({
  id: databaseStableIdSchema,
  name: databaseNameSchema,
  type: z.literal('table'),
}).strict()
export type DatabaseViewCreateRequest = z.infer<typeof DatabaseViewCreateRequestSchema>

export const SAFE_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'] as const

const attachmentFileIdSchema = z.string().trim().min(1).max(256)
const attachmentMimeTypeSchema = z.string().trim().toLowerCase().min(1).max(256)
const attachmentUrlSchema = z.url().refine((value) => {
  const url = new URL(value)
  return (url.protocol === 'http:' || url.protocol === 'https:') && url.username === '' && url.password === ''
}, 'Expected an HTTP or HTTPS URL without credentials')

export const AttachmentAttrsSchema = z.object({
  fileId: attachmentFileIdSchema,
  name: nameSchema,
  mimeType: attachmentMimeTypeSchema,
  size: z.number().int().min(0).refine(Number.isSafeInteger, 'Expected a safe integer'),
  url: attachmentUrlSchema,
}).strict()
export type AttachmentAttrs = z.infer<typeof AttachmentAttrsSchema>

const syncOperationBase = {
  id: idSchema,
  clientId: idSchema,
  sequence: z.number().int().positive(),
  workspaceId: idSchema,
  createdAt: dateSchema,
}

const syncOperationSchema = z.discriminatedUnion('kind', [
  z.object({
    ...syncOperationBase,
    kind: z.literal('page.upsert'),
    payload: z.object({
      id: idSchema,
      parentPageId: idSchema.nullable(),
      title: nameSchema,
      icon: z.string().trim().min(1).max(256).nullable(),
      orderKey: idSchema,
    }).strict(),
  }).strict(),
  z.object({
    ...syncOperationBase,
    kind: z.literal('page.delete'),
    payload: z.object({ id: idSchema }).strict(),
  }).strict(),
  z.object({
    ...syncOperationBase,
    kind: z.literal('page.move'),
    payload: z.object({
      id: idSchema,
      parentPageId: idSchema.nullable(),
      orderKey: idSchema,
    }).strict(),
  }).strict(),
  z.object({
    ...syncOperationBase,
    kind: z.literal('block.upsert'),
    payload: z.object({
      id: idSchema,
      pageId: idSchema,
      parentBlockId: idSchema.nullable(),
      type: BlockTypeSchema,
      orderKey: idSchema,
      props: propsSchema,
    }).strict().refine((payload) => validateBlockProps(payload.type, payload.props), { message: calloutPropsIssue }),
  }).strict(),
  z.object({
    ...syncOperationBase,
    kind: z.literal('block.delete'),
    payload: z.object({ id: idSchema }).strict(),
  }).strict(),
  z.object({
    ...syncOperationBase,
    kind: z.literal('block.move'),
    payload: z.object({
      id: idSchema,
      pageId: idSchema,
      parentBlockId: idSchema.nullable(),
      orderKey: idSchema,
    }).strict(),
  }).strict(),
])

export const SyncOperationSchema = syncOperationSchema
export type SyncOperation = z.infer<typeof SyncOperationSchema>

export const BlockCreateRequestSchema = z.object({
  id: idSchema,
  parentBlockId: idSchema.nullable(),
  type: BlockTypeSchema,
  orderKey: idSchema,
  props: propsSchema,
}).strict().refine((value) => validateBlockProps(value.type, value.props), { message: calloutPropsIssue })
export type BlockCreateRequest = z.infer<typeof BlockCreateRequestSchema>

export const BlockUpdateRequestSchema = z.object({
  type: BlockTypeSchema.optional(),
  orderKey: idSchema.optional(),
  props: propsSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field must be provided',
}).refine((value) => value.type === undefined || value.props === undefined || validateBlockProps(value.type, value.props), { message: calloutPropsIssue })
export type BlockUpdateRequest = z.infer<typeof BlockUpdateRequestSchema>

export const FileUpdateRequestSchema = z.object({
  name: nameSchema,
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field must be provided',
})
export type FileUpdateRequest = z.infer<typeof FileUpdateRequestSchema>

export const FileUploadMetadataSchema = z.object({
  id: idSchema,
  name: nameSchema,
}).strict()
export type FileUploadMetadata = z.infer<typeof FileUploadMetadataSchema>

const userRecordSchema = z.object({
  id: idSchema,
  email: emailSchema,
  displayName: displayNameSchema,
  createdAt: dateSchema,
  updatedAt: dateSchema,
}).strict()
const workspaceRecordSchema = z.object({
  id: idSchema,
  name: nameSchema,
  ownerId: idSchema,
  createdAt: dateSchema,
  updatedAt: dateSchema,
}).strict()
const pageRecordSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  parentPageId: idSchema.nullable(),
  title: nameSchema,
  icon: z.string().optional(),
  orderKey: idSchema,
  createdAt: dateSchema,
  updatedAt: dateSchema,
}).strict()
const serverBlockRecordSchema = z.object({
  id: idSchema,
  pageId: idSchema,
  workspaceId: idSchema,
  parentBlockId: idSchema.nullable().optional(),
  type: BlockTypeSchema,
  orderKey: idSchema,
  props: propsSchema,
  createdAt: dateSchema,
  updatedAt: dateSchema,
}).strict().refine((value) => validateBlockProps(value.type, value.props), { message: calloutPropsIssue })
const fileRecordSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  ownerId: idSchema,
  name: nameSchema,
  mimeType: z.string().trim().min(1).max(256),
  size: z.number().int().nonnegative(),
  objectKey: z.string().trim().min(1),
  url: z.string().optional(),
  createdAt: dateSchema,
  updatedAt: dateSchema,
}).strict()

export const UserRecordSchema = userRecordSchema
export const WorkspaceRecordSchema = workspaceRecordSchema
export const PageRecordSchema = pageRecordSchema
export const ServerBlockRecordSchema = serverBlockRecordSchema
export const FileRecordSchema = fileRecordSchema
export type AuthUserDto = z.infer<typeof UserRecordSchema>
export type WorkspaceResponse = z.infer<typeof WorkspaceRecordSchema>
export type PageResponse = z.infer<typeof PageRecordSchema>
export type BlockResponse = z.infer<typeof ServerBlockRecordSchema>
export type FileResponse = z.infer<typeof FileRecordSchema>
export const WorkspaceSnapshotResponseSchema = z.object({
  pages: z.array(PageRecordSchema),
  blocks: z.array(ServerBlockRecordSchema),
}).strict()
export type WorkspaceSnapshotResponse = z.infer<typeof WorkspaceSnapshotResponseSchema>
export const LoginResponseSchema = z.object({
  user: UserRecordSchema,
  expiresAt: dateSchema,
}).strict()
export type LoginResponse = z.infer<typeof LoginResponseSchema>

export const ApiErrorResponseSchema = z.object({
  statusCode: z.number().int().min(400).max(599),
  message: z.union([z.string(), z.array(z.string())]),
  error: z.string().optional(),
}).strict()
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>
