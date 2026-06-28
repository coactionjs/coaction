import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@coaction/vue': resolve(__dirname, '../../packages/coaction-vue/src'),
      coaction: resolve(__dirname, '../../packages/core/src')
    }
  }
});
