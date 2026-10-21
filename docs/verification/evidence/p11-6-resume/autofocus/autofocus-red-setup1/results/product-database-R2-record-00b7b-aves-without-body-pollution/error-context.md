# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: product-database.spec.ts >> R2 record autofocus ownership desktop >> title focus before body load wins and saves without body pollution
- Location: ..\..\AppData\Local\Temp\eotion-p116-resume-dfbb4269eb4c4a6794279c34f3d9ba5d\autofocus-candidate\focus-regression\product-database.spec.ts:12265:11

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: '打开记录：Identity row' })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('button', { name: '打开记录：Identity row' }) with timeout 5000ms
  - waiting for getByRole('button', { name: '打开记录：Identity row' })

```

```yaml
- complementary "工作区导航":
  - strong: Eotion
  - text: Database user database@example.com
  - button "收起侧边栏"
  - text: 工作区 Database workspace
  - button "切换工作区"
  - text: 页面
  - button "新建根页面"
  - tree "页面树":
    - treeitem "Database references 页面操作：Database references" [level=1] [selected]:
      - button "Database references"
      - button "页面操作：Database references"
  - button "设置"
  - button "退出登录"
- main:
  - text: Database workspace / Database references
  - status: 已同步
  - article:
    - paragraph: Database workspace
    - heading "Database references" [level=1]
    - region "Tiptap 编辑器":
      - button "选择图片附件"
      - button "选择文件附件"
      - textbox "页面正文编辑区域":
        - button "在数据库区块下方插入区块"
        - button "拖动区块"
        - strong: 数据库
        - button "切换视图" [disabled]: 表格视图
        - button "数据库设置"
        - button "新建记录"
        - alert:
          - text: Database view not found
          - button "重试加载"
```

# Test source

```ts
  12146 |   await form.getByRole('button', { name: '保存', exact: true }).click()
  12147 |   await expect(form).toHaveCount(0)
  12148 |   expect(p114cBatchPosts(api)).toHaveLength(1)
  12149 |   expect(p114cBatchPosts(api)[0]?.payload).toMatchObject({ context: { viewId: timelineView.id, expectedViewVersion: 1 }, records: [{ recordId: 'p116-empty', expectedRecordVersion: 1, cells: [{ propertyId: 'root-date', value: '2026-10-20' }] }] })
  12150 |   expect(p114bRelationPatch(api, 'root-date')).toHaveLength(0)
  12151 |   // A point has no exclusive end; the frozen planner moves an overlapping child
  12152 |   // to the same date boundary (ranges retain their exclusive endpoint rule).
  12153 |   expect(api.records.find(item => item.id === 'p116-child')?.properties['root-date']).toBe('2026-10-20')
  12154 | })
  12155 | 
  12156 | for (const outcome of ['conflict', 'uncertain', 'refresh-failure'] as const) {
  12157 |   test(`P11.6 arrange ${outcome} never retries or claims batch success`, async ({ page }) => {
  12158 |     const { timeline, api } = await p116ScheduleFixture(page, outcome === 'conflict'
  12159 |       ? { conflictCellBatchMutations: 1 } : { cellBatchMutationOutcome: 'uncertain' }, true)
  12160 |     const form = await p116OpenSchedule(timeline)
  12161 |     await form.getByLabel('安排日期').fill('2026-10-20')
  12162 |     if (outcome === 'refresh-failure') api.failTableLoads = 1
  12163 |     await form.getByRole('button', { name: '保存', exact: true }).click()
  12164 |     const databaseBlock = page.locator('#database-block-p114b-depends-on-block')
  12165 |     const mutationAlert = databaseBlock.locator(':scope > .eotion-database-error').filter({ hasText: outcome === 'conflict' ? /^相关记录已发生变化，已刷新到最新版本。$/u : /^提交结果暂未确认，请重新加载当前视图。$/u })
  12166 |     await expect(mutationAlert).toHaveCount(1)
  12167 |     expect(p114cBatchPosts(api)).toHaveLength(1)
  12168 |     expect(p114bRelationPatch(api, 'root-date')).toHaveLength(0)
  12169 |     expect(api.records.find(item => item.id === 'p116-empty')?.properties['root-date']).toBeNull()
  12170 |   })
  12171 | }
  12172 | 
  12173 | test('P11.6 arrange rejects stale record capture and offline submit, excludes invalid cells', async ({ page }) => {
  12174 |   const { timeline, api } = await p116ScheduleFixture(page)
  12175 |   let form = await p116OpenSchedule(timeline)
  12176 |   await expect(timeline.getByRole('button', { name: '安排：Invalid', exact: true })).toHaveCount(0)
  12177 |   await form.getByLabel('安排日期').fill('2026-10-20')
  12178 |   await page.context().setOffline(true)
  12179 |   await expect(form.getByRole('button', { name: '保存', exact: true })).toBeDisabled()
  12180 |   await page.context().setOffline(false)
  12181 |   await expect(form.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
  12182 |   api.records.find(item => item.id === 'p116-empty')!.version += 1
  12183 |   await p115RefreshLoadedWindow(timeline)
  12184 |   form = timeline.getByTestId('timeline-schedule-form')
  12185 |   await form.getByRole('button', { name: '保存', exact: true }).click()
  12186 |   expect(p114bRelationPatch(api, 'root-date')).toHaveLength(0)
  12187 | })
  12188 | 
  12189 | for (const width of [390, 360]) {
  12190 |   test.describe(`P11.6 arrange ${width}px coarse context`, () => {
  12191 |   test.use({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true })
  12192 |   test(`P11.6 arrange ${width}px touch form stays inside viewport`, async ({ page }) => {
  12193 |     const { timeline, api } = await p116ScheduleFixture(page)
  12194 |     await page.setViewportSize({ width, height: 844 })
  12195 |     await page.emulateMedia({ reducedMotion: 'reduce' })
  12196 |     expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
  12197 |     const form = await p116OpenSchedule(timeline)
  12198 |     await form.getByLabel('安排日期').fill('2026-10-20')
  12199 |     for (const control of await form.locator('input, button').all()) {
  12200 |       const bounds = await control.boundingBox()
  12201 |       expect(bounds).not.toBeNull()
  12202 |       expect(bounds!.x).toBeGreaterThanOrEqual(0)
  12203 |       expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
  12204 |       expect(bounds!.height).toBeGreaterThanOrEqual(44)
  12205 |     }
  12206 |     await form.getByRole('button', { name: '取消', exact: true }).tap()
  12207 |     expect(p114bRelationPatch(api, 'root-date')).toHaveLength(0)
  12208 |   })
  12209 |   })
  12210 | }
  12211 | 
  12212 | test('P11.6 arrange configuration and view scope invalidate the captured form; Separate remains read only', async ({ page }) => {
  12213 |   const { timeline, timelineView, api } = await p116ScheduleFixture(page)
  12214 |   let form = await p116OpenSchedule(timeline)
  12215 |   await form.getByLabel('安排日期').fill('2026-10-20')
  12216 |   const canonicalView = api.views.find(item => item.id === timelineView.id)!
  12217 |   const originalConfig = canonicalView.config
  12218 |   canonicalView.config = { ...canonicalView.config, options: { timeline: { scale: 'week', dateSource: { mode: 'start-end', startPropertyId: 'root-date', endPropertyId: 'root-date' } } } }
  12219 |   canonicalView.version += 1
  12220 |   await p115RefreshLoadedWindow(timeline)
  12221 |   await expect(form).toHaveCount(0)
  12222 |   await expect(timeline.getByRole('button', { name: /^安排：/u })).toHaveCount(0)
  12223 |   canonicalView.config = originalConfig
  12224 |   canonicalView.version += 1
  12225 |   await p115RefreshLoadedWindow(timeline)
  12226 |   form = await p116OpenSchedule(timeline)
  12227 |   const databaseBlock = page.locator('#database-block-p114b-depends-on-block')
  12228 |   await databaseBlock.getByRole('button', { name: '切换视图' }).click()
  12229 |   await page.getByRole('group', { name: '数据库视图', exact: true }).getByRole('button', { name: 'Fallback table', exact: true }).click()
  12230 |   await expect(form).toHaveCount(0)
  12231 |   expect(p114bRelationPatch(api, 'root-date')).toHaveLength(0)
  12232 |   expect(p114cBatchPosts(api)).toHaveLength(0)
  12233 | })
  12234 | 
  12235 | 
  12236 | // R2 focus ownership: hold local body loading without changing the original identity case.
  12237 | async function r2AutofocusFixture(page: Page, initialTitle = 'Identity row') {
  12238 |   const item = record('r2-focus-record', rootDatabase.id, 'r2-focus-page', { 'root-title': initialTitle })
  12239 |   const api = await installApi(page, [block('r2-focus-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100)], { records: [item] })
  12240 |   api.pages.push({ ...pageRecord, id: item.pageId, title: initialTitle, role: 'database-record' })
  12241 |   const body = block('r2-focus-body', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'Identity body' }] }, 100)
  12242 |   body.pageId = item.pageId
  12243 |   api.blocks.push(body)
  12244 |   await page.goto('/#/app/database-workspace/page/database-page')
  12245 |   const open = page.getByRole('button', { name: `打开记录：${initialTitle}` })
> 12246 |   await expect(open).toBeVisible()
        |                      ^ Error: expect(locator).toBeVisible() failed
  12247 |   await page.evaluate(async pageId => {
  12248 |     const { PagePersistence } = await import('/src/editor/pagePersistence.ts')
  12249 |     const original = PagePersistence.prototype.load
  12250 |     let release!: () => void
  12251 |     const gate = new Promise<void>(resolve => { release = resolve })
  12252 |     ;(window as any).__r2ReleaseBody = release
  12253 |     PagePersistence.prototype.load = async function(signal?: AbortSignal) {
  12254 |       if ((this as unknown as { pageId: string }).pageId === pageId) await gate
  12255 |       return original.call(this, signal)
  12256 |     }
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
```