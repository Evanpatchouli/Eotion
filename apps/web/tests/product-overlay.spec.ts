import { expect, test, type Page } from '@playwright/test'

async function mountOverlay(page: Page, mode: string, navigate = true, longBody = false, withFooter = true, options: { title?: string; label?: string; dismissible?: boolean } = {}) {
  if (navigate) await page.goto('/login')
  await page.evaluate(async ({ mode: initialMode, longBody, withFooter, options }) => {
    const Vue = await import('/node_modules/.vite/deps/vue.js')
    const { default: Overlay } = await import('/src/components/ui/EotionProductOverlay.vue')
    const host = document.createElement('div')
    host.id = 'overlay-test-host'
    document.body.append(host)
    let pageLayer = document.getElementById('eotion-product-page-layer')
    const ownsPageLayer = !pageLayer
    if (!pageLayer) {
      pageLayer = document.createElement('div')
      pageLayer.id = 'eotion-product-page-layer'
      Object.assign(pageLayer.style, { position: 'fixed', inset: '48px 0 0', pointerEvents: 'none' })
      document.body.append(pageLayer)
    }
    const open = Vue.ref(false)
    const overlayMode = Vue.ref(initialMode)
    const app = Vue.createApp({
      setup() { return () => Vue.h('div', [
        Vue.h('button', { id: 'overlay-trigger', onClick: () => { open.value = true } }, '打开'),
        Vue.h('button', { id: 'background-action', onClick: () => { document.body.dataset.backgroundClicked = 'yes' } }, '背景操作'),
        Vue.h(Overlay, { open: open.value, 'onUpdate:open': (value: boolean) => { open.value = value }, mode: overlayMode.value, ...(longBody ? { title: '长内容面板' } : { label: '测试面板' }), ...options }, {
          default: () => [
            Vue.h('input', { id: 'overlay-input', autofocus: true, 'aria-label': '编辑内容' }),
            ...(longBody ? Array.from({ length: 40 }, (_, index) => Vue.h('p', { key: index }, `长内容 ${index + 1}`)) : []),
          ],
          ...(withFooter ? { footer: () => Vue.h('button', { id: 'overlay-footer-action' }, '底部操作') } : {}),
        }),
      ]) },
    })
    app.mount(host)
    Object.assign(window, { overlayTest: { open, mode: overlayMode, unmount: () => { app.unmount(); host.remove(); if (ownsPageLayer) pageLayer?.remove() } } })
  }, { mode, longBody, withFooter, options })
}

async function openProductShell(page: Page) {
  const now = '2026-10-02T00:00:00.000Z'
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    const body = path === '/api/auth/me'
      ? { id: 'overlay-user', email: 'overlay@example.com', displayName: 'Overlay', createdAt: now, updatedAt: now }
      : path === '/api/workspaces'
        ? [{ id: 'overlay-workspace', name: '工作区', ownerId: 'overlay-user', createdAt: now, updatedAt: now }]
        : path.endsWith('/snapshot')
          ? { pages: [{ id: 'overlay-page', workspaceId: 'overlay-workspace', title: '页面', parentPageId: null, orderKey: '0000000000000001', createdAt: now, updatedAt: now }], blocks: [] }
          : { statusCode: 404, message: 'Not found' }
    return route.fulfill({ status: 'statusCode' in body ? 404 : 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/app/overlay-workspace/page/overlay-page')
  await expect(page.getByLabel('工作区导航', { exact: true })).toBeVisible()
}

test('opening model has strict device matrix and separate persistent targets', async ({ page }) => {
  await page.goto('/login')
  const result = await page.evaluate(async () => {
    const model = await import('/src/components/ui/productOverlay.ts')
    const store = (await import('/src/stores/preferences.ts')).usePreferencesStore()
    const modes = Object.fromEntries((['desktop', 'tablet', 'mobile'] as const).map(layout =>
      [layout, model.openingOptions[layout].map(mode => model.resolveOpeningMode({ ...model.defaultDeviceOpeningConfig, [layout]: mode }, layout))]))
    store.setDatabaseOpening('u', 'w', 'd', 'record', 'mobile', 'right-drawer')
    store.setDatabaseOpening('u', 'w', 'd', 'property', 'desktop', 'modal')
    store.setDatabaseOpening('u', 'w', 'd', 'record', 'desktop', 'bottom-drawer' as never)
    return {
      defaults: model.defaultDeviceOpeningConfig,
      modes,
      record: store.databaseOpening('u', 'w', 'd', 'record'),
      property: store.databaseOpening('u', 'w', 'd', 'property'),
      invalid: model.normalizeOpeningConfig({ desktop: 'bottom-drawer', tablet: 'right-drawer', mobile: 'drawer' }),
      saved: localStorage.getItem('eotion:database-opening:u:w:d:record'),
    }
  })
  expect(result.defaults).toEqual({ desktop: 'drawer', tablet: 'drawer', mobile: 'bottom-drawer' })
  expect(result.modes).toEqual({ desktop: ['drawer', 'modal', 'page'], tablet: ['drawer', 'modal', 'page'], mobile: ['right-drawer', 'bottom-drawer', 'modal', 'page'] })
  expect(result.record).toEqual({ desktop: 'drawer', tablet: 'drawer', mobile: 'right-drawer' })
  expect(result.property).toEqual({ desktop: 'modal', tablet: 'drawer', mobile: 'bottom-drawer' })
  expect(result.invalid).toEqual(result.defaults)
  expect(JSON.parse(result.saved!)).toEqual(result.record)
})

test('desktop drawer keeps background interactive and restores focus', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mountOverlay(page, 'drawer')
  await page.locator('#overlay-trigger').click()
  const panel = page.locator('[data-overlay-mode="drawer"]')
  await expect(panel).toBeVisible()
  await expect(panel.locator('.eotion-product-overlay__header h2')).toHaveText('测试面板')
  expect(await panel.evaluate(el => getComputedStyle(el).position)).toBe('fixed')
  expect(await panel.evaluate(el => el.getBoundingClientRect().right)).toBe(1440)
  expect(await panel.getAttribute('aria-modal')).toBeNull()
  expect(await page.evaluate(() => document.documentElement.style.overflow)).not.toBe('hidden')
  expect(await page.locator('dialog[open]').count()).toBe(0)
  await page.locator('#background-action').click()
  expect(await page.locator('body').getAttribute('data-background-clicked')).toBe('yes')
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(page.locator('#overlay-trigger')).toBeFocused()
})

for (const target of [
  { name: 'desktop modal', width: 1440, mode: 'modal' },
  { name: 'desktop drawer', width: 1440, mode: 'drawer' },
  { name: 'phone bottom drawer', width: 390, mode: 'bottom-drawer' },
] as const) {
  test(`${target.name} keeps the header and optional footer outside the scrolling body`, async ({ page }) => {
    await page.setViewportSize({ width: target.width, height: 844 })
    await mountOverlay(page, target.mode, true, true)
    await page.locator('#overlay-trigger').click()
    const surface = target.mode === 'drawer'
      ? page.locator('.eotion-product-overlay--drawer')
      : page.locator(`dialog.eotion-product-overlay--${target.mode}[open]`)
    const header = surface.locator('.eotion-product-overlay__header')
    const body = surface.locator('.eotion-product-overlay__body')
    const footer = surface.locator('.eotion-product-overlay__footer')
    await expect(header.getByRole('heading', { level: 2 })).toHaveText('长内容面板')
    await expect(header.getByRole('button', { name: '关闭' })).toBeVisible()
    await expect(footer.getByRole('button', { name: '底部操作' })).toBeVisible()
    expect(Number.parseFloat(await footer.evaluate(element => getComputedStyle(element).borderTopWidth))).toBeGreaterThan(0)

    const initial = await Promise.all([header.boundingBox(), body.boundingBox(), footer.boundingBox()])
    expect(initial[0]).not.toBeNull()
    expect(initial[1]).not.toBeNull()
    expect(initial[2]).not.toBeNull()
    expect(await body.evaluate(element => getComputedStyle(element).overflowY)).toMatch(/auto|scroll/)
    await body.evaluate(element => { (element as HTMLElement).scrollTop = (element as HTMLElement).scrollHeight })
    await expect.poll(() => body.evaluate(element => (element as HTMLElement).scrollTop)).toBeGreaterThan(0)
    const after = await Promise.all([header.boundingBox(), body.boundingBox(), footer.boundingBox()])
    expect(after[0]!.y).toBe(initial[0]!.y)
    expect(after[2]!.y).toBe(initial[2]!.y)
    expect(await surface.getByRole('heading', { level: 2 }).count()).toBe(1)
  })
}

test('product overlay renders a title header without a footer when the footer slot is omitted', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mountOverlay(page, 'drawer', true, false, false)
  await page.locator('#overlay-trigger').click()
  const surface = page.locator('[data-overlay-mode="drawer"]')
  await expect(surface.locator('.eotion-product-overlay__header').getByRole('heading', { level: 2 })).toHaveText('测试面板')
  await expect(surface.locator('.eotion-product-overlay__footer')).toHaveCount(0)
})

test('title controls the visible heading, label remains the accessible name, and dismissible gates close actions', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mountOverlay(page, 'modal', true, false, false, { title: '标题优先', label: '兼容名称', dismissible: false })
  await page.locator('#overlay-trigger').click()
  const dialog = page.locator('dialog.eotion-product-overlay--modal[open]')
  await expect(dialog.locator('.eotion-product-overlay__header').getByRole('heading', { level: 2 })).toHaveText('标题优先')
  await expect(dialog).toHaveAttribute('aria-label', '兼容名称')
  const close = dialog.getByRole('button', { name: '关闭' })
  await expect(close).toBeDisabled()
  await page.keyboard.press('Escape')
  await page.mouse.click(12, 300)
  await expect(dialog).toBeVisible()
})

test('IME Escape keeps the overlay open until a normal Escape closes it', async ({ page }) => {
  await mountOverlay(page, 'modal')
  await page.locator('#overlay-trigger').click()
  const dialog = page.locator('dialog[open]')
  for (const composition of [{ isComposing: true, keyCode: 27 }, { isComposing: false, keyCode: 229 }]) {
    const prevented = await page.locator('#overlay-input').evaluate((element, state) => {
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, ...state })
      element.dispatchEvent(event)
      return event.defaultPrevented
    }, composition)
    expect(prevented).toBe(true)
    await expect(dialog).toBeVisible()
  }
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('#overlay-trigger')).toBeFocused()
})

for (const mode of ['modal', 'right-drawer', 'bottom-drawer']) {
  test(`${mode} traps focus, locks scroll, closes from Escape and restores focus`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mountOverlay(page, mode)
    await page.locator('#overlay-trigger').click()
    const dialog = page.locator('dialog[open]')
    await expect(dialog).toBeVisible()
    await expect(page.locator('#overlay-input')).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden')
    expect(await dialog.evaluate(el => el.matches(':modal'))).toBe(true)
    expect(await dialog.evaluate(el => getComputedStyle(el, '::backdrop').backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
    const footerAction = dialog.locator('#overlay-footer-action')
    const closeButton = dialog.getByRole('button', { name: '关闭' })
    await footerAction.focus()
    await page.keyboard.press('Tab')
    await expect(closeButton).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(footerAction).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    expect(await page.evaluate(() => document.documentElement.style.overflow)).not.toBe('hidden')
    await expect(page.locator('#overlay-trigger')).toBeFocused()
  })
}

test('desktop modal uses native modal semantics and blocks the background', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mountOverlay(page, 'modal')
  await page.locator('#overlay-trigger').click()
  const dialog = page.locator('dialog[open]')
  await expect(dialog).toBeVisible()
  expect(await dialog.evaluate(el => el.matches(':modal'))).toBe(true)
  expect(await dialog.evaluate(el => getComputedStyle(el, '::backdrop').backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden')
  await page.mouse.click(12, 200)
  expect(await page.locator('body').getAttribute('data-background-clicked')).toBeNull()
})

test('phone drawer size, safe area, close button and light/dark surfaces', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openProductShell(page)
  await page.getByRole('button', { name: '打开导航菜单', exact: true }).click()
  const sidebar = page.getByLabel('工作区导航', { exact: true })
  await expect(sidebar).toHaveClass(/sidebar--open/)
  await mountOverlay(page, 'right-drawer', false)
  await page.locator('#overlay-trigger').evaluate(element => { (element as HTMLElement).focus(); (element as HTMLButtonElement).click() })
  const dialog = page.locator('dialog[open]')
  const [sidebarWidth, drawerWidth] = await Promise.all([
    sidebar.evaluate(element => getComputedStyle(element).width),
    dialog.evaluate(element => getComputedStyle(element).width),
  ])
  expect(drawerWidth).toBe(sidebarWidth)
  expect(drawerWidth).toBe('320px')
  await page.locator('dialog[open] button[aria-label="关闭"]').click()
  await expect(dialog).not.toBeVisible()
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; (window as any).overlayTest.mode.value = 'bottom-drawer' })
  await page.locator('#overlay-trigger').evaluate(element => { (element as HTMLElement).focus(); (element as HTMLButtonElement).click() })
  await expect(dialog).toBeVisible()
  expect(await dialog.locator('.eotion-product-overlay__body').evaluate(el => getComputedStyle(el).paddingBottom)).not.toBe('0px')
  expect(await dialog.locator('.eotion-product-overlay__footer').evaluate(el => getComputedStyle(el).paddingBottom)).not.toBe('0px')
  expect(await page.evaluate(() => [...document.querySelectorAll('style')].some(style => style.textContent?.includes('env(safe-area-inset-bottom)')))).toBe(true)
  const dark = await dialog.evaluate(el => getComputedStyle(el).backgroundColor)
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light' })
  const light = await dialog.evaluate(el => getComputedStyle(el).backgroundColor)
  expect(dark).not.toBe(light)
})

test('masked drawer closes from backdrop click', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mountOverlay(page, 'right-drawer')
  await page.locator('#overlay-trigger').click()
  await expect(page.locator('dialog[open]')).toBeVisible()
  await page.mouse.click(12, 200)
  await expect(page.locator('dialog[open]')).not.toBeVisible()
  await expect(page.locator('#overlay-trigger')).toBeFocused()
})

test('page mode occupies the product page layer, supports Back and does not lock scroll', async ({ page }) => {
  await mountOverlay(page, 'page')
  await page.locator('#overlay-trigger').click()
  const layer = page.locator('#eotion-product-page-layer')
  const surface = layer.locator('[data-overlay-mode="page"]')
  await expect(surface).toBeVisible()
  const [layerBox, surfaceBox] = await Promise.all([layer.boundingBox(), surface.boundingBox()])
  expect(surfaceBox).toEqual(layerBox)
  await expect(surface.getByRole('button', { name: '关闭' })).toHaveText('← 返回')
  expect(await page.locator('dialog[open]').count()).toBe(0)
  expect(await page.evaluate(() => document.documentElement.style.overflow)).not.toBe('hidden')
  await surface.getByRole('button', { name: '关闭' }).click()
  await expect(surface).toHaveCount(0)
  await expect(page.locator('#overlay-trigger')).toBeFocused()
})
