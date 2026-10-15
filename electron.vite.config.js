import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

const shared = resolve('src/shared')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { outDir: 'dist-electron/main' },
    resolve: { alias: { '@shared': shared } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { outDir: 'dist-electron/preload' }
  },
  renderer: {
    root: 'src/renderer',
    build: { outDir: 'dist/renderer' },
    resolve: { alias: { '@': resolve('src/renderer'), '@shared': shared } },
    plugins: [vue()]
  }
})
