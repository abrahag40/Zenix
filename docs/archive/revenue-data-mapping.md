# Revenue Card Data Mapping — How each frame is computed

> Documento educativo + plan de implementación para conectar el
> `RevenueCarouselCard` a datos reales de la BD.
>
> Tu pregunta literal: *"explícame con datos reales cómo vamos a sacar
> la data... no tenemos por ahora preparada la BD para eso. Yo no sé
> nada de ADR, RevPAR o forecast."*

---

## Parte 1 — Conceptos en lenguaje claro

### ADR — Average Daily Rate (Tarifa Promedio Diaria)

**Qué es:** *"¿En promedio cuánto le cobramos a cada habitación que VENDIMOS hoy?"*

```
ADR = SUMA(precio × noches vendidas hoy) / habitaciones vendidas hoy
```

Ejemplo:
- Hoy vendiste 11 habitaciones
- 8 a $1,500 MXN, 3 a $1,650 MXN
- Total revenue de hoy: 8×1500 + 3×1650 = $16,950
- ADR = $16,950 / 11 = **$1,540 MXN**

**Por qué importa:** mide tu poder de pricing. Si tu ADR sube, estás
cobrando más por noche (mejor). Si baja, estás descontando. Es la
métrica #1 que mira un revenue manager.

---

### RevPAR — Revenue Per Available Room (Ingreso por Habitación Disponible)

**Qué es:** *"¿Cuánto ingreso me dio CADA HABITACIÓN del inventario, vendida o no?"*

```
RevPAR = revenue total habitaciones / habitaciones disponibles totales
       = ADR × Ocupación%
```

Ejemplo:
- Tienes 22 habitaciones disponibles
- Vendiste 11 (50% ocupación) a un ADR de $1,540
- RevPAR = $16,950 / 22 = **$770 MXN**
- Igual: $1,540 × 50% = $770

**Por qué importa:** un ADR alto con baja ocupación es engañoso. RevPAR
te dice si estás monetizando el inventario completo. Combina precio
y volumen en un solo número.

---

### Forecast — proyección de revenue futuro

**Qué es:** *"Si las reservas confirmadas + el patrón histórico se cumple,
¿cuánto facturaré esta semana?"*

```
Forecast semanal = SUMA(revenue confirmado próximos 7 días)
                 + SUMA(estimado de huecos basado en pickup histórico)
```

Para Sprint 9 implementaremos solo la primera parte (revenue confirmado).
La segunda parte (predicción ML) es V1.2+.

---

## Parte 2 — Mapeo BD → cada frame del Revenue Carousel

Para cada uno de los 7 frames, esta es la tabla:

| ¿Qué necesita la BD? | ¿Lo tenemos hoy? | Qué falta |
|----------------------|-------------------|-----------|

### Frame 1 — INGRESOS HOY ✅ Listo hoy

**Datos:**
- `projectedAmount` = SUMA todos los `totalAmount` de `GuestStay` cuyo `checkIn ≤ hoy AND checkOut > hoy`
- `collectedAmount` = SUMA `PaymentLog.amount` de hoy donde `isVoid = false`
- `pendingFolios` = COUNT `GuestStay.paymentStatus IN ('UNPAID', 'PARTIAL')` con `checkIn ≤ hoy`
- `deltaPercentVsYesterday` = (revenue hoy / revenue ayer - 1) × 100

**¿Lo tenemos?** Sí. `GuestStay` y `PaymentLog` ya existen.

**Endpoint Sprint 9:** `GET /v1/reports/revenue?date=YYYY-MM-DD`

```sql
-- pseudo-Prisma
const today = startOfDayInPropertyTz(propertyId)
const stays = await prisma.guestStay.findMany({
  where: { propertyId, checkIn: { lte: today }, checkOut: { gt: today } }
})
const projected = stays.reduce((sum, s) => sum + Number(s.totalAmount), 0)
```

---

### Frame 2 — ADR HOY ⚠️ Falta agregación

**Datos necesarios:**
- `roomRevenue` = SUMA `ratePerNight` de todas las estadías activas hoy
- `roomsSold` = COUNT distintas habitaciones vendidas hoy

**¿Lo tenemos?** Sí, ambos campos existen en `GuestStay`. Solo falta el cálculo:

```ts
const adr = roomRevenue / Math.max(roomsSold, 1)
```

**Importante:** ADR considera SOLO room revenue, no extras (F&B, transfers).
Como Zenix solo factura habitaciones por ahora, el cálculo es directo.

---

### Frame 3 — RevPAR HOY ⚠️ Falta total disponibilidad

**Datos necesarios:**
- `roomsAvailable` = COUNT `Room` activas en la propiedad (descontando bloqueos)
- `roomRevenue` (igual que ADR)

**¿Lo tenemos?** Mostly:
- `Room.isActive` ya marca habitaciones operativas
- `RoomBlock` ya marca bloqueos activos

```ts
const totalRooms = await prisma.room.count({ where: { propertyId, isActive: true } })
const blockedToday = await prisma.roomBlock.count({
  where: { propertyId, startsAt: { lte: today }, endsAt: { gte: today } }
})
const available = totalRooms - blockedToday
const revPar = roomRevenue / Math.max(available, 1)
```

**Listo en Sprint 9 sin nuevos campos.**

---

### Frame 4 — CANAL TOP HOY ⚠️ Falta agrupación

**Datos necesarios:**
- Revenue agrupado por `GuestStay.source`

**¿Lo tenemos?** Sí. `GuestStay.source` es un string libre hoy
(`'BOOKING'`, `'AIRBNB'`, etc.).

```ts
const byChannel = await prisma.guestStay.groupBy({
  by: ['source'],
  where: { propertyId, checkIn: { lte: today }, checkOut: { gt: today } },
  _sum: { totalAmount: true },
  _count: true,
})
```

**Recomendación:** convertir `source` en enum `BookingSource` con valores
fijos en Sprint 9. Reduce typos en data y permite el group-by limpio.

---

### Frame 5 — COMISIONES OTA HOY ❌ Falta nuevo campo

**Datos necesarios:**
- Comisión por canal (% por OTA): Booking 15%, Airbnb 14-16%, Expedia 18-22%

**¿Lo tenemos?** No. Necesitamos:

1. **Nuevo modelo** `ChannelCommission`:
   ```prisma
   model ChannelCommission {
     id           String       @id @default(uuid())
     propertyId   String
     source       String       // 'BOOKING' | 'AIRBNB' | etc
     ratePercent  Decimal      @db.Decimal(5,2)  // 15.00, 18.50
     effectiveFrom DateTime
     effectiveUntil DateTime?
     property     Property @relation(fields: [propertyId], references: [id])
   }
   ```

2. **Cálculo:**
   ```ts
   const commissions = byChannel.map(c => ({
     source: c.source,
     revenue: Number(c._sum.totalAmount),
     commission: Number(c._sum.totalAmount) * (rateFor(c.source) / 100)
   }))
   ```

**Plan:** crear el modelo en Sprint 9 + UI de configuración en Settings
(la tabla la llena el admin la primera vez por propiedad).

**Alternativa rápida (Sprint 8 stub):** hardcodear en `PropertySettings`
un JSON `{ BOOKING: 15, AIRBNB: 15, EXPEDIA: 18 }` y leerlo. Migración
a `ChannelCommission` en V1.1.

---

### Frame 6 — CAJA RECEPCIÓN ✅ Listo hoy

**Datos necesarios:**
- SUMA `PaymentLog.amount` del turno actual donde `method='CASH' AND !isVoid`

**¿Lo tenemos?** Sí. `PaymentLog` (USALI 12ª ed.) ya está implementado
con `shiftDate`, `method`, `isVoid`. El endpoint `GET /cash-summary`
ya existe en `GuestStaysService` (Sprint 8).

**Solo falta:** wiring del frame al endpoint existente.

---

### Frame 7 — FORECAST SEMANA ⚠️ Necesita cálculo, no schema

**Datos necesarios:**
- SUMA `totalAmount` de stays cuyo rango toca [hoy, hoy+7d]
- Meta semanal (configurable por propiedad)

**¿Lo tenemos?**
- Datos de stays: sí.
- Meta: necesitamos agregar `PropertySettings.weeklyRevenueTarget Decimal?`.

**Plan Sprint 9:**
```sql
const weekStays = await prisma.guestStay.findMany({
  where: { propertyId, checkIn: { lte: weekEnd }, checkOut: { gt: today } }
})
const forecast = weekStays.reduce((sum, s) => {
  // Prorrate over the days within the window
  const overlapDays = daysWithinRange(s.checkIn, s.checkOut, today, weekEnd)
  const totalNights = differenceInDays(s.checkOut, s.checkIn)
  return sum + (Number(s.totalAmount) * overlapDays / totalNights)
}, 0)
```

---

## Parte 3 — Resumen ejecutivo

| Frame | Implementable Sprint 9 con BD actual | Necesita schema nuevo |
|-------|--------------------------------------|------------------------|
| 1 INGRESOS HOY | ✅ 100% | No |
| 2 ADR HOY | ✅ 100% | No |
| 3 RevPAR HOY | ✅ 100% | No |
| 4 CANAL TOP | ✅ 100% (pero recomendable enum) | Opcional: enum BookingSource |
| 5 COMISIONES OTA | ⚠️ 50% — necesita rates | Sí: `ChannelCommission` o JSON en PropertySettings |
| 6 CAJA RECEPCIÓN | ✅ 100% | No |
| 7 FORECAST SEMANA | ⚠️ 80% | Sí: `PropertySettings.weeklyRevenueTarget` |

**5 de 7 frames son listos hoy.** Los 2 que faltan requieren:
- 1 modelo nuevo (`ChannelCommission`) — 30 min
- 1 campo nuevo (`weeklyRevenueTarget`) — 5 min
- 1 endpoint agregador (`GET /v1/reports/revenue-snapshot`) — 1-2h

---

## Parte 4 — Plan de implementación Sprint 9

1. **Migración Prisma** (1 chunk):
   - Crear `ChannelCommission` model
   - Agregar `PropertySettings.weeklyRevenueTarget`

2. **Endpoint** `GET /v1/reports/revenue-snapshot?date=...` (2 chunks):
   - Returns `RevenueFrame[]` con los 7 frames pre-formateados
   - Service method `RevenueReportService.snapshot(propertyId, date)`
   - Privacy: 401 si actor.role === HOUSEKEEPER

3. **Mobile** (1 chunk):
   - Reemplazar `MOCK_REVENUE_FRAMES` con `useQuery({ queryKey: ['revenue-snapshot'], queryFn: () => api.get('/reports/revenue-snapshot') })`
   - Refresh cada 5 min (staleTime)

4. **Admin UI Settings** (1 chunk, opcional):
   - Página simple para configurar comisiones OTA por canal
   - Configurar meta semanal

---

## Parte 5 — Glosario para el resto del equipo

Si alguien más mira el código y se pregunta:

- **ADR** = lo que cobramos en promedio por habitación vendida
- **RevPAR** = lo que ganamos en promedio por habitación disponible (vendida o no)
- **Forecast** = proyección de ingreso esperado en una ventana futura
- **Pickup** = ritmo al que se llenan las habitaciones día a día
- **Folio** = la cuenta de un huésped (cargos + pagos durante su estadía)
- **Comisión OTA** = porcentaje que Booking/Airbnb/Expedia se queda de cada reserva que nos manda

---

## Referencias

- USALI 12ª edición, AHLEI 2024 — definiciones canónicas de ADR/RevPAR
- STR Global — *Hotel Revenue Metrics Glossary* (industry-standard)
- Hotel Tech Report 2024 — *Revenue Management Software Trends*
- *Revenue Management for the Hospitality Industry* — Hayes, Miller (2011)
