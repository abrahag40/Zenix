/**
 * audioStore — Zustand store global para el audio player Spotify-style.
 *
 * Por qué store global (no local):
 *   El mini-player aparece SOBRE el tab bar cuando el usuario sale de la
 *   pantalla del lesson. Necesitamos un punto único de verdad para:
 *     - URL/título/duración del audio activo
 *     - Estado play/pause
 *     - Posición actual (para progress bar)
 *     - Callback para marcar la lección completed al 95%
 *
 * Patrón Apple Music / Spotify — single global player instance.
 *
 * NO usamos expo-audio's player directamente desde múltiples componentes:
 *   El AudioPlayer (objeto retornado por createAudioPlayer) es stateful y
 *   debe vivir en UN solo lugar. El store guarda referencia + metadata;
 *   los componentes UI (full + mini) leen del store y disparan acciones.
 */
import { create } from 'zustand'
import { createAudioPlayer, type AudioPlayer } from 'expo-audio'

interface AudioState {
  /** Track activo o null si nada está reproduciéndose */
  track: {
    lessonId: string
    enrollmentId: string
    url: string
    title: string
    courseTitle: string
    durationSec: number | null
  } | null
  /** Estado play/pause */
  isPlaying: boolean
  /** Posición actual en segundos */
  positionSec: number
  /** Player object — null hasta que se carga el primer track */
  _player: AudioPlayer | null
  /** Velocidad de reproducción */
  rate: number

  // Actions
  loadTrack: (input: {
    lessonId: string
    enrollmentId: string
    url: string
    title: string
    courseTitle: string
    startAtSec?: number
  }) => Promise<void>
  play: () => void
  pause: () => void
  togglePlay: () => void
  seekTo: (seconds: number) => void
  setRate: (rate: number) => void
  /** Pulsado el botón X del mini-player — descarga el track */
  unload: () => void
  /** Actualiza positionSec desde el player (llamado por interval externo) */
  syncPosition: () => void
}

export const useAudioStore = create<AudioState>((set, get) => ({
  track: null,
  isPlaying: false,
  positionSec: 0,
  _player: null,
  rate: 1.0,

  loadTrack: async (input) => {
    const { _player: previousPlayer } = get()
    // Descargar player anterior si existía
    if (previousPlayer) {
      try {
        previousPlayer.remove()
      } catch {
        // ignore — player ya removido
      }
    }
    // Crear nuevo player. expo-audio devuelve AudioPlayer object
    // que tiene .play() .pause() .seekTo() .setPlaybackRate() .remove()
    const player = createAudioPlayer({ uri: input.url })
    player.shouldCorrectPitch = true
    if (input.startAtSec && input.startAtSec > 0) {
      try {
        await player.seekTo(input.startAtSec)
      } catch {
        // ignore — algunos streams no soportan seek inicial
      }
    }
    player.play()
    set({
      track: {
        lessonId: input.lessonId,
        enrollmentId: input.enrollmentId,
        url: input.url,
        title: input.title,
        courseTitle: input.courseTitle,
        durationSec: null,
      },
      isPlaying: true,
      positionSec: input.startAtSec ?? 0,
      _player: player,
    })
  },

  play: () => {
    const p = get()._player
    if (!p) return
    p.play()
    set({ isPlaying: true })
  },

  pause: () => {
    const p = get()._player
    if (!p) return
    p.pause()
    set({ isPlaying: false })
  },

  togglePlay: () => {
    if (get().isPlaying) get().pause()
    else get().play()
  },

  seekTo: (seconds: number) => {
    const p = get()._player
    if (!p) return
    void p.seekTo(seconds)
    set({ positionSec: seconds })
  },

  setRate: (rate: number) => {
    const p = get()._player
    if (!p) return
    p.setPlaybackRate(rate)
    set({ rate })
  },

  unload: () => {
    const { _player } = get()
    if (_player) {
      try {
        _player.pause()
        _player.remove()
      } catch {
        // ignore
      }
    }
    set({
      track: null,
      isPlaying: false,
      positionSec: 0,
      _player: null,
      rate: 1.0,
    })
  },

  syncPosition: () => {
    const { _player } = get()
    if (!_player) return
    // expo-audio: el status tiene currentTime y duration
    try {
      const status = (_player as unknown as { currentTime: number; duration: number }).currentTime
      if (typeof status === 'number' && !Number.isNaN(status)) {
        set({ positionSec: status })
      }
    } catch {
      // ignore
    }
  },
}))
