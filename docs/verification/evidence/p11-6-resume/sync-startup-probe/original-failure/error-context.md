# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: product-sync.spec.ts >> a second client pulls sequential changes and remote deletion removes local pages
- Location: tests\product-sync.spec.ts:491:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('还没有页面')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText('还没有页面') with timeout 5000ms
  - waiting for getByText('还没有页面')

```

# Test source

```ts
  394 |   const editor = page.locator('.eotion-editor-content .tiptap')
  395 |   await editor.fill('服务失联仍可编辑')
  396 |   await expect.poll(() => page.evaluate(async () => {
  397 |     const { useProductSyncStore } = await import('/src/stores/productSync.ts')
  398 |     const local = await useProductSyncStore().store()
  399 |     return JSON.stringify(await local.listBlocksByPage(location.hash.split('/').at(-1)!))
  400 |   })).toContain('服务失联仍可编辑')
  401 |   await expect(page.getByRole('button', { name: /离线 · 本地已保存/ })).toBeVisible()
  402 |   await expect(editor).toContainText('服务失联仍可编辑')
  403 |   await editor.evaluate((node) => node.setAttribute('data-retained-editor', 'yes'))
  404 |   await page.evaluate(async () => {
  405 |     const { useAuthStore } = await import('/src/stores/auth.ts')
  406 |     await useAuthStore().retryRestore()
  407 |   })
  408 |   await expect(editor).toHaveAttribute('data-retained-editor', 'yes')
  409 |   await page.reload()
  410 |   await expect(editor).toContainText('服务失联仍可编辑')
  411 |   api.controls.unavailable = 0
  412 |   await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  413 |   await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  414 |   expect(JSON.stringify(api.server.blocks)).toContain('服务失联仍可编辑')
  415 | })
  416 | 
  417 | test('offline editor saves blocks locally and restores text after reload', async ({ page }) => {
  418 |   const api = await mockApi(page)
  419 |   await page.goto(`/#/app/${workspace.id}`)
  420 |   await expect(page.getByText('还没有页面')).toBeVisible()
  421 |   await page.getByRole('button', { name: '新建根页面' }).click()
  422 |   await expect(page.locator('.eotion-editor-content .tiptap')).toBeVisible()
  423 |   api.controls.disconnected = true
  424 |   const editor = page.locator('.eotion-editor-content .tiptap')
  425 |   await editor.click()
  426 |   await editor.pressSequentially('离线正文')
  427 |   await expect.poll(() => page.evaluate(async () => {
  428 |     const { useProductSyncStore } = await import('/src/stores/productSync.ts')
  429 |     const local = await useProductSyncStore().store()
  430 |     return JSON.stringify(await local.listBlocksByPage(location.hash.split('/').at(-1)!))
  431 |   })).toContain('离线正文')
  432 |   await page.reload()
  433 |   await expect(page.locator('.eotion-editor-content .tiptap')).toContainText('离线正文')
  434 |   api.controls.disconnected = false
  435 |   await page.evaluate(() => window.dispatchEvent(new Event('online')))
  436 |   await expect.poll(() => JSON.stringify(api.server.blocks)).toContain('离线正文')
  437 | })
  438 | 
  439 | test('mobile WebView runtime keeps the same IndexedDB product content offline', async ({ page }) => {
  440 |   const api = await mockApi(page)
  441 |   await page.goto(`/?eotionRuntime=mobile-webview#/app/${workspace.id}`)
  442 |   await expect(page.locator('.product-shell')).toHaveAttribute('data-runtime', 'mobile-webview')
  443 |   await expect(page.getByText('还没有页面')).toBeVisible()
  444 |   await page.getByRole('button', { name: '新建根页面' }).click()
  445 |   api.controls.disconnected = true
  446 |   const editor = page.locator('.eotion-editor-content .tiptap')
  447 |   await editor.fill('移动 WebView 本地正文')
  448 |   await expect.poll(() => page.evaluate(async () => {
  449 |     const { useProductSyncStore } = await import('/src/stores/productSync.ts')
  450 |     const local = await useProductSyncStore().store()
  451 |     return JSON.stringify(await local.listBlocksByPage(location.hash.split('/').at(-1)!))
  452 |   })).toContain('移动 WebView 本地正文')
  453 |   await page.reload()
  454 |   await expect(editor).toContainText('移动 WebView 本地正文')
  455 | })
  456 | 
  457 | test('offline page rename, move and delete stay durable after reload', async ({ page }) => {
  458 |   const server: Server = {
  459 |     pages: [
  460 |       { id: 'page-alpha', workspaceId: workspace.id, parentPageId: null, title: 'Alpha', orderKey: '0000000000000001', createdAt: now, updatedAt: now },
  461 |       { id: 'page-bravo', workspaceId: workspace.id, parentPageId: null, title: 'Bravo', orderKey: '0000000000000002', createdAt: now, updatedAt: now },
  462 |     ],
  463 |     blocks: [],
  464 |   }
  465 |   const api = await mockApi(page, server)
  466 |   await page.goto(`/#/app/${workspace.id}`)
  467 |   await expect(page.locator('.product-page-title')).toHaveText(['Alpha', 'Bravo'])
  468 |   api.controls.disconnected = true
  469 | 
  470 |   await page.getByRole('button', { name: '页面操作：Alpha' }).click()
  471 |   await page.getByRole('menu', { name: 'Alpha 的操作' }).getByRole('menuitem', { name: '重命名' }).click()
  472 |   await page.getByLabel('页面标题').fill('Offline Alpha')
  473 |   await page.getByRole('button', { name: '保存标题' }).click()
  474 |   await expect(page.locator('.product-page-title')).toHaveText(['Offline Alpha', 'Bravo'])
  475 | 
  476 |   await page.getByRole('button', { name: '页面操作：Bravo' }).click()
  477 |   await page.getByRole('menu', { name: 'Bravo 的操作' }).getByRole('menuitem', { name: '移动' }).click()
  478 |   await page.getByRole('radiogroup', { name: '移动到' }).getByRole('radio', { name: 'Offline Alpha', exact: true }).check()
  479 |   await page.getByRole('button', { name: '移动', exact: true }).click()
  480 |   await expect(page.getByRole('treeitem', { name: /Bravo/ })).toHaveAttribute('aria-level', '2')
  481 | 
  482 |   await page.getByRole('button', { name: '页面操作：Bravo' }).click()
  483 |   await page.getByRole('menu', { name: 'Bravo 的操作' }).getByRole('menuitem', { name: '删除' }).click()
  484 |   await page.getByRole('dialog', { name: '删除页面？' }).getByRole('button', { name: '删除', exact: true }).click()
  485 |   await expect(page.locator('.product-page-title')).toHaveText(['Offline Alpha'])
  486 |   await page.reload()
  487 |   await expect(page.locator('.product-page-title')).toHaveText(['Offline Alpha'])
  488 |   expect(server.pages.map((item) => item.title)).toEqual(['Alpha', 'Bravo'])
  489 | })
  490 | 
  491 | test('a second client pulls sequential changes and remote deletion removes local pages', async ({ browser, page }) => {
  492 |   const first = await mockApi(page)
  493 |   await page.goto(`/#/app/${workspace.id}`)
> 494 |   await expect(page.getByText('还没有页面')).toBeVisible()
      |                                         ^ Error: expect(locator).toBeVisible() failed
  495 |   await page.getByRole('button', { name: '新建根页面' }).click()
  496 |   await expect(page.getByRole('heading', { name: '无标题' })).toBeVisible()
  497 |   await expect.poll(() => first.server.pages.length).toBe(1)
  498 |   const secondContext = await browser.newContext()
  499 |   try {
  500 |     const secondPage = await secondContext.newPage()
  501 |     await mockApi(secondPage, first.server)
  502 |     await secondPage.goto(`/#/app/${workspace.id}`)
  503 |     await expect(secondPage.locator('.product-page-title')).toHaveText('无标题')
  504 |     first.server.pages.splice(0)
  505 |     await secondPage.evaluate(() => window.dispatchEvent(new Event('focus')))
  506 |     await expect(secondPage.getByText('还没有页面')).toBeVisible()
  507 |   } finally { await secondContext.close() }
  508 | })
  509 | 
  510 | test('a clean active editor reloads a remote block change on focus', async ({ browser, page }) => {
  511 |   const first = await mockApi(page)
  512 |   await page.goto(`/#/app/${workspace.id}`)
  513 |   await expect(page.getByText('还没有页面')).toBeVisible()
  514 |   await page.getByRole('button', { name: '新建根页面' }).click()
  515 |   await expect(page).toHaveURL(/\/page\//)
  516 |   const pageId = new URL(page.url()).hash.split('/').at(-1)!
  517 |   const firstEditor = page.locator('.eotion-editor-content .tiptap')
  518 |   await firstEditor.click()
  519 |   await firstEditor.pressSequentially('Client A')
  520 |   await expect.poll(() => JSON.stringify(first.server.blocks)).toContain('Client A')
  521 | 
  522 |   const secondContext = await browser.newContext()
  523 |   try {
  524 |     const secondPage = await secondContext.newPage()
  525 |     await mockApi(secondPage, first.server)
  526 |     await secondPage.goto(`/#/app/${workspace.id}/page/${pageId}`)
  527 |     const secondEditor = secondPage.locator('.eotion-editor-content .tiptap')
  528 |     await expect(secondEditor).toContainText('Client A')
  529 |     await secondEditor.click()
  530 |     await secondEditor.press('Control+A')
  531 |     await secondEditor.pressSequentially('Client B')
  532 |     await expect.poll(() => JSON.stringify(first.server.blocks)).toContain('Client B')
  533 |     await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  534 |     await expect(firstEditor).toContainText('Client B')
  535 |   } finally { await secondContext.close() }
  536 | })
  537 | 
  538 | test('switching identity during a push cannot send the next old-account operation', async ({ page }) => {
  539 |   const api = await mockApi(page)
  540 |   await page.goto(`/#/app/${workspace.id}`)
  541 |   await expect(page.getByText('还没有页面')).toBeVisible()
  542 |   api.controls.disconnected = true
  543 |   await page.getByRole('button', { name: '新建根页面' }).click()
  544 |   await expect(page.getByRole('heading', { name: '无标题' })).toBeVisible()
  545 |   await page.getByRole('button', { name: '新建根页面' }).click()
  546 |   await expect(page.locator('.product-page-title')).toHaveCount(2)
  547 | 
  548 |   api.controls.disconnected = false
  549 |   api.controls.holdPush = true
  550 |   await page.evaluate(() => window.dispatchEvent(new Event('online')))
  551 |   await expect.poll(() => api.requests.filter((request) => request.path === '/api/sync/operations').length).toBe(1)
  552 |   await page.evaluate(async () => {
  553 |     const [{ useAuthStore }, { useProductSyncStore }] = await Promise.all([
  554 |       import('/src/stores/auth.ts'), import('/src/stores/productSync.ts'),
  555 |     ])
  556 |     useAuthStore().user = { id: 'other-user', email: 'other@example.com', createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T00:00:00.000Z' }
  557 |     useProductSyncStore().configure('other-user', false)
  558 |   })
  559 |   api.controls.holdPush = false
  560 |   api.releasePush()
  561 |   await page.waitForTimeout(350)
  562 |   expect(api.requests.filter((request) => request.path === '/api/sync/operations')).toHaveLength(1)
  563 | })
  564 | 
```