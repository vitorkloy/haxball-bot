import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: './web',
  base: '/haxball-bot/',
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
});
