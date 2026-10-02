<script setup lang="ts">
import type { Attributes } from '@tiptap/core'
import { EditorContent } from '@tiptap/vue-3'
import Link from '@tiptap/extension-link'
import { exitSuggestion } from '@tiptap/suggestion'
import { AttachmentAttrsSchema, SAFE_IMAGE_MIME_TYPES } from '@eotion/contracts'
import { createLocalId } from '@eotion/storage'
import { nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'

import '../../styles/editor-content.css'
import { AttachmentLifetime, EotionFile, EotionImage, EotionTodo } from '../../editor/attachmentNodes'
import { BlockIdentity } from '../../editor/blockIdentity'
import { isSafeLinkHref } from '../../editor/link'
import { runBlockCommand, type BlockCommand } from '../../editor/blockCommands'
import { enqueueAttachmentCleanup, pendingAttachmentCleanups } from '../../editor/attachmentCleanup'
import { createSlashCommand } from '../../editor/slashCommand'
import type { EditorDocument } from '../../editor/editorDocument'
import { useDocumentEditor } from '../../editor/useDocumentEditor'
import { ApiError, api, errorMessage, expireSessionFromApi } from '../../services/productApi'
import EotionIcon from '../ui/EotionIcon.vue'
import EotionBubbleMenu from './EotionBubbleMenu.vue'

type AttachmentKind = 'image' | 'file'
type UploadPhase = 'uploading' | 'saving' | 'success' | 'failed' | 'cancelled'
type UploadTask = { id: string; fileId: string; file: File; phase: UploadPhase; error: string; objectUrl?: string; controller?: AbortController; started: boolean; durable: boolean; epoch: number; running?: Promise<void> }
const pendingCleanup = pendingAttachmentCleanups

const props = defineProps<{ content: EditorDocument; touchToolbar: boolean; fixedToolbar?: boolean; ariaLabel?: string; workspaceId?: string; commitAttachment?: (blockId: string) => Promise<boolean> }>()
const emit = defineEmits<{
  update: [document: EditorDocument]
  composition: [active: boolean, event: CompositionEvent]
  transaction: [changed: boolean]
  selection: [from: number, to: number, empty: boolean]
  beforeInput: [event: InputEvent]
  pointer: [event: PointerEvent]
  contextMenu: []
  keyboardInset: [pixels: number]
}>()

const composing = ref(false)
// Presentation attributes come from Link options; only href belongs in editor JSON.
const ProductLink = Link.extend({
  addAttributes() {
    const attributes = this.parent?.() as Attributes | undefined
    return { href: attributes?.href ?? { default: null } }
  },
}).configure({ openOnClick: false, autolink: false, linkOnPaste: false, isAllowedUri: isSafeLinkHref })
const compositionWaiters = new Set<() => void>()
const keyboardInset = ref(0)
const uploads = ref<UploadTask[]>([])
const uploadAlert = ref('')
const draggingFiles = ref(false)
const imageInput = ref<HTMLInputElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const touchToolbarElement = ref<HTMLElement | null>(null)
let pageEpoch = 0
let disposed = false

function updateKeyboardInset() {
  const viewport = window.visualViewport
  keyboardInset.value = viewport
    ? Math.max(0, Math.round(window.innerHeight - viewport.offsetTop - viewport.height))
    : 0
  emit('keyboardInset', keyboardInset.value)
  keepCaretAboveTouchToolbar()
}

function keepCaretAboveTouchToolbar() {
  if (keyboardInset.value === 0 || !editor.value?.isFocused) return
  requestAnimationFrame(() => {
    const current = editor.value
    const toolbar = touchToolbarElement.value
    const scroll = current?.view.dom.closest('.document-wrap')
    if (!current?.isFocused || !toolbar || !(scroll instanceof HTMLElement)) return
    const caret = current.view.coordsAtPos(current.state.selection.head)
    const overlap = caret.bottom + 12 - toolbar.getBoundingClientRect().top
    if (overlap > 0) scroll.scrollTop += overlap
  })
}

onMounted(() => {
  updateKeyboardInset()
  window.visualViewport?.addEventListener('resize', updateKeyboardInset)
  window.visualViewport?.addEventListener('scroll', updateKeyboardInset)
})
onBeforeUnmount(() => {
  disposed = true
  pageEpoch += 1
  for (const task of uploads.value) {
    task.controller?.abort()
    if (task.objectUrl) URL.revokeObjectURL(task.objectUrl)
  }
  window.visualViewport?.removeEventListener('resize', updateKeyboardInset)
  window.visualViewport?.removeEventListener('scroll', updateKeyboardInset)
})

function updateSelection() {
  if (!editor.value) return
  const { from, to, empty } = editor.value.state.selection
  emit('selection', from, to, empty)
  keepCaretAboveTouchToolbar()
}

const { editor, getDocument } = useDocumentEditor({
  extensions: [ProductLink, EotionImage, EotionFile, EotionTodo, AttachmentLifetime, BlockIdentity, createSlashCommand(() => composing.value, openPicker, Boolean(props.workspaceId))],
  content: props.content,
  ariaLabel: props.ariaLabel ?? 'Tiptap 编辑区域',
  attributes: { spellcheck: 'false' },
  onCreate: updateSelection,
  onSelectionUpdate: updateSelection,
  onUpdate: document => emit('update', document),
  onTransaction: ({ transaction }) => emit('transaction', transaction.docChanged),
})

function previewable(file: File): boolean {
  return SAFE_IMAGE_MIME_TYPES.includes(file.type as typeof SAFE_IMAGE_MIME_TYPES[number])
}

function openPicker(kind: AttachmentKind): void {
  if (!props.workspaceId) return
  ;(kind === 'image' ? imageInput.value : fileInput.value)?.click()
}

function isOnlyFiles(transfer: DataTransfer): boolean {
  const items = Array.from(transfer.items)
  return items.length > 0 ? items.every((item) => item.kind === 'file') : transfer.files.length > 0
}

function onDrop(event: DragEvent): void {
  draggingFiles.value = false
  if (!props.workspaceId || !event.dataTransfer || !isOnlyFiles(event.dataTransfer)) return
  event.preventDefault()
  queueFiles(Array.from(event.dataTransfer.files))
}

function onDragOver(event: DragEvent): void {
  if (!props.workspaceId || !event.dataTransfer || !isOnlyFiles(event.dataTransfer)) return
  event.preventDefault()
  draggingFiles.value = true
}

function onDragEnter(event: DragEvent): void {
  if (props.workspaceId && event.dataTransfer && isOnlyFiles(event.dataTransfer)) draggingFiles.value = true
}

function onDragLeave(event: DragEvent): void {
  const related = event.relatedTarget
  if (!(related instanceof Node) || !editor.value?.view.dom.contains(related)) draggingFiles.value = false
}

function onPaste(event: ClipboardEvent): void {
  if (!props.workspaceId || !event.clipboardData || event.clipboardData.getData('text/html') || event.clipboardData.getData('text/plain')) return
  const items = Array.from(event.clipboardData.items)
  const imageFiles = items.filter((item) => item.kind === 'file' && item.type.startsWith('image/')).map((item) => item.getAsFile()).filter((file): file is File => file !== null)
  if (imageFiles.length === 0 || imageFiles.length !== items.length) return
  event.preventDefault()
  queueFiles(imageFiles)
}

function uploadError(error: unknown): string {
  if (!navigator.onLine) return '附件上传需要联网；正文仍可继续编辑。'
  if (error instanceof ApiError && error.statusCode === 401) {
    expireSessionFromApi()
    return '登录状态已过期，请重新登录后重试附件上传。'
  }
  if (error instanceof ApiError && error.statusCode === 413) return '文件过大，服务器无法接收此附件。'
  if (error instanceof ApiError && error.statusCode >= 500) return '附件服务暂时不可用，请稍后重试。'
  return errorMessage(error, '附件上传失败，请检查网络后重试。')
}

function queueFiles(files: File[]): void {
  if (!props.workspaceId) return
  uploadAlert.value = ''
  for (const file of files) {
    const online = navigator.onLine
    const task = reactive<UploadTask>({
      id: createLocalId(), fileId: createLocalId(), file, phase: online ? 'uploading' : 'failed',
      error: online ? '' : '附件上传需要联网；正文仍可继续编辑。',
      ...(previewable(file) ? { objectUrl: URL.createObjectURL(file) } : {}), started: false, durable: false, epoch: pageEpoch,
    })
    uploads.value.push(task)
    if (online) void upload(task)
  }
}

async function waitForComposition(signal: AbortSignal): Promise<void> {
  if (!composing.value) return
  await new Promise<void>((resolve, reject) => {
    const finish = () => { cleanup(); resolve() }
    const abort = () => { cleanup(); reject(new DOMException('Upload cancelled', 'AbortError')) }
    const cleanup = () => { compositionWaiters.delete(finish); signal.removeEventListener('abort', abort) }
    compositionWaiters.add(finish)
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  })
}

async function upload(task: UploadTask): Promise<void> {
  if (task.running) await task.running
  if (disposed || task.durable) return
  const run = performUpload(task)
  task.running = run
  try { await run } finally { if (task.running === run) task.running = undefined }
}

async function performUpload(task: UploadTask): Promise<void> {
  const entryEpoch = pageEpoch
  const workspaceId = props.workspaceId
  if (!workspaceId || disposed) return
  if (task.started) {
    // Retrying reuses the UI placeholder, never a file identity that may already
    // be queued for compensation from a lost response or cancelled attempt.
    if (!(await enqueueCleanup(workspaceId, task.fileId))) return
    if (disposed || entryEpoch !== pageEpoch) return
    task.fileId = createLocalId()
    task.started = false
  }
  task.controller?.abort()
  const controller = new AbortController()
  task.controller = controller
  task.phase = 'uploading'
  task.error = ''
  task.epoch = pageEpoch
  const epoch = task.epoch
  let uploadedFileId: string | undefined
  let insertedBlockId: string | undefined
  try {
    task.started = true
    const uploaded = await api.files.upload(workspaceId, task.fileId, task.file, controller.signal)
    uploadedFileId = uploaded.id
    await waitForComposition(controller.signal)
    if (controller.signal.aborted || epoch !== pageEpoch) {
      await enqueueCleanup(workspaceId, uploaded.id)
      return
    }
    if (uploaded.id !== task.fileId) throw new Error('附件服务返回了不同的文件身份。')
    const mimeType = uploaded.mimeType.trim().toLowerCase()
    const parsedAttrs = AttachmentAttrsSchema.safeParse({ fileId: uploaded.id, name: uploaded.name, mimeType, size: uploaded.size, url: uploaded.url })
    if (!parsedAttrs.success) throw new Error('附件服务未返回有效的安全信息。')
    const attrs = parsedAttrs.data
    const kind: AttachmentKind = SAFE_IMAGE_MIME_TYPES.includes(mimeType as typeof SAFE_IMAGE_MIME_TYPES[number]) ? 'image' : 'file'
    const target = editor.value
    if (!target || !props.commitAttachment) throw new Error('本地正文保存尚未就绪，无法确认附件已保存。')
    const blockId = createLocalId()
    insertedBlockId = blockId
    const nodeType = target.schema.nodes[kind === 'image' ? 'eotionImage' : 'eotionFile']
    if (!nodeType) throw new Error('编辑器附件类型尚未就绪。')
    const node = nodeType.create({ ...attrs, blockId })
    const selectionPosition = target.state.selection.from
    let insertAt = target.state.doc.content.size
    target.state.doc.forEach((current, offset) => {
      if (selectionPosition >= offset && selectionPosition <= offset + current.nodeSize) insertAt = offset + current.nodeSize
    })
    task.phase = 'saving'
    target.view.dispatch(target.state.tr.insert(insertAt, node).scrollIntoView())
    await nextTick()
    const durable = await props.commitAttachment(blockId)
    if (!durable) {
      removeBlock(blockId)
      await enqueueCleanup(workspaceId, uploaded.id)
      task.phase = 'failed'
      task.error = '附件上传完成，但本地正文没有保存此附件；可以重试。'
      return
    }
    task.durable = true
    task.phase = 'success'
    if (task.objectUrl) URL.revokeObjectURL(task.objectUrl)
    task.objectUrl = undefined
    if (epoch !== pageEpoch || controller.signal.aborted) return
    window.setTimeout(() => removeTask(task), 1200)
  } catch (error) {
    if (insertedBlockId) removeBlock(insertedBlockId)
    if (uploadedFileId) await enqueueCleanup(workspaceId, uploadedFileId)
    else if (task.started) await enqueueCleanup(workspaceId, task.fileId)
    if (controller.signal.aborted) {
      task.phase = 'cancelled'
      task.error = '已取消'
      return
    }
    task.phase = 'failed'
    task.error = uploadError(error)
    uploadAlert.value = task.error
  }
}

function removeBlock(blockId: string): void {
  const target = editor.value
  if (!target) return
  let removeFrom = -1
  let removeTo = -1
  target.state.doc.forEach((node, offset) => {
    if (node.attrs.blockId === blockId) { removeFrom = offset; removeTo = offset + node.nodeSize }
  })
  if (removeFrom >= 0) target.view.dispatch(target.state.tr.delete(removeFrom, removeTo))
}

async function enqueueCleanup(workspaceId: string, fileId: string): Promise<boolean> {
  const stored = await enqueueAttachmentCleanup(workspaceId, fileId)
  if (!stored) {
    uploadAlert.value = '附件清理暂未写入本地队列，请重试清理。'
  }
  return stored
}

async function retryCleanups(): Promise<void> {
  for (const item of [...pendingCleanup.value]) await enqueueCleanup(item.workspaceId, item.fileId)
}

function removeTask(task: UploadTask): void {
  if (task.objectUrl) URL.revokeObjectURL(task.objectUrl)
  task.objectUrl = undefined
  uploads.value = uploads.value.filter((item) => item !== task)
}

function cancelUpload(task: UploadTask): void {
  task.controller?.abort()
  task.phase = 'cancelled'
  task.error = '已取消'
  if (task.objectUrl) URL.revokeObjectURL(task.objectUrl)
  task.objectUrl = undefined
}

function onFilesSelected(kind: AttachmentKind, event: Event): void {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (kind === 'image') queueFiles(files.filter(previewable))
  else queueFiles(files)
  input.value = ''
}

function onCompositionStart(event: CompositionEvent) {
  composing.value = true
  if (editor.value) exitSuggestion(editor.value.view)
  emit('composition', true, event)
}

function onCompositionEnd(event: CompositionEvent) {
  composing.value = false
  emit('composition', false, event)
  const document = getDocument()
  if (document) emit('update', document)
  for (const finish of [...compositionWaiters]) finish()
}

function selectBlock(command: BlockCommand) {
  if (editor.value && !composing.value) runBlockCommand(editor.value, command)
}

defineExpose({ editor })
</script>

<template>
  <section class="eotion-editor" :class="{ 'eotion-editor--drop-active': draggingFiles, 'eotion-editor--touch-toolbar': touchToolbar }" :style="touchToolbar ? { '--touch-keyboard-inset': `${keyboardInset}px` } : undefined" aria-label="Tiptap 编辑器">
    <div v-if="fixedToolbar ?? !workspaceId" class="eotion-editor-toolbar" role="toolbar" aria-label="块类型">
      <button type="button" :aria-pressed="editor?.isActive('paragraph') ?? false" :disabled="!editor" @click="selectBlock('paragraph')"><EotionIcon name="text" :size="16" /> 文本</button>
      <button type="button" :aria-pressed="editor?.isActive('heading', { level: 1 }) ?? false" :disabled="!editor" @click="selectBlock('heading1')"><EotionIcon name="heading" :size="16" /> H1</button>
      <button type="button" :aria-pressed="editor?.isActive('heading', { level: 2 }) ?? false" :disabled="!editor" @click="selectBlock('heading2')"><EotionIcon name="heading" :size="16" /> H2</button>
      <button type="button" :aria-pressed="editor?.isActive('bulletList') ?? false" :disabled="!editor" @click="selectBlock('bulletList')"><EotionIcon name="list" :size="16" /> 列表</button>
      <button type="button" :aria-pressed="editor?.isActive('orderedList') ?? false" :disabled="!editor" @click="selectBlock('orderedList')"><EotionIcon name="list-ordered" :size="16" /> 编号列表</button>
      <button v-if="workspaceId" type="button" :disabled="!editor" @click="openPicker('image')"><EotionIcon name="image" :size="16" /> 图片</button>
      <button v-if="workspaceId" type="button" :disabled="!editor" @click="openPicker('file')"><EotionIcon name="paperclip" :size="16" /> 文件</button>
    </div>
    <input ref="imageInput" class="eotion-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" multiple aria-label="选择图片附件" @change="onFilesSelected('image', $event)">
    <input ref="fileInput" class="eotion-file-input" type="file" multiple aria-label="选择文件附件" @change="onFilesSelected('file', $event)">
    <div v-if="uploads.length" class="eotion-upload-list" aria-label="附件上传">
      <article v-for="task in uploads" :key="task.id" class="eotion-upload-item">
        <img v-if="task.objectUrl" :src="task.objectUrl" :alt="task.file.name" class="eotion-upload-preview">
        <EotionIcon v-else :name="task.file.type.startsWith('image/') ? 'image' : 'file-text'" :size="20" />
        <div class="eotion-upload-copy">
          <strong>{{ task.file.name }}</strong>
          <span role="status">{{ task.phase === 'uploading' ? '正在上传…' : task.phase === 'saving' ? '正在保存附件…' : task.phase === 'success' ? '已保存' : task.phase === 'cancelled' ? '已取消' : task.error }}</span>
        </div>
        <button v-if="task.phase === 'uploading'" type="button" :aria-label="`取消上传 ${task.file.name}`" @click="cancelUpload(task)"><EotionIcon name="x" :size="16" /></button>
        <button v-else-if="task.phase === 'failed'" type="button" :aria-label="`重试上传 ${task.file.name}`" @click="upload(task)"><EotionIcon name="refresh" :size="16" /> 重试</button>
        <button v-else-if="task.phase === 'cancelled'" type="button" :aria-label="`移除 ${task.file.name}`" @click="removeTask(task)"><EotionIcon name="x" :size="16" /></button>
      </article>
    </div>
    <p v-if="uploadAlert" class="eotion-upload-alert" role="alert">{{ uploadAlert }}</p>
    <div v-if="pendingCleanup.length" class="eotion-cleanup-retry" role="alert">
      <span>有附件尚未加入本地清理队列。</span>
      <button type="button" @click="retryCleanups">重试清理</button>
    </div>
    <EditorContent
      :editor="editor"
      class="eotion-editor-content"
      @compositionstart="onCompositionStart"
      @compositionupdate="emit('composition', true, $event)"
      @compositionend="onCompositionEnd"
      @beforeinput="emit('beforeInput', $event)"
      @pointerdown="emit('pointer', $event)"
      @pointerup="emit('pointer', $event)"
      @pointercancel="emit('pointer', $event)"
      @contextmenu="emit('contextMenu')"
      @drop="onDrop"
      @dragover="onDragOver"
      @dragenter="onDragEnter"
      @dragleave="onDragLeave"
      @paste="onPaste"
    />
    <!-- Tiptap moves the menu element; keep the component mounted across input-mode changes. -->
    <EotionBubbleMenu v-if="editor" :editor="editor" :composing="composing" :enabled="!touchToolbar" />
    <div v-if="touchToolbar" ref="touchToolbarElement" class="eotion-touch-toolbar" role="toolbar" aria-label="触摸编辑工具栏" :style="{ bottom: `${keyboardInset}px` }">
      <button type="button" aria-label="粗体" :aria-pressed="editor?.isActive('bold') ?? false" :disabled="!editor" @click="editor?.chain().focus().toggleBold().run()"><EotionIcon name="bold" :size="18" /></button>
      <button type="button" aria-label="斜体" :aria-pressed="editor?.isActive('italic') ?? false" :disabled="!editor" @click="editor?.chain().focus().toggleItalic().run()"><EotionIcon name="italic" :size="18" /></button>
      <button type="button" aria-label="文本" :aria-pressed="editor?.isActive('paragraph') ?? false" :disabled="!editor" @click="editor?.chain().focus().setParagraph().run()"><EotionIcon name="text" :size="18" /><span>文本</span></button>
      <button type="button" aria-label="标题" :aria-pressed="editor?.isActive('heading', { level: 2 }) ?? false" :disabled="!editor" @click="editor?.chain().focus().toggleHeading({ level: 2 }).run()"><EotionIcon name="heading" :size="18" /><span>标题</span></button>
      <button type="button" aria-label="列表" :aria-pressed="editor?.isActive('bulletList') ?? false" :disabled="!editor" @click="editor?.chain().focus().toggleBulletList().run()"><EotionIcon name="list" :size="18" /><span>列表</span></button>
      <button v-if="workspaceId" type="button" :disabled="!editor" aria-label="插入图片" @click="openPicker('image')"><EotionIcon name="image" :size="18" /></button>
      <button v-if="workspaceId" type="button" :disabled="!editor" aria-label="插入文件" @click="openPicker('file')"><EotionIcon name="paperclip" :size="18" /></button>
    </div>
  </section>
</template>

<style scoped>
.eotion-editor { min-width: 0; }
.eotion-editor--drop-active .eotion-editor-content { outline: 2px dashed var(--e-color-focus); outline-offset: 6px; }
.eotion-editor-toolbar { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: var(--e-space-4); }
.eotion-editor-toolbar button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 28px; padding: 4px 8px; border: 0; border-radius: var(--e-radius-control); background: transparent; color: var(--e-color-text-muted); font: 500 14px / 1.4 var(--e-type-family); cursor: pointer; }
.eotion-editor-toolbar button[aria-pressed="true"] { background: var(--e-color-selected); color: var(--e-color-text-primary); }
.eotion-editor-toolbar button:hover { background: var(--e-color-hover); color: var(--e-color-text-primary); }
.eotion-editor-toolbar button:focus-visible { outline: var(--e-focus-ring-width) solid var(--e-color-focus); outline-offset: 2px; }
.eotion-editor-toolbar button:disabled { cursor: default; opacity: .5; }
.eotion-editor-content :deep(.tiptap) { min-height: 220px; }
.eotion-editor--touch-toolbar { padding-bottom: calc(60px + var(--safe-bottom) + var(--touch-keyboard-inset, 0px)); }
.eotion-touch-toolbar { position: fixed; z-index: 15; right: 0; left: 0; display: flex; gap: 4px; overflow-x: auto; overscroll-behavior-x: contain; padding: 6px max(12px, var(--safe-right)) calc(6px + var(--safe-bottom)) max(12px, var(--safe-left)); border-top: 1px solid var(--e-color-border-subtle); background: var(--e-color-surface); }
.eotion-touch-toolbar button { display: inline-flex; flex: 1 0 auto; min-width: 44px; min-height: 44px; align-items: center; justify-content: center; gap: 4px; padding: 0 8px; border: 0; border-radius: var(--e-radius-control); background: transparent; color: var(--e-color-text-secondary); font: var(--e-type-metadata-weight) var(--e-type-metadata-size) / var(--e-type-metadata-line) var(--e-type-family); cursor: pointer; white-space: nowrap; }
.eotion-touch-toolbar button[aria-pressed="true"] { background: var(--e-color-selected); color: var(--e-color-text-primary); }
.eotion-touch-toolbar button:hover:not(:disabled):not([aria-pressed="true"]) { background: var(--e-color-hover); color: var(--e-color-text-primary); }
.eotion-touch-toolbar button:active:not(:disabled) { background: var(--e-color-selected); }
.eotion-touch-toolbar button:focus-visible { outline: var(--e-focus-ring-width) solid var(--e-color-focus); outline-offset: -2px; }
.eotion-touch-toolbar button:disabled { cursor: default; opacity: .5; }
.eotion-file-input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; clip-path: inset(50%); }
.eotion-upload-list { display: grid; gap: 7px; margin-bottom: var(--e-space-4); }
.eotion-upload-item { display: flex; min-width: 0; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--e-color-border); border-radius: var(--e-radius-block); background: var(--e-color-surface-subtle); }
.eotion-upload-preview { width: 42px; height: 42px; flex: 0 0 auto; border-radius: 5px; object-fit: cover; }
.eotion-upload-copy { display: grid; min-width: 0; flex: 1; gap: 3px; font-size: 13px; }
.eotion-upload-copy strong, .eotion-upload-copy span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.eotion-upload-copy span { color: var(--editor-muted); font-size: 12px; }
.eotion-upload-item button { display: inline-flex; min-height: 40px; min-width: 40px; align-items: center; justify-content: center; gap: 4px; border: 1px solid var(--border-strong); border-radius: 5px; padding: 4px 7px; background: var(--surface-raised); cursor: pointer; }
.eotion-upload-alert { margin: 0; padding: 8px 12px; border-bottom: 1px solid var(--border-editor); color: var(--danger); font-size: 13px; }
.eotion-cleanup-retry { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--border-editor); color: var(--danger); font-size: 13px; }
.eotion-cleanup-retry button { min-height: 40px; border: 1px solid var(--border-strong); border-radius: 5px; padding: 5px 9px; background: var(--surface-raised); cursor: pointer; }
@media (max-width: 767px), (pointer: coarse) {
  .eotion-editor-toolbar button, .eotion-upload-item button, .eotion-cleanup-retry button { min-width: 44px; min-height: 44px; }
}
</style>

<style>
.p2-slash-menu { z-index: 20; box-sizing: border-box; min-width: min(220px, calc(100vw - 24px)); max-width: calc(100vw - 24px); max-height: min(352px, calc(100dvh - 24px)); overflow-y: auto; overscroll-behavior: contain; padding: 5px; border: 1px solid var(--e-color-border); border-radius: var(--e-radius-control); background: var(--e-color-surface); box-shadow: var(--shadow-menu); color: var(--e-color-text-primary); font: 500 14px / 1.4 var(--e-type-family); }
.p2-slash-group { padding: 8px 10px 3px; color: var(--e-color-text-muted); font-size: 12px; }
.p2-slash-item { display: flex; align-items: center; width: 100%; min-height: 34px; padding: 6px 10px; border: 0; border-radius: var(--e-radius-control); background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.p2-slash-item[aria-selected="true"], .p2-slash-item:hover { background: var(--surface-editor-hover); }
.p2-slash-icon { display: inline-flex; flex: 0 0 auto; align-items: center; margin-right: 10px; }
.p2-slash-item:focus-visible { outline: var(--e-focus-ring-width) solid var(--e-color-focus); outline-offset: -2px; }
</style>
