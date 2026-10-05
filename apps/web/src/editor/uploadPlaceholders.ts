import { Extension } from '@tiptap/core'
import { createLocalId } from '@eotion/storage'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { h, render } from 'vue'

import UploadPlaceholder from '../components/editor/UploadPlaceholder.vue'

export type UploadPhase = 'uploading' | 'saving' | 'success' | 'failed' | 'cancelled'
export type UploadPlaceholderTask = {
  id: string
  fileId: string
  file: File
  phase: UploadPhase
  error: string
  objectUrl?: string
  controller?: AbortController
  started: boolean
  durable: boolean
  epoch: number
  running?: Promise<void>
  groupId: string
  order: number
  finalBlockId?: string
  provisionalBlockId?: string
  visible: boolean
}

export type UploadTarget = { id: string; position: number; blockId?: string; replaceEmptyParagraph: boolean; originalEmptyParagraph?: ProseMirrorNode }
export type UploadSlot = { position: number; replaceFrom?: number; replaceTo?: number; replaceBlockId?: string; restoreNode?: ProseMirrorNode }

function topLevelNode(state: EditorState, position: number): { node: ProseMirrorNode; position: number } | undefined {
  const doc = state.doc
  let found: { node: ProseMirrorNode; position: number } | undefined
  doc.forEach((node, offset) => {
    if (!found && position >= offset && position < offset + node.nodeSize) found = { node, position: offset }
  })
  return found
}

function findBlock(state: EditorState, blockId: string): { node: ProseMirrorNode; position: number } | undefined {
  let found: { node: ProseMirrorNode; position: number } | undefined
  state.doc.forEach((node, position) => {
    if (!found && node.attrs.blockId === blockId) found = { node, position }
  })
  return found
}

export class UploadPlaceholderRegistry {
  readonly targets = new Map<string, UploadTarget>()
  readonly tasks = new Map<string, UploadPlaceholderTask>()

  capture(state: EditorState, position = state.selection.from): UploadTarget {
    const resolved = state.doc.resolve(position)
    const frozenPosition = resolved.depth >= 1 ? resolved.before(1) : position
    const found = topLevelNode(state, frozenPosition)
    const isEmptyParagraph = found?.node.type.name === 'paragraph' && found.node.content.size === 0
    const target: UploadTarget = {
      id: createLocalId(),
      position: found?.position ?? state.doc.content.size,
      ...(typeof found?.node.attrs.blockId === 'string' ? { blockId: found.node.attrs.blockId } : {}),
      replaceEmptyParagraph: isEmptyParagraph,
      ...(isEmptyParagraph && found ? { originalEmptyParagraph: found.node } : {}),
    }
    this.targets.set(target.id, target)
    return target
  }

  discardTarget(target: UploadTarget | undefined): void {
    if (!target || [...this.tasks.values()].some(task => task.groupId === target.id)) return
    this.targets.delete(target.id)
  }

  add(task: UploadPlaceholderTask): void { this.tasks.set(task.id, task) }
  remove(task: UploadPlaceholderTask): void { task.visible = false }
  pruneGroup(groupId: string): void {
    const groupTasks = [...this.tasks.values()].filter(task => task.groupId === groupId)
    if (groupTasks.length === 0 || groupTasks.some(task => task.visible || task.running)) return
    groupTasks.forEach(task => this.tasks.delete(task.id))
    this.targets.delete(groupId)
  }
  setFinalBlockId(task: UploadPlaceholderTask, blockId: string): void {
    task.finalBlockId = blockId
  }

  emptyTargetRange(state: EditorState, groupId: string): { from: number; to: number } | undefined {
    const target = this.targets.get(groupId)
    if (!target) return undefined
    const found = target.blockId ? findBlock(state, target.blockId) : topLevelNode(state, target.position)
    if (found?.node.type.name !== 'paragraph' || found.node.content.size !== 0) return undefined
    if (!target.blockId) {
      // A target captured without a block ID can only be located by position.
      // Once a sibling attachment replaces it, position mapping can drift onto
      // the auto-appended trailing paragraph, so never clean a paragraph that
      // already sits after a durable sibling attachment.
      for (const sibling of this.tasks.values()) {
        if (sibling.groupId !== groupId || !sibling.durable || !sibling.finalBlockId) continue
        const node = findBlock(state, sibling.finalBlockId)
        if (node && found.position > node.position) return undefined
      }
    }
    return { from: found.position, to: found.position + found.node.nodeSize }
  }

  canCleanupEmptyTarget(state: EditorState, groupId: string): boolean {
    const siblings = [...this.tasks.values()].filter(task => task.groupId === groupId).sort((a, b) => a.order - b.order)
    const firstDurable = siblings.find(task => task.durable && !!task.finalBlockId && !!findBlock(state, task.finalBlockId))
    if (!firstDurable) return false
    return siblings.filter(task => task.order < firstDurable.order)
      .every(task => !task.visible || task.phase === 'failed' || task.phase === 'cancelled')
  }

  resolveSlot(task: UploadPlaceholderTask, state: EditorState): UploadSlot {
    const target = this.targets.get(task.groupId)
    const siblings = [...this.tasks.values()].filter(item => item.groupId === task.groupId).sort((a, b) => a.order - b.order)
    const index = siblings.indexOf(task)
    const final = (item: UploadPlaceholderTask | undefined) => {
      const id = item?.provisionalBlockId ?? item?.finalBlockId
      return id ? findBlock(state, id) : undefined
    }
    const active = siblings.filter(item => item.phase !== 'cancelled' && item.phase !== 'failed' && item.visible)
    const previous = siblings.slice(0, index).reverse().map(final).find(Boolean)
    const next = siblings.slice(index + 1).map(final).find(Boolean)
    const targetBlock = target?.blockId ? findBlock(state, target.blockId) : target ? topLevelNode(state, target.position) : undefined
    if (target?.replaceEmptyParagraph && active[0] === task && targetBlock?.node.type.name === 'paragraph' && targetBlock.node.content.size === 0) {
      return {
        position: targetBlock.position,
        replaceFrom: targetBlock.position,
        replaceTo: targetBlock.position + targetBlock.node.nodeSize,
        ...(typeof targetBlock.node.attrs.blockId === 'string' ? { replaceBlockId: targetBlock.node.attrs.blockId } : {}),
        restoreNode: target.originalEmptyParagraph ?? targetBlock.node,
      }
    }
    if (next) return { position: next.position }
    if (previous) return { position: previous.position + previous.node.nodeSize }
    if (targetBlock) return { position: targetBlock.position + targetBlock.node.nodeSize }
    const boundary = Math.max(0, Math.min(state.doc.content.size, target?.position ?? state.doc.content.size))
    const nearest = topLevelNode(state, boundary)
    return { position: nearest ? nearest.position + nearest.node.nodeSize : boundary }
  }

  map(transaction: Transaction): void {
    if (!transaction.docChanged) return
    for (const target of this.targets.values()) {
      const mapped = transaction.mapping.mapResult(target.position + 1, 1)
      target.position = Math.max(0, Math.min(transaction.doc.content.size, mapped.pos - 1))
    }
  }

  decorations(state: EditorState, callbacks: { cancel: (task: UploadPlaceholderTask) => void; retry: (task: UploadPlaceholderTask) => void; remove: (task: UploadPlaceholderTask) => void }): DecorationSet {
    const decorations: Decoration[] = []
    const tasks = [...this.tasks.values()].filter(task => task.visible).sort((a, b) => a.order - b.order)
    const occupiedTargets = new Set<string>()
    for (const task of tasks) {
      const target = this.targets.get(task.groupId)
      if (!target) continue
      const ownNode = task.provisionalBlockId ? findBlock(state, task.provisionalBlockId) : task.finalBlockId ? findBlock(state, task.finalBlockId) : undefined
      const slot = ownNode ? { position: ownNode.position } : this.resolveSlot(task, state)
      decorations.push(Decoration.widget(slot.position, () => {
        const dom = document.createElement('span')
        dom.addEventListener('mousedown', event => event.stopPropagation())
        dom.addEventListener('pointerdown', event => event.stopPropagation())
        render(h(UploadPlaceholder, {
          task,
          cancel: () => callbacks.cancel(task),
          retry: () => callbacks.retry(task),
          remove: () => callbacks.remove(task),
        }), dom)
        return dom
      }, {
        key: `eotion-upload:${task.id}`,
        side: 1,
        destroy: dom => render(null, dom as HTMLElement),
      }))
      const original = target.blockId ? findBlock(state, target.blockId) : topLevelNode(state, target.position)
      if (target.replaceEmptyParagraph && !occupiedTargets.has(target.id) && original?.node.type.name === 'paragraph' && original.node.content.size === 0) {
        occupiedTargets.add(target.id)
        decorations.push(Decoration.node(original.position, original.position + original.node.nodeSize, { class: 'eotion-upload-occupied' }, { key: `eotion-upload-occupied:${target.id}` }))
      }
      const finalNode = task.provisionalBlockId ? findBlock(state, task.provisionalBlockId) : task.finalBlockId ? findBlock(state, task.finalBlockId) : undefined
      if (task.phase === 'saving' && finalNode) {
        decorations.push(Decoration.node(finalNode.position, finalNode.position + finalNode.node.nodeSize, { class: 'eotion-upload-saving-hidden' }, { key: `eotion-upload-saving:${task.id}` }))
      }
    }
    return DecorationSet.create(state.doc, decorations)
  }
}

export function createUploadPlaceholderExtension(
  registry: UploadPlaceholderRegistry,
  callbacks: { cancel: (task: UploadPlaceholderTask) => void; retry: (task: UploadPlaceholderTask) => void; remove: (task: UploadPlaceholderTask) => void },
) {
  const pluginKey = new PluginKey<DecorationSet>('uploadPlaceholders')
  return Extension.create({
    name: 'uploadPlaceholders',
    addProseMirrorPlugins() {
      return [new Plugin<DecorationSet>({
        key: pluginKey,
        state: {
          init: (_, state) => registry.decorations(state, callbacks),
          apply: (transaction, previous, _oldState, newState) => {
            registry.map(transaction)
            if (!transaction.docChanged && !transaction.selectionSet && !transaction.getMeta('uploadPlaceholders')) return previous
            return registry.decorations(newState, callbacks)
          },
        },
        props: { decorations: state => pluginKey.getState(state) ?? DecorationSet.empty },
      })]
    },
  })
}
