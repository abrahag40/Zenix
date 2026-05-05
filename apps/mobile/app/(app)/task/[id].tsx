/**
 * TaskDetailScreen — pantalla de limpieza para el housekeeper.
 *
 * Estructura UX (justificada):
 *
 *   ┌─ ScreenHeader (← Mi día)  [📝 ⚠️ solo si activo] ─┐
 *   │  ScrollView                                         │
 *   │    TaskHero  (status + hab. + timer inline)         │
 *   │    Maintenance banner (si aplica)                   │
 *   │    Checkout notes (si hay)                          │
 *   │    CleaningChecklist (solo IN_PROGRESS/DONE)        │
 *   │    Housekeeper notes (si hay)                       │
 *   └─ ActionBar (PINNED, fuera del scroll) ─────────────┘
 *
 * Decisiones de diseño:
 *
 *   ActionBar SIEMPRE visible (Fitts 1954, Hoober 2013):
 *     El CTA nunca desaparece al hacer scroll. Zona natural del pulgar.
 *
 *   Progress strip en ActionBar (causal link UX):
 *     La barra de progreso vive EN la action bar, directamente encima del
 *     botón "Finalizar". El housekeeper ve: barra se llena → botón se activa.
 *     La correlación es espacial e inmediata sin necesidad de leer texto.
 *     Elimina el problema "no entendí que tenía que marcar todos los pasos"
 *     (Norman 1988 — Gulf of Evaluation cerrado por feedback continuo).
 *
 *   Tap-to-highlight cuando !canFinish (instructive feedback):
 *     Tocar "Finalizar" incompleto → scroll al checklist + flash amber en
 *     el primer ítem sin marcar. Causa → efecto percibido de inmediato.
 *     (Nielsen heurística #9: help users recover; Nielsen NNGroup 2020)
 *
 *   Timer integrado en TaskHero (Sweller 1988):
 *     Ahorra vertical real estate. El housekeeper no scrollea para el tiempo.
 *
 *   Nota + Incidencia en header rightSlot (Miller 7±2):
 *     Libera espacio en el cuerpo. Patrón iOS Navigation Bar.
 *
 *   Checklist NO colapsable — decisión definitiva:
 *     El checklist solo aparece post-start (progressive disclosure).
 *     Agregar un toggle add "¿lo muestro ahora?" (Hick 1952 — decisión innecesaria).
 *     Durante limpieza, el checklist ES la tarea. Nunca se colapsa.
 *
 *   useFocusEffect + scrollRef:
 *     Al volver via FocusBanner "Ver tarea", el screen vuelve al top.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useFocusEffect } from '@react-navigation/native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  interpolateColor,
} from 'react-native-reanimated'
import { ScreenHeader } from '../../../src/features/navigation/ScreenHeader'
import { TaskHero } from '../../../src/features/housekeeping/components/TaskHero'
import {
  CleaningChecklist,
  type CleaningChecklistRef,
} from '../../../src/features/housekeeping/components/CleaningChecklist'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTaskStore } from '../../../src/store/tasks'
import { api, ApiError } from '../../../src/api/client'
import type { CleaningTaskDto, CleaningNoteDto } from '@zenix/shared'
import { CleaningStatus, TaskType } from '@zenix/shared'
import { colors } from '../../../src/design/colors'
import { typography } from '../../../src/design/typography'
import { IconPencil, IconAlertTriangle, IconPause } from '../../../src/design/icons'

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { tasks, loading, startTask, pauseTask, resumeTask, endTask, fetchTasks } = useTaskStore()

  const task = tasks.find((t) => t.id === id)

  // If the store is empty (arrived via notification tap or deep link before the
  // Hub screen populated the store), fetch once so the task detail renders.
  useEffect(() => {
    if (!task && !loading) {
      fetchTasks()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const scrollRef = useRef<ScrollView>(null)
  const checklistRef = useRef<CleaningChecklistRef>(null)
  // Y-offset of the checklist card within the ScrollView — captured via onLayout
  const checklistLayoutY = useRef<number>(0)

  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false })
    }, []),
  )

  const [notes, setNotes] = useState<CleaningNoteDto[]>([])
  const [noteInput, setNoteInput] = useState('')
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [showIssueModal, setShowIssueModal] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  const [checklistProgress, setChecklistProgress] = useState<{
    completed: number
    total: number
    allDone: boolean
    snapshot: Array<{ id: string; label: string; completed: boolean }>
  }>({ completed: 0, total: 6, allDone: false, snapshot: [] })

  useEffect(() => {
    if (!id) return
    api.get<CleaningNoteDto[]>(`/tasks/${id}/notes`).then(setNotes).catch((err) => {
      if (__DEV__ && !(err instanceof ApiError && err.status === 404)) {
        console.warn('[task notes]', err instanceof Error ? err.message : String(err))
      }
    })
  }, [id])

  const isActiveTask =
    task?.status === CleaningStatus.IN_PROGRESS ||
    task?.status === CleaningStatus.PAUSED

  // Header actions — pure tinted SVG icons, no pill background.
  // Reference: Linear, Apple Mail toolbar, Notion. Background containers
  // around toolbar icons read as amateur (NN/g iconography studies 2018).
  // Color carries semantics: amber = advisory note, red = warning/issue.
  const headerRightSlot = isActiveTask ? (
    <View style={styles.headerActions}>
      <Pressable
        onPress={() => setShowNoteModal(true)}
        hitSlop={12}
        style={({ pressed }) => [styles.headerIconBtn, pressed && styles.headerIconBtnPressed]}
        accessibilityLabel="Agregar nota"
      >
        <IconPencil size={22} color="#FBBF24" />
      </Pressable>
      <Pressable
        onPress={() => setShowIssueModal(true)}
        hitSlop={12}
        style={({ pressed }) => [styles.headerIconBtn, pressed && styles.headerIconBtnPressed]}
        accessibilityLabel="Reportar problema"
      >
        <IconAlertTriangle size={22} color="#F87171" />
      </Pressable>
    </View>
  ) : undefined

  // Back navigation: when label says "Mi día" it MUST land in /trabajo
  // (the role-aware Hub), not whatever happened to be in the back stack.
  // router.back() is unreliable here because the user may have arrived from
  // the dashboard via the active-task banner — back would take them to the
  // dashboard instead of "Mi día". The label IS a promise of destination.
  const headerEl = (
    <ScreenHeader
      title={task?.unit?.room?.number ? `Hab. ${task.unit.room.number}` : 'Tarea'}
      backLabel="Mi día"
      onBack={() => router.replace('/(app)/trabajo')}
      rightSlot={headerRightSlot}
    />
  )

  if (!task) {
    return (
      <SafeAreaView style={styles.notFoundRoot} edges={['top']}>
        {headerEl}
        <View style={styles.notFoundCenter}>
          {loading ? (
            <>
              <ActivityIndicator size="large" color={colors.brand[500]} style={{ marginBottom: 16 }} />
              <Text style={styles.notFoundBody}>Cargando tarea…</Text>
            </>
          ) : (
            <>
              <Text style={styles.notFoundIcon}>🔍</Text>
              <Text style={styles.notFoundTitle}>Tarea no encontrada</Text>
              <Text style={styles.notFoundBody}>
                La tarea con id <Text style={styles.notFoundCode}>{id}</Text> no
                existe en tu lista o ya fue completada.
              </Text>
              <Pressable onPress={() => router.replace('/(app)/trabajo')} style={styles.notFoundBtn}>
                <Text style={styles.notFoundBtnText}>Volver a Mi día</Text>
              </Pressable>
            </>
          )}
        </View>
      </SafeAreaView>
    )
  }

  const isReady =
    task.status === CleaningStatus.READY ||
    task.status === CleaningStatus.PENDING ||
    task.status === CleaningStatus.UNASSIGNED
  const isInProgress = task.status === CleaningStatus.IN_PROGRESS
  const isPaused = task.status === CleaningStatus.PAUSED
  const isDone = task.status === CleaningStatus.DONE || task.status === CleaningStatus.VERIFIED
  const isMaintenance = task.taskType === TaskType.MAINTENANCE

  // ── Actions ───────────────────────────────────────────────────────────
  async function handleStart() {
    // Block starting a second task while another is IN_PROGRESS (D11 spirit).
    // The backend would also reject it, but catching it here with a clear message
    // is much better UX than a generic network error (CLAUDE.md §33).
    const activeElsewhere = tasks.find(
      (t) => t.id !== id && t.status === CleaningStatus.IN_PROGRESS,
    )
    if (activeElsewhere) {
      const roomNum = activeElsewhere.unit?.room?.number ?? '?'
      Alert.alert(
        'Tarea en curso',
        `Ya estás limpiando la Hab. ${roomNum}. Pausa esa tarea antes de iniciar otra.`,
        [{ text: 'Entendido', style: 'cancel' }],
      )
      return
    }
    setActionLoading(true)
    try { await startTask(id!) }
    catch (err) { Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo iniciar') }
    finally { setActionLoading(false) }
  }

  async function handlePause() {
    setActionLoading(true)
    try { await pauseTask(id!) }
    catch (err) { Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo pausar') }
    finally { setActionLoading(false) }
  }

  async function handleResume() {
    setActionLoading(true)
    try { await resumeTask(id!) }
    catch (err) { Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo reanudar') }
    finally { setActionLoading(false) }
  }

  async function handleEnd() {
    const msg = notes.length > 0
      ? `Has agregado ${notes.length} nota(s). ¿Confirmar habitación como limpia?`
      : '¿Confirmar habitación como limpia?'
    Alert.alert('Finalizar limpieza', msg, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar', onPress: doEnd },
    ])
  }

  async function doEnd() {
    setActionLoading(true)
    try {
      const startedMs = task?.startedAt ? new Date(task.startedAt).getTime() : null
      const elapsedMin = startedMs ? Math.max(1, Math.round((Date.now() - startedMs) / 60_000)) : null
      await endTask(id!, { checklist: checklistProgress.snapshot })
      // Refresh task list so the next available task appears when the user returns
      fetchTasks().catch(() => {})
      const summary = elapsedMin
        ? `Hab. ${task?.unit?.room?.number ?? ''} limpiada en ${elapsedMin} min`
        : 'Habitación marcada como limpia'
      Alert.alert('✅ Listo', summary, [{ text: 'Continuar', onPress: () => router.replace('/(app)/trabajo') }])
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo finalizar')
    } finally {
      setActionLoading(false)
    }
  }

  async function submitNote() {
    if (!noteInput.trim()) return
    try {
      const note = await api.post<CleaningNoteDto>(`/tasks/${id}/notes`, {
        content: noteInput.trim(),
      })
      setNotes((prev) => [...prev, note])
      setNoteInput('')
      setShowNoteModal(false)
    } catch {
      Alert.alert('Error', 'No se pudo guardar la nota')
    }
  }

  // Tap on disabled Finalizar: scroll checklist into view + flash first incomplete item.
  // The user immediately sees WHAT needs to be done (Norman — Gulf of Evaluation).
  function handleHighlightChecklist() {
    scrollRef.current?.scrollTo({ y: checklistLayoutY.current, animated: true })
    // Small delay so the scroll finishes before the flash draws attention
    setTimeout(() => {
      checklistRef.current?.highlightFirstIncomplete()
    }, 350)
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {headerEl}

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <TaskHero task={task} />

        {isMaintenance && (
          <View style={styles.maintenanceBanner}>
            <Text style={styles.maintenanceBannerTitle}>Tarea de mantenimiento</Text>
            <Text style={styles.maintenanceBannerText}>
              Esta habitación tiene un bloqueo activo. Realiza las tareas indicadas
              por el supervisor antes de marcar como completada.
            </Text>
          </View>
        )}

        {task.unit && <CheckoutNotes taskId={id!} />}

        {/* READY-state preview hint — sets expectations BEFORE the user
            commits to "Iniciar limpieza" so they know what's coming.
            This closes the gap from the previous bug: the user used to
            see no checklist at all in READY and had to tap Start to find
            out the scope. Now the count is visible up front, but the
            interactive checklist still only appears post-start (no false
            affordance). */}
        {!isMaintenance && isReady && (
          <View style={styles.readyHint}>
            <Text style={styles.readyHintLabel}>SIGUIENTE</Text>
            <Text style={styles.readyHintText}>
              Al iniciar verás la lista de pasos a completar.
            </Text>
          </View>
        )}

        {/* CleaningChecklist — SOLO durante IN_PROGRESS/PAUSED.
            Decisión deliberada: en READY no se muestra para evitar la
            "false affordance" (Norman 1988) — un checklist visible parece
            tappable; un checklist read-only confunde porque no responde al
            toque. La recamarista debe primero comprometerse con "Iniciar
            limpieza" → entonces aparece la lista interactiva.
            La animación de entrada (RevealOnMount) sigue el lenguaje
            SwiftUI/Apple Health: fade + slide-up + spring scale. */}
        {!isMaintenance && (isInProgress || isPaused) && (
          <ChecklistReveal
            onLayoutY={(y) => { checklistLayoutY.current = y }}
          >
            <CleaningChecklist
              ref={checklistRef}
              interactive={isInProgress || isPaused}
              onProgressChange={setChecklistProgress}
            />
          </ChecklistReveal>
        )}

        {/* PAUSED context — turns the dead space into ambient information.
            "Pausada hace X min" tells the housekeeper exactly what state
            the system is in, why nothing is moving, and how long they've
            been away. (Nielsen H1 — system status visibility.) */}
        {isPaused && task.startedAt && (
          <PausedContext startedAt={task.startedAt} />
        )}

        {/* DONE summary — converts the empty post-completion screen into
            celebration + day context. References: Strava workout summary,
            Apple Fitness ring closure, Headspace meditation completion,
            Duolingo lesson done. Empty space at end-of-flow is a missed
            opportunity for accomplishment messaging (Self-Determination
            Theory — competence reinforcement; CLAUDE.md §43). */}
        {isDone && (
          <DoneSummary task={task} allTasks={tasks} />
        )}

        {notes.length > 0 && <NotesList notes={notes} />}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* ── PINNED ACTION BAR ─────────────────────────────────────────────
          Siempre en la zona del pulgar. Progress strip crea el vínculo
          causal entre checklist y el botón Finalizar (Norman 1988).
          Plain View (no SafeAreaView edges={['bottom']}): el bottom inset
          ya lo gestiona el TabBar/FocusBanner del layout — añadirlo aquí
          duplicaría ~34pt en iPhones con Home Indicator. */}
      <View style={styles.actionBarSafe}>
        <ActionBar
          isReady={isReady}
          isInProgress={isInProgress}
          isPaused={isPaused}
          isDone={isDone}
          isMaintenance={isMaintenance}
          loading={actionLoading}
          canFinish={checklistProgress.allDone}
          completed={checklistProgress.completed}
          total={checklistProgress.total}
          onStart={handleStart}
          onPause={handlePause}
          onResume={handleResume}
          onEnd={handleEnd}
          onHighlightChecklist={handleHighlightChecklist}
        />
      </View>

      {/* Note modal */}
      <Modal
        visible={showNoteModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowNoteModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setShowNoteModal(false)}
          />
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Nota para recepción</Text>
            <TextInput
              style={styles.noteTextInput}
              placeholder="Ej: Falta jabón en el baño, toalla rota..."
              value={noteInput}
              onChangeText={setNoteInput}
              multiline
              numberOfLines={3}
              autoFocus
              placeholderTextColor={colors.text.tertiary}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => setShowNoteModal(false)}
                style={styles.modalBtnCancel}
              >
                <Text style={styles.modalBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submitNote} style={styles.modalBtnConfirm}>
                <Text style={styles.modalBtnConfirmText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Issue report — full-screen modal (professional redesign) */}
      <Modal
        visible={showIssueModal}
        animationType="slide"
        onRequestClose={() => setShowIssueModal(false)}
      >
        <IssueReportScreen taskId={id!} onClose={() => setShowIssueModal(false)} />
      </Modal>
    </SafeAreaView>
  )
}

// ── PausedContext ────────────────────────────────────────────────────────────
// Ambient status card: "Pausada hace X min". Fills the dead space between
// checklist and Reanudar button with information instead of nothing
// (Nielsen H1 — system status visibility, Pousman & Stasko 2006 ambient).
function PausedContext({ startedAt }: { startedAt: string }) {
  const [elapsedMin, setElapsedMin] = useState(() =>
    Math.max(1, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60_000)),
  )
  useEffect(() => {
    const id = setInterval(() => {
      setElapsedMin(Math.max(1, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60_000)))
    }, 30_000)
    return () => clearInterval(id)
  }, [startedAt])

  return (
    <View style={styles.pausedContext}>
      <View style={styles.pausedDot} />
      <View style={styles.pausedCol}>
        <Text style={styles.pausedTitle}>Limpieza en pausa</Text>
        <Text style={styles.pausedBody}>
          Toca <Text style={styles.pausedBodyEm}>Reanudar</Text> cuando estés
          listo para continuar. Tu progreso se guarda.
        </Text>
      </View>
    </View>
  )
}

// ── DoneSummary ──────────────────────────────────────────────────────────────
// Post-completion celebration + day context. References: Strava workout
// summary, Apple Fitness ring closure, Headspace meditation completion.
// Three pieces of value-dense information replace the prior empty space:
//   1. Tiempo invertido (big number) — accomplishment metric
//   2. "Tarea X de Y hoy" — progress through the day (autonomy + competence)
//   3. Optional CTA "Siguiente: Hab. Z" — proactive routing
function DoneSummary({
  task,
  allTasks,
}: {
  task: CleaningTaskDto
  allTasks: CleaningTaskDto[]
}) {
  const router = useRouter()

  // Time taken — derived from startedAt → finishedAt. Both should exist on DONE.
  const elapsedMin = (() => {
    const start = task.startedAt ? new Date(task.startedAt).getTime() : null
    const end = task.finishedAt ? new Date(task.finishedAt).getTime() : Date.now()
    if (!start) return null
    return Math.max(1, Math.round((end - start) / 60_000))
  })()

  // Day progress — count today's done vs total assigned to me.
  const today = new Date().toDateString()
  const todayTasks = allTasks.filter((t) => {
    const created = new Date(t.createdAt ?? Date.now()).toDateString()
    return created === today
  })
  const doneCount = todayTasks.filter(
    (t) => t.status === CleaningStatus.DONE || t.status === CleaningStatus.VERIFIED,
  ).length
  const totalCount = todayTasks.length

  // Next task — first READY/UNASSIGNED/PENDING task that's not this one.
  const nextTask = allTasks.find(
    (t) =>
      t.id !== task.id &&
      (t.status === CleaningStatus.READY ||
        t.status === CleaningStatus.UNASSIGNED ||
        t.status === CleaningStatus.PENDING),
  )

  return (
    <View style={styles.doneSummary}>
      {/* Hero stat — time invested */}
      {elapsedMin !== null && (
        <View style={styles.doneStatBlock}>
          <Text style={styles.doneStatValue}>{elapsedMin}</Text>
          <Text style={styles.doneStatUnit}>min</Text>
        </View>
      )}
      <Text style={styles.doneStatCaption}>Tiempo invertido en esta habitación</Text>

      {/* Day progress */}
      {totalCount > 0 && (
        <View style={styles.doneProgressRow}>
          <View style={styles.doneProgressLeft}>
            <Text style={styles.doneProgressLabel}>HOY</Text>
            <Text style={styles.doneProgressValue}>
              {doneCount} de {totalCount} habitaciones
            </Text>
          </View>
          <View style={styles.doneProgressDots}>
            {todayTasks.slice(0, 12).map((t, i) => (
              <View
                key={`d-${i}`}
                style={[
                  styles.doneProgressDot,
                  (t.status === CleaningStatus.DONE || t.status === CleaningStatus.VERIFIED) &&
                    styles.doneProgressDotDone,
                ]}
              />
            ))}
          </View>
        </View>
      )}

      {/* Next task CTA — proactive routing keeps flow moving (Csikszentmihalyi) */}
      {nextTask && (
        <Pressable
          onPress={() => router.replace(`/(app)/task/${nextTask.id}`)}
          style={({ pressed }) => [styles.doneNextBtn, pressed && styles.btnPressed]}
        >
          <View style={styles.doneNextLeft}>
            <Text style={styles.doneNextLabel}>SIGUIENTE</Text>
            <Text style={styles.doneNextRoom}>
              Hab. {nextTask.unit?.room?.number ?? '—'}
            </Text>
          </View>
          <Text style={styles.doneNextArrow}>→</Text>
        </Pressable>
      )}
    </View>
  )
}

// ── ChecklistReveal ──────────────────────────────────────────────────────────
// Entrada estilo SwiftUI/Apple Health: opacity 0→1, translateY 16→0,
// scale 0.96→1. Spring ligeramente over-damped (sin overshoot — Apple HIG
// "Motion that distracts is worse than no motion"). Duración percibida
// ~380ms — encima del umbral consciente, debajo del "lento".
//
// Reanimated worklets evitan jank en el JS thread. La sub-vista mide su
// propio Y para que onLayoutY siga funcionando para handleHighlightChecklist.
function ChecklistReveal({
  children,
  onLayoutY,
}: {
  children: React.ReactNode
  onLayoutY: (y: number) => void
}) {
  const opacity = useSharedValue(0)
  const translateY = useSharedValue(16)
  const scale = useSharedValue(0.96)

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 380 })
    translateY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.9 })
    scale.value = withSpring(1, { damping: 22, stiffness: 240, mass: 0.9 })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }))

  return (
    <Animated.View
      style={animStyle}
      onLayout={(e) => onLayoutY(e.nativeEvent.layout.y)}
    >
      {children}
    </Animated.View>
  )
}

// ── ActionBar ─────────────────────────────────────────────────────────────────

interface ActionBarProps {
  isReady: boolean
  isInProgress: boolean
  isPaused: boolean
  isDone: boolean
  isMaintenance: boolean
  loading: boolean
  canFinish: boolean
  completed: number
  total: number
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onEnd: () => void
  onHighlightChecklist: () => void
}

function ActionBar({
  isReady, isInProgress, isPaused, isDone, isMaintenance,
  loading, canFinish, completed, total,
  onStart, onPause, onResume, onEnd, onHighlightChecklist,
}: ActionBarProps) {
  // Animate Finalizar button background: dark → emerald when checklist completes.
  // The visual unlock is the primary signal — no text change needed.
  const btnProgress = useSharedValue(canFinish ? 1 : 0)
  const btnScale = useSharedValue(1)
  const prevCanFinish = useRef(canFinish)

  useEffect(() => {
    if (canFinish && !prevCanFinish.current) {
      btnProgress.value = withTiming(1, { duration: 280 })
      btnScale.value = withSequence(
        withTiming(0.94, { duration: 80 }),
        withSpring(1, { damping: 8, stiffness: 220 }),
      )
    } else if (!canFinish) {
      btnProgress.value = withTiming(0, { duration: 180 })
    }
    prevCanFinish.current = canFinish
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canFinish])

  const finishBtnAnimStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      btnProgress.value,
      [0, 1],
      ['rgba(255,255,255,0.04)', colors.brand[500]],
    ),
    borderWidth: interpolateColor(
      btnProgress.value,
      [0, 1],
      ['rgba(255,255,255,0.08)', 'transparent'],
    ) as unknown as number,
    transform: [{ scale: btnScale.value }],
  }))

  if (isDone) {
    return (
      <View style={styles.actionBar}>
        <View style={[styles.actionBtnFull, styles.doneBannerBtn]}>
          <Text style={styles.doneBannerText}>✓ Limpieza completada</Text>
        </View>
      </View>
    )
  }

  if (isReady || isMaintenance) {
    return (
      <View style={styles.actionBar}>
        <Pressable
          onPress={onStart}
          disabled={loading}
          style={({ pressed }) => [
            styles.actionBtnFull,
            styles.primaryBtn,
            pressed && styles.btnPressed,
            loading && styles.btnDisabled,
          ]}
        >
          {loading
            ? <ActivityIndicator color="#FFFFFF" />
            : <Text style={styles.primaryBtnText}>Iniciar limpieza</Text>
          }
        </Pressable>
      </View>
    )
  }

  if (isPaused) {
    return (
      <View style={styles.actionBar}>
        <Pressable
          onPress={onResume}
          disabled={loading}
          style={({ pressed }) => [
            styles.actionBtnFull,
            styles.primaryBtn,
            pressed && styles.btnPressed,
            loading && styles.btnDisabled,
          ]}
        >
          {loading
            ? <ActivityIndicator color="#FFFFFF" />
            : <Text style={styles.primaryBtnText}>Reanudar limpieza</Text>
          }
        </Pressable>
      </View>
    )
  }

  if (isInProgress) {
    const pct = total > 0 ? (completed / total) * 100 : 0

    return (
      <View>
        {/* Progress strip — vínculo causal directo con el checklist arriba.
            Se llena conforme el housekeeper marca ítems. Al llegar a 100%
            desaparece y el botón Finalizar se activa con animación.
            Referencia de patrón: Things 3, Streaks, Linear progress gates. */}
        {!canFinish && (
          <View style={styles.progressStripContainer}>
            <View style={styles.progressStripTrack}>
              <View style={[styles.progressStripFill, { width: `${pct}%` as `${number}%` }]} />
            </View>
            <Text style={styles.progressStripLabel}>
              {completed} de {total} pasos
            </Text>
          </View>
        )}

        {/* Asymmetric layout — Pausar es secundaria (icon-button circular ~52pt),
            Finalizar es la acción meta (full-width, peso visual dominante).
            Patrón: Strava (record activity), Spotify Now Playing, Apple Voice
            Memos, Apple Fitness Workout. La meta operativa siempre debe ser
            el botón más grande; las acciones de utilidad/safety son chips. */}
        <View style={styles.actionBar}>
          <Pressable
            onPress={onPause}
            disabled={loading}
            hitSlop={6}
            style={({ pressed }) => [
              styles.pauseIconBtn,
              pressed && styles.btnPressed,
            ]}
            accessibilityLabel="Pausar limpieza"
          >
            <IconPause size={18} color={colors.text.secondary} />
          </Pressable>

          <Animated.View style={[styles.actionBtnFinishWrap, styles.finishBtnBase, finishBtnAnimStyle]}>
            <Pressable
              onPress={canFinish ? onEnd : onHighlightChecklist}
              disabled={loading}
              style={({ pressed }) => [
                styles.actionBtnFill,
                pressed && styles.btnPressed,
              ]}
            >
              {loading
                ? <ActivityIndicator color={canFinish ? '#FFFFFF' : colors.text.tertiary} />
                : <Text style={[styles.primaryBtnText, !canFinish && styles.disabledBtnText]}>
                    Finalizar
                  </Text>
              }
            </Pressable>
          </Animated.View>
        </View>
      </View>
    )
  }

  return null
}

// ── CheckoutNotes ─────────────────────────────────────────────────────────────

function CheckoutNotes({ taskId }: { taskId: string }) {
  const [checkoutNote, setCheckoutNote] = useState<string | null>(null)

  useEffect(() => {
    api.get<CleaningTaskDto>(`/tasks/${taskId}`)
      .then((t) => {
        const note = (t as unknown as { checkoutNotes?: string }).checkoutNotes
        if (note) setCheckoutNote(note)
      })
      .catch(() => {})
  }, [taskId])

  if (!checkoutNote) return null

  return (
    <View style={styles.checkoutNote}>
      <Text style={styles.checkoutNoteLabel}>NOTA DE RECEPCIÓN</Text>
      <Text style={styles.checkoutNoteText}>{checkoutNote}</Text>
    </View>
  )
}

// ── NotesList ─────────────────────────────────────────────────────────────────
//
// Diseño referenciado en: Linear (comments), Notion (page comments), GitHub
// Mobile (review comments). Principios aplicados:
//   - Card container con header label + count badge → jerarquía clara.
//   - Número de nota como anchor visual (Gestalt ordenamiento).
//   - Timestamp relativo → información contextual sin ruido.
//   - Amber/warm palette: las notas son información para acción de recepción
//     (advisory), no elementos completados (emerald) ni errores (red).

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'Ahora'
  if (min < 60) return `Hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `Hace ${h}h`
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

function NotesList({ notes }: { notes: CleaningNoteDto[] }) {
  return (
    <View style={styles.notesCard}>
      {/* Header */}
      <View style={styles.notesHeader}>
        <Text style={styles.notesHeaderLabel}>NOTAS PARA RECEPCIÓN</Text>
        <View style={styles.notesBadge}>
          <Text style={styles.notesBadgeText}>{notes.length}</Text>
        </View>
      </View>

      {/* Rows */}
      {notes.map((note, index) => (
        <View
          key={note.id}
          style={[styles.noteRow, index > 0 && styles.noteRowDivider]}
        >
          {/* Index indicator */}
          <View style={styles.noteIndexBadge}>
            <Text style={styles.noteIndexText}>{index + 1}</Text>
          </View>

          {/* Content */}
          <View style={styles.noteBody}>
            <Text style={styles.noteContent}>{note.content}</Text>
            <View style={styles.noteMeta}>
              {note.staff?.name && (
                <Text style={styles.noteMetaText}>{note.staff.name}</Text>
              )}
              {note.staff?.name && (
                <Text style={styles.noteMetaDot}>·</Text>
              )}
              <Text style={styles.noteMetaText}>{formatRelativeTime(note.createdAt)}</Text>
            </View>
          </View>
        </View>
      ))}
    </View>
  )
}

// ── IssueReportScreen ─────────────────────────────────────────────────────────
//
// Diseño referenciado en: Apple Mail compose, Twitter/X compose, Apple Notes,
// Linear (lista grouped). Patrón iOS estándar para modales de captura de texto.
//
// Decisiones de rediseño (sesión actual):
//   1. SUBMIT EN NAV BAR TOP-RIGHT (Apple Mail/Twitter pattern).
//      Eliminamos el footer fijo. La acción primaria vive arriba a la derecha,
//      lo que (a) elimina el gap entre input y botón cuando aparece el teclado,
//      (b) sigue el estándar iOS para todo modal de "compose", (c) deja la
//      pantalla 100% al contenido. El usuario nunca pierde acceso al CTA porque
//      el nav bar siempre está visible.
//   2. Cancelar a la izquierda, Enviar a la derecha — simetría iOS clásica.
//   3. Pill chips → lista de filas con icono + label + dot selector (Linear).
//   4. Brand emerald para submit — reportar NO es destructivo (CLAUDE.md §13).

const CATEGORIES = [
  { id: 'PLUMBING',   label: 'Plomería',   icon: '🔧' },
  { id: 'ELECTRICAL', label: 'Eléctrico',  icon: '⚡' },
  { id: 'FURNITURE',  label: 'Mobiliario', icon: '🪑' },
  { id: 'PEST',       label: 'Plagas',     icon: '🐛' },
  { id: 'OTHER',      label: 'Otro',       icon: '·'  },
] as const

type CategoryId = (typeof CATEGORIES)[number]['id']

function IssueReportScreen({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  // useSafeAreaInsets instead of SafeAreaView because SafeAreaView inside a
  // Modal does not compute insets correctly on all iOS devices — the nav bar
  // ends up behind the OS clock/status bar (Expo Router + Modal interaction).
  const insets = useSafeAreaInsets()
  const scrollRef = useRef<ScrollView>(null)
  const descLayoutY = useRef<number>(0)

  const [category, setCategory] = useState<CategoryId>('OTHER')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const canSubmit = description.trim().length > 0 && !loading

  async function handleSubmit() {
    if (!canSubmit) return
    setLoading(true)
    try {
      await api.post(`/tasks/${taskId}/issues`, { category, description: description.trim() })
      Alert.alert('Problema reportado', 'El supervisor recibirá el aviso de inmediato.')
      onClose()
    } catch {
      Alert.alert('Error', 'No se pudo enviar el reporte. Inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={[styles.issueRoot, { paddingTop: insets.top }]}>

      {/* Nav bar — Apple Mail / Twitter compose pattern.
          Cancelar (left) · Title (center) · Enviar (right).
          Submit lives here — never obscured by keyboard, no awkward footer gap. */}
      <View style={styles.issueNavBar}>
        <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.issueNavSide}>
          <Text style={styles.issueNavCancelText}>Cancelar</Text>
        </TouchableOpacity>
        <Text style={styles.issueNavTitle}>Reportar problema</Text>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!canSubmit}
          hitSlop={12}
          style={[styles.issueNavSide, styles.issueNavSubmit]}
        >
          {loading ? (
            <ActivityIndicator color={colors.brand[400]} size="small" />
          ) : (
            <Text style={[styles.issueNavSubmitText, !canSubmit && styles.issueNavSubmitTextDisabled]}>
              Enviar
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
          ref={scrollRef}
          style={styles.issueScroll}
          contentContainerStyle={styles.issueContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets={true}
        >
          {/* Intro — sets expectations before the form (Norman action cycle) */}
          <View style={styles.issueIntro}>
            <Text style={styles.issueIntroTitle}>¿Qué encontraste?</Text>
            <Text style={styles.issueIntroSub}>
              El supervisor recibirá el aviso de inmediato.
            </Text>
          </View>

          {/* Category — list rows (Linear / GitHub Mobile pattern) */}
          <Text style={styles.issueFieldLabel}>CATEGORÍA</Text>
          <View style={styles.issueCategoryCard}>
            {CATEGORIES.map((cat, index) => {
              const isSelected = category === cat.id
              const isLast = index === CATEGORIES.length - 1
              return (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() => setCategory(cat.id)}
                  style={[
                    styles.issueCatRow,
                    !isLast && styles.issueCatRowDivider,
                  ]}
                  activeOpacity={0.6}
                >
                  <Text style={styles.issueCatIcon}>{cat.icon}</Text>
                  <Text style={[styles.issueCatLabel, isSelected && styles.issueCatLabelSelected]}>
                    {cat.label}
                  </Text>
                  <View style={[styles.issueCatDot, isSelected && styles.issueCatDotSelected]}>
                    {isSelected && <View style={styles.issueCatDotCore} />}
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>

          <Text style={[styles.issueFieldLabel, styles.issueFieldLabelSpaced]}>DESCRIPCIÓN</Text>
          <TextInput
            style={styles.issueDescInput}
            placeholder="Describe el problema con detalle..."
            placeholderTextColor={colors.text.tertiary}
            value={description}
            onChangeText={setDescription}
            multiline
            textAlignVertical="top"
            autoCorrect={false}
            onLayout={(e) => { descLayoutY.current = e.nativeEvent.layout.y }}
            onFocus={() => {
              setTimeout(() => {
                const targetY = Math.max(0, descLayoutY.current - 24)
                scrollRef.current?.scrollTo({ y: targetY, animated: true })
              }, 150)
            }}
          />
        </ScrollView>
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas.primary,
  },
  scroll: {
    flex: 1,
  },
  // 16px horizontal + 16px vertical padding = 2× 8pt grid unit.
  // gap: 14 between cards = 1.75× base — enough vertical breathing without excess.
  scrollContent: {
    padding: 16,
    gap: 14,
  },

  // ── Header rightSlot — clean tinted icons (Linear/Apple Mail pattern)
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  headerIconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconBtnPressed: {
    opacity: 0.55,
  },

  // ── Not-found
  notFoundRoot: { flex: 1, backgroundColor: colors.canvas.primary },
  notFoundCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  notFoundIcon: { fontSize: 48, marginBottom: 8 },
  notFoundTitle: {
    fontSize: typography.size.titleLg,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    textAlign: 'center',
  },
  notFoundBody: {
    fontSize: typography.size.body,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: typography.size.body * typography.lineHeight.relaxed,
    maxWidth: 300,
    marginBottom: 16,
  },
  notFoundCode: {
    fontFamily: typography.family.monospace,
    color: colors.text.tertiary,
    fontSize: typography.size.small,
  },
  notFoundBtn: {
    backgroundColor: colors.brand[500],
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  notFoundBtnText: {
    color: colors.text.inverse,
    fontSize: typography.size.bodyLg,
    fontWeight: typography.weight.semibold,
  },

  // ── PausedContext (ambient status — fills space with information)
  pausedContext: {
    flexDirection: 'row',
    backgroundColor: 'rgba(251,191,36,0.06)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.20)',
    gap: 12,
    alignItems: 'flex-start',
  },
  pausedDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FBBF24',
    marginTop: 4,
  },
  pausedCol: {
    flex: 1,
    gap: 4,
  },
  pausedTitle: {
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
    color: '#FBBF24',
  },
  pausedBody: {
    fontSize: typography.size.small,
    color: colors.text.secondary,
    lineHeight: typography.size.small * 1.45,
  },
  pausedBodyEm: {
    color: colors.text.primary,
    fontWeight: typography.weight.semibold,
  },

  // ── DoneSummary (Strava workout / Apple Fitness ring closure pattern)
  doneSummary: {
    backgroundColor: colors.canvas.secondary,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.20)',
    gap: 18,
    alignItems: 'center',
  },
  doneStatBlock: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  doneStatValue: {
    fontSize: 56,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    letterSpacing: -1,
    lineHeight: 60,
  },
  doneStatUnit: {
    fontSize: typography.size.bodyLg,
    color: colors.text.secondary,
    fontWeight: typography.weight.medium,
  },
  doneStatCaption: {
    fontSize: typography.size.small,
    color: colors.text.tertiary,
    textAlign: 'center',
    marginTop: -10,
  },
  doneProgressRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.subtle,
    gap: 12,
  },
  doneProgressLeft: {
    gap: 2,
  },
  doneProgressLabel: {
    fontSize: 10,
    fontWeight: typography.weight.bold,
    color: colors.text.tertiary,
    letterSpacing: 0.8,
  },
  doneProgressValue: {
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
  },
  doneProgressDots: {
    flexDirection: 'row',
    gap: 4,
    flexShrink: 1,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    maxWidth: 140,
  },
  doneProgressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  doneProgressDotDone: {
    backgroundColor: '#34D399',
  },
  doneNextBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.brand[500],
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  doneNextLeft: {
    gap: 2,
  },
  doneNextLabel: {
    fontSize: 10,
    fontWeight: typography.weight.bold,
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 0.8,
  },
  doneNextRoom: {
    fontSize: typography.size.bodyLg,
    fontWeight: typography.weight.bold,
    color: '#FFFFFF',
  },
  doneNextArrow: {
    fontSize: 22,
    color: '#FFFFFF',
    fontWeight: typography.weight.semibold,
  },

  // ── Ready-state hint (preview of what's coming after Start)
  readyHint: {
    backgroundColor: 'rgba(16,185,129,0.06)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.18)',
    gap: 4,
  },
  readyHintLabel: {
    fontSize: 10,
    fontWeight: typography.weight.bold,
    color: colors.brand[400],
    letterSpacing: 0.8,
  },
  readyHintText: {
    fontSize: typography.size.small,
    color: colors.text.secondary,
    lineHeight: typography.size.small * 1.4,
  },

  // ── Maintenance banner
  maintenanceBanner: {
    backgroundColor: colors.warning[50],
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.warning[400],
  },
  maintenanceBannerTitle: {
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
    color: colors.warning[600],
    marginBottom: 4,
  },
  maintenanceBannerText: {
    fontSize: typography.size.small,
    color: colors.warning[600],
    lineHeight: typography.size.small * typography.lineHeight.relaxed,
  },

  // ── Checkout note
  checkoutNote: {
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.25)',
  },
  checkoutNoteLabel: {
    fontSize: 10,
    fontWeight: typography.weight.bold,
    color: colors.warning[400],
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  checkoutNoteText: {
    fontSize: typography.size.small,
    color: colors.warning[400],
  },

  // ── NotesList
  notesCard: {
    backgroundColor: colors.canvas.secondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.20)',
    overflow: 'hidden',
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(251,191,36,0.12)',
  },
  notesHeaderLabel: {
    fontSize: 10,
    fontWeight: typography.weight.bold,
    color: '#FBBF24',
    letterSpacing: 0.8,
  },
  notesBadge: {
    backgroundColor: 'rgba(251,191,36,0.15)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.30)',
  },
  notesBadgeText: {
    fontSize: 11,
    fontWeight: typography.weight.bold,
    color: '#FBBF24',
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  noteRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(251,191,36,0.10)',
  },
  noteIndexBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  noteIndexText: {
    fontSize: 11,
    fontWeight: typography.weight.bold,
    color: '#FBBF24',
  },
  noteBody: {
    flex: 1,
    gap: 5,
  },
  noteContent: {
    fontSize: typography.size.small,
    color: colors.text.primary,
    lineHeight: typography.size.small * 1.5,
    fontWeight: typography.weight.medium,
  },
  noteMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  noteMetaText: {
    fontSize: 11,
    color: colors.text.tertiary,
  },
  noteMetaDot: {
    fontSize: 11,
    color: colors.text.tertiary,
  },

  // ── Pinned action bar
  actionBarSafe: {
    backgroundColor: colors.canvas.primary,
    borderTopWidth: 1,
    borderTopColor: colors.border.default,
  },
  // ActionBar — tight vertical rhythm.
  // Reference: Things 3, Apple Reminders, Linear. Action bars hug content;
  // the safe-area inset already provides bottom breathing room on devices
  // with home indicator (~34pt). Adding more vertical padding wastes the
  // most valuable real estate (Sweller 1988, Hoober 2013 — thumb zone).
  actionBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },

  // Progress strip — shown between safe-area border and buttons when !canFinish.
  // Tight: 3px bar + 6px top padding = visually lightweight, doesn't bloat.
  progressStripContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 4,
  },
  progressStripTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  progressStripFill: {
    height: '100%',
    backgroundColor: colors.brand[400],
    borderRadius: 2,
  },
  progressStripLabel: {
    fontSize: 11,
    color: colors.text.tertiary,
    textAlign: 'right',
    letterSpacing: 0.2,
  },

  // Buttons: 14pt vertical padding × ~22pt line-height = 50pt height.
  // Exceeds Apple HIG 44pt min target, fits Things 3 / Linear visual weight.
  actionBtnFull: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnHalf: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  actionBtnFill: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Asymmetric IN_PROGRESS layout:
  //   - Pause: 52×52 circular icon-button (utility action)
  //   - Finalize: flex:1 (the GOAL — dominant weight)
  // Visual ratio ~1:5 in favor of Finalize. References: Strava, Spotify,
  // Apple Voice Memos, Apple Fitness — the completing action always carries
  // the most visual weight in active-session UIs.
  pauseIconBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1.5,
    borderColor: colors.border.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnFinishWrap: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  finishBtnBase: {
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  primaryBtn: {
    backgroundColor: colors.brand[500],
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
  },
  secondaryBtn: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1.5,
    borderColor: colors.border.default,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: colors.text.secondary,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
  },
  disabledBtnText: {
    color: colors.text.tertiary,
    fontSize: typography.size.body,
    fontWeight: typography.weight.medium,
  },
  btnPressed: { opacity: 0.72 },
  btnDisabled: { opacity: 0.45 },
  doneBannerBtn: {
    backgroundColor: 'rgba(167,139,250,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.30)',
  },
  doneBannerText: {
    color: '#A78BFA',
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
  },

  // ── Note modal (bottom sheet)
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: colors.canvas.secondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    borderTopWidth: 1,
    borderColor: colors.border.default,
  },
  modalTitle: {
    fontSize: typography.size.bodyLg,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    marginBottom: 16,
  },
  noteTextInput: {
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 12,
    padding: 14,
    fontSize: typography.size.body,
    color: colors.text.primary,
    backgroundColor: colors.canvas.tertiary,
    textAlignVertical: 'top',
    minHeight: 88,
    marginBottom: 16,
  },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalBtnCancel: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  modalBtnCancelText: {
    color: colors.text.secondary,
    fontWeight: typography.weight.semibold,
    fontSize: typography.size.body,
  },
  modalBtnConfirm: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: colors.brand[500],
  },
  modalBtnConfirmText: {
    color: '#FFFFFF',
    fontWeight: typography.weight.bold,
    fontSize: typography.size.body,
  },

  // ── IssueReportScreen ─────────────────────────────────────────────────
  // Plain View — paddingTop injected via useSafeAreaInsets() so this renders
  // correctly inside a Modal on all iOS versions (SafeAreaView inside Modal
  // miscalculates insets on some devices).
  issueRoot: {
    flex: 1,
    backgroundColor: colors.canvas.primary,
  },
  // Navigation bar — mirrors iOS standard nav bar metrics (44pt height, HIG 2024)
  issueNavBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.default,
  },
  // Side slots — equal width = title stays perfectly centered (Apple HIG)
  issueNavSide: {
    width: 80,
    minHeight: 36,
    justifyContent: 'center',
  },
  issueNavSubmit: {
    alignItems: 'flex-end',
  },
  issueNavCancelText: {
    fontSize: typography.size.body,
    color: colors.text.secondary,
    fontWeight: typography.weight.medium,
  },
  issueNavSubmitText: {
    fontSize: typography.size.body,
    color: colors.brand[400],
    fontWeight: typography.weight.semibold,
    textAlign: 'right',
  },
  issueNavSubmitTextDisabled: {
    color: colors.text.tertiary,
  },
  issueNavTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: typography.size.bodyLg,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
  },
  issueScroll: {
    flex: 1,
  },
  issueContent: {
    padding: 20,
    paddingBottom: 32,
  },
  issueIntro: {
    marginBottom: 28,
    gap: 4,
  },
  issueIntroTitle: {
    fontSize: typography.size.titleLg,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
  },
  issueIntroSub: {
    fontSize: typography.size.small,
    color: colors.text.tertiary,
    lineHeight: typography.size.small * 1.5,
  },
  // Field labels: 10px, bold, spaced — iOS Settings section header pattern
  issueFieldLabel: {
    fontSize: 10,
    fontWeight: typography.weight.bold,
    color: colors.text.tertiary,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  issueFieldLabelSpaced: {
    marginTop: 24,
  },
  // Category card: grouped list with card container + hairline dividers.
  // Pattern: Linear issue type selector, iOS Settings grouped list.
  issueCategoryCard: {
    backgroundColor: colors.canvas.secondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    overflow: 'hidden',
  },
  issueCatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // paddingVertical 13 + 24px radio dot = ~50pt touch target (exceeds 44pt)
    paddingVertical: 13,
    paddingHorizontal: 16,
    gap: 12,
  },
  issueCatRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
  },
  issueCatIcon: {
    fontSize: 17,
    width: 22,
    textAlign: 'center',
  },
  issueCatLabel: {
    flex: 1,
    fontSize: typography.size.body,
    color: colors.text.secondary,
    fontWeight: typography.weight.medium,
  },
  issueCatLabelSelected: {
    color: colors.text.primary,
    fontWeight: typography.weight.semibold,
  },
  // Radio indicator — 20px outer, emerald fill when selected
  issueCatDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  issueCatDotSelected: {
    borderColor: colors.brand[500],
    backgroundColor: 'rgba(16,185,129,0.12)',
  },
  issueCatDotCore: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: colors.brand[500],
  },
  issueDescInput: {
    backgroundColor: colors.canvas.secondary,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 12,
    padding: 14,
    fontSize: typography.size.body,
    color: colors.text.primary,
    minHeight: 140,
  },
})
