import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { getConnectionToken } from "@nestjs/mongoose";
import {
  EotionApiClient,
  EotionOperationTransport,
} from "../../../../../packages/sdk/src/index.ts";
import { reconnectPending } from "../../../../../packages/storage/src/index.ts";

function testMongoUri() {
  const base = process.env.P4_TEST_MONGODB_URI?.trim();
  assert.ok(base, "P4_TEST_MONGODB_URI must point to a MongoDB replica set");
  const uri = new URL(base);
  uri.pathname = `/eotion_sync_http_test_${randomUUID().replaceAll("-", "")}`;
  return uri.toString();
}

function cookieFrom(response) {
  const value = response.headers.get("set-cookie");
  assert.ok(value, "expected Set-Cookie response header");
  return value.split(";", 1)[0];
}

test("authenticated real sync transport applies durable SQLite operations idempotently", async (t) => {
  const previousMongoUri = process.env.MONGODB_URI;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousWebOrigin = process.env.WEB_ORIGIN;
  process.env.MONGODB_URI = testMongoUri();
  delete process.env.NODE_ENV;
  process.env.WEB_ORIGIN = "https://trusted.example.test";

  let app;
  let store;
  let sqliteDirectory;
  let sqliteModule;
  try {
    const { AppModule } = await import("../../../dist/app.module.js");
    app = await NestFactory.create(AppModule, new FastifyAdapter(), {
      logger: false,
    });
    app.setGlobalPrefix("api");
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const connection = app.get(getConnectionToken());
    const rawFetch = fetch;
    let sessionCookie;
    const client = new EotionApiClient({
      baseUrl,
      fetch: async (input, init = {}) =>
        rawFetch(input, {
          ...init,
          headers: {
            ...init.headers,
            ...(sessionCookie ? { cookie: sessionCookie } : {}),
          },
        }),
    });
    const transport = new EotionOperationTransport(client);
    const database = randomUUID().replaceAll("-", "");
    const sqliteSource = fileURLToPath(
      new URL("../../../../desktop/src/main/sqlite-store.ts", import.meta.url),
    );
    sqliteModule = join(
      dirname(sqliteSource),
      `sqlite-store-sync-test-${randomUUID()}.mts`,
    );
    await copyFile(sqliteSource, sqliteModule);
    const { SqliteLocalStore } = await import(pathToFileURL(sqliteModule).href);
    sqliteDirectory = await mkdtemp(join(tmpdir(), "eotion-sync-http-"));
    const sqlitePath = join(sqliteDirectory, "local.sqlite");
    store = new SqliteLocalStore(sqlitePath);

    t.after(async () => {
      try {
        await connection.dropDatabase();
      } finally {
        store?.close();
        if (sqliteDirectory)
          await rm(sqliteDirectory, { recursive: true, force: true });
        if (sqliteModule) await rm(sqliteModule, { force: true });
        await app?.close();
        if (previousMongoUri === undefined) delete process.env.MONGODB_URI;
        else process.env.MONGODB_URI = previousMongoUri;
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
        if (previousWebOrigin === undefined) delete process.env.WEB_ORIGIN;
        else process.env.WEB_ORIGIN = previousWebOrigin;
      }
    });

    const ownerCredentials = {
      email: `owner-${database}@example.test`,
      password: "correct horse battery staple",
    };
    const registration = await rawFetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ownerCredentials),
    });
    assert.equal(registration.status, 201);
    const login = await rawFetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ownerCredentials),
    });
    assert.equal(login.status, 201);
    sessionCookie = cookieFrom(login);
    await client.auth.me();

    const workspaceId = `ws-${database}`;
    const pageId = `page-${database}`;
    const blockId = `block-${database}`;
    const absentWorkspaceId = `ws-later-${database}`;
    const deferredPageId = `page-later-${database}`;
    const now = new Date().toISOString();
    const localPage = (id, ownerWorkspaceId, title, orderKey) => ({
      id,
      workspaceId: ownerWorkspaceId,
      parentPageId: null,
      title,
      icon: null,
      orderKey,
      createdAt: now,
      updatedAt: now,
    });
    const localBlock = (id, ownerWorkspaceId, ownerPageId, text) => ({
      id,
      workspaceId: ownerWorkspaceId,
      pageId: ownerPageId,
      parentBlockId: null,
      type: "paragraph",
      orderKey: "a",
      props: { text },
      createdAt: now,
      updatedAt: now,
    });

    // Local SQLite emits the complete, stable wire operations. They initially fail
    // because the remote workspace has not been created yet.
    await store.upsertPage(
      localPage(
        deferredPageId,
        absentWorkspaceId,
        "Retry after workspace creation",
        "a",
      ),
    );
    const deferredOperation = (await store.getPendingOperations())[0];
    const beforeFailure = structuredClone(deferredOperation);
    store.close();
    store = new SqliteLocalStore(sqlitePath);
    const reopenedOperation = (await store.getPendingOperations())[0];
    assert.equal(reopenedOperation.id, beforeFailure.id);
    assert.equal(reopenedOperation.clientId, beforeFailure.clientId);
    assert.equal(reopenedOperation.sequence, beforeFailure.sequence);
    assert.equal(deferredOperation.clientId.length > 0, true);
    assert.equal(deferredOperation.sequence, 1);
    assert.equal(deferredOperation.workspaceId, absentWorkspaceId);
    assert.equal((await reconnectPending(store, transport)).failed, 1);
    let pending = await store.getPendingOperations();
    assert.equal(pending[0].status, "failed");
    assert.equal(pending[0].id, beforeFailure.id);
    assert.equal(pending[0].clientId, beforeFailure.clientId);
    assert.equal(pending[0].sequence, beforeFailure.sequence);

    // A different authenticated user cannot claim the workspace, even with an
    // otherwise valid operation ID and payload.
    const foreignCredentials = {
      email: `foreign-${database}@example.test`,
      password: "another correct horse battery staple",
    };
    const foreignRegister = await rawFetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(foreignCredentials),
    });
    assert.equal(foreignRegister.status, 201);
    const foreignLogin = await rawFetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(foreignCredentials),
    });
    assert.equal(foreignLogin.status, 201);
    const foreignCookie = cookieFrom(foreignLogin);
    const workspaceResult = await client.workspaces.create({
      id: absentWorkspaceId,
      name: "Deferred workspace",
    });
    assert.equal(workspaceResult.id, absentWorkspaceId);
    const { status: _deferredStatus, ...deferredWireOperation } =
      deferredOperation;
    const foreignSend = await rawFetch(`${baseUrl}/api/sync/operations`, {
      method: "POST",
      headers: { cookie: foreignCookie, "content-type": "application/json" },
      body: JSON.stringify(deferredWireOperation),
    });
    assert.equal(foreignSend.status, 404);
    const retry = await reconnectPending(store, transport);
    assert.deepEqual(retry, { synced: 1, failed: 0 });
    pending = await store.getPendingOperations();
    assert.equal(pending.length, 0);
    assert.equal(
      await connection.db
        .collection("pages")
        .countDocuments({ id: deferredPageId, workspaceId: absentWorkspaceId }),
      1,
    );

    // Required unauthenticated rejection is exercised against the actual route.
    const unauthorized = await rawFetch(`${baseUrl}/api/sync/operations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(deferredOperation),
    });
    assert.equal(unauthorized.status, 401);

    await client.workspaces.create({
      id: workspaceId,
      name: "Owner workspace",
    });
    await store.upsertPage(localPage(pageId, workspaceId, "Local page", "b"));
    await store.upsertBlock(localBlock(blockId, workspaceId, pageId, "hello"));
    const [pageOperation, blockOperation] = await store.getPendingOperations();
    assert.equal(pageOperation.sequence, 2);
    assert.equal(blockOperation.sequence, 3);
    assert.equal(pageOperation.clientId, beforeFailure.clientId);
    assert.equal(blockOperation.clientId, beforeFailure.clientId);
    assert.equal((await reconnectPending(store, transport)).synced, 2);
    assert.equal((await store.getPendingOperations()).length, 0);

    const pages = connection.db.collection("pages");
    const blocks = connection.db.collection("blocks");
    const receipts = connection.db.collection("operation_receipts");
    assert.equal(await pages.countDocuments({ id: pageId, workspaceId }), 1);
    assert.equal(
      await blocks.countDocuments({ id: blockId, workspaceId, pageId }),
      1,
    );
    const initialPage = await pages.findOne({ id: pageId });
    assert.equal(initialPage.parentPageId, null);
    assert.equal(initialPage.orderKey, "b");
    const initialBlock = await blocks.findOne({ id: blockId });
    assert.equal(initialBlock.props.text, "hello");

    // A server success followed by a local acknowledgement failure leaves the
    // stable operation retryable. Its second delivery must hit the receipt.
    await store.upsertBlock(
      localBlock(blockId, workspaceId, pageId, "ack retry"),
    );
    const ackOperation = (await store.getPendingOperations()).at(-1);
    const realMarkSynced = store.markOperationSynced.bind(store);
    store.markOperationSynced = async () => {
      throw new Error("simulated local acknowledgement failure");
    };
    await assert.rejects(
      reconnectPending(store, transport),
      /acknowledgement failure/,
    );
    store.markOperationSynced = realMarkSynced;
    assert.equal(
      (await store.getPendingOperations()).at(-1).id,
      ackOperation.id,
    );
    await new Promise((resolve) => setTimeout(resolve, 15));
    assert.deepEqual(await reconnectPending(store, transport), {
      synced: 1,
      failed: 0,
    });
    assert.equal(
      (await blocks.findOne({ id: blockId })).props.text,
      "ack retry",
    );
    assert.equal(await receipts.countDocuments({ id: ackOperation.id }), 1);

    // Same ID plus exact content is successful and leaves the stored mutation
    // unchanged. Same ID plus a different content hash is a conflict.
    const pageBeforeDuplicate = await pages.findOne({ id: pageId });
    await new Promise((resolve) => setTimeout(resolve, 15));
    await transport.send(pageOperation);
    const pageAfterDuplicate = await pages.findOne({ id: pageId });
    assert.equal(
      pageAfterDuplicate.updatedAt.getTime(),
      pageBeforeDuplicate.updatedAt.getTime(),
    );
    assert.equal(await receipts.countDocuments({ id: pageOperation.id }), 1);
    const pageReceipt = await receipts.findOne({ id: pageOperation.id });
    assert.equal(pageReceipt.clientId, pageOperation.clientId);
    assert.equal(pageReceipt.sequence, pageOperation.sequence);
    const { status: _pageStatus, ...pageWireOperation } = pageOperation;
    const mismatch = await rawFetch(`${baseUrl}/api/sync/operations`, {
      method: "POST",
      headers: { cookie: sessionCookie, "content-type": "application/json" },
      body: JSON.stringify({
        ...pageWireOperation,
        payload: { ...pageWireOperation.payload, title: "Different content" },
      }),
    });
    assert.equal(mismatch.status, 409);
    assert.equal(
      await pages.countDocuments({ id: pageId, title: "Local page" }),
      1,
    );
    const changedWorkspace = await rawFetch(`${baseUrl}/api/sync/operations`, {
      method: "POST",
      headers: { cookie: sessionCookie, "content-type": "application/json" },
      body: JSON.stringify({
        ...pageWireOperation,
        workspaceId: absentWorkspaceId,
      }),
    });
    assert.equal(changedWorkspace.status, 409);
    assert.equal(await receipts.countDocuments({ id: pageOperation.id }), 1);

    // A new operation is submitted concurrently with the same stable ID. One
    // unique receipt and one Mongo business row must remain.
    await store.upsertPage(
      localPage(pageId, workspaceId, "Concurrent operation", "c"),
    );
    const concurrentOperation = (await store.getPendingOperations())[0];
    const concurrentResults = await Promise.all([
      transport.send(concurrentOperation),
      transport.send(concurrentOperation),
    ]);
    assert.equal(concurrentResults.length, 2);
    assert.equal(
      await receipts.countDocuments({ id: concurrentOperation.id }),
      1,
    );
    assert.equal(await pages.countDocuments({ id: pageId, workspaceId }), 1);
    await store.markOperationSynced(concurrentOperation.id);

    // Delete operations preserve workspace scope and remove the server records.
    await store.deleteBlock(workspaceId, blockId);
    const blockDelete = (await store.getPendingOperations())[0];
    await transport.send(blockDelete);
    await store.markOperationSynced(blockDelete.id);
    assert.equal(await blocks.countDocuments({ id: blockId, workspaceId }), 0);
    const cascadeBlockId = `cascade-${database}`;
    await store.upsertBlock(
      localBlock(cascadeBlockId, workspaceId, pageId, "deleted with page"),
    );
    const cascadeUpsert = (await store.getPendingOperations())[0];
    await transport.send(cascadeUpsert);
    await store.markOperationSynced(cascadeUpsert.id);
    assert.equal(
      await blocks.countDocuments({ id: cascadeBlockId, workspaceId }),
      1,
    );
    await store.deletePage(workspaceId, pageId);
    const pageDelete = (await store.getPendingOperations())[0];
    await transport.send(pageDelete);
    await store.markOperationSynced(pageDelete.id);
    assert.equal(await pages.countDocuments({ id: pageId, workspaceId }), 0);
    assert.equal(
      await blocks.countDocuments({ id: cascadeBlockId, workspaceId }),
      0,
    );
    assert.equal(await receipts.countDocuments({ id: blockDelete.id }), 1);
    assert.equal(await receipts.countDocuments({ id: pageDelete.id }), 1);

    // Pause sync deletion after its child scan. A regular HTTP block create
    // commits during that gap; both paths must still leave no orphan block.
    const racePageId = `race-page-${database}`;
    const raceBlockId = `race-block-${database}`;
    await client.pages.create(workspaceId, {
      id: racePageId,
      parentPageId: null,
      title: "Race page",
      orderKey: "z",
    });
    const { PageRepository } =
      await import("../../../dist/modules/server-domain/repositories/page.repository.js");
    const pageRepository = app.get(PageRepository);
    const originalDelete =
      pageRepository.deleteInWorkspace.bind(pageRepository);
    let enteredDelete;
    let resumeDelete;
    const deleteEntered = new Promise((resolve) => {
      enteredDelete = resolve;
    });
    const deletePaused = new Promise((resolve) => {
      resumeDelete = resolve;
    });
    let barrierTimeout;
    pageRepository.deleteInWorkspace = async (...args) => {
      enteredDelete();
      await deletePaused;
      return originalDelete(...args);
    };
    try {
      const raceDelete = transport
        .send({
          id: `race-delete-${database}`,
          clientId: beforeFailure.clientId,
          sequence: 99,
          workspaceId,
          createdAt: new Date().toISOString(),
          kind: "page.delete",
          payload: { id: racePageId },
        })
        .then(
          () => null,
          (error) => error,
        );
      await Promise.race([
        deleteEntered,
        new Promise((_, reject) => {
          barrierTimeout = setTimeout(
            () => reject(new Error("delete did not reach barrier")),
            5000,
          );
        }),
      ]);
      const createDuringDelete = await client.blocks.create(
        workspaceId,
        racePageId,
        {
          id: raceBlockId,
          parentBlockId: null,
          type: "paragraph",
          orderKey: "a",
          props: { text: "racing" },
        },
      );
      assert.equal(createDuringDelete.id, raceBlockId);
      resumeDelete();
      assert.equal(await raceDelete, null);
      assert.equal(
        await pages.countDocuments({ id: racePageId, workspaceId }),
        0,
      );
      assert.equal(
        await blocks.countDocuments({ id: raceBlockId, workspaceId }),
        0,
      );
    } finally {
      clearTimeout(barrierTimeout);
      resumeDelete();
      pageRepository.deleteInWorkspace = originalDelete;
    }
  } finally {
    if (!app) {
      if (previousMongoUri === undefined) delete process.env.MONGODB_URI;
      else process.env.MONGODB_URI = previousMongoUri;
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousWebOrigin === undefined) delete process.env.WEB_ORIGIN;
      else process.env.WEB_ORIGIN = previousWebOrigin;
    }
  }
});
