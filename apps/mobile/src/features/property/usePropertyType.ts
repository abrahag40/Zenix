/**
 * usePropertyType — surface PropertyType + per-room category awareness.
 *
 * The PMS supports three operational models with distinct UX implications:
 *
 *   HOTEL / BOUTIQUE / GLAMPING / ECO_LODGE
 *     Operational unit = the room. The user thinks "Hab. 203", never
 *     "Cama A". Bed-level labels ARE NOISE. Any feature that surfaces a
 *     unit must default to room-level copy.
 *
 *   HOSTAL  ⚠️ MIXED INVENTORY
 *     A hostal in LATAM commonly has BOTH shared dorms (per-bed sale)
 *     AND private rooms (hotel-like). Decision is PER ROOM via the
 *     RoomCategory enum (PRIVATE | SHARED) — not at property level.
 *     Property type only seeds the default copy and explains why some
 *     rooms look bed-level and others don't.
 *
 *   VACATION_RENTAL
 *     Listing-driven (Airbnb/VRBO model). No front desk, no shared
 *     inventory. Check-in via code. Different dashboard set; some
 *     screens (Hub Recamarista per-bed) don't apply.
 *     See docs/research-airbnb.md for full viability + scoping.
 *
 * Why this hook exists
 * --------------------
 * Several call sites (TaskCard, RoomsGridCard, future ReservationCard)
 * make UX micro-decisions that depend on this distinction. Centralizing
 * the rule here keeps copy consistent and future-proofs the addition of
 * new property types without touching N components.
 *
 * Source of truth
 * ---------------
 * AuthResponse.user.propertyType — set by the API at login from
 * Property.type (Prisma enum, see schema.prisma §PropertyType).
 */

import { useAuthStore } from '../../store/auth'

export type PropertyType =
  | 'HOTEL'
  | 'HOSTAL'
  | 'BOUTIQUE'
  | 'GLAMPING'
  | 'ECO_LODGE'
  | 'VACATION_RENTAL'

export interface PropertyTypeRules {
  type: PropertyType | null
  /** Hint label for the operational unit in the property's default vocabulary. */
  unitNoun: 'habitación' | 'cama' | 'unidad'
  /** Whether bed-level labels (e.g. "Cama A") should EVER be surfaced for
   *  this property. False for HOTEL/BOUTIQUE/etc. True for HOSTAL only —
   *  but the actual visibility per-room is gated by RoomCategory.SHARED. */
  bedLabelsAllowed: boolean
  /** True when the property has no front desk and check-ins happen via
   *  self-service codes (Airbnb model). Hides reception-only features. */
  isSelfCheckIn: boolean
}

const DEFAULTS: PropertyTypeRules = {
  type: null,
  unitNoun: 'habitación',
  bedLabelsAllowed: false,
  isSelfCheckIn: false,
}

export function usePropertyType(): PropertyTypeRules {
  const propertyType = useAuthStore((s) => s.user?.propertyType ?? null)

  if (!propertyType) return DEFAULTS

  switch (propertyType) {
    case 'HOTEL':
    case 'BOUTIQUE':
    case 'GLAMPING':
    case 'ECO_LODGE':
      return {
        type: propertyType,
        unitNoun: 'habitación',
        bedLabelsAllowed: false,
        isSelfCheckIn: false,
      }
    case 'HOSTAL':
      return {
        type: 'HOSTAL',
        unitNoun: 'habitación',  // copy default; SHARED rooms override at render
        bedLabelsAllowed: true,
        isSelfCheckIn: false,
      }
    case 'VACATION_RENTAL':
      return {
        type: 'VACATION_RENTAL',
        unitNoun: 'unidad',
        bedLabelsAllowed: false,
        isSelfCheckIn: true,
      }
  }
}

/**
 * Helper: should we show the unit label (e.g. "Cama A") for a given room?
 *
 * Truth table:
 *   HOTEL        + any roomCategory  → false
 *   HOSTAL       + PRIVATE roomCat   → false   (it's a regular room)
 *   HOSTAL       + SHARED roomCat    → true    (dorm — bed is the unit)
 *   VACATION_RENTAL                  → false
 */
export function shouldShowBedLabel(
  rules: PropertyTypeRules,
  roomCategory: 'PRIVATE' | 'SHARED' | undefined,
): boolean {
  if (!rules.bedLabelsAllowed) return false
  return roomCategory === 'SHARED'
}
