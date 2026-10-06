import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { getConnectionToken } from "@nestjs/mongoose";
import type { Connection } from "mongoose";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type { SyncOperation } from "@eotion/contracts";
import { BlockService } from "../server-domain/services/block.service";
import { PageService } from "../server-domain/services/page.service";
import { SyncService } from "../server-domain/services/sync.service";
import { McpMutationRepository } from "../server-domain/repositories/mcp-mutation.repository";
import { UserEntity } from "../server-domain/schemas/user.schema";
import { getModelToken } from "@nestjs/mongoose";
import type { Model } from "mongoose";

type JsonResponse = { status: number; headers: Headers; body: Record<string, any>; text: string };
type RunningApp = Awaited<ReturnType<typeof NestFactory.create>>;
type ToolResult = Awaited<ReturnType<Client["callTool"]>>;

function testMongoUri(): string {
  const base = process.env.P4_TEST_MONGODB_URI?.trim() || "mongodb://127.0.0.1:27017";
  const uri = new URL(base);
  uri.pathname = `/eotion_mcp_write_test_${randomUUID().replaceAll("-", "")}`;
  return uri.toString();
}

async function request(baseUrl: string, route: string, method = "GET", options: {
  cookie?: string;
  authorization?: string;
  body?: unknown;
} = {}): Promise<JsonResponse> {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.authorization ? { authorization: options.authorization } : {}),
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

function cookieFrom(response: JsonResponse): string {
  const value = response.headers.get("set-cookie");
  assert.ok(value, "expected Set-Cookie response header");
  return value.split(";", 1)[0]!;
}

function onlyUser(body: Record<string, any>): Record<string, any> { return body.user ?? body; }

function toolText(result: ToolResult): string {
  return result.content.flatMap((item) => item.type === "text" ? [item.text] : []).join("\n");
}

function expectToolSuccess(result: ToolResult): Record<string, any> {
  assert.equal(result.isError, undefined, toolText(result));
  assert.ok(result.structuredContent && typeof result.structuredContent === "object");
  return result.structuredContent as Record<string, any>;
}

function expectToolFailure(result: ToolResult, message?: RegExp): string {
  assert.equal(result.isError, true, JSON.stringify(result.structuredContent));
  const text = toolText(result);
  if (message) assert.match(text, message);
  return text;
}

test("MCP write tools persist bounded page mutations atomically and enforce document versions", async () => {
  const previousMongoUri = process.env.MONGODB_URI;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousWebOrigin = process.env.WEB_ORIGIN;
  const mongoUri = testMongoUri();
  process.env.MONGODB_URI = mongoUri;
  delete process.env.NODE_ENV;
  process.env.WEB_ORIGIN = "https://trusted.example.test";

  let app: RunningApp | undefined;
  let connection: Connection | undefined;
  const clients = new Set<Client>();
  const startApp = async (): Promise<{ app: RunningApp; baseUrl: string }> => {
    const { AppModule } = await import("../../app.module");
    const nextApp = await NestFactory.create(AppModule, new FastifyAdapter(), { logger: false });
    nextApp.setGlobalPrefix("api");
    await nextApp.listen(0, "127.0.0.1");
    const address = nextApp.getHttpServer().address();
    assert.ok(address && typeof address === "object");
    return { app: nextApp, baseUrl: `http://127.0.0.1:${address.port}` };
  };
  const openClient = async (baseUrl: string, token: string): Promise<Client> => {
    const client = new Client({ name: "eotion-mcp-write-test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    });
    await client.connect(transport);
    clients.add(client);
    return client;
  };
  const seedPage = async (
    pages: PageService,
    userId: string,
    workspaceId: string,
    id: string,
    title = id,
  ) => pages.create(userId, workspaceId, { id, parentPageId: null, title, orderKey: "0000" });
  const seedBlock = async (
    blocks: BlockService,
    userId: string,
    workspaceId: string,
    pageId: string,
    id: string,
    text = id,
  ) => blocks.create(userId, workspaceId, pageId, {
    id, pageId, parentBlockId: null, type: "paragraph", orderKey: id,
    props: { node: { type: "paragraph", content: [{ type: "text", text }] } },
  });

  try {
    const started = await startApp();
    app = started.app;
    let baseUrl = started.baseUrl;
    connection = app.get<Connection>(getConnectionToken());
    const hello = await connection.db!.admin().command({ hello: 1 });
    assert.ok(
      typeof hello.setName === "string" || hello.msg === "isdbgrid",
      "P6.3 write integration requires a MongoDB replica set; standalone CRUD cannot prove atomic write behavior",
    );

    const passwordA = "mcp-write-valid-passphrase";
    const registerA = await request(baseUrl, "/api/auth/register", "POST", {
      body: { email: `mcp-write-a-${randomUUID()}@example.test`, password: passwordA },
    });
    assert.equal(registerA.status, 201, registerA.text);
    const userA = onlyUser(registerA.body);
    const loginA = await request(baseUrl, "/api/auth/login", "POST", { body: { email: userA.email, password: passwordA } });
    assert.equal(loginA.status, 201, loginA.text);
    const cookieA = cookieFrom(loginA);

    const passwordB = "mcp-write-another-passphrase";
    const registerB = await request(baseUrl, "/api/auth/register", "POST", {
      body: { email: `mcp-write-b-${randomUUID()}@example.test`, password: passwordB },
    });
    assert.equal(registerB.status, 201, registerB.text);
    const userB = onlyUser(registerB.body);
    const loginB = await request(baseUrl, "/api/auth/login", "POST", { body: { email: userB.email, password: passwordB } });
    assert.equal(loginB.status, 201, loginB.text);
    const cookieB = cookieFrom(loginB);

    const createWorkspace = async (cookie: string, id: string) => {
      const response = await request(baseUrl, "/api/workspaces", "POST", { cookie, body: { id, name: id } });
      assert.equal(response.status, 201, response.text);
    };
    await createWorkspace(cookieA, "mcp-write-a-one");
    await createWorkspace(cookieA, "mcp-write-a-two");
    await createWorkspace(cookieB, "mcp-write-b-one");

    const tokenA = await request(baseUrl, "/api/mcp/tokens", "POST", { cookie: cookieA, body: { name: "write integration A" } });
    const tokenB = await request(baseUrl, "/api/mcp/tokens", "POST", { cookie: cookieB, body: { name: "write integration B" } });
    assert.equal(tokenA.status, 201, tokenA.text);
    assert.equal(tokenB.status, 201, tokenB.text);

    const pages = app.get(PageService);
    const blocks = app.get(BlockService);
    const sync = app.get(SyncService);
    const mutationReceipts = app.get(McpMutationRepository);
    await seedPage(pages, userA.id, "mcp-write-a-two", "write-other-workspace-parent");
    await seedPage(pages, userB.id, "mcp-write-b-one", "write-private-page");

    const clientA = await openClient(baseUrl, tokenA.body.token);
    const clientB = await openClient(baseUrl, tokenB.body.token);
    const tools = (await clientA.listTools()).tools;
    assert.deepEqual(tools.map(({ name }) => name), [
      "eotion_list_workspaces", "eotion_list_pages", "eotion_search_pages", "eotion_get_page",
      "eotion_create_page", "eotion_update_page",
    ]);
    const annotations = new Map(tools.map(({ name, annotations }) => [name, annotations]));
    assert.deepEqual(annotations.get("eotion_create_page"), {
      readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false,
    });
    assert.deepEqual(annotations.get("eotion_update_page"), {
      readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false,
    });

    const createInput = {
      workspaceId: "mcp-write-a-one",
      parentPageId: null,
      title: "MCP write integration page",
      idempotencyKey: `mcp-create-${randomUUID()}`,
      blocks: [
        { type: "paragraph", text: "first" },
        { type: "heading", level: 2, text: "second" },
        { type: "todo", checked: true, text: "third" },
        { type: "code", language: "typescript", text: "const answer = 42" },
        { type: "divider" },
        { type: "bulleted-list", items: ["alpha", "beta"] },
        { type: "numbered-list", start: 3, items: ["three", "four"] },
        { type: "quote", paragraphs: ["quoted one", "quoted two"] },
      ],
    };
    for (const invalid of [
      { ...createInput, userId: userB.id },
      { ...createInput, parentPageId: "missing-parent" },
      { ...createInput, parentPageId: "write-other-workspace-parent" },
      { ...createInput, blocks: [{ type: "paragraph", text: "x", id: "caller-block-id" }] },
      { ...createInput, blocks: [{ type: "paragraph", text: "x", pageId: "caller-page-id" }] },
      { ...createInput, blocks: [{ type: "paragraph", text: "x", orderKey: "caller-order" }] },
      { ...createInput, blocks: [{ type: "paragraph", text: "x", userId: userB.id }] },
      { ...createInput, blocks: [{ type: "image" }] },
      { ...createInput, blocks: Array.from({ length: 1001 }, () => ({ type: "divider" })) },
    ]) {
      expectToolFailure(await clientA.callTool({ name: "eotion_create_page", arguments: invalid }));
    }
    const beforeOversizedInput = (await pages.list(userA.id, "mcp-write-a-one")).length;
    let oversizedInputRejected = false;
    let oversizedInputResult: ToolResult | undefined;
    try {
      oversizedInputResult = await clientA.callTool({
        name: "eotion_create_page",
        arguments: {
          ...createInput,
          idempotencyKey: `oversized-input-${randomUUID()}`,
          blocks: Array.from({ length: 11 }, () => ({ type: "paragraph", text: "x".repeat(100_000) })),
        },
      });
    } catch {
      oversizedInputRejected = true;
    }
    if (oversizedInputResult) {
      expectToolFailure(oversizedInputResult);
      oversizedInputRejected = true;
    }
    assert.equal((await pages.list(userA.id, "mcp-write-a-one")).length, beforeOversizedInput);
    assert.equal(oversizedInputRejected, true, "request or tool layer must reject an over-limit serialized input");
    expectToolFailure(await clientB.callTool({ name: "eotion_create_page", arguments: createInput }));

    const created = expectToolSuccess(await clientA.callTool({ name: "eotion_create_page", arguments: createInput }));
    assert.equal(created.workspaceId, createInput.workspaceId);
    assert.equal(created.title, createInput.title);
    assert.equal(created.parentPageId, null);
    assert.equal(created.blocks.length, createInput.blocks.length);
    assert.equal(new Set(created.blocks.map((block: any) => block.id)).size, created.blocks.length);
    assert.ok(created.blocks.every((block: any) => typeof block.id === "string" && block.id.length > 0));
    const pageId = created.id as string;
    const readCreated = expectToolSuccess(await clientA.callTool({ name: "eotion_get_page", arguments: { pageId } }));
    assert.deepEqual(created, readCreated, "write result must be the stable read DTO in persisted server order");
    assert.deepEqual(created.blocks.map((block: any) => block.type), createInput.blocks.map((block: any) => block.type));
    const retriedCreate = expectToolSuccess(await clientA.callTool({ name: "eotion_create_page", arguments: createInput }));
    assert.deepEqual(retriedCreate, created);
    const conflictingCreate = { ...createInput, title: "different payload with same key" };
    expectToolFailure(await clientA.callTool({ name: "eotion_create_page", arguments: conflictingCreate }), /idempot|key|different|conflict/i);

    const calloutCreateInput = {
      workspaceId: "mcp-write-a-one", title: "MCP callout roundtrip", idempotencyKey: `mcp-callout-create-${randomUUID()}`,
      blocks: [{ type: "callout", text: "first\nsecond" }],
    };
    const calloutCreated = expectToolSuccess(await clientA.callTool({ name: "eotion_create_page", arguments: calloutCreateInput }));
    assert.equal(calloutCreated.blocks.length, 1);
    const calloutBlockId = calloutCreated.blocks[0].id as string;
    assert.deepEqual(calloutCreated.blocks[0], {
      id: calloutBlockId, type: "callout", text: "first\nsecond", icon: "💡", tone: "neutral", parentBlockId: null, depth: 0,
    });
    assert.deepEqual(expectToolSuccess(await clientA.callTool({ name: "eotion_get_page", arguments: { pageId: calloutCreated.id } })), calloutCreated);
    assert.deepEqual(expectToolSuccess(await clientA.callTool({ name: "eotion_create_page", arguments: calloutCreateInput })), calloutCreated);
    const calloutUpdateInput = {
      pageId: calloutCreated.id, expectedUpdatedAt: calloutCreated.updatedAt, idempotencyKey: `mcp-callout-update-${randomUUID()}`,
      blocks: [{ id: calloutBlockId, type: "callout", text: "updated callout", icon: "⚠️", tone: "warning" }],
    };
    const calloutUpdated = expectToolSuccess(await clientA.callTool({ name: "eotion_update_page", arguments: calloutUpdateInput }));
    assert.deepEqual(calloutUpdated.blocks, [{
      id: calloutBlockId, type: "callout", text: "updated callout", icon: "⚠️", tone: "warning", parentBlockId: null, depth: 0,
    }]);
    assert.deepEqual(expectToolSuccess(await clientA.callTool({ name: "eotion_get_page", arguments: { pageId: calloutCreated.id } })), calloutUpdated);
    assert.deepEqual(expectToolSuccess(await clientA.callTool({ name: "eotion_update_page", arguments: calloutUpdateInput })), calloutUpdated);

    const twoPages = await Promise.all([
      clientA.callTool({ name: "eotion_create_page", arguments: { ...createInput, idempotencyKey: `mcp-concurrent-${randomUUID()}` } }),
      clientA.callTool({ name: "eotion_create_page", arguments: { ...createInput, idempotencyKey: `mcp-concurrent-${randomUUID()}` } }),
    ]);
    assert.ok(twoPages.every((result) => result.isError === undefined));
    const sameConcurrentInput = { ...createInput, title: "same concurrent create", idempotencyKey: `mcp-same-concurrent-${randomUUID()}` };
    const sameConcurrentResults = await Promise.all([
      clientA.callTool({ name: "eotion_create_page", arguments: sameConcurrentInput }),
      clientA.callTool({ name: "eotion_create_page", arguments: sameConcurrentInput }),
    ]);
    const sameConcurrentPages = sameConcurrentResults.map(expectToolSuccess);
    assert.deepEqual(sameConcurrentPages[0], sameConcurrentPages[1]);
    assert.equal((await pages.list(userA.id, "mcp-write-a-one")).filter((page) => page.title === sameConcurrentInput.title).length, 1);

    const original = created.blocks as Array<Record<string, any>>;
    const updateInput = {
      pageId,
      expectedUpdatedAt: created.updatedAt,
      title: "Updated via MCP",
      idempotencyKey: `mcp-update-${randomUUID()}`,
      blocks: [
        { id: original[1]!.id, type: "heading", level: 3, text: "keep B first" },
        { type: "paragraph", text: "new D" },
        { id: original[0]!.id, type: "paragraph", text: "keep A last" },
      ],
    };
    expectToolFailure(await clientA.callTool({ name: "eotion_update_page", arguments: { ...updateInput, extra: true } }));
    expectToolFailure(await clientA.callTool({ name: "eotion_update_page", arguments: { pageId, expectedUpdatedAt: created.updatedAt, idempotencyKey: "missing-mutation" } }));
    expectToolFailure(await clientB.callTool({ name: "eotion_update_page", arguments: { ...updateInput, idempotencyKey: `mcp-denied-${randomUUID()}` } }));

    // Let update reconcile existing B, create D and update existing A, then fail on the first omitted-block deletion.
    const originalDelete = blocks.delete.bind(blocks);
    let deleteCalls = 0;
    blocks.delete = async () => {
      deleteCalls += 1;
      throw new Error("injected delete failure after partial reconciliation");
    };
    try {
      expectToolFailure(await clientA.callTool({ name: "eotion_update_page", arguments: updateInput }));
    } finally {
      blocks.delete = originalDelete;
    }
    assert.equal(deleteCalls, 1);
    const afterFailedReconcile = expectToolSuccess(await clientA.callTool({ name: "eotion_get_page", arguments: { pageId } }));
    assert.deepEqual(afterFailedReconcile, created, "failed block reconciliation must roll back changed, new, and omitted blocks plus page version");
    assert.equal(await mutationReceipts.find({
      userId: userA.id, tool: "eotion_update_page", idempotencyKey: updateInput.idempotencyKey,
    }), null, "failed block reconciliation must not commit a receipt");
    const updated = expectToolSuccess(await clientA.callTool({ name: "eotion_update_page", arguments: updateInput }));
    assert.equal(updated.title, "Updated via MCP");
    assert.deepEqual(updated.blocks.map((block: any) => block.type), ["heading", "paragraph", "paragraph"]);
    assert.equal(updated.blocks[0].id, original[1]!.id);
    assert.equal(updated.blocks[2].id, original[0]!.id);
    assert.notEqual(updated.blocks[1].id, original[0]!.id);
    assert.ok(!updated.blocks.some((block: any) => block.id === original[2]!.id), "omitted C block should be deleted");
    assert.deepEqual(expectToolSuccess(await clientA.callTool({ name: "eotion_get_page", arguments: { pageId } })), updated);
    assert.deepEqual(expectToolSuccess(await clientA.callTool({ name: "eotion_update_page", arguments: updateInput })), updated);
    expectToolFailure(await clientA.callTool({ name: "eotion_update_page", arguments: { ...updateInput, title: "different replay" } }), /idempot|key|different|conflict/i);

    const titleOnly = expectToolSuccess(await clientA.callTool({
      name: "eotion_update_page",
      arguments: { pageId, expectedUpdatedAt: updated.updatedAt, title: "Title only", idempotencyKey: `mcp-title-${randomUUID()}` },
    }));
    assert.deepEqual(titleOnly.blocks, updated.blocks, "omitted blocks must preserve the document body");
    const cleared = expectToolSuccess(await clientA.callTool({
      name: "eotion_update_page",
      arguments: { pageId, expectedUpdatedAt: titleOnly.updatedAt, blocks: [], idempotencyKey: `mcp-clear-${randomUUID()}` },
    }));
    assert.deepEqual(cleared.blocks, [], "an explicit empty body must clear every block");

    const foreignPage = await pages.findAccessible(userA.id, "write-other-workspace-parent");
    await seedBlock(blocks, userA.id, foreignPage.workspaceId, foreignPage.id, "foreign-block-id", "must survive cross-page rejection");
    const targetWithForeign = await seedPage(pages, userA.id, "mcp-write-a-one", "target-with-foreign-id");
    await seedBlock(blocks, userA.id, "mcp-write-a-one", targetWithForeign.id, "target-block-before-rejection", "stay put");
    const targetRead = expectToolSuccess(await clientA.callTool({ name: "eotion_get_page", arguments: { pageId: targetWithForeign.id } }));
    const targetBefore = targetRead.blocks;
    expectToolFailure(await clientA.callTool({
      name: "eotion_update_page",
      arguments: {
        pageId: targetWithForeign.id, expectedUpdatedAt: targetRead.updatedAt,
        blocks: [{ id: "foreign-block-id", type: "paragraph", text: "take over" }],
        idempotencyKey: `mcp-foreign-block-${randomUUID()}`,
      },
    }));
    assert.deepEqual(expectToolSuccess(await clientA.callTool({ name: "eotion_get_page", arguments: { pageId: targetWithForeign.id } })).blocks, targetBefore);
    assert.equal((await blocks.list(userA.id, foreignPage.workspaceId, foreignPage.id))[0]!.id, "foreign-block-id");
    expectToolFailure(await clientA.callTool({
      name: "eotion_update_page",
      arguments: {
        pageId: targetWithForeign.id, expectedUpdatedAt: targetRead.updatedAt,
        blocks: [
          { id: "target-block-before-rejection", type: "paragraph", text: "one" },
          { id: "target-block-before-rejection", type: "paragraph", text: "two" },
        ],
        idempotencyKey: `mcp-duplicate-block-${randomUUID()}`,
      },
    }));

    const staleCases: Array<() => Promise<void>> = [];
    const staleAttempt = async (id: string, page: { id: string; updatedAt: string }, label: string) => {
      const latest = expectToolSuccess(await clientA.callTool({ name: "eotion_get_page", arguments: { pageId: page.id } }));
      assert.notEqual(latest.updatedAt, page.updatedAt, `${label} must advance the page version`);
      const result = await clientA.callTool({
        name: "eotion_update_page",
        arguments: { pageId: page.id, expectedUpdatedAt: page.updatedAt, title: `stale ${label}`, blocks: [], idempotencyKey: `stale-${id}` },
      });
      expectToolFailure(result, /changed|stale|read again|version/i);
      assert.deepEqual(expectToolSuccess(await clientA.callTool({ name: "eotion_get_page", arguments: { pageId: page.id } })), latest,
        "stale requests must preserve the external writer's title, version and body");
      const retry = expectToolSuccess(await clientA.callTool({
        name: "eotion_update_page",
        arguments: { pageId: page.id, expectedUpdatedAt: latest.updatedAt, title: latest.title, idempotencyKey: `fresh-${id}` },
      }));
      assert.deepEqual(retry.blocks, latest.blocks, "freshly read version can be retried without changing the body");
      assert.notEqual(retry.updatedAt, latest.updatedAt);
    };
    staleCases.push(async () => {
      const page = await seedPage(pages, userA.id, "mcp-write-a-one", "stale-page-service");
      await pages.update(userA.id, "mcp-write-a-one", page.id, { title: "changed through PageService" });
      await staleAttempt(page.id, page, "PageService.update");
    });
    staleCases.push(async () => {
      const page = await seedPage(pages, userA.id, "mcp-write-a-one", "stale-block-update");
      await seedBlock(blocks, userA.id, "mcp-write-a-one", page.id, "stale-update-block");
      const before = await pages.find(userA.id, "mcp-write-a-one", page.id);
      await blocks.update(userA.id, "mcp-write-a-one", page.id, "stale-update-block", {
        props: { node: { type: "paragraph", content: [{ type: "text", text: "outside update" }] } },
      });
      await staleAttempt(page.id, before!, "BlockService.update");
    });
    staleCases.push(async () => {
      const page = await seedPage(pages, userA.id, "mcp-write-a-one", "stale-block-delete");
      await seedBlock(blocks, userA.id, "mcp-write-a-one", page.id, "stale-delete-block");
      const before = await pages.find(userA.id, "mcp-write-a-one", page.id);
      assert.equal(await blocks.deleteFromPage(userA.id, "mcp-write-a-one", page.id, "stale-delete-block"), true);
      await staleAttempt(page.id, before!, "BlockService.delete");
    });
    staleCases.push(async () => {
      const page = await seedPage(pages, userA.id, "mcp-write-a-one", "stale-block-create");
      const before = await pages.find(userA.id, "mcp-write-a-one", page.id);
      await seedBlock(blocks, userA.id, "mcp-write-a-one", page.id, "stale-create-block");
      await staleAttempt(page.id, before!, "BlockService.create");
    });
    staleCases.push(async () => {
      const page = await seedPage(pages, userA.id, "mcp-write-a-one", "stale-sync-upsert");
      const before = await pages.find(userA.id, "mcp-write-a-one", page.id);
      const operation: SyncOperation = {
        id: `sync-upsert-${randomUUID()}`, clientId: "mcp-write-test", sequence: 1,
        workspaceId: "mcp-write-a-one", createdAt: new Date().toISOString(), kind: "block.upsert",
        payload: {
          id: "stale-sync-upsert-block", pageId: page.id, parentBlockId: null, type: "paragraph", orderKey: "a",
          props: { node: { type: "paragraph", content: [{ type: "text", text: "sync upsert" }] } },
        },
      };
      await sync.apply(userA.id, operation);
      await staleAttempt(page.id, before!, "SyncService.apply block.upsert");
    });
    staleCases.push(async () => {
      const page = await seedPage(pages, userA.id, "mcp-write-a-one", "stale-sync-delete");
      await seedBlock(blocks, userA.id, "mcp-write-a-one", page.id, "stale-sync-delete-block");
      const before = await pages.find(userA.id, "mcp-write-a-one", page.id);
      const operation: SyncOperation = {
        id: `sync-delete-${randomUUID()}`, clientId: "mcp-write-test", sequence: 1,
        workspaceId: "mcp-write-a-one", createdAt: new Date().toISOString(), kind: "block.delete",
        payload: { id: "stale-sync-delete-block" },
      };
      await sync.apply(userA.id, operation);
      await staleAttempt(page.id, before!, "SyncService.apply block.delete");
    });
    for (const run of staleCases) await run();

    const concurrentPage = await seedPage(pages, userA.id, "mcp-write-a-one", "concurrent-update");
    const concurrentAt = concurrentPage.updatedAt;
    const simultaneousUpdates = await Promise.all([
      clientA.callTool({ name: "eotion_update_page", arguments: {
        pageId: concurrentPage.id, expectedUpdatedAt: concurrentAt, title: "winner A", idempotencyKey: `concurrent-a-${randomUUID()}`,
      } }),
      clientA.callTool({ name: "eotion_update_page", arguments: {
        pageId: concurrentPage.id, expectedUpdatedAt: concurrentAt, title: "winner B", idempotencyKey: `concurrent-b-${randomUUID()}`,
      } }),
    ]);
    assert.equal(simultaneousUpdates.filter((result) => result.isError === undefined).length, 1);
    assert.equal(simultaneousUpdates.filter((result) => result.isError === true).length, 1);
    expectToolFailure(simultaneousUpdates.find((result) => result.isError === true)!, /changed|stale|read again|version/i);

    const failedAtomicInput = {
      workspaceId: "mcp-write-a-one", title: "retry after rollback", idempotencyKey: `rollback-${randomUUID()}`,
      blocks: [{ type: "paragraph", text: "first block must roll back" }, { type: "paragraph", text: "second create fails" }],
    };
    const beforeFailedWrite = (await pages.list(userA.id, "mcp-write-a-one")).length;
    const beforeFailedBlocks = (await blocks.listByWorkspace(userA.id, "mcp-write-a-one")).length;
    const originalCreate = blocks.create.bind(blocks);
    let createCalls = 0;
    blocks.create = async (...args) => {
      createCalls += 1;
      if (createCalls === 2) throw new Error("injected second block persistence failure");
      return originalCreate(...args);
    };
    try {
      expectToolFailure(await clientA.callTool({ name: "eotion_create_page", arguments: failedAtomicInput }));
    } finally {
      blocks.create = originalCreate;
    }
    assert.equal(createCalls, 2, "the first block should be persisted in the transaction before the injected failure");
    assert.equal((await pages.list(userA.id, "mcp-write-a-one")).length, beforeFailedWrite, "failed create must roll back its page");
    assert.equal((await blocks.listByWorkspace(userA.id, "mcp-write-a-one")).length, beforeFailedBlocks, "failed create must roll back its blocks");
    assert.equal(await mutationReceipts.find({
      userId: userA.id, tool: "eotion_create_page", idempotencyKey: failedAtomicInput.idempotencyKey,
    }), null, "failed create must not commit an idempotency receipt");
    const afterRetry = expectToolSuccess(await clientA.callTool({ name: "eotion_create_page", arguments: failedAtomicInput }));
    assert.equal(afterRetry.blocks.length, 2, "same idempotency key must remain available after rollback");

    // The page and every block are already written in the transaction when the receipt insert runs.
    const failedReceiptCreateInput = {
      workspaceId: "mcp-write-a-one", title: "rollback when create receipt fails", idempotencyKey: `receipt-create-${randomUUID()}`,
      blocks: [{ type: "paragraph", text: "receipt failure" }],
    };
    const beforeReceiptCreatePages = (await pages.list(userA.id, "mcp-write-a-one")).length;
    const beforeReceiptCreateBlocks = (await blocks.listByWorkspace(userA.id, "mcp-write-a-one")).length;
    const originalReceiptCreate = mutationReceipts.create.bind(mutationReceipts);
    mutationReceipts.create = async () => { throw new Error("injected mutation receipt create failure"); };
    try {
      expectToolFailure(await clientA.callTool({ name: "eotion_create_page", arguments: failedReceiptCreateInput }));
    } finally {
      mutationReceipts.create = originalReceiptCreate;
    }
    assert.equal((await pages.list(userA.id, "mcp-write-a-one")).length, beforeReceiptCreatePages);
    assert.equal((await blocks.listByWorkspace(userA.id, "mcp-write-a-one")).length, beforeReceiptCreateBlocks);
    assert.equal(await mutationReceipts.find({
      userId: userA.id, tool: "eotion_create_page", idempotencyKey: failedReceiptCreateInput.idempotencyKey,
    }), null);
    const receiptCreateRetry = expectToolSuccess(await clientA.callTool({ name: "eotion_create_page", arguments: failedReceiptCreateInput }));
    assert.equal(receiptCreateRetry.blocks.length, 1);

    const receiptUpdatePage = await seedPage(pages, userA.id, "mcp-write-a-one", "receipt-update-target", "before receipt update failure");
    await seedBlock(blocks, userA.id, "mcp-write-a-one", receiptUpdatePage.id, "receipt-update-block", "before update");
    const receiptUpdateRead = expectToolSuccess(await clientA.callTool({ name: "eotion_get_page", arguments: { pageId: receiptUpdatePage.id } }));
    const failedReceiptUpdateInput = {
      pageId: receiptUpdatePage.id, expectedUpdatedAt: receiptUpdateRead.updatedAt,
      title: "receipt update must roll back", blocks: [{ id: "receipt-update-block", type: "paragraph", text: "after update" }],
      idempotencyKey: `receipt-update-${randomUUID()}`,
    };
    mutationReceipts.create = async () => { throw new Error("injected update receipt create failure"); };
    try {
      expectToolFailure(await clientA.callTool({ name: "eotion_update_page", arguments: failedReceiptUpdateInput }));
    } finally {
      mutationReceipts.create = originalReceiptCreate;
    }
    assert.deepEqual(expectToolSuccess(await clientA.callTool({ name: "eotion_get_page", arguments: { pageId: receiptUpdatePage.id } })), receiptUpdateRead);
    assert.equal(await mutationReceipts.find({
      userId: userA.id, tool: "eotion_update_page", idempotencyKey: failedReceiptUpdateInput.idempotencyKey,
    }), null);
    const receiptUpdateRetry = expectToolSuccess(await clientA.callTool({ name: "eotion_update_page", arguments: failedReceiptUpdateInput }));
    assert.equal(receiptUpdateRetry.title, "receipt update must roll back");
    assert.equal(receiptUpdateRetry.blocks[0].text, "after update");

    const largePage = await seedPage(pages, userA.id, "mcp-write-a-one", "oversized-projection", "original title survives rollback");
    const largeText = "z".repeat(100_000);
    for (let index = 0; index < 11; index += 1) {
      await seedBlock(blocks, userA.id, "mcp-write-a-one", largePage.id, `oversized-projection-${index}`, largeText);
    }
    const beforeOversizedProject = await pages.find(userA.id, "mcp-write-a-one", largePage.id);
    expectToolFailure(await clientA.callTool({
      name: "eotion_update_page",
      arguments: {
        pageId: largePage.id, expectedUpdatedAt: beforeOversizedProject!.updatedAt,
        title: "must roll back because projected page is too large", idempotencyKey: `oversized-project-${randomUUID()}`,
      },
    }));
    assert.equal((await pages.find(userA.id, "mcp-write-a-one", largePage.id))!.title, "original title survives rollback");

    // Verify the receipt and returned value survive a fresh Nest/application service instance.
    const persistedCreateInput = { ...createInput, title: "restart idempotency proof", idempotencyKey: `restart-${randomUUID()}` };
    const persistedCreate = expectToolSuccess(await clientA.callTool({ name: "eotion_create_page", arguments: persistedCreateInput }));
    for (const client of clients) await client.close();
    clients.clear();
    await app.close();
    app = undefined;
    const restarted = await startApp();
    app = restarted.app;
    baseUrl = restarted.baseUrl;
    connection = app.get<Connection>(getConnectionToken());
    const restartedClient = await openClient(baseUrl, tokenA.body.token);
    const persistedRetry = expectToolSuccess(await restartedClient.callTool({ name: "eotion_create_page", arguments: persistedCreateInput }));
    assert.deepEqual(persistedRetry, persistedCreate, "a new application service instance must replay the stored Mongo receipt");

    // Keep these model injections exercised so the test confirms real persisted users, not auth stubs.
    const users = app.get<Model<unknown>>(getModelToken(UserEntity.name));
    assert.ok(await users.exists({ id: userA.id }));
    assert.ok(await users.exists({ id: userB.id }));
  } finally {
    for (const client of clients) await client.close().catch(() => undefined);
    try {
      await connection?.dropDatabase();
    } finally {
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
