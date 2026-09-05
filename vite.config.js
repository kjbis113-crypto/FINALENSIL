import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        interactive: resolve(import.meta.dirname, 'interactive.html'),
        info: resolve(import.meta.dirname, 'info.html'),
        field: resolve(import.meta.dirname, 'field.html'),
        stage: resolve(import.meta.dirname, 'stage.html'),
      },
    },
  },
});
