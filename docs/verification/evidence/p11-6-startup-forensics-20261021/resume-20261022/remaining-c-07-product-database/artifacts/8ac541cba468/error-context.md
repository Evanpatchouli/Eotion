# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: forensics--product-database.spec.ts >> Timeline Frozen columns disappear after the server repairs a deleted property reference
- Location: tests\forensics--product-database.spec.ts:4930:1

# Error details

```
Error: locator.click: Error: strict mode violation: getByRole('menu', { name: '数据库设置' }).getByRole('menuitem', { name: '属性' }) resolved to 2 elements:
    1) <button type="button" role="menuitem" data-v-749fbba4="" data-popover-item="" class="eotion-context-menu__item">…</button> aka getByRole('menuitem', { name: '属性', exact: true })
    2) <button type="button" role="menuitem" data-v-749fbba4="" data-popover-item="" class="eotion-context-menu__item">…</button> aka getByRole('menuitem', { name: '日期属性' })

Call log:
  - waiting for getByRole('menu', { name: '数据库设置' }).getByRole('menuitem', { name: '属性' })


Call Log:
- Timeout 8000ms exceeded while waiting on the predicate
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
                      - generic [ref=e90]: Frozen repair
                    - button "数据库设置" [expanded] [ref=e94] [cursor=pointer]
                  - button "新建记录" [ref=e97] [cursor=pointer]
                - generic [ref=e101]:
                  - generic [ref=e102]:
                    - generic [ref=e103]:
                      - button "上一个时间段" [ref=e104] [cursor=pointer]
                      - button "今天" [ref=e107] [cursor=pointer]
                      - button "下一个时间段" [ref=e108] [cursor=pointer]
                      - generic [ref=e111]: 2026年10月
                    - generic [ref=e112]:
                      - generic [ref=e113]: 时间轴刻度
                      - combobox "时间轴刻度" [ref=e114]:
                        - option "小时"
                        - option "日"
                        - option "周"
                        - option "双周"
                        - option "月" [selected]
                        - option "季度"
                        - option "年"
                  - generic [ref=e115]:
                    - complementary "记录属性" [ref=e116]:
                      - generic [ref=e118]:
                        - generic "Notes" [ref=e119]
                        - generic "Name" [ref=e121]
                      - generic [ref=e124]:
                        - generic "Delete this visible property" [ref=e125]
                        - generic "Repair target" [ref=e127]:
                          - button "Repair target" [ref=e128] [cursor=pointer]
                    - generic [ref=e129]:
                      - generic [aria-hidden] [ref=e133]:
                        - generic [ref=e134]: 2026年10月
                        - generic [ref=e136]: 15日
                        - generic [ref=e138]: 16日
                        - generic [ref=e140]: 17日
                        - generic [ref=e142]: 18日
                        - generic [ref=e144]: 19日
                        - generic [ref=e146]: 20日
                        - generic [ref=e148]: 21日
                        - generic [ref=e150]: 22日
                        - generic [ref=e152]: 23日
                        - generic [ref=e154]: 24日
                        - generic [ref=e156]: 25日
                        - generic [ref=e158]: 26日
                        - generic [ref=e160]: 27日
                        - generic [ref=e162]: 28日
                      - region "时间轴" [ref=e164]:
                        - button "跳转到Repair target的日期" [ref=e168] [cursor=pointer]: ←
              - generic:
                - button "在区块下方插入区块" [ref=e169] [cursor=pointer]
                - button "拖动区块" [ref=e171]
              - paragraph [ref=e179]
  - menu "数据库设置" [ref=e180]:
    - generic [ref=e181]:
      - menuitem "筛选" [active] [ref=e182] [cursor=pointer]
      - menuitem "排序" [ref=e186] [cursor=pointer]
      - menuitem "属性" [ref=e190] [cursor=pointer]
      - menuitem "日期属性" [ref=e194] [cursor=pointer]
      - menuitem "记录打开方式" [ref=e198] [cursor=pointer]
      - menuitem "自动化" [disabled] [ref=e202]
```

# Test source

```ts
  933  |         api.pages.splice(api.pages.indexOf(pageItem), 1, updatedPage)
  934  |         recordItem.pageVersion = later
  935  |       }
  936  |       if (api.abortCellUpdatesAfterCommit > 0) { api.abortCellUpdatesAfterCommit -= 1; return route.abort('failed') }
  937  |       return json(route, 200, { database: databaseItem, record: recordItem, ...(updatedPage ? { page: updatedPage } : {}) })
  938  |     }
  939  |     const createRecord = new RegExp(`^/api/workspaces/${workspace.id}/databases/([^/]+)/records$`, 'u').exec(pathname)
  940  |     if (createRecord && request.method() === 'POST') {
  941  |       const input = payload as { id: string; pageId: string; title: string; orderKey: string }
  942  |       const databaseId = createRecord[1]!
  943  |       const titleProperty = api.properties.find((item) => item.databaseId === databaseId && item.type === 'title')!
  944  |       const titlePage: PageResponse = { ...pageRecord, id: input.pageId, title: input.title, orderKey: input.orderKey, role: 'database-record' }
  945  |       const createdRecord = record(input.id, databaseId, input.pageId, { [titleProperty.id]: input.title })
  946  |       const databaseItem = api.databases.find((item) => item.id === databaseId)!
  947  |       databaseItem.version += 1
  948  |       api.pages.push(titlePage); api.records.push(createdRecord)
  949  |       if (api.holdRecordCreateResponse) {
  950  |         api.signalRecordCreateResponseStarted()
  951  |         await api.recordCreateResponseGate
  952  |       }
  953  |       if (api.abortRecordCreatesAfterCommit > 0) { api.abortRecordCreatesAfterCommit -= 1; return route.abort('failed') }
  954  |       return json(route, 201, { record: createdRecord, page: titlePage })
  955  |     }
  956  |     if (url.pathname === '/api/sync/operations' && request.method() === 'POST') {
  957  |       const operation = request.postDataJSON() as { kind: string; workspaceId: string; payload: any }
  958  |       const payload = operation.payload
  959  |       const index = api.blocks.findIndex((item) => item.id === payload.id)
  960  |       if (operation.kind === 'page.upsert') {
  961  |         const pageIndex = api.pages.findIndex((item) => item.id === payload.id)
  962  |         const value: PageResponse = { ...payload, workspaceId: operation.workspaceId, createdAt: api.pages[pageIndex]?.createdAt ?? now, updatedAt: later }
  963  |         if (pageIndex < 0) api.pages.push(value)
  964  |         else api.pages[pageIndex] = value
  965  |       } else if (operation.kind === 'block.upsert') {
  966  |         const existing = index >= 0 ? api.blocks[index] : undefined
  967  |         const value: BlockResponse = { ...payload, workspaceId: operation.workspaceId, parentBlockId: payload.parentBlockId ?? null, createdAt: existing?.createdAt ?? now, updatedAt: later }
  968  |         if (index < 0) api.blocks.push(value)
  969  |         else api.blocks[index] = value
  970  |       } else if (operation.kind === 'block.move') {
  971  |         if (index < 0) return json(route, 404, { statusCode: 404, message: 'Block not found' })
  972  |         api.blocks[index] = { ...api.blocks[index]!, parentBlockId: payload.parentBlockId ?? null, orderKey: payload.orderKey, updatedAt: later }
  973  |       } else if (operation.kind === 'block.delete' && index >= 0) api.blocks.splice(index, 1)
  974  |       return json(route, 200, { id: 'database-operation', status: 'applied' })
  975  |     }
  976  |     return json(route, 404, { statusCode: 404, message: 'Not found' })
  977  |   })
  978  |   return api
  979  | }
  980  | 
  981  | async function screenshot(page: Page, name: string) {
  982  |   const directory = process.env.EOTION_VISUAL_QA_DIR
  983  |   if (!directory) return
  984  |   await mkdir(directory, { recursive: true })
  985  |   await page.screenshot({ path: path.join(directory, `${name}.png`), animations: 'disabled', fullPage: true })
  986  | }
  987  | 
  988  | async function timelineScreenshot(page: Page, testInfo: TestInfo, name: string) {
  989  |   const screenshotPath = testInfo.outputPath(`${name}.png`)
  990  |   await mkdir(path.dirname(screenshotPath), { recursive: true })
  991  |   await page.screenshot({ path: screenshotPath, animations: 'disabled' })
  992  | }
  993  | 
  994  | async function timelineViewport(scroller: Locator) {
  995  |   return scroller.evaluate(element => {
  996  |     const node = element as HTMLElement
  997  |     const data = node.dataset
  998  |     return {
  999  |       start: Number(data.visibleStart), end: Number(data.visibleEnd), origin: Number(data.originMs),
  1000 |       generation: Number(data.generation), width: node.clientWidth, scrollLeft: node.scrollLeft,
  1001 |       scrollWidth: node.scrollWidth, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight,
  1002 |       overflowY: getComputedStyle(node).overflowY,
  1003 |     }
  1004 |   })
  1005 | }
  1006 | 
  1007 | async function expectButtonIconCentered(button: Locator, includeLabel = false) {
  1008 |   const geometry = await button.evaluate(element => {
  1009 |     const bounds = element.getBoundingClientRect()
  1010 |     const icon = element.querySelector('svg')!.getBoundingClientRect()
  1011 |     const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  1012 |     let textNode: Node | null = null
  1013 |     while ((textNode = walker.nextNode())) if (textNode.textContent?.trim()) break
  1014 |     const label = textNode ? (() => { const range = document.createRange(); range.selectNodeContents(textNode!); return range.getBoundingClientRect() })() : null
  1015 |     return { buttonX: bounds.x + bounds.width / 2, buttonY: bounds.y + bounds.height / 2, iconX: icon.x + icon.width / 2, iconY: icon.y + icon.height / 2, labelY: label ? label.y + label.height / 2 : null }
  1016 |   })
  1017 |   if (!includeLabel) expect(Math.abs(geometry.buttonX - geometry.iconX)).toBeLessThanOrEqual(1)
  1018 |   if (!includeLabel) expect(Math.abs(geometry.buttonY - geometry.iconY)).toBeLessThanOrEqual(1)
  1019 |   if (includeLabel) expect(Math.abs(geometry.labelY! - geometry.iconY)).toBeLessThanOrEqual(2)
  1020 | }
  1021 | 
  1022 | function overlayFooter(content: Locator) {
  1023 |   return content.locator('xpath=ancestor::dialog[1]').locator('.eotion-product-overlay__footer')
  1024 | }
  1025 | 
  1026 | async function openDatabaseSetting(page: Page, table: Locator, name: '筛选' | '排序' | '属性' | '分组属性' | '记录打开方式') {
  1027 |   const menu = page.getByRole('menu', { name: '数据库设置' })
  1028 |   await expect(async () => {
  1029 |     if (!await menu.isVisible()) await table.getByRole('button', { name: '数据库设置' }).click({ timeout: 1_000 })
  1030 |     await expect(menu).toBeVisible({ timeout: 1_000 })
  1031 |     await menu.getByRole('menuitem', { name }).click({ timeout: 1_000 })
  1032 |     await expect(menu).toHaveCount(0, { timeout: 1_000 })
> 1033 |   }).toPass({ timeout: 8_000 })
       |      ^ Error: locator.click: Error: strict mode violation: getByRole('menu', { name: '数据库设置' }).getByRole('menuitem', { name: '属性' }) resolved to 2 elements:
  1034 | }
  1035 | 
  1036 | async function closeDatabaseSetting(page: Page, label: '属性管理' | '分组属性' | '记录打开方式') {
  1037 |   const panel = page.getByRole('group', { name: label })
  1038 |   await expect(async () => {
  1039 |     if (await panel.count() === 0) return
  1040 |     await page.keyboard.press('Escape')
  1041 |     await expect(panel).toHaveCount(0, { timeout: 1_000 })
  1042 |   }).toPass({ timeout: 8_000 })
  1043 | }
  1044 | 
  1045 | async function openPropertyCreator(page: Page, table: Locator) {
  1046 |   await openDatabaseSetting(page, table, '属性')
  1047 |   const panel = page.getByRole('group', { name: '属性管理' })
  1048 |   await panel.getByRole('button', { name: '新增属性' }).click()
  1049 |   return page.getByRole('group', { name: '添加属性类型' })
  1050 | }
  1051 | 
  1052 | async function openAdvancedPropertyCreator(page: Page, table: Locator, type: '关联' | '汇总' | '公式') {
  1053 |   const creator = page.getByRole('group', { name: '添加属性类型' })
  1054 |   const config = page.getByRole('group', { name: `配置${type}属性` })
  1055 |   await expect(async () => {
  1056 |     if (!await creator.isVisible()) await openPropertyCreator(page, table)
  1057 |     await creator.getByRole('button', { name: type }).click({ timeout: 1_000 })
  1058 |     await expect(config).toBeVisible({ timeout: 1_000 })
  1059 |   }).toPass({ timeout: 8_000 })
  1060 |   const overlay = page.locator('.eotion-product-overlay').filter({ has: config })
  1061 |   await expect(overlay.getByRole('heading', { level: 2 })).toHaveCount(1)
  1062 |   await expect(overlay.getByRole('button', { name: '关闭' })).toHaveCount(1)
  1063 |   return config
  1064 | }
  1065 | 
  1066 | async function beginPropertyRename(page: Page, scope: Locator, propertyName: string): Promise<Locator> {
  1067 |   await scope.getByRole('button', { name: `属性设置 ${propertyName}` }).click()
  1068 |   await page.getByRole('menu', { name: `属性设置: ${propertyName}` }).getByRole('menuitem', { name: '重命名' }).click()
  1069 |   return scope.getByRole('textbox', { name: `属性名称 ${propertyName}` })
  1070 | }
  1071 | 
  1072 | async function beginPropertyTypeChange(page: Page, scope: Locator, propertyName: string, targetType: string): Promise<Locator> {
  1073 |   await scope.getByRole('button', { name: `属性设置 ${propertyName}` }).click()
  1074 |   await page.getByRole('menu', { name: `属性设置: ${propertyName}` }).getByRole('menuitem', { name: '变更类型' }).click()
  1075 |   await page.getByRole('group', { name: '更改属性类型' }).getByRole('menuitem', { name: targetType, exact: true }).click()
  1076 |   return page.getByRole('dialog', { name: '变更属性类型？' })
  1077 | }
  1078 | 
  1079 | async function beginAdvancedPropertyTypeChange(page: Page, scope: Locator, propertyName: string, targetType: '关联' | '汇总' | '公式') {
  1080 |   await scope.getByRole('button', { name: `属性设置 ${propertyName}` }).click()
  1081 |   await page.getByRole('menu', { name: `属性设置: ${propertyName}` }).getByRole('menuitem', { name: '变更类型' }).click()
  1082 |   await page.getByRole('group', { name: '更改属性类型' }).getByRole('menuitem', { name: targetType, exact: true }).click()
  1083 |   return page.getByRole('group', { name: `配置${targetType}属性` })
  1084 | }
  1085 | 
  1086 | async function submitNewRecord(table: ReturnType<Page['locator']>) {
  1087 |   await table.getByRole('button', { name: '新建记录', exact: true }).click()
  1088 |   await expect(table.getByRole('textbox', { name: '记录标题' })).toHaveCount(0)
  1089 | }
  1090 | 
  1091 | function openingGroup(page: Page, target: '记录' | '属性', layout: '桌面' | '平板' | '手机') {
  1092 |   return page.getByRole('group', { name: `${target}${layout}打开方式` })
  1093 | }
  1094 | 
  1095 | function openingTrigger(page: Page, target: '记录' | '属性', layout: '桌面' | '平板' | '手机') {
  1096 |   return openingGroup(page, target, layout).getByRole('button', { name: `${target}${layout}打开方式` })
  1097 | }
  1098 | 
  1099 | function openingSettingsPanel(page: Page, target: '记录' | '属性') {
  1100 |   return page.getByRole('group', { name: target === '记录' ? '记录打开方式' : '属性管理' })
  1101 | }
  1102 | 
  1103 | async function expandOpeningChoices(page: Page, target: '记录' | '属性') {
  1104 |   const trigger = page.getByRole('button', { name: '展开其他设备打开方式' })
  1105 |   if (await trigger.isVisible()) await trigger.click()
  1106 |   await expect(openingGroup(page, target, '桌面')).toBeVisible()
  1107 |   await expect(openingGroup(page, target, '平板')).toBeVisible()
  1108 |   await expect(openingGroup(page, target, '手机')).toBeVisible()
  1109 | }
  1110 | 
  1111 | async function selectSettingOption(panel: Locator, label: string, value: string, optionName: string) {
  1112 |   const trigger = panel.getByRole('button', { name: label })
  1113 |   await trigger.click()
  1114 |   const overlay = panel.locator('xpath=ancestor::dialog[1]')
  1115 |   const menu = overlay.getByRole('menu', { name: label })
  1116 |   await menu.getByRole('menuitem', { name: optionName, exact: true }).click()
  1117 |   await expect(trigger).toHaveAttribute('data-value', value)
  1118 | }
  1119 | 
  1120 | async function chooseOpening(page: Page, table: Locator, target: '记录' | '属性', layout: '桌面' | '平板' | '手机', mode: string) {
  1121 |   const menu = page.getByRole('menu', { name: `${target}${layout}打开方式` })
  1122 |   await expect(async () => {
  1123 |     if (!await openingSettingsPanel(page, target).isVisible()) await openDatabaseSetting(page, table, target === '记录' ? '记录打开方式' : '属性')
  1124 |     await expandOpeningChoices(page, target)
  1125 |     if (!await menu.isVisible()) await openingTrigger(page, target, layout).click({ timeout: 1_000 })
  1126 |     await expect(menu).toBeVisible({ timeout: 1_000 })
  1127 |     await menu.getByRole('menuitem', { name: mode, exact: true }).click({ timeout: 1_000 })
  1128 |     if (!await openingSettingsPanel(page, target).isVisible()) await openDatabaseSetting(page, table, target === '记录' ? '记录打开方式' : '属性')
  1129 |     await expect(openingTrigger(page, target, layout)).toContainText(mode, { timeout: 1_000 })
  1130 |   }).toPass({ timeout: 8_000 })
  1131 | }
  1132 | 
  1133 | async function expectOpeningOptions(page: Page, table: Locator, target: '记录' | '属性', layout: '桌面' | '平板' | '手机', options: string[]) {
```