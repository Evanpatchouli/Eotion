import 'dotenv/config'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { getConnectionToken, getModelToken, MongooseModule } from '@nestjs/mongoose'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { BLOCK_TYPES } from '@eotion/domain'
import type { Connection, Model } from 'mongoose'

import { ServerDomainModule } from './server-domain.module'
import { BlockEntity } from './schemas/block.schema'
import { FileMetadataEntity } from './schemas/file-metadata.schema'
import { PageEntity } from './schemas/page.schema'
import { SessionEntity } from './schemas/session.schema'
import { UserEntity } from './schemas/user.schema'
import { WorkspaceEntity } from './schemas/workspace.schema'
import { AuthService } from './services/auth.service'
import { BlockService } from './services/block.service'
import { FileMetadataService } from './services/file-metadata.service'
import { FILE_OBJECT_STORAGE, type FileObjectStorage } from './services/file-object-storage'
import { PageService } from './services/page.service'
import { SessionService } from './services/session.service'
import { WorkspaceService } from './services/workspace.service'
import { FileMetadataRepository } from './repositories/file-metadata.repository'
import { WorkspacePermissionService } from './services/workspace-permission.service'

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
  const storage = app.get<FileObjectStorage>(FILE_OBJECT_STORAGE)
  storage.assertConfigured = () => {}
  const auth = app.get(AuthService)
  const sessions = app.get(SessionService)

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
  const userModel = app.get<Model<unknown>>(getModelToken(UserEntity.name))
  const sessionModel = app.get<Model<unknown>>(getModelToken(SessionEntity.name))
  await Promise.all([
    workspaceModel.init(), pageModel.init(), blockModel.init(), fileModel.init(), userModel.init(), sessionModel.init(),
  ])
  assert.deepEqual((blockModel.schema.path('type') as unknown as { enumValues: string[] }).enumValues, [...BLOCK_TYPES])
  assert.equal(fileModel.collection.name, 'files')
  assert.equal(await connection.db!.listCollections({ name: 'filemetadatas' }).hasNext(), false)

  const userA = await auth.register(' Owner@Example.com ', 'correct horse battery staple')
  const userB = await auth.register('second@example.com', 'another password')
  assert.equal(userA.email, 'owner@example.com')
  assert.equal((await auth.authenticate('OWNER@example.com', 'correct horse battery staple')).id, userA.id)
  await assert.rejects(auth.register('owner@example.com', 'different password'), /account with this email already exists/i)
  await assert.rejects(auth.authenticate(userA.email, 'wrong password'), /Invalid credentials/)
  assert.equal(await userModel.countDocuments({ email: 'owner@example.com' }), 1)
  const storedUser = await userModel.findOne({ id: userA.id }).select('+passwordHash').lean() as unknown as { passwordHash: string }
  assert.notEqual(storedUser.passwordHash, 'correct horse battery staple')
  assert.ok(storedUser.passwordHash.length > 20)
  assert.equal(await userModel.findOne({ id: userA.id }).lean().then((record) => 'passwordHash' in (record ?? {})), false)

  const session = await auth.login(userA.email, 'correct horse battery staple')
  assert.equal((await sessions.resolve(session.token))?.id, userA.id)
  const storedSession = await sessionModel.findOne({ userId: userA.id }).select('+tokenHash').lean() as unknown as {
    tokenHash: string
    expiresAt: Date
    revokedAt: Date | null
  }
  assert.notEqual(storedSession.tokenHash, session.token)
  assert.equal(storedSession.tokenHash.length, 64)
  assert.ok(storedSession.expiresAt.getTime() > Date.now())
  assert.equal(storedSession.revokedAt, null)
  assert.equal(await sessionModel.findOne({ userId: userA.id }).lean().then((record) => 'tokenHash' in (record ?? {})), false)
  const ttlIndex = (await sessionModel.collection.indexes()).find((index) => index.name === 'expiresAt_1')
  assert.equal(ttlIndex?.expireAfterSeconds, 0)
  const expiringSession = await auth.login(userA.email, 'correct horse battery staple')
  const expiringTokenHash = createHash('sha256').update(expiringSession.token).digest('hex')
  await sessionModel.updateOne({ tokenHash: expiringTokenHash }, { $set: { expiresAt: new Date(0) } }).exec()
  assert.equal(await sessions.resolve(expiringSession.token), null)
  await sessions.revoke(session.token)
  assert.equal(await sessions.resolve(session.token), null)
  const sessionCount = await sessionModel.countDocuments()
  await assert.rejects(auth.login(userA.email, 'wrong password'), /Invalid credentials/)
  assert.equal(await sessionModel.countDocuments(), sessionCount)

  const workspaceA = await workspaces.create(userA.id, { id: 'workspace-a', name: 'A' })
  const workspaceB = await workspaces.create(userB.id, { id: 'workspace-b', name: 'B' })
  assert.equal((await workspaces.findById(userA.id, workspaceA.id))?.name, 'A')
  assert.deepEqual((await workspaces.listByOwner(userA.id)).map(({ id }) => id), [workspaceA.id])
  await assert.rejects(workspaces.findById(userB.id, workspaceA.id), /Workspace not found/)
  await assert.rejects(workspaces.updateName(userB.id, workspaceA.id, 'stolen'), /Workspace not found/)
  assert.equal((await workspaces.updateName(userA.id, workspaceA.id, 'A renamed'))?.name, 'A renamed')
  await assert.rejects(workspaces.create('missing-user', { id: 'workspace-invalid-owner', name: 'Invalid' }), /User not found/)
  await assert.rejects(
    workspaces.create(userA.id, { id: workspaceA.id, name: 'duplicate' }),
    (error: { code?: number }) => error.code === 11000,
  )

  const root = await pages.create(userA.id, workspaceA.id, {
    id: 'page-root',
    parentPageId: null,
    title: 'Root',
    orderKey: 'b',
  })
  const sibling = await pages.create(userA.id, workspaceA.id, {
    id: 'page-sibling',
    parentPageId: null,
    title: 'Sibling',
    orderKey: 'a',
  })
  const child = await pages.create(userA.id, workspaceA.id, {
    id: 'page-child',
    parentPageId: root.id,
    title: 'Child',
    orderKey: 'a',
  })
  const foreignPage = await pages.create(userB.id, workspaceB.id, {
    id: 'page-foreign',
    parentPageId: null,
    title: 'Foreign',
    orderKey: 'a',
  })
  assert.equal((await pages.find(userA.id, workspaceA.id, child.id))?.parentPageId, root.id)
  assert.equal(await pages.find(userB.id, workspaceB.id, root.id), null)
  await assert.rejects(pages.find(userB.id, workspaceA.id, root.id), /Workspace not found/)
  await assert.rejects(pages.create(userB.id, workspaceA.id, {
    id: 'unauthorized-page', parentPageId: null, title: 'Unauthorized', orderKey: 'z',
  }), /Workspace not found/)
  await assert.rejects(pages.update(userB.id, workspaceA.id, root.id, { title: 'stolen' }), /Workspace not found/)
  assert.deepEqual((await pages.list(userA.id, workspaceA.id)).map(({ id }) => id), ['page-sibling', 'page-root', 'page-child'])
  await assert.rejects(
    pages.create(userA.id, workspaceA.id, { id: root.id, parentPageId: null, title: 'duplicate', orderKey: 'z' }),
    (error: { code?: number }) => error.code === 11000,
  )
  await assert.rejects(
    pages.create(userA.id, workspaceA.id, {
      id: 'page-invalid-parent',
      parentPageId: foreignPage.id,
      title: 'Invalid',
      orderKey: 'z',
    }),
    /Parent page must belong to the same workspace/,
  )
  await assert.rejects(
    pages.update(userA.id, workspaceA.id, root.id, { parentPageId: child.id } as Parameters<typeof pages.update>[3]),
    /Moving a page is not supported here/,
  )
  await assert.rejects(
    pages.update(userA.id, workspaceA.id, root.id, { $set: { parentPageId: child.id, workspaceId: workspaceB.id } } as Parameters<typeof pages.update>[3]),
    /Unsupported update field/,
  )
  assert.equal((await pages.find(userA.id, workspaceA.id, root.id))?.parentPageId, null)
  assert.equal((await pages.find(userA.id, workspaceA.id, root.id))?.workspaceId, workspaceA.id)

  // Moving is a separate, validated operation: no self-parenting, no cycles, no cross-workspace parents.
  await assert.rejects(
    pages.move(userA.id, workspaceA.id, root.id, { parentPageId: root.id, orderKey: 'z' }),
    /A page cannot be its own parent/,
  )
  await assert.rejects(
    pages.move(userA.id, workspaceA.id, root.id, { parentPageId: child.id, orderKey: 'z' }),
    /own descendant/,
  )
  await assert.rejects(
    pages.move(userA.id, workspaceA.id, root.id, { parentPageId: foreignPage.id, orderKey: 'z' }),
    /Parent page must belong to the same workspace/,
  )
  await assert.rejects(
    pages.move(userB.id, workspaceA.id, root.id, { parentPageId: null, orderKey: 'z' }),
    /Workspace not found/,
  )
  assert.equal(await pages.move(userA.id, workspaceA.id, 'page-missing', { parentPageId: null, orderKey: 'z' }), null)
  assert.equal((await pages.find(userA.id, workspaceA.id, child.id))?.parentPageId, root.id)

  const reparented = await pages.move(userA.id, workspaceA.id, child.id, { parentPageId: sibling.id, orderKey: 'z' })
  assert.equal(reparented?.parentPageId, sibling.id)
  assert.equal(reparented?.orderKey, 'z')
  const rerooted = await pages.move(userA.id, workspaceA.id, child.id, { parentPageId: null, orderKey: 'c' })
  assert.equal(rerooted?.parentPageId, null)
  assert.equal(rerooted?.orderKey, 'c')
  assert.equal((await pages.find(userA.id, workspaceA.id, child.id))?.parentPageId, null)

  // Delete is leaf-only and removes the page together with its blocks.
  const deleteParent = await pages.create(userA.id, workspaceA.id, { id: 'page-delete-parent', parentPageId: null, title: 'Delete parent', orderKey: 'd' })
  const deleteChild = await pages.create(userA.id, workspaceA.id, { id: 'page-delete-child', parentPageId: deleteParent.id, title: 'Delete child', orderKey: 'a' })
  await blocks.create(userA.id, workspaceA.id, deleteChild.id, {
    id: 'block-delete-child',
    pageId: deleteChild.id,
    parentBlockId: null,
    type: 'paragraph',
    orderKey: 'a',
    props: { text: 'removed with page' },
  })
  await assert.rejects(pages.delete(userA.id, workspaceA.id, deleteParent.id), /Delete child pages first/)
  assert.ok(await pages.find(userA.id, workspaceA.id, deleteParent.id))
  await assert.rejects(pages.delete(userB.id, workspaceA.id, deleteChild.id), /Workspace not found/)
  assert.equal(await pages.delete(userA.id, workspaceA.id, deleteChild.id), true)
  assert.equal(await pages.find(userA.id, workspaceA.id, deleteChild.id), null)
  assert.equal(await connection.db!.collection('blocks').countDocuments({ id: 'block-delete-child' }), 0)
  assert.equal(await pages.delete(userA.id, workspaceA.id, deleteParent.id), true)
  assert.equal(await pages.delete(userA.id, workspaceA.id, deleteParent.id), false)

  const blockRoot = await blocks.create(userA.id, workspaceA.id, root.id, {
    id: 'block-root',
    pageId: root.id,
    parentBlockId: null,
    // Only child-capable block types may own children, so the nested fixture uses a toggle.
    type: 'toggle',
    orderKey: 'b',
    props: { text: 'root' },
  })
  await blocks.create(userA.id, workspaceA.id, root.id, {
    id: 'block-first',
    pageId: root.id,
    parentBlockId: null,
    type: 'paragraph',
    orderKey: 'a',
    props: { text: 'first' },
  })
  const nestedBlock = await blocks.create(userA.id, workspaceA.id, root.id, {
    id: 'block-child',
    pageId: root.id,
    parentBlockId: blockRoot.id,
    type: 'paragraph',
    orderKey: 'a',
    props: { text: 'nested' },
  })
  const foreignBlock = await blocks.create(userB.id, workspaceB.id, foreignPage.id, {
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
  assert.equal(await blocks.find(userB.id, workspaceB.id, foreignPage.id, blockRoot.id), null)
  assert.equal(await blocks.find(userA.id, workspaceA.id, root.id, foreignBlock.id), null)
  await assert.rejects(blocks.find(userB.id, workspaceA.id, root.id, blockRoot.id), /Workspace not found/)
  await assert.rejects(blocks.create(userB.id, workspaceA.id, root.id, {
    id: 'unauthorized-block', pageId: root.id, parentBlockId: null, type: 'paragraph', orderKey: 'z', props: {},
  }), /Workspace not found/)
  await assert.rejects(blocks.update(userB.id, workspaceA.id, root.id, blockRoot.id, { props: { text: 'stolen' } }), /Workspace not found/)
  assert.deepEqual((await blocks.list(userA.id, workspaceA.id, root.id)).map(({ id }) => id), ['block-first', 'block-root', 'block-child'])
  await assert.rejects(
    blocks.create(userB.id, workspaceB.id, foreignPage.id, {
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
    blocks.create(userB.id, workspaceB.id, root.id, {
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
    blocks.create(userA.id, workspaceA.id, root.id, {
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
    blocks.update(userA.id, workspaceA.id, root.id, blockRoot.id, { parentBlockId: nestedBlock.id } as Parameters<typeof blocks.update>[4]),
    /Moving a block is not supported yet/,
  )
  await assert.rejects(
    blocks.update(userA.id, workspaceA.id, root.id, blockRoot.id, { $set: { parentBlockId: nestedBlock.id, workspaceId: workspaceB.id } } as Parameters<typeof blocks.update>[4]),
    /Unsupported update field/,
  )
  assert.equal((await blocks.find(userA.id, workspaceA.id, root.id, blockRoot.id))?.parentBlockId, null)
  assert.equal((await blocks.find(userA.id, workspaceA.id, root.id, blockRoot.id))?.workspaceId, workspaceA.id)
  assert.equal(await blocks.deleteFromPage(userA.id, workspaceA.id, sibling.id, blockRoot.id), false)
  assert.ok(await blocks.find(userA.id, workspaceA.id, root.id, blockRoot.id))
  await assert.rejects(blocks.deleteFromPage(userB.id, workspaceA.id, root.id, blockRoot.id), /Workspace not found/)
  await assert.rejects(blocks.deleteFromPage(userA.id, workspaceA.id, root.id, blockRoot.id), /Delete child blocks first/)
  assert.equal(await blocks.deleteFromPage(userA.id, workspaceA.id, root.id, nestedBlock.id), true)
  assert.equal(await blocks.deleteFromPage(userA.id, workspaceA.id, root.id, blockRoot.id), true)
  assert.equal(await blocks.deleteFromPage(userA.id, workspaceA.id, root.id, blockRoot.id), false)

  // Nested block invariants: only child-capable parents accept children, and block.move enforces the tree.
  await assert.rejects(
    blocks.create(userA.id, workspaceA.id, root.id, {
      id: 'block-under-paragraph',
      pageId: root.id,
      parentBlockId: 'block-first',
      type: 'paragraph',
      orderKey: 'z',
      props: {},
    }),
    /Parent block type does not support child blocks/,
  )

  const moveParentA = await blocks.create(userA.id, workspaceA.id, root.id, {
    id: 'block-move-parent-a', pageId: root.id, parentBlockId: null, type: 'toggle', orderKey: 'c', props: {},
  })
  const moveParentB = await blocks.create(userA.id, workspaceA.id, root.id, {
    id: 'block-move-parent-b', pageId: root.id, parentBlockId: null, type: 'toggle', orderKey: 'd', props: {},
  })
  const moveChild = await blocks.create(userA.id, workspaceA.id, root.id, {
    id: 'block-move-child', pageId: root.id, parentBlockId: moveParentA.id, type: 'paragraph', orderKey: 'a', props: {},
  })
  const crossPageBlock = await blocks.create(userA.id, workspaceA.id, sibling.id, {
    id: 'block-move-cross-page', pageId: sibling.id, parentBlockId: null, type: 'paragraph', orderKey: 'a', props: {},
  })

  const movedBlock = await blocks.move(userA.id, workspaceA.id, root.id, moveChild.id, moveParentB.id, 'm')
  assert.equal(movedBlock?.parentBlockId, moveParentB.id)
  assert.equal(movedBlock?.orderKey, 'm')
  assert.equal((await blocks.find(userA.id, workspaceA.id, root.id, moveChild.id))?.parentBlockId, moveParentB.id)

  await assert.rejects(blocks.move(userA.id, workspaceA.id, root.id, moveParentA.id, moveParentA.id, 'z'), /cannot be its own parent/)
  await assert.rejects(blocks.move(userA.id, workspaceA.id, root.id, moveParentB.id, moveChild.id, 'z'), /cannot move under its own descendant/)
  await assert.rejects(blocks.move(userA.id, workspaceA.id, root.id, moveChild.id, crossPageBlock.id, 'z'), /is unavailable/)
  await assert.rejects(blocks.move(userA.id, workspaceA.id, root.id, moveChild.id, 'block-first', 'z'), /Parent block type does not support child blocks/)
  await assert.rejects(blocks.move(userB.id, workspaceA.id, root.id, moveChild.id, null, 'z'), /Workspace not found/)

  // Remove the move fixtures so the block count assertion below keeps its meaning.
  assert.equal(await blocks.deleteFromPage(userA.id, workspaceA.id, root.id, moveChild.id), true)
  assert.equal(await blocks.deleteFromPage(userA.id, workspaceA.id, root.id, moveParentA.id), true)
  assert.equal(await blocks.deleteFromPage(userA.id, workspaceA.id, root.id, moveParentB.id), true)
  assert.equal(await blocks.deleteFromPage(userA.id, workspaceA.id, sibling.id, crossPageBlock.id), true)

  await assert.rejects(
    blocks.create(userA.id, workspaceA.id, root.id, {
      id: 'block-invalid-parent',
      pageId: root.id,
      parentBlockId: foreignBlock.id,
      type: 'paragraph',
      orderKey: 'z',
      props: {},
    }),
    /Parent block must belong to the same page and workspace/,
  )
  assert.equal(await connection.db!.collection('blocks').countDocuments(), 2)
  assert.ok(await connection.db!.listCollections({ name: 'pages' }).hasNext())

  const originalClientId = process.env.ALI_OSS_CLIENT_ID
  process.env.ALI_OSS_CLIENT_ID = 'domain-test'
  t.after(() => { if (originalClientId === undefined) delete process.env.ALI_OSS_CLIENT_ID; else process.env.ALI_OSS_CLIENT_ID = originalClientId })
  storage.upload = async ({ objectKey, stream }) => {
    for await (const _chunk of stream) { /* consume the upload stream */ }
    return { objectKey: `domain-test/${objectKey}`, url: 'https://example.test/file' }
  }
  storage.delete = async () => {}
  const fileInput = { id: 'file-a', name: 'before.txt', stream: Readable.from(['test']) }
  await assert.rejects(
    files.create(userA.id, 'missing-workspace', fileInput),
    /Workspace not found/,
  )
  const file = await files.create(userA.id, workspaceA.id, fileInput)
  assert.equal(file.ownerId, userA.id)
  assert.match((await files.find(userA.id, workspaceA.id, file.id))?.objectKey ?? '', /^domain-test\/eotion\/workspaces\//)
  const abortController = new AbortController()
  const uploadedKeys: string[] = []
  const deletedKeys: string[] = []
  const originalUpload = storage.upload.bind(storage)
  const originalDelete = storage.delete.bind(storage)
  storage.upload = async ({ objectKey, stream }) => {
    for await (const _chunk of stream) { /* consume the upload stream */ }
    const uploadedKey = `domain-test/${objectKey}`
    uploadedKeys.push(uploadedKey)
    abortController.abort()
    return { objectKey: uploadedKey, url: 'https://example.test/aborted-file' }
  }
  storage.delete = async (objectKey) => { deletedKeys.push(objectKey) }
  try {
    await assert.rejects(files.create(userA.id, workspaceA.id, {
      id: 'file-aborted-after-upload', name: 'aborted.txt', stream: Readable.from(['bytes']), signal: abortController.signal,
    }), /File upload was aborted/)
    assert.equal(await files.find(userA.id, workspaceA.id, 'file-aborted-after-upload'), null)
    assert.deepEqual(deletedKeys, uploadedKeys)
  } finally {
    storage.upload = originalUpload
    storage.delete = originalDelete
  }
  const fileRepository = app.get(FileMetadataRepository)
  const permissions = app.get(WorkspacePermissionService)
  const barrierFileId = 'file-delete-waits-for-upload'
  let releaseRepositoryCreate!: () => void
  let repositoryCreateEntered!: () => void
  const repositoryCreateBarrier = new Promise<void>((resolve) => { releaseRepositoryCreate = resolve })
  const repositoryCreateStarted = new Promise<void>((resolve) => { repositoryCreateEntered = resolve })
  const originalRepositoryCreate = fileRepository.create.bind(fileRepository)
  const originalRepositoryFind = fileRepository.findInWorkspace.bind(fileRepository)
  const originalPermissionCheck = permissions.assertCanWrite.bind(permissions)
  const originalStorageUpload = storage.upload.bind(storage)
  const originalStorageDelete = storage.delete.bind(storage)
  const objectDeletes: string[] = []
  const successfulObjectDeletes: string[] = []
  let uploadedBarrierObjectKey: string | undefined
  let simulatedObjectPresent = false
  let metadataPresentAtFirstDeleteFailure = false
  let failFirstObjectDelete = true
  let watchDeletePermission = false
  let releaseDeletePermission!: () => void
  let deletePermissionEntered!: () => void
  let deletePermissionReturned!: () => void
  const deletePermissionBarrier = new Promise<void>((resolve) => { releaseDeletePermission = resolve })
  const deletePermissionStarted = new Promise<void>((resolve) => { deletePermissionEntered = resolve })
  const deletePermissionFinished = new Promise<void>((resolve) => { deletePermissionReturned = resolve })
  let deleteLookups = 0
  fileRepository.create = async (input) => {
    if (input.id === barrierFileId) {
      repositoryCreateEntered()
      await repositoryCreateBarrier
    }
    return originalRepositoryCreate(input)
  }
  fileRepository.findInWorkspace = async (workspaceId, id) => {
    if (id === barrierFileId) deleteLookups += 1
    return originalRepositoryFind(workspaceId, id)
  }
  permissions.assertCanWrite = async (userId, workspaceId) => {
    await originalPermissionCheck(userId, workspaceId)
    if (watchDeletePermission) {
      watchDeletePermission = false
      deletePermissionEntered()
      await deletePermissionBarrier
      deletePermissionReturned()
    }
  }
  storage.delete = async (objectKey) => {
    objectDeletes.push(objectKey)
    if (failFirstObjectDelete) {
      failFirstObjectDelete = false
      metadataPresentAtFirstDeleteFailure = (await fileRepository.findInWorkspace(workspaceA.id, barrierFileId)) !== null
      throw new Error('synthetic first object delete failure')
    }
    await originalStorageDelete(objectKey)
    successfulObjectDeletes.push(objectKey)
    simulatedObjectPresent = false
  }
  storage.upload = async (input) => {
    const uploaded = await originalStorageUpload(input)
    uploadedBarrierObjectKey = uploaded.objectKey
    simulatedObjectPresent = true
    return uploaded
  }
  const uploadAbort = new AbortController()
  const pendingCreate = files.create(userA.id, workspaceA.id, {
    id: barrierFileId, name: 'cancel-during-save.txt', stream: Readable.from(['cancel me']), signal: uploadAbort.signal,
  })
  try {
    await repositoryCreateStarted
    uploadAbort.abort()
    watchDeletePermission = true
    const pendingDelete = files.delete(userA.id, workspaceA.id, barrierFileId)
    await deletePermissionStarted
    releaseDeletePermission()
    await deletePermissionFinished
    await Promise.resolve()
    assert.equal(deleteLookups, 0, 'DELETE must wait for this service instance’s pending upload')
    releaseRepositoryCreate()
    await assert.rejects(pendingCreate, /File upload was aborted and created data cleanup failed/)
    assert.equal(await pendingDelete, true)
    assert.equal(await fileModel.countDocuments({ id: barrierFileId }), 0)
    assert.equal(metadataPresentAtFirstDeleteFailure, true)
    assert.deepEqual(objectDeletes, [uploadedBarrierObjectKey, uploadedBarrierObjectKey])
    assert.deepEqual(successfulObjectDeletes, [uploadedBarrierObjectKey])
    assert.equal(simulatedObjectPresent, false)
  } finally {
    releaseDeletePermission()
    releaseRepositoryCreate()
    fileRepository.create = originalRepositoryCreate
    fileRepository.findInWorkspace = originalRepositoryFind
    permissions.assertCanWrite = originalPermissionCheck
    storage.delete = originalStorageDelete
    storage.upload = originalStorageUpload
    await pendingCreate.catch(() => {})
  }
  await assert.rejects(
    files.update(userA.id, workspaceA.id, file.id, { $set: { workspaceId: workspaceB.id } } as unknown as Parameters<typeof files.update>[3]),
    /Unsupported update field/,
  )
  assert.equal((await files.find(userA.id, workspaceA.id, file.id))?.workspaceId, workspaceA.id)
  assert.equal(await files.find(userB.id, workspaceB.id, file.id), null)
  await assert.rejects(files.find(userB.id, workspaceA.id, file.id), /Workspace not found/)
  await assert.rejects(files.create(userB.id, workspaceA.id, {
    id: 'unauthorized-file', name: 'x', stream: Readable.from(['x']),
  }), /Workspace not found/)
  await assert.rejects(files.update(userB.id, workspaceA.id, file.id, { name: 'stolen' }), /Workspace not found/)
  await assert.rejects(files.delete(userB.id, workspaceA.id, file.id), /Workspace not found/)
  assert.equal(await files.update(userB.id, workspaceB.id, file.id, { name: 'wrong-scope.txt' }), null)
  const updated = await files.update(userA.id, workspaceA.id, file.id, { name: 'after.txt' })
  assert.equal(updated?.name, 'after.txt')
  assert.equal(updated?.size, 4)
  assert.equal(await files.delete(userB.id, workspaceB.id, file.id), false)
  assert.equal(await files.delete(userA.id, workspaceA.id, file.id), true)
  assert.equal(await files.find(userA.id, workspaceA.id, file.id), null)

  const expectedIndexes = [
    [workspaceModel, 'ownerId_1', { ownerId: 1 }],
    [pageModel, 'workspaceId_1_parentPageId_1_orderKey_1_id_1', { workspaceId: 1, parentPageId: 1, orderKey: 1, id: 1 }],
    [blockModel, 'workspaceId_1_pageId_1_parentBlockId_1_orderKey_1_id_1', { workspaceId: 1, pageId: 1, parentBlockId: 1, orderKey: 1, id: 1 }],
    [fileModel, 'workspaceId_1', { workspaceId: 1 }],
    [userModel, 'email_1', { email: 1 }],
    [userModel, 'id_1', { id: 1 }],
    [sessionModel, 'id_1', { id: 1 }],
    [sessionModel, 'tokenHash_1', { tokenHash: 1 }],
    [sessionModel, 'userId_1', { userId: 1 }],
    [sessionModel, 'expiresAt_1', { expiresAt: 1 }],
  ] as const
  for (const [model, name, key] of expectedIndexes) {
    const actual = (await model.collection.indexes()).find((index) => index.name === name)
    assert.ok(actual, `expected index ${name}`)
    assert.deepEqual(actual.key, key)
  }
  for (const model of [workspaceModel, pageModel, blockModel, fileModel, userModel, sessionModel]) {
    const uniqueId = (await model.collection.indexes()).find((index) => index.name === 'id_1')
    assert.equal(uniqueId?.unique, true)
  }
  for (const [model, name] of [[userModel, 'email_1'], [sessionModel, 'tokenHash_1']] as const) {
    assert.equal((await model.collection.indexes()).find((index) => index.name === name)?.unique, true)
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
