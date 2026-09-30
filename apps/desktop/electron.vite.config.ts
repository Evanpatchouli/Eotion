import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

import { getEotionBuildInfo } from '../../scripts/build-info.mjs'

const buildInfo = getEotionBuildInfo()

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    root: resolve(__dirname, '../web'),
    plugins: [vue()],
    define: {
      __EOTION_VERSION__: JSON.stringify(buildInfo.version),
      __EOTION_BUILD_NUMBER__: JSON.stringify(buildInfo.buildNumber),
      __EOTION_GIT_SHA__: JSON.stringify(buildInfo.gitSha),
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, '../web/index.html'),
      },
      outDir: resolve(__dirname, 'out/renderer'),
      emptyOutDir: true,
    },
  },
})
