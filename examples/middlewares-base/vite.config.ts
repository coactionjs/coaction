import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@coaction/history': resolve(
        __dirname,
        '../../packages/coaction-history/src'
      ),
      '@coaction/logger': resolve(
        __dirname,
        '../../packages/coaction-logger/src'
      ),
      '@coaction/persist': resolve(
        __dirname,
        '../../packages/coaction-persist/src'
      ),
      coaction: resolve(__dirname, '../../packages/core/src')
    }
  }
});
