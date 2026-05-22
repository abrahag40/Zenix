/**
 * AudioMiniPlayer — barra sticky Spotify-style cuando hay audio activo
 * y el usuario navegó a otra pantalla.
 *
 * Renderizado en (app)/_layout.tsx encima del tab bar (mismo pattern que
 * FocusBanner del housekeeping). Si el user vuelve al lesson screen del
 * track activo, el lesson screen muestra el full-screen player.
 *
 * Tap → push al lesson activo (lesson/:id).
 * Tap ⏸ → toggle play/pause sin navegar.
 * Tap ✕ → unload (descarga el audio).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { colors } from '../../../design/colors'
import { useAudioStore } from '../store/audioStore'

export function AudioMiniPlayer() {
  const router = useRouter()
  const { track, isPlaying, positionSec, togglePlay, unload } = useAudioStore()

  if (!track) return null

  const progress = track.durationSec
    ? Math.min(100, (positionSec / track.durationSec) * 100)
    : 0

  return (
    <View style={styles.container}>
      {/* Progress bar superfina */}
      <View style={styles.progressBg}>
        <View style={[styles.progressFg, { width: `${progress}%` }]} />
      </View>

      <Pressable
        style={styles.row}
        onPress={() => router.push(`/(app)/aprende/lesson/${track.lessonId}`)}
      >
        <Text style={styles.icon}>🎵</Text>
        <View style={styles.meta}>
          <Text style={styles.title} numberOfLines={1}>
            {track.title}
          </Text>
          <Text style={styles.course} numberOfLines={1}>
            {track.courseTitle}
          </Text>
        </View>
        <Pressable style={styles.ctrlBtn} onPress={togglePlay} hitSlop={8}>
          <Text style={styles.ctrlText}>{isPlaying ? '⏸' : '▶'}</Text>
        </Pressable>
        <Pressable style={styles.ctrlBtn} onPress={unload} hitSlop={8}>
          <Text style={styles.ctrlText}>✕</Text>
        </Pressable>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.canvas.tertiary,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  progressBg: { height: 2, backgroundColor: colors.canvas.secondary },
  progressFg: { height: 2, backgroundColor: colors.brand[500] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 10,
  },
  icon: { fontSize: 20 },
  meta: { flex: 1 },
  title: { color: colors.text.primary, fontSize: 13, fontWeight: '600' },
  course: { color: colors.text.tertiary, fontSize: 11, marginTop: 1 },
  ctrlBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctrlText: { color: colors.text.primary, fontSize: 16 },
})
