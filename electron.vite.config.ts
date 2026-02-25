import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { config } from 'dotenv'

config()

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ['audiotee']
      }
    },
    define: {
      'process.env.DEEPGRAM_API_KEY': JSON.stringify(process.env.DEEPGRAM_API_KEY || ''),
      'process.env.OPENAI_API_KEY': JSON.stringify(process.env.OPENAI_API_KEY || '')
    }
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
