# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: product-database.spec.ts >> board renderer groups generic records by option IDs with projected titles and configured properties
- Location: tests\product-database.spec.ts:6322:1

# Error details

```
Error: expect(received).toBeGreaterThanOrEqual(expected)

Expected: >= 1136
Received:    853
```

# Page snapshot

```yaml
- generic [ref=e4]:
  - complementary [aria-hidden] [ref=e5]:
    - generic [ref=e6]:
      - strong [ref=e8]: Eotion
      - generic [ref=e9]:
        - generic [ref=e10]: Database user
        - generic [ref=e11]: database@example.com
      - button [ref=e12] [cursor=pointer]
    - generic [ref=e15]:
      - generic [ref=e16]: 工作区
      - generic [ref=e18]:
        - generic [aria-hidden] [ref=e19]: D
        - generic [ref=e20]: Database workspace
        - button [ref=e21] [cursor=pointer]
    - generic [ref=e25]:
      - generic [ref=e26]:
        - generic [ref=e27]: 页面
        - button [ref=e28] [cursor=pointer]
      - tree [ref=e31]:
        - treeitem [level=1] [selected] [ref=e32]:
          - generic [ref=e35]:
            - button [ref=e37] [cursor=pointer]
            - button [ref=e40] [cursor=pointer]:
              - generic [ref=e41]: Database references
            - button [ref=e43] [cursor=pointer]
    - generic [ref=e46]:
      - button [ref=e48] [cursor=pointer]: 设置
      - button [ref=e52] [cursor=pointer]: 退出登录
  - main [ref=e55]:
    - generic [ref=e56]:
      - button "打开导航菜单" [ref=e57] [cursor=pointer]
      - generic [ref=e60]: Database workspace / Database references
      - status [ref=e61]: 已同步
    - article [ref=e63]:
      - generic [ref=e64]:
        - paragraph [ref=e65]: Database workspace
        - heading "Database references" [level=1] [ref=e67]
        - region "Tiptap 编辑器" [ref=e68]:
          - button "选择图片附件" [ref=e69]
          - button "选择文件附件" [ref=e70]
          - textbox "页面正文编辑区域" [ref=e72]:
            - generic "数据库视图" [ref=e73]:
              - generic [ref=e74]:
                - strong [ref=e76]: Root projects
                - generic [ref=e77]:
                  - button "切换视图" [ref=e79] [cursor=pointer]:
                    - generic [ref=e80]: Board
                  - button "数据库设置" [ref=e84] [cursor=pointer]
                - button "新建记录" [ref=e87] [cursor=pointer]
              - generic [ref=e91]:
                - region "Todo" [ref=e92]:
                  - heading "Todo 2" [level=3] [ref=e93]:
                    - generic [ref=e94]: Todo
                    - generic [ref=e95]: "2"
                  - article [ref=e96]:
                    - button "打开记录：Projected board-b" [ref=e97] [cursor=pointer]: Projected board-b
                    - button "移动记录分组" [ref=e100] [cursor=pointer]:
                      - generic [ref=e101]: Todo
                    - generic [ref=e104]:
                      - generic [ref=e105]:
                        - term [ref=e106]: Notes
                        - definition [ref=e107]: Second
                      - generic [ref=e108]:
                        - term [ref=e109]: Points
                        - definition [ref=e110]: "40"
                  - article [ref=e111]:
                    - button "打开记录：Projected board-a" [ref=e112] [cursor=pointer]: Projected board-a
                    - button "移动记录分组" [ref=e115] [cursor=pointer]:
                      - generic [ref=e116]: Todo
                    - generic [ref=e119]:
                      - generic [ref=e120]:
                        - term [ref=e121]: Notes
                        - definition [ref=e122]: First
                      - generic [ref=e123]:
                        - term [ref=e124]: Points
                        - definition [ref=e125]: "20"
                - region "Doing" [ref=e126]:
                  - heading "Doing 1" [level=3] [ref=e127]:
                    - generic [ref=e128]: Doing
                    - generic [ref=e129]: "1"
                  - article [ref=e130]:
                    - button "打开记录：Projected board-c" [ref=e131] [cursor=pointer]: Projected board-c
                    - button "移动记录分组" [ref=e134] [cursor=pointer]:
                      - generic [ref=e135]: Doing
                    - generic [ref=e138]:
                      - generic [ref=e139]:
                        - term [ref=e140]: Notes
                        - definition [ref=e141]: —
                      - generic [ref=e142]:
                        - term [ref=e143]: Points
                        - definition [ref=e144]: "30"
                - region "Done" [ref=e145]:
                  - heading "Done 0" [level=3] [ref=e146]:
                    - generic [ref=e147]: Done
                    - generic [ref=e148]: "0"
                - region "未分组" [ref=e149]:
                  - heading "未分组 2" [level=3] [ref=e150]:
                    - generic [ref=e151]: 未分组
                    - generic [ref=e152]: "2"
                  - article [ref=e153]:
                    - button "打开记录：Projected board-e" [ref=e154] [cursor=pointer]: Projected board-e
                    - button "移动记录分组" [ref=e157] [cursor=pointer]:
                      - generic [ref=e158]: 未分组
                    - generic [ref=e161]:
                      - generic [ref=e162]:
                        - term [ref=e163]: Notes
                        - definition [ref=e164]: —
                      - generic [ref=e165]:
                        - term [ref=e166]: Points
                        - definition [ref=e167]: "16"
                  - article [ref=e168]:
                    - button "打开记录：Projected board-d" [ref=e169] [cursor=pointer]: Projected board-d
                    - button "移动记录分组" [ref=e172] [cursor=pointer]:
                      - generic [ref=e173]: 未分组
                    - generic [ref=e176]:
                      - generic [ref=e177]:
                        - term [ref=e178]: Notes
                        - definition [ref=e179]: —
                      - generic [ref=e180]:
                        - term [ref=e181]: Points
                        - definition [ref=e182]: "15"
            - paragraph [ref=e183]
          - toolbar "触摸编辑工具栏" [ref=e184]:
            - button "粗体" [ref=e185] [cursor=pointer]
            - button "斜体" [ref=e188] [cursor=pointer]
            - button "文本" [ref=e191] [cursor=pointer]
            - button "二级标题（H2）" [ref=e195] [cursor=pointer]:
              - subscript [ref=e199]: "2"
              - generic [ref=e200]: 标题
            - button "列表" [ref=e201] [cursor=pointer]
            - button "缩进区块" [disabled] [ref=e205]: ⇥
            - button "取消缩进区块" [disabled] [ref=e206]: ⇤
            - button "插入图片" [ref=e207] [cursor=pointer]
            - button "插入文件" [ref=e210] [cursor=pointer]
```

# Test source

```ts
  6276 |   await expect.poll(() => api.views[0]!.config.sorts).toEqual([{ propertyId: 'root-number', direction: 'desc' }])
  6277 |   await expect(sortPanel).toHaveCount(0)
  6278 |   await expect(mobileDialog).toHaveCount(0)
  6279 | 
  6280 |   await openDatabaseSetting(page, table, '排序')
  6281 |   await expect(sortPanel.getByRole('button', { name: '排序属性 1' })).toHaveAttribute('data-value', 'root-number')
  6282 |   await expect(sortPanel.getByRole('button', { name: '排序方向 1' })).toHaveAttribute('data-value', 'desc')
  6283 |   await page.keyboard.press('Escape')
  6284 |   await expect(sortPanel).toHaveCount(0)
  6285 |   await expect(mobileDialog).toHaveCount(0)
  6286 | })
  6287 | 
  6288 | test('filter and sort setting menus are keyboard operable and disable unsupported properties', async ({ page }) => {
  6289 |   const relation = { ...property('unsupported-relation', rootDatabase.id, 'Related', 'relation'), config: { targetDatabaseId: rootDatabase.id } }
  6290 |   const formula = { ...property('unsupported-formula', rootDatabase.id, 'Calculated', 'formula'), config: { expression: { kind: 'literal', value: 1 }, resultType: 'number' } } as TestProperty
  6291 |   await installApi(page, [
  6292 |     block('settings-select-accessibility', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  6293 |   ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: [...rootProperties, relation, formula], records: [basicRecord] })
  6294 |   await page.goto('/#/app/database-workspace/page/database-page')
  6295 |   const table = page.locator('.eotion-editor-content .eotion-database')
  6296 | 
  6297 |   await openDatabaseSetting(page, table, '筛选')
  6298 |   const filters = page.getByRole('group', { name: '筛选条件' })
  6299 |   await filters.getByRole('button', { name: '添加筛选条件' }).click()
  6300 |   await expect(filters.locator('select')).toHaveCount(0)
  6301 |   const filterProperty = filters.getByRole('button', { name: '筛选属性 1' })
  6302 |   await filterProperty.press('ArrowDown')
  6303 |   const filterMenu = page.getByRole('menu', { name: '筛选属性 1' })
  6304 |   await expect(filterMenu).toBeVisible()
  6305 |   await expect(filterMenu.getByRole('menuitem').first()).toBeFocused()
  6306 |   await expect(filterMenu.getByRole('menuitem', { name: 'Calculated（暂不支持筛选）' })).toBeDisabled()
  6307 |   await page.keyboard.press('Escape')
  6308 |   await page.keyboard.press('Escape')
  6309 | 
  6310 |   await openDatabaseSetting(page, table, '排序')
  6311 |   const sorts = page.getByRole('group', { name: '排序条件' })
  6312 |   await sorts.getByRole('button', { name: '添加排序' }).click()
  6313 |   await expect(sorts.locator('select')).toHaveCount(0)
  6314 |   const sortProperty = sorts.getByRole('button', { name: '排序属性 1' })
  6315 |   await sortProperty.press('ArrowDown')
  6316 |   const sortMenu = page.getByRole('menu', { name: '排序属性 1' })
  6317 |   await expect(sortMenu).toBeVisible()
  6318 |   await expect(sortMenu.getByRole('menuitem').first()).toBeFocused()
  6319 |   await expect(sortMenu.getByRole('menuitem', { name: 'Related（暂不支持排序）' })).toBeDisabled()
  6320 | })
  6321 | 
  6322 | test('board renderer groups generic records by option IDs with projected titles and configured properties', async ({ page }) => {
  6323 |   const boardConfig: DatabaseViewConfig = {
  6324 |     ...DEFAULT_DATABASE_VIEW_CONFIG,
  6325 |     filters: [{ propertyId: 'root-number', operator: 'gte', value: 10 }],
  6326 |     sorts: [{ propertyId: 'root-number', direction: 'desc' }],
  6327 |     visibleProperties: ['root-title', 'root-number', 'root-text'],
  6328 |     propertyOrder: ['root-text', 'root-number', 'root-title'],
  6329 |     options: { groupByPropertyId: 'root-select' },
  6330 |   }
  6331 |   const boardView = view('board-view', rootDatabase.id, 'Board', boardConfig, 'board')
  6332 |   const status = property('root-select', rootDatabase.id, 'Status', 'select', [
  6333 |     { id: 'todo', name: 'Todo' }, { id: 'doing', name: 'Doing' }, { id: 'unassigned', name: 'Done' },
  6334 |   ])
  6335 |   const records = [
  6336 |     record('board-a', rootDatabase.id, 'page-a', { 'root-title': 'Stale copy', 'root-select': 'todo', 'root-number': 20, 'root-text': 'First' }),
  6337 |     record('board-b', rootDatabase.id, 'page-b', { 'root-select': 'todo', 'root-number': 40, 'root-text': 'Second' }),
  6338 |     record('board-c', rootDatabase.id, 'page-c', { 'root-select': 'doing', 'root-number': 30 }),
  6339 |     record('board-d', rootDatabase.id, 'page-d', { 'root-number': 15 }),
  6340 |     record('board-e', rootDatabase.id, 'page-e', { 'root-select': null, 'root-number': 16 }),
  6341 |     record('board-filtered', rootDatabase.id, 'page-filtered', { 'root-select': 'unassigned', 'root-number': 1 }),
  6342 |   ]
  6343 |   const api = await installApi(page, [
  6344 |     block('board-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: boardView.id } }, 100),
  6345 |   ], { databases: [rootDatabase], views: [boardView], properties: rootProperties.map(item => item.id === status.id ? status : item), records })
  6346 |   for (const [index, item] of records.entries()) api.pages.push({ ...pageRecord, id: item.pageId, title: `Projected ${item.id}`, orderKey: String(index + 2).padStart(16, '0'), role: 'database-record' })
  6347 |   const original = structuredClone({ records: api.records, properties: api.properties, views: api.views })
  6348 |   await page.goto('/#/app/database-workspace/page/database-page')
  6349 |   const board = page.getByTestId('database-board')
  6350 |   await expect(board).toBeVisible()
  6351 |   await expect(board.locator('.eotion-database-board-column-name')).toHaveText(['Todo', 'Doing', 'Done', '未分组'])
  6352 |   const todo = board.locator('[data-option-id="todo"]')
  6353 |   await expect(todo.locator('.eotion-database-board-card')).toHaveCount(2)
  6354 |   expect(await todo.locator('.eotion-database-board-card').evaluateAll(elements => elements.map(element => element.getAttribute('data-record-id')))).toEqual(['board-b', 'board-a'])
  6355 |   await expect(board.locator('[data-option-id="doing"] .eotion-database-board-card')).toHaveAttribute('data-record-id', 'board-c')
  6356 |   await expect(board.locator('[data-option-id="unassigned"] .eotion-database-board-card')).toHaveCount(0)
  6357 |   expect(await board.locator('[data-option-id=""] .eotion-database-board-card').evaluateAll(elements => elements.map(element => element.getAttribute('data-record-id')))).toEqual(['board-e', 'board-d'])
  6358 |   const card = board.locator('[data-record-id="board-a"]')
  6359 |   await expect(card.getByRole('button', { name: '打开记录：Projected board-a' })).toBeVisible()
  6360 |   await expect(card).toHaveAttribute('draggable', 'true')
  6361 |   await expect(card.locator('dt')).toHaveText(['Notes', 'Points'])
  6362 |   await expect(card.locator('dd')).toHaveText(['First', '20'])
  6363 |   await expect(board.getByText('Stale copy', { exact: true })).toHaveCount(0)
  6364 |   await expect(board.locator('input, [contenteditable="true"]')).toHaveCount(0)
  6365 |   expect(api.requests.some(item => item.method === 'GET' && item.path.endsWith(`/views/${boardView.id}/table`))).toBe(true)
  6366 |   expect({ records: api.records, properties: api.properties, views: api.views }).toEqual(original)
  6367 | 
  6368 |   for (const viewport of [{ width: 834, height: 1112 }, { width: 390, height: 844 }]) {
  6369 |     await page.setViewportSize(viewport)
  6370 |     expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  6371 |     const columns = board.locator('.eotion-database-board-column')
  6372 |     const first = await columns.nth(0).boundingBox()
  6373 |     const second = await columns.nth(1).boundingBox()
  6374 |     expect(first && second).toBeTruthy()
  6375 |     if (viewport.width === 390) {
> 6376 |       expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height)
       |                         ^ Error: expect(received).toBeGreaterThanOrEqual(expected)
  6377 |       expect(await board.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  6378 |     } else expect(second!.x).toBeGreaterThan(first!.x)
  6379 |   }
  6380 |   await card.getByRole('button', { name: '打开记录：Projected board-a' }).click()
  6381 |   await expect(page.getByRole('button', { name: '关闭记录' })).toBeVisible()
  6382 |   expect(api.requests.filter(item => ['POST', 'PATCH', 'DELETE'].includes(item.method) && item.path.includes('/databases/'))).toHaveLength(0)
  6383 | })
  6384 | 
  6385 | test('board renderer switches with Table and List without replacing editor or record drawer drafts', async ({ page }) => {
  6386 |   await page.setViewportSize({ width: 1440, height: 1000 })
  6387 |   const boardView = view('board-lifecycle-view', rootDatabase.id, 'Board', { ...DEFAULT_DATABASE_VIEW_CONFIG, options: { groupByPropertyId: 'root-select' } }, 'board')
  6388 |   const listView = view('board-list-view', rootDatabase.id, 'List', { ...DEFAULT_DATABASE_VIEW_CONFIG }, 'list')
  6389 |   const timelineView = view('board-timeline-view', rootDatabase.id, 'Timeline', {
  6390 |     ...DEFAULT_DATABASE_VIEW_CONFIG,
  6391 |     options: { timeline: { frozenTable: { visible: true, visibleProperties: ['root-title'], propertyOrder: ['root-title'] } } },
  6392 |   }, 'timeline')
  6393 |   const api = await installApi(page, [
  6394 |     block('board-lifecycle', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: boardView.id } }, 100),
  6395 |   ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id), listView, boardView, timelineView], properties: rootProperties, records: [basicRecord] })
  6396 |   api.pages.push({ ...pageRecord, id: basicRecord.pageId, title: 'Board record', orderKey: '0000000000000002', role: 'database-record' })
  6397 |   await page.goto('/#/app/database-workspace/page/database-page')
  6398 |   const database = page.locator('#database-block-board-lifecycle')
  6399 |   await expect(database.getByTestId('database-board')).toBeVisible()
  6400 |   await expect(database.locator('.eotion-database-board-card dt')).toHaveText(['Notes', 'Points', 'Done', 'Status', 'Due'])
  6401 |   await page.locator('.eotion-editor-content').first().evaluate(element => element.setAttribute('data-board-lifecycle', 'stable'))
  6402 |   await database.evaluate(element => element.setAttribute('data-board-lifecycle', 'stable'))
  6403 |   await database.getByRole('button', { name: '打开记录：Board record' }).click()
  6404 |   const drawer = page.locator('[data-overlay-mode="drawer"]')
  6405 |   await expect(drawer).toBeVisible()
  6406 |   await drawer.evaluate(element => element.setAttribute('data-board-lifecycle', 'stable'))
  6407 |   const title = drawer.getByRole('textbox', { name: '记录标题' })
  6408 |   const body = drawer.locator('.eotion-editor-content .tiptap')
  6409 |   await title.fill('Board draft survives')
  6410 |   await body.fill('Timeline view switch body draft')
  6411 |   await page.evaluate(() => {
  6412 |     const editor = document.querySelector('.eotion-editor')
  6413 |     const database = document.querySelector('#database-block-board-lifecycle')
  6414 |     const drawer = document.querySelector('[data-overlay-mode="drawer"]')
  6415 |     if (!editor || !database || !drawer) throw new Error('Expected editor, database NodeView, and record drawer')
  6416 |     ;(window as Window & { __boardLifecycleIdentity?: { editor: Element; database: Element; drawer: Element; editorComponent: unknown; databaseComponent: unknown } }).__boardLifecycleIdentity = {
  6417 |       editor, database, drawer,
  6418 |       editorComponent: (editor as Element & { __vueParentComponent?: unknown }).__vueParentComponent,
  6419 |       databaseComponent: (database as Element & { __vueParentComponent?: unknown }).__vueParentComponent,
  6420 |     }
  6421 |   })
  6422 |   for (const [name, renderer] of [['表格视图', 'table'], ['List', '[data-testid="database-list"]'], ['Timeline', 'timeline'], ['Board', '[data-testid="database-board"]']] as const) {
  6423 |     await database.getByRole('button', { name: '切换视图' }).focus()
  6424 |     await database.getByRole('button', { name: '切换视图' }).press('Enter')
  6425 |     await page.getByRole('group', { name: '数据库视图', exact: true }).getByRole('button', { name, exact: true }).click()
  6426 |     if (renderer === 'timeline') {
  6427 |       await expect(database.getByTestId('database-timeline')).toBeVisible()
  6428 |       await expect(database.getByTestId('timeline-frozen-table')).toBeVisible()
  6429 |       await expect(database.locator('table, [data-testid="database-list"], [data-testid="database-board"]')).toHaveCount(0)
  6430 |     } else await expect(database.locator(renderer)).toBeVisible()
  6431 |     await expect(database).toHaveAttribute('data-board-lifecycle', 'stable')
  6432 |     await expect(page.locator('.eotion-editor-content').first()).toHaveAttribute('data-board-lifecycle', 'stable')
  6433 |     await expect(drawer).toHaveAttribute('data-board-lifecycle', 'stable')
  6434 |     await expect(title).toHaveValue('Board draft survives')
  6435 |     await expect(body).toContainText('Timeline view switch body draft')
  6436 |     await expect.poll(() => page.evaluate(() => {
  6437 |       const before = (window as Window & { __boardLifecycleIdentity?: { editor: Element; database: Element; drawer: Element; editorComponent: unknown; databaseComponent: unknown } }).__boardLifecycleIdentity!
  6438 |       const editor = document.querySelector('.eotion-editor') as (Element & { __vueParentComponent?: unknown }) | null
  6439 |       const database = document.querySelector('#database-block-board-lifecycle') as (Element & { __vueParentComponent?: unknown }) | null
  6440 |       return {
  6441 |         editorSame: editor === before.editor,
  6442 |         databaseSame: database === before.database,
  6443 |         drawerSame: document.querySelector('[data-overlay-mode="drawer"]') === before.drawer,
  6444 |         editorComponentSame: editor?.__vueParentComponent === before.editorComponent,
  6445 |         databaseComponentSame: database?.__vueParentComponent === before.databaseComponent,
  6446 |       }
  6447 |     })).toEqual({ editorSame: true, databaseSame: true, drawerSame: true, editorComponentSame: true, databaseComponentSame: true })
  6448 |   }
  6449 |   await expect.poll(() => ((api.blocks.find(item => item.id === 'board-lifecycle')?.props as { node?: { attrs?: { viewId?: string } } })?.node?.attrs?.viewId)).toBe(boardView.id)
  6450 |   expect(api.blocks.filter(item => item.type === 'database')).toHaveLength(1)
  6451 | })
  6452 | 
  6453 | test('board renderer handles missing grouping and empty select options without table fallback', async ({ page }) => {
  6454 |   const unconfigured = view('board-unconfigured', rootDatabase.id, 'Unconfigured', { ...DEFAULT_DATABASE_VIEW_CONFIG }, 'board')
  6455 |   const empty = view('board-empty', rootDatabase.id, 'Empty', { ...DEFAULT_DATABASE_VIEW_CONFIG, options: { groupByPropertyId: 'root-select' } }, 'board')
  6456 |   await installApi(page, [
  6457 |     block('board-unconfigured-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: unconfigured.id } }, 100),
  6458 |     block('board-empty-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: empty.id } }, 200),
  6459 |   ], { databases: [rootDatabase], views: [unconfigured, empty], properties: rootProperties.map(item => item.id === 'root-select' ? { ...item, options: [] } : item), records: [] })
  6460 |   await page.goto('/#/app/database-workspace/page/database-page')
  6461 |   await expect(page.getByTestId('database-board')).toHaveCount(2)
  6462 |   await expect(page.locator('#database-block-board-unconfigured-block')).toContainText('尚未配置分组属性')
  6463 |   await expect(page.locator('#database-block-board-empty-block .eotion-database-board-column')).toHaveCount(1)
  6464 |   await expect(page.locator('.eotion-database table')).toHaveCount(0)
  6465 | })
  6466 | 
  6467 | test('Board drag preserves the current column while the cell update is pending', async ({ page }) => {
  6468 |   const boardView = view('board-drag-pending-view', rootDatabase.id, 'Board', {
  6469 |     ...DEFAULT_DATABASE_VIEW_CONFIG,
  6470 |     options: { groupByPropertyId: 'root-select' },
  6471 |   }, 'board')
  6472 |   const api = await installApi(page, [
  6473 |     block('board-drag-pending-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: boardView.id } }, 100),
  6474 |   ], { databases: [rootDatabase], views: [boardView], properties: rootProperties, records: [basicRecord] })
  6475 |   api.pages.push({ ...pageRecord, id: basicRecord.pageId, title: 'Launch plan', role: 'database-record' })
  6476 |   let signalPatchStarted!: () => void
```