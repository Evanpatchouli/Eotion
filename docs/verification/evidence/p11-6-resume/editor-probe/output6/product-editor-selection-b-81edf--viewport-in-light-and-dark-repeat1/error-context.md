# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: product-editor.spec.ts >> selection bubble hides on collapse, blur, Escape and IME; stays in viewport in light and dark
- Location: ..\..\..\..\AppData\Local\Temp\eotion-p116-resume-dfbb4269eb4c4a6794279c34f3d9ba5d\editor-probe\product-editor.spec.ts:1012:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('toolbar', { name: '选区格式' })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('toolbar', { name: '选区格式' }) with timeout 5000ms
  - waiting for getByRole('toolbar', { name: '选区格式' })

```

```yaml
- complementary "工作区导航":
  - strong: Eotion
  - text: ava@example.com
  - button "收起侧边栏"
  - text: 工作区 Ava space
  - button "切换工作区"
  - text: 页面
  - button "新建根页面"
  - tree "页面树":
    - treeitem "Alpha 页面操作：Alpha" [level=1] [selected]:
      - button "Alpha"
      - button "页面操作：Alpha"
  - button "设置"
  - button "退出登录"
- main:
  - text: Ava space / Alpha
  - status: 已同步
  - article:
    - paragraph: Ava space
    - heading "Alpha" [level=1]
    - region "Tiptap 编辑器":
      - button "选择图片附件"
      - button "选择文件附件"
      - textbox "页面正文编辑区域":
        - button "在区块下方插入区块"
        - button "拖动区块"
        - paragraph: Selection near viewport edge
```

# Test source

```ts
  935  |   await page.getByRole('textbox', { name: '链接地址' }).fill('https://updated.example')
  936  |   await page.getByRole('button', { name: '应用链接' }).click()
  937  |   await expect(reloadedParagraph.locator('a')).toHaveAttribute('href', 'https://updated.example')
  938  |   await expect.poll(() => JSON.stringify(api.blocks.find(item => item.id === 'link-a')?.props.node)).toContain('"href":"https://updated.example"')
  939  | 
  940  |   await page.evaluate(() => localStorage.setItem('eotion:theme', 'dark'))
  941  |   await page.reload()
  942  |   const darkParagraph = editor(page).locator('p').first()
  943  |   await selectParagraphText(darkParagraph)
  944  |   await bubble(page).getByRole('button', { name: '链接' }).click()
  945  |   await expect(page.getByRole('textbox', { name: '链接地址' })).toHaveValue('https://updated.example')
  946  |   await canvasScreenshot(page, 'p587-desktop-dark-link-editing')
  947  |   await page.getByRole('button', { name: '移除链接' }).click()
  948  |   await expect(darkParagraph).toHaveText('Link text')
  949  |   await expect(darkParagraph.locator('a')).toHaveCount(0)
  950  |   await expect.poll(() => JSON.stringify(api.blocks.find(item => item.id === 'link-a')?.props.node)).not.toContain('"type":"link"')
  951  |   await page.reload()
  952  |   await expect(editor(page).locator('p').first()).toHaveText('Link text')
  953  |   await expect(editor(page).locator('p').first().locator('a')).toHaveCount(0)
  954  | 
  955  |   const combinedParagraph = editor(page).locator('p').nth(1)
  956  |   await selectParagraphText(combinedParagraph)
  957  |   await bubble(page).getByRole('button', { name: '粗体' }).click()
  958  |   await selectParagraphText(combinedParagraph)
  959  |   await bubble(page).getByRole('button', { name: '链接' }).click()
  960  |   await page.getByRole('textbox', { name: '链接地址' }).fill('http://combined.example')
  961  |   await page.getByRole('textbox', { name: '链接地址' }).press('Enter')
  962  |   await expect(combinedParagraph.locator('a strong')).toHaveText('Bold link')
  963  |   await expect.poll(() => JSON.stringify(api.blocks.find(item => item.id === 'link-b')?.props.node)).toContain('"type":"bold"')
  964  |   await expect.poll(() => JSON.stringify(api.blocks.find(item => item.id === 'link-b')?.props.node)).toContain('"type":"link"')
  965  |   const persistedLinkMark = (api.blocks.find(item => item.id === 'link-b')?.props.node as any).content[0].marks.find((mark: any) => mark.type === 'link')
  966  |   expect(persistedLinkMark.attrs).toEqual({ href: 'http://combined.example' })
  967  |   await page.reload()
  968  |   await expect(editor(page).locator('p').nth(1).locator('a strong')).toHaveText('Bold link')
  969  | })
  970  | 
  971  | test('link editor rejects unsafe schemes and invalid snapshots preserve the valid local page', async ({ page }) => {
  972  |   const api = await installApi(page, {
  973  |     pages: [pageRecord('page-a', 'Alpha', 1)],
  974  |     blocks: [block('page-a', 'unsafe-link', 1, { type: 'paragraph', content: [{ type: 'text', text: 'Reject this' }] })],
  975  |   })
  976  |   await page.goto('/#/app/ws-a/page/page-a')
  977  |   const paragraph = editor(page).locator('p')
  978  |   await selectParagraphText(paragraph)
  979  |   await bubble(page).getByRole('button', { name: '链接' }).click()
  980  |   const input = page.getByRole('textbox', { name: '链接地址' })
  981  |   for (const href of ['javascript:alert(1)', 'data:text/html,unsafe', 'file:///etc/passwd']) {
  982  |     await input.fill(href)
  983  |     await page.getByRole('button', { name: '应用链接' }).click()
  984  |     await expect(input).toBeVisible()
  985  |     await expect(paragraph.locator('a')).toHaveCount(0)
  986  |   }
  987  |   expect(blockRequests(api.requests).some(request => JSON.stringify(request.body).match(/javascript:|data:text\/html|file:\/\//))).toBe(false)
  988  | 
  989  |   const invalidNodes = [
  990  |     { type: 'paragraph', content: [{ type: 'text', text: 'bad scheme', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] },
  991  |     { type: 'paragraph', content: [{ type: 'text', text: 'bad data scheme', marks: [{ type: 'link', attrs: { href: 'data:text/html,unsafe' } }] }] },
  992  |     { type: 'paragraph', content: [{ type: 'text', text: 'bad file scheme', marks: [{ type: 'link', attrs: { href: 'file:///etc/passwd' } }] }] },
  993  |     { type: 'paragraph', content: [{ type: 'text', text: 'unknown link attr', marks: [{ type: 'link', attrs: { href: 'https://example.com', title: 'unknown' } }] }] },
  994  |     { type: 'paragraph', content: [{ type: 'text', text: 'unknown bold attr', marks: [{ type: 'bold', attrs: { level: 1 } }] }] },
  995  |   ]
  996  |   for (const [index, node] of invalidNodes.entries()) {
  997  |     api.blocks.splice(0, api.blocks.length, block('page-a', `invalid-${index}`, 1, node))
  998  |     await page.reload()
  999  |     await expect(page.locator('.product-sync-status')).toHaveAttribute('data-state', 'error')
  1000 |     await expect(editor(page)).toContainText('Reject this')
  1001 |     await expect(editor(page).locator('a')).toHaveCount(0)
  1002 |     const localBlocks = await page.evaluate(async () => {
  1003 |       const { useProductSyncStore } = await import('/src/stores/productSync.ts')
  1004 |       return (await useProductSyncStore().store()).listBlocksByPage('page-a')
  1005 |     })
  1006 |     expect(localBlocks.map(({ id }) => id)).toEqual(['unsafe-link'])
  1007 |     expect(localBlocks[0]?.props.node).toEqual({ type: 'paragraph', content: [{ type: 'text', text: 'Reject this' }] })
  1008 |     expect(blockRequests(api.requests)).toHaveLength(0)
  1009 |   }
  1010 | })
  1011 | 
  1012 | test('selection bubble hides on collapse, blur, Escape and IME; stays in viewport in light and dark', async ({ page }) => {
  1013 |   const browserErrors: string[] = []
  1014 |   page.on('pageerror', error => browserErrors.push(error.message))
  1015 |   await installApi(page, { pages: [pageRecord('page-a', 'Alpha', 1)], blocks: [block('page-a', 'bubble-a', 1, { type: 'paragraph', content: [{ type: 'text', text: 'Selection near viewport edge' }] })] })
  1016 |   await page.setViewportSize({ width: 800, height: 420 })
  1017 |   await page.goto('/#/app/ws-a/page/page-a')
  1018 |   await expect(page.locator('.product-shell')).toHaveAttribute('data-layout', 'tablet')
  1019 |   await expect(page.locator('.product-shell')).toHaveAttribute('data-input', 'mouse')
  1020 |   const body = editor(page)
  1021 |   const menu = bubble(page)
  1022 |   await body.locator('p').click(); await waitDomSelection(page)
  1023 |   await expect(menu).toHaveCount(0)
  1024 |   await selectParagraphText(body.locator('p')); await waitDomSelection(page)
  1025 |   await expect(menu).toBeVisible()
  1026 |   await page.setViewportSize({ width: 390, height: 844 })
  1027 |   await expect(page.locator('.product-shell')).toHaveAttribute('data-layout', 'mobile')
  1028 |   await expect(menu).toHaveCount(0)
  1029 |   await expect(page.getByRole('toolbar', { name: '触摸编辑工具栏' }).getByRole('button')).toHaveCount(9)
  1030 |   await page.setViewportSize({ width: 800, height: 420 })
  1031 |   await expect(page.locator('.product-shell')).toHaveAttribute('data-layout', 'tablet')
  1032 |   await body.locator('p').click()
  1033 |   await expect(menu).toHaveCount(0)
  1034 |   await selectParagraphText(body.locator('p'))
> 1035 |   await expect(menu).toBeVisible()
       |                      ^ Error: expect(locator).toBeVisible() failed
  1036 |   const position = await menu.evaluate(node => {
  1037 |     const rect = node.getBoundingClientRect()
  1038 |     return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight }
  1039 |   })
  1040 |   expect(position.left).toBeGreaterThanOrEqual(0)
  1041 |   expect(position.right).toBeLessThanOrEqual(position.width)
  1042 |   expect(position.top).toBeGreaterThanOrEqual(0)
  1043 |   expect(position.bottom).toBeLessThanOrEqual(position.height)
  1044 |   await body.locator('p').evaluate(node => { (node as HTMLElement).style.textAlign = 'right' })
  1045 |   await selectParagraphText(body.locator('p'))
  1046 |   await expect(menu).toBeVisible()
  1047 |   const rightEdge = await menu.boundingBox()
  1048 |   expect(rightEdge).not.toBeNull()
  1049 |   expect(rightEdge!.x + rightEdge!.width).toBeLessThanOrEqual(800)
  1050 |   await body.locator('p').evaluate(node => { (node as HTMLElement).style.textAlign = '' })
  1051 |   await page.setViewportSize({ width: 1440, height: 900 })
  1052 |   await selectParagraphText(body.locator('p'))
  1053 |   await expect(menu).toBeVisible()
  1054 |   await page.keyboard.press('Escape')
  1055 |   await expect(menu).toHaveCount(0)
  1056 |   await body.locator('p').click()
  1057 |   await expect(menu).toHaveCount(0)
  1058 |   await selectParagraphText(body.locator('p'))
  1059 |   await expect(menu).toBeVisible()
  1060 |   await page.locator('.eotion-bubble-menu-host').focus()
  1061 |   await page.keyboard.press('Escape')
  1062 |   await expect(menu).toHaveCount(0)
  1063 |   await body.locator('p').click()
  1064 |   await selectParagraphText(body.locator('p'))
  1065 |   await expect(menu).toBeVisible()
  1066 |   await menu.getByRole('button', { name: '粗体' }).focus()
  1067 |   await page.keyboard.press('Escape')
  1068 |   await expect(menu).toHaveCount(0)
  1069 |   await body.locator('p').click()
  1070 |   await selectParagraphText(body.locator('p'))
  1071 |   await expect(menu).toBeVisible()
  1072 |   await body.evaluate(node => node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })))
  1073 |   await expect(menu).toHaveCount(0)
  1074 |   await body.evaluate(node => node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })))
  1075 |   await body.evaluate(node => (node as HTMLElement).blur())
  1076 |   await expect(menu).toHaveCount(0)
  1077 |   await page.evaluate(() => localStorage.setItem('eotion:theme', 'dark'))
  1078 |   await page.reload()
  1079 |   await selectParagraphText(editor(page).locator('p'))
  1080 |   await expect(bubble(page)).toBeVisible()
  1081 |   await canvasScreenshot(page, 'p586-desktop-dark-selection')
  1082 |   expect(browserErrors).toEqual([])
  1083 | })
  1084 | 
  1085 | test('tablet coarse pointer hides selection bubble and keeps touch toolbar available', async ({ page }) => {
  1086 |   await page.addInitScript(() => {
  1087 |     const nativeMatchMedia = window.matchMedia.bind(window)
  1088 |     window.matchMedia = (query: string) => {
  1089 |       const result = nativeMatchMedia(query)
  1090 |       if (query === '(pointer: coarse)') Object.defineProperty(result, 'matches', { configurable: true, value: true })
  1091 |       return result
  1092 |     }
  1093 |   })
  1094 |   await installApi(page, { pages: [pageRecord('page-a', 'Alpha', 1)], blocks: [block('page-a', 'bubble-a', 1, { type: 'paragraph', content: [{ type: 'text', text: 'Tablet selection' }] })] })
  1095 |   await page.setViewportSize({ width: 800, height: 1024 })
  1096 |   await page.goto('/#/app/ws-a/page/page-a')
  1097 |   await expect(page.locator('.product-shell')).toHaveAttribute('data-layout', 'tablet')
  1098 |   await expect(page.locator('.product-shell')).toHaveAttribute('data-input', 'hybrid')
  1099 |   await selectParagraphText(editor(page).locator('p'))
  1100 |   await expect(bubble(page)).toHaveCount(0)
  1101 |   await expect(page.getByRole('toolbar', { name: '触摸编辑工具栏' }).getByRole('button')).toHaveCount(9)
  1102 | })
  1103 | 
  1104 | test('mobile selection bubble stays hidden without horizontal overflow and leaves touch toolbar available', async ({ page }) => {
  1105 |   await page.addInitScript(() => {
  1106 |     const nativeMatchMedia = window.matchMedia.bind(window)
  1107 |     window.matchMedia = (query: string) => {
  1108 |       const result = nativeMatchMedia(query)
  1109 |       if (query === '(pointer: coarse)') Object.defineProperty(result, 'matches', { configurable: true, value: true })
  1110 |       return result
  1111 |     }
  1112 |   })
  1113 |   await installApi(page, { pages: [pageRecord('page-a', 'Alpha', 1)], blocks: [block('page-a', 'bubble-a', 1, { type: 'paragraph', content: [{ type: 'text', text: 'Mobile selection' }] })] })
  1114 |   await page.setViewportSize({ width: 390, height: 844 })
  1115 |   await page.goto('/#/app/ws-a/page/page-a')
  1116 |   await expect(page.locator('.product-shell')).toHaveAttribute('data-layout', 'mobile')
  1117 |   await expect(page.locator('.product-shell')).toHaveAttribute('data-input', 'touch')
  1118 |   await selectParagraphText(editor(page).locator('p'))
  1119 |   await expect(bubble(page)).toHaveCount(0)
  1120 |   await expect(page.getByRole('toolbar', { name: '触摸编辑工具栏' }).getByRole('button')).toHaveCount(9)
  1121 |   await pasteHtml(editor(page), '<p><a href="https://touch.example">Touch link</a></p>', 'Touch link')
  1122 |   await expect(editor(page).locator('a')).toHaveAttribute('href', 'https://touch.example')
  1123 |   await expect(bubble(page)).toHaveCount(0)
  1124 |   expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  1125 |   await canvasScreenshot(page, 'p587-mobile-link')
  1126 | })
  1127 | 
  1128 | test('non-formatable code block and attachment selection never open the text formatting bubble', async ({ page }) => {
  1129 |   const attachment = block('page-a', 'bubble-image', 2, {
  1130 |     type: 'eotionImage', attrs: { fileId: 'image-file', name: 'image.png', mimeType: 'image/png', size: 10, url: 'https://example.com/image.png' },
  1131 |   })
  1132 |   attachment.type = 'image'
  1133 |   const codeBlock = block('page-a', 'bubble-code-block', 3, { type: 'codeBlock', content: [{ type: 'text', text: 'No marks here' }] })
  1134 |   codeBlock.type = 'code'
  1135 |   await installApi(page, {
```