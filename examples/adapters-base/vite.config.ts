import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@coaction/jotai': resolve(
        __dirname,
        '../../packages/coaction-jotai/src'
      ),
      '@coaction/redux': resolve(
        __dirname,
        '../../packages/coaction-redux/src'
      ),
      '@coaction/valtio': resolve(
        __dirname,
        '../../packages/coaction-valtio/src'
      ),
      '@coaction/xstate': resolve(
        __dirname,
        '../../packages/coaction-xstate/src'
      ),
      coaction: resolve(__dirname, '../../packages/core/src')
    }
  }
});
