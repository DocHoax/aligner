import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@alignify/shared-types': path.resolve(__dirname, '../shared-types/src/index.ts'),
      '@alignify/ui': path.resolve(__dirname, '../ui/src/index.ts'),
      '@alignify/canvas-engine': path.resolve(__dirname, './src/index.ts')
    }
  },
  test: {
    globals: true,
    environment: 'node'
  }
});
