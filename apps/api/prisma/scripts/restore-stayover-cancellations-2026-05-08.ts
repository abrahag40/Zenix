/**
 * One-off data-fix — ARCHIVED for posterity (2026-05-08).
 *
 * Contexto: el 2026-05-08 el cron de stayover canceló tareas STAYOVER que NO
 * debían cancelarse — el guard `EXTENSION_NO_CLEANING` interpretó mal el
 * predecesor del journey y descartó tareas válidas de in-house guests.
 *
 * Este script re-activa esas tareas (PENDING → READY) si el room todavía
 * tiene un stay activo válido. Fecha hardcoded en línea 18 — NO reutilizar
 * sin cambiar `today`.
 *
 * Uso histórico:
 *   cd apps/api && npx ts-node -r tsconfig-paths/register prisma/scripts/restore-stayover-cancellations-2026-05-08.ts
 *
 * Si necesitas un patrón similar en el futuro: copia este archivo, cambia
 * la fecha, y agrégalo como `restore-<descripcion>-YYYY-MM-DD.ts`.
 */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
;(async () => {
  const today = '2026-05-08'
  const todayEnd = new Date(`${today}T23:59:59.999Z`)

  // Buscar tasks STAYOVER cancelladas hoy con razón data-fix
  // donde el room SI tiene un stay activo con scheduledCheckout > hoy
  const cancelled = await p.cleaningTask.findMany({
    where: {
      taskType: 'STAYOVER',
      status: 'CANCELLED',
      cancelledAt: { gte: new Date(`${today}T00:00:00.000Z`) },
      cancelledReason: 'EXTENSION_NO_CLEANING',
    },
    include: { unit: { include: { room: { select: { id: true, number: true } } } } },
  })

  for (const t of cancelled) {
    // Verificar si HAY un stay con scheduledCheckout > hoy (válido para stayover)
    const validStay = await p.guestStay.findFirst({
      where: {
        roomId: t.unit.room.id,
        actualCheckout: null,
        noShowAt: null,
        actualCheckin: { not: null },
        scheduledCheckout: { gt: todayEnd },
      },
    })
    if (validStay) {
      // Restaurar
      await p.cleaningTask.update({
        where: { id: t.id },
        data: { status: 'READY', cancelledReason: null, cancelledAt: null },
      })
      await p.taskLog.create({
        data: {
          taskId: t.id,
          event: 'READY',
          note: `data-fix-restore: ${t.unit.room.number} sí tiene stay activa válida (sched=${validStay.scheduledCheckout.toISOString().slice(0,10)})`,
        },
      })
      console.log(`✓ Restored ${t.unit.room.number} (stay sched=${validStay.scheduledCheckout.toISOString().slice(0,10)})`)
    }
  }
  await p.$disconnect()
})()
