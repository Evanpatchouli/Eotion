import { expect, test, type Page, type Route } from '@playwright/test'
import type { AuthUserDto, WorkspaceResponse } from '@eotion/contracts'

const now = '2026-09-30T00:00:00.000Z'
const later = '2027-09-30T00:00:00.000Z'

const users: Record<string, AuthUserDto> = {
  'ava@example.com': { id: 'user-ava', email: 'ava@example.com', createdAt: now, updatedAt: now },
  'ben@example.com': { id: 'user-ben', email: 'ben@example.com', createdAt: now, updatedAt: now },
}

function workspace(id: string, name: string, ownerId = users['ava@example.com']!.id): WorkspaceResponse {
  return { id, name, ownerId, createdAt: now, updatedAt: now }
}

type MockOptions = {
  user?: AuthUserDto | null
  workspaces?: WorkspaceResponse[]
}

async function installApi(page: Page, options: MockOptions = {}) {
  let session = options.user ?? null
  const accounts: Record<string, AuthUserDto> = { ...users }
  const passwords: Record<string, string> = { 'ava@example.com': 'ava-password', 'ben@example.com': 'ben-password' }
  const records = [...(options.workspaces ?? [])]
  const pagesByWorkspace = new Map<string, any[]>()
  const blocksByWorkspace = new Map<string, any[]>()
  const controls = {
    loginDelayMs: 0,
    registerDelayMs: 0,
    meDelayMs: 0,
    loginFailures: 0,
    registerFailures: 0,
    meFailures: 0,
    workspaceListFailures: 0,
    renameFailures: 0,
  }
  const requests: Array<{ method: string; path: string; body?: unknown }> = []
  const wait = async (milliseconds: number) => {
    if (milliseconds > 0) await new Promise((resolve) => setTimeout(resolve, milliseconds))
  }
  const json = async (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  const error = (status: number, message: string) => ({ statusCode: status, message, error: status === 401 ? 'Unauthorized' : 'Internal Server Error' })

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()
    let body: unknown
    if (request.postData()) {
      try { body = request.postDataJSON() } catch { body = undefined }
    }
    requests.push({ method, path, body })

    if (path === '/api/auth/me' && method === 'GET') {
      await wait(controls.meDelayMs)
      if (controls.meFailures > 0) {
        controls.meFailures -= 1
        return json(route, 503, error(503, 'Session recovery failed'))
      }
      return session ? json(route, 200, session) : json(route, 401, error(401, 'Unauthorized'))
    }
    if (path === '/api/auth/login' && method === 'POST') {
      await wait(controls.loginDelayMs)
      if (controls.loginFailures > 0) {
        controls.loginFailures -= 1
        return json(route, 401, error(401, 'Invalid email or password'))
      }
      const input = body as { email?: string; password?: string } | undefined
      const user = input?.email ? accounts[input.email] : undefined
      if (!user || input?.password !== passwords[input.email!]) return json(route, 401, error(401, 'Invalid email or password'))
      session = user
      return json(route, 200, { user, expiresAt: later })
    }
    if (path === '/api/auth/register' && method === 'POST') {
      await wait(controls.registerDelayMs)
      if (controls.registerFailures > 0) {
        controls.registerFailures -= 1
        return json(route, 409, { statusCode: 409, message: 'An account with this email already exists', error: 'Conflict' })
      }
      const input = body as { email?: string; password?: string } | undefined
      const registeredEmail = input?.email?.trim().toLowerCase()
      if (!registeredEmail || !input?.password) return json(route, 400, error(400, 'Invalid registration details'))
      if (accounts[registeredEmail]) return json(route, 409, { statusCode: 409, message: 'An account with this email already exists', error: 'Conflict' })
      const user: AuthUserDto = { id: `user-${registeredEmail}`, email: registeredEmail, createdAt: now, updatedAt: now }
      accounts[registeredEmail] = user
      passwords[registeredEmail] = input.password
      return json(route, 201, user)
    }
    if (path === '/api/auth/logout' && method === 'POST') {
      session = null
      return route.fulfill({ status: 204 })
    }

    if (!session) return json(route, 401, error(401, 'Unauthorized'))
    const snapshotMatch = path.match(/^\/api\/sync\/workspaces\/([^/]+)\/snapshot$/)
    if (snapshotMatch && method === 'GET') {
      const workspaceId = decodeURIComponent(snapshotMatch[1]!)
      const owned = records.some((record) => record.id === workspaceId && record.ownerId === session!.id)
      if (!owned) return json(route, 404, error(404, 'Workspace not found'))
      pagesByWorkspace.set(workspaceId, pagesByWorkspace.get(workspaceId) ?? [])
      blocksByWorkspace.set(workspaceId, blocksByWorkspace.get(workspaceId) ?? [])
      return json(route, 200, { pages: pagesByWorkspace.get(workspaceId), blocks: blocksByWorkspace.get(workspaceId) })
    }
    if (path === '/api/sync/operations' && method === 'POST') {
      const operation = body as { id: string; kind: string; workspaceId: string; payload: any }
      const owned = records.some((record) => record.id === operation.workspaceId && record.ownerId === session!.id)
      if (!owned) return json(route, 404, error(404, 'Workspace not found'))
      const pages = pagesByWorkspace.get(operation.workspaceId) ?? []
      const blocks = blocksByWorkspace.get(operation.workspaceId) ?? []
      const item = operation.payload
      if (operation.kind === 'page.upsert') {
        const index = pages.findIndex((record) => record.id === item.id)
        const record = { ...item, workspaceId: operation.workspaceId, createdAt: now, updatedAt: later }
        if (index < 0) pages.push(record); else pages[index] = record
      } else if (operation.kind === 'page.move') {
        const record = pages.find((page) => page.id === item.id)
        if (record) Object.assign(record, { parentPageId: item.parentPageId, orderKey: item.orderKey, updatedAt: later })
      } else if (operation.kind === 'page.delete') {
        const index = pages.findIndex((record) => record.id === item.id)
        if (index >= 0) pages.splice(index, 1)
      } else if (operation.kind === 'block.upsert') {
        const index = blocks.findIndex((record) => record.id === item.id)
        const record = { ...item, workspaceId: operation.workspaceId, createdAt: now, updatedAt: later }
        if (index < 0) blocks.push(record); else blocks[index] = record
      } else if (operation.kind === 'block.delete') {
        const index = blocks.findIndex((record) => record.id === item.id)
        if (index >= 0) blocks.splice(index, 1)
      }
      pagesByWorkspace.set(operation.workspaceId, pages)
      blocksByWorkspace.set(operation.workspaceId, blocks)
      return json(route, 200, { id: operation.id, status: 'applied' })
    }
    if (!path.startsWith('/api/workspaces')) return json(route, 404, error(404, 'Not found'))
    if (path === '/api/workspaces' && method === 'GET') {
      if (controls.workspaceListFailures > 0) {
        controls.workspaceListFailures -= 1
        return json(route, 503, error(503, 'Workspace list failed'))
      }
      return json(route, 200, records.filter((record) => record.ownerId === session!.id))
    }
    if (path === '/api/workspaces' && method === 'POST') {
      const input = body as { id?: string; name?: string } | undefined
      const created = workspace(input?.id ?? 'missing-id', input?.name ?? '', session.id)
      records.push(created)
      return json(route, 201, created)
    }
    const match = path.match(/^\/api\/workspaces\/([^/]+)$/)
    if (match && method === 'PATCH') {
      const id = decodeURIComponent(match[1]!)
      if (controls.renameFailures > 0) {
        controls.renameFailures -= 1
        return json(route, 503, error(503, 'Rename failed'))
      }
      const record = records.find((item) => item.id === id && item.ownerId === session!.id)
      if (!record) return json(route, 404, error(404, 'Workspace not found'))
      record.name = (body as { name: string }).name
      record.updatedAt = later
      return json(route, 200, record)
    }
    if (match && method === 'GET') {
      const record = records.find((item) => item.id === decodeURIComponent(match[1]!) && item.ownerId === session!.id)
      return record ? json(route, 200, record) : json(route, 404, error(404, 'Workspace not found'))
    }
    return json(route, 404, error(404, 'Not found'))
  })

  return { controls, records, requests, getSession: () => session }
}

async function login(page: Page, email = 'ava@example.com', password = 'ava-password') {
  await page.goto('/#/login')
  await page.getByLabel('邮箱').fill(email)
  await page.getByLabel('密码').fill(password)
  await page.getByRole('button', { name: '登录' }).click()
}

test('protects product routes, reports login failure while pending, then opens the app on success', async ({ page }) => {
  const api = await installApi(page)
  await page.goto('/#/app')
  await expect(page).toHaveURL(/#\/login(?:\?.*)?$/)
  await expect(page.getByRole('heading', { name: '登录 Eotion' })).toBeVisible()

  api.controls.loginDelayMs = 250
  api.controls.loginFailures = 1
  await page.getByLabel('邮箱').fill('ava@example.com')
  await page.getByLabel('密码').fill('ava-password')
  const pending = page.getByRole('button', { name: '登录' })
  await pending.click()
  await expect(pending).toBeDisabled()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(pending).toBeEnabled()

  await pending.click()
  await expect(page).toHaveURL(/#\/app$/)
  await expect(page.getByRole('heading', { name: '创建你的第一个工作区' })).toBeVisible()
  expect(api.getSession()?.id).toBe('user-ava')
})

test('links login and registration pages in both directions', async ({ page }) => {
  await installApi(page)
  await page.goto('/#/login')
  await page.getByRole('link', { name: '没有账号，立即注册' }).click()
  await expect(page).toHaveURL(/#\/register$/)
  await page.reload()
  await expect(page.getByRole('heading', { name: '注册 Eotion' })).toBeVisible()
  await expect(page.getByRole('button', { name: '注册' })).toBeDisabled()
  await page.getByRole('link', { name: '已有账号，前往登录' }).click()
  await expect(page).toHaveURL(/#\/login$/)
  await expect(page.getByRole('heading', { name: '登录 Eotion' })).toBeVisible()
})

test('requires matching passwords, then registers and returns to login without creating a session', async ({ page }) => {
  const api = await installApi(page)
  await page.goto('/#/register')
  await page.getByLabel('邮箱').fill('new@example.com')
  await page.getByLabel('密码', { exact: true }).fill('new-password')
  await page.getByLabel('确认密码').fill('different-password')
  const register = page.getByRole('button', { name: '注册' })
  await expect(register).toBeDisabled()
  expect(api.requests.filter((request) => request.path === '/api/auth/register')).toHaveLength(0)

  await page.getByLabel('确认密码').fill('new-password')
  await expect(register).toBeEnabled()
  await register.click()
  await expect(page).toHaveURL(/#\/login\?email=/)
  await expect.poll(() => page.evaluate(() => new URLSearchParams(location.hash.split('?')[1]).get('email'))).toBe('new@example.com')
  await expect(page.getByLabel('邮箱')).toHaveValue('new@example.com')
  await expect(page.getByLabel('密码', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('密码', { exact: true })).toBeFocused()
  expect(api.getSession()).toBeNull()
  expect(api.requests.filter((request) => request.path === '/api/auth/register')).toHaveLength(1)

  await page.getByLabel('密码', { exact: true }).fill('new-password')
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page).toHaveURL(/#\/app$/)
  expect(api.getSession()?.email).toBe('new@example.com')
})

test('disables repeat registration while pending and displays a server error', async ({ page }) => {
  const api = await installApi(page)
  api.controls.registerDelayMs = 200
  api.controls.registerFailures = 1
  await page.goto('/#/register')
  await page.getByLabel('邮箱').fill('ava@example.com')
  await page.getByLabel('密码', { exact: true }).fill('new-password')
  await page.getByLabel('确认密码').fill('new-password')
  const register = page.locator('form button[type="submit"]')
  await register.click()
  await expect(register).toBeDisabled()
  await expect(page.getByRole('alert')).toContainText('An account with this email already exists')
  await expect(register).toBeEnabled()
  expect(api.requests.filter((request) => request.path === '/api/auth/register')).toHaveLength(1)
})

test('redirects an authenticated visitor from login and registration to the product area', async ({ page }) => {
  await installApi(page, { user: users['ava@example.com'], workspaces: [workspace('ws-a', 'Ava space')] })
  await page.goto('/#/login')
  await expect(page).toHaveURL(/#\/app\/ws-a$/)
  await page.goto('/#/register')
  await expect(page).toHaveURL(/#\/app\/ws-a$/)
  await expect(page.getByRole('button', { name: '切换工作区' })).toContainText('Ava space')
})

test('delays login until recovery completes and uses cached product state on transient failures', async ({ page }) => {
  const api = await installApi(page, { user: users['ava@example.com'], workspaces: [workspace('ws-a', 'Ava space')] })
  api.controls.meDelayMs = 250
  await page.goto('/#/app')
  await expect(page.getByRole('heading', { name: '登录 Eotion' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '切换工作区' })).toContainText('Ava space')
  // The workspace label precedes snapshot hydration. Establish the cached
  // product state before interrupting recovery with a reload and /me failure.
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()

  // Previously authenticated clients keep the product through a transient /me failure.
  api.controls.meFailures = 1
  await page.reload()
  await expect(page.locator('.connectivity-state')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '切换工作区' })).toContainText('Ava space')

  // Finish the previous document's background authorization request before
  // assigning the one-shot failure to the next document's initial recovery.
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  api.controls.workspaceListFailures = 1
  await page.reload()
  await expect(page.getByRole('button', { name: '切换工作区' })).toContainText('Ava space')
  await expect(page.getByRole('heading', { name: '暂时无法加载工作区' })).toHaveCount(0)
})

test('creates the first workspace and keeps it available after reload', async ({ page }) => {
  const api = await installApi(page)
  await login(page)
  await expect(page.getByRole('heading', { name: '创建你的第一个工作区' })).toBeVisible()
  await page.getByLabel('工作区名称').fill('  Ava space  ')
  await page.getByRole('button', { name: '创建工作区' }).click()
  await expect(page.locator('.product-operation-status')).toContainText('工作区已创建')
  await expect(page).toHaveURL(/#\/app\/[^/]+$/)
  await expect(page.getByRole('button', { name: '切换工作区' })).toContainText('Ava space')
  expect(api.records).toHaveLength(1)
  expect(api.records[0]).toMatchObject({ name: 'Ava space', ownerId: 'user-ava' })

  await page.reload()
  await expect(page.getByRole('button', { name: '切换工作区' })).toContainText('Ava space')
})

test('switches workspaces, selects the most recent one, and validates rename with retry and persistence', async ({ page }) => {
  const api = await installApi(page, {
    user: users['ava@example.com'],
    workspaces: [workspace('ws-a', 'Ava space'), workspace('ws-b', 'Project room')],
  })
  await page.goto('/#/app')
  await expect(page).toHaveURL(/#\/app\/ws-a$/)
  await page.getByRole('button', { name: '切换工作区' }).click()
  await page.getByRole('list', { name: '可用工作区' }).getByRole('button', { name: 'Project room' }).click()
  await expect(page).toHaveURL(/#\/app\/ws-b$/)
  await page.reload()
  await expect(page).toHaveURL(/#\/app\/ws-b$/)

  await page.getByRole('button', { name: '切换工作区' }).click()
  await page.getByRole('button', { name: '重命名当前工作区' }).click()
  await page.getByLabel('新工作区名称').fill('   ')
  await expect(page.getByRole('button', { name: '保存名称' })).toBeDisabled()
  await page.getByLabel('新工作区名称').fill('Project room')
  await expect(page.getByRole('button', { name: '保存名称' })).toBeDisabled()
  await page.getByLabel('新工作区名称').fill('  Renamed room  ')
  api.controls.renameFailures = 1
  await page.getByRole('button', { name: '保存名称' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: '保存名称' }).click()
  await expect(page.locator('.product-operation-status')).toContainText('工作区名称已更新')
  await expect(page.getByRole('button', { name: '切换工作区' })).toContainText('Renamed room')
  await page.reload()
  await expect(page.getByRole('button', { name: '切换工作区' })).toContainText('Renamed room')
  expect(api.records.find((record) => record.id === 'ws-b')?.name).toBe('Renamed room')
})

test('rejects an unknown workspace, handles expired sessions, and prevents back navigation after logout', async ({ page }) => {
  const api = await installApi(page, { user: users['ava@example.com'], workspaces: [workspace('ws-a', 'Ava space')] })
  await page.goto('/#/app/not-a-workspace')
  await expect(page).toHaveURL(/#\/app\/not-a-workspace$/)
  await expect(page.getByRole('heading', { name: '无法打开这个工作区' })).toBeVisible()

  // Simulate an expired cookie on the next protected API request.
  const expiredRoute = async (route: Route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ statusCode: 401, message: 'Unauthorized' }) })
    }
    return route.fallback()
  }
  await page.route('**/api/workspaces', expiredRoute)
  await page.reload()
  await expect(page).toHaveURL(/#\/login$/)
  await expect(page.getByRole('heading', { name: '登录 Eotion' })).toBeVisible()
  await page.unroute('**/api/workspaces', expiredRoute)

  // Log in again, then verify logout clears the session and guarded history entries.
  await login(page)
  await expect(page).toHaveURL(/#\/app\/ws-a$/)
  await page.getByRole('button', { name: '退出登录' }).click()
  await expect(page).toHaveURL(/#\/login$/)
  await page.goBack()
  await expect(page).toHaveURL(/#\/login$/)
  await expect(page.getByRole('heading', { name: '登录 Eotion' })).toBeVisible()
  expect(api.getSession()).toBeNull()
})

test('isolates workspace lists between users and closes the mobile drawer after switching', async ({ page }) => {
  const api = await installApi(page, {
    workspaces: [workspace('ws-ava', 'Ava private', 'user-ava'), workspace('ws-ben', 'Ben private', 'user-ben')],
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page)
  await page.getByRole('button', { name: '打开导航菜单' }).click()
  await expect(page.getByRole('button', { name: '切换工作区' })).toContainText('Ava private')
  await expect(page.getByText('Ben private')).toHaveCount(0)
  await page.getByRole('button', { name: '退出登录' }).click()
  await login(page, 'ben@example.com', 'ben-password')
  await page.getByRole('button', { name: '打开导航菜单' }).click()
  await expect(page.getByRole('button', { name: '切换工作区' })).toContainText('Ben private')
  await expect(page.getByText('Ava private')).toHaveCount(0)

  await expect(page.getByLabel('工作区导航')).toBeVisible()
  await page.getByRole('button', { name: '切换工作区' }).click()
  await page.getByRole('list', { name: '可用工作区' }).getByRole('button', { name: 'Ben private' }).click()
  await expect(page.getByLabel('工作区导航')).not.toHaveClass(/sidebar--open/)
  const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }))
  expect(widths.content).toBeLessThanOrEqual(widths.viewport)
  expect(api.requests.some((request) => request.path === '/api/workspaces' && request.method === 'GET')).toBe(true)
})
