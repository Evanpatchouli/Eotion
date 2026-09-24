import { Extension } from '@tiptap/core'
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion'

type SlashItem = { id: 'text' | 'heading' | 'bullet'; label: string; hint: string }

const items: SlashItem[] = [
  { id: 'text', label: 'Text', hint: '普通段落' },
  { id: 'heading', label: 'Heading', hint: '二级标题' },
  { id: 'bullet', label: 'Bullet List', hint: '项目列表' },
]

export function createSlashCommand(isComposing: () => boolean) {
  return Extension.create({
    name: 'p2SlashCommand',
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem, SlashItem>({
          editor: this.editor,
          char: '/',
          startOfLine: true,
          allow: () => !isComposing(),
          items: ({ query }) => items.filter(item =>
            `${item.label} ${item.hint}`.toLowerCase().includes(query.toLowerCase()),
          ),
          command: ({ editor, range, props: item }) => {
            if (isComposing()) return

            const chain = editor.chain().focus().deleteRange(range)
            if (item.id === 'text') chain.setParagraph().run()
            if (item.id === 'heading') chain.setHeading({ level: 2 }).run()
            if (item.id === 'bullet') chain.setParagraph().toggleBulletList().run()
          },
          render: () => {
            let element: HTMLElement | undefined
            let unmount: (() => void) | undefined
            let current: SuggestionProps<SlashItem, SlashItem> | undefined
            let selected = 0

            const paint = () => {
              if (!element || !current) return
              element.replaceChildren()
              current.items.forEach((item, index) => {
                const button = document.createElement('button')
                button.type = 'button'
                button.className = 'p2-slash-item'
                button.setAttribute('role', 'option')
                button.setAttribute('aria-selected', String(index === selected))
                button.textContent = `${item.label} · ${item.hint}`
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
