/**
 * MediaExternalPlayer — para VIDEO_MP4 + PDF_DOCUMENT mobile.
 *
 * Decisión Fase 1.2 confirmada por usuario:
 *   - PDF: expo-web-browser abre en navegador nativo del device
 *   - VIDEO: requiere wifi (no descarga offline). En Fase 1.2 también abre
 *     via expo-web-browser para evitar dependencia de expo-video.
 *
 * En Fase 2 v1.1.x:
 *   - Video: instalar expo-video con embedded player + caption tracking
 *   - PDF: react-native-pdf con scroll tracking real
 */
import { Pressable, StyleSheet, Text, View } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'

export function MediaExternalPlayer(props: {
  url: string
  type: 'VIDEO_MP4' | 'PDF_DOCUMENT'
  title: string
  durationMinutes: number
  onProgressTick: (positionSec: number, isCompleted: boolean) => void
}) {
  const isVideo = props.type === 'VIDEO_MP4'

  const handleOpen = async () => {
    try {
      await WebBrowser.openBrowserAsync(props.url, {
        // Browser nativo (in-app SafariView/CustomTabs) — UX consistente con OS
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.AUTOMATIC,
        // Light dismiss para que el user vuelva fácil al lesson
        dismissButtonStyle: 'close',
      })
    } catch (err) {
      // Fail-soft: si falla el browser, no crashear la app
      console.warn('Failed to open external media:', (err as Error).message)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.placeholder}>
        <Text style={styles.emoji}>{isVideo ? '🎬' : '📄'}</Text>
        <Text style={styles.placeholderTitle}>
          {isVideo ? 'Video' : 'Documento PDF'}
        </Text>
        <Text style={styles.placeholderSub}>
          Duración estimada: {props.durationMinutes} min
        </Text>
        {isVideo && (
          <Text style={styles.warning}>
            Requiere conexión wifi — no disponible offline en esta versión.
          </Text>
        )}
      </View>

      <Pressable style={styles.openBtn} onPress={handleOpen}>
        <Text style={styles.openBtnText}>
          {isVideo ? 'Ver video' : 'Abrir PDF'}
        </Text>
      </Pressable>

      {/* Marcar como visto manual — no podemos tracking real desde browser externo */}
      <Pressable
        style={styles.markBtn}
        onPress={() => props.onProgressTick(0, true)}
      >
        <Text style={styles.markBtnText}>Marcar como visto</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16 },
  placeholder: {
    backgroundColor: colors.canvas.secondary,
    borderRadius: 16,
    paddingVertical: 36,
    alignItems: 'center',
  },
  emoji: { fontSize: 56 },
  placeholderTitle: {
    color: colors.text.primary,
    fontSize: typography.size.title,
    fontWeight: '600',
    marginTop: 8,
  },
  placeholderSub: { color: colors.text.tertiary, fontSize: 13, marginTop: 4 },
  warning: {
    color: colors.warning[400],
    fontSize: 11,
    marginTop: 12,
    paddingHorizontal: 24,
    textAlign: 'center',
  },
  openBtn: {
    backgroundColor: colors.brand[500],
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  openBtnText: {
    color: colors.text.inverse,
    fontSize: 15,
    fontWeight: '700',
  },
  markBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  markBtnText: {
    color: colors.text.secondary,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
})
