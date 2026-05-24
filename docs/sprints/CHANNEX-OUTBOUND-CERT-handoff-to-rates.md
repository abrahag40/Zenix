---
Audiencia: Owner + dev del sprint RATES-METRICS-COMPSET-CORE
Tipo: Handoff técnico cross-sprint
Status: Activo — esperando ejecución del sprint RATES
Padre: docs/sprints/CHANNEX-OUTBOUND-CERT-plan.md
Última actualización: 2026-05-22
---

# Handoff: cómo wirear RatesService al ChannexOutbound

> **Por qué este doc**: el sprint CHANNEX-OUTBOUND-CERT termina en Day 3 con
> el OutboxBuilder + Worker + TokenBucket + DEAD_LETTER notif **listos para
> recibir events**. AvailabilityService ya está wired (Day 3). PERO:
> RatesService y RestrictionsService no existen aún — vienen del sprint
> RATES-METRICS-COMPSET-CORE. Este doc captura las 5 líneas exactas que ese
> sprint debe agregar para activar los Tests 2-8 cert.

---

## El contrato

ChannexOutboundModule consume 2 domain events. Ambos están definidos en
[apps/api/src/integrations/channex/outbound/channex-outbound-events.ts](../../apps/api/src/integrations/channex/outbound/channex-outbound-events.ts):

```typescript
export const CHANNEX_AVAILABILITY_CHANGED = 'channex.availability.changed' as const
export const CHANNEX_RESTRICTION_UPDATED = 'channex.restriction.updated' as const

export interface ChannexAvailabilityChangedEvent {
  propertyId: string
  entries: ChannexAvailabilityEntry[]  // ya en formato Channex (absolute counts)
}

export interface ChannexRestrictionUpdatedEvent {
  propertyId: string
  entries: ChannexRestrictionEntry[]  // ya en formato Channex
}
```

**Quien emite NO importa nada del ChannexOutboundModule** — solo importa
estos types + `EventEmitter2` (global NestJS). Esto es Hexagonal
Architecture: el dominio no sabe que Channex existe.

---

## RatesService — qué emitir (sprint RATES-METRICS-COMPSET-CORE Day X)

Cuando `RatesService.updateRate / setRateOverride / applyRateSeason / applyPromotion`
modifica un precio, después del commit local emitir:

```typescript
import { EventEmitter2 } from '@nestjs/event-emitter'
import {
  CHANNEX_RESTRICTION_UPDATED,
  ChannexRestrictionUpdatedEvent,
} from '../../integrations/channex/outbound/channex-outbound-events'

// En el método updateRate de RatesService:
async updateRate(input: {
  ratePlanId: string
  dateFrom: string  // YYYY-MM-DD
  dateTo?: string   // optional — si solo es 1 día
  rate: number
}): Promise<void> {
  // 1. Save local (Prisma update / create RateOverride)
  const ratePlan = await this.prisma.ratePlan.findUniqueOrThrow({
    where: { id: input.ratePlanId },
    select: { propertyId: true, channexRatePlanId: true },
  })
  await this.prisma.rateOverride.upsert({...})

  // 2. Emit event SOLO si el rate plan tiene mapping Channex.
  //    Si channexRatePlanId es null, este rate no se publica al OTA —
  //    rate plan privado de Zenix.
  if (!ratePlan.channexRatePlanId) return

  const event: ChannexRestrictionUpdatedEvent = {
    propertyId: ratePlan.propertyId,
    entries: [
      input.dateTo
        ? {
            propertyId: ratePlan.propertyId,
            ratePlanId: ratePlan.channexRatePlanId,
            dateFrom: input.dateFrom,
            dateTo: input.dateTo,
            rate: input.rate,
          }
        : {
            propertyId: ratePlan.propertyId,
            ratePlanId: ratePlan.channexRatePlanId,
            date: input.dateFrom,
            rate: input.rate,
          },
    ],
  }
  this.events.emit(CHANNEX_RESTRICTION_UPDATED, event)
}
```

### Para batch updates (cert Tests 3, 4, 8)

Si el RatesService expone un método `batchUpdateRates(items[])`, emitir UN
SOLO event con TODAS las entries — el Builder genera 1 row outbox → Worker
hace 1 HTTP call → cumple "1 API call" del test:

```typescript
async batchUpdateRates(items: Array<{ ratePlanId, dateFrom, dateTo?, rate }>): Promise<void> {
  // ... saves locales ...

  // Resolver channexRatePlanId per item
  const ratePlans = await this.prisma.ratePlan.findMany({
    where: { id: { in: items.map((i) => i.ratePlanId) } },
    select: { id: true, propertyId: true, channexRatePlanId: true },
  })
  const planMap = new Map(ratePlans.map((p) => [p.id, p]))

  // Agrupar por property (1 event per property por la convención del Builder)
  const byProperty = new Map<string, ChannexRestrictionEntry[]>()
  for (const item of items) {
    const plan = planMap.get(item.ratePlanId)
    if (!plan?.channexRatePlanId) continue
    const list = byProperty.get(plan.propertyId) ?? []
    list.push({
      propertyId: plan.propertyId,
      ratePlanId: plan.channexRatePlanId,
      ...(item.dateTo
        ? { dateFrom: item.dateFrom, dateTo: item.dateTo }
        : { date: item.dateFrom }),
      rate: item.rate,
    })
    byProperty.set(plan.propertyId, list)
  }

  // Emit 1 event per property — Builder enqueue 1 row → Worker 1 HTTP call
  for (const [propertyId, entries] of byProperty) {
    this.events.emit(CHANNEX_RESTRICTION_UPDATED, { propertyId, entries })
  }
}
```

**Crítico para cert Tests 3, 4, 8**: NO emitir un event por item dentro de
un loop — eso generaría N rows outbox → N HTTP calls → falla el test ("1
API call"). El batching va en EL EMITTER, no en el worker (el worker drena
1 row = 1 call por contrato).

---

## RestrictionsService — qué emitir (sprint RATES-METRICS-COMPSET-CORE Day X)

Mismo patrón. Cuando se llama `setMinStay`, `setStopSell`, `setClosedToArrival`,
`batchUpdateRestrictions`, etc., emitir `CHANNEX_RESTRICTION_UPDATED` con
las entries correspondientes.

Ejemplo `setStopSell`:
```typescript
async setStopSell(input: { ratePlanId, dateFrom, dateTo?, stopSell }): Promise<void> {
  await this.prisma.restrictionRule.upsert({...})
  const ratePlan = await this.prisma.ratePlan.findUniqueOrThrow({
    where: { id: input.ratePlanId },
    select: { propertyId: true, channexRatePlanId: true },
  })
  if (!ratePlan.channexRatePlanId) return

  this.events.emit(CHANNEX_RESTRICTION_UPDATED, {
    propertyId: ratePlan.propertyId,
    entries: [{
      propertyId: ratePlan.propertyId,
      ratePlanId: ratePlan.channexRatePlanId,
      ...(input.dateTo
        ? { dateFrom: input.dateFrom, dateTo: input.dateTo }
        : { date: input.dateFrom }),
      stopSell: input.stopSell,
    }],
  })
}
```

---

## RatePlan model — campo nuevo

El sprint RATES-METRICS-COMPSET-CORE debe agregar al model `RatePlan`:

```prisma
model RatePlan {
  // ... fields existentes definidos en ese sprint ...
  channexRatePlanId  String?  @map("channex_rate_plan_id")
}
```

Razón: AP-5 mitigation — NO podemos hardcodear UUIDs de Channex en el
código. El mapping vive en DB. SUPERVISOR configura este field en
`/settings/channex/mappings` (parte del Day 6 admin UI de OUTBOUND-CERT).

---

## Tests cert que se activan al wirear esto

| Test | Status pre-wire | Status post-wire |
|---|---|---|
| 2 — single rate single date | 🔴 RatesService no emite | ✅ |
| 3 — batch multi-rate 1 call | 🔴 | ✅ |
| 4 — multi-date multi-rate 1 call | 🔴 | ✅ |
| 5 — min stay batch | 🔴 RestrictionsService no emite | ✅ |
| 6 — stop sell | 🟡 (Gateway listo, falta service) | ✅ |
| 7 — multi restrictions CTA/CTD/min/max | 🔴 | ✅ |
| 8 — half-year batch rates+restrictions | 🔴 | ✅ |

Tests 9, 10 (availability) ya están ACTIVOS — AvailabilityService ya emite
events (Day 3 wiring completado en este branch).

---

## Checklist del dev del sprint RATES

Al terminar RATES-METRICS-COMPSET-CORE, antes de mergear:

- [ ] `RatePlan.channexRatePlanId` campo agregado al schema + migration
- [ ] `RatesService` constructor inyecta `EventEmitter2`
- [ ] `RatesService.updateRate` emite `CHANNEX_RESTRICTION_UPDATED` post-save
- [ ] `RatesService.batchUpdateRates` agrupa por property y emite 1 event/property
- [ ] `RestrictionsService` constructor inyecta `EventEmitter2`
- [ ] `RestrictionsService.setMinStay/setStopSell/etc.` emiten event
- [ ] Cada emitter SKIPEA si `channexRatePlanId` es null (rate plan privado)
- [ ] Integration test: `RatesService.updateRate(...)` → outbox row aparece + worker drena + sandbox HTTP 200
- [ ] Cobertura de Tests 2-8 cert verificada con sandbox seed productivo

Estimado: **0.5-1 día-dev** una vez RatesService + RestrictionsService existen.

---

## Si por alguna razón el orden cambia

**Opción A — RATES sprint termina antes**: este branch (`feature/channex-inbound`)
ya tiene todo listo. RATES merge directo → wiring follow-up commit en
RATES branch.

**Opción B — RATES retrasado y necesitamos cert Stage 4 antes**: Test 14
declaration form puede declarar que rates/restrictions están en roadmap.
Channex acepta certs parciales si la integración INBOUND está sólida (lo
nuestro) — el partner solo no aparece como "Full ARI Compliant" hasta que
agregue el outbound restricciones.

**Opción C — Inverted**: RATES sprint agrega los emitters como parte de
su Day 7 sin esperar este handoff. La doc actual de su plan ya menciona
el sprint OUTBOUND-CERT como dependencia.
