/**
 * AudioLessonPlayer — full-screen audio player con expo-audio.
 *
 * Patron Apple Music / Spotify "Now Playing" page:
 *   - Big artwork
 *   - Title + course + lesson
 *   - Scrub progress bar
 *   - Big play/pause + 15s skip
 *   - Rate selector (1.0x default, 1.25x, 1.5x para learners avanzados)
 *
 * Persistencia: usa useAudioStore global. Si el usuario sale a otra screen,
 * el audio continúa via mini-player (Spotify pattern).
 *
 * Tracking: cada 5s emite trackProgress via parent prop callback.
 * Cuando position >= 95% duration → onComplete callback.
 */
import { useCallback, useEffect, useRef } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useAudioStore } from '../store/audioStore'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'

export function AudioLessonPlayer(props: {
  lessonId: string
  enrollmentId: string
  audioUrl: string
  title: string
  courseTitle: string
  transcriptText?: string | null
  initialBookmarkPosition?: number
  onProgressTick: (positionSec: number, isCompleted: boolean) => void
}) {
  const { track, isPlaying, positionSec, rate, loadTrack, togglePlay, seekTo, setRate, syncPosition } =
    useAudioStore()

  const lastTickRef = useRef(0)

  // Cargar el track si es nuevo. Si el mismo track ya está cargado en el
  // store, no recargamos (preserva el playhead — Spotify pattern).
  useEffect(() => {
    if (track?.lessonId === props.lessonId) return
    void loadTrack({
      lessonId: props.lessonId,
      enrollmentId: props.enrollmentId,
      url: props.audioUrl,
      title: props.title,
      courseTitle: props.courseTitle,
      startAtSec: props.initialBookmarkPosition,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.lessonId, props.audioUrl])

  // Sync interval — actualiza positionSec desde el player cada 1s.
  // Cada 5s emite trackProgress al parent.
  useEffect(() => {
    if (!track) return
    const interval = setInterval(() => {
      syncPosition()
      const now = useAudioStore.getState().positionSec
      const lastFlushed = lastTickRef.current
      if (Math.abs(now - lastFlushed) >= 5) {
        const duration = track.durationSec ?? 0
        const isCompleted = duration > 0 && now / duration >= 0.95
        props.onProgressTick(now, isCompleted)
        lastTickRef.current = now
      }
    }, 1000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.lessonId])

  const handleSkip = useCallback(
    (delta: number) => {
      seekTo(Math.max(0, positionSec + delta))
    },
    [positionSec, seekTo],
  )

  return (
    <View style={styles.container}>
      {/* Artwork placeholder — Fase 1.3 cover real del curso */}
      <View style={styles.artwork}>
        <Text style={styles.artworkText}>🎵</Text>
      </View>

      <View style={styles.meta}>
        <Text style={styles.lessonTitle}>{props.title}</Text>
        <Text style={styles.courseTitle}>{props.courseTitle}</Text>
      </View>

      {/* Progress bar simple — Fase 1.2b agregar tap-to-seek */}
      <View style={styles.progressWrap}>
        <View style={styles.progressBg}>
          <View
            style={[
              styles.progressFg,
              { width: `${Math.min(100, (positionSec / (track?.durationSec || 1)) * 100)}%` },
            ]}
          />
        </View>
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{formatTime(positionSec)}</Text>
          <Text style={styles.timeText}>
            {track?.durationSec ? formatTime(track.durationSec) : '—:—'}
          </Text>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controlsRow}>
        <Pressable style={styles.skipBtn} onPress={() => handleSkip(-15)}>
          <Text style={styles.skipText}>⏪ 15s</Text>
        </Pressable>
        <Pressable style={styles.playBtn} onPress={togglePlay}>
          <Text style={styles.playText}>{isPlaying ? '⏸' : '▶'}</Text>
        </Pressable>
        <Pressable style={styles.skipBtn} onPress={() => handleSkip(15)}>
          <Text style={styles.skipText}>15s ⏩</Text>
        </Pressable>
      </View>

      {/* Rate selector */}
      <View style={styles.rateRow}>
        {[1.0, 1.25, 1.5, 1.75].map((r) => (
          <Pressable
            key={r}
            style={[styles.rateBtn, rate === r && styles.rateBtnActive]}
            onPress={() => setRate(r)}
          >
            <Text style={[styles.rateText, rate === r && styles.rateTextActive]}>
              {r}x
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Transcript */}
      {props.transcriptText && (
        <View style={styles.transcriptBox}>
          <Text style={styles.transcriptLabel}>Transcripción</Text>
          <Text style={styles.transcriptText}>{props.transcriptText}</Text>
        </View>
      )}
    </View>
  )
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: 20 },
  artwork: {
    width: 200,
    height: 200,
    borderRadius: 24,
    backgroundColor: colors.canvas.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  artworkText: { fontSize: 72 },
  meta: { alignItems: 'center', marginBottom: 24 },
  lessonTitle: {
    color: colors.text.primary,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  courseTitle: { color: colors.text.tertiary, fontSize: 13, marginTop: 4 },
  progressWrap: { width: '100%', paddingHorizontal: 24, marginBottom: 16 },
  progressBg: {
    height: 4,
    backgroundColor: colors.canvas.secondary,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFg: { height: '100%', backgroundColor: colors.brand[500] },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  timeText: { color: colors.text.tertiary, fontSize: 11 },

  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    marginBottom: 24,
  },
  skipBtn: { padding: 12 },
  skipText: { color: colors.text.secondary, fontSize: 14 },
  playBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.brand[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  playText: { color: colors.text.inverse, fontSize: 28 },

  rateRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  rateBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.canvas.secondary,
    borderRadius: 8,
  },
  rateBtnActive: { backgroundColor: colors.brand[500] },
  rateText: { color: colors.text.secondary, fontSize: 12, fontWeight: '500' },
  rateTextActive: { color: colors.text.inverse },

  transcriptBox: {
    backgroundColor: colors.canvas.secondary,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 20,
    width: '90%',
  },
  transcriptLabel: {
    color: colors.text.tertiary,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '600',
    marginBottom: 6,
  },
  transcriptText: {
    color: colors.text.secondary,
    fontSize: 13,
    lineHeight: 19,
  },
})
