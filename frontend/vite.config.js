import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Set the root to the parent directory where the main index.html is located
  root: '../',
  server: {
    port: 5173,
    open: true
  }
});
