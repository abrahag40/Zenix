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
        // Configurable por env (default :3000) — permite levantar una instancia
        // de preview apuntando a otra API local sin tocar el server por defecto.
        target: process.env.VITE_API_PROXY || 'http://localhost:3000',
        changeOrigin: true,
        // Custom error handler — el spam de "AggregateError [ECONNREFUSED]"
        // explotaba la terminal cada vez que el API no estaba arriba (Sprint
        // owner-fix 2026-06-08). Ahora muestra UN solo warning accionable
        // por minuto, no por request. Reduce ruido + hace claro qué hacer.
        configure: (proxy) => {
          let lastWarnAt = 0
          proxy.on('error', (_err, _req, res) => {
            const now = Date.now()
            if (now - lastWarnAt > 60_000) {
              lastWarnAt = now
              // eslint-disable-next-line no-console
              console.warn(
                '\x1b[33m[vite proxy]\x1b[0m API no responde en :3000.\n' +
                '  → Arranca el API: `npm run dev` desde la raíz (turbo arranca api+web juntos).\n' +
                '  → Si ya está corriendo, mata orphans: `pkill -f "nest|nodemon"` y reintenta.\n' +
                '  (Este aviso se repetirá max 1 vez por minuto mientras siga caído.)',
              )
            }
            try {
              if (res && 'writeHead' in res && !res.headersSent) {
                res.writeHead(503, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ statusCode: 503, message: 'API offline — arranca el backend (npm run dev en raíz)' }))
              }
            } catch { /* ignore */ }
          })
        },
      },
    },
  },
})
