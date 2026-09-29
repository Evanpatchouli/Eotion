import { expect, test } from '@playwright/test'

const demoRoutes = [
  { path: '/__dev/mobile-p1', title: '移动端 P1 演示', heading: '移动端能力实验页' },
  { path: '/__dev/editor-p2', title: '编辑器 P2 演示', heading: 'Tiptap 3 编辑器概念验证' },
  { path: '/__dev/storage-p3', title: '本地存储 P3 演示', heading: 'P3 本地优先存储' },
] as const

test('home and all dev routes render inside the shared workspace layout', async ({ page }) => {
  await page.goto('/#/__dev/workspace')
  await expect(page.locator('.workspace-shell .sidebar')).toBeVisible()
  await expect(page.locator('.workspace-shell .main-pane .topbar')).toBeVisible()
  await expect(page.locator('.document-wrap .document h1')).toHaveText('欢迎使用 Eotion')
  await expect(page.locator('.breadcrumb')).toHaveText('私有空间 / 欢迎使用 Eotion')

  await page.getByRole('button', { name: '架构决策' }).click()
  await expect(page.locator('.document h1')).toHaveText('架构决策')
  await expect(page.locator('.breadcrumb')).toHaveText('私有空间 / 架构决策')

  for (const demo of demoRoutes) {
    await page.goto(`/#${demo.path}`)
    await expect(page.locator('.workspace-shell .sidebar')).toBeVisible()
    await expect(page.locator('.workspace-shell .main-pane .topbar')).toBeVisible()
    await expect(page.locator('.document-wrap').getByRole('heading', { name: demo.heading })).toBeVisible()
    await expect(page.locator('.breadcrumb')).toHaveText(`私有空间 / ${demo.title}`)
  }
})

test('mobile drawer closes after navigation and dev routes switch within the layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/__dev/workspace')

  await page.locator('.mobile-menu').click()
  await expect(page.locator('.sidebar')).toHaveClass(/sidebar--open/)
  await page.locator('.sidebar-close').click()
  await expect(page.locator('.sidebar')).not.toHaveClass(/sidebar--open/)

  for (const demo of demoRoutes) {
    await page.locator('.mobile-menu').click()
    await page.getByRole('link', { name: demo.title }).click()
    await expect(page).toHaveURL(new RegExp(`#${demo.path}$`))
    await expect(page.locator('.sidebar')).not.toHaveClass(/sidebar--open/)
    await expect(page.locator('.document-wrap').getByRole('heading', { name: demo.heading })).toBeVisible()
  }

  await page.locator('.mobile-menu').click()
  await page.getByRole('button', { name: 'Roadmap' }).click()
  await expect(page).toHaveURL(/#\/__dev\/workspace$/)
  await expect(page.locator('.sidebar')).not.toHaveClass(/sidebar--open/)
  await expect(page.locator('.document h1')).toHaveText('Roadmap')
})

test('P3 long content scrolls in the shared document area', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 })
  await page.goto('/#/__dev/storage-p3')
  await expect(page.locator('.document-wrap .p3-demo')).toBeVisible()

  const before = await page.evaluate(() => {
    const app = document.querySelector<HTMLElement>('.app-viewport')!
    const content = document.querySelector<HTMLElement>('.document-wrap')!
    return {
      appScrollHeight: app.scrollHeight,
      appClientHeight: app.clientHeight,
      contentScrollHeight: content.scrollHeight,
      contentClientHeight: content.clientHeight,
    }
  })
  expect(before.contentScrollHeight).toBeGreaterThan(before.contentClientHeight)
  expect(before.appScrollHeight).toBe(before.appClientHeight)

  await page.locator('.document-wrap').evaluate((content) => { content.scrollTop = 300 })
  const after = await page.evaluate(() => ({
    contentTop: document.querySelector<HTMLElement>('.document-wrap')!.scrollTop,
    appTop: document.querySelector<HTMLElement>('.app-viewport')!.scrollTop,
    rootTop: document.documentElement.scrollTop,
  }))
  expect(after.contentTop).toBeGreaterThan(0)
  expect(after.appTop).toBe(0)
  expect(after.rootTop).toBe(0)
})
