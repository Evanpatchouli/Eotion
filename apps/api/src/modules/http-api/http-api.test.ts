import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { getConnectionToken, getModelToken } from "@nestjs/mongoose";
import type { Connection, Model } from "mongoose";

import { BlockEntity } from "../server-domain/schemas/block.schema";
import { SessionEntity } from "../server-domain/schemas/session.schema";
import { UserEntity } from "../server-domain/schemas/user.schema";
import { SessionRepository } from "../server-domain/repositories/session.repository";

function testMongoUri(): string {
  const base =
    process.env.P4_TEST_MONGODB_URI?.trim() || "mongodb://127.0.0.1:27017";
  const uri = new URL(base);
  uri.pathname = `/eotion_http_api_test_${randomUUID().replaceAll("-", "")}`;
  return uri.toString();
}

type JsonResponse = {
  status: number;
  headers: Headers;
  body: Record<string, any>;
};

async function request(
  baseUrl: string,
  route: string,
  method = "GET",
  options: { cookie?: string; body?: unknown; origin?: string } = {},
): Promise<JsonResponse> {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.origin ? { origin: options.origin } : {}),
      ...(options.body === undefined
        ? {}
        : { "content-type": "application/json" }),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
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
  return { status: response.status, headers: response.headers, body };
}

function cookieFrom(response: JsonResponse): string {
  const value = response.headers.get("set-cookie");
  assert.ok(value, "expected Set-Cookie response header");
  return value.split(";", 1)[0]!;
}

function onlyUser(body: Record<string, any>): Record<string, any> {
  return body.user ?? body;
}

function assertNoSecretFields(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertNoSecretFields(item);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      assert.ok(!/passwordhash|token/i.test(key), `response exposed ${key}`);
      assertNoSecretFields(child);
    }
  }
}

test("typed HTTP API authenticates with opaque cookies and scopes workspace, page, and block access", async (t) => {
  const previousMongoUri = process.env.MONGODB_URI;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousWebOrigin = process.env.WEB_ORIGIN;
  const previousApiOrigin = process.env.API_ORIGIN;
  process.env.MONGODB_URI = testMongoUri();
  delete process.env.NODE_ENV;
  process.env.WEB_ORIGIN = "https://trusted.example.test";

  let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined;
  try {
    const { AppModule } = await import("../../app.module");
    app = await NestFactory.create(AppModule, new FastifyAdapter(), {
      logger: false,
    });
    app.setGlobalPrefix("api");
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const connection = app.get<Connection>(getConnectionToken());
    const userModel = app.get<Model<unknown>>(getModelToken(UserEntity.name));
    const sessionModel = app.get<Model<unknown>>(
      getModelToken(SessionEntity.name),
    );
    const blockModel = app.get<Model<unknown>>(getModelToken(BlockEntity.name));

    t.after(async () => {
      try {
        assert.equal(
          await userModel
            .findOne()
            .lean()
            .then((record) => "passwordHash" in (record ?? {})),
          false,
        );
        assert.equal(
          await sessionModel
            .findOne()
            .lean()
            .then((record) => "tokenHash" in (record ?? {})),
          false,
        );
      } finally {
        try {
          await connection.dropDatabase();
        } finally {
          await app?.close();
        }
        if (previousMongoUri === undefined) delete process.env.MONGODB_URI;
        else process.env.MONGODB_URI = previousMongoUri;
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
        if (previousWebOrigin === undefined) delete process.env.WEB_ORIGIN;
        else process.env.WEB_ORIGIN = previousWebOrigin;
        if (previousApiOrigin === undefined) delete process.env.API_ORIGIN;
        else process.env.API_ORIGIN = previousApiOrigin;
      }
    });

    const protectedRoutes = [
      "/api/auth/me",
      "/api/workspaces",
      "/api/workspaces/ws-owner",
      "/api/workspaces/ws-owner/pages",
      "/api/workspaces/ws-owner/pages/page-owner",
      "/api/workspaces/ws-owner/pages/page-owner/blocks",
      "/api/workspaces/ws-owner/pages/page-owner/blocks/block-owner",
    ];
    for (const route of protectedRoutes) {
      assert.equal(
        (await request(baseUrl, route)).status,
        401,
        `${route} must reject a missing cookie`,
      );
    }

    const credentialsA = {
      email: " Owner@Example.test ",
      password: "correct horse battery staple",
    };
    const registerA = await request(baseUrl, "/api/auth/register", "POST", {
      body: credentialsA,
    });
    assert.equal(registerA.status, 201);
    assertNoSecretFields(registerA.body);
    const registerAUser = onlyUser(registerA.body);
    assert.equal(registerAUser.email, "owner@example.test");

    const badAuthDto = await request(baseUrl, "/api/auth/register", "POST", {
      body: { ...credentialsA, userId: "attacker" },
    });
    assert.equal(badAuthDto.status, 400);
    const badEmail = await request(baseUrl, "/api/auth/login", "POST", {
      body: { email: "bad", password: "x" },
    });
    assert.equal(badEmail.status, 400);
    const invalidCredentials = await request(
      baseUrl,
      "/api/auth/login",
      "POST",
      {
        body: { email: credentialsA.email, password: "incorrect password" },
      },
    );
    assert.equal(invalidCredentials.status, 401);

    const loginA = await request(baseUrl, "/api/auth/login", "POST", {
      body: credentialsA,
    });
    assert.equal(loginA.status, 201);
    assertNoSecretFields(loginA.body);
    const cookieAHeader = loginA.headers.get("set-cookie");
    assert.ok(cookieAHeader);
    assert.match(cookieAHeader, /(?:^|;\s*)HttpOnly(?:;|$)/i);
    assert.match(cookieAHeader, /(?:^|;\s*)SameSite=Lax(?:;|$)/i);
    assert.match(cookieAHeader, /(?:^|;\s*)Path=\/api(?:;|$)/i);
    assert.match(
      cookieAHeader,
      /(?:^|;\s*)(?:Max-Age=\d+|Expires=[^;]+)(?:;|$)/i,
    );
    assert.doesNotMatch(cookieAHeader, /(?:^|;\s*)Secure(?:;|$)/i);
    const cookieA = cookieFrom(loginA);
    const rawTokenA = cookieA.slice(cookieA.indexOf("=") + 1);
    const storedSessionA = (await sessionModel
      .findOne({ userId: registerAUser.id })
      .select("+tokenHash")
      .lean()) as unknown as { tokenHash: string };
    assert.match(storedSessionA.tokenHash, /^[a-f0-9]{64}$/);
    assert.equal(
      storedSessionA.tokenHash,
      createHash("sha256").update(rawTokenA).digest("hex"),
    );
    assert.notEqual(storedSessionA.tokenHash, rawTokenA);

    const meA = await request(baseUrl, "/api/auth/me", "GET", {
      cookie: cookieA,
    });
    assert.equal(meA.status, 200);
    assert.equal(onlyUser(meA.body).id, registerAUser.id);
    assertNoSecretFields(meA.body);

    const blockedOrigin = await request(baseUrl, "/api/workspaces", "POST", {
      cookie: cookieA,
      origin: "https://attacker.example.test",
      body: { id: "ws-origin-blocked", name: "Blocked origin" },
    });
    assert.equal(blockedOrigin.status, 403);
    assert.equal(
      await connection
        .db!.collection("workspaces")
        .countDocuments({ id: "ws-origin-blocked" }),
      0,
    );
    const allowedOrigin = await request(baseUrl, "/api/workspaces", "POST", {
      cookie: cookieA,
      origin: "https://trusted.example.test",
      body: { id: "ws-origin-allowed", name: "Allowed origin" },
    });
    assert.equal(allowedOrigin.status, 201);

    // Exercise the production cookie flag in-place while keeping the first valid session for the flow.
    process.env.NODE_ENV = "production";
    const secureLogin = await request(baseUrl, "/api/auth/login", "POST", {
      body: credentialsA,
    });
    assert.equal(secureLogin.status, 201);
    assert.match(
      secureLogin.headers.get("set-cookie") ?? "",
      /(?:^|;\s*)Secure(?:;|$)/i,
    );
    const productionApiOrigin = `https://127.0.0.1:${address.port}`;
    delete process.env.API_ORIGIN;
    const proxiedHttpsSameOrigin = await request(
      baseUrl,
      "/api/workspaces",
      "POST",
      {
        cookie: cookieA,
        origin: productionApiOrigin,
        body: { id: "ws-proxy-default-origin", name: "Proxy same origin" },
      },
    );
    assert.equal(proxiedHttpsSameOrigin.status, 201);
    const publicApiOrigin = "https://api.eotion.example.test";
    process.env.API_ORIGIN = publicApiOrigin;
    const configuredApiOriginRequest = await request(
      baseUrl,
      "/api/workspaces",
      "POST",
      {
        cookie: cookieA,
        origin: publicApiOrigin,
        body: {
          id: "ws-proxy-configured-origin",
          name: "Configured API origin",
        },
      },
    );
    assert.equal(configuredApiOriginRequest.status, 201);
    const productionExternalOrigin = await request(
      baseUrl,
      "/api/workspaces",
      "POST",
      {
        cookie: cookieA,
        origin: "https://attacker.example.test",
        body: { id: "ws-production-external", name: "External origin" },
      },
    );
    assert.equal(productionExternalOrigin.status, 403);
    assert.equal(
      await connection
        .db!.collection("workspaces")
        .countDocuments({ id: "ws-production-external" }),
      0,
    );
    process.env.NODE_ENV = previousNodeEnv;
    if (previousApiOrigin === undefined) delete process.env.API_ORIGIN;
    else process.env.API_ORIGIN = previousApiOrigin;

    const workspaceCreate = await request(baseUrl, "/api/workspaces", "POST", {
      cookie: cookieA,
      body: { id: "ws-owner", name: "Owner workspace" },
    });
    assert.equal(workspaceCreate.status, 201);
    const workspace = workspaceCreate.body;
    assert.equal(workspace.id, "ws-owner");
    assert.equal(workspace.ownerId, registerAUser.id);
    assertNoSecretFields(workspace);
    const workspaces = await request(baseUrl, "/api/workspaces", "GET", {
      cookie: cookieA,
    });
    assert.equal(workspaces.status, 200);
    assert.ok(Array.isArray(workspaces.body));
    assert.equal(
      (
        await request(baseUrl, "/api/workspaces/ws-owner", "GET", {
          cookie: cookieA,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request(baseUrl, "/api/workspaces/ws-owner", "PATCH", {
          cookie: cookieA,
          body: { name: "Renamed workspace" },
        })
      ).status,
      200,
    );

    const badWorkspaceCreate = await request(
      baseUrl,
      "/api/workspaces",
      "POST",
      {
        cookie: cookieA,
        body: { id: "forged", name: "Forged", ownerId: "attacker" },
      },
    );
    assert.equal(badWorkspaceCreate.status, 400);

    const pagePayload = {
      id: "page-owner",
      parentPageId: null,
      title: "First page",
      orderKey: "a",
    };
    const pageCreate = await request(
      baseUrl,
      "/api/workspaces/ws-owner/pages",
      "POST",
      { cookie: cookieA, body: pagePayload },
    );
    assert.equal(pageCreate.status, 201);
    assert.equal(pageCreate.body.workspaceId, "ws-owner");
    assertNoSecretFields(pageCreate.body);
    assert.equal(
      (
        await request(baseUrl, "/api/workspaces/ws-owner/pages", "GET", {
          cookie: cookieA,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          baseUrl,
          "/api/workspaces/ws-owner/pages/page-owner",
          "GET",
          { cookie: cookieA },
        )
      ).status,
      200,
    );
    const pageUpdate = await request(
      baseUrl,
      "/api/workspaces/ws-owner/pages/page-owner",
      "PATCH",
      {
        cookie: cookieA,
        body: { title: "Updated page" },
      },
    );
    assert.equal(pageUpdate.status, 200);
    assert.equal(pageUpdate.body.title, "Updated page");
    const badPageCreate = await request(
      baseUrl,
      "/api/workspaces/ws-owner/pages",
      "POST",
      {
        cookie: cookieA,
        body: { ...pagePayload, workspaceId: "ws-other", userId: "attacker" },
      },
    );
    assert.equal(badPageCreate.status, 400);
    const badPageUpdate = await request(
      baseUrl,
      "/api/workspaces/ws-owner/pages/page-owner",
      "PATCH",
      {
        cookie: cookieA,
        body: {
          title: "Attempt move",
          workspaceId: "ws-other",
          parentPageId: "foreign",
        },
      },
    );
    assert.equal(badPageUpdate.status, 400);

    // Page tree: a dedicated move route and a leaf-only delete route.
    const childPageCreate = await request(
      baseUrl,
      "/api/workspaces/ws-owner/pages",
      "POST",
      {
        cookie: cookieA,
        body: {
          id: "page-child",
          parentPageId: null,
          title: "Child page",
          orderKey: "b",
        },
      },
    );
    assert.equal(childPageCreate.status, 201);

    assert.equal(
      (
        await request(
          baseUrl,
          "/api/workspaces/ws-owner/pages/page-child/move",
          "PATCH",
          { body: { parentPageId: null, orderKey: "z" } },
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await request(
          baseUrl,
          "/api/workspaces/ws-owner/pages/page-child",
          "DELETE",
        )
      ).status,
      401,
    );

    const moveUnderParent = await request(
      baseUrl,
      "/api/workspaces/ws-owner/pages/page-child/move",
      "PATCH",
      { cookie: cookieA, body: { parentPageId: "page-owner", orderKey: "b" } },
    );
    assert.equal(moveUnderParent.status, 200);
    assert.equal(moveUnderParent.body.parentPageId, "page-owner");
    assert.equal(moveUnderParent.body.workspaceId, "ws-owner");
    assertNoSecretFields(moveUnderParent.body);

    const grandchildCreate = await request(
      baseUrl,
      "/api/workspaces/ws-owner/pages",
      "POST",
      {
        cookie: cookieA,
        body: {
          id: "page-grandchild",
          parentPageId: "page-child",
          title: "Grandchild",
          orderKey: "a",
        },
      },
    );
    assert.equal(grandchildCreate.status, 201);

    const selfMove = await request(
      baseUrl,
      "/api/workspaces/ws-owner/pages/page-owner/move",
      "PATCH",
      { cookie: cookieA, body: { parentPageId: "page-owner", orderKey: "z" } },
    );
    assert.equal(selfMove.status, 400);
    const descendantMove = await request(
      baseUrl,
      "/api/workspaces/ws-owner/pages/page-child/move",
      "PATCH",
      { cookie: cookieA, body: { parentPageId: "page-grandchild", orderKey: "z" } },
    );
    assert.equal(descendantMove.status, 400);
    assert.equal(
      (
        await request(
          baseUrl,
          "/api/workspaces/ws-owner/pages/page-child",
          "GET",
          { cookie: cookieA },
        )
      ).body.parentPageId,
      "page-owner",
    );
    const unknownParentMove = await request(
      baseUrl,
      "/api/workspaces/ws-owner/pages/page-child/move",
      "PATCH",
      { cookie: cookieA, body: { parentPageId: "page-elsewhere", orderKey: "z" } },
    );
    assert.equal(unknownParentMove.status, 400);
    const badMoveBody = await request(
      baseUrl,
      "/api/workspaces/ws-owner/pages/page-child/move",
      "PATCH",
      {
        cookie: cookieA,
        body: { parentPageId: null, orderKey: "z", workspaceId: "ws-other" },
      },
    );
    assert.equal(badMoveBody.status, 400);
    assert.equal(
      (
        await request(
          baseUrl,
          "/api/workspaces/ws-owner/pages/absent-page/move",
          "PATCH",
          { cookie: cookieA, body: { parentPageId: null, orderKey: "z" } },
        )
      ).status,
      404,
    );

    const moveToRoot = await request(
      baseUrl,
      "/api/workspaces/ws-owner/pages/page-child/move",
      "PATCH",
      { cookie: cookieA, body: { parentPageId: null, orderKey: "c" } },
    );
    assert.equal(moveToRoot.status, 200);
    assert.equal(moveToRoot.body.parentPageId, null);
    assert.equal(moveToRoot.body.orderKey, "c");

    const deleteWithChildren = await request(
      baseUrl,
      "/api/workspaces/ws-owner/pages/page-child",
      "DELETE",
      { cookie: cookieA },
    );
    assert.equal(deleteWithChildren.status, 400);
    assert.equal(
      (
        await request(
          baseUrl,
          "/api/workspaces/ws-owner/pages/page-child",
          "GET",
          { cookie: cookieA },
        )
      ).status,
      200,
    );
    const deleteGrandchild = await request(
      baseUrl,
      "/api/workspaces/ws-owner/pages/page-grandchild",
      "DELETE",
      { cookie: cookieA },
    );
    assert.equal(deleteGrandchild.status, 200);
    assert.deepEqual(deleteGrandchild.body, { deleted: true });
    assert.equal(
      (
        await request(
          baseUrl,
          "/api/workspaces/ws-owner/pages/page-grandchild",
          "GET",
          { cookie: cookieA },
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request(
          baseUrl,
          "/api/workspaces/ws-owner/pages/page-grandchild",
          "DELETE",
          { cookie: cookieA },
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request(
          baseUrl,
          "/api/workspaces/ws-owner/pages/page-child",
          "DELETE",
          { cookie: cookieA },
        )
      ).status,
      200,
    );

    const blockPayload = {
      id: "block-owner",
      parentBlockId: null,
      type: "paragraph",
      orderKey: "a",
      props: { node: { type: "paragraph", content: [{ type: "text", text: "hello" }] } },
    };
    const blockCreate = await request(
      baseUrl,
      "/api/workspaces/ws-owner/pages/page-owner/blocks",
      "POST",
      {
        cookie: cookieA,
        body: blockPayload,
      },
    );
    assert.equal(blockCreate.status, 201);
    assert.equal(blockCreate.body.pageId, "page-owner");
    assert.equal(blockCreate.body.workspaceId, "ws-owner");
    assertNoSecretFields(blockCreate.body);
    assert.equal(
      (
        await request(
          baseUrl,
          "/api/workspaces/ws-owner/pages/page-owner/blocks",
          "GET",
          { cookie: cookieA },
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          baseUrl,
          "/api/workspaces/ws-owner/pages/page-owner/blocks/block-owner",
          "GET",
          { cookie: cookieA },
        )
      ).status,
      200,
    );
    const blockUpdate = await request(
      baseUrl,
      "/api/workspaces/ws-owner/pages/page-owner/blocks/block-owner",
      "PATCH",
      {
        cookie: cookieA,
        body: { props: { node: { type: "paragraph", content: [{ type: "text", text: "updated" }] } } },
      },
    );
    assert.equal(blockUpdate.status, 200);
    assert.equal(blockUpdate.body.props.node.content[0].text, "updated");
    const badBlockCreate = await request(
      baseUrl,
      "/api/workspaces/ws-owner/pages/page-owner/blocks",
      "POST",
      {
        cookie: cookieA,
        body: {
          ...blockPayload,
          pageId: "page-foreign",
          workspaceId: "ws-foreign",
          ownerId: "attacker",
        },
      },
    );
    assert.equal(badBlockCreate.status, 400);
    const badBlockUpdate = await request(
      baseUrl,
      "/api/workspaces/ws-owner/pages/page-owner/blocks/block-owner",
      "PATCH",
      {
        cookie: cookieA,
        body: {
          props: { node: { type: "paragraph", content: [{ type: "text", text: "invalid update" }] } },
          workspaceId: "ws-foreign",
          parentBlockId: "foreign",
        },
      },
    );
    assert.equal(badBlockUpdate.status, 400);

    const badBlockType = await request(
      baseUrl,
      "/api/workspaces/ws-owner/pages/page-owner/blocks",
      "POST",
      {
        cookie: cookieA,
        body: { ...blockPayload, id: "bad-block", type: "unknown" },
      },
    );
    assert.equal(badBlockType.status, 400);
    assert.equal(await blockModel.countDocuments({ id: "bad-block" }), 0);
    const mismatchedBlockNode = await request(baseUrl, "/api/workspaces/ws-owner/pages/page-owner/blocks", "POST", {
      cookie: cookieA,
      body: { ...blockPayload, id: "mismatched-block-node", type: "heading" },
    });
    assert.equal(mismatchedBlockNode.status, 400);
    assert.equal(await blockModel.countDocuments({ id: "mismatched-block-node" }), 0);
    const blockPropsBeforeRejectedPatch = (await request(baseUrl, "/api/workspaces/ws-owner/pages/page-owner/blocks/block-owner", "GET", { cookie: cookieA })).body.props;
    for (const patch of [
      { type: "heading" },
      { props: { node: { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "wrong node" }] } } },
    ]) {
      const rejectedPatch = await request(baseUrl, "/api/workspaces/ws-owner/pages/page-owner/blocks/block-owner", "PATCH", { cookie: cookieA, body: patch });
      assert.equal(rejectedPatch.status, 400);
      assert.deepEqual((await request(baseUrl, "/api/workspaces/ws-owner/pages/page-owner/blocks/block-owner", "GET", { cookie: cookieA })).body.props, blockPropsBeforeRejectedPatch);
    }

    const credentialsB = {
      email: "other@example.test",
      password: "another correct horse battery staple",
    };
    const registerB = await request(baseUrl, "/api/auth/register", "POST", {
      body: credentialsB,
    });
    assert.equal(registerB.status, 201);
    const loginB = await request(baseUrl, "/api/auth/login", "POST", {
      body: credentialsB,
    });
    assert.equal(loginB.status, 201);
    const cookieB = cookieFrom(loginB);

    const foreignRoutes = [
      ["/api/workspaces/ws-owner", "GET"],
      ["/api/workspaces/ws-owner", "PATCH"],
      ["/api/workspaces/ws-owner/pages", "GET"],
      ["/api/workspaces/ws-owner/pages", "POST"],
      ["/api/workspaces/ws-owner/pages/page-owner", "GET"],
      ["/api/workspaces/ws-owner/pages/page-owner", "PATCH"],
      ["/api/workspaces/ws-owner/pages/page-owner/blocks", "GET"],
      ["/api/workspaces/ws-owner/pages/page-owner/blocks", "POST"],
      ["/api/workspaces/ws-owner/pages/page-owner/blocks/block-owner", "GET"],
      ["/api/workspaces/ws-owner/pages/page-owner/blocks/block-owner", "PATCH"],
      ["/api/workspaces/ws-owner/pages/page-owner/blocks/block-owner", "DELETE"],
      ["/api/workspaces/ws-owner/pages/page-owner/move", "PATCH"],
      ["/api/workspaces/ws-owner/pages/page-owner", "DELETE"],
    ] as const;
    for (const [route, method] of foreignRoutes) {
      const body =
        method === "GET" || method === "DELETE"
          ? undefined
          : route.endsWith("/move")
            ? { parentPageId: null, orderKey: "z" }
            : method === "PATCH"
              ? route.includes("/blocks/")
                ? { props: { node: { type: "paragraph", content: [{ type: "text", text: "stolen" }] } } }
                : route.includes("/pages/")
                  ? { title: "stolen" }
                  : { name: "stolen" }
              : route.endsWith("/pages")
                ? {
                    id: "foreign-page",
                    parentPageId: null,
                    title: "Stolen page",
                    orderKey: "z",
                  }
                : route.endsWith("/blocks")
                  ? {
                      id: "foreign-block",
                      parentBlockId: null,
                      type: "paragraph",
                      orderKey: "z",
                      props: { node: { type: "paragraph", content: [{ type: "text", text: "foreign" }] } },
                    }
                  : undefined;
      const result = await request(baseUrl, route, method, {
        cookie: cookieB,
        ...(body === undefined ? {} : { body }),
      });
      assert.equal(
        result.status,
        404,
        `another user must not access ${method} ${route}`,
      );
    }

    const blockRoute = "/api/workspaces/ws-owner/pages/page-owner/blocks/block-owner";
    assert.equal((await request(baseUrl, blockRoute, "DELETE")).status, 401);
    const otherPage = await request(baseUrl, "/api/workspaces/ws-owner/pages", "POST", {
      cookie: cookieA,
      body: { id: "page-block-other", parentPageId: null, title: "Other", orderKey: "z" },
    });
    assert.equal(otherPage.status, 201);
    assert.equal((await request(baseUrl, "/api/workspaces/ws-owner/pages/page-block-other/blocks/block-owner", "DELETE", { cookie: cookieA })).status, 404);
    assert.equal((await request(baseUrl, blockRoute, "GET", { cookie: cookieA })).status, 200);
    const makeToggleParent = await request(baseUrl, blockRoute, "PATCH", {
      cookie: cookieA,
      body: { type: "toggle", props: { node: { type: "eotionToggle", content: [{ type: "paragraph", content: [{ type: "text", text: "updated" }] }] } } },
    });
    assert.equal(makeToggleParent.status, 200);
    assert.equal(makeToggleParent.body.type, "toggle");
    const childBlock = await request(baseUrl, "/api/workspaces/ws-owner/pages/page-owner/blocks", "POST", {
      cookie: cookieA,
      body: { id: "block-delete-child", parentBlockId: "block-owner", type: "paragraph", orderKey: "b", props: { node: { type: "paragraph" } } },
    });
    assert.equal(childBlock.status, 201);
    assert.equal((await request(baseUrl, blockRoute, "DELETE", { cookie: cookieA })).status, 400);
    assert.equal((await request(baseUrl, blockRoute.replace("block-owner", "block-delete-child"), "DELETE", { cookie: cookieA })).status, 200);
    assert.equal((await request(baseUrl, blockRoute, "DELETE", { cookie: cookieA })).status, 200);
    assert.equal((await request(baseUrl, blockRoute, "DELETE", { cookie: cookieA })).status, 404);
    assert.equal(await blockModel.countDocuments({ id: "block-owner" }), 0);

    const logout = await request(baseUrl, "/api/auth/logout", "POST", {
      cookie: cookieA,
    });
    assert.ok(logout.status === 200 || logout.status === 204);
    const afterLogout = await request(baseUrl, "/api/auth/me", "GET", {
      cookie: cookieA,
    });
    assert.equal(afterLogout.status, 401);
    assert.match(
      logout.headers.get("set-cookie") ?? "",
      /(?:Max-Age=0|Expires=Thu, 01 Jan 1970)/i,
    );

    // Legacy users have no stored nickname or credential version.
    await userModel.updateOne({ id: registerAUser.id }, { $unset: { displayName: 1, credentialVersion: 1 } });
    const profileLogin = await request(baseUrl, "/api/auth/login", "POST", { body: credentialsA });
    assert.equal(profileLogin.status, 201);
    const profileCookie = cookieFrom(profileLogin);
    await sessionModel.updateOne(
      { tokenHash: createHash("sha256").update(profileCookie.split("=")[1]!).digest("hex") },
      { $unset: { credentialVersion: 1 } },
    );
    assert.equal(onlyUser(profileLogin.body).displayName, "owner");
    assert.equal((await request(baseUrl, "/api/auth/me", "GET", { cookie: profileCookie })).body.displayName, "owner");
    assert.equal((await request(baseUrl, "/api/auth/me", "PATCH", { body: { displayName: "Imposter" } })).status, 401);
    for (const displayName of ["  ", "x".repeat(65)]) {
      assert.equal((await request(baseUrl, "/api/auth/me", "PATCH", { cookie: profileCookie, body: { displayName } })).status, 400);
    }
    assert.equal((await request(baseUrl, "/api/auth/me", "PATCH", { cookie: profileCookie, body: { displayName: "Stolen", userId: registerAUser.id } })).status, 400);
    const profileUpdate = await request(baseUrl, "/api/auth/me", "PATCH", { cookie: profileCookie, body: { displayName: "  Eotion Owner  " } });
    assert.equal(profileUpdate.status, 200);
    assert.equal(profileUpdate.body.displayName, "Eotion Owner");
    assertNoSecretFields(profileUpdate.body);
    assert.equal((await request(baseUrl, "/api/auth/me", "GET", { cookie: profileCookie })).body.displayName, "Eotion Owner");
    const otherSession = await request(baseUrl, "/api/auth/login", "POST", { body: credentialsA });
    assert.equal(otherSession.status, 201);
    const otherCookie = cookieFrom(otherSession);
    const passwordRoute = "/api/auth/change-password";
    const passwordBody = { currentPassword: credentialsA.password, newPassword: "a different strong password" };
    assert.equal((await request(baseUrl, passwordRoute, "POST", { body: passwordBody })).status, 401);
    const wrongPassword = await request(baseUrl, passwordRoute, "POST", { cookie: profileCookie, body: { ...passwordBody, currentPassword: "incorrect" } });
    assert.equal(wrongPassword.status, 400);
    assert.match(String(wrongPassword.body.message), /当前密码不正确/);
    assert.equal((await request(baseUrl, "/api/auth/me", "GET", { cookie: profileCookie })).status, 200);
    assert.equal((await request(baseUrl, passwordRoute, "POST", { cookie: profileCookie, body: { ...passwordBody, confirmPassword: passwordBody.newPassword } })).status, 400);

    // A failed second write must roll back the password update and keep both sessions valid.
    const sessionRepository = app.get(SessionRepository);
    const revokeAll = sessionRepository.revokeAllByUserId.bind(sessionRepository);
    sessionRepository.revokeAllByUserId = async () => { throw new Error("injected revocation failure"); };
    try {
      const failedMutation = await request(baseUrl, passwordRoute, "POST", { cookie: profileCookie, body: passwordBody });
      assert.equal(failedMutation.status, 500);
      assert.doesNotMatch(JSON.stringify(failedMutation.body), /correct horse|different strong password/);
    } finally {
      sessionRepository.revokeAllByUserId = revokeAll;
    }
    assert.equal((await request(baseUrl, "/api/auth/me", "GET", { cookie: profileCookie })).status, 200);
    assert.equal((await request(baseUrl, "/api/auth/me", "GET", { cookie: otherCookie })).status, 200);
    const oldPasswordStillWorks = await request(baseUrl, "/api/auth/login", "POST", { body: credentialsA });
    assert.equal(oldPasswordStillWorks.status, 201);

    const passwordChanged = await request(baseUrl, passwordRoute, "POST", { cookie: profileCookie, body: passwordBody });
    assert.equal(passwordChanged.status, 204);
    assert.match(passwordChanged.headers.get("set-cookie") ?? "", /Max-Age=0/);
    assert.equal((await request(baseUrl, "/api/auth/me", "GET", { cookie: profileCookie })).status, 401);
    assert.equal((await request(baseUrl, "/api/auth/me", "GET", { cookie: otherCookie })).status, 401);
    assert.equal((await request(baseUrl, "/api/auth/me", "GET", { cookie: cookieFrom(oldPasswordStillWorks) })).status, 401);
    // Simulates a login that verified the old password before the transaction committed,
    // then inserted its session afterward. The credential version rejects that race.
    const staleToken = randomBytes(32).toString("base64url");
    await sessionModel.create({
      id: randomUUID(), userId: registerAUser.id,
      tokenHash: createHash("sha256").update(staleToken).digest("hex"),
      expiresAt: new Date(Date.now() + 60_000), revokedAt: null, credentialVersion: 0,
    });
    assert.equal((await request(baseUrl, "/api/auth/me", "GET", { cookie: `eotion_session=${staleToken}` })).status, 401);
    assert.equal((await request(baseUrl, "/api/auth/login", "POST", { body: credentialsA })).status, 401);
    const newPasswordLogin = await request(baseUrl, "/api/auth/login", "POST", { body: { email: credentialsA.email, password: passwordBody.newPassword } });
    assert.equal(newPasswordLogin.status, 201);
    assert.equal(onlyUser(newPasswordLogin.body).displayName, "Eotion Owner");
    assertNoSecretFields(newPasswordLogin.body);
    const storedNewHash = await userModel.findOne({ id: registerAUser.id }).select("+passwordHash").lean() as unknown as { passwordHash: string };
    assert.match(storedNewHash.passwordHash, /^scrypt\$16384\$8\$1\$/);
    assert.notEqual(storedNewHash.passwordHash, passwordBody.newPassword);
  } finally {
    // The after hook drops the isolated database. Restore the import-time environment if startup fails early.
    if (!app) {
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
});
