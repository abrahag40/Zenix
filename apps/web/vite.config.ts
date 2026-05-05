import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
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
