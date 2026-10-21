# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: product-settings.spec.ts >> settings navigation ends with 软件说明 and /settings/about shows build info plus release notes
- Location: tests\product-settings.spec.ts:755:1

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator:  getByTestId('about-released')
Expected: "2026-10-11"
Received: "暂无记录"
Timeout:  5000ms

Call log:
  - Expect "toHaveText" getByTestId('about-released') with timeout 5000ms
  - waiting for getByTestId('about-released')
    14 × locator resolved to <dd data-testid="about-released" class="settings-about-released">暂无记录</dd>
       - unexpected value "暂无记录"

```

```yaml
- definition: 暂无记录
```

# Test source

```ts
  682 |   await expect(touchToolbar).toBeVisible();
  683 |   const touchBox = await touchToolbar
  684 |     .getByRole("button", { name: "插入文件" })
  685 |     .boundingBox();
  686 |   expect(touchBox?.height).toBeGreaterThanOrEqual(44);
  687 |   await touchToolbar.getByRole("button", { name: "插入文件" }).click();
  688 |   await expect(page.getByLabel("选择文件附件")).toHaveAttribute("type", "file");
  689 |   expect(
  690 |     api.requests.filter(
  691 |       (request) =>
  692 |         request.method === "POST" &&
  693 |         request.path === "/api/auth/change-password",
  694 |     ),
  695 |   ).toHaveLength(0);
  696 | });
  697 | 
  698 | test("unknown workspace has no global toolbar preference; returnTo rejects external paths and preserves valid pages", async ({
  699 |   page,
  700 | }) => {
  701 |   await installApi(page);
  702 |   await page.goto(
  703 |     "/#/settings/workspace/general?returnTo=https%3A%2F%2Fevil.example%2F&workspaceId=unknown",
  704 |   );
  705 |   await expect(page.getByText("无法确定当前工作区")).toBeVisible();
  706 |   await expect(page.getByRole("switch")).toHaveCount(0);
  707 |   expect(
  708 |     await page.evaluate(() =>
  709 |       Object.keys(localStorage).filter((key) =>
  710 |         key.startsWith("eotion:editor-toolbar:"),
  711 |       ),
  712 |     ),
  713 |   ).toHaveLength(0);
  714 |   const safeReturn = page.getByRole("link", { name: "返回工作区" });
  715 |   await expect(safeReturn).toHaveAttribute("href", "#/app");
  716 |   await safeReturn.click();
  717 |   // /app resolves the authenticated user's preferred workspace after loading.
  718 |   await expect(page).toHaveURL(new RegExp(`#\\/app\\/${wsA.id}$`));
  719 | 
  720 |   await page.goto(
  721 |     `/#/settings/profile?returnTo=${encodeURIComponent(`/app/${wsA.id}/page/${pageA.id}`)}&workspaceId=${wsA.id}`,
  722 |   );
  723 |   await page.getByRole("link", { name: "返回工作区" }).click();
  724 |   await expect(page).toHaveURL(
  725 |     new RegExp(`#\\/app\\/${wsA.id}\\/page\\/${pageA.id}$`),
  726 |   );
  727 | });
  728 | 
  729 | test("theme and toolbar controls support keyboard focus and activation in dark reduced-motion mode", async ({
  730 |   page,
  731 | }) => {
  732 |   await installApi(page);
  733 |   await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  734 |   await page.goto("/#/settings/appearance?workspaceId=ws-a");
  735 |   const system = page.getByRole("radio", { name: /跟随系统/ });
  736 |   await system.focus();
  737 |   await system.press("ArrowDown");
  738 |   await expect(page.getByRole("radio", { name: /浅色/ })).toBeChecked();
  739 |   await page.getByRole("radio", { name: /浅色/ }).press("ArrowDown");
  740 |   await expect(page.getByRole("radio", { name: /深色/ })).toBeChecked();
  741 |   await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  742 |   const general = page.getByRole("link", { name: /通用/ });
  743 |   await general.focus();
  744 |   await general.press("Enter");
  745 |   await expect(general).toHaveAttribute("aria-current", "page");
  746 |   const toggle = page.getByRole("switch", { name: "显示固定编辑工具栏" });
  747 |   await toggle.focus();
  748 |   expect(
  749 |     await toggle.evaluate((element) => getComputedStyle(element).outlineStyle),
  750 |   ).not.toBe("none");
  751 |   await toggle.press("Space");
  752 |   await expect(toggle).toHaveAttribute("aria-checked", "true");
  753 | });
  754 | 
  755 | test("settings navigation ends with 软件说明 and /settings/about shows build info plus release notes", async ({
  756 |   page,
  757 | }) => {
  758 |   const pageErrors: string[] = [];
  759 |   page.on("pageerror", (error) => pageErrors.push(error.message));
  760 |   await installApi(page);
  761 |   await page.setViewportSize({ width: 1440, height: 900 });
  762 |   await page.goto(settingsUrl());
  763 |   const nav = page.getByRole("navigation", { name: "设置导航" });
  764 |   const groups = nav.locator(".settings-nav-group");
  765 |   await expect(
  766 |     groups.last().getByRole("heading", { name: "关于" }),
  767 |   ).toBeVisible();
  768 |   const about = nav.getByRole("link", { name: /软件说明/ });
  769 |   await expect(about).toBeVisible();
  770 |   await about.click();
  771 |   await expect(page).toHaveURL(/#\/settings\/about/);
  772 |   await expect(
  773 |     page.getByRole("heading", { name: "软件说明", level: 1 }),
  774 |   ).toBeVisible();
  775 |   await expect(nav.getByRole("link", { name: /软件说明/ })).toHaveAttribute(
  776 |     "aria-current",
  777 |     "page",
  778 |   );
  779 |   await expect(page.getByTestId("about-version")).toContainText(buildVersion);
  780 |   await expect(page.getByTestId("about-version")).toContainText(/[0-9a-f]{6}|unknown/);
  781 |   await expect(page.getByTestId("about-version")).not.toContainText("Build ");
> 782 |   await expect(page.getByTestId("about-released")).toHaveText("2026-10-11");
      |                                                    ^ Error: expect(locator).toHaveText(expected) failed
  783 |   await expect(
  784 |     page.getByRole("heading", { name: "当前版本日志" }),
  785 |   ).toBeVisible();
  786 |   const notes = page.locator(".settings-about-notes li");
  787 |   await expect(notes).toHaveCount(releaseHighlights.length);
  788 |   for (const highlight of releaseHighlights)
  789 |     await expect(notes.filter({ hasText: highlight })).toHaveCount(1);
  790 |   const widths = await page.evaluate(() => ({
  791 |     viewport: document.documentElement.clientWidth,
  792 |     content: document.documentElement.scrollWidth,
  793 |   }));
  794 |   expect(widths.content).toBeLessThanOrEqual(widths.viewport);
  795 | 
  796 |   await page.setViewportSize({ width: 390, height: 844 });
  797 |   await page.goto(
  798 |     `/#/settings/about?returnTo=${encodeURIComponent("/app/ws-a/page/page-a")}&workspaceId=ws-a`,
  799 |   );
  800 |   await expect(
  801 |     page.getByRole("heading", { name: "软件说明", level: 1 }),
  802 |   ).toBeVisible();
  803 |   await expect(page.getByTestId("about-version")).toContainText(buildVersion);
  804 |   const compact = await page.evaluate(() => ({
  805 |     viewport: document.documentElement.clientWidth,
  806 |     content: document.documentElement.scrollWidth,
  807 |   }));
  808 |   expect(compact.content).toBeLessThanOrEqual(compact.viewport);
  809 |   expect(pageErrors).toEqual([]);
  810 | });
  811 | 
  812 | test("/settings/about survives the login redirect allowlist instead of falling back to /app", async ({
  813 |   page,
  814 | }) => {
  815 |   await installApi(page);
  816 |   await page.setViewportSize({ width: 1440, height: 900 });
  817 |   await page.goto("/#/login?redirect=%2Fsettings%2Fabout");
  818 |   await expect(page).toHaveURL(/#\/settings\/about$/);
  819 |   await expect(
  820 |     page.getByRole("heading", { name: "软件说明", level: 1 }),
  821 |   ).toBeVisible();
  822 | });
  823 | 
  824 | test("检查更新 compares the local build with /api/health and never downloads", async ({
  825 |   page,
  826 | }) => {
  827 |   const api = await installApi(page);
  828 |   await page.setViewportSize({ width: 1440, height: 900 });
  829 |   await page.goto(
  830 |     `/#/settings/about?returnTo=${encodeURIComponent("/app/ws-a")}&workspaceId=ws-a`,
  831 |   );
  832 |   const check = page.getByTestId("about-check");
  833 |   const status = page.getByRole("status");
  834 |   await expect(check).toHaveText("检查更新");
  835 |   await expect(status).toHaveText("");
  836 | 
  837 |   await check.click();
  838 |   await expect(status).toHaveText("已是最新版本");
  839 | 
  840 |   api.controls.healthVersion = "0.0.2";
  841 |   await check.click();
  842 |   await expect(status).toHaveText("发现新版本 0.0.2");
  843 | 
  844 |   api.controls.healthVersion = buildVersion;
  845 |   api.controls.healthBuildNumber = buildNumber + 1;
  846 |   await check.click();
  847 |   await expect(status).toHaveText(
  848 |     `发现新构建 ${buildVersion} · Build ${buildNumber + 1}`,
  849 |   );
  850 | 
  851 |   api.controls.healthVersion = "0.0.0";
  852 |   api.controls.healthBuildNumber = buildNumber;
  853 |   await check.click();
  854 |   await expect(status).toHaveText("当前版本已是较新版本");
  855 | 
  856 |   api.controls.healthVersion = buildVersion;
  857 |   api.controls.healthStatus = 500;
  858 |   await check.click();
  859 |   await expect(status).toHaveText("检查更新失败，请稍后重试");
  860 | 
  861 |   api.controls.healthStatus = 200;
  862 |   api.controls.healthBuildNumber = buildNumber + 3;
  863 |   api.controls.healthDelay = 500;
  864 |   await check.click();
  865 |   await expect(check).toHaveText("检查中…");
  866 |   await expect(check).toBeDisabled();
  867 |   await expect(status).toHaveText(
  868 |     `发现新构建 ${buildVersion} · Build ${buildNumber + 3}`,
  869 |   );
  870 |   await expect(check).toBeEnabled();
  871 |   expect(
  872 |     api.requests.filter((request) => request.path === "/api/health"),
  873 |   ).toHaveLength(6);
  874 | });
  875 | 
```