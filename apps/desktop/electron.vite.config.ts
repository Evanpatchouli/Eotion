import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

type RootManifest = {
  version: string
  eotion?: {
    buildNumber?: number
  }
}

const rootDir = resolve(__dirname, '../..')
const rootManifest = JSON.parse(
  readFileSync(resolve(rootDir, 'package.json'), 'utf8'),
) as RootManifest
const buildNumber = rootManifest.eotion?.buildNumber
if (
  typeof buildNumber !== 'number' ||
  !Number.isSafeInteger(buildNumber) ||
  buildNumber < 1
) {
  throw new Error('Invalid root package.json eotion.buildNumber')
}

function getGitSha(): string {
  const configured = process.env.GIT_SHA?.trim()
  if (configured && configured !== 'unknown') return configured.slice(0, 12)

  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return configured || 'unknown'
  }
}

const buildInfo = {
  version: rootManifest.version,
  buildNumber,
  gitSha: getGitSha(),
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(__dirname, '../web'), '')
  const desktopEnv = loadEnv(mode, __dirname, '')
  const desktopApiOrigin = process.env.EOTION_DESKTOP_API_ORIGIN ?? desktopEnv.EOTION_DESKTOP_API_ORIGIN ?? ''

  return {
    main: {
      build: {
        externalizeDeps: {
          exclude: ['@eotion/storage', '@eotion/contracts', '@eotion/domain', 'nanoid'],
        },
      },
      define: {
        __EOTION_DESKTOP_API_ORIGIN__: JSON.stringify(desktopApiOrigin),
      },
    },
    preload: {},
    renderer: {
      root: resolve(__dirname, '../web'),
      plugins: [vue()],
      define: {
        __EOTION_VERSION__: JSON.stringify(buildInfo.version),
        __EOTION_BUILD_NUMBER__: JSON.stringify(buildInfo.buildNumber),
        __EOTION_GIT_SHA__: JSON.stringify(buildInfo.gitSha),
        'import.meta.env.VITE_API_BASE_URL': JSON.stringify(''),
      },
      server: {
        proxy: {
          '/api': {
            target: env.EOTION_API_PROXY_TARGET || 'http://127.0.0.1:7137',
            changeOrigin: false,
          },
        },
      },
      build: {
        rollupOptions: {
          input: resolve(__dirname, '../web/index.html'),
        },
        outDir: resolve(__dirname, 'out/renderer'),
        emptyOutDir: true,
      },
    },
  }
})
