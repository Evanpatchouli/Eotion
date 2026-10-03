import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { setTimeout as delay } from 'node:timers/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = join(scriptDirectory, '..', '..', '..')
const webDirectory = join(repositoryRoot, 'apps', 'web')
const outputDirectory = join(repositoryRoot, 'apps', 'site', 'public', 'screenshots')
const baseURL = 'http://127.0.0.1:7173'
const webpEncoderAvailable = spawnSync('ffmpeg', ['-hide_banner', '-h', 'encoder=libwebp'], { stdio: 'ignore' }).status === 0
const now = '2026-10-01T12:00:00.000Z'
// All account, workspace, page, and block values below are synthetic public-demo data.
const demoUser = {
  id: 'site-demo-user',
  email: 'hello@eotion.example',
  displayName: 'Eotion',
  createdAt: now,
  updatedAt: now,
}
const demoWorkspace = {
  id: 'site-demo-workspace',
  name: 'Eotion 演示',
  ownerId: demoUser.id,
  createdAt: now,
  updatedAt: now,
}
const demoPage = {
  id: 'site-demo-page',
  workspaceId: demoWorkspace.id,
  parentPageId: null,
  title: '今日记录',
  orderKey: '0000000000000001',
  createdAt: now,
  updatedAt: now,
}

function block(id, order, type, node) {
  return {
    id,
    workspaceId: demoWorkspace.id,
    pageId: demoPage.id,
    parentBlockId: null,
    type,
    orderKey: `000000000000000${order}`,
    createdAt: now,
    updatedAt: now,
    props: { node },
  }
}

const demoBlocks = [
  block('site-demo-heading', 1, 'heading', {
    type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '留一处安静的空间' }],
  }),
  block('site-demo-intro', 2, 'paragraph', {
    type: 'paragraph', content: [{ type: 'text', text: '记录值得留住的想法，把计划和细节轻轻地整理在一起。' }],
  }),
  block('site-demo-list', 3, 'bulleted-list', {
    type: 'bulletList', content: [
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '先写下今天最重要的问题' }] }] },
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '把灵感整理成清晰的下一步' }] }] },
    ],
  }),
  block('site-demo-todo', 4, 'todo', {
    type: 'eotionTodo', attrs: { checked: false }, content: [{ type: 'text', text: '回到这里，继续打磨这个想法' }],
  }),
  block('site-demo-quote', 5, 'quote', {
    type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: '给重要的想法一点空间，它会慢慢显出方向。' }] }],
  }),
  block('site-demo-code', 6, 'code', {
    type: 'codeBlock', attrs: { language: 'text' }, content: [{ type: 'text', text: '收集 → 连接 → 创造' }],
  }),
]

const requireFromWeb = createRequire(join(webDirectory, 'package.json'))
const { chromium } = requireFromWeb('@playwright/test')

async function isWebReady() {
  try {
    const response = await fetch(baseURL, { signal: AbortSignal.timeout(1000) })
    return response.ok
  } catch {
    return false
  }
}

async function startWebIfNeeded() {
  if (await isWebReady()) return null
  const viteEntry = join(webDirectory, 'node_modules', 'vite', 'bin', 'vite.js')
  const server = spawn(process.execPath, [viteEntry, '--host', '127.0.0.1', '--port', '7173', '--strictPort'], {
    cwd: webDirectory,
    stdio: 'inherit',
    windowsHide: true,
  })
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Web dev server exited with code ${server.exitCode}`)
    if (await isWebReady()) return server
    await delay(300)
  }
  server.kill()
  throw new Error('Timed out waiting for the web dev server at 127.0.0.1:7173')
}

async function installDemoApi(page) {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    const json = (status, body) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })

    if (path === '/api/auth/me' && method === 'GET') return json(200, demoUser)
    if (path === '/api/workspaces' && method === 'GET') return json(200, [demoWorkspace])
    if (path === `/api/sync/workspaces/${demoWorkspace.id}/snapshot` && method === 'GET') {
      return json(200, { pages: [demoPage], blocks: demoBlocks })
    }
    if (path === '/api/sync/operations' && method === 'POST') {
      const body = route.request().postDataJSON() ?? {}
      return json(200, { id: body.id ?? 'site-demo-operation', status: 'applied' })
    }
    return json(404, { statusCode: 404, message: 'Not found', error: 'Not Found' })
  })
}

async function capture(browser, { name, width, height, theme, mobile = false }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    colorScheme: theme,
    reducedMotion: 'reduce',
  })
  const page = await context.newPage()
  try {
    await page.clock.install({ time: new Date(now) })
    await page.addInitScript((initialTheme) => localStorage.setItem('eotion:theme', initialTheme), theme)
    await installDemoApi(page)
    await page.goto(`${baseURL}/?visual=site-${name}#/app/${demoWorkspace.id}/page/${demoPage.id}`)
    await page.locator('.eotion-editor-content .tiptap').getByText('留一处安静的空间').waitFor()
    await page.getByRole('status').filter({ hasText: '已同步' }).waitFor()
    await page.evaluate(() => document.fonts.ready)

    const renderedEmail = await page.locator('.product-user-email').textContent()
    if (renderedEmail !== demoUser.email || renderedEmail !== 'hello@eotion.example') {
      throw new Error('The account must show only the declared public demo email.')
    }
    const visibleText = await page.locator('.eotion-editor-content').innerText()
    for (const expected of ['记录值得留住的想法', '回到这里，继续打磨这个想法', '给重要的想法一点空间，它会慢慢显出方向。', '收集 → 连接 → 创造']) {
      if (!visibleText.includes(expected)) throw new Error(`Expected product content is missing: ${expected}`)
    }
    for (const selector of ['h2', 'ul', '.attachment-todo', 'blockquote', 'pre']) {
      if (!(await page.locator(`.eotion-editor-content ${selector}`).count())) {
        throw new Error(`Expected supported editor node is missing: ${selector}`)
      }
    }

    const path = join(outputDirectory, name)
    await page.screenshot({ path, animations: 'disabled', caret: 'hide', scale: 'css' })
    console.log(`Captured ${path}`)
    if (webpEncoderAvailable) {
      const webpPath = path.replace(/\.png$/i, '.webp')
      const conversion = spawnSync('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y', '-i', path,
        '-c:v', 'libwebp', '-preset', 'picture', '-quality', '90', webpPath,
      ], { stdio: 'inherit' })
      if (conversion.status !== 0) throw new Error(`WebP conversion failed for ${path}`)
      console.log(`Converted ${webpPath}`)
    }
  } finally {
    await context.close()
  }
}

await mkdir(outputDirectory, { recursive: true })
let server
let browser
try {
  server = await startWebIfNeeded()
  browser = await chromium.launch({ channel: 'chrome' })
  for (const options of [
    { name: 'product-desktop.png', width: 1440, height: 900, theme: 'light' },
    { name: 'product-desktop-dark.png', width: 1440, height: 900, theme: 'dark' },
    { name: 'product-mobile.png', width: 390, height: 844, theme: 'light', mobile: true },
    { name: 'product-mobile-dark.png', width: 390, height: 844, theme: 'dark', mobile: true },
  ]) {
    await capture(browser, options)
  }
  if (!webpEncoderAvailable) console.log('ffmpeg with libwebp is unavailable; kept the PNG captures only.')
} finally {
  await browser?.close()
  server?.kill()
}
