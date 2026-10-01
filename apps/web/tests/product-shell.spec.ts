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
