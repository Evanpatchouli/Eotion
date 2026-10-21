# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: product-pages.spec.ts >> touch page action dialogs >> mobile page actions use modal dialogs with focus, stable tree and a scrollable destination list
- Location: tests\product-pages.spec.ts:745:1

# Error details

```
Error: expect(received).toBeLessThanOrEqual(expected)

Expected: <= 348
Received:    544
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e4]:
    - complementary "工作区导航" [ref=e5]:
      - generic [ref=e6]:
        - strong [ref=e8]: Eotion
        - generic "ava@example.com" [ref=e10]
        - button "关闭导航菜单" [ref=e11] [cursor=pointer]
      - generic [ref=e14]:
        - generic [ref=e15]: 工作区
        - generic [ref=e17]:
          - generic [aria-hidden] [ref=e18]: 工
          - generic [ref=e19]: 工作空间
          - button "切换工作区" [ref=e20] [cursor=pointer]
      - generic [ref=e24]:
        - generic [ref=e25]:
          - generic [ref=e26]: 页面
          - button "新建根页面" [ref=e27] [cursor=pointer]
        - tree "页面树" [ref=e30]:
          - treeitem [expanded] [level=1] [ref=e31]:
            - generic [ref=e34]:
              - button "收起工作笔记的子页面" [expanded] [ref=e36] [cursor=pointer]
              - button "工作笔记" [ref=e39] [cursor=pointer]
              - button "页面操作：工作笔记" [ref=e42] [cursor=pointer]
          - treeitem [level=2] [selected] [ref=e45]:
            - generic [ref=e48]:
              - button "展开今日计划的子页面" [ref=e50] [cursor=pointer]
              - button "今日计划" [ref=e53] [cursor=pointer]
              - button "页面操作：今日计划" [ref=e56] [cursor=pointer]
          - treeitem [level=1] [ref=e59]:
            - generic [ref=e62]:
              - button "阅读清单 1" [ref=e63] [cursor=pointer]
              - button "页面操作：阅读清单 1" [ref=e69] [cursor=pointer]
          - treeitem [level=1] [ref=e72]:
            - generic [ref=e75]:
              - button "阅读清单 2" [ref=e76] [cursor=pointer]
              - button "页面操作：阅读清单 2" [ref=e82] [cursor=pointer]
          - treeitem [level=1] [ref=e85]:
            - generic [ref=e88]:
              - button "阅读清单 3" [ref=e89] [cursor=pointer]
              - button "页面操作：阅读清单 3" [ref=e95] [cursor=pointer]
          - treeitem [level=1] [ref=e98]:
            - generic [ref=e101]:
              - button "阅读清单 4" [ref=e102] [cursor=pointer]
              - button "页面操作：阅读清单 4" [ref=e108] [cursor=pointer]
          - treeitem [level=1] [ref=e111]:
            - generic [ref=e114]:
              - button "阅读清单 5" [ref=e115] [cursor=pointer]
              - button "页面操作：阅读清单 5" [ref=e121] [cursor=pointer]
          - treeitem [level=1] [ref=e124]:
            - generic [ref=e127]:
              - button "阅读清单 6" [ref=e128] [cursor=pointer]
              - button "页面操作：阅读清单 6" [ref=e134] [cursor=pointer]
          - treeitem [level=1] [ref=e137]:
            - generic [ref=e140]:
              - button "阅读清单 7" [ref=e141] [cursor=pointer]
              - button "页面操作：阅读清单 7" [ref=e147] [cursor=pointer]
          - treeitem [level=1] [ref=e150]:
            - generic [ref=e153]:
              - button "阅读清单 8" [ref=e154] [cursor=pointer]
              - button "页面操作：阅读清单 8" [ref=e160] [cursor=pointer]
          - treeitem [level=1] [ref=e163]:
            - generic [ref=e166]:
              - button "阅读清单 9" [ref=e167] [cursor=pointer]
              - button "页面操作：阅读清单 9" [ref=e173] [cursor=pointer]
          - treeitem [level=1] [ref=e176]:
            - generic [ref=e179]:
              - button "阅读清单 10" [ref=e180] [cursor=pointer]
              - button "页面操作：阅读清单 10" [ref=e186] [cursor=pointer]
          - treeitem [level=1] [ref=e189]:
            - generic [ref=e192]:
              - button "阅读清单 11" [ref=e193] [cursor=pointer]
              - button "页面操作：阅读清单 11" [ref=e199] [cursor=pointer]
          - treeitem [level=1] [ref=e202]:
            - generic [ref=e205]:
              - button "阅读清单 12" [ref=e206] [cursor=pointer]
              - button "页面操作：阅读清单 12" [ref=e212] [cursor=pointer]
          - treeitem [level=1] [ref=e215]:
            - generic [ref=e218]:
              - button "阅读清单 13" [ref=e219] [cursor=pointer]
              - button "页面操作：阅读清单 13" [ref=e225] [cursor=pointer]
          - treeitem [level=1] [ref=e228]:
            - generic [ref=e231]:
              - button "阅读清单 14" [ref=e232] [cursor=pointer]
              - button "页面操作：阅读清单 14" [ref=e238] [cursor=pointer]
          - treeitem [level=1] [ref=e241]:
            - generic [ref=e244]:
              - button "阅读清单 15" [ref=e245] [cursor=pointer]
              - button "页面操作：阅读清单 15" [ref=e251] [cursor=pointer]
          - treeitem [level=1] [ref=e254]:
            - generic [ref=e257]:
              - button "阅读清单 16" [ref=e258] [cursor=pointer]
              - button "页面操作：阅读清单 16" [ref=e264] [cursor=pointer]
          - treeitem [level=1] [ref=e267]:
            - generic [ref=e270]:
              - button "阅读清单 17" [ref=e271] [cursor=pointer]
              - button "页面操作：阅读清单 17" [ref=e277] [cursor=pointer]
          - treeitem [level=1] [ref=e280]:
            - generic [ref=e283]:
              - button "阅读清单 18" [ref=e284] [cursor=pointer]
              - button "页面操作：阅读清单 18" [ref=e290] [cursor=pointer]
          - treeitem [level=1] [ref=e293]:
            - generic [ref=e296]:
              - button "阅读清单 19" [ref=e297] [cursor=pointer]
              - button "页面操作：阅读清单 19" [ref=e303] [cursor=pointer]
          - treeitem [level=1] [ref=e306]:
            - generic [ref=e309]:
              - button "阅读清单 20" [ref=e310] [cursor=pointer]
              - button "页面操作：阅读清单 20" [ref=e316] [cursor=pointer]
          - treeitem [level=1] [ref=e319]:
            - generic [ref=e322]:
              - button "阅读清单 21" [ref=e323] [cursor=pointer]
              - button "页面操作：阅读清单 21" [ref=e329] [cursor=pointer]
          - treeitem [level=1] [ref=e332]:
            - generic [ref=e335]:
              - button "阅读清单 22" [ref=e336] [cursor=pointer]
              - button "页面操作：阅读清单 22" [ref=e342] [cursor=pointer]
          - treeitem [level=1] [ref=e345]:
            - generic [ref=e348]:
              - button "阅读清单 23" [ref=e349] [cursor=pointer]
              - button "页面操作：阅读清单 23" [ref=e355] [cursor=pointer]
          - treeitem [level=1] [ref=e358]:
            - generic [ref=e361]:
              - button "阅读清单 24" [ref=e362] [cursor=pointer]
              - button "页面操作：阅读清单 24" [ref=e368] [cursor=pointer]
          - treeitem [level=1] [ref=e371]:
            - generic [ref=e374]:
              - button "阅读清单 25" [ref=e375] [cursor=pointer]
              - button "页面操作：阅读清单 25" [ref=e381] [cursor=pointer]
          - treeitem [level=1] [ref=e384]:
            - generic [ref=e387]:
              - button "阅读清单 26" [ref=e388] [cursor=pointer]
              - button "页面操作：阅读清单 26" [ref=e394] [cursor=pointer]
          - treeitem [level=1] [ref=e397]:
            - generic [ref=e400]:
              - button "阅读清单 27" [ref=e401] [cursor=pointer]
              - button "页面操作：阅读清单 27" [ref=e407] [cursor=pointer]
          - treeitem [level=1] [ref=e410]:
            - generic [ref=e413]:
              - button "阅读清单 28" [ref=e414] [cursor=pointer]
              - button "页面操作：阅读清单 28" [ref=e420] [cursor=pointer]
          - treeitem [level=1] [ref=e423]:
            - generic [ref=e426]:
              - button "阅读清单 29" [ref=e427] [cursor=pointer]
              - button "页面操作：阅读清单 29" [ref=e433] [cursor=pointer]
          - treeitem [level=1] [ref=e436]:
            - generic [ref=e439]:
              - button "阅读清单 30" [ref=e440] [cursor=pointer]
              - button "页面操作：阅读清单 30" [ref=e446] [cursor=pointer]
      - generic [ref=e449]:
        - button "设置" [ref=e451] [cursor=pointer]
        - button "退出登录" [ref=e455] [cursor=pointer]
    - main [ref=e459]:
      - generic [ref=e460]:
        - button "打开导航菜单" [ref=e461] [cursor=pointer]
        - generic [ref=e464]: 工作空间 / 今日计划
        - status [ref=e465]: 已同步
      - article [ref=e467]:
        - generic [ref=e468]:
          - paragraph [ref=e469]: 工作空间
          - heading "今日计划" [level=1] [ref=e471]
          - region "Tiptap 编辑器" [ref=e472]:
            - button "选择图片附件" [ref=e473]
            - button "选择文件附件" [ref=e474]
            - textbox "页面正文编辑区域" [ref=e476]:
              - paragraph [ref=e477]
            - toolbar "触摸编辑工具栏" [ref=e478]:
              - button "粗体" [ref=e479] [cursor=pointer]
              - button "斜体" [ref=e482] [cursor=pointer]
              - button "文本" [pressed] [ref=e485] [cursor=pointer]
              - button "二级标题（H2）" [ref=e489] [cursor=pointer]:
                - subscript [ref=e493]: "2"
                - generic [ref=e494]: 标题
              - button "列表" [ref=e495] [cursor=pointer]
              - button "缩进区块" [disabled] [ref=e499]: ⇥
              - button "取消缩进区块" [disabled] [ref=e500]: ⇤
              - button "插入图片" [ref=e501] [cursor=pointer]
              - button "插入文件" [ref=e504] [cursor=pointer]
  - dialog "移动页面" [ref=e507]:
    - region [ref=e508]:
      - heading "移动页面" [level=2] [ref=e509]
      - generic [ref=e510]:
        - radiogroup "移动到" [ref=e511]:
          - generic [ref=e513] [cursor=pointer]:
            - radio "根级" [ref=e514]
            - generic [ref=e518]: 根级
          - generic [ref=e519] [cursor=pointer]:
            - radio "工作笔记" [checked] [active] [ref=e520]
            - generic [ref=e524]: 工作笔记
          - generic [ref=e527] [cursor=pointer]:
            - radio "阅读清单 1" [ref=e528]
            - generic [ref=e532]: 阅读清单 1
          - generic [ref=e533] [cursor=pointer]:
            - radio "阅读清单 2" [ref=e534]
            - generic [ref=e538]: 阅读清单 2
          - generic [ref=e539] [cursor=pointer]:
            - radio "阅读清单 3" [ref=e540]
            - generic [ref=e544]: 阅读清单 3
          - generic [ref=e545] [cursor=pointer]:
            - radio "阅读清单 4" [ref=e546]
            - generic [ref=e550]: 阅读清单 4
          - generic [ref=e551] [cursor=pointer]:
            - radio "阅读清单 5" [ref=e552]
            - generic [ref=e556]: 阅读清单 5
          - generic [ref=e557] [cursor=pointer]:
            - radio "阅读清单 6" [ref=e558]
            - generic [ref=e562]: 阅读清单 6
          - generic [ref=e563] [cursor=pointer]:
            - radio "阅读清单 7" [ref=e564]
            - generic [ref=e568]: 阅读清单 7
          - generic [ref=e569] [cursor=pointer]:
            - radio "阅读清单 8" [ref=e570]
            - generic [ref=e574]: 阅读清单 8
          - generic [ref=e575] [cursor=pointer]:
            - radio "阅读清单 9" [ref=e576]
            - generic [ref=e580]: 阅读清单 9
          - generic [ref=e581] [cursor=pointer]:
            - radio "阅读清单 10" [ref=e582]
            - generic [ref=e586]: 阅读清单 10
          - generic [ref=e587] [cursor=pointer]:
            - radio "阅读清单 11" [ref=e588]
            - generic [ref=e592]: 阅读清单 11
          - generic [ref=e593] [cursor=pointer]:
            - radio "阅读清单 12" [ref=e594]
            - generic [ref=e598]: 阅读清单 12
          - generic [ref=e599] [cursor=pointer]:
            - radio "阅读清单 13" [ref=e600]
            - generic [ref=e604]: 阅读清单 13
          - generic [ref=e605] [cursor=pointer]:
            - radio "阅读清单 14" [ref=e606]
            - generic [ref=e610]: 阅读清单 14
          - generic [ref=e611] [cursor=pointer]:
            - radio "阅读清单 15" [ref=e612]
            - generic [ref=e616]: 阅读清单 15
          - generic [ref=e617] [cursor=pointer]:
            - radio "阅读清单 16" [ref=e618]
            - generic [ref=e622]: 阅读清单 16
          - generic [ref=e623] [cursor=pointer]:
            - radio "阅读清单 17" [ref=e624]
            - generic [ref=e628]: 阅读清单 17
          - generic [ref=e629] [cursor=pointer]:
            - radio "阅读清单 18" [ref=e630]
            - generic [ref=e634]: 阅读清单 18
          - generic [ref=e635] [cursor=pointer]:
            - radio "阅读清单 19" [ref=e636]
            - generic [ref=e640]: 阅读清单 19
          - generic [ref=e641] [cursor=pointer]:
            - radio "阅读清单 20" [ref=e642]
            - generic [ref=e646]: 阅读清单 20
          - generic [ref=e647] [cursor=pointer]:
            - radio "阅读清单 21" [ref=e648]
            - generic [ref=e652]: 阅读清单 21
          - generic [ref=e653] [cursor=pointer]:
            - radio "阅读清单 22" [ref=e654]
            - generic [ref=e658]: 阅读清单 22
          - generic [ref=e659] [cursor=pointer]:
            - radio "阅读清单 23" [ref=e660]
            - generic [ref=e664]: 阅读清单 23
          - generic [ref=e665] [cursor=pointer]:
            - radio "阅读清单 24" [ref=e666]
            - generic [ref=e670]: 阅读清单 24
          - generic [ref=e671] [cursor=pointer]:
            - radio "阅读清单 25" [ref=e672]
            - generic [ref=e676]: 阅读清单 25
          - generic [ref=e677] [cursor=pointer]:
            - radio "阅读清单 26" [ref=e678]
            - generic [ref=e682]: 阅读清单 26
          - generic [ref=e683] [cursor=pointer]:
            - radio "阅读清单 27" [ref=e684]
            - generic [ref=e688]: 阅读清单 27
          - generic [ref=e689] [cursor=pointer]:
            - radio "阅读清单 28" [ref=e690]
            - generic [ref=e694]: 阅读清单 28
          - generic [ref=e695] [cursor=pointer]:
            - radio "阅读清单 29" [ref=e696]
            - generic [ref=e700]: 阅读清单 29
          - generic [ref=e701] [cursor=pointer]:
            - radio "阅读清单 30" [ref=e702]
            - generic [ref=e706]: 阅读清单 30
        - generic [ref=e707]:
          - button "移动" [disabled] [ref=e708]
          - button "取消" [ref=e709] [cursor=pointer]
```

# Test source

```ts
  711 |   await page.emulateMedia({ reducedMotion: 'reduce' })
  712 |   await page.setViewportSize({ width: 390, height: 844 })
  713 |   await installApi(page, {
  714 |     workspaces: [workspace('ws-a', '工作空间')],
  715 |     pages: [
  716 |       pageRecord('page-a', 'ws-a', '备忘录', null, key(1)),
  717 |       pageRecord('page-b', 'ws-a', 'Page 1', null, key(2)),
  718 |       pageRecord('page-b1', 'ws-a', 'Sub page 1', 'page-b', key(1)),
  719 |     ],
  720 |   })
  721 |   await page.goto('/#/app/ws-a/page/page-a')
  722 |   await expect(page.locator('.eotion-editor-content')).toBeVisible()
  723 |   await page.getByRole('button', { name: '打开导航菜单' }).click()
  724 |   await openAction(page, '备忘录', '移动')
  725 |   const move = page.getByRole('dialog', { name: '移动页面' })
  726 |   const options = move.getByRole('radiogroup', { name: '移动到' })
  727 |   await expect(options.getByRole('radio')).toHaveCount(3)
  728 |   expect(await move.evaluate(element => element.getBoundingClientRect().height)).toBeLessThan(320)
  729 |   expect(await options.evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true)
  730 |   const lastOption = await move.locator('.product-page-move-option').last().boundingBox()
  731 |   const actions = await move.locator('.product-popover-form__actions').boundingBox()
  732 |   expect(lastOption).not.toBeNull()
  733 |   expect(actions).not.toBeNull()
  734 |   expect(actions!.y - (lastOption!.y + lastOption!.height)).toBeLessThan(24)
  735 |   await expect(move.getByRole('button', { name: '取消' })).toBeInViewport()
  736 |   const visualDir = process.env.EOTION_VISUAL_QA_DIR
  737 |   if (visualDir) {
  738 |     await mkdir(visualDir, { recursive: true })
  739 |     await page.screenshot({ path: `${visualDir}/mobile-move-compact.png`, animations: 'disabled' })
  740 |   }
  741 |   await page.keyboard.press('Escape')
  742 |   await expect(move).toBeHidden()
  743 | })
  744 | 
  745 | test('mobile page actions use modal dialogs with focus, stable tree and a scrollable destination list', async ({ page }) => {
  746 |   await page.emulateMedia({ reducedMotion: 'reduce' })
  747 |   await page.setViewportSize({ width: 390, height: 844 })
  748 |   const consoleErrors: string[] = []
  749 |   page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  750 |   const api = await installApi(page, {
  751 |     workspaces: [workspace('ws-a', '工作空间')],
  752 |     pages: [
  753 |       pageRecord('page-a', 'ws-a', '工作笔记', null, key(1)),
  754 |       pageRecord('page-a1', 'ws-a', '今日记录', 'page-a', key(1)),
  755 |       pageRecord('page-a2', 'ws-a', '记录草稿', 'page-a1', key(1)),
  756 |       ...Array.from({ length: 30 }, (_, index) => pageRecord(`target-${index}`, 'ws-a', `阅读清单 ${index + 1}`, null, key(index + 2))),
  757 |     ],
  758 |   })
  759 |   await page.goto('/#/app/ws-a/page/page-a1')
  760 |   await expect(page.locator('.eotion-editor-content')).toBeVisible()
  761 |   await page.getByRole('button', { name: '打开导航菜单' }).click()
  762 |   await expect.poll(() => page.locator('.product-sidebar').evaluate(element => element.getBoundingClientRect().x)).toBe(0)
  763 |   const before = await treeGeometry(page)
  764 |   const visualDir = process.env.EOTION_VISUAL_QA_DIR
  765 |   if (visualDir) await mkdir(visualDir, { recursive: true })
  766 |   const screenshot = async (name: string) => {
  767 |     if (visualDir) await page.screenshot({ path: `${visualDir}/${name}.png`, animations: 'disabled' })
  768 |   }
  769 |   await openAction(page, '今日记录', '重命名')
  770 |   const rename = page.getByRole('dialog', { name: '重命名页面' })
  771 |   await expect(rename).toHaveAttribute('aria-modal', 'true')
  772 |   expect(await rename.evaluate(element => element.matches(':modal'))).toBe(true)
  773 |   await expect(page.locator('.eotion-popover-panel')).toHaveCount(0)
  774 |   const title = rename.getByLabel('页面标题')
  775 |   await expect(title).toBeFocused()
  776 |   expectSameGeometry(await treeGeometry(page), before)
  777 |   await expect(rename.getByRole('button', { name: '保存标题' })).toHaveCSS('min-height', '36px')
  778 |   await title.fill('今日计划')
  779 |   await page.keyboard.press('Shift+Tab')
  780 |   await expect(rename.getByRole('button', { name: '取消' })).toBeFocused()
  781 |   await page.keyboard.press('Tab')
  782 |   await expect(title).toBeFocused()
  783 |   await screenshot('mobile-rename')
  784 |   await page.mouse.click(4, 4)
  785 |   await expect(rename).toBeVisible()
  786 |   await title.press('Enter')
  787 |   await expect(rename).toBeHidden()
  788 |   await expect(page.getByRole('heading', { level: 1, name: '今日计划' })).toBeVisible()
  789 |   await expect.poll(() => api.pages.find(record => record.id === 'page-a1')?.title).toBe('今日计划')
  790 |   await expect(page.getByRole('button', { name: '页面操作：今日计划' })).toBeFocused()
  791 | 
  792 |   const moveBefore = await treeGeometry(page)
  793 |   await openAction(page, '今日计划', '移动')
  794 |   const move = page.getByRole('dialog', { name: '移动页面' })
  795 |   expect(await move.evaluate(element => element.matches(':modal'))).toBe(true)
  796 |   await expect(moveTarget(page, '工作笔记')).toBeChecked()
  797 |   await expect(moveTarget(page, '工作笔记')).toBeFocused()
  798 |   await expect(moveTarget(page, '今日计划')).toHaveCount(0)
  799 |   await expect(moveTarget(page, '记录草稿')).toHaveCount(0)
  800 |   await expect(move.locator('select')).toHaveCount(0)
  801 |   expectSameGeometry(await treeGeometry(page), moveBefore)
  802 |   await page.keyboard.press('Shift+Tab')
  803 |   await expect(move.getByRole('button', { name: '取消' })).toBeFocused()
  804 |   await page.keyboard.press('Tab')
  805 |   await expect(moveTarget(page, '工作笔记')).toBeFocused()
  806 |   const options = move.getByRole('radiogroup', { name: '移动到' })
  807 |   expect(await options.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
  808 |   expect(await move.evaluate(element => element.getBoundingClientRect().height)).toBeLessThanOrEqual(544)
  809 |   await screenshot('mobile-move')
  810 |   await page.setViewportSize({ width: 390, height: 380 })
> 811 |   expect(await move.evaluate(element => element.getBoundingClientRect().height)).toBeLessThanOrEqual(348)
      |                                                                                  ^ Error: expect(received).toBeLessThanOrEqual(expected)
  812 |   await moveTarget(page, '阅读清单 30').check()
  813 |   const submit = move.getByRole('button', { name: '移动', exact: true })
  814 |   await expect(submit).toBeInViewport()
  815 |   await expect(move.getByRole('button', { name: '取消' })).toBeInViewport()
  816 |   expect(await move.evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true)
  817 |   await screenshot('mobile-move-short')
  818 |   await submit.click()
  819 |   await expect(move).toBeHidden()
  820 |   await expect.poll(() => api.pages.find(record => record.id === 'page-a1')?.parentPageId).toBe('target-29')
  821 |   expect(consoleErrors).toEqual([])
  822 | })
  823 | })
  824 | 
  825 | test('page action presentation uses the mobile breakpoint and preserves an open draft across resize', async ({ page }) => {
  826 |   await installApi(page, {
  827 |     workspaces: [workspace('ws-a', '工作空间')],
  828 |     pages: [pageRecord('page-a', 'ws-a', '工作笔记', null, key(1))],
  829 |   })
  830 |   await page.setViewportSize({ width: 767, height: 844 })
  831 |   await page.goto('/#/app/ws-a/page/page-a')
  832 |   await expect(page.locator('.eotion-editor-content')).toBeVisible()
  833 |   await page.getByRole('button', { name: '打开导航菜单' }).click()
  834 |   await openAction(page, '工作笔记', '重命名')
  835 |   const rename = page.getByRole('dialog', { name: '重命名页面' })
  836 |   expect(await rename.evaluate(element => element.matches(':modal'))).toBe(true)
  837 |   await rename.getByLabel('页面标题').fill('保留的草稿')
  838 |   await page.setViewportSize({ width: 768, height: 844 })
  839 |   await expect(rename.getByLabel('页面标题')).toHaveValue('保留的草稿')
  840 |   expect(await rename.evaluate(element => element.matches(':modal'))).toBe(true)
  841 |   await page.keyboard.press('Escape')
  842 |   await expect(rename).toBeHidden()
  843 |   await openAction(page, '工作笔记', '移动')
  844 |   const move = page.getByRole('dialog', { name: '移动页面' })
  845 |   expect(await move.evaluate(element => element.matches(':modal'))).toBe(false)
  846 |   await expect(move).toHaveClass(/eotion-popover-panel/)
  847 |   await move.getByRole('button', { name: '取消' }).click()
  848 | })
  849 | 
  850 | test('closes the mobile sidebar after opening a page from the tree', async ({ page }) => {
  851 |   await installApi(page, {
  852 |     workspaces: [workspace('ws-a', 'Ava space')],
  853 |     pages: [pageRecord('page-a', 'ws-a', 'Alpha', null, key(1))],
  854 |   })
  855 |   await page.setViewportSize({ width: 390, height: 844 })
  856 |   await page.goto('/#/app/ws-a')
  857 |   await page.getByRole('button', { name: '打开导航菜单' }).click()
  858 |   await expect(page.getByLabel('工作区导航')).toHaveClass(/sidebar--open/)
  859 | 
  860 |   await treeItem(page, 'Alpha').getByRole('button', { name: 'Alpha', exact: true }).click()
  861 |   await expect(page).toHaveURL(/#\/app\/ws-a\/page\/page-a$/)
  862 |   await expect(page.getByLabel('工作区导航')).not.toHaveClass(/sidebar--open/)
  863 |   await expect(page.getByRole('heading', { level: 1, name: 'Alpha' })).toBeVisible()
  864 |   const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }))
  865 |   expect(widths.content).toBeLessThanOrEqual(widths.viewport)
  866 | })
  867 | 
```