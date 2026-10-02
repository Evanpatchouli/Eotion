import type { JSONContent } from '@tiptap/core'

/** A Tiptap JSON document node accepted as an editor's initial value. */
export type EditorDocument = JSONContent & { type: 'doc' }

/** Clone at the editor boundary so neither side shares nested attrs or content arrays. */
export function cloneEditorDocument(document: EditorDocument): EditorDocument {
  return JSON.parse(JSON.stringify(document)) as EditorDocument
}
