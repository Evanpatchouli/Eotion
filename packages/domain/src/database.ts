export type DatabasePropertyType = 'title' | 'text' | 'number' | 'checkbox' | 'select' | 'date' | 'relation' | 'rollup' | 'formula'
export type DatabaseBasePropertyType = Exclude<DatabasePropertyType, 'relation' | 'rollup' | 'formula'>
export type DatabaseFormulaResultType = 'string' | 'number' | 'boolean' | 'date' | 'null'
export type DatabaseRollupAggregation = 'count' | 'count_values' | 'sum' | 'avg' | 'min' | 'max'
export type FormulaExpression =
  | { kind: 'literal'; value: string | number | boolean | null; valueType?: 'date' }
  | { kind: 'property'; propertyId: string }
  | { kind: 'binary'; operator: '+' | '-' | '*' | '/' | '==' | '!=' | '>' | '>=' | '<' | '<=' | 'and' | 'or'; left: FormulaExpression; right: FormulaExpression }
  | { kind: 'unary'; operator: 'not'; operand: FormulaExpression }
  | { kind: 'if'; condition: FormulaExpression; then: FormulaExpression; else: FormulaExpression }
  | { kind: 'call'; name: 'empty' | 'concat'; args: FormulaExpression[] }
export type DatabasePropertyConfig =
  | { targetDatabaseId: string }
  | { relationPropertyId: string; targetPropertyId: string; aggregation: DatabaseRollupAggregation }
  | { expression: FormulaExpression; resultType: DatabaseFormulaResultType }
export const DATABASE_MAX_PROPERTIES = 100
export const DATABASE_MAX_VIEWS = 100
export const DATABASE_MAX_TABLE_ROWS = 100
export const DATABASE_VIEW_MAX_FILTERS = 20
export const DATABASE_VIEW_MAX_SORTS = 10
export const DATABASE_RELATION_MAX_LINKS = 50
export const DATABASE_RELATION_SEARCH_MAX_RECORDS = 5_000
export const DATABASE_DERIVED_MAX_RECORDS = 100
export const DATABASE_DERIVED_MAX_LINKED_RECORDS = 5_000
export const DATABASE_ADVANCED_MAX_WORKSPACE_PROPERTIES = 1_000
export const DATABASE_RELATION_CLEANUP_MAX_RECORDS = 10_000
export const DATABASE_RECORD_SCAN_MAX_RECORDS = 10_000
export const DATABASE_FORMULA_MAX_NODES = 128
export const DATABASE_FORMULA_MAX_DEPTH = 16
export const DATABASE_FORMULA_MAX_STRING_LENGTH = 20_000
export const DATABASE_DERIVED_MAX_DEPENDENCY_DEPTH = 16

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
  config?: DatabasePropertyConfig
}

export interface DatabasePropertyDefinition {
  id: string
  name: string
  type: DatabasePropertyType
  options?: DatabaseSelectOption[]
  config?: DatabasePropertyConfig
}

export type DatabasePropertyValue = string | number | boolean | null | string[]
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

/** Database record as returned by the API after projecting Page.title into its title property. */
export interface DatabaseTableRecord extends Omit<DatabaseRecord, 'properties'> {
  properties: DatabaseRecordValues
  pageVersion: string
}

export interface DatabaseView {
  id: string
  databaseId: string
  workspaceId: string
  name: string
  type: 'table'
  /** Absent on legacy stored views; repositories project the default config. */
  config?: DatabaseViewConfig
  version: number
  createdAt: string
  updatedAt: string
}

export type DatabaseFilterOperator = 'is' | 'is_not' | 'contains' | 'does_not_contain' | 'is_empty' | 'is_not_empty' | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'checked' | 'unchecked' | 'before' | 'after'
export interface DatabaseFilter {
  propertyId: string
  operator: DatabaseFilterOperator
  value?: string | number
}
export type DatabaseSortDirection = 'asc' | 'desc'
export interface DatabaseSort {
  propertyId: string
  direction: DatabaseSortDirection
}
export interface DatabaseViewConfig {
  filters: DatabaseFilter[]
  sorts: DatabaseSort[]
  visibleProperties: string[] | null
  propertyOrder: string[] | null
}

export const DEFAULT_DATABASE_VIEW_CONFIG: DatabaseViewConfig = {
  filters: [], sorts: [], visibleProperties: null, propertyOrder: null,
}

const FILTER_OPERATORS: readonly string[] = ['is', 'is_not', 'contains', 'does_not_contain', 'is_empty', 'is_not_empty', 'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'checked', 'unchecked', 'before', 'after']
const NO_VALUE_FILTER_OPERATORS = new Set(['is_empty', 'is_not_empty', 'checked', 'unchecked'])
const FILTERS_BY_TYPE: Record<DatabasePropertyType, readonly string[]> = {
  title: ['is', 'is_not', 'contains', 'does_not_contain', 'is_empty', 'is_not_empty'],
  text: ['is', 'is_not', 'contains', 'does_not_contain', 'is_empty', 'is_not_empty'],
  number: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_not_empty'],
  checkbox: ['checked', 'unchecked'],
  select: ['is', 'is_not', 'is_empty', 'is_not_empty'],
  date: ['is', 'before', 'after', 'is_empty', 'is_not_empty'],
  relation: ['is_empty', 'is_not_empty'],
  rollup: [],
  formula: [],
}

/** Checks the strict wire shape without needing the referenced database properties. */
export function isValidDatabaseViewConfigShape(value: unknown): value is DatabaseViewConfig {
  if (!isObject(value) || !hasExactFields(value, ['filters', 'sorts', 'visibleProperties', 'propertyOrder'])) return false
  if (!Array.isArray(value.filters) || value.filters.length > DATABASE_VIEW_MAX_FILTERS || !Array.isArray(value.sorts) || value.sorts.length > DATABASE_VIEW_MAX_SORTS) return false
  for (const filter of value.filters) {
    if (!isObject(filter) || !hasExactFields(filter, ['propertyId', 'operator'], ['value'])
      || !isStableId(filter.propertyId) || typeof filter.operator !== 'string' || !FILTER_OPERATORS.includes(filter.operator)) return false
    if (NO_VALUE_FILTER_OPERATORS.has(filter.operator)) {
      if (Object.hasOwn(filter, 'value')) return false
    } else if (!Object.hasOwn(filter, 'value') || !(typeof filter.value === 'string' && filter.value.length <= 2000 || (typeof filter.value === 'number' && Number.isFinite(filter.value)))) return false
  }
  const sortIds = new Set<string>()
  for (const sort of value.sorts) {
    if (!isObject(sort) || !hasExactFields(sort, ['propertyId', 'direction']) || !isStableId(sort.propertyId)
      || (sort.direction !== 'asc' && sort.direction !== 'desc') || sortIds.has(sort.propertyId)) return false
    sortIds.add(sort.propertyId)
  }
  for (const ids of [value.visibleProperties, value.propertyOrder]) {
    if (ids !== null && (!Array.isArray(ids) || ids.length > DATABASE_MAX_PROPERTIES || !ids.every(isStableId) || new Set(ids).size !== ids.length)) return false
  }
  return true
}

/** Validates both config structure and property-specific filter/operator semantics. */
export function validateDatabaseViewConfig(value: unknown, properties: readonly DatabaseProperty[]): value is DatabaseViewConfig {
  if (!isValidDatabaseViewConfigShape(value) || !Array.isArray(properties)) return false
  const byId = new Map<string, DatabaseProperty>()
  let databaseId: string | undefined
  let workspaceId: string | undefined
  let titleId: string | undefined
  for (const property of properties) {
    if (!isValidDatabaseProperty(property) || byId.has(property.id)
      || (databaseId !== undefined && property.databaseId !== databaseId)
      || (workspaceId !== undefined && property.workspaceId !== workspaceId)) return false
    databaseId = property.databaseId
    workspaceId = property.workspaceId
    byId.set(property.id, property)
    if (property.type === 'title') {
      if (titleId !== undefined) return false
      titleId = property.id
    }
  }
  if (titleId === undefined) return false
  for (const filter of value.filters) {
    const property = byId.get(filter.propertyId)
    if (!property || !FILTERS_BY_TYPE[property.type].includes(filter.operator)) return false
    if (NO_VALUE_FILTER_OPERATORS.has(filter.operator)) continue
    if (property.type === 'number') {
      if (typeof filter.value !== 'number' || !Number.isFinite(filter.value)) return false
    } else {
      if (typeof filter.value !== 'string') return false
      if (property.type === 'select' && !property.options?.some(option => option.id === filter.value)) return false
      if (property.type === 'date' && !isValidDateOnly(filter.value)) return false
    }
  }
  if (value.sorts.some(sort => !byId.has(sort.propertyId) || ['relation', 'rollup', 'formula'].includes(byId.get(sort.propertyId)!.type))) return false
  for (const ids of [value.visibleProperties, value.propertyOrder]) {
    if (ids !== null && ids.some(id => !byId.has(id))) return false
  }
  return value.visibleProperties === null || value.visibleProperties.includes(titleId)
}

const PROPERTY_TYPES: readonly string[] = ['title', 'text', 'number', 'checkbox', 'select', 'date', 'relation', 'rollup', 'formula']
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
  if (!isObject(value) || !hasExactFields(value, ['id', 'name', 'type'], ['options', 'config'])) return false
  if (!isStableId(value.id) || !isName(value.name) || typeof value.type !== 'string' || !PROPERTY_TYPES.includes(value.type)) return false
  if (value.type !== 'select' && Object.hasOwn(value, 'options')) return false
  if (value.type === 'select' && !Array.isArray(value.options)) return false
  const ids = new Set<string>()
  const names = new Set<string>()
  for (const option of value.type === 'select' ? value.options as unknown[] : []) {
    if (!isValidOption(option) || ids.has(option.id) || names.has(option.name)) return false
    ids.add(option.id)
    names.add(option.name)
  }
  if (value.type === 'relation') return isObject(value.config) && hasExactFields(value.config, ['targetDatabaseId']) && isStableId(value.config.targetDatabaseId)
  if (value.type === 'rollup') return isObject(value.config)
    && hasExactFields(value.config, ['relationPropertyId', 'targetPropertyId', 'aggregation'])
    && isStableId(value.config.relationPropertyId) && isStableId(value.config.targetPropertyId)
    && typeof value.config.aggregation === 'string' && ['count', 'count_values', 'sum', 'avg', 'min', 'max'].includes(value.config.aggregation)
  if (value.type === 'formula') return isObject(value.config)
    && hasExactFields(value.config, ['expression', 'resultType'])
    && typeof value.config.resultType === 'string' && ['string', 'number', 'boolean', 'date', 'null'].includes(value.config.resultType)
    && isValidFormulaExpression(value.config.expression)
  return !Object.hasOwn(value, 'config')
}

export function isValidDatabaseProperty(value: unknown): value is DatabaseProperty {
  if (!isObject(value) || !hasExactFields(value, ENTITY_FIELDS.property, ['options', 'config'])
    || !isStableId(value.databaseId) || !isStableId(value.workspaceId) || !isVersion(value.version)
    || !isIsoTimestamp(value.createdAt) || !isIsoTimestamp(value.updatedAt)) return false
  return isValidDatabasePropertyDefinition({ id: value.id, name: value.name, type: value.type, ...(Object.hasOwn(value, 'options') ? { options: value.options } : {}), ...(Object.hasOwn(value, 'config') ? { config: value.config } : {}) })
}

export function isValidFormulaExpression(value: unknown): value is FormulaExpression {
  let count = 0
  const seen = new Set<object>()
  function walk(node: unknown, depth: number): boolean {
    if (!isObject(node) || depth > DATABASE_FORMULA_MAX_DEPTH || ++count > DATABASE_FORMULA_MAX_NODES || seen.has(node)) return false
    seen.add(node)
    if (node.kind === 'literal') return hasExactFields(node, ['kind', 'value'], ['valueType'])
      && (node.valueType === undefined || node.valueType === 'date')
      && (node.valueType === 'date' ? typeof node.value === 'string' && isValidDateOnly(node.value)
        : node.value === null || typeof node.value === 'string' && node.value.length <= DATABASE_FORMULA_MAX_STRING_LENGTH || typeof node.value === 'boolean' || typeof node.value === 'number' && Number.isFinite(node.value))
    if (node.kind === 'property') return hasExactFields(node, ['kind', 'propertyId']) && isStableId(node.propertyId)
    if (node.kind === 'binary') return hasExactFields(node, ['kind', 'operator', 'left', 'right'])
      && typeof node.operator === 'string' && ['+', '-', '*', '/', '==', '!=', '>', '>=', '<', '<=', 'and', 'or'].includes(node.operator)
      && walk(node.left, depth + 1) && walk(node.right, depth + 1)
    if (node.kind === 'unary') return hasExactFields(node, ['kind', 'operator', 'operand']) && node.operator === 'not' && walk(node.operand, depth + 1)
    if (node.kind === 'if') return hasExactFields(node, ['kind', 'condition', 'then', 'else'])
      && walk(node.condition, depth + 1) && walk(node.then, depth + 1) && walk(node.else, depth + 1)
    if (node.kind === 'call') return hasExactFields(node, ['kind', 'name', 'args'])
      && (node.name === 'empty' || node.name === 'concat') && Array.isArray(node.args)
      && (node.name === 'empty' ? node.args.length === 1 : node.args.length >= 1 && node.args.length <= 20)
      && node.args.every((arg: unknown) => walk(arg, depth + 1))
    return false
  }
  return walk(value, 1)
}

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  return isCalendarDate(year, month, day, value)
}

function isValidPropertyValue(value: unknown, property: DatabaseProperty): boolean {
  if (value === null) return property.type !== 'title' && property.type !== 'relation'
  switch (property.type) {
    case 'title': return typeof value === 'string' && value.trim().length > 0
    case 'text': return typeof value === 'string'
    case 'number': return typeof value === 'number' && Number.isFinite(value)
    case 'checkbox': return typeof value === 'boolean'
    case 'select': return typeof value === 'string' && property.options?.some((option) => option.id === value) === true
    case 'date': return typeof value === 'string' && isValidDateOnly(value)
    case 'relation': return Array.isArray(value) && value.length <= DATABASE_RELATION_MAX_LINKS && value.every(isStableId) && new Set(value).size === value.length
    case 'rollup': return value === null || typeof value === 'number' && Number.isFinite(value)
    case 'formula': return isValidFormulaResult(value, (property.config as { resultType: DatabaseFormulaResultType }).resultType)
  }
}

export function isValidFormulaResult(value: unknown, resultType: DatabaseFormulaResultType): boolean {
  if (value === null) return true
  if (resultType === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (resultType === 'boolean') return typeof value === 'boolean'
  if (resultType === 'date') return typeof value === 'string' && isValidDateOnly(value)
  return resultType === 'string' && typeof value === 'string'
}

function formulaType(expression: FormulaExpression, properties: ReadonlyMap<string, DatabaseProperty>): DatabaseFormulaResultType | 'relation' | null {
  switch (expression.kind) {
    case 'literal': return expression.valueType === 'date' ? 'date' : expression.value === null ? 'null' : typeof expression.value as DatabaseFormulaResultType
    case 'property': {
      const property = properties.get(expression.propertyId)
      if (!property) return null
      if (property.type === 'relation') return 'relation'
      if (property.type === 'formula') return (property.config as { resultType: DatabaseFormulaResultType }).resultType
      if (property.type === 'rollup' || property.type === 'number') return 'number'
      if (property.type === 'checkbox') return 'boolean'
      return property.type === 'date' ? 'date' : 'string'
    }
    case 'unary': return formulaType(expression.operand, properties) === 'boolean' ? 'boolean' : null
    case 'if': {
      if (formulaType(expression.condition, properties) !== 'boolean') return null
      const yes = formulaType(expression.then, properties)
      const no = formulaType(expression.else, properties)
      return yes === no ? yes : yes === 'null' ? no : no === 'null' ? yes : null
    }
    case 'call': {
      const types = expression.args.map(arg => formulaType(arg, properties))
      if (expression.name === 'empty') return types[0] ? 'boolean' : null
      return types.every(type => type === 'string' || type === 'null') ? 'string' : null
    }
    case 'binary': {
      const left = formulaType(expression.left, properties)
      const right = formulaType(expression.right, properties)
      if (!left || !right) return null
      if (['and', 'or'].includes(expression.operator)) return left === 'boolean' && right === 'boolean' ? 'boolean' : null
      if (['+', '-', '*', '/'].includes(expression.operator)) return left === 'number' && right === 'number' ? 'number' : null
      if (['==', '!='].includes(expression.operator)) return left !== 'relation' && right !== 'relation' && (left === right || left === 'null' || right === 'null') ? 'boolean' : null
      return left === right && (left === 'number' || left === 'date' || left === 'string') ? 'boolean' : null
    }
  }
}

/** Validates formula types and cycles in one database, plus rollup target types through the resolver. */
export function validateDatabasePropertyDependencies(
  properties: readonly DatabaseProperty[],
  resolveTargetProperties?: (databaseId: string) => readonly DatabaseProperty[] | undefined,
): boolean {
  if (!Array.isArray(properties) || properties.length > DATABASE_MAX_PROPERTIES || !properties.every(isValidDatabaseProperty)) return false
  const byId = new Map(properties.map(property => [property.id, property]))
  if (byId.size !== properties.length || properties.some(property => property.databaseId !== properties[0]?.databaseId || property.workspaceId !== properties[0]?.workspaceId)) return false
  const edges = new Map<string, string[]>()
  for (const property of properties) {
    if (property.type === 'rollup') {
      const config = property.config as { relationPropertyId: string; targetPropertyId: string; aggregation: DatabaseRollupAggregation }
      const relation = byId.get(config.relationPropertyId)
      if (relation?.type !== 'relation') return false
      const targetDatabaseId = (relation.config as { targetDatabaseId: string }).targetDatabaseId
      const targets = targetDatabaseId === property.databaseId ? properties : resolveTargetProperties?.(targetDatabaseId)
      const target = targets?.find(item => item.id === config.targetPropertyId)
      if (!target || !isValidDatabaseProperty(target) || target.databaseId !== targetDatabaseId || target.workspaceId !== property.workspaceId
        || ['relation', 'rollup', 'formula'].includes(target.type)) return false
      if (['sum', 'avg'].includes(config.aggregation) && target.type !== 'number') return false
      if (['min', 'max'].includes(config.aggregation) && target.type !== 'number') return false
      edges.set(property.id, [relation.id])
    }
    if (property.type === 'formula') {
      const config = property.config as { expression: FormulaExpression; resultType: DatabaseFormulaResultType }
      if (formulaType(config.expression, byId) !== config.resultType) return false
      const refs: string[] = []
      function collect(node: FormulaExpression): void {
        if (node.kind === 'property') refs.push(node.propertyId)
        else if (node.kind === 'binary') { collect(node.left); collect(node.right) }
        else if (node.kind === 'unary') collect(node.operand)
        else if (node.kind === 'if') { collect(node.condition); collect(node.then); collect(node.else) }
        else if (node.kind === 'call') node.args.forEach(collect)
      }
      collect(config.expression)
      edges.set(property.id, refs)
    }
  }
  const visiting = new Set<string>()
  const heights = new Map<string, number>()
  function height(id: string): number | null {
    if (visiting.has(id)) return null
    const cached = heights.get(id)
    if (cached !== undefined) return cached
    visiting.add(id)
    let longest = 1
    for (const next of edges.get(id) ?? []) {
      if (!byId.has(next)) return null
      const child = height(next)
      if (child === null) return null
      longest = Math.max(longest, child + 1)
    }
    visiting.delete(id)
    heights.set(id, longest)
    return longest
  }
  return properties.every(property => {
    const length = height(property.id)
    return length !== null && length <= DATABASE_DERIVED_MAX_DEPENDENCY_DEPTH
  })
}

/** Pure evaluation; invalid runtime values, overflow and division by zero resolve to null. */
export function evaluateDatabaseFormula(expression: FormulaExpression, readProperty: (propertyId: string) => DatabasePropertyValue | undefined): DatabasePropertyValue {
  if (!isValidFormulaExpression(expression)) return null
  function evalNode(node: FormulaExpression): DatabasePropertyValue {
    if (node.kind === 'literal') return node.value
    if (node.kind === 'property') {
      const value = readProperty(node.propertyId) ?? null
      return typeof value === 'string' && value.length > DATABASE_FORMULA_MAX_STRING_LENGTH
        || typeof value === 'number' && !Number.isFinite(value)
        || Array.isArray(value) && value.length > DATABASE_RELATION_MAX_LINKS ? null : value
    }
    if (node.kind === 'if') {
      const condition = evalNode(node.condition)
      return condition === true ? evalNode(node.then) : condition === false ? evalNode(node.else) : null
    }
    if (node.kind === 'unary') { const value = evalNode(node.operand); return typeof value === 'boolean' ? !value : null }
    if (node.kind === 'call') {
      const values = node.args.map(evalNode)
      if (node.name === 'empty') return values[0] === null || values[0] === '' || Array.isArray(values[0]) && values[0].length === 0
      if (!values.every(value => value === null || typeof value === 'string')) return null
      let length = 0
      for (const value of values) {
        length += typeof value === 'string' ? value.length : 0
        if (length > DATABASE_FORMULA_MAX_STRING_LENGTH) return null
      }
      return values.map(value => value ?? '').join('')
    }
    const left = evalNode(node.left)
    if (node.operator === 'and' && left === false) return false
    if (node.operator === 'or' && left === true) return true
    const right = evalNode(node.right)
    if (node.operator === '==' || node.operator === '!=') {
      if (Array.isArray(left) || Array.isArray(right) || left !== null && right !== null && typeof left !== typeof right) return null
      return node.operator === '==' ? left === right : left !== right
    }
    if (left === null || right === null) return null
    if (node.operator === 'and' || node.operator === 'or') return typeof left === 'boolean' && typeof right === 'boolean' ? node.operator === 'and' ? left && right : left || right : null
    if (['+', '-', '*', '/'].includes(node.operator)) {
      if (typeof left !== 'number' || typeof right !== 'number' || !Number.isFinite(left) || !Number.isFinite(right) || node.operator === '/' && right === 0) return null
      const result = node.operator === '+' ? left + right : node.operator === '-' ? left - right : node.operator === '*' ? left * right : left / right
      return Number.isFinite(result) ? result : null
    }
    if (typeof left !== typeof right || !(typeof left === 'number' && Number.isFinite(left) && Number.isFinite(right) || typeof left === 'string' && typeof right === 'string')) return null
    return node.operator === '>' ? left > right : node.operator === '>=' ? left >= right : node.operator === '<' ? left < right : left <= right
  }
  return evalNode(expression)
}

export function evaluateDatabaseRollup(values: readonly DatabasePropertyValue[], aggregation: DatabaseRollupAggregation): number | null {
  if (!Array.isArray(values) || values.length > DATABASE_RELATION_MAX_LINKS || !['count', 'count_values', 'sum', 'avg', 'min', 'max'].includes(aggregation)) return null
  if (aggregation === 'count') return values.length
  const nonempty = values.filter(value => value !== null && value !== '' && (!Array.isArray(value) || value.length > 0))
  if (aggregation === 'count_values') return nonempty.length
  if (!nonempty.every(value => typeof value === 'number' && Number.isFinite(value))) return null
  const numbers = nonempty as number[]
  if (numbers.length === 0) return null
  const result = aggregation === 'sum' ? numbers.reduce((a, b) => a + b, 0)
    : aggregation === 'avg' ? numbers.reduce((a, b) => a + b, 0) / numbers.length
      : aggregation === 'min' ? Math.min(...numbers) : Math.max(...numbers)
  return Number.isFinite(result) ? result : null
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

/** Validates persisted values, where the Page is authoritative for its title. */
export function validateStoredDatabaseRecordValues(values: unknown, properties: readonly DatabaseProperty[]): values is DatabaseRecordValues {
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
  if (!titleProperty || Object.hasOwn(values, titleProperty.id)) return false
  return Object.entries(values).every(([propertyId, value]) => {
    const property = byId.get(propertyId)
    return isStableId(propertyId) && property !== undefined && property.type !== 'title' && property.type !== 'rollup' && property.type !== 'formula' && isValidPropertyValue(value, property)
  })
}

export function isValidDatabaseRecord(value: unknown, properties: readonly DatabaseProperty[]): value is DatabaseRecord {
  if (!isObject(value) || !hasExactFields(value, ENTITY_FIELDS.record)) return false
  if (!isStableId(value.id) || !isStableId(value.databaseId) || !isStableId(value.workspaceId)
    || !isStableId(value.pageId) || !isVersion(value.version)
    || !isIsoTimestamp(value.createdAt) || !isIsoTimestamp(value.updatedAt)
    || !validateStoredDatabaseRecordValues(value.properties, properties)) return false
  return properties.every((property) => property.databaseId === value.databaseId && property.workspaceId === value.workspaceId)
}

export function isValidDatabaseView(value: unknown): value is DatabaseView {
  return isObject(value)
    && hasExactFields(value, ENTITY_FIELDS.view, ['config'])
    && isStableId(value.id)
    && isStableId(value.databaseId)
    && isStableId(value.workspaceId)
    && isName(value.name)
    && value.type === 'table'
    && (!Object.hasOwn(value, 'config') || isValidDatabaseViewConfigShape(value.config))
    && isVersion(value.version)
    && isIsoTimestamp(value.createdAt)
    && isIsoTimestamp(value.updatedAt)
}
