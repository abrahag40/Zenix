/**
 * lessonPrefetch — descarga proactiva de audio de las próximas N lessons
 * no completadas del enrollment activo.
 *
 * Trigger:
 *   1. Al abrir el dashboard learner (si hay wifi)
 *   2. Al completar una lesson (descarga la siguiente)
 *   3. Manual via botón "⬇ Descargar próximas 5" en AudioLessonPlayer
 *
 * NetInfo gate: solo descarga sobre wifi (NO data móvil) — respeta política
 * §150 + protege al usuario del consumo de datos celulares.
 *
 * Idempotente: si la lesson ya está en cache, no descarga otra vez.
 * Fail-soft: si una descarga falla, sigue con la siguiente.
 *
 * Scope: SOLO AUDIO_MP3 en Fase 1.2. VIDEO requiere wifi (no cache),
 * PDF abre externo, HTML5_NATIVE no necesita prefetch (texto/imágenes
 * pequeñas).
 */
import NetInfo from '@react-native-community/netinfo'
import { learningApi } from '../api/learning.api'
import { mediaCache } from './mediaCache'

interface LessonForPrefetch {
  id: string
  type: string
  audioUrl: string | null
  order: number
  moduleOrder: number
}

const MAX_PREFETCH_LESSONS = 5

/**
 * Prefetch las próximas N lessons audio de un curso desde la posición actual.
 * Solo corre si hay wifi.
 */
export async function prefetchNextLessons(courseSlug: string, currentLessonId?: string) {
  // 1) Network gate — solo wifi
  const net = await NetInfo.fetch()
  if (net.type !== 'wifi' || !net.isConnected) {
    return { skipped: 'not_wifi' as const, downloaded: 0 }
  }

  try {
    // 2) Carga el curso para obtener la lista de lessons
    const course = await learningApi.getCourseBySlug(courseSlug)
    const allLessons: LessonForPrefetch[] = course.modules.flatMap((m) =>
      m.lessons.map((l) => ({
        id: l.id,
        type: l.type,
        // Lessons no traen audioUrl en el course detail — necesitamos getLesson()
        // por cada una. Trade-off: 5 requests vs 1. Fase 1.2 acepta el N+1
        // para no bloquear roadmap; v1.0.5 optimization: backend devuelve
        // audioUrl en el course detail.
        audioUrl: null,
        order: l.order,
        moduleOrder: m.order,
      })),
    )

    // 3) Encuentra el índice actual
    const currentIdx = currentLessonId
      ? allLessons.findIndex((l) => l.id === currentLessonId)
      : -1
    const startIdx = currentIdx >= 0 ? currentIdx + 1 : 0
    const candidates = allLessons.slice(startIdx, startIdx + MAX_PREFETCH_LESSONS)

    // 4) Carga detail de cada candidate + descarga audio si AUDIO_MP3
    let downloaded = 0
    for (const candidate of candidates) {
      try {
        const detail = await learningApi.getLesson(candidate.id)
        if (detail.type !== 'AUDIO_MP3' || !detail.audioUrl) continue
        // Skip si ya cacheada
        const already = await mediaCache.getLocalPath(detail.audioUrl)
        if (already) continue
        const localPath = await mediaCache.download(detail.audioUrl)
        if (localPath) downloaded++
      } catch (err) {
        // Fail-soft — siguiente lesson
        console.warn(
          `[lessonPrefetch] failed lesson ${candidate.id}:`,
          (err as Error).message,
        )
      }
    }

    return { skipped: false as const, downloaded }
  } catch (err) {
    console.warn('[lessonPrefetch] aborted:', (err as Error).message)
    return { skipped: 'error' as const, downloaded: 0 }
  }
}
