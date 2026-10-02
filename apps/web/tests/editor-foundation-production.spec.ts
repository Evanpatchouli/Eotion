import { expect, test } from '@playwright/test'

// Run with playwright.editor-production.config.ts against the real production bundle.
test('production excludes the editor validation route and its lazy assets', async ({ page }) => {
  test.skip(!process.env.EOTION_EDITOR_PRODUCTION, 'Requires the production preview config')
  const demoRequests: string[] = []
  page.on('request', request => {
    if (/EditorFoundationDemoView|DocumentEditor/.test(request.url())) demoRequests.push(request.url())
  })
  await page.route('**/api/auth/me', route => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' }),
  }))
  await page.goto('/#/__dev/editor-foundation')
  await expect(page).toHaveURL(/#\/login/)
  await expect(page.getByRole('heading', { name: '登录 Eotion' })).toBeVisible()
  await expect(page.locator('.document-editor')).toHaveCount(0)
  expect(demoRequests).toEqual([])
})
