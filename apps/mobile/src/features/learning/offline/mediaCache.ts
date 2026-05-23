/**
 * mediaCache — LRU cache local para media de Learning (audio principalmente).
 *
 * Decisión Fase 1.2 confirmada por usuario:
 *   - Audio se descarga offline cuando hay wifi
 *   - Video requiere wifi (no cacheado)
 *   - PDF abre browser nativo (no cacheado)
 *
 * Implementación:
 *   - Storage: expo-file-system, FileSystem.cacheDirectory + '/zenix-learning/'
 *   - LRU eviction cuando total size > MAX_CACHE_BYTES (500 MB default)
 *   - Index persistente en AsyncStorage para sobrevivir reboots
 *   - Filename: SHA-like del URL (simple hash) + extensión inferida
 *
 * NO usa expo-file-system v19 next-gen API por compat con SDK 54 — usamos
 * legacy API (FileSystem.downloadAsync, getInfoAsync, deleteAsync). Si en
 * v1.0.5 actualizan a SDK 55+ que rompa legacy, refactorizar.
 *
 * Pattern Spotify/YouTube Music local storage — usuario nunca ve el cache,
 * solo experimenta "audio carga rápido aún sin wifi".
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as FileSystem from 'expo-file-system/legacy'

const CACHE_DIR = (FileSystem.cacheDirectory ?? '') + 'zenix-learning/'
const INDEX_KEY = '@zenix-learning/media-cache-index'
const MAX_CACHE_BYTES = 500 * 1024 * 1024 // 500 MB

interface CacheEntry {
  url: string
  localPath: string
  sizeBytes: number
  cachedAt: number
  lastAccessedAt: number
}

interface CacheIndex {
  [url: string]: CacheEntry
}

class MediaCacheService {
  private index: CacheIndex = {}
  private loaded = false

  /**
   * Carga el index desde AsyncStorage. Llamado una vez al boot.
   * Idempotente — segundo call no-op.
   */
  async load(): Promise<void> {
    if (this.loaded) return
    try {
      // Asegura directorio de cache
      const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR)
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true })
      }

      const raw = await AsyncStorage.getItem(INDEX_KEY)
      if (raw) {
        try {
          this.index = JSON.parse(raw) as CacheIndex
        } catch {
          this.index = {}
        }
      }
      // Cleanup: si algún archivo desapareció del FS pero está en index, remove
      const stillValid: CacheIndex = {}
      for (const [url, entry] of Object.entries(this.index)) {
        const info = await FileSystem.getInfoAsync(entry.localPath)
        if (info.exists) stillValid[url] = entry
      }
      this.index = stillValid
      await this.persistIndex()
      this.loaded = true
    } catch (err) {
      console.warn('[mediaCache] load failed:', (err as Error).message)
    }
  }

  /**
   * Returns local path si el URL está cacheado, o null si no.
   * Actualiza lastAccessedAt para LRU.
   */
  async getLocalPath(url: string): Promise<string | null> {
    await this.load()
    const entry = this.index[url]
    if (!entry) return null
    // Verify file still exists (defense in depth)
    const info = await FileSystem.getInfoAsync(entry.localPath)
    if (!info.exists) {
      delete this.index[url]
      void this.persistIndex()
      return null
    }
    entry.lastAccessedAt = Date.now()
    void this.persistIndex()
    return entry.localPath
  }

  /**
   * Descarga el URL al cache local. Si ya está cacheado, no-op (returns existing).
   * Fail-soft: si la descarga falla, returns null.
   */
  async download(url: string): Promise<string | null> {
    await this.load()
    const existing = await this.getLocalPath(url)
    if (existing) return existing

    const filename = this.hashUrl(url) + this.inferExtension(url)
    const localPath = CACHE_DIR + filename

    try {
      const result = await FileSystem.downloadAsync(url, localPath)
      if (result.status !== 200) {
        try {
          await FileSystem.deleteAsync(localPath, { idempotent: true })
        } catch {
          // ignore
        }
        return null
      }
      const info = await FileSystem.getInfoAsync(localPath, { size: true })
      const sizeBytes = info.exists && 'size' in info ? (info.size as number) : 0

      const entry: CacheEntry = {
        url,
        localPath,
        sizeBytes,
        cachedAt: Date.now(),
        lastAccessedAt: Date.now(),
      }
      this.index[url] = entry
      await this.persistIndex()
      await this.evictIfNeeded()
      return localPath
    } catch (err) {
      console.warn(`[mediaCache] download failed for ${url}:`, (err as Error).message)
      return null
    }
  }

  /**
   * LRU eviction: si el cache total excede MAX_CACHE_BYTES, borra entries
   * por lastAccessedAt ASC hasta caer por debajo del límite.
   */
  private async evictIfNeeded(): Promise<void> {
    const total = Object.values(this.index).reduce((s, e) => s + e.sizeBytes, 0)
    if (total <= MAX_CACHE_BYTES) return

    const sorted = Object.values(this.index).sort(
      (a, b) => a.lastAccessedAt - b.lastAccessedAt,
    )
    let currentTotal = total
    for (const entry of sorted) {
      if (currentTotal <= MAX_CACHE_BYTES * 0.8) break // target 80% del cap
      try {
        await FileSystem.deleteAsync(entry.localPath, { idempotent: true })
      } catch {
        // ignore — file ya removido
      }
      delete this.index[entry.url]
      currentTotal -= entry.sizeBytes
    }
    await this.persistIndex()
  }

  /**
   * Stats: total bytes + count. Útil para debug en Settings.
   */
  async getStats(): Promise<{ totalBytes: number; entryCount: number; maxBytes: number }> {
    await this.load()
    const totalBytes = Object.values(this.index).reduce((s, e) => s + e.sizeBytes, 0)
    return {
      totalBytes,
      entryCount: Object.keys(this.index).length,
      maxBytes: MAX_CACHE_BYTES,
    }
  }

  /** Borra todo el cache. Útil para Settings "Limpiar caché de aprendizaje". */
  async clear(): Promise<void> {
    await this.load()
    for (const entry of Object.values(this.index)) {
      try {
        await FileSystem.deleteAsync(entry.localPath, { idempotent: true })
      } catch {
        // ignore
      }
    }
    this.index = {}
    await this.persistIndex()
  }

  private async persistIndex(): Promise<void> {
    try {
      await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(this.index))
    } catch (err) {
      console.warn('[mediaCache] persist index failed:', (err as Error).message)
    }
  }

  /** Hash determinístico simple para URL → filename. NO crypto-grade. */
  private hashUrl(url: string): string {
    let h = 0
    for (let i = 0; i < url.length; i++) {
      h = (h << 5) - h + url.charCodeAt(i)
      h |= 0
    }
    return Math.abs(h).toString(36)
  }

  private inferExtension(url: string): string {
    const m = url.match(/\.([a-z0-9]{2,4})(\?|$)/i)
    return m ? '.' + m[1] : ''
  }
}

export const mediaCache = new MediaCacheService()
