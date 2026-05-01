/**
 * Mock notifications — placeholder for Sprint 8I.
 *
 * Wired to real backend (NotificationCenterService) in Sprint 9.
 * For now, the shape mirrors the AppNotification model from Prisma so
 * the swap is one-line (replace this import with a useQuery).
 */

import type { ColorTokens } from '../../design/colors'

export type NotificationCategory =
  | 'TASK_READY'
  | 'EARLY_CHECKOUT'
  | 'NO_SHOW'
  | 'CHECKIN_UNCONFIRMED'
  | 'TASK_COMPLETED'
  | 'CARRYOVER'
  | 'SYSTEM'

export interface MockNotification {
  id: string
  category: NotificationCategory
  title: string
  body: string
  /** ISO timestamp */
  createdAt: string
  read: boolean
  /** Avatar character — 1 emoji or single letter */
  avatar: string
  /** Background color for the avatar circle */
  avatarBg: keyof ColorTokens['brand'] | 'urgent' | 'warning' | 'system'
}

const now = Date.now()
const minutes = (n: number) => new Date(now - n * 60_000).toISOString()
const hours = (n: number) => new Date(now - n * 60 * 60_000).toISOString()
const days = (n: number) => new Date(now - n * 24 * 60 * 60_000).toISOString()

export const MOCK_NOTIFICATIONS: MockNotification[] = [
  {
    id: 'n1',
    category: 'TASK_READY',
    title: 'Habitación 203 lista para limpiar',
    body: 'El huésped acaba de hacer checkout. Marca como urgente: hoy entra Juan García a las 15:00.',
    createdAt: minutes(8),
    read: false,
    avatar: '🛏️',
    avatarBg: 'urgent',
  },
  {
    id: 'n2',
    category: 'EARLY_CHECKOUT',
    title: 'Salida anticipada — Hab. 105',
    body: 'María Ramírez salió antes de lo previsto. Disponible para limpieza inmediata.',
    createdAt: minutes(35),
    read: false,
    avatar: '👋',
    avatarBg: 'warning',
  },
  {
    id: 'n3',
    category: 'CARRYOVER',
    title: 'Tarea pendiente de ayer',
    body: 'La habitación 312 quedó sin terminar ayer. Reasignada a ti hoy con prioridad doble.',
    createdAt: hours(2),
    read: false,
    avatar: '⚠️',
    avatarBg: 'warning',
  },
  {
    id: 'n4',
    category: 'TASK_COMPLETED',
    title: 'Tarea verificada',
    body: 'Ana García verificó tu limpieza de la habitación 207. Puntuación: impecable.',
    createdAt: hours(5),
    read: true,
    avatar: '✓',
    avatarBg: 500,
  },
  {
    id: 'n5',
    category: 'SYSTEM',
    title: 'Tu día de hoy',
    body: '8 habitaciones · 3 con check-in mismo día 🔴 · 1 carryover ⚠️',
    createdAt: days(1),
    read: true,
    avatar: '☀️',
    avatarBg: 'system',
  },
  {
    id: 'n6',
    category: 'TASK_COMPLETED',
    title: 'Logro desbloqueado',
    body: 'Verificación impecable: 10 limpiezas seguidas sin observaciones del supervisor.',
    createdAt: days(2),
    read: true,
    avatar: '🌟',
    avatarBg: 'warning',
  },
]
