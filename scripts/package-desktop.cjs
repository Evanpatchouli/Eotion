const { spawnSync } = require('node:child_process')
const { createRequire } = require('node:module')
const { existsSync, readFileSync, readdirSync, statSync } = require('node:fs')
const path = require('node:path')

const rootDir = path.resolve(__dirname, '..')
const desktopRoot = path.join(rootDir, 'apps', 'desktop')
const releaseDir = path.join(desktopRoot, 'release')
const desktopRequire = createRequire(path.join(desktopRoot, 'package.json'))
const targets = {
  installer: ['nsis'],
  portable: ['portable'],
  zip: ['zip'],
  release: ['nsis', 'portable', 'zip'],
}

function runVersionCheck() {
  const result = spawnSync(process.execPath, ['scripts/version.mjs', 'check'], {
    cwd: rootDir,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function expectedArtifacts(version, selectedTargets) {
  const files = []
  if (selectedTargets.includes('nsis')) files.push(`Eotion-Setup-${version}.exe`)
  if (selectedTargets.includes('portable')) files.push(`Eotion-${version}-portable.exe`)
  if (selectedTargets.includes('zip')) files.push(`Eotion-${version}-win-x64.zip`)
  return files
}

async function main() {
  if (process.platform !== 'win32') {
    throw new Error('Windows packaging must run on a Windows host.')
  }
  const selection = process.argv[2]
  if (!targets[selection]) {
    throw new Error('Usage: package-desktop.cjs <installer|portable|zip|release>')
  }

  runVersionCheck()
  const { version } = JSON.parse(
    readFileSync(path.join(rootDir, 'package.json'), 'utf8'),
  )
  const startedAt = Date.now()
  const electronVite = desktopRequire('electron-vite')
  const env = electronVite.loadEnv('production', desktopRoot, '')
  const apiOrigin =
    process.env.EOTION_DESKTOP_API_ORIGIN?.trim() ||
    env.EOTION_DESKTOP_API_ORIGIN?.trim() ||
    'https://eotion.evanpatchouli.space'
  const parsedOrigin = new URL(apiOrigin)
  if (parsedOrigin.protocol !== 'https:' || ![parsedOrigin.origin, `${parsedOrigin.origin}/`].includes(apiOrigin)) {
    throw new Error('EOTION_DESKTOP_API_ORIGIN must be an HTTPS origin without credentials, path, query, or fragment.')
  }
  process.env.EOTION_DESKTOP_API_ORIGIN = parsedOrigin.origin

  await electronVite.build({
    configFile: path.join(desktopRoot, 'electron.vite.config.ts'),
    mode: 'production',
  })

  const { Arch, Platform, build } = desktopRequire('electron-builder')
  const requestedTargets = targets[selection]
  await build({
    projectDir: desktopRoot,
    targets: Platform.WINDOWS.createTarget(requestedTargets, Arch.x64),
    config: require(path.join(desktopRoot, 'electron-builder.config.cjs')),
    publish: 'never',
  })

  const expected = expectedArtifacts(version, requestedTargets)
  const missing = expected.filter((name) => {
    const filePath = path.join(releaseDir, name)
    return (
      !existsSync(filePath) ||
      !statSync(filePath).isFile() ||
      statSync(filePath).size === 0 ||
      statSync(filePath).mtimeMs < startedAt - 1000
    )
  })
  if (missing.length > 0) {
    throw new Error(`Expected current-version artifacts were not created: ${missing.join(', ')}`)
  }

  const packages = readdirSync(releaseDir).filter((name) => /\.(?:exe|zip)$/i.test(name))
  const unversioned = packages.filter((name) => !/\d+\.\d+\.\d+/.test(name))
  if (unversioned.length > 0) {
    throw new Error(`Unversioned .exe/.zip files in release/: ${unversioned.join(', ')}`)
  }
  const unexpected = packages.filter((name) => !/^(?:Eotion-Setup-\d+\.\d+\.\d+\.exe|Eotion-\d+\.\d+\.\d+-portable\.exe|Eotion-\d+\.\d+\.\d+-win-x64\.zip)$/.test(name))
  if (unexpected.length > 0) {
    throw new Error(`Unexpected distribution filenames in release/: ${unexpected.join(', ')}`)
  }
  const currentNames = expectedArtifacts(version, targets.release)
  const stale = packages.filter((name) => !currentNames.includes(name))
  console.log(`[desktop] Created: ${expected.join(', ')}`)
  if (stale.length > 0) {
    console.warn(`[desktop] Older-version artifacts remain in apps/desktop/release/: ${stale.join(', ')}`)
  }
}

main().catch((error) => {
  console.error(`[desktop] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
