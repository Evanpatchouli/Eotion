# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: product-p75-acceptance.spec.ts >> seeded mixed document keeps local-first identity, nesting, callout attrs and table grid across offline restart and reconnect
- Location: tests\product-p75-acceptance.spec.ts:427:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false

Call Log:
- Timeout 15000ms exceeded while waiting on the predicate
```

# Test source

```ts
  375 |     }
  376 |     expect(structureProblems(server.blocks)).toEqual([])
  377 | 
  378 |     // Edit the callout attributes and a table cell in place.
  379 |     await body.getByText('Remember this', { exact: true }).click()
  380 |     await body.locator('.eotion-callout').getByRole('button', { name: '提示块设置' }).click()
  381 |     await page.getByRole('textbox', { name: '提示块图标' }).fill('🚀')
  382 |     await page.getByRole('combobox', { name: '提示块语气' }).selectOption('warning')
  383 |     await page.keyboard.press('Escape')
  384 |     await expect.poll(() => (server.blocks.find((block) => block.type === 'callout')?.props as any)?.node?.attrs ?? null, { timeout: 5000 }).toEqual({ icon: '🚀', tone: 'warning' })
  385 |     await body.locator('table th').first().click()
  386 |     await page.keyboard.press('End')
  387 |     await page.keyboard.type('+edited')
  388 |     await expect.poll(() => {
  389 |       const table = server.blocks.find((block) => block.type === 'table')!
  390 |       return (table.props as any).node.content[0].content[0].content[0].content[0].text
  391 |     }, { timeout: 5000 }).toBe('H1+edited')
  392 | 
  393 |     const stableShape = canonicalDocument(server.blocks)
  394 | 
  395 |     // reload
  396 |     await page.reload()
  397 |     await expect.poll(() => toggleTexts(page)).toEqual(expect.arrayContaining(['Toggle summary', 'Toggle child', 'Inner summary', 'Grandchild', 'Tabbed child']))
  398 |     await expect(editor(page).locator('table')).toHaveCount(1)
  399 |     await expect(editor(page).locator('blockquote')).toContainText('Quoted line')
  400 |     await expect(editor(page).locator('.eotion-callout')).toHaveAttribute('data-tone', 'warning')
  401 |     await expect(editor(page).locator('table th').first()).toHaveText('H1+edited')
  402 |     await expect(editor(page).getByText('Intro paragraph. edited', { exact: true })).toBeVisible()
  403 | 
  404 |     // browser restart
  405 |     await context.close()
  406 |     context = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, baseURL: 'http://127.0.0.1:7173' })
  407 |     page = context.pages()[0] ?? await context.newPage()
  408 |     await installApi(page, server)
  409 |     await page.goto(pageUrl())
  410 |     await expect.poll(() => toggleTexts(page)).toEqual(expect.arrayContaining(['Toggle summary', 'Toggle child', 'Inner summary', 'Grandchild', 'Tabbed child']))
  411 |     await expect(editor(page).locator('table')).toHaveCount(1)
  412 |     await expect(editor(page).locator('.eotion-callout')).toHaveAttribute('data-tone', 'warning')
  413 |     await expect(editor(page).locator('table th').first()).toHaveText('H1+edited')
  414 |     await expect(editor(page).getByText('Intro paragraph. edited', { exact: true })).toBeVisible()
  415 |     expect(canonicalDocument(server.blocks)).toEqual(stableShape)
  416 |     expect(structureProblems(server.blocks)).toEqual([])
  417 |   } finally {
  418 |     await context.close()
  419 |     await rm(profile, { recursive: true, force: true })
  420 |   }
  421 | })
  422 | 
  423 | /* ------------------------------------------------------------------ *
  424 |  * 2. Full local-first lifecycle over the seeded mixed document.
  425 |  * ------------------------------------------------------------------ */
  426 | 
  427 | test('seeded mixed document keeps local-first identity, nesting, callout attrs and table grid across offline restart and reconnect', async () => {
  428 |   test.setTimeout(180000)
  429 |   const profile = await mkdtemp(path.join(tmpdir(), 'eotion-p75-sync-'))
  430 |   const server: Server = { blocks: mixedDocument(), offline: false, requests: [] }
  431 |   let context = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, baseURL: 'http://127.0.0.1:7173' })
  432 |   try {
  433 |     let page = context.pages()[0] ?? await context.newPage()
  434 |     await installApi(page, server)
  435 |     await page.goto(pageUrl())
  436 |     const body = editor(page)
  437 |     await expect.poll(() => toggleTexts(page)).toEqual(['Toggle summary', 'Toggle child', 'Inner summary', 'Grandchild'])
  438 |     await expect(body.locator('.eotion-callout')).toHaveAttribute('data-tone', 'warning')
  439 |     await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  440 |     expect(structureProblems(server.blocks)).toEqual([])
  441 | 
  442 |     // Offline edits across a paragraph, a nested toggle child, a callout attribute and a table cell.
  443 |     server.offline = true
  444 |     await body.getByText('Intro paragraph.', { exact: true }).click()
  445 |     await page.keyboard.press('End')
  446 |     await page.keyboard.type(' offline')
  447 |     await body.getByText('Grandchild', { exact: true }).click()
  448 |     await page.keyboard.press('End')
  449 |     await page.keyboard.press('Enter')
  450 |     await page.keyboard.type('Offline sibling')
  451 |     await body.getByText('Remember this', { exact: true }).click()
  452 |     await body.locator('.eotion-callout').getByRole('button', { name: '提示块设置' }).click()
  453 |     await page.getByRole('combobox', { name: '提示块语气' }).selectOption('info')
  454 |     await page.keyboard.press('Escape')
  455 |     await mixedTable(page).locator('th').first().click()
  456 |     await page.keyboard.press('End')
  457 |     await page.keyboard.type('+offline')
  458 |     await expect.poll(() => pendingCount(page), { timeout: 10000 }).toBeGreaterThan(0)
  459 | 
  460 |     // A pending operation can represent only the first edit in the debounce drain.
  461 |     // Wait for every edit to reach LocalStore before using reload as a durability check.
  462 |     await expect.poll(async () => {
  463 |       const blocks = await localBlocks(page)
  464 |       const byId = new Map(blocks.map((block) => [block.id, block]))
  465 |       const intro = byId.get('m-intro')
  466 |       const sibling = blocks.find((block) => block.type === 'paragraph' && blockContent(block) === 'Offline sibling')
  467 |       const callout = byId.get('m-callout')
  468 |       const outerTable = byId.get('m-table')
  469 |       return Boolean(
  470 |         intro && blockContent(intro) === 'Intro paragraph. offline'
  471 |         && sibling?.parentBlockId === 'm-inner'
  472 |         && callout && blockAttrs(callout).tone === 'info'
  473 |         && outerTable && (blockContent(outerTable) as string[][])[0]?.[0] === 'H1+offline',
  474 |       )
> 475 |     }, { timeout: 15000 }).toBe(true)
      |                            ^ Error: expect(received).toBe(expected) // Object.is equality
  476 | 
  477 |     // Local content is durable: reload keeps every edit and every identity.
  478 |     await page.reload()
  479 |     await expect(editor(page).getByText('Intro paragraph. offline', { exact: true })).toBeVisible()
  480 |     await expect.poll(() => toggleTexts(page)).toEqual(['Toggle summary', 'Toggle child', 'Inner summary', 'Grandchild', 'Offline sibling'])
  481 |     await expect(editor(page).locator('.eotion-callout')).toHaveAttribute('data-tone', 'info')
  482 |     await expect(mixedTable(page).locator('th').first()).toHaveText('H1+offline')
  483 |     expect(structureProblems(await localBlocks(page))).toEqual([])
  484 | 
  485 |     // Browser restart with the offline edits still pending.
  486 |     await context.close()
  487 |     context = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, baseURL: 'http://127.0.0.1:7173' })
  488 |     page = context.pages()[0] ?? await context.newPage()
  489 |     await installApi(page, server)
  490 |     await page.goto(pageUrl())
  491 |     await expect(editor(page).getByText('Intro paragraph. offline', { exact: true })).toBeVisible()
  492 |     await expect(mixedTable(page).locator('th').first()).toHaveText('H1+offline')
  493 | 
  494 |     const localSnapshot = canonicalDocument(await localBlocks(page))
  495 |     const stableIds = flattened(await localBlocks(page)).map((block) => block.id + ':' + block.type).sort()
  496 |     const toggleId = server.blocks.find((block) => block.type === 'toggle' && block.parentBlockId === null)!.id
  497 | 
  498 |     // Reconnect: push pending operations, then pull the snapshot.
  499 |     const reconnectAt = server.requests.length
  500 |     server.offline = false
  501 |     await page.evaluate(() => window.dispatchEvent(new Event('online')))
  502 |     await expect.poll(() => pendingCount(page), { timeout: 15000 }).toBe(0)
  503 |     await expect.poll(() => JSON.stringify(server.blocks.find((block) => block.id === 'm-intro')?.props ?? {}), { timeout: 10000 }).toContain('Intro paragraph. offline')
  504 | 
  505 |     // The snapshot pull follows the push in the same sync run; wait for it instead
  506 |     // of sampling a run that is still draining pending operations.
  507 |     await expect.poll(
  508 |       () => server.requests.slice(reconnectAt).findIndex((request) => request.path.endsWith('/snapshot')),
  509 |       { timeout: 15000 },
  510 |     ).toBeGreaterThanOrEqual(0)
  511 |     const after = server.requests.slice(reconnectAt)
  512 |     const firstPush = after.findIndex((request) => request.kind === 'block.upsert' || request.kind === 'block.move')
  513 |     const firstSnapshot = after.findIndex((request) => request.path.endsWith('/snapshot'))
  514 |     expect(firstPush).toBeGreaterThanOrEqual(0)
  515 |     expect(firstSnapshot).toBeGreaterThan(firstPush)
  516 | 
  517 |     // Final content identity: server == local, structure intact, ids unchanged.
  518 |     expect(canonicalDocument(server.blocks)).toEqual(localSnapshot)
  519 |     expect(structureProblems(server.blocks)).toEqual([])
  520 |     expect(flattened(server.blocks).map((block) => block.id + ':' + block.type).sort()).toEqual(stableIds)
  521 |     expect(server.blocks.find((block) => block.id === toggleId)?.parentBlockId ?? null).toBe(null)
  522 |     const inner = server.blocks.find((block) => block.id === 'm-inner')!
  523 |     expect(inner.parentBlockId).toBe(toggleId)
  524 |     expect(server.blocks.find((block) => block.id === 'm-grandchild')?.parentBlockId).toBe('m-inner')
  525 |     expect(server.blocks.find((block) => block.id === 'm-nested-table')?.parentBlockId).toBe(toggleId)
  526 |     const calloutNode = (server.blocks.find((block) => block.id === 'm-callout')!.props as any).node
  527 |     expect(calloutNode.attrs).toEqual({ icon: '🚀', tone: 'info' })
  528 |     const grid = blockContent(server.blocks.find((block) => block.id === 'm-table')!) as string[][]
  529 |     expect(grid[0]?.[0]).toBe('H1+offline')
  530 |     expect(grid).toHaveLength(3)
  531 |     expect(grid.every((row) => row.length === 3)).toBe(true)
  532 | 
  533 |     // A final reload renders exactly the synced content.
  534 |     await page.reload()
  535 |     await expect.poll(() => toggleTexts(page)).toEqual(['Toggle summary', 'Toggle child', 'Inner summary', 'Grandchild', 'Offline sibling'])
  536 |     await expect(mixedTable(page).locator('th').first()).toHaveText('H1+offline')
  537 |     await expect(editor(page).locator('.eotion-callout')).toHaveAttribute('data-tone', 'info')
  538 |     await expect(editor(page).locator('table')).toHaveCount(2)
  539 |   } finally {
  540 |     await context.close()
  541 |     await rm(profile, { recursive: true, force: true })
  542 |   }
  543 | })
  544 | 
  545 | /* ------------------------------------------------------------------ *
  546 |  * 3. P5/P6 legacy pages keep opening, editing, saving and syncing.
  547 |  * ------------------------------------------------------------------ */
  548 | 
  549 | test('a legacy P5/P6 page still opens, edits, saves and syncs without a migration', async ({ page }) => {
  550 |   const legacy: BlockResponse[] = [
  551 |     record('l-heading', 'heading', { type: 'heading', attrs: { level: 2 }, content: text('Legacy heading') }, 10),
  552 |     record('l-paragraph', 'paragraph', { type: 'paragraph', content: text('Legacy paragraph') }, 20),
  553 |     record('l-list', 'bulleted-list', { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: text('Legacy item') }] }] }, 30),
  554 |     record('l-todo', 'todo', { type: 'eotionTodo', attrs: { checked: true }, content: text('Legacy task') }, 40),
  555 |     record('l-quote', 'quote', { type: 'blockquote', content: [{ type: 'paragraph', content: text('Legacy quote') }] }, 50),
  556 |     record('l-code', 'code', { type: 'codeBlock', attrs: { language: null }, content: text('legacy()') }, 60),
  557 |     record('l-divider', 'divider', { type: 'horizontalRule' }, 70),
  558 |   ]
  559 |   const server: Server = { blocks: legacy, offline: false, requests: [] }
  560 |   await installApi(page, server)
  561 |   await page.goto(pageUrl())
  562 |   const body = editor(page)
  563 |   await expect(body.getByText('Legacy paragraph', { exact: true })).toBeVisible()
  564 |   await expect(body.locator('h2')).toHaveText('Legacy heading')
  565 |   await body.getByText('Legacy paragraph', { exact: true }).click()
  566 |   await page.keyboard.press('End')
  567 |   await page.keyboard.type(' updated')
  568 |   await expect.poll(() => JSON.stringify(server.blocks.find((block) => block.id === 'l-paragraph')?.props ?? {}), { timeout: 5000 }).toContain('Legacy paragraph updated')
  569 |   await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  570 |   // No legacy block was rewritten or lost; the only addition is the editor's
  571 |   // pre-existing trailing paragraph (StarterKit TrailingNode) after the divider.
  572 |   for (const entry of legacy) {
  573 |     const current = server.blocks.find((block) => block.id === entry.id)
  574 |     expect(current, 'legacy block ' + entry.id + ' must survive').toBeTruthy()
  575 |     expect(current!.type).toBe(entry.type)
```