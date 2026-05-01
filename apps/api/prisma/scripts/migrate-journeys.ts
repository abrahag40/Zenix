/**
 * migrate-journeys.ts
 *
 * Migra todos los guest_stays existentes (sin journey) al modelo StayJourney.
 * Idempotente: si se re-ejecuta, omite los guest_stays que ya tienen journey.
 *
 * Ejecución: npx tsx prisma/scripts/migrate-journeys.ts
 */

import { PrismaClient } from '@prisma/client';
import { eachDayOfInterval, startOfDay } from 'date-fns';

const prisma = new PrismaClient();

async function main() {
  // ── Leer todos los guest_stays sin journey y sin borrar ──────────────
  const stays = await prisma.guestStay.findMany({
    where: {
      deletedAt: null,
      stayJourney: null,
    },
  });

  console.log(`\nFound ${stays.length} guest_stays to migrate.\n`);

  let migrated = 0;
  let failed = 0;

  for (const stay of stays) {
    try {
      const now = new Date();
      const checkIn = startOfDay(stay.checkinAt);
      const checkOut = startOfDay(stay.scheduledCheckout);

      // ── Status del journey ──────────────────────────────────────────
      const journeyStatus = stay.actualCheckout ? 'CHECKED_OUT' : 'ACTIVE';

      // ── Status del segmento ─────────────────────────────────────────
      let segmentStatus: 'COMPLETED' | 'ACTIVE' | 'PENDING';
      if (stay.actualCheckout) {
        segmentStatus = 'COMPLETED';
      } else if (stay.checkinAt < now) {
        segmentStatus = 'ACTIVE';
      } else {
        segmentStatus = 'PENDING';
      }
      const segmentLocked = !!stay.actualCheckout;

      // ── Noches: [checkIn, checkOut) ─────────────────────────────────
      // eachDayOfInterval incluye ambos extremos, así que excluimos checkOut
      let nightDates: Date[] = [];
      if (checkOut > checkIn) {
        const allDays = eachDayOfInterval({ start: checkIn, end: checkOut });
        nightDates = allDays.slice(0, -1); // excluir el último día (checkout)
      }

      await prisma.$transaction(async (tx) => {
        // a) StayJourney
        const journey = await tx.stayJourney.create({
          data: {
            organizationId: stay.organizationId,
            propertyId: stay.propertyId,
            guestStayId: stay.id,
            guestName: stay.guestName,
            guestEmail: stay.guestEmail ?? null,
            status: journeyStatus,
            journeyCheckIn: checkIn,
            journeyCheckOut: checkOut,
          },
        });

        // b) StaySegment
        const segment = await tx.staySegment.create({
          data: {
            journeyId: journey.id,
            roomId: stay.roomId,
            guestStayId: stay.id,
            checkIn,
            checkOut,
            status: segmentStatus,
            locked: segmentLocked,
            reason: 'ORIGINAL',
            rateSnapshot: stay.ratePerNight,
          },
        });

        // c) SegmentNights — una por cada noche de la estadía
        if (nightDates.length > 0) {
          await tx.segmentNight.createMany({
            data: nightDates.map((date) => {
              const isPast = date < now;
              const locked = segmentLocked || isPast;
              return {
                segmentId: segment.id,
                date,
                rate: stay.ratePerNight,
                locked,
                status: locked ? 'LOCKED' : 'PENDING',
              };
            }),
          });
        }

        // d) StayJourneyEvent
        await tx.stayJourneyEvent.create({
          data: {
            journeyId: journey.id,
            eventType: 'JOURNEY_CREATED',
            actorId: null,
            payload: {
              source: 'migration_v1',
              originalGuestStayId: stay.id,
              nightsCreated: nightDates.length,
            },
          },
        });
      });

      migrated++;
      process.stdout.write(`  ✓ ${stay.id} (${stay.guestName}) — ${nightDates.length} nights\n`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${stay.id} (${stay.guestName}) — ERROR: ${(err as Error).message}`);
    }
  }

  // ── Resumen ────────────────────────────────────────────────────────────
  console.log(`\n── Migration complete ─────────────────────────`);
  console.log(`  Migrated : ${migrated}`);
  console.log(`  Failed   : ${failed}`);
  console.log(`  Total    : ${stays.length}`);

  // ── Conteos de verificación ────────────────────────────────────────────
  const [journeys, segments, nights, events] = await Promise.all([
    prisma.stayJourney.count(),
    prisma.staySegment.count(),
    prisma.segmentNight.count(),
    prisma.stayJourneyEvent.count(),
  ]);

  console.log(`\n── Table counts ───────────────────────────────`);
  console.log(`  stay_journeys       : ${journeys}`);
  console.log(`  stay_segments       : ${segments}`);
  console.log(`  segment_nights      : ${nights}`);
  console.log(`  stay_journey_events : ${events}`);
  console.log(`───────────────────────────────────────────────\n`);
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
