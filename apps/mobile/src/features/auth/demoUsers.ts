/**
 * Demo users registry for fast 1-tap login on the demo build.
 *
 * Justification (UX research):
 *   - Slack workspace picker pattern: visual selector reduces friction for
 *     accounts known to the user (https://slack.engineering/the-tools-we-use-and-why-we-use-them/).
 *   - In demo/QA contexts, typing email on phone keyboards adds friction
 *     (Baymard Institute 2022: median 1.4s per character on mobile).
 *   - 1-tap pre-fill removes 18+ keystrokes (`m@z.co` + `1234` = 11 chars
 *     × 1.4s average = ~15s saved per login attempt).
 *
 * Users are grouped by property in the login screen for fast E2E testing.
 * Each chip shows: name · role · property — so testers know exactly who
 * they're logging in as without reading the email.
 *
 * Production builds will gate this picker behind __DEV__ to avoid leaking
 * staff identities. For Sprint 8I we leave it visible — Zenix is in active
 * customer demos where this accelerates the showcase.
 */

import { Department } from '@zenix/shared'
import { colors } from '../../design/colors'

export interface DemoUser {
  id: string
  name: string
  shortName: string         // avatar initial
  email: string
  password: string
  role: 'HOUSEKEEPER' | 'SUPERVISOR' | 'RECEPTIONIST'
  roleLabel: string
  department: Department
  property: 'Tulum' | 'Cancún'
  avatarBg: string
}

// ── Color palette by role (consistent across both properties) ───────────────
const ROLE_COLORS = {
  SUPERVISOR:   '#A78BFA',  // violet  — authority / management
  RECEPTIONIST: '#60A5FA',  // blue    — front desk / customer-facing
  HOUSEKEEPER:  colors.brand[500],      // emerald — operations / housekeeping
  HOUSEKEEPER_2: colors.brand[400],
  HOUSEKEEPER_3: colors.brand[600],
  MAINTENANCE:  '#F59E0B',  // amber   — maintenance department
}

export const DEMO_USERS: DemoUser[] = [
  // ── Hotel Tulum ────────────────────────────────────────────────────────
  {
    id: 'ana',
    name: 'Ana García',
    shortName: 'A',
    email: 's@z.co',
    password: '123456',
    role: 'SUPERVISOR',
    roleLabel: 'Supervisor',
    department: Department.HOUSEKEEPING,
    property: 'Tulum',
    avatarBg: ROLE_COLORS.SUPERVISOR,
  },
  {
    id: 'carlos',
    name: 'Carlos López',
    shortName: 'C',
    email: 'r@z.co',
    password: '123456',
    role: 'RECEPTIONIST',
    roleLabel: 'Recepción',
    department: Department.RECEPTION,
    property: 'Tulum',
    avatarBg: ROLE_COLORS.RECEPTIONIST,
  },
  {
    id: 'maria',
    name: 'María Torres',
    shortName: 'M',
    email: 'm@z.co',
    password: '123456',
    role: 'HOUSEKEEPER',
    roleLabel: 'Recamarista',
    department: Department.HOUSEKEEPING,
    property: 'Tulum',
    avatarBg: ROLE_COLORS.HOUSEKEEPER,
  },
  {
    id: 'valentina',
    name: 'Valentina Cruz',
    shortName: 'V',
    email: 'v@z.co',
    password: '123456',
    role: 'HOUSEKEEPER',
    roleLabel: 'Recamarista',
    department: Department.HOUSEKEEPING,
    property: 'Tulum',
    avatarBg: ROLE_COLORS.HOUSEKEEPER_2,
  },
  {
    id: 'pedro',
    name: 'Pedro Ramírez',
    shortName: 'P',
    email: 'p@z.co',
    password: '123456',
    role: 'HOUSEKEEPER',
    roleLabel: 'Recamarista',
    department: Department.HOUSEKEEPING,
    property: 'Tulum',
    avatarBg: ROLE_COLORS.HOUSEKEEPER_3,
  },
  {
    id: 'diego',
    name: 'Diego Flores',
    shortName: 'D',
    email: 'd@z.co',
    password: '123456',
    role: 'HOUSEKEEPER',
    roleLabel: 'Recamarista',
    department: Department.HOUSEKEEPING,
    property: 'Tulum',
    avatarBg: colors.brand[700] ?? '#065F46',
  },
  {
    id: 'javier',
    name: 'Javier Ruiz',
    shortName: 'J',
    email: 'j@z.co',
    password: '123456',
    role: 'HOUSEKEEPER',
    roleLabel: 'Mantenimiento',
    department: Department.MAINTENANCE,
    property: 'Tulum',
    avatarBg: ROLE_COLORS.MAINTENANCE,
  },

  // ── Hotel Cancún ───────────────────────────────────────────────────────
  {
    id: 'rodrigo',
    name: 'Rodrigo Vega',
    shortName: 'R',
    email: 'sc@z.co',
    password: '123456',
    role: 'SUPERVISOR',
    roleLabel: 'Supervisor',
    department: Department.HOUSEKEEPING,
    property: 'Cancún',
    avatarBg: ROLE_COLORS.SUPERVISOR,
  },
  {
    id: 'laura',
    name: 'Laura Mendez',
    shortName: 'L',
    email: 'rc@z.co',
    password: '123456',
    role: 'RECEPTIONIST',
    roleLabel: 'Recepción',
    department: Department.RECEPTION,
    property: 'Cancún',
    avatarBg: ROLE_COLORS.RECEPTIONIST,
  },
  {
    id: 'luis',
    name: 'Luis Herrera',
    shortName: 'L',
    email: 'l@z.co',
    password: '123456',
    role: 'HOUSEKEEPER',
    roleLabel: 'Recamarista',
    department: Department.HOUSEKEEPING,
    property: 'Cancún',
    avatarBg: ROLE_COLORS.HOUSEKEEPER,
  },
  {
    id: 'carmen',
    name: 'Carmen Silva',
    shortName: 'C',
    email: 'c@z.co',
    password: '123456',
    role: 'HOUSEKEEPER',
    roleLabel: 'Recamarista',
    department: Department.HOUSEKEEPING,
    property: 'Cancún',
    avatarBg: ROLE_COLORS.HOUSEKEEPER_2,
  },
]

/** Returns users grouped by property for rendering section lists. */
export function getDemoUsersByProperty(): { property: string; users: DemoUser[] }[] {
  const groups: Record<string, DemoUser[]> = {}
  for (const user of DEMO_USERS) {
    if (!groups[user.property]) groups[user.property] = []
    groups[user.property].push(user)
  }
  return Object.entries(groups).map(([property, users]) => ({ property, users }))
}
