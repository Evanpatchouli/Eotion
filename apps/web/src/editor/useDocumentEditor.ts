import type { AnyExtension, Editor, EditorOptions } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { useEditor } from '@tiptap/vue-3'
import { toValue, watch, type MaybeRefOrGetter } from 'vue'

import { EotionBlockquote, EotionListItem, EotionOrderedList } from './contentRules'
import { cloneEditorDocument, type EditorDocument } from './editorDocument'

type EditorCallbacks = Partial<Pick<EditorOptions, 'onCreate' | 'onSelectionUpdate' | 'onTransaction'>>

type DocumentEditorOptions = EditorCallbacks & {
  content: EditorDocument
  editable?: MaybeRefOrGetter<boolean>
  ariaLabel: string
  attributes?: Record<string, string>
  extensions?: AnyExtension[]
  onUpdate: (document: EditorDocument) => void
}

function snapshot(editor: Editor): EditorDocument {
  return cloneEditorDocument(editor.getJSON() as EditorDocument)
}

/** Shared Tiptap lifecycle and JSON boundary; product behavior stays in the caller. */
export function useDocumentEditor(options: DocumentEditorOptions) {
  const editor = useEditor({
    extensions: [
      // StarterKit's listItem/blockquote accept every block node; the registry-derived
      // replacements keep the editable structure identical to the saved structure.
      StarterKit.configure({ link: false, underline: false, blockquote: false, listItem: false, orderedList: false }),
      EotionBlockquote,
      EotionListItem,
      EotionOrderedList,
      ...(options.extensions ?? []),
    ],
    content: cloneEditorDocument(options.content),
    editable: toValue(options.editable ?? true),
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': options.ariaLabel,
        ...options.attributes,
      },
    },
    ...(options.onCreate ? { onCreate: options.onCreate } : {}),
    ...(options.onSelectionUpdate ? { onSelectionUpdate: options.onSelectionUpdate } : {}),
    ...(options.onTransaction ? { onTransaction: options.onTransaction } : {}),
    onUpdate: ({ editor }) => options.onUpdate(snapshot(editor)),
  })

  watch(() => toValue(options.editable ?? true), editable => {
    editor.value?.setEditable(editable, false)
  })

  function focus(): void {
    editor.value?.commands.focus()
  }

  function getDocument(): EditorDocument | null {
    return editor.value ? snapshot(editor.value) : null
  }

  return { editor, focus, getDocument }
}
