import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@coaction/solid': resolve(
        __dirname,
        '../../packages/coaction-solid/src'
      ),
      coaction: resolve(__dirname, '../../packages/core/src')
    }
  }
});
