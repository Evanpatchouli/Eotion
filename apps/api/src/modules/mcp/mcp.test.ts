import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { request as nodeHttpRequest } from "node:http";
import { test } from "node:test";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { getConnectionToken, getModelToken } from "@nestjs/mongoose";
import type { Connection, Model } from "mongoose";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { McpCredentialEntity } from "../server-domain/schemas/mcp-credential.schema";
import { UserEntity } from "../server-domain/schemas/user.schema";
import { McpTokenService } from "../server-domain/services/mcp-token.service";
import { PageService } from "../server-domain/services/page.service";
import { BlockService } from "../server-domain/services/block.service";
import { WorkspaceService } from "../server-domain/services/workspace.service";
import { DatabaseService } from "../server-domain/services/database.service";

type JsonResponse = {
  status: number;
  headers: Headers;
  body: Record<string, any>;
  text: string;
};

function testMongoUri(): string {
  const base = process.env.P4_TEST_MONGODB_URI?.trim() || "mongodb://127.0.0.1:27017";
  const uri = new URL(base);
  uri.pathname = `/eotion_mcp_test_${randomUUID().replaceAll("-", "")}`;
  return uri.toString();
}

async function request(
  baseUrl: string,
  route: string,
  method = "GET",
  options: {
    cookie?: string;
    authorization?: string;
    body?: unknown;
    origin?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<JsonResponse> {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.authorization ? { authorization: options.authorization } : {}),
      ...(options.origin ? { origin: options.origin } : {}),
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...options.headers,
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  let body: Record<string, any> = {};
  if (text) {
    try {
      body = JSON.parse(text) as Record<string, any>;
    } catch {
      body = { raw: text };
    }
  }
  return { status: response.status, headers: response.headers, body, text };
}

async function requestWithHost(
  baseUrl: string,
  route: string,
  host: string,
  authorization: string,
  body: unknown,
): Promise<JsonResponse> {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const outgoing = nodeHttpRequest(new URL(route, baseUrl), {
      method: "POST",
      headers: {
        host,
        authorization,
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload),
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      response.on("error", reject);
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let responseBody: Record<string, any> = {};
        if (text) {
          try {
            responseBody = JSON.parse(text) as Record<string, any>;
          } catch {
            responseBody = { raw: text };
          }
        }
        const headers = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : String(value));
        }
        resolve({ status: response.statusCode ?? 0, headers, body: responseBody, text });
      });
    });
    outgoing.on("error", reject);
    outgoing.end(payload);
  });
}

function cookieFrom(response: JsonResponse): string {
  const value = response.headers.get("set-cookie");
  assert.ok(value, "expected Set-Cookie response header");
  return value.split(";", 1)[0]!;
}

function onlyUser(body: Record<string, any>): Record<string, any> {
  return body.user ?? body;
}

function assertGenericError(text: string): void {
  assert.doesNotMatch(text, /stack|userId|tokenHash|database|mongodb|exception/i);
}

test("MCP HTTP tools require bearer credentials and scope workspace access to the credential owner", async () => {
  const previousMongoUri = process.env.MONGODB_URI;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousWebOrigin = process.env.WEB_ORIGIN;
  const previousApiOrigin = process.env.API_ORIGIN;
  process.env.MONGODB_URI = testMongoUri();
  delete process.env.NODE_ENV;
  process.env.WEB_ORIGIN = "https://trusted.example.test";

  let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined;
  let connection: Connection | undefined;
  let restoreWorkspaceSpy: (() => void) | undefined;
  let restorePageSpy: (() => void) | undefined;
  let restoreBlockSpy: (() => void) | undefined;
  let restoreTokenSpy: (() => void) | undefined;
  try {
    const { AppModule } = await import("../../app.module");
    app = await NestFactory.create(AppModule, new FastifyAdapter(), { logger: false });
    app.setGlobalPrefix("api");
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const mcpUrl = `${baseUrl}/mcp`;
    connection = app.get<Connection>(getConnectionToken());
    const userModel = app.get<Model<unknown>>(getModelToken(UserEntity.name));
    const credentialModel = app.get<Model<unknown>>(getModelToken(McpCredentialEntity.name));
    const tokens = app.get(McpTokenService);
    const workspaces = app.get(WorkspaceService);
    const pages = app.get(PageService);
    const blocks = app.get(BlockService);
    const databases = app.get(DatabaseService);

    const emailA = `mcp-a-${randomUUID()}@example.test`;
    const passwordA = "correct horse battery staple";
    const registerA = await request(baseUrl, "/api/auth/register", "POST", {
      body: { email: emailA, password: passwordA },
    });
    assert.equal(registerA.status, 201);
    const userA = onlyUser(registerA.body);
    const loginA = await request(baseUrl, "/api/auth/login", "POST", {
      body: { email: emailA, password: passwordA },
    });
    assert.equal(loginA.status, 201);
    const cookieA = cookieFrom(loginA);

    const emailB = `mcp-b-${randomUUID()}@example.test`;
    const passwordB = "another correct horse battery staple";
    const registerB = await request(baseUrl, "/api/auth/register", "POST", {
      body: { email: emailB, password: passwordB },
    });
    assert.equal(registerB.status, 201);
    const userB = onlyUser(registerB.body);
    const loginB = await request(baseUrl, "/api/auth/login", "POST", {
      body: { email: emailB, password: passwordB },
    });
    assert.equal(loginB.status, 201);
    const cookieB = cookieFrom(loginB);

    for (const [cookie, ownerId, items] of [
      [cookieA, userA.id, [["mcp-a-1", "A workspace one"], ["mcp-a-2", "A workspace two"]]],
      [cookieB, userB.id, [["mcp-b-1", "B workspace one"]]],
    ] as const) {
      for (const [id, name] of items) {
        const created = await request(baseUrl, "/api/workspaces", "POST", {
          cookie,
          body: { id, name },
        });
        assert.equal(created.status, 201);
        assert.equal(created.body.ownerId, ownerId);
      }
    }

    const pageFixtures = [
      { id: "mcp-page-a", workspaceId: "mcp-a-1", title: "MCP Architecture" },
      { id: "mcp-page-b", workspaceId: "mcp-a-1", title: "Meeting Notes" },
      { id: "mcp-page-c", workspaceId: "mcp-a-1", title: "MCP Testing" },
      { id: "mcp-page-z", workspaceId: "mcp-a-1", title: "MCP [draft]" },
      { id: "mcp-page-d", workspaceId: "mcp-a-2", title: "Second Workspace Page" },
      { id: "mcp-page-e", workspaceId: "mcp-b-1", title: "B Private Page" },
    ] as const;
    for (const [index, page] of pageFixtures.entries()) {
      const ownerId = page.workspaceId === "mcp-b-1" ? userB.id : userA.id;
      await pages.create(ownerId, page.workspaceId, {
        id: page.id,
        parentPageId: null,
        title: page.title,
        orderKey: String(index).padStart(4, "0"),
      });
    }
    await databases.createInPage(userA.id, "mcp-a-1", "mcp-page-a", {
      id: "database-1", name: "MCP database fixture", titlePropertyId: "database-title-property", viewId: "view-1",
      blockId: "mcp-block-h", orderKey: "0007", parentBlockId: null,
    });
    const blockFixtures = [
      { id: "mcp-block-a", type: "paragraph", node: { type: "paragraph", content: [{ type: "text", text: "A paragraph" }] } },
      { id: "mcp-block-b", type: "heading", node: { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "A heading" }] } },
      { id: "mcp-block-c", type: "todo", node: { type: "eotionTodo", attrs: { checked: true }, content: [{ type: "text", text: "A task" }] } },
      { id: "mcp-block-d", type: "code", node: { type: "codeBlock", attrs: { language: "typescript" }, content: [{ type: "text", text: "const answer = 42" }] } },
      { id: "mcp-block-e", type: "numbered-list", node: { type: "orderedList", attrs: { start: 3 }, content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Third item" }] }] }] } },
      { id: "mcp-block-f", type: "image", node: { type: "eotionImage", attrs: { fileId: "file-image", name: "diagram.png", mimeType: "image/png", size: 1234, url: "https://private.example.test/image" } } },
      { id: "mcp-block-g", type: "file", node: { type: "eotionFile", attrs: { fileId: "file-doc", name: "notes.pdf", mimeType: "application/pdf", size: 5678, url: "https://private.example.test/file" } } },
      { id: "mcp-block-h", type: "database", node: { type: "eotionDatabase", attrs: { databaseId: "database-1", viewId: "view-1" } } },
    ] as const;
    for (const [index, block] of blockFixtures.entries()) {
      if (block.type === "database") continue;
      await blocks.create(userA.id, "mcp-a-1", "mcp-page-a", {
        id: block.id,
        pageId: "mcp-page-a",
        parentBlockId: null,
        type: block.type,
        orderKey: String(index).padStart(4, "0"),
        props: { node: block.node },
      });
    }

    const noSession = await request(baseUrl, "/api/mcp/tokens", "POST", {
      body: { name: "agent" },
    });
    assert.equal(noSession.status, 401);
    const forgedOwner = await request(baseUrl, "/api/mcp/tokens", "POST", {
      cookie: cookieA,
      body: { name: "agent", userId: userB.id },
    });
    assert.equal(forgedOwner.status, 400);
    const crossOrigin = await request(baseUrl, "/api/mcp/tokens", "POST", {
      cookie: cookieA,
      origin: "https://attacker.example.test",
      body: { name: "blocked" },
    });
    assert.equal(crossOrigin.status, 403);

    const issuedA = await request(baseUrl, "/api/mcp/tokens", "POST", {
      cookie: cookieA,
      body: { name: "A integration" },
    });
    assert.equal(issuedA.status, 201);
    assert.equal(issuedA.headers.get("cache-control"), "no-store");
    assert.equal(issuedA.body.credential.name, "A integration");
    assert.equal(typeof issuedA.body.credential.id, "string");
    assert.match(issuedA.body.token, /^eotion_mcp_[A-Za-z0-9_-]{43}$/);
    assert.doesNotMatch(JSON.stringify(issuedA.body.credential), /token/i);
    const issuedA2 = await request(baseUrl, "/api/mcp/tokens", "POST", {
      cookie: cookieA,
      body: { name: "A second integration" },
    });
    assert.equal(issuedA2.status, 201);
    const issuedB = await request(baseUrl, "/api/mcp/tokens", "POST", {
      cookie: cookieB,
      body: { name: "B integration" },
    });
    assert.equal(issuedB.status, 201);

    const noSessionList = await request(baseUrl, "/api/mcp/tokens", "GET");
    assert.equal(noSessionList.status, 401);
    const managedA = await request(baseUrl, "/api/mcp/tokens", "POST", { cookie: cookieA, body: { name: "Managed in settings" } });
    assert.equal(managedA.status, 201);
    const listedTokensA = await request(baseUrl, "/api/mcp/tokens", "GET", { cookie: cookieA });
    assert.equal(listedTokensA.status, 200);
    assert.ok(Array.isArray(listedTokensA.body));
    assert.ok((listedTokensA.body as any[]).some((item) => item.id === managedA.body.credential.id && item.name === "Managed in settings" && item.lastUsedAt === null));
    assert.doesNotMatch(JSON.stringify(listedTokensA.body), /tokenHash|eotion_mcp_/);
    const listedTokensB = await request(baseUrl, "/api/mcp/tokens", "GET", { cookie: cookieB });
    assert.equal(listedTokensB.status, 200);
    assert.ok(!(listedTokensB.body as any[]).some((item) => item.id === managedA.body.credential.id));
    const crossUserRevoke = await request(baseUrl, `/api/mcp/tokens/${managedA.body.credential.id}`, "DELETE", { cookie: cookieB });
    assert.equal(crossUserRevoke.status, 204);
    assert.ok(await tokens.resolve(managedA.body.token));
    const ownRevoke = await request(baseUrl, `/api/mcp/tokens/${managedA.body.credential.id}`, "DELETE", { cookie: cookieA });
    assert.equal(ownRevoke.status, 204);
    assert.equal(await tokens.resolve(managedA.body.token), null);
    const afterRevokeList = await request(baseUrl, "/api/mcp/tokens", "GET", { cookie: cookieA });
    assert.ok(!(afterRevokeList.body as any[]).some((item) => item.id === managedA.body.credential.id));

    const storedA = await credentialModel
      .findOne({ id: issuedA.body.credential.id })
      .select("+tokenHash")
      .lean() as unknown as { tokenHash: string; userId: string; lastUsedAt: Date | null };
    assert.equal(storedA.userId, userA.id);
    assert.match(storedA.tokenHash, /^[a-f0-9]{64}$/);
    assert.equal(storedA.tokenHash, createHash("sha256").update(issuedA.body.token).digest("hex"));
    assert.notEqual(storedA.tokenHash, issuedA.body.token);
    assert.doesNotMatch(JSON.stringify(storedA), new RegExp(issuedA.body.token));

    const openClient = async (token: string): Promise<Client> => {
      const client = new Client({ name: "eotion-mcp-test", version: "1.0.0" });
      const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      });
      await client.connect(transport);
      return client;
    };

    const deniedRequests: Array<{ authorization?: string; cookie?: string }> = [
      {},
      { authorization: `Basic ${issuedA.body.token}` },
      { authorization: "Bearer malformed" },
      { authorization: "Bearer eotion_mcp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      { cookie: cookieA },
      { authorization: `Bearer ${cookieA.slice(cookieA.indexOf("=") + 1)}` },
    ];
    const unauthorizedBodies: Record<string, any>[] = [];
    for (const auth of deniedRequests) {
      const denied = await request(baseUrl, "/mcp", "POST", {
        ...auth,
        body: {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } },
        },
        headers: { accept: "application/json, text/event-stream" },
      });
      assert.equal(denied.status, 401);
      assert.equal(denied.headers.get("www-authenticate"), 'Bearer realm="eotion-mcp", error="invalid_token"');
      assertGenericError(denied.text);
      unauthorizedBodies.push(denied.body);
    }
    for (const body of unauthorizedBodies.slice(1)) assert.deepEqual(body, unauthorizedBodies[0]);

    const invalidClient = new Client({ name: "eotion-mcp-test", version: "1.0.0" });
    const invalidTransport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
      requestInit: { headers: { Authorization: `Bearer ${issuedA.body.token}invalid` } },
    });
    await assert.rejects(invalidClient.connect(invalidTransport));
    await invalidClient.close();

    const hostileHost = await requestWithHost(
      baseUrl,
      "/mcp",
      "attacker.example.test",
      `Bearer ${issuedA.body.token}`,
      {
        jsonrpc: "2.0", id: 1, method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } },
      },
    );
    assert.equal(hostileHost.status, 403);
    assert.ok(Object.keys(hostileHost.body).length > 0);
    assert.doesNotMatch(hostileHost.text, new RegExp(issuedA.body.token));
    const hostileOrigin = await request(baseUrl, "/mcp", "POST", {
      authorization: `Bearer ${issuedA.body.token}`,
      origin: "https://attacker.example.test",
      body: {
        jsonrpc: "2.0", id: 1, method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } },
      },
      headers: { accept: "application/json, text/event-stream" },
    });
    assert.equal(hostileOrigin.status, 403);

    const clientA = await openClient(issuedA.body.token);
    try {
      const initialization = await clientA.listTools();
      assert.deepEqual(initialization.tools.map(({ name }) => name), [
        "eotion_list_workspaces",
        "eotion_list_pages",
        "eotion_search_pages",
        "eotion_get_page",
        "eotion_create_page",
        "eotion_update_page",
      ]);
      const toolAnnotations = new Map(initialization.tools.map(({ name, annotations }) => [name, annotations]));
      assert.equal(toolAnnotations.get("eotion_create_page")?.readOnlyHint, false);
      assert.equal(toolAnnotations.get("eotion_create_page")?.destructiveHint, false);
      assert.equal(toolAnnotations.get("eotion_create_page")?.idempotentHint, true);
      assert.equal(toolAnnotations.get("eotion_update_page")?.readOnlyHint, false);
      assert.equal(toolAnnotations.get("eotion_update_page")?.destructiveHint, true);
      assert.equal(toolAnnotations.get("eotion_update_page")?.idempotentHint, true);
      const listedA = await clientA.callTool({ name: "eotion_list_workspaces", arguments: {} });
      assert.equal(listedA.isError, undefined);
      assert.deepEqual(listedA.structuredContent, {
        workspaces: [
          { id: "mcp-a-1", name: "A workspace one" },
          { id: "mcp-a-2", name: "A workspace two" },
        ],
      });
      const listedTexts = listedA.content.flatMap((item) => item.type === "text" ? [item.text] : []);
      assert.match(listedTexts.join("\n"), /A workspace one/);
      const listedText = listedA.content.find((item) => item.type === "text");
      assert.ok(listedText?.type === "text");
      assert.deepEqual(JSON.parse(listedText.text), listedA.structuredContent);
      assert.doesNotMatch(listedTexts.join("\n"), /B workspace/);

      const listFirstWindow = await clientA.callTool({
        name: "eotion_list_pages",
        arguments: { workspaceId: "mcp-a-1", limit: 2 },
      });
      assert.equal(listFirstWindow.isError, undefined);
      const firstPageWindow = listFirstWindow.structuredContent as any;
      assert.deepEqual(firstPageWindow.items.map(({ id }: { id: string }) => id), ["mcp-page-a", "mcp-page-b"]);
      assert.equal(firstPageWindow.nextCursor, "mcp-page-b");
      for (const page of firstPageWindow.items) {
        assert.deepEqual(Object.keys(page).sort(), ["id", "parentPageId", "title", "updatedAt", "workspaceId"]);
        assert.match(page.updatedAt, /^\d{4}-\d\d-\d\dT/);
      }
      const secondPageWindow = await clientA.callTool({
        name: "eotion_list_pages",
        arguments: { workspaceId: "mcp-a-1", cursor: firstPageWindow.nextCursor, limit: 2 },
      });
      const secondPageItems = (secondPageWindow.structuredContent as any).items;
      assert.deepEqual(secondPageItems.map(({ id }: { id: string }) => id), ["mcp-page-c", "mcp-page-z"]);
      assert.equal((secondPageWindow.structuredContent as any).nextCursor, null);
      assert.deepEqual(
        [...firstPageWindow.items, ...secondPageItems].map(({ id }: { id: string }) => id),
        ["mcp-page-a", "mcp-page-b", "mcp-page-c", "mcp-page-z"],
      );
      const defaultWindow = await clientA.callTool({
        name: "eotion_list_pages",
        arguments: { workspaceId: "mcp-a-1" },
      });
      assert.deepEqual((defaultWindow.structuredContent as any).items.map(({ id }: { id: string }) => id), [
        "mcp-page-a", "mcp-page-b", "mcp-page-c", "mcp-page-z",
      ]);
      assert.equal((defaultWindow.structuredContent as any).nextCursor, null);
      const otherWorkspaceWindow = await clientA.callTool({
        name: "eotion_list_pages",
        arguments: { workspaceId: "mcp-a-2" },
      });
      assert.deepEqual((otherWorkspaceWindow.structuredContent as any).items.map(({ id }: { id: string }) => id), ["mcp-page-d"]);
      const searchFirstWindow = await clientA.callTool({
        name: "eotion_search_pages",
        arguments: { workspaceId: "mcp-a-1", query: " mCp ", limit: 1 },
      });
      assert.deepEqual((searchFirstWindow.structuredContent as any).items.map(({ id }: { id: string }) => id), ["mcp-page-a"]);
      assert.equal((searchFirstWindow.structuredContent as any).nextCursor, "mcp-page-a");
      const searchNextWindow = await clientA.callTool({
        name: "eotion_search_pages",
        arguments: { workspaceId: "mcp-a-1", query: "MCP", cursor: "mcp-page-a", limit: 1 },
      });
      assert.deepEqual((searchNextWindow.structuredContent as any).items.map(({ id }: { id: string }) => id), ["mcp-page-c"]);
      assert.equal((searchNextWindow.structuredContent as any).nextCursor, "mcp-page-c");
      const searchLastWindow = await clientA.callTool({
        name: "eotion_search_pages",
        arguments: { workspaceId: "mcp-a-1", query: "MCP", cursor: "mcp-page-c", limit: 1 },
      });
      assert.deepEqual((searchLastWindow.structuredContent as any).items.map(({ id }: { id: string }) => id), ["mcp-page-z"]);
      assert.equal((searchLastWindow.structuredContent as any).nextCursor, null);
      const searchOtherWorkspace = await clientA.callTool({
        name: "eotion_search_pages",
        arguments: { workspaceId: "mcp-a-1", query: "meeting" },
      });
      assert.deepEqual((searchOtherWorkspace.structuredContent as any).items.map(({ id }: { id: string }) => id), ["mcp-page-b"]);
      assert.equal((searchOtherWorkspace.structuredContent as any).nextCursor, null);
      const literalSearch = await clientA.callTool({
        name: "eotion_search_pages",
        arguments: { workspaceId: "mcp-a-1", query: "[draft]" },
      });
      assert.deepEqual((literalSearch.structuredContent as any).items.map(({ id }: { id: string }) => id), ["mcp-page-z"]);
      assert.equal((literalSearch.structuredContent as any).nextCursor, null);

      const pageResult = await clientA.callTool({ name: "eotion_get_page", arguments: { pageId: "mcp-page-a" } });
      assert.equal(pageResult.isError, undefined);
      const pagePayload = pageResult.structuredContent as any;
      assert.deepEqual(Object.keys(pagePayload).sort(), ["blocks", "id", "parentPageId", "title", "updatedAt", "workspaceId"]);
      assert.deepEqual({ ...pagePayload, updatedAt: undefined, blocks: undefined }, {
        id: "mcp-page-a",
        workspaceId: "mcp-a-1",
        title: "MCP Architecture",
        parentPageId: null,
        updatedAt: undefined,
        blocks: undefined,
      });
      assert.match(pagePayload.updatedAt, /^\d{4}-\d\d-\d\dT/);
      assert.deepEqual(pagePayload.blocks.map(({ id }: { id: string }) => id), blockFixtures.map(({ id }) => id));
      assert.deepEqual(pagePayload.blocks.slice(0, 5), [
        { id: "mcp-block-a", type: "paragraph", text: "A paragraph", parentBlockId: null, depth: 0 },
        { id: "mcp-block-b", type: "heading", text: "A heading", level: 2, parentBlockId: null, depth: 0 },
        { id: "mcp-block-c", type: "todo", text: "A task", checked: true, parentBlockId: null, depth: 0 },
        { id: "mcp-block-d", type: "code", text: "const answer = 42", language: "typescript", parentBlockId: null, depth: 0 },
        { id: "mcp-block-e", type: "numbered-list", text: "3. Third item", start: 3, items: ["Third item"], parentBlockId: null, depth: 0 },
      ]);
      assert.deepEqual(pagePayload.blocks.slice(5), [
        { id: "mcp-block-f", type: "image", text: "", fileId: "file-image", name: "diagram.png", mimeType: "image/png", size: 1234, parentBlockId: null, depth: 0 },
        { id: "mcp-block-g", type: "file", text: "", fileId: "file-doc", name: "notes.pdf", mimeType: "application/pdf", size: 5678, parentBlockId: null, depth: 0 },
        { id: "mcp-block-h", type: "database", text: "", databaseId: "database-1", viewId: "view-1", parentBlockId: null, depth: 0 },
      ]);
      const pageText = pageResult.content.find((item) => item.type === "text");
      assert.ok(pageText?.type === "text");
      assert.deepEqual(JSON.parse(pageText.text), pageResult.structuredContent);
      // parentBlockId is an intentional public field of P7.1; the internal blockId attribute must still never leak.
      assert.doesNotMatch(JSON.stringify(pageResult.structuredContent), /privateExtension|private\.example|orderKey|props|node|url|token|authorization|oplog|editor|session|\bblockId\b/i);

      const missingPage = await clientA.callTool({ name: "eotion_get_page", arguments: { pageId: "mcp-page-missing" } });
      const otherUsersPage = await clientA.callTool({ name: "eotion_get_page", arguments: { pageId: "mcp-page-e" } });
      assert.equal(missingPage.isError, true);
      assert.equal(otherUsersPage.isError, true);
      assert.equal(missingPage.structuredContent, undefined);
      assert.equal(otherUsersPage.structuredContent, undefined);
      assert.deepEqual(otherUsersPage.content, missingPage.content);
      assert.doesNotMatch(JSON.stringify(missingPage.content), /userId|workspace|private/i);

      const invalidPageCalls = [
        { name: "eotion_list_pages", arguments: {} },
        { name: "eotion_list_pages", arguments: { workspaceId: 17 } },
        { name: "eotion_list_pages", arguments: { workspaceId: "" } },
        { name: "eotion_search_pages", arguments: { workspaceId: "mcp-a-1", query: "   " } },
        { name: "eotion_search_pages", arguments: { workspaceId: "mcp-a-1", query: 17 } },
        { name: "eotion_search_pages", arguments: { workspaceId: "mcp-a-1" } },
        { name: "eotion_search_pages", arguments: { workspaceId: "mcp-a-1", query: "x".repeat(201) } },
        { name: "eotion_list_pages", arguments: { workspaceId: "mcp-a-1", limit: 0 } },
        { name: "eotion_list_pages", arguments: { workspaceId: "mcp-a-1", limit: -1 } },
        { name: "eotion_list_pages", arguments: { workspaceId: "mcp-a-1", limit: 1.5 } },
        { name: "eotion_list_pages", arguments: { workspaceId: "mcp-a-1", limit: 101 } },
        { name: "eotion_search_pages", arguments: { workspaceId: "mcp-a-1", query: "MCP", limit: 0 } },
        { name: "eotion_search_pages", arguments: { workspaceId: "mcp-a-1", query: "MCP", limit: -1 } },
        { name: "eotion_search_pages", arguments: { workspaceId: "mcp-a-1", query: "MCP", limit: 1.5 } },
        { name: "eotion_search_pages", arguments: { workspaceId: "mcp-a-1", query: "MCP", limit: 101 } },
        { name: "eotion_list_pages", arguments: { workspaceId: "mcp-a-1", cursor: "" } },
        { name: "eotion_list_pages", arguments: { workspaceId: "mcp-a-1", cursor: "x".repeat(129) } },
        { name: "eotion_get_page", arguments: {} },
        { name: "eotion_get_page", arguments: { pageId: 3 } },
        { name: "eotion_list_pages", arguments: { workspaceId: "mcp-a-1", userId: userB.id } },
        { name: "eotion_search_pages", arguments: { workspaceId: "mcp-a-1", query: "MCP", userId: userB.id } },
        { name: "eotion_get_page", arguments: { pageId: "mcp-page-a", userId: userB.id } },
      ];
      for (const invalid of invalidPageCalls) {
        const result = await clientA.callTool(invalid as any);
        assert.equal(result.isError, true, `${invalid.name} must reject invalid arguments`);
        assert.equal(result.structuredContent, undefined);
      }
      const unauthorizedWorkspace = await clientA.callTool({
        name: "eotion_list_pages",
        arguments: { workspaceId: "mcp-b-1" },
      });
      assert.equal(unauthorizedWorkspace.isError, true);
      assert.equal(unauthorizedWorkspace.structuredContent, undefined);
      assert.doesNotMatch(JSON.stringify(unauthorizedWorkspace.content), /mcp-b-1|userId|ownerId/i);

      const originalListWindow = pages.listWindow.bind(pages);
      pages.listWindow = async () => { throw new Error("private page repository failure"); };
      restorePageSpy = () => { pages.listWindow = originalListWindow; };
      try {
        const failedPageList = await clientA.callTool({
          name: "eotion_list_pages",
          arguments: { workspaceId: "mcp-a-1" },
        });
        assert.equal(failedPageList.isError, true);
        assertGenericError(failedPageList.content.flatMap((item) => item.type === "text" ? [item.text] : []).join("\n"));
      } finally {
        restorePageSpy();
        restorePageSpy = undefined;
      }
      const originalBoundedBlocks = blocks.listBounded.bind(blocks);
      blocks.listBounded = async () => { throw new Error("private block repository failure"); };
      restoreBlockSpy = () => { blocks.listBounded = originalBoundedBlocks; };
      try {
        const failedPageRead = await clientA.callTool({ name: "eotion_get_page", arguments: { pageId: "mcp-page-a" } });
        assert.equal(failedPageRead.isError, true);
        assertGenericError(failedPageRead.content.flatMap((item) => item.type === "text" ? [item.text] : []).join("\n"));
      } finally {
        restoreBlockSpy();
        restoreBlockSpy = undefined;
      }

      blocks.listBounded = async () => [{
        id: "orphan-block", workspaceId: "mcp-a-1", pageId: "mcp-page-a", parentBlockId: "missing-parent",
        type: "paragraph", orderKey: "0000", createdAt: "now", updatedAt: "now",
        props: { node: { type: "paragraph", content: [{ type: "text", text: "orphan content" }] } },
      }];
      restoreBlockSpy = () => { blocks.listBounded = originalBoundedBlocks; };
      try {
        const orphanPageRead = await clientA.callTool({ name: "eotion_get_page", arguments: { pageId: "mcp-page-a" } });
        assert.equal(orphanPageRead.isError, true);
        assert.equal(orphanPageRead.structuredContent, undefined);
        assertGenericError(orphanPageRead.content.flatMap((item) => item.type === "text" ? [item.text] : []).join("\n"));
        assert.doesNotMatch(JSON.stringify(orphanPageRead.content), /orphan content|missing-parent/);
      } finally {
        restoreBlockSpy();
        restoreBlockSpy = undefined;
      }

      const clientB = await openClient(issuedB.body.token);
      try {
        const bPages = await clientB.callTool({ name: "eotion_list_pages", arguments: { workspaceId: "mcp-b-1" } });
        assert.deepEqual((bPages.structuredContent as any).items.map(({ id }: { id: string }) => id), ["mcp-page-e"]);
        const aWorkspaceDenied = await clientB.callTool({ name: "eotion_list_pages", arguments: { workspaceId: "mcp-a-1" } });
        assert.equal(aWorkspaceDenied.isError, true);
        const aWorkspaceSearchDenied = await clientB.callTool({
          name: "eotion_search_pages", arguments: { workspaceId: "mcp-a-1", query: "MCP" },
        });
        assert.equal(aWorkspaceSearchDenied.isError, true);
        const aPageDenied = await clientB.callTool({ name: "eotion_get_page", arguments: { pageId: "mcp-page-a" } });
        const bPageMissing = await clientB.callTool({ name: "eotion_get_page", arguments: { pageId: "absent-for-b" } });
        assert.equal(aPageDenied.isError, true);
        assert.deepEqual(aPageDenied.content, bPageMissing.content);
      } finally {
        await clientB.close();
      }
      // The SDK reports schema failures as MCP tool error results, not rejected promises.
      const listBeforeValidation = workspaces.listByOwner.bind(workspaces);
      let invalidInputReachedService = false;
      workspaces.listByOwner = async (userId) => {
        invalidInputReachedService = true;
        return listBeforeValidation(userId);
      };
      restoreWorkspaceSpy = () => { workspaces.listByOwner = listBeforeValidation; };
      const invalidInput = await clientA.callTool({
        name: "eotion_list_workspaces",
        arguments: { userId: userB.id },
      });
      assert.equal(invalidInput.isError, true);
      assert.equal(invalidInput.structuredContent, undefined);
      assert.equal(invalidInputReachedService, false);
      restoreWorkspaceSpy();
      restoreWorkspaceSpy = undefined;

      const requests = await Promise.all([
        clientA.callTool({ name: "eotion_list_workspaces", arguments: {} }),
        (async () => {
          const clientB = await openClient(issuedB.body.token);
          try {
            return await clientB.callTool({ name: "eotion_list_workspaces", arguments: {} });
          } finally {
            await clientB.close();
          }
        })(),
      ]);
      assert.deepEqual(requests[0].structuredContent, listedA.structuredContent);
      assert.deepEqual(requests[1].structuredContent, {
        workspaces: [{ id: "mcp-b-1", name: "B workspace one" }],
      });

      const originalListByOwner = workspaces.listByOwner.bind(workspaces);
      workspaces.listByOwner = async () => { throw new Error("mongodb private failure"); };
      restoreWorkspaceSpy = () => { workspaces.listByOwner = originalListByOwner; };
      const failedTool = await clientA.callTool({ name: "eotion_list_workspaces", arguments: {} });
      assert.equal(failedTool.isError, true);
      assertGenericError(failedTool.content.flatMap((item) => item.type === "text" ? [item.text] : []).join("\n"));
      restoreWorkspaceSpy();
      restoreWorkspaceSpy = undefined;
    } finally {
      await clientA.close();
    }

    const emptyUser = await request(baseUrl, "/api/auth/register", "POST", {
      body: { email: `mcp-empty-${randomUUID()}@example.test`, password: passwordA },
    });
    const emptyLogin = await request(baseUrl, "/api/auth/login", "POST", {
      body: { email: onlyUser(emptyUser.body).email, password: passwordA },
    });
    const emptyToken = await request(baseUrl, "/api/mcp/tokens", "POST", {
      cookie: cookieFrom(emptyLogin), body: { name: "empty" },
    });
    const emptyClient = await openClient(emptyToken.body.token);
    try {
      const emptyResult = await emptyClient.callTool({ name: "eotion_list_workspaces", arguments: {} });
      assert.deepEqual(emptyResult.structuredContent, { workspaces: [] });
    } finally {
      await emptyClient.close();
    }

    const legacyResponse = await request(baseUrl, "/mcp", "POST", {
      authorization: `Bearer ${issuedA2.body.token}`,
      body: {
        jsonrpc: "2.0", id: 1, method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "legacy-test", version: "1" } },
      },
      headers: { accept: "application/json, text/event-stream", "mcp-protocol-version": "2024-11-05" },
    });
    assert.equal(legacyResponse.status, 200);
    assert.match(legacyResponse.headers.get("cache-control") ?? "", /\bno-store\b/);
    // The SDK's legacy Streamable HTTP leg uses a standard SSE message response.
    assert.match(legacyResponse.headers.get("content-type") ?? "", /text\/event-stream/);
    const legacyMessages = legacyResponse.text.split("\n").filter((line) => line.startsWith("data:"));
    assert.equal(legacyMessages.length, 1);
    const legacyInitialize = JSON.parse(legacyMessages[0]!.slice(5).trim()) as { result?: { protocolVersion?: string; capabilities?: Record<string, unknown> } };
    assert.equal(legacyInitialize.result?.protocolVersion, "2024-11-05");
    assert.ok(legacyInitialize.result?.capabilities?.tools);
    assert.equal("resources" in (legacyInitialize.result?.capabilities ?? {}), false);
    assert.equal("prompts" in (legacyInitialize.result?.capabilities ?? {}), false);

    const beforeUsedAt = (await credentialModel.findOne({ id: issuedA.body.credential.id }).lean()) as unknown as { lastUsedAt: Date | null };
    assert.ok(beforeUsedAt.lastUsedAt instanceof Date);
    assert.ok(beforeUsedAt.lastUsedAt.getTime() >= Date.parse(issuedA.body.credential.createdAt));

    const revokedCredential = await tokens.create(userA.id, "revoke one");
    const stillValidCredential = await tokens.create(userA.id, "keep one");
    await tokens.revoke(userB.id, revokedCredential.credential.id);
    assert.ok(await tokens.resolve(revokedCredential.token), "another user cannot revoke A's credential");
    const revocationClient = await openClient(revokedCredential.token);
    assert.deepEqual((await revocationClient.listTools()).tools.map(({ name }) => name), [
      "eotion_list_workspaces", "eotion_list_pages", "eotion_search_pages", "eotion_get_page", "eotion_create_page", "eotion_update_page",
    ]);
    await tokens.revoke(userA.id, revokedCredential.credential.id);
    assert.equal(await tokens.resolve(revokedCredential.token), null);
    assert.ok(await tokens.resolve(stillValidCredential.token));
    await assert.rejects(revocationClient.callTool({ name: "eotion_list_workspaces", arguments: {} }));
    await revocationClient.close();
    const revoked = await request(baseUrl, "/mcp", "POST", {
      authorization: `Bearer ${revokedCredential.token}`,
      body: {
        jsonrpc: "2.0", id: 1, method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } },
      },
      headers: { accept: "application/json, text/event-stream" },
    });
    assert.equal(revoked.status, 401);
    assert.equal(revoked.headers.get("www-authenticate"), 'Bearer realm="eotion-mcp", error="invalid_token"');
    assert.deepEqual(revoked.body, unauthorizedBodies[0]);

    const tokenBeforeDelete = await tokens.create(userB.id, "delete owner");
    await userModel.deleteOne({ id: userB.id });
    assert.equal(await tokens.resolve(tokenBeforeDelete.token), null);
    const deletedUserRequest = await request(baseUrl, "/mcp", "POST", {
      authorization: `Bearer ${tokenBeforeDelete.token}`,
      body: {
        jsonrpc: "2.0", id: 1, method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } },
      },
      headers: { accept: "application/json, text/event-stream" },
    });
    assert.equal(deletedUserRequest.status, 401);
    assert.equal(deletedUserRequest.headers.get("www-authenticate"), 'Bearer realm="eotion-mcp", error="invalid_token"');
    assert.deepEqual(deletedUserRequest.body, unauthorizedBodies[0]);

    const originalResolve = tokens.resolve.bind(tokens);
    tokens.resolve = async () => { throw new Error("token repository private failure"); };
    restoreTokenSpy = () => { tokens.resolve = originalResolve; };
    const resolveFailure = await request(baseUrl, "/mcp", "POST", {
      authorization: `Bearer ${issuedA.body.token}`,
      body: {
        jsonrpc: "2.0", id: 1, method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } },
      },
      headers: { accept: "application/json, text/event-stream" },
    });
    assert.equal(resolveFailure.status, 500);
    assertGenericError(resolveFailure.text);
    restoreTokenSpy();
    restoreTokenSpy = undefined;
    assert.equal((await request(baseUrl, "/mcp", "POST", {
      authorization: `Bearer ${issuedA.body.token}`,
      body: {
        jsonrpc: "2.0", id: 1, method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } },
      },
      headers: { accept: "application/json, text/event-stream" },
    })).status, 200);
  } finally {
    restoreWorkspaceSpy?.();
    restorePageSpy?.();
    restoreBlockSpy?.();
    restoreTokenSpy?.();
    try {
      if (connection) {
        const credentials = app?.get<Model<unknown>>(getModelToken(McpCredentialEntity.name));
        let tokenHashHidden = false;
        try {
          const storedWithoutHash = await credentials?.findOne().lean();
          tokenHashHidden = !storedWithoutHash || !("tokenHash" in storedWithoutHash);
        } finally {
          await connection.dropDatabase();
        }
        assert.equal(tokenHashHidden, true);
      }
    } finally {
      try {
        await app?.close();
      } finally {
        if (previousMongoUri === undefined) delete process.env.MONGODB_URI;
        else process.env.MONGODB_URI = previousMongoUri;
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
        if (previousWebOrigin === undefined) delete process.env.WEB_ORIGIN;
        else process.env.WEB_ORIGIN = previousWebOrigin;
        if (previousApiOrigin === undefined) delete process.env.API_ORIGIN;
        else process.env.API_ORIGIN = previousApiOrigin;
      }
    }
  }
});
