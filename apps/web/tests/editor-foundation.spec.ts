import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

async function openDemo(page: Page) {
  await page.goto('/#/__dev/editor-foundation')
  await expect(page.getByRole('heading', { name: '文档画布' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '演示文档正文' })).toBeVisible()
}

async function screenshot(page: Page, name: string) {
  const dir = process.env.EOTION_VISUAL_QA_DIR
  if (!dir) return
  await mkdir(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, `${name}.png`), animations: 'disabled', fullPage: true })
}

test('DocumentEditor renders initial JSON, emits keyboard and bold changes, and preserves input objects', async ({ page }) => {
  await openDemo(page)
  const editor = page.getByRole('textbox', { name: '演示文档正文' })
  await expect(editor.locator('h1')).toHaveText('一个安静的画布')
  await expect(page.getByTestId('fixture-evidence')).toHaveAttribute('data-unchanged', 'true')

  await editor.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Control+b')
  await page.keyboard.type(' 粗体验证')
  await expect(editor.locator('strong')).toContainText('粗体验证')
  await expect(editor).toContainText('粗体验证')
  await expect(page.getByTestId('document-json')).toContainText('粗体验证')
  const json = await page.getByTestId('document-json').textContent()
  expect(JSON.parse(json ?? '{}').content.at(-1).content.at(-1).marks).toContainEqual({ type: 'bold' })
  await expect(page.getByTestId('fixture-evidence')).toHaveAttribute('data-unchanged', 'true')
})

test('editable changes dynamically without a content update and focus is exposed', async ({ page }) => {
  await openDemo(page)
  const editor = page.getByRole('textbox', { name: '演示文档正文' })
  const json = page.getByTestId('document-json')
  const initialText = await editor.textContent()
  const initialJson = await json.textContent()
  await page.getByTestId('readonly-toggle').click()
  await expect(editor).toHaveAttribute('contenteditable', 'false')
  await expect(json).toHaveText(initialJson ?? '')
  await editor.click()
  await page.keyboard.type('不可输入')
  await expect(editor).toHaveText(initialText ?? '')
  await expect(json).not.toContainText('不可输入')

  await page.getByTestId('readonly-toggle').click()
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  await page.getByTestId('focus-button').click()
  await expect(editor).toBeFocused()
})

test('reset remounts from the fixture and mount/unmount cleans up without browser errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.setViewportSize({ width: 1440, height: 900 })
  await openDemo(page)
  const editor = page.getByRole('textbox', { name: '演示文档正文' })
  await editor.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' 改动')
  await page.getByTestId('reset-button').click()
  await expect(page.getByRole('textbox', { name: '演示文档正文' }).locator('h1')).toHaveText('一个安静的画布')
  await expect(page.getByTestId('document-json')).not.toContainText('改动')
  await page.getByTestId('mount-toggle').click()
  await expect(page.getByTestId('editor-unmounted')).toBeVisible()
  await page.getByTestId('mount-toggle').click()
  await expect(page.getByRole('textbox', { name: '演示文档正文' })).toBeVisible()
  await screenshot(page, 'editor-foundation-desktop')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('textbox', { name: '演示文档正文' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await screenshot(page, 'editor-foundation-mobile')
  const mobileEditor = page.getByRole('textbox', { name: '演示文档正文' })
  await mobileEditor.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' 移动端输入')
  await expect(page.getByTestId('document-json')).toContainText('移动端输入')
  await expect(mobileEditor).toContainText('移动端输入')
  expect(errors).toEqual([])
})
