# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: product-database.spec.ts >> P11.6 arrange persists one native Date CAS and reloads canonical point
- Location: tests\product-database.spec.ts:12108:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('#database-block-p114b-depends-on-block').locator('tr').filter({ has: getByRole('button', { name: '编辑名称：Unplanned', exact: true }) })
Expected substring: "2032-06-01"
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toContainText" locator('#database-block-p114b-depends-on-block').locator('tr').filter({ has: getByRole('button', { name: '编辑名称：Unplanned', exact: true }) }) with timeout 5000ms
  - waiting for locator('#database-block-p114b-depends-on-block').locator('tr').filter({ has: getByRole('button', { name: '编辑名称：Unplanned', exact: true }) })

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
        - button "切换视图": Dependency editing
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
          - text: Name
          - button "Child"
          - button "Unplanned"
          - button "Invalid"
          - button "Second unplanned"
        - button "管理 1 条依赖关系。方向键选择，Delete 删除": 依赖关系 1
        - region "时间轴":
          - button "Child · 2026-10-14 · 2026-10-14": Child 2026-10-14
          - button "创建依赖：Child"
          - button "调整结束日期：Child"
          - button "跳转到Unplanned的日期": →
          - text: Invalid 日期无效
          - button "打开记录：Invalid": 打开
          - button "跳转到Second unplanned的日期": →
        - group: 未排期（1）
```

# Test source

```ts
  12035 |     expect(handleWidth).toBeLessThanOrEqual(12)
  12036 |     expect(handleHeight).toBeLessThanOrEqual(32)
  12037 |     await dragByTouch(shortBar, 36, true)
  12038 |     await expect(shortBar).toHaveAttribute('data-drag-state', 'idle')
  12039 |     expect(api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith('/cells/root-date'))).toHaveLength(0)
  12040 |     expect(api.records.find(item => item.id === 'p114b-a')?.properties['root-date']).toEqual({ start: '2026-10-13', end: '2026-10-13' })
  12041 | 
  12042 |     await dragByTouch(shortBar, 36)
  12043 |     await expect.poll(() => api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith('/cells/root-date')).length).toBe(1)
  12044 |     await expect.poll(() => api.records.find(item => item.id === 'p114b-a')?.properties['root-date']).toEqual({ start: '2026-10-14', end: '2026-10-14' })
  12045 | 
  12046 |     const pointEnd = timeline.locator('[data-testid="timeline-resize-end"][data-record-id="p114b-b"]')
  12047 |     await expect(pointEnd).toBeVisible()
  12048 |     const pointBounds = await pointEnd.boundingBox()
  12049 |     const scrollerBounds = await timeline.getByTestId('timeline-scroll').boundingBox()
  12050 |     expect(pointBounds).not.toBeNull()
  12051 |     expect(scrollerBounds).not.toBeNull()
  12052 |     expect(pointBounds!.x + pointBounds!.width / 2).toBeGreaterThanOrEqual(scrollerBounds!.x)
  12053 |     expect(pointBounds!.x + pointBounds!.width / 2).toBeLessThanOrEqual(scrollerBounds!.x + scrollerBounds!.width)
  12054 |     await dragByTouch(pointEnd, 36)
  12055 |     await expect.poll(() => api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith('/cells/root-date')).length).toBe(2)
  12056 |     await expect.poll(() => api.records.find(item => item.id === 'p114b-b')?.properties['root-date']).toMatchObject({ start: '2026-10-14', end: '2026-10-14' })
  12057 | 
  12058 |     const edgeBar = timeline.locator('[data-testid="timeline-bar"][data-record-id="p114b-c"]')
  12059 |     const edgeHandle = timeline.locator('[data-testid="timeline-resize-start"][data-record-id="p114b-c"]')
  12060 |     await expect(edgeHandle).toBeVisible()
  12061 |     const edge = await edgeHandle.boundingBox()
  12062 |     expect(edge).not.toBeNull()
  12063 |     expect(edge!.width).toBeLessThanOrEqual(12)
  12064 |     await dragByTouch(edgeHandle, -36, true)
  12065 |     await expect(edgeBar).toHaveAttribute('data-drag-state', 'idle')
  12066 |     expect(api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith('/cells/root-date'))).toHaveLength(2)
  12067 |     expect(api.records.find(item => item.id === 'p114b-c')?.properties['root-date']).toEqual({ start: '2026-10-15', end: '2026-10-16' })
  12068 |     await session.detach()
  12069 |   } finally {
  12070 |     await context.close()
  12071 |   }
  12072 | })
  12073 | // P11.6 explicit empty-cell scheduling shares the frozen Date mutation adapter.
  12074 | async function p116ScheduleFixture(page: Page, options: Parameters<typeof installApi>[2] = {}, active = false) {
  12075 |   return p114bFixture(page, 'depends-on', [
  12076 |     record('p116-empty', rootDatabase.id, 'p116-empty-page', { 'root-title': 'Unplanned', 'root-date': null }),
  12077 |     record('p116-second', rootDatabase.id, 'p116-second-page', { 'root-title': 'Second unplanned' }),
  12078 |     record('p116-invalid', rootDatabase.id, 'p116-invalid-page', { 'root-title': 'Invalid', 'root-date': 'bad-date' }),
  12079 |     record('p116-child', rootDatabase.id, 'p116-child-page', { 'root-title': 'Child', 'root-date': '2026-10-14', 'p114b-depends-on-relation': ['p116-empty'] }),
  12080 |   ], options, active ? 'shift_when_overlapping' : 'no_auto_shift')
  12081 | }
  12082 | 
  12083 | async function p116OpenSchedule(timeline: Locator) {
  12084 |   const details = timeline.locator('details')
  12085 |   if (!(await details.evaluate(element => (element as HTMLDetailsElement).open))) await details.locator('summary').click()
  12086 |   await details.getByRole('button', { name: '安排：Unplanned', exact: true }).click()
  12087 |   return timeline.getByTestId('timeline-schedule-form')
  12088 | }
  12089 | 
  12090 | test('P11.6 arrange explicit date has no default and cancel has zero writes', async ({ page }) => {
  12091 |   const { timeline, api } = await p116ScheduleFixture(page)
  12092 |   const form = await p116OpenSchedule(timeline)
  12093 |   await expect(form.getByLabel('安排日期')).toHaveValue('')
  12094 |   await expect(form.getByLabel('安排日期')).toBeFocused()
  12095 |   await expect(form.getByRole('button', { name: '保存', exact: true })).toBeDisabled()
  12096 |   await form.getByLabel('安排日期').fill('2026-10-20')
  12097 |   await form.getByRole('button', { name: '取消', exact: true }).click()
  12098 |   await expect(form).toHaveCount(0)
  12099 |   await expect(timeline.getByRole('button', { name: '安排：Unplanned', exact: true })).toBeFocused()
  12100 |   await p116OpenSchedule(timeline)
  12101 |   await form.getByLabel('安排日期').press('Escape')
  12102 |   await expect(form).toHaveCount(0)
  12103 |   expect(api.requests.filter(request => request.method === 'PATCH')).toHaveLength(0)
  12104 |   expect(p114cBatchPosts(api)).toHaveLength(0)
  12105 |   expect(api.records.find(item => item.id === 'p116-empty')?.properties['root-date']).toBeNull()
  12106 | })
  12107 | 
  12108 | test('P11.6 arrange persists one native Date CAS and reloads canonical point', async ({ page }) => {
  12109 |   const { timeline, api } = await p116ScheduleFixture(page)
  12110 |   const form = await p116OpenSchedule(timeline)
  12111 |   await form.getByLabel('安排日期').fill('2032-06-01')
  12112 |   await form.getByRole('button', { name: '保存', exact: true }).click()
  12113 |   await expect(form).toHaveCount(0)
  12114 |   const bar = timeline.locator('[data-testid="timeline-bar"][data-record-id="p116-empty"]')
  12115 |   await expect(bar).toBeVisible()
  12116 |   await expect(bar).toBeFocused()
  12117 |   expect(p114bRelationPatch(api, 'root-date')).toHaveLength(1)
  12118 |   expect(p114bRelationPatch(api, 'root-date')[0]?.payload).toMatchObject({ value: '2032-06-01', expectedDatabaseVersion: 1, expectedRecordVersion: 1 })
  12119 |   expect(p114cBatchPosts(api)).toHaveLength(0)
  12120 |   expect(api.records.find(item => item.id === 'p116-empty')?.properties['root-date']).toBe('2032-06-01')
  12121 |   const details = timeline.locator('details')
  12122 |   if (!(await details.evaluate(element => (element as HTMLDetailsElement).open))) await details.locator('summary').click()
  12123 |   const second = details.getByRole('button', { name: '安排：Second unplanned', exact: true })
  12124 |   await expect(second).toBeEnabled()
  12125 |   await second.click()
  12126 |   await form.getByLabel('安排日期').fill('2032-06-02')
  12127 |   await form.getByRole('button', { name: '保存', exact: true }).click()
  12128 |   await expect.poll(() => p114bRelationPatch(api, 'root-date').length).toBe(2)
  12129 |   await expect(form).toHaveCount(0)
  12130 |   const databaseBlock = page.locator('#database-block-p114b-depends-on-block')
  12131 |   await databaseBlock.getByRole('button', { name: '切换视图' }).click()
  12132 |   await page.getByRole('group', { name: '数据库视图', exact: true }).getByRole('button', { name: 'Fallback table', exact: true }).click()
  12133 |   await expect(databaseBlock.locator('tr').filter({ has: page.getByRole('button', { name: '编辑名称：Unplanned', exact: true }) })).toContainText('2032-06-01')
  12134 |   await page.reload()
> 12135 |   await expect(databaseBlock.locator('tr').filter({ has: page.getByRole('button', { name: '编辑名称：Unplanned', exact: true }) })).toContainText('2032-06-01')
        |                                                                                                                                ^ Error: expect(locator).toContainText(expected) failed
  12136 | })
  12137 | 
  12138 | test('P11.6 arrange active policy uses one atomic batch and canonical downstream dates', async ({ page }) => {
  12139 |   const { timeline, api, timelineView } = await p116ScheduleFixture(page, {}, true)
  12140 |   const form = await p116OpenSchedule(timeline)
  12141 |   await form.getByLabel('安排日期').fill('2026-10-20')
  12142 |   await form.getByRole('button', { name: '保存', exact: true }).click()
  12143 |   await expect(form).toHaveCount(0)
  12144 |   expect(p114cBatchPosts(api)).toHaveLength(1)
  12145 |   expect(p114cBatchPosts(api)[0]?.payload).toMatchObject({ context: { viewId: timelineView.id, expectedViewVersion: 1 }, records: [{ recordId: 'p116-empty', expectedRecordVersion: 1, cells: [{ propertyId: 'root-date', value: '2026-10-20' }] }] })
  12146 |   expect(p114bRelationPatch(api, 'root-date')).toHaveLength(0)
  12147 |   // A point has no exclusive end; the frozen planner moves an overlapping child
  12148 |   // to the same date boundary (ranges retain their exclusive endpoint rule).
  12149 |   expect(api.records.find(item => item.id === 'p116-child')?.properties['root-date']).toBe('2026-10-20')
  12150 | })
  12151 | 
  12152 | for (const outcome of ['conflict', 'uncertain', 'refresh-failure'] as const) {
  12153 |   test(`P11.6 arrange ${outcome} never retries or claims batch success`, async ({ page }) => {
  12154 |     const { timeline, api } = await p116ScheduleFixture(page, outcome === 'conflict'
  12155 |       ? { conflictCellBatchMutations: 1 } : { cellBatchMutationOutcome: 'uncertain' }, true)
  12156 |     const form = await p116OpenSchedule(timeline)
  12157 |     await form.getByLabel('安排日期').fill('2026-10-20')
  12158 |     if (outcome === 'refresh-failure') api.failTableLoads = 1
  12159 |     await form.getByRole('button', { name: '保存', exact: true }).click()
  12160 |     const databaseBlock = page.locator('#database-block-p114b-depends-on-block')
  12161 |     const mutationAlert = databaseBlock.locator(':scope > .eotion-database-error').filter({ hasText: outcome === 'conflict' ? /^相关记录已发生变化，已刷新到最新版本。$/u : /^提交结果暂未确认，请重新加载当前视图。$/u })
  12162 |     await expect(mutationAlert).toHaveCount(1)
  12163 |     expect(p114cBatchPosts(api)).toHaveLength(1)
  12164 |     expect(p114bRelationPatch(api, 'root-date')).toHaveLength(0)
  12165 |     expect(api.records.find(item => item.id === 'p116-empty')?.properties['root-date']).toBeNull()
  12166 |   })
  12167 | }
  12168 | 
  12169 | test('P11.6 arrange rejects stale record capture and offline submit, excludes invalid cells', async ({ page }) => {
  12170 |   const { timeline, api } = await p116ScheduleFixture(page)
  12171 |   let form = await p116OpenSchedule(timeline)
  12172 |   await expect(timeline.getByRole('button', { name: '安排：Invalid', exact: true })).toHaveCount(0)
  12173 |   await form.getByLabel('安排日期').fill('2026-10-20')
  12174 |   await page.context().setOffline(true)
  12175 |   await expect(form.getByRole('button', { name: '保存', exact: true })).toBeDisabled()
  12176 |   await page.context().setOffline(false)
  12177 |   await expect(form.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
  12178 |   api.records.find(item => item.id === 'p116-empty')!.version += 1
  12179 |   await p115RefreshLoadedWindow(timeline)
  12180 |   form = timeline.getByTestId('timeline-schedule-form')
  12181 |   await form.getByRole('button', { name: '保存', exact: true }).click()
  12182 |   expect(p114bRelationPatch(api, 'root-date')).toHaveLength(0)
  12183 | })
  12184 | 
  12185 | for (const width of [390, 360]) {
  12186 |   test.describe(`P11.6 arrange ${width}px coarse context`, () => {
  12187 |   test.use({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true })
  12188 |   test(`P11.6 arrange ${width}px touch form stays inside viewport`, async ({ page }) => {
  12189 |     const { timeline, api } = await p116ScheduleFixture(page)
  12190 |     await page.setViewportSize({ width, height: 844 })
  12191 |     await page.emulateMedia({ reducedMotion: 'reduce' })
  12192 |     expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
  12193 |     const form = await p116OpenSchedule(timeline)
  12194 |     await form.getByLabel('安排日期').fill('2026-10-20')
  12195 |     for (const control of await form.locator('input, button').all()) {
  12196 |       const bounds = await control.boundingBox()
  12197 |       expect(bounds).not.toBeNull()
  12198 |       expect(bounds!.x).toBeGreaterThanOrEqual(0)
  12199 |       expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
  12200 |       expect(bounds!.height).toBeGreaterThanOrEqual(44)
  12201 |     }
  12202 |     await form.getByRole('button', { name: '取消', exact: true }).tap()
  12203 |     expect(p114bRelationPatch(api, 'root-date')).toHaveLength(0)
  12204 |   })
  12205 |   })
  12206 | }
  12207 | 
  12208 | test('P11.6 arrange configuration and view scope invalidate the captured form; Separate remains read only', async ({ page }) => {
  12209 |   const { timeline, timelineView, api } = await p116ScheduleFixture(page)
  12210 |   let form = await p116OpenSchedule(timeline)
  12211 |   await form.getByLabel('安排日期').fill('2026-10-20')
  12212 |   const canonicalView = api.views.find(item => item.id === timelineView.id)!
  12213 |   const originalConfig = canonicalView.config
  12214 |   canonicalView.config = { ...canonicalView.config, options: { timeline: { scale: 'week', dateSource: { mode: 'start-end', startPropertyId: 'root-date', endPropertyId: 'root-date' } } } }
  12215 |   canonicalView.version += 1
  12216 |   await p115RefreshLoadedWindow(timeline)
  12217 |   await expect(form).toHaveCount(0)
  12218 |   await expect(timeline.getByRole('button', { name: /^安排：/u })).toHaveCount(0)
  12219 |   canonicalView.config = originalConfig
  12220 |   canonicalView.version += 1
  12221 |   await p115RefreshLoadedWindow(timeline)
  12222 |   form = await p116OpenSchedule(timeline)
  12223 |   const databaseBlock = page.locator('#database-block-p114b-depends-on-block')
  12224 |   await databaseBlock.getByRole('button', { name: '切换视图' }).click()
  12225 |   await page.getByRole('group', { name: '数据库视图', exact: true }).getByRole('button', { name: 'Fallback table', exact: true }).click()
  12226 |   await expect(form).toHaveCount(0)
  12227 |   expect(p114bRelationPatch(api, 'root-date')).toHaveLength(0)
  12228 |   expect(p114cBatchPosts(api)).toHaveLength(0)
  12229 | })
  12230 | 
```