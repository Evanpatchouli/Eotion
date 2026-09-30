import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { chromium, expect, test } from '@playwright/test'

test('cached production app shell loads after a full network disconnect and browser restart', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'eotion-offline-shell-'))
  const url = 'http://127.0.0.1:4174/#/login'
  let context = await chromium.launchPersistentContext(userDataDir, { channel: 'chrome' })

  try {
    let page = await context.newPage()
    await page.goto(url)
    await expect(page.locator('#app .app-viewport')).toBeVisible()
    await page.waitForFunction(async () => {
      if (!('serviceWorker' in navigator)) return false
      await navigator.serviceWorker.ready
      return !!navigator.serviceWorker.controller
    })
    const cachedUrls = await page.evaluate(async () => {
      const cacheNames = await caches.keys()
      const entries = await Promise.all(cacheNames.map(async (name) => (await (await caches.open(name)).keys()).map((request) => request.url)))
      return entries.flat()
    })
    expect(cachedUrls.some((cachedUrl) => new URL(cachedUrl).pathname.startsWith('/api/'))).toBe(false)
    expect(cachedUrls.some((cachedUrl) => new URL(cachedUrl).pathname === '/index.html')).toBe(true)

    await context.setOffline(true)
    const offlineResponse = await page.reload()
    expect(offlineResponse?.ok()).toBe(true)
    expect(offlineResponse?.fromServiceWorker()).toBe(true)
    await expect(page.locator('#app .app-viewport')).toBeVisible()

    await context.close()
    context = await chromium.launchPersistentContext(userDataDir, { channel: 'chrome' })
    await context.setOffline(true)
    page = await context.newPage()
    const restartResponse = await page.goto(url)
    expect(restartResponse?.ok()).toBe(true)
    expect(restartResponse?.fromServiceWorker()).toBe(true)
    await expect(page.locator('#app .app-viewport')).toBeVisible()
  } finally {
    await context.close()
    await rm(userDataDir, { recursive: true, force: true })
  }
})
