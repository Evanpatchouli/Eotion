import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const webDir = path.join(root, 'apps/web')
const testsDir = path.join(webDir, 'tests')
const runDir = process.env.FORENSICS_RUN_DIR

if (!runDir) throw new Error('FORENSICS_RUN_DIR must point to the diagnostic evidence directory')
if (existsSync(path.join(runDir, 'generated-sources.json'))) throw new Error('Existing generated-source evidence must not be overwritten; select a fresh diagnostic directory')

const sourceFiles = [
  'product-flow.spec.ts',
  'product-pages.spec.ts',
  'product-editor.spec.ts',
  'product-blocks.spec.ts',
  'product-nested.spec.ts',
  'product-table.spec.ts',
  'product-database.spec.ts',
  'product-overlay.spec.ts',
  'product-slash-context.spec.ts',
  'product-content-rules.spec.ts',
  'product-p75-acceptance.spec.ts',
  'product-sync.spec.ts',
  'product-attachments.spec.ts',
  'product-settings.spec.ts',
]

const digest = (text) => createHash('sha256').update(text, 'utf8').digest('hex')
const entries = []

await mkdir(runDir, { recursive: true })
for (const file of sourceFiles) {
  const originalPath = path.join(testsDir, file)
  const original = await readFile(originalPath, 'utf8')
  const importPattern = /from (["'])@playwright\/test\1/g
  const occurrences = [...original.matchAll(importPattern)]
  if (occurrences.length === 0) throw new Error(`No @playwright/test imports found in ${file}`)
  const replacement = `from '../../../tools/startup-forensics/fixture'`
  const generated = original.replace(importPattern, replacement)
  const generatedFile = `forensics--${file}`
  if (existsSync(path.join(testsDir, generatedFile))) throw new Error(`Refusing to overwrite a generated source: ${generatedFile}`)
  await writeFile(path.join(testsDir, generatedFile), generated, 'utf8')
  entries.push({
    source: `apps/web/tests/${file}`,
    generated: `apps/web/tests/${generatedFile}`,
    sourceSha256: digest(original),
    generatedSha256: digest(generated),
    importReplacements: occurrences.length,
    patchDescription: `Replaced ${occurrences.length} @playwright/test import source(s) with ../../../tools/startup-forensics/fixture; all remaining source text is byte-for-byte equivalent after UTF-8 decoding.`,
  })
}

await writeFile(path.join(runDir, 'generated-sources.json'), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  files: entries,
}, null, 2)}\n`, 'utf8')
process.stdout.write(`Generated ${entries.length} diagnostic specs; manifest: ${path.join(runDir, 'generated-sources.json')}\n`)
