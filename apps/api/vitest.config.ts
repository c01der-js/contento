import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@contento/ai': resolve(__dirname, '../../packages/ai/src/index.ts'),
      '@contento/db': resolve(__dirname, '../../packages/db/src/index.ts'),
      '@contento/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  test: {
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
})
