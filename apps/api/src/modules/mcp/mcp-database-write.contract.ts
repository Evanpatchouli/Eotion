import { z } from 'zod'
import { isValidDatabasePropertyDefinition, isValidDatabaseViewConfigShape } from '@eotion/domain'
import type { DatabasePropertyConfig } from '@eotion/domain'
import {
  McpDatabaseFilterSchema,
  McpDatabaseSortSchema,
  databaseSummarySchema,
  propertySchema,
  recordSchema,
  viewSchema,
} from './mcp-database-read.contract'

const idSchema = z.string().min(1).max(256).refine(value => value === value.trim(), 'Expected a stable database id')
const nameSchema = z.string().trim().min(1).max(200)
const versionSchema = z.number().int().positive().safe()
const idempotencyKeySchema = z.string().trim().min(1).max(128)
const valueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(idSchema).max(50).refine(ids => new Set(ids).size === ids.length, 'Record ids must be unique'),
  z.strictObject({
    start: z.string().min(1).max(64),
    end: z.string().min(1).max(64).optional(),
    timeZone: z.string().min(1).max(128).optional(),
  }),
])
const optionsSchema = z.array(z.strictObject({ id: idSchema, name: nameSchema }))
const propertyTypeSchema = z.enum(['title', 'text', 'number', 'checkbox', 'select', 'date', 'relation', 'rollup', 'formula'])
const configSchema = z.record(z.string(), z.unknown()).refine((config): config is DatabasePropertyConfig =>
  (['relation', 'rollup', 'formula'] as const).some(type =>
    isValidDatabasePropertyDefinition({ id: 'config-validation', name: 'Config validation', type, config }),
  ),
'Invalid property configuration')
const viewConfigSchema = z.strictObject({
  filters: z.array(McpDatabaseFilterSchema),
  sorts: z.array(McpDatabaseSortSchema),
  visibleProperties: z.array(idSchema).max(100).nullable(),
  propertyOrder: z.array(idSchema).max(100).nullable(),
  options: z.record(z.string(), z.unknown()).optional(),
}).refine(isValidDatabaseViewConfigShape, 'Invalid view configuration')

const commonInput = {
  workspaceId: idSchema,
  databaseId: idSchema,
  expectedDatabaseVersion: versionSchema,
  idempotencyKey: idempotencyKeySchema,
}

export const McpCreateRecordInputSchema = z.strictObject({
  ...commonInput,
  title: nameSchema,
  properties: z.record(idSchema, valueSchema).optional(),
})
export const McpCreateRecordOutputSchema = z.strictObject({ database: databaseSummarySchema, record: recordSchema })

export const McpUpdateRecordCellInputSchema = z.strictObject({
  ...commonInput,
  recordId: idSchema,
  propertyId: idSchema,
  value: valueSchema,
  expectedRecordVersion: versionSchema,
  expectedPageUpdatedAt: z.iso.datetime().optional(),
})
export const McpUpdateRecordCellOutputSchema = McpCreateRecordOutputSchema

export const McpCreatePropertyInputSchema = z.strictObject({
  ...commonInput,
  name: nameSchema,
  type: propertyTypeSchema,
  options: optionsSchema.optional(),
  config: configSchema.optional(),
}).refine(input => isValidDatabasePropertyDefinition({
  id: 'definition-validation',
  name: input.name,
  type: input.type,
  ...(input.options === undefined ? {} : { options: input.options }),
  ...(input.config === undefined ? {} : { config: input.config }),
}), 'Invalid property definition')
export const McpCreatePropertyOutputSchema = z.strictObject({ database: databaseSummarySchema, property: propertySchema })

export const McpUpdatePropertyInputSchema = z.strictObject({
  ...commonInput,
  propertyId: idSchema,
  expectedPropertyVersion: versionSchema,
  name: nameSchema.optional(),
  options: optionsSchema.optional(),
  config: configSchema.optional(),
}).refine(input => input.name !== undefined || input.options !== undefined || input.config !== undefined, 'At least one property field is required')
export const McpUpdatePropertyOutputSchema = McpCreatePropertyOutputSchema

export const McpCreateViewInputSchema = z.strictObject({
  ...commonInput,
  name: nameSchema,
  type: z.enum(['table', 'list', 'board', 'timeline']),
  config: viewConfigSchema.optional(),
})
export const McpCreateViewOutputSchema = z.strictObject({ database: databaseSummarySchema, view: viewSchema })

export const McpUpdateViewInputSchema = z.strictObject({
  ...commonInput,
  viewId: idSchema,
  expectedViewVersion: versionSchema,
  name: nameSchema.optional(),
  config: viewConfigSchema.optional(),
}).refine(input => input.name !== undefined || input.config !== undefined, 'At least one view field is required')
export const McpUpdateViewOutputSchema = McpCreateViewOutputSchema

export const McpRenameDatabaseInputSchema = z.strictObject({ ...commonInput, name: nameSchema })
export const McpRenameDatabaseOutputSchema = z.strictObject({ database: databaseSummarySchema })

export type McpCreateRecordInput = z.infer<typeof McpCreateRecordInputSchema>
export type McpUpdateRecordCellInput = z.infer<typeof McpUpdateRecordCellInputSchema>
export type McpCreatePropertyInput = z.infer<typeof McpCreatePropertyInputSchema>
export type McpUpdatePropertyInput = z.infer<typeof McpUpdatePropertyInputSchema>
export type McpCreateViewInput = z.infer<typeof McpCreateViewInputSchema>
export type McpUpdateViewInput = z.infer<typeof McpUpdateViewInputSchema>
export type McpRenameDatabaseInput = z.infer<typeof McpRenameDatabaseInputSchema>
