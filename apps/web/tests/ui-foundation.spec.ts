import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { expect, test, type Page } from '@playwright/test'

const lightPalette: Record<string, string> = {
  canvas: '#FAF9F6', sidebar: '#F5F4F0', surface: '#FFFFFF', 'surface-subtle': '#F7F6F3', elevated: '#FFFFFF',
  hover: '#EEEDE8', selected: '#E6E4DD', focus: '#3D3C38', border: '#E8E6E1', 'border-subtle': '#EFEEE9',
  'text-primary': '#1F1F1E', 'text-secondary': '#5A5852', 'text-muted': '#706E67', accent: '#3D3C38',
  success: '#4B6B54', warning: '#9E6B34', danger: '#A8423F',
}

const darkPalette: Record<string, string> = {
  canvas: '#1C1B1A', sidebar: '#181716', surface: '#242321', 'surface-subtle': '#22211F', elevated: '#242321',
  hover: '#2B2A27', selected: '#33322E', focus: '#C8C5BD', border: '#2E2D2A', 'border-subtle': '#262522',
  'text-primary': '#EDECE8', 'text-secondary': '#A3A199', 'text-muted': '#8F8D86', accent: '#EDECE8',
  success: '#6E9B7B', warning: '#C28D52', danger: '#D06A66',
}

async function readPalette(page: Page) {
  return page.locator('html').evaluate((element) => {
    const style = getComputedStyle(element)
    return Object.fromEntries(
      ['canvas', 'sidebar', 'surface', 'surface-subtle', 'elevated', 'hover', 'selected', 'focus', 'border', 'border-subtle', 'text-primary', 'text-secondary', 'text-muted', 'accent', 'success', 'warning', 'danger']
        .map((token) => [token, style.getPropertyValue(`--e-color-${token}`).trim()]),
    )
  })
}

async function readShowcaseColors(page: Page) {
  return page.evaluate(() => {
    const primary = document.querySelector<HTMLButtonElement>('.eotion-button--primary')!
    const secondary = document.querySelector<HTMLButtonElement>('.eotion-button--secondary')!
    const enabledSwitch = document.querySelector<HTMLButtonElement>('.eotion-switch[aria-label="演示开关"]')!
    const thumb = enabledSwitch.querySelector<HTMLElement>('.eotion-switch__thumb')!
    const primaryStyle = getComputedStyle(primary)
    const secondaryStyle = getComputedStyle(secondary)
    return {
      primaryBackground: primaryStyle.backgroundColor,
      primaryText: primaryStyle.color,
      secondaryBackground: secondaryStyle.backgroundColor,
      secondaryText: secondaryStyle.color,
      switchTrackColor: getComputedStyle(thumb).backgroundColor,
      switchThumbTransform: getComputedStyle(thumb, '::after').transform,
    }
  })
}

test('DEV 页面独立展示七个基础组件、精确主题 token 并保持 geometry', async ({ page }) => {
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/#/__dev/ui-foundation')

  const demo = page.getByTestId('ui-foundation-demo')
  await expect(demo).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Quiet Studio 基础组件' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '按钮与输入' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Surface 层级' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '排版比例' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Popover' })).toBeVisible()
  await expect(page.locator('.workspace-shell, .product-shell')).toHaveCount(0)

  const input = page.getByRole('textbox', { name: '演示输入框' })
  await expect(input).toHaveAttribute('name', 'demo-input')
  await expect(input).toHaveAttribute('placeholder', '输入内容')
  await input.fill('原生 input 属性')
  await expect(input).toHaveValue('原生 input 属性')
  await expect(page.getByRole('button', { name: '新增条目' })).toBeVisible()
  const disabledButton = page.getByRole('button', { name: '不可用' })
  await expect(disabledButton).toBeDisabled()

  const switchControl = page.getByRole('switch', { name: '演示开关', exact: true })
  await switchControl.focus()
  await page.keyboard.press('Space')
  await expect(switchControl).toHaveAttribute('aria-checked', 'false')
  const disabledSwitch = page.getByRole('switch', { name: '禁用的演示开关' })
  await expect(disabledSwitch).toBeDisabled()
  await page.getByRole('button', { name: '主要操作' }).focus()
  await disabledSwitch.focus()
  await expect(page.getByRole('button', { name: '主要操作' })).toBeFocused()
  await page.keyboard.press('Space')
  await expect(disabledSwitch).toHaveAttribute('aria-checked', 'false')
  await expect(switchControl).toHaveAttribute('aria-checked', 'false')

  await page.getByRole('radio', { name: '浅色' }).check()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(await readPalette(page)).toEqual(lightPalette)
  const geometry = await page.locator('.ui-foundation-demo__content').evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const samples = [...element.querySelectorAll('h1, h2, .ui-foundation-demo__panel, .ui-foundation-demo__surface-grid, .ui-foundation-demo__type-samples')]
    return [rect.width, rect.height, ...samples.flatMap((sample) => {
      const box = sample.getBoundingClientRect()
      return [box.x, box.y, box.width, box.height]
    })]
  })

  await page.getByRole('radio', { name: '深色' }).check()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await readPalette(page)).toEqual(darkPalette)
  expect(await page.locator('.ui-foundation-demo__content').evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const samples = [...element.querySelectorAll('h1, h2, .ui-foundation-demo__panel, .ui-foundation-demo__surface-grid, .ui-foundation-demo__type-samples')]
    return [rect.width, rect.height, ...samples.flatMap((sample) => {
      const box = sample.getBoundingClientRect()
      return [box.x, box.y, box.width, box.height]
    })]
  })).toEqual(geometry)

  await page.getByRole('radio', { name: '跟随系统' }).check()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(await page.evaluate(() => localStorage.getItem('eotion:theme'))).toBe('system')

  const visualQaDir = process.env.EOTION_VISUAL_QA_DIR
  if (visualQaDir) {
    await mkdir(visualQaDir, { recursive: true })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await switchControl.click()
    await expect(switchControl).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('radio', { name: '浅色' }).check()
    await expect.poll(() => readShowcaseColors(page)).toEqual({
      primaryBackground: 'rgb(61, 60, 56)', primaryText: 'rgb(250, 249, 246)',
      secondaryBackground: 'rgb(255, 255, 255)', secondaryText: 'rgb(31, 31, 30)',
      switchTrackColor: 'rgb(61, 60, 56)', switchThumbTransform: 'matrix(1, 0, 0, 1, 16, 0)',
    })
    await page.screenshot({ path: path.join(visualQaDir, 'desktop-light.png'), fullPage: true })
    await page.getByRole('radio', { name: '深色' }).check()
    await expect.poll(() => readShowcaseColors(page)).toEqual({
      primaryBackground: 'rgb(237, 236, 232)', primaryText: 'rgb(28, 27, 26)',
      secondaryBackground: 'rgb(36, 35, 33)', secondaryText: 'rgb(237, 236, 232)',
      switchTrackColor: 'rgb(237, 236, 232)', switchThumbTransform: 'matrix(1, 0, 0, 1, 16, 0)',
    })
    await page.screenshot({ path: path.join(visualQaDir, 'desktop-dark.png'), fullPage: true })
  }

  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('Popover supports keyboard navigation, focus return, outside close, viewport bounds and scroll tracking', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/#/__dev/ui-foundation')
  const trigger = page.getByRole('button', { name: '打开组件菜单' })
  const viewport = page.locator('.app-viewport')
  await trigger.evaluate((element) => {
    Object.assign((element as HTMLElement).style, { position: 'fixed', bottom: '16px', left: '50%', transform: 'translateX(-50%)', zIndex: '2' })
  })
  await trigger.click()
  const menu = page.getByRole('menu', { name: '组件菜单' })
  await expect(menu).toBeVisible()
  const items = menu.getByRole('menuitem')
  await expect(trigger).toHaveAttribute('aria-controls', /.+/)
  await expect(menu).toHaveAttribute('data-placement', 'top')
  await expect(items.nth(0)).toBeFocused()
  expect(await menu.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(90)
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await trigger.press('ArrowUp')
  await expect(items.nth(2)).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await trigger.press('ArrowDown')
  await expect(items.nth(0)).toBeFocused()
  await page.keyboard.press('Escape')
  await trigger.click()
  const input = page.getByRole('textbox', { name: '演示输入框' })
  await input.click()
  await expect(menu).toBeHidden()
  await expect(input).toBeFocused()
  await input.fill('outside click keeps input focus')
  await expect(input).toHaveValue('outside click keeps input focus')
  await trigger.evaluate((element) => element.removeAttribute('style'))

  await viewport.evaluate((element) => { element.scrollTop = element.scrollHeight })
  await trigger.scrollIntoViewIfNeeded()
  const layoutBeforeOpen = await page.evaluate(() => {
    const content = document.querySelector('.ui-foundation-demo__content')!.getBoundingClientRect()
    const popoverTrigger = document.querySelector('.eotion-popover-anchor button')!.getBoundingClientRect()
    return [content.x, content.y, content.width, content.height, popoverTrigger.x, popoverTrigger.y, popoverTrigger.width, popoverTrigger.height, document.querySelector('.app-viewport')!.scrollHeight]
  })
  await trigger.click()
  await expect(menu).toBeVisible()
  expect(await page.evaluate(() => {
    const content = document.querySelector('.ui-foundation-demo__content')!.getBoundingClientRect()
    const popoverTrigger = document.querySelector('.eotion-popover-anchor button')!.getBoundingClientRect()
    return [content.x, content.y, content.width, content.height, popoverTrigger.x, popoverTrigger.y, popoverTrigger.width, popoverTrigger.height, document.querySelector('.app-viewport')!.scrollHeight]
  })).toEqual(layoutBeforeOpen)

  const panel = page.locator('.eotion-popover-panel')
  const beforeScroll = await panel.evaluate((element) => element.getBoundingClientRect().top)
  const oldScroll = await viewport.evaluate((element) => element.scrollTop)
  await viewport.evaluate((element) => { element.scrollTop = Math.max(0, element.scrollTop - 90) })
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).not.toBe(oldScroll)
  await expect.poll(() => panel.evaluate((element) => element.getBoundingClientRect().top)).not.toBe(beforeScroll)
  const bounds = await panel.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
  })
  expect(bounds.left).toBeGreaterThanOrEqual(0)
  expect(bounds.top).toBeGreaterThanOrEqual(0)
  expect(bounds.right).toBeLessThanOrEqual(1440)
  expect(bounds.bottom).toBeLessThanOrEqual(900)

  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('演示页没有改动正式 Settings 的旧 token 与既有详情宽度', async ({ page }) => {
  await page.route('**/api/**', (route) => {
    const pathName = new URL(route.request().url()).pathname
    const body = pathName === '/api/auth/me'
      ? { id: 'foundation-user', email: 'foundation@example.com', displayName: 'Foundation user', createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T00:00:00.000Z' }
      : pathName === '/api/workspaces' ? [] : { statusCode: 404, message: 'Not found' }
    return route.fulfill({ status: pathName === '/api/auth/me' || pathName === '/api/workspaces' ? 200 : 404, contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/#/settings/appearance')
  await expect(page.locator('.settings-page h1')).toHaveText('外观')
  const oldTokens = await page.locator('html').evaluate((element) => {
    const style = getComputedStyle(element)
    return ['--surface', '--surface-muted', '--text-primary', '--border'].map((token) => style.getPropertyValue(token).trim())
  })
  expect(oldTokens).toEqual(['#fff', '#f7f7f5', '#242424', '#ecebe8'])
  const navWidth = await page.locator('.settings-nav').evaluate((element) => element.getBoundingClientRect().width)
  const pageWidth = await page.locator('.settings-page').evaluate((element) => element.getBoundingClientRect().width)
  expect(navWidth).toBe(254)
  expect(pageWidth).toBe(692)
})

test('danger controls retain AA text contrast with the frozen palette in both themes and hover states', async ({ page }) => {
  await page.goto('/#/__dev/ui-foundation')
  const contrast = async (selector: string) => page.locator(selector).evaluate((element) => {
    const style = getComputedStyle(element)
    const luminance = (color: string) => {
      const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((value) => {
        const channel = value / 255
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
      })
      return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
    }
    const foreground = luminance(style.color)
    const background = luminance(style.backgroundColor)
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
  })

  for (const theme of ['浅色', '深色']) {
    await page.getByRole('radio', { name: theme, exact: true }).check()
    const danger = page.locator('.eotion-button--danger')
    await expect.poll(() => contrast('.eotion-button--danger')).toBeGreaterThanOrEqual(4.5)
    await danger.hover()
    await expect.poll(() => contrast('.eotion-button--danger')).toBeGreaterThanOrEqual(4.5)
    await page.getByRole('button', { name: '打开组件菜单' }).click()
    const menuDanger = page.getByRole('menuitem', { name: '删除条目' })
    await expect(menuDanger).toBeVisible()
    await expect.poll(() => contrast('.ui-foundation-demo__menu [data-danger="true"]')).toBeGreaterThanOrEqual(4.5)
    await menuDanger.hover()
    await expect.poll(() => contrast('.ui-foundation-demo__menu [data-danger="true"]')).toBeGreaterThanOrEqual(4.5)
    await page.keyboard.press('Escape')
  }
})
