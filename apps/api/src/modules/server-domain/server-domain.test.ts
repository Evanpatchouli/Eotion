import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { getConnectionToken, getModelToken, MongooseModule } from '@nestjs/mongoose'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import type { Connection, Model } from 'mongoose'

import { ServerDomainModule } from './server-domain.module'
import { BlockEntity } from './schemas/block.schema'
import { FileMetadataEntity } from './schemas/file-metadata.schema'
import { PageEntity } from './schemas/page.schema'
import { WorkspaceEntity } from './schemas/workspace.schema'
import { BlockService } from './services/block.service'
import { FileMetadataService } from './services/file-metadata.service'
import { PageService } from './services/page.service'
import { WorkspaceService } from './services/workspace.service'

function testMongoUri(): string {
  const base = process.env.P4_TEST_MONGODB_URI?.trim() || 'mongodb://127.0.0.1:27017'
  const uri = new URL(base)
  uri.pathname = `/eotion_domain_test_${randomUUID().replaceAll('-', '')}`
  return uri.toString()
}

@Module({
  imports: [MongooseModule.forRoot(testMongoUri()), ServerDomainModule],
})
class ServerDomainTestModule {}

test('server domain persists scoped records and creates the declared Mongo indexes', async (t) => {
  const app = await NestFactory.createApplicationContext(ServerDomainTestModule, { logger: false })
  const connection = app.get<Connection>(getConnectionToken())
  const workspaces = app.get(WorkspaceService)
  const pages = app.get(PageService)
  const blocks = app.get(BlockService)
  const files = app.get(FileMetadataService)

  t.after(async () => {
    try {
      await connection.dropDatabase()
    } finally {
      await app.close()
    }
  })

  const workspaceModel = app.get<Model<unknown>>(getModelToken(WorkspaceEntity.name))
  const pageModel = app.get<Model<unknown>>(getModelToken(PageEntity.name))
  const blockModel = app.get<Model<unknown>>(getModelToken(BlockEntity.name))
  const fileModel = app.get<Model<unknown>>(getModelToken(FileMetadataEntity.name))
  await Promise.all([workspaceModel.init(), pageModel.init(), blockModel.init(), fileModel.init()])

  const workspaceA = await workspaces.create({ id: 'workspace-a', name: 'A', ownerId: 'owner-a' })
  const workspaceB = await workspaces.create({ id: 'workspace-b', name: 'B', ownerId: 'owner-b' })
  assert.equal((await workspaces.findById(workspaceA.id))?.name, 'A')
  await assert.rejects(
    workspaces.create({ id: workspaceA.id, name: 'duplicate', ownerId: 'owner-a' }),
    (error: { code?: number }) => error.code === 11000,
  )

  const root = await pages.create(workspaceA.id, {
    id: 'page-root',
    parentPageId: null,
    title: 'Root',
    orderKey: 'b',
  })
  const sibling = await pages.create(workspaceA.id, {
    id: 'page-sibling',
    parentPageId: null,
    title: 'Sibling',
    orderKey: 'a',
  })
  const child = await pages.create(workspaceA.id, {
    id: 'page-child',
    parentPageId: root.id,
    title: 'Child',
    orderKey: 'a',
  })
  const foreignPage = await pages.create(workspaceB.id, {
    id: 'page-foreign',
    parentPageId: null,
    title: 'Foreign',
    orderKey: 'a',
  })
  assert.equal((await pages.find(workspaceA.id, child.id))?.parentPageId, root.id)
  assert.equal(await pages.find(workspaceB.id, child.id), null)
  assert.deepEqual((await pages.list(workspaceA.id)).map(({ id }) => id), ['page-sibling', 'page-root', 'page-child'])
  await assert.rejects(
    pages.create(workspaceB.id, { id: root.id, parentPageId: null, title: 'duplicate', orderKey: 'z' }),
    (error: { code?: number }) => error.code === 11000,
  )
  await assert.rejects(
    pages.create(workspaceA.id, {
      id: 'page-invalid-parent',
      parentPageId: foreignPage.id,
      title: 'Invalid',
      orderKey: 'z',
    }),
    /Parent page must belong to the same workspace/,
  )
  await assert.rejects(
    pages.update(workspaceA.id, root.id, { parentPageId: child.id } as Parameters<typeof pages.update>[2]),
    /Moving a page is not supported yet/,
  )
  await assert.rejects(
    pages.update(workspaceA.id, root.id, { $set: { parentPageId: child.id, workspaceId: workspaceB.id } } as Parameters<typeof pages.update>[2]),
    /Unsupported update field/,
  )
  assert.equal((await pages.find(workspaceA.id, root.id))?.parentPageId, null)
  assert.equal((await pages.find(workspaceA.id, root.id))?.workspaceId, workspaceA.id)

  const blockRoot = await blocks.create(workspaceA.id, root.id, {
    id: 'block-root',
    pageId: root.id,
    parentBlockId: null,
    type: 'paragraph',
    orderKey: 'b',
    props: { text: 'root' },
  })
  await blocks.create(workspaceA.id, root.id, {
    id: 'block-first',
    pageId: root.id,
    parentBlockId: null,
    type: 'paragraph',
    orderKey: 'a',
    props: { text: 'first' },
  })
  const nestedBlock = await blocks.create(workspaceA.id, root.id, {
    id: 'block-child',
    pageId: root.id,
    parentBlockId: blockRoot.id,
    type: 'paragraph',
    orderKey: 'a',
    props: { text: 'nested' },
  })
  const foreignBlock = await blocks.create(workspaceB.id, foreignPage.id, {
    id: 'block-foreign',
    pageId: foreignPage.id,
    parentBlockId: null,
    type: 'paragraph',
    orderKey: 'a',
    props: {},
  })
  assert.equal(typeof nestedBlock.id, 'string')
  assert.equal(nestedBlock.id, 'block-child')
  assert.equal(nestedBlock.workspaceId, workspaceA.id)
  assert.equal(await blocks.find(workspaceB.id, root.id, blockRoot.id), null)
  assert.equal(await blocks.find(workspaceA.id, root.id, foreignBlock.id), null)
  assert.deepEqual((await blocks.list(workspaceA.id, root.id)).map(({ id }) => id), ['block-first', 'block-root', 'block-child'])
  await assert.rejects(
    blocks.create(workspaceB.id, foreignPage.id, {
      id: blockRoot.id,
      pageId: foreignPage.id,
      parentBlockId: null,
      type: 'paragraph',
      orderKey: 'z',
      props: {},
    }),
    (error: { code?: number }) => error.code === 11000,
  )
  await assert.rejects(
    blocks.create(workspaceB.id, root.id, {
      id: 'wrong-workspace-block',
      pageId: root.id,
      parentBlockId: null,
      type: 'paragraph',
      orderKey: 'z',
      props: {},
    }),
    /Page not found in workspace/,
  )
  await assert.rejects(
    blocks.create(workspaceA.id, root.id, {
      id: 'mismatched-page-block',
      pageId: sibling.id,
      parentBlockId: null,
      type: 'paragraph',
      orderKey: 'z',
      props: {},
    }),
    /Block pageId does not match the target page/,
  )
  await assert.rejects(
    blocks.update(workspaceA.id, root.id, blockRoot.id, { parentBlockId: nestedBlock.id } as Parameters<typeof blocks.update>[3]),
    /Moving a block is not supported yet/,
  )
  await assert.rejects(
    blocks.update(workspaceA.id, root.id, blockRoot.id, { $set: { parentBlockId: nestedBlock.id, workspaceId: workspaceB.id } } as Parameters<typeof blocks.update>[3]),
    /Unsupported update field/,
  )
  assert.equal((await blocks.find(workspaceA.id, root.id, blockRoot.id))?.parentBlockId, null)
  assert.equal((await blocks.find(workspaceA.id, root.id, blockRoot.id))?.workspaceId, workspaceA.id)
  await assert.rejects(
    blocks.create(workspaceA.id, root.id, {
      id: 'block-invalid-parent',
      pageId: root.id,
      parentBlockId: foreignBlock.id,
      type: 'paragraph',
      orderKey: 'z',
      props: {},
    }),
    /Parent block must belong to the same page and workspace/,
  )
  assert.equal(await connection.db!.collection('blocks').countDocuments(), 4)
  assert.ok(await connection.db!.listCollections({ name: 'pages' }).hasNext())

  const fileInput = {
    id: 'file-a',
    workspaceId: workspaceA.id,
    ownerId: 'owner-a',
    name: 'before.txt',
    mimeType: 'text/plain',
    size: 4,
    objectKey: 'objects/file-a',
  }
  await assert.rejects(files.create(workspaceB.id, fileInput), /File workspaceId does not match the target workspace/)
  await assert.rejects(
    files.create('missing-workspace', { ...fileInput, workspaceId: 'missing-workspace' }),
    /Workspace not found/,
  )
  const file = await files.create(workspaceA.id, fileInput)
  assert.equal((await files.find(workspaceA.id, file.id))?.objectKey, 'objects/file-a')
  await assert.rejects(
    files.update(workspaceA.id, file.id, { $set: { workspaceId: workspaceB.id } } as Parameters<typeof files.update>[2]),
    /Unsupported update field/,
  )
  assert.equal((await files.find(workspaceA.id, file.id))?.workspaceId, workspaceA.id)
  assert.equal(await files.find(workspaceB.id, file.id), null)
  assert.equal(await files.update(workspaceB.id, file.id, { name: 'wrong-scope.txt' }), null)
  const updated = await files.update(workspaceA.id, file.id, { name: 'after.txt', size: 5 })
  assert.equal(updated?.name, 'after.txt')
  assert.equal(updated?.size, 5)
  assert.equal(await files.delete(workspaceB.id, file.id), false)
  assert.equal(await files.delete(workspaceA.id, file.id), true)
  assert.equal(await files.find(workspaceA.id, file.id), null)

  const expectedIndexes = [
    [workspaceModel, 'ownerId_1', { ownerId: 1 }],
    [pageModel, 'workspaceId_1_parentPageId_1_orderKey_1_id_1', { workspaceId: 1, parentPageId: 1, orderKey: 1, id: 1 }],
    [blockModel, 'workspaceId_1_pageId_1_parentBlockId_1_orderKey_1_id_1', { workspaceId: 1, pageId: 1, parentBlockId: 1, orderKey: 1, id: 1 }],
    [fileModel, 'workspaceId_1', { workspaceId: 1 }],
  ] as const
  for (const [model, name, key] of expectedIndexes) {
    const actual = (await model.collection.indexes()).find((index) => index.name === name)
    assert.ok(actual, `expected index ${name}`)
    assert.deepEqual(actual.key, key)
  }
  for (const model of [workspaceModel, pageModel, blockModel, fileModel]) {
    const uniqueId = (await model.collection.indexes()).find((index) => index.name === 'id_1')
    assert.equal(uniqueId?.unique, true)
  }
})

test('AppModule serves health when MongoDB is disabled', async (t) => {
  const previousMongoUri = process.env.MONGODB_URI
  process.env.MONGODB_URI = ''
  let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined
  try {
    const { AppModule } = await import('../../app.module')
    app = await NestFactory.create(AppModule, new FastifyAdapter(), { logger: false })
    app.setGlobalPrefix('api')
    await app.listen(0, '127.0.0.1')
    const address = app.getHttpServer().address()
    assert.ok(address && typeof address === 'object')
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`)
    assert.equal(response.status, 200)
    const health = (await response.json()) as { name: string; status: string; mongo: string }
    assert.equal(health.name, 'eotion-api')
    assert.equal(health.status, 'ok')
    assert.equal(health.mongo, 'disabled')
  } finally {
    if (app) await app.close()
    if (previousMongoUri === undefined) delete process.env.MONGODB_URI
    else process.env.MONGODB_URI = previousMongoUri
  }
})
