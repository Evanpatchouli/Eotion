import { Extension } from '@tiptap/core'
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion'
import { h, render } from 'vue'

import EotionIcon from '../components/ui/EotionIcon.vue'

type SlashItem = { id: 'text' | 'heading' | 'bullet' | 'image' | 'file'; label: string; hint: string; icon: 'image' | 'file-text' | 'heading' | 'list' | 'text' }

const items: SlashItem[] = [
  { id: 'text', label: 'Text', hint: '普通段落', icon: 'text' },
  { id: 'heading', label: 'Heading', hint: '二级标题', icon: 'heading' },
  { id: 'bullet', label: 'Bullet List', hint: '项目列表', icon: 'list' },
  { id: 'image', label: 'Image', hint: '插入图片附件', icon: 'image' },
  { id: 'file', label: 'File', hint: '插入文件附件', icon: 'file-text' },
]

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
          items: ({ query }) => items.filter(item => (attachmentsEnabled || !['image', 'file'].includes(item.id)) &&
            `${item.label} ${item.hint} ${item.id === 'image' ? '图片 photo' : item.id === 'file' ? '文件 attachment' : ''}`.toLowerCase().includes(query.toLowerCase()),
          ),
          command: ({ editor, range, props: item }) => {
            if (isComposing()) return

            const chain = editor.chain().focus().deleteRange(range)
            if (item.id === 'text') chain.setParagraph().run()
            if (item.id === 'heading') chain.setHeading({ level: 2 }).run()
            if (item.id === 'bullet') chain.setParagraph().toggleBulletList().run()
            if (item.id === 'image' || item.id === 'file') {
              chain.setParagraph().run()
              onAttachmentCommand?.(item.id)
            }
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
                const button = document.createElement('button')
                button.type = 'button'
                button.className = 'p2-slash-item'
                button.setAttribute('role', 'option')
                button.setAttribute('aria-selected', String(index === selected))
                const icon = document.createElement('span')
                icon.className = 'p2-slash-icon'
                render(h(EotionIcon, { name: item.icon, size: 18 }), icon)
                mountedIcons.push(icon)
                const text = document.createElement('span')
                text.className = 'p2-slash-copy'
                const title = document.createElement('span')
                title.className = 'p2-slash-title'
                title.textContent = item.label
                const hint = document.createElement('span')
                hint.className = 'p2-slash-hint'
                hint.textContent = item.hint
                text.append(title, hint)
                button.append(icon, text)
                button.addEventListener('mousedown', event => event.preventDefault())
                button.addEventListener('click', () => current?.command(item))
                element?.append(button)
              })
              if (current.items.length === 0) {
                element.textContent = '没有匹配的命令'
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
