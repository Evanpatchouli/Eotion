import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { expect, test, type Page } from '@playwright/test'

const email = `p54-${randomUUID()}@example.test`
const password = 'P54-real-sync-2026!'
const screenshotDirectory = process.env.EOTION_VISUAL_QA_DIR ?? join(tmpdir(), 'eotion-p55-visual-qa')
// A large, deterministic raster exercises real image sizing, not just a 1px icon.
function landscapePng(): Buffer {
  const width = 1200, height = 720
  const crc = (bytes: Buffer) => {
    let value = 0xffffffff
    for (const byte of bytes) {
      value ^= byte
      for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0)
    }
    return (value ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, bytes: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), bytes])
    const size = Buffer.alloc(4), checksum = Buffer.alloc(4)
    size.writeUInt32BE(bytes.length); checksum.writeUInt32BE(crc(body))
    return Buffer.concat([size, body, checksum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2
  const pixels = Buffer.alloc(height * (1 + width * 3))
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const ridge = 360 + 105 * Math.sin(x / 270) + 40 * Math.sin(x / 80)
    const foreground = y > 530 + 65 * Math.cos(x / 190)
    const color = foreground ? [63, 80, 70] : y > ridge ? [133, 151, 133] : [231, 225, 210]
    const offset = y * (1 + width * 3) + 1 + x * 3
    pixels[offset] = color[0]!; pixels[offset + 1] = color[1]!; pixels[offset + 2] = color[2]!
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))])
}
const imagePng = landscapePng()

async function uploadedObjects(): Promise<{ count: number; objectKeys: string[] }> {
  const response = await fetch('http://127.0.0.1:7141/__test/objects')
  if (!response.ok) throw new Error(`Fake OSS object query failed (${response.status})`)
  return response.json() as Promise<{ count: number; objectKeys: string[] }>
}

async function insertFile(page: Page, kind: 'image' | 'file', file: { name: string; mimeType: string; buffer: Buffer }): Promise<void> {
  await page.getByRole('button', { name: kind === 'image' ? '图片' : '文件', exact: true }).click()
  const input = page.getByLabel(kind === 'image' ? '选择图片附件' : '选择文件附件')
  await input.setInputFiles(file)
}

async function deleteAttachment(page: Page, selector: '.attachment-image' | '.attachment-file'): Promise<void> {
  const attachment = page.locator(selector)
  await attachment.getByRole('button', { name: '附件操作' }).click()
  await attachment.getByRole('menuitem', { name: '删除' }).click()
  await attachment.getByRole('menuitem', { name: '确认删除' }).click()
}

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
  // Enable the optional toolbar through its real product surface for this insertion flow.
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('link', { name: '通用', exact: true }).click()
  await page.getByRole('switch', { name: '显示固定编辑工具栏' }).click()
  await page.getByRole('link', { name: '返回工作区', exact: true }).click()
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

    await page.setViewportSize({ width: 1440, height: 900 })
    await insertFile(page, 'image', { name: '秋日山色.png', mimeType: 'image/png', buffer: imagePng })
    await expect(page.locator('.attachment-image img')).toBeVisible()
    await expect(page.locator('.attachment-image img')).toHaveJSProperty('naturalWidth', 1200)
    await insertFile(page, 'file', { name: 'a-very-long-attachment-name-that-must-not-overflow-the-mobile-editor.txt', mimeType: 'text/plain', buffer: Buffer.from('P5.5 attachment sync proof', 'utf8') })
    await expect(page.locator('.attachment-file')).toBeVisible()
    await expect.poll(async () => (await uploadedObjects()).count).toBe(2)
    await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible({ timeout: 20_000 })
    mkdirSync(screenshotDirectory, { recursive: true })
    await page.screenshot({ path: `${screenshotDirectory}/p55-desktop.png`, fullPage: true, animations: 'disabled' })
    for (const theme of ['深色', '浅色'] as const) {
      await page.getByRole('button', { name: '设置', exact: true }).click()
      await page.getByRole('link', { name: /外观/ }).click()
      await page.getByRole('radio', { name: new RegExp(theme) }).check()
      await page.getByRole('link', { name: '返回工作区', exact: true }).click()
      for (const [label, width, height] of [['desktop', 1440, 900], ['tablet', 1024, 768], ['mobile', 390, 844]] as const) {
        await page.setViewportSize({ width, height })
        await expect(page.locator('.attachment-image img')).toHaveJSProperty('naturalWidth', 1200)
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.screenshot({ path: `${screenshotDirectory}/p56-${theme === '深色' ? 'dark' : 'light'}-${label}-attachments.png`, fullPage: true, animations: 'disabled' })
      }
      await page.setViewportSize({ width: 1440, height: 900 })
    }

    await second.reload()
    await expect(second.locator('.attachment-image img')).toBeVisible()
    await expect(second.locator('.attachment-file-name')).toHaveText('a-very-long-attachment-name-that-must-not-overflow-the-mobile-editor.txt')
    await expect.poll(() => second.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await second.screenshot({ path: `${screenshotDirectory}/p55-mobile.png`, fullPage: true, animations: 'disabled' })
    await second.setViewportSize({ width: 1024, height: 768 })
    await second.screenshot({ path: `${screenshotDirectory}/p55-tablet.png`, fullPage: true, animations: 'disabled' })

    await deleteAttachment(page, '.attachment-image')
    await expect(page.locator('.attachment-image')).toHaveCount(0)
    await expect.poll(async () => (await uploadedObjects()).count).toBe(1)
    await second.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(second.locator('.attachment-image')).toHaveCount(0, { timeout: 20_000 })

    await fetch('http://127.0.0.1:7141/__test/fail-next-delete', { method: 'POST' })
    await deleteAttachment(page, '.attachment-file')
    await expect(page.getByRole('status').filter({ hasText: '附件清理暂未完成' })).toBeVisible({ timeout: 20_000 })
    await expect.poll(async () => (await uploadedObjects()).count).toBe(1)
    await page.getByRole('button', { name: '重试清理' }).click()
    await expect.poll(async () => (await uploadedObjects()).count).toBe(0, { timeout: 20_000 })
    await second.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(second.locator('.attachment-file')).toHaveCount(0, { timeout: 20_000 })

    await insertFile(page, 'file', { name: 'page-cleanup-one.txt', mimeType: 'text/plain', buffer: Buffer.from('first page attachment') })
    await insertFile(page, 'file', { name: 'page-cleanup-two.txt', mimeType: 'text/plain', buffer: Buffer.from('second page attachment') })
    await expect.poll(async () => (await uploadedObjects()).count).toBe(2)
    await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible({ timeout: 20_000 })
    await second.reload()
    await expect(second.locator('.attachment-file')).toHaveCount(2)

    await second.setViewportSize({ width: 390, height: 844 })
    await second.getByRole('button', { name: '打开导航菜单' }).click()
    await second.getByRole('button', { name: '页面操作：无标题' }).first().click()
    await second.getByRole('menu', { name: '无标题 的操作' }).getByRole('menuitem', { name: '删除', exact: true }).click()
    await second.getByRole('button', { name: '确认删除' }).click()
    await expect(second.getByRole('status').filter({ hasText: '已同步' })).toBeVisible({ timeout: 20_000 })
    await expect.poll(async () => (await uploadedObjects()).count).toBe(0, { timeout: 20_000 })
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page.getByRole('heading', { name: '无法打开这个页面' })).toBeVisible({ timeout: 20_000 })

    // P5.6 account mutations use the real Cookie Session / Mongo transaction path.
    await page.goto('/#/settings/profile')
    await page.getByRole('textbox', { name: '昵称', exact: true }).fill('真实设置验收')
    await page.getByRole('button', { name: '保存昵称' }).click()
    await expect(page.getByRole('status').filter({ hasText: '昵称已保存' })).toBeVisible()
    await second.reload()
    await second.getByRole('button', { name: '打开导航菜单' }).click()
    await expect(second.locator('.product-user-name')).toHaveText('真实设置验收')
    await page.getByLabel('当前密码', { exact: true }).fill('incorrect-current')
    await page.getByLabel('新密码', { exact: true }).fill('P56-updated-2026!')
    await page.getByLabel('确认新密码', { exact: true }).fill('P56-updated-2026!')
    await page.getByRole('button', { name: '更新密码' }).click()
    await expect(page.getByRole('alert')).toContainText('当前密码不正确')
    await page.getByLabel('当前密码', { exact: true }).fill(password)
    await page.getByLabel('新密码', { exact: true }).fill('P56-updated-2026!')
    await page.getByLabel('确认新密码', { exact: true }).fill('P56-updated-2026!')
    await page.getByRole('button', { name: '更新密码' }).click()
    await expect(page).toHaveURL(/#\/login/)
    await expect(page.getByRole('status')).toContainText('密码已更新，请重新登录')
    expect(await page.evaluate(() => localStorage.getItem('eotion:last-authenticated-user'))).toBeNull()
    await second.reload()
    await expect(second).toHaveURL(/#\/login/)
    await page.getByLabel('邮箱', { exact: true }).fill(email)
    await page.getByLabel('密码', { exact: true }).fill(password)
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await page.getByLabel('密码', { exact: true }).fill('P56-updated-2026!')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await expect(page).toHaveURL(/#\/app/)
    await expect(page.locator('.product-user-name')).toHaveText('真实设置验收')
  } finally {
    await secondContext.close()
  }
})
