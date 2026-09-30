import { expect, test } from '@playwright/test'

test('applies a saved dark preference before the Vue entry loads', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('eotion:theme', 'dark'))
  await page.route('**/src/main.ts', (route) => route.abort())
  await page.goto('/')

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.locator('html').evaluate((element) => element.style.colorScheme)).toBe('dark')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#242622')
})

test('system follows live changes and explicit preference persists', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.locator('html').evaluate((element) => getComputedStyle(element).getPropertyValue('--surface').trim())).toBe('#242622')

  await page.evaluate(async () => {
    const { setThemePreference } = await import('/src/theme.ts')
    setThemePreference('light')
  })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.emulateMedia({ colorScheme: 'light' })
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(await page.evaluate(() => localStorage.getItem('eotion:theme'))).toBe('light')
})
