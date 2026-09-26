import { expect, test } from '@playwright/test'

const originalViewport = 'width=device-width, initial-scale=1.0, viewport-fit=cover'

for (const [name, allowPageZoom] of [
  ['unset', undefined],
  ['true', 'true'],
  ['false', 'false'],
] as const) {
  test(`Web zoom preferences: ${name}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')

    const result = await page.evaluate(async (allowPageZoom) => {
      const { applyWebRuntimePreferences } = await import('/src/webRuntimePreferences.ts')
      const env = { VITE_ALLOW_PAGE_ZOOM: allowPageZoom }
      applyWebRuntimePreferences(env)
      applyWebRuntimePreferences(env)
      const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
      return {
        viewportCount: document.querySelectorAll('meta[name="viewport"]').length,
        content: viewport?.content,
        hasClass: document.documentElement.classList.contains('eotion-page-zoom-disabled'),
        touchAction: getComputedStyle(document.querySelector('.app-viewport')!).touchAction,
      }
    }, allowPageZoom)

    expect(result.viewportCount).toBe(1)
    expect(result.hasClass).toBe(allowPageZoom === 'false')
    expect(result.touchAction).toBe(allowPageZoom === 'false' ? 'pan-x pan-y' : 'auto')

    if (allowPageZoom === 'false') {
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

test('page zoom preference restores and reapplies after false → true → false', async ({ page }) => {
  await page.goto('/')
  const states = await page.evaluate(async () => {
    const { applyWebRuntimePreferences } = await import('/src/webRuntimePreferences.ts')
    const read = () => ({
      hasClass: document.documentElement.classList.contains('eotion-page-zoom-disabled'),
      content: document.querySelector<HTMLMetaElement>('meta[name="viewport"]')?.content,
      touchAction: getComputedStyle(document.querySelector('.app-viewport')!).touchAction,
    })
    applyWebRuntimePreferences({ VITE_ALLOW_PAGE_ZOOM: 'false' })
    const disabled = read()
    applyWebRuntimePreferences({ VITE_ALLOW_PAGE_ZOOM: 'true' })
    const restored = read()
    applyWebRuntimePreferences({ VITE_ALLOW_PAGE_ZOOM: 'false' })
    return { disabled, restored, reapplied: read() }
  })

  expect(states.disabled).toEqual(states.reapplied)
  expect(states.disabled.hasClass).toBe(true)
  expect(states.disabled.touchAction).toBe('pan-x pan-y')
  expect(states.disabled.content?.match(/maximum-scale/g)).toHaveLength(1)
  expect(states.restored).toEqual({ hasClass: false, content: originalViewport, touchAction: 'auto' })
})

test('zoom preferences preserve the mobile Safe Area layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.evaluate(async () => {
    const { applyWebRuntimePreferences } = await import('/src/webRuntimePreferences.ts')
    applyWebRuntimePreferences({ VITE_ALLOW_PAGE_ZOOM: 'false' })
  })
  await page.addStyleTag({ content: ':root { --safe-top: 47px; --safe-right: 12px; --safe-bottom: 34px; --safe-left: 12px; }' })

  const header = await page.locator('.topbar').boundingBox()
  const document = await page.locator('.document-wrap').boundingBox()
  expect(header!.x).toBe(12)
  expect(header!.y).toBe(47)
  expect(document!.y + document!.height).toBe(810)
  expect(await page.locator('meta[name="viewport"]').getAttribute('content')).toContain('viewport-fit=cover')
})
