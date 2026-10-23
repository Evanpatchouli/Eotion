import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { NotFoundException } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { getConnectionToken } from "@nestjs/mongoose";
import type { Connection } from "mongoose";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { DatabaseService } from "../server-domain/services/database.service";
import { PageService } from "../server-domain/services/page.service";
import { McpMutationRepository } from "../server-domain/repositories/mcp-mutation.repository";
import { WorkspacePermissionService } from "../server-domain/services/workspace-permission.service";
import { BlockService } from "../server-domain/services/block.service";

type App = Awaited<ReturnType<typeof NestFactory.create>>;
type ToolResult = Awaited<ReturnType<Client["callTool"]>>;
type HttpResult = { status: number; headers: Headers; body: Record<string, any>; text: string };

function isolatedMongoUri(): string {
  const configured = process.env.P4_TEST_MONGODB_URI?.trim();
  if (!configured) throw new Error("P4_TEST_MONGODB_URI must point to an isolated test MongoDB replica set");
  const uri = new URL(configured);
  uri.pathname = `/eotion_mcp_database_write_${randomUUID().replaceAll("-", "")}`;
  return uri.toString();
}

async function request(baseUrl: string, path: string, method = "GET", options: {
  cookie?: string;
  body?: unknown;
} = {}): Promise<HttpResult> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  let body: Record<string, any> = {};
  if (text) {
    try { body = JSON.parse(text) as Record<string, any>; }
    catch { body = { raw: text }; }
  }
  return { status: response.status, headers: response.headers, body, text };
}

function cookieFrom(response: HttpResult): string {
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie);
  return cookie.split(";", 1)[0]!;
}

function userOf(response: HttpResult): Record<string, any> { return response.body.user ?? response.body; }
function toolText(result: ToolResult): string {
  return result.content.flatMap(item => item.type === "text" ? [item.text] : []).join("\n");
}
function success(result: ToolResult): Record<string, any> {
  assert.equal(result.isError, undefined, toolText(result));
  assert.ok(result.structuredContent && typeof result.structuredContent === "object");
  return result.structuredContent as Record<string, any>;
}
function failure(result: ToolResult, code?: RegExp): string {
  assert.equal(result.isError, true, JSON.stringify(result.structuredContent));
  assert.equal(result.structuredContent, undefined);
  const text = toolText(result);
  if (code) assert.match(text, code);
  return text;
}
const key = (label: string) => `${label}-${randomUUID()}`;

test("Database MCP write tools enforce scope, CAS, replay and transactional projections", async t => {
  const previousMongoUri = process.env.MONGODB_URI;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousWebOrigin = process.env.WEB_ORIGIN;
  process.env.MONGODB_URI = isolatedMongoUri();
  delete process.env.NODE_ENV;
  process.env.WEB_ORIGIN = "https://trusted.example.test";

  let app: App | undefined;
  let connection: Connection | undefined;
  const clients = new Set<Client>();
  const startApp = async () => {
    const { AppModule } = await import("../../app.module");
    const next = await NestFactory.create(AppModule, new FastifyAdapter(), { logger: false });
    next.setGlobalPrefix("api");
    await next.listen(0, "127.0.0.1");
    const address = next.getHttpServer().address();
    assert.ok(address && typeof address === "object");
    return { app: next, baseUrl: `http://127.0.0.1:${address.port}` };
  };
  const openClient = async (baseUrl: string, token: string, fetchImpl: typeof fetch = fetch) => {
    const client = new Client({ name: "eotion-mcp-database-write-test", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
      fetch: fetchImpl,
    }));
    clients.add(client);
    return client;
  };
  try {
    const started = await startApp();
    app = started.app;
    let baseUrl = started.baseUrl;
    connection = app.get<Connection>(getConnectionToken());
    const hello = await connection.db!.admin().command({ hello: 1 });
    assert.ok(typeof hello.setName === "string" || hello.msg === "isdbgrid",
      "Database MCP write integration requires a replica set or mongos; standalone writes cannot prove atomicity");

    const register = async (label: string) => {
      const password = `mcp-database-${label}-test-passphrase`;
      const created = await request(baseUrl, "/api/auth/register", "POST", {
        body: { email: `mcp-db-${label}-${randomUUID()}@example.test`, password },
      });
      assert.equal(created.status, 201, created.text);
      const user = userOf(created);
      const login = await request(baseUrl, "/api/auth/login", "POST", { body: { email: user.email, password } });
      assert.equal(login.status, 201, login.text);
      const token = await request(baseUrl, "/api/mcp/tokens", "POST", { cookie: cookieFrom(login), body: { name: label } });
      assert.equal(token.status, 201, token.text);
      return { user, cookie: cookieFrom(login), token: token.body.token as string };
    };
    const owner = await register("owner");
    const outsider = await register("outsider");
    await request(baseUrl, "/api/workspaces", "POST", { cookie: owner.cookie, body: { id: "db-write-owner", name: "Owner" } }).then(result => assert.equal(result.status, 201, result.text));
    await request(baseUrl, "/api/workspaces", "POST", { cookie: outsider.cookie, body: { id: "db-write-outsider", name: "Outsider" } }).then(result => assert.equal(result.status, 201, result.text));
    const ownerTokenResponse = { body: { token: owner.token } };
    const outsiderTokenResponse = { body: { token: outsider.token } };

    const pages = app.get(PageService);
    const databases = app.get(DatabaseService);
    const receipts = app.get(McpMutationRepository);
    await pages.create(owner.user.id, "db-write-owner", { id: "db-write-home", parentPageId: null, title: "Home", orderKey: "0000" });
    await pages.create(outsider.user.id, "db-write-outsider", { id: "db-write-outsider-home", parentPageId: null, title: "Home", orderKey: "0000" });
    const createDatabase = (userId: string, workspaceId: string, pageId: string, id: string) => databases.createInPage(userId, workspaceId, pageId, {
      id, name: id, titlePropertyId: `${id}-title`, viewId: `${id}-view`, blockId: `${id}-block`, orderKey: "0001", parentBlockId: null,
    });
    const primary = await createDatabase(owner.user.id, "db-write-owner", "db-write-home", "db-write-main");
    const target = await createDatabase(owner.user.id, "db-write-owner", "db-write-home", "db-write-target");
    const unknownCommitDatabase = await createDatabase(owner.user.id, "db-write-owner", "db-write-home", "db-write-unknown-commit");
    const foreign = await createDatabase(outsider.user.id, "db-write-outsider", "db-write-outsider-home", "db-write-private");
    let dbVersion = primary.database.version;
    const client = await openClient(baseUrl, ownerTokenResponse.body.token);
    const deniedClient = await openClient(baseUrl, outsiderTokenResponse.body.token);
    const initialTools = (await client.listTools()).tools;
    assert.deepEqual(initialTools.map(tool => tool.name).sort(), [
      "eotion_create_page", "eotion_create_property", "eotion_create_record", "eotion_create_view",
      "eotion_get_database_schema", "eotion_get_page", "eotion_get_record", "eotion_list_databases",
      "eotion_list_pages", "eotion_list_workspaces", "eotion_query_database", "eotion_rename_database",
      "eotion_resolve_relation_records", "eotion_search_pages", "eotion_update_page", "eotion_update_property",
      "eotion_update_record_cell", "eotion_update_view",
    ]);

    const scope = { workspaceId: "db-write-owner", databaseId: primary.database.id };
    const createRecord = (title: string, idempotencyKey = key("record"), expectedDatabaseVersion = dbVersion, properties?: Record<string, unknown>) => ({
      ...scope, expectedDatabaseVersion, title, idempotencyKey, ...(properties === undefined ? {} : { properties }),
    });
    const invoke = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args });
    const getDatabase = async () => (await databases.find(owner.user.id, scope.workspaceId, scope.databaseId))!;
    const schema = async () => success(await invoke("eotion_get_database_schema", scope));
    const recordsByTitle = async (title: string) => (await databases.listRecords(owner.user.id, scope.workspaceId, scope.databaseId)).filter(record => record.properties[primary.titleProperty.id] === title);

    const withUnknownCommitResult = async <T>(operation: () => Promise<T>): Promise<T> => {
      const activeConnection = app!.get<Connection>(getConnectionToken());
      const originalStartSession = activeConnection.startSession;
      const startSession = originalStartSession.bind(activeConnection);
      activeConnection.startSession = (async (...args: Parameters<Connection["startSession"]>) => {
        const session = await startSession(...args);
        const actualWithTransaction = session.withTransaction.bind(session);
        session.withTransaction = (async (callback: any, options?: any) => {
          const committed = await actualWithTransaction(callback, options);
          const unknown = new Error("injected UnknownTransactionCommitResult after real commit") as Error & {
            hasErrorLabel(label: string): boolean;
          };
          unknown.hasErrorLabel = label => label === "UnknownTransactionCommitResult";
          throw unknown;
        }) as typeof session.withTransaction;
        return session;
      }) as Connection["startSession"];
      try { return await operation(); }
      finally { activeConnection.startSession = originalStartSession; }
    };

    // Simulate an unknown result only after MongoDB's real transaction callback and commit completed.
    // The committed receipt is the evidence that the test did not fake or skip the business write.
    const pageService = app.get(PageService);
    const blocks = app.get(BlockService);
    const pageCountBeforeUnknownCreate = (await pageService.list(owner.user.id, scope.workspaceId)).length;
    const blockCountBeforeUnknownCreate = (await blocks.listByWorkspace(owner.user.id, scope.workspaceId)).length;
    const unknownPageCreateInput = {
      workspaceId: scope.workspaceId, parentPageId: "db-write-home", title: "Unknown commit create",
      idempotencyKey: key("unknown-page-create"), blocks: [{ type: "paragraph", text: "committed exactly once" }],
    };
    const unknownPageCreateResponse = await withUnknownCommitResult(() => invoke("eotion_create_page", unknownPageCreateInput));
    const unknownPageCreateText = failure(unknownPageCreateResponse);
    assert.match(unknownPageCreateText, /unconfirmed/i);
    assert.match(unknownPageCreateText, /original idempotencyKey and identical payload/i);
    assert.doesNotMatch(unknownPageCreateText, /requires? MongoDB replica|replica set transactions|rollback/i);
    const unknownPageCreateReceipt = await receipts.find({
      userId: owner.user.id, tool: "eotion_create_page", idempotencyKey: unknownPageCreateInput.idempotencyKey,
    });
    assert.ok(unknownPageCreateReceipt, "the receipt proves the real transaction committed before its result became unknown");
    const committedPageDto = unknownPageCreateReceipt.result as Record<string, any>;
    const pageCountAfterUnknownCreate = (await pageService.list(owner.user.id, scope.workspaceId)).length;
    const blockCountAfterUnknownCreate = (await blocks.listByWorkspace(owner.user.id, scope.workspaceId)).length;
    assert.equal(pageCountAfterUnknownCreate, pageCountBeforeUnknownCreate + 1);
    assert.equal(blockCountAfterUnknownCreate, blockCountBeforeUnknownCreate + 1);
    assert.deepEqual(success(await invoke("eotion_create_page", unknownPageCreateInput)), committedPageDto);
    assert.equal((await pageService.list(owner.user.id, scope.workspaceId)).length, pageCountAfterUnknownCreate);
    assert.equal((await blocks.listByWorkspace(owner.user.id, scope.workspaceId)).length, blockCountAfterUnknownCreate);

    const unknownPageUpdateInput = {
      pageId: committedPageDto.id as string,
      expectedUpdatedAt: committedPageDto.updatedAt as string,
      title: "Unknown commit update",
      blocks: [{ type: "paragraph", text: "updated exactly once" }],
      idempotencyKey: key("unknown-page-update"),
    };
    const pageCountBeforeUnknownUpdate = (await pageService.list(owner.user.id, scope.workspaceId)).length;
    const blockCountBeforeUnknownUpdate = (await blocks.listByWorkspace(owner.user.id, scope.workspaceId)).length;
    const unknownPageUpdateResponse = await withUnknownCommitResult(() => invoke("eotion_update_page", unknownPageUpdateInput));
    const unknownPageUpdateText = failure(unknownPageUpdateResponse);
    assert.match(unknownPageUpdateText, /unconfirmed/i);
    assert.match(unknownPageUpdateText, /original idempotencyKey and identical payload/i);
    assert.doesNotMatch(unknownPageUpdateText, /requires? MongoDB replica|replica set transactions|rollback/i);
    const unknownPageUpdateReceipt = await receipts.find({
      userId: owner.user.id, tool: "eotion_update_page", idempotencyKey: unknownPageUpdateInput.idempotencyKey,
    });
    assert.ok(unknownPageUpdateReceipt, "the update receipt proves the actual Page/Block transaction committed");
    const committedUpdatedPageDto = unknownPageUpdateReceipt.result as Record<string, any>;
    assert.equal((await pages.find(owner.user.id, scope.workspaceId, committedPageDto.id))?.title, "Unknown commit update");
    const pageCountAfterUnknownUpdate = (await pageService.list(owner.user.id, scope.workspaceId)).length;
    const blockCountAfterUnknownUpdate = (await blocks.listByWorkspace(owner.user.id, scope.workspaceId)).length;
    assert.equal(pageCountAfterUnknownUpdate, pageCountBeforeUnknownUpdate);
    assert.equal(blockCountAfterUnknownUpdate, blockCountBeforeUnknownUpdate);
    assert.deepEqual(success(await invoke("eotion_update_page", unknownPageUpdateInput)), committedUpdatedPageDto);
    assert.equal((await pageService.list(owner.user.id, scope.workspaceId)).length, pageCountAfterUnknownUpdate);
    assert.equal((await blocks.listByWorkspace(owner.user.id, scope.workspaceId)).length, blockCountAfterUnknownUpdate);
    assert.deepEqual(success(await invoke("eotion_get_page", { pageId: committedPageDto.id })), committedUpdatedPageDto);

    const unknownDatabaseRecordInput = {
      workspaceId: scope.workspaceId, databaseId: unknownCommitDatabase.database.id,
      expectedDatabaseVersion: unknownCommitDatabase.database.version, title: "Unknown commit database row",
      idempotencyKey: key("unknown-database-record"),
    };
    const getUnknownCommitDatabase = async () => (await databases.find(owner.user.id, scope.workspaceId, unknownCommitDatabase.database.id))!;
    const databaseVersionBeforeUnknownCommit = (await getUnknownCommitDatabase()).version;
    const databaseRecordCountBeforeUnknownCommit = (await databases.listRecords(owner.user.id, scope.workspaceId, unknownCommitDatabase.database.id)).length;
    const databasePageCountBeforeUnknownCommit = (await pageService.list(owner.user.id, scope.workspaceId)).length;
    const unknownDatabaseRecordResponse = await withUnknownCommitResult(() => invoke("eotion_create_record", unknownDatabaseRecordInput));
    const unknownDatabaseRecordText = failure(unknownDatabaseRecordResponse);
    assert.match(unknownDatabaseRecordText, /^UNAVAILABLE:.*unconfirmed/i);
    assert.match(unknownDatabaseRecordText, /original idempotencyKey and identical payload/i);
    assert.doesNotMatch(unknownDatabaseRecordText, /requires? MongoDB replica|replica set transactions|rollback/i);
    const unknownDatabaseRecordReceipt = await receipts.find({
      userId: owner.user.id, tool: "eotion_create_record", idempotencyKey: unknownDatabaseRecordInput.idempotencyKey,
    });
    assert.ok(unknownDatabaseRecordReceipt, "the Database receipt proves the actual Record/Page transaction committed");
    const committedDatabaseRecordDto = unknownDatabaseRecordReceipt.result as Record<string, any>;
    const databaseVersionAfterUnknownCommit = (await getUnknownCommitDatabase()).version;
    const databaseRecordCountAfterUnknownCommit = (await databases.listRecords(owner.user.id, scope.workspaceId, unknownCommitDatabase.database.id)).length;
    const databasePageCountAfterUnknownCommit = (await pageService.list(owner.user.id, scope.workspaceId)).length;
    assert.equal(databaseVersionAfterUnknownCommit, databaseVersionBeforeUnknownCommit + 1);
    assert.equal(databaseRecordCountAfterUnknownCommit, databaseRecordCountBeforeUnknownCommit + 1);
    assert.equal(databasePageCountAfterUnknownCommit, databasePageCountBeforeUnknownCommit + 1);
    assert.deepEqual(success(await invoke("eotion_create_record", unknownDatabaseRecordInput)), committedDatabaseRecordDto);
    assert.equal((await getUnknownCommitDatabase()).version, databaseVersionAfterUnknownCommit);
    assert.equal((await databases.listRecords(owner.user.id, scope.workspaceId, unknownCommitDatabase.database.id)).length, databaseRecordCountAfterUnknownCommit);
    assert.equal((await pageService.list(owner.user.id, scope.workspaceId)).length, databasePageCountAfterUnknownCommit);

    // Create Record and its Page atomically; only Page stores the title.
    const recordCreateInput = createRecord("MCP-created row");
    const createdRecordResult = success(await invoke("eotion_create_record", recordCreateInput));
    assert.deepEqual(Object.keys(createdRecordResult).sort(), ["database", "record"]);
    assert.equal(createdRecordResult.record.properties[primary.titleProperty.id], "MCP-created row");
    assert.equal(createdRecordResult.record.version, 1);
    assert.equal(createdRecordResult.database.version, 2);
    dbVersion = 2;
    const createdPage = await pages.find(owner.user.id, scope.workspaceId, createdRecordResult.record.pageId);
    assert.ok(createdPage);
    assert.equal(createdPage.title, "MCP-created row");
    assert.deepEqual((await app.get<Connection>(getConnectionToken()).db!.collection("database_records").findOne({ id: createdRecordResult.record.id }))?.properties ?? {}, {});
    assert.deepEqual(success(await invoke("eotion_create_record", recordCreateInput)), createdRecordResult);
    failure(await invoke("eotion_create_record", { ...recordCreateInput, title: "Changed create payload" }), /idempot|key|conflict/i);
    const permissionService = app.get(WorkspacePermissionService);
    const originalAssertCanWrite = permissionService.assertCanWrite.bind(permissionService);
    permissionService.assertCanWrite = async () => { throw new NotFoundException("Workspace not found"); };
    try { failure(await invoke("eotion_create_record", recordCreateInput), /^NOT_FOUND:/); }
    finally { permissionService.assertCanWrite = originalAssertCanWrite; }

    // The seven tools each replay an identical key and reject changed payload, even after CAS has expired.
    const nameOnly = { ...scope, expectedDatabaseVersion: dbVersion, name: "Database renamed", idempotencyKey: key("rename") };
    const renameResult = success(await invoke("eotion_rename_database", nameOnly));
    dbVersion++;
    assert.deepEqual(success(await invoke("eotion_rename_database", nameOnly)), renameResult);
    failure(await invoke("eotion_rename_database", { ...nameOnly, name: "different name" }), /idempot|key|conflict/i);

    const newPropertyInput = { ...scope, expectedDatabaseVersion: dbVersion, name: "Notes", type: "text", idempotencyKey: key("property") };
    const newProperty = success(await invoke("eotion_create_property", newPropertyInput));
    dbVersion++;
    const notesId = newProperty.property.id as string;
    assert.deepEqual(success(await invoke("eotion_create_property", newPropertyInput)), newProperty);
    failure(await invoke("eotion_create_property", { ...newPropertyInput, name: "Different notes" }), /idempot|key|conflict/i);

    const propertyUpdateInput = { ...scope, expectedDatabaseVersion: dbVersion, propertyId: notesId, expectedPropertyVersion: 1, name: "Notes renamed", idempotencyKey: key("property-update") };
    const updatedProperty = success(await invoke("eotion_update_property", propertyUpdateInput));
    dbVersion++;
    assert.deepEqual(success(await invoke("eotion_update_property", propertyUpdateInput)), updatedProperty);
    failure(await invoke("eotion_update_property", { ...propertyUpdateInput, name: "changed again" }), /idempot|key|conflict/i);

    const viewCreateInput = { ...scope, expectedDatabaseVersion: dbVersion, name: "Board", type: "board", idempotencyKey: key("view") };
    const createdView = success(await invoke("eotion_create_view", viewCreateInput));
    dbVersion++;
    const viewId = createdView.view.id as string;
    assert.deepEqual(success(await invoke("eotion_create_view", viewCreateInput)), createdView);
    failure(await invoke("eotion_create_view", { ...viewCreateInput, name: "Changed Board" }), /idempot|key|conflict/i);

    const viewUpdateInput = { ...scope, expectedDatabaseVersion: dbVersion, viewId, expectedViewVersion: 1, name: "Renamed Board", idempotencyKey: key("view-update") };
    const updatedView = success(await invoke("eotion_update_view", viewUpdateInput));
    dbVersion++;
    assert.deepEqual(success(await invoke("eotion_update_view", viewUpdateInput)), updatedView);
    failure(await invoke("eotion_update_view", { ...viewUpdateInput, name: "Another name" }), /idempot|key|conflict/i);

    const cellRecord = createdRecordResult.record;
    const cellInput = { ...scope, expectedDatabaseVersion: dbVersion, recordId: cellRecord.id, propertyId: notesId, value: "cell value", expectedRecordVersion: 1, idempotencyKey: key("cell") };
    const updatedCell = success(await invoke("eotion_update_record_cell", cellInput));
    dbVersion++;
    assert.equal(updatedCell.record.properties[notesId], "cell value");
    assert.deepEqual(success(await invoke("eotion_update_record_cell", cellInput)), updatedCell);
    failure(await invoke("eotion_update_record_cell", { ...cellInput, value: "different cell value" }), /idempot|key|conflict/i);

    const titleCellInput = {
      ...scope, expectedDatabaseVersion: dbVersion, recordId: cellRecord.id, propertyId: primary.titleProperty.id,
      value: "Title updated by MCP", expectedRecordVersion: 2, expectedPageUpdatedAt: createdPage.updatedAt, idempotencyKey: key("title-cell"),
    };
    const titleUpdated = success(await invoke("eotion_update_record_cell", titleCellInput));
    dbVersion++;
    assert.equal((await pages.find(owner.user.id, scope.workspaceId, cellRecord.pageId))?.title, "Title updated by MCP");
    assert.deepEqual(success(await invoke("eotion_update_record_cell", titleCellInput)), titleUpdated);

    // Initial Date and Relation values round-trip through the real database projection.
    const dateCreate = { ...scope, expectedDatabaseVersion: dbVersion, name: "Due", type: "date", idempotencyKey: key("date-property") };
    const dateProperty = success(await invoke("eotion_create_property", dateCreate));
    dbVersion++;
    const relationCreate = { ...scope, expectedDatabaseVersion: dbVersion, name: "Related", type: "relation", config: { targetDatabaseId: target.database.id }, idempotencyKey: key("relation-property") };
    const relationProperty = success(await invoke("eotion_create_property", relationCreate));
    dbVersion++;
    const relatedTarget = success(await invoke("eotion_create_record", {
      workspaceId: scope.workspaceId, databaseId: target.database.id, expectedDatabaseVersion: target.database.version,
      title: "Target row", idempotencyKey: key("target-row"),
    }));
    const initValuesInput = createRecord("Initial Date and Relation", key("typed-record"), dbVersion, {
      [dateProperty.property.id]: { start: "2026-10-23T08:00:00.000Z", end: "2026-10-24T08:00:00.000Z", timeZone: "Asia/Shanghai" },
      [relationProperty.property.id]: [relatedTarget.record.id],
    });
    const typedRecord = success(await invoke("eotion_create_record", initValuesInput));
    dbVersion++;
    assert.deepEqual(typedRecord.record.properties[dateProperty.property.id], { start: "2026-10-23T08:00:00.000Z", end: "2026-10-24T08:00:00.000Z", timeZone: "Asia/Shanghai" });
    assert.deepEqual(typedRecord.record.properties[relationProperty.property.id], [relatedTarget.record.id]);
    const readTyped = success(await invoke("eotion_get_record", { ...scope, recordId: typedRecord.record.id }));
    assert.deepEqual(readTyped.properties[relationProperty.property.id], [relatedTarget.record.id]);

    // Every successful operation must replay its stored DTO before checking the now-stale CAS values.
    for (const [toolName, originalInput, firstResult] of [
      ["eotion_create_record", recordCreateInput, createdRecordResult],
      ["eotion_rename_database", nameOnly, renameResult],
      ["eotion_create_property", newPropertyInput, newProperty],
      ["eotion_update_property", propertyUpdateInput, updatedProperty],
      ["eotion_create_view", viewCreateInput, createdView],
      ["eotion_update_view", viewUpdateInput, updatedView],
      ["eotion_update_record_cell", cellInput, updatedCell],
      ["eotion_update_record_cell", titleCellInput, titleUpdated],
    ] as const) {
      assert.deepEqual(success(await invoke(toolName, originalInput)), firstResult, `${toolName} must replay before stale CAS validation`);
    }

    // Name-only Property/View updates preserve configuration, including unknown View options.
    const selectCreate = { ...scope, expectedDatabaseVersion: dbVersion, name: "Status", type: "select", options: [{ id: "open", name: "Open" }, { id: "done", name: "Done" }], idempotencyKey: key("select") };
    const selectProperty = success(await invoke("eotion_create_property", selectCreate));
    dbVersion++;
    const configuredView = { ...scope, expectedDatabaseVersion: dbVersion, name: "Options view", type: "table", config: {
      filters: [{ propertyId: selectProperty.property.id, operator: "is", value: "open" }],
      sorts: [], visibleProperties: null, propertyOrder: null, options: { futureField: { retain: true } },
    }, idempotencyKey: key("options-view") };
    const optionsView = success(await invoke("eotion_create_view", configuredView));
    dbVersion++;
    const renamedSelect = success(await invoke("eotion_update_property", {
      ...scope, expectedDatabaseVersion: dbVersion, propertyId: selectProperty.property.id, expectedPropertyVersion: 1,
      name: "Status renamed", idempotencyKey: key("select-rename"),
    }));
    dbVersion++;
    assert.deepEqual(renamedSelect.property.options, selectProperty.property.options);
    const optionsViewId = optionsView.view.id as string;
    const renamedOptionsView = success(await invoke("eotion_update_view", {
      ...scope, expectedDatabaseVersion: dbVersion, viewId: optionsViewId, expectedViewVersion: 1,
      name: "Options view renamed", idempotencyKey: key("options-view-rename"),
    }));
    dbVersion++;
    assert.deepEqual(renamedOptionsView.view.config.options, { futureField: { retain: true } });

    const formulaProperty = await databases.createProperty(owner.user.id, scope.workspaceId, scope.databaseId, {
      id: "db-write-formula", name: "Formula", type: "formula",
      config: { expression: { kind: "literal", value: 2 }, resultType: "number" }, expectedDatabaseVersion: dbVersion,
    });
    dbVersion = formulaProperty.database.version;
    const rollupProperty = await databases.createProperty(owner.user.id, scope.workspaceId, scope.databaseId, {
      id: "db-write-rollup", name: "Rollup", type: "rollup",
      config: { relationPropertyId: relationProperty.property.id, targetPropertyId: target.titleProperty.id, aggregation: "count" }, expectedDatabaseVersion: dbVersion,
    });
    dbVersion = rollupProperty.database.version;

    // Invalid schema, absent targets, foreign scope, and permission failures for all seven write tools.
    const validInputs: Array<[string, Record<string, unknown>]> = [
      ["eotion_create_record", createRecord("Validation row", key("validation-record"), dbVersion)],
      ["eotion_update_record_cell", { ...scope, expectedDatabaseVersion: dbVersion, recordId: cellRecord.id, propertyId: notesId, value: "v", expectedRecordVersion: 3, idempotencyKey: key("validation-cell") }],
      ["eotion_create_property", { ...scope, expectedDatabaseVersion: dbVersion, name: "Valid text", type: "text", idempotencyKey: key("validation-property") }],
      ["eotion_update_property", { ...scope, expectedDatabaseVersion: dbVersion, propertyId: notesId, expectedPropertyVersion: 2, name: "Notes final", idempotencyKey: key("validation-property-update") }],
      ["eotion_create_view", { ...scope, expectedDatabaseVersion: dbVersion, name: "List", type: "list", idempotencyKey: key("validation-view") }],
      ["eotion_update_view", { ...scope, expectedDatabaseVersion: dbVersion, viewId, expectedViewVersion: 2, name: "List final", idempotencyKey: key("validation-view-update") }],
      ["eotion_rename_database", { ...scope, expectedDatabaseVersion: dbVersion, name: "Final database", idempotencyKey: key("validation-rename") }],
    ];
    const nonexistentInputs = validInputs.map(([name, input]) => [name, {
      ...input, databaseId: "absent-database", expectedDatabaseVersion: 1, idempotencyKey: key("missing"),
      ...(name === "eotion_update_record_cell" ? { recordId: "absent-record" } : {}),
      ...(name === "eotion_update_property" ? { propertyId: "absent-property" } : {}),
      ...(name === "eotion_update_view" ? { viewId: "absent-view" } : {}),
    }] as [string, Record<string, unknown>]);
    const foreignInputs = validInputs.map(([name, input]) => [name, { ...input, workspaceId: "db-write-outsider", idempotencyKey: key("foreign") }] as [string, Record<string, unknown>]);
    for (const [name, input] of validInputs) {
      const unknownArg = { ...input, unrecognized: true };
      failure(await invoke(name, unknownArg), /Input validation error/i);
    }
    for (const [name, input] of nonexistentInputs) failure(await invoke(name, input), /^NOT_FOUND:/);
    for (const [name, input] of foreignInputs) failure(await invoke(name, input), /^NOT_FOUND:/);
    for (const [name, input] of validInputs) failure(await deniedClient.callTool({ name, arguments: input }), /^NOT_FOUND:/);

    failure(await invoke("eotion_create_record", createRecord("", key("empty-title"))), /Input validation error/i);
    failure(await invoke("eotion_create_record", createRecord("Derived rejected", key("derived-init"), dbVersion, {
      [formulaProperty.property.id]: 2,
    })), /^INVALID_ARGUMENT:/);
    failure(await invoke("eotion_create_record", createRecord("Invalid relation", key("bad-relation"), dbVersion, {
      [relationProperty.property.id]: ["no-such-record"],
    })), /^INVALID_ARGUMENT:/);
    failure(await invoke("eotion_update_record_cell", {
      ...scope, expectedDatabaseVersion: dbVersion, recordId: typedRecord.record.id,
      propertyId: formulaProperty.property.id, value: 3, expectedRecordVersion: 1, idempotencyKey: key("formula-write"),
    }), /^INVALID_ARGUMENT:/);
    failure(await invoke("eotion_update_record_cell", {
      ...scope, expectedDatabaseVersion: dbVersion, recordId: typedRecord.record.id,
      propertyId: rollupProperty.property.id, value: 3, expectedRecordVersion: 1, idempotencyKey: key("rollup-write"),
    }), /^INVALID_ARGUMENT:/);

    // DB, Record, and Page CAS each reject stale writes without changing state.
    const beforeStaleDb = await getDatabase();
    failure(await invoke("eotion_rename_database", { ...scope, expectedDatabaseVersion: beforeStaleDb.version - 1, name: "Stale DB", idempotencyKey: key("stale-db") }), /^CONFLICT:/);
    const beforeStaleRecord = (await databases.listRecords(owner.user.id, scope.workspaceId, scope.databaseId)).find(record => record.id === cellRecord.id)!;
    failure(await invoke("eotion_update_record_cell", {
      ...scope, expectedDatabaseVersion: beforeStaleDb.version, recordId: beforeStaleRecord.id, propertyId: notesId,
      value: "stale record", expectedRecordVersion: beforeStaleRecord.version - 1, idempotencyKey: key("stale-record"),
    }), /^CONFLICT:/);
    const beforeStalePage = await pages.find(owner.user.id, scope.workspaceId, beforeStaleRecord.pageId);
    failure(await invoke("eotion_update_record_cell", {
      ...scope, expectedDatabaseVersion: beforeStaleDb.version, recordId: beforeStaleRecord.id, propertyId: primary.titleProperty.id,
      value: "stale page", expectedRecordVersion: beforeStaleRecord.version, expectedPageUpdatedAt: "2000-01-01T00:00:00.000Z",
      idempotencyKey: key("stale-page"),
    }), /^CONFLICT:/);
    assert.equal((await getDatabase()).version, beforeStaleDb.version);
    assert.equal((await databases.listRecords(owner.user.id, scope.workspaceId, scope.databaseId)).find(record => record.id === beforeStaleRecord.id)?.version, beforeStaleRecord.version);
    assert.equal((await pages.find(owner.user.id, scope.workspaceId, beforeStaleRecord.pageId))?.updatedAt, beforeStalePage?.updatedAt);

    const propertyForStaleCas = (await databases.listProperties(owner.user.id, scope.workspaceId, scope.databaseId)).find(property => property.id === notesId)!;
    const viewForStaleCas = (await databases.listViews(owner.user.id, scope.workspaceId, scope.databaseId)).find(view => view.id === viewId)!;
    failure(await invoke("eotion_update_property", {
      ...scope, expectedDatabaseVersion: beforeStaleDb.version, propertyId: notesId, expectedPropertyVersion: propertyForStaleCas.version - 1,
      name: "Stale property", idempotencyKey: key("stale-property"),
    }), /^CONFLICT:/);
    failure(await invoke("eotion_update_view", {
      ...scope, expectedDatabaseVersion: beforeStaleDb.version, viewId, expectedViewVersion: viewForStaleCas.version - 1,
      name: "Stale view", idempotencyKey: key("stale-view"),
    }), /^CONFLICT:/);

    const missingIdInputs: Array<Record<string, unknown>> = [
      { ...scope, expectedDatabaseVersion: beforeStaleDb.version, recordId: "missing-record", propertyId: notesId, value: "x", expectedRecordVersion: 1, idempotencyKey: key("missing-record") },
      { ...scope, expectedDatabaseVersion: beforeStaleDb.version, propertyId: "missing-property", expectedPropertyVersion: 1, name: "Missing", idempotencyKey: key("missing-property") },
      { ...scope, expectedDatabaseVersion: beforeStaleDb.version, viewId: "missing-view", expectedViewVersion: 1, name: "Missing", idempotencyKey: key("missing-view") },
    ];
    const foreignEntityInputs: Array<Record<string, unknown>> = [
      { ...scope, expectedDatabaseVersion: beforeStaleDb.version, recordId: relatedTarget.record.id, propertyId: notesId, value: "x", expectedRecordVersion: 1, idempotencyKey: key("foreign-record") },
      { ...scope, expectedDatabaseVersion: beforeStaleDb.version, propertyId: target.titleProperty.id, expectedPropertyVersion: 1, name: "Foreign", idempotencyKey: key("foreign-property") },
      { ...scope, expectedDatabaseVersion: beforeStaleDb.version, viewId: target.view.id, expectedViewVersion: 1, name: "Foreign", idempotencyKey: key("foreign-view") },
    ];
    for (const input of missingIdInputs.slice(0, 1)) failure(await invoke("eotion_update_record_cell", input), /^NOT_FOUND:/);
    failure(await invoke("eotion_update_property", missingIdInputs[1]!), /^NOT_FOUND:/);
    failure(await invoke("eotion_update_view", missingIdInputs[2]!), /^NOT_FOUND:/);
    failure(await invoke("eotion_update_record_cell", foreignEntityInputs[0]!), /^NOT_FOUND:/);
    failure(await invoke("eotion_update_property", foreignEntityInputs[1]!), /^NOT_FOUND:/);
    failure(await invoke("eotion_update_view", foreignEntityInputs[2]!), /^NOT_FOUND:/);

    // Limits and lifecycle validation fail atomically; successful Select replacement cleans cells and View references.
    const beforeBadProperty = await getDatabase();
    failure(await invoke("eotion_create_property", { ...scope, expectedDatabaseVersion: beforeBadProperty.version, name: "Bad Select", type: "select", idempotencyKey: key("bad-select") }), /Input validation error/i);
    failure(await invoke("eotion_create_property", { ...scope, expectedDatabaseVersion: beforeBadProperty.version, name: "Bad Relation", type: "relation", config: { targetDatabaseId: foreign.database.id }, idempotencyKey: key("foreign-relation") }), /^CONFLICT:/);
    failure(await invoke("eotion_create_property", { ...scope, expectedDatabaseVersion: beforeBadProperty.version, name: "Bad Formula", type: "formula", config: { expression: { kind: "property", propertyId: "absent" }, resultType: "number" }, idempotencyKey: key("bad-formula") }));
    failure(await invoke("eotion_create_property", { ...scope, expectedDatabaseVersion: beforeBadProperty.version, name: "Bad Rollup", type: "rollup", config: { relationPropertyId: "absent", targetPropertyId: notesId, aggregation: "count" }, idempotencyKey: key("bad-rollup-dependency") }), /^INVALID_ARGUMENT:/);
    failure(await invoke("eotion_create_view", { ...scope, expectedDatabaseVersion: beforeBadProperty.version, name: "Bad view", type: "kanban", idempotencyKey: key("bad-view-type") }), /Input validation error/i);
    failure(await invoke("eotion_create_view", { ...scope, expectedDatabaseVersion: beforeBadProperty.version, name: "Bad reference", type: "table", config: { filters: [{ propertyId: "absent-property", operator: "is_empty" }], sorts: [], visibleProperties: null, propertyOrder: null }, idempotencyKey: key("bad-view-reference") }), /^INVALID_ARGUMENT:/);
    failure(await invoke("eotion_update_view", { ...scope, expectedDatabaseVersion: beforeBadProperty.version, viewId, expectedViewVersion: 2, type: "table", idempotencyKey: key("view-type-patch") }), /Input validation error/i);
    failure(await invoke("eotion_update_property", { ...scope, expectedDatabaseVersion: beforeBadProperty.version, propertyId: notesId, expectedPropertyVersion: 2, config: null, idempotencyKey: key("null-config") }), /Input validation error/i);
    failure(await invoke("eotion_update_property", { ...scope, expectedDatabaseVersion: beforeBadProperty.version, propertyId: notesId, expectedPropertyVersion: 2, options: null, idempotencyKey: key("null-options") }), /Input validation error/i);
    failure(await invoke("eotion_update_view", { ...scope, expectedDatabaseVersion: beforeBadProperty.version, viewId, expectedViewVersion: 2, config: null, idempotencyKey: key("null-view-config") }), /Input validation error/i);
    failure(await invoke("eotion_update_view", { ...scope, expectedDatabaseVersion: beforeBadProperty.version, viewId, expectedViewVersion: 2, config: { filters: [], sorts: [], visibleProperties: null, propertyOrder: null, options: null }, idempotencyKey: key("null-view-options") }), /Input validation error/i);
    assert.equal((await getDatabase()).version, beforeBadProperty.version);

    const currentSelect = await databases.listProperties(owner.user.id, scope.workspaceId, scope.databaseId).then(items => items.find(item => item.id === selectProperty.property.id)!);
    const selectRecordInput = createRecord("Select cleanup target", key("select-cleanup"), beforeBadProperty.version, { [currentSelect.id]: "open" });
    const selectRecord = success(await invoke("eotion_create_record", selectRecordInput));
    dbVersion = (await getDatabase()).version;
    const beforeSelectUpdate = await getDatabase();
    const selectCleanupInput = {
      ...scope, expectedDatabaseVersion: beforeSelectUpdate.version, propertyId: currentSelect.id, expectedPropertyVersion: currentSelect.version,
      options: [{ id: "done", name: "Done" }], idempotencyKey: key("select-cleanup-update"),
    };
    const beforeCleanupRecord = (await databases.listRecords(owner.user.id, scope.workspaceId, scope.databaseId)).find(record => record.id === selectRecord.record.id)!;
    const beforeCleanupPage = await pages.find(owner.user.id, scope.workspaceId, selectRecord.record.pageId);
    const beforeCleanupView = (await databases.listViews(owner.user.id, scope.workspaceId, scope.databaseId)).find(view => view.id === optionsViewId)!;
    const originalReceiptCreate = receipts.create.bind(receipts);
    receipts.create = async () => { throw new Error("injected Select cleanup receipt failure"); };
    try { failure(await invoke("eotion_update_property", selectCleanupInput), /^INTERNAL:/); }
    finally { receipts.create = originalReceiptCreate; }
    assert.equal((await getDatabase()).version, beforeSelectUpdate.version);
    assert.deepEqual((await databases.listRecords(owner.user.id, scope.workspaceId, scope.databaseId)).find(record => record.id === selectRecord.record.id), beforeCleanupRecord);
    assert.deepEqual(await pages.find(owner.user.id, scope.workspaceId, selectRecord.record.pageId), beforeCleanupPage);
    assert.deepEqual((await databases.listViews(owner.user.id, scope.workspaceId, scope.databaseId)).find(view => view.id === optionsViewId), beforeCleanupView);
    assert.equal(await receipts.find({ userId: owner.user.id, tool: "eotion_update_property", idempotencyKey: selectCleanupInput.idempotencyKey }), null);
    const cleaned = success(await invoke("eotion_update_property", selectCleanupInput));
    dbVersion++;
    assert.equal((await databases.listRecords(owner.user.id, scope.workspaceId, scope.databaseId)).find(record => record.id === selectRecord.record.id)?.properties[currentSelect.id], undefined);
    assert.equal(cleaned.database.version, dbVersion);
    const cleanupView = (await databases.listViews(owner.user.id, scope.workspaceId, scope.databaseId)).find(view => view.id === optionsViewId)!;
    assert.deepEqual(cleanupView.config?.filters, [], "removed Select option must be removed from View filters");
    assert.ok(cleanupView.version > renamedOptionsView.view.version, "Select cleanup must advance the affected View version");

    // Competing writes at one Database version permit exactly one commit.
    const raceDb = await getDatabase();
    const competing = await Promise.all([
      invoke("eotion_create_record", createRecord("CAS race A", key("race-a"), raceDb.version)),
      invoke("eotion_create_record", createRecord("CAS race B", key("race-b"), raceDb.version)),
    ]);
    assert.equal(competing.filter(result => result.isError === undefined).length, 1);
    assert.equal(competing.filter(result => result.isError === true).length, 1);
    const sameKeyCreateInput = createRecord("Concurrent idempotent", key("same-key-race"), (await getDatabase()).version);
    const sameKeyRace = await Promise.all([
      invoke("eotion_create_record", sameKeyCreateInput), invoke("eotion_create_record", sameKeyCreateInput),
    ]);
    assert.deepEqual(success(sameKeyRace[0]!), success(sameKeyRace[1]!));
    assert.equal((await recordsByTitle("Concurrent idempotent")).length, 1);

    // Simulate a committed request whose response disappears at the SDK boundary, then replay it.
    const lostResponseInput = createRecord("Response lost", key("lost-response"), (await getDatabase()).version);
    let discardNextMcpResponse = true;
    const lostResponseFetch: typeof fetch = async (input, init) => {
      const requestText = typeof init?.body === "string"
        ? init.body
        : input instanceof Request ? await input.clone().text() : "";
      const response = await fetch(input, init);
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (discardNextMcpResponse && url.endsWith("/mcp") && requestText.includes('"name":"eotion_create_record"')) {
        discardNextMcpResponse = false;
        const lostBody = await response.text();
        assert.match(lostBody, /Response lost/, "the server must have committed and produced the successful tool response before it is dropped");
        throw new Error("simulated lost MCP response after the server committed");
      }
      return response;
    };
    const lossyClient = await openClient(baseUrl, ownerTokenResponse.body.token, lostResponseFetch);
    await assert.rejects(lossyClient.callTool({ name: "eotion_create_record", arguments: lostResponseInput }), /simulated lost MCP response/);
    assert.equal(discardNextMcpResponse, false, "the custom SDK fetch must intercept the target response");
    await lossyClient.close();
    clients.delete(lossyClient);
    const afterLostResponse = success(await invoke("eotion_create_record", lostResponseInput));
    assert.equal((await recordsByTitle("Response lost")).length, 1);

    // A receipt insertion failure rolls back domain writes and leaves the original key reusable.
    const failedReceiptInput = createRecord("Receipt failure retry", key("receipt-failure"), (await getDatabase()).version);
    const beforeReceiptFailure = await getDatabase();
    const beforeReceiptPages = await connection.db!.collection("pages").countDocuments({ workspaceId: scope.workspaceId });
    receipts.create = async () => { throw new Error("injected database mutation receipt failure"); };
    try { failure(await invoke("eotion_create_record", failedReceiptInput)); }
    finally { receipts.create = originalReceiptCreate; }
    assert.equal((await getDatabase()).version, beforeReceiptFailure.version);
    assert.equal((await recordsByTitle("Receipt failure retry")).length, 0);
    assert.equal(await connection.db!.collection("pages").countDocuments({ workspaceId: scope.workspaceId }), beforeReceiptPages, "failed create receipt must roll back its Page as well as its Record");
    assert.equal(await receipts.find({ userId: owner.user.id, tool: "eotion_create_record", idempotencyKey: failedReceiptInput.idempotencyKey as string }), null);
    success(await invoke("eotion_create_record", failedReceiptInput));

    const titleFailureRecord = (await databases.listRecords(owner.user.id, scope.workspaceId, scope.databaseId)).find(record => record.id === typedRecord.record.id)!;
    const titleFailurePage = (await pages.find(owner.user.id, scope.workspaceId, titleFailureRecord.pageId))!;
    const titleFailureDb = await getDatabase();
    const titleReceiptFailureInput = {
      ...scope, expectedDatabaseVersion: titleFailureDb.version, recordId: titleFailureRecord.id, propertyId: primary.titleProperty.id,
      value: "Title receipt retry", expectedRecordVersion: titleFailureRecord.version, expectedPageUpdatedAt: titleFailurePage.updatedAt,
      idempotencyKey: key("title-receipt-failure"),
    };
    receipts.create = async () => { throw new Error("injected Title update receipt failure"); };
    try { failure(await invoke("eotion_update_record_cell", titleReceiptFailureInput), /^INTERNAL:/); }
    finally { receipts.create = originalReceiptCreate; }
    assert.equal((await getDatabase()).version, titleFailureDb.version);
    assert.deepEqual((await databases.listRecords(owner.user.id, scope.workspaceId, scope.databaseId)).find(record => record.id === titleFailureRecord.id), titleFailureRecord);
    assert.deepEqual(await pages.find(owner.user.id, scope.workspaceId, titleFailurePage.id), titleFailurePage);
    assert.equal(await receipts.find({ userId: owner.user.id, tool: "eotion_update_record_cell", idempotencyKey: titleReceiptFailureInput.idempotencyKey }), null);
    success(await invoke("eotion_update_record_cell", titleReceiptFailureInput));

    // Corrupt the actual service result after its transactional insert so strict output parsing fails in-transaction.
    const failedProjectionInput = { ...scope, expectedDatabaseVersion: (await getDatabase()).version, name: "Projection retry", type: "text", idempotencyKey: key("projection-failure") };
    const beforeProjectionFailure = await getDatabase();
    const originalCreateProperty = databases.createProperty.bind(databases);
    databases.createProperty = async (...args) => {
      const result = await originalCreateProperty(...args);
      return { ...result, property: { ...result.property, type: "not-a-property-type" } } as unknown as typeof result;
    };
    try { failure(await invoke("eotion_create_property", failedProjectionInput)); }
    finally { databases.createProperty = originalCreateProperty; }
    assert.equal((await getDatabase()).version, beforeProjectionFailure.version);
    assert.equal((await databases.listProperties(owner.user.id, scope.workspaceId, scope.databaseId)).some(property => property.name === "Projection retry"), false);
    assert.equal(await receipts.find({ userId: owner.user.id, tool: "eotion_create_property", idempotencyKey: failedProjectionInput.idempotencyKey }), null);
    const projectionRetry = success(await invoke("eotion_create_property", failedProjectionInput));
    assert.equal(projectionRetry.property.name, "Projection retry");

    // Inject an oversized actual transaction result with a small valid request, so Fastify's request-body cap is not involved.
    const oversized = createRecord("Large projection", key("large-projection"), (await getDatabase()).version);
    const beforeOversized = await getDatabase();
    const beforeOversizedPageCount = await connection.db!.collection("pages").countDocuments({ workspaceId: scope.workspaceId });
    const beforeOversizedRecordCount = await databases.listRecords(owner.user.id, scope.workspaceId, scope.databaseId).then(items => items.length);
    const originalCreateRecordPage = databases.createRecordPage.bind(databases);
    databases.createRecordPage = async (...args) => {
      const result = await originalCreateRecordPage(...args);
      return {
        ...result,
        record: { ...result.record, properties: { ...result.record.properties, injectedLargeProjection: "x".repeat(1_048_500) } },
      };
    };
    try { failure(await invoke("eotion_create_record", oversized), /^LIMIT_EXCEEDED:/); }
    finally { databases.createRecordPage = originalCreateRecordPage; }
    assert.equal((await getDatabase()).version, beforeOversized.version);
    assert.equal((await recordsByTitle("Large projection")).length, 0);
    assert.equal(await connection.db!.collection("pages").countDocuments({ workspaceId: scope.workspaceId }), beforeOversizedPageCount);
    assert.equal((await databases.listRecords(owner.user.id, scope.workspaceId, scope.databaseId)).length, beforeOversizedRecordCount);
    assert.equal(await receipts.find({ userId: owner.user.id, tool: "eotion_create_record", idempotencyKey: oversized.idempotencyKey as string }), null);
    success(await invoke("eotion_create_record", oversized));

    const propertyRowsBeforeLimit = await databases.listProperties(owner.user.id, scope.workspaceId, scope.databaseId);
    while (propertyRowsBeforeLimit.length < 100) {
      const current = await getDatabase();
      const property = await databases.createProperty(owner.user.id, scope.workspaceId, scope.databaseId, {
        id: `db-write-limit-${propertyRowsBeforeLimit.length}`, name: `Limit ${propertyRowsBeforeLimit.length}`, type: "text", expectedDatabaseVersion: current.version,
      });
      propertyRowsBeforeLimit.push(property.property);
    }
    const atPropertyLimit = await getDatabase();
    failure(await invoke("eotion_create_property", { ...scope, expectedDatabaseVersion: atPropertyLimit.version, name: "Over property limit", type: "text", idempotencyKey: key("property-limit") }), /^LIMIT_EXCEEDED:/);
    assert.equal((await getDatabase()).version, atPropertyLimit.version);
    assert.equal((await databases.listProperties(owner.user.id, scope.workspaceId, scope.databaseId)).length, 100);

    const viewRowsBeforeLimit = await databases.listViews(owner.user.id, scope.workspaceId, scope.databaseId);
    while (viewRowsBeforeLimit.length < 100) {
      const current = await getDatabase();
      const view = await databases.createView(owner.user.id, scope.workspaceId, scope.databaseId, {
        id: `db-write-view-limit-${viewRowsBeforeLimit.length}`, name: `Limit ${viewRowsBeforeLimit.length}`, type: "table", expectedDatabaseVersion: current.version,
      });
      viewRowsBeforeLimit.push(view.view);
    }
    const atViewLimit = await getDatabase();
    failure(await invoke("eotion_create_view", { ...scope, expectedDatabaseVersion: atViewLimit.version, name: "Over view limit", type: "table", idempotencyKey: key("view-limit") }), /^CONFLICT:/);
    assert.equal((await getDatabase()).version, atViewLimit.version);
    assert.equal((await databases.listViews(owner.user.id, scope.workspaceId, scope.databaseId)).length, 100);

    // Restart the real app and replay a persisted receipt over a fresh SDK client.
    const restartInput = createRecord("Restart replay", key("restart"), (await getDatabase()).version);
    const restartResult = success(await invoke("eotion_create_record", restartInput));
    for (const existing of clients) await existing.close();
    clients.clear();
    await app.close();
    app = undefined;
    const restarted = await startApp();
    app = restarted.app;
    baseUrl = restarted.baseUrl;
    connection = app.get<Connection>(getConnectionToken());
    const restartedClient = await openClient(baseUrl, ownerTokenResponse.body.token);
    const replayAfterRestart = success(await restartedClient.callTool({ name: "eotion_create_record", arguments: restartInput }));
    assert.deepEqual(replayAfterRestart, restartResult);
    assert.equal(await restartedClient.listTools().then(result => result.tools.length), 18);
    // Keep separate fixture database variables used to prove cross-database references and scope above.
    assert.equal(foreign.database.id, "db-write-private");
    assert.equal(target.database.id, "db-write-target");
    assert.ok(afterLostResponse.record.id);
    const restartedDatabaseService = app.get(DatabaseService);
    assert.equal((await restartedDatabaseService.find(owner.user.id, scope.workspaceId, scope.databaseId))?.name, projectionRetry.database.name);
  } finally {
    for (const client of clients) await client.close().catch(() => undefined);
    try { await connection?.dropDatabase(); }
    finally {
      await app?.close();
      if (previousMongoUri === undefined) delete process.env.MONGODB_URI;
      else process.env.MONGODB_URI = previousMongoUri;
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousWebOrigin === undefined) delete process.env.WEB_ORIGIN;
      else process.env.WEB_ORIGIN = previousWebOrigin;
    }
  }
});
