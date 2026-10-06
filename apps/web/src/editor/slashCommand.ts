import { Extension } from '@tiptap/core'
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion'
import { slashCommands, type BlockCommandId } from '@eotion/domain/block-types'
import { h, render } from 'vue'

import EotionIcon from '../components/ui/EotionIcon.vue'
import { runBlockCommand, type BlockCommand } from './blockCommands'
import type { IconName } from '../components/ui/icons'

type SlashItem = { id: BlockCommandId; label: string; group: '基础' | '块' | '媒体'; icon: `${IconName}`; search: string }

/** Slash entries come from the domain block registry so the menu cannot drift from the block model. */
const items: SlashItem[] = slashCommands().map((command) => ({
  id: command.id,
  label: command.label,
  group: command.group,
  icon: command.icon as `${IconName}`,
  search: command.search ?? '',
}))

const attachmentCommands = new Set<BlockCommandId>(['image', 'file'])

export function createSlashCommand(isComposing: () => boolean, onAttachmentCommand?: (type: 'image' | 'file') => void, attachmentsEnabled = true) {
  return Extension.create({
    name: 'p2SlashCommand',
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem, SlashItem>({
          editor: this.editor,
          char: '/',
          startOfLine: true,
          allow: () => !isComposing(),
          items: ({ query }) => items.filter(item => (attachmentsEnabled || !attachmentCommands.has(item.id)) &&
            `${item.label} ${item.search}`.toLowerCase().includes(query.toLowerCase()),
          ),
          command: ({ editor, range, props: item }) => {
            if (isComposing()) return

            if (attachmentCommands.has(item.id)) {
              editor.chain().focus().deleteRange(range).setParagraph().run()
              onAttachmentCommand?.(item.id as 'image' | 'file')
            } else runBlockCommand(editor, item.id as BlockCommand, range)
          },
          render: () => {
            let element: HTMLElement | undefined
            let unmount: (() => void) | undefined
            let current: SuggestionProps<SlashItem, SlashItem> | undefined
            let selected = 0
            let mountedIcons: HTMLElement[] = []

            const paint = () => {
              if (!element || !current) return
              mountedIcons.forEach((container) => render(null, container))
              mountedIcons = []
              element.replaceChildren()
              current.items.forEach((item, index) => {
                if (index === 0 || current?.items[index - 1]?.group !== item.group) {
                  const group = document.createElement('div')
                  group.className = 'p2-slash-group'
                  group.textContent = item.group
                  element?.append(group)
                }
                const button = document.createElement('button')
                button.type = 'button'
                button.className = 'p2-slash-item'
                button.setAttribute('role', 'option')
                button.setAttribute('aria-selected', String(index === selected))
                const icon = document.createElement('span')
                icon.className = 'p2-slash-icon'
                render(h(EotionIcon, { name: item.icon, size: 18 }), icon)
                mountedIcons.push(icon)
                const label = document.createElement('span')
                label.className = 'p2-slash-title'
                label.textContent = item.label
                button.append(icon, label)
                button.addEventListener('mousedown', event => event.preventDefault())
                button.addEventListener('click', () => current?.command(item))
                element?.append(button)
              })
              if (current.items.length === 0) {
                element.textContent = '没有匹配的命令'
              } else {
                const active = element.querySelector<HTMLElement>('[aria-selected="true"]')
                if (active && element.isConnected) {
                  const menuRect = element.getBoundingClientRect()
                  const activeRect = active.getBoundingClientRect()
                  if (activeRect.top < menuRect.top + 2) element.scrollTop -= menuRect.top + 2 - activeRect.top
                  else if (activeRect.bottom > menuRect.bottom - 2) element.scrollTop += activeRect.bottom - menuRect.bottom + 2
                }
              }
            }

            return {
              onStart(props) {
                if (isComposing()) return
                current = props
                selected = 0
                element = document.createElement('div')
                element.className = 'p2-slash-menu'
                element.setAttribute('role', 'listbox')
                element.setAttribute('aria-label', 'Slash 命令')
                paint()
                unmount = props.mount(element)
              },
              onUpdate(props) {
                if (isComposing()) {
                  mountedIcons.forEach((container) => render(null, container))
                  mountedIcons = []
                  unmount?.()
                  unmount = undefined
                  element = undefined
                  current = undefined
                  return
                }
                current = props
                selected = Math.min(selected, Math.max(props.items.length - 1, 0))
                paint()
              },
              onKeyDown({ event }) {
                if (isComposing() || event.isComposing || !current) return false
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  const count = current.items.length
                  if (count > 0) selected = (selected + (event.key === 'ArrowDown' ? 1 : -1) + count) % count
                  paint()
                  return true
                }
                const item = current.items[selected]
                if (event.key === 'Enter' && item) {
                  current.command(item)
                  return true
                }
                // Escape 交由 Suggestion 自身关闭并维持本次触发的 dismiss 状态。
                return false
              },
              onExit() {
                mountedIcons.forEach((container) => render(null, container))
                mountedIcons = []
                unmount?.()
                unmount = undefined
                element = undefined
                current = undefined
              },
            }
          },
        }),
      ]
    },
  })
}
