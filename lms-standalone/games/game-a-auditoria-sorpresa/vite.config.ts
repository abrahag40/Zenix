import { defineConfig } from 'vite';

// base relativo para que el build funcione embebido en un iframe del engine LMS
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5180,
    open: true,
  },
});
