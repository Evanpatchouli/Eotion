# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: product-attachments.spec.ts >> offline file selection stays local, does not call upload, keeps text editable and reloads attachment metadata
- Location: tests\product-attachments.spec.ts:686:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('.eotion-editor-content .tiptap')
Expected substring: "正文仍然可编辑"
Received string:    "existing.txt纯文本 · 9 Boffline.txt上传失败 · 附件上传需要联网；正文仍可继续编辑。 重试文仍然可编辑"
Timeout: 5000ms

Call log:
  - Expect "toContainText" locator('.eotion-editor-content .tiptap') with timeout 5000ms
  - waiting for locator('.eotion-editor-content .tiptap')
    14 × locator resolved to <div tabindex="0" role="textbox" translate="no" spellcheck="false" aria-multiline="true" aria-label="页面正文编辑区域" contenteditable="true" class="tiptap ProseMirror ProseMirror-focused">…</div>
       - unexpected value "existing.txt纯文本 · 9 Boffline.txt上传失败 · 附件上传需要联网；正文仍可继续编辑。 重试文仍然可编辑"

```

```yaml
- textbox "页面正文编辑区域":
  - link "existing.txt 纯文本 · 9 B":
    - /url: https://objects.example.test/existing
  - button "附件操作"
  - button "在区块下方插入区块"
  - button "拖动区块"
  - strong: offline.txt
  - status: 上传失败 · 附件上传需要联网；正文仍可继续编辑。
  - button "重试上传 offline.txt": 重试
  - button "移除 offline.txt"
  - paragraph: 文仍然可编辑
```

# Test source

```ts
  597 |   api.controls.uploadDelayMs = 500
  598 |   await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  599 |   const body = editor(page)
  600 |   await body.dispatchEvent('compositionstart', { data: '' })
  601 |   await insertFile(page, 'file', 'ime-wait.txt', 'text/plain')
  602 |   await expect.poll(() => uploadRequests(api).length).toBe(1)
  603 |   await page.waitForTimeout(700)
  604 |   await expect(page.locator('.attachment-file')).toHaveCount(0)
  605 |   expect(api.blocks.filter((item) => item.type === 'file')).toHaveLength(0)
  606 |   await body.dispatchEvent('compositionend', { data: '' })
  607 |   await expect(page.locator('.attachment-file-name')).toHaveText('ime-wait.txt')
  608 |   await expect.poll(() => api.blocks.filter((item) => item.type === 'file').length).toBe(1)
  609 | })
  610 | 
  611 | test('deleting an attachment stays permanent through undo and redo while ordinary text undo still works', async ({ page }, testInfo) => {
  612 |   const pageErrors: string[] = []
  613 |   page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message))
  614 |   const api = await installApi(page, [
  615 |     block('undo-text', 1, { type: 'paragraph', content: [{ type: 'text', text: 'keep' }] }),
  616 |     block('undo-file', 2, { type: 'eotionFile', attrs: { fileId: 'undo-file-id', name: 'remove-me.txt', mimeType: 'text/plain', size: 8, url: 'https://objects.example.test/undo' } }),
  617 |   ])
  618 |   await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  619 |   await expect(page.locator('.attachment-file-name')).toHaveText('remove-me.txt')
  620 |   await deleteAttachment(page, '.attachment-file')
  621 |   await expect(page.locator('.attachment-file')).toHaveCount(0)
  622 |   await page.keyboard.press('Control+Z')
  623 |   await expect(page.locator('.attachment-file')).toHaveCount(0)
  624 |   await page.keyboard.press('Control+Shift+Z')
  625 |   await expect(page.locator('.attachment-file')).toHaveCount(0)
  626 |   const editorState = await page.evaluate(() => {
  627 |     const body = document.querySelector('.tiptap')
  628 |     const active = document.activeElement
  629 |     const selection = document.getSelection()
  630 |     return {
  631 |       editorText: body?.textContent ?? null,
  632 |       editorHtml: body?.innerHTML ?? null,
  633 |       activeElement: active ? { tagName: active.tagName, className: (active as HTMLElement).className, label: active.getAttribute('aria-label'), text: active.textContent } : null,
  634 |       selection: selection ? { anchorText: selection.anchorNode?.textContent ?? null, anchorOffset: selection.anchorOffset, focusText: selection.focusNode?.textContent ?? null, focusOffset: selection.focusOffset, collapsed: selection.isCollapsed } : null,
  635 |     }
  636 |   })
  637 |   await testInfo.attach('editor-state-after-attachment-undo-redo.json', { body: Buffer.from(JSON.stringify(editorState, null, 2)), contentType: 'application/json' })
  638 |   await editor(page).locator(':scope > p').first().click()
  639 |   await editor(page).press('End')
  640 |   await editor(page).pressSequentially(' edit')
  641 |   const firstParagraph = editor(page).locator(':scope > p').first()
  642 |   await expect(firstParagraph).toHaveText('keep edit')
  643 |   await page.keyboard.press('Control+Z')
  644 |   await expect(editor(page).locator(':scope > p').first()).toHaveText('keep')
  645 |   await page.keyboard.press('Control+Shift+Z')
  646 |   await expect(editor(page).locator(':scope > p').first()).toHaveText('keep edit')
  647 |   await expect(page.locator('.attachment-file')).toHaveCount(0)
  648 |   await expect.poll(() => api.blocks.some((item) => item.id === 'undo-file')).toBe(false)
  649 |   expect(pageErrors, JSON.stringify(editorState)).toEqual([])
  650 | })
  651 | 
  652 | test('quick cancel and fresh selection stay safe while compensation DELETE is in flight', async ({ page }) => {
  653 |   const api = await installApi(page)
  654 |   api.controls.holdUploads = true
  655 |   api.controls.holdCleanupDeletes = true
  656 |   await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  657 |   await insertFile(page, 'file', 'quick-retry.txt', 'text/plain')
  658 |   await expect(page.locator('.eotion-upload-item')).toContainText('正在上传')
  659 |   await page.getByRole('button', { name: '取消上传 quick-retry.txt' }).click()
  660 |   await expect(inlineUploads(page)).toHaveCount(0)
  661 |   await expect(page.locator('.eotion-upload-terminal')).toContainText('quick-retry.txt · 已取消')
  662 |   await expect.poll(() => api.requests.filter((item) => item.method === 'DELETE').length).toBe(1)
  663 | 
  664 |   api.controls.holdUploads = false
  665 |   await insertFile(page, 'file', 'quick-retry.txt', 'text/plain')
  666 |   await expect(page.locator('.attachment-file-name')).toHaveText('quick-retry.txt')
  667 |   const fileIds = uploadRequests(api).map((item) => item.fileId)
  668 |   expect(uploadRequests(api)).toHaveLength(2)
  669 |   expect(new Set(fileIds).size).toBe(2)
  670 |   const localAttachments = await page.evaluate(async (pageId) => {
  671 |     const { useProductSyncStore } = await import('/src/stores/productSync.ts')
  672 |     const local = await useProductSyncStore().store()
  673 |     return (await local.listBlocksByPage(pageId)).filter((item) => item.type === 'file')
  674 |   }, pageRecord.id)
  675 |   expect(localAttachments).toHaveLength(1)
  676 |   const finalId = ((localAttachments[0]!.props.node as any).attrs.fileId) as string
  677 |   expect(finalId).toBe(decodeURIComponent(fileIds[1]!))
  678 |   expect([...api.files.values()].some((file) => file.id === finalId)).toBe(true)
  679 |   expect(api.requests.filter((item) => item.method === 'DELETE')).toHaveLength(1)
  680 | 
  681 |   api.releaseCleanupDeletes()
  682 |   await expect.poll(() => api.blocks.filter((item) => item.type === 'file').length).toBe(1)
  683 |   expect([...api.files.values()].some((file) => file.id === finalId)).toBe(true)
  684 | })
  685 | 
  686 | test('offline file selection stays local, does not call upload, keeps text editable and reloads attachment metadata', async ({ page }) => {
  687 |   const seed = block('existing-file', 1, { type: 'eotionFile', attrs: { fileId: 'existing-file-id', name: 'existing.txt', mimeType: 'text/plain', size: 9, url: 'https://objects.example.test/existing' } })
  688 |   const api = await installApi(page, [seed])
  689 |   await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  690 |   await expect(page.locator('.attachment-file-name')).toHaveText('existing.txt')
  691 |   await page.evaluate(() => { (window as any).__eotionOnline = false; window.dispatchEvent(new Event('offline')) })
  692 |   const requestCount = uploadRequests(api).length
  693 |   await insertFile(page, 'file', 'offline.txt', 'text/plain')
  694 |   await expect(page.locator('.eotion-upload-item')).toContainText('附件上传需要联网')
  695 |   await editor(page).click()
  696 |   await editor(page).pressSequentially('正文仍然可编辑')
> 697 |   await expect(editor(page)).toContainText('正文仍然可编辑')
      |                              ^ Error: expect(locator).toContainText(expected) failed
  698 |   await expect.poll(() => page.evaluate(async (id) => {
  699 |     const { useProductSyncStore } = await import('/src/stores/productSync.ts')
  700 |     const local = await useProductSyncStore().store()
  701 |     return JSON.stringify(await local.listBlocksByPage(id))
  702 |   }, pageRecord.id)).toContain('正文仍然可编辑')
  703 |   expect(uploadRequests(api)).toHaveLength(requestCount)
  704 |   await page.reload()
  705 |   await expect(page.locator('.attachment-file-name')).toHaveText('existing.txt')
  706 |   await expect(editor(page)).toContainText('正文仍然可编辑')
  707 | })
  708 | 
  709 | test('deleting a page queues cleanup for all attachment metadata after block deletion', async ({ page }) => {
  710 |   const blocks = [
  711 |     block('image-block', 1, { type: 'eotionImage', attrs: { fileId: 'page-image', name: 'photo.png', mimeType: 'image/png', size: 10, url: 'https://objects.example.test/photo' } }),
  712 |     block('file-block', 2, { type: 'eotionFile', attrs: { fileId: 'page-file', name: 'notes.txt', mimeType: 'text/plain', size: 12, url: 'https://objects.example.test/notes' } }),
  713 |   ]
  714 |   const api = await installApi(page, blocks)
  715 |   api.controls.cleanupStatus = 503
  716 |   await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  717 |   await expect(page.locator('.attachment')).toHaveCount(2)
  718 |   await page.getByRole('button', { name: `页面操作：${pageRecord.title}` }).click()
  719 |   await page.getByRole('menu', { name: `${pageRecord.title} 的操作` }).getByRole('menuitem', { name: '删除' }).click()
  720 |   await page.getByRole('dialog', { name: '删除页面？' }).getByRole('button', { name: '删除', exact: true }).click()
  721 |   await expect(page.getByText('还没有页面')).toBeVisible()
  722 |   await expect.poll(() => api.requests.filter((item) => item.method === 'DELETE').length).toBe(2)
  723 |   expect(api.requests.filter((item) => item.method === 'DELETE').map((item) => item.path).sort()).toEqual([
  724 |     `/api/workspaces/${workspace.id}/files/page-file`, `/api/workspaces/${workspace.id}/files/page-image`,
  725 |   ])
  726 |   await expect(page.locator('.product-cleanup-status')).toContainText('附件清理暂未完成')
  727 |   api.controls.cleanupStatus = 204
  728 |   await page.getByRole('button', { name: '重试清理' }).click()
  729 |   await expect(page.locator('.product-cleanup-status')).toHaveCount(0)
  730 |   await expect.poll(() => api.requests.filter((item) => item.method === 'DELETE').length).toBe(4)
  731 | })
  732 | 
  733 | test('failed image uses fallback and unsafe URL or unknown attachment attrs keep the page read-only', async ({ page }) => {
  734 |   const badImage = block('bad-image', 1, { type: 'eotionImage', attrs: { fileId: 'bad-image-id', name: 'broken.png', mimeType: 'image/png', size: 10, url: 'https://objects.example.test/broken' } })
  735 |   const api = await installApi(page, [badImage])
  736 |   await page.route('https://objects.example.test/broken', (route) => route.fulfill({ status: 404, body: 'missing' }))
  737 |   await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  738 |   await expect(page.locator('.attachment-image-fallback')).toHaveAttribute('role', 'img')
  739 |   expect(blockOperations(api)).toHaveLength(0)
  740 | 
  741 |   const browser = page.context().browser()
  742 |   expect(browser).not.toBeNull()
  743 |   // Each malformed snapshot needs a clean local store: another tab with this
  744 |   // workspace/page can otherwise open its valid IndexedDB cache before the API fixture.
  745 |   const unsafe = { ...badImage, props: { node: { type: 'eotionImage', attrs: { fileId: 'unsafe-id', name: 'unsafe.png', mimeType: 'image/png', size: 10, url: 'javascript:alert(1)' } } } }
  746 |   const second = await browser!.newPage()
  747 |   try {
  748 |     await installApi(second, [unsafe])
  749 |     await second.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  750 |     await expect(second.getByRole('region', { name: '暂时无法加载页面' }).getByRole('alert'))
  751 |       .toHaveText('Invalid block attributes in workspace snapshot')
  752 |     await expect(editor(second)).toHaveCount(0)
  753 |   } finally {
  754 |     await second.close()
  755 |   }
  756 | 
  757 |   const unknown = { ...badImage, props: { node: { type: 'eotionImage', attrs: { fileId: 'unknown-id', name: 'x.png', mimeType: 'image/png', size: 10, url: 'https://objects.example.test/x', serverSecret: 'preserve' } } } }
  758 |   const third = await browser!.newPage()
  759 |   try {
  760 |     await installApi(third, [unknown])
  761 |     await third.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  762 |     await expect(third.getByRole('region', { name: '暂时无法加载页面' }).getByRole('alert'))
  763 |       .toHaveText('Invalid block attributes in workspace snapshot')
  764 |     await expect(editor(third)).toHaveCount(0)
  765 |   } finally {
  766 |     await third.close()
  767 |   }
  768 | })
  769 | 
  770 | test('long attachment names fit a 390px viewport and action buttons remain touch sized', async ({ page }) => {
  771 |   const longName = `${'very-long-'.repeat(18)}attachment-name.txt`
  772 |   const api = await installApi(page, [block('long-file', 1, { type: 'eotionFile', attrs: { fileId: 'long-file-id', name: longName, mimeType: 'text/plain', size: 10, url: 'https://objects.example.test/long' } })])
  773 |   await page.setViewportSize({ width: 390, height: 844 })
  774 |   await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  775 |   const dims = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth }))
  776 |   expect(dims.document).toBeLessThanOrEqual(dims.viewport)
  777 |   const attachment = page.locator('.attachment-file')
  778 |   const button = attachment.getByRole('button', { name: '附件操作' })
  779 |   const box = await button.boundingBox()
  780 |   expect(box?.width).toBeGreaterThanOrEqual(40)
  781 |   expect(box?.height).toBeGreaterThanOrEqual(40)
  782 |   await button.click()
  783 |   await attachment.getByRole('menuitem', { name: '删除' }).click()
  784 |   await attachment.getByRole('menuitem', { name: '确认删除' }).click()
  785 |   await expect.poll(() => api.blocks.filter((item) => item.type === 'file').length).toBe(0)
  786 |   expect(blockOperations(api).some((item) => item.body.kind === 'block.delete')).toBe(true)
  787 | })
  788 | 
  789 | test('file drop and image paste upload files, while text/html paste remains handled by the editor', async ({ page }) => {
  790 |   const api = await installApi(page)
  791 |   await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  792 |   const body = editor(page)
  793 |   await body.evaluate((element) => {
  794 |     const transfer = new DataTransfer()
  795 |     transfer.items.add(new File(['dropped'], 'dropped.txt', { type: 'text/plain' }))
  796 |     element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  797 |   })
```