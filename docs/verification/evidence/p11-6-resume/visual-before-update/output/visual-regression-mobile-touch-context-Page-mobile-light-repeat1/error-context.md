# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: visual-regression.spec.ts >> mobile touch context >> Page mobile light
- Location: tests\visual-regression.spec.ts:101:3

# Error details

```
Error: expect(page).toHaveScreenshot(expected) failed

  1175 pixels (ratio 0.01 of all image pixels) are different.

  Snapshot: page-mobile-light.png

Call log:
  - Expect "toHaveScreenshot(page-mobile-light.png)" with timeout 5000ms
    - verifying given screenshot expectation
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - 1175 pixels (ratio 0.01 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - captured a stable screenshot
  - 1175 pixels (ratio 0.01 of all image pixels) are different.

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - complementary [aria-hidden] [ref=e5]:
    - generic [ref=e6]:
      - strong [ref=e8]: Eotion
      - generic [ref=e9]:
        - generic [ref=e10]: Ava
        - generic [ref=e11]: ava@example.com
      - button [ref=e12] [cursor=pointer]
    - generic [ref=e15]:
      - generic [ref=e16]: 工作区
      - generic [ref=e18]:
        - generic [aria-hidden] [ref=e19]: Q
        - generic [ref=e20]: Quiet Studio
        - button [ref=e21] [cursor=pointer]
    - generic [ref=e25]:
      - generic [ref=e26]:
        - generic [ref=e27]: 页面
        - button [ref=e28] [cursor=pointer]
      - tree [ref=e31]:
        - treeitem [level=1] [selected] [ref=e32]:
          - generic [ref=e35]:
            - button [ref=e36] [cursor=pointer]:
              - generic [ref=e40]: 今日记录
            - button [ref=e42] [cursor=pointer]
    - generic [ref=e45]:
      - button [ref=e47] [cursor=pointer]: 设置
      - button [ref=e51] [cursor=pointer]: 退出登录
  - main [ref=e54]:
    - generic [ref=e55]:
      - button "打开导航菜单" [ref=e56] [cursor=pointer]
      - generic [ref=e59]: Quiet Studio / 今日记录
      - status [ref=e60]: 已同步
    - article [ref=e62]:
      - generic [ref=e63]:
        - paragraph [ref=e64]: Quiet Studio
        - heading "今日记录" [level=1] [ref=e66]
        - region "Tiptap 编辑器" [ref=e67]:
          - button "选择图片附件" [ref=e68]
          - button "选择文件附件" [ref=e69]
          - textbox "页面正文编辑区域" [ref=e71]:
            - heading "留一处安静的空间" [level=2] [ref=e72]
            - paragraph [ref=e73]: 记录今天值得记住的事情。固定内容让每次截图都能直接比较。
          - toolbar "触摸编辑工具栏" [ref=e74]:
            - button "粗体" [ref=e75] [cursor=pointer]
            - button "斜体" [ref=e78] [cursor=pointer]
            - button "文本" [ref=e81] [cursor=pointer]
            - button "二级标题（H2）" [pressed] [ref=e85] [cursor=pointer]:
              - subscript [ref=e89]: "2"
              - generic [ref=e90]: 标题
            - button "列表" [ref=e91] [cursor=pointer]
            - button "缩进区块" [disabled] [ref=e95]: ⇥
            - button "取消缩进区块" [disabled] [ref=e96]: ⇤
            - button "插入图片" [ref=e97] [cursor=pointer]
            - button "插入文件" [ref=e100] [cursor=pointer]
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