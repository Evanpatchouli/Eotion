import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    root: resolve(__dirname, '../web'),
    plugins: [vue()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, '../web/index.html'),
      },
      outDir: resolve(__dirname, 'out/renderer'),
      emptyOutDir: true,
    },
  },
})
