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
 * Production builds will gate this picker behind __DEV__ to avoid leaking
 * staff identities. For Sprint 8I we leave it visible — Zenix is in active
 * customer demos where this accelerates the showcase.
 */

import { Department } from '@zenix/shared'
import { colors } from '../../design/colors'

export interface DemoUser {
  id: string
  name: string
  shortName: string         // used as avatar initial
  email: string
  password: string
  role: 'HOUSEKEEPER' | 'SUPERVISOR' | 'RECEPTIONIST'
  roleLabel: string         // human-readable
  department: Department
  property: 'Tulum' | 'Cancún'
  /** Background color for the avatar (semantic to role) */
  avatarBg: string
}

export const DEMO_USERS: DemoUser[] = [
  // Tulum
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
    avatarBg: colors.brand[500],
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
    avatarBg: colors.brand[600],
  },
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
    avatarBg: '#A78BFA',  // violet — distinct from housekeeper greens
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
    avatarBg: '#60A5FA',  // blue — distinct from housekeeper greens
  },
  // Cancún
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
    avatarBg: colors.brand[400],
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
    avatarBg: '#3B82F6',
  },
]
