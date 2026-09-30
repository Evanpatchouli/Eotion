import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { expect, test, type Page } from '@playwright/test'

const email = `p54-${randomUUID()}@example.test`
const password = 'P54-real-sync-2026!'

test.afterAll(async () => {
  const uri = test.info().config.metadata.eotionRealMongoUri as string | undefined
  if (!uri || !new URL(uri).pathname.startsWith('/eotion_p54_browser_')) return
  const requireFromApi = createRequire(new URL('../../api/package.json', import.meta.url))
  const mongoose = requireFromApi('mongoose') as {
    connect(uri: string): Promise<unknown>
    connection: { dropDatabase(): Promise<unknown> }
    disconnect(): Promise<unknown>
  }
  await mongoose.connect(uri)
  try { await mongoose.connection.dropDatabase() } finally { await mongoose.disconnect() }
})

async function login(page: Page): Promise<void> {
  await page.goto('/#/login')
  await page.getByRole('textbox', { name: '邮箱' }).fill(email)
  await page.getByLabel('密码', { exact: true }).fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/#\/app/)
}

test('Mongo + API + built Web: two clients converge and an offline reload keeps local edits', async ({ browser, page }) => {
  await page.goto('/#/register')
  await page.getByRole('textbox', { name: '邮箱' }).fill(email)
  await page.getByLabel('密码', { exact: true }).fill(password)
  await page.getByLabel('确认密码').fill(password)
  await page.getByRole('button', { name: '注册', exact: true }).click()
  await expect(page).toHaveURL(/#\/login/)
  await login(page)

  await page.getByRole('textbox', { name: '工作区名称' }).fill('P5.4 真实同步')
  await page.getByRole('button', { name: '创建工作区' }).click()
  await expect(page).toHaveURL(/#\/app\/[^/]+$/)
  const workspaceId = new URL(page.url()).hash.split('/').at(-1)!
  await expect(page.getByText('还没有页面')).toBeVisible()
  await page.getByRole('button', { name: '新建根页面' }).click()
  await expect(page.locator('.eotion-editor-content .tiptap')).toBeVisible()
  const pageId = new URL(page.url()).hash.split('/').at(-1)!
  const editorA = page.locator('.eotion-editor-content .tiptap')
  await editorA.fill('A 初始正文')
  await expect(page.getByRole('status').filter({ hasText: '已保存到本地' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible({ timeout: 20_000 })

  const secondContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  try {
    const second = await secondContext.newPage()
    await login(second)
    await second.goto(`/#/app/${workspaceId}/page/${pageId}`)
    const editorB = second.locator('.eotion-editor-content .tiptap')
    await expect(editorB).toContainText('A 初始正文')
    const width = await second.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: window.innerWidth }))
    expect(width.page).toBeLessThanOrEqual(width.viewport)

    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker?.controller))).toBe(true)
    await page.context().setOffline(true)
    await page.reload()
    await expect(page.locator('.eotion-editor-content .tiptap')).toContainText('A 初始正文')
    await page.locator('.eotion-editor-content .tiptap').fill('A 离线修改')
    await expect(page.getByRole('status').filter({ hasText: '已保存到本地' })).toBeVisible()
    await page.getByRole('button', { name: '新建根页面' }).click()
    await expect(page.getByRole('heading', { name: '无标题' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: '无标题' })).toBeVisible()
    await page.goto(`/#/app/${workspaceId}/page/${pageId}`)
    await expect(page.locator('.eotion-editor-content .tiptap')).toContainText('A 离线修改')

    await page.context().setOffline(false)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible({ timeout: 20_000 })
    await second.reload()
    await expect(second.locator('.eotion-editor-content .tiptap')).toContainText('A 离线修改')

    await second.locator('.eotion-editor-content .tiptap').fill('B 最终正文')
    await expect(second.getByRole('status').filter({ hasText: '已保存到本地' })).toBeVisible()
    await expect(second.getByRole('status').filter({ hasText: '已同步' })).toBeVisible({ timeout: 20_000 })
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page.locator('.eotion-editor-content .tiptap')).toContainText('B 最终正文', { timeout: 20_000 })

    await second.getByRole('button', { name: '打开导航菜单' }).click()
    await second.getByRole('button', { name: '页面操作：无标题' }).first().click()
    await second.getByRole('group', { name: '无标题 的操作' }).getByRole('button', { name: '删除', exact: true }).click()
    await second.getByRole('button', { name: '确认删除' }).click()
    await expect(second.getByRole('status').filter({ hasText: '已同步' })).toBeVisible({ timeout: 20_000 })
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page.getByRole('heading', { name: '无法打开这个页面' })).toBeVisible({ timeout: 20_000 })
  } finally {
    await secondContext.close()
  }
})
