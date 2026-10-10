import { z } from 'zod'
import { BLOCK_TYPES, validateBlockProps } from '@eotion/domain/block-types'
import {
  isValidDatabase,
  isValidDatabaseProperty,
  isValidDatabasePropertyDefinition,
  isValidFormulaExpression,
  DATABASE_RELATION_MAX_LINKS,
  DATABASE_MAX_PROPERTIES,
  DATABASE_MAX_VIEWS,
  DATABASE_MAX_TABLE_ROWS,
  isValidDatabaseRecord,
  isValidDatabaseView,
  isValidDatabaseViewConfigShape,
  validateDatabaseRecordValues,
  validateDatabaseViewConfig,
} from '@eotion/domain/database'
import type { Database, DatabaseProperty, DatabasePropertyConfig, DatabaseRecord, DatabaseTableRecord, DatabaseView, DatabaseViewConfig } from '@eotion/domain/database'
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

export const McpTokenCreateRequestSchema = z.object({
  name: z.string().trim().min(1).max(64),
}).strict()
export type McpTokenCreateRequest = z.infer<typeof McpTokenCreateRequestSchema>

export const McpTokenMetadataSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(64),
  createdAt: dateSchema,
  lastUsedAt: dateSchema.nullable(),
}).strict()
export type McpTokenMetadataResponse = z.infer<typeof McpTokenMetadataSchema>

export const CreatedMcpTokenResponseSchema = z.object({
  token: z.string().regex(/^eotion_mcp_[A-Za-z0-9_-]{43}$/),
  credential: McpTokenMetadataSchema,
}).strict()
export type CreatedMcpTokenResponse = z.infer<typeof CreatedMcpTokenResponseSchema>

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
export type DatabaseTableRecordResponse = DatabaseTableRecord
export const DatabaseViewSchema = z.custom<DatabaseView>(isValidDatabaseView)
export type DatabaseViewResponse = z.infer<typeof DatabaseViewSchema>
export const DatabaseViewConfigSchema = z.custom<DatabaseViewConfig>(isValidDatabaseViewConfigShape)
export type DatabaseViewConfigRequest = z.infer<typeof DatabaseViewConfigSchema>

const databaseWindowQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: databaseStableIdSchema.optional(),
}).strict()
export const DatabaseListQuerySchema = databaseWindowQuerySchema
export const DatabaseViewListQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(DATABASE_MAX_VIEWS).default(DATABASE_MAX_VIEWS) }).strict()
export const DatabaseTableQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(DATABASE_MAX_TABLE_ROWS).default(50),
  cursor: z.string().min(1).max(16_384).refine(value => value.trim() === value).optional(),
}).strict()
export type DatabaseListQuery = z.infer<typeof DatabaseListQuerySchema>
export type DatabaseViewListQuery = z.infer<typeof DatabaseViewListQuerySchema>
export type DatabaseTableQuery = z.infer<typeof DatabaseTableQuerySchema>

export const DatabaseLinkInPageRequestSchema = z.object({
  databaseId: databaseStableIdSchema,
  viewId: databaseStableIdSchema,
  blockId: databaseStableIdSchema,
  orderKey: idSchema,
  parentBlockId: databaseStableIdSchema.nullable(),
}).strict()
export type DatabaseLinkInPageRequest = z.infer<typeof DatabaseLinkInPageRequestSchema>

export const DatabaseRecordPageCreateRequestSchema = z.object({
  id: databaseStableIdSchema,
  pageId: databaseStableIdSchema,
  title: nameSchema,
  orderKey: idSchema,
}).strict()
export type DatabaseRecordPageCreateRequest = z.infer<typeof DatabaseRecordPageCreateRequestSchema>

export const DatabaseWindowResponseSchema = z.object({ items: z.array(DatabaseSchema), nextCursor: databaseStableIdSchema.nullable() }).strict()
export type DatabaseWindowResponse = z.infer<typeof DatabaseWindowResponseSchema>
export const DatabaseNavigationItemSchema = z.object({
  id: databaseStableIdSchema,
  workspaceId: idSchema,
  name: databaseNameSchema,
  parentPageId: idSchema.nullable(),
  orderKey: idSchema,
  viewId: databaseStableIdSchema.nullable(),
}).strict()
export type DatabaseNavigationItem = z.infer<typeof DatabaseNavigationItemSchema>
export const DatabaseNavigationWindowResponseSchema = z.object({
  items: z.array(DatabaseNavigationItemSchema),
  nextCursor: databaseStableIdSchema.nullable(),
}).strict()
export type DatabaseNavigationWindowResponse = z.infer<typeof DatabaseNavigationWindowResponseSchema>
export type DatabaseTableResponse = {
  database: Database
  view: DatabaseView
  properties: DatabaseProperty[]
  records: DatabaseTableRecord[]
  nextCursor: string | null
}
export const DatabaseTableResponseSchema = z.custom<DatabaseTableResponse>(isValidDatabaseTableResponse)

function isValidDatabaseTableResponse(value: unknown): value is DatabaseTableResponse {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const table = value as Record<string, unknown>
  if (Object.keys(table).sort().join(',') !== 'database,nextCursor,properties,records,view') return false
  const database = table.database as Database
  const view = table.view as DatabaseView
  if (!isValidDatabase(database) || !isValidDatabaseView(view) || view.databaseId !== database.id || view.workspaceId !== database.workspaceId) return false
  if (!Array.isArray(table.properties) || table.properties.length > DATABASE_MAX_PROPERTIES || !table.properties.every(isValidDatabaseProperty)) return false
  const properties = table.properties as DatabaseProperty[]
  if (!properties.every(property => property.databaseId === database.id && property.workspaceId === database.workspaceId)) return false
  if (properties.filter(property => property.type === 'title').length !== 1 || new Set(properties.map(property => property.id)).size !== properties.length) return false
  if (!validateDatabaseViewConfig(view.config, properties)) return false
  if (!Array.isArray(table.records) || table.records.length > DATABASE_MAX_TABLE_ROWS || !table.records.every(record => isValidDatabaseTableRecord(record, properties))) return false
  if (!table.records.every(record => (record as DatabaseTableRecord).databaseId === database.id && (record as DatabaseTableRecord).workspaceId === database.workspaceId)) return false
  return table.nextCursor === null || (typeof table.nextCursor === 'string' && table.nextCursor.length > 0 && table.nextCursor.length <= 16_384 && table.nextCursor.trim() === table.nextCursor)
}

function isValidDatabaseTableRecord(value: unknown, properties: readonly DatabaseProperty[]): value is DatabaseTableRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (Object.keys(record).sort().join(',') !== 'createdAt,databaseId,id,pageId,pageVersion,properties,updatedAt,version,workspaceId') return false
  const { pageVersion, ...persistedShape } = record
  if (typeof pageVersion !== 'string' || !dateSchema.safeParse(pageVersion).success) return false
  const projected = record.properties
  const title = properties.find(property => property.type === 'title')
  if (!title || typeof projected !== 'object' || projected === null || Array.isArray(projected)) return false
  const storedValues = { ...(projected as Record<string, unknown>) }
  delete storedValues[title.id]
  for (const property of properties) if (property.type === 'rollup' || property.type === 'formula') delete storedValues[property.id]
  return validateDatabaseRecordValues(projected, properties)
    && isValidDatabaseRecord({ ...persistedShape, properties: storedValues }, properties)
}

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
  type: z.enum(['title', 'text', 'number', 'checkbox', 'select', 'date', 'relation', 'rollup', 'formula']),
  options: z.array(z.object({ id: databaseStableIdSchema, name: databaseNameSchema }).strict()).optional(),
  config: z.custom<DatabasePropertyConfig>((value) => isDatabasePropertyConfig(value)).optional(),
  expectedDatabaseVersion: z.number().int().positive().safe(),
}).strict().refine(value => {
  const { expectedDatabaseVersion: _version, ...definition } = value
  return isValidDatabasePropertyDefinition(definition)
}, { message: 'Invalid database property definition' })
export type DatabasePropertyCreateRequest = z.infer<typeof DatabasePropertyCreateRequestSchema>

export const DatabasePropertyUpdateRequestSchema = z.object({
  name: databaseNameSchema.optional(),
  options: z.array(z.object({ id: databaseStableIdSchema, name: databaseNameSchema }).strict()).optional(),
  config: z.custom<DatabasePropertyConfig>((value) => isDatabasePropertyConfig(value)).optional(),
  expectedDatabaseVersion: z.number().int().positive().safe(),
  expectedPropertyVersion: z.number().int().positive().safe(),
}).strict().refine(value => value.name !== undefined || value.options !== undefined || value.config !== undefined, { message: 'At least one field must be provided' })
export type DatabasePropertyUpdateRequest = z.infer<typeof DatabasePropertyUpdateRequestSchema>

export const DatabasePropertyDeleteRequestSchema = z.object({
  expectedDatabaseVersion: z.number().int().positive().safe(),
  expectedPropertyVersion: z.number().int().positive().safe(),
}).strict()
export type DatabasePropertyDeleteRequest = z.infer<typeof DatabasePropertyDeleteRequestSchema>

export const DatabaseRecordCellUpdateRequestSchema = z.object({
  value: z.string().or(z.number().finite()).or(z.boolean()).or(z.array(databaseStableIdSchema).max(DATABASE_RELATION_MAX_LINKS).refine(value => new Set(value).size === value.length)).nullable(),
  expectedDatabaseVersion: z.number().int().positive().safe(),
  expectedRecordVersion: z.number().int().positive().safe(),
  expectedPageUpdatedAt: dateSchema.optional(),
}).strict()
export type DatabaseRecordCellUpdateRequest = z.infer<typeof DatabaseRecordCellUpdateRequestSchema>

export const DatabaseRecordCreateRequestSchema = z.object({
  id: databaseStableIdSchema,
  pageId: databaseStableIdSchema,
  properties: z.record(databaseStableIdSchema, z.union([z.string(), z.number().finite(), z.boolean(), z.null(), z.array(databaseStableIdSchema).max(DATABASE_RELATION_MAX_LINKS).refine(value => new Set(value).size === value.length)])),
}).strict()
export type DatabaseRecordCreateRequest = z.infer<typeof DatabaseRecordCreateRequestSchema>

function isDatabasePropertyConfig(value: unknown): value is DatabasePropertyConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const config = value as Record<string, unknown>
  if (Object.hasOwn(config, 'targetDatabaseId')) return Object.keys(config).length === 1 && databaseStableIdSchema.safeParse(config.targetDatabaseId).success
  if (Object.hasOwn(config, 'relationPropertyId')) return Object.keys(config).length === 3
    && databaseStableIdSchema.safeParse(config.relationPropertyId).success && databaseStableIdSchema.safeParse(config.targetPropertyId).success
    && typeof config.aggregation === 'string' && ['count', 'count_values', 'sum', 'avg', 'min', 'max'].includes(config.aggregation)
  return Object.keys(config).length === 2 && isValidFormulaExpression(config.expression)
    && typeof config.resultType === 'string' && ['string', 'number', 'boolean', 'date', 'null'].includes(config.resultType)
}

export const DatabaseRelationCandidatesQuerySchema = z.object({
  search: z.string().max(200).optional(),
  cursor: z.string().min(1).max(16_384).refine(value => value.trim() === value).optional(),
  limit: z.coerce.number().int().min(1).max(DATABASE_RELATION_MAX_LINKS).default(DATABASE_RELATION_MAX_LINKS),
}).strict()
export type DatabaseRelationCandidatesQuery = z.infer<typeof DatabaseRelationCandidatesQuerySchema>
const databaseRelationOptionSchema = z.object({ recordId: databaseStableIdSchema, pageId: databaseStableIdSchema, title: z.string() }).strict()
export const DatabaseRelationCandidatesResponseSchema = z.object({
  items: z.array(databaseRelationOptionSchema).max(DATABASE_RELATION_MAX_LINKS),
  nextCursor: z.string().min(1).max(16_384).nullable(),
}).strict()
export type DatabaseRelationCandidatesResponse = z.infer<typeof DatabaseRelationCandidatesResponseSchema>
export const DatabaseRelationTitlesRequestSchema = z.object({
  recordIds: z.array(databaseStableIdSchema).max(DATABASE_RELATION_MAX_LINKS).refine(value => new Set(value).size === value.length),
}).strict()
export type DatabaseRelationTitlesRequest = z.infer<typeof DatabaseRelationTitlesRequestSchema>
export const DatabaseRelationTitlesResponseSchema = z.object({ items: z.array(databaseRelationOptionSchema).max(DATABASE_RELATION_MAX_LINKS) }).strict()
export type DatabaseRelationTitlesResponse = z.infer<typeof DatabaseRelationTitlesResponseSchema>

export const DatabaseViewCreateRequestSchema = z.object({
  id: databaseStableIdSchema,
  name: databaseNameSchema,
  type: z.literal('table'),
  config: DatabaseViewConfigSchema.optional(),
  expectedDatabaseVersion: z.number().int().positive().safe().optional(),
}).strict()
export type DatabaseViewCreateRequest = z.infer<typeof DatabaseViewCreateRequestSchema>
export const DatabaseViewHttpCreateRequestSchema = DatabaseViewCreateRequestSchema.extend({
  expectedDatabaseVersion: z.number().int().positive().safe(),
}).strict()
export type DatabaseViewHttpCreateRequest = z.infer<typeof DatabaseViewHttpCreateRequestSchema>
export const DatabaseViewUpdateRequestSchema = z.object({
  name: databaseNameSchema.optional(),
  config: DatabaseViewConfigSchema.optional(),
  expectedDatabaseVersion: z.number().int().positive().safe(),
  expectedViewVersion: z.number().int().positive().safe(),
}).strict().refine(value => value.name !== undefined || value.config !== undefined, 'At least one field must be provided')
export type DatabaseViewUpdateRequest = z.infer<typeof DatabaseViewUpdateRequestSchema>
export const DatabaseViewDeleteRequestSchema = z.object({
  expectedDatabaseVersion: z.number().int().positive().safe(),
  expectedViewVersion: z.number().int().positive().safe(),
}).strict()
export type DatabaseViewDeleteRequest = z.infer<typeof DatabaseViewDeleteRequestSchema>

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
  role: z.literal('database-record').optional(),
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
