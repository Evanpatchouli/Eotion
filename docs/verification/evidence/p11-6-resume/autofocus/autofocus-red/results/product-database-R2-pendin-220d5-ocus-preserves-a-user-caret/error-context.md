# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: product-database.spec.ts >> R2 pending initial body focus preserves a user caret
- Location: ..\..\AppData\Local\Temp\eotion-p116-resume-dfbb4269eb4c4a6794279c34f3d9ba5d\autofocus-candidate\focus-regression\product-database.spec.ts:12338:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 8
Received: 0
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e4]:
    - complementary "工作区导航" [ref=e5]:
      - generic [ref=e6]:
        - strong [ref=e8]: Eotion
        - generic [ref=e9]:
          - generic "Database user" [ref=e10]
          - generic "database@example.com" [ref=e11]
        - button "收起侧边栏" [ref=e12] [cursor=pointer]
      - generic [ref=e15]:
        - generic [ref=e16]: 工作区
        - generic [ref=e18]:
          - generic [aria-hidden] [ref=e19]: D
          - generic [ref=e20]: Database workspace
          - button "切换工作区" [ref=e21] [cursor=pointer]
      - generic [ref=e25]:
        - generic [ref=e26]:
          - generic [ref=e27]: 页面
          - button "新建根页面" [ref=e28] [cursor=pointer]
        - tree "页面树" [ref=e31]:
          - treeitem [level=1] [selected] [ref=e32]:
            - generic [ref=e35]:
              - button "展开Database references的子项" [ref=e37] [cursor=pointer]
              - button "Database references" [ref=e40] [cursor=pointer]
              - button "页面操作：Database references" [ref=e43] [cursor=pointer]
      - generic [ref=e46]:
        - button "设置" [ref=e48] [cursor=pointer]
        - button "退出登录" [ref=e52] [cursor=pointer]
    - main [ref=e55]:
      - generic [ref=e56]:
        - generic [ref=e57]: Database workspace / Database references
        - status [ref=e58]: 已同步
      - article [ref=e60]:
        - generic [ref=e61]:
          - paragraph [ref=e62]: Database workspace
          - heading "Database references" [level=1] [ref=e64]
          - region "Tiptap 编辑器" [ref=e65]:
            - button "选择图片附件" [ref=e66]
            - button "选择文件附件" [ref=e67]
            - textbox "页面正文编辑区域" [ref=e69]:
              - generic:
                - button "在数据库区块下方插入区块" [ref=e70] [cursor=pointer]
                - button "拖动区块" [ref=e72]
              - generic "数据库视图" [ref=e80]:
                - generic [ref=e81]:
                  - strong [ref=e86]: Root projects
                  - generic [ref=e87]:
                    - button "切换视图" [ref=e89] [cursor=pointer]:
                      - generic [ref=e90]: 表格视图
                    - button "数据库设置" [ref=e94] [cursor=pointer]
                  - button "新建记录" [ref=e97] [cursor=pointer]
                - region "数据库记录" [ref=e101]:
                  - table [ref=e102]:
                    - rowgroup [ref=e103]:
                      - row [ref=e104]:
                        - columnheader "名称 属性设置 名称" [ref=e105]:
                          - generic [ref=e106]:
                            - generic [ref=e107]: 名称
                            - button "属性设置 名称" [ref=e109] [cursor=pointer]
                        - columnheader "Notes 属性设置 Notes" [ref=e112]:
                          - generic [ref=e113]:
                            - generic [ref=e114]: Notes
                            - button "属性设置 Notes" [ref=e116] [cursor=pointer]
                        - columnheader "Points 属性设置 Points" [ref=e119]:
                          - generic [ref=e120]:
                            - generic [ref=e121]: Points
                            - button "属性设置 Points" [ref=e123] [cursor=pointer]
                        - columnheader "Done 属性设置 Done" [ref=e126]:
                          - generic [ref=e127]:
                            - generic [ref=e128]: Done
                            - button "属性设置 Done" [ref=e130] [cursor=pointer]
                        - columnheader "Status 属性设置 Status" [ref=e133]:
                          - generic [ref=e134]:
                            - generic [ref=e135]: Status
                            - button "属性设置 Status" [ref=e137] [cursor=pointer]
                        - columnheader "Due 属性设置 Due" [ref=e140]:
                          - generic [ref=e141]:
                            - generic [ref=e142]: Due
                            - button "属性设置 Due" [ref=e144] [cursor=pointer]
                    - rowgroup [ref=e147]:
                      - row [ref=e148]:
                        - cell [ref=e149]:
                          - generic [ref=e150]:
                            - button "编辑名称：Identity row" [ref=e151] [cursor=pointer]: Identity row
                            - button "打开记录：Identity row" [ref=e152] [cursor=pointer]
                        - cell [ref=e155]:
                          - button [ref=e156] [cursor=pointer]
                        - cell [ref=e157]:
                          - button [ref=e158] [cursor=pointer]
                        - cell [ref=e159]:
                          - button [ref=e160] [cursor=pointer]
                        - cell [ref=e161]:
                          - button [ref=e162] [cursor=pointer]
                        - cell [ref=e163]:
                          - button "编辑Due：" [ref=e164] [cursor=pointer]
  - complementary "记录" [ref=e165]:
    - generic [ref=e166]:
      - generic [ref=e167]:
        - heading "记录" [level=2] [ref=e168]
        - button "关闭记录" [ref=e169] [cursor=pointer]: ×
      - generic [ref=e171]:
        - paragraph [ref=e172]: Database workspace
        - textbox "记录标题" [ref=e174]: Identity row
        - region "Tiptap 编辑器" [ref=e175]:
          - button "选择图片附件" [ref=e176]
          - button "选择文件附件" [ref=e177]
          - textbox "页面正文编辑区域" [active] [ref=e179]:
            - generic:
              - button "在区块下方插入区块" [ref=e180] [cursor=pointer]
              - button "拖动区块" [ref=e182]
            - paragraph [ref=e190]: Identity body
```

# Test source

```ts
  12257 |   }, item.pageId)
  12258 |   return { api, item, open }
  12259 | }
  12260 | 
  12261 | for (const device of ['desktop', 'phone'] as const) {
  12262 |   test.describe(`R2 record autofocus ownership ${device}`, () => {
  12263 |     test.use({ viewport: device === 'phone' ? { width: 390, height: 844 } : { width: 1440, height: 900 }, hasTouch: device === 'phone', isMobile: device === 'phone', reducedMotion: 'reduce' })
  12264 |     for (const userClaimsTitle of [false, true]) {
  12265 |       test(userClaimsTitle ? 'title focus before body load wins and saves without body pollution' : 'named record body receives initial focus after overlay opening', async ({ page }) => {
  12266 |         const { api, item, open } = await r2AutofocusFixture(page)
  12267 |         await open.click()
  12268 |         const surface = page.locator(device === 'phone' ? 'dialog.eotion-product-overlay--bottom-drawer[open]' : '[data-overlay-mode="drawer"]')
  12269 |         await expect(surface).toBeVisible()
  12270 |         const title = surface.getByRole('textbox', { name: '记录标题' })
  12271 |         const body = surface.locator('.eotion-editor-content .tiptap')
  12272 |         await expect(title).toHaveValue('Identity row')
  12273 |         await expect(body).toHaveCount(0)
  12274 |         if (userClaimsTitle) {
  12275 |           await title.click()
  12276 |           await expect(title).toBeFocused()
  12277 |         }
  12278 |         await page.evaluate(() => (window as any).__r2ReleaseBody())
  12279 |         await expect(body).toHaveText('Identity body')
  12280 |         // Cross a frame boundary so the pending initial focus has actually had its turn.
  12281 |         await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  12282 |         if (userClaimsTitle) {
  12283 |           await expect(title).toBeFocused()
  12284 |           await title.fill('Edited record title')
  12285 |           await title.press('Tab')
  12286 |           await expect.poll(() => api.pages.find(candidate => candidate.id === item.pageId)?.title).toBe('Edited record title')
  12287 |           await expect(body).toHaveText('Identity body')
  12288 |           expect(JSON.stringify(api.blocks.find(candidate => candidate.id === 'r2-focus-body')?.props)).toContain('Identity body')
  12289 |           expect(JSON.stringify(api.blocks.find(candidate => candidate.id === 'r2-focus-body')?.props)).not.toContain('Edited record title')
  12290 |         } else {
  12291 |           await expect(body).toBeFocused()
  12292 |           await expect(title).toHaveValue('Identity row')
  12293 |           expect(api.pages.find(candidate => candidate.id === item.pageId)?.title).toBe('Identity row')
  12294 |         }
  12295 |       })
  12296 |     }
  12297 |   })
  12298 | }
  12299 | 
  12300 | async function r2HoldInitialFocusFrames(page: Page): Promise<void> {
  12301 |   await page.evaluate(() => {
  12302 |     const target = window as any
  12303 |     const original = window.requestAnimationFrame.bind(window)
  12304 |     const originalCancel = window.cancelAnimationFrame.bind(window)
  12305 |     const callbacks: Array<{ id: number; callback: FrameRequestCallback; cancelled: boolean }> = []
  12306 |     let id = 1000000
  12307 |     window.requestAnimationFrame = callback => {
  12308 |       callbacks.push({ id: ++id, callback, cancelled: false })
  12309 |       return id
  12310 |     }
  12311 |     window.cancelAnimationFrame = frame => {
  12312 |       const captured = callbacks.find(entry => entry.id === frame)
  12313 |       if (captured) captured.cancelled = true
  12314 |       else originalCancel(frame)
  12315 |     }
  12316 |     target.__r2CapturedFocusFrames = callbacks
  12317 |     target.__r2FlushFocusFrames = () => {
  12318 |       window.requestAnimationFrame = original
  12319 |       window.cancelAnimationFrame = originalCancel
  12320 |       // Invoke cancelled entries too: cancellation alone must not allow a stale callback to act.
  12321 |       for (const entry of callbacks) entry.callback(performance.now())
  12322 |     }
  12323 |     target.__r2ReleaseBody()
  12324 |   })
  12325 | }
  12326 | 
  12327 | async function r2ExpectPendingInitialFocus(page: Page, body: Locator): Promise<void> {
  12328 |   await expect(body).toHaveText('Identity body')
  12329 |   await expect.poll(() => body.evaluate(element => {
  12330 |     let component = (element.closest('.eotion-editor') as (HTMLElement & { __vueParentComponent?: any }) | null)?.__vueParentComponent
  12331 |     while (component && component.type?.__name !== 'EotionEditor') component = component.parent
  12332 |     const exposed = component?.exposed?.editor ?? component?.setupState?.editor
  12333 |     const current = exposed?.commands ? exposed : exposed?.value
  12334 |     return Boolean(current?.isInitialized && (window as any).__r2CapturedFocusFrames.length > 0)
  12335 |   })).toBe(true)
  12336 | }
  12337 | 
  12338 | test('R2 pending initial body focus preserves a user caret', async ({ page }) => {
  12339 |   await page.setViewportSize({ width: 1440, height: 900 })
  12340 |   await page.emulateMedia({ reducedMotion: 'reduce' })
  12341 |   const { open } = await r2AutofocusFixture(page)
  12342 |   await open.click()
  12343 |   const surface = page.locator('[data-overlay-mode="drawer"]')
  12344 |   await expect(surface).toBeVisible()
  12345 |   await r2HoldInitialFocusFrames(page)
  12346 |   const body = surface.locator('.eotion-editor-content .tiptap')
  12347 |   await r2ExpectPendingInitialFocus(page, body)
  12348 |   await body.evaluate(element => {
  12349 |     element.focus()
  12350 |     const selection = window.getSelection()!
  12351 |     const text = element.querySelector('p')!.firstChild!
  12352 |     selection.setPosition(text, 8)
  12353 |   })
  12354 |   await page.evaluate(() => (window as any).__r2FlushFocusFrames())
  12355 |   await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  12356 |   await expect(body).toBeFocused()
> 12357 |   expect(await body.evaluate(() => window.getSelection()?.anchorOffset)).toBe(8)
        |                                                                          ^ Error: expect(received).toBe(expected) // Object.is equality
  12358 | })
  12359 | 
  12360 | test('R2 closing a record cancels the pending initial body focus callback', async ({ page }) => {
  12361 |   await page.setViewportSize({ width: 1440, height: 900 })
  12362 |   await page.emulateMedia({ reducedMotion: 'reduce' })
  12363 |   const { open } = await r2AutofocusFixture(page)
  12364 |   await open.click()
  12365 |   const surface = page.locator('[data-overlay-mode="drawer"]')
  12366 |   await expect(surface).toBeVisible()
  12367 |   await r2HoldInitialFocusFrames(page)
  12368 |   await r2ExpectPendingInitialFocus(page, surface.locator('.eotion-editor-content .tiptap'))
  12369 |   await page.getByRole('button', { name: '关闭记录' }).click()
  12370 |   await expect(surface).toHaveCount(0)
  12371 |   await expect(open).toBeFocused()
  12372 |   await page.evaluate(() => (window as any).__r2FlushFocusFrames())
  12373 |   await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  12374 |   await expect(open).toBeFocused()
  12375 | })
  12376 | 
  12377 | test('R2 renaming an unnamed record before body load retains the user focus and keeps body unchanged', async ({ page }) => {
  12378 |   await page.setViewportSize({ width: 1440, height: 900 })
  12379 |   await page.emulateMedia({ reducedMotion: 'reduce' })
  12380 |   const { api, item, open } = await r2AutofocusFixture(page, '无标题')
  12381 |   await open.click()
  12382 |   const surface = page.locator('[data-overlay-mode="drawer"]')
  12383 |   await expect(surface).toBeVisible()
  12384 |   const title = surface.getByRole('textbox', { name: '记录标题' })
  12385 |   const body = surface.locator('.eotion-editor-content .tiptap')
  12386 |   await expect(title).toHaveValue('无标题')
  12387 |   await expect(body).toHaveCount(0)
  12388 |   await title.fill('Edited record title')
  12389 |   await title.press('Tab')
  12390 |   await expect.poll(() => api.pages.find(candidate => candidate.id === item.pageId)?.title).toBe('Edited record title')
  12391 |   await page.evaluate(() => { (window as any).__r2UntitledFocusOwner = document.activeElement })
  12392 |   await page.evaluate(() => (window as any).__r2ReleaseBody())
  12393 |   await expect(body).toHaveText('Identity body')
  12394 |   await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  12395 |   expect(await page.evaluate(() => document.activeElement === (window as any).__r2UntitledFocusOwner)).toBe(true)
  12396 |   await expect(body).not.toBeFocused()
  12397 |   await title.fill('Renamed record title')
  12398 |   await title.press('Tab')
  12399 |   await expect.poll(() => api.pages.find(candidate => candidate.id === item.pageId)?.title).toBe('Renamed record title')
  12400 |   await expect(body).toHaveText('Identity body')
  12401 |   expect(JSON.stringify(api.blocks.find(candidate => candidate.id === 'r2-focus-body')?.props)).toContain('Identity body')
  12402 |   expect(JSON.stringify(api.blocks.find(candidate => candidate.id === 'r2-focus-body')?.props)).not.toContain('record title')
  12403 | })
  12404 | 
```