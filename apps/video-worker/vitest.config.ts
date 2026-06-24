import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      // worker.ts imports @contento/shared (platform-profile helpers); resolve to source so the
      // test doesn't depend on the package's dist being freshly built (matches apps/api's config).
      '@contento/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  test: {
    globals: true,
  },
})
