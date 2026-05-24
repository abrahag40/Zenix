export const TIMELINE = {
  ROW_HEIGHT: 36,
  GROUP_HEADER_HEIGHT: 32,
  DAY_WIDTH: {
    week: 120,
    month: 48,
    quarter: 20,
  },
  // Reducido 40→24 — los bloques de 1-2 noches en vista Mes (dayWidth 48) tienen
  // ~48-96px y aún deben mostrar iniciales mínimas. Sin esto, los segmentos de
  // extensión cortos (como James Wilson C1 = 2 noches) quedan sin etiqueta y
  // el recepcionista no puede identificar el propietario sin hover.
  MIN_BLOCK_WIDTH: 24,
  COLUMN_WIDTH: 220,
  HEADER_HEIGHT: 80,
  OVERSCAN: 3,
} as const

export const SOURCE_COLORS = {
  direct: {
    bg: '#DCFCE7',
    border: '#86EFAC',
    text: '#166534',
    label: 'Directo',
  },
  booking: {
    bg: '#DBEAFE',
    border: '#93C5FD',
    text: '#1E40AF',
    label: 'Booking',
  },
  expedia: {
    bg: '#FEF9C3',
    border: '#FDE047',
    text: '#713F12',
    label: 'Expedia',
  },
  airbnb: {
    bg: '#FFE4E6',
    border: '#FCA5A5',
    text: '#9F1239',
    label: 'Airbnb',
  },
  'walk-in': {
    bg: '#F1F5F9',
    border: '#CBD5E1',
    text: '#334155',
    label: 'Walk-in',
  },
  other: {
    bg: '#F5F3FF',
    border: '#C4B5FD',
    text: '#4C1D95',
    label: 'Otro',
  },
} as const

export type SourceKey = keyof typeof SOURCE_COLORS

// ─── Stay status colors (operational) ────────────────────────
export const STAY_STATUS_COLORS = {
  UNCONFIRMED: {
    bg:     '#DBEAFE',
    border: '#93C5FD',
    text:   '#1E40AF',
    label:  'Sin confirmar',
  },
  ARRIVING: {
    bg: '#DBEAFE',
    border: '#93C5FD',
    text: '#1E40AF',
    label: 'Llegada',
  },
  IN_HOUSE: {
    bg: '#DCFCE7',
    border: '#86EFAC',
    text: '#166534',
    label: 'Alojado',
  },
  DEPARTING: {
    bg: '#FEF9C3',
    border: '#FDE047',
    text: '#713F12',
    label: 'Salida',
  },
  DEPARTED: {
    bg: '#F1F5F9',
    border: '#CBD5E1',
    text: '#334155',
    label: 'Completado',
  },
  NO_SHOW: {
    bg: '#FEF2F2',
    border: '#FECACA',
    text: '#7F1D1D',
    label: 'No-show',
  },
} as const

export type StayStatusKey = keyof typeof STAY_STATUS_COLORS

// ─── OTA accent colors (left border stripe + chip background) ─────────────
// Colores oficiales del brand de cada canal — coherencia visual con marketing
// del OTA. Sin estos, todos los OTAs se ven igual (queja Cloudbeds 2024).
export const OTA_ACCENT_COLORS: Record<string, string> = {
  'walk-in':      '#64748B',
  'direct':       '#059669',
  'booking':      '#003580', // Booking.com navy
  'expedia':      '#FFC72C', // Expedia yellow — adjusted for text contrast below
  'airbnb':       '#FF5A5F', // Airbnb coral
  'hotels_com':   '#C2001A',
  'agoda':        '#5C3B8C',
  'tripadvisor':  '#00AA6C',
  'hostelworld':  '#F97316',
  'despegar':     '#0055A5',
  'google':       '#4285F4',
  'other':        '#7C3AED',
}

// ─── OTA name normalization + display label ─────────────────────────────────
// Sprint CHANNEX-UX-E2-E3 §149-§152.
// Channex emite slugs `booking_com`, `airbnb`, `expedia`, etc. — distintos del
// `source` legacy (`booking`, `airbnb`, etc.) que usaban reservas direct/manual.
// Este helper unifica ambos a una clave canónica para lookup de color + label.
const OTA_DISPLAY: Record<string, { key: string; label: string }> = {
  // Channex slugs
  booking_com:    { key: 'booking',     label: 'Booking.com' },
  expedia:        { key: 'expedia',     label: 'Expedia' },
  airbnb:         { key: 'airbnb',      label: 'Airbnb' },
  hostelworld:    { key: 'hostelworld', label: 'Hostelworld' },
  agoda:          { key: 'agoda',       label: 'Agoda' },
  hotels_com:     { key: 'hotels_com',  label: 'Hotels.com' },
  despegar:       { key: 'despegar',    label: 'Despegar' },
  tripadvisor:    { key: 'tripadvisor', label: 'Tripadvisor' },
  google:         { key: 'google',      label: 'Google' },
  // Legacy source labels (direct/walk-in reservations)
  booking:        { key: 'booking',     label: 'Booking.com' },
  direct:         { key: 'direct',      label: 'Directa' },
  'walk-in':      { key: 'walk-in',     label: 'Walk-in' },
  other:          { key: 'other',       label: 'Otra OTA' },
  OTA:            { key: 'other',       label: 'OTA' },
}

export interface OtaDisplayMeta {
  key:       string
  label:     string
  color:     string
  /** Text color hint: 'light' (white text) or 'dark' (slate text) for AA contrast. */
  textTone:  'light' | 'dark'
}

/**
 * Single source of truth para chip + accent del OTA. Usa preferentemente
 * `channexOtaName` (slug de Channex) → fallback a `source` legacy → fallback
 * a 'other'. Devuelve color + label + tone para que el chip tenga contraste
 * AA contra el background (Expedia yellow #FFC72C necesita texto slate;
 * Booking navy necesita texto blanco).
 */
export function resolveOtaDisplay(
  channexOtaName?: string | null,
  legacySource?: string | null,
): OtaDisplayMeta {
  const raw = (channexOtaName ?? legacySource ?? 'other').toString().toLowerCase()
  const entry = OTA_DISPLAY[raw] ?? OTA_DISPLAY.other
  const color = OTA_ACCENT_COLORS[entry.key] ?? OTA_ACCENT_COLORS.other
  // Light backgrounds (Expedia yellow, Tripadvisor green-lite) → dark text.
  // Resto → texto blanco. Heurística: convertir hex a luminancia relativa.
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  const textTone: 'light' | 'dark' = luminance > 0.6 ? 'dark' : 'light'
  return { key: entry.key, label: entry.label, color, textTone }
}

export const STATUS_DOT_COLORS: Record<string, string> = {
  AVAILABLE: '#10B981',
  OCCUPIED: '#6366F1',
  CHECKING_OUT: '#F59E0B',
  CLEANING: '#06B6D4',
  INSPECTION: '#8B5CF6',
  MAINTENANCE: '#F97316',
  OUT_OF_SERVICE: '#64748B',
}
