# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: product-database.spec.ts >> board grouping mutation updates the record, keeps linked Table and List in sync, and preserves Table editing
- Location: tests\product-database.spec.ts:6615:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.press: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('menu', { name: '移动记录分组' }).getByRole('menuitem', { name: 'Open', exact: true })
    - locator resolved to <button type="button" role="menuitem" data-v-f6e1ceb3="" class="eotion-database-settings-select-option">…</button>
  - elementHandle.press("Enter")
  - element was detached from the DOM, retrying

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
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
                      - generic [ref=e90]: Board
                    - button "数据库设置" [ref=e94] [cursor=pointer]
                  - button "新建记录" [ref=e97] [cursor=pointer]
                - generic [ref=e102]:
                  - region "Open" [ref=e103]:
                    - heading "Open 1" [level=3] [ref=e104]:
                      - generic [ref=e105]: Open
                      - generic [ref=e106]: "1"
                    - article [ref=e107]:
                      - button "打开记录：Stay here" [ref=e108] [cursor=pointer]: Stay here
                      - button "移动记录分组" [ref=e111] [cursor=pointer]:
                        - generic [ref=e112]: Open
                      - generic [ref=e115]:
                        - generic [ref=e116]:
                          - term [ref=e117]: Notes
                          - definition [ref=e118]: —
                        - generic [ref=e119]:
                          - term [ref=e120]: Points
                          - definition [ref=e121]: —
                        - generic [ref=e122]:
                          - term [ref=e123]: Done
                          - definition [ref=e124]: —
                        - generic [ref=e125]:
                          - term [ref=e126]: Status
                          - definition [ref=e127]: Open
                        - generic [ref=e128]:
                          - term [ref=e129]: Due
                          - definition [ref=e130]: —
                  - region "Done" [ref=e131]:
                    - heading "Done 2" [level=3] [ref=e132]:
                      - generic [ref=e133]: Done
                      - generic [ref=e134]: "2"
                    - article [ref=e135]:
                      - button "打开记录：Draft survives Board mutation" [ref=e136] [cursor=pointer]: Draft survives Board mutation
                      - button "移动记录分组" [ref=e139] [cursor=pointer]:
                        - generic [ref=e140]: Done
                      - generic [ref=e143]:
                        - generic [ref=e144]:
                          - term [ref=e145]: Notes
                          - definition [ref=e146]: —
                        - generic [ref=e147]:
                          - term [ref=e148]: Points
                          - definition [ref=e149]: —
                        - generic [ref=e150]:
                          - term [ref=e151]: Done
                          - definition [ref=e152]: —
                        - generic [ref=e153]:
                          - term [ref=e154]: Status
                          - definition [ref=e155]: Done
                        - generic [ref=e156]:
                          - term [ref=e157]: Due
                          - definition [ref=e158]: —
                    - article [ref=e159]:
                      - button "打开记录：Already done" [ref=e160] [cursor=pointer]: Already done
                      - button "移动记录分组" [ref=e163] [cursor=pointer]:
                        - generic [ref=e164]: Done
                      - generic [ref=e167]:
                        - generic [ref=e168]:
                          - term [ref=e169]: Notes
                          - definition [ref=e170]: —
                        - generic [ref=e171]:
                          - term [ref=e172]: Points
                          - definition [ref=e173]: —
                        - generic [ref=e174]:
                          - term [ref=e175]: Done
                          - definition [ref=e176]: —
                        - generic [ref=e177]:
                          - term [ref=e178]: Status
                          - definition [ref=e179]: Done
                        - generic [ref=e180]:
                          - term [ref=e181]: Due
                          - definition [ref=e182]: —
                  - region "未分组" [ref=e183]:
                    - heading "未分组 0" [level=3] [ref=e184]:
                      - generic [ref=e185]: 未分组
                      - generic [ref=e186]: "0"
              - generic:
                - button "在数据库区块下方插入区块" [ref=e187] [cursor=pointer]
                - button "拖动区块" [ref=e189]
              - generic "数据库视图" [ref=e197]:
                - generic [ref=e198]:
                  - strong [ref=e203]: Root projects
                  - generic [ref=e204]:
                    - button "切换视图" [ref=e206] [cursor=pointer]:
                      - generic [ref=e207]: 表格视图
                    - button "数据库设置" [ref=e211] [cursor=pointer]
                  - button "新建记录" [ref=e214] [cursor=pointer]
                - region "数据库记录" [ref=e218]:
                  - table [ref=e219]:
                    - rowgroup [ref=e220]:
                      - row [ref=e221]:
                        - columnheader "名称 属性设置 名称" [ref=e222]:
                          - generic [ref=e223]:
                            - generic [ref=e224]: 名称
                            - button "属性设置 名称" [ref=e226] [cursor=pointer]
                        - columnheader "Notes 属性设置 Notes" [ref=e229]:
                          - generic [ref=e230]:
                            - generic [ref=e231]: Notes
                            - button "属性设置 Notes" [ref=e233] [cursor=pointer]
                        - columnheader "Points 属性设置 Points" [ref=e236]:
                          - generic [ref=e237]:
                            - generic [ref=e238]: Points
                            - button "属性设置 Points" [ref=e240] [cursor=pointer]
                        - columnheader "Done 属性设置 Done" [ref=e243]:
                          - generic [ref=e244]:
                            - generic [ref=e245]: Done
                            - button "属性设置 Done" [ref=e247] [cursor=pointer]
                        - columnheader "Status 属性设置 Status" [ref=e250]:
                          - generic [ref=e251]:
                            - generic [ref=e252]: Status
                            - button "属性设置 Status" [ref=e254] [cursor=pointer]
                        - columnheader "Due 属性设置 Due" [ref=e257]:
                          - generic [ref=e258]:
                            - generic [ref=e259]: Due
                            - button "属性设置 Due" [ref=e261] [cursor=pointer]
                    - rowgroup [ref=e264]:
                      - row [ref=e265]:
                        - cell [ref=e266]:
                          - generic [ref=e267]:
                            - button "编辑名称：Draft survives Board mutation" [ref=e268] [cursor=pointer]: Draft survives Board mutation
                            - button "打开记录：Draft survives Board mutation" [ref=e269] [cursor=pointer]
                        - cell [ref=e272]:
                          - button [ref=e273] [cursor=pointer]
                        - cell [ref=e274]:
                          - button [ref=e275] [cursor=pointer]
                        - cell [ref=e276]:
                          - button [ref=e277] [cursor=pointer]
                        - cell [ref=e278]:
                          - button "Done" [ref=e279] [cursor=pointer]
                        - cell [ref=e280]:
                          - button "编辑Due：" [ref=e281] [cursor=pointer]
                      - row [ref=e282]:
                        - cell [ref=e283]:
                          - generic [ref=e284]:
                            - button "编辑名称：Stay here" [ref=e285] [cursor=pointer]: Stay here
                            - button "打开记录：Stay here" [ref=e286] [cursor=pointer]
                        - cell [ref=e289]:
                          - button [ref=e290] [cursor=pointer]
                        - cell [ref=e291]:
                          - button [ref=e292] [cursor=pointer]
                        - cell [ref=e293]:
                          - button [ref=e294] [cursor=pointer]
                        - cell [ref=e295]:
                          - button "Open" [ref=e296] [cursor=pointer]
                        - cell [ref=e297]:
                          - button "编辑Due：" [ref=e298] [cursor=pointer]
                      - row [ref=e299]:
                        - cell [ref=e300]:
                          - generic [ref=e301]:
                            - button "编辑名称：Already done" [ref=e302] [cursor=pointer]: Already done
                            - button "打开记录：Already done" [ref=e303] [cursor=pointer]
                        - cell [ref=e306]:
                          - button [ref=e307] [cursor=pointer]
                        - cell [ref=e308]:
                          - button [ref=e309] [cursor=pointer]
                        - cell [ref=e310]:
                          - button [ref=e311] [cursor=pointer]
                        - cell [ref=e312]:
                          - button "Done" [ref=e313] [cursor=pointer]
                        - cell [ref=e314]:
                          - button "编辑Due：" [ref=e315] [cursor=pointer]
              - generic:
                - button "在数据库区块下方插入区块" [ref=e316] [cursor=pointer]
                - button "拖动区块" [ref=e318]
              - generic "数据库视图" [ref=e326]:
                - generic [ref=e327]:
                  - strong [ref=e332]: Root projects
                  - generic [ref=e333]:
                    - button "切换视图" [ref=e335] [cursor=pointer]:
                      - generic [ref=e336]: List
                    - button "数据库设置" [ref=e340] [cursor=pointer]
                  - button "新建记录" [ref=e343] [cursor=pointer]
                - list "数据库记录" [ref=e347]:
                  - listitem [ref=e348]:
                    - button "打开记录：Draft survives Board mutation" [ref=e349] [cursor=pointer]:
                      - generic [ref=e350]: Draft survives Board mutation
                      - generic [aria-hidden] [ref=e351]: ↗
                    - generic [ref=e353]:
                      - term [ref=e354]: Status
                      - definition [ref=e355]: Done
                  - listitem [ref=e356]:
                    - button "打开记录：Stay here" [ref=e357] [cursor=pointer]:
                      - generic [ref=e358]: Stay here
                      - generic [aria-hidden] [ref=e359]: ↗
                    - generic [ref=e361]:
                      - term [ref=e362]: Status
                      - definition [ref=e363]: Open
                  - listitem [ref=e364]:
                    - button "打开记录：Already done" [ref=e365] [cursor=pointer]:
                      - generic [ref=e366]: Already done
                      - generic [aria-hidden] [ref=e367]: ↗
                    - generic [ref=e369]:
                      - term [ref=e370]: Status
                      - definition [ref=e371]: Done
              - generic:
                - button "在区块下方插入区块" [ref=e372] [cursor=pointer]
                - button "拖动区块" [ref=e374]
              - paragraph [ref=e382]
  - complementary "记录" [ref=e383]:
    - generic [ref=e384]:
      - generic [ref=e385]:
        - heading "记录" [level=2] [ref=e386]
        - button "关闭记录" [ref=e387] [cursor=pointer]: ×
      - generic [ref=e389]:
        - paragraph [ref=e390]: Database workspace
        - textbox "记录标题" [ref=e392]: Draft survives Board mutation
        - region "Tiptap 编辑器" [ref=e393]:
          - button "选择图片附件" [ref=e394]
          - button "选择文件附件" [ref=e395]
          - textbox "页面正文编辑区域" [ref=e397]:
            - paragraph [ref=e398]
```

# Test source

```ts
  6598 |   const api = await installApi(page, [
  6599 |     block('board-picker-null-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: boardView.id } }, 100),
  6600 |   ], { databases: [rootDatabase], views: [boardView], properties: rootProperties, records: [basicRecord] })
  6601 |   api.pages.push({ ...pageRecord, id: basicRecord.pageId, title: 'Launch plan', role: 'database-record' })
  6602 |   await page.goto('/#/app/database-workspace/page/database-page')
  6603 | 
  6604 |   const board = page.getByTestId('database-board')
  6605 |   const openColumn = board.locator('[data-option-id="status-open"]')
  6606 |   const card = openColumn.locator(`[data-record-id="${basicRecord.id}"]`)
  6607 |   await card.getByRole('button', { name: '移动记录分组' }).click()
  6608 |   await page.getByRole('menu', { name: '移动记录分组' }).getByRole('menuitem', { name: '未分组', exact: true }).click()
  6609 |   await expect(board.locator(`[data-option-id=""] [data-record-id="${basicRecord.id}"]`)).toBeVisible()
  6610 |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  6611 |   expect(api.requests.filter(item => item.method === 'PATCH' && item.path.endsWith(`/records/${basicRecord.id}/cells/root-select`))).toHaveLength(1)
  6612 |   expect(api.records.find(item => item.id === basicRecord.id)?.properties['root-select']).toBeNull()
  6613 | })
  6614 | 
  6615 | test('board grouping mutation updates the record, keeps linked Table and List in sync, and preserves Table editing', async ({ page }) => {
  6616 |   const boardView = view('board-mutation-view', rootDatabase.id, 'Board', {
  6617 |     ...DEFAULT_DATABASE_VIEW_CONFIG,
  6618 |     options: { groupByPropertyId: 'root-select' },
  6619 |   }, 'board')
  6620 |   const listView = view('board-mutation-list', rootDatabase.id, 'List', {
  6621 |     ...DEFAULT_DATABASE_VIEW_CONFIG,
  6622 |     visibleProperties: ['root-select'],
  6623 |     propertyOrder: ['root-select'],
  6624 |   }, 'list')
  6625 |   const moved = record('board-mutation-a', rootDatabase.id, 'board-mutation-page-a', { 'root-title': 'Move me', 'root-select': 'status-open' })
  6626 |   const other = record('board-mutation-b', rootDatabase.id, 'board-mutation-page-b', { 'root-title': 'Stay here', 'root-select': 'status-open' })
  6627 |   const alreadyDone = record('board-mutation-c', rootDatabase.id, 'board-mutation-page-c', { 'root-title': 'Already done', 'root-select': 'status-done' })
  6628 |   const api = await installApi(page, [
  6629 |     block('board-mutation-board-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: boardView.id } }, 100),
  6630 |     block('board-mutation-table-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 200),
  6631 |     block('board-mutation-list-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: listView.id } }, 300),
  6632 |   ], {
  6633 |     databases: [rootDatabase],
  6634 |     views: [view('view-root-id', rootDatabase.id), boardView, listView],
  6635 |     properties: rootProperties,
  6636 |     records: [moved, other, alreadyDone],
  6637 |   })
  6638 |   api.pages.push(
  6639 |     ...[moved, other, alreadyDone].map((item, index) => ({ ...pageRecord, id: item.pageId, title: String(item.properties['root-title']), orderKey: String(index + 2).padStart(16, '0'), role: 'database-record' as const })),
  6640 |   )
  6641 |   const originalViews = structuredClone(api.views)
  6642 |   await page.goto('/#/app/database-workspace/page/database-page')
  6643 | 
  6644 |   const boardBlock = page.locator('#database-block-board-mutation-board-block')
  6645 |   const tableBlock = page.locator('#database-block-board-mutation-table-block')
  6646 |   const listBlock = page.locator('#database-block-board-mutation-list-block')
  6647 |   const board = boardBlock.getByTestId('database-board')
  6648 |   const openColumn = board.locator('[data-option-id="status-open"]')
  6649 |   const doneColumn = board.locator('[data-option-id="status-done"]')
  6650 |   const movedCard = openColumn.locator('[data-record-id="board-mutation-a"]')
  6651 |   await expect(movedCard.getByRole('button', { name: '移动记录分组' })).toHaveAttribute('data-value', 'status-open')
  6652 |   await expect(openColumn.locator('.eotion-database-board-card')).toHaveCount(2)
  6653 |   await expect(doneColumn.locator('.eotion-database-board-card')).toHaveCount(1)
  6654 |   await expect(tableBlock.getByRole('button', { name: '移动记录分组' })).toHaveCount(0)
  6655 |   await expect(listBlock.getByRole('button', { name: '移动记录分组' })).toHaveCount(0)
  6656 | 
  6657 |   const boardRecordsPath = `/api/workspaces/${workspace.id}/databases/${rootDatabase.id}/views/${boardView.id}/table`
  6658 |   const boardReadsBeforeDrag = api.requests.filter(item => item.method === 'GET' && item.path === boardRecordsPath).length
  6659 |   await movedCard.dragTo(doneColumn)
  6660 |   const movedDoneCard = doneColumn.locator('[data-record-id="board-mutation-a"]')
  6661 |   await expect(movedDoneCard).toBeVisible()
  6662 |   await expect.poll(() => api.requests.filter(item => item.method === 'GET' && item.path === boardRecordsPath).length).toBe(boardReadsBeforeDrag + 1)
  6663 |   await expect(openColumn.locator('[data-record-id="board-mutation-b"]')).toBeVisible()
  6664 |   await expect(doneColumn.locator('[data-record-id="board-mutation-c"]')).toBeVisible()
  6665 |   await expect(movedDoneCard.getByRole('button', { name: '移动记录分组' })).toHaveAttribute('data-value', 'status-done')
  6666 | 
  6667 |   const cellUpdate = api.requests.find(item => item.method === 'PATCH' && item.path.endsWith(`/records/${moved.id}/cells/root-select`))
  6668 |   expect(cellUpdate?.payload).toEqual({ value: 'status-done', expectedDatabaseVersion: 1, expectedRecordVersion: 1 })
  6669 |   expect(api.records.find(item => item.id === moved.id)?.properties['root-select']).toBe('status-done')
  6670 |   expect(api.records.find(item => item.id === other.id)?.properties['root-select']).toBe('status-open')
  6671 |   expect(api.views).toEqual(originalViews)
  6672 |   expect(api.requests.filter(item => ['POST', 'PATCH', 'DELETE'].includes(item.method) && item.path.includes('/databases/')).map(item => item.path)).toEqual([
  6673 |     `/api/workspaces/${workspace.id}/databases/${rootDatabase.id}/records/${moved.id}/cells/root-select`,
  6674 |   ])
  6675 | 
  6676 |   const tableRow = tableBlock.locator('tbody tr').filter({ hasText: 'Move me' })
  6677 |   const listCard = listBlock.getByTestId('database-list').locator('.eotion-database-list-record').filter({ hasText: 'Move me' })
  6678 |   await expect(tableRow.getByRole('button', { name: 'Done', exact: true })).toBeVisible()
  6679 |   await expect(listCard).toContainText('Done')
  6680 |   await expect(listCard.getByRole('button', { name: '移动记录分组' })).toHaveCount(0)
  6681 | 
  6682 |   await movedDoneCard.getByRole('button', { name: '打开记录：Move me' }).click()
  6683 |   const drawer = page.locator('[data-overlay-mode="drawer"]')
  6684 |   await expect(drawer).toBeVisible()
  6685 |   const titleDraft = drawer.getByRole('textbox', { name: '记录标题' })
  6686 |   await expect(drawer.locator('.eotion-editor-content .tiptap')).toHaveAttribute('contenteditable', 'true')
  6687 |   await titleDraft.fill('Draft survives Board mutation')
  6688 |   await expect(titleDraft).toHaveValue('Draft survives Board mutation')
  6689 |   await page.locator('.eotion-editor-content').first().evaluate(element => element.setAttribute('data-board-mutation-lifecycle', 'stable'))
  6690 |   await boardBlock.evaluate(element => element.setAttribute('data-board-mutation-lifecycle', 'stable'))
  6691 |   await drawer.evaluate(element => element.setAttribute('data-board-mutation-lifecycle', 'stable'))
  6692 |   const keyboardPicker = movedDoneCard.getByRole('button', { name: '移动记录分组' })
  6693 |   await keyboardPicker.focus()
  6694 |   await keyboardPicker.press('Enter')
  6695 |   const keyboardMenu = page.getByRole('menu', { name: '移动记录分组' })
  6696 |   const keyboardOption = keyboardMenu.getByRole('menuitem', { name: 'Open', exact: true })
  6697 |   await keyboardOption.focus()
> 6698 |   await keyboardOption.press('Enter')
       |                        ^ Error: locator.press: Test timeout of 30000ms exceeded.
  6699 |   await expect(openColumn.locator(`[data-record-id="${moved.id}"]`)).toBeVisible()
  6700 |   await expect(drawer).toHaveAttribute('data-board-mutation-lifecycle', 'stable')
  6701 |   await expect(boardBlock).toHaveAttribute('data-board-mutation-lifecycle', 'stable')
  6702 |   await expect(page.locator('.eotion-editor-content').first()).toHaveAttribute('data-board-mutation-lifecycle', 'stable')
  6703 |   await expect(titleDraft).toHaveValue('Draft survives Board mutation')
  6704 | 
  6705 |   await closeRecordSurface(page)
  6706 |   const draftRow = tableBlock.locator('tbody tr').filter({ hasText: 'Draft survives Board mutation' })
  6707 |   await chooseSelectCell(page, draftRow.getByRole('button', { name: 'Open', exact: true }), 'Done')
  6708 |   await expect(draftRow.getByRole('button', { name: 'Done', exact: true })).toBeVisible()
  6709 |   await expect.poll(() => api.records.find(item => item.id === moved.id)?.properties['root-select']).toBe('status-done')
  6710 | })
  6711 | 
  6712 | test('failed Board drag keeps the card and selected option unchanged', async ({ page }) => {
  6713 |   const boardView = view('board-mutation-failure-view', rootDatabase.id, 'Board', {
  6714 |     ...DEFAULT_DATABASE_VIEW_CONFIG,
  6715 |     options: { groupByPropertyId: 'root-select' },
  6716 |   }, 'board')
  6717 |   const api = await installApi(page, [
  6718 |     block('board-mutation-failure-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: boardView.id } }, 100),
  6719 |   ], {
  6720 |     databases: [rootDatabase], views: [boardView], properties: rootProperties, records: [basicRecord], failCellUpdates: 1,
  6721 |   })
  6722 |   api.pages.push({ ...pageRecord, id: basicRecord.pageId, title: 'Launch plan', role: 'database-record' })
  6723 |   const originalRecords = structuredClone(api.records)
  6724 |   const originalViews = structuredClone(api.views)
  6725 |   await page.goto('/#/app/database-workspace/page/database-page')
  6726 | 
  6727 |   const board = page.getByTestId('database-board')
  6728 |   const openColumn = board.locator('[data-option-id="status-open"]')
  6729 |   const openCard = openColumn.locator(`[data-record-id="${basicRecord.id}"]`)
  6730 |   const doneColumn = board.locator('[data-option-id="status-done"]')
  6731 |   await openCard.dragTo(doneColumn)
  6732 | 
  6733 |   await expect(page.getByRole('alert')).toBeVisible()
  6734 |   await expect(openColumn.locator(`[data-record-id="${basicRecord.id}"]`)).toBeVisible()
  6735 |   await expect(board.locator(`[data-option-id="status-done"] [data-record-id="${basicRecord.id}"]`)).toHaveCount(0)
  6736 |   await expect(openCard.getByRole('button', { name: '移动记录分组' })).toHaveAttribute('data-value', 'status-open')
  6737 |   expect(api.records).toEqual(originalRecords)
  6738 |   expect(api.views).toEqual(originalViews)
  6739 |   expect(api.requests.filter(item => item.method === 'PATCH' && item.path.includes('/databases/'))).toHaveLength(1)
  6740 | })
  6741 | 
  6742 | test('Board drag conflict stays stale until refresh, then retries with fresh record versions', async ({ page }) => {
  6743 |   const boardView = view('board-mutation-conflict-view', rootDatabase.id, 'Board', {
  6744 |     ...DEFAULT_DATABASE_VIEW_CONFIG,
  6745 |     options: { groupByPropertyId: 'root-select' },
  6746 |   }, 'board')
  6747 |   const api = await installApi(page, [
  6748 |     block('board-mutation-conflict-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: boardView.id } }, 100),
  6749 |   ], {
  6750 |     databases: [rootDatabase], views: [boardView], properties: rootProperties, records: [basicRecord], conflictCellUpdates: 1,
  6751 |   })
  6752 |   api.pages.push({ ...pageRecord, id: basicRecord.pageId, title: 'Launch plan', role: 'database-record' })
  6753 |   await page.goto('/#/app/database-workspace/page/database-page')
  6754 | 
  6755 |   const board = page.getByTestId('database-board')
  6756 |   const openColumn = board.locator('[data-option-id="status-open"]')
  6757 |   const doneColumn = board.locator('[data-option-id="status-done"]')
  6758 |   const openCard = openColumn.locator(`[data-record-id="${basicRecord.id}"]`)
  6759 |   const picker = openCard.getByRole('button', { name: '移动记录分组' })
  6760 |   const boardRecordsPath = `/api/workspaces/${workspace.id}/databases/${rootDatabase.id}/views/${boardView.id}/table`
  6761 |   await openCard.dragTo(doneColumn)
  6762 | 
  6763 |   const conflictAlert = page.getByRole('alert')
  6764 |   await expect(conflictAlert).toContainText('请刷新后重新选择')
  6765 |   await expect(openCard).toBeVisible()
  6766 |   await expect(picker).toHaveAttribute('data-value', 'status-open')
  6767 |   expect(api.records.find(item => item.id === basicRecord.id)?.properties['root-select']).toBe('Concurrent edit')
  6768 | 
  6769 |   const readsBeforeManualRefresh = api.requests.filter(item => item.method === 'GET' && item.path === boardRecordsPath).length
  6770 |   await conflictAlert.getByRole('button', { name: '刷新记录' }).click()
  6771 |   await expect.poll(() => api.requests.filter(item => item.method === 'GET' && item.path === boardRecordsPath).length).toBeGreaterThan(readsBeforeManualRefresh)
  6772 |   const unassignedColumn = board.locator('[data-option-id=""]')
  6773 |   const refreshedCard = unassignedColumn.locator(`[data-record-id="${basicRecord.id}"]`)
  6774 |   await expect(refreshedCard).toBeVisible()
  6775 |   const refreshedPicker = refreshedCard.getByRole('button', { name: '移动记录分组' })
  6776 |   await expect(refreshedPicker).toHaveAttribute('data-value', '')
  6777 | 
  6778 |   await refreshedCard.dragTo(doneColumn)
  6779 |   await expect(doneColumn.locator(`[data-record-id="${basicRecord.id}"]`)).toBeVisible()
  6780 |   expect(api.records.find(item => item.id === basicRecord.id)?.properties['root-select']).toBe('status-done')
  6781 |   const cellUpdates = api.requests.filter(item => item.method === 'PATCH' && item.path.endsWith(`/records/${basicRecord.id}/cells/root-select`))
  6782 |   expect(cellUpdates).toHaveLength(2)
  6783 |   expect(cellUpdates[0]?.payload).toEqual({ value: 'status-done', expectedDatabaseVersion: 1, expectedRecordVersion: 1 })
  6784 |   expect(cellUpdates[1]?.payload).toEqual({ value: 'status-done', expectedDatabaseVersion: 2, expectedRecordVersion: 2 })
  6785 | })
  6786 | 
  6787 | test('unconfigured Board stays read-only and exposes no grouping mutation control', async ({ page }) => {
  6788 |   const boardView = view('board-mutation-unconfigured-view', rootDatabase.id, 'Board', { ...DEFAULT_DATABASE_VIEW_CONFIG }, 'board')
  6789 |   const api = await installApi(page, [
  6790 |     block('board-mutation-unconfigured-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: boardView.id } }, 100),
  6791 |   ], { databases: [rootDatabase], views: [boardView], properties: rootProperties, records: [basicRecord] })
  6792 |   await page.goto('/#/app/database-workspace/page/database-page')
  6793 | 
  6794 |   const board = page.getByTestId('database-board')
  6795 |   await expect(board).toContainText('尚未配置分组属性')
  6796 |   await expect(board.getByRole('button', { name: '移动记录分组' })).toHaveCount(0)
  6797 |   expect(api.requests.filter(item => ['POST', 'PATCH', 'DELETE'].includes(item.method) && item.path.includes('/databases/'))).toHaveLength(0)
  6798 | })
```