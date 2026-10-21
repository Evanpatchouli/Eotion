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
  await expect(reloadedDatabase.getByTestId('database-timeline').locator('[data-testid="timeline-bar"]')).toHaveCount(1)
  const reloadedBar = reloadedDatabase.getByTestId('database-timeline').locator('[data-testid="timeline-bar"]')
  await expect(reloadedBar).toContainText('验收里程碑')
  await page.screenshot({ path: testInfo.outputPath('timeline-reloaded.png'), fullPage: true, animations: 'disabled' })
  await reloadedBar.click()
  const reloadedRecord = page.locator('[data-overlay-mode="drawer"]')
  await expect(reloadedRecord).toBeVisible()
  await expect(reloadedRecord.getByRole('textbox', { name: '记录标题' })).toHaveValue('验收里程碑')
  await reloadedRecord.getByRole('button', { name: '关闭记录' }).click()
  await expect(reloadedRecord).toHaveCount(0)
  await reloadedDatabase.getByRole('button', { name: '数据库设置' }).click()
  await page.getByRole('menuitem', { name: '日期属性', exact: true }).click()
  const dateSettings = page.getByRole('dialog', { name: '时间线日期属性', exact: true })
  await expect(dateSettings.getByRole('button', { name: '日期来源', exact: true })).toHaveAttribute('data-value', 'date-property')
  await expect(dateSettings.getByRole('button', { name: '日期属性', exact: true })).toHaveAttribute('data-value', datePropertyId!)
  await expect(dateSettings.getByRole('button', { name: '保存日期属性', exact: true })).toBeVisible()
})
