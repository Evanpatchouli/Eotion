# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: forensics--product-database.spec.ts >> Timeline shell keeps local zoom, exposes the seven scales, and has no table fallback
- Location: tests\forensics--product-database.spec.ts:4071:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('#database-block-shell-default-block').getByTestId('database-timeline')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" locator('#database-block-shell-default-block').getByTestId('database-timeline') with timeout 5000ms
  - waiting for locator('#database-block-shell-default-block').getByTestId('database-timeline')

```

# Test source

```ts
  4004 |     { target: tableView, name: 'Table A', renderer: 'table' as const },
  4005 |     { target: boardView, name: 'Board C', renderer: 'board' as const },
  4006 |     { target: tableView, name: 'Table A', renderer: 'table' as const },
  4007 |     { target: listView, name: 'List B', renderer: 'list' as const },
  4008 |     { target: boardView, name: 'Board C', renderer: 'board' as const },
  4009 |     { target: listView, name: 'List B', renderer: 'list' as const },
  4010 |   ]
  4011 |   for (const transition of transitions) {
  4012 |     await database.getByRole('button', { name: '切换视图' }).click()
  4013 |     await page.getByRole('group', { name: '数据库视图', exact: true }).getByRole('button', { name: transition.name, exact: true }).click()
  4014 |     if (transition.renderer === 'table') await expect(database.locator('tbody')).toBeVisible()
  4015 |     if (transition.renderer === 'list') {
  4016 |       await expect(database.getByTestId('database-list')).toBeVisible()
  4017 |       await expect(database.locator('.eotion-database-list-property')).toHaveCount(0)
  4018 |     }
  4019 |     if (transition.renderer === 'board') {
  4020 |       await expect(database.getByTestId('database-board')).toBeVisible()
  4021 |       await expect(database.locator('.eotion-database-board-column-name')).toHaveText(['Open', 'Done', '未分组'])
  4022 |     }
  4023 |     if (transition.renderer === 'timeline') {
  4024 |       await expect(database.getByTestId('database-timeline')).toBeVisible()
  4025 |       await expect(database.locator('table, [data-testid="database-list"], [data-testid="database-board"]')).toHaveCount(0)
  4026 |       await expect(database.getByRole('button', { name: '新建记录' })).toBeVisible()
  4027 |       await expect.poll(() => api.blocks.find(item => item.id === 'matrix-independent-block')?.props.node?.attrs).toEqual({ databaseId: rootDatabase.id, viewId: tableView.id })
  4028 |     }
  4029 |     await expect(database.getByRole('button', { name: '切换视图' })).toContainText(transition.name)
  4030 |     await expect.poll(() => api.blocks.find(item => item.id === 'matrix-view-switch-block')?.props.node?.attrs).toEqual({ databaseId: rootDatabase.id, viewId: transition.target.id })
  4031 |     await expect.poll(() => page.evaluate(() => {
  4032 |       const before = (window as Window & { __viewMatrixIdentity?: { editor: Element; database: Element; editorComponent: unknown; databaseComponent: unknown } }).__viewMatrixIdentity!
  4033 |       const editor = document.querySelector('.eotion-editor')
  4034 |       const database = document.querySelector('#database-block-matrix-view-switch-block')
  4035 |       return {
  4036 |         editorSame: editor === before.editor,
  4037 |         databaseSame: database === before.database,
  4038 |         editorComponentSame: (editor as (Element & { __vueParentComponent?: unknown }) | null)?.__vueParentComponent === before.editorComponent,
  4039 |         databaseComponentSame: (database as (Element & { __vueParentComponent?: unknown }) | null)?.__vueParentComponent === before.databaseComponent,
  4040 |       }
  4041 |     })).toEqual({ editorSame: true, databaseSame: true, editorComponentSame: true, databaseComponentSame: true })
  4042 |     if (transition.renderer === 'timeline') {
  4043 |       await database.getByRole('button', { name: '切换视图' }).click()
  4044 |       const viewMenu = page.getByRole('group', { name: '数据库视图', exact: true })
  4045 |       await expect(viewMenu.getByRole('group', { name: '新建数据库视图' }).getByRole('button')).toHaveText(['新建表格视图', '新建列表视图', '新建看板视图', '新建时间线视图'])
  4046 |       await expect(viewMenu.getByRole('button', { name: '编辑视图 Timeline D' })).toBeVisible()
  4047 |       await expect(viewMenu.getByRole('button', { name: '删除视图 Timeline D' })).toBeVisible()
  4048 |       await page.keyboard.press('Escape')
  4049 |     }
  4050 |     await database.getByRole('button', { name: '数据库设置' }).click()
  4051 |     const settingsMenu = page.getByRole('menu', { name: '数据库设置' })
  4052 |     if (transition.renderer === 'board') await expect(settingsMenu.getByRole('menuitem', { name: '分组属性', exact: true })).toBeVisible()
  4053 |     else await expect(settingsMenu.getByRole('menuitem', { name: '分组属性', exact: true })).toHaveCount(0)
  4054 |     if (transition.renderer === 'timeline') {
  4055 |       await expect(settingsMenu.getByRole('menuitem', { name: '日期属性', exact: true })).toBeVisible()
  4056 |       await expect(settingsMenu.getByRole('menuitem', { name: '筛选', exact: true })).toBeVisible()
  4057 |       await expect(settingsMenu.getByRole('menuitem', { name: '排序', exact: true })).toBeVisible()
  4058 |     }
  4059 |     await page.keyboard.press('Escape')
  4060 |   }
  4061 |   await database.getByRole('button', { name: '切换视图' }).click()
  4062 |   await page.getByRole('group', { name: '数据库视图', exact: true }).getByRole('button', { name: 'Timeline D', exact: true }).click()
  4063 |   await page.setViewportSize({ width: 390, height: 844 })
  4064 |   await expect(database.getByTestId('database-timeline')).toBeVisible()
  4065 |   expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  4066 |   const selectorBounds = await database.getByRole('button', { name: '切换视图' }).boundingBox()
  4067 |   expect(selectorBounds).toBeTruthy()
  4068 |   expect(selectorBounds!.x + selectorBounds!.width).toBeLessThanOrEqual(390)
  4069 | })
  4070 | 
  4071 | test('Timeline shell keeps local zoom, exposes the seven scales, and has no table fallback', async ({ page, context }, testInfo) => {
  4072 |   await page.setViewportSize({ width: 1440, height: 900 })
  4073 |   const defaultTimeline = view('shell-default-timeline', rootDatabase.id, 'Timeline default', { ...DEFAULT_DATABASE_VIEW_CONFIG }, 'timeline')
  4074 |   const configuredTimeline = view('shell-configured-timeline', rootDatabase.id, 'Timeline configured', {
  4075 |     ...DEFAULT_DATABASE_VIEW_CONFIG, options: { timeline: { scale: 'week' } },
  4076 |   }, 'timeline')
  4077 |   const emptyDatabase = database('shell-empty-database', 'Empty database')
  4078 |   const emptyTimeline = view('shell-empty-timeline', emptyDatabase.id, 'Empty Timeline', { ...DEFAULT_DATABASE_VIEW_CONFIG }, 'timeline')
  4079 |   const tableView = view('shell-empty-table', emptyDatabase.id, 'Empty Table', { ...DEFAULT_DATABASE_VIEW_CONFIG }, 'table')
  4080 |   const api = await installApi(page, [
  4081 |     block('shell-default-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: defaultTimeline.id } }, 100),
  4082 |     block('shell-peer-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: defaultTimeline.id } }, 200),
  4083 |     block('shell-configured-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: rootDatabase.id, viewId: configuredTimeline.id } }, 300),
  4084 |     block('shell-empty-timeline-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: emptyDatabase.id, viewId: emptyTimeline.id } }, 400),
  4085 |     block('shell-empty-table-block', 'database', { type: 'eotionDatabase', attrs: { databaseId: emptyDatabase.id, viewId: tableView.id } }, 500),
  4086 |   ], {
  4087 |     databases: [rootDatabase, emptyDatabase], views: [defaultTimeline, configuredTimeline, emptyTimeline, tableView],
  4088 |     properties: [...rootProperties, property('shell-empty-title', emptyDatabase.id, 'Name', 'title')], records: [basicRecord],
  4089 |   })
  4090 |   api.pages.push({ ...pageRecord, id: basicRecord.pageId, title: 'Timeline shell record', role: 'database-record' })
  4091 |   await page.goto('/#/app/database-workspace/page/database-page')
  4092 | 
  4093 |   const defaultDatabase = page.locator('#database-block-shell-default-block')
  4094 |   const peerDatabase = page.locator('#database-block-shell-peer-block')
  4095 |   const configuredDatabase = page.locator('#database-block-shell-configured-block')
  4096 |   const emptyTimelineDatabase = page.locator('#database-block-shell-empty-timeline-block')
  4097 |   const defaultShell = defaultDatabase.getByTestId('database-timeline')
  4098 |   const peerShell = peerDatabase.getByTestId('database-timeline')
  4099 |   const configuredShell = configuredDatabase.getByTestId('database-timeline')
  4100 |   const emptyTimelineShell = emptyTimelineDatabase.getByTestId('database-timeline')
  4101 |   const scaleSelect = defaultShell.getByLabel('时间轴刻度')
  4102 |   const peerScaleSelect = peerShell.getByLabel('时间轴刻度')
  4103 |   const configuredScaleSelect = configuredShell.getByLabel('时间轴刻度')
> 4104 |   await expect(defaultShell).toBeVisible()
       |                              ^ Error: expect(locator).toBeVisible() failed
  4105 |   await expect(defaultShell).toHaveAttribute('data-scale', 'month')
  4106 |   await expect(defaultShell).toHaveAttribute('data-configured-scale', 'month')
  4107 |   await expect(peerShell).toHaveAttribute('data-scale', 'month')
  4108 |   await expect(configuredShell).toHaveAttribute('data-scale', 'week')
  4109 |   await expect(configuredShell).toHaveAttribute('data-configured-scale', 'week')
  4110 |   await expect(defaultDatabase.locator('table, [data-testid="database-list"], [data-testid="database-board"]')).toHaveCount(0)
  4111 |   await expect(emptyTimelineShell).toBeVisible()
  4112 |   await expect(emptyTimelineShell.locator('details')).toHaveCount(0)
  4113 |   await expect(emptyTimelineDatabase.locator('table, [data-testid="database-list"], [data-testid="database-board"]')).toHaveCount(0)
  4114 |   await expect(emptyTimelineShell.getByText('暂无记录', { exact: true })).toBeVisible()
  4115 |   await expect(defaultShell.getByText('未排期（1）', { exact: true })).toBeVisible()
  4116 |   await expect(defaultShell.getByTestId('timeline-unscheduled-row')).toContainText('Timeline shell record')
  4117 |   await defaultShell.getByRole('button', { name: '打开记录：Timeline shell record' }).click()
  4118 |   await expect(page.locator('[data-overlay-mode="drawer"]')).toBeVisible()
  4119 |   await page.getByRole('button', { name: '关闭记录' }).click()
  4120 | 
  4121 |   const scaleIds = ['hour', 'day', 'week', 'biweek', 'month', 'quarter', 'year']
  4122 |   await expect(scaleSelect.locator('option')).toHaveCount(scaleIds.length)
  4123 |   expect(await scaleSelect.locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value))).toEqual(scaleIds)
  4124 |   const recordReadsBeforeZoom = api.requests.filter(item => item.method === 'GET' && item.path.endsWith(`/views/${defaultTimeline.id}/table`)).length
  4125 |   const viewWritesBeforeZoom = api.requests.filter(item => ['POST', 'PATCH', 'DELETE'].includes(item.method) && item.path.includes(`/databases/${rootDatabase.id}/views`)).length
  4126 |   for (const scale of scaleIds) {
  4127 |     await scaleSelect.selectOption(scale)
  4128 |     await expect(defaultShell).toHaveAttribute('data-scale', scale)
  4129 |     await expect(peerShell).toHaveAttribute('data-scale', 'month')
  4130 |     await expect(peerScaleSelect).toHaveValue('month')
  4131 |     await expect(configuredShell).toHaveAttribute('data-scale', 'week')
  4132 |     await expect(configuredScaleSelect).toHaveValue('week')
  4133 |   }
  4134 |   expect(api.requests.filter(item => item.method === 'GET' && item.path.endsWith(`/views/${defaultTimeline.id}/table`))).toHaveLength(recordReadsBeforeZoom)
  4135 |   expect(api.requests.filter(item => ['POST', 'PATCH', 'DELETE'].includes(item.method) && item.path.includes(`/databases/${rootDatabase.id}/views`))).toHaveLength(viewWritesBeforeZoom)
  4136 | 
  4137 |   const onlineTimelineScroller = defaultShell.getByTestId('timeline-scroll')
  4138 |   const beforeOffline = await timelineViewport(onlineTimelineScroller)
  4139 |   const tableReadsBeforeOffline = api.requests.filter(item => item.method === 'GET' && item.path.endsWith(`/views/${defaultTimeline.id}/table`)).length
  4140 |   await page.evaluate(() => {
  4141 |     const timeline = document.querySelector('#database-block-shell-default-block [data-testid="database-timeline"]')
  4142 |     if (!timeline) throw new Error('Expected Timeline before going offline')
  4143 |     ;(window as Window & { __onlineTimelineIdentity?: { timeline: Element; component: unknown } }).__onlineTimelineIdentity = {
  4144 |       timeline, component: (timeline as Element & { __vueParentComponent?: unknown }).__vueParentComponent,
  4145 |     }
  4146 |   })
  4147 |   api.offline = true
  4148 |   await context.setOffline(true)
  4149 |   await expect(defaultDatabase.locator('.eotion-database-offline')).toContainText('离线')
  4150 |   api.offline = false
  4151 |   await context.setOffline(false)
  4152 |   await expect.poll(() => api.requests.filter(item => item.method === 'GET' && item.path.endsWith(`/views/${defaultTimeline.id}/table`)).length).toBe(tableReadsBeforeOffline + 2)
  4153 |   await expect(defaultShell).toHaveAttribute('data-scale', 'year')
  4154 |   const afterOnline = await timelineViewport(onlineTimelineScroller)
  4155 |   expect(Math.abs((afterOnline.start + afterOnline.end) / 2 - (beforeOffline.start + beforeOffline.end) / 2)).toBeLessThan(2)
  4156 |   expect(await page.evaluate(() => {
  4157 |     const before = (window as Window & { __onlineTimelineIdentity?: { timeline: Element; component: unknown } }).__onlineTimelineIdentity!
  4158 |     const current = document.querySelector('#database-block-shell-default-block [data-testid="database-timeline"]') as (Element & { __vueParentComponent?: unknown }) | null
  4159 |     return current === before.timeline && current?.__vueParentComponent === before.component
  4160 |   })).toBe(true)
  4161 | 
  4162 |   const emptyTable = page.locator('#database-block-shell-empty-table-block')
  4163 |   await expect(emptyTable.locator('table')).toBeVisible()
  4164 |   await expect(emptyTable.getByText('暂无记录', { exact: true })).toBeVisible()
  4165 |   await expect(emptyTable.getByTestId('database-timeline')).toHaveCount(0)
  4166 | 
  4167 |   for (const [width, height, suffix] of [[1440, 900, 'desktop'], [390, 844, 'phone']] as const) {
  4168 |     await page.setViewportSize({ width, height })
  4169 |     for (const theme of ['light', 'dark'] as const) {
  4170 |       await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme)
  4171 |       if (width === 390) {
  4172 |         await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  4173 |         for (const name of ['上一个时间段', '今天', '下一个时间段']) {
  4174 |           const button = defaultShell.getByRole('button', { name })
  4175 |           await expect(button).toBeVisible()
  4176 |           const bounds = await button.boundingBox()
  4177 |           expect(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width).toBe(true)
  4178 |         }
  4179 |         const selectBounds = await scaleSelect.boundingBox()
  4180 |         expect(selectBounds && selectBounds.x >= 0 && selectBounds.x + selectBounds.width <= width).toBe(true)
  4181 |       }
  4182 |       await timelineScreenshot(page, testInfo, `p112a-timeline-shell-${suffix}-${theme}`)
  4183 |     }
  4184 |   }
  4185 | })
  4186 | 
  4187 | test.describe('P11.2D Timeline acceptance', () => {
  4188 |   test.use({ timezoneId: 'UTC' })
  4189 | 
  4190 |   test('validates scales, coordinates, cached projections, network silence, and empty screenshots', async ({ page }, testInfo) => {
  4191 |     await page.setViewportSize({ width: 1440, height: 1000 })
  4192 |     await page.clock.setFixedTime(new Date('2026-10-13T00:00:00.000Z'))
  4193 |     const timelineView = view('p112d-acceptance-view', rootDatabase.id, 'P11.2D Timeline', {
  4194 |       ...DEFAULT_DATABASE_VIEW_CONFIG,
  4195 |       visibleProperties: ['root-title'], propertyOrder: ['root-title'],
  4196 |       options: { timeline: {
  4197 |         dateSource: { mode: 'date-property', propertyId: 'root-date' },
  4198 |         frozenTable: { visible: true, visibleProperties: ['root-title'], propertyOrder: ['root-title'] },
  4199 |       } },
  4200 |     }, 'timeline')
  4201 |     const emptyDatabase = database('p112d-empty-database', 'Empty timeline')
  4202 |     const emptyView = view('p112d-empty-view', emptyDatabase.id, 'Empty Timeline', {
  4203 |       ...DEFAULT_DATABASE_VIEW_CONFIG,
  4204 |       options: { timeline: { dateSource: { mode: 'date-property', propertyId: 'p112d-empty-date' } } },
```