/**
 * Debug helper — print task counts grouped por tipo para un housekeeper.
 *
 * Email hardcoded a `m@z.co` (María del seed). Parametrizar si quieres
 * reutilizarlo en otra cuenta.
 *
 * Uso:
 *   cd apps/api && npx ts-node -r tsconfig-paths/register prisma/scripts/verify-housekeeper-tasks.ts
 */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
;(async () => {
  const maria = await p.staff.findFirst({ where: { email: 'm@z.co' } })
  const tasks = await p.cleaningTask.findMany({
    where: {
      assignedToId: maria!.id,
      status: { in: ['PENDING','UNASSIGNED','READY','IN_PROGRESS','PAUSED','DONE','VERIFIED'] },
    },
    include: { unit: { include: { room: { select: { number: true } } } } },
    orderBy: { createdAt: 'desc' },
  })
  console.log(`Tareas activas de María: ${tasks.length}\n`)
  const byType: Record<string, string[]> = { NORMAL: [], CARRYOVER: [], STAYOVER: [], DONE: [] }
  for (const t of tasks) {
    const r = t.unit.room.number
    if (t.status === 'DONE' || t.status === 'VERIFIED') byType.DONE.push(r)
    else if (t.taskType === 'STAYOVER') byType.STAYOVER.push(r)
    else if (t.carryoverFromDate) byType.CARRYOVER.push(r)
    else byType.NORMAL.push(r)
  }
  console.log(`De ayer (carryover): ${byType.CARRYOVER.sort().join(', ') || '—'}`)
  console.log(`Normal (checkout hoy): ${byType.NORMAL.sort().join(', ') || '—'}`)
  console.log(`Estadías (in-house):  ${byType.STAYOVER.sort().join(', ') || '—'}`)
  console.log(`Hechas/Verificadas:   ${byType.DONE.sort().join(', ') || '—'}`)
  await p.$disconnect()
})()
