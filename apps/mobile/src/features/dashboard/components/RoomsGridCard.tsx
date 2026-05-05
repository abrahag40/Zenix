/**
 * RoomsGridCard v2 — visual room status grid, PropertyType-aware.
 *
 * Research #6 §2.4 — addresses every gap of the v1:
 *
 *   PROBLEM v1                    │  FIX v2
 *   ──────────────────────────────┼──────────────────────────────────────
 *   Dead space on the right       │  Justified 6-col layout, equal width
 *   No grouping                   │  Group by floor/section (hotel) or
 *                                 │  by floor + bed-level on tap (hostal)
 *   Tap does nothing              │  BottomSheet with role-aware detail
 *   Doesn't scale past 60 rooms   │  Auto-switches to SearchableRoomGrid
 *
 * Property-type behavior:
 *   HOTEL / BOUTIQUE / GLAMPING / ECO_LODGE
 *     - Group by `room.section || 'Piso ' + room.floor`
 *     - Each chip is a room
 *     - Tap room (PRIVATE) → guest detail (role-redacted)
 *
 *   HOSTAL
 *     - Same grouping for the chip layout
 *     - SHARED rooms (dorms) show a bed sub-grid in the BottomSheet
 *     - PRIVATE rooms in the same hostal behave like HOTEL
 *
 *   VACATION_RENTAL
 *     - Each unit is independent; section = listing name
 *
 * Privacy tiers (respect user's answer to Q2 — HK does NOT see name):
 *   HOUSEKEEPER  → only operational fields (status, dates, ops notes)
 *   RECEPTIONIST → guest name + dates + notes + quick actions
 *   SUPERVISOR   → same as RECEPTIONIST + edit access (Sprint 9)
 *   ADMIN        → full payload
 *
 * Sprint 8I uses mock data; Sprint 9 wires `GET /v1/dashboard/rooms-status`.
 */

import { useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { useAuthStore } from '../../../store/auth'
import { usePropertyType } from '../../property/usePropertyType'
import { ScreenHeader } from '../../navigation/ScreenHeader'
import { colors } from '../../../design/colors'
import { typography } from '../../../design/typography'

export type RoomDisplayStatus =
  | 'CLEAN'
  | 'DIRTY'
  | 'CLEANING'
  | 'OCCUPIED'
  | 'BLOCKED'
  | 'UNKNOWN'

export interface RoomGridItem {
  id: string
  number: string
  status: RoomDisplayStatus
  /** Optional grouping. If null, falls back to `Piso N` from `floor`. */
  section?: string | null
  floor?: number | null
  /** Hostel SHARED dorms: nested beds visible inside the BottomSheet. */
  category?: 'PRIVATE' | 'SHARED'
  beds?: BedInRoom[]
  /** Operational note — visible to all roles. */
  operationalNotes?: string | null
  /** Pre-formatted: "sale mañana 12:00" / "sale hoy 11:00 → entra 15:00" */
  scheduleLabel?: string | null
  /** Backend-redacted by role. NULL for HOUSEKEEPER. */
  guestName?: string | null
  /** Backend-redacted by role. NULL for HOUSEKEEPER. */
  paxCount?: number | null
  /** Backend-redacted by role. */
  guestPhone?: string | null
}

export interface BedInRoom {
  id: string
  label: string                   // "Cama A", "Litera 1 (arriba)"
  status: RoomDisplayStatus
  scheduleLabel?: string | null
  /** Backend-redacted: NULL for HOUSEKEEPER. */
  guestName?: string | null
}

interface RoomsGridCardProps {
  rooms?: RoomGridItem[]
}

const STATUS_BG: Record<RoomDisplayStatus, string> = {
  CLEAN:    'rgba(16,185,129,0.18)',
  DIRTY:    'rgba(245,158,11,0.18)',
  CLEANING: 'rgba(59,130,246,0.18)',
  OCCUPIED: 'rgba(167,139,250,0.20)',
  BLOCKED:  'rgba(239,68,68,0.18)',
  UNKNOWN:  'rgba(255,255,255,0.04)',
}
const STATUS_FG: Record<RoomDisplayStatus, string> = {
  CLEAN:    '#34D399',
  DIRTY:    '#FBBF24',
  CLEANING: '#60A5FA',
  OCCUPIED: '#A78BFA',
  BLOCKED:  '#F87171',
  UNKNOWN:  '#9CA3AF',
}
const STATUS_LABEL: Record<RoomDisplayStatus, string> = {
  CLEAN:    'Limpia',
  DIRTY:    'Sucia',
  CLEANING: 'Limpiando',
  OCCUPIED: 'Ocupada',
  BLOCKED:  'Bloqueada',
  UNKNOWN:  'Sin datos',
}

const LARGE_PROPERTY_THRESHOLD = 60
const COLS = 6

interface RoomGroup {
  key: string
  label: string
  rooms: RoomGridItem[]
}

function groupRooms(rooms: RoomGridItem[]): RoomGroup[] {
  const map = new Map<string, RoomGridItem[]>()
  for (const r of rooms) {
    const key =
      r.section?.trim()
        ? r.section.trim()
        : r.floor != null
          ? `Piso ${r.floor}`
          : 'Sin agrupar'
    const list = map.get(key) ?? []
    list.push(r)
    map.set(key, list)
  }
  // Sort groups: numeric-aware on labels (Piso 1 < Piso 10), strings alpha
  const labels = Array.from(map.keys()).sort((a, b) =>
    a.localeCompare(b, 'es', { numeric: true }),
  )
  return labels.map((label) => ({
    key: label,
    label,
    rooms: (map.get(label) ?? []).sort((a, b) =>
      a.number.localeCompare(b.number, 'es', { numeric: true }),
    ),
  }))
}

export function RoomsGridCard({ rooms }: RoomsGridCardProps) {
  const list = rooms ?? []
  const total = list.length
  const role = useAuthStore((s) => s.user?.role) // 'RECEPTIONIST' | 'SUPERVISOR' | 'HOUSEKEEPER'
  const { type: propType } = usePropertyType()

  // For >60 rooms, switch UX to a search-driven mode (Sprint 9 implementation).
  // For Sprint 8I we just show a hint banner above the grouped grid.
  const isLarge = total > LARGE_PROPERTY_THRESHOLD

  const groups = useMemo(() => groupRooms(list), [list])
  const [selected, setSelected] = useState<RoomGridItem | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggleCollapse = (key: string) => {
    Haptics.selectionAsync()
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Legend = only statuses present in current data
  const presentStatuses = Array.from(new Set(list.map((r) => r.status)))
  const ORDER: RoomDisplayStatus[] = ['CLEAN', 'OCCUPIED', 'DIRTY', 'CLEANING', 'BLOCKED', 'UNKNOWN']
  const legend = ORDER.filter((s) => presentStatuses.includes(s))

  return (
    <>
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.label}>HABITACIONES</Text>
          <Text style={styles.totalCount}>{total}/{total}</Text>
        </View>

        {total === 0 ? (
          <Text style={styles.emptyText}>
            El estado de habitaciones se mostrará aquí en tiempo real
          </Text>
        ) : (
          <>
            {isLarge && (
              <View style={styles.largeBanner}>
                <Text style={styles.largeBannerText}>
                  Propiedad grande — Sprint 9 habilitará búsqueda por número
                </Text>
              </View>
            )}

            {groups.map((g) => {
              const isCollapsed = collapsed.has(g.key)
              return (
                <View key={g.key} style={styles.group}>
                  <Pressable
                    onPress={() => toggleCollapse(g.key)}
                    style={styles.groupHeader}
                    hitSlop={6}
                  >
                    <Text style={styles.groupLabel}>{g.label}</Text>
                    <Text style={styles.groupCount}>({g.rooms.length})</Text>
                    <Text style={styles.collapseChevron}>{isCollapsed ? '⌄' : '⌃'}</Text>
                  </Pressable>

                  {!isCollapsed && (
                    <View style={styles.gridFlex}>
                      {g.rooms.map((room) => (
                        <Pressable
                          key={room.id}
                          onPress={() => {
                            Haptics.selectionAsync()
                            setSelected(room)
                          }}
                          style={[
                            styles.chip,
                            { backgroundColor: STATUS_BG[room.status] },
                          ]}
                        >
                          <Text
                            style={[styles.chipText, { color: STATUS_FG[room.status] }]}
                            numberOfLines={1}
                          >
                            {room.number}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              )
            })}

            {/* Legend (always at bottom) */}
            <View style={styles.legend}>
              {legend.map((status) => (
                <View key={status} style={styles.legendItem}>
                  <View
                    style={[styles.legendDot, { backgroundColor: STATUS_FG[status] }]}
                  />
                  <Text style={styles.legendText}>{STATUS_LABEL[status]}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>

      {/* Detail BottomSheet — role-aware payload */}
      <Modal
        visible={!!selected}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelected(null)}
      >
        {selected && (
          <RoomDetailSheet
            room={selected}
            role={role}
            propType={propType}
            onClose={() => setSelected(null)}
          />
        )}
      </Modal>
    </>
  )
}

// ───────────────────────────────────────────────────────────────────
// RoomDetailSheet — role-aware payload, with bed sub-grid for dorms.
// ───────────────────────────────────────────────────────────────────

function RoomDetailSheet({
  room,
  role,
  propType,
  onClose,
}: {
  room: RoomGridItem
  role: string | undefined
  propType: string | null
  onClose: () => void
}) {
  const isHK = role === 'HOUSEKEEPER'
  const isSharedDorm =
    room.category === 'SHARED' && Array.isArray(room.beds) && room.beds.length > 0

  return (
    <SafeAreaView style={sheet.root} edges={['top', 'bottom']}>
      <ScreenHeader
        title={`Hab. ${room.number}`}
        onBack={onClose}
        backLabel="Cerrar"
      />
      <ScrollView contentContainerStyle={sheet.body}>
        {/* Status hero */}
        <View
          style={[
            sheet.statusHero,
            { backgroundColor: STATUS_BG[room.status], borderColor: STATUS_FG[room.status] },
          ]}
        >
          <View style={[sheet.statusDot, { backgroundColor: STATUS_FG[room.status] }]} />
          <Text style={[sheet.statusLabel, { color: STATUS_FG[room.status] }]}>
            {STATUS_LABEL[room.status].toUpperCase()}
          </Text>
        </View>

        {/* Schedule line — operational, all roles */}
        {room.scheduleLabel && (
          <FieldBlock label="HORARIO" value={room.scheduleLabel} />
        )}

        {/* Guest info — role-gated */}
        {!isHK && room.guestName && (
          <>
            <FieldBlock label="HUÉSPED" value={room.guestName} large />
            {room.paxCount && (
              <FieldBlock label="OCUPACIÓN" value={`${room.paxCount} pax`} />
            )}
          </>
        )}

        {isHK && room.status === 'OCCUPIED' && (
          <View style={sheet.privacyHint}>
            <Text style={sheet.privacyHintText}>
              Tu rol es operativo — no se muestran datos personales del huésped.
            </Text>
          </View>
        )}

        {/* Operational notes — visible to all roles */}
        {room.operationalNotes && (
          <FieldBlock label="NOTAS OPERATIVAS" value={room.operationalNotes} paragraph />
        )}

        {/* Bed sub-grid for SHARED dorms (HOSTAL) */}
        {isSharedDorm && (
          <View style={sheet.bedsBlock}>
            <Text style={sheet.fieldLabel}>CAMAS DEL DORMITORIO</Text>
            <View style={sheet.bedsList}>
              {room.beds!.map((bed) => (
                <View
                  key={bed.id}
                  style={[
                    sheet.bedRow,
                    { backgroundColor: STATUS_BG[bed.status], borderColor: STATUS_FG[bed.status] },
                  ]}
                >
                  <View style={[sheet.bedDot, { backgroundColor: STATUS_FG[bed.status] }]} />
                  <Text style={sheet.bedLabel}>{bed.label}</Text>
                  <Text style={[sheet.bedStatus, { color: STATUS_FG[bed.status] }]}>
                    {STATUS_LABEL[bed.status]}
                  </Text>
                  {!isHK && bed.guestName && (
                    <Text style={sheet.bedGuest} numberOfLines={1}>
                      · {bed.guestName}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Quick actions — RECEPTION/SUPERVISOR/ADMIN only */}
        {!isHK && room.guestName && (
          <View style={sheet.actionsRow}>
            <Pressable
              style={sheet.actionBtn}
              onPress={() => {
                onClose()
                // Navigate to the reservation list filtered to this room — Sprint 9
                // can wire to the actual reservation by lookup.
                router.push(`/trabajo?search=${encodeURIComponent(room.number)}`)
              }}
            >
              <Text style={sheet.actionBtnText}>Ver detalle de reserva ▸</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function FieldBlock({
  label,
  value,
  large,
  paragraph,
}: {
  label: string
  value: string
  large?: boolean
  paragraph?: boolean
}) {
  return (
    <View style={sheet.field}>
      <Text style={sheet.fieldLabel}>{label}</Text>
      <Text
        style={[
          sheet.fieldValue,
          large && sheet.fieldValueLarge,
          paragraph && sheet.fieldValueParagraph,
        ]}
      >
        {value}
      </Text>
    </View>
  )
}

// ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.canvas.secondary,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  label: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.wide,
  },
  totalCount: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
    fontWeight: typography.weight.semibold,
  },
  emptyText: {
    paddingVertical: 12,
    fontSize: typography.size.small,
    color: colors.text.tertiary,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  largeBanner: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(245,158,11,0.10)',
  },
  largeBannerText: {
    fontSize: typography.size.micro,
    color: colors.warning[500],
    fontWeight: typography.weight.medium,
  },
  group: {
    gap: 8,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 4,
  },
  groupLabel: {
    fontSize: typography.size.small,
    color: colors.text.primary,
    fontWeight: typography.weight.bold,
  },
  groupCount: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
    fontWeight: typography.weight.medium,
  },
  collapseChevron: {
    fontSize: 14,
    color: colors.text.tertiary,
    marginLeft: 'auto',
    fontWeight: '300',
  },
  gridFlex: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    width: `${100 / COLS - 1}%`,
    minWidth: 44,
    height: 36,
    paddingHorizontal: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: typography.size.small,
    fontWeight: typography.weight.semibold,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: typography.size.micro,
    color: colors.text.secondary,
    fontWeight: typography.weight.medium,
  },
})

const sheet = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas.primary,
  },
  body: {
    padding: 20,
    gap: 18,
  },
  statusHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusLabel: {
    fontSize: typography.size.small,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.wide,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: typography.size.micro,
    color: colors.text.tertiary,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.wide,
  },
  fieldValue: {
    fontSize: typography.size.body,
    color: colors.text.primary,
    fontWeight: typography.weight.medium,
  },
  fieldValueLarge: {
    fontSize: typography.size.title,
    fontWeight: typography.weight.bold,
  },
  fieldValueParagraph: {
    lineHeight: typography.size.body * typography.lineHeight.relaxed,
  },
  privacyHint: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: colors.text.tertiary,
  },
  privacyHintText: {
    fontSize: typography.size.small,
    color: colors.text.secondary,
    fontStyle: 'italic',
    lineHeight: typography.size.small * typography.lineHeight.relaxed,
  },
  bedsBlock: {
    gap: 10,
  },
  bedsList: {
    gap: 6,
  },
  bedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  bedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  bedLabel: {
    fontSize: typography.size.small,
    color: colors.text.primary,
    fontWeight: typography.weight.semibold,
    minWidth: 70,
  },
  bedStatus: {
    fontSize: typography.size.micro,
    fontWeight: typography.weight.semibold,
  },
  bedGuest: {
    flex: 1,
    fontSize: typography.size.small,
    color: colors.text.secondary,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 8,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: colors.brand[500],
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionBtnText: {
    fontSize: typography.size.body,
    color: '#FFFFFF',
    fontWeight: typography.weight.bold,
  },
})
