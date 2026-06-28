import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@coaction/yjs': resolve(__dirname, '../../packages/coaction-yjs/src'),
      coaction: resolve(__dirname, '../../packages/core/src')
    }
  }
});
