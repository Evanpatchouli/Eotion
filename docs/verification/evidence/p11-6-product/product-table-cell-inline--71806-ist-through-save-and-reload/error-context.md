# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: product-table.spec.ts >> cell inline marks and hard breaks persist through save and reload
- Location: tests\product-table.spec.ts:357:1

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected substring: "bold"
Received string:    "{\"node\":{\"type\":\"table\",\"content\":[{\"type\":\"tableRow\",\"content\":[{\"type\":\"tableHeader\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"A\"}]}],\"attrs\":{\"colspan\":1,\"rowspan\":1,\"colwidth\":null}},{\"type\":\"tableHeader\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"B\"}]}],\"attrs\":{\"colspan\":1,\"rowspan\":1,\"colwidth\":null}},{\"type\":\"tableHeader\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"C\"}]}],\"attrs\":{\"colspan\":1,\"rowspan\":1,\"colwidth\":null}}]},{\"type\":\"tableRow\",\"content\":[{\"type\":\"tableCell\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"D\"}]}],\"attrs\":{\"colspan\":1,\"rowspan\":1,\"colwidth\":null}},{\"type\":\"tableCell\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"E note\"},{\"type\":\"hardBreak\"},{\"type\":\"text\",\"text\":\"line two\"}]}],\"attrs\":{\"colspan\":1,\"rowspan\":1,\"colwidth\":null}},{\"type\":\"tableCell\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"F\"}]}],\"attrs\":{\"colspan\":1,\"rowspan\":1,\"colwidth\":null}}]},{\"type\":\"tableRow\",\"content\":[{\"type\":\"tableCell\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"G\"}]}],\"attrs\":{\"colspan\":1,\"rowspan\":1,\"colwidth\":null}},{\"type\":\"tableCell\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"H\"}]}],\"attrs\":{\"colspan\":1,\"rowspan\":1,\"colwidth\":null}},{\"type\":\"tableCell\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"I\"}]}],\"attrs\":{\"colspan\":1,\"rowspan\":1,\"colwidth\":null}}]}]}}"

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
                      - paragraph [ref=e89]: B
                    - columnheader [ref=e90]:
                      - paragraph [ref=e91]: C
                  - row [ref=e92]:
                    - cell [ref=e93]:
                      - paragraph [ref=e94]: D
                    - cell [ref=e95]:
                      - paragraph [ref=e96]: E noteline two
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
            - toolbar "选区格式" [ref=e118]:
              - button "粗体" [ref=e119] [cursor=pointer]
              - button "斜体" [ref=e122] [cursor=pointer]
              - button "删除线" [ref=e125] [cursor=pointer]
              - button "行内代码" [ref=e128] [cursor=pointer]
              - button "链接" [ref=e131] [cursor=pointer]
```

# Test source

```ts
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
  319 |   await headers.first().click()
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
> 369 |   await expect.poll(() => JSON.stringify(server.blocks.find((block) => block.type === 'table')?.props ?? {}), { timeout: 5000 }).toContain('bold')
      |                                                                                                                                  ^ Error: expect(received).toContain(expected) // indexOf
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
  381 |   await installApi(page, server)
  382 |   await page.goto(pageUrl())
  383 |   const body = editor(page)
  384 |   const pasteTable = (cells: number) => page.evaluate((count) => {
  385 |     const target = document.querySelector('.eotion-editor-content .tiptap')!
  386 |     const transfer = new DataTransfer()
  387 |     transfer.setData('text/html', `<table><tbody><tr>${Array.from({ length: count }, (_, index) => `<td>c${index}</td>`).join('')}</tr></tbody></table>`)
  388 |     transfer.setData('text/plain', 'grid')
  389 |     target.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }))
  390 |   }, cells)
  391 | 
  392 |   // The trailing paragraph is the paste target; a normal grid is still accepted.
  393 |   await body.locator(':scope > p').last().click()
  394 |   await pasteTable(3)
  395 |   await expect(body.locator('table')).toHaveCount(2)
  396 |   await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  397 | 
  398 |   // A grid over the shared cell budget is refused and reported, not saved.
  399 |   await body.locator(':scope > p').last().click()
  400 |   await pasteTable(201)
  401 |   await expect(page.getByRole('alert').filter({ hasText: '表格超出可保存的规模' })).toBeVisible()
  402 |   await expect(body.locator('table')).toHaveCount(2)
  403 |   await expect.poll(() => server.blocks.filter((block) => block.type === 'table').length).toBe(2)
  404 | 
  405 |   // The page stays editable and saveable after the refused paste.
  406 |   await body.getByText('Tail', { exact: true }).click()
  407 |   await page.keyboard.press('End')
  408 |   await page.keyboard.type(' ok')
  409 |   await expect.poll(() => JSON.stringify(server.blocks.find((block) => block.id === 'tail')?.props ?? {}), { timeout: 5000 }).toContain('Tail ok')
  410 |   await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  411 |   expect(tableGridFromProps(server)[0]).toEqual(['A', 'B', 'C'])
  412 | })
  413 | test('table slash is hidden in quote, list item and cell contexts', async ({ page }) => {
  414 |   const server: Server = { blocks: [], offline: false, requests: [] }
  415 |   await installApi(page, server)
  416 |   await page.goto(pageUrl())
  417 |   const body = editor(page)
  418 |   const menu = page.locator('.p2-slash-menu')
  419 |   const option = (name: string) => menu.getByRole('option', { name, exact: true })
  420 | 
  421 |   await body.locator(':scope > p').first().click()
  422 |   await page.keyboard.press('/')
  423 |   await expect(option('表格')).toBeVisible()
  424 |   await option('引用').click()
  425 |   await body.locator('blockquote p').first().click()
  426 |   await page.keyboard.press('/')
  427 |   await expect(menu).toBeVisible()
  428 |   await expect(option('表格')).toHaveCount(0)
  429 |   await page.keyboard.press('Escape')
  430 | 
  431 |   await body.locator(':scope > p').last().click()
  432 |   await page.keyboard.press('/')
  433 |   await option('项目列表').click()
  434 |   await body.locator('ul li p').first().click()
  435 |   await page.keyboard.press('/')
  436 |   await expect(menu).toBeVisible()
  437 |   await expect(option('表格')).toHaveCount(0)
  438 |   await page.keyboard.press('Escape')
  439 | 
  440 |   // Inside a table cell the slash menu only offers commands the cell accepts.
  441 |   await body.locator(':scope > p').last().click()
  442 |   await page.keyboard.press('/')
  443 |   await option('表格').click()
  444 |   await expect(body.locator('table')).toBeVisible()
  445 |   await body.locator('th').first().click()
  446 |   await page.keyboard.press('/')
  447 |   await expect(menu).toBeVisible()
  448 |   await expect(option('表格')).toHaveCount(0)
  449 |   await expect(option('一级标题')).toHaveCount(0)
  450 | })
  451 | 
  452 | test.describe('390px table layout', () => {
  453 |   test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  454 | 
  455 |   test('a wide table scrolls inside its wrapper and keeps the page and cells usable', async ({ page }) => {
  456 |     const wide = [['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'], ['a', 'b', 'c', 'd', 'e', 'f', 'g'], ['h', 'i', 'j', 'k', 'l', 'm', 'n']]
  457 |     const server: Server = { blocks: [tableBlock('table-wide', wide, 100), paragraph('tail', '', 200)], offline: false, requests: [] }
  458 |     await installApi(page, server)
  459 |     await page.goto(pageUrl())
  460 |     const body = editor(page)
  461 |     await expect(body.locator('table')).toBeVisible()
  462 |     const metrics = await body.locator('.tableWrapper').evaluate((wrapper) => ({
  463 |       pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
  464 |       wrapperScrolls: wrapper.scrollWidth > wrapper.clientWidth,
  465 |       clientWidth: wrapper.clientWidth,
  466 |     }))
  467 |     expect(metrics.pageOverflow).toBe(false)
  468 |     expect(metrics.wrapperScrolls).toBe(true)
  469 |     expect(metrics.clientWidth).toBeLessThanOrEqual(390)
```