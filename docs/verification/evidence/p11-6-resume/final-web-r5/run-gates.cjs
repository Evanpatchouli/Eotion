const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = __dirname
const web = 'C:/Users/31250/Work/Eotion/apps/web'
const repo = 'C:/Users/31250/Work/Eotion'
const cli = path.join(web, 'node_modules/@playwright/test/cli.js')
const product = JSON.parse(fs.readFileSync(path.join(web, 'package.json'), 'utf8')).scripts['test:product'].split(' ').slice(2)
if (product.length !== 14) throw new Error(`Expected 14 product specs, got ${product.length}`)
const logicTheme = fs.readdirSync(path.join(web, 'tests')).filter(name => (name.startsWith('timeline-') && name.endsWith('.spec.ts') && name !== 'timeline-visual.spec.ts') || name === 'theme.spec.ts').sort().map(name => `tests/${name}`)
const gates = [
  { name: 'typecheck', exe: 'pwsh', args: ['-NoProfile', '-Command', 'pnpm --filter @eotion/web typecheck'], cwd: repo },
  { name: 'build', exe: 'pwsh', args: ['-NoProfile', '-Command', 'pnpm --filter @eotion/web build'], cwd: repo },
  { name: 'logic-theme', config: 'full', specs: logicTheme },
  { name: 'product', config: 'full', specs: product },
  { name: 'database', config: 'full', specs: ['tests/product-database.spec.ts'] },
  { name: 'visual', config: 'visual', specs: [] },
]
const summaries = []
for (const gate of gates) {
  const dir = path.join(root, gate.name)
  fs.mkdirSync(dir, { recursive: true })
  const exe = gate.exe || process.execPath
  const args = gate.args || [cli, 'test', '--config', path.join(root, `playwright.${gate.config}.config.mjs`), ...gate.specs, '--workers=1', '--retries=0', '--output', path.join(dir, 'test-results')]
  const cwd = gate.cwd || web
  const env = { ...process.env, EOTION_PLAYWRIGHT_JSON: path.join(dir, 'results.json') }
  fs.writeFileSync(path.join(dir, 'command.json'), JSON.stringify({ exe, args, cwd }, null, 2))
  const stdout = fs.openSync(path.join(dir, 'stdout.log'), 'w')
  const stderr = fs.openSync(path.join(dir, 'stderr.log'), 'w')
  const start = new Date()
  console.log(`${start.toISOString()} START ${gate.name}`)
  const result = spawnSync(exe, args, { cwd, env, stdio: ['ignore', stdout, stderr], windowsHide: true })
  fs.closeSync(stdout)
  fs.closeSync(stderr)
  const summary = { gate: gate.name, start: start.toISOString(), end: new Date().toISOString(), exitCode: result.status, signal: result.signal, error: result.error?.message }
  const report = path.join(dir, 'results.json')
  if (fs.existsSync(report)) {
    const data = JSON.parse(fs.readFileSync(report, 'utf8'))
    summary.stats = data.stats
    summary.errors = data.errors
  }
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2))
  summaries.push(summary)
  fs.writeFileSync(path.join(root, 'summary.json'), JSON.stringify(summaries, null, 2))
  console.log(`${summary.end} END ${gate.name} exit=${result.status} ${JSON.stringify(summary.stats || {})}`)
}
process.exitCode = summaries.some(item => item.exitCode !== 0) ? 1 : 0
