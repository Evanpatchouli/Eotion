import { Injectable } from '@nestjs/common'
import { nextOrderKey } from '@eotion/domain'
import type { Database, DatabaseProperty, DatabasePropertyValue, DatabaseTableRecord, DatabaseView, DatabaseViewConfig } from '@eotion/domain'
import { randomUUID } from 'node:crypto'

import { DatabaseService } from './database.service'
import { McpMutationService } from './mcp-mutation.service'
import { PageService } from './page.service'

type Scope = { workspaceId: string; databaseId: string; expectedDatabaseVersion: number; idempotencyKey: string }
export interface McpCreateRecordInput extends Scope { title: string; properties?: Record<string, DatabasePropertyValue> }
export interface McpUpdateRecordCellInput extends Scope {
  recordId: string; propertyId: string; value: DatabasePropertyValue; expectedRecordVersion: number; expectedPageUpdatedAt?: string
}
export interface McpCreatePropertyInput extends Scope {
  name: string; type: DatabaseProperty['type']; options?: DatabaseProperty['options']; config?: DatabaseProperty['config'] | Record<string, unknown>
}
export interface McpUpdatePropertyInput extends Scope {
  propertyId: string; expectedPropertyVersion: number; name?: string; options?: DatabaseProperty['options']; config?: DatabaseProperty['config'] | Record<string, unknown>
}
export interface McpCreateViewInput extends Scope { name: string; type: 'table' | 'list' | 'board' | 'timeline'; config?: DatabaseViewConfig }
export interface McpUpdateViewInput extends Scope {
  viewId: string; expectedViewVersion: number; name?: string; config?: DatabaseViewConfig
}
export interface McpRenameDatabaseInput extends Scope { name: string }

type Projection<I, T> = (value: I) => T
type DatabaseResult = { database: Database; record: DatabaseTableRecord }

@Injectable()
export class DatabaseMcpMutationService {
  constructor(
    private readonly mutations: McpMutationService,
    private readonly databases: DatabaseService,
    private readonly pages: PageService,
  ) {}

  async createRecord<T>(userId: string, input: McpCreateRecordInput, project: Projection<DatabaseResult, T>): Promise<T> {
    return this.mutate(userId, 'eotion_create_record', input, async session => {
      const pages = await this.pages.list(userId, input.workspaceId, session)
      const page = await this.databases.createRecordPage(userId, input.workspaceId, input.databaseId, {
        id: randomUUID(), pageId: randomUUID(), title: input.title,
        orderKey: nextOrderKey(pages.filter(item => item.parentPageId === null || item.parentPageId === undefined)),
        ...(input.properties === undefined ? {} : { properties: input.properties }),
      }, session, input.expectedDatabaseVersion)
      const database = (await this.databases.find(userId, input.workspaceId, input.databaseId, session))!
      return project({ database, record: page.record })
    })
  }

  async updateRecordCell<T>(userId: string, input: McpUpdateRecordCellInput, project: Projection<DatabaseResult, T>): Promise<T> {
    return this.mutate(userId, 'eotion_update_record_cell', input, async session => {
      const result = await this.databases.updateRecordCell(userId, input.workspaceId, input.databaseId, input.recordId, input.propertyId, {
        value: input.value, expectedDatabaseVersion: input.expectedDatabaseVersion,
        expectedRecordVersion: input.expectedRecordVersion,
        ...(input.expectedPageUpdatedAt === undefined ? {} : { expectedPageUpdatedAt: input.expectedPageUpdatedAt }),
      }, session)
      return project({ database: result.database, record: result.record })
    }, [{ kind: 'record', id: input.recordId }, { kind: 'property', id: input.propertyId }])
  }

  async createProperty<T>(userId: string, input: McpCreatePropertyInput, project: Projection<{ database: Database; property: DatabaseProperty }, T>): Promise<T> {
    return this.mutate(userId, 'eotion_create_property', input, async session => {
      const result = await this.databases.createProperty(userId, input.workspaceId, input.databaseId, {
        id: randomUUID(), name: input.name, type: input.type, expectedDatabaseVersion: input.expectedDatabaseVersion,
        ...(input.options === undefined ? {} : { options: input.options }), ...(input.config === undefined ? {} : { config: input.config as DatabaseProperty['config'] }),
      }, session)
      return project({ database: result.database, property: result.property })
    })
  }

  async updateProperty<T>(userId: string, input: McpUpdatePropertyInput, project: Projection<{ database: Database; property: DatabaseProperty }, T>): Promise<T> {
    return this.mutate(userId, 'eotion_update_property', input, async session => {
      const result = await this.databases.updateProperty(userId, input.workspaceId, input.databaseId, input.propertyId, {
        expectedDatabaseVersion: input.expectedDatabaseVersion, expectedPropertyVersion: input.expectedPropertyVersion,
        ...(input.name === undefined ? {} : { name: input.name }), ...(input.options === undefined ? {} : { options: input.options }),
        ...(input.config === undefined ? {} : { config: input.config as DatabaseProperty['config'] }),
      }, session)
      return project({ database: result.database, property: result.property })
    }, { kind: 'property', id: input.propertyId })
  }

  async createView<T>(userId: string, input: McpCreateViewInput, project: Projection<{ database: Database; view: DatabaseView }, T>): Promise<T> {
    return this.mutate(userId, 'eotion_create_view', input, async session => {
      const result = await this.databases.createView(userId, input.workspaceId, input.databaseId, {
        id: randomUUID(), name: input.name, type: input.type, expectedDatabaseVersion: input.expectedDatabaseVersion,
        ...(input.config === undefined ? {} : { config: input.config }),
      }, session)
      return project({ database: result.database, view: result.view })
    })
  }

  async updateView<T>(userId: string, input: McpUpdateViewInput, project: Projection<{ database: Database; view: DatabaseView }, T>): Promise<T> {
    return this.mutate(userId, 'eotion_update_view', input, async session => {
      const result = await this.databases.updateView(userId, input.workspaceId, input.databaseId, input.viewId, {
        expectedDatabaseVersion: input.expectedDatabaseVersion, expectedViewVersion: input.expectedViewVersion,
        ...(input.name === undefined ? {} : { name: input.name }), ...(input.config === undefined ? {} : { config: input.config }),
      }, session)
      return project({ database: result.database, view: result.view })
    }, { kind: 'view', id: input.viewId })
  }

  async renameDatabase<T>(userId: string, input: McpRenameDatabaseInput, project: Projection<{ database: Database }, T>): Promise<T> {
    return this.mutate(userId, 'eotion_rename_database', input, async session => {
      const result = await this.databases.renameDatabase(userId, input.workspaceId, input.databaseId, input.name, input.expectedDatabaseVersion, session)
      return project({ database: result.database })
    })
  }

  private mutate<T>(userId: string, tool: Parameters<McpMutationService['execute']>[1], input: Scope,
    operation: (session: import('mongoose').ClientSession) => Promise<T>,
    target?: { kind: 'property' | 'view' | 'record'; id: string } | { kind: 'property' | 'view' | 'record'; id: string }[]): Promise<T> {
    return this.mutations.execute(userId, tool, input.idempotencyKey, input, async session => {
      await this.databases.assertWriteScope(userId, input.workspaceId, input.databaseId, target, session)
    }, operation)
  }
}
