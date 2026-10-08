export const DATABASE_RECORD_CREATED_EVENT = 'eotion:database-record-created'
export const DATABASE_UPDATED_EVENT = 'eotion:database-updated'

export type DatabaseRecordCreatedDetail = { workspaceId: string; databaseId: string }
export type DatabaseUpdatedDetail = { workspaceId: string; databaseId: string }

export function notifyDatabaseRecordCreated(detail: DatabaseRecordCreatedDetail): void {
  window.dispatchEvent(new CustomEvent<DatabaseRecordCreatedDetail>(DATABASE_RECORD_CREATED_EVENT, { detail }))
}

export function notifyDatabaseUpdated(detail: DatabaseUpdatedDetail): void {
  window.dispatchEvent(new CustomEvent<DatabaseUpdatedDetail>(DATABASE_UPDATED_EVENT, { detail }))
}
