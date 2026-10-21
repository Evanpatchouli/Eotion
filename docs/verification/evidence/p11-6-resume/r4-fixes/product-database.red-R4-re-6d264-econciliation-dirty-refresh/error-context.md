# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: product-database.red.spec.ts >> R4 record title reconciliation dirty refresh
- Location: ..\..\..\..\AppData\Local\Temp\eotion-p116-resume-dfbb4269eb4c4a6794279c34f3d9ba5d\r4-fixes\product-database.red.spec.ts:12406:7

# Error details

```
Error: expect(locator).toHaveValue(expected) failed

Locator:  getByRole('textbox', { name: '记录标题' })
Expected: "Dirty refresh draft"
Received: "Identity row"
Timeout:  5000ms

Call log:
  - Expect "toHaveValue" getByRole('textbox', { name: '记录标题' }) with timeout 5000ms
  - waiting for getByRole('textbox', { name: '记录标题' })
    14 × locator resolved to <input maxlength="200" aria-label="记录标题" data-v-ec941511="" class="product-record-title"/>
       - unexpected value "Identity row"

```

```yaml
- textbox "记录标题": Identity row
```

# Test source

```ts
  12324 |   })
  12325 | }
  12326 | 
  12327 | async function r2ExpectPendingInitialFocus(page: Page, body: Locator): Promise<void> {
  12328 |   await expect(body).toHaveText('Identity body')
  12329 |   await expect.poll(() => body.evaluate(element => {
  12330 |     let component = (element.closest('.eotion-editor') as (HTMLElement & { __vueParentComponent?: any }) | null)?.__vueParentComponent
  12331 |     while (component && component.type?.__name !== 'EotionEditor') component = component.parent
  12332 |     const exposed = component?.exposed?.editor ?? component?.setupState?.editor
  12333 |     const current = exposed?.commands ? exposed : exposed?.value
  12334 |     return Boolean(current?.isInitialized && (window as any).__r2CapturedFocusFrames.length > 0)
  12335 |   })).toBe(true)
  12336 | }
  12337 | 
  12338 | test('R2 pending initial body focus preserves a user caret', async ({ page }) => {
  12339 |   await page.setViewportSize({ width: 1440, height: 900 })
  12340 |   await page.emulateMedia({ reducedMotion: 'reduce' })
  12341 |   const { open } = await r2AutofocusFixture(page)
  12342 |   await open.click()
  12343 |   const surface = page.locator('[data-overlay-mode="drawer"]')
  12344 |   await expect(surface).toBeVisible()
  12345 |   await r2HoldInitialFocusFrames(page)
  12346 |   const body = surface.locator('.eotion-editor-content .tiptap')
  12347 |   await r2ExpectPendingInitialFocus(page, body)
  12348 |   await body.evaluate(element => {
  12349 |     element.focus()
  12350 |     const selection = window.getSelection()!
  12351 |     const text = element.querySelector('p')!.firstChild!
  12352 |     selection.setPosition(text, 8)
  12353 |   })
  12354 |   await page.evaluate(() => (window as any).__r2FlushFocusFrames())
  12355 |   await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  12356 |   await expect(body).toBeFocused()
  12357 |   expect(await body.evaluate(() => window.getSelection()?.anchorOffset)).toBe(8)
  12358 | })
  12359 | 
  12360 | test('R2 closing a record cancels the pending initial body focus callback', async ({ page }) => {
  12361 |   await page.setViewportSize({ width: 1440, height: 900 })
  12362 |   await page.emulateMedia({ reducedMotion: 'reduce' })
  12363 |   const { open } = await r2AutofocusFixture(page)
  12364 |   await open.click()
  12365 |   const surface = page.locator('[data-overlay-mode="drawer"]')
  12366 |   await expect(surface).toBeVisible()
  12367 |   await r2HoldInitialFocusFrames(page)
  12368 |   await r2ExpectPendingInitialFocus(page, surface.locator('.eotion-editor-content .tiptap'))
  12369 |   await page.getByRole('button', { name: '关闭记录' }).click()
  12370 |   await expect(surface).toHaveCount(0)
  12371 |   await expect(open).toBeFocused()
  12372 |   await page.evaluate(() => (window as any).__r2FlushFocusFrames())
  12373 |   await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  12374 |   await expect(open).toBeFocused()
  12375 | })
  12376 | 
  12377 | test('R2 renaming an unnamed record before body load retains the user focus and keeps body unchanged', async ({ page }) => {
  12378 |   await page.setViewportSize({ width: 1440, height: 900 })
  12379 |   await page.emulateMedia({ reducedMotion: 'reduce' })
  12380 |   const { api, item, open } = await r2AutofocusFixture(page, '无标题')
  12381 |   await open.click()
  12382 |   const surface = page.locator('[data-overlay-mode="drawer"]')
  12383 |   await expect(surface).toBeVisible()
  12384 |   const title = surface.getByRole('textbox', { name: '记录标题' })
  12385 |   const body = surface.locator('.eotion-editor-content .tiptap')
  12386 |   await expect(title).toHaveValue('无标题')
  12387 |   await expect(body).toHaveCount(0)
  12388 |   await title.fill('Edited record title')
  12389 |   await title.press('Tab')
  12390 |   await expect.poll(() => api.pages.find(candidate => candidate.id === item.pageId)?.title).toBe('Edited record title')
  12391 |   await page.evaluate(() => { (window as any).__r2UntitledFocusOwner = document.activeElement })
  12392 |   await page.evaluate(() => (window as any).__r2ReleaseBody())
  12393 |   await expect(body).toHaveText('Identity body')
  12394 |   await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  12395 |   expect(await page.evaluate(() => document.activeElement === (window as any).__r2UntitledFocusOwner)).toBe(true)
  12396 |   await expect(body).not.toBeFocused()
  12397 |   await title.fill('Renamed record title')
  12398 |   await title.press('Tab')
  12399 |   await expect.poll(() => api.pages.find(candidate => candidate.id === item.pageId)?.title).toBe('Renamed record title')
  12400 |   await expect(body).toHaveText('Identity body')
  12401 |   expect(JSON.stringify(api.blocks.find(candidate => candidate.id === 'r2-focus-body')?.props)).toContain('Identity body')
  12402 |   expect(JSON.stringify(api.blocks.find(candidate => candidate.id === 'r2-focus-body')?.props)).not.toContain('record title')
  12403 | })
  12404 | 
  12405 | for (const behavior of ['dirty refresh', 'clean canonical refresh', 'actual identity switch'] as const) {
  12406 |   test(`R4 record title reconciliation ${behavior}`, async ({ page }) => {
  12407 |     const { api, item, open } = await r2AutofocusFixture(page)
  12408 |     await open.click()
  12409 |     await page.evaluate(() => (window as any).__r2ReleaseBody())
  12410 |     const title = page.getByRole('textbox', { name: '记录标题' })
  12411 |     await expect(page.locator('[data-overlay-mode="drawer"] .tiptap')).toHaveText('Identity body')
  12412 |     await title.click()
  12413 |     if (behavior === 'dirty refresh') {
  12414 |       await title.fill('Dirty refresh draft')
  12415 |       const rebuilt = await page.evaluate(async () => {
  12416 |         const { useProductPagesStore } = await import('/src/stores/productPages.ts')
  12417 |         const pages = useProductPagesStore()
  12418 |         const previous = pages.items.find(item => item.id === 'r2-focus-page')
  12419 |         await pages.refresh()
  12420 |         return previous !== pages.items.find(item => item.id === 'r2-focus-page')
  12421 |       })
  12422 |       expect(rebuilt).toBe(true)
  12423 |       await expect(title).toBeFocused()
> 12424 |       await expect(title).toHaveValue('Dirty refresh draft')
        |                           ^ Error: expect(locator).toHaveValue(expected) failed
  12425 |       await title.press('Tab')
  12426 |       await expect.poll(() => api.pages.find(candidate => candidate.id === item.pageId)?.title).toBe('Dirty refresh draft')
  12427 |     } else if (behavior === 'clean canonical refresh') {
  12428 |       await page.evaluate(async () => {
  12429 |         const { useProductPagesStore } = await import('/src/stores/productPages.ts')
  12430 |         const { useProductSyncStore } = await import('/src/stores/productSync.ts')
  12431 |         const local = await useProductSyncStore().store()
  12432 |         const pages = useProductPagesStore()
  12433 |         const canonical = pages.items.find(item => item.id === 'r2-focus-page')!
  12434 |         await local.upsertPage({ ...canonical, title: 'Canonical changed title' })
  12435 |         await pages.refresh()
  12436 |       })
  12437 |       await expect(title).toHaveValue('Canonical changed title')
  12438 |       await expect(title).toBeFocused()
  12439 |     } else {
  12440 |       await title.fill('Old identity draft')
  12441 |       await page.evaluate(async () => {
  12442 |         const { useProductPagesStore } = await import('/src/stores/productPages.ts')
  12443 |         const { useProductSyncStore } = await import('/src/stores/productSync.ts')
  12444 |         const local = await useProductSyncStore().store()
  12445 |         const pages = useProductPagesStore()
  12446 |         const canonical = pages.items.find(item => item.id === 'r2-focus-page')!
  12447 |         await local.upsertPage({ ...canonical, id: 'r4-next-page', title: 'Next identity title' })
  12448 |         await pages.refresh()
  12449 |         const input = document.querySelector('[aria-label="记录标题"]') as HTMLElement & { __vueParentComponent?: any }
  12450 |         let component = input.__vueParentComponent
  12451 |         while (component && component.type?.__name !== 'PageView') component = component.parent
  12452 |         if (!component) throw new Error('Expected mounted record PageView')
  12453 |         component.props.embeddedPageId = 'r4-next-page'
  12454 |       })
  12455 |       await expect(title).toHaveValue('Next identity title')
  12456 |     }
  12457 |   })
  12458 | }
```