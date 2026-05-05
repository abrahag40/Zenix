/**
 * BlockedRoomDetailScreen — rich detail of a single blocked room.
 *
 * Full screen instead of modal. Designed to support 5 levels of context:
 *
 *   1. STATUS HERO       — large category pill + days remaining
 *   2. REASON            — paragraph, primary readable size
 *   3. TIMELINE          — start → today (now) → end markers
 *   4. PEOPLE INVOLVED   — solicitó / aprobó (role-redacted)
 *   5. LINKED RESOURCES  — maintenance ticket id (link out, Sprint 9 wiring)
 *
 * Why this depth: the user said "se ve muy básica". The blocked-room
 * record is the cross-departmental coordination point — HK needs to know
 * not to enter; recepción needs to not sell it; mtto needs to track it.
 * A two-line modal isn't enough.
 *
 * The screen also documents the back-button gesture works: ScreenHeader
 * provides a visible back affordance + native swipe gesture works inside
 * an expo-router stack.
 */

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { ScreenHeader } from '../../navigation/ScreenHeader'
import { dashboardType } from '../../dashboard/typography'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'
import {
  MOCKS_DASHBOARD_ENABLED,
  MOCK_BLOCKED_ROOMS,
} from '../../dashboard/__mocks__/mockDashboard'
import type { BlockedRoom } from '../../dashboard/components/BlockedRoomsCard'

const CATEGORY_INFO: Record<
  BlockedRoom['category'],
  { fg: string; bg: string; emoji: string; label: string }
> = {
  MAINTENANCE: { fg: '#FBBF24', bg: 'rgba(245,158,11,0.14)', emoji: '🔧', label: 'Mantenimiento' },
  RENOVATION:  { fg: '#A78BFA', bg: 'rgba(168,139,250,0.16)', emoji: '🎨', label: 'Renovación' },
  ADMIN:       { fg: '#60A5FA', bg: 'rgba(59,130,246,0.16)', emoji: '🔒', label: 'Administrativo' },
  OTHER:       { fg: '#9CA3AF', bg: 'rgba(255,255,255,0.06)', emoji: '•',  label: 'Otro' },
}

function formatDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function daysBetween(a: string, b?: string | null): number {
  if (!b) return 0
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}

function daysRemaining(endsAt: string | null): number | null {
  if (!endsAt) return null
  return Math.max(0, Math.round((new Date(endsAt).getTime() - Date.now()) / 86_400_000))
}

export function BlockedRoomDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const room: BlockedRoom | undefined = MOCKS_DASHBOARD_ENABLED
    ? MOCK_BLOCKED_ROOMS.find((r) => r.id === id)
    : undefined

  if (!room) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <ScreenHeader title="Bloqueo no encontrado" />
        <View style={styles.notFound}>
          <Text style={styles.notFoundEmoji}>🔍</Text>
          <Text style={[dashboardType.titleLg, { textAlign: 'center' }]}>
            Bloqueo no disponible
          </Text>
          <Text style={[dashboardType.body, styles.notFoundBody]}>
            Es posible que el bloqueo haya sido cerrado o que no tengas acceso.
          </Text>
          <Pressable style={styles.notFoundBtn} onPress={() => router.back()}>
            <Text style={styles.notFoundBtnText}>Volver</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  const info = CATEGORY_INFO[room.category]
  const totalDays = daysBetween(room.startsAt, room.endsAt)
  const remaining = daysRemaining(room.endsAt)

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader title={`Hab. ${room.roomNumber}`} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* L1 — Status hero */}
        <View style={[styles.hero, { backgroundColor: info.bg, borderColor: info.fg }]}>
          <View style={styles.heroTop}>
            <Text style={styles.heroEmoji}>{info.emoji}</Text>
            <Text style={[dashboardType.sectionLabel, { color: info.fg }]}>
              {info.label.toUpperCase()}
            </Text>
          </View>
          {remaining != null && (
            <Text style={[dashboardType.displayLg, { color: info.fg }]}>
              {remaining}
              <Text style={[dashboardType.bodySmall, { color: info.fg }]}>
                {' '}{remaining === 1 ? 'día restante' : 'días restantes'}
              </Text>
            </Text>
          )}
          {!remaining && room.endsAt == null && (
            <Text style={[dashboardType.title, { color: info.fg }]}>
              Bloqueo indefinido
            </Text>
          )}
        </View>

        {/* L2 — Reason */}
        <View style={styles.section}>
          <Text style={dashboardType.sectionLabel}>MOTIVO</Text>
          <Text style={[dashboardType.title, { lineHeight: 28 }]}>{room.reason}</Text>
        </View>

        {/* L3 — Timeline */}
        <View style={styles.section}>
          <Text style={dashboardType.sectionLabel}>CRONOLOGÍA</Text>
          <View style={styles.timeline}>
            <TimelineNode
              label="Inicio del bloqueo"
              value={formatDateLong(room.startsAt)}
              isPast
            />
            <View style={styles.timelineConnector} />
            <TimelineNode
              label="Hoy"
              value={daysBetween(room.startsAt, new Date().toISOString()) + ' días transcurridos'}
              isPresent
              tone={info.fg}
            />
            <View style={styles.timelineConnector} />
            <TimelineNode
              label="Fin estimado"
              value={room.endsAt ? formatDateLong(room.endsAt) : 'Indefinido'}
              isFuture
            />
          </View>
          {totalDays > 0 && (
            <Text style={[dashboardType.caption, { marginTop: 8 }]}>
              Duración total estimada: {totalDays} día{totalDays !== 1 ? 's' : ''}
            </Text>
          )}
        </View>

        {/* L4 — People */}
        {(room.requestedByName || room.approvedByName) && (
          <View style={styles.section}>
            <Text style={dashboardType.sectionLabel}>RESPONSABLES</Text>
            <View style={styles.peopleRow}>
              {room.requestedByName && (
                <PersonChip role="Solicitó" name={room.requestedByName} />
              )}
              {room.approvedByName && (
                <PersonChip role="Aprobó" name={room.approvedByName} />
              )}
            </View>
          </View>
        )}

        {/* L5 — Linked resources */}
        {room.ticketId && (
          <View style={styles.section}>
            <Text style={dashboardType.sectionLabel}>TICKET DE MANTENIMIENTO</Text>
            <Pressable
              style={styles.ticketLink}
              onPress={() => {
                // Sprint 9: navigate to maintenance ticket detail
              }}
            >
              <Text style={[dashboardType.body, { color: colors.brand[400] }]}>
                {room.ticketId} →
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function TimelineNode({
  label,
  value,
  isPast,
  isPresent,
  isFuture,
  tone,
}: {
  label: string
  value: string
  isPast?: boolean
  isPresent?: boolean
  isFuture?: boolean
  tone?: string
}) {
  return (
    <View style={styles.timelineNode}>
      <View
        style={[
          styles.timelineDot,
          isPast && { backgroundColor: colors.text.tertiary },
          isPresent && { backgroundColor: tone ?? colors.brand[400], width: 14, height: 14, borderRadius: 7 },
          isFuture && styles.timelineDotFuture,
        ]}
      />
      <View style={styles.timelineText}>
        <Text style={dashboardType.caption}>{label.toUpperCase()}</Text>
        <Text style={dashboardType.bodySmall}>{value}</Text>
      </View>
    </View>
  )
}

function PersonChip({ role, name }: { role: string; name: string }) {
  return (
    <View style={styles.personChip}>
      <Text style={dashboardType.caption}>{role.toUpperCase()}</Text>
      <Text style={dashboardType.bodyEmphasis}>{name}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas.primary,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 22,
  },
  hero: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroEmoji: {
    fontSize: 18,
  },
  section: {
    gap: 8,
  },
  // ── Timeline ──────
  timeline: {
    paddingTop: 6,
  },
  timelineNode: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
    backgroundColor: colors.text.tertiary,
  },
  timelineDotFuture: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.text.tertiary,
  },
  timelineConnector: {
    width: 2,
    height: 14,
    backgroundColor: colors.border.subtle,
    marginLeft: 4,
    marginVertical: 2,
  },
  timelineText: {
    flex: 1,
    gap: 2,
  },
  // ── People ──────
  peopleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  personChip: {
    flex: 1,
    minWidth: 130,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.canvas.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    gap: 4,
  },
  // ── Ticket ──────
  ticketLink: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(16,185,129,0.10)',
    borderWidth: 1,
    borderColor: colors.brand[500],
  },
  // ── Not-found ──────
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  notFoundEmoji: {
    fontSize: 48,
  },
  notFoundBody: {
    color: colors.text.secondary,
    textAlign: 'center',
  },
  notFoundBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(16,185,129,0.15)',
  },
  notFoundBtnText: {
    fontSize: 16,
    color: colors.brand[400],
    fontWeight: typography.weight.semibold,
  },
})
