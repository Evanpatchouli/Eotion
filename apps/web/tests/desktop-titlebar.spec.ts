import { _electron as electron, expect, test, type ElectronApplication, type Page, type Route } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import type { AuthUserDto, PageResponse, WorkspaceResponse } from '@eotion/contracts'

const now = '2026-10-09T00:00:00.000Z'
const user: AuthUserDto = { id: 'titlebar-user', email: 'titlebar@example.test', displayName: 'Titlebar', createdAt: now, updatedAt: now }
const workspace: WorkspaceResponse = { id: 'titlebar-workspace', name: '桌面窗口验收', ownerId: user.id, createdAt: now, updatedAt: now }
const preparedPage: PageResponse = {
  id: 'titlebar-page', workspaceId: workspace.id, parentPageId: null,
  title: '窗口标题栏回归', orderKey: '0000000000000001', createdAt: now, updatedAt: now,
}

async function mockProductApi(page: Page, auth: 'signed-in' | 'signed-out' | 'unavailable' = 'signed-in', requests?: string[]): Promise<void> {
  await page.route('**/api/**', async (route: Route) => {
    const path = new URL(route.request().url()).pathname
    requests?.push(`${route.request().method()} ${path}`)
    const body = path === '/api/auth/me' ? auth === 'signed-in' ? user
      : auth === 'signed-out' ? { statusCode: 401, message: 'Unauthorized' }
        : { statusCode: 503, message: 'Service unavailable' }
      : path === '/api/workspaces' ? [workspace]
        : path === `/api/sync/workspaces/${workspace.id}/snapshot` ? { pages: [preparedPage], blocks: [] }
          : { statusCode: 404, message: 'Not found' }
    await route.fulfill({ status: 'statusCode' in body ? body.statusCode : 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
}

async function openProductShell(page: Page): Promise<void> {
  await mockProductApi(page)
  await page.goto('http://127.0.0.1:7173/#/app/titlebar-workspace/page/titlebar-page')
  await expect(page.locator('.product-shell')).toHaveAttribute('data-runtime', /^(web|electron)$/)
  await expect(page.locator('.breadcrumb')).toContainText(preparedPage.title)
  await expect(page.locator('.product-sync-status')).toContainText('已同步')
}

async function getShellGeometry(page: Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector)
      if (!element) throw new Error(`Missing ${selector}`)
      const { x, y, width, height } = element.getBoundingClientRect()
      return { x, y, width, height }
    }
    const overlay = (navigator as Navigator & { windowControlsOverlay?: { visible: boolean; getTitlebarAreaRect(): DOMRect } }).windowControlsOverlay
    const overlayRect = overlay?.getTitlebarAreaRect()
    return {
      runtime: document.querySelector('.product-shell')?.getAttribute('data-runtime'),
      overlayVisible: overlay?.visible ?? false,
      overlay: overlayRect ? { x: overlayRect.x, y: overlayRect.y, width: overlayRect.width, height: overlayRect.height } : null,
      topbar: document.querySelector('.product-topbar') ? rect('.product-topbar') : rect('.desktop-fallback-titlebar'),
      breadcrumb: document.querySelector('.product-topbar .breadcrumb') ? rect('.product-topbar .breadcrumb') : null,
      sync: document.querySelector('.product-topbar .product-sync-status') ? rect('.product-topbar .product-sync-status') : null,
    }
  })
}

test('browser product shell keeps the normal 44px topbar without an Electron overlay', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openProductShell(page)

  const geometry = await getShellGeometry(page)
  expect(geometry.runtime).toBe('web')
  expect(geometry.overlayVisible).toBe(false)
  expect(geometry.topbar).toMatchObject({ y: 0, height: 44 })
  expect(await page.locator('.product-topbar').evaluate(element => getComputedStyle(element).paddingTop)).toBe('0px')
  expect(await page.locator('.product-topbar').evaluate(element => getComputedStyle(element).paddingLeft)).toBe('14px')
  expect(await page.locator('.product-topbar').evaluate(element => getComputedStyle(element).getPropertyValue('-webkit-app-region'))).not.toBe('drag')

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.product-shell')).toHaveAttribute('data-layout', 'mobile')
  await page.getByRole('button', { name: '打开导航菜单' }).click()
  await expect(page.locator('.product-sidebar')).toHaveClass(/sidebar--open/)
})

test('Electron titlebar overlay follows the topbar through window states and themes', async () => {
  const profile = mkdtempSync(resolve(tmpdir(), 'eotion-titlebar-'))
  const executable = process.platform === 'win32' ? 'electron.exe'
    : process.platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : 'electron'
  const appPath = resolve('../desktop/out/main/index.js')
  let app: ElectronApplication | undefined
  try {
    app = await electron.launch({
      executablePath: resolve('../desktop/node_modules/electron/dist', executable),
      args: [appPath, `--user-data-dir=${profile}`],
      env: { ...process.env, ELECTRON_RENDERER_URL: 'http://127.0.0.1:7173/#/login' },
    })
    const page = await app.firstWindow()
    await openProductShell(page)
    await expect(page.locator('.product-shell')).toHaveAttribute('data-runtime', 'electron')

    const capabilities = await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]!
      return { resizable: window.isResizable(), minimizable: window.isMinimizable(), maximizable: window.isMaximizable(), closable: window.isClosable() }
    })
    expect(capabilities).toEqual({ resizable: true, minimizable: true, maximizable: true, closable: true })

    const assertOverlayGeometry = async () => {
      await expect.poll(async () => (await getShellGeometry(page)).overlayVisible).toBe(true)
      const geometry = await getShellGeometry(page)
      expect(geometry.topbar).toMatchObject({ y: 0, height: 44 })
      expect(geometry.overlay).toMatchObject({ y: 0, height: 44 })
      for (const item of [geometry.breadcrumb, geometry.sync].filter((item): item is NonNullable<typeof item> => item !== null)) {
        expect(item.y).toBeGreaterThanOrEqual(geometry.overlay!.y)
        expect(item.y + item.height).toBeLessThanOrEqual(geometry.overlay!.y + geometry.overlay!.height)
        expect(item.x).toBeGreaterThanOrEqual(geometry.overlay!.x)
        expect(item.x + item.width).toBeLessThanOrEqual(geometry.overlay!.x + geometry.overlay!.width)
      }
    }
    const assertDragRegions = async () => {
      const regions = await page.evaluate(() => {
        const value = (selector: string) => {
          const element = document.querySelector(selector)
          return element ? getComputedStyle(element).getPropertyValue('-webkit-app-region').trim() : null
        }
        return {
          topbar: value('.product-topbar'),
          brand: value('.product-sidebar .brand-row'),
          button: value('.product-sidebar-collapse'),
          sync: value('.product-sync-status'),
        }
      })
      expect(regions).toEqual({ topbar: 'drag', brand: 'drag', button: 'no-drag', sync: 'no-drag' })
    }

    await assertOverlayGeometry()
    await assertDragRegions()

    await page.locator('.product-sidebar-collapse').click()
    await expect(page.locator('.product-shell')).toHaveClass(/product-shell--sidebar-collapsed/)
    await page.locator('.product-sidebar-reopen').click()
    await expect(page.locator('.product-shell')).not.toHaveClass(/product-shell--sidebar-collapsed/)

    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => localStorage.setItem('eotion:theme', value), theme)
      await page.reload()
      await mockProductApi(page)
      await page.goto('http://127.0.0.1:7173/#/app/titlebar-workspace/page/titlebar-page')
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await expect(page.locator('.product-sync-status')).toContainText('已同步')
      await assertOverlayGeometry()
    }

    for (const state of ['maximized', 'restored'] as const) {
      await app.evaluate(({ BrowserWindow }, state) => {
        const window = BrowserWindow.getAllWindows()[0]!
        if (state === 'maximized') window.maximize()
        else window.unmaximize()
      }, state)
      if (state === 'maximized') await expect.poll(() => app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isMaximized())).toBe(true)
      else await expect.poll(() => app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isMaximized())).toBe(false)
      await assertOverlayGeometry()
    }

    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setBounds({ x: 50, y: 50, width: 390, height: 844 }))
    await expect(page.locator('.product-shell')).toHaveAttribute('data-layout', 'mobile')
    await assertOverlayGeometry()
    await page.getByRole('button', { name: '打开导航菜单' }).click()
    await expect(page.locator('.product-sidebar')).toHaveClass(/sidebar--open/)
    await page.getByRole('button', { name: '关闭导航菜单' }).click()
    await expect(page.locator('.product-sidebar')).not.toHaveClass(/sidebar--open/)

    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.minimize())
    await expect.poll(() => app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isMinimized())).toBe(true)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.restore())
    await expect.poll(() => app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isMinimized())).toBe(false)
    await assertOverlayGeometry()

    // A genuinely signed-out session can enter either auth route with the native titlebar overlay intact.
    const authRequests: string[] = []
    await page.unrouteAll({ behavior: 'wait' })
    await mockProductApi(page, 'signed-out', authRequests)
    await page.evaluate(() => localStorage.removeItem('eotion:last-authenticated-user'))
    await page.reload()
    await page.goto('http://127.0.0.1:7173/#/login')
    expect(authRequests).toContain('GET /api/auth/me')
    await expect(page.getByRole('heading', { name: '登录 Eotion' })).toBeVisible()
    await expect.poll(async () => (await getShellGeometry(page)).overlayVisible).toBe(true)
    await expect(page.locator('.desktop-fallback-titlebar')).toHaveCSS('height', '44px')
    await expect(page.locator('.desktop-fallback-titlebar')).toHaveCSS('-webkit-app-region', 'drag')
    const loginCard = await page.locator('.product-login-card').boundingBox()
    expect(loginCard?.y).toBeGreaterThanOrEqual(44)
    await page.goto('http://127.0.0.1:7173/#/register')
    await expect(page.getByRole('heading', { name: '注册 Eotion' })).toBeVisible()
    await expect(page.locator('.desktop-fallback-titlebar')).toHaveCSS('height', '44px')
    const registerCard = await page.locator('.product-login-card').boundingBox()
    expect(registerCard?.y).toBeGreaterThanOrEqual(44)

    // A service restore error stays visible on the login route and does not break the register fallback.
    await page.unrouteAll({ behavior: 'wait' })
    await mockProductApi(page, 'unavailable')
    await page.reload()
    await expect(page.getByRole('heading', { name: '暂时无法连接 Eotion' })).toBeVisible()
    await expect(page.locator('.app-viewport')).toHaveAttribute('data-route', 'register')
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.locator('.desktop-fallback-titlebar')).toHaveCSS('height', '44px')
    await expect.poll(async () => (await getShellGeometry(page)).overlayVisible).toBe(true)
    await page.evaluate(() => { window.location.hash = '#/login' })
    await expect(page.locator('.app-viewport')).toHaveAttribute('data-route', 'login')
    await expect(page.getByRole('heading', { name: '暂时无法连接 Eotion' })).toBeVisible()
    await page.evaluate(() => { window.location.hash = '#/register' })
    await expect(page.locator('.app-viewport')).toHaveAttribute('data-route', 'register')
    await expect(page.getByRole('heading', { name: '暂时无法连接 Eotion' })).toBeVisible()

    // The outer fallback titlebar reserves native controls above the existing settings header.
    await page.unrouteAll({ behavior: 'wait' })
    await mockProductApi(page, 'signed-in')
    await page.reload()
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setBounds({ x: 50, y: 50, width: 1380, height: 900 }))
    await page.getByRole('button', { name: '设置' }).click()
    await page.getByRole('link', { name: '外观' }).click()
    await expect(page.getByRole('heading', { name: '外观', level: 1 })).toBeVisible()
    const settingsGeometry = await page.evaluate(() => {
      const fallback = document.querySelector('.desktop-fallback-titlebar')!
      const fallbackRect = fallback.getBoundingClientRect()
      const header = document.querySelector('.settings-topbar')!.getBoundingClientRect()
      const overlay = (navigator as Navigator & { windowControlsOverlay?: { getTitlebarAreaRect(): DOMRect } }).windowControlsOverlay!.getTitlebarAreaRect()
      const drag = getComputedStyle(fallback).getPropertyValue('-webkit-app-region').trim()
      const padding = getComputedStyle(fallback)
      const exit = document.querySelector('.settings-exit')!.getBoundingClientRect()
      const title = document.querySelector('.settings-topbar-title')!.getBoundingClientRect()
      return {
        fallback: { y: fallbackRect.y, height: fallbackRect.height, paddingLeft: parseFloat(padding.paddingLeft), paddingRight: parseFloat(padding.paddingRight) },
        header: { y: header.y, height: header.height },
        overlay: { x: overlay.x, y: overlay.y, width: overlay.width, height: overlay.height },
        drag,
        settingsChildren: [exit, title].map(rect => ({ x: rect.x, width: rect.width })),
      }
    })
    expect(settingsGeometry.fallback).toMatchObject({ y: 0, height: 44 })
    expect(settingsGeometry.fallback.paddingLeft).toBeGreaterThanOrEqual(14)
    expect(settingsGeometry.fallback.paddingRight).toBeGreaterThanOrEqual(14)
    expect(settingsGeometry.header).toMatchObject({ y: 44, height: 64 })
    expect(settingsGeometry.overlay).toMatchObject({ y: 0, height: 44 })
    expect(settingsGeometry.drag).toBe('drag')
    for (const item of settingsGeometry.settingsChildren) {
      expect(item.x).toBeGreaterThanOrEqual(0)
      expect(item.x + item.width).toBeLessThanOrEqual(1380)
    }

    await page.getByRole('radio', { name: '深色' }).check()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.minimize())
    await expect.poll(() => app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isMinimized())).toBe(true)
    await page.evaluate(() => document.querySelector<HTMLInputElement>('input[name="theme"][value="light"]')!.click())
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.waitForTimeout(500)
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isMinimized())).toBe(true)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.restore())
    await expect.poll(() => app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isMinimized())).toBe(false)
    await assertOverlayGeometry()

    // Long offline/error copy must remain inside the topbar at the minimum supported width.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setBounds({ x: 50, y: 50, width: 390, height: 844 }))
    await page.evaluate(() => { window.location.hash = '#/app/titlebar-workspace/page/titlebar-page' })
    await expect(page.locator('.product-shell')).toHaveAttribute('data-layout', 'mobile')
    await expect(page.locator('.product-sync-status')).toBeVisible()
    const narrowStatus = await page.evaluate(() => {
      const status = document.querySelector('.product-sync-status')!
      status.setAttribute('data-state', 'error')
      const retry = document.createElement('button')
      retry.className = 'product-text-button product-sync-action'
      retry.textContent = '同步失败 · 本地内容已保存 · 连接服务器时遇到错误，请检查网络连接后重试'
      status.replaceChildren(retry)
      const bounds = status.getBoundingClientRect()
      const overlay = (navigator as Navigator & { windowControlsOverlay: { getTitlebarAreaRect(): DOMRect } }).windowControlsOverlay.getTitlebarAreaRect()
      return { left: bounds.left, right: bounds.right, safeRight: overlay.right, width: innerWidth, scrollWidth: document.documentElement.scrollWidth }
    })
    expect(narrowStatus.left).toBeGreaterThanOrEqual(0)
    expect(narrowStatus.right).toBeLessThanOrEqual(narrowStatus.safeRight)
    expect(narrowStatus.scrollWidth).toBeLessThanOrEqual(narrowStatus.width)
  } finally {
    await app?.close()
    rmSync(profile, { recursive: true, force: true })
  }
})
