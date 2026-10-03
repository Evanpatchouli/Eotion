import { expect, test, type Page, type Route } from '@playwright/test'
import type { AuthUserDto, BlockResponse, PageResponse, WorkspaceResponse } from '@eotion/contracts'

const now = '2026-10-01T12:00:00.000Z'
const user: AuthUserDto = {
  id: 'visual-ava', email: 'ava@example.com', displayName: 'Ava', createdAt: now, updatedAt: now,
}
const workspace: WorkspaceResponse = {
  id: 'visual-ws', name: 'Quiet Studio', ownerId: user.id, createdAt: now, updatedAt: now,
}
const pageRecord: PageResponse = {
  id: 'visual-page', workspaceId: workspace.id, parentPageId: null, title: '今日记录',
  orderKey: '0000000000000001', createdAt: now, updatedAt: now,
}
const blocks: BlockResponse[] = [
  {
    id: 'visual-heading', workspaceId: workspace.id, pageId: pageRecord.id, parentBlockId: null,
    type: 'heading', orderKey: '0000000000000001', createdAt: now, updatedAt: now,
    props: { node: { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '留一处安静的空间' }] } },
  },
  {
    id: 'visual-paragraph', workspaceId: workspace.id, pageId: pageRecord.id, parentBlockId: null,
    type: 'paragraph', orderKey: '0000000000000002', createdAt: now, updatedAt: now,
    props: { node: { type: 'paragraph', content: [{ type: 'text', text: '记录今天值得记住的事情。固定内容让每次截图都能直接比较。' }] } },
  },
]

async function installApi(page: Page, unavailable = false) {
  await page.route('**/api/**', async (route: Route) => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    const json = (status: number, body: unknown) => route.fulfill({
      status, contentType: 'application/json', body: JSON.stringify(body),
    })
    if (unavailable && path === '/api/auth/me' && method === 'GET') {
      return json(503, { statusCode: 503, message: 'Session unavailable', error: 'Service Unavailable' })
    }
    if (path === '/api/auth/me' && method === 'GET') return json(200, user)
    if (path === '/api/workspaces' && method === 'GET') return json(200, [workspace])
    if (path === `/api/sync/workspaces/${workspace.id}/snapshot` && method === 'GET') {
      return json(200, { pages: [pageRecord], blocks })
    }
    if (path === '/api/sync/operations' && method === 'POST') {
      const body = route.request().postDataJSON() as { id?: string }
      return json(200, { id: body.id ?? 'visual-operation', status: 'applied' })
    }
    return json(404, { statusCode: 404, message: 'Not found', error: 'Not Found' })
  })
}

async function openPage(page: Page, options: { width: number; height: number; theme?: 'light' | 'dark'; touch?: boolean }) {
  await page.clock.install({ time: new Date(now) })
  await page.setViewportSize({ width: options.width, height: options.height })
  await page.emulateMedia({ colorScheme: options.theme ?? 'light', reducedMotion: 'reduce' })
  await page.addInitScript((theme) => {
    localStorage.setItem('eotion:theme', theme)
  }, options.theme ?? 'light')
  await installApi(page)
  const visualVariant = `${options.width}-${options.height}-${options.theme ?? 'light'}-${options.touch ? 'touch' : 'mouse'}`
  await page.goto(`/?visual=${visualVariant}#/app/${workspace.id}/page/${pageRecord.id}`)
  await expect(page.locator('.eotion-editor-content .tiptap')).toContainText('记录今天值得记住的事情。')
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
}

async function openSettings(page: Page, options: { width: number; height: number; path: string }) {
  await page.clock.install({ time: new Date(now) })
  await page.setViewportSize({ width: options.width, height: options.height })
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.addInitScript(() => localStorage.setItem('eotion:theme', 'light'))
  await installApi(page)
  await page.goto(`/?visual=settings-${options.width}#/settings/${options.path}?returnTo=${encodeURIComponent(`/app/${workspace.id}/page/${pageRecord.id}`)}&workspaceId=${workspace.id}`)
  await expect(page.getByRole('heading', { name: '账号资料' })).toBeVisible()
  await expect(page.locator('.settings-topbar')).toHaveCount(1)
}

async function capture(page: Page, name: string) {
  await page.evaluate(async () => document.fonts.ready)
  await expect(page).toHaveScreenshot(name)
}

test('Page desktop light', async ({ page }) => {
  await openPage(page, { width: 1440, height: 900 })
  await capture(page, 'page-desktop-light.png')
})

test('Page desktop dark', async ({ page }) => {
  await openPage(page, { width: 1440, height: 900, theme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await capture(page, 'page-desktop-dark.png')
})

test('Page tablet light', async ({ page }) => {
  await openPage(page, { width: 1024, height: 900 })
  await expect(page.locator('.product-shell')).toHaveAttribute('data-layout', 'tablet')
  await capture(page, 'page-tablet-light.png')
})

test.describe('mobile touch context', () => {
  test.use({ hasTouch: true, isMobile: true })

  test('Page mobile light', async ({ page }) => {
    await openPage(page, { width: 390, height: 844, touch: true })
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
    await expect(page.getByRole('toolbar', { name: '触摸编辑工具栏' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await capture(page, 'page-mobile-light.png')
  })
})

test('Settings desktop light', async ({ page }) => {
  await openSettings(page, { width: 1440, height: 900, path: '' })
  await capture(page, 'settings-desktop-light.png')
})

test('Settings profile detail mobile light', async ({ page }) => {
  await openSettings(page, { width: 390, height: 844, path: 'profile' })
  await expect(page.locator('.settings-compact-back')).toHaveCount(0)
  const geometry = await page.locator('.settings-page').evaluate((element) => ({
    gutter: getComputedStyle(element).paddingLeft,
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }))
  expect(geometry.gutter).toBe('30px')
  expect(geometry.content).toBeLessThanOrEqual(geometry.viewport)
  await capture(page, 'settings-profile-mobile-light.png')
})

test('Connectivity backend unavailable desktop', async ({ page }) => {
  await page.clock.install({ time: new Date(now) })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await installApi(page, true)
  await page.goto('/?visual=connectivity#/app')
  await expect(page.getByRole('heading', { name: '暂时无法连接 Eotion' })).toBeVisible()
  await expect(page.getByText('无法验证登录状态，请检查服务或网络后重试')).toBeVisible()
  await capture(page, 'connectivity-backend-unavailable-desktop.png')
})
