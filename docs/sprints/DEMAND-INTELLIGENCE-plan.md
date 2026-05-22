---
Audiencia: Equipo de desarrollo Zenix · Product owner · Data engineering
Estado: Plan documentado para sprint futuro — pendiente de ejecución
Branch: feature/demand-intelligence (cuando se ejecute)
Última actualización: 2026-05-22
Sprint posterior a: RATES-METRICS-COMPSET-CORE (Phase 1 compset MVP + LocalEvents)
Disparador: necesidad estratégica de predicción de demanda basada en movimientos de vuelos hacia airports cercanos a la property + temporadas vacacionales por país de origen. Solicitado explícitamente por el owner 2026-05-22 como evolución natural del módulo de market intelligence.
---

# Sprint DEMAND-INTELLIGENCE — Predicción de demanda con flight data + seasonal intelligence

> **Misión del sprint**: convertir Zenix en un sistema con **forward-looking demand awareness** — el dashboard responde no solo "¿cuánto cobré?" sino "¿qué se viene en los próximos 30-90 días?" combinando flight inventory cerca de la property + holidays/vacation calendars de países origen + local events ya existentes + occupancy histórico. Heurístico en MVP (no ML real hasta que haya 18+ meses de data del hotel).

---

## 1. Contexto

### 1.1 El gap actual (post RATES-METRICS-COMPSET-CORE)

Tras el sprint anterior, el dashboard muestra:
- ✅ Performance pasada (ADR, RevPAR, channel mix, LOS)
- ✅ Estado actual (ocupación, llegadas, salidas, in-house)
- ✅ Forecast OTB próximos 14 días (basado solo en bookings ya confirmadas)
- ✅ Compset estado actual (manual selection, scraping DIY)
- ✅ LocalEvents con scope replicable LATAM

Lo que **falta**:
- ❌ Forward-looking demand signal **anterior a que las reservas entren** (early warning system)
- ❌ Inteligencia de temporada por país de origen
- ❌ Recomendaciones accionables basadas en demand pulse

### 1.2 Casos de uso reales

| Caso | Hoy | Con Demand Intel |
|---|---|---|
| US Spring Break (mar 8-15) | Manager lo recuerda por memoria, sube tarifas con riesgo de errar | Sistema alerta 60 días antes: "Flight volume CUN +35% vs baseline, recomendación: +15-25% rate" |
| Conferencia ITB Berlin → impacto en Cartagena | Manager no se entera | Eventbrite ingest + correlación: alerta "conferencia origen, lookback histórico muestra +12% bookings DE→CO" |
| Festival Bahidorá Tulum | Ya cubierto por LocalEvents (MVP) | Cruce con flight data USA→CUN confirma demand boost real |
| Tormenta tropical → cancelaciones masivas | Manager se entera por noticias y luego ve cancelaciones | Cruce con weather APIs + flight cancellations data → alerta temprana |
| Año Nuevo MX → US/CA pico anual | Manager sabe que existe, no la magnitud | Sistema cuantifica: "Año pasado mismo periodo: ocupación 100%, ADR $310, mediana compset $280" |

---

## 2. Investigación — APIs de vuelos evaluadas

| Proveedor | Pricing | Cobertura LATAM | Datos útiles | Fit MVP |
|---|---|---|---|---|
| **Amadeus Travel API** | $0.005-0.02/call, sandbox gratis | ✅ Excelente | Inventory + pricing + booking volume + load factor | ⭐ Recomendado primary |
| **AviationStack** | $50-300/mes flat | ✅ Buena | Real-time arrivals/departures + scheduled | Alternativa |
| **FlightAware AeroAPI** | $0.0024-0.012/call | ✅ Buena | Tracked flights, no pricing | Limitado |
| **Cirium FlightStats** | Enterprise ($2-10k/mes) | ✅ Premium | Histórico + forecasts + schedule | Out-of-scope MVP |
| **OAG Aviation Data** | Enterprise | ✅ Premium | Schedule + capacity full | Out-of-scope MVP |
| **Skyscanner Partner API** | Partner-only | ✅ | Search + pricing | Requires partnership |
| **Travelport Universal API** | Enterprise | ✅ | GDS data | Out-of-scope MVP |

**Decisión preliminar:** Amadeus Travel API para MVP (sandbox gratis + pay-as-you-go production + cobertura LATAM sólida + bien documentado). Adapter pattern análogo a `ICompsetAdapter` para swap futuro a Cirium si enterprise tier.

### 2.1 PredictHQ como adapter alternativo (NUEVO 2026-05-22)

**Trade-off importante:** si el cliente ya activó **MARKET-INTEL-PRO DLC** con `PredictHQEventAdapter` (ver [MARKET-INTEL-PRO-plan.md §2.3](MARKET-INTEL-PRO-plan.md)), PredictHQ ya provee:

- **`local_rank`** (0-100) — impacto local del evento. Reemplaza la necesidad de curator manual asignando `demandImpact`.
- **`aviation_rank`** (0-100) — impacto en demanda de vuelos al área. **Directamente correlacionable con `FlightDemandIndex`** que este sprint propone construir desde Amadeus.

Esto significa que **PredictHQ puede sustituir parcialmente la integración Amadeus** en este sprint. El `DemandScore` heurístico weighted-sum puede usar `aviation_rank` como input en lugar de calcular `FlightDemandIndex` desde Amadeus directamente.

**Decisión de diseño:**

`IFlightDataAdapter` queda como interface principal. Implementaciones:

| Adapter | Cuándo usarla |
|---|---|
| **`AmadeusFlightDataAdapter`** | MVP base. Cliente sin MARKET-INTEL-PRO Premium. Pay-as-you-go. |
| **`PredictHQFlightProxyAdapter`** | Cliente CON MARKET-INTEL-PRO Premium tier + PredictHQ activo. Usa `aviation_rank` como proxy del FlightDemandIndex, ahorra llamadas Amadeus. |
| **`CompositeFlightDataAdapter`** | Combina Amadeus (granularidad fina) + PredictHQ (impact scoring). Tier Enterprise. |

`LegalEntity.demandIntelFlightProvider` configura cuál usar. Default `AMADEUS` para clientes sin PHQ.

### 2.2 Por qué este sprint NO se merge en MARKET-INTEL-PRO

Aunque PredictHQ overlap es real, mantenemos sprints separados porque:

1. **MARKET-INTEL-PRO** entrega event ingest + Lighthouse swap + auto-radius + notifications. Producto comercial coherente $50-80/mes.
2. **DEMAND-INTELLIGENCE** entrega forward-looking demand awareness con flight data + vacation calendars + recommendations engine. Producto separado $80-150/mes.
3. Cliente puede comprar uno sin el otro. Bundle combinado tiene descuento.
4. PredictHQ adapter aparece en **ambos sprints** porque su valor cruza categorías (events ingest para MARKET-INTEL-PRO + impact scoring para DEMAND-INTELLIGENCE).

---

## 3. Conceptos clave del módulo

### 3.1 Property → Airport mapping

```prisma
model PropertyAirport {
  id              String   @id @default(uuid())
  propertyId      String   @map("property_id")
  iataCode        String   @map("iata_code")  // "CUN", "GDL", "CTG", "LIM"
  distanceKm      Decimal  @db.Decimal(6, 2) @map("distance_km")
  isPrimary       Boolean  @default(false) @map("is_primary")
  // Secondary airports relevant pero distantes (ej: TQO secondary de Tulum)

  property        Property @relation(fields: [propertyId], references: [id])

  @@unique([propertyId, iataCode])
}
```

Seed inicial: top 50 airports LATAM mapeados a properties típicas.

### 3.2 Flight Demand Index

Para cada `(propertyId, targetDate)`, calcular:

```
FlightDemandIndex(propertyId, targetDate) =
  scheduled_seats_arriving_in_window(±2 days) /
  baseline_seats_arriving_in_same_window_last_year
  × 100
```

Resultado normalizado 0-200:
- < 80 = demanda débil (-20% vs baseline)
- 80-120 = demanda normal
- 120-150 = demanda fuerte
- > 150 = demanda excepcional

Cron diario fetch para próximos 90 días, por airport.

### 3.3 Source country breakdown

```prisma
model FlightSegmentSnapshot {
  id              String   @id @default(uuid())
  iataDestination String   @map("iata_destination")
  arrivalDate     DateTime @map("arrival_date")
  sourceCountry   String   @map("source_country")  // ISO 3166-1 alpha-2
  scheduledSeats  Int      @map("scheduled_seats")
  fetchedAt       DateTime @default(now()) @map("fetched_at")
  source          String   // AMADEUS | AVIATIONSTACK | etc.

  @@unique([iataDestination, arrivalDate, sourceCountry, fetchedAt])
  @@index([iataDestination, arrivalDate])
  @@map("flight_segment_snapshots")
}
```

Permite al manager ver: "Para sábado 27 may, llegan 1,200 asientos desde USA (vs 950 baseline = +26%), 800 desde Canadá (+15%), 200 desde España (baseline)."

### 3.4 Vacation calendar (source countries)

Tabla curada per país:
- USA: Spring Break (state-by-state March 8-22), Memorial Day, July 4th, Labor Day, Thanksgiving, Christmas
- Canada: March Break, Victoria Day, Canada Day, Civic Holiday, Thanksgiving (October)
- España/EU: Semana Santa, agosto vacaciones, Christmas, Three Kings
- México: Semana Santa, vacaciones de verano, Día de Muertos, Navidad

```prisma
model VacationPeriod {
  id              String   @id @default(uuid())
  countryCode     String   @map("country_code")
  regionCode      String?  @map("region_code")     // para state-by-state US
  name            String   // "US Spring Break - Texas", "Mexico Christmas Holiday"
  startDate       DateTime
  endDate         DateTime
  yearApplicable  Int      @map("year_applicable")  // 2026, 2027, etc.

  curatedById     String?
  source          String   @default("CURATED")

  @@index([countryCode, startDate])
  @@map("vacation_periods")
}
```

### 3.5 Combined Demand Score

```
DemandScore(propertyId, targetDate) =
  weighted_sum:
    0.35 × FlightDemandIndex(propertyId, targetDate)
    0.25 × OccupancyHistorical_YoY(propertyId, targetDate)  // requiere ≥1 año historia
    0.20 × LocalEvent.impact(propertyId, targetDate)
    0.10 × VacationOverlap(targetDate, source_countries)
    0.10 × CompsetMedianRate_delta(propertyId, targetDate)
```

Normalizado 0-100. Threshold sugeridos:
- 0-40: Low demand → considerar discount/promo
- 40-60: Normal
- 60-80: High → mantener tarifa o subir ligeramente
- 80-100: Critical → aplicar premium pricing

**MVP es heurístico** con weights fijos. v2 podría usar ML cuando haya historia suficiente.

---

## 4. Recommendations engine

Genera sugerencias (NO auto-aplica) basadas en `DemandScore + RateContext`:

```ts
generateRecommendations(propertyId, dateRange): Recommendation[] {
  [
    {
      type: 'RATE_INCREASE',
      targetDate: '2026-12-26',
      currentRate: '$130',
      suggestedRate: '$185',
      confidence: 0.82,
      drivers: [
        { factor: 'flight_demand', score: 145, label: 'US arrivals +45% vs baseline' },
        { factor: 'vacation_overlap', score: 100, label: 'US Christmas + MX vacaciones' },
        { factor: 'local_event', score: 90, label: 'Fin de Año Tulum' },
        { factor: 'compset_median', score: 165, label: 'Compset median +$45' },
      ],
      action: 'Considera subir tarifa a $185 (+42%)',
      dismissedBy: null,
      acceptedBy: null,
    },
    ...
  ]
}
```

UI: card en dashboard con recomendaciones del día (sortable por confidence). Manager puede:
- ✅ Aceptar (aplica rate override automático con audit)
- ✏️ Editar y aplicar (rate manual con sugerencia preservada en metadata)
- ❌ Rechazar con reason opcional (feedback loop para mejorar)

---

## 5. Plan de implementación (~30-40 días-dev)

> **Sprint largo.** Recomendable splitear en 2-3 milestones internos.

### Milestone 1 (10 días) — Flight data backend

- Modelos `PropertyAirport`, `FlightSegmentSnapshot`
- `IFlightDataAdapter` interface
- `AmadeusFlightDataAdapter` con auth + retry + rate limit
- Cron daily fetch para próximos 90 días por airport activo
- Tests con sandbox Amadeus
- Backfill helper

### Milestone 2 (8 días) — Vacation calendars + Demand score

- Modelo `VacationPeriod`
- Seed inicial: 2026-2028 holidays USA/CA/España/UE/MX
- `DemandScoreService` con heurístico weighted-sum
- Endpoint `GET /v1/properties/:id/demand-score?from&to`
- Cache + invalidation strategy

### Milestone 3 (7 días) — Recommendations engine

- `RecommendationsService` con generación + scoring + ranking
- Modelos `Recommendation` + `RecommendationFeedback`
- Cron daily generation
- API endpoints (list, accept, edit, dismiss)
- Feedback loop logging para iteración futura

### Milestone 4 (10 días) — Dashboard UI + integration

- Card "Demand Pulse" con score + heatmap 30/60/90 días
- Recommendations card con accept/edit/dismiss
- Drill-down modal con drivers desglosados
- Integration con LocalEvents card existente
- Mobile responsive

### Milestone 5 (5 días) — QA + docs

- Tests E2E flow completo
- ADR-XXX adapter pattern flight data
- Runbook operations
- CLAUDE.md decisiones D-DEMAND1..10
- Pricing positioning v1.1.x+ DLC

**Total: 30-40 días-dev. ~7-9 semanas con 1 dev, ~3-4 semanas con 2 devs paralelos backend/frontend.**

---

## 6. Pricing comercial

**DLC tier "Demand Intelligence Premium"** (post v1.1.x DLC Market Intel Pro):

| Tier | Precio | Incluido |
|---|---|---|
| **Market Intel Pro** | $50-80/property/mes | Compset Lighthouse + Eventbrite ingest (sprint anterior) |
| **Demand Intelligence Premium** | $80-150/property/mes | Flight APIs + Vacation calendars + Demand Score + Recommendations engine |
| **Combined bundle** | $120-200/property/mes | Ambos |

Cost basis: Amadeus API ~$30-50/property/mes en consumo. Resto = margen + soporte.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| Amadeus API costo escala mal con muchas properties | Cache agresivo (24h por propertyId, airport, fetch window). Backfill incremental. |
| ML modelo no es realista hasta tener ≥18m historia | MVP es heurístico con weights fijos. ML como upgrade v2. |
| Recommendations "wrong" pierden trust del manager | Confidence score visible + accept/dismiss + feedback loop. Si confidence < 0.7, no mostrar. |
| Datos de vuelo no son proxy directo de booking demand | Documentar limitaciones. Correlación histórica per property a 6m+ valida o invalida |
| Vacation calendars desactualizados | Curator role explícito. Seed 3 años forward. Renovación anual programada. |
| Cross-border legal (GDPR para data EU origin) | Datos agregados de inventory NO contienen PII. OK. |

---

## 8. Decisiones no-negociables (a registrar en sprint kickoff)

- **D-DEMAND1**: Heurístico fijo en MVP, NO ML hasta 18m historia
- **D-DEMAND2**: Recommendations son sugerencias, NUNCA auto-applied sin user consent
- **D-DEMAND3**: Adapter pattern para flight data (analog ICompsetAdapter)
- **D-DEMAND4**: Vacation calendars curados (analog Tax Curator + Events Curator)
- **D-DEMAND5**: Drivers visibles (transparency) - cada score muestra qué factores contribuyen
- **D-DEMAND6**: Confidence threshold mínimo 0.7 para mostrar recomendación
- **D-DEMAND7**: Feedback loop (accept/dismiss + reason) persistido para iteración
- **D-DEMAND8**: Property→Airport mapping configurable (no auto detectado por lat/lng en MVP)
- **D-DEMAND9**: Cache agresivo (24h+) para minimizar costo API
- **D-DEMAND10**: Disclaimer permanente "Predicción heurística. Cliente toma decisión final."

---

## 9. Dependencies

```
v1.0.x RATES-METRICS-COMPSET-CORE ──┐
                                     │
v1.1.x Market Intel Pro DLC ─────────┼──→ v1.1.x+ DEMAND-INTELLIGENCE
                                     │       (consume: LocalEvents +
v1.0.3 REPORTS-CORE (historia data) ─┘        MetricsDailySnapshot)
```

---

## 10. References

### Aviation data
- Amadeus Travel APIs documentation
- AviationStack pricing & docs
- FlightAware AeroAPI
- IATA airport codes

### Demand forecasting
- HFTP Revenue Management Handbook 2023
- Cornell University Hotel School - Forecasting in Hospitality (academic)
- Smith Travel Research demand methodology

### Internas
- [docs/sprints/RATES-METRICS-COMPSET-CORE-plan.md](RATES-METRICS-COMPSET-CORE-plan.md) — sprint anterior
- [docs/vision/03-roadmap-v1-v2.md](../vision/03-roadmap-v1-v2.md)

---

**Status:** Plan documentado. Ejecución cuando: (1) RATES-METRICS-COMPSET-CORE esté merged, (2) haya ≥6m historia de bookings del piloto, (3) decisión comercial confirme tier "Demand Intelligence Premium". Estimado calendar: Q4 2026 - Q1 2027.
