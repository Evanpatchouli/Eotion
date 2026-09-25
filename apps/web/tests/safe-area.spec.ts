import { expect, test } from '@playwright/test'

test('desktop keeps the workspace flush with a zero-inset viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')

  const shell = await page.locator('.app-viewport').boundingBox()
  const workspace = await page.locator('.workspace-shell').boundingBox()
  expect(shell).not.toBeNull()
  expect(workspace).not.toBeNull()
  expect(workspace!.y).toBe(shell!.y)
  expect(workspace!.height).toBe(shell!.height)
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(900)
})

test('mobile shell, drawer, and editor controls respect all four insets', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.addStyleTag({ content: ':root { --safe-top: 47px; --safe-right: 12px; --safe-bottom: 34px; --safe-left: 12px; }' })

  const app = await page.locator('.app-viewport').boundingBox()
  const header = await page.locator('.topbar').boundingBox()
  const document = await page.locator('.document-wrap').boundingBox()
  expect(app).not.toBeNull()
  expect(header).not.toBeNull()
  expect(document).not.toBeNull()
  expect(header!.x).toBe(12)
  expect(header!.y).toBe(47)
  expect(header!.x + header!.width).toBe(378)
  expect(document!.y + document!.height).toBe(810)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(844)

  await page.locator('.mobile-menu').click()
  await expect.poll(async () => (await page.locator('.sidebar').boundingBox())?.x).toBe(12)
  const drawer = await page.locator('.sidebar').boundingBox()
  expect(drawer!.x).toBe(12)
  expect(drawer!.y).toBe(47)
  expect(drawer!.y + drawer!.height).toBe(810)

  await page.goto('/#/__dev/editor-p2')
  await page.addStyleTag({ content: ':root { --safe-top: 47px; --safe-right: 12px; --safe-bottom: 34px; --safe-left: 12px; }' })
  const toolbarButton = await page.locator('.p2-touch-toolbar button').first().boundingBox()
  expect(toolbarButton!.y + toolbarButton!.height).toBeLessThanOrEqual(810)

  await page.goto('/#/__dev/mobile-p1')
  await page.addStyleTag({ content: ':root { --safe-top: 47px; --safe-right: 12px; --safe-bottom: 34px; --safe-left: 12px; }' })
  await page.evaluate(() => window.dispatchEvent(new Event('resize')))
  await expect(page.getByLabel('Safe Area 调试信息')).toContainText('safe T/R/B/L: 47 / 12 / 34 / 12 px')
  expect(await page.locator('.app-viewport').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(247, 247, 244)')
  expect(await page.locator('.app-viewport').evaluate((element) => getComputedStyle(element, '::before').backgroundColor)).toBe('rgb(233, 237, 223)')

  await page.setViewportSize({ width: 844, height: 390 })
  await expect(page.getByLabel('Safe Area 调试信息')).toContainText('viewport: 844 × 390')
})
