# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: product-table.spec.ts >> a table nests under a toggle and cell Tab never indents the table block
- Location: tests\product-table.spec.ts:306:1

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator:  locator('.eotion-editor-content .tiptap').locator('.eotion-toggle th').nth(1)
Expected: "Bmoved"
Received: "B"
Timeout:  5000ms

Call log:
  - Expect "toHaveText" locator('.eotion-editor-content .tiptap').locator('.eotion-toggle th').nth(1) with timeout 5000ms
  - waiting for locator('.eotion-editor-content .tiptap').locator('.eotion-toggle th').nth(1)
    14 × locator resolved to <th colspan="1" rowspan="1">…</th>
       - unexpected value "B"

```

```yaml
- columnheader "B":
  - paragraph: B
```

# Test source

```ts
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
> 325 |   await expect(editor(page).locator('.eotion-toggle th').nth(1)).toHaveText('Bmoved')
      |                                                                  ^ Error: expect(locator).toHaveText(expected) failed
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
```