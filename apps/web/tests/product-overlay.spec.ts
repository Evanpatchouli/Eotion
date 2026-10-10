import { expect, test, type Page } from '@playwright/test'

async function mountOverlay(page: Page, mode: string) {
  await page.goto('/login')
  await page.evaluate(async (initialMode) => {
    const Vue = await import('/node_modules/.vite/deps/vue.js')
    const { default: Overlay } = await import('/src/components/ui/EotionProductOverlay.vue')
    const host = document.createElement('div')
    host.id = 'overlay-test-host'
    document.body.append(host)
    const pageLayer = document.createElement('div')
    pageLayer.id = 'eotion-product-page-layer'
    Object.assign(pageLayer.style, { position: 'fixed', inset: '48px 0 0', pointerEvents: 'none' })
    document.body.append(pageLayer)
    const open = Vue.ref(false)
    const overlayMode = Vue.ref(initialMode)
    const app = Vue.createApp({
      setup() { return () => Vue.h('div', [
        Vue.h('button', { id: 'overlay-trigger', onClick: () => { open.value = true } }, '打开'),
        Vue.h('button', { id: 'background-action', onClick: () => { document.body.dataset.backgroundClicked = 'yes' } }, '背景操作'),
        Vue.h(Overlay, { open: open.value, 'onUpdate:open': (value: boolean) => { open.value = value }, mode: overlayMode.value, label: '测试面板' }, {
          default: () => Vue.h('input', { id: 'overlay-input', autofocus: true, 'aria-label': '编辑内容' }),
        }),
      ]) },
    })
    app.mount(host)
    Object.assign(window, { overlayTest: { open, mode: overlayMode, unmount: () => { app.unmount(); host.remove(); pageLayer.remove() } } })
  }, mode)
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
  expect(await panel.evaluate(el => getComputedStyle(el).position)).toBe('fixed')
  expect(await page.evaluate(() => document.documentElement.style.overflow)).not.toBe('hidden')
  expect(await page.locator('dialog[open]').count()).toBe(0)
  await page.locator('#background-action').click()
  expect(await page.locator('body').getAttribute('data-background-clicked')).toBe('yes')
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
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
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => document.activeElement?.closest('dialog')?.open)).toBe(true)
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    expect(await page.evaluate(() => document.documentElement.style.overflow)).not.toBe('hidden')
    await expect(page.locator('#overlay-trigger')).toBeFocused()
  })
}

test('phone drawer size, safe area, close button and light/dark surfaces', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mountOverlay(page, 'right-drawer')
  await page.locator('#overlay-trigger').click()
  const dialog = page.locator('dialog[open]')
  expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(390 * 0.85 + 1)
  await page.locator('dialog[open] button[aria-label="关闭"]').click()
  await expect(dialog).not.toBeVisible()
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; (window as any).overlayTest.mode.value = 'bottom-drawer' })
  await page.locator('#overlay-trigger').click()
  await expect(dialog).toBeVisible()
  expect(await dialog.evaluate(el => getComputedStyle(el).paddingBottom)).not.toBe('0px')
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
