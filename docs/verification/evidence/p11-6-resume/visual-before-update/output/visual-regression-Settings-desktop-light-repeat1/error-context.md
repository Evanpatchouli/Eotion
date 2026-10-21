# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: visual-regression.spec.ts >> Settings desktop light
- Location: tests\visual-regression.spec.ts:110:1

# Error details

```
Error: expect(page).toHaveScreenshot(expected) failed

  2006 pixels (ratio 0.01 of all image pixels) are different.

  Snapshot: settings-desktop-light.png

Call log:
  - Expect "toHaveScreenshot(settings-desktop-light.png)" with timeout 5000ms
    - verifying given screenshot expectation
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - 2006 pixels (ratio 0.01 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - captured a stable screenshot
  - 2006 pixels (ratio 0.01 of all image pixels) are different.

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - banner [ref=e5]:
    - link "返回工作区" [ref=e6] [cursor=pointer]:
      - /url: "#/app/visual-ws/page/visual-page"
    - strong [ref=e13]: 设置
  - generic [ref=e14]:
    - navigation "设置导航" [ref=e15]:
      - generic [ref=e16]:
        - generic [ref=e17]:
          - heading "个人" [level=2] [ref=e18]
          - link "账号资料" [ref=e19] [cursor=pointer]:
            - /url: "#/settings/profile?returnTo=/app/visual-ws/page/visual-page&workspaceId=visual-ws"
        - generic [ref=e23]:
          - heading "外观" [level=2] [ref=e24]
          - link "外观 浅色" [ref=e25] [cursor=pointer]:
            - /url: "#/settings/appearance?returnTo=/app/visual-ws/page/visual-page&workspaceId=visual-ws"
            - generic [ref=e28]: 外观
            - generic [ref=e29]: 浅色
        - generic [ref=e30]:
          - heading "工作空间" [level=2] [ref=e31]
          - link "通用" [ref=e32] [cursor=pointer]:
            - /url: "#/settings/workspace/general?returnTo=/app/visual-ws/page/visual-page&workspaceId=visual-ws"
        - generic [ref=e36]:
          - heading "功能" [level=2] [ref=e37]
          - link "MCP" [ref=e38] [cursor=pointer]:
            - /url: "#/settings/mcp?returnTo=/app/visual-ws/page/visual-page&workspaceId=visual-ws"
          - generic [ref=e42]:
            - generic [ref=e45]: Agent
            - generic [ref=e46]: 即将推出
        - generic [ref=e47]:
          - heading "关于" [level=2] [ref=e48]
          - link "软件说明" [ref=e49] [cursor=pointer]:
            - /url: "#/settings/about?returnTo=/app/visual-ws/page/visual-page&workspaceId=visual-ws"
    - main [ref=e53]:
      - generic [ref=e55]:
        - generic [ref=e56]:
          - heading "账号资料" [level=1] [ref=e57]
          - paragraph [ref=e58]: 管理你的昵称与登录密码。
        - region [ref=e59]:
          - generic [ref=e60]:
            - heading "昵称" [level=2] [ref=e61]
            - paragraph [ref=e62]: 这个名字会显示在你的工作区中。
          - generic [ref=e63]:
            - generic [ref=e64]: 昵称
            - generic [ref=e65]:
              - textbox "昵称" [ref=e66]: Ava
              - button "保存昵称" [disabled] [ref=e67]
            - status [ref=e68]
        - region [ref=e69]:
          - generic [ref=e70]:
            - heading "变更密码" [level=2] [ref=e71]
            - paragraph [ref=e72]: 更改后，所有设备都需要使用新密码重新登录。
          - generic [ref=e73]:
            - generic [ref=e74]:
              - generic [ref=e75]: 当前密码
              - generic [ref=e76]:
                - textbox "当前密码" [ref=e77]
                - button "显示当前密码" [ref=e78] [cursor=pointer]
            - generic [ref=e81]:
              - generic [ref=e82]: 新密码
              - generic [ref=e83]:
                - textbox "新密码" [ref=e84]
                - button "显示新密码" [ref=e85] [cursor=pointer]
            - generic [ref=e88]:
              - generic [ref=e89]: 确认新密码
              - textbox "确认新密码" [ref=e90]
            - button "更新密码" [disabled] [ref=e92]
            - alert [ref=e93]
```

# Test source

```ts
  1   | import { expect, test, type Page, type Route } from '@playwright/test'
  2   | import type { AuthUserDto, BlockResponse, PageResponse, WorkspaceResponse } from '@eotion/contracts'
  3   | 
  4   | const now = '2026-10-01T12:00:00.000Z'
  5   | const user: AuthUserDto = {
  6   |   id: 'visual-ava', email: 'ava@example.com', displayName: 'Ava', createdAt: now, updatedAt: now,
  7   | }
  8   | const workspace: WorkspaceResponse = {
  9   |   id: 'visual-ws', name: 'Quiet Studio', ownerId: user.id, createdAt: now, updatedAt: now,
  10  | }
  11  | const pageRecord: PageResponse = {
  12  |   id: 'visual-page', workspaceId: workspace.id, parentPageId: null, title: '今日记录',
  13  |   orderKey: '0000000000000001', createdAt: now, updatedAt: now,
  14  | }
  15  | const blocks: BlockResponse[] = [
  16  |   {
  17  |     id: 'visual-heading', workspaceId: workspace.id, pageId: pageRecord.id, parentBlockId: null,
  18  |     type: 'heading', orderKey: '0000000000000001', createdAt: now, updatedAt: now,
  19  |     props: { node: { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '留一处安静的空间' }] } },
  20  |   },
  21  |   {
  22  |     id: 'visual-paragraph', workspaceId: workspace.id, pageId: pageRecord.id, parentBlockId: null,
  23  |     type: 'paragraph', orderKey: '0000000000000002', createdAt: now, updatedAt: now,
  24  |     props: { node: { type: 'paragraph', content: [{ type: 'text', text: '记录今天值得记住的事情。固定内容让每次截图都能直接比较。' }] } },
  25  |   },
  26  | ]
  27  | 
  28  | async function installApi(page: Page, unavailable = false) {
  29  |   await page.route('**/api/**', async (route: Route) => {
  30  |     const path = new URL(route.request().url()).pathname
  31  |     const method = route.request().method()
  32  |     const json = (status: number, body: unknown) => route.fulfill({
  33  |       status, contentType: 'application/json', body: JSON.stringify(body),
  34  |     })
  35  |     if (unavailable && path === '/api/auth/me' && method === 'GET') {
  36  |       return json(503, { statusCode: 503, message: 'Session unavailable', error: 'Service Unavailable' })
  37  |     }
  38  |     if (path === '/api/auth/me' && method === 'GET') return json(200, user)
  39  |     if (path === '/api/workspaces' && method === 'GET') return json(200, [workspace])
  40  |     if (path === `/api/sync/workspaces/${workspace.id}/snapshot` && method === 'GET') {
  41  |       return json(200, { pages: [pageRecord], blocks })
  42  |     }
  43  |     if (path === '/api/sync/operations' && method === 'POST') {
  44  |       const body = route.request().postDataJSON() as { id?: string }
  45  |       return json(200, { id: body.id ?? 'visual-operation', status: 'applied' })
  46  |     }
  47  |     return json(404, { statusCode: 404, message: 'Not found', error: 'Not Found' })
  48  |   })
  49  | }
  50  | 
  51  | async function openPage(page: Page, options: { width: number; height: number; theme?: 'light' | 'dark'; touch?: boolean }) {
  52  |   await page.clock.install({ time: new Date(now) })
  53  |   await page.setViewportSize({ width: options.width, height: options.height })
  54  |   await page.emulateMedia({ colorScheme: options.theme ?? 'light', reducedMotion: 'reduce' })
  55  |   await page.addInitScript((theme) => {
  56  |     localStorage.setItem('eotion:theme', theme)
  57  |   }, options.theme ?? 'light')
  58  |   await installApi(page)
  59  |   const visualVariant = `${options.width}-${options.height}-${options.theme ?? 'light'}-${options.touch ? 'touch' : 'mouse'}`
  60  |   await page.goto(`/?visual=${visualVariant}#/app/${workspace.id}/page/${pageRecord.id}`)
  61  |   await expect(page.locator('.eotion-editor-content .tiptap')).toContainText('记录今天值得记住的事情。')
  62  |   await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  63  | }
  64  | 
  65  | async function openSettings(page: Page, options: { width: number; height: number; path: string }) {
  66  |   await page.clock.install({ time: new Date(now) })
  67  |   await page.setViewportSize({ width: options.width, height: options.height })
  68  |   await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  69  |   await page.addInitScript(() => localStorage.setItem('eotion:theme', 'light'))
  70  |   await installApi(page)
  71  |   await page.goto(`/?visual=settings-${options.width}#/settings/${options.path}?returnTo=${encodeURIComponent(`/app/${workspace.id}/page/${pageRecord.id}`)}&workspaceId=${workspace.id}`)
  72  |   await expect(page.getByRole('heading', { name: '账号资料' })).toBeVisible()
  73  |   await expect(page.locator('.settings-topbar')).toHaveCount(1)
  74  | }
  75  | 
  76  | async function capture(page: Page, name: string) {
  77  |   await page.evaluate(async () => document.fonts.ready)
> 78  |   await expect(page).toHaveScreenshot(name)
      |                      ^ Error: expect(page).toHaveScreenshot(expected) failed
  79  | }
  80  | 
  81  | test('Page desktop light', async ({ page }) => {
  82  |   await openPage(page, { width: 1440, height: 900 })
  83  |   await capture(page, 'page-desktop-light.png')
  84  | })
  85  | 
  86  | test('Page desktop dark', async ({ page }) => {
  87  |   await openPage(page, { width: 1440, height: 900, theme: 'dark' })
  88  |   await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  89  |   await capture(page, 'page-desktop-dark.png')
  90  | })
  91  | 
  92  | test('Page tablet light', async ({ page }) => {
  93  |   await openPage(page, { width: 1024, height: 900 })
  94  |   await expect(page.locator('.product-shell')).toHaveAttribute('data-layout', 'tablet')
  95  |   await capture(page, 'page-tablet-light.png')
  96  | })
  97  | 
  98  | test.describe('mobile touch context', () => {
  99  |   test.use({ hasTouch: true, isMobile: true })
  100 | 
  101 |   test('Page mobile light', async ({ page }) => {
  102 |     await openPage(page, { width: 390, height: 844, touch: true })
  103 |     expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
  104 |     await expect(page.getByRole('toolbar', { name: '触摸编辑工具栏' })).toBeVisible()
  105 |     expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  106 |     await capture(page, 'page-mobile-light.png')
  107 |   })
  108 | })
  109 | 
  110 | test('Settings desktop light', async ({ page }) => {
  111 |   await openSettings(page, { width: 1440, height: 900, path: '' })
  112 |   await capture(page, 'settings-desktop-light.png')
  113 | })
  114 | 
  115 | test('Settings profile detail mobile light', async ({ page }) => {
  116 |   await openSettings(page, { width: 390, height: 844, path: 'profile' })
  117 |   await expect(page.locator('.settings-compact-back')).toHaveCount(0)
  118 |   const geometry = await page.locator('.settings-page').evaluate((element) => ({
  119 |     gutter: getComputedStyle(element).paddingLeft,
  120 |     viewport: document.documentElement.clientWidth,
  121 |     content: document.documentElement.scrollWidth,
  122 |   }))
  123 |   expect(geometry.gutter).toBe('30px')
  124 |   expect(geometry.content).toBeLessThanOrEqual(geometry.viewport)
  125 |   await capture(page, 'settings-profile-mobile-light.png')
  126 | })
  127 | 
  128 | test('Connectivity backend unavailable desktop', async ({ page }) => {
  129 |   await page.clock.install({ time: new Date(now) })
  130 |   await page.setViewportSize({ width: 1440, height: 900 })
  131 |   await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  132 |   await installApi(page, true)
  133 |   await page.goto('/?visual=connectivity#/app')
  134 |   await expect(page.getByRole('heading', { name: '暂时无法连接 Eotion' })).toBeVisible()
  135 |   await expect(page.getByText('无法验证登录状态，请检查服务或网络后重试')).toBeVisible()
  136 |   await capture(page, 'connectivity-backend-unavailable-desktop.png')
  137 | })
  138 | 
```