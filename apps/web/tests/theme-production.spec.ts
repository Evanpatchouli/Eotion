import { expect, test } from '@playwright/test'

test('production HTML applies saved dark theme before its bundled entry runs', async ({ page }) => {
  test.skip(!process.env.EOTION_THEME_PRODUCTION, 'Requires the production preview config')

  await page.addInitScript(() => localStorage.setItem('eotion:theme', 'dark'))
  let blockedEntries = 0
  await page.route('**/assets/*.js', async (route) => {
    blockedEntries += 1
    await route.abort()
  })
  await page.goto('/')

  await expect.poll(() => blockedEntries).toBeGreaterThan(0)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.locator('html').evaluate((element) => element.style.colorScheme)).toBe('dark')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#242424')
  expect(await page.locator('html').evaluate((element) => getComputedStyle(element).getPropertyValue('--surface').trim())).toBe('#242424')
  expect(await page.locator('html').evaluate((element) => getComputedStyle(element).getPropertyValue('--e-color-canvas').trim().toUpperCase())).toBe('#1C1B1A')
  expect(await page.locator('html').evaluate((element) => getComputedStyle(element).getPropertyValue('--e-color-text-primary').trim().toUpperCase())).toBe('#EDECE8')
  await expect(page.locator('#app')).toBeEmpty()
})

test('production HTML resolves system light tokens without the bundled entry', async ({ page }) => {
  test.skip(!process.env.EOTION_THEME_PRODUCTION, 'Requires the production preview config')

  await page.emulateMedia({ colorScheme: 'light' })
  await page.addInitScript(() => localStorage.setItem('eotion:theme', 'system'))
  await page.route('**/assets/*.js', (route) => route.abort())
  await page.goto('/')

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(await page.locator('html').evaluate((element) => getComputedStyle(element).getPropertyValue('--e-color-canvas').trim().toUpperCase())).toBe('#FAF9F6')
  expect(await page.locator('html').evaluate((element) => getComputedStyle(element).getPropertyValue('--e-color-text-primary').trim().toUpperCase())).toBe('#1F1F1E')
  await expect(page.locator('#app')).toBeEmpty()
})
