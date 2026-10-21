# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: product-database.spec.ts >> unconfirmed inline database creation fences further create or link attempts until page refresh
- Location: tests\product-database.spec.ts:6979:1

# Error details

```
Error: expect(received).toMatchObject(expected)

- Expected  - 1
+ Received  + 1

  Object {
    "atDocumentEnd": true,
    "empty": true,
-   "emptyParagraph": true,
+   "emptyParagraph": false,
  }

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
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
            - button "Database references" [ref=e36] [cursor=pointer]
            - button "页面操作：Database references" [ref=e42] [cursor=pointer]
        - treeitem [level=1] [ref=e45]:
          - generic [ref=e48]:
            - button "Other page" [ref=e49] [cursor=pointer]
            - button "页面操作：Other page" [ref=e55] [cursor=pointer]
    - generic [ref=e58]:
      - button "设置" [ref=e60] [cursor=pointer]
      - button "退出登录" [ref=e64] [cursor=pointer]
  - main [ref=e67]:
    - generic [ref=e68]:
      - generic [ref=e69]: Database workspace / Database references
      - status [ref=e70]: 已同步
    - article [ref=e72]:
      - generic [ref=e73]:
        - paragraph [ref=e74]: Database workspace
        - heading "Database references" [level=1] [ref=e76]
        - region "Tiptap 编辑器" [ref=e77]:
          - button "选择图片附件" [ref=e78]
          - button "选择文件附件" [ref=e79]
          - alert [ref=e80]: 上次数据库操作结果尚未确认，请联网并刷新页面后确认；正文可继续编辑。
          - textbox "页面正文编辑区域" [ref=e82]:
            - generic:
              - button "在区块下方插入区块" [ref=e83] [cursor=pointer]
              - button "拖动区块" [ref=e85]
            - paragraph [ref=e93]
            - generic:
              - button "在区块下方插入区块" [ref=e94] [cursor=pointer]
              - button "拖动区块" [ref=e96]
            - paragraph [ref=e104]: /database
```

# Test source

```ts
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
  1134 |   const menu = page.getByRole('menu', { name: `${target}${layout}打开方式` })
  1135 |   await expect(async () => {
  1136 |     if (!await openingGroup(page, target, layout).isVisible()) await openDatabaseSetting(page, table, target === '记录' ? '记录打开方式' : '属性')
  1137 |     await expandOpeningChoices(page, target)
  1138 |     if (!await menu.isVisible()) await openingTrigger(page, target, layout).click({ timeout: 1_000 })
  1139 |     await expect(menu).toBeVisible({ timeout: 1_000 })
  1140 |     expect((await menu.getByRole('menuitem').allTextContents()).map(text => text.replace('✓', '').trim())).toEqual(options)
  1141 |     await menu.getByRole('menuitem').filter({ has: page.locator('[aria-hidden="true"]') }).click({ timeout: 1_000 })
  1142 |     if (!await openingGroup(page, target, layout).isVisible()) await openDatabaseSetting(page, table, target === '记录' ? '记录打开方式' : '属性')
  1143 |     await expect(openingGroup(page, target, layout)).toBeVisible({ timeout: 1_000 })
  1144 |   }).toPass({ timeout: 8_000 })
  1145 | }
  1146 | 
  1147 | async function closeRecordSurface(page: Page) {
  1148 |   const close = page.getByRole('button', { name: '关闭记录' })
  1149 |   if (await close.isVisible()) {
  1150 |     await close.click()
  1151 |     await expect(close).toHaveCount(0)
  1152 |   }
  1153 | }
  1154 | 
  1155 | async function chooseSelectCell(page: Page, trigger: Locator, option: string) {
  1156 |   const menu = page.locator('.eotion-database-cell-menu')
  1157 |   await expect(trigger).toBeEnabled()
  1158 |   await expect(async () => {
  1159 |     if (!await menu.isVisible()) await trigger.click({ timeout: 1_000 })
  1160 |     await expect(menu).toBeVisible({ timeout: 1_000 })
  1161 |     await menu.getByRole('button', { name: option, exact: true }).click({ timeout: 1_000 })
  1162 |   }).toPass({ timeout: 8_000 })
  1163 | }
  1164 | 
  1165 | async function openDatabaseSlashMenu(page: Page) {
  1166 |   const editor = page.locator('.eotion-editor-content .tiptap')
  1167 |   const selection = () => editor.evaluate(element => {
  1168 |     let component = (element.closest('.eotion-editor') as (HTMLElement & { __vueParentComponent?: any }) | null)?.__vueParentComponent
  1169 |     while (component && component.type?.__name !== 'EotionEditor') component = component.parent
  1170 |     const exposed = component?.exposed?.editor ?? component?.setupState?.editor
  1171 |     const current = (exposed?.commands ? exposed : exposed?.value) as Editor | undefined
  1172 |     const state = current?.state
  1173 |     if (!state) return null
  1174 |     const { empty, $from } = state.selection
  1175 |     return {
  1176 |       empty,
  1177 |       atDocumentEnd: $from.parent.isTextblock && $from.pos === state.doc.content.size - 1,
  1178 |       emptyParagraph: $from.parent.type.name === 'paragraph' && $from.parent.content.size === 0 && $from.parentOffset === 0,
  1179 |     }
  1180 |   })
  1181 |   await editor.focus()
  1182 |   await page.keyboard.press('Escape')
  1183 |   await page.keyboard.press('Control+End')
  1184 |   await waitForEditorSelection(editor)
  1185 |   // Native caret navigation can precede ProseMirror's selection observer.
  1186 |   await expect.poll(selection).toMatchObject({ empty: true, atDocumentEnd: true })
  1187 |   await page.keyboard.press('Enter')
> 1188 |   await expect.poll(selection).toMatchObject({ empty: true, atDocumentEnd: true, emptyParagraph: true })
       |                                ^ Error: expect(received).toMatchObject(expected)
  1189 |   await page.keyboard.press('/')
  1190 |   await page.keyboard.type('database')
  1191 |   await expect(page.locator('.p2-slash-menu').getByRole('option')).toHaveCount(1)
  1192 |   await expect(page.locator('.p2-slash-icon[data-icon-name="database"] svg')).toHaveCount(1)
  1193 | }
  1194 | 
  1195 | async function startDatabaseSlash(page: Page) {
  1196 |   await openDatabaseSlashMenu(page)
  1197 |   await page.locator('.p2-slash-menu').getByRole('option', { name: '数据库', exact: true }).click()
  1198 |   await expect(page.getByRole('dialog', { name: '数据库' })).toBeVisible()
  1199 | }
  1200 | 
  1201 | async function startDatabaseSlashFrom(page: Page, target: ReturnType<Page['locator']>) {
  1202 |   await target.click()
  1203 |   await page.keyboard.press('End')
  1204 |   await page.keyboard.press('Enter')
  1205 |   await page.keyboard.press('/')
  1206 |   await page.keyboard.type('database')
  1207 |   await expect(page.locator('.p2-slash-menu').getByRole('option')).toHaveCount(1)
  1208 |   await page.locator('.p2-slash-menu').getByRole('option', { name: '数据库', exact: true }).click()
  1209 |   await expect(page.getByRole('dialog', { name: '数据库' })).toBeVisible()
  1210 | }
  1211 | 
  1212 | const rootDatabase = database('database-root-id', 'Root projects')
  1213 | const nestedDatabase = database('database-nested-id', 'Nested projects')
  1214 | const rootProperties = [
  1215 |   property('root-title', rootDatabase.id, 'Name', 'title'),
  1216 |   property('root-text', rootDatabase.id, 'Notes', 'text'),
  1217 |   property('root-number', rootDatabase.id, 'Points', 'number'),
  1218 |   property('root-checkbox', rootDatabase.id, 'Done', 'checkbox'),
  1219 |   property('root-select', rootDatabase.id, 'Status', 'select', [{ id: 'status-open', name: 'Open' }, { id: 'status-done', name: 'Done' }]),
  1220 |   property('root-date', rootDatabase.id, 'Due', 'date'),
  1221 | ]
  1222 | const basicRecord = record('root-record', rootDatabase.id, 'root-record-page', {
  1223 |   'root-title': 'Launch plan', 'root-text': 'Draft ready', 'root-number': 42,
  1224 |   'root-checkbox': true, 'root-select': 'status-open', 'root-date': '2026-10-04',
  1225 | })
  1226 | 
  1227 | test('database block controls reveal on hover or focus and insert a sibling paragraph below', async ({ page }) => {
  1228 |   const api = await installApi(page, [
  1229 |     block('control-before', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] }, 100),
  1230 |     block('control-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 200),
  1231 |     block('control-after', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'After' }] }, 300),
  1232 |   ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: [rootProperties[0]!], records: [] })
  1233 |   await page.goto('/#/app/database-workspace/page/database-page')
  1234 | 
  1235 |   const editor = page.locator('.eotion-editor-content .tiptap')
  1236 |   const databaseBlock = editor.locator('.eotion-database')
  1237 |   const anchor = editor.locator('.eotion-block-drag-anchor').filter({ has: page.locator('[data-eotion-block-insert="control-database"]') })
  1238 |   const handle = anchor.locator('[data-eotion-drag-handle="control-database"]')
  1239 |   const insert = anchor.getByRole('button', { name: '在数据库区块下方插入区块' })
  1240 |   await expect(anchor).toBeAttached()
  1241 |   expect(await handle.evaluate(element => getComputedStyle(element).opacity)).toBe('0')
  1242 |   await databaseBlock.hover()
  1243 |   await expect.poll(() => handle.evaluate(element => getComputedStyle(element).opacity)).toBe('1')
  1244 |   await page.locator('body').hover({ position: { x: 1, y: 1 } })
  1245 |   await expect.poll(() => handle.evaluate(element => getComputedStyle(element).opacity)).toBe('0')
  1246 |   await handle.focus()
  1247 |   await expect(handle).toBeFocused()
  1248 |   await expect.poll(() => handle.evaluate(element => getComputedStyle(element).opacity)).toBe('1')
  1249 |   expect(await handle.locator('svg').count()).toBe(1)
  1250 | 
  1251 |   await insert.click()
  1252 |   await expect.poll(() => api.blocks.filter(item => item.type === 'paragraph')).toHaveLength(3)
  1253 |   const insertedSibling = databaseBlock.locator('xpath=following-sibling::*[not(contains(@class,"eotion-block-drag-anchor"))][1]')
  1254 |   await expect(insertedSibling).toBeVisible()
  1255 |   expect(await insertedSibling.evaluate(element => element.tagName)).toBe('P')
  1256 | })
  1257 | 
  1258 | test.describe('touch database block controls', () => {
  1259 |   test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  1260 | 
  1261 |   test('hides database block controls on phone without reserving header space', async ({ page }) => {
  1262 |     const api = await installApi(page, [
  1263 |       block('touch-control-before', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'Before touch database' }] }, 50),
  1264 |       block('touch-control-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  1265 |       block('touch-control-toggle', 'toggle', { type: 'eotionToggle', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested controls' }] }] }, 200),
  1266 |       block('touch-control-nested-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: nestedDatabase.id, viewId: 'view-nested-id' } }, 100, 'touch-control-toggle'),
  1267 |       block('touch-control-after', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'After touch database' }] }, 300),
  1268 |     ], {
  1269 |       databases: [rootDatabase, nestedDatabase],
  1270 |       views: [view('view-root-id', rootDatabase.id), view('view-nested-id', nestedDatabase.id)],
  1271 |       properties: [rootProperties[0]!, property('nested-title', nestedDatabase.id, 'Name', 'title')],
  1272 |       records: [],
  1273 |     })
  1274 |     await page.goto('/#/app/database-workspace/page/database-page')
  1275 | 
  1276 |     const anchor = page.locator('.eotion-block-drag-anchor--database').filter({ has: page.locator('[data-eotion-drag-handle="touch-control-database"]') })
  1277 |     const rootHeader = page.locator('#database-block-touch-control-database .eotion-database-header')
  1278 |     await expect.poll(() => anchor.evaluate(element => getComputedStyle(element).display)).toBe('none')
  1279 |     expect(await rootHeader.evaluate(element => getComputedStyle(element).paddingLeft)).toBe('10px')
  1280 | 
  1281 |     const nestedAnchor = page.locator('.eotion-block-drag-anchor--database').filter({ has: page.locator('[data-eotion-drag-handle="touch-control-nested-database"]') })
  1282 |     const nestedHeader = page.locator('.eotion-toggle-body .eotion-database-header')
  1283 |     await expect.poll(() => nestedAnchor.evaluate(element => getComputedStyle(element).display)).toBe('none')
  1284 |     expect(await nestedHeader.evaluate(element => getComputedStyle(element).paddingLeft)).toBe('10px')
  1285 |     for (const id of ['touch-control-before', 'touch-control-database', 'touch-control-toggle', 'touch-control-nested-database', 'touch-control-after']) {
  1286 |       await expect(page.locator(`[data-eotion-block-insert="${id}"]`)).toBeHidden()
  1287 |       await expect(page.locator(`[data-eotion-drag-handle="${id}"]`)).toBeHidden()
  1288 |     }
```