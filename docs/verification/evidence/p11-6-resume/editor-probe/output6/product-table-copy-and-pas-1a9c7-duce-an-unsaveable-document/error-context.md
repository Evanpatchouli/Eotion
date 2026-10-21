# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: product-table.spec.ts >> copy and paste inside cells and plain/TSV paste never produce an unsaveable document
- Location: ..\..\..\..\AppData\Local\Temp\eotion-p116-resume-dfbb4269eb4c4a6794279c34f3d9ba5d\editor-probe\product-table.spec.ts:245:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [ref=e4]:
  - complementary "工作区导航" [ref=e5]:
    - generic [ref=e6]:
      - strong [ref=e8]: Eotion
      - generic "table@example.com" [ref=e10]
      - button "收起侧边栏" [ref=e11] [cursor=pointer]
    - generic [ref=e14]:
      - generic [ref=e15]: 工作区
      - generic [ref=e17]:
        - generic [aria-hidden] [ref=e18]: T
        - generic [ref=e19]: Table space
        - button "切换工作区" [ref=e20] [cursor=pointer]
    - generic [ref=e24]:
      - generic [ref=e25]:
        - generic [ref=e26]: 页面
        - button "新建根页面" [ref=e27] [cursor=pointer]
      - tree "页面树" [ref=e30]:
        - treeitem [level=1] [selected] [ref=e31]:
          - generic [ref=e34]:
            - button "Table" [ref=e35] [cursor=pointer]
            - button "页面操作：Table" [ref=e41] [cursor=pointer]
    - generic [ref=e44]:
      - button "设置" [ref=e46] [cursor=pointer]
      - button "退出登录" [ref=e50] [cursor=pointer]
  - main [ref=e53]:
    - generic [ref=e54]:
      - generic [ref=e55]: Table space / Table
      - status [ref=e56]: 已同步
    - article [ref=e58]:
      - generic [ref=e59]:
        - paragraph [ref=e60]: Table space
        - heading "Table" [level=1] [ref=e62]
        - region "Tiptap 编辑器" [ref=e63]:
          - button "选择图片附件" [ref=e64]
          - button "选择文件附件" [ref=e65]
          - generic [ref=e66]:
            - textbox "页面正文编辑区域" [active] [ref=e67]:
              - generic:
                - button "在区块下方插入区块" [ref=e68] [cursor=pointer]
                - button "拖动区块" [ref=e70]
              - table [ref=e79]:
                - rowgroup [ref=e84]:
                  - row [ref=e85]:
                    - columnheader [ref=e86]:
                      - paragraph [ref=e87]
                    - columnheader [ref=e88]:
                      - paragraph [ref=e89]: X Y
                      - paragraph [ref=e90]: Z W
                    - columnheader [ref=e91]:
                      - paragraph [ref=e92]: C
                  - row [ref=e93]:
                    - cell [ref=e94]:
                      - paragraph [ref=e95]: D
                    - cell [ref=e96]:
                      - paragraph [ref=e97]: A
                    - cell [ref=e98]:
                      - paragraph [ref=e99]: F
                  - row [ref=e100]:
                    - cell [ref=e101]:
                      - paragraph [ref=e102]: G
                    - cell [ref=e103]:
                      - paragraph [ref=e104]: H
                    - cell [ref=e105]:
                      - paragraph [ref=e106]: I
              - generic:
                - button "在区块下方插入区块" [ref=e107] [cursor=pointer]
                - button "拖动区块" [ref=e109]
              - paragraph [ref=e117]: Tail
            - toolbar "表格操作" [ref=e119]:
              - button "表格操作" [ref=e120] [cursor=pointer]: 表格 ⋯
```

# Test source

```ts
  180 |   await page.goto(pageUrl())
  181 |   await editor(page).locator('tr').nth(2).locator('td').nth(2).click();await waitDomSelection(page)
  182 |   await page.keyboard.press('End')
  183 |   await page.keyboard.press('Tab')
  184 |   await page.keyboard.type('J')
  185 |   await expect.poll(() => tableGridFromProps(server).length, { timeout: 5000 }).toBe(4)
  186 |   expect(tableGridFromProps(server)[3]).toEqual(['J', '', ''])
  187 |   expect(savedTable(server)?.id).toBe('table-a')
  188 |   await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  189 |   await page.reload()
  190 |   await expect(editor(page).locator('tbody tr')).toHaveCount(4)
  191 |   await expect(editor(page).getByText('J', { exact: true })).toBeVisible()
  192 | })
  193 | 
  194 | test('table menu adds and removes rows and columns and deletes the whole table', async ({ page }) => {
  195 |   const server: Server = { blocks: [tableBlock('table-a', grid3x3, 100), paragraph('tail', '', 200)], offline: false, requests: [] }
  196 |   await installApi(page, server)
  197 |   await page.goto(pageUrl())
  198 | 
  199 |   await openTableMenuAt(page, 1, 1)
  200 |   await page.getByRole('button', { name: '在下方插入行' }).click()
  201 |   await expect.poll(() => tableGridFromProps(server).length, { timeout: 5000 }).toBe(4)
  202 | 
  203 |   await openTableMenuAt(page, 1, 1)
  204 |   await page.getByRole('button', { name: '在右侧插入列' }).click()
  205 |   await expect.poll(() => tableGridFromProps(server).every((row) => row.length === 4), { timeout: 5000 }).toBe(true)
  206 | 
  207 |   await openTableMenuAt(page, 1, 1)
  208 |   await page.getByRole('button', { name: '删除当前列' }).click()
  209 |   await expect.poll(() => tableGridFromProps(server).every((row) => row.length === 3), { timeout: 5000 }).toBe(true)
  210 | 
  211 |   await openTableMenuAt(page, 1, 0)
  212 |   await page.getByRole('button', { name: '删除当前行' }).click()
  213 |   await expect.poll(() => tableGridFromProps(server).length, { timeout: 5000 }).toBe(3)
  214 |   await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  215 |   expect(savedTable(server)?.id).toBe('table-a')
  216 | 
  217 |   // A cursor outside the table hides the contextual menu.
  218 |   await editor(page).locator(':scope > p').last().click()
  219 |   await expect(page.getByRole('button', { name: '表格操作' })).toHaveCount(0)
  220 | 
  221 |   await openTableMenuAt(page, 0, 0)
  222 |   await page.getByRole('button', { name: '删除表格' }).click()
  223 |   await expect(editor(page).locator('table')).toHaveCount(0)
  224 |   await expect.poll(() => server.blocks.some((block) => block.type === 'table'), { timeout: 5000 }).toBe(false)
  225 |   await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  226 |   await page.reload()
  227 |   await expect(editor(page).locator('table')).toHaveCount(0)
  228 | })
  229 | 
  230 | test('removing the only block of the page replaces the table with a paragraph', async ({ page }) => {
  231 |   const server: Server = { blocks: [tableBlock('table-only', grid3x3, 100)], offline: false, requests: [] }
  232 |   await installApi(page, server)
  233 |   await page.goto(pageUrl())
  234 |   await openTableMenuAt(page, 0, 0)
  235 |   await page.getByRole('button', { name: '删除表格' }).click()
  236 |   await expect(editor(page).locator('table')).toHaveCount(0)
  237 |   await expect(editor(page).locator(':scope > p')).toHaveCount(1)
  238 |   await expect.poll(() => server.blocks.map((block) => block.type), { timeout: 5000 }).toEqual(['paragraph'])
  239 |   await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  240 |   await page.reload()
  241 |   await expect(editor(page).locator('table')).toHaveCount(0)
  242 |   await expect(editor(page).locator(':scope > p')).toHaveCount(1)
  243 | })
  244 | 
  245 | test('copy and paste inside cells and plain/TSV paste never produce an unsaveable document', async ({ page }) => {
  246 |   const server: Server = { blocks: [tableBlock('table-a', grid3x3, 100), paragraph('tail', 'Tail', 200)], offline: false, requests: [] }
  247 |   await installApi(page, server)
  248 |   await page.goto(pageUrl())
  249 |   const body = editor(page)
  250 |   await expect(body.locator('table')).toBeVisible()
  251 | 
  252 |   // Copy one cell's text and paste it into another cell: structure is preserved.
  253 |   await setCellSelection(page, 0, 0, 0, 0)
  254 |   expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('A')
  255 |   await page.keyboard.press('Control+C')
  256 |   await setCellSelection(page, 1, 1, 1, 1)
  257 |   await page.keyboard.press('Control+V')
  258 |   await expect(body.getByText('E', { exact: true })).toHaveCount(0)
  259 |   expect(await tableGrid(page)).toEqual([['A', 'B', 'C'], ['D', 'A', 'F'], ['G', 'H', 'I']])
  260 |   await expect.poll(() => tableGridFromProps(server)[1]?.[1], { timeout: 5000 }).toBe('A')
  261 | 
  262 |   // Copying a range that spans several cells keeps the grid valid and saveable.
  263 |   await setCellSelection(page, 0, 0, 0, 1)
  264 |   const copied = await page.evaluate(() => window.getSelection()?.toString() ?? '')
  265 |   expect(copied).toContain('A')
  266 |   expect(copied).toContain('B')
  267 |   await page.keyboard.press('Control+C')
  268 |   await expect(body.locator('tbody tr')).toHaveCount(3)
  269 |   await expect(body.locator('th')).toHaveCount(3)
  270 |   await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  271 | 
  272 |   // Pasted tab/newline text stays plain text; it must not fabricate block nodes.
  273 |   await body.locator(':scope > p').last().click()
  274 |   await page.evaluate(() => {
  275 |     const target = document.querySelector('.eotion-editor-content .tiptap')!
  276 |     const transfer = new DataTransfer()
  277 |     transfer.setData('text/plain', 'X\tY\nZ\tW')
  278 |     target.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }))
  279 |   })
> 280 |   await expect.poll(() => JSON.stringify(server.blocks.find((block) => block.id === 'tail')?.props ?? {}).includes('X'), { timeout: 5000 }).toBe(true)
      |                                                                                                                                             ^ Error: expect(received).toBe(expected) // Object.is equality
  281 |   await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  282 |   expect(server.blocks.every((block) => ['table', 'paragraph'].includes(block.type))).toBe(true)
  283 |   expect(server.blocks.every((block) => block.parentBlockId === null)).toBe(true)
  284 |   // The same grid is still intact after all clipboard work.
  285 |   await page.reload()
  286 |   expect(await tableGrid(page)).toEqual([['A', 'B', 'C'], ['D', 'A', 'F'], ['G', 'H', 'I']])
  287 | })
  288 | 
  289 | test('a table block drags and reorders without losing its grid or identity', async ({ page }) => {
  290 |   const server: Server = { blocks: [tableBlock('table-a', grid3x3, 100), paragraph('before', 'Before', 50), paragraph('after', 'After', 200)], offline: false, requests: [] }
  291 |   await installApi(page, server)
  292 |   await page.goto(pageUrl())
  293 |   const body = editor(page)
  294 |   const handle = body.locator('[data-eotion-drag-handle="table-a"]')
  295 |   await expect(handle).toBeAttached()
  296 |   await handle.dragTo(body.getByText('Before', { exact: true }), { targetPosition: { x: 10, y: 4 } })
  297 |   await expect.poll(() => {
  298 |     const roots = server.blocks.filter((block) => !block.parentBlockId).sort((a, b) => a.orderKey.localeCompare(b.orderKey))
  299 |     return roots.map((block) => block.id)
  300 |   }).toEqual(['table-a', 'before', 'after'])
  301 |   expect(savedTable(server)?.id).toBe('table-a')
  302 |   await page.reload()
  303 |   expect(await tableGrid(page)).toEqual(grid3x3)
  304 | })
  305 | 
  306 | test('a table nests under a toggle and cell Tab never indents the table block', async ({ page }) => {
  307 |   const server: Server = { blocks: [toggle('toggle-a', 'Parent', 100), tableBlock('table-a', grid3x3, 200), paragraph('tail', '', 300)], offline: false, requests: [] }
  308 |   await installApi(page, server)
  309 |   await page.goto(pageUrl())
  310 |   const body = editor(page)
  311 |   await body.locator('[data-eotion-drag-handle="table-a"]').dragTo(body.locator('.eotion-toggle'), { targetPosition: { x: 30, y: 16 } })
  312 |   await expect.poll(() => savedTable(server)?.parentBlockId).toBe('toggle-a')
  313 |   await expect(body.locator('.eotion-toggle table')).toHaveCount(1)
  314 |   await page.reload()
  315 |   await expect(editor(page).locator('.eotion-toggle table')).toHaveCount(1)
  316 | 
  317 |   const headers = editor(page).locator('.eotion-toggle th')
  318 |   await expect(headers).toHaveCount(3)
  319 |   await headers.first().click();await waitDomSelection(page)
  320 |   await page.keyboard.press('Home')
  321 |   await page.keyboard.press('Tab')
  322 |   // Tab navigates cells; it must not parent the table to a previous sibling.
  323 |   await page.keyboard.press('End')
  324 |   await page.keyboard.type('moved')
  325 |   await expect(editor(page).locator('.eotion-toggle th').nth(1)).toHaveText('Bmoved')
  326 |   expect(savedTable(server)?.parentBlockId).toBe('toggle-a')
  327 | })
  328 | 
  329 | test('a table created in a toggle summary can be deleted without emptying the toggle', async ({ page }) => {
  330 |   const server: Server = { blocks: [toggle('toggle-a', 'Parent', 100), paragraph('tail', '', 200)], offline: false, requests: [] }
  331 |   await installApi(page, server)
  332 |   await page.goto(pageUrl())
  333 |   const body = editor(page)
  334 |   // Creating a table on the summary line makes the table the toggle's only child.
  335 |   await body.locator('.eotion-toggle p').first().click()
  336 |   await page.keyboard.press('Home')
  337 |   await page.keyboard.press('/')
  338 |   await page.locator('.p2-slash-menu').getByRole('option', { name: '表格', exact: true }).click()
  339 |   await expect(body.locator('.eotion-toggle table')).toHaveCount(1)
  340 |   await expect.poll(() => JSON.stringify(server.blocks.find((block) => block.id === 'toggle-a')?.props ?? {}).includes('"table"'), { timeout: 5000 }).toBe(true)
  341 | 
  342 |   await openTableMenuAt(page, 0, 0)
  343 |   await page.getByRole('button', { name: '删除表格' }).click()
  344 |   await expect(body.locator('table')).toHaveCount(0)
  345 |   // The toggle keeps exactly one paragraph summary and stays saveable.
  346 |   await expect(body.locator('.eotion-toggle p')).toHaveCount(1)
  347 |   await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  348 |   await expect.poll(() => {
  349 |     const node = (server.blocks.find((block) => block.id === 'toggle-a')?.props as any)?.node
  350 |     return node?.content?.map((child: any) => child.type)
  351 |   }, { timeout: 5000 }).toEqual(['paragraph'])
  352 |   await page.reload()
  353 |   await expect(editor(page).locator('.eotion-toggle p')).toHaveCount(1)
  354 |   await expect(editor(page).locator('table')).toHaveCount(0)
  355 | })
  356 | 
  357 | test('cell inline marks and hard breaks persist through save and reload', async ({ page }) => {
  358 |   const server: Server = { blocks: [tableBlock('table-a', grid3x3, 100), paragraph('tail', '', 200)], offline: false, requests: [] }
  359 |   await installApi(page, server)
  360 |   await page.goto(pageUrl())
  361 |   const body = editor(page)
  362 |   await body.getByText('E', { exact: true }).click()
  363 |   await page.keyboard.press('End')
  364 |   await page.keyboard.type(' note')
  365 |   await page.keyboard.press('Shift+Enter')
  366 |   await page.keyboard.type('line two')
  367 |   await setCellSelection(page, 1, 1, 1, 1)
  368 |   await page.keyboard.press('Control+B')
  369 |   await expect.poll(() => JSON.stringify(server.blocks.find((block) => block.type === 'table')?.props ?? {}), { timeout: 5000 }).toContain('bold')
  370 |   await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  371 |   expect(JSON.stringify(server.blocks.find((block) => block.type === 'table')?.props)).toContain('hardBreak')
  372 |   await page.reload()
  373 |   const cell = editor(page).locator('tr').nth(1).locator('td').nth(1)
  374 |   await expect(cell.locator('strong').first()).toContainText('note')
  375 |   await expect(cell).toContainText('line two')
  376 |   await expect(cell.locator('br')).toHaveCount(1)
  377 | })
  378 | 
  379 | test('an oversized pasted table is refused instead of making the page unsaveable', async ({ page }) => {
  380 |   const server: Server = { blocks: [tableBlock('table-a', grid3x3, 100), paragraph('tail', 'Tail', 200)], offline: false, requests: [] }
```