import type { Connection } from 'mongoose'

const capabilities = new WeakMap<Connection, Promise<boolean>>()

/** Standalone Mongo can serve legacy CRUD, but sync deletes require transactions. */
export function supportsTransactions(connection: Connection): Promise<boolean> {
  let capability = capabilities.get(connection)
  if (!capability) {
    capability = connection.db!.admin().command({ hello: 1 }).then(
      (hello) => typeof hello.setName === 'string' || hello.msg === 'isdbgrid',
    )
    capabilities.set(connection, capability)
  }
  return capability
}
