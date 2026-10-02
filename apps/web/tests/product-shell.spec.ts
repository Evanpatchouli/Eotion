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

async function openShell(page: Page, withEmoji = true) {
  await page.route('**/api/**', route => {
    const request = route.request()
    const url = new URL(request.url()).pathname
    const body = url === '/api/auth/me' ? user : url === '/api/workspaces' ? workspaces
      : url.endsWith('/snapshot') ? { pages: url.includes(workspaces[0]!.id) ? pages.map(item => withEmoji ? item : { ...item, icon: undefined }) : [], blocks: url.includes(workspaces[0]!.id) ? blocks : [] }
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
  const icon = parent.locator('.product-page-toggle .product-page-icon')
  const toggle = parent.locator('.product-page-toggle')
  const titleBounds = await title.boundingBox()
  const originalUrl = page.url()
  await expect(icon).toBeVisible()
  await expect(icon).toHaveText('📓')
  await row.hover()
  await expect(toggle.locator('svg.product-page-icon')).toBeVisible()
  expect(await title.boundingBox()).toEqual(titleBounds)
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('button', { name: '今日记录', exact: true })).toBeVisible()
  expect(page.url()).toBe(originalUrl)
  await page.mouse.move(800, 22)
  await expect(icon).toBeVisible()
  await expect(icon).toHaveText('📓')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  expect(await title.boundingBox()).toEqual(titleBounds)
  await screenshot(page, 'sidebar-disclosure-default')
  await row.hover()
  await screenshot(page, 'sidebar-disclosure-hover')
  await toggle.focus()
  await expect(toggle).toBeFocused()
  await toggle.press('Space')
  await expect(toggle.locator('svg.product-page-icon')).toBeVisible()
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
  await expect(page.getByRole('menu', { name: '工作笔记 的操作', exact: true })).toBeVisible()
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

test('page disclosure morphs through hover, expansion and mouse leave on one icon instance', async ({ page }) => {
  await openShell(page, false)
  const parent = page.locator('[data-page-id="shell-page-0"]')
  const row = parent.locator('.product-page-row')
  const toggle = parent.locator('.product-page-toggle')
  const title = parent.locator('.product-page-title')
  const svg = toggle.locator('svg.product-page-icon')
  const path = svg.locator('path')
  const titleBounds = await title.boundingBox()
  await expect(svg).toHaveCount(1)
  await svg.evaluate(element => element.setAttribute('data-morph-instance', 'original'))

  const recordMorph = async (action: () => Promise<void>) => {
    await path.evaluate(element => {
      const target = element as SVGPathElement & { morphSamples?: string[]; morphObserver?: MutationObserver }
      target.morphSamples = []
      target.morphObserver = new MutationObserver(() => target.morphSamples!.push(target.getAttribute('d') ?? ''))
      target.morphObserver.observe(target, { attributes: true, attributeFilter: ['d'] })
    })
    await action()
    await page.waitForTimeout(500)
    const samples = await path.evaluate(element => {
      const target = element as SVGPathElement & { morphSamples?: string[]; morphObserver?: MutationObserver }
      target.morphObserver?.disconnect()
      return target.morphSamples ?? []
    })
    expect(new Set(samples).size).toBeGreaterThan(2)
    await expect(svg).toHaveAttribute('data-morph-instance', 'original')
    expect(await title.boundingBox()).toEqual(titleBounds)
    return path.getAttribute('d')
  }

  const fileText = await path.getAttribute('d')
  const chevronRight = await recordMorph(() => row.hover())
  expect(chevronRight).not.toBe(fileText)
  const chevronDown = await recordMorph(() => toggle.click())
  expect(chevronDown).not.toBe(chevronRight)
  const restoredFileText = await recordMorph(() => page.mouse.move(800, 22))
  expect(restoredFileText).toBe(fileText)

  await page.keyboard.press('Tab')
  await page.keyboard.press('Shift+Tab')
  await expect(toggle).toBeFocused()
  await expect.poll(() => path.getAttribute('d')).toBe(chevronDown)
  await page.mouse.click(800, 22)
  await expect.poll(() => path.getAttribute('d')).toBe(fileText)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await row.hover()
  await expect(svg).toHaveAttribute('data-morph-instance', 'original')
  await expect.poll(() => path.getAttribute('d')).toBe(chevronDown)
})

test.describe('touch disclosure', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })
  test('expands without hover or closing the navigation drawer', async ({ page }) => {
    await openShell(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: '打开导航菜单', exact: true }).tap()
    const toggle = page.locator('.product-page-toggle').first()
    await expect(toggle.locator('svg.product-page-icon')).toBeVisible()
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

test('page and workspace context menus float at the pointer, close and stay exclusive', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await openShell(page)
  await expect(page).toHaveTitle(/Eotion/)
  const originalUrl = page.url()
  const tree = page.getByRole('tree')
  const before = await tree.boundingBox()
  const trigger = page.getByRole('button', { name: '页面操作：阅读清单', exact: true })
  const menu = page.getByRole('menu', { name: '阅读清单 的操作', exact: true })
  const workspace = page.getByRole('dialog', { name: '工作区切换', exact: true })
  const workspaceTrigger = page.getByRole('button', { name: '切换工作区', exact: true })
  const row = page.locator('.product-page-node').filter({ has: trigger }).locator('.product-page-row')
  await trigger.click()
  await expect(menu).toBeVisible()
  expect(await tree.boundingBox()).toEqual(before)
  expect(page.url()).toBe(originalUrl)
  const triggerBounds = (await trigger.boundingBox())!
  const menuBounds = (await menu.boundingBox())!
  expect(Math.abs(menuBounds.x - (triggerBounds.x + triggerBounds.width / 2))).toBeLessThanOrEqual(2)
  expect(Math.abs(menuBounds.y - (triggerBounds.y + triggerBounds.height / 2))).toBeLessThanOrEqual(2)
  await screenshot(page, 'page-context-menu')
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(trigger).toBeFocused()
  await row.click({ button: 'right', position: { x: 55, y: 12 } })
  await expect(menu).toBeVisible()
  expect(page.url()).toBe(originalUrl)
  const rowBounds = (await row.boundingBox())!
  expect(Math.abs((await menu.boundingBox())!.x - (rowBounds.x + 55))).toBeLessThanOrEqual(2)
  await row.click({ button: 'right', position: { x: 25, y: 20 } })
  await expect.poll(async () => Math.abs((await menu.boundingBox())!.x - (rowBounds.x + 25))).toBeLessThanOrEqual(2)
  await workspaceTrigger.click()
  await expect(workspace).toBeVisible()
  await expect(menu).toBeHidden()
  expect(await tree.boundingBox()).toEqual(before)
  expect(page.url()).toBe(originalUrl)
  await screenshot(page, 'workspace-context-menu')
  // A right-click produces no document click: exclusivity must not rely on outside click.
  await row.click({ button: 'right' })
  await expect(menu).toBeVisible()
  await expect(workspace).toBeHidden()
  await page.locator('.product-workspace-trigger').click({ button: 'right', position: { x: 80, y: 12 } })
  await expect(workspace).toBeVisible()
  await expect(menu).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(workspace).toBeHidden()
  await workspaceTrigger.click()
  await page.locator('.breadcrumb').click()
  await expect(workspace).toBeHidden()
  await trigger.click()
  await page.locator('.breadcrumb').click()
  await expect(menu).toBeHidden()
  // Keyboard opening keeps the existing ArrowDown path.
  await trigger.press('ArrowDown')
  await expect(menu.getByRole('menuitem', { name: '新建子页面' })).toBeFocused()
  await page.keyboard.press('Escape')
  expect(page.url()).toBe(originalUrl)
  expect(errors).toEqual([])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})

test('page and workspace menu actions share compact icon alignment and interaction states', async ({ page }) => {
  await openShell(page)
  const pageTrigger = page.getByRole('button', { name: '页面操作：阅读清单', exact: true })
  await pageTrigger.press('ArrowDown')
  const menu = page.getByRole('menu', { name: '阅读清单 的操作', exact: true })
  const create = menu.getByRole('menuitem', { name: '新建子页面', exact: true })
  await expect(create).toBeFocused()
  const inspect = async (container: ReturnType<Page['locator']>) => container.locator('.eotion-context-menu__item').evaluateAll(items => items.map(item => {
    const style = getComputedStyle(item)
    const icon = item.querySelector('svg')!.getBoundingClientRect()
    const label = item.querySelector('.eotion-context-menu__label')!.getBoundingClientRect()
    return { height: item.getBoundingClientRect().height, font: style.fontSize, line: style.lineHeight,
      iconWidth: icon.width, iconHeight: icon.height, gap: label.x - icon.right,
      centerOffset: Math.abs((icon.y + icon.height / 2) - (label.y + label.height / 2)) }
  }))
  const pageMetrics = await inspect(menu)
  expect(pageMetrics).toHaveLength(4)
  for (const metric of pageMetrics) {
    expect(metric.height).toBe(28)
    expect(metric.font).toBe('14px')
    expect(metric.line).toBe('20px')
    expect(metric.iconWidth).toBe(16)
    expect(metric.iconHeight).toBe(16)
    expect(metric.gap).toBe(8)
    expect(metric.centerOffset).toBeLessThanOrEqual(1)
  }
  const danger = menu.getByRole('menuitem', { name: '删除', exact: true })
  await expect(danger).toHaveAttribute('data-danger', 'true')
  expect(await danger.evaluate(item => getComputedStyle(item).color)).not.toBe(await create.evaluate(item => getComputedStyle(item).color))
  await page.keyboard.press('ArrowDown')
  const rename = menu.getByRole('menuitem', { name: '重命名', exact: true })
  await expect(rename).toBeFocused()
  expect(await rename.evaluate(item => getComputedStyle(item).outlineStyle)).toBe('solid')
  await danger.hover()
  expect(await danger.evaluate(item => getComputedStyle(item).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '切换工作区', exact: true }).click()
  const workspace = page.getByRole('dialog', { name: '工作区切换', exact: true })
  expect(await inspect(workspace)).toEqual(pageMetrics.slice(0, 2))
  await workspace.getByRole('button', { name: '新建工作区', exact: true }).hover()
  await expect(workspace.getByRole('button', { name: '新建工作区', exact: true })).toBeEnabled()
})

test('context menu bounds clamp at viewport edges and Escape preserves mobile drawer', async ({ page }) => {
  await openShell(page)
  await page.setViewportSize({ width: 390, height: 844 })
  const drawer = page.getByLabel('工作区导航', { exact: true })
  await page.getByRole('button', { name: '打开导航菜单', exact: true }).click()
  for (const target of [page.getByRole('button', { name: '页面操作：阅读清单', exact: true }), page.getByRole('button', { name: '切换工作区', exact: true })]) {
    // Exercise the real DOM event handler with coordinates near either viewport corner.
    for (const point of [{ clientX: 389, clientY: 843 }, { clientX: 1, clientY: 1 }]) {
      await target.dispatchEvent('contextmenu', { ...point, button: 2, bubbles: true })
      const panel = page.locator('.eotion-popover-panel')
      await expect(panel).toBeVisible()
      const bounds = (await panel.boundingBox())!
      expect(bounds.x).toBeGreaterThanOrEqual(0)
      expect(bounds.y).toBeGreaterThanOrEqual(0)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(390)
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(844)
      await page.setViewportSize({ width: 390, height: 600 })
      await expect.poll(async () => { const resized = (await panel.boundingBox())!; return resized.y + resized.height }).toBeLessThanOrEqual(600)
      await page.keyboard.press('Escape')
      await expect(panel).toBeHidden()
      await page.setViewportSize({ width: 390, height: 844 })
      await expect(drawer).toHaveClass(/sidebar--open/)
    }
  }
})
