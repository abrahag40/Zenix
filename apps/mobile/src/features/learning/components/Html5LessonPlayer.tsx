/**
 * Html5LessonPlayer mobile — renderiza contentJson blocks.
 *
 * Paridad con web/src/modules/learning/components/LessonPlayer/Html5LessonPlayer.tsx
 * pero adaptado a React Native primitives.
 */
import { useState } from 'react'
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'

type ContentBlock =
  | { kind: 'text'; body: string }
  | { kind: 'image'; url: string; alt?: string; caption?: string }
  | { kind: 'callout'; tone?: 'info' | 'warning' | 'success'; body: string }
  | {
      kind: 'quiz'
      questions: Array<{
        id: string
        q: string
        options: string[]
        correctIdx?: number
        explain?: string
      }>
    }

export function Html5LessonPlayer({
  contentJson,
}: {
  contentJson: ContentBlock[] | null
}) {
  if (!contentJson || contentJson.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Sin contenido disponible.</Text>
      </View>
    )
  }
  return (
    <View>
      {contentJson.map((block, idx) => (
        <BlockRenderer key={idx} block={block} />
      ))}
    </View>
  )
}

function BlockRenderer({ block }: { block: ContentBlock }) {
  switch (block.kind) {
    case 'text':
      return <Text style={styles.text}>{block.body}</Text>
    case 'image':
      return (
        <View style={styles.figure}>
          <Image source={{ uri: block.url }} style={styles.image} resizeMode="cover" />
          {block.caption && <Text style={styles.caption}>{block.caption}</Text>}
        </View>
      )
    case 'callout':
      return <Callout tone={block.tone ?? 'info'} body={block.body} />
    case 'quiz':
      return <InlineQuiz questions={block.questions} />
    default:
      return null
  }
}

function Callout({ tone, body }: { tone: 'info' | 'warning' | 'success'; body: string }) {
  const map = {
    info: { bg: '#1A2A5F33', border: '#60A5FA66', text: '#93C5FD' },
    warning: { bg: '#5F441A33', border: colors.warning[500] + '66', text: colors.warning[400] },
    success: { bg: '#1A5F4433', border: colors.brand[500] + '66', text: colors.brand[300] },
  }
  const s = map[tone]
  return (
    <View
      style={[
        styles.callout,
        { backgroundColor: s.bg, borderColor: s.border },
      ]}
    >
      <Text style={[styles.calloutText, { color: s.text }]}>{body}</Text>
    </View>
  )
}

function InlineQuiz({
  questions,
}: {
  questions: Array<{
    id: string
    q: string
    options: string[]
    correctIdx?: number
    explain?: string
  }>
}) {
  return (
    <View style={styles.quizWrap}>
      <Text style={styles.quizLabel}>Verifica tu comprensión</Text>
      {questions.map((q) => (
        <SelfCheckQuestion key={q.id} question={q} />
      ))}
    </View>
  )
}

function SelfCheckQuestion({
  question,
}: {
  question: {
    id: string
    q: string
    options: string[]
    correctIdx?: number
    explain?: string
  }
}) {
  const [selected, setSelected] = useState<number | null>(null)
  const [revealed, setRevealed] = useState(false)

  return (
    <View style={styles.qCard}>
      <Text style={styles.qText}>{question.q}</Text>
      {question.options.map((opt, idx) => {
        const isPicked = selected === idx
        const isCorrect = revealed && question.correctIdx === idx
        const isPickedWrong = revealed && isPicked && question.correctIdx !== idx
        return (
          <TouchableOpacity
            key={idx}
            disabled={revealed}
            onPress={() => setSelected(idx)}
            style={[
              styles.optBtn,
              isCorrect && styles.optCorrect,
              isPickedWrong && styles.optWrong,
              isPicked && !revealed && styles.optPicked,
            ]}
          >
            <Text
              style={[
                styles.optText,
                (isCorrect || isPickedWrong) && { fontWeight: '600' },
              ]}
            >
              {opt}
            </Text>
          </TouchableOpacity>
        )
      })}
      {!revealed && selected !== null && (
        <TouchableOpacity onPress={() => setRevealed(true)} style={styles.verifyBtn}>
          <Text style={styles.verifyText}>Verificar respuesta</Text>
        </TouchableOpacity>
      )}
      {revealed && question.explain && (
        <Text style={styles.explainText}>{question.explain}</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  empty: { padding: 24, alignItems: 'center' },
  emptyText: { color: colors.text.tertiary, fontSize: 14 },
  text: {
    fontSize: typography.size.body,
    color: colors.text.primary,
    lineHeight: typography.size.body * 1.6,
    marginVertical: 8,
  },
  figure: { marginVertical: 12 },
  image: { width: '100%', height: 200, borderRadius: 12 },
  caption: { color: colors.text.tertiary, fontSize: 11, marginTop: 6 },
  callout: {
    padding: 14,
    borderRadius: 10,
    borderLeftWidth: 3,
    marginVertical: 12,
  },
  calloutText: { fontSize: 13, lineHeight: 19 },
  quizWrap: {
    backgroundColor: colors.canvas.secondary,
    padding: 14,
    borderRadius: 12,
    marginVertical: 16,
  },
  quizLabel: {
    color: colors.text.tertiary,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
    fontWeight: '600',
  },
  qCard: { marginTop: 12 },
  qText: { color: colors.text.primary, fontSize: 14, fontWeight: '500', marginBottom: 8 },
  optBtn: {
    backgroundColor: colors.canvas.tertiary,
    padding: 12,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  optPicked: {
    borderColor: colors.brand[500],
    backgroundColor: colors.brand[600] + '22',
  },
  optCorrect: {
    backgroundColor: colors.brand[600] + '33',
    borderColor: colors.brand[500],
  },
  optWrong: {
    backgroundColor: colors.urgent[500] + '22',
    borderColor: colors.urgent[500],
  },
  optText: { color: colors.text.primary, fontSize: 14 },
  verifyBtn: { alignSelf: 'flex-start', marginTop: 4 },
  verifyText: {
    color: colors.brand[400],
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  explainText: { color: colors.text.tertiary, fontSize: 12, marginTop: 8 },
})
