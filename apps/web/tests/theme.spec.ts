import { expect, test } from '@playwright/test'

test('falls back from an invalid stored preference to system', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.addInitScript(() => localStorage.setItem('eotion:theme', 'invalid'))
  await page.goto('/')

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.evaluate(async () => (await import('/src/theme.ts')).themePreference.value)).toBe('system')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('system follows changes, explicit dark ignores them, and switching back resumes following', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.locator('html').evaluate((element) => getComputedStyle(element).getPropertyValue('--surface').trim())).toBe('#242622')

  await page.evaluate(async () => {
    const { setThemePreference } = await import('/src/theme.ts')
    setThemePreference('dark')
  })
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.evaluate(async () => (await import('/src/theme.ts')).setThemePreference('system'))
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.evaluate(async () => (await import('/src/theme.ts')).setThemePreference('light'))
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(await page.evaluate(() => localStorage.getItem('eotion:theme'))).toBe('light')
})

test('logout and another login keep the device theme', async ({ page }) => {
  const user = {
    id: 'theme-user', email: 'theme@example.com', displayName: 'Theme user',
    createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T00:00:00.000Z',
  }
  let session = false
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    if (path === '/api/auth/me' && method === 'GET') {
      return route.fulfill({ status: session ? 200 : 401, contentType: 'application/json', body: JSON.stringify(session ? user : { statusCode: 401, message: 'Unauthorized' }) })
    }
    if (path === '/api/auth/login' && method === 'POST') {
      session = true
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user, expiresAt: '2027-09-30T00:00:00.000Z' }) })
    }
    if (path === '/api/auth/logout' && method === 'POST') {
      session = false
      return route.fulfill({ status: 204 })
    }
    if (path === '/api/workspaces' && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ statusCode: 404, message: 'Not found' }) })
  })

  await page.goto('/#/login')
  await page.evaluate(async () => (await import('/src/theme.ts')).setThemePreference('dark'))
  const login = async () => {
    await page.getByLabel('邮箱').fill('theme@example.com')
    await page.getByLabel('密码').fill('theme-password')
    await page.getByRole('button', { name: '登录' }).click()
    await expect(page).toHaveURL(/#\/app/)
  }

  await login()
  await page.getByRole('button', { name: '退出登录' }).click()
  await expect(page).toHaveURL(/#\/login$/)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await login()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.evaluate(() => localStorage.getItem('eotion:theme'))).toBe('dark')
})
