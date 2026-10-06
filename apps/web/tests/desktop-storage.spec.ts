import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

test("Electron renderer uses SQLite through typed preload and survives reload", async () => {
  const profile = mkdtempSync(resolve(tmpdir(), "eotion-p3-electron-"));
  const executable =
    process.platform === "win32"
      ? "electron.exe"
      : process.platform === "darwin"
        ? "Electron.app/Contents/MacOS/Electron"
        : "electron";
  const launch = () =>
    electron.launch({
      executablePath: resolve(
        "../desktop/node_modules/electron/dist",
        executable,
      ),
      args: [
        resolve("../desktop/out/main/index.js"),
        `--user-data-dir=${profile}`,
      ],
      env: {
        ...process.env,
        ELECTRON_RENDERER_URL: "http://127.0.0.1:7173/#/__dev/storage-p3",
      },
    });
  let app = await launch();
  try {
    const page = await app.firstWindow();
    await expect(
      page.getByRole("heading", { name: "P3 本地优先存储" }),
    ).toBeVisible();
    await expect(page.getByText("Electron SQLite")).toBeVisible();
    await page.getByRole("button", { name: "创建 / 更新页面" }).click();
    await expect(
      page.getByRole("heading", { name: "Pages" }).locator(".."),
    ).toContainText("p3-demo-page");
    await page.getByRole("button", { name: "创建 / 更新区块" }).click();
    await expect(
      page.getByRole("heading", { name: "Blocks by page" }).locator(".."),
    ).toContainText("p3-demo-block");
    await page.reload();
    await expect(page.getByText("Electron SQLite")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Pages" }).locator(".."),
    ).toContainText("p3-demo-page");
    await expect(
      page.getByRole("heading", { name: "Pending / failed operations (2)" }),
    ).toBeVisible();
    await app.close();
    app = await launch();
    const reopened = await app.firstWindow();
    await expect(reopened.getByText("Electron SQLite")).toBeVisible();
    await expect(
      reopened.getByRole("heading", { name: "Pages" }).locator(".."),
    ).toContainText("p3-demo-page");
    await expect(
      reopened.getByRole("heading", {
        name: "Pending / failed operations (2)",
      }),
    ).toBeVisible();
    const calloutWrites = await reopened.evaluate(async () => {
      const store = window.eotionDesktop!.storage;
      const now = new Date().toISOString();
      const callout = {
        id: "sqlite-callout", workspaceId: "p3-demo-workspace", pageId: "p3-demo-page", parentBlockId: null,
        type: "callout" as const, orderKey: "b", createdAt: now, updatedAt: now,
        props: { node: { type: "eotionCallout", attrs: { icon: "💡", tone: "info" }, content: [{ type: "text", text: "Note" }, { type: "hardBreak" }, { type: "text", text: "Body" }] } },
      };
      await store.upsertBlock(callout);
      let invalidRejected = false;
      try { await store.upsertBlock({ ...callout, props: { node: { type: "eotionCallout", attrs: { icon: "💡", tone: "danger" } } } }); }
      catch { invalidRejected = true; }
      const toggle = { ...callout, id: "sqlite-toggle", type: "toggle" as const, orderKey: "c", props: { node: { type: "eotionToggle", content: [{ type: "paragraph" }] } } };
      await store.upsertBlock(toggle);
      await store.upsertBlock({ ...callout, id: "sqlite-child", parentBlockId: toggle.id, type: "paragraph", orderKey: "a", props: { node: { type: "paragraph" } } });
      let parentRejected = false;
      try { await store.upsertBlock({ ...callout, id: toggle.id, orderKey: toggle.orderKey }); }
      catch { parentRejected = true; }
      return { invalidRejected, parentRejected, pendingCount: (await store.getPendingOperations()).length, parentType: (await store.getBlock(toggle.id))?.type };
    });
    expect(calloutWrites).toEqual({ invalidRejected: true, parentRejected: true, pendingCount: 5, parentType: "toggle" });
    await app.close();
    app = await launch();
    const sqliteReopened = await app.firstWindow();
    await expect(sqliteReopened.getByText("Electron SQLite")).toBeVisible();
    const calloutRoundTrip = await sqliteReopened.evaluate(async () => {
      const store = window.eotionDesktop!.storage;
      const before = await store.getBlock("sqlite-callout");
      for (const operation of await store.getPendingOperations()) await store.markOperationSynced(operation.id);
      await store.replaceWorkspaceSnapshot("p3-demo-workspace", await store.listPagesByWorkspace("p3-demo-workspace"), await store.listBlocksByPage("p3-demo-page"));
      const after = await store.getBlock("sqlite-callout");
      return { before, after, pendingCount: (await store.getPendingOperations()).length };
    });
    expect(calloutRoundTrip.before).toMatchObject({ id: "sqlite-callout", pageId: "p3-demo-page", parentBlockId: null, type: "callout", orderKey: "b", props: { node: { type: "eotionCallout", attrs: { icon: "💡", tone: "info" }, content: [{ type: "text", text: "Note" }, { type: "hardBreak" }, { type: "text", text: "Body" }] } } });
    expect(calloutRoundTrip.after).toEqual(calloutRoundTrip.before);
    expect(calloutRoundTrip.pendingCount).toBe(0);
    await sqliteReopened.getByRole("button", { name: "清除数据" }).click();
    await expect(sqliteReopened.getByRole("status")).toHaveText("数据已清除");
    await expect(
      sqliteReopened.getByRole("heading", {
        name: "Pending / failed operations (0)",
      }),
    ).toBeVisible();
    await sqliteReopened.reload();
    await expect(
      sqliteReopened.getByRole("heading", { name: "Pages" }).locator(".."),
    ).not.toContainText("p3-demo-page");
    await expect(
      sqliteReopened.getByRole("heading", { name: "Blocks by page" }).locator(".."),
    ).not.toContainText("p3-demo-block");
    await expect(
      sqliteReopened.getByRole("heading", {
        name: "Pending / failed operations (0)",
      }),
    ).toBeVisible();
  } finally {
    await app.close();
    rmSync(profile, { recursive: true, force: true });
  }
});
