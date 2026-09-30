import { expect, test, type Page, type Route } from '@playwright/test'
import type { AuthUserDto, BlockResponse, PageResponse, WorkspaceResponse } from '@eotion/contracts'

const now = '2026-09-30T00:00:00.000Z'
const later = '2027-09-30T00:00:00.000Z'
const user: AuthUserDto = { id: 'attachment-user', email: 'attachment@example.com', createdAt: now, updatedAt: now }
const workspace: WorkspaceResponse = { id: 'attachment-workspace', name: '附件工作区', ownerId: user.id, createdAt: now, updatedAt: now }
const pageRecord: PageResponse = { id: 'attachment-page', workspaceId: workspace.id, parentPageId: null, title: '附件页面', orderKey: '0000000000000001', createdAt: now, updatedAt: now }

function block(id: string, order: number, node: Record<string, unknown>): BlockResponse {
  const type = node.type === 'eotionImage' ? 'image' : node.type === 'eotionFile' ? 'file' : node.type === 'heading' ? 'heading' : 'paragraph'
  return { id, pageId: pageRecord.id, workspaceId: workspace.id, parentBlockId: null, type, orderKey: String(order).padStart(16, '0'), props: { node }, createdAt: now, updatedAt: now }
}

type Attachment = { id: string; workspaceId: string; name: string; mimeType: string; size: number; url: string; objectKey?: string }
type RecordedRequest = { method: string; path: string; body?: any; contentType?: string; fileId?: string; fileName?: string }
type Controls = { uploadStatus: number; uploadDelayMs: number; holdUploads: boolean; holdUploadResponse: boolean; holdCleanupDeletes: boolean; abortedUploads: number; uploadStatuses: number[]; operationStatus: number; cleanupStatus: number; online: boolean }

async function installApi(page: Page, initialBlocks: BlockResponse[] = []) {
  const pages = [pageRecord]
  const blocks = [...initialBlocks]
  const files = new Map<string, Attachment>()
  const requests: RecordedRequest[] = []
  const controls: Controls = { uploadStatus: 201, uploadDelayMs: 0, holdUploads: false, holdUploadResponse: false, holdCleanupDeletes: false, abortedUploads: 0, uploadStatuses: [], operationStatus: 200, cleanupStatus: 204, online: true }
  const cleanupDeleteReleases: Array<() => void> = []
  const uploadResponseReleases: Array<() => void> = []
  const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  const apiError = (status: number, message: string) => ({ statusCode: status, message, error: status === 401 ? 'Unauthorized' : 'Internal Server Error' })
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  page.on('requestfailed', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === `/api/workspaces/${workspace.id}/files`) controls.abortedUploads += 1
  })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => (window as any).__eotionOnline !== false })
    const revoke = URL.revokeObjectURL.bind(URL)
    ;(window as any).__revokedObjectUrls = []
    URL.revokeObjectURL = (url: string) => { (window as any).__revokedObjectUrls.push(url); revoke(url) }
  })
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    let body: any
    if (request.postData()) { try { body = request.postDataJSON() } catch { body = undefined } }
    const contentType = request.headers()['content-type']
    requests.push({ method, path, body, contentType, fileId: request.headers()['x-eotion-file-id'], fileName: request.headers()['x-eotion-file-name'] })

    if (path === '/api/auth/me' && method === 'GET') return json(route, 200, user)
    if (path === '/api/workspaces' && method === 'GET') return json(route, 200, [workspace])
    if (path === `/api/sync/workspaces/${workspace.id}/snapshot` && method === 'GET') return json(route, 200, { pages, blocks })
    if (path === `/api/workspaces/${workspace.id}/files` && method === 'POST') {
      if (contentType !== 'application/octet-stream') throw new Error(`Expected raw file upload, received ${contentType}`)
      if (controls.holdUploads) await wait(800)
      if (controls.uploadDelayMs) await wait(controls.uploadDelayMs)
      if (controls.holdUploadResponse) await new Promise<void>((resolve) => uploadResponseReleases.push(resolve))
      const status = controls.uploadStatuses.shift() ?? controls.uploadStatus
      if (status !== 201 && status !== 200) return json(route, status, apiError(status, status === 413 ? '上传文件超过服务器限制。' : status === 401 ? 'Session expired' : 'Unavailable'))
      const id = decodeURIComponent(request.headers()['x-eotion-file-id'] ?? `file-${files.size + 1}`)
      const name = decodeURIComponent(request.headers()['x-eotion-file-name'] ?? 'upload.bin')
      const mimeType = decodeURIComponent(request.headers()['x-eotion-file-mime-type'] ?? 'application/octet-stream')
      const metadata: Attachment = { id, workspaceId: workspace.id, name, mimeType, size: 24, url: `https://objects.example.test/${id}`, objectKey: `objects/${id}` }
      files.set(id, metadata)
      return json(route, status, metadata)
    }
    if (path === `/api/workspaces/${workspace.id}/files` && method === 'GET') return json(route, 200, [...files.values()])
    if (path.startsWith(`/api/workspaces/${workspace.id}/files/`) && method === 'GET') {
      const id = decodeURIComponent(path.split('/').at(-1)!)
      const file = files.get(id)
      return file ? json(route, 200, file) : json(route, 404, apiError(404, 'Not found'))
    }
    if (path.startsWith(`/api/workspaces/${workspace.id}/files/`) && method === 'DELETE') {
      const id = decodeURIComponent(path.split('/').at(-1)!)
      if (controls.holdCleanupDeletes) await new Promise<void>((resolve) => cleanupDeleteReleases.push(resolve))
      if (controls.cleanupStatus === 204 || controls.cleanupStatus === 404) { files.delete(id); return route.fulfill({ status: controls.cleanupStatus }) }
      return json(route, controls.cleanupStatus, apiError(controls.cleanupStatus, 'Cleanup unavailable'))
    }
    if (path === '/api/sync/operations' && method === 'POST') {
      if (controls.operationStatus !== 200) return json(route, controls.operationStatus, apiError(controls.operationStatus, 'Sync failed'))
      const operation = body as { id: string; kind: string; payload: any }
      if (operation.kind === 'block.upsert') {
        const old = blocks.find((item) => item.id === operation.payload.id)
        const value: BlockResponse = { ...operation.payload, workspaceId: workspace.id, parentBlockId: operation.payload.parentBlockId ?? null, createdAt: old?.createdAt ?? now, updatedAt: later }
        const index = blocks.findIndex((item) => item.id === value.id)
        if (index < 0) blocks.push(value); else blocks[index] = value
      } else if (operation.kind === 'block.delete') {
        const index = blocks.findIndex((item) => item.id === operation.payload.id)
        if (index >= 0) blocks.splice(index, 1)
      } else if (operation.kind === 'page.delete') {
        const index = pages.findIndex((item) => item.id === operation.payload.id)
        if (index >= 0) pages.splice(index, 1)
      }
      return json(route, 200, { id: operation.id, status: 'applied' })
    }
    return json(route, 404, apiError(404, 'Not found'))
  })
  return {
    pages, blocks, files, requests, controls,
    releaseCleanupDeletes: () => cleanupDeleteReleases.splice(0).forEach((release) => release()),
    releaseUploadResponses: () => uploadResponseReleases.splice(0).forEach((release) => release()),
  }
}

const editor = (page: Page) => page.locator('.eotion-editor-content .tiptap')
const uploadRequests = (api: Awaited<ReturnType<typeof installApi>>) => api.requests.filter((item) => item.method === 'POST' && item.path === `/api/workspaces/${workspace.id}/files`)
const blockOperations = (api: Awaited<ReturnType<typeof installApi>>) => api.requests.filter((item) => item.path === '/api/sync/operations' && ['block.upsert', 'block.delete'].includes(item.body?.kind))
const insertFile = (page: Page, kind: 'image' | 'file', name: string, mimeType: string, buffer = Buffer.from('attachment test bytes')) =>
  page.getByLabel(kind === 'image' ? '选择图片附件' : '选择文件附件').setInputFiles({ name, mimeType, buffer })
async function deleteAttachment(page: Page, selector: string) {
  const attachment = page.locator(selector)
  await attachment.getByRole('button', { name: '附件操作' }).click()
  await attachment.getByRole('menuitem', { name: '删除' }).click()
  await attachment.getByRole('menuitem', { name: '确认删除' }).click()
}

test('slash image command and picker upload become one local block, sync operation and reloadable snapshot', async ({ page }) => {
  const api = await installApi(page)
  api.controls.holdUploadResponse = true
  await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  await expect(editor(page)).toBeVisible()
  await editor(page).click()
  await editor(page).pressSequentially('/')
  await expect(page.locator('.p2-slash-menu')).toBeVisible()
  await page.locator('.p2-slash-menu').getByRole('option', { name: /Image/ }).click()
  const imageInput = page.getByLabel('选择图片附件')
  await expect(imageInput).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp,image/gif,image/avif')
  await insertFile(page, 'image', 'tiny.png', 'image/png', Buffer.from('png'))
  await expect.poll(() => uploadRequests(api).length).toBe(1)
  await expect(page.locator('.eotion-upload-item')).toContainText('正在上传')
  await expect(page.locator('.eotion-upload-preview')).toBeVisible()
  api.releaseUploadResponses()
  await expect.poll(() => api.files.size).toBe(1)
  await expect(page.locator('.attachment-image img')).toHaveAttribute('src', [...api.files.values()][0]!.url)
  await expect(page.locator('.attachment-image')).toHaveCount(1)
  await expect.poll(() => api.blocks.filter((item) => item.type === 'image').length).toBe(1)
  expect(uploadRequests(api)).toHaveLength(1)
  expect(blockOperations(api).filter((item) => item.body.kind === 'block.upsert' && item.body.payload.type === 'image')).toHaveLength(1)
  const uploaded = [...api.files.values()][0]!
  expect(api.blocks.find((item) => item.type === 'image')?.props.node).toMatchObject({ type: 'eotionImage', attrs: { fileId: uploaded.id, name: 'tiny.png', mimeType: 'image/png', url: uploaded.url } })
  await page.reload()
  await expect(page.locator('.attachment-image')).toHaveCount(1)
  await expect(page.locator('.attachment-image img')).toHaveAttribute('src', uploaded.url)
})

test('file toolbar opens the file picker and a 503 retry reuses one placeholder and ends with one block', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('eotion:editor-toolbar:attachment-user:attachment-workspace', 'true'))
  const api = await installApi(page)
  api.controls.uploadStatuses = [503, 201]
  await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  await page.locator('.eotion-editor-toolbar').getByRole('button', { name: '文件', exact: true }).click()
  await expect(page.getByLabel('选择文件附件')).toHaveAttribute('type', 'file')
  await insertFile(page, 'file', 'notes.txt', 'text/plain')
  const task = page.locator('.eotion-upload-item')
  await expect(task).toContainText('附件服务暂时不可用')
  await expect(task.getByRole('button', { name: '重试上传 notes.txt' })).toBeVisible()
  await expect(page.locator('.attachment-file')).toHaveCount(0)
  await task.getByRole('button', { name: '重试上传 notes.txt' }).click()
  await expect(page.locator('.attachment-file-name')).toHaveText('notes.txt')
  await expect.poll(() => api.blocks.filter((item) => item.type === 'file').length).toBe(1)
  expect(uploadRequests(api)).toHaveLength(2)
  expect(new Set(uploadRequests(api).map((item) => item.fileName)).size).toBe(1)
  expect(api.blocks.filter((item) => item.type === 'file')).toHaveLength(1)
  expect(blockOperations(api).filter((item) => item.body.kind === 'block.upsert' && item.body.payload.type === 'file')).toHaveLength(1)
})

test('cancel aborts an in-flight upload, removes its preview URL, and creates no final attachment block', async ({ page }) => {
  const api = await installApi(page)
  api.controls.holdUploads = true
  await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  await insertFile(page, 'image', 'cancel.png', 'image/png')
  const preview = page.locator('.eotion-upload-preview')
  await expect(preview).toBeVisible()
  const objectUrl = await preview.getAttribute('src')
  await page.getByRole('button', { name: '取消上传 cancel.png' }).click()
  await expect(page.locator('.eotion-upload-item')).toContainText('已取消')
  await expect.poll(() => api.controls.abortedUploads).toBe(1)
  await expect.poll(() => api.requests.filter((item) => item.method === 'DELETE').length).toBe(1)
  await expect.poll(async () => page.evaluate((url) => (window as any).__revokedObjectUrls.includes(url), objectUrl)).toBe(true)
  expect(api.blocks).toHaveLength(0)
  expect(blockOperations(api)).toHaveLength(0)
})

test('413 shows a readable upload error and retry control', async ({ page }) => {
  const api = await installApi(page)
  api.controls.uploadStatus = 413
  await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  await insertFile(page, 'file', 'large.zip', 'application/zip')
  await expect(page.locator('.eotion-upload-alert')).toContainText('文件过大')
  await expect(page.getByRole('button', { name: '重试上传 large.zip' })).toBeVisible()
  expect(api.blocks).toHaveLength(0)
})

test('upload 401 clears authenticated identity and returns to login', async ({ page }) => {
  const api = await installApi(page)
  api.controls.uploadStatus = 401
  await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  await insertFile(page, 'file', 'private.txt', 'text/plain')
  await expect(page).toHaveURL(/#\/login/)
  expect(await page.evaluate(() => localStorage.getItem('eotion:last-authenticated-user'))).toBeNull()
  expect(api.blocks).toHaveLength(0)
})

test('an attachment remains durable locally when its normal block sync receives 503', async ({ page }) => {
  const api = await installApi(page)
  api.controls.operationStatus = 503
  await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  await insertFile(page, 'file', 'local-on-sync-error.txt', 'text/plain')
  await expect(page.locator('.attachment-file-name')).toHaveText('local-on-sync-error.txt')
  await expect(page.getByRole('button', { name: /离线 · 本地已保存/ })).toBeVisible()
  expect(api.blocks.filter((item) => item.type === 'file')).toHaveLength(0)
  await page.reload()
  await expect(page.locator('.attachment-file-name')).toHaveText('local-on-sync-error.txt')
  await expect(page.getByRole('button', { name: /离线 · 本地已保存/ })).toBeVisible()
})

test('a local attachment block upsert failure compensates the successful upload through the cleanup queue', async ({ page }) => {
  const api = await installApi(page)
  await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  await page.evaluate(async () => {
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    const local = await useProductSyncStore().store()
    const upsert = local.upsertBlock.bind(local)
    let failOnce = true
    ;(window as any).__attachmentUpsertFailures = 0
    local.upsertBlock = async (block) => {
      if (failOnce && (block.type === 'image' || block.type === 'file')) {
        failOnce = false
        ;(window as any).__attachmentUpsertFailures += 1
        throw new Error('injected local block failure')
      }
      return upsert(block)
    }
  })
  await insertFile(page, 'file', 'compensate.txt', 'text/plain')
  await expect.poll(() => page.evaluate(() => (window as any).__attachmentUpsertFailures)).toBe(1)
  await expect(page.locator('.eotion-upload-item')).toContainText('本地正文没有保存此附件', { timeout: 15_000 })
  await expect(page.locator('.attachment-file')).toHaveCount(0)
  await expect.poll(() => api.requests.filter((item) => item.method === 'DELETE').length).toBe(1)
  expect(api.blocks.filter((item) => item.type === 'file')).toHaveLength(0)
  expect(api.files.size).toBe(0)
})

test('an upload response received during IME composition waits before inserting its attachment block', async ({ page }) => {
  const api = await installApi(page)
  api.controls.uploadDelayMs = 500
  await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  const body = editor(page)
  await body.dispatchEvent('compositionstart', { data: '' })
  await insertFile(page, 'file', 'ime-wait.txt', 'text/plain')
  await expect.poll(() => uploadRequests(api).length).toBe(1)
  await page.waitForTimeout(700)
  await expect(page.locator('.attachment-file')).toHaveCount(0)
  expect(api.blocks.filter((item) => item.type === 'file')).toHaveLength(0)
  await body.dispatchEvent('compositionend', { data: '' })
  await expect(page.locator('.attachment-file-name')).toHaveText('ime-wait.txt')
  await expect.poll(() => api.blocks.filter((item) => item.type === 'file').length).toBe(1)
})

test('deleting an attachment stays permanent through undo and redo while ordinary text undo still works', async ({ page }, testInfo) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message))
  const api = await installApi(page, [
    block('undo-text', 1, { type: 'paragraph', content: [{ type: 'text', text: 'keep' }] }),
    block('undo-file', 2, { type: 'eotionFile', attrs: { fileId: 'undo-file-id', name: 'remove-me.txt', mimeType: 'text/plain', size: 8, url: 'https://objects.example.test/undo' } }),
  ])
  await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  await expect(page.locator('.attachment-file-name')).toHaveText('remove-me.txt')
  await deleteAttachment(page, '.attachment-file')
  await expect(page.locator('.attachment-file')).toHaveCount(0)
  await page.keyboard.press('Control+Z')
  await expect(page.locator('.attachment-file')).toHaveCount(0)
  await page.keyboard.press('Control+Shift+Z')
  await expect(page.locator('.attachment-file')).toHaveCount(0)
  const editorState = await page.evaluate(() => {
    const body = document.querySelector('.tiptap')
    const active = document.activeElement
    const selection = document.getSelection()
    return {
      editorText: body?.textContent ?? null,
      editorHtml: body?.innerHTML ?? null,
      activeElement: active ? { tagName: active.tagName, className: (active as HTMLElement).className, label: active.getAttribute('aria-label'), text: active.textContent } : null,
      selection: selection ? { anchorText: selection.anchorNode?.textContent ?? null, anchorOffset: selection.anchorOffset, focusText: selection.focusNode?.textContent ?? null, focusOffset: selection.focusOffset, collapsed: selection.isCollapsed } : null,
    }
  })
  await testInfo.attach('editor-state-after-attachment-undo-redo.json', { body: Buffer.from(JSON.stringify(editorState, null, 2)), contentType: 'application/json' })
  await editor(page).locator(':scope > p').first().click()
  await editor(page).press('End')
  await editor(page).pressSequentially(' edit')
  const firstParagraph = editor(page).locator(':scope > p').first()
  await expect(firstParagraph).toHaveText('keep edit')
  await page.keyboard.press('Control+Z')
  await expect(editor(page).locator(':scope > p').first()).toHaveText('keep')
  await page.keyboard.press('Control+Shift+Z')
  await expect(editor(page).locator(':scope > p').first()).toHaveText('keep edit')
  await expect(page.locator('.attachment-file')).toHaveCount(0)
  await expect.poll(() => api.blocks.some((item) => item.id === 'undo-file')).toBe(false)
  expect(pageErrors, JSON.stringify(editorState)).toEqual([])
})

test('quick cancel and fresh selection stay safe while compensation DELETE is in flight', async ({ page }) => {
  const api = await installApi(page)
  api.controls.holdUploads = true
  api.controls.holdCleanupDeletes = true
  await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  await insertFile(page, 'file', 'quick-retry.txt', 'text/plain')
  await expect(page.locator('.eotion-upload-item')).toContainText('正在上传')
  await page.getByRole('button', { name: '取消上传 quick-retry.txt' }).click()
  await expect(page.locator('.eotion-upload-item')).toContainText('已取消')
  await page.getByRole('button', { name: '移除 quick-retry.txt' }).click()
  await expect.poll(() => api.requests.filter((item) => item.method === 'DELETE').length).toBe(1)

  api.controls.holdUploads = false
  await insertFile(page, 'file', 'quick-retry.txt', 'text/plain')
  await expect(page.locator('.attachment-file-name')).toHaveText('quick-retry.txt')
  const fileIds = uploadRequests(api).map((item) => item.fileId)
  expect(uploadRequests(api)).toHaveLength(2)
  expect(new Set(fileIds).size).toBe(2)
  const localAttachments = await page.evaluate(async (pageId) => {
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    const local = await useProductSyncStore().store()
    return (await local.listBlocksByPage(pageId)).filter((item) => item.type === 'file')
  }, pageRecord.id)
  expect(localAttachments).toHaveLength(1)
  const finalId = ((localAttachments[0]!.props.node as any).attrs.fileId) as string
  expect(finalId).toBe(decodeURIComponent(fileIds[1]!))
  expect([...api.files.values()].some((file) => file.id === finalId)).toBe(true)
  expect(api.requests.filter((item) => item.method === 'DELETE')).toHaveLength(1)

  api.releaseCleanupDeletes()
  await expect.poll(() => api.blocks.filter((item) => item.type === 'file').length).toBe(1)
  expect([...api.files.values()].some((file) => file.id === finalId)).toBe(true)
})

test('offline file selection stays local, does not call upload, keeps text editable and reloads attachment metadata', async ({ page }) => {
  const seed = block('existing-file', 1, { type: 'eotionFile', attrs: { fileId: 'existing-file-id', name: 'existing.txt', mimeType: 'text/plain', size: 9, url: 'https://objects.example.test/existing' } })
  const api = await installApi(page, [seed])
  await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  await expect(page.locator('.attachment-file-name')).toHaveText('existing.txt')
  await page.evaluate(() => { (window as any).__eotionOnline = false; window.dispatchEvent(new Event('offline')) })
  const requestCount = uploadRequests(api).length
  await insertFile(page, 'file', 'offline.txt', 'text/plain')
  await expect(page.locator('.eotion-upload-item')).toContainText('附件上传需要联网')
  await editor(page).click()
  await editor(page).pressSequentially('正文仍然可编辑')
  await expect(editor(page)).toContainText('正文仍然可编辑')
  await expect(page.getByRole('status').filter({ hasText: '已保存到本地' })).toBeVisible()
  expect(uploadRequests(api)).toHaveLength(requestCount)
  await page.reload()
  await expect(page.locator('.attachment-file-name')).toHaveText('existing.txt')
  await expect(editor(page)).toContainText('正文仍然可编辑')
})

test('deleting a page queues cleanup for all attachment metadata after block deletion', async ({ page }) => {
  const blocks = [
    block('image-block', 1, { type: 'eotionImage', attrs: { fileId: 'page-image', name: 'photo.png', mimeType: 'image/png', size: 10, url: 'https://objects.example.test/photo' } }),
    block('file-block', 2, { type: 'eotionFile', attrs: { fileId: 'page-file', name: 'notes.txt', mimeType: 'text/plain', size: 12, url: 'https://objects.example.test/notes' } }),
  ]
  const api = await installApi(page, blocks)
  api.controls.cleanupStatus = 503
  await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  await expect(page.locator('.attachment')).toHaveCount(2)
  await page.getByRole('button', { name: `页面操作：${pageRecord.title}` }).click()
  await page.getByRole('group', { name: `${pageRecord.title} 的操作` }).getByRole('button', { name: '删除' }).click()
  await page.getByRole('button', { name: '确认删除' }).click()
  await expect(page.getByText('还没有页面')).toBeVisible()
  await expect.poll(() => api.requests.filter((item) => item.method === 'DELETE').length).toBe(2)
  expect(api.requests.filter((item) => item.method === 'DELETE').map((item) => item.path).sort()).toEqual([
    `/api/workspaces/${workspace.id}/files/page-file`, `/api/workspaces/${workspace.id}/files/page-image`,
  ])
  await expect(page.locator('.product-cleanup-status')).toContainText('附件清理暂未完成')
  api.controls.cleanupStatus = 204
  await page.getByRole('button', { name: '重试清理' }).click()
  await expect(page.locator('.product-cleanup-status')).toHaveCount(0)
  await expect.poll(() => api.requests.filter((item) => item.method === 'DELETE').length).toBe(4)
})

test('failed image uses fallback and unsafe URL or unknown attachment attrs keep the page read-only', async ({ page }) => {
  const badImage = block('bad-image', 1, { type: 'eotionImage', attrs: { fileId: 'bad-image-id', name: 'broken.png', mimeType: 'image/png', size: 10, url: 'https://objects.example.test/broken' } })
  const api = await installApi(page, [badImage])
  await page.route('https://objects.example.test/broken', (route) => route.fulfill({ status: 404, body: 'missing' }))
  await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  await expect(page.locator('.attachment-image-fallback')).toHaveAttribute('role', 'img')
  expect(blockOperations(api)).toHaveLength(0)

  const unsafe = { ...badImage, props: { node: { type: 'eotionImage', attrs: { fileId: 'unsafe-id', name: 'unsafe.png', mimeType: 'image/png', size: 10, url: 'javascript:alert(1)' } } } }
  const second = await page.context().newPage()
  await installApi(second, [unsafe])
  await second.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  await expect(second.getByRole('alert')).toContainText('尚不支持编辑')
  await expect(editor(second)).toHaveCount(0)

  const unknown = { ...badImage, props: { node: { type: 'eotionImage', attrs: { fileId: 'unknown-id', name: 'x.png', mimeType: 'image/png', size: 10, url: 'https://objects.example.test/x', serverSecret: 'preserve' } } } }
  const third = await page.context().newPage()
  await installApi(third, [unknown])
  await third.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  await expect(third.getByRole('alert')).toContainText('尚不支持编辑')
  await expect(editor(third)).toHaveCount(0)
})

test('long attachment names fit a 390px viewport and action buttons remain touch sized', async ({ page }) => {
  const longName = `${'very-long-'.repeat(18)}attachment-name.txt`
  const api = await installApi(page, [block('long-file', 1, { type: 'eotionFile', attrs: { fileId: 'long-file-id', name: longName, mimeType: 'text/plain', size: 10, url: 'https://objects.example.test/long' } })])
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  const dims = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth }))
  expect(dims.document).toBeLessThanOrEqual(dims.viewport)
  const attachment = page.locator('.attachment-file')
  const button = attachment.getByRole('button', { name: '附件操作' })
  const box = await button.boundingBox()
  expect(box?.width).toBeGreaterThanOrEqual(40)
  expect(box?.height).toBeGreaterThanOrEqual(40)
  await button.click()
  await attachment.getByRole('menuitem', { name: '删除' }).click()
  await attachment.getByRole('menuitem', { name: '确认删除' }).click()
  await expect.poll(() => api.blocks.filter((item) => item.type === 'file').length).toBe(0)
  expect(blockOperations(api).some((item) => item.body.kind === 'block.delete')).toBe(true)
})

test('file drop and image paste upload files, while text/html paste remains handled by the editor', async ({ page }) => {
  const api = await installApi(page)
  await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  const body = editor(page)
  await body.evaluate((element) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['dropped'], 'dropped.txt', { type: 'text/plain' }))
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  })
  await expect(page.locator('.attachment-file-name')).toHaveText('dropped.txt')

  const prevented = await body.evaluate((element) => {
    const transfer = new DataTransfer()
    transfer.setData('text/html', '<p>pasted html</p>')
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer })
    element.dispatchEvent(event)
    return event.defaultPrevented
  })
  expect(prevented).toBe(true)
  await expect(body).toContainText('pasted html')
  expect(uploadRequests(api)).toHaveLength(1)

  await body.evaluate((element) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['image'], 'pasted.png', { type: 'image/png' }))
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }))
  })
  await expect(page.locator('.attachment-image')).toHaveCount(1)
  expect(uploadRequests(api)).toHaveLength(2)
})
