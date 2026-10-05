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
import { WorkspaceService } from "../server-domain/services/workspace.service";

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
      assert.deepEqual(initialization.tools.map(({ name }) => name), ["eotion_list_workspaces"]);
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
    assert.deepEqual((await revocationClient.listTools()).tools.map(({ name }) => name), ["eotion_list_workspaces"]);
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
