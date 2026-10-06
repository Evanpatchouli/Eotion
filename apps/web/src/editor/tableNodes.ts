import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode, Slice } from '@tiptap/pm/model'
import { Plugin } from '@tiptap/pm/state'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { TABLE_LIMITS } from '@eotion/domain/block-types'

/**
 * A table is one Eotion block. Rows and cells are editor-internal nodes of the
 * table node: they never carry a blockId and never appear in the page block
 * tree, so block.move/parentBlockId/drag only ever see the whole table.
 *
 * Cells are restricted to plain paragraphs. Enforcing that in the schema (not
 * only in the codec) means the editor can never produce a cell the codec would
 * refuse to save, and no block-level node can be nested inside a cell.
 */
const cellConfig = {
  content: 'paragraph+',
  addAttributes() {
    // The table extensions declare an alignment attribute as well; P7.4 keeps
    // cells to a strict grid, so only span/width survive.
    return {
      colspan: { default: 1 },
      rowspan: { default: 1 },
      colwidth: { default: null },
    }
  },
}

export const EotionTableCell = TableCell.extend(cellConfig)
export const EotionTableHeader = TableHeader.extend(cellConfig)
export const EotionTableRow = TableRow

/**
 * cellMinWidth keeps columns readable instead of collapsing to 25px; wider
 * tables overflow into the wrapper's horizontal scroll area.
 */
export const EotionTable = Table.configure({
  cellMinWidth: 100,
  resizable: false,
  allowTableNodeSelection: false,
})

/** The size budget shared with the domain props validator, web codec and MCP read. */
function tableWithinLimits(table: ProseMirrorNode): boolean {
  if (table.childCount < 1 || table.childCount > TABLE_LIMITS.maxRows) return false
  let ok = true
  table.forEach((row) => {
    if (row.childCount < 1 || row.childCount > TABLE_LIMITS.maxCellsPerRow) ok = false
    row.forEach((cell) => {
      if (cell.childCount < 1 || cell.childCount > TABLE_LIMITS.maxParagraphsPerCell) ok = false
    })
  })
  return ok
}

function oversizedTableIn(slice: Slice): boolean {
  let oversized = false
  slice.content.descendants((node) => {
    if (node.type.name !== 'table') return true
    if (tableWithinLimits(node)) return true
    oversized = true
    return false
  })
  return oversized
}

/**
 * Pasting an HTML grid is the only way an oversized table can reach the
 * document, and the block codec and domain props validator reject those grids.
 * Refusing the paste keeps the page saveable instead of turning one paste into a
 * permanently unsaveable document; the caller reports it to the user.
 */
export function createTablePasteGuard(onRejected: () => void) {
  return Extension.create({
    name: 'eotionTablePasteGuard',
    priority: 1000,
    addProseMirrorPlugins() {
      const guard = (slice: Slice, moved: boolean): boolean => {
        if (moved || !oversizedTableIn(slice)) return false
        onRejected()
        return true
      }
      return [new Plugin({
        props: {
          handlePaste: (_view, _event, slice) => guard(slice, false),
          handleDrop: (_view, _event, slice, moved) => guard(slice, moved),
        },
      })]
    },
  })
}
