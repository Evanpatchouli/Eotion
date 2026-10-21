# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: product-database.spec.ts >> unconfirmed inline database creation fences further create or link attempts until page refresh
- Location: tests\product-database.spec.ts:6965:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('.p2-slash-menu').getByRole('option', { name: '数据库', exact: true })

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
  6894 | 
  6895 |   await page.reload()
  6896 |   await expect(page.locator('.eotion-editor-content .tiptap .eotion-database')).toHaveCount(2)
  6897 |   await expect(page.locator('.eotion-database').first()).toContainText('Root projects')
  6898 |   await expect(page.locator('.eotion-editor-content .tiptap')).toContainText('Edited Before')
  6899 |   expect(api.blocks.find((item) => item.id === 'database-root')?.id).toBe('database-root')
  6900 |   expect(api.blocks.find((item) => item.id === 'database-nested')).toMatchObject({
  6901 |     id: 'database-nested', parentBlockId: 'toggle',
  6902 |     props: { node: { type: 'eotionDatabase', attrs: { databaseId: 'database-nested-id', viewId: 'view-nested-id' } } },
  6903 |   })
  6904 | 
  6905 |   const rootPlaceholder = page.locator('.eotion-editor-content .tiptap .eotion-database').first()
  6906 |   await rootPlaceholder.locator('.eotion-database-copy').click()
  6907 |   await page.keyboard.press('Backspace')
  6908 |   await expect(page.locator('.eotion-editor-content .tiptap .eotion-database')).toHaveCount(1)
  6909 |   await expect.poll(() => api.blocks.some((item) => item.id === 'database-root')).toBe(false)
  6910 |   expect(api.databases.some((item) => item.id === rootDatabase.id)).toBe(true)
  6911 |   expect(api.properties.some((item) => item.databaseId === rootDatabase.id)).toBe(true)
  6912 |   expect(api.views.some((item) => item.databaseId === rootDatabase.id)).toBe(true)
  6913 |   expect(api.records.some((item) => item.databaseId === rootDatabase.id)).toBe(true)
  6914 |   expect(api.blocks.map((item) => item.id)).toEqual(expect.arrayContaining(['before', 'toggle', 'database-nested', 'divider', 'image', 'file', 'after']))
  6915 |   expect(errors).toEqual([])
  6916 | 
  6917 |   await page.reload()
  6918 |   await expect(page.locator('.eotion-editor-content .tiptap .eotion-database')).toHaveCount(1)
  6919 |   await expect(page.locator('.eotion-editor-content .tiptap')).toContainText('Edited Before')
  6920 |   await expect(page.locator('.eotion-editor-content .tiptap')).toContainText('After')
  6921 |   expect(api.blocks.some((item) => item.id === 'database-nested')).toBe(true)
  6922 | })
  6923 | 
  6924 | test('slash creates a database table and preserves the reference ID after reload', async ({ page }) => {
  6925 |   const api = await installApi(page, [
  6926 |     block('body-before-create', 'paragraph', { type: 'paragraph', content: [{ type: 'text', text: '正文保留' }] }, 100),
  6927 |   ])
  6928 |   await page.goto('/#/app/database-workspace/page/database-page')
  6929 |   await startDatabaseSlash(page)
  6930 |   await page.getByRole('button', { name: '创建新数据库' }).click()
  6931 |   await page.getByRole('textbox', { name: '数据库名称' }).fill('Sprint board')
  6932 |   await page.getByRole('button', { name: '创建数据库', exact: true }).click()
  6933 |   const table = page.locator('.eotion-editor-content .tiptap .eotion-database')
  6934 |   await expect(table).toContainText('Sprint board')
  6935 |   await expect(table).toContainText('暂无记录')
  6936 |   await expect(page.locator('.eotion-editor-content .tiptap')).toContainText('正文保留')
  6937 |   await expect.poll(() => api.databases.some((item) => item.name === 'Sprint board')).toBe(true)
  6938 |   const createdBlock = api.blocks.find((item) => item.type === 'database')
  6939 |   expect(createdBlock).toBeDefined()
  6940 |   const savedReference = (createdBlock?.props as any)?.node?.attrs
  6941 |   expect(savedReference?.databaseId).toBe(api.databases[0]?.id)
  6942 |   const stableBlockId = createdBlock?.id
  6943 |   await page.reload()
  6944 |   const reloadedBlock = api.blocks.find((item) => item.id === stableBlockId)
  6945 |   expect(reloadedBlock?.id).toBe(stableBlockId)
  6946 |   expect((reloadedBlock?.props as any)?.node?.attrs).toEqual(savedReference)
  6947 |   await expect(page.locator('.eotion-editor-content .tiptap .eotion-database')).toContainText('Sprint board')
  6948 |   await expect(page.locator('.eotion-editor-content .tiptap')).toContainText('正文保留')
  6949 | })
  6950 | 
  6951 | test('committed inline database creation is recovered by its fixed block ID after a lost response', async ({ page }) => {
  6952 |   const api = await installApi(page, [], { abortDatabaseCreatesAfterCommit: 1 })
  6953 |   await page.goto('/#/app/database-workspace/page/database-page')
  6954 |   await startDatabaseSlash(page)
  6955 |   await page.getByRole('button', { name: '创建新数据库' }).click()
  6956 |   await page.getByRole('textbox', { name: '数据库名称' }).fill('Recovered board')
  6957 |   await page.getByRole('button', { name: '创建数据库', exact: true }).click()
  6958 |   await expect(page.locator('.eotion-editor-content .eotion-database')).toContainText('Recovered board')
  6959 |   expect(api.databases.filter((item) => item.name === 'Recovered board')).toHaveLength(1)
  6960 |   expect(api.blocks.filter((item) => item.type === 'database')).toHaveLength(1)
  6961 |   expect(api.requests.filter(({ method, path }) => method === 'POST' && path.endsWith('/databases'))).toHaveLength(1)
  6962 |   expect(api.requests.filter(({ method, path }) => method === 'GET' && /\/blocks\/[^/]+$/u.test(path))).toHaveLength(1)
  6963 | })
  6964 | 
  6965 | test('unconfirmed inline database creation fences further create or link attempts until page refresh', async ({ page }) => {
  6966 |   const api = await installApi(page, [], { abortDatabaseCreatesAfterCommit: 1, failDatabaseReferenceReads: 1 })
  6967 |   api.pages.push({ ...pageRecord, id: 'other-database-page', title: 'Other page', orderKey: '0000000000000002' })
  6968 |   await page.goto('/#/app/database-workspace/page/database-page')
  6969 |   await startDatabaseSlash(page)
  6970 |   await page.getByRole('button', { name: '创建新数据库' }).click()
  6971 |   await page.getByRole('textbox', { name: '数据库名称' }).fill('Uncertain board')
  6972 |   await page.getByRole('button', { name: '创建数据库', exact: true }).click()
  6973 |   const editor = page.locator('.eotion-editor-content .tiptap')
  6974 |   const uncertainMessage = '上次数据库操作结果尚未确认，请联网并刷新页面后确认；正文可继续编辑。'
  6975 |   await expect(page.getByRole('alert')).toContainText(uncertainMessage)
  6976 |   await expect(editor).toHaveAttribute('contenteditable', 'true')
  6977 | 
  6978 |   await page.getByRole('button', { name: 'Other page', exact: true }).click()
  6979 |   await expect(page).toHaveURL(/other-database-page$/u)
  6980 |   await expect(page.locator('.eotion-editor-content .tiptap')).toBeVisible()
  6981 |   await page.getByRole('button', { name: 'Database references', exact: true }).click()
  6982 |   await expect(page).toHaveURL(/database-page$/u)
  6983 |   await expect(editor).toBeVisible()
  6984 |   await expect.poll(() => page.evaluate(async () => {
  6985 |     const { isProductDatabaseInsertionUncertain } = await import('/src/services/productDatabases.ts')
  6986 |     return isProductDatabaseInsertionUncertain('database-user', 'database-workspace', 'database-page')
  6987 |   })).toBe(true)
  6988 |   await editor.click()
  6989 |   await page.keyboard.press('Escape')
  6990 |   await page.keyboard.press('Control+End')
  6991 |   await page.keyboard.press('Enter')
  6992 |   await page.keyboard.press('/')
  6993 |   await page.keyboard.type('database')
> 6994 |   await page.locator('.p2-slash-menu').getByRole('option', { name: '数据库', exact: true }).click()
       |                                                                                          ^ Error: locator.click: Test timeout of 30000ms exceeded.
  6995 |   await expect(page.getByRole('alert')).toContainText(uncertainMessage)
  6996 |   expect(api.requests.filter(({ method, path }) => method === 'POST' && (path.endsWith('/databases') || path.endsWith('/database-links')))).toHaveLength(1)
  6997 | })
  6998 | 
  6999 | test('committed inline database creation fences its original user when auth switches before the response', async ({ page }) => {
  7000 |   const api = await installApi(page, [], { holdDatabaseCreateResponse: true })
  7001 |   await page.goto('/#/app/database-workspace/page/database-page')
  7002 |   await startDatabaseSlash(page)
  7003 |   await page.getByRole('button', { name: '创建新数据库' }).click()
  7004 |   await page.getByRole('textbox', { name: '数据库名称' }).fill('Auth switched board')
  7005 |   await page.getByRole('button', { name: '创建数据库', exact: true }).click()
  7006 |   await api.databaseCreateResponseStarted
  7007 |   expect(api.databases.filter((item) => item.name === 'Auth switched board')).toHaveLength(1)
  7008 |   expect(api.blocks.filter((item) => item.type === 'database')).toHaveLength(1)
  7009 | 
  7010 |   await page.evaluate(async () => {
  7011 |     const { useAuthStore } = await import('/src/stores/auth.ts')
  7012 |     useAuthStore().user = { id: 'other-user', email: 'other@example.test', displayName: 'Other user', createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T00:00:00.000Z' }
  7013 |   })
  7014 |   api.releaseDatabaseCreateResponse()
  7015 |   const fenceMessage = '上次数据库操作结果尚未确认，请联网并刷新页面后确认；正文可继续编辑。'
  7016 |   await expect(page.getByRole('alert')).toContainText('数据库已创建，但登录状态已切换。')
  7017 | 
  7018 |   await page.evaluate(async () => {
  7019 |     const { useAuthStore } = await import('/src/stores/auth.ts')
  7020 |     useAuthStore().user = { id: 'database-user', email: 'database@example.com', displayName: 'Database user', createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T00:00:00.000Z' }
  7021 |   })
  7022 |   expect(await page.evaluate(async () => {
  7023 |     const { isProductDatabaseInsertionUncertain } = await import('/src/services/productDatabases.ts')
  7024 |     return isProductDatabaseInsertionUncertain('database-user', 'database-workspace', 'database-page')
  7025 |   })).toBe(true)
  7026 | 
  7027 |   const editor = page.locator('.eotion-editor-content .tiptap')
  7028 |   await editor.click()
  7029 |   await page.keyboard.press('Escape')
  7030 |   await page.keyboard.press('Control+End')
  7031 |   await page.keyboard.press('Enter')
  7032 |   await page.keyboard.press('/')
  7033 |   await page.keyboard.type('database')
  7034 |   await page.locator('.p2-slash-menu').getByRole('option', { name: '数据库', exact: true }).click()
  7035 |   await expect(page.getByRole('alert')).toContainText(fenceMessage)
  7036 |   expect(api.databases.filter((item) => item.name === 'Auth switched board')).toHaveLength(1)
  7037 |   expect(api.blocks.filter((item) => item.type === 'database')).toHaveLength(1)
  7038 |   expect(api.requests.filter(({ method, path }) => method === 'POST' && path.endsWith('/databases'))).toHaveLength(1)
  7039 | })
  7040 | 
  7041 | test('mobile slash database dialog stays within the viewport', async ({ page }) => {
  7042 |   await page.setViewportSize({ width: 390, height: 844 })
  7043 |   const api = await installApi(page, [])
  7044 |   await page.goto('/#/app/database-workspace/page/database-page')
  7045 |   await startDatabaseSlash(page)
  7046 |   const dialog = page.getByRole('dialog', { name: '数据库' })
  7047 |   await expect(dialog.getByRole('heading', { level: 2 })).toHaveCount(1)
  7048 |   await expect(dialog.getByRole('button', { name: /关闭/u })).toHaveCount(1)
  7049 |   const choices = dialog.locator('.database-command-option')
  7050 |   await expect(choices).toHaveCount(2)
  7051 |   for (const choice of await choices.all()) {
  7052 |     expect((await choice.boundingBox())!.height).toBeGreaterThanOrEqual(96)
  7053 |     expect(await choice.evaluate(element => {
  7054 |       const style = getComputedStyle(element)
  7055 |       return [style.textAlign, style.alignItems, style.justifyContent]
  7056 |     })).toEqual(['center', 'center', 'center'])
  7057 |   }
  7058 |   await dialog.getByRole('button', { name: '创建新数据库' }).click()
  7059 |   await expect(dialog.getByRole('textbox', { name: '数据库名称' })).toBeVisible()
  7060 |   await expect(dialog.locator('label[for="database-name"]')).toHaveCount(0)
  7061 |   await expect(dialog.getByRole('textbox', { name: '数据库名称' })).toHaveAttribute('placeholder', '数据库名字')
  7062 |   const footer = dialog.locator('.eotion-product-overlay__footer')
  7063 |   const back = footer.getByRole('button', { name: '返回', exact: true })
  7064 |   const cancel = footer.getByRole('button', { name: '取消', exact: true })
  7065 |   const submit = footer.getByRole('button', { name: '创建数据库', exact: true })
  7066 |   await expect(footer).toBeVisible()
  7067 |   await screenshot(page, 'database-create-footer-mobile-390')
  7068 |   await expect(back.locator('svg')).toHaveCount(1)
  7069 |   await expect(submit).toHaveAttribute('form', 'database-create-database-page')
  7070 |   const [footerBounds, backBounds, cancelBounds, submitBounds] = await Promise.all([footer.boundingBox(), back.boundingBox(), cancel.boundingBox(), submit.boundingBox()])
  7071 |   expect(footerBounds).not.toBeNull()
  7072 |   expect(backBounds!.x).toBeGreaterThanOrEqual(footerBounds!.x)
  7073 |   expect(backBounds!.x).toBeLessThan(cancelBounds!.x)
  7074 |   expect(cancelBounds!.x).toBeLessThan(submitBounds!.x)
  7075 |   expect(submitBounds!.x + submitBounds!.width).toBeLessThanOrEqual(footerBounds!.x + footerBounds!.width)
  7076 |   await expect(dialog.getByRole('heading', { level: 2 })).toHaveCount(1)
  7077 |   const bounds = await dialog.boundingBox()
  7078 |   expect(bounds).not.toBeNull()
  7079 |   expect(bounds!.x).toBeGreaterThanOrEqual(0)
  7080 |   expect(bounds!.y).toBeGreaterThanOrEqual(0)
  7081 |   expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
  7082 |   expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844)
  7083 |   await back.click()
  7084 |   await expect(dialog.getByRole('button', { name: '创建新数据库' })).toBeVisible()
  7085 |   await dialog.getByRole('button', { name: '创建新数据库' }).click()
  7086 |   await dialog.getByRole('textbox', { name: '数据库名称' }).fill('Mobile board')
  7087 |   await cancel.click()
  7088 |   await expect(dialog).not.toBeVisible()
  7089 | 
  7090 |   await startDatabaseSlash(page)
  7091 |   const reopenedDialog = page.getByRole('dialog', { name: '数据库' })
  7092 |   await reopenedDialog.getByRole('button', { name: '创建新数据库' }).click()
  7093 |   await reopenedDialog.getByRole('textbox', { name: '数据库名称' }).fill('Mobile board')
  7094 |   await reopenedDialog.locator('.eotion-product-overlay__footer').getByRole('button', { name: '创建数据库', exact: true }).click()
```