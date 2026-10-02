import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import type { AuthUserDto, BlockResponse, PageResponse, WorkspaceResponse } from '@eotion/contracts'

const now = '2026-10-02T00:00:00.000Z'
const user: AuthUserDto = { id: 'shell-user', email: 'lin@example.com', displayName: '林', createdAt: now, updatedAt: now }
const workspaces: WorkspaceResponse[] = ['知识工作室', '项目笔记'].map((name, index) => ({
  id: `shell-ws-${index}`, name, ownerId: user.id, createdAt: now, updatedAt: now,
}))
const pages: PageResponse[] = ['工作笔记', '阅读清单', '想法收集'].map((title, index) => ({
  id: `shell-page-${index}`, workspaceId: workspaces[0]!.id, title, parentPageId: null,
  orderKey: String(index + 1).padStart(16, '0'), createdAt: now, updatedAt: now,
}))
pages[0]!.icon = '📓'
pages.push({
  id: 'shell-child', workspaceId: workspaces[0]!.id, title: '今日记录', parentPageId: pages[0]!.id,
  orderKey: '0000000000000001', createdAt: now, updatedAt: now,
})
const blocks: BlockResponse[] = [{
  id: 'shell-block', workspaceId: workspaces[0]!.id, pageId: pages[0]!.id, parentBlockId: null,
  type: 'paragraph', orderKey: '0000000000000001', createdAt: now, updatedAt: now,
  props: { node: { type: 'paragraph', content: [{ type: 'text', text: '留一处安静的空间，记录今天值得记住的事情。' }] } },
}]

async function openShell(page: Page) {
  await page.route('**/api/**', route => {
    const request = route.request()
    const url = new URL(request.url()).pathname
    const body = url === '/api/auth/me' ? user : url === '/api/workspaces' ? workspaces
      : url.endsWith('/snapshot') ? { pages: url.includes(workspaces[0]!.id) ? pages : [], blocks: url.includes(workspaces[0]!.id) ? blocks : [] }
        : { statusCode: 404, message: 'Not found' }
    return route.fulfill({ status: 'statusCode' in body ? 404 : 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/#/app/shell-ws-0/page/shell-page-0')
  await expect(page.locator('.eotion-editor-content')).toContainText('留一处安静的空间')
  await expect(page.locator('.product-topbar')).toContainText('已同步')
}

async function screenshot(page: Page, name: string) {
  if (!process.env.EOTION_VISUAL_QA_DIR) return
  await mkdir(process.env.EOTION_VISUAL_QA_DIR, { recursive: true })
  await expect(page.locator('.product-topbar')).toContainText('已同步')
  await page.screenshot({ path: path.join(process.env.EOTION_VISUAL_QA_DIR, `${name}.png`) })
}

test('sidebar action rail aligns across desktop, tablet and mobile', async ({ page }) => {
  await openShell(page)
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 900 })
    if (width === 390) await page.getByRole('button', { name: '打开导航菜单', exact: true }).click()
    const icons = page.locator(width === 390
      ? '.sidebar-close svg, .product-workspace-trigger svg, .product-add-page svg, .product-page-menu-trigger svg'
      : '.product-sidebar-collapse svg, .product-workspace-trigger svg, .product-add-page svg, .product-page-menu-trigger svg')
    const centers = await icons.evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect()
      return rect.x + rect.width / 2
    }))
    expect(centers.length).toBeGreaterThanOrEqual(4)
    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(1)
  }
})

test('page icon disclosure preserves title position and separates expansion from navigation', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await openShell(page)
  await expect(page).toHaveTitle(/Eotion/)
  const parent = page.locator('.product-page-node').filter({ has: page.getByRole('button', { name: '工作笔记', exact: true }) })
  const row = parent.locator('.product-page-row')
  const title = parent.locator('.product-page-title')
  const icon = parent.locator('.product-page-disclosure-icon')
  const chevron = parent.locator('.product-page-disclosure-chevron')
  const toggle = parent.locator('.product-page-toggle')
  const titleBounds = await title.boundingBox()
  const originalUrl = page.url()
  await expect(icon).toBeVisible()
  await expect(icon).toHaveText('📓')
  await expect(chevron).toBeHidden()
  await row.hover()
  await expect(icon).toBeHidden()
  await expect(chevron).toBeVisible()
  expect(await title.boundingBox()).toEqual(titleBounds)
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('button', { name: '今日记录', exact: true })).toBeVisible()
  expect(page.url()).toBe(originalUrl)
  await page.mouse.move(800, 22)
  await expect(icon).toBeVisible()
  await expect(chevron).toBeHidden()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  expect(await title.boundingBox()).toEqual(titleBounds)
  await screenshot(page, 'sidebar-disclosure-default')
  await row.hover()
  await screenshot(page, 'sidebar-disclosure-hover')
  await toggle.focus()
  await expect(toggle).toBeFocused()
  await toggle.press('Space')
  await expect(chevron).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.press('Enter')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  expect(page.url()).toBe(originalUrl)

  const leaf = page.getByRole('button', { name: '阅读清单', exact: true })
  const leafIcon = leaf.locator('.product-page-leading-icon')
  const leafBounds = await leafIcon.boundingBox()
  await leaf.hover()
  await expect(leafIcon).toBeVisible()
  expect(await leafIcon.boundingBox()).toEqual(leafBounds)
  await expect(leaf.locator('..').locator('.product-page-toggle')).toHaveCount(0)
  await leaf.click()
  await expect(page).toHaveURL(/\/page\/shell-page-1$/)
  await parent.getByRole('button', { name: '页面操作：工作笔记', exact: true }).click()
  await expect(parent.getByRole('group', { name: '工作笔记 的操作', exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/page\/shell-page-1$/)
  await parent.getByRole('button', { name: '工作笔记', exact: true }).click()
  await expect(page).toHaveURL(/\/page\/shell-page-0$/)
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await toggle.click()
  await parent.getByRole('button', { name: '工作笔记', exact: true }).click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(errors).toEqual([])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})

test.describe('touch disclosure', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })
  test('expands without hover or closing the navigation drawer', async ({ page }) => {
    await openShell(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: '打开导航菜单', exact: true }).tap()
    const toggle = page.locator('.product-page-toggle').first()
    await expect(toggle.locator('.product-page-disclosure-chevron')).toBeVisible()
    await expect(toggle.locator('.product-page-disclosure-icon')).toBeHidden()
    await toggle.tap()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('button', { name: '今日记录', exact: true })).toBeVisible()
    await expect(page.getByLabel('工作区导航', { exact: true })).toHaveClass(/sidebar--open/)
    await expect(page).toHaveURL(/\/page\/shell-page-0$/)
    await page.getByRole('button', { name: '今日记录', exact: true }).tap()
    await expect(page).toHaveURL(/\/page\/shell-child$/)
    await expect(page.getByLabel('工作区导航', { exact: true })).not.toHaveClass(/sidebar--open/)
  })
})

test('shared navigation rows retain pressed states through shell styles and mobile row geometry', async ({ page }) => {
  await openShell(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const name of ['设置', '项目笔记']) {
    if (name === '项目笔记') await page.getByRole('button', { name: '切换工作区', exact: true }).click()
    const button = page.getByRole('button', { name, exact: true })
    const row = button.locator('..')
    await button.hover()
    await expect(row).toHaveCSS('background-color', 'rgb(238, 237, 232)')
    await page.mouse.down()
    await expect(row).toHaveCSS('background-color', 'rgb(230, 228, 221)')
    await expect(button).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await page.mouse.move(800, 22)
    await page.mouse.up()
  }
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '打开导航菜单', exact: true }).click()
  await expect(page.locator('.product-page-row').first()).toHaveCSS('height', '44px')
})

test('desktop shell collapses completely, restores focus and keeps page content mounted', async ({ page }) => {
  await openShell(page)
  const sidebar = page.getByLabel('工作区导航', { exact: true })
  const editor = page.locator('.eotion-editor-content')
  await editor.evaluate(element => { element.setAttribute('data-shell-mount-check', 'original') })
  expect(await sidebar.evaluate(element => {
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return [rect.x, style.borderTopLeftRadius, style.borderBottomLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius]
  })).toEqual([0, '0px', '0px', '16px', '16px'])
  await expect(page.locator('.product-topbar')).toHaveCSS('height', '44px')
  const activeRow = page.locator('[role="treeitem"][aria-selected="true"] .product-page-row')
  await expect(activeRow).toHaveCSS('height', '32px')
  for (const name of ['设置', '退出登录']) {
    const row = sidebar.getByRole('button', { name, exact: true })
    await expect(row).toHaveCSS('height', '32px')
    expect(await row.evaluate(element => element.getBoundingClientRect().width)).toBe(await row.evaluate(element => element.parentElement!.clientWidth))
  }
  await screenshot(page, 'sidebar-expanded')
  await page.getByRole('button', { name: '收起侧边栏', exact: true }).click()
  const reopen = page.getByRole('button', { name: '展开侧边栏', exact: true })
  await expect(reopen).toBeFocused()
  await expect(sidebar).toHaveAttribute('inert', '')
  await expect.poll(() => page.locator('.main-pane').evaluate(element => element.getBoundingClientRect().x)).toBe(0)
  await expect.poll(() => sidebar.evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0)
  await expect(editor).toHaveAttribute('data-shell-mount-check', 'original')
  await expect(editor).toContainText('留一处安静的空间')
  await screenshot(page, 'sidebar-collapsed')
  await reopen.press('Enter')
  await expect(page.getByRole('button', { name: '收起侧边栏', exact: true })).toBeFocused()
  await expect.poll(() => page.locator('.main-pane').evaluate(element => element.getBoundingClientRect().x)).toBe(252)
})

test('workspace popover has no tree shift, supports keyboard forms, ESC and outside close', async ({ page }) => {
  await openShell(page)
  const trigger = page.getByRole('button', { name: '切换工作区', exact: true })
  const treeBounds = await page.getByRole('tree').boundingBox()
  await trigger.press('ArrowDown')
  const popover = page.getByRole('dialog', { name: '工作区切换', exact: true })
  await expect(popover).toBeVisible()
  await expect(popover).toHaveCSS('position', 'absolute')
  await expect(popover).toHaveCSS('width', '240px')
  expect(await page.getByRole('tree').boundingBox()).toEqual(treeBounds)
  const current = popover.getByRole('button').filter({ hasText: '知识工作室' })
  await expect(current).toBeFocused()
  await screenshot(page, 'workspace-popover')
  await page.keyboard.press('ArrowDown')
  await expect(popover.getByRole('button', { name: '项目笔记' })).toBeFocused()
  await page.keyboard.press('End')
  const rename = popover.getByRole('button', { name: '重命名当前工作区' })
  await expect(rename).toBeFocused()
  await rename.press('Enter')
  await page.keyboard.press('Tab')
  const input = popover.getByLabel('新工作区名称')
  await expect(input).toBeFocused()
  await input.press('ArrowLeft')
  await expect(input).toBeFocused()
  await input.fill('更新后的名称')
  await input.press('Tab')
  await expect(popover.getByRole('button', { name: '保存名称' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(input).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(popover).toBeHidden()
  await expect(trigger).toBeFocused()
  await trigger.press('ArrowUp')
  await expect(popover.getByRole('button', { name: '重命名当前工作区' })).toBeFocused()
  await page.keyboard.press('Escape')
  await trigger.click()
  await page.locator('.breadcrumb').click()
  await expect(popover).toBeHidden()
  await expect(trigger).toBeFocused()
  expect(await page.getByRole('tree').boundingBox()).toEqual(treeBounds)
})

test('theme geometry and compact drawer remain compatible with desktop collapse', async ({ page }) => {
  await openShell(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const sidebar = page.getByLabel('工作区导航', { exact: true })
  const bounds = await sidebar.boundingBox()
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(sidebar).toHaveCSS('background-color', 'rgb(24, 23, 22)')
  expect(await sidebar.boundingBox()).toEqual(bounds)
  await page.getByRole('button', { name: '收起侧边栏', exact: true }).click()
  await expect.poll(() => page.locator('.main-pane').evaluate(element => element.getBoundingClientRect().x)).toBe(0)
  await page.setViewportSize({ width: 900, height: 900 })
  await page.getByRole('button', { name: '展开侧边栏', exact: true }).click()
  await expect.poll(() => page.locator('.main-pane').evaluate(element => element.getBoundingClientRect().x)).toBe(210)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '打开导航菜单', exact: true }).click()
  await expect(sidebar).not.toHaveAttribute('inert', '')
  await page.getByRole('button', { name: '切换工作区', exact: true }).click()
  const popover = page.getByRole('dialog', { name: '工作区切换', exact: true })
  await expect(popover).toBeVisible()
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(popover).toBeHidden()
  await expect(page.getByRole('button', { name: '收起侧边栏', exact: true })).toBeVisible()
})

for (const result of ['workspaces', 'empty'] as const) {
test(`loading workspace popover keeps keyboard access when resolving to ${result}`, async ({ page }) => {
  let releaseWorkspaces!: () => void
  const workspaceGate = new Promise<void>(resolve => { releaseWorkspaces = resolve })
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()).pathname
    if (url === '/api/workspaces') await workspaceGate
    const body = url === '/api/auth/me' ? user : url === '/api/workspaces' ? (result === 'empty' ? [] : workspaces) : { pages: [], blocks: [] }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/#/app/shell-ws-0')
  const trigger = page.getByRole('button', { name: '切换工作区', exact: true })
  try {
    await trigger.press('Enter')
    const popover = page.getByRole('dialog', { name: '工作区切换', exact: true })
    await expect(popover).toBeFocused()
    await expect(popover.getByRole('button', { name: '新建工作区' })).toBeDisabled()
    releaseWorkspaces()
    await expect(popover.getByRole('button', { name: '新建工作区' })).toBeEnabled()
    await page.keyboard.press('Tab')
    await expect(result === 'empty' ? popover.getByRole('button', { name: '新建工作区' }) : popover.getByRole('button').filter({ hasText: '知识工作室' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
  } finally {
    releaseWorkspaces()
  }
})
}
