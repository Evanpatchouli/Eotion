# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: forensics--product-database.spec.ts >> Timeline Frozen Table resolves independent columns, formats shared properties, and opens the existing Record Host
- Location: tests\forensics--product-database.spec.ts:4667:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('#database-block-frozen-projection-block').getByTestId('database-timeline').getByTestId('timeline-bar').first()
Expected substring: "Shared notes A"
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toContainText" locator('#database-block-frozen-projection-block').getByTestId('database-timeline').getByTestId('timeline-bar').first() with timeout 5000ms
  - waiting for locator('#database-block-frozen-projection-block').getByTestId('database-timeline').getByTestId('timeline-bar').first()

```

```yaml
- complementary "工作区导航":
  - strong: Eotion
  - text: Database user database@example.com
  - button "收起侧边栏"
  - text: 工作区 Database workspace
  - button "切换工作区"
  - text: 页面
  - button "新建根页面"
  - tree "页面树":
    - treeitem "展开Database references的子项 Database references 页面操作：Database references" [level=1] [selected]:
      - button "展开Database references的子项"
      - button "Database references"
      - button "页面操作：Database references"
  - button "设置"
  - button "退出登录"
- main:
  - text: Database workspace / Database references
  - status: 已同步
  - article:
    - paragraph: Database workspace
    - heading "Database references" [level=1]
    - region "Tiptap 编辑器":
      - button "选择图片附件"
      - button "选择文件附件"
      - textbox "页面正文编辑区域":
        - button "在数据库区块下方插入区块"
        - button "拖动区块"
        - strong: Root projects
        - button "切换视图": Frozen projection
        - button "数据库设置"
        - button "新建记录"
        - button "上一个时间段"
        - button "今天"
        - button "下一个时间段"
        - combobox "时间轴刻度":
          - option "小时"
          - option "日"
          - option "周"
          - option "双周"
          - option "月" [selected]
          - option "季度"
          - option "年"
        - complementary "记录属性":
          - text: Related Due Estimate Status Notes Name Resolved relation title、Resolved relation title 2026-10-13 → 2026-10-14 12 Open Shared notes A
          - button "Frozen A"
          - text: Resolved relation title 2026-10-15 24 Done Shared notes B
          - button "Frozen B"
        - region "时间轴":
          - button "跳转到Frozen A的开始日期": ←
          - button "跳转到Frozen B的日期": ←
```

# Test source

```ts
  4643 |   await page.getByRole('group', { name: '数据库视图', exact: true }).getByRole('button', { name: 'Single date', exact: true }).click()
  4644 |   await expect(singleDatabase.getByTestId('database-timeline')).toHaveAttribute('data-configured-scale', 'month')
  4645 |   await expect(singleDatabase.getByTestId('database-timeline').locator('details')).not.toHaveAttribute('open', '')
  4646 | 
  4647 |   for (const [width, height, suffix] of [[1440, 900, 'desktop'], [390, 844, 'phone']] as const) {
  4648 |     await page.setViewportSize({ width, height })
  4649 |     for (const theme of ['light', 'dark'] as const) {
  4650 |       await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme)
  4651 |       await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  4652 |       await page.evaluate(() => {
  4653 |         const host = document.querySelector('.document-wrap') as HTMLElement
  4654 |         const firstTimelineBlock = document.querySelector('#database-block-generic-timeline-single') as HTMLElement
  4655 |         const hostBounds = host.getBoundingClientRect()
  4656 |         const blockBounds = firstTimelineBlock.getBoundingClientRect()
  4657 |         host.scrollTop = blockBounds.top - hostBounds.top + host.scrollTop
  4658 |       })
  4659 |       await expect(single.locator('[data-testid="timeline-bar"][data-record-id="generic-01-single-range"]')).toBeInViewport()
  4660 |       await expect(single.locator('[data-testid="timeline-bar"][data-record-id="generic-02-single-point"]')).toBeInViewport()
  4661 |       if (width === 390) await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  4662 |       await timelineScreenshot(page, testInfo, `p112b-generic-timeline-${suffix}-${theme}`)
  4663 |     }
  4664 |   }
  4665 | })
  4666 | 
  4667 | test('Timeline Frozen Table resolves independent columns, formats shared properties, and opens the existing Record Host', async ({ page }, testInfo) => {
  4668 |   await page.setViewportSize({ width: 1440, height: 900 })
  4669 |   const relationDatabase = database('frozen-relation-database', 'Related records')
  4670 |   const relationProperty = { ...property('frozen-relation', rootDatabase.id, 'Related', 'relation'), config: { targetDatabaseId: relationDatabase.id } } as TestProperty
  4671 |   const formulaProperty = { ...property('frozen-formula', rootDatabase.id, 'Estimate', 'formula'), config: { expression: { kind: 'literal', value: 1 }, resultType: 'number' } } as TestProperty
  4672 |   const timelineConfig = {
  4673 |     ...DEFAULT_DATABASE_VIEW_CONFIG,
  4674 |     visibleProperties: ['root-title', 'root-text'],
  4675 |     propertyOrder: ['root-text', 'root-title'],
  4676 |     options: {
  4677 |       unknownOuterSetting: { retained: true },
  4678 |       timeline: {
  4679 |         dateSource: { mode: 'date-property', propertyId: 'root-date' },
  4680 |         frozenTable: {
  4681 |           visible: true,
  4682 |           // Defensive HTTP fixture bypasses API validation for Title/stale-ID handling; the server still validates Title.
  4683 |           visibleProperties: ['frozen-relation', 'root-date', 'frozen-formula', 'root-select', 'root-text', 'frozen-relation', 'deleted-frozen-property'],
  4684 |           propertyOrder: ['frozen-relation', 'root-date', 'frozen-formula', 'root-select', 'root-text', 'root-title', 'frozen-relation', 'deleted-frozen-property'],
  4685 |         },
  4686 |       },
  4687 |     },
  4688 |   } as unknown as DatabaseViewConfig
  4689 |   const nullConfig = {
  4690 |     ...DEFAULT_DATABASE_VIEW_CONFIG,
  4691 |     options: { timeline: { frozenTable: { visible: true, visibleProperties: null, propertyOrder: null } } },
  4692 |   } as unknown as DatabaseViewConfig
  4693 |   const hiddenConfig = {
  4694 |     ...DEFAULT_DATABASE_VIEW_CONFIG,
  4695 |     options: { timeline: { dateSource: { mode: 'date-property', propertyId: 'root-date' } } },
  4696 |   } as unknown as DatabaseViewConfig
  4697 |   const disabledConfig = {
  4698 |     ...DEFAULT_DATABASE_VIEW_CONFIG,
  4699 |     options: { timeline: { frozenTable: { visible: false, visibleProperties: null, propertyOrder: null } } },
  4700 |   } as unknown as DatabaseViewConfig
  4701 |   const timelineView = view('frozen-projection-view', rootDatabase.id, 'Frozen projection', timelineConfig, 'timeline')
  4702 |   const nullView = view('frozen-null-view', rootDatabase.id, 'Frozen null defaults', nullConfig, 'timeline')
  4703 |   const hiddenView = view('frozen-hidden-view', rootDatabase.id, 'Frozen hidden', hiddenConfig, 'timeline')
  4704 |   const disabledView = view('frozen-disabled-view', rootDatabase.id, 'Frozen disabled', disabledConfig, 'timeline')
  4705 |   const records = [
  4706 |     record('frozen-record-a', rootDatabase.id, 'frozen-page-a', {
  4707 |       'root-title': 'Frozen A', 'root-text': 'Shared notes A', 'root-select': 'status-open',
  4708 |       'root-date': { start: '2026-10-13', end: '2026-10-14' }, 'frozen-formula': 12,
  4709 |       'frozen-relation': ['related-record-a', 'related-record-a'],
  4710 |     }),
  4711 |     record('frozen-record-b', rootDatabase.id, 'frozen-page-b', {
  4712 |       'root-title': 'Frozen B', 'root-text': 'Shared notes B', 'root-select': 'status-done',
  4713 |       'root-date': '2026-10-15', 'frozen-formula': 24, 'frozen-relation': ['related-record-a'],
  4714 |     }),
  4715 |   ]
  4716 |   const api = await installApi(page, [
  4717 |     block('frozen-projection-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100),
  4718 |   ], {
  4719 |     databases: [rootDatabase, relationDatabase], views: [timelineView, nullView, hiddenView, disabledView],
  4720 |     properties: [...rootProperties, relationProperty, formulaProperty], records,
  4721 |   })
  4722 |   api.pages.push(
  4723 |     { ...pageRecord, id: 'frozen-page-a', title: 'Frozen A', role: 'database-record' },
  4724 |     { ...pageRecord, id: 'frozen-page-b', title: 'Frozen B', role: 'database-record' },
  4725 |     { ...pageRecord, id: 'related-page-a', title: 'Resolved relation title', role: 'database-record' },
  4726 |   )
  4727 |   api.records.push(record('related-record-a', relationDatabase.id, 'related-page-a', { 'related-title': 'Resolved relation title' }))
  4728 |   await page.goto('/#/app/database-workspace/page/database-page')
  4729 | 
  4730 |   const databaseBlock = page.locator('#database-block-frozen-projection-block')
  4731 |   const timeline = databaseBlock.getByTestId('database-timeline')
  4732 |   const frozen = databaseBlock.getByTestId('timeline-frozen-table')
  4733 |   await expect(timeline).toBeVisible()
  4734 |   await expect(frozen).toBeVisible()
  4735 |   const frozenHeaderIds = () => frozen.getByTestId('timeline-frozen-header').locator('[data-property-id]').evaluateAll(elements => elements.map(element => (element as HTMLElement).dataset.propertyId ?? ''))
  4736 |   await expect.poll(frozenHeaderIds).toEqual(['frozen-relation', 'root-date', 'frozen-formula', 'root-select', 'root-text', 'root-title'])
  4737 |   await expect(frozen.locator('[data-timeline-frozen-row][data-record-id="frozen-record-a"] [data-property-id="root-title"]')).toContainText('Frozen A')
  4738 |   await expect(frozen.locator('[data-timeline-frozen-row][data-record-id="frozen-record-a"] [data-property-id="root-text"]')).toContainText('Shared notes A')
  4739 |   await expect(frozen.locator('[data-timeline-frozen-row][data-record-id="frozen-record-a"] [data-property-id="root-select"]')).toContainText('Open')
  4740 |   await expect(frozen.locator('[data-timeline-frozen-row][data-record-id="frozen-record-a"] [data-property-id="frozen-formula"]')).toContainText('12')
  4741 |   await expect(frozen.locator('[data-timeline-frozen-row][data-record-id="frozen-record-a"] [data-property-id="root-date"]')).toContainText('2026-10-13 → 2026-10-14')
  4742 |   await expect.poll(() => frozen.locator('[data-timeline-frozen-row][data-record-id="frozen-record-a"] [data-property-id="frozen-relation"]').innerText()).toContain('Resolved relation title')
> 4743 |   await expect(timeline.getByTestId('timeline-bar').first()).toContainText('Shared notes A')
       |                                                              ^ Error: expect(locator).toContainText(expected) failed
  4744 |   await expect(frozen.locator('[data-property-id="frozen-relation"]')).toHaveCount(3)
  4745 |   const relationResolutions = api.requests.filter(({ method, path }) => method === 'POST' && path.endsWith('/record-options/resolve'))
  4746 |   expect(relationResolutions.filter(({ path }) => path.endsWith(`/${relationDatabase.id}/record-options/resolve`))).toHaveLength(1)
  4747 |   expect(relationResolutions.find(({ path }) => path.endsWith(`/${relationDatabase.id}/record-options/resolve`))?.payload.recordIds).toEqual(['related-record-a'])
  4748 | 
  4749 |   const topLevelProjection = await timeline.evaluate(root => {
  4750 |     const component = (root as HTMLElement & { __vueParentComponent?: { setupState?: Record<string, any> } }).__vueParentComponent
  4751 |     const items = component?.setupState?.projectedItems
  4752 |     if (!Array.isArray(items)) throw new Error('Expected Timeline projection')
  4753 |     return {
  4754 |       title: items[0]?.title,
  4755 |       visibleProperties: items[0]?.visibleProperties?.map((item: { propertyId: string }) => item.propertyId),
  4756 |     }
  4757 |   })
  4758 |   expect(topLevelProjection).toEqual({ title: 'Frozen A', visibleProperties: ['root-text'] })
  4759 | 
  4760 |   const titleButton = frozen.locator('[data-timeline-frozen-row][data-record-id="frozen-record-a"] [data-property-id="root-title"] button')
  4761 |   await titleButton.click()
  4762 |   const drawer = page.locator('[data-overlay-mode="drawer"]')
  4763 |   await expect(drawer).toBeVisible()
  4764 |   await expect(drawer.getByRole('textbox', { name: '记录标题' })).toHaveValue('Frozen A')
  4765 |   await expect(titleButton).toHaveAttribute('aria-pressed', 'true')
  4766 |   expect(api.requests.filter(({ method, path }) => method === 'PATCH' && path.includes('/records/'))).toHaveLength(0)
  4767 |   expect(api.requests.filter(({ method, path }) => ['POST', 'PATCH', 'DELETE'].includes(method) && path.includes('/properties/'))).toHaveLength(0)
  4768 |   await page.getByRole('button', { name: '关闭记录' }).click()
  4769 | 
  4770 |   const switchView = async (name: string) => {
  4771 |     await databaseBlock.getByRole('button', { name: '切换视图' }).click()
  4772 |     await page.getByRole('group', { name: '数据库视图', exact: true }).getByRole('button', { name, exact: true }).click()
  4773 |   }
  4774 |   await switchView('Frozen null defaults')
  4775 |   await expect(frozen).toBeVisible()
  4776 |   await expect.poll(() => frozen.getByTestId('timeline-frozen-header').locator('[data-property-id]').evaluateAll(elements => elements.map(element => (element as HTMLElement).dataset.propertyId))).toEqual(rootProperties.map(item => item.id).concat(['frozen-relation', 'frozen-formula']))
  4777 |   await switchView('Frozen hidden')
  4778 |   await expect(frozen).toHaveCount(0)
  4779 |   await switchView('Frozen disabled')
  4780 |   await expect(frozen).toHaveCount(0)
  4781 |   await switchView('Frozen projection')
  4782 |   await expect(frozen).toBeVisible()
  4783 |   expect(timelineView.config.options?.unknownOuterSetting).toEqual({ retained: true })
  4784 |   await page.evaluate(() => {
  4785 |     const editor = document.querySelector('.eotion-editor')
  4786 |     const databaseBlock = document.querySelector('#database-block-frozen-projection-block')
  4787 |     const timeline = databaseBlock?.querySelector('[data-testid="database-timeline"]')
  4788 |     const frozen = databaseBlock?.querySelector('[data-testid="timeline-frozen-table"]')
  4789 |     if (!editor || !databaseBlock || !timeline || !frozen) throw new Error('Expected stable Editor, NodeView, Timeline, and Frozen Table')
  4790 |     ;(window as Window & { __frozenResponsiveIdentity?: Element[] }).__frozenResponsiveIdentity = [
  4791 |       editor, databaseBlock, timeline, frozen,
  4792 |       (editor as Element & { __vueParentComponent?: unknown }).__vueParentComponent as Element,
  4793 |       (databaseBlock as Element & { __vueParentComponent?: unknown }).__vueParentComponent as Element,
  4794 |       (timeline as Element & { __vueParentComponent?: unknown }).__vueParentComponent as Element,
  4795 |       (frozen as Element & { __vueParentComponent?: unknown }).__vueParentComponent as Element,
  4796 |     ]
  4797 |   })
  4798 | 
  4799 |   for (const [width, height, suffix] of [[1440, 900, 'desktop'], [390, 844, 'phone']] as const) {
  4800 |     await page.setViewportSize({ width, height })
  4801 |     for (const theme of ['light', 'dark'] as const) {
  4802 |       await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme)
  4803 |       await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  4804 |       expect(await page.evaluate(() => {
  4805 |         const before = (window as Window & { __frozenResponsiveIdentity?: Element[] }).__frozenResponsiveIdentity
  4806 |         const editor = document.querySelector('.eotion-editor') as (Element & { __vueParentComponent?: unknown }) | null
  4807 |         const databaseBlock = document.querySelector('#database-block-frozen-projection-block') as (Element & { __vueParentComponent?: unknown }) | null
  4808 |         const timeline = databaseBlock?.querySelector('[data-testid="database-timeline"]') as (Element & { __vueParentComponent?: unknown }) | null
  4809 |         const frozen = databaseBlock?.querySelector('[data-testid="timeline-frozen-table"]') as (Element & { __vueParentComponent?: unknown }) | null
  4810 |         return Boolean(before && editor && databaseBlock && timeline && frozen
  4811 |           && editor === before[0] && databaseBlock === before[1] && timeline === before[2] && frozen === before[3]
  4812 |           && editor.__vueParentComponent === before[4] && databaseBlock.__vueParentComponent === before[5]
  4813 |           && timeline.__vueParentComponent === before[6] && frozen.__vueParentComponent === before[7])
  4814 |       })).toBe(true)
  4815 |       if (width === 390) {
  4816 |         await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  4817 |         await expect(frozen.getByTestId('timeline-frozen-header').locator('[data-property-id="root-title"]')).toBeVisible()
  4818 |         await expect(frozen.locator('[data-timeline-frozen-row][data-record-id="frozen-record-a"] [data-property-id="root-title"]')).toBeVisible()
  4819 |         await expect.poll(() => frozen.locator('.eotion-timeline-frozen-cell:not(.is-title)').evaluateAll(cells => cells.every(cell => cell.getClientRects().length === 0))).toBe(true)
  4820 |         const paneWidth = await frozen.evaluate(element => element.getBoundingClientRect().width)
  4821 |         expect(paneWidth).toBeGreaterThan(0)
  4822 |         expect(paneWidth).toBeLessThanOrEqual(120)
  4823 |         const timeScroller = timeline.getByTestId('timeline-scroll')
  4824 |         await expect.poll(() => timeScroller.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true)
  4825 |       }
  4826 |       await timelineScreenshot(page, testInfo, `p112c-frozen-projection-${suffix}-${theme}`)
  4827 |     }
  4828 |   }
  4829 | })
  4830 | 
  4831 | test('Timeline Frozen rows share row geometry, hover, selection, and page-host scroll with the time canvas', async ({ page }) => {
  4832 |   await page.setViewportSize({ width: 1440, height: 900 })
  4833 |   const timelineView = view('frozen-geometry-view', rootDatabase.id, 'Frozen geometry', {
  4834 |     ...DEFAULT_DATABASE_VIEW_CONFIG,
  4835 |     options: { timeline: { dateSource: { mode: 'date-property', propertyId: 'root-date' }, frozenTable: { visible: true, visibleProperties: ['root-title'], propertyOrder: ['root-title'] } } },
  4836 |   }, 'timeline')
  4837 |   const records = Array.from({ length: 30 }, (_, index) => record(`frozen-geometry-${index}`, rootDatabase.id, `frozen-geometry-page-${index}`, {
  4838 |     'root-title': `Geometry ${index}`, 'root-date': '2026-10-13',
  4839 |   }))
  4840 |   const api = await installApi(page, [block('frozen-geometry-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: timelineView.id } }, 100)], {
  4841 |     databases: [rootDatabase], views: [timelineView], properties: [rootProperties[0]!, rootProperties[5]!], records,
  4842 |   })
  4843 |   for (const item of records) api.pages.push({ ...pageRecord, id: item.pageId, title: String(item.properties['root-title']), role: 'database-record' })
```