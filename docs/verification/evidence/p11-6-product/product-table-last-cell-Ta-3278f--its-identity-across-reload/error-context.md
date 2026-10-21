# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: product-table.spec.ts >> last cell Tab adds a row and the table keeps its identity across reload
- Location: tests\product-table.spec.ts:177:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 4
Received: 3

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
                      - paragraph [ref=e87]: A
                    - columnheader [ref=e88]:
                      - paragraph [ref=e89]: J
                    - columnheader [ref=e90]:
                      - paragraph [ref=e91]: C
                  - row [ref=e92]:
                    - cell [ref=e93]:
                      - paragraph [ref=e94]: D
                    - cell [ref=e95]:
                      - paragraph [ref=e96]: E
                    - cell [ref=e97]:
                      - paragraph [ref=e98]: F
                  - row [ref=e99]:
                    - cell [ref=e100]:
                      - paragraph [ref=e101]: G
                    - cell [ref=e102]:
                      - paragraph [ref=e103]: H
                    - cell [ref=e104]:
                      - paragraph [ref=e105]: I
              - generic:
                - button "在区块下方插入区块" [ref=e106] [cursor=pointer]
                - button "拖动区块" [ref=e108]
              - paragraph [ref=e116]
            - toolbar "表格操作" [ref=e118]:
              - button "表格操作" [ref=e119] [cursor=pointer]: 表格 ⋯
```

# Test source

```ts
  85  | 
  86  | /** Which table cell currently contains the DOM caret. */
  87  | async function caretCell(page: Page) {
  88  |   return page.evaluate(() => {
  89  |     const selection = window.getSelection()
  90  |     const node = selection?.anchorNode ?? null
  91  |     const element = node instanceof Element ? node : node?.parentElement ?? null
  92  |     return { text: (element?.closest('th, td')?.textContent ?? '').trim() }
  93  |   })
  94  | }
  95  | 
  96  | async function installApi(page: Page, server: Server) {
  97  |   await page.route('**/api/**', async (route: Route) => {
  98  |     const request = route.request()
  99  |     const url = new URL(request.url()).pathname
  100 |     server.requests.push({ path: url, kind: url === '/api/sync/operations' ? request.postDataJSON()?.kind : undefined })
  101 |     if (server.offline) return route.abort('internetdisconnected')
  102 |     const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  103 |     if (url === '/api/auth/me') return json(user)
  104 |     if (url === '/api/workspaces') return json([workspace])
  105 |     if (url === `/api/sync/workspaces/${workspace.id}/snapshot`) return json({ pages: [pageRecord], blocks: server.blocks })
  106 |     if (url === '/api/sync/operations') {
  107 |       const operation = request.postDataJSON() as { id: string; kind: string; payload: any }
  108 |       const payload = operation.payload
  109 |       const existing = server.blocks.find((block) => block.id === payload.id)
  110 |       if (operation.kind === 'block.move' && existing) Object.assign(existing, { parentBlockId: payload.parentBlockId, orderKey: payload.orderKey })
  111 |       if (operation.kind === 'block.upsert') {
  112 |         const next = { ...payload, workspaceId: workspace.id, createdAt: existing?.createdAt ?? stamp, updatedAt: stamp }
  113 |         server.blocks = server.blocks.filter((block) => block.id !== payload.id).concat(next)
  114 |       }
  115 |       if (operation.kind === 'block.delete') server.blocks = server.blocks.filter((block) => block.id !== payload.id)
  116 |       return json({ id: operation.id, status: 'applied' })
  117 |     }
  118 |     return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
  119 |   })
  120 | }
  121 | 
  122 | const grid3x3 = [['A', 'B', 'C'], ['D', 'E', 'F'], ['G', 'H', 'I']]
  123 | 
  124 | /** Anchor the contextual menu on a cell position so the grid can change between steps. */
  125 | async function openTableMenuAt(page: Page, row: number, cell: number) {
  126 |   await editor(page).locator('tr').nth(row).locator('th, td').nth(cell).click()
  127 |   const trigger = page.getByRole('button', { name: '表格操作' })
  128 |   await expect(trigger).toBeVisible()
  129 |   await trigger.click()
  130 |   await expect(page.getByRole('button', { name: '在下方插入行' })).toBeVisible()
  131 | }
  132 | 
  133 | test('slash creates one editable table block with a header row and cell navigation', async ({ page }) => {
  134 |   const server: Server = { blocks: [], offline: false, requests: [] }
  135 |   await installApi(page, server)
  136 |   await page.goto(pageUrl())
  137 |   const body = editor(page)
  138 |   await body.locator(':scope > p').first().click()
  139 |   await page.keyboard.press('/')
  140 |   await page.locator('.p2-slash-menu').getByRole('option', { name: '表格', exact: true }).click()
  141 |   await expect(body.locator('table')).toBeVisible()
  142 |   await expect(body.locator('th')).toHaveCount(3)
  143 |   await expect(body.locator('td')).toHaveCount(6)
  144 | 
  145 |   await page.keyboard.type('A1')
  146 |   await page.keyboard.press('Tab')
  147 |   await page.keyboard.type('B1')
  148 |   await page.keyboard.press('Tab')
  149 |   await page.keyboard.type('C1')
  150 |   await page.keyboard.press('Tab')
  151 |   await page.keyboard.type('A2')
  152 |   expect(await caretCell(page)).toEqual({ text: 'A2' })
  153 |   // Shift+Tab walks back through the previous cells without leaving the table.
  154 |   await page.keyboard.press('Shift+Tab')
  155 |   expect(await caretCell(page)).toEqual({ text: 'C1' })
  156 |   await page.keyboard.press('Shift+Tab')
  157 |   expect(await caretCell(page)).toEqual({ text: 'B1' })
  158 |   await page.keyboard.press('End')
  159 |   await page.keyboard.type('+')
  160 |   await expect(body.locator('th').nth(1)).toHaveText('B1+')
  161 | 
  162 |   await expect.poll(() => server.blocks.some((block) => block.type === 'table'), { timeout: 5000 }).toBe(true)
  163 |   await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  164 |   // The whole grid is one block and no cell ever became its own block.
  165 |   expect(server.blocks.filter((block) => block.type === 'table')).toHaveLength(1)
  166 |   expect(server.blocks.filter((block) => block.parentBlockId !== null)).toHaveLength(0)
  167 |   expect(tableGridFromProps(server)[0]).toEqual(['A1', 'B1+', 'C1'])
  168 |   expect(tableGridFromProps(server)[1]?.[0]).toBe('A2')
  169 | 
  170 |   await page.reload()
  171 |   await expect(body.locator('table')).toBeVisible()
  172 |   await expect(body.locator('th').first()).toHaveText('A1')
  173 |   await expect(body.locator('th').nth(1)).toHaveText('B1+')
  174 |   await expect(body.locator('td').first()).toHaveText('A2')
  175 | })
  176 | 
  177 | test('last cell Tab adds a row and the table keeps its identity across reload', async ({ page }) => {
  178 |   const server: Server = { blocks: [tableBlock('table-a', grid3x3, 100), paragraph('tail', '', 200)], offline: false, requests: [] }
  179 |   await installApi(page, server)
  180 |   await page.goto(pageUrl())
  181 |   await editor(page).locator('tr').nth(2).locator('td').nth(2).click()
  182 |   await page.keyboard.press('End')
  183 |   await page.keyboard.press('Tab')
  184 |   await page.keyboard.type('J')
> 185 |   await expect.poll(() => tableGridFromProps(server).length, { timeout: 5000 }).toBe(4)
      |                                                                                 ^ Error: expect(received).toBe(expected) // Object.is equality
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
  280 |   await expect.poll(() => JSON.stringify(server.blocks.find((block) => block.id === 'tail')?.props ?? {}).includes('X'), { timeout: 5000 }).toBe(true)
  281 |   await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  282 |   expect(server.blocks.every((block) => ['table', 'paragraph'].includes(block.type))).toBe(true)
  283 |   expect(server.blocks.every((block) => block.parentBlockId === null)).toBe(true)
  284 |   // The same grid is still intact after all clipboard work.
  285 |   await page.reload()
```