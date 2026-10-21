# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: product-database.spec.ts >> unconfirmed inline database creation fences further create or link attempts until page refresh
- Location: tests\product-database.spec.ts:6977:1

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
  1086 |   await table.getByRole('button', { name: '新建记录', exact: true }).click()
  1087 |   await expect(table.getByRole('textbox', { name: '记录标题' })).toHaveCount(0)
  1088 | }
  1089 | 
  1090 | function openingGroup(page: Page, target: '记录' | '属性', layout: '桌面' | '平板' | '手机') {
  1091 |   return page.getByRole('group', { name: `${target}${layout}打开方式` })
  1092 | }
  1093 | 
  1094 | function openingTrigger(page: Page, target: '记录' | '属性', layout: '桌面' | '平板' | '手机') {
  1095 |   return openingGroup(page, target, layout).getByRole('button', { name: `${target}${layout}打开方式` })
  1096 | }
  1097 | 
  1098 | function openingSettingsPanel(page: Page, target: '记录' | '属性') {
  1099 |   return page.getByRole('group', { name: target === '记录' ? '记录打开方式' : '属性管理' })
  1100 | }
  1101 | 
  1102 | async function expandOpeningChoices(page: Page, target: '记录' | '属性') {
  1103 |   const trigger = page.getByRole('button', { name: '展开其他设备打开方式' })
  1104 |   if (await trigger.isVisible()) await trigger.click()
  1105 |   await expect(openingGroup(page, target, '桌面')).toBeVisible()
  1106 |   await expect(openingGroup(page, target, '平板')).toBeVisible()
  1107 |   await expect(openingGroup(page, target, '手机')).toBeVisible()
  1108 | }
  1109 | 
  1110 | async function selectSettingOption(panel: Locator, label: string, value: string, optionName: string) {
  1111 |   const trigger = panel.getByRole('button', { name: label })
  1112 |   await trigger.click()
  1113 |   const overlay = panel.locator('xpath=ancestor::dialog[1]')
  1114 |   const menu = overlay.getByRole('menu', { name: label })
  1115 |   await menu.getByRole('menuitem', { name: optionName, exact: true }).click()
  1116 |   await expect(trigger).toHaveAttribute('data-value', value)
  1117 | }
  1118 | 
  1119 | async function chooseOpening(page: Page, table: Locator, target: '记录' | '属性', layout: '桌面' | '平板' | '手机', mode: string) {
  1120 |   const menu = page.getByRole('menu', { name: `${target}${layout}打开方式` })
  1121 |   await expect(async () => {
  1122 |     if (!await openingSettingsPanel(page, target).isVisible()) await openDatabaseSetting(page, table, target === '记录' ? '记录打开方式' : '属性')
  1123 |     await expandOpeningChoices(page, target)
  1124 |     if (!await menu.isVisible()) await openingTrigger(page, target, layout).click({ timeout: 1_000 })
  1125 |     await expect(menu).toBeVisible({ timeout: 1_000 })
  1126 |     await menu.getByRole('menuitem', { name: mode, exact: true }).click({ timeout: 1_000 })
  1127 |     if (!await openingSettingsPanel(page, target).isVisible()) await openDatabaseSetting(page, table, target === '记录' ? '记录打开方式' : '属性')
  1128 |     await expect(openingTrigger(page, target, layout)).toContainText(mode, { timeout: 1_000 })
  1129 |   }).toPass({ timeout: 8_000 })
  1130 | }
  1131 | 
  1132 | async function expectOpeningOptions(page: Page, table: Locator, target: '记录' | '属性', layout: '桌面' | '平板' | '手机', options: string[]) {
  1133 |   const menu = page.getByRole('menu', { name: `${target}${layout}打开方式` })
  1134 |   await expect(async () => {
  1135 |     if (!await openingGroup(page, target, layout).isVisible()) await openDatabaseSetting(page, table, target === '记录' ? '记录打开方式' : '属性')
  1136 |     await expandOpeningChoices(page, target)
  1137 |     if (!await menu.isVisible()) await openingTrigger(page, target, layout).click({ timeout: 1_000 })
  1138 |     await expect(menu).toBeVisible({ timeout: 1_000 })
  1139 |     expect((await menu.getByRole('menuitem').allTextContents()).map(text => text.replace('✓', '').trim())).toEqual(options)
  1140 |     await menu.getByRole('menuitem').filter({ has: page.locator('[aria-hidden="true"]') }).click({ timeout: 1_000 })
  1141 |     if (!await openingGroup(page, target, layout).isVisible()) await openDatabaseSetting(page, table, target === '记录' ? '记录打开方式' : '属性')
  1142 |     await expect(openingGroup(page, target, layout)).toBeVisible({ timeout: 1_000 })
  1143 |   }).toPass({ timeout: 8_000 })
  1144 | }
  1145 | 
  1146 | async function closeRecordSurface(page: Page) {
  1147 |   const close = page.getByRole('button', { name: '关闭记录' })
  1148 |   if (await close.isVisible()) {
  1149 |     await close.click()
  1150 |     await expect(close).toHaveCount(0)
  1151 |   }
  1152 | }
  1153 | 
  1154 | async function chooseSelectCell(page: Page, trigger: Locator, option: string) {
  1155 |   const menu = page.locator('.eotion-database-cell-menu')
  1156 |   await expect(trigger).toBeEnabled()
  1157 |   await expect(async () => {
  1158 |     if (!await menu.isVisible()) await trigger.click({ timeout: 1_000 })
  1159 |     await expect(menu).toBeVisible({ timeout: 1_000 })
  1160 |     await menu.getByRole('button', { name: option, exact: true }).click({ timeout: 1_000 })
  1161 |   }).toPass({ timeout: 8_000 })
  1162 | }
  1163 | 
  1164 | async function openDatabaseSlashMenu(page: Page) {
  1165 |   const editor = page.locator('.eotion-editor-content .tiptap')
  1166 |   const selection = () => editor.evaluate(element => {
  1167 |     let component = (element.closest('.eotion-editor') as (HTMLElement & { __vueParentComponent?: any }) | null)?.__vueParentComponent
  1168 |     while (component && component.type?.__name !== 'EotionEditor') component = component.parent
  1169 |     const exposed = component?.exposed?.editor ?? component?.setupState?.editor
  1170 |     const current = (exposed?.commands ? exposed : exposed?.value) as Editor | undefined
  1171 |     const state = current?.state
  1172 |     if (!state) return null
  1173 |     const { empty, $from } = state.selection
  1174 |     return {
  1175 |       empty,
  1176 |       atDocumentEnd: $from.parent.isTextblock && $from.pos === state.doc.content.size - 1,
  1177 |       emptyParagraph: $from.parent.type.name === 'paragraph' && $from.parent.content.size === 0 && $from.parentOffset === 0,
  1178 |     }
  1179 |   })
  1180 |   await editor.click()
  1181 |   await page.keyboard.press('Escape')
  1182 |   await page.keyboard.press('Control+End')
  1183 |   // Native caret navigation can precede ProseMirror's selection observer.
  1184 |   await expect.poll(selection).toMatchObject({ empty: true, atDocumentEnd: true })
  1185 |   await page.keyboard.press('Enter')
> 1186 |   await expect.poll(selection).toMatchObject({ empty: true, atDocumentEnd: true, emptyParagraph: true })
       |                                ^ Error: expect(received).toMatchObject(expected)
  1187 |   await page.keyboard.press('/')
  1188 |   await page.keyboard.type('database')
  1189 |   await expect(page.locator('.p2-slash-menu').getByRole('option')).toHaveCount(1)
  1190 |   await expect(page.locator('.p2-slash-icon[data-icon-name="database"] svg')).toHaveCount(1)
  1191 | }
  1192 | 
  1193 | async function startDatabaseSlash(page: Page) {
  1194 |   await openDatabaseSlashMenu(page)
  1195 |   await page.locator('.p2-slash-menu').getByRole('option', { name: '数据库', exact: true }).click()
  1196 |   await expect(page.getByRole('dialog', { name: '数据库' })).toBeVisible()
  1197 | }
  1198 | 
  1199 | async function startDatabaseSlashFrom(page: Page, target: ReturnType<Page['locator']>) {
  1200 |   await target.click()
  1201 |   await page.keyboard.press('End')
  1202 |   await page.keyboard.press('Enter')
  1203 |   await page.keyboard.press('/')
  1204 |   await page.keyboard.type('database')
  1205 |   await expect(page.locator('.p2-slash-menu').getByRole('option')).toHaveCount(1)
  1206 |   await page.locator('.p2-slash-menu').getByRole('option', { name: '数据库', exact: true }).click()
  1207 |   await expect(page.getByRole('dialog', { name: '数据库' })).toBeVisible()
  1208 | }
  1209 | 
  1210 | const rootDatabase = database('database-root-id', 'Root projects')
  1211 | const nestedDatabase = database('database-nested-id', 'Nested projects')
  1212 | const rootProperties = [
  1213 |   property('root-title', rootDatabase.id, 'Name', 'title'),
  1214 |   property('root-text', rootDatabase.id, 'Notes', 'text'),
  1215 |   property('root-number', rootDatabase.id, 'Points', 'number'),
  1216 |   property('root-checkbox', rootDatabase.id, 'Done', 'checkbox'),
  1217 |   property('root-select', rootDatabase.id, 'Status', 'select', [{ id: 'status-open', name: 'Open' }, { id: 'status-done', name: 'Done' }]),
  1218 |   property('root-date', rootDatabase.id, 'Due', 'date'),
  1219 | ]
  1220 | const basicRecord = record('root-record', rootDatabase.id, 'root-record-page', {
  1221 |   'root-title': 'Launch plan', 'root-text': 'Draft ready', 'root-number': 42,
  1222 |   'root-checkbox': true, 'root-select': 'status-open', 'root-date': '2026-10-04',
  1223 | })
  1224 | 
  1225 | test('database block controls reveal on hover or focus and insert a sibling paragraph below', async ({ page }) => {
  1226 |   const api = await installApi(page, [
  1227 |     block('control-before', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] }, 100),
  1228 |     block('control-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 200),
  1229 |     block('control-after', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'After' }] }, 300),
  1230 |   ], { databases: [rootDatabase], views: [view('view-root-id', rootDatabase.id)], properties: [rootProperties[0]!], records: [] })
  1231 |   await page.goto('/#/app/database-workspace/page/database-page')
  1232 | 
  1233 |   const editor = page.locator('.eotion-editor-content .tiptap')
  1234 |   const databaseBlock = editor.locator('.eotion-database')
  1235 |   const anchor = editor.locator('.eotion-block-drag-anchor').filter({ has: page.locator('[data-eotion-block-insert="control-database"]') })
  1236 |   const handle = anchor.locator('[data-eotion-drag-handle="control-database"]')
  1237 |   const insert = anchor.getByRole('button', { name: '在数据库区块下方插入区块' })
  1238 |   await expect(anchor).toBeAttached()
  1239 |   expect(await handle.evaluate(element => getComputedStyle(element).opacity)).toBe('0')
  1240 |   await databaseBlock.hover()
  1241 |   await expect.poll(() => handle.evaluate(element => getComputedStyle(element).opacity)).toBe('1')
  1242 |   await page.locator('body').hover({ position: { x: 1, y: 1 } })
  1243 |   await expect.poll(() => handle.evaluate(element => getComputedStyle(element).opacity)).toBe('0')
  1244 |   await handle.focus()
  1245 |   await expect(handle).toBeFocused()
  1246 |   await expect.poll(() => handle.evaluate(element => getComputedStyle(element).opacity)).toBe('1')
  1247 |   expect(await handle.locator('svg').count()).toBe(1)
  1248 | 
  1249 |   await insert.click()
  1250 |   await expect.poll(() => api.blocks.filter(item => item.type === 'paragraph')).toHaveLength(3)
  1251 |   const insertedSibling = databaseBlock.locator('xpath=following-sibling::*[not(contains(@class,"eotion-block-drag-anchor"))][1]')
  1252 |   await expect(insertedSibling).toBeVisible()
  1253 |   expect(await insertedSibling.evaluate(element => element.tagName)).toBe('P')
  1254 | })
  1255 | 
  1256 | test.describe('touch database block controls', () => {
  1257 |   test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  1258 | 
  1259 |   test('hides database block controls on phone without reserving header space', async ({ page }) => {
  1260 |     const api = await installApi(page, [
  1261 |       block('touch-control-before', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'Before touch database' }] }, 50),
  1262 |       block('touch-control-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: 'view-root-id' } }, 100),
  1263 |       block('touch-control-toggle', 'toggle', { type: 'eotionToggle', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested controls' }] }] }, 200),
  1264 |       block('touch-control-nested-database', 'database', { type: 'eotionDatabase', attrs: { databaseId: nestedDatabase.id, viewId: 'view-nested-id' } }, 100, 'touch-control-toggle'),
  1265 |       block('touch-control-after', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: 'After touch database' }] }, 300),
  1266 |     ], {
  1267 |       databases: [rootDatabase, nestedDatabase],
  1268 |       views: [view('view-root-id', rootDatabase.id), view('view-nested-id', nestedDatabase.id)],
  1269 |       properties: [rootProperties[0]!, property('nested-title', nestedDatabase.id, 'Name', 'title')],
  1270 |       records: [],
  1271 |     })
  1272 |     await page.goto('/#/app/database-workspace/page/database-page')
  1273 | 
  1274 |     const anchor = page.locator('.eotion-block-drag-anchor--database').filter({ has: page.locator('[data-eotion-drag-handle="touch-control-database"]') })
  1275 |     const rootHeader = page.locator('#database-block-touch-control-database .eotion-database-header')
  1276 |     await expect.poll(() => anchor.evaluate(element => getComputedStyle(element).display)).toBe('none')
  1277 |     expect(await rootHeader.evaluate(element => getComputedStyle(element).paddingLeft)).toBe('10px')
  1278 | 
  1279 |     const nestedAnchor = page.locator('.eotion-block-drag-anchor--database').filter({ has: page.locator('[data-eotion-drag-handle="touch-control-nested-database"]') })
  1280 |     const nestedHeader = page.locator('.eotion-toggle-body .eotion-database-header')
  1281 |     await expect.poll(() => nestedAnchor.evaluate(element => getComputedStyle(element).display)).toBe('none')
  1282 |     expect(await nestedHeader.evaluate(element => getComputedStyle(element).paddingLeft)).toBe('10px')
  1283 |     for (const id of ['touch-control-before', 'touch-control-database', 'touch-control-toggle', 'touch-control-nested-database', 'touch-control-after']) {
  1284 |       await expect(page.locator(`[data-eotion-block-insert="${id}"]`)).toBeHidden()
  1285 |       await expect(page.locator(`[data-eotion-drag-handle="${id}"]`)).toBeHidden()
  1286 |     }
```