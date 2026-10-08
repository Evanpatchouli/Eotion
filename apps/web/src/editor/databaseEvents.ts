export const DATABASE_RECORD_CREATED_EVENT = 'eotion:database-record-created'

export type DatabaseRecordCreatedDetail = { workspaceId: string; databaseId: string }

export function notifyDatabaseRecordCreated(detail: DatabaseRecordCreatedDetail): void {
  window.dispatchEvent(new CustomEvent<DatabaseRecordCreatedDetail>(DATABASE_RECORD_CREATED_EVENT, { detail }))
}
