import type { Editor } from '@tiptap/core'

import { createP2Fixture, type P2FixtureStats } from './p2Fixture'

export interface P2LoadMeasurement {
  stats: P2FixtureStats
  generationMs: number
  setContentMs: number
  readyMs: number
  renderedTextBlocks: number
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

/** Measures a repeatable load through the same Tiptap editor used for manual editing. */
export async function loadP2Fixture(editor: Editor): Promise<P2LoadMeasurement> {
  const start = performance.now()
  const { document, stats } = createP2Fixture()
  const generatedAt = performance.now()

  editor.commands.setContent(document)
  const contentSetAt = performance.now()

  // Let the browser reach a paint opportunity before reporting readiness.
  await nextFrame()
  await nextFrame()

  return {
    stats,
    generationMs: Math.round(generatedAt - start),
    setContentMs: Math.round(contentSetAt - generatedAt),
    readyMs: Math.round(performance.now() - start),
    renderedTextBlocks: editor.view.dom.querySelectorAll('p, h2').length,
  }
}
