import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: './web',
  base: '/haxball-bot/',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: { main: resolve(__dirname, 'web/index.html'), frame: resolve(__dirname, 'web/bot-frame.html') }
    }
  }
});
