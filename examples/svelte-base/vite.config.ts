import { resolve } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      '@coaction/svelte': resolve(
        __dirname,
        '../../packages/coaction-svelte/src'
      ),
      coaction: resolve(__dirname, '../../packages/core/src')
    }
  }
});
