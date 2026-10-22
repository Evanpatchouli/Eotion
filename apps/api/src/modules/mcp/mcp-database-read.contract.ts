import { z } from 'zod'
import {
  DATABASE_MAX_PROPERTIES,
  DATABASE_MAX_TABLE_ROWS,
  DATABASE_RELATION_MAX_LINKS,
  DATABASE_VIEW_MAX_FILTERS,
  DATABASE_VIEW_MAX_SORTS,
  DATABASE_VIEW_TYPES,
} from '@eotion/domain'

const idSchema = z.string().trim().min(1).max(256)
const cursorSchema = z.string().min(1).max(16_384).refine(value => value.trim() === value)
const databaseCursorSchema = z.string().min(1).max(256).refine(value => value.trim() === value)
const timestampSchema = z.string().min(1).max(64)

const databaseSummarySchema = z.strictObject({
  id: idSchema,
  workspaceId: idSchema,
  name: z.string().min(1).max(200),
  version: z.number().int().positive(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

const selectOptionSchema = z.strictObject({ id: idSchema, name: z.string().min(1).max(200) })
const propertyTypeSchema = z.enum(['title', 'text', 'number', 'checkbox', 'select', 'date', 'relation', 'rollup', 'formula'])
const propertySchema = z.strictObject({
  id: idSchema,
  databaseId: idSchema,
  workspaceId: idSchema,
  name: z.string().min(1).max(200),
  type: propertyTypeSchema,
  version: z.number().int().positive(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  options: z.array(selectOptionSchema).max(100).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
})

const filterOperatorSchema = z.enum([
  'is', 'is_not', 'contains', 'does_not_contain', 'is_empty', 'is_not_empty',
  'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'checked', 'unchecked', 'before', 'after',
])
const noValueOperators = new Set(['is_empty', 'is_not_empty', 'checked', 'unchecked'])
export const McpDatabaseFilterSchema = z.strictObject({
  propertyId: idSchema,
  operator: filterOperatorSchema,
  value: z.union([z.string().max(2000), z.number().finite()]).optional(),
}).superRefine((filter, context) => {
  if (noValueOperators.has(filter.operator) && filter.value !== undefined) {
    context.addIssue({ code: 'custom', path: ['value'], message: 'This operator does not accept a value' })
  } else if (!noValueOperators.has(filter.operator) && filter.value === undefined) {
    context.addIssue({ code: 'custom', path: ['value'], message: 'This operator requires a value' })
  }
})
export const McpDatabaseSortSchema = z.strictObject({
  propertyId: idSchema,
  direction: z.enum(['asc', 'desc']),
})
const sortListSchema = z.array(McpDatabaseSortSchema).max(DATABASE_VIEW_MAX_SORTS).superRefine((sorts, context) => {
  const ids = new Set<string>()
  sorts.forEach((sort, index) => {
    if (ids.has(sort.propertyId)) context.addIssue({ code: 'custom', path: [index, 'propertyId'], message: 'Sort property ids must be unique' })
    ids.add(sort.propertyId)
  })
})
const filterListSchema = z.array(McpDatabaseFilterSchema).max(DATABASE_VIEW_MAX_FILTERS)
const propertyIdsSchema = z.array(idSchema).max(DATABASE_MAX_PROPERTIES).superRefine((ids, context) => {
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', message: 'Property ids must be unique' })
})

const viewConfigSchema = z.strictObject({
  filters: filterListSchema,
  sorts: sortListSchema,
  visibleProperties: z.array(idSchema).max(DATABASE_MAX_PROPERTIES).nullable(),
  propertyOrder: z.array(idSchema).max(DATABASE_MAX_PROPERTIES).nullable(),
  options: z.record(z.string(), z.unknown()).optional(),
})
const viewSchema = z.strictObject({
  id: idSchema,
  databaseId: idSchema,
  workspaceId: idSchema,
  name: z.string().min(1).max(200),
  type: z.enum(DATABASE_VIEW_TYPES),
  version: z.number().int().positive(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  config: viewConfigSchema.optional(),
})

const dateRangeValueSchema = z.strictObject({
  start: z.string().min(1).max(64),
  end: z.string().min(1).max(64).optional(),
  timeZone: z.string().min(1).max(128).optional(),
})
const recordValueSchema = z.union([
  z.string().max(20_000),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(z.string().max(256)).max(DATABASE_RELATION_MAX_LINKS),
  dateRangeValueSchema,
])
const recordSchema = z.strictObject({
  id: idSchema,
  databaseId: idSchema,
  workspaceId: idSchema,
  pageId: idSchema,
  properties: z.record(z.string().min(1).max(256), recordValueSchema),
  version: z.number().int().positive(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  pageVersion: timestampSchema,
})

export const McpListDatabasesInputSchema = z.strictObject({
  workspaceId: idSchema,
  cursor: databaseCursorSchema.optional(),
  limit: z.number().int().min(1).max(100).default(25),
})
export const McpListDatabasesOutputSchema = z.strictObject({
  items: z.array(databaseSummarySchema).max(100),
  nextCursor: idSchema.nullable(),
})

export const McpGetDatabaseSchemaInputSchema = z.strictObject({
  workspaceId: idSchema,
  databaseId: idSchema,
})
export const McpGetDatabaseSchemaOutputSchema = z.strictObject({
  database: databaseSummarySchema,
  properties: z.array(propertySchema).max(DATABASE_MAX_PROPERTIES),
  views: z.array(viewSchema).max(100),
  capabilities: z.strictObject({
    viewTypes: z.array(z.enum(DATABASE_VIEW_TYPES)).max(4),
    supportsTemporaryFiltersAndSorts: z.literal(true),
  }),
})

export const McpQueryDatabaseInputSchema = z.strictObject({
  workspaceId: idSchema,
  databaseId: idSchema,
  viewId: idSchema,
  cursor: cursorSchema.optional(),
  limit: z.number().int().min(1).max(DATABASE_MAX_TABLE_ROWS).default(25),
  filters: filterListSchema.optional(),
  sorts: sortListSchema.optional(),
  propertyIds: propertyIdsSchema.optional(),
})
export const McpQueryDatabaseOutputSchema = z.strictObject({
  database: databaseSummarySchema,
  view: viewSchema,
  properties: z.array(propertySchema).max(DATABASE_MAX_PROPERTIES),
  records: z.array(recordSchema).max(DATABASE_MAX_TABLE_ROWS),
  nextCursor: cursorSchema.nullable(),
  effectiveQuery: z.strictObject({
    filters: filterListSchema,
    sorts: sortListSchema,
    propertyIds: propertyIdsSchema,
  }),
})

export const McpGetRecordInputSchema = z.strictObject({
  workspaceId: idSchema,
  databaseId: idSchema,
  recordId: idSchema,
})
export const McpGetRecordOutputSchema = recordSchema

const relationSearchInputSchema = z.strictObject({
  mode: z.literal('search'),
  workspaceId: idSchema,
  databaseId: idSchema,
  search: z.string().max(200).optional(),
  cursor: cursorSchema.optional(),
  limit: z.number().int().min(1).max(DATABASE_RELATION_MAX_LINKS).default(25),
})
const relationResolveInputSchema = z.strictObject({
  mode: z.literal('resolve'),
  workspaceId: idSchema,
  databaseId: idSchema,
  recordIds: z.array(idSchema).max(DATABASE_RELATION_MAX_LINKS).superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', message: 'Record ids must be unique' })
  }),
})
export const McpResolveRelationRecordsInputSchema = z.discriminatedUnion('mode', [
  relationSearchInputSchema,
  relationResolveInputSchema,
])
export const McpResolveRelationRecordsOutputSchema = z.strictObject({
  items: z.array(z.strictObject({ recordId: idSchema, pageId: idSchema, title: z.string() })).max(DATABASE_RELATION_MAX_LINKS),
  nextCursor: cursorSchema.nullable(),
})

export type McpDatabaseFilter = z.infer<typeof McpDatabaseFilterSchema>
export type McpDatabaseSort = z.infer<typeof McpDatabaseSortSchema>
