import { expect, test, type Page, type Route } from '@playwright/test'
import type { AuthUserDto, PageResponse, WorkspaceResponse } from '@eotion/contracts'

const now = '2026-09-30T00:00:00.000Z'
const later = '2027-09-30T00:00:00.000Z'
const ava: AuthUserDto = { id: 'settings-ava', email: 'ava@example.com', displayName: 'Ava', createdAt: now, updatedAt: now }
const ben: AuthUserDto = { id: 'settings-ben', email: 'ben@example.com', displayName: 'Ben', createdAt: now, updatedAt: now }
const wsA: WorkspaceResponse = { id: 'ws-a', name: 'Ava space', ownerId: ava.id, createdAt: now, updatedAt: now }
const wsB: WorkspaceResponse = { id: 'ws-b', name: 'Project room', ownerId: ava.id, createdAt: now, updatedAt: now }
const wsBen: WorkspaceResponse = { id: 'ws-ben', name: 'Ben space', ownerId: ben.id, createdAt: now, updatedAt: now }
const pageA: PageResponse = { id: 'page-a', workspaceId: wsA.id, parentPageId: null, title: 'Alpha', orderKey: '0000000000000001', createdAt: now, updatedAt: now }
const pageBen: PageResponse = { id: 'page-ben', workspaceId: wsBen.id, parentPageId: null, title: 'Ben page', orderKey: '0000000000000001', createdAt: now, updatedAt: now }

type RequestRecord = { method: string; path: string; body?: any }
type ApiControls = { meStatus: number; profileStatus: number; passwordStatus: number; workspaceStatus: number; loginAs: AuthUserDto }

async function installApi(page: Page, options: { meStatus?: number; cached?: boolean; user?: AuthUserDto } = {}) {
  let session: AuthUserDto | null = options.user ?? ava
  const accounts = new Map([[ava.email, ava], [ben.email, ben]])
  const users = new Map([[ava.id, ava], [ben.id, ben]])
  const workspaces = [wsA, wsB, wsBen]
  const pages = [pageA, pageBen]
  const requests: RequestRecord[] = []
  const controls: ApiControls = { meStatus: options.meStatus ?? 200, profileStatus: 200, passwordStatus: 200, workspaceStatus: 200, loginAs: ava }
  const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  const failure = (status: number, message: string) => ({ statusCode: status, message, error: status === 401 ? 'Unauthorized' : status === 403 ? 'Forbidden' : 'Bad Request' })

  if (options.cached) {
    await page.addInitScript(({ cachedUser, cachedWorkspaces }) => {
      localStorage.setItem('eotion:last-authenticated-user', JSON.stringify(cachedUser))
      localStorage.setItem(`eotion:workspaces:${cachedUser.id}`, JSON.stringify(cachedWorkspaces))
    }, { cachedUser: options.user ?? ava, cachedWorkspaces: [wsA, wsB] })
  }

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    let body: any
    if (request.postData()) { try { body = request.postDataJSON() } catch { body = undefined } }
    requests.push({ method, path, body })

    if (path === '/api/auth/me' && method === 'GET') {
      if (controls.meStatus !== 200) return json(route, controls.meStatus, failure(controls.meStatus, 'Session unavailable'))
      return session ? json(route, 200, session) : json(route, 401, failure(401, 'Unauthorized'))
    }
    if (path === '/api/auth/login' && method === 'POST') {
      const input = body as { email?: string; password?: string }
      const user = input.email ? accounts.get(input.email) : undefined
      if (!user || input.password !== 'password') return json(route, 401, failure(401, 'Invalid credentials'))
      session = user
      controls.loginAs = user
      return json(route, 200, { user, expiresAt: later })
    }
    if (path === '/api/auth/logout' && method === 'POST') { session = null; return route.fulfill({ status: 204 }) }
    if (path === '/api/auth/me' && method === 'PATCH') {
      if (controls.profileStatus !== 200) return json(route, controls.profileStatus, failure(controls.profileStatus, 'Profile update failed'))
      if (!session) return json(route, 401, failure(401, 'Unauthorized'))
      session = { ...session, displayName: String(body?.displayName ?? ''), updatedAt: later }
      users.set(session.id, session)
      return json(route, 200, session)
    }
    if (path === '/api/auth/change-password' && method === 'POST') {
      if (controls.passwordStatus !== 200) return json(route, controls.passwordStatus, failure(controls.passwordStatus, controls.passwordStatus === 400 ? 'Current password is incorrect' : 'Password update failed'))
      session = null
      return route.fulfill({ status: 204 })
    }
    if (path === '/api/workspaces' && method === 'GET') {
      if (controls.workspaceStatus !== 200) return json(route, controls.workspaceStatus, failure(controls.workspaceStatus, 'Workspace list unavailable'))
      return json(route, 200, workspaces.filter((workspace) => workspace.ownerId === session?.id))
    }
    const snapshot = path.match(/^\/api\/sync\/workspaces\/([^/]+)\/snapshot$/)
    if (snapshot && method === 'GET') return json(route, 200, { pages: pages.filter((item) => item.workspaceId === decodeURIComponent(snapshot[1]!)), blocks: [] })
    if (path === '/api/sync/operations' && method === 'POST') return json(route, 200, { id: body?.id ?? 'operation', status: 'applied' })
    return json(route, 404, failure(404, 'Not found'))
  })

  return { controls, requests, users, workspaces }
}

const settingsUrl = (route = '/app/ws-a') => `/#/settings?returnTo=${encodeURIComponent(route)}&workspaceId=ws-a`
const profileRequests = (requests: RequestRecord[]) => requests.filter((request) => request.path === '/api/auth/me' && request.method === 'PATCH')
const passwordRequests = (requests: RequestRecord[]) => requests.filter((request) => request.path === '/api/auth/change-password')

test('Settings uses a selected list-detail layout at 1440 and 1024 pixels', async ({ page }) => {
  await installApi(page)
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(settingsUrl('/app/ws-a/page/page-a'))
    await expect(page.getByRole('navigation', { name: '设置导航' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '账号资料' })).toBeVisible()
    await expect(page.getByRole('link', { name: /账号资料/ })).toHaveAttribute('aria-current', 'page')
    await page.goto(`/#/settings/appearance?returnTo=${encodeURIComponent('/app/ws-a/page/page-a')}&workspaceId=ws-a`)
    await expect(page.getByRole('navigation', { name: '设置导航' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '外观', level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: /外观/ })).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('.settings-compact-back')).toHaveCount(0)
    const exit = page.locator('.settings-topbar').getByRole('link', { name: '返回工作区' })
    await expect(exit).toHaveAttribute('href', '#/app/ws-a/page/page-a')
    const layout = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }))
    expect(layout.content).toBeLessThanOrEqual(layout.viewport)
    await exit.click()
    await expect(page).toHaveURL(/#\/app\/ws-a\/page\/page-a$/)
  }
})

test('390px Settings index returns to the original page', async ({ page }) => {
  await installApi(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(settingsUrl('/app/ws-a/page/page-a'))
  const nav = page.getByRole('navigation', { name: '设置导航' })
  await expect(nav).toBeVisible()
  await expect(page.locator('.settings-detail')).toBeHidden()
  const exit = page.locator('.settings-topbar').getByRole('link', { name: '返回工作区' })
  await expect(exit).toHaveAttribute('aria-label', '返回工作区')
  const exitBox = await exit.boundingBox()
  expect(exitBox?.width).toBeGreaterThanOrEqual(44)
  expect(exitBox?.height).toBeGreaterThanOrEqual(44)
  await exit.click()
  await expect(page).toHaveURL(/#\/app\/ws-a\/page\/page-a$/)
})

for (const detail of ['profile', 'appearance', 'workspace/general']) {
  test(`390px Settings ${detail} has one back control and preserves navigation state`, async ({ page }) => {
    await installApi(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/#/settings/${detail}?returnTo=${encodeURIComponent('/app/ws-a/page/page-a')}&workspaceId=ws-a`)
    await expect(page.getByRole('navigation', { name: '设置导航' })).toBeHidden()
    await expect(page.locator('.settings-compact-back')).toHaveCount(0)
    await expect(page.locator('.settings-topbar')).toHaveCount(1)
    const back = page.locator('.settings-topbar').getByRole('link', { name: '返回设置列表' })
    await expect(back).toHaveCount(1)
    await expect(back).toHaveAttribute('aria-label', '返回设置列表')
    const backBox = await back.boundingBox()
    expect(backBox?.width).toBeGreaterThanOrEqual(44)
    expect(backBox?.height).toBeGreaterThanOrEqual(44)
    await back.click()
    await expect(page).toHaveURL(/#\/settings\?returnTo=.*workspaceId=ws-a/)
    const query = new URLSearchParams(new URL(page.url()).hash.split('?')[1])
    expect(query.get('returnTo')).toBe('/app/ws-a/page/page-a')
    expect(query.get('workspaceId')).toBe('ws-a')
    await expect(page.getByRole('navigation', { name: '设置导航' })).toBeVisible()
    await page.locator('.settings-topbar').getByRole('link', { name: '返回工作区' }).click()
    await expect(page).toHaveURL(/#\/app\/ws-a\/page\/page-a$/)
  })
}

test('390px Settings index navigates to detail with a single topbar and no overflow', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await installApi(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto(settingsUrl())
  const nav = page.getByRole('navigation', { name: '设置导航' })
  const appearance = page.getByRole('link', { name: /外观/ })
  const box = await appearance.boundingBox()
  expect(box?.height).toBeGreaterThanOrEqual(44)
  await appearance.click()
  await expect(page).toHaveURL(/#\/settings\/appearance/)
  await expect(page.getByRole('heading', { name: '外观' })).toBeVisible()
  await expect(nav).toBeHidden()
  await page.locator('.settings-topbar').getByRole('link', { name: '返回设置列表' }).click()
  await expect(page).toHaveURL(/#\/settings(?:\?|$)/)
  await expect(nav).toBeVisible()
  await expect(page.locator('.settings-detail')).toBeHidden()
  await expect(page.locator('.sidebar--open')).toHaveCount(0)
  await page.getByRole('link', { name: /账号资料/ }).click()
  await expect(page.getByRole('heading', { name: '账号资料' })).toBeVisible()
  const geometry = await page.evaluate(() => {
    const content = document.querySelector<HTMLElement>('.settings-page')!
    const heading = content.querySelector<HTMLElement>('h1')!
    return {
      topbars: document.querySelectorAll('.settings-topbar').length,
      gutter: getComputedStyle(content).paddingLeft,
      headingX: heading.getBoundingClientRect().left,
      viewport: document.documentElement.clientWidth,
      contentWidth: document.documentElement.scrollWidth,
    }
  })
  expect(geometry.topbars).toBe(1)
  expect(geometry.gutter).toBe('30px')
  expect(geometry.headingX).toBe(30)
  expect(geometry.contentWidth).toBeLessThanOrEqual(geometry.viewport)
  await page.getByRole('link', { name: '返回设置列表' }).click()
  await page.getByRole('link', { name: /外观/ }).click()
  await page.getByRole('radio', { name: /深色/ }).check()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('link', { name: '返回设置列表' }).click()
  await page.getByRole('link', { name: /账号资料/ }).click()
  await expect(page.getByRole('heading', { name: '账号资料' })).toBeVisible()
  const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }))
  expect(widths.content).toBeLessThanOrEqual(widths.viewport)
  expect(pageErrors).toEqual([])
})

test('profile trims and caches the saved name; invalid and successful password changes follow the session contract', async ({ page }) => {
  const api = await installApi(page)
  await page.goto(`/#/settings/profile?returnTo=${encodeURIComponent('/app/ws-a')}&workspaceId=ws-a`)
  const name = page.locator('#settings-display-name')
  await name.fill('  Ava New  ')
  await page.getByRole('button', { name: '保存昵称' }).click()
  await expect(page.getByRole('status').filter({ hasText: '昵称已保存' })).toBeVisible()
  expect(profileRequests(api.requests).at(-1)?.body).toEqual({ displayName: 'Ava New' })
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('eotion:last-authenticated-user'))!) as string).displayName).toBe('Ava New')
  await page.getByRole('link', { name: '返回工作区' }).click()
  await expect(page.locator('.product-user-name')).toHaveText('Ava New')
  await page.reload()
  await expect(page.locator('.product-user-name')).toHaveText('Ava New')

  await page.goto(`/#/settings/profile?returnTo=${encodeURIComponent('/app/ws-a')}&workspaceId=ws-a`)
  await page.locator('#settings-current-password').fill('wrong')
  await page.locator('#settings-new-password').fill('new-password')
  await page.locator('#settings-confirm-password').fill('mismatch')
  await page.getByRole('button', { name: '更新密码' }).click()
  await expect(page.getByRole('alert')).toContainText('两次输入的新密码不一致')
  expect(passwordRequests(api.requests)).toHaveLength(0)

  await page.locator('#settings-confirm-password').fill('new-password')
  api.controls.passwordStatus = 400
  await page.getByRole('button', { name: '更新密码' }).click()
  await expect(page.getByRole('alert')).toContainText('Current password is incorrect')
  await expect(page.getByRole('heading', { name: '账号资料' })).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('eotion:last-authenticated-user') ?? 'null')?.id)).toBe(ava.id)
  expect(passwordRequests(api.requests)).toHaveLength(1)

  api.controls.passwordStatus = 200
  await page.locator('#settings-current-password').fill('correct')
  await page.locator('#settings-new-password').fill('new-password')
  await page.locator('#settings-confirm-password').fill('new-password')
  await page.getByRole('button', { name: '更新密码' }).click()
  await expect(page).toHaveURL(/#\/login/)
  await expect(page.getByRole('status').filter({ hasText: '密码已更新，请重新登录' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('eotion:last-authenticated-user'))).toBeNull()
})

test('401 clears the cached identity, while 403 remains an authenticated non-offline error', async ({ page }) => {
  const api = await installApi(page)
  await page.goto(`/#/settings/profile?returnTo=${encodeURIComponent('/app/ws-a')}&workspaceId=ws-a`)
  api.controls.profileStatus = 403
  await page.locator('#settings-display-name').fill('Denied name')
  await page.getByRole('button', { name: '保存昵称' }).click()
  await expect(page.getByRole('status')).toContainText('Profile update failed')
  await expect(page.getByRole('heading', { name: '账号资料' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('eotion:last-authenticated-user'))).not.toBeNull()
  await expect(page.getByRole('button', { name: '保存昵称' })).toBeEnabled()

  api.controls.profileStatus = 401
  await page.getByRole('button', { name: '保存昵称' }).click()
  await expect(page).toHaveURL(/#\/login/)
  expect(await page.evaluate(() => localStorage.getItem('eotion:last-authenticated-user'))).toBeNull()
})

for (const status of [500, 502, 503, 504]) {
  test(`cached Settings and local preferences remain usable through HTTP ${status}`, async ({ page }) => {
    const api = await installApi(page, { meStatus: status, cached: true })
    api.controls.workspaceStatus = status
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(settingsUrl())
    await expect(page.getByRole('heading', { name: '账号资料' })).toBeVisible()
    await page.getByRole('textbox', { name: '昵称', exact: true }).fill('离线修改')
    await expect(page.getByRole('button', { name: '保存昵称' })).toBeDisabled()
    await page.locator('#settings-current-password').fill('current')
    await page.locator('#settings-new-password').fill('next')
    await page.locator('#settings-confirm-password').fill('next')
    await expect(page.getByRole('button', { name: '更新密码' })).toBeDisabled()
    await page.getByRole('link', { name: /外观/ }).click()
    await page.getByRole('radio', { name: /深色/ }).check()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.getByRole('link', { name: /通用/ }).click()
    await expect(page.getByText('当前配置：')).toContainText('Ava space')
    const toggle = page.getByRole('switch', { name: '显示固定编辑工具栏' })
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(api.requests.filter((request) => request.path === '/api/auth/me' && request.method === 'PATCH')).toHaveLength(0)
    expect(passwordRequests(api.requests)).toHaveLength(0)
  })
}

test('toolbar defaults off, slash and attachment picker work, and preferences stay scoped by user and workspace', async ({ page }) => {
  const api = await installApi(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/#/app/${wsA.id}/page/${pageA.id}`)
  const editor = page.locator('.eotion-editor-content .tiptap')
  await expect(editor).toBeVisible()
  await expect(page.locator('.eotion-editor-toolbar')).toHaveCount(0)
  await editor.click()
  await editor.pressSequentially('/')
  await expect(page.locator('.p2-slash-menu')).toBeVisible()
  await page.locator('.p2-slash-menu').getByRole('option', { name: '图片' }).click()
  await expect(page.getByLabel('选择图片附件')).toHaveAttribute('type', 'file')
  await expect(page.getByLabel('选择文件附件')).toHaveAttribute('type', 'file')

  await page.goto(`/#/settings/workspace/general?returnTo=${encodeURIComponent(`/app/${wsA.id}`)}&workspaceId=${wsA.id}`)
  await page.getByRole('switch', { name: '显示固定编辑工具栏' }).click()
  await page.goto(`/#/app/${wsA.id}/page/${pageA.id}`)
  await expect(page.locator('.eotion-editor-toolbar')).toBeVisible()
  await page.reload()
  await expect(page.locator('.eotion-editor-toolbar')).toBeVisible()

  await page.goto(`/#/settings/workspace/general?returnTo=${encodeURIComponent(`/app/${wsB.id}`)}&workspaceId=${wsB.id}`)
  await expect(page.getByRole('switch', { name: '显示固定编辑工具栏' })).toHaveAttribute('aria-checked', 'false')
  await page.getByRole('link', { name: '返回工作区' }).click()
  await page.getByRole('button', { name: '退出登录' }).click()
  await expect(page).toHaveURL(/#\/login/)
  await page.getByLabel('邮箱').fill(ben.email)
  await page.getByLabel('密码').fill('password')
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page).toHaveURL(/#\/app/)
  await page.goto(`/#/settings/workspace/general?returnTo=%2Fapp%2F${wsBen.id}&workspaceId=${wsBen.id}`)
  await expect(page.getByRole('switch', { name: '显示固定编辑工具栏' })).toHaveAttribute('aria-checked', 'false')

  // Even an enabled desktop preference must not duplicate the compact touch controls.
  await page.getByRole('switch', { name: '显示固定编辑工具栏' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window)
    window.matchMedia = (query: string) => {
      const result = nativeMatchMedia(query)
      if (query === '(pointer: coarse)') Object.defineProperty(result, 'matches', { configurable: true, value: true })
      return result
    }
  })
  await page.goto(`/#/app/${wsBen.id}/page/${pageBen.id}`)
  await expect(page.locator('.eotion-editor-toolbar')).toHaveCount(0)
  const touchToolbar = page.getByRole('toolbar', { name: '触摸编辑工具栏' })
  await expect(touchToolbar).toBeVisible()
  const touchBox = await touchToolbar.getByRole('button', { name: '插入文件' }).boundingBox()
  expect(touchBox?.height).toBeGreaterThanOrEqual(44)
  await touchToolbar.getByRole('button', { name: '插入文件' }).click()
  await expect(page.getByLabel('选择文件附件')).toHaveAttribute('type', 'file')
  expect(api.requests.filter((request) => request.method === 'POST' && request.path === '/api/auth/change-password')).toHaveLength(0)
})

test('unknown workspace has no global toolbar preference; returnTo rejects external paths and preserves valid pages', async ({ page }) => {
  await installApi(page)
  await page.goto('/#/settings/workspace/general?returnTo=https%3A%2F%2Fevil.example%2F&workspaceId=unknown')
  await expect(page.getByText('无法确定当前工作区')).toBeVisible()
  await expect(page.getByRole('switch')).toHaveCount(0)
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('eotion:editor-toolbar:')))).toHaveLength(0)
  const safeReturn = page.getByRole('link', { name: '返回工作区' })
  await expect(safeReturn).toHaveAttribute('href', '#/app')
  await safeReturn.click()
  // /app resolves the authenticated user's preferred workspace after loading.
  await expect(page).toHaveURL(new RegExp(`#\\/app\\/${wsA.id}$`))

  await page.goto(`/#/settings/profile?returnTo=${encodeURIComponent(`/app/${wsA.id}/page/${pageA.id}`)}&workspaceId=${wsA.id}`)
  await page.getByRole('link', { name: '返回工作区' }).click()
  await expect(page).toHaveURL(new RegExp(`#\\/app\\/${wsA.id}\\/page\\/${pageA.id}$`))
})

test('theme and toolbar controls support keyboard focus and activation in dark reduced-motion mode', async ({ page }) => {
  await installApi(page)
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.goto('/#/settings/appearance?workspaceId=ws-a')
  const system = page.getByRole('radio', { name: /跟随系统/ })
  await system.focus()
  await system.press('ArrowDown')
  await expect(page.getByRole('radio', { name: /浅色/ })).toBeChecked()
  await page.getByRole('radio', { name: /浅色/ }).press('ArrowDown')
  await expect(page.getByRole('radio', { name: /深色/ })).toBeChecked()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const general = page.getByRole('link', { name: /通用/ })
  await general.focus()
  await general.press('Enter')
  await expect(general).toHaveAttribute('aria-current', 'page')
  const toggle = page.getByRole('switch', { name: '显示固定编辑工具栏' })
  await toggle.focus()
  expect(await toggle.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none')
  await toggle.press('Space')
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
})
