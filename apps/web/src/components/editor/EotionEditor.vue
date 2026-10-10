<script setup lang="ts">
import type { Attributes } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { EditorContent } from '@tiptap/vue-3'
import Link from '@tiptap/extension-link'
import { exitSuggestion } from '@tiptap/suggestion'
import { AttachmentAttrsSchema, SAFE_IMAGE_MIME_TYPES } from '@eotion/contracts'
import { blockTypeForNode } from '@eotion/domain/block-types'
import { createLocalId } from '@eotion/storage'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { NodeSelection } from '@tiptap/pm/state'

import '../../styles/editor-content.css'
import { AttachmentLifetime, EotionFile, EotionImage, EotionTodo } from '../../editor/attachmentNodes'
import { BlockIdentity } from '../../editor/blockIdentity'
import { EotionToggle } from '../../editor/toggleNodes'
import { EotionDatabase } from '../../editor/databaseNodes'
import { EotionCallout } from '../../editor/calloutNodes'
import { createTablePasteGuard, EotionTable, EotionTableCell, EotionTableHeader, EotionTableRow } from '../../editor/tableNodes'
import { createUploadPlaceholderExtension, UploadPlaceholderRegistry, type UploadPlaceholderTask, type UploadTarget } from '../../editor/uploadPlaceholders'
import { isSafeLinkHref } from '../../editor/link'
import { runBlockCommand, type BlockCommand } from '../../editor/blockCommands'
import { isBlockCommandAllowed } from '../../editor/blockCommandContext'
import { canIndentBlock, canOutdentBlock, indentBlock, NestedBlockInteractions, outdentBlock } from '../../editor/nestedBlockInteractions'
import { enqueueAttachmentCleanup, pendingAttachmentCleanups } from '../../editor/attachmentCleanup'
import { createSlashCommand } from '../../editor/slashCommand'
import type { EditorDocument } from '../../editor/editorDocument'
import type { DatabaseReferenceAttrs } from '@eotion/domain/database'
import { useDocumentEditor } from '../../editor/useDocumentEditor'
import { ApiError, api, errorMessage, expireSessionFromApi } from '../../services/productApi'
import EotionIcon from '../ui/EotionIcon.vue'
import EotionBubbleMenu from './EotionBubbleMenu.vue'
import TableMenu from './TableMenu.vue'

type AttachmentKind = 'image' | 'file'
type UploadTask = UploadPlaceholderTask
const pendingCleanup = pendingAttachmentCleanups

type DatabaseInsertionRequest = { document: EditorDocument; blockId: string }
const props = defineProps<{
  content: EditorDocument
  touchToolbar: boolean
  fixedToolbar?: boolean
  ariaLabel?: string
  workspaceId?: string
  commitAttachment?: (blockId: string) => Promise<boolean>
  createDatabaseReference?: (request: DatabaseInsertionRequest) => Promise<DatabaseReferenceAttrs | null>
  commitDatabaseReference?: (blockId: string) => Promise<boolean>
}>()
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
const selectionRevision = ref(0)
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
const uploadRegistry = new UploadPlaceholderRegistry()
const uploadAlert = ref('')
const editorAlert = ref('')
const TablePasteGuard = createTablePasteGuard(() => {
  editorAlert.value = '粘贴的表格超出可保存的规模，已取消这次粘贴。'
})
const draggingFiles = ref(false)
const databaseCommandPending = ref(false)
const imageInput = ref<HTMLInputElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const touchToolbarElement = ref<HTMLElement | null>(null)
let pageEpoch = 0
let uploadOrder = 0
let pickerTarget: UploadTarget | undefined
let disposed = false
let caretScrollFrame: number | undefined

function updateKeyboardInset() {
  const viewport = window.visualViewport
  keyboardInset.value = viewport
    ? Math.max(0, Math.round(window.innerHeight - viewport.offsetTop - viewport.height))
    : 0
  emit('keyboardInset', keyboardInset.value)
  scheduleCaretVisibility()
}

function scheduleCaretVisibility() {
  if (disposed || !props.touchToolbar || !touchToolbarElement.value || !editor.value?.isFocused || caretScrollFrame !== undefined) return
  caretScrollFrame = requestAnimationFrame(() => {
    caretScrollFrame = requestAnimationFrame(() => {
      caretScrollFrame = undefined
      const current = editor.value
      const toolbar = touchToolbarElement.value
      const scroll = current?.view.dom.closest('.document-wrap')
      if (disposed || !props.touchToolbar || !current?.isFocused || !toolbar || !(scroll instanceof HTMLElement)) return
      const caret = current.view.coordsAtPos(current.state.selection.head)
      const overlap = caret.bottom + 12 - toolbar.getBoundingClientRect().top
      if (overlap > 0) scroll.scrollTop += Math.ceil(overlap)
    })
  })
}

onMounted(() => {
  updateKeyboardInset()
  window.visualViewport?.addEventListener('resize', updateKeyboardInset)
  window.visualViewport?.addEventListener('scroll', updateKeyboardInset)
  window.addEventListener('resize', scheduleCaretVisibility)
  window.addEventListener('scroll', scheduleCaretVisibility)
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
  window.removeEventListener('resize', scheduleCaretVisibility)
  window.removeEventListener('scroll', scheduleCaretVisibility)
  if (caretScrollFrame !== undefined) cancelAnimationFrame(caretScrollFrame)
})

function updateSelection() {
  if (!editor.value) return
  selectionRevision.value += 1
  const { from, to, empty } = editor.value.state.selection
  emit('selection', from, to, empty)
  scheduleCaretVisibility()
}

const { editor, getDocument } = useDocumentEditor({
  extensions: [ProductLink, EotionImage, EotionFile, EotionTodo, EotionToggle, EotionDatabase.configure({ workspaceId: props.workspaceId ?? '' }), EotionCallout, EotionTable, EotionTableRow, EotionTableHeader, EotionTableCell, TablePasteGuard, AttachmentLifetime, BlockIdentity, NestedBlockInteractions,
    createUploadPlaceholderExtension(uploadRegistry, { cancel: cancelUpload, retry: task => { void upload(task) }, remove: removeTask }),
    createSlashCommand(() => composing.value, openPicker, Boolean(props.workspaceId), props.workspaceId && props.createDatabaseReference ? openDatabaseCommand : undefined)],
  content: props.content,
  ariaLabel: props.ariaLabel ?? 'Tiptap 编辑区域',
  attributes: { spellcheck: 'false' },
  editorProps: {
    handleClick: view => {
      if (view.hasFocus() || view.state.doc.lastChild?.type.name !== 'eotionDatabase') return false
      // StarterKit appends a trailing paragraph on first focus. Do it before ProseMirror
      // creates a pointer selection so the selection belongs to the current document.
      view.focus()
      return false
    },
  },
  onCreate: updateSelection,
  onSelectionUpdate: updateSelection,
  onUpdate: document => {
    editorAlert.value = ''
    emit('update', document)
  },
  onTransaction: ({ transaction }) => {
    emit('transaction', transaction.docChanged)
    if (transaction.docChanged || transaction.selectionSet) scheduleCaretVisibility()
  },
})

async function openDatabaseCommand(range: { from: number; to: number }): Promise<void> {
  const current = editor.value
  if (!props.workspaceId || !props.createDatabaseReference || !current || composing.value || databaseCommandPending.value || uploads.value.some(task => task.phase === 'uploading' || task.phase === 'saving')) return
  if (!isBlockCommandAllowed(current, 'database', range.from)) return
  const $position = current.state.doc.resolve(range.from)
  let depth = $position.depth
  while (depth > 0 && !blockTypeForNode($position.node(depth).type.name)) depth -= 1
  if (depth === 0) return
  const block = $position.node(depth)
  const position = $position.before(depth)
  if (range.from !== position + 1 || range.to !== position + block.nodeSize - 1) {
    editorAlert.value = '请在独立空行输入 /database，已有正文会保留。'
    return
  }
  const originalBlockId = typeof block.attrs.blockId === 'string' ? block.attrs.blockId : ''
  if (!originalBlockId) return
  const blockId = createLocalId()
  const databaseNode = current.schema.nodes.eotionDatabase?.create({ databaseId: 'pending-database', viewId: 'pending-view', blockId })
  if (!databaseNode) return
  const transaction = current.state.tr.replaceWith(position, position + block.nodeSize, databaseNode)
  const candidate = transaction.doc.toJSON() as EditorDocument
  databaseCommandPending.value = true
  current.setEditable(false, false)
  if (disposed) return
  let databaseRequestHasServerCommit = false
  try {
    const reference = await props.createDatabaseReference({ document: candidate, blockId })
    if (!reference) return
    databaseRequestHasServerCommit = true
    if (disposed || editor.value !== current) {
      await props.commitDatabaseReference?.(blockId)
      return
    }
    let insertion = transaction
    let insertionPosition = position
    if (!current.state.doc.eq(transaction.before)) {
      let targetPosition = -1
      let targetNode: ProseMirrorNode | undefined
      current.state.doc.descendants((node, at) => {
        if (node.attrs.blockId === originalBlockId) { targetPosition = at; targetNode = node; return false }
      })
      if (targetPosition < 0 || !targetNode) throw new Error('页面内容在数据库创建期间发生变化。数据库已创建，请刷新页面后确认引用。')
      const currentDatabaseNode = current.schema.nodes.eotionDatabase!.create({ databaseId: reference.databaseId, viewId: reference.viewId, blockId })
      insertion = current.state.tr.replaceWith(targetPosition, targetPosition + targetNode.nodeSize, currentDatabaseNode)
      insertionPosition = targetPosition
    } else {
      const inserted = transaction.doc.nodeAt(position)
      if (!inserted || inserted.type.name !== 'eotionDatabase') throw new Error('数据库引用没有插入，请重试。')
      transaction.setNodeMarkup(position, undefined, { ...inserted.attrs, databaseId: reference.databaseId, viewId: reference.viewId })
    }
    insertion.setSelection(NodeSelection.create(insertion.doc, insertionPosition))
    current.view.dispatch(insertion)
    const committed = await props.commitDatabaseReference?.(blockId)
    if (committed === false) editorAlert.value = '数据库已创建，但页面引用尚未保存。请使用页面上的“重试保存”继续保存同一个引用。'
    else editorAlert.value = ''
  } catch (cause) {
    if (databaseRequestHasServerCommit) {
      const recovered = await props.commitDatabaseReference?.(blockId)
      editorAlert.value = recovered === false
        ? '数据库已创建，页面正在恢复引用；若引用没有出现，请刷新后确认。'
        : '数据库已创建，但页面引用无法自动恢复。请刷新页面后确认数据库是否已插入。'
    } else editorAlert.value = cause instanceof Error ? cause.message : '数据库操作失败，请重试。'
  } finally {
    databaseCommandPending.value = false
    if (!disposed && editor.value === current) current.setEditable(true, false)
  }
}

function previewable(file: File): boolean {
  return SAFE_IMAGE_MIME_TYPES.includes(file.type as typeof SAFE_IMAGE_MIME_TYPES[number])
}

function openPicker(kind: AttachmentKind): void {
  const current = editor.value
  if (!props.workspaceId || !current || !isBlockCommandAllowed(current, kind)) return
  uploadRegistry.discardTarget(pickerTarget)
  pickerTarget = uploadRegistry.capture(current.state)
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
  const current = editor.value
  if (!current) return
  const dropPosition = current.view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? current.state.selection.from
  if (!isBlockCommandAllowed(current, 'file', dropPosition)) return
  queueFiles(Array.from(event.dataTransfer.files), uploadRegistry.capture(current.state, dropPosition))
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
  const current = editor.value
  if (!current || !isBlockCommandAllowed(current, 'image')) return
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

function queueFiles(files: File[], frozenTarget?: UploadTarget): void {
  if (!props.workspaceId) return
  uploadAlert.value = ''
  const target = frozenTarget ?? (editor.value ? uploadRegistry.capture(editor.value.state) : undefined)
  if (!target) return
  if (files.length === 0) {
    uploadRegistry.discardTarget(target)
    return
  }
  for (const file of files) {
    const online = navigator.onLine
    const task = reactive<UploadTask>({
      id: createLocalId(), fileId: createLocalId(), file, phase: online ? 'uploading' : 'failed',
      error: online ? '' : '附件上传需要联网；正文仍可继续编辑。',
      ...(previewable(file) ? { objectUrl: URL.createObjectURL(file) } : {}), started: false, durable: false, epoch: pageEpoch,
      groupId: target.id, order: uploadOrder++, visible: true,
    })
    uploads.value.push(task)
    uploadRegistry.add(task)
    if (online) void upload(task)
  }
  refreshUploadPlaceholders()
}

function refreshUploadPlaceholders(): void {
  const current = editor.value
  if (current && !current.isDestroyed) current.view.dispatch(current.state.tr.setMeta('uploadPlaceholders', true))
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
  if (disposed || !task.visible || task.durable) return
  const run = performUpload(task)
  task.running = run
  try { await run } finally {
    if (task.running === run) task.running = undefined
    if (!task.visible) releaseTaskFile(task)
    uploadRegistry.pruneGroup(task.groupId)
  }
}

async function performUpload(task: UploadTask): Promise<void> {
  const entryEpoch = pageEpoch
  const workspaceId = props.workspaceId
  if (!workspaceId || disposed || !task.visible) return
  if (task.started) {
    // Retrying reuses the UI placeholder, never a file identity that may already
    // be queued for compensation from a lost response or cancelled attempt.
    if (!(await enqueueCleanup(workspaceId, task.fileId))) return
    if (disposed || entryEpoch !== pageEpoch || !task.visible) return
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
  let replacementNode: ProseMirrorNode | undefined
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
    const slot = uploadRegistry.resolveSlot(task, target.state)
    const resolvedBlockId = slot.replaceBlockId ?? blockId
    replacementNode = slot.restoreNode
    const node = nodeType.create({ ...attrs, blockId: resolvedBlockId })
    task.phase = 'saving'
    task.error = ''
    task.provisionalBlockId = resolvedBlockId
    insertedBlockId = resolvedBlockId
    let transaction = target.state.tr
    if (slot.replaceFrom !== undefined && slot.replaceTo !== undefined) transaction = transaction.replaceWith(slot.replaceFrom, slot.replaceTo, node)
    else transaction = transaction.insert(slot.position, node)
    target.view.dispatch(transaction.scrollIntoView())
    refreshUploadPlaceholders()
    await nextTick()
    if (disposed || epoch !== pageEpoch || controller.signal.aborted) return
    const durable = await props.commitAttachment(resolvedBlockId)
    if (disposed || epoch !== pageEpoch) return
    if (!durable) {
      restoreEmptySlot(task, resolvedBlockId, replacementNode)
      await enqueueCleanup(workspaceId, uploaded.id)
      if (disposed || epoch !== pageEpoch) return
      task.phase = 'failed'
      task.error = '附件上传完成，但本地正文没有保存此附件；可以重试。'
      cleanupEmptyTarget(task)
      refreshUploadPlaceholders()
      return
    }
    task.durable = true
    task.phase = 'success'
    task.error = ''
    task.provisionalBlockId = undefined
    uploadRegistry.setFinalBlockId(task, resolvedBlockId)
    task.visible = false
    refreshUploadPlaceholders()
    cleanupEmptyTarget(task)
    if (task.objectUrl) URL.revokeObjectURL(task.objectUrl)
    task.objectUrl = undefined
    if (epoch !== pageEpoch || controller.signal.aborted) return
    window.setTimeout(() => removeTask(task), 1200)
  } catch (error) {
    if (insertedBlockId) restoreEmptySlot(task, insertedBlockId, replacementNode)
    task.provisionalBlockId = undefined
    task.finalBlockId = undefined
    if (uploadedFileId) await enqueueCleanup(workspaceId, uploadedFileId)
    else if (task.started) await enqueueCleanup(workspaceId, task.fileId)
    if (disposed || epoch !== pageEpoch) return
    if (controller.signal.aborted) {
      task.phase = 'cancelled'
      task.error = '已取消'
      refreshUploadPlaceholders()
      return
    }
    task.phase = 'failed'
    task.error = uploadError(error)
    uploadAlert.value = task.error
    cleanupEmptyTarget(task)
    refreshUploadPlaceholders()
  }
}

function restoreEmptySlot(task: UploadTask, blockId: string, restoreNode?: ProseMirrorNode): void {
  const target = editor.value
  if (!target) return
  let removeFrom = -1
  let removeTo = -1
  target.state.doc.forEach((node, offset) => {
    if ((node.type.name === 'eotionImage' || node.type.name === 'eotionFile') &&
      node.attrs.blockId === blockId && node.attrs.fileId === task.fileId) {
      removeFrom = offset
      removeTo = offset + node.nodeSize
    }
  })
  task.provisionalBlockId = undefined
  task.finalBlockId = undefined
  if (removeFrom < 0) return
  let transaction = target.state.tr
  if (restoreNode) transaction = transaction.replaceWith(removeFrom, removeTo, restoreNode)
  else transaction = transaction.delete(removeFrom, removeTo)
  // Rollback is a correction to an uncommitted provisional insert.
  transaction.setMeta('addToHistory', false)
  target.view.dispatch(transaction)
  refreshUploadPlaceholders()
}

function cleanupEmptyTarget(task: UploadTask): void {
  const target = editor.value
  if (!target || target.isDestroyed || !uploadRegistry.canCleanupEmptyTarget(target.state, task.groupId)) return
  const range = uploadRegistry.emptyTargetRange(target.state, task.groupId)
  if (!range) return
  const transaction = target.state.tr.delete(range.from, range.to).setMeta('addToHistory', false)
  target.view.dispatch(transaction)
  refreshUploadPlaceholders()
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
  if (task.running) {
    task.controller?.abort()
    task.phase = 'cancelled'
  }
  task.visible = false
  cleanupEmptyTarget(task)
  if (task.objectUrl) URL.revokeObjectURL(task.objectUrl)
  task.objectUrl = undefined
  uploads.value = uploads.value.filter((item) => item !== task)
  uploadRegistry.remove(task)
  uploadRegistry.pruneGroup(task.groupId)
  if (!task.running) releaseTaskFile(task)
  refreshUploadPlaceholders()
}

function releaseTaskFile(task: UploadTask): void {
  if (task.file.size > 0) task.file = new File([], task.file.name, { type: task.file.type })
}

function cancelUpload(task: UploadTask): void {
  task.controller?.abort()
  task.phase = 'cancelled'
  task.error = '已取消'
  task.visible = false
  if (task.objectUrl) URL.revokeObjectURL(task.objectUrl)
  task.objectUrl = undefined
  refreshUploadPlaceholders()
  cleanupEmptyTarget(task)
  window.setTimeout(() => removeTask(task), 1200)
}

function onFilesSelected(kind: AttachmentKind, event: Event): void {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  const target = pickerTarget
  pickerTarget = undefined
  if (kind === 'image') queueFiles(files.filter(previewable), target)
  else queueFiles(files, target)
  input.value = ''
}

function onPickerCancelled(): void {
  uploadRegistry.discardTarget(pickerTarget)
  pickerTarget = undefined
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
  scheduleCaretVisibility()
}

function selectBlock(command: BlockCommand) {
  if (editor.value && !composing.value) runBlockCommand(editor.value, command)
}

const canIndentSelection = computed(() => {
  selectionRevision.value
  return !!editor.value && canIndentBlock(editor.value.state.doc, editor.value.state.selection, false)
})
const canOutdentSelection = computed(() => {
  selectionRevision.value
  return !!editor.value && canOutdentBlock(editor.value.state.doc, editor.value.state.selection, false)
})
function indentSelection(): void {
  if (editor.value && !composing.value) indentBlock(editor.value, false)
}
function outdentSelection(): void {
  if (editor.value && !composing.value) outdentBlock(editor.value, false)
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
      <button v-if="workspaceId" type="button" :disabled="!editor || !isBlockCommandAllowed(editor, 'image')" @click="openPicker('image')"><EotionIcon name="image" :size="16" /> 图片</button>
      <button v-if="workspaceId" type="button" :disabled="!editor || !isBlockCommandAllowed(editor, 'file')" @click="openPicker('file')"><EotionIcon name="paperclip" :size="16" /> 文件</button>
    </div>
    <input ref="imageInput" class="eotion-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" multiple aria-label="选择图片附件" @change="onFilesSelected('image', $event)" @cancel="onPickerCancelled">
    <input ref="fileInput" class="eotion-file-input" type="file" multiple aria-label="选择文件附件" @change="onFilesSelected('file', $event)" @cancel="onPickerCancelled">
    <div v-if="uploads.some(task => task.phase === 'success' || task.phase === 'cancelled')" class="eotion-upload-terminal" aria-label="附件上传结果">
      <p v-for="task in uploads.filter(item => item.phase === 'success' || item.phase === 'cancelled')" :key="task.id" role="status">
        {{ task.file.name }} · {{ task.phase === 'success' ? '已保存' : '已取消' }}
      </p>
    </div>
    <p v-if="uploadAlert" class="eotion-upload-alert" role="alert">{{ uploadAlert }}</p>
    <p v-if="editorAlert" class="eotion-upload-alert" role="alert">{{ editorAlert }}</p>
    <div v-if="pendingCleanup.length" class="eotion-cleanup-retry" role="alert">
      <span>有附件尚未加入本地清理队列。</span>
      <button type="button" @click="retryCleanups">重试清理</button>
    </div>
    <EditorContent
      :editor="editor"
      class="eotion-editor-content"
      @input="scheduleCaretVisibility"
      @focusin="scheduleCaretVisibility"
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
    <TableMenu v-if="editor" :editor="editor" :composing="composing" />
    <div v-if="touchToolbar" ref="touchToolbarElement" class="eotion-touch-toolbar" role="toolbar" aria-label="触摸编辑工具栏" :style="{ bottom: `${keyboardInset}px` }">
      <button type="button" aria-label="粗体" :aria-pressed="editor?.isActive('bold') ?? false" :disabled="!editor" @click="editor?.chain().focus().toggleBold().run()"><EotionIcon name="bold" :size="18" /></button>
      <button type="button" aria-label="斜体" :aria-pressed="editor?.isActive('italic') ?? false" :disabled="!editor" @click="editor?.chain().focus().toggleItalic().run()"><EotionIcon name="italic" :size="18" /></button>
      <button type="button" aria-label="文本" :aria-pressed="editor?.isActive('paragraph') ?? false" :disabled="!editor" @click="selectBlock('paragraph')"><EotionIcon name="text" :size="18" /><span>文本</span></button>
      <button type="button" aria-label="二级标题（H2）" :aria-pressed="editor?.isActive('heading', { level: 2 }) ?? false" :disabled="!editor" @click="selectBlock('heading2')"><span class="eotion-touch-heading-icon" aria-hidden="true"><EotionIcon name="heading" :size="18" /><sub>2</sub></span><span>标题</span></button>
      <button type="button" aria-label="列表" :aria-pressed="editor?.isActive('bulletList') ?? false" :disabled="!editor" @click="selectBlock('bulletList')"><EotionIcon name="list" :size="18" /><span>列表</span></button>
      <button type="button" aria-label="缩进区块" :disabled="!canIndentSelection || composing" @mousedown.prevent @click="indentSelection">⇥</button>
      <button type="button" aria-label="取消缩进区块" :disabled="!canOutdentSelection || composing" @mousedown.prevent @click="outdentSelection">⇤</button>
      <button v-if="workspaceId" type="button" :disabled="!editor || !isBlockCommandAllowed(editor, 'image')" aria-label="插入图片" @click="openPicker('image')"><EotionIcon name="image" :size="18" /></button>
      <button v-if="workspaceId" type="button" :disabled="!editor || !isBlockCommandAllowed(editor, 'file')" aria-label="插入文件" @click="openPicker('file')"><EotionIcon name="paperclip" :size="18" /></button>
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
.eotion-touch-heading-icon { position: relative; display: inline-flex; }
.eotion-touch-heading-icon sub { position: absolute; right: -2px; bottom: -1px; color: currentColor; font-size: 10px; font-weight: 600; line-height: 1; }
.eotion-touch-toolbar button[aria-pressed="true"] { background: var(--e-color-selected); color: var(--e-color-text-primary); }
.eotion-touch-toolbar button:hover:not(:disabled):not([aria-pressed="true"]) { background: var(--e-color-hover); color: var(--e-color-text-primary); }
.eotion-touch-toolbar button:active:not(:disabled) { background: var(--e-color-selected); }
.eotion-touch-toolbar button:focus-visible { outline: var(--e-focus-ring-width) solid var(--e-color-focus); outline-offset: -2px; }
.eotion-touch-toolbar button:disabled { cursor: default; opacity: .5; }
.eotion-touch-toolbar button[aria-label="缩进区块"], .eotion-touch-toolbar button[aria-label="取消缩进区块"] { flex: 0 0 44px; padding: 0; font-size: 19px; }
.eotion-file-input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; clip-path: inset(50%); }
.eotion-upload-alert { margin: 0; padding: 8px 12px; border-bottom: 1px solid var(--border-editor); color: var(--danger); font-size: 13px; }
.eotion-cleanup-retry { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--border-editor); color: var(--danger); font-size: 13px; }
.eotion-cleanup-retry button { min-height: 40px; border: 1px solid var(--border-strong); border-radius: 5px; padding: 5px 9px; background: var(--surface-raised); cursor: pointer; }
@media (max-width: 767px), (pointer: coarse) {
  .eotion-editor-toolbar button, .eotion-cleanup-retry button { min-width: 44px; min-height: 44px; }
}
</style>

<style>
.p2-slash-menu { z-index: 20; box-sizing: border-box; min-width: min(220px, calc(100vw - 24px)); max-width: calc(100vw - 24px); max-height: min(352px, calc(100dvh - 24px)); overflow-y: auto; overscroll-behavior: contain; padding: 5px; border: 1px solid var(--e-color-border); border-radius: var(--e-radius-control); background: var(--e-color-surface); box-shadow: var(--shadow-menu); color: var(--e-color-text-primary); font: 500 14px / 1.4 var(--e-type-family); }
.p2-slash-group { padding: 8px 10px 3px; color: var(--e-color-text-muted); font-size: 12px; }
.p2-slash-item { display: flex; align-items: center; width: 100%; min-height: 34px; padding: 6px 10px; border: 0; border-radius: var(--e-radius-control); background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.p2-slash-item[aria-selected="true"], .p2-slash-item:hover { background: var(--surface-editor-hover); }
.p2-slash-icon { display: inline-flex; flex: 0 0 auto; align-items: center; margin-right: 10px; }
.p2-slash-item:focus-visible { outline: var(--e-focus-ring-width) solid var(--e-color-focus); outline-offset: -2px; }
.eotion-upload-placeholder { display: block; box-sizing: border-box; max-width: 100%; margin: 7px 0; }
.eotion-upload-terminal { display: grid; gap: 2px; padding: 6px 12px; border-bottom: 1px solid var(--border-editor); color: var(--editor-muted); font-size: 12px; }
.eotion-upload-terminal p { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.eotion-upload-item { display: flex; min-width: 0; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--e-color-border); border-radius: var(--e-radius-block); background: var(--e-color-surface-subtle); color: var(--e-color-text-primary); font: 500 13px / 1.4 var(--e-type-family); }
.eotion-upload-preview { width: 42px; height: 42px; flex: 0 0 auto; border-radius: 5px; object-fit: cover; }
.eotion-upload-copy { display: grid; min-width: 0; flex: 1; gap: 3px; }
.eotion-upload-copy strong, .eotion-upload-copy > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.eotion-upload-copy > span { color: var(--e-color-text-muted); font-size: 12px; }
.eotion-upload-copy > span[data-phase="failed"] { overflow: visible; overflow-wrap: anywhere; text-overflow: clip; white-space: normal; }
.eotion-upload-item button { display: inline-flex; min-height: 40px; min-width: 40px; align-items: center; justify-content: center; gap: 4px; border: 1px solid var(--e-color-border); border-radius: 5px; padding: 4px 7px; background: var(--e-color-surface); color: inherit; cursor: pointer; }
.eotion-upload-spinner { width: 16px; height: 16px; flex: 0 0 auto; border: 2px solid var(--e-color-border); border-top-color: var(--e-color-text-muted); border-radius: 50%; animation: eotion-upload-spin .8s linear infinite; }
.eotion-upload-occupied { visibility: hidden; height: 0 !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; border: 0 !important; line-height: 0 !important; }
.eotion-upload-saving-hidden { display: none !important; }
.eotion-editor-content .tiptap { position: relative; }
.eotion-block-drag-anchor { position: absolute; top: 0; left: 0; display: inline-block; width: 0; height: 0; overflow: visible; line-height: 0; pointer-events: none; }
.eotion-block-drag-handle { position: absolute; top: 0; left: -28px; z-index: 1; display: inline-flex; width: 24px; height: 24px; align-items: center; justify-content: center; border: 0; border-radius: var(--e-radius-control); padding: 0; background: transparent; color: var(--e-color-text-muted); font: 600 18px / 1 var(--e-type-family); cursor: grab; opacity: .65; pointer-events: auto; }
.eotion-block-drag-handle:hover, .eotion-block-drag-handle:focus-visible { background: var(--e-color-hover); color: var(--e-color-text-primary); opacity: 1; }
.eotion-block-drag-handle::before { content: '⠿'; }
.eotion-block-drag-handle:active { cursor: grabbing; }
/* Tables scroll horizontally instead of squeezing columns into an unreadable width. */
.eotion-editor-content .tiptap .tableWrapper { max-width: 100%; overflow-x: auto; overscroll-behavior-x: contain; }
.eotion-editor-content .tiptap table { margin: 10px 0; border-collapse: collapse; table-layout: fixed; width: 100%; }
.eotion-editor-content .tiptap th, .eotion-editor-content .tiptap td { position: relative; box-sizing: border-box; min-width: 100px; border: 1px solid var(--e-color-border); padding: 6px 8px; vertical-align: top; }
.eotion-editor-content .tiptap th { background: var(--e-color-surface-subtle); font-weight: 600; text-align: left; }
.eotion-editor-content .tiptap th p, .eotion-editor-content .tiptap td p { margin: 0; }
.eotion-editor-content .tiptap th p + p, .eotion-editor-content .tiptap td p + p { margin-top: 6px; }
.eotion-editor-content .tiptap .selectedCell::after { position: absolute; z-index: 2; inset: 0; background: var(--e-color-selected); content: ''; pointer-events: none; }
.eotion-editor-content .tiptap [data-eotion-drop-zone="before"] { box-shadow: 0 -2px 0 var(--e-color-focus); }
.eotion-editor-content .tiptap [data-eotion-drop-zone="after"] { box-shadow: 0 2px 0 var(--e-color-focus); }
.eotion-editor-content .tiptap [data-eotion-drop-zone="inside"] { outline: 2px solid var(--e-color-focus); outline-offset: 2px; border-radius: var(--e-radius-block); }
.eotion-editor-content .tiptap > :nth-child(1 of :not(.eotion-block-drag-anchor)) { margin-top: 0; }
@keyframes eotion-upload-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .eotion-upload-spinner { animation: none; } }
@media (max-width: 767px), (pointer: coarse) { .eotion-upload-item button { min-width: 44px; min-height: 44px; } }
@media (max-width: 767px), (pointer: coarse) { .eotion-block-drag-anchor { display: none !important; } }
</style>
