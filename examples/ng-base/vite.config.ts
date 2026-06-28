import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@coaction/ng': resolve(__dirname, '../../packages/coaction-ng/src'),
      coaction: resolve(__dirname, '../../packages/core/src')
    }
  }
});
