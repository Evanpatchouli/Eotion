import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'

async function openDemo(page: Page) {
  await page.goto('/#/__dev/editor-foundation')
  await expect(page.getByRole('heading', { name: '文档画布' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '演示文档正文' })).toBeVisible()
}

async function pasteHtml(target: Locator, html: string, text: string) {
  await target.click()
  await target.press('Control+End')
  await target.evaluate((element, clipboard) => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/html', clipboard.html)
    clipboardData.setData('text/plain', clipboard.text)
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }))
  }, { html, text })
}

async function screenshot(page: Page, name: string) {
  const dir = process.env.EOTION_VISUAL_QA_DIR
  if (!dir) return
  await mkdir(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, `${name}.png`), animations: 'disabled', fullPage: true })
}

async function resolvedPrimaryTextColor(page: Page) {
  return page.locator('html').evaluate((element) => {
    const token = getComputedStyle(element).getPropertyValue('--e-color-text-primary').trim()
    const probe = document.createElement('span')
    probe.style.color = token
    element.append(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  })
}

async function editorCaretColor(page: Page) {
  return page.locator('.document-editor .tiptap').evaluate((element) => getComputedStyle(element).caretColor)
}

// Chrome resolves the computed caret-color of `auto` to the element color, so the explicit
// declaration on the editor rule is the only signal that separates it from the platform default.
async function editorCaretDeclarations(page: Page) {
  return page.evaluate(() => {
    const found: string[] = []
    const visit = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSStyleRule && rule.selectorText.includes('.tiptap')) {
          const value = rule.style.getPropertyValue('caret-color').trim()
          if (value) found.push(`${rule.selectorText} { caret-color: ${value} }`)
        }
        const nested = (rule as CSSGroupingRule).cssRules
        if (nested) visit(nested)
      }
    }
    for (const sheet of Array.from(document.styleSheets)) {
      try { visit(sheet.cssRules) } catch { /* ignore cross-origin sheets */ }
    }
    return found
  })
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

test('DocumentEditor pastes link and underline HTML as plain text', async ({ page }) => {
  await openDemo(page)
  const editor = page.getByRole('textbox', { name: '演示文档正文' })
  const pastedText = '粘贴内容保持纯文本'
  await pasteHtml(editor, `<p><a href="https://example.com"><u>${pastedText}</u></a></p>`, pastedText)

  await expect(editor).toContainText(pastedText)
  await expect(editor.locator('a, u')).toHaveCount(0)
  await expect(page.getByTestId('document-json')).toContainText(pastedText)
  const json = JSON.parse((await page.getByTestId('document-json').textContent()) ?? '{}')
  expect(JSON.stringify(json)).not.toMatch(/"type"\s*:\s*"(link|underline)"/)
})

test('mutating an emitted JSON snapshot does not change the editor document', async ({ page }) => {
  await openDemo(page)
  const editor = page.getByRole('textbox', { name: '演示文档正文' })
  await editor.click()
  await editor.press('Control+End')
  await editor.pressSequentially(' 输出隔离')
  await expect(page.getByTestId('document-json')).toContainText('输出隔离')

  await page.getByTestId('mutate-snapshot-button').click()
  await expect(page.getByTestId('document-json')).toContainText('仅输出快照')
  await expect(editor).not.toContainText('仅输出快照')

  await editor.click()
  await editor.press('Control+End')
  await editor.pressSequentially(' 再次更新')
  await expect(page.getByTestId('document-json')).toContainText('再次更新')
  await expect(page.getByTestId('document-json')).not.toContainText('仅输出快照')
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

test('editor caret color is declared from the primary text token in light and dark themes', async ({ page }) => {
  await openDemo(page)

  const declarations = await editorCaretDeclarations(page)
  expect(declarations.some(rule => rule.includes('caret-color: var(--e-color-text-primary)'))).toBe(true)

  const light = await resolvedPrimaryTextColor(page)
  expect(await editorCaretColor(page)).toBe(light)

  await page.evaluate(async () => (await import('/src/theme.ts')).setThemePreference('dark'))
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  const dark = await resolvedPrimaryTextColor(page)
  expect(dark).not.toBe(light)
  expect(await editorCaretColor(page)).toBe(dark)
})
