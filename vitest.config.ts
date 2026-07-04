import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: false,
    projects: [
      {
        test: { name: 'node', include: ['tests/**/*.test.ts'], environment: 'node' }
      },
      {
        plugins: [react()],
        test: { name: 'renderer', include: ['tests/renderer/**/*.test.tsx'], environment: 'jsdom' }
      }
    ]
  }
})
