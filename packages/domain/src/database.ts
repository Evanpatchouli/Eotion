export type DatabasePropertyType = 'title' | 'text' | 'number' | 'checkbox' | 'select' | 'date'

export interface Database {
  id: string
  workspaceId: string
  name: string
  version: number
  createdAt: string
  updatedAt: string
}

export interface DatabaseSelectOption {
  id: string
  name: string
}

export interface DatabaseProperty {
  id: string
  databaseId: string
  workspaceId: string
  name: string
  type: DatabasePropertyType
  version: number
  createdAt: string
  updatedAt: string
  options?: DatabaseSelectOption[]
}

export interface DatabasePropertyDefinition {
  id: string
  name: string
  type: DatabasePropertyType
  options?: DatabaseSelectOption[]
}

export type DatabasePropertyValue = string | number | boolean | null
export type DatabaseRecordValues = Record<string, DatabasePropertyValue>

export interface DatabaseReferenceAttrs {
  databaseId: string
  viewId: string
}

export interface DatabaseRecord {
  id: string
  databaseId: string
  workspaceId: string
  pageId: string
  properties: DatabaseRecordValues
  version: number
  createdAt: string
  updatedAt: string
}

export interface DatabaseView {
  id: string
  databaseId: string
  workspaceId: string
  name: string
  type: 'table'
  version: number
  createdAt: string
  updatedAt: string
}

const PROPERTY_TYPES: readonly string[] = ['title', 'text', 'number', 'checkbox', 'select', 'date']
const ENTITY_FIELDS = {
  database: ['id', 'workspaceId', 'name', 'version', 'createdAt', 'updatedAt'],
  property: ['id', 'databaseId', 'workspaceId', 'name', 'type', 'version', 'createdAt', 'updatedAt'],
  record: ['id', 'databaseId', 'workspaceId', 'pageId', 'properties', 'version', 'createdAt', 'updatedAt'],
  view: ['id', 'databaseId', 'workspaceId', 'name', 'type', 'version', 'createdAt', 'updatedAt'],
} as const

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateDatabaseReferenceAttrs(value: unknown): value is DatabaseReferenceAttrs {
  return isObject(value)
    && Object.keys(value).length === 2
    && Object.hasOwn(value, 'databaseId')
    && Object.hasOwn(value, 'viewId')
    && isStableId(value.databaseId)
    && isStableId(value.viewId)
}

function hasExactFields(value: Record<string, unknown>, fields: readonly string[], optional: readonly string[] = []): boolean {
  const allowed = new Set([...fields, ...optional])
  return fields.every((field) => Object.hasOwn(value, field))
    && Object.keys(value).every((field) => allowed.has(field))
}

function isStableId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 256 && value === value.trim()
}

function isName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 200 && value === value.trim()
}

function isCalendarDate(year: number, month: number, day: number, formatted: string): boolean {
  const date = new Date(0)
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCFullYear(year, month - 1, day)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === formatted
}

function isVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/u.exec(value)
  if (!match) return false
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  if (!isCalendarDate(year, month, day, `${yearText}-${monthText}-${dayText}`) || hour > 23 || minute > 59 || second > 59) return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && !Number.isNaN(new Date(timestamp).getTime())
}

function hasCommonEntityFields(value: Record<string, unknown>): boolean {
  return isStableId(value.id)
    && isStableId(value.workspaceId)
    && isName(value.name)
    && isVersion(value.version)
    && isIsoTimestamp(value.createdAt)
    && isIsoTimestamp(value.updatedAt)
}

export function isValidDatabase(value: unknown): value is Database {
  return isObject(value) && hasExactFields(value, ENTITY_FIELDS.database) && hasCommonEntityFields(value)
}

function isValidOption(value: unknown): value is DatabaseSelectOption {
  return isObject(value)
    && hasExactFields(value, ['id', 'name'])
    && isStableId(value.id)
    && isName(value.name)
}

export function isValidDatabasePropertyDefinition(value: unknown): value is DatabasePropertyDefinition {
  if (!isObject(value) || !hasExactFields(value, ['id', 'name', 'type'], ['options'])) return false
  if (!isStableId(value.id) || !isName(value.name) || !PROPERTY_TYPES.includes(String(value.type))) return false
  if (value.type !== 'select') return !Object.hasOwn(value, 'options')
  if (!Array.isArray(value.options)) return false
  const ids = new Set<string>()
  const names = new Set<string>()
  for (const option of value.options) {
    if (!isValidOption(option) || ids.has(option.id) || names.has(option.name)) return false
    ids.add(option.id)
    names.add(option.name)
  }
  return true
}

export function isValidDatabaseProperty(value: unknown): value is DatabaseProperty {
  if (!isObject(value) || !hasExactFields(value, ENTITY_FIELDS.property, ['options'])
    || !isStableId(value.databaseId) || !isStableId(value.workspaceId) || !isVersion(value.version)
    || !isIsoTimestamp(value.createdAt) || !isIsoTimestamp(value.updatedAt)) return false
  return isValidDatabasePropertyDefinition({ id: value.id, name: value.name, type: value.type, ...(Object.hasOwn(value, 'options') ? { options: value.options } : {}) })
}

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  return isCalendarDate(year, month, day, value)
}

function isValidPropertyValue(value: unknown, property: DatabaseProperty): boolean {
  if (value === null) return property.type !== 'title'
  switch (property.type) {
    case 'title': return typeof value === 'string' && value.trim().length > 0
    case 'text': return typeof value === 'string'
    case 'number': return typeof value === 'number' && Number.isFinite(value)
    case 'checkbox': return typeof value === 'boolean'
    case 'select': return typeof value === 'string' && property.options?.some((option) => option.id === value) === true
    case 'date': return typeof value === 'string' && isValidDateOnly(value)
  }
}

export function validateDatabaseRecordValues(values: unknown, properties: readonly DatabaseProperty[]): values is DatabaseRecordValues {
  if (!isObject(values) || !Array.isArray(properties)) return false
  const byId = new Map<string, DatabaseProperty>()
  let databaseId: string | undefined
  let workspaceId: string | undefined
  let titleProperty: DatabaseProperty | undefined
  for (const property of properties) {
    if (!isValidDatabaseProperty(property) || byId.has(property.id)
      || (databaseId !== undefined && property.databaseId !== databaseId)
      || (workspaceId !== undefined && property.workspaceId !== workspaceId)) return false
    databaseId = property.databaseId
    workspaceId = property.workspaceId
    if (property.type === 'title') {
      if (titleProperty) return false
      titleProperty = property
    }
    byId.set(property.id, property)
  }
  if (!titleProperty || !Object.hasOwn(values, titleProperty.id)
    || !isValidPropertyValue(values[titleProperty.id], titleProperty)) return false
  for (const [propertyId, value] of Object.entries(values)) {
    const property = byId.get(propertyId)
    if (!isStableId(propertyId) || !property || !isValidPropertyValue(value, property)) return false
  }
  return true
}

export function isValidDatabaseRecord(value: unknown, properties: readonly DatabaseProperty[]): value is DatabaseRecord {
  if (!isObject(value) || !hasExactFields(value, ENTITY_FIELDS.record)) return false
  if (!isStableId(value.id) || !isStableId(value.databaseId) || !isStableId(value.workspaceId)
    || !isStableId(value.pageId) || !isVersion(value.version)
    || !isIsoTimestamp(value.createdAt) || !isIsoTimestamp(value.updatedAt)
    || !validateDatabaseRecordValues(value.properties, properties)) return false
  return properties.every((property) => property.databaseId === value.databaseId && property.workspaceId === value.workspaceId)
}

export function isValidDatabaseView(value: unknown): value is DatabaseView {
  return isObject(value)
    && hasExactFields(value, ENTITY_FIELDS.view)
    && isStableId(value.id)
    && isStableId(value.databaseId)
    && isStableId(value.workspaceId)
    && isName(value.name)
    && value.type === 'table'
    && isVersion(value.version)
    && isIsoTimestamp(value.createdAt)
    && isIsoTimestamp(value.updatedAt)
}
