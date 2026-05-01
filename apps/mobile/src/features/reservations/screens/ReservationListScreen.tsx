/**
 * ReservationListScreen — primary work surface for RECEPTION department.
 *
 * Renders inside the "Mi día" tab when user.department === RECEPTION
 * (AD-011 shared-chrome / role-aware-module pattern).
 *
 * Layout (Research #4 §5.1):
 *   ┌─────────────────────────────────────────────┐
 *   │ Reservas                                    │
 *   │ ┌─────────────────────────────────────────┐ │  ← sticky search
 *   │ │ 🔍  Buscar por nombre, hab, ID          │ │
 *   │ └─────────────────────────────────────────┘ │
 *   │ [Hoy ●][Mañana][Semana][Todas]              │  ← date chips
 *   │                                              │
 *   │ 🔴 LLEGAN HOY (2)                            │  ← section header
 *   │ ┌──── ReservationCard ─────────────────────┐│
 *   │ ┌──── ReservationCard ─────────────────────┐│
 *   │                                              │
 *   │ 🟢 EN CASA (3)                              │
 *   │ ┌──── ReservationCard ─────────────────────┐│
 *   │ ...                                          │
 *   │                                              │
 *   │            [+ Nueva reserva]                │  ← FAB (Sprint 9)
 *   └─────────────────────────────────────────────┘
 *
 * UX foundations:
 *   - Hostaway/Cloudbeds pattern: lista vertical > grid 2D en móvil
 *   - Sticky search (Apple HIG): siempre accesible, debounce 200ms
 *   - Section grouping: 7±2 cognitive load — divide y conquista
 *   - SectionList + native FlatList performance for 100+ stays
 *   - Empty state branded — never just "No hay datos"
 *
 * Privacy: backend redacts PII for non-RECEPTION roles. This screen
 * trusts the DTO. AD-011 guards the SCREEN-level access (not visible
 * to HOUSEKEEPING department); the DTO is defense in depth.
 *
 * Sprint 8I: connected to mock data.
 * Sprint 9: real `useQuery({ queryKey: ['reservations', filters], ... })`.
 */

import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  SectionList,
  type ListRenderItemInfo,
  type SectionListData,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import * as Haptics from 'expo-haptics'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
} from 'react-native-reanimated'
import { useReservations, type DateFilter } from '../api/useReservations'
import { ReservationCard } from '../components/ReservationCard'
import type { ReservationListItem, ReservationStatus } from '../types'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'
import { MOTION } from '../../../design/motion'

// Time scope: today / tomorrow / day-after only.
// Research #6 §2.6: "semana" and "todas" added clutter without operational
// payoff for daily-shift staff. Drop them.
const DATE_CHIPS: { key: DateFilter; label: string }[] = [
  { key: 'today',    label: 'Hoy' },
  { key: 'tomorrow', label: 'Mañana' },
  { key: 'dayAfter', label: 'Pasado' },
]

// Status filter chips — multi-select per user's answer to Q5.
// Color tokens match ReservationCard.STATUS_TINT for visual consistency.
const STATUS_CHIPS: { key: ReservationStatus; label: string; fg: string; bg: string }[] = [
  { key: 'UNCONFIRMED', label: 'Sin confirmar', fg: '#FBBF24', bg: 'rgba(245,158,11,0.14)' },
  { key: 'IN_HOUSE',    label: 'En casa',       fg: '#34D399', bg: 'rgba(16,185,129,0.14)' },
  { key: 'DEPARTING',   label: 'Salen hoy',     fg: '#60A5FA', bg: 'rgba(59,130,246,0.14)' },
  { key: 'NO_SHOW',     label: 'No-show',       fg: '#F87171', bg: 'rgba(239,68,68,0.14)' },
]

export function ReservationListScreen() {
  // Read deep-link params: ?status=IN_HOUSE&search=203
  // Used by InHouseCard tap and RoomsGridCard "Ver detalle de reserva".
  const params = useLocalSearchParams<{ status?: string; search?: string }>()

  const [search, setSearch] = useState(params.search ?? '')
  const [dateFilter, setDateFilter] = useState<DateFilter>('today')
  const [statusFilter, setStatusFilter] = useState<ReservationStatus[]>(
    params.status ? [params.status as ReservationStatus] : [],
  )

  // If a fresh ?status=X arrives via navigation, reflect it. Avoid infinite
  // loops by depending on the raw param value, not the parsed array.
  useEffect(() => {
    if (params.status) {
      setStatusFilter([params.status as ReservationStatus])
    }
  }, [params.status])

  useEffect(() => {
    if (params.search) {
      setSearch(params.search)
    }
  }, [params.search])

  const query = useMemo(
    () => ({ search, dateFilter, statusFilter }),
    [search, dateFilter, statusFilter],
  )
  const { sections, total, isLoading } = useReservations(query)

  const toggleStatus = (key: ReservationStatus) => {
    Haptics.selectionAsync()
    setStatusFilter((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }

  // Mount animation — single pass, content fades in
  const opacity = useSharedValue(0)
  useMemo(() => {
    opacity.value = withDelay(60, withTiming(1, { duration: 400, easing: MOTION.ease.spring }))
  }, [])
  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ReservationListItem>) => (
      <ReservationCard
        item={item}
        onPress={() => {
          Haptics.selectionAsync()
          router.push(`/reservation/${item.id}`)
        }}
      />
    ),
    [],
  )

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionListData<ReservationListItem> & { emoji?: string; title?: string } }) => (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionEmoji}>{section.emoji ?? ''}</Text>
        <Text style={styles.sectionTitle}>{(section.title ?? '').toUpperCase()}</Text>
        <Text style={styles.sectionCount}>{section.data?.length ?? 0}</Text>
      </View>
    ),
    [],
  )

  const ListHeader = (
    <Animated.View style={[styles.headerWrap, animStyle]}>
      <Text style={styles.title}>Reservas</Text>

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por nombre o habitación"
          placeholderTextColor={colors.text.tertiary}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Text style={styles.clearBtn}>✕</Text>
          </Pressable>
        )}
      </View>

      {/* Date chips — single-select, 3 options */}
      <View style={styles.chipRow}>
        {DATE_CHIPS.map((chip) => {
          const active = dateFilter === chip.key
          return (
            <Pressable
              key={chip.key}
              onPress={() => {
                Haptics.selectionAsync()
                setDateFilter(chip.key)
              }}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                {chip.label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {/* Status chips — multi-select horizontal scroll. Empty selection = show all. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.statusChipRow}
      >
        {STATUS_CHIPS.map((chip) => {
          const active = statusFilter.includes(chip.key)
          return (
            <Pressable
              key={chip.key}
              onPress={() => toggleStatus(chip.key)}
              style={[
                styles.statusChip,
                active && { backgroundColor: chip.bg, borderColor: chip.fg },
              ]}
            >
              <View style={[styles.statusChipDot, { backgroundColor: chip.fg }]} />
              <Text
                style={[
                  styles.statusChipLabel,
                  active && { color: chip.fg, fontWeight: typography.weight.semibold },
                ]}
              >
                {chip.label}
              </Text>
            </Pressable>
          )
        })}
        {statusFilter.length > 0 && (
          <Pressable
            onPress={() => {
              Haptics.selectionAsync()
              setStatusFilter([])
            }}
            style={styles.statusClearChip}
          >
            <Text style={styles.statusClearChipText}>Limpiar ✕</Text>
          </Pressable>
        )}
      </ScrollView>

      <Text style={styles.totalLabel}>
        {isLoading
          ? 'Cargando...'
          : total === 0
            ? 'Sin reservas'
            : `${total} ${total === 1 ? 'reserva' : 'reservas'}`}
      </Text>
    </Animated.View>
  )

  const ListEmpty = (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>🪂</Text>
      <Text style={styles.emptyTitle}>Sin coincidencias</Text>
      <Text style={styles.emptyBody}>
        {search.trim()
          ? `No encontramos reservas que coincidan con "${search.trim()}".`
          : 'No hay reservas para este filtro de fecha.'}
      </Text>
      {search.trim() && (
        <Pressable onPress={() => setSearch('')} style={styles.emptyAction}>
          <Text style={styles.emptyActionText}>Limpiar búsqueda</Text>
        </Pressable>
      )}
    </View>
  )

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <SectionList
        sections={sections as any}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={sections.length === 0 ? ListEmpty : null}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        SectionSeparatorComponent={() => <View style={{ height: 6 }} />}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas.primary,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  headerWrap: {
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    fontSize: typography.size.hero,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    letterSpacing: typography.letterSpacing.hero,
  },
  calendarBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.canvas.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  calendarBtnText: {
    fontSize: typography.size.small,
    color: colors.text.primary,
    fontWeight: typography.weight.semibold,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.canvas.secondary,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  searchIcon: {
    fontSize: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.size.body,
    color: colors.text.primary,
    padding: 0,
  },
  clearBtn: {
    fontSize: 16,
    color: colors.text.tertiary,
    paddingHorizontal: 4,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.canvas.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  chipActive: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderColor: colors.brand[400],
  },
  chipLabel: {
    fontSize: typography.size.small,
    color: colors.text.secondary,
    fontWeight: typography.weight.medium,
  },
  chipLabelActive: {
    color: colors.brand[400],
    fontWeight: typography.weight.semibold,
  },
  statusChipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 16,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.canvas.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  statusChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusChipLabel: {
    fontSize: typography.size.small,
    color: colors.text.secondary,
    fontWeight: typography.weight.medium,
  },
  statusClearChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  statusClearChipText: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
    fontWeight: typography.weight.semibold,
  },
  totalLabel: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
    fontWeight: typography.weight.medium,
    letterSpacing: typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 18,
    paddingBottom: 8,
  },
  sectionEmoji: {
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: typography.size.micro,
    color: colors.text.secondary,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.wide,
  },
  sectionCount: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
    fontWeight: typography.weight.semibold,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    marginLeft: 'auto',
  },
  emptyState: {
    paddingTop: 60,
    alignItems: 'center',
    gap: 8,
  },
  emptyEmoji: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize: typography.size.title,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
  },
  emptyBody: {
    fontSize: typography.size.body,
    color: colors.text.secondary,
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: typography.size.body * typography.lineHeight.relaxed,
  },
  emptyAction: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(16,185,129,0.12)',
  },
  emptyActionText: {
    fontSize: typography.size.small,
    color: colors.brand[400],
    fontWeight: typography.weight.semibold,
  },
})
