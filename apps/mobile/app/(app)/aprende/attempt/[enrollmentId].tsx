/**
 * Aprende/attempt/[enrollmentId] — examen final full-screen mobile.
 *
 * Decisión §152 (reservada): NO modal, sí route full-screen.
 * Anti-pattern modales mobile (Smashing Magazine + NN/g).
 *
 * Flow:
 *   1. Phase intro → warning + "Iniciar examen" CTA
 *   2. start attempt → server retorna questions (sin correctMapped)
 *   3. Phase in_progress → 1 pregunta por screen, navigation prev/next
 *   4. Submit → server scoring → phase result
 *   5. PASSED: certificate notification, hasta /aprende. FAILED: retake.
 */
import { useState } from 'react'
import { useRouter, useLocalSearchParams } from 'expo-router'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { colors } from '../../../../src/design/colors'
import { typography } from '../../../../src/design/typography'
import {
  learningApi,
  type AttemptStarted,
  type AttemptResult,
} from '../../../../src/features/learning/api/learning.api'
import { useMyEnrollments } from '../../../../src/features/learning/hooks/useLearning'

type Phase = 'intro' | 'in_progress' | 'submitting' | 'result'

export default function AttemptScreen() {
  const { enrollmentId } = useLocalSearchParams<{ enrollmentId: string }>()
  const router = useRouter()
  const qc = useQueryClient()
  const { data: enrollments } = useMyEnrollments()
  const enrollment = enrollments?.find((e) => e.id === enrollmentId)

  const [phase, setPhase] = useState<Phase>('intro')
  const [attempt, setAttempt] = useState<AttemptStarted | null>(null)
  const [answers, setAnswers] = useState<Map<string, number>>(new Map())
  const [currentIdx, setCurrentIdx] = useState(0)
  const [result, setResult] = useState<AttemptResult | null>(null)

  const startMut = useMutation({
    mutationFn: () => learningApi.startAttempt({ enrollmentId: enrollmentId ?? '' }),
    onSuccess: (data) => {
      setAttempt(data)
      setPhase('in_progress')
    },
    onError: (err: Error) => {
      Alert.alert('No se pudo iniciar', err.message)
    },
  })

  const submitMut = useMutation({
    mutationFn: () => {
      if (!attempt) throw new Error('No attempt to submit')
      const payload = Array.from(answers.entries()).map(([qid, idx]) => ({
        questionId: qid,
        selectedOptionIdx: idx,
      }))
      return learningApi.submitAttempt(attempt.attemptId, payload)
    },
    onMutate: () => setPhase('submitting'),
    onSuccess: async (data) => {
      setResult(data)
      setPhase('result')
      if (data.passed) {
        await qc.invalidateQueries({ queryKey: ['learning-enrollments'] })
        await qc.invalidateQueries({ queryKey: ['learning-dashboard'] })
      }
    },
    onError: (err: Error) => {
      Alert.alert('Error al enviar', err.message)
      setPhase('in_progress')
    },
  })

  const handleExit = () => {
    if (phase === 'in_progress') {
      Alert.alert(
        '¿Salir del examen?',
        'Si sales ahora pierdes este intento. ¿Confirmas?',
        [
          { text: 'No, seguir', style: 'cancel' },
          { text: 'Sí, salir', style: 'destructive', onPress: () => router.back() },
        ],
      )
    } else {
      router.back()
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={handleExit} hitSlop={12}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title}>Examen final</Text>
        <View style={{ width: 24 }} />
      </View>

      {!enrollment && (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brand[500]} />
        </View>
      )}

      {enrollment && phase === 'intro' && (
        <IntroPhase
          onStart={() => startMut.mutate()}
          isPending={startMut.isPending}
        />
      )}

      {enrollment && phase === 'in_progress' && attempt && (
        <InProgressPhase
          attempt={attempt}
          currentIdx={currentIdx}
          answers={answers}
          onSelect={(qid, idx) =>
            setAnswers((prev) => new Map(prev).set(qid, idx))
          }
          onNext={() =>
            setCurrentIdx((i) => Math.min(i + 1, attempt.questionsTotal - 1))
          }
          onPrev={() => setCurrentIdx((i) => Math.max(i - 1, 0))}
          onSubmit={() => submitMut.mutate()}
        />
      )}

      {phase === 'submitting' && (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brand[500]} />
          <Text style={styles.loadingText}>Calificando…</Text>
        </View>
      )}

      {phase === 'result' && result && (
        <ResultPhase
          result={result}
          onClose={() => router.replace('/(app)/aprende')}
        />
      )}
    </SafeAreaView>
  )
}

// ─── Phases ────────────────────────────────────────────────────────────────

function IntroPhase({ onStart, isPending }: { onStart: () => void; isPending: boolean }) {
  return (
    <ScrollView contentContainerStyle={styles.phaseContent}>
      <View style={styles.warningBox}>
        <Text style={styles.warningTitle}>Antes de empezar</Text>
        <Text style={styles.warningBullet}>
          • Una vez iniciado no puedes pausar — termina o pierdes el intento
        </Text>
        <Text style={styles.warningBullet}>
          • Tus respuestas se califican automáticamente al enviar
        </Text>
        <Text style={styles.warningBullet}>
          • Si fallas, espera unas horas antes del siguiente intento
        </Text>
      </View>
      <Pressable
        style={styles.cta}
        onPress={onStart}
        disabled={isPending}
      >
        <Text style={styles.ctaText}>{isPending ? 'Iniciando…' : 'Iniciar examen'}</Text>
      </Pressable>
    </ScrollView>
  )
}

function InProgressPhase(props: {
  attempt: AttemptStarted
  currentIdx: number
  answers: Map<string, number>
  onSelect: (qid: string, idx: number) => void
  onNext: () => void
  onPrev: () => void
  onSubmit: () => void
}) {
  const question = props.attempt.questions[props.currentIdx]
  if (!question) return null
  const selected = props.answers.get(question.id)
  const isLast = props.currentIdx === props.attempt.questionsTotal - 1
  const answeredCount = props.answers.size

  return (
    <>
      <View style={styles.progressHeader}>
        <Text style={styles.progressText}>
          Pregunta {props.currentIdx + 1} de {props.attempt.questionsTotal}
        </Text>
        <View style={styles.dots}>
          {Array.from({ length: props.attempt.questionsTotal }).map((_, idx) => (
            <View
              key={idx}
              style={[
                styles.dot,
                idx < answeredCount && styles.dotAnswered,
                idx === props.currentIdx && styles.dotCurrent,
              ]}
            />
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.phaseContent}>
        <Text style={styles.questionText}>{question.q}</Text>
        {question.options.map((opt, idx) => {
          const isPicked = selected === idx
          return (
            <Pressable
              key={idx}
              style={[styles.option, isPicked && styles.optionPicked]}
              onPress={() => props.onSelect(question.id, idx)}
            >
              <Text style={[styles.optionText, isPicked && styles.optionTextPicked]}>
                {opt}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.footerBtn, props.currentIdx === 0 && styles.footerBtnDisabled]}
          onPress={props.onPrev}
          disabled={props.currentIdx === 0}
        >
          <Text style={styles.footerBtnText}>Anterior</Text>
        </Pressable>
        {isLast ? (
          <Pressable
            style={[
              styles.submitBtn,
              answeredCount < props.attempt.questionsTotal && styles.submitBtnDisabled,
            ]}
            onPress={props.onSubmit}
            disabled={answeredCount < props.attempt.questionsTotal}
          >
            <Text style={styles.submitBtnText}>Enviar examen</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.submitBtn} onPress={props.onNext}>
            <Text style={styles.submitBtnText}>Siguiente</Text>
          </Pressable>
        )}
      </View>
    </>
  )
}

function ResultPhase({ result, onClose }: { result: AttemptResult; onClose: () => void }) {
  return (
    <ScrollView contentContainerStyle={[styles.phaseContent, styles.resultCenter]}>
      <Text style={styles.resultEmoji}>{result.passed ? '🎉' : '😔'}</Text>
      <Text style={styles.resultTitle}>
        {result.passed ? '¡Aprobado!' : 'No aprobado'}
      </Text>
      <Text style={styles.resultScore}>
        {result.scorePct.toFixed(1)}% — {result.questionsCorrect} de {result.questionsTotal}
      </Text>
      {result.passed && (
        <View style={styles.certificateBox}>
          <Text style={styles.certificateText}>
            🏆 Tu certificado se está generando. Disponible en pocos minutos.
          </Text>
        </View>
      )}
      <Pressable style={styles.cta} onPress={onClose}>
        <Text style={styles.ctaText}>Cerrar</Text>
      </Pressable>
    </ScrollView>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas.primary },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: colors.text.secondary, fontSize: 14 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  back: { color: colors.text.primary, fontSize: 24 },
  title: { color: colors.text.primary, fontSize: 16, fontWeight: '600' },

  progressHeader: { paddingHorizontal: 20, paddingVertical: 8 },
  progressText: { color: colors.text.tertiary, fontSize: 12, marginBottom: 8 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.canvas.secondary,
  },
  dotAnswered: { backgroundColor: colors.brand[500] },
  dotCurrent: {
    backgroundColor: colors.brand[500],
    transform: [{ scale: 1.4 }],
  },

  phaseContent: { padding: 20, paddingBottom: 100 },
  warningBox: {
    backgroundColor: colors.warning[500] + '22',
    borderColor: colors.warning[500] + '66',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  warningTitle: {
    color: colors.warning[400],
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  warningBullet: { color: colors.text.secondary, fontSize: 13, marginVertical: 3 },

  questionText: {
    color: colors.text.primary,
    fontSize: 18,
    fontWeight: '500',
    lineHeight: 26,
    marginBottom: 24,
  },
  option: {
    backgroundColor: colors.canvas.secondary,
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionPicked: {
    borderColor: colors.brand[500],
    backgroundColor: colors.brand[600] + '22',
  },
  optionText: { color: colors.text.primary, fontSize: 15 },
  optionTextPicked: { fontWeight: '600' },

  footer: {
    flexDirection: 'row',
    padding: 16,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  footerBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.canvas.secondary,
    borderRadius: 10,
  },
  footerBtnDisabled: { opacity: 0.4 },
  footerBtnText: { color: colors.text.primary, fontSize: 14, fontWeight: '500' },

  submitBtn: {
    flex: 1,
    backgroundColor: colors.brand[500],
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: colors.text.inverse, fontSize: 14, fontWeight: '700' },

  cta: {
    backgroundColor: colors.brand[500],
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  ctaText: { color: colors.text.inverse, fontSize: 16, fontWeight: '700' },

  resultCenter: { alignItems: 'center', paddingTop: 60 },
  resultEmoji: { fontSize: 80, marginBottom: 16 },
  resultTitle: {
    color: colors.text.primary,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  resultScore: { color: colors.text.secondary, fontSize: 16, marginBottom: 24 },
  certificateBox: {
    backgroundColor: colors.brand[600] + '22',
    borderColor: colors.brand[500],
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  certificateText: {
    color: colors.brand[300],
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
})
