import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { expect, test, type Page } from '@playwright/test'

const email = `timeline-${randomUUID()}@example.test`
const password = 'Timeline-real-2026!'
const databaseNamePrefix = 'eotion_timeline_browser_'

test.afterAll(async () => {
  const uri = test.info().config.metadata.eotionTimelineRealMongoUri as string | undefined
  const databaseName = uri ? new URL(uri).pathname.slice(1) : ''
  if (!uri || !databaseName.startsWith(databaseNamePrefix)) return

  const requireFromApi = createRequire(new URL('../../api/package.json', import.meta.url))
  const mongoose = requireFromApi('mongoose') as {
    connect(uri: string): Promise<unknown>
    connection: { dropDatabase(): Promise<unknown> }
    disconnect(): Promise<unknown>
  }
  await mongoose.connect(uri)
  try { await mongoose.connection.dropDatabase() } finally { await mongoose.disconnect() }
})

async function registerAndLogin(page: Page): Promise<void> {
  await page.goto('/#/register')
  await page.getByRole('textbox', { name: '邮箱' }).fill(email)
  await page.getByLabel('密码', { exact: true }).fill(password)
  await page.getByLabel('确认密码').fill(password)
  await page.getByRole('button', { name: '注册', exact: true }).click()
  await expect(page).toHaveURL(/#\/login/)

  await page.getByRole('textbox', { name: '邮箱' }).fill(email)
  await page.getByLabel('密码', { exact: true }).fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/#\/app/)
}

async function switchView(page: Page, database: ReturnType<Page['locator']>, viewName: string): Promise<void> {
  await expect(database).toHaveAttribute('data-view-ready', 'true')
  const trigger = database.getByRole('button', { name: '切换视图', exact: true })
  await expect(trigger).toBeEnabled()
  await trigger.click()
  const viewMenu = page.getByRole('group', { name: '数据库视图', exact: true })
  await expect(viewMenu).toBeVisible()
  await viewMenu.getByRole('button', { name: viewName, exact: true }).click()
  await expect(database).toHaveAttribute('data-view-ready', 'true')
  await expect(trigger).toHaveText(viewName)
}

test('creates a Timeline through the product UI and keeps its date source and scheduled record after reload', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await registerAndLogin(page)

  await page.getByRole('textbox', { name: '工作区名称' }).fill('真实时间线验收')
  await page.getByRole('button', { name: '创建工作区' }).click()
  await expect(page).toHaveURL(/#\/app\/[^/]+$/)
  const workspaceId = new URL(page.url()).hash.split('/').at(-1)!

  await page.getByRole('button', { name: '新建根页面' }).click()
  await expect(page.locator('.eotion-editor-content .tiptap')).toBeVisible()
  const editor = page.locator('.eotion-editor-content .tiptap')
  await editor.click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.press('/')
  await page.keyboard.type('database')
  const slash = page.locator('.p2-slash-menu')
  await slash.getByRole('option', { name: '数据库', exact: true }).click()

  const databaseDialog = page.getByRole('dialog', { name: '数据库' })
  await expect(databaseDialog).toBeVisible()
  await databaseDialog.getByRole('button', { name: '创建新数据库' }).click()
  await databaseDialog.getByRole('textbox', { name: '数据库名称' }).fill('时间线项目')
  // Database insertion requires a synchronized host page. Wait for the last
  // slash edit, not an earlier page-create or partial slash acknowledgment.
  await expect.poll(() => page.evaluate(async workspace => {
    const response = await fetch(`/api/sync/workspaces/${workspace}/snapshot`)
    if (!response.ok) return false
    const snapshot = await response.json() as { blocks: Array<{ props?: { node?: { content?: Array<{ text?: string }> } } }> }
    return snapshot.blocks.some(block => block.props?.node?.content?.some(node => node.text === '/database'))
  }, workspaceId)).toBe(true)
  await databaseDialog.getByRole('button', { name: '创建数据库', exact: true }).click()

  const databaseBlock = page.locator('.eotion-database').filter({ has: page.getByRole('button', { name: '切换视图' }) })
  await expect(databaseBlock).toBeVisible()
  await expect(databaseBlock).toHaveAttribute('data-view-ready', 'true')
  await expect(databaseBlock.getByRole('button', { name: '新建记录', exact: true })).toBeVisible()

  const viewTrigger = databaseBlock.getByRole('button', { name: '切换视图', exact: true })
  await expect(viewTrigger).toBeEnabled()
  await viewTrigger.click()
  const viewMenu = page.getByRole('group', { name: '数据库视图', exact: true })
  await viewMenu.getByRole('button', { name: '新建时间线视图', exact: true }).click()
  const timelineDialog = page.getByRole('dialog', { name: '新建时间线视图', exact: true })
  const dateSourceMode = timelineDialog.getByRole('button', { name: '日期来源', exact: true })
  await expect(dateSourceMode).toBeVisible()
  await expect(dateSourceMode).toHaveAttribute('data-value', 'date-property')
  await expect(timelineDialog.getByText('当前数据库没有日期属性；可在此新增日期属性后继续。')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('timeline-create-date-source.png'), fullPage: true, animations: 'disabled' })
  await timelineDialog.getByRole('button', { name: '新增日期属性', exact: true }).click()
  const datePropertySelector = timelineDialog.getByRole('button', { name: '日期属性', exact: true })
  await expect(datePropertySelector).toHaveAttribute('data-value', /.+/u)
  const datePropertyId = await datePropertySelector.getAttribute('data-value')
  expect(datePropertyId).toBeTruthy()
  await timelineDialog.getByRole('button', { name: '创建时间线', exact: true }).click()
  await expect(databaseBlock.getByTestId('database-timeline')).toBeVisible()
  const timelineViewId = await databaseBlock.getAttribute('data-view-id')
  const timelineName = (await databaseBlock.getByRole('button', { name: '切换视图' }).innerText()).trim()
  expect(timelineViewId).toBeTruthy()

  await expect(databaseBlock).toHaveAttribute('data-view-ready', 'true')
  await expect(viewTrigger).toBeEnabled()
  await viewTrigger.click()
  await page.getByRole('group', { name: '数据库视图', exact: true }).getByRole('button', { name: '表格视图', exact: true }).click()
  await expect(databaseBlock).toHaveAttribute('data-view-ready', 'true')
  await expect(viewTrigger).toHaveText('表格视图')
  await expect(databaseBlock.locator('.eotion-database-table')).toBeVisible()
  await databaseBlock.getByRole('button', { name: '新建记录', exact: true }).click()
  const recordDrawer = page.locator('[data-overlay-mode="drawer"]')
  await expect(recordDrawer).toBeVisible()
  const recordTitle = recordDrawer.getByRole('textbox', { name: '记录标题' })
  await recordTitle.fill('验收里程碑')
  await recordTitle.press('Enter')
  await expect(databaseBlock).toContainText('验收里程碑')
  await recordDrawer.getByRole('button', { name: '关闭记录' }).click()
  await expect(recordDrawer).toHaveCount(0)
  const row = databaseBlock.locator('tbody tr').first()
  await expect(row).toBeVisible()
  const scheduledDate = await page.evaluate(() => {
    const parts = new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }).formatToParts(new Date())
    const part = (type: string) => parts.find(item => item.type === type)?.value
    return `${part('year')}-${part('month')}-${part('day')}`
  })
  const dateCell = row.getByRole('button', { name: /编辑日期：/u })
  await dateCell.click()
  const dateInput = row.getByLabel('日期 值', { exact: true })
  await dateInput.fill(scheduledDate)
  await row.getByRole('button', { name: '保存', exact: true }).click()

  await switchView(page, databaseBlock, timelineName)
  const timeline = databaseBlock.getByTestId('database-timeline')
  const bar = timeline.locator('[data-testid="timeline-bar"]')
  await expect(bar).toHaveCount(1)
  await expect(bar).toContainText('验收里程碑')
  await bar.click()
  const openedRecord = page.locator('[data-overlay-mode="drawer"]')
  await expect(openedRecord).toBeVisible()
  await expect(openedRecord.getByRole('textbox', { name: '记录标题' })).toHaveValue('验收里程碑')
  await openedRecord.getByRole('button', { name: '关闭记录' }).click()

  await databaseBlock.getByRole('button', { name: '数据库设置' }).click()
  await page.getByRole('menuitem', { name: '时间线设置', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '时间线设置', exact: true })
  await settings.getByLabel('显示冻结表格').check()
  await settings.getByRole('checkbox', { name: '日期', exact: true }).check()
  await page.getByRole('button', { name: '保存时间线设置' }).click()
  await expect(timeline.getByTestId('timeline-frozen-table')).toContainText(scheduledDate)

  // The authenticated API checks below are read-only; creation and mutation above
  // have gone through the visible product controls.
  await expect.poll(() => page.evaluate(async ({ workspaceId, viewId }) => {
    const response = await fetch(`/api/sync/workspaces/${workspaceId}/snapshot`)
    if (!response.ok) return false
    const snapshot = await response.json() as { blocks: Array<{ props?: { node?: { attrs?: { viewId?: string } } } }> }
    return snapshot.blocks.some(block => block.props?.node?.attrs?.viewId === viewId)
  }, { workspaceId, viewId: timelineViewId! }), { timeout: 20_000 }).toBe(true)
  const persisted = await page.evaluate(async ({ workspaceId, viewId }) => {
    const snapshotResponse = await fetch(`/api/sync/workspaces/${workspaceId}/snapshot`)
    if (!snapshotResponse.ok) throw new Error(`Workspace snapshot failed: ${snapshotResponse.status}`)
    const snapshot = await snapshotResponse.json() as { blocks: Array<{ id: string; props?: { node?: { attrs?: { databaseId?: string; viewId?: string } } } }> }
    const databaseBlock = snapshot.blocks.find(block => block.props?.node?.attrs?.viewId === viewId)
    const databaseId = databaseBlock?.props?.node?.attrs?.databaseId
    if (!databaseBlock || !databaseId) throw new Error('The persisted database block does not reference the active Timeline view.')
    const viewResponse = await fetch(`/api/workspaces/${workspaceId}/databases/${databaseId}/views?limit=100`)
    if (!viewResponse.ok) throw new Error(`View read failed: ${viewResponse.status}`)
    const viewList = await viewResponse.json() as Array<{ id: string; type: string; config: { options?: { timeline?: { dateSource?: unknown } } } }>
    const tableResponse = await fetch(`/api/workspaces/${workspaceId}/databases/${databaseId}/views/${viewId}/table?limit=100`)
    if (!tableResponse.ok) throw new Error(`Record read failed: ${tableResponse.status}`)
    const table = await tableResponse.json() as { records: Array<{ id: string; pageId: string; properties: Record<string, unknown> }> }
    return { databaseBlock, view: viewList.find(item => item.id === viewId), records: table.records }
  }, { workspaceId, viewId: timelineViewId! })
  expect(persisted.databaseBlock?.props?.node?.attrs?.viewId).toBe(timelineViewId)
  expect(persisted.view?.type).toBe('timeline')
  const dateSource = persisted.view?.config.options?.timeline?.dateSource as { mode?: string; propertyId?: string } | undefined
  expect(dateSource?.mode).toBe('date-property')
  expect(dateSource?.propertyId).toBe(datePropertyId)
  expect(persisted.records).toHaveLength(1)
  expect(persisted.records[0]?.pageId).toBeTruthy()
  const persistedDate = persisted.records[0]?.properties[dateSource!.propertyId!]
  expect(persistedDate).toBe(scheduledDate)

  await page.reload()
  const reloadedDatabase = page.locator('.eotion-database').first()
  await expect(reloadedDatabase).toHaveAttribute('data-view-id', timelineViewId!)
  await expect(reloadedDatabase.getByTestId('timeline-frozen-table')).toContainText(scheduledDate)
  await expect(reloadedDatabase.getByTestId('database-timeline').locator('[data-testid="timeline-bar"]')).toHaveCount(1)
  const reloadedBar = reloadedDatabase.getByTestId('database-timeline').locator('[data-testid="timeline-bar"]')
  await expect(reloadedBar).toContainText('验收里程碑')
  await page.screenshot({ path: testInfo.outputPath('timeline-reloaded.png'), fullPage: true, animations: 'disabled' })
  // Leave a sliver of the first month visible and check that its pinned label
  // cannot cover the next month, including when Frozen Table narrows the ruler.
  const ruler = reloadedDatabase.getByTestId('timeline-ruler')
  const scroller = reloadedDatabase.getByTestId('timeline-scroll')
  const initialScroll = await scroller.evaluate(element => element.scrollLeft)
  const toBoundary = await ruler.locator('.eotion-timeline-ruler-tick--major').first().evaluate(tick =>
    tick.getBoundingClientRect().right - tick.parentElement!.getBoundingClientRect().left)
  await scroller.evaluate((element, distance) => { element.scrollLeft += distance - 30 }, toBoundary)
  const months = ruler.locator('.eotion-timeline-ruler-label--major')
  await expect.poll(() => months.evaluateAll(labels => {
    if (labels.length < 2) return false
    const current = labels[0]!.getBoundingClientRect()
    const next = labels[1]!.getBoundingClientRect()
    return current.width <= 32 && current.right <= next.left + 1
  })).toBe(true)
  await scroller.evaluate((element, value) => { element.scrollLeft = value }, initialScroll)
  await reloadedBar.click()
  const reloadedRecord = page.locator('[data-overlay-mode="drawer"]')
  await expect(reloadedRecord).toBeVisible()
  await expect(reloadedRecord.getByRole('textbox', { name: '记录标题' })).toHaveValue('验收里程碑')
  await reloadedRecord.getByRole('button', { name: '关闭记录' }).click()
  await expect(reloadedRecord).toHaveCount(0)

  // Exercise an unscheduled record against the real API and verify the atomic
  // date write survives a reload, not just the local drag preview.
  await reloadedDatabase.getByRole('button', { name: '新建记录', exact: true }).click()
  const unscheduledRecord = page.locator('[data-overlay-mode="drawer"]')
  await expect(unscheduledRecord).toBeVisible()
  await unscheduledRecord.getByRole('textbox', { name: '记录标题' }).fill('真实拖放验收')
  await unscheduledRecord.getByRole('textbox', { name: '记录标题' }).press('Enter')
  await expect(reloadedDatabase).toContainText('真实拖放验收')
  await unscheduledRecord.getByRole('button', { name: '关闭记录' }).click()
  await expect(unscheduledRecord).toHaveCount(0)
  const reloadedTimeline = reloadedDatabase.getByTestId('database-timeline')
  const unscheduledList = reloadedTimeline.locator('details.eotion-database-timeline-records')
  await expect(unscheduledList).toBeVisible()
  await unscheduledList.locator('summary').click()
  const dragHandle = unscheduledList.getByRole('button', { name: '拖动安排：真实拖放验收' })
  await expect(dragHandle).toBeEnabled()
  const draggedRecordId = await dragHandle.getAttribute('data-record-id')
  expect(draggedRecordId).toBeTruthy()
  await dragHandle.scrollIntoViewIfNeeded()
  const handleBox = await dragHandle.boundingBox()
  const scrollBox = await reloadedTimeline.getByTestId('timeline-scroll').boundingBox()
  const bodyBox = await reloadedTimeline.getByTestId('timeline-canvas-body').boundingBox()
  expect(handleBox && scrollBox && bodyBox).toBeTruthy()
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(scrollBox!.x + Math.min(120, scrollBox!.width / 3), Math.max(bodyBox!.y, scrollBox!.y) + 100, { steps: 6 })
  const dropPreview = reloadedTimeline.getByTestId('timeline-schedule-target')
  await expect(dropPreview).toBeVisible()
  const droppedDate = (await dropPreview.innerText()).split(' · ')[0]!
  expect(droppedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/u)
  const batchResponse = page.waitForResponse(response => response.url().includes('/cell-mutations') && response.request().method() === 'POST')
  await page.mouse.up()
  const batch = await batchResponse
  expect(batch.ok()).toBe(true)
  const batchBody = await batch.json() as { records: Array<{ id: string; properties: Record<string, unknown> }> }
  expect(batchBody.records.find(item => item.id === draggedRecordId)?.properties[datePropertyId!]).toBe(droppedDate)
  await expect(reloadedTimeline.getByTestId('timeline-bar').filter({ hasText: '真实拖放验收' })).toBeVisible()
  await page.reload()
  await expect(page.locator('.eotion-database').first().getByTestId('timeline-bar').filter({ hasText: '真实拖放验收' })).toBeVisible()

  // A keyboard move must persist the View's canonical order through the real API.
  const reorderedTimeline = page.locator('.eotion-database').first().getByTestId('database-timeline')
  const orderHandle = reorderedTimeline.locator(`[data-testid="timeline-order-handle"][data-record-id="${draggedRecordId}"]`)
  await expect(orderHandle).toBeEnabled()
  const orderResponse = page.waitForResponse(response => response.url().endsWith('/record-order') && response.request().method() === 'POST')
  await orderHandle.press('ArrowUp')
  expect((await orderResponse).ok()).toBe(true)
  await expect(reorderedTimeline.locator(`[data-timeline-row][data-record-id="${draggedRecordId}"]`)).toHaveAttribute('data-row-index', '0')
  await page.reload()
  await expect(page.locator('.eotion-database').first().getByTestId('database-timeline')
    .locator(`[data-timeline-row][data-record-id="${draggedRecordId}"]`)).toHaveAttribute('data-row-index', '0')

  // The Select property is test data; configure grouping and move records only
  // through the visible Timeline controls.
  const groupPropertyId = `timeline-group-${randomUUID()}`
  const databaseId = persisted.databaseBlock?.props?.node?.attrs?.databaseId
  expect(databaseId).toBeTruthy()
  const createdGroupProperty = await page.evaluate(async ({ workspaceId, databaseId, viewId, propertyId }) => {
    const root = `/api/workspaces/${workspaceId}/databases/${databaseId}`
    const current = await fetch(`${root}/views/${viewId}/records?limit=2`)
    if (!current.ok) throw new Error(`Database read failed: ${current.status}`)
    const state = await current.json() as { database: { version: number } }
    const response = await fetch(`${root}/properties`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: propertyId, name: '验收分组', type: 'select',
        options: [{ id: 'timeline-alpha', name: '验收第一组' }, { id: 'timeline-beta', name: '验收空组' }],
        expectedDatabaseVersion: state.database.version }) })
    if (!response.ok) throw new Error(`Select property setup failed: ${response.status} ${await response.text()}`)
    return response.json() as Promise<{ property: { id: string } }>
  }, { workspaceId, databaseId: databaseId!, viewId: timelineViewId!, propertyId: groupPropertyId })
  expect(createdGroupProperty.property.id).toBe(groupPropertyId)
  await page.reload()
  const groupedDatabase = page.locator('.eotion-database').first()
  await expect(groupedDatabase).toHaveAttribute('data-view-id', timelineViewId!)
  await expect(groupedDatabase).toHaveAttribute('data-view-ready', 'true')
  await groupedDatabase.getByRole('button', { name: '数据库设置' }).click()
  await page.getByRole('menuitem', { name: '分组属性', exact: true }).click()
  const groupingSettings = page.getByRole('dialog', { name: '分组属性', exact: true })
  await expect(groupingSettings).toBeVisible()
  await groupingSettings.getByRole('button', { name: '分组属性', exact: true }).click()
  await groupingSettings.getByRole('menuitem', { name: '验收分组', exact: true }).click()
  const groupingSaved = page.waitForResponse(response => response.url().endsWith(`/views/${timelineViewId}`) && response.request().method() === 'PATCH')
  await groupingSettings.getByRole('button', { name: '保存分组', exact: true }).click()
  expect((await groupingSaved).ok()).toBe(true)
  const groupedTimeline = groupedDatabase.getByTestId('database-timeline')
  const groupHeader = (label: string) => groupedTimeline.getByTestId('timeline-frozen-table').locator('[data-timeline-group-header]').filter({ hasText: label })
  await expect(groupHeader('验收第一组')).toBeVisible()
  await expect(groupHeader('验收空组')).toBeVisible()
  await expect(groupHeader('未分组')).toBeVisible()
  await expect(groupHeader('验收空组').getByTestId('timeline-group-complete-count')).toHaveText('0')

  const moveThroughGroupControl = async (title: string) => {
    const control = groupedTimeline.getByRole('combobox', { name: `移动${title}到分组` })
    await expect(control).toBeEnabled()
    const responsePromise = page.waitForResponse(response => response.url().endsWith('/record-group') && response.request().method() === 'POST')
    await control.selectOption({ label: '验收第一组' })
    const response = await responsePromise
    expect(response.ok()).toBe(true)
    const body = await response.json() as { record: { id: string; properties: Record<string, unknown> } }
    expect(body.record.properties[groupPropertyId]).toBe('timeline-alpha')
    return body.record.id
  }
  expect(await moveThroughGroupControl('真实拖放验收')).toBe(draggedRecordId)
  const milestoneRecordId = await moveThroughGroupControl('验收里程碑')
  const movedRow = groupedTimeline.locator(`[data-timeline-row][data-record-id="${draggedRecordId}"]`)
  const milestoneRow = groupedTimeline.locator(`[data-timeline-row][data-record-id="${milestoneRecordId}"]`)
  await expect(groupedDatabase.locator('.eotion-database-refreshing')).toHaveCount(0)
  await expect(groupHeader('验收第一组').getByTestId('timeline-group-complete-count')).toHaveText('2')
  await expect(groupHeader('未分组').getByTestId('timeline-group-complete-count')).toHaveText('0')
  await expect(movedRow).toBeVisible()
  await expect(milestoneRow).toBeVisible()
  await expect.poll(async () => {
    const [first, next, moved, milestone] = await Promise.all([
      groupHeader('验收第一组').getAttribute('data-row-index'),
      groupHeader('验收空组').getAttribute('data-row-index'),
      movedRow.getAttribute('data-row-index'),
      milestoneRow.getAttribute('data-row-index'),
    ])
    return [first, next, moved, milestone].every(value => value !== null)
      && Number(first) < Number(moved) && Number(moved) < Number(next)
      && Number(first) < Number(milestone) && Number(milestone) < Number(next)
  }).toBe(true)
  await expect.poll(async () => Number(await movedRow.getAttribute('data-row-index'))
    < Number(await milestoneRow.getAttribute('data-row-index'))).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('timeline-grouped-desktop.png'), fullPage: true, animations: 'disabled' })

  await groupedDatabase.getByRole('button', { name: '新建记录', exact: true }).click()
  const groupedRecordDrawer = page.locator('[data-overlay-mode="drawer"]')
  await expect(groupedRecordDrawer).toBeVisible()
  await groupedRecordDrawer.getByRole('textbox', { name: '记录标题' }).fill('分组后新记录')
  await groupedRecordDrawer.getByRole('textbox', { name: '记录标题' }).press('Enter')
  await groupedRecordDrawer.getByRole('button', { name: '关闭记录' }).click()
  await expect(groupedTimeline.locator('[data-timeline-row]').filter({ hasText: '分组后新记录' })).toBeVisible()
  await expect(groupHeader('验收空组').getByTestId('timeline-group-complete-count')).toHaveText('0')

  const collapse = groupHeader('验收第一组').getByRole('button', { name: '折叠分组：验收第一组' })
  await collapse.click()
  await expect(groupHeader('验收第一组').getByRole('button', { name: '展开分组：验收第一组' })).toHaveAttribute('aria-expanded', 'false')
  await page.reload()
  const groupedAfterReload = page.locator('.eotion-database').first().getByTestId('database-timeline')
  const groupFrozenAfterReload = groupedAfterReload.getByTestId('timeline-frozen-table')
  const firstGroupAfterReload = groupFrozenAfterReload.locator('[data-timeline-group-header]').filter({ hasText: '验收第一组' })
  await expect(firstGroupAfterReload.getByRole('button', { name: '展开分组：验收第一组' })).toHaveAttribute('aria-expanded', 'false')
  await expect(groupFrozenAfterReload.locator('[data-timeline-group-header]').filter({ hasText: '验收空组' })).toBeVisible()
  await expect(groupedAfterReload.locator('[data-timeline-row]').filter({ hasText: '分组后新记录' })).toBeVisible()
  await firstGroupAfterReload.getByRole('button', { name: '展开分组：验收第一组' }).click()
  const movedAfterReload = groupedAfterReload.locator(`[data-timeline-row][data-record-id="${draggedRecordId}"]`)
  const milestoneAfterReload = groupedAfterReload.locator(`[data-timeline-row][data-record-id="${milestoneRecordId}"]`)
  await expect(page.locator('.eotion-database').first().locator('.eotion-database-refreshing')).toHaveCount(0)
  await expect(firstGroupAfterReload.getByTestId('timeline-group-complete-count')).toHaveText('2')
  await expect(groupFrozenAfterReload.locator('[data-timeline-group-header]').filter({ hasText: '未分组' }).getByTestId('timeline-group-complete-count')).toHaveText('1')
  await expect(movedAfterReload).toBeVisible()
  await expect(milestoneAfterReload).toBeVisible()
  await expect.poll(async () => {
    const [first, next, moved, milestone] = await Promise.all([
      firstGroupAfterReload.getAttribute('data-row-index'),
      groupFrozenAfterReload.locator('[data-timeline-group-header]').filter({ hasText: '验收空组' }).getAttribute('data-row-index'),
      movedAfterReload.getAttribute('data-row-index'),
      milestoneAfterReload.getAttribute('data-row-index'),
    ])
    return [first, next, moved, milestone].every(value => value !== null)
      && Number(first) < Number(moved) && Number(moved) < Number(next)
      && Number(first) < Number(milestone) && Number(milestone) < Number(next)
  }).toBe(true)
  await expect.poll(async () => Number(await movedAfterReload.getAttribute('data-row-index'))
    < Number(await milestoneAfterReload.getAttribute('data-row-index'))).toBe(true)

  await reloadedDatabase.getByRole('button', { name: '数据库设置' }).click()
  await page.getByRole('menuitem', { name: '日期属性', exact: true }).click()
  const dateSettings = page.getByRole('dialog', { name: '时间线日期属性', exact: true })
  await expect(dateSettings.getByRole('button', { name: '日期来源', exact: true })).toHaveAttribute('data-value', 'date-property')
  await expect(dateSettings.getByRole('button', { name: '日期属性', exact: true })).toHaveAttribute('data-value', datePropertyId!)
  await expect(dateSettings.getByRole('button', { name: '保存日期属性', exact: true })).toBeVisible()
})
