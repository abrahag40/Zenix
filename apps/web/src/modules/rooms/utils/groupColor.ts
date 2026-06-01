/**
 * groupColor — color de identidad por ReservationGroup (Sprint GROUP-BADGE, 2026-06-01).
 *
 * Resuelve el gap reportado por owner + confirmado en estudio de mercado:
 * todos los grupos se veían iguales (badge + ring violeta uniforme), imposible
 * distinguir "cuál grupo es cuál" con 6 grupos en pantalla.
 *
 * Solución (opción C — codificación redundante color + etiqueta):
 *  · Hue ESTABLE derivado del reservationGroupId (hash → índice en paleta capada).
 *  · Paleta de 8 tonos mutuamente distinguibles (research: ≤10 colores antes de
 *    saturar — Healey & Enns 2012; "same color tint per group" pre-attentive
 *    grouping — Treisman 1980 / Gestalt similitud / Gantt best practice).
 *  · El color vive SOLO en el badge + el ring del bloque (canal separado); el
 *    relleno del bloque sigue codificando ESTADO (§31). No colisión.
 *  · La etiqueta del titular (groupTag) acompaña al color → identidad absoluta +
 *    WCAG 1.4.1 (nunca depender solo del color: daltonismo + >8 grupos).
 *
 * Determinista: el mismo groupId siempre produce el mismo color (estable entre
 * renders/sesiones; los hermanos del mismo grupo comparten color exacto).
 */

interface Rgb { r: number; g: number; b: number }

/** 8 tonos 600-ish (texto blanco legible) mutuamente distinguibles. */
const GROUP_PALETTE: readonly Rgb[] = [
  { r: 124, g: 58,  b: 237 }, // violet
  { r: 37,  g: 99,  b: 235 }, // blue
  { r: 13,  g: 148, b: 136 }, // teal
  { r: 225, g: 29,  b: 72  }, // rose
  { r: 234, g: 88,  b: 12  }, // orange
  { r: 192, g: 38,  b: 211 }, // fuchsia
  { r: 8,   g: 145, b: 178 }, // cyan
  { r: 67,  g: 56,  b: 202 }, // indigo
]

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export interface GroupColor {
  /** "r,g,b" para componer rgba() con opacidad variable. */
  rgb: string
  /** rgba(rgb, alpha) helper. */
  ring: (alpha: number) => string
  /** Fondo sólido del badge (texto blanco). */
  badgeBg: string
}

export function groupColor(groupId: string): GroupColor {
  const c = GROUP_PALETTE[hashStr(groupId) % GROUP_PALETTE.length]
  const rgb = `${c.r},${c.g},${c.b}`
  return {
    rgb,
    ring: (a) => `rgba(${rgb},${a})`,
    badgeBg: `rgb(${rgb})`,
  }
}
