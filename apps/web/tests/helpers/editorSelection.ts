import { expect, type Locator } from '@playwright/test'
import type { Editor } from '@tiptap/core'

/** Wait until ProseMirror has observed the native selection created by the test. */
export async function waitForEditorSelection(editor: Locator) {
  await expect.poll(() => editor.evaluate(element => {
    const instance = (element as HTMLElement & { editor?: Editor }).editor
    const selection = window.getSelection()
    if (!instance || !selection?.anchorNode || !selection.focusNode
      || !element.contains(selection.anchorNode) || !element.contains(selection.focusNode)
      || !instance.view.hasFocus()) return false
    return instance.view.posAtDOM(selection.anchorNode, selection.anchorOffset) === instance.state.selection.anchor
      && instance.view.posAtDOM(selection.focusNode, selection.focusOffset) === instance.state.selection.head
  })).toBe(true)
}
