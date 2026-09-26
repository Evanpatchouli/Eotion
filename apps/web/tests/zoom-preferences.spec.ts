import { expect, test } from '@playwright/test'

const originalViewport = 'width=device-width, initial-scale=1.0, viewport-fit=cover'

for (const [name, doubleTap, pinch] of [
  ['unset', undefined, undefined],
  ['both false', 'false', 'false'],
  ['double-tap only', 'true', 'false'],
  ['pinch only', 'false', 'true'],
  ['both true', 'true', 'true'],
] as const) {
  test(`Web zoom preferences: ${name}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')

    const result = await page.evaluate(async ({ doubleTap, pinch }) => {
      const { applyWebRuntimePreferences } = await import('/src/webRuntimePreferences.ts')
      const env = { VITE_DISABLE_DOUBLE_TAP_ZOOM: doubleTap, VITE_DISABLE_PINCH_ZOOM: pinch }
      applyWebRuntimePreferences(env)
      applyWebRuntimePreferences(env)
      const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
      return {
        viewportCount: document.querySelectorAll('meta[name="viewport"]').length,
        content: viewport?.content,
        hasClass: document.documentElement.classList.contains('eotion-disable-double-tap-zoom'),
        touchAction: getComputedStyle(document.documentElement).touchAction,
      }
    }, { doubleTap, pinch })

    expect(result.viewportCount).toBe(1)
    expect(result.hasClass).toBe(doubleTap === 'true')
    if (doubleTap === 'true') expect(result.touchAction).toBe('manipulation')
    else expect(result.touchAction).not.toBe('manipulation')

    if (pinch === 'true') {
      expect(result.content).toContain('width=device-width')
      expect(result.content).toContain('initial-scale=1.0')
      expect(result.content).toContain('viewport-fit=cover')
      expect(result.content).toContain('maximum-scale=1.0')
      expect(result.content).toContain('user-scalable=no')
      expect(result.content?.match(/maximum-scale/g)).toHaveLength(1)
      expect(result.content?.match(/user-scalable/g)).toHaveLength(1)
    } else {
      expect(result.content).toBe(originalViewport)
    }

    await page.locator('.mobile-menu').click()
    await expect(page.locator('.sidebar')).toHaveClass(/sidebar--open/)
  })
}

test('zoom preferences preserve the mobile Safe Area layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.evaluate(async () => {
    const { applyWebRuntimePreferences } = await import('/src/webRuntimePreferences.ts')
    applyWebRuntimePreferences({ VITE_DISABLE_DOUBLE_TAP_ZOOM: 'true', VITE_DISABLE_PINCH_ZOOM: 'true' })
  })
  await page.addStyleTag({ content: ':root { --safe-top: 47px; --safe-right: 12px; --safe-bottom: 34px; --safe-left: 12px; }' })

  const header = await page.locator('.topbar').boundingBox()
  const document = await page.locator('.document-wrap').boundingBox()
  expect(header!.x).toBe(12)
  expect(header!.y).toBe(47)
  expect(document!.y + document!.height).toBe(810)
  expect(await page.locator('meta[name="viewport"]').getAttribute('content')).toContain('viewport-fit=cover')
})
