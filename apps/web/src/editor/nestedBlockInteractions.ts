import { Extension } from '@tiptap/core'
import { Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model'
import { NodeSelection, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { Selection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorView } from '@tiptap/pm/view'
import { blockCapability, blockHasInternalContent, blockTypeForNode, isAllowedChildBlockType } from '@eotion/domain/block-types'
import { createIconElement, IconName } from '../components/ui/icons'

const MAX_BLOCK_DEPTH = 8
const DRAG_TYPE = 'application/x-eotion-block'
const pluginKey = new PluginKey('eotionNestedBlockInteractions')

type BlockEntry = {
  id: string
  node: ProseMirrorNode
  pos: number
  parentId: string | null
  parentPos: number | null
  depth: number
  ancestors: string[]
  siblings: string[]
}

type DropZone = 'before' | 'after' | 'inside'
type DropTarget = { id: string; zone: DropZone } | null
type InteractionState = { handles: DecorationSet; target: DropTarget }
type ResolvedDropTarget = { id: string; element: HTMLElement; zone: DropZone }

function stopHandleEvent(event: Event): boolean {
  return event.type !== 'dragstart' && event.type !== 'dragend'
}

function isBlockContainer(node: ProseMirrorNode): boolean {
  return node.type.name === 'doc' || node.type.name === 'eotionToggle'
}

function entriesFor(doc: ProseMirrorNode): BlockEntry[] {
  const entries: BlockEntry[] = []
  const visit = (container: ProseMirrorNode, contentStart: number, parentId: string | null, parentPos: number | null, depth: number, ancestors: string[]) => {
    const children: { node: ProseMirrorNode; pos: number }[] = []
    const firstBlockIndex = container.type.name === 'eotionToggle' ? 1 : 0
    container.forEach((node, offset, index) => {
      if (index >= firstBlockIndex && blockTypeForNode(node.type.name)) children.push({ node, pos: contentStart + offset })
    })
    const ids = children.map(({ node }) => node.attrs.blockId).filter((id): id is string => typeof id === 'string' && id.length > 0)
    for (const { node, pos } of children) {
      const id: unknown = node.attrs.blockId
      if (typeof id !== 'string' || !id) continue
      entries.push({ id, node, pos, parentId, parentPos, depth, ancestors, siblings: ids })
      if (node.type.name === 'eotionToggle' && isBlockContainer(node)) {
        visit(node, pos + 1, id, pos, depth + 1, [...ancestors, id])
      }
    }
  }
  visit(doc, 0, null, null, 0, [])
  return entries
}

/**
 * A selection inside a block's editor-internal structure (table rows and cells)
 * belongs to that block's interior, not to the page block tree. Tab/indent must
 * leave it alone so the table extension can navigate between cells.
 */
function insideEditorInternalBlock(selection: Selection): boolean {
  const position = selection.$from
  for (let depth = 1; depth <= position.depth; depth += 1) {
    const type = blockTypeForNode(position.node(depth).type.name)
    if (type && blockHasInternalContent(type)) return true
  }
  return false
}

function entryAtSelection(doc: ProseMirrorNode, selection: Selection, requireBlockStart = true): BlockEntry | undefined {
  const entries = entriesFor(doc)
  if (selection instanceof NodeSelection) return entries.find((entry) => entry.pos === selection.from && entry.node === selection.node)
  if (insideEditorInternalBlock(selection)) return undefined
  if (requireBlockStart) {
    if (!selection.empty || !selection.$from.parent.isTextblock || selection.$from.parentOffset !== 0) return undefined
    for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
      const name = selection.$from.node(depth).type.name
      if (name === 'codeBlock' || name === 'bulletList' || name === 'orderedList' || name === 'listItem') return undefined
    }
  }
  const summaryOwner = entries.find((entry) => entry.node.type.name === 'eotionToggle'
    && selection.from >= entry.pos + 1
    && selection.from < entry.pos + 1 + entry.node.child(0).nodeSize)
  if (summaryOwner) return summaryOwner
  return entries
    .filter((entry) => selection.from >= entry.pos && selection.to <= entry.pos + entry.node.nodeSize)
    .sort((a, b) => b.pos - a.pos)[0]
}

function descendantsOf(entries: BlockEntry[], id: string): BlockEntry[] {
  return entries.filter((entry) => entry.ancestors.includes(id))
}

function destinationDepth(entries: BlockEntry[], source: BlockEntry, parentId: string | null): number {
  const parentDepth = parentId === null ? -1 : entries.find((entry) => entry.id === parentId)?.depth ?? MAX_BLOCK_DEPTH
  const subtreeDepth = Math.max(0, ...descendantsOf(entries, source.id).map((entry) => entry.depth - source.depth))
  return parentDepth + 1 + subtreeDepth
}

function movable(entry: BlockEntry | undefined): entry is BlockEntry {
  if (!entry) return false
  const type = blockTypeForNode(entry.node.type.name)
  return type !== undefined && !blockCapability(type).attachment
}

/** Insert a normal identified paragraph after a database reference in its own sibling list. */
function insertParagraphAfter(view: EditorView, blockId: string): boolean {
  const entry = entriesFor(view.state.doc).find((candidate) => candidate.id === blockId)
  const paragraphType = view.state.schema.nodes.paragraph
  if (!entry || entry.node.type.name !== 'eotionDatabase' || !paragraphType) return false
  const position = view.state.doc.resolve(entry.pos)
  const paragraph = paragraphType.createAndFill()
  const index = position.index() + 1
  if (!paragraph || !position.parent.canReplace(index, index, Fragment.from(paragraph))) return false
  const insertAt = entry.pos + entry.node.nodeSize
  const transaction = view.state.tr.insert(insertAt, paragraph)
  transaction.setSelection(TextSelection.near(transaction.doc.resolve(insertAt + 1), 1))
  view.dispatch(transaction.scrollIntoView())
  return true
}

function moveBlock(editor: { state: import('@tiptap/pm/state').EditorState; view: import('@tiptap/pm/view').EditorView }, sourceId: string, parentId: string | null, insertBeforeId?: string, afterId?: string): boolean {
  const state = editor.state
  const entries = entriesFor(state.doc)
  const source = entries.find((entry) => entry.id === sourceId)
  if (!movable(source)) return false
  if (parentId === source.id || entries.some((entry) => entry.id === parentId && entry.ancestors.includes(source.id))) return false
  const parent = parentId === null ? undefined : entries.find((entry) => entry.id === parentId)
  if (parentId !== null) {
    const sourceType = blockTypeForNode(source.node.type.name)
    const parentType = parent && blockTypeForNode(parent.node.type.name)
    if (!parent || !sourceType || !parentType || !isAllowedChildBlockType(parentType, sourceType)) return false
  }
  if (destinationDepth(entries, source, parentId) > MAX_BLOCK_DEPTH) return false
  if (insertBeforeId && insertBeforeId === source.id || afterId && afterId === source.id) return false
  const siblingId = insertBeforeId ?? afterId
  const sibling = siblingId ? entries.find((entry) => entry.id === siblingId) : undefined
  if (sibling && sibling.parentId !== parentId) return false

  let insertAt: number
  if (insertBeforeId && sibling) insertAt = sibling.pos
  else if (afterId && sibling) insertAt = sibling.pos + sibling.node.nodeSize
  else if (parent) insertAt = parent.pos + parent.node.nodeSize - 1
  else insertAt = state.doc.content.size

  const selectionInsideSource = state.selection.from >= source.pos && state.selection.to <= source.pos + source.node.nodeSize
    ? { from: state.selection.from - source.pos, to: state.selection.to - source.pos, node: state.selection instanceof NodeSelection }
    : undefined
  const transaction = state.tr.delete(source.pos, source.pos + source.node.nodeSize)
  insertAt = transaction.mapping.map(insertAt, -1)
  transaction.insert(insertAt, source.node)
  if (selectionInsideSource?.node) transaction.setSelection(NodeSelection.create(transaction.doc, insertAt))
  else if (selectionInsideSource) transaction.setSelection(TextSelection.create(transaction.doc, insertAt + selectionInsideSource.from, insertAt + selectionInsideSource.to))
  editor.view.dispatch(transaction.scrollIntoView())
  return true
}

/** Keep one widget per block so ProseMirror can reuse handle DOM across updates. */
function addHandleDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations = entriesFor(doc).filter(movable).map((entry) => Decoration.widget(entry.pos, (view) => {
    const anchor = document.createElement('span')
    anchor.className = 'eotion-block-drag-anchor'
    anchor.contentEditable = 'false'
    const handle = document.createElement('button')
    handle.type = 'button'
    handle.className = 'eotion-block-drag-handle'
    handle.contentEditable = 'false'
    handle.draggable = true
    handle.setAttribute('aria-label', '拖动区块')
    handle.setAttribute('data-eotion-drag-handle', entry.id)
    handle.append(createIconElement(IconName.DragHandle))
    if (entry.node.type.name === 'eotionDatabase') {
      const insert = document.createElement('button')
      insert.type = 'button'
      insert.className = 'eotion-block-insert-button'
      insert.contentEditable = 'false'
      insert.setAttribute('aria-label', '在数据库区块下方插入区块')
      insert.setAttribute('data-eotion-block-insert', entry.id)
      insert.append(createIconElement(IconName.Plus))
      insert.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        insertParagraphAfter(view, entry.id)
      })
      anchor.append(insert)
    }
    anchor.append(handle)
    return anchor
  }, { key: `eotion-block-handle-${entry.id}`, side: -1, stopEvent: stopHandleEvent }))
  return DecorationSet.create(doc, decorations)
}

/** Widgets are rendered next to their block, so positioning is one O(n) pass per frame. */
function positionAnchors(view: EditorView): void {
  if (!view.dom.isConnected) return
  const anchors = view.dom.querySelectorAll<HTMLElement>('.eotion-block-drag-anchor')
  if (anchors.length === 0) return
  const domTop = view.dom.getBoundingClientRect().top
  const measured: { anchor: HTMLElement; top: number }[] = []
  // Measure every block before writing any style so the batch triggers one layout.
  for (const anchor of anchors) {
    const block = anchor.nextElementSibling
    if (!(block instanceof HTMLElement)) continue
    measured.push({ anchor, top: block.getBoundingClientRect().top - domTop })
  }
  for (const { anchor, top } of measured) anchor.style.top = `${top}px`
}

function dropZone(event: Pick<DragEvent, 'clientY'>, target: BlockEntry, hitTarget: HTMLElement): DropZone {
  const rect = hitTarget.getBoundingClientRect()
  const fraction = (event.clientY - rect.top) / Math.max(1, rect.height)
  if (target.node.type.name === 'eotionToggle' && fraction > 0.25 && fraction < 0.75) return 'inside'
  return fraction < 0.5 ? 'before' : 'after'
}

function resolveDropTarget(view: EditorView, event: Pick<DragEvent, 'clientX' | 'clientY'>): ResolvedDropTarget | undefined {
  const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
  if (pos === undefined) return undefined
  const target = entriesFor(view.state.doc)
    .filter((entry) => pos >= entry.pos && pos <= entry.pos + entry.node.nodeSize)
    .sort((left, right) => right.pos - left.pos)[0]
  if (!target) return undefined
  const element = view.nodeDOM(target.pos)
  if (!(element instanceof HTMLElement)) return undefined
  const hitTarget = target.node.type.name === 'eotionToggle' ? view.nodeDOM(target.pos + 1) : element
  return { id: target.id, element, zone: dropZone(event, target, hitTarget instanceof HTMLElement ? hitTarget : element) }
}

function targetDecoration(doc: ProseMirrorNode, target: DropTarget): Decoration | undefined {
  if (!target) return undefined
  const entry = entriesFor(doc).find((candidate) => candidate.id === target.id)
  return entry
    ? Decoration.node(entry.pos, entry.pos + entry.node.nodeSize, { 'data-eotion-drop-zone': target.zone }, { key: `eotion-drop-${target.id}` })
    : undefined
}

function setDropTarget(view: EditorView, target: DropTarget): void {
  const current = pluginKey.getState(view.state) as InteractionState | undefined
  if (current?.target?.id === target?.id && current?.target?.zone === target?.zone) return
  view.dispatch(view.state.tr.setMeta(pluginKey, { target }))
}

/** PM transactions move the entire identified node, keeping child IDs and undo history intact. */
export const NestedBlockInteractions = Extension.create({
  name: 'nestedBlockInteractions',
  priority: 1000,
  addKeyboardShortcuts() {
    const moveFromKey = (outdent: boolean) => {
      const editor = this.editor
      const source = entryAtSelection(editor.state.doc, editor.state.selection)
      if (!movable(source)) return false
      if (outdent) return outdentBlock(editor)
      return indentBlock(editor)
    }
    return {
      Tab: () => moveFromKey(false),
      'Shift-Tab': () => moveFromKey(true),
    }
  },
  addProseMirrorPlugins() {
    const pageToken = `${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
    let activeDraggedId: string | undefined
    let anchorsScheduled = false
    const scheduleAnchorPositions = (view: EditorView) => {
      if (anchorsScheduled) return
      anchorsScheduled = true
      requestAnimationFrame(() => {
        anchorsScheduled = false
        positionAnchors(view)
      })
    }
    return [new Plugin({
      key: pluginKey,
      view: (view) => {
        scheduleAnchorPositions(view)
        return { update: (updatedView) => scheduleAnchorPositions(updatedView) }
      },
      state: {
        init: (_, state): InteractionState => ({ handles: addHandleDecorations(state.doc), target: null }),
        apply: (transaction, previous): InteractionState => {
          const meta = transaction.getMeta(pluginKey) as { target?: DropTarget } | undefined
          let target = meta ? meta.target ?? null : previous.target
          const handles = transaction.docChanged
            ? addHandleDecorations(transaction.doc)
            : previous.handles.map(transaction.mapping, transaction.doc)
          if (target && !entriesFor(transaction.doc).some((entry) => entry.id === target!.id)) target = null
          return { handles, target }
        },
      },
      props: {
        decorations: (state) => {
          const current = pluginKey.getState(state) as InteractionState
          const target = targetDecoration(state.doc, current.target)
          return target ? current.handles.add(state.doc, [target]) : current.handles
        },
        handleDOMEvents: {
          dragstart: (view, event) => {
            const drag = event as DragEvent
            const handle = (drag.target as Element | null)?.closest<HTMLElement>('[data-eotion-drag-handle]')
            const target = drag.target as Element | null
            const id = handle?.dataset.eotionDragHandle
            const source = id ? entriesFor(view.state.doc).find((entry) => entry.id === id) : undefined
            if (handle && drag.dataTransfer && movable(source)) {
              activeDraggedId = id
              drag.dataTransfer.setData(DRAG_TYPE, `${pageToken}:${id}`)
              drag.dataTransfer.effectAllowed = 'move'
              return true
            }
            const selectionNode = view.state.selection instanceof NodeSelection ? view.state.selection.node : undefined
            if (target?.closest('[data-eotion-attachment], .attachment') || selectionNode && blockTypeForNode(selectionNode.type.name) && blockCapability(blockTypeForNode(selectionNode.type.name)!).attachment) {
              drag.preventDefault()
              return true
            }
            return false
          },
          dragover: (view, event) => {
            const drag = event as DragEvent
            if (!Array.from(drag.dataTransfer?.types ?? []).includes(DRAG_TYPE)) return false
            if (!activeDraggedId) { setDropTarget(view, null); drag.preventDefault(); return true }
            const source = entriesFor(view.state.doc).find((entry) => entry.id === activeDraggedId)
            if (!movable(source)) { setDropTarget(view, null); drag.preventDefault(); return true }
            const marker = resolveDropTarget(view, drag)
            setDropTarget(view, marker ? { id: marker.id, zone: marker.zone } : null)
            drag.preventDefault()
            if (drag.dataTransfer) drag.dataTransfer.dropEffect = 'move'
            return true
          },
          dragleave: (view, event) => {
            const related = (event as DragEvent).relatedTarget
            if (!(related instanceof Node) || !view.dom.contains(related)) setDropTarget(view, null)
            return false
          },
          drop: (view, event) => {
            const drag = event as DragEvent
            const hasEotionDrag = Array.from(drag.dataTransfer?.types ?? []).includes(DRAG_TYPE)
            if (!activeDraggedId) {
              if (!hasEotionDrag) return false
              setDropTarget(view, null)
              drag.preventDefault()
              return true
            }
            const raw = drag.dataTransfer?.getData(DRAG_TYPE)
            if (raw && !raw.startsWith(`${pageToken}:`)) {
              activeDraggedId = undefined
              setDropTarget(view, null)
              drag.preventDefault()
              return true
            }
            const id = activeDraggedId
            activeDraggedId = undefined
            const target = resolveDropTarget(view, drag)
            setDropTarget(view, null)
            drag.preventDefault()
            if (!target) return true
            const entries = entriesFor(view.state.doc)
            const source = entries.find((entry) => entry.id === id)
            const targetEntry = entries.find((entry) => entry.id === target.id)
            if (!movable(source) || !movable(targetEntry)) return true
            if (target.zone === 'inside') moveBlock({ state: view.state, view }, id, targetEntry.id)
            else if (target.zone === 'before') moveBlock({ state: view.state, view }, id, targetEntry.parentId, targetEntry.id)
            else moveBlock({ state: view.state, view }, id, targetEntry.parentId, undefined, targetEntry.id)
            return true
          },
          dragend: (view, event) => {
            setDropTarget(view, null)
            activeDraggedId = undefined
            return false
          },
        },
      },
    })]
  },
})

export function canIndentBlock(doc: ProseMirrorNode, selection: Selection, requireBlockStart = true): boolean {
  const source = entryAtSelection(doc, selection, requireBlockStart)
  if (!movable(source)) return false
  const sourceType = blockTypeForNode(source.node.type.name)
  if (!sourceType) return false
  const entries = entriesFor(doc)
  const index = source.siblings.indexOf(source.id)
  const previous = entries.find((entry) => entry.id === source.siblings[index - 1])
  const previousType = previous && blockTypeForNode(previous.node.type.name)
  return !!previous && !!previousType && isAllowedChildBlockType(previousType, sourceType)
    && destinationDepth(entries, source, previous.id) <= MAX_BLOCK_DEPTH
}

export function canOutdentBlock(doc: ProseMirrorNode, selection: Selection, requireBlockStart = true): boolean {
  const source = entryAtSelection(doc, selection, requireBlockStart)
  return movable(source) && source.parentId !== null && source.parentPos !== null
}

export function indentBlock(editor: { state: import('@tiptap/pm/state').EditorState; view: import('@tiptap/pm/view').EditorView }, requireBlockStart = true): boolean {
  const source = entryAtSelection(editor.state.doc, editor.state.selection, requireBlockStart)
  if (!source || !canIndentBlock(editor.state.doc, editor.state.selection, requireBlockStart)) return false
  const entries = entriesFor(editor.state.doc)
  const previousId = source.siblings[source.siblings.indexOf(source.id) - 1]
  return !!previousId && moveBlock(editor, source.id, previousId)
}

export function outdentBlock(editor: { state: import('@tiptap/pm/state').EditorState; view: import('@tiptap/pm/view').EditorView }, requireBlockStart = true): boolean {
  const source = entryAtSelection(editor.state.doc, editor.state.selection, requireBlockStart)
  if (!source || !canOutdentBlock(editor.state.doc, editor.state.selection, requireBlockStart)) return false
  const entries = entriesFor(editor.state.doc)
  const parent = entries.find((entry) => entry.id === source.parentId)
  return !!parent && moveBlock(editor, source.id, parent.parentId, undefined, parent.id)
}
