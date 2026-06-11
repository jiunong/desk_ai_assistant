import { cpSync, existsSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

function copyPetAsrAssets(): { name: string; closeBundle: () => void } {
  return {
    name: 'copy-pet-asr-assets',
    closeBundle() {
      const src = resolve(__dirname, 'src/renderer/pet/asr')
      if (!existsSync(src)) return
      for (const entry of ['pet', 'dialog']) {
        const dest = resolve(__dirname, `out/renderer/${entry}/asr`)
        mkdirSync(dest, { recursive: true })
        for (const file of ['recorder-core.js', 'wav.js', 'pcm.js']) {
          cpSync(resolve(src, file), resolve(dest, file))
        }
      }
    }
  }
}

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
          config: resolve(__dirname, 'src/preload/config.ts'),
          screenshot: resolve(__dirname, 'src/preload/screenshot.ts')
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
          config: resolve(__dirname, 'src/renderer/config/index.html'),
          screenshot: resolve(__dirname, 'src/renderer/screenshot/index.html')
        }
      }
    },
    plugins: [react(), copyPetAsrAssets()]
  }
})
