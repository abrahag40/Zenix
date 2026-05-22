/**
 * One-off seed: 4 sticky notes para stay-tul-a1-elena (demo del sidebar).
 * Idempotente — borra y recrea las STICKY de Elena en cada corrida.
 *
 * Uso:
 *   cd apps/api && npx ts-node -r tsconfig-paths/register prisma/scripts/seed-elena-sticky-notes.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const STAY_ID = 'stay-tul-a1-elena'

async function main() {
  const stay = await prisma.guestStay.findUnique({ where: { id: STAY_ID } })
  if (!stay) throw new Error(`GuestStay ${STAY_ID} not found`)

  const [carlos, ana] = await Promise.all([
    prisma.staff.findFirst({ where: { name: 'Carlos López' } }),
    prisma.staff.findFirst({ where: { name: 'Ana García' } }),
  ])
  if (!carlos || !ana) throw new Error('Carlos López / Ana García staff not found')

  await prisma.guestStayNote.deleteMany({ where: { stayId: STAY_ID, kind: 'STICKY' } })

  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  const notes = [
    {
      authorId: carlos.id,
      content: 'Alérgica a mariscos. Confirmado al check-in — avisar a cocina si pide room service.',
      channel: 'GUEST_REQUEST',
      createdAt: new Date(now - 12 * day),
    },
    {
      authorId: ana.id,
      content: 'Nómada digital — pidió NO MOLESTAR entre 9:00 y 13:00 hrs (llamadas con clientes EU).',
      channel: 'INTERNAL',
      createdAt: new Date(now - 11 * day),
    },
    {
      authorId: ana.id,
      content: 'Limpieza ligera diaria: solo cambiar toallas. Sábanas cada 3 días.',
      channel: 'HOUSEKEEPING',
      createdAt: new Date(now - 10 * day),
    },
    {
      authorId: carlos.id,
      content: 'Estadía larga (27 noches) — descuento del 15% aplicado en tarifa. Aprobado por Ana.',
      channel: 'INTERNAL',
      createdAt: new Date(now - 12 * day),
    },
  ]

  for (const n of notes) {
    await prisma.guestStayNote.create({
      data: { stayId: STAY_ID, kind: 'STICKY', ...n },
    })
  }

  console.log(`✓ Created ${notes.length} STICKY notes for ${STAY_ID}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
