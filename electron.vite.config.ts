import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          pet: resolve(__dirname, 'src/preload/pet.ts'),
          dialog: resolve(__dirname, 'src/preload/dialog.ts'),
          config: resolve(__dirname, 'src/preload/config.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    base: '/',
    server: {
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:4789',
          changeOrigin: true
        }
      }
    },
    build: {
      rollupOptions: {
        input: {
          pet: resolve(__dirname, 'src/renderer/pet/index.html'),
          dialog: resolve(__dirname, 'src/renderer/dialog/index.html'),
          config: resolve(__dirname, 'src/renderer/config/index.html')
        }
      }
    },
    plugins: [react()]
  }
})
