import { useAuthStore } from '@/store/auth'

/**
 * Descarga autenticada de un archivo (Blob) — `fetch` directo porque el `api`
 * client parsea JSON. Misma resolución de base que el client (dev: relativo +
 * proxy de Vite). Reusable por todos los reportes (Estándar de Reportes, export).
 */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const base = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL ?? '')
  const token = useAuthStore.getState().token
  const res = await fetch(`${base}/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error('No se pudo descargar el archivo')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
