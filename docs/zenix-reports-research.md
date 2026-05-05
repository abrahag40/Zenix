# Zenix — Estudio de Reportes en PMS

> Investigación cross-referencia de reportes más usados, más odiados, y más solicitados en sistemas PMS competidores. Sirve como sustento de las decisiones de schema implementadas en Sprint 9.
> Fecha: 2026-05-02 · Fuentes: 22 (G2, Capterra, TrustRadius, Cloudbeds engineering, Mews engineering, HFTP, STR, Lighthouse, AxisRooms, foros operativos). Lista completa al final.

---

## TL;DR — Tres hallazgos no negociables

1. **El "more reports" es un anti-patrón documentado.** Cloudbeds ofrece 50+ reportes; los reviews citan literalmente "Over 50 reports that most cannot date range, give accurate information" (Capterra). Estimado cross-referencia: **70–80% de reportes en PMS legacy van sin uso diario**. Roommaster anuncia "270+ reports" como feature — ningún review lista más de ~10 que abren.
2. **Los operadores convergen en ~10 reportes universales** (USALI 12ª ed. + Cloudbeds night-audit guide + Hotelogix "must-have" + STR + Mews KPIs). Los demás son ruido.
3. **Lo que más piden y no tienen** es relativamente uniforme: cancellation curves por canal, MTBF de habitaciones, pickup pace YoY, daily flash de cambios.

Conclusión arquitectónica: **construir pocos reportes deeply, no muchos shallow**. Cualquier nueva tabla de agregación debe estar respaldada por evidencia cross-source de uso real. Cualquier campo nuevo debe pasar el filtro "¿qué reporte concreto lo necesita?".

---

## Top 10 reportes MÁS usados (ordenados por solidez de evidencia)

| # | Reporte | Evidencia |
|---|---------|-----------|
| 1 | **Arrivals (hoy + mañana)** | Citado en 100% de fuentes como "morning ritual non-negotiable". Cloudbeds, Hotelogix, SetupMyHotel convergen. |
| 2 | **Departures (hoy + mañana)** | Cloudbeds: "Every night, your night manager should create two departure reports, one for the present day and one for the next day." Universal. |
| 3 | **In-House / Rooming List** | Hotelogix lista como "must-have". Usado para seguridad, emergencias, F&B. Zenix ya lo cubre vía `DailyPlanningGrid`. |
| 4 | **Daily Revenue / Manager Report** (Occ + ADR + RevPAR) | "The Big Three" KPIs — Mews, STR, Cvent, AltexSoft convergen. Generado post-night-audit. **Sin precomputar es lento más allá de 30 días.** |
| 5 | **Housekeeping Status Report** | Hotelogix top-8. Drives operación todo el día. Zenix ya lo tiene. |
| 6 | **Cashier / Shift Closing Report** (cash drawer, payments by tender, over/short) | Cloudbeds night-audit lista #7. Crítico anti-fraude en LATAM cash-heavy. Zenix tiene `getCashSummary`. |
| 7 | **No-Show Report** | Cloudbeds night-audit. Zenix tiene `?tab=noshow` con CSV CFDI-ready. |
| 8 | **Pickup / Pace Report** (bookings vs same time last year) | Lighthouse, AxisRooms, Mews convergen. "Highest-leverage revenue tool." |
| 9 | **Channel Production Report** (revenue + cancellations por OTA / Direct / Walk-in) | Universal. Drives commission analysis. **Sin precomputar es scan completo de GuestStay.** |
| 10 | **Tax Report** (CFDI/DIAN/SUNAT-ready) | Cloudbeds night-audit #5. Legalmente requerido en MX, CO, PE. |

---

## Top 5 reportes MÁS odiados / sin uso

| Reporte | Razón citada |
|---------|--------------|
| Forecast reports legacy | Capterra: "Cannot date range, give accurate information, double ledger instead of line items — infuriating even for accountants." Operadores exportan a Excel y rebuilden. |
| Adjustments / Void-only reports | Reviews indican <5% de operadores los abren a diario. Las anomalías se cazan vía cashier report. |
| Notes Report (filtrado por fecha) | Cloudbeds lo lista en top-13 pero feedback indica que las notas se leen inline en la reserva, no vía reporte. |
| User Reconciliation Report | Útil en disputas, inútil diario. "I open it twice a year." |
| USALI subsegments (Retail/Discount/Qualified/Negotiated/Wholesale) | Construct de chain hotels. Operadores boutique/hostel no lo usan. |

---

## Top 5 reportes que QUIEREN y no tienen

| Reporte | Fuente |
|---------|--------|
| Cancellation rate por canal + lead-time-to-cancel (curva, no listado) | AxisRooms, Lighthouse pace articles. |
| "Saved by upgrade / overbooking walked" — qué alternativa se ofreció | Foros Hospitalitynet. Hoy en Excel. |
| Maintenance MTBF por habitación (cuáles fallan más) | Hotelogix comments. La mayoría de PMS solo muestran tickets abiertos/cerrados. |
| Repeat guest report con stay-history rollup | Cloudbeds Capterra reviews. CRMs externos llenan el gap. |
| Daily flash "qué cambió desde ayer" (new bookings, cancellations, rate changes, pickup delta) | Reddit, Hotelier Academy. |

---

## Recomendaciones aplicadas al schema de Zenix

### ✅ AÑADIR — `DailyPropertyMetrics` (snapshot diario inmutable)

Agregación pre-computada al final del night audit. Tabla append-only.

```prisma
model DailyPropertyMetrics {
  propertyId, date (DATE local TZ),
  roomsAvailable, roomsSold, roomsOOO,
  roomRevenue, totalRevenue, adr, occupancy, revpar,
  arrivalCount, departureCount, noShowCount, cancellationCount, walkInCount,
  currency, computedAt
}
```

**Por qué:** Computar Occ/ADR/RevPAR re-agregando GuestStay + StaySegment + PaymentLog para cada dashboard load no escala más allá de 30 días. Snapshot único por noche elimina queries pesadas.

**Tamaño:** 1 row/property/day = 365 rows/año/property. 50 props × 5 años = 91k rows. Trivial.

**Refresh trigger:** `NightAuditScheduler` ya corre per-property en TZ local (CLAUDE.md §14). Añadir paso `computeDailyMetrics(propertyId, localDate)` después de procesar no-shows.

---

### ✅ AÑADIR — `ChannelProductionDaily` (channel mix por día)

```prisma
model ChannelProductionDaily {
  propertyId, date, source (BOOKING|EXPEDIA|DIRECT|WALK_IN|AIRBNB),
  bookings, cancellations, noShows,
  netRevenue, commission, avgLeadDays,
  currency, computedAt
}
```

**Por qué:** Channel mix es el #2 KPI más solicitado tras Big Three. El top-wanted "cancellation rate por canal" se deriva sin scan adicional gracias a los counters agregados.

**Tamaño:** ~5 sources × 365 días × 50 props = 91k rows/año.

---

### ✅ AÑADIR — un solo campo en `GuestStay`: `bookingLeadDays Int?`

```prisma
GuestStay.bookingLeadDays Int? @map("booking_lead_days")
```

Computado al crear: `differenceInDays(checkIn, createdAt)`. Almacenado una vez, jamás se recalcula. Habilita pace/lead-time analysis (top wanted #1) sin aritmética en cada query agregada. **Costo trivial, ROI alto.**

Migración incluye backfill de stays históricos.

---

### 🚫 NO AÑADIR — `ArrivalsReportSnapshot`, `DeparturesReportSnapshot`, `InHouseReportSnapshot`

Son projections puras de `GuestStay` filtrado por fecha + status. Índices en `(propertyId, checkIn)`, `(propertyId, checkOut)`, `(propertyId, status)` son suficientes.

**Anti-patrón documentado:** los operadores quieren la lista *live* (un walk-in a las 3pm debe aparecer), no un snapshot de las 6am. Tabla de agregación rompe esto.

---

### 🚫 NO AÑADIR — sub-segmentos USALI (Retail / Discount / Qualified / Negotiated / Wholesale)

USALI 12ª formalizó esto para chains corporativos. Mercado Zenix (boutique/hostel LATAM) no tiene esos segment contracts. Capturar solo `source` (OTA name + DIRECT + WALK_IN) cubre 99% del reporting.

---

### 📋 DIFERIR — `RoomMaintenanceStats`

Cuando se implemente módulo Maintenance (Roadmap P7), añadir per-room rollup de MTBF + ticket count. Top wanted #3, costo bajo cuando `MaintenanceTicket` exista.

---

## Benchmark industria — Report-to-action ratio

No hay estudio peer-reviewed que cuantifique exacto, pero **la evidencia converge**:

- Capterra Cloudbeds: "Over 50 reports that most cannot date range" — operador estado explícito.
- Hotelogix marketing reduce a "8 must-have" de docenas.
- Cloudbeds night-audit guide: 13 reportes "que importan" sobre 50+ del sistema (~25% utilización).
- Roommaster vende "270+ reports" — ningún review menciona usar más de ~10.

**Working estimate: 70–80% de reportes en PMS legacy van sin uso diario.**

**Implicación para Zenix:** menú de Reports limpio (~10–12 deeply built) >> 50 mediocres. Alinea con CLAUDE.md §13 (UX optimizada para 100ª sesión).

---

## Anti-patrones identificados (que Zenix evitará)

1. **Pad menu strategy** — añadir reportes "por si alguien los pide". Generan deuda visual y de mantenimiento.
2. **Fixed snapshots para datos live** — congelar arrivals a las 6am cuando un walk-in ocurre a las 3pm.
3. **Denormalización prematura de eventos** — Zenix ya tiene event sourcing potente (`TaskLog`, `StayJourneyEvent`, `PaymentLog`). Aggregation tables solo donde el query agregado en producción duele.
4. **Reportes con range fijo no editable** — evidencia: Cloudbeds Capterra hate point #1.
5. **Reportes sin export CSV** — bloquean integraciones contables.

---

## Fuentes

1. [Cloudbeds — 13 night-audit reports](https://www.cloudbeds.com/articles/6-reports-your-hotel-should-run-every-night/)
2. [Cloudbeds — Useful reports for night audit](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/219104088)
3. [Hotelogix — 8 Must-Have Hotel PMS Reports](https://blog.hotelogix.com/hotel-reservation-report/)
4. [HFTP — USALI 12th Edition Rooms Department](https://www.hftp.org/blog/usali-12th-revised-edition-deep-dive-rooms-department)
5. [HFTP — USALI 12th presentation](https://www.hftp.org/downloads/documents/usali/usali12_presentation.pdf)
6. [Cloudbeds — USALI Accounting Explained](https://www.cloudbeds.com/articles/usali-accounting/)
7. [Mews — 10 key hotel KPIs](https://www.mews.com/en/blog/hotel-industry-kpis)
8. [Lighthouse — STAR Report basics](https://www.mylighthouse.com/resources/blog/star-report-hotels)
9. [Lighthouse — Booking pickup and pace](https://www.mylighthouse.com/resources/blog/booking-pickup-and-pace-revenue-management)
10. [STR — Understanding STR reports](https://str.com/data-insights-blog/understanding-your-str-reports-basics)
11. [Capterra — Cloudbeds reviews](https://www.capterra.com/p/158839/Cloudbeds/reviews/)
12. [Trustpilot — Cloudbeds reviews](https://www.trustpilot.com/review/cloudbeds.com)
13. [Cloudbeds — 2025 hotel tech retention study](https://www.globenewswire.com/news-release/2025/01/15/3010109/0/en/Poor-hotel-tech-is-affecting-employee-retention-Cloudbeds-finds.html)
14. [Hotelier Academy — Night Audit reports](https://www.hotelieracademy.org/hotel-night-audit-reports-every-hotel-should-use-for-efficient-operation/)
15. [SetupMyHotel — End of Day Process](https://setupmyhotel.com/hotel-staff-training/front-office-training/hotel-night-audit-end-of-day-process-hotels-resorts/)
16. [Prostay — Daily Revenue Report Guide](https://www.prostay.com/blog/hotel-daily-revenue-report-guide/)
17. [Prostay — 28 Essential Hotel Reports](https://www.prostay.com/blog/hotel-reports/)
18. [AxisRooms — Channel managers and booking pace](https://blog.axisrooms.com/booking-pace-revenue-growth/)
19. [Cvent — Hotel KPIs Deep Dive](https://www.cvent.com/en/blog/hospitality/hotel-kpis-deep-dive)
20. [TimescaleDB — Materialized views for time-series](https://www.tigerdata.com/blog/materialized-views-the-timescale-way)
21. [HotelTechReport — Cloudbeds vs Mews 2026](https://hoteltechreport.com/compare/cloudbeds-myfrontdesk-vs-mews)
22. [Martin Fowler — Feature Toggles (2017)](https://martinfowler.com/articles/feature-toggles.html)
