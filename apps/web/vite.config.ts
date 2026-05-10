import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Apuntar @zenix/shared directamente al source TS evita el problema de
      // ESM/CJS interop con el dist commonjs (Sprint Mx-1B-W1). Vite/esbuild
      // transforma TS → ESM al vuelo y los named exports (enums, types)
      // funcionan limpios. apps/api sigue usando dist via node_modules.
      '@zenix/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    // Pre-bundle estos paquetes en cold-start. Sin esto, Vite's lazy scan
    // devuelve 504 la primera vez que una ruta los importa (BlocksPage,
    // dialogs, day-picker), congelando el render hasta un reload manual.
    include: [
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      'react-day-picker',
    ],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
