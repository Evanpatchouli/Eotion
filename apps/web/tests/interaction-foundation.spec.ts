import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

async function openDemo(page: Page) {
  await page.goto('/#/__dev/interaction-foundation')
  await expect(page.getByRole('heading', { name: '共享交互基础' })).toBeVisible()
}

async function screenshot(page: Page, name: string) {
  const dir = process.env.EOTION_VISUAL_QA_DIR
  if (!dir) return
  await mkdir(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, `${name}.png`), animations: 'disabled' })
}

test('NavItem keeps selection, pressed and keyboard focus distinct; trailing action does not navigate', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openDemo(page)
  const nav = page.getByRole('navigation', { name: '演示导航' })
  const active = nav.getByRole('button', { name: '工作笔记', exact: true })
  const other = nav.getByRole('button', { name: '阅读清单', exact: true })
  const row = other.locator('..')
  await expect(active).toHaveAttribute('aria-current', 'page')
  await expect(active.locator('..')).toHaveCSS('background-color', 'rgb(230, 228, 221)')
  await other.hover()
  await expect(row).toHaveCSS('background-color', 'rgb(238, 237, 232)')
  await page.mouse.down()
  await expect(row).toHaveCSS('background-color', 'rgb(230, 228, 221)')
  await page.mouse.up()
  await expect(other).toHaveAttribute('aria-current', 'page')
  await expect(page.getByTestId('navigation-count')).toHaveText('导航 1 次 · 操作 0 次')
  const action = nav.getByRole('button', { name: '阅读清单操作', exact: true })
  await action.click()
  await expect(page.getByTestId('navigation-count')).toHaveText('导航 1 次 · 操作 1 次')
  await other.focus()
  await page.keyboard.press('Tab')
  await expect(action).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(other).toBeFocused()
  await expect(other).toHaveCSS('outline-style', 'solid')
  await expect(other).toHaveCSS('outline-width', '2px')
  await expect(nav.getByRole('button', { name: '不可用导航', exact: true })).toBeDisabled()
  await expect(nav.getByRole('button', { name: '不可用操作', exact: true, includeHidden: true })).toBeDisabled()
  expect(await nav.locator('button button').count()).toBe(0)
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('navigation-count')).toHaveText('导航 2 次 · 操作 1 次')
  await expect(row).toHaveCSS('height', '32px')
})

test('SyncStatus consumes store states without presenting idle or queued changes as synced', async ({ page }) => {
  await openDemo(page)
  const status = page.locator('.demo-sync [role="status"]')
  for (const [control, state, text] of [
    ['synced', 'synced', '已同步'],
    ['syncing', 'saving', '正在同步…'],
    ['offline', 'offline', '离线 · 本地已保存'],
    ['failed', 'error', '同步失败'],
    ['pending', 'saving', '2 项待同步'],
    ['offline pending', 'offline', '离线 · 本地已保存'],
    ['error pending', 'error', '2 项待同步'],
  ]) {
    await page.getByRole('button', { name: control, exact: true }).click()
    await expect(status).toHaveAttribute('data-state', state!)
    await expect(status).toContainText(text!)
    if (state !== 'synced') await expect(status).not.toContainText('已同步')
  }
  await page.getByRole('button', { name: 'idle', exact: true }).click()
  await expect(status).toHaveAttribute('data-state', 'idle')
  await expect(status).toHaveText('')
})

test('Development sync fixtures stay isolated from product state and in-flight updates', async ({ page }) => {
  await page.goto('/#/__dev/ui-foundation')
  await page.getByTestId('ui-foundation-demo').waitFor()
  await page.evaluate(async () => {
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    useProductSyncStore().$patch({ state: 'offline', pending: 7 })
    location.hash = '#/__dev/interaction-foundation'
  })
  await expect(page.getByRole('heading', { name: '共享交互基础' })).toBeVisible()
  await page.getByRole('button', { name: 'failed', exact: true }).click()
  expect(await page.evaluate(async () => {
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    const store = useProductSyncStore()
    return { state: store.state, pending: store.pending }
  })).toEqual({ state: 'offline', pending: 7 })
  await page.locator('.demo-sync button').click()
  await expect(page.getByTestId('retry-count')).toHaveText('重试 1 次')
  await page.evaluate(async () => {
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    useProductSyncStore().$patch({ state: 'synced', pending: 0 })
  })
  await page.getByRole('button', { name: 'error pending', exact: true }).click()
  await page.evaluate(() => { location.hash = '#/__dev/ui-foundation' })
  await page.getByTestId('ui-foundation-demo').waitFor()
  expect(await page.evaluate(async () => {
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    const store = useProductSyncStore()
    return { state: store.state, pending: store.pending }
  })).toEqual({ state: 'synced', pending: 0 })
})

test('Command Overlay opens with Control/Meta K, traps focus, closes by Escape or model and restores focus', async ({ page }) => {
  await openDemo(page)
  const trigger = page.getByRole('button', { name: '打开命令容器', exact: true })
  const dialog = page.getByRole('dialog', { name: '演示命令容器' })
  const first = dialog.getByRole('button', { name: '关闭容器', exact: true })
  const last = dialog.getByRole('button', { name: '卸载打开的容器', exact: true })
  await trigger.focus()
  await page.keyboard.press('Control+k')
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  expect(await dialog.evaluate(el => el.matches(':modal'))).toBe(true)
  await expect(first).toBeFocused()
  await dialog.evaluate(el => {
    const before = document.createElement('button')
    before.style.visibility = 'hidden'
    before.textContent = '隐藏按钮'
    el.prepend(before)
    const after = document.createElement('button')
    after.tabIndex = -1
    after.textContent = '程序焦点按钮'
    el.append(after)
    const hidden = document.createElement('input')
    hidden.type = 'hidden'
    el.append(hidden)
  })
  await page.keyboard.press('Shift+Tab')
  await expect(last).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(first).toBeFocused()
  await trigger.evaluate(el => (el as HTMLElement).focus())
  await expect(first).toBeFocused()
  await page.keyboard.press('Control+k')
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  await page.keyboard.press('Meta+k')
  await expect(dialog).toBeVisible()
  await first.click()
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  await trigger.click()
  await dialog.evaluate(el => (el as HTMLDialogElement).close())
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('Command handles empty content, initial model open, shortcut opt-out and unmount cleanup', async ({ page }) => {
  await openDemo(page)
  const trigger = page.getByRole('button', { name: '打开命令容器', exact: true })
  const dialog = page.getByRole('dialog', { name: '演示命令容器' })
  await page.getByRole('checkbox', { name: '空容器', exact: true }).check()
  await trigger.click()
  await expect(dialog).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await page.getByRole('checkbox', { name: '空容器', exact: true }).uncheck()
  await page.getByRole('checkbox', { name: '启用快捷键', exact: true }).uncheck()
  await trigger.focus()
  await page.keyboard.press('Control+k')
  await expect(dialog).toBeHidden()
  await trigger.click()
  await dialog.getByRole('button', { name: '卸载打开的容器' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await page.keyboard.press('Control+k')
  await expect(dialog).toHaveCount(0)
  await page.getByRole('button', { name: '挂载并打开', exact: true }).click()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '挂载并打开', exact: true })).toBeFocused()
})

test('Command shortcut ignores composition, repeats, extra modifiers and already handled events', async ({ page }) => {
  await openDemo(page)
  const dialog = page.getByRole('dialog', { name: '演示命令容器' })
  for (const options of [{ isComposing: true }, { repeat: true }, { altKey: true }, { shiftKey: true }]) {
    await page.evaluate(options => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true, ...options })), options)
    await expect(dialog).toBeHidden()
  }
  await page.evaluate(() => {
    const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true })
    event.preventDefault()
    document.dispatchEvent(event)
  })
  await expect(dialog).toBeHidden()
  await page.evaluate(() => {
    const modal = document.createElement('dialog')
    modal.id = 'another-modal'
    modal.textContent = '另一个模态窗口'
    document.body.append(modal)
    modal.showModal()
  })
  await page.keyboard.press('Control+k')
  await expect(dialog).toBeHidden()
  await page.evaluate(() => document.getElementById('another-modal')!.remove())
  await page.keyboard.press('Control+k')
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
})

test('Interaction surfaces render in light/dark and a touch viewport without errors or overflow', async ({ page, browser }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.setViewportSize({ width: 1440, height: 900 })
  await openDemo(page)
  expect(page.url()).toContain('/#/__dev/interaction-foundation')
  await expect(page).toHaveTitle(/Eotion/)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  await page.getByRole('button', { name: '浅色', exact: true }).click()
  await screenshot(page, 'interaction-light')
  await page.getByRole('button', { name: '打开命令容器', exact: true }).click()
  await screenshot(page, 'command-light')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '深色', exact: true }).click()
  await screenshot(page, 'interaction-dark')
  await page.getByRole('button', { name: '打开命令容器', exact: true }).click()
  await screenshot(page, 'command-dark')
  await page.keyboard.press('Escape')
  expect(errors).toEqual([])

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'light' })
  const mobile = await context.newPage()
  try {
    mobile.on('pageerror', error => errors.push(error.message))
    await mobile.goto(`${new URL(page.url()).origin}/#/__dev/interaction-foundation`)
    await expect(mobile.getByRole('heading', { name: '共享交互基础' })).toBeVisible()
    const navButton = mobile.getByRole('button', { name: '工作笔记', exact: true })
    expect((await navButton.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    expect(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await screenshot(mobile, 'interaction-mobile')
    await mobile.getByRole('button', { name: '打开命令容器', exact: true }).click()
    const bounds = await mobile.getByRole('dialog', { name: '演示命令容器' }).boundingBox()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
    await screenshot(mobile, 'command-mobile')
    await mobile.keyboard.press('Escape')
    expect(errors).toEqual([])
  } finally { await context.close() }
})
