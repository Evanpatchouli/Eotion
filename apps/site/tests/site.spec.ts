import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import rootManifest from '../../../package.json' with { type: 'json' }

async function chooseAppearance(page: import('@playwright/test').Page, value: 'auto' | 'light' | 'dark', label: string) {
  const trigger = page.getByRole('combobox', { name: '网站外观' })
  await trigger.click()
  await page.getByRole('option', { name: label }).click()
  await expect(trigger).toHaveAttribute('data-value', value)
}

const pages = ['/', '/download', '/guide/', '/guide/editor', '/guide/database', '/guide/mcp', '/changelog']
test('static pages, navigation, release and safe download state', async ({ page, request }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  for (const path of pages) {
    const response = await page.goto(path)
    expect(response?.ok()).toBeTruthy()
    await expect(page.locator('h1')).toBeVisible()
    await expect(page).toHaveTitle(/Eotion/)
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  }
  await page.goto('/')
  await expect(page.locator('.site-home section')).toHaveCount(8)
  await expect(page.locator('.database-section').getByRole('heading', { name: /结构化资料/ })).toBeVisible()
  await expect(page.locator('.database-section').getByRole('link', { name: /了解数据库/ })).toHaveAttribute('href', '/guide/database')
  await expect(page.locator('.database-section')).toContainText('当前公开版本提供 Table View')
  await expect(page.locator('.database-section .shot-light img')).toHaveAttribute('src', '/screenshots/database-table.webp')
  await expect(page.locator('.database-section .shot-dark img')).toHaveAttribute('src', '/screenshots/database-table-dark.webp')
  await expect(page.locator('.mcp-section').getByRole('heading', { name: '为 AI 而生的 MCP' })).toBeVisible()
  await expect(page.locator('.mcp-section').getByRole('link', { name: /连接你的 AI 客户端/ })).toHaveAttribute('href', '/guide/mcp')
  await page.locator('.site-hero').getByRole('link', { name: /下载|免费下载/ }).click()
  await expect(page).toHaveURL(/\/download/)
  await expect(page.getByRole('heading', { name: 'Eotion for Windows' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Eotion for Android' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Eotion for iOS' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Eotion for HarmonyOS' })).toBeVisible()
  await expect(page.locator('.release-label')).toContainText(`Version ${rootManifest.version} · Build ${rootManifest.eotion.buildNumber}`)
  await expect(page.getByRole('link', { name: '打开 Eotion Web' })).toHaveAttribute('href', 'https://eotion.evanpatchouli.space')
  const installerUrl = process.env.EOTION_DOWNLOAD_WINDOWS_INSTALLER_URL
  if (installerUrl) {
    const version = new URL(installerUrl).pathname.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?/)?.[0]
    if (version) await expect(page.locator('#windows').getByRole('link', { name: /下载安装版/ })).toContainText(`v${version}`)
  }
  // Unconfigured artifacts must never become guessed download links.
  if (!process.env.EOTION_DOWNLOAD_WINDOWS_INSTALLER_URL) {
    await expect(page.locator('#windows').getByRole('link', { name: '下载安装版' })).toHaveCount(0)
    await expect(page.locator('#windows')).toContainText('暂未提供下载')
  }
  const raw = await request.get('/guide/editor')
  expect(await raw.text()).toContain('可用内容格式')
  const databaseGuide = await request.get('/guide/database')
  expect(await databaseGuide.text()).toContain('当前只提供 Table View')
  expect(errors).toEqual([])
})

test('native guide sidebar, TOC, search and document navigation', async ({ page }) => {
  await page.goto('/guide/editor')
  await expect(page.locator('.VPSidebar')).toBeVisible()
  await expect(page.locator('.VPDocAside')).toBeVisible()
  await expect(page.locator('.VPSidebar').getByRole('link', { name: '快速开始' })).toBeVisible()
  await expect(page.locator('.VPDocFooter').getByRole('link')).toHaveCount(2)
  await page.getByRole('button', { name: '搜索用户指南' }).click()
  await page.locator('#localsearch-input').fill('离线')
  await expect(page.locator('.VPLocalSearchBox .result').first()).toBeVisible()
  await page.keyboard.press('Escape')
  await page.locator('.VPSidebar').getByRole('link', { name: '图片与文件' }).click()
  await expect(page).toHaveURL(/\/guide\/attachments/)
  await expect(page.locator('h1')).toContainText('图片与文件')
})

test('three appearance modes persist and follow system', async ({ page }) => {
  await page.goto('/')
  const select = page.getByRole('combobox', { name: '网站外观' })
  await chooseAppearance(page, 'dark', '深色')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.locator('.database-section .shot-dark')).toBeVisible()
  await expect(page.locator('.database-section .shot-light')).toBeHidden()

  await page.reload()
  await expect(select).toHaveAttribute('data-value', 'dark')
  await expect(page.locator('html')).toHaveClass(/dark/)

  await chooseAppearance(page, 'light', '浅色')
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await expect(page.locator('.database-section .shot-light')).toBeVisible()

  await page.emulateMedia({ colorScheme: 'dark' })
  await chooseAppearance(page, 'auto', '跟随系统')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('vitepress-theme-appearance'))).toBe('auto')

  await page.reload()
  await expect(select).toHaveAttribute('data-value', 'auto')
  await select.focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('listbox', { name: '网站外观' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('listbox', { name: '网站外观' })).toHaveCount(0)

  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveClass(/dark/)
})

test('platform detection only recommends and leaves all platforms visible', async ({ browser }) => {
  for (const [agent, expected] of [
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'windows'],
    ['Mozilla/5.0 (Linux; Android 12)', 'android'],
    ['Mozilla/5.0 (Linux; Android 12; HarmonyOS)', null],
  ] as const) {
    const context = await browser.newContext({ userAgent: agent })
    const page = await context.newPage()
    await page.goto('http://127.0.0.1:4174/download')
    await expect(page.locator('.download-row')).toHaveCount(5)
    if (expected) await expect(page.locator(`#${expected} .recommendation`)).toBeVisible()
    else await expect(page.locator('.recommendation')).toHaveCount(0)
    await context.close()
  }
})

for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
  test(`responsive navigation and images ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    for (const path of pages) {
      await page.goto(path)
      await expect(page.locator('h1')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
      await page.evaluate(async () => {
        await document.fonts.ready
        const images = Array.from(document.images).filter((img) => img.closest('picture')?.className !== 'shot-dark')
        images.forEach((img) => { img.loading = 'eager' })
        await Promise.all(images.map((img) => img.decode().catch(() => {})))
      })
      for (const img of await page.locator('.product-shot img:visible').all()) {
        expect(await img.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
      }
      if (process.env.EOTION_SITE_QA_DIR) {
        const output = resolve(process.env.EOTION_SITE_QA_DIR)
        await mkdir(output, { recursive: true })
        await page.screenshot({ path: resolve(output, `${path === '/' ? 'home' : path.replaceAll('/', '-')}-${viewport.width}.png`), fullPage: true })
        if (path === '/') await page.screenshot({ path: resolve(output, `home-${viewport.width}-viewport.png`) })
      }
    }
    if (viewport.width === 390) {
      await page.goto('/')
      await page.getByRole('button', { name: 'mobile navigation' }).click()
      await page.locator('.VPNavScreen').getByRole('link', { name: '用户指南' }).click()
      await expect(page).toHaveURL(/\/guide\//)
      await page.locator('.VPLocalNav').getByRole('button', { name: '目录', exact: true }).click()
      await expect(page.locator('.VPSidebar')).toBeVisible()
      await page.locator('.VPSidebar').getByRole('link', { name: '编辑器', exact: true }).click()
      await expect(page).toHaveURL(/\/guide\/editor/)
    }
    await page.goto('/')
    await chooseAppearance(page, 'dark', '深色')
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.locator('.hero-shot img:visible').evaluate((element) => (element as HTMLImageElement).decode())
    if (process.env.EOTION_SITE_QA_DIR) {
      await page.screenshot({ path: resolve(process.env.EOTION_SITE_QA_DIR, `home-${viewport.width}-dark.png`) })
      await page.goto('/guide/editor')
      await page.screenshot({ path: resolve(process.env.EOTION_SITE_QA_DIR, `guide-editor-${viewport.width}-dark.png`) })
    }
    expect(errors).toEqual([])
  })
}
