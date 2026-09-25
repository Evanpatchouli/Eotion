import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

test('Electron renderer uses SQLite through typed preload and survives reload', async () => {
  const profile = mkdtempSync(resolve(tmpdir(), 'eotion-p3-electron-'))
  const executable = process.platform === 'win32' ? 'electron.exe' : process.platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : 'electron'
  const launch = () => electron.launch({
    executablePath: resolve('../desktop/node_modules/electron/dist', executable),
    args: [resolve('../desktop/out/main/index.js'), `--user-data-dir=${profile}`],
    env: { ...process.env, ELECTRON_RENDERER_URL: 'http://127.0.0.1:5173/#/__dev/storage-p3' },
  })
  let app = await launch()
  try {
    const page = await app.firstWindow()
    await expect(page.getByRole('heading', { name: 'P3 本地优先存储' })).toBeVisible()
    await expect(page.getByText('Electron SQLite')).toBeVisible()
    await page.getByRole('button', { name: '创建 / 更新页面' }).click()
    await expect(page.getByRole('heading', { name: 'Pages' }).locator('..')).toContainText('p3-demo-page')
    await page.getByRole('button', { name: '创建 / 更新区块' }).click()
    await expect(page.getByRole('heading', { name: 'Blocks by page' }).locator('..')).toContainText('p3-demo-block')
    await page.reload()
    await expect(page.getByText('Electron SQLite')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Pages' }).locator('..')).toContainText('p3-demo-page')
    await expect(page.getByRole('heading', { name: 'Pending / failed operations (2)' })).toBeVisible()
    await app.close()
    app = await launch()
    const reopened = await app.firstWindow()
    await expect(reopened.getByText('Electron SQLite')).toBeVisible()
    await expect(reopened.getByRole('heading', { name: 'Pages' }).locator('..')).toContainText('p3-demo-page')
    await expect(reopened.getByRole('heading', { name: 'Pending / failed operations (2)' })).toBeVisible()
  } finally {
    await app.close()
    rmSync(profile, { recursive: true, force: true })
  }
})
