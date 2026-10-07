import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Page, type Route } from '@playwright/test'
import type { AuthUserDto, BlockResponse, PageResponse, WorkspaceResponse } from '@eotion/contracts'

const now = '2026-09-30T00:00:00.000Z'
const later = '2027-09-30T00:00:00.000Z'
const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pWQAAAAASUVORK5CYII=', 'base64')
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
type HeldUploadResponse = { fileName: string; release: () => void }

async function installApi(page: Page, initialBlocks: BlockResponse[] = []) {
  const pages = [pageRecord]
  const blocks = [...initialBlocks]
  const files = new Map<string, Attachment>()
  const requests: RecordedRequest[] = []
  const controls: Controls = { uploadStatus: 201, uploadDelayMs: 0, holdUploads: false, holdUploadResponse: false, holdCleanupDeletes: false, abortedUploads: 0, uploadStatuses: [], operationStatus: 200, cleanupStatus: 204, online: true }
  const cleanupDeleteReleases: Array<() => void> = []
  const uploadResponseReleases: HeldUploadResponse[] = []
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
      if (controls.holdUploadResponse) await new Promise<void>((resolve) => uploadResponseReleases.push({ fileName: decodeURIComponent(request.headers()['x-eotion-file-name'] ?? 'upload.bin'), release: resolve }))
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
      } else if (operation.kind === 'block.move') {
        const record = blocks.find((item) => item.id === operation.payload.id)
        if (record) Object.assign(record, { parentBlockId: operation.payload.parentBlockId, orderKey: operation.payload.orderKey, updatedAt: later })
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
    releaseUploadResponses: () => uploadResponseReleases.splice(0).forEach((item) => item.release()),
    releaseUploadResponse: (fileName: string) => {
      const index = uploadResponseReleases.findIndex((item) => item.fileName === fileName)
      if (index >= 0) uploadResponseReleases.splice(index, 1)[0]!.release()
    },
  }
}

const editor = (page: Page) => page.locator('.eotion-editor-content .tiptap')
const inlineUploads = (page: Page) => page.locator('.eotion-upload-placeholder')
const uploadRequests = (api: Awaited<ReturnType<typeof installApi>>) => api.requests.filter((item) => item.method === 'POST' && item.path === `/api/workspaces/${workspace.id}/files`)
const blockOperations = (api: Awaited<ReturnType<typeof installApi>>) => api.requests.filter((item) => item.path === '/api/sync/operations' && ['block.upsert', 'block.delete'].includes(item.body?.kind))
const insertFile = (page: Page, kind: 'image' | 'file', name: string, mimeType: string, buffer = Buffer.from('attachment test bytes')) =>
  page.getByLabel(kind === 'image' ? '选择图片附件' : '选择文件附件').setInputFiles({ name, mimeType, buffer })
async function visualQaScreenshot(page: Page, name: string) {
  const directory = process.env.EOTION_VISUAL_QA_DIR
  if (!directory) return
  await mkdir(directory, { recursive: true })
  await page.screenshot({ path: path.join(directory, `${name}.png`), animations: 'disabled' })
}
async function setEditorSelection(page: Page, position: number) {
  await editor(page).evaluate((element, selection) => {
    const component = (element.closest('.eotion-editor') as any)?.__vueParentComponent
    const exposedEditor = component?.exposed?.editor
    const tiptap = exposedEditor?.commands ? exposedEditor : exposedEditor?.value
    if (!tiptap?.commands) throw new Error('EotionEditor did not expose its Tiptap editor')
    tiptap.commands.setTextSelection(selection)
  }, position)
}
async function insertEditorText(page: Page, text: string) {
  await editor(page).evaluate((element, value) => {
    const exposedEditor = (element.closest('.eotion-editor') as any)?.__vueParentComponent?.exposed?.editor
    const tiptap = exposedEditor?.commands ? exposedEditor : exposedEditor?.value
    if (!tiptap?.commands) throw new Error('EotionEditor did not expose its Tiptap editor')
    tiptap.commands.insertContent(value)
  }, text)
}
async function deleteAttachment(page: Page, selector: string) {
  const attachment = page.locator(selector)
  await attachment.getByRole('button', { name: '附件操作' }).click()
  await attachment.getByRole('menuitem', { name: '删除' }).click()
  await attachment.getByRole('menuitem', { name: '确认删除' }).click()
}

test('slash image command and picker upload become one local block, sync operation and reloadable snapshot', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message))
  const api = await installApi(page)
  await page.route('https://objects.example.test/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: tinyPng }))
  api.controls.holdUploadResponse = true
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  await expect(editor(page)).toBeVisible()
  await editor(page).click()
  await editor(page).pressSequentially('/')
  await expect(page.locator('.p2-slash-menu')).toBeVisible()
  await page.locator('.p2-slash-menu').getByRole('option', { name: '图片' }).click()
  const imageInput = page.getByLabel('选择图片附件')
  await expect(imageInput).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp,image/gif,image/avif')
  await insertFile(page, 'image', 'tiny.png', 'image/png', tinyPng)
  await expect.poll(() => uploadRequests(api).length).toBe(1)
  const placeholder = inlineUploads(page)
  await expect(placeholder).toHaveCount(1)
  await expect(editor(page).locator(':scope > p.eotion-upload-occupied')).toHaveCount(1)
  await expect(placeholder).toContainText('tiny.png')
  await expect(placeholder).toContainText('正在上传')
  await expect(placeholder.locator('.eotion-upload-spinner')).toBeVisible()
  await expect(placeholder.locator('.eotion-upload-preview')).toBeVisible()
  await expect(placeholder.locator('.eotion-upload-preview')).toHaveJSProperty('naturalWidth', 1)
  const editorJsonDuringUpload = await editor(page).evaluate((element) => {
    const exposedEditor = (element.closest('.eotion-editor') as any)?.__vueParentComponent?.exposed?.editor
    const tiptap = exposedEditor?.commands ? exposedEditor : exposedEditor?.value
    return JSON.stringify(tiptap.getJSON())
  })
  expect(editorJsonDuringUpload).not.toContain('blob:')
  expect(editorJsonDuringUpload).not.toContain('upload')
  const localJsonDuringUpload = await page.evaluate(async (id) => {
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    return JSON.stringify(await (await useProductSyncStore().store()).listBlocksByPage(id))
  }, pageRecord.id)
  expect(localJsonDuringUpload).not.toContain('blob:')
  expect(localJsonDuringUpload).not.toContain('eotionUpload')
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  await visualQaScreenshot(page, 'attachment-desktop-image-uploading')
  api.releaseUploadResponses()
  await expect.poll(() => api.files.size).toBe(1)
  await expect(page.locator('.attachment-image img')).toHaveAttribute('src', [...api.files.values()][0]!.url)
  await expect(page.locator('.attachment-image')).toHaveCount(1)
  await expect.poll(() => editor(page).evaluate((root) => Array.from(root.children).filter((node) => !node.classList.contains('eotion-block-drag-anchor')).map((node) => node.tagName))).toEqual(['FIGURE', 'P'])
  await expect(editor(page).locator(':scope > p')).toHaveCount(1)
  await expect.poll(() => api.blocks.filter((item) => item.type === 'image').length).toBe(1)
  await expect.poll(() => api.blocks.filter((item) => item.type === 'paragraph').length).toBe(1)
  expect([...api.blocks].sort((a, b) => a.orderKey.localeCompare(b.orderKey)).map((item) => item.type)).toEqual(['image', 'paragraph'])
  expect(uploadRequests(api)).toHaveLength(1)
  expect(blockOperations(api).filter((item) => item.body.kind === 'block.upsert' && item.body.payload.type === 'image')).toHaveLength(1)
  // The fallback empty paragraph must be consumed by the image without an extra
  // delete/re-upsert cycle for the auto-appended trailing paragraph.
  expect(blockOperations(api).filter((item) => item.body.kind === 'block.delete')).toHaveLength(0)
  expect(blockOperations(api).filter((item) => item.body.kind === 'block.upsert' && item.body.payload.type === 'paragraph')).toHaveLength(1)
  const uploaded = [...api.files.values()][0]!
  expect(api.blocks.find((item) => item.type === 'image')?.props.node).toMatchObject({ type: 'eotionImage', attrs: { fileId: uploaded.id, name: 'tiny.png', mimeType: 'image/png', url: uploaded.url } })
  await page.reload()
  await expect(page.locator('.attachment-image')).toHaveCount(1)
  await expect(page.locator('.attachment-image img')).toHaveAttribute('src', uploaded.url)
  expect(pageErrors).toEqual([])
})

test('file toolbar opens the file picker and a 503 retry reuses one placeholder and ends with one block', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message))
  await page.addInitScript(() => localStorage.setItem('eotion:editor-toolbar:attachment-user:attachment-workspace', 'true'))
  const api = await installApi(page)
  api.controls.uploadStatuses = [503, 201]
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  await page.getByRole('toolbar', { name: '触摸编辑工具栏' }).getByRole('button', { name: '插入文件' }).click()
  await expect(page.getByLabel('选择文件附件')).toHaveAttribute('type', 'file')
  await insertFile(page, 'file', 'notes.txt', 'text/plain')
  const task = inlineUploads(page)
  await expect(task).toContainText('附件服务暂时不可用')
  await expect(task.getByRole('button', { name: '重试上传 notes.txt' })).toBeVisible()
  const retryButton = task.getByRole('button', { name: '重试上传 notes.txt' })
  const retryBounds = await retryButton.boundingBox()
  expect(retryBounds?.height).toBeGreaterThanOrEqual(44)
  expect(retryBounds?.width).toBeGreaterThanOrEqual(44)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  await visualQaScreenshot(page, 'attachment-mobile-file-failed-retry')
  const uploadId = await task.getAttribute('data-upload-id')
  await expect(page.locator('.attachment-file')).toHaveCount(0)
  api.controls.holdUploadResponse = true
  await retryButton.click()
  await expect.poll(() => uploadRequests(api).length).toBe(2)
  await expect(task).toHaveAttribute('data-upload-id', uploadId!)
  await expect(task).toContainText('正在上传')
  api.releaseUploadResponses()
  await expect(page.locator('.attachment-file-name')).toHaveText('notes.txt')
  await expect.poll(() => api.blocks.filter((item) => item.type === 'file').length).toBe(1)
  expect(uploadRequests(api)).toHaveLength(2)
  expect(new Set(uploadRequests(api).map((item) => item.fileName)).size).toBe(1)
  expect(api.blocks.filter((item) => item.type === 'file')).toHaveLength(1)
  expect(blockOperations(api).filter((item) => item.body.kind === 'block.upsert' && item.body.payload.type === 'file')).toHaveLength(1)
  expect(pageErrors).toEqual([])
})

test('cancel aborts an in-flight upload, removes its preview URL, and creates no final attachment block', async ({ page }) => {
  const api = await installApi(page)
  api.controls.holdUploads = true
  await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  await insertFile(page, 'image', 'cancel.png', 'image/png')
  const preview = page.locator('.eotion-upload-preview')
  await expect(preview).toBeVisible()
  const objectUrl = await preview.getAttribute('src')
  await expect(inlineUploads(page)).toHaveCount(1)
  await page.getByRole('button', { name: '取消上传 cancel.png' }).click()
  await expect(page.locator('.eotion-upload-terminal')).toContainText('cancel.png · 已取消')
  await expect(inlineUploads(page)).toHaveCount(0)
  await expect(editor(page).locator(':scope > p')).toHaveCount(1)
  await expect.poll(() => api.controls.abortedUploads).toBe(1)
  await expect.poll(() => api.requests.filter((item) => item.method === 'DELETE').length).toBe(1)
  await expect.poll(async () => page.evaluate((url) => (window as any).__revokedObjectUrls.includes(url), objectUrl)).toBe(true)
  expect(api.blocks).toHaveLength(0)
  expect(blockOperations(api)).toHaveLength(0)
})

test('a picker keeps its captured paragraph after selection changes and preserves non-empty paragraphs', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('eotion:editor-toolbar:attachment-user:attachment-workspace', 'true'))
  const api = await installApi(page, [
    block('first-paragraph', 1, { type: 'paragraph', content: [{ type: 'text', text: 'First paragraph' }] }),
    block('empty-middle-paragraph', 2, { type: 'paragraph' }),
    block('second-paragraph', 3, { type: 'paragraph', content: [{ type: 'text', text: 'Second paragraph' }] }),
  ])
  api.controls.holdUploadResponse = true
  await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  await expect(editor(page).locator(':scope > p')).toHaveCount(3)
  await setEditorSelection(page, 18)
  const chooserPromise = page.waitForEvent('filechooser')
  await page.locator('.eotion-editor-toolbar').getByRole('button', { name: '文件', exact: true }).click()
  const chooser = await chooserPromise
  await setEditorSelection(page, 25)
  await chooser.setFiles({ name: 'frozen-position.txt', mimeType: 'text/plain', buffer: Buffer.from('frozen') })
  await expect.poll(() => uploadRequests(api).length).toBe(1)
  await expect(inlineUploads(page)).toContainText('frozen-position.txt')
  await expect(editor(page).locator(':scope > p.eotion-upload-occupied')).toHaveCount(1)
  api.releaseUploadResponses()
  await expect(page.locator('.attachment-file-name')).toHaveText('frozen-position.txt')
  await expect.poll(async () => editor(page).locator(':scope > p').allTextContents()).toEqual(['First paragraph', 'Second paragraph'])
  await expect.poll(async () => {
    return editor(page).evaluate((root) => Array.from(root.children).filter((node) => !node.classList.contains('eotion-block-drag-anchor')).map((node) => {
      if (node.matches('.attachment-file')) return (node.querySelector('.attachment-file-name')?.textContent ?? '').trim()
      return (node.textContent ?? '').trim()
    }))
  }).toEqual(['First paragraph', 'frozen-position.txt', 'Second paragraph'])
  const durableLocalBlocks = await page.evaluate(async (id) => {
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    return JSON.stringify(await (await useProductSyncStore().store()).listBlocksByPage(id))
  }, pageRecord.id)
  expect(durableLocalBlocks).not.toContain('blob:')
  expect(durableLocalBlocks).not.toContain('upload-placeholder')
  await expect.poll(() => api.blocks.some((item) => item.type === 'file')).toBe(true)
  expect(api.blocks.find((item) => item.type === 'image' || item.type === 'file')?.id).toBe('empty-middle-paragraph')
})

test('typing in the original empty paragraph while saving keeps the text after attachment commit', async ({ page }) => {
  const api = await installApi(page)
  api.controls.holdUploadResponse = true
  await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  await page.evaluate(async () => {
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    const local = await useProductSyncStore().store()
    const upsert = local.upsertBlock.bind(local)
    ;(window as any).__attachmentCommitEntered = false
    ;(window as any).__releaseAttachmentCommit = undefined
    local.upsertBlock = async (record: any) => {
      if (record.type === 'image' || record.type === 'file') {
        ;(window as any).__attachmentCommitEntered = true
        await new Promise<void>((resolve) => { (window as any).__releaseAttachmentCommit = resolve })
      }
      return upsert(record)
    }
  })
  await insertFile(page, 'image', 'saving.png', 'image/png', tinyPng)
  await expect.poll(() => uploadRequests(api).length).toBe(1)
  await setEditorSelection(page, 1)
  await insertEditorText(page, 'Keep this paragraph')
  await expect(editor(page)).toContainText('Keep this paragraph')
  const editorJsonDuringUpload = await editor(page).evaluate((element) => {
    const exposedEditor = (element.closest('.eotion-editor') as any)?.__vueParentComponent?.exposed?.editor
    const tiptap = exposedEditor?.commands ? exposedEditor : exposedEditor?.value
    return JSON.stringify(tiptap.getJSON())
  })
  expect(editorJsonDuringUpload).toContain('Keep this paragraph')
  expect(editorJsonDuringUpload).not.toContain('blob:')
  expect(editorJsonDuringUpload).not.toContain('upload')
  await expect.poll(async () => page.evaluate(async (id) => {
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    return JSON.stringify(await (await useProductSyncStore().store()).listBlocksByPage(id))
  }, pageRecord.id)).toContain('Keep this paragraph')
  const persistedLocalJsonDuringUpload = await page.evaluate(async (id) => {
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    return JSON.stringify(await (await useProductSyncStore().store()).listBlocksByPage(id))
  }, pageRecord.id)
  expect(persistedLocalJsonDuringUpload).toContain('Keep this paragraph')
  expect(persistedLocalJsonDuringUpload).not.toContain('blob:')
  expect(persistedLocalJsonDuringUpload).not.toContain('eotionUpload')
  api.releaseUploadResponses()
  await expect.poll(() => page.evaluate(() => (window as any).__attachmentCommitEntered)).toBe(true)
  await expect(inlineUploads(page)).toContainText('正在保存附件')
  await page.evaluate(() => (window as any).__releaseAttachmentCommit?.())
  await expect(page.locator('.attachment-image')).toHaveCount(1)
  await expect(editor(page)).toContainText('Keep this paragraph')
  await expect.poll(() => (api.blocks.find((item) => item.type === 'paragraph')?.props.node as any)?.content?.[0]?.text).toBe('Keep this paragraph')
})

test('a later selected file completing first leaves no leftover empty paragraph when the first upload fails', async ({ page }) => {
  const api = await installApi(page)
  api.controls.holdUploadResponse = true
  api.controls.uploadStatuses = [201, 503]
  await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  await page.getByLabel('选择文件附件').setInputFiles([
    { name: 'first-empty-slot.txt', mimeType: 'text/plain', buffer: Buffer.from('first') },
    { name: 'second-empty-slot.txt', mimeType: 'text/plain', buffer: Buffer.from('second') },
  ])
  await expect.poll(() => uploadRequests(api).length).toBe(2)
  await expect(inlineUploads(page)).toHaveCount(2)
  api.releaseUploadResponse('second-empty-slot.txt')
  await expect(page.locator('.attachment-file-name')).toHaveText('second-empty-slot.txt')
  await expect.poll(() => api.blocks.filter((item) => item.type === 'file').length).toBe(1)
  api.releaseUploadResponse('first-empty-slot.txt')
  const failed = inlineUploads(page).filter({ hasText: 'first-empty-slot.txt' })
  await expect(failed).toContainText('附件服务暂时不可用')
  await expect(failed.getByRole('button', { name: '重试上传 first-empty-slot.txt' })).toBeVisible()
  await failed.getByRole('button', { name: '移除 first-empty-slot.txt' }).click()
  await expect(failed).toHaveCount(0)
  await expect(page.locator('.attachment-file-name')).toHaveText('second-empty-slot.txt')
  await expect(editor(page).locator(':scope > p.eotion-upload-occupied')).toHaveCount(0)
  await expect(editor(page).locator(':scope > p')).toHaveCount(1)
  const fileBlocks = api.blocks.filter((item) => item.type === 'file')
  expect(fileBlocks).toHaveLength(1)
  // The shared empty paragraph must be consumed by the attachments, never left
  // behind as an extra blank line before the surviving file block.
  const trailingParagraphs = api.blocks.filter((item) => item.type === 'paragraph')
  expect(trailingParagraphs).toHaveLength(1)
  expect((trailingParagraphs[0]!.props.node as any).content ?? []).toEqual([])
})

test('failed save restores user text changed in the provisional attachment block and queues cleanup', async ({ page }) => {
  const api = await installApi(page)
  api.controls.holdUploadResponse = true
  await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  await page.evaluate(async () => {
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    const local = await useProductSyncStore().store()
    const upsert = local.upsertBlock.bind(local)
    ;(window as any).__attachmentCommitEntered = false
    ;(window as any).__releaseAttachmentCommit = undefined
    local.upsertBlock = async (record: any) => {
      if (record.type === 'image' || record.type === 'file') {
        ;(window as any).__attachmentCommitEntered = true
        await new Promise<void>((resolve) => { (window as any).__releaseAttachmentCommit = resolve })
        throw new Error('injected attachment persistence failure')
      }
      return upsert(record)
    }
  })
  await insertFile(page, 'file', 'failed-save.txt', 'text/plain')
  await expect.poll(() => uploadRequests(api).length).toBe(1)
  api.releaseUploadResponses()
  await expect.poll(() => page.evaluate(() => (window as any).__attachmentCommitEntered)).toBe(true)
  await expect(inlineUploads(page)).toContainText('正在保存附件')
  await editor(page).evaluate((element) => {
    const exposedEditor = (element.closest('.eotion-editor') as any)?.__vueParentComponent?.exposed?.editor
    const tiptap = exposedEditor?.commands ? exposedEditor : exposedEditor?.value
    let position = -1
    let blockId: string | undefined
    tiptap.state.doc.forEach((node: any, offset: number) => {
      if (node.type.name === 'eotionFile' || node.type.name === 'eotionImage') { position = offset; blockId = node.attrs.blockId }
    })
    if (position < 0) throw new Error('Provisional attachment node was not inserted')
    const transaction = tiptap.state.tr.setNodeMarkup(position, tiptap.schema.nodes.paragraph, blockId ? { blockId } : {})
    transaction.insertText('Text edited while saving', position + 1)
    tiptap.view.dispatch(transaction)
  })
  await expect(editor(page)).toContainText('Text edited while saving')
  await page.evaluate(() => (window as any).__releaseAttachmentCommit?.())
  const failed = inlineUploads(page)
  await expect(failed).toContainText('本地正文没有保存此附件')
  await expect(editor(page)).toContainText('Text edited while saving')
  await expect(page.locator('.attachment-file')).toHaveCount(0)
  await expect.poll(() => api.requests.filter((item) => item.method === 'DELETE').length).toBe(1)
  expect(api.files.size).toBe(0)
  await expect.poll(async () => page.evaluate(async (id) => {
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    return JSON.stringify(await (await useProductSyncStore().store()).listBlocksByPage(id))
  }, pageRecord.id)).toContain('Text edited while saving')
})

test('cancelling the first empty-slot upload while the second saves leaves no empty gap', async ({ page }) => {
  const api = await installApi(page, [
    block('race-first-paragraph', 1, { type: 'paragraph', content: [{ type: 'text', text: 'Before attachments' }] }),
    block('race-empty-paragraph', 2, { type: 'paragraph' }),
    block('race-last-paragraph', 3, { type: 'paragraph', content: [{ type: 'text', text: 'After attachments' }] }),
  ])
  api.controls.holdUploadResponse = true
  await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  await page.evaluate(async () => {
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    const local = await useProductSyncStore().store()
    const upsert = local.upsertBlock.bind(local)
    ;(window as any).__secondCommitEntered = false
    ;(window as any).__releaseSecondCommit = undefined
    local.upsertBlock = async (record: any) => {
      if ((record.props?.node as any)?.attrs?.name === 'second-empty-race.txt') {
        ;(window as any).__secondCommitEntered = true
        await new Promise<void>((resolve) => { (window as any).__releaseSecondCommit = resolve })
      }
      return upsert(record)
    }
  })
  await setEditorSelection(page, 20)
  await page.getByLabel('选择文件附件').setInputFiles([
    { name: 'first-empty-race.txt', mimeType: 'text/plain', buffer: Buffer.from('first') },
    { name: 'second-empty-race.txt', mimeType: 'text/plain', buffer: Buffer.from('second') },
  ])
  await expect.poll(() => uploadRequests(api).length).toBe(2)
  api.releaseUploadResponse('second-empty-race.txt')
  await expect.poll(() => page.evaluate(() => (window as any).__secondCommitEntered)).toBe(true)
  await expect(inlineUploads(page).filter({ hasText: 'second-empty-race.txt' })).toContainText('正在保存附件')
  await inlineUploads(page).filter({ hasText: 'first-empty-race.txt' }).getByRole('button', { name: '取消上传 first-empty-race.txt' }).click()
  await expect(inlineUploads(page).filter({ hasText: 'first-empty-race.txt' })).toHaveCount(0)
  await page.evaluate(() => (window as any).__releaseSecondCommit?.())
  await expect(page.locator('.attachment-file-name')).toHaveText('second-empty-race.txt')
  await expect.poll(async () => editor(page).evaluate((root) => Array.from(root.children).filter((node) => !node.classList.contains('eotion-block-drag-anchor')).map((node) => {
    if (node.matches('.attachment-file')) return (node.querySelector('.attachment-file-name')?.textContent ?? '').trim()
    return (node.textContent ?? '').trim()
  }))).toEqual(['Before attachments', 'second-empty-race.txt', 'After attachments'])
  await expect.poll(() => api.blocks.some((item) => item.id === 'race-empty-paragraph')).toBe(false)
  expect(api.blocks.filter((item) => item.type === 'paragraph').map((item) => (item.props.node as any).content?.[0]?.text)).toEqual(['Before attachments', 'After attachments'])
})

test('file picker remains usable when crypto.randomUUID is unavailable', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message))
  await page.addInitScript(() => Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined }))
  const api = await installApi(page)
  await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  await insertFile(page, 'file', 'without-random-uuid.txt', 'text/plain')
  await expect(page.locator('.attachment-file-name')).toHaveText('without-random-uuid.txt')
  expect(uploadRequests(api)).toHaveLength(1)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(pageErrors).toEqual([])
})

test('multiple files that finish out of order stay in their selected document order', async ({ page }) => {
  const api = await installApi(page)
  api.controls.holdUploadResponse = true
  await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  await page.getByLabel('选择文件附件').setInputFiles([
    { name: 'first-selected.txt', mimeType: 'text/plain', buffer: Buffer.from('first') },
    { name: 'second-selected.txt', mimeType: 'text/plain', buffer: Buffer.from('second') },
  ])
  await expect.poll(() => uploadRequests(api).length).toBe(2)
  await expect(inlineUploads(page)).toHaveCount(2)
  await expect(inlineUploads(page).nth(0)).toContainText('first-selected.txt')
  await expect(inlineUploads(page).nth(1)).toContainText('second-selected.txt')
  api.releaseUploadResponse('second-selected.txt')
  await expect.poll(() => api.blocks.filter((item) => item.type === 'file').length).toBe(1)
  api.releaseUploadResponse('first-selected.txt')
  await expect.poll(async () => page.locator('.attachment-file-name').allTextContents()).toEqual(['first-selected.txt', 'second-selected.txt'])
  await expect.poll(() => api.blocks.filter((item) => item.type === 'file').sort((a, b) => a.orderKey.localeCompare(b.orderKey)).map((item) => (item.props.node as any).attrs.name)).toEqual(['first-selected.txt', 'second-selected.txt'])
})

test('a late upload result from the previous page never enters the newly opened page', async ({ page }) => {
  const api = await installApi(page)
  const nextPage: PageResponse = { ...pageRecord, id: 'attachment-next-page', title: '新页面', orderKey: '0000000000000002' }
  api.pages.push(nextPage)
  api.controls.holdUploadResponse = true
  await page.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
  await insertFile(page, 'file', 'previous-page.txt', 'text/plain')
  await expect.poll(() => uploadRequests(api).length).toBe(1)
  await expect(inlineUploads(page)).toContainText('previous-page.txt')
  await page.getByRole('button', { name: nextPage.title, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`page/${nextPage.id}$`))
  await expect(editor(page)).toBeVisible()
  api.releaseUploadResponses()
  await expect.poll(() => api.requests.filter((item) => item.method === 'DELETE').length).toBe(1)
  await expect(page.locator('.attachment-file')).toHaveCount(0)
  expect(api.blocks.some((item) => item.pageId === nextPage.id && item.type === 'file')).toBe(false)
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
  await expect(inlineUploads(page)).toContainText('本地正文没有保存此附件', { timeout: 15_000 })
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
  await expect(inlineUploads(page)).toHaveCount(0)
  await expect(page.locator('.eotion-upload-terminal')).toContainText('quick-retry.txt · 已取消')
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
  await expect.poll(() => page.evaluate(async (id) => {
    const { useProductSyncStore } = await import('/src/stores/productSync.ts')
    const local = await useProductSyncStore().store()
    return JSON.stringify(await local.listBlocksByPage(id))
  }, pageRecord.id)).toContain('正文仍然可编辑')
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
  await page.getByRole('menu', { name: `${pageRecord.title} 的操作` }).getByRole('menuitem', { name: '删除' }).click()
  await page.getByRole('dialog', { name: '删除页面？' }).getByRole('button', { name: '删除', exact: true }).click()
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

  const browser = page.context().browser()
  expect(browser).not.toBeNull()
  // Each malformed snapshot needs a clean local store: another tab with this
  // workspace/page can otherwise open its valid IndexedDB cache before the API fixture.
  const unsafe = { ...badImage, props: { node: { type: 'eotionImage', attrs: { fileId: 'unsafe-id', name: 'unsafe.png', mimeType: 'image/png', size: 10, url: 'javascript:alert(1)' } } } }
  const second = await browser!.newPage()
  try {
    await installApi(second, [unsafe])
    await second.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
    await expect(second.getByRole('region', { name: '暂时无法加载页面' }).getByRole('alert'))
      .toHaveText('Invalid block attributes in workspace snapshot')
    await expect(editor(second)).toHaveCount(0)
  } finally {
    await second.close()
  }

  const unknown = { ...badImage, props: { node: { type: 'eotionImage', attrs: { fileId: 'unknown-id', name: 'x.png', mimeType: 'image/png', size: 10, url: 'https://objects.example.test/x', serverSecret: 'preserve' } } } }
  const third = await browser!.newPage()
  try {
    await installApi(third, [unknown])
    await third.goto(`/#/app/${workspace.id}/page/${pageRecord.id}`)
    await expect(third.getByRole('region', { name: '暂时无法加载页面' }).getByRole('alert'))
      .toHaveText('Invalid block attributes in workspace snapshot')
    await expect(editor(third)).toHaveCount(0)
  } finally {
    await third.close()
  }
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
