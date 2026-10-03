import { access, readFile, readdir } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../.vitepress/dist/', import.meta.url))
async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory()
    ? htmlFiles(join(directory, entry.name))
    : entry.name.endsWith('.html') ? [join(directory, entry.name)] : []))
  return nested.flat()
}
const failures = []
let checked = 0
for (const file of await htmlFiles(root)) {
  const html = await readFile(file, 'utf8')
  const base = new URL(relative(root, file).replaceAll('\\', '/'), 'https://site.invalid/')
  for (const [, raw] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const url = new URL(raw.replaceAll('&amp;', '&'), base)
    if (url.origin !== base.origin) continue
    const path = join(root, decodeURIComponent(url.pathname))
    const candidates = extname(path) ? [path] : [join(path, 'index.html'), `${path}.html`]
    let target
    for (const candidate of candidates) {
      try { await access(candidate); target = candidate; break } catch { /* Try clean URL alternative. */ }
    }
    if (!target) { failures.push(`${relative(root, file)} → ${raw}`); continue }
    if (url.hash && target.endsWith('.html')) {
      const targetHtml = target === file ? html : await readFile(target, 'utf8')
      const id = decodeURIComponent(url.hash.slice(1))
      if (![...targetHtml.matchAll(/id="([^"]+)"/g)].some((match) => match[1] === id)) {
        failures.push(`${relative(root, file)} → ${raw} (missing anchor)`)
      }
    }
    checked++
  }
}
if (failures.length) {
  console.error(failures.join('\n'))
  process.exitCode = 1
} else console.log(`[site] ${checked} internal links, anchors and assets verified.`)
