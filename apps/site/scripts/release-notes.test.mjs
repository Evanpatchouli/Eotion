import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { parse, compileScript } from 'vue/compiler-sfc'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const filename = new URL('../.vitepress/theme/components/ReleaseNotes.vue', import.meta.url)
const { descriptor } = parse(await readFile(filename, 'utf8'))
const script = compileScript(descriptor, { id: 'release-notes-test', inlineTemplate: true })
const compiled = ts.transpileModule(script.content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

async function render(notes, currentVersion) {
  const exports = {}
  const current = notes.find((note) => note.version === currentVersion)
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => name.endsWith('/data/releases') ? {
      release: { version: currentVersion, buildNumber: 2, releasedAt: current?.releasedAt ?? null },
      releaseNotes: notes,
    } : require(name),
  })
  return renderToString(createSSRApp(exports.default))
}

const notes = [
  { version: '0.0.2', releasedAt: '2026-10-05', highlights: ['新版记录'] },
  { version: '0.0.1', releasedAt: '2026-10-04', highlights: ['已有记录'] },
]
test('changelog retains both shared releases after a version bump', async () => {
  const html = await render(notes, '0.0.2')
  assert.match(html, /v0\.0\.2/)
  assert.match(html, /v0\.0\.1/)
  assert.match(html, /新版记录/)
  assert.match(html, /已有记录/)
  assert.equal((html.match(/Build 2/g) ?? []).length, 1)
})
test('a version without notes preserves published history and explains the gap', async () => {
  const html = await render(notes, '0.0.3')
  assert.match(html, /v0\.0\.3 的发布说明尚未提供/)
  assert.match(html, /v0\.0\.1/)
  assert.match(html, /v0\.0\.2/)
})
