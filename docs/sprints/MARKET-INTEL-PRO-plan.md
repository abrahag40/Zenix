---
Audiencia: Equipo de desarrollo Zenix · Product owner · Comercial · Asesoría legal
Estado: Plan documentado para sprint futuro — pendiente de aprobación + kickoff comercial
Branch: feature/market-intel-pro (cuando se ejecute)
Última actualización: 2026-05-22
Sprint posterior a: RATES-METRICS-COMPSET-CORE (MVP de compset + LocalEvent con scope replicable)
Disparador: el sprint MVP entrega manual events curation + scraping DIY compset. La evolución natural es (a) ingest automático de eventos desde Ticketmaster/PredictHQ/Calendarific/etc., (b) swap del scraper DIY a Lighthouse partnership, (c) auto-radius compset detection, (d) push notifications de cambios. Solicitado explícitamente por el owner 2026-05-22.
---

# Sprint MARKET-INTEL-PRO — Lighthouse partnership + Event ingest automático + Auto-radius + Push notifications

> **Misión del sprint**: convertir el módulo de market intelligence del MVP (manual + scraping DIY) en un **producto DLC tier Pro robusto** con: (1) **Event ingest automático** desde 5+ APIs (Ticketmaster, Calendarific, Nager.Date, Bandsintown, Songkick) con deduplication + Curator approval queue; (2) **Swap del compset scraper DIY → Lighthouse partnership** vía adapter (cero refactor de runtime); (3) **Auto-radius compset detection** opcional para el manager que no quiere seleccionar manualmente; (4) **Push notifications** de cambios relevantes (competitor changed rate, evento nuevo detectado, demand spike). Tier comercial: USD $50-80/property/mes.

---

## 1. Contexto y motivación

### 1.1 Estado al kickoff (post RATES-METRICS-COMPSET-CORE merged)

| Componente | Estado | Limitación |
|---|---|---|
| `LocalEvent` con scope 4-niveles | ✅ Implementado | Solo `source=MANUAL` — Events Curator interno mantiene catálogo manualmente |
| `ICompsetAdapter` interface | ✅ Implementado | Solo `ScraperDiyCompsetAdapter` activo. Lighthouse adapter es stub |
| `CompsetSnapshot` daily | ✅ Implementado | Manager debe pre-seleccionar 3-7 competidores manualmente |
| Dashboard compset card | ✅ Implementado | Sin alertas push cuando competidor cambia |
| Adapter pattern `LegalEntity.compsetProvider` | ✅ Implementado | Swap configurable pero adapter destino no existe aún |

### 1.2 Razones para sprint dedicado (no expansión inline del MVP)

1. **Compromiso comercial**: el sprint MVP cobra $0 (bundled v1.0.x). Este sprint es DLC pago $50-80/property/mes. Justifica trabajo dedicado.
2. **Complejidad de deduplication**: ingest desde 5 fuentes diferentes que pueden cubrir el mismo evento exige algoritmo de fuzzy-match cuidadoso + cross-reference table. No es trabajo "agregar otro adapter rápido".
3. **Lighthouse partnership** requiere onboarding comercial 4-8 semanas en paralelo al dev. Mejor manejar como sprint independiente.
4. **Push notifications config** = nuevo módulo de preferencias UI + integration con notification center existente. No trivial.

### 1.3 Owner instruction (2026-05-22)

> "Vamos a comenzar el sprint inmediatamente; me gustaría dejar todo esto documentado sin descartar ninguna de las herramientas mencionadas."

Este documento captura **todas** las plataformas evaluadas (Opción C standalone) **dentro** del scope del sprint Pro (Opción A) **y referencia** la integración con DEMAND-INTELLIGENCE (Opción B). Cero descarte.

---

## 2. Investigación exhaustiva de plataformas de eventos

### 2.1 Tabla maestra de proveedores (mayo 2026)

| Proveedor | API pública | Free tier | Paid tier | Cobertura LATAM | Categorías cubiertas |
|---|---|---|---|---|---|
| **Ticketmaster Discovery API v2** | ✅ REST JSON | 5,000 calls/día, 5/seg | Volume-negotiated | ✅ MX✅✅, AR✅✅, CO✅, CL✅, PE⚠️, otros⚠️ | Concerts, sports, theater, family, arts, miscellaneous |
| **PredictHQ** | ✅ REST JSON | Trial 14 días | $200-1,000+/mes/property | ✅✅ Global excelente | 19 categorías: concerts, festivals, conferences, public holidays, school holidays, observances, sports, severe weather, terror/disaster, airport delays, expected attendance, predicted attendance, local rank, aviation rank |
| **Eventbrite Platform API** | ⚠️ Restringido desde 2020 | Solo events del organizer propio | N/A público | ✅ | Eventos del organizer únicamente — **NO sirve para discovery** |
| **Songkick API** | ⚠️ Partner-only | Acceso negociado | Volume | ⚠️ Limitada — mejor USA/EU | Conciertos + tours de artists |
| **SeatGeek Public API** | ✅ REST JSON | 1,000 calls/hora | Volume | ❌ US-focused | Sports, conciertos |
| **Bandsintown for Artists API** | ✅ REST JSON | Free básico | Partner program | ⚠️ Parcial LATAM | Conciertos (artist-driven) |
| **Calendarific (Holiday API)** | ✅ REST JSON | 1,000 calls/mes | $9-99/mes | ✅✅ 230+ países | Public + observances + school holidays |
| **AbstractAPI Holidays** | ✅ REST JSON | 500 calls/mes | $9-49/mes | ✅ 100+ países | Public holidays |
| **Nager.Date** | ✅ REST JSON | **Open source gratis** | — | ✅✅ 100+ países | Public holidays (no observances/school) |
| **OAG Sport Schedule** | Enterprise | — | ~$2k/mes | ✅ | Sports schedules |
| **Festicket / Festival Network** | ⚠️ Sin API pública | — | — | ⚠️ | Festivales (curado humano) |
| **GDELT Project** | ✅ Open data | Gratis | — | ✅✅ Global | News + events globales (ruidoso, requiere filtros) |

✅✅ = excelente · ✅ = buena · ⚠️ = parcial · ❌ = nula

### 2.2 Cobertura LATAM detallada (cuál usar dónde)

| País | Ticketmaster | PredictHQ | Calendarific | Nager.Date | Bandsintown | Songkick |
|---|---|---|---|---|---|---|
| **México** | ✅✅ (TM México) | ✅✅ | ✅✅ | ✅✅ | ⚠️ | ⚠️ |
| **Argentina** | ✅✅ | ✅✅ | ✅✅ | ✅✅ | ⚠️ | ⚠️ |
| **Colombia** | ✅ | ✅✅ | ✅✅ | ✅✅ | ⚠️ | ❌ |
| **Chile** | ✅ | ✅✅ | ✅✅ | ✅✅ | ⚠️ | ⚠️ |
| **Perú** | ⚠️ | ✅ | ✅✅ | ✅✅ | ❌ | ❌ |
| **Uruguay** | ⚠️ | ✅ | ✅✅ | ✅✅ | ❌ | ❌ |
| **Costa Rica** | ⚠️ | ✅ | ✅✅ | ✅✅ | ❌ | ❌ |
| **Ecuador** | ⚠️ | ✅ | ✅✅ | ✅✅ | ❌ | ❌ |
| **Bolivia** | ❌ | ⚠️ | ✅✅ | ✅✅ | ❌ | ❌ |
| **Venezuela** | ❌ | ⚠️ | ✅✅ | ✅✅ | ❌ | ❌ |
| **España** | ✅✅ | ✅✅ | ✅✅ | ✅✅ | ✅ | ✅ |
| **Brasil** | ✅ | ✅✅ | ✅✅ | ✅✅ | ⚠️ | ⚠️ |

**Estrategia por tier comercial:**

- **Tier base (bundled MVP)**: Ticketmaster (gratis 5k/día) + Nager.Date (open source) = cobertura aceptable LATAM con $0/mes operativo. Solo eventos públicos + holidays nacionales.
- **Tier Pro DLC ($50-80/property/mes)**: + Calendarific paid ($9-99/mes amortizado entre clientes) + ingest curado de festivales locales. Mejor cobertura de observances + school holidays.
- **Tier Premium DLC ($150-300/property/mes — futuro, ver DEMAND-INTELLIGENCE)**: + PredictHQ ($200+/mes) para hospitality-grade demand intel con `local_rank` y `aviation_rank` nativos.

### 2.3 PredictHQ — análisis especial

PredictHQ merece párrafo aparte porque **está diseñado específicamente para demand intelligence en hospitality**. Clientes documentados: Booking.com, Marriott, Hyatt, Hilton, Accor.

**Diferenciadores únicos:**

- Agrega 19 categorías de fuentes en un solo endpoint normalizado.
- **`local_rank`** (0-100) — score del impacto local del evento (ya hizo el análisis de "cuánta demanda genera este evento"). Elimina la necesidad de que el Events Curator de Zenix asigne `demandImpact` manualmente.
- **`aviation_rank`** (0-100) — score del impacto en demanda de vuelos al área. **Directamente correlacionable con el `FlightDemandIndex` del sprint DEMAND-INTELLIGENCE**. Si compras PredictHQ, parte del DEMAND-INTELLIGENCE sprint queda redundante (puedes saltar la integración Amadeus si PredictHQ + algunos otros adapters bastan).
- **`predicted_attendance`** — número estimado de asistentes basado en histórico + venue capacity + booking patterns.
- Filtros nativos: `place.scope=destination` (city-level analysis), categoría, radius, fecha, rank threshold.

**Pricing real:**
- Trial gratis 14 días
- Plan "Pro" para 1 ubicación / city: ~$200-400/mes
- Plan "Enterprise" multi-property: negociado, $1,000-5,000/mes
- Pay-per-call: ~$0.01-0.05/call (calculado para 5 properties × 30 days × 1 daily fetch = ~$50-100/mes)

**Por qué es match perfecto para Demand Intelligence:**

Cuando Zenix llegue al sprint **DEMAND-INTELLIGENCE**, en vez de construir el `DemandScore` desde cero combinando Ticketmaster + flight APIs + vacation calendars + LocalEvent, podemos:

1. Usar PredictHQ como fuente primaria de eventos + impact scores (ya nos da `local_rank` y `aviation_rank` calculados).
2. Combinar con `CompsetSnapshot` (precio competidores) y `MetricsDailySnapshot` (historia propia del hotel).
3. Resultado: feature equivalente a Mews Compset + flight intel pero con menos ingeniería propia.

**Trade-off honest:** $200-400/mes/property en API costs vs ~30-40 días-dev construyendo todo manual. Si planeas vender el DLC tier Premium a $80-150/mes, PredictHQ se come ~60-70% del margen. **Recomendación**: PredictHQ como **opcional premium tier** dentro de Demand Intelligence — el cliente elige si paga el upgrade. Para boutique hostel, Ticketmaster + Calendarific + LocalEvent curados son suficientes.

### 2.4 Eventbrite — por qué NO usarla

Eventbrite **cambió su política API en 2020** removiendo el acceso público a discovery de eventos (era el "Search API"). Desde 2020:

- Solo puedes acceder a events que TU cuenta es organizer.
- No hay endpoint público para descubrir eventos por geo/categoría.
- Cualquier scraper que pretenda hacer discovery se topa con ToS violation + anti-bot.

**Conclusión:** Eventbrite **NO sirve** para discovery automático. La descartamos completamente de adapters propuestos. La mantenemos en el catálogo del schema (`LocalEvent.source` enum incluye `'EVENTBRITE'`) por si el cliente individual decide manualmente ingresar eventos que vio en Eventbrite — pero sin ingest automático.

### 2.5 GDELT Project — alternativa open data interesante

GDELT (Global Database of Events, Language, and Tone) es un proyecto open-data del Georgetown University que monitorea news + events globalmente. **Free**, **API REST**, **cobertura mundial**.

**Pros:**
- 100% gratis y open
- Cobertura LATAM excelente
- Histórico desde 1979

**Cons:**
- **Muy ruidoso** — news + events mezclados, requiere clasificación pesada
- No optimizado para hospitality demand
- Tipo de eventos: protests, political events, conflicts, economic news — útil pero no es lo que un manager boutique quiere ver en dashboard

**Recomendación:** GDELT queda **fuera del Phase 2 MVP** pero documentado como Phase 3+ research si quisiéramos un "Disruption Detection" feature ("alerta: protesta detectada cerca de Tulum, considera flexibilizar cancellation policies").

### 2.6 Ticketmaster Discovery API v2 — el primer adapter a implementar

**Endpoint clave:** `GET https://app.ticketmaster.com/discovery/v2/events.json`

Parámetros relevantes:
```
?latlong=20.2114,-87.4654         (lat/lng de Tulum)
&radius=50&unit=km
&startDateTime=2026-06-01T00:00:00Z
&endDateTime=2026-09-01T00:00:00Z
&classificationName=music,festival
&size=200
&apikey={DEVELOPER_KEY}
```

Response (simplificado):
```json
{
  "_embedded": {
    "events": [
      {
        "id": "G5dIZ9pAA1234",
        "name": "Festival Bahidorá 2026",
        "dates": {
          "start": { "localDate": "2026-02-21", "localTime": "18:00:00" },
          "end":   { "localDate": "2026-02-23" }
        },
        "classifications": [{
          "segment": { "name": "Music" },
          "genre":   { "name": "Festival" }
        }],
        "_embedded": {
          "venues": [{
            "name": "Bahidorá Tulum",
            "city": { "name": "Tulum" },
            "state": { "stateCode": "QR" },
            "country": { "countryCode": "MX" },
            "location": { "longitude": "-87.45", "latitude": "20.21" }
          }]
        },
        "url": "https://www.ticketmaster.com.mx/event/..."
      }
    ]
  },
  "page": { "size": 200, "totalElements": 47, "totalPages": 1, "number": 0 }
}
```

Mapping a nuestro `LocalEvent`:

```ts
TicketmasterEventAdapter.normalize(tmEvent) → LocalEvent {
  name:             tmEvent.name,
  category:         mapClassification(tmEvent.classifications),
                    // SegmentName=Music + GenreName=Festival → 'FESTIVAL'
                    // SegmentName=Sports → 'SPORTS'
                    // SegmentName=Music → 'CONCERT'
                    // SegmentName=Arts & Theatre → 'CONCERT' (fallback)
  startDate:        parseISO(tmEvent.dates.start.localDate),
  endDate:          parseISO(tmEvent.dates.end?.localDate ?? tmEvent.dates.start.localDate),
  countryCode:      tmEvent.venue.country.countryCode,
  regionCode:       `${countryCode}-${tmEvent.venue.state.stateCode}`,
  city:             tmEvent.venue.city.name,
  latitude:         Number(tmEvent.venue.location.latitude),
  longitude:        Number(tmEvent.venue.location.longitude),
  source:           'TICKETMASTER',
  sourceUrl:        tmEvent.url,
  sourceExternalId: tmEvent.id,
  demandImpact:     inferImpactFromVenue(tmEvent), // heurístico: venue capacity → LOW/MEDIUM/HIGH
  verifiedAt:       null,                          // Events Curator aprueba
}
```

### 2.7 PredictHQ adapter — para tier Premium

**Endpoint clave:** `GET https://api.predicthq.com/v1/events/`

Parámetros relevantes:
```
?within=50km@20.2114,-87.4654
&category=concerts,festivals,public-holidays,school-holidays,sports,conferences,observances
&active.gte=2026-06-01
&active.lte=2026-09-01
&rank_level=4,5  (solo eventos de impacto medio-alto)
&Authorization: Bearer {ACCESS_TOKEN}
```

Response (simplificado):
```json
{
  "results": [
    {
      "id": "predicthq:event:5x9k2",
      "title": "Festival Bahidorá 2026",
      "category": "festivals",
      "start": "2026-02-21T18:00:00",
      "end": "2026-02-23T23:59:00",
      "rank": 78,
      "local_rank": 85,
      "aviation_rank": 42,
      "predicted_attendance": 18500,
      "geo": {
        "geometry": { "type": "Point", "coordinates": [-87.45, 20.21] }
      },
      "scope": "locality",
      "country": "MX",
      "state": "QR",
      "place_hierarchies": [["MX", "QR", "Tulum"]]
    }
  ]
}
```

Mapping a nuestro `LocalEvent`:

```ts
PredictHQEventAdapter.normalize(phqEvent) → LocalEvent {
  name:             phqEvent.title,
  category:         mapPHQCategory(phqEvent.category),
  startDate:        parseISO(phqEvent.start),
  endDate:          parseISO(phqEvent.end),
  countryCode:      phqEvent.country,
  regionCode:       `${phqEvent.country}-${phqEvent.state}`,
  city:             phqEvent.place_hierarchies[0][2],
  latitude:         phqEvent.geo.geometry.coordinates[1],
  longitude:        phqEvent.geo.geometry.coordinates[0],
  source:           'PREDICTHQ',
  sourceExternalId: phqEvent.id,
  demandImpact:     mapRankToImpact(phqEvent.local_rank),
                    // 0-30 → LOW, 31-60 → MEDIUM, 61-85 → HIGH, 86-100 → EXTREME
  expectedAttendance: phqEvent.predicted_attendance,
  verifiedAt:       null, // o auto-verify si rank ≥ 70 (configurable)

  // Extensión propuesta para DEMAND-INTELLIGENCE:
  metadata: {
    phqRank: phqEvent.rank,
    phqLocalRank: phqEvent.local_rank,
    phqAviationRank: phqEvent.aviation_rank,
  }
}
```

### 2.8 Calendarific + Nager.Date — para holidays

**Calendarific** (`GET https://calendarific.com/api/v2/holidays`):
```
?api_key={KEY}&country=MX&year=2026&type=national,observance,school
```

**Nager.Date** (`GET https://date.nager.at/api/v3/PublicHolidays/{year}/{countryCode}`):
```
GET https://date.nager.at/api/v3/PublicHolidays/2026/MX
```

Mapping a `VacationPeriod` (no `LocalEvent` — porque holidays son periodos, no eventos puntuales):

```ts
CalendarificHolidayAdapter.normalize(calEvent) → VacationPeriod {
  name:           calEvent.name,
  countryCode:    calEvent.country.id.toUpperCase(),
  regionCode:     null, // Calendarific no proporciona granularidad de state
  startDate:      parseISO(calEvent.date.iso),
  endDate:        parseISO(calEvent.date.iso), // 1 día (extender si "type=observance" implica multi-day)
  yearApplicable: parseInt(calEvent.date.iso.split('-')[0]),
  source:         'CALENDARIFIC',
}

NagerDateAdapter.normalize(nagEvent) → VacationPeriod {
  name:           nagEvent.localName,
  countryCode:    nagEvent.countryCode,
  startDate:      parseISO(nagEvent.date),
  endDate:        parseISO(nagEvent.date),
  yearApplicable: parseInt(nagEvent.date.split('-')[0]),
  source:         'NAGER_DATE',
}
```

**Deduplication entre Calendarific + Nager:** ambos cubrirán "Día de la Independencia MX 16-sep". Match exacto por `countryCode + startDate + fuzzy(name)`. Preferimos Calendarific cuando ambos están (más metadata); Nager como fallback gratis.

---

## 3. Decisiones no-negociables (a registrar en sprint kickoff)

### Bloque EVENT INGEST

#### D-MKTPRO1: `IEventDataAdapter` interface paralela a `ICompsetAdapter`

Adapter pattern explícito (analog §89). Cada source = 1 implementación discrete. `LegalEntity.eventDataProviders: String[]` indica cuáles están activos para esta cuenta.

#### D-MKTPRO2: 5 adapters en MVP del sprint

- `TicketmasterEventAdapter` (gratis tier base)
- `PredictHQEventAdapter` (premium tier opcional)
- `CalendarificHolidayAdapter` (Pro tier — holidays paid)
- `NagerDateHolidayAdapter` (free fallback holidays)
- `BandsintownEventAdapter` (Pro tier — conciertos complementarios)

Songkick, SeatGeek, GDELT, OAG quedan **out-of-scope** del sprint pero documentados como Phase 3.

#### D-MKTPRO3: Pipeline cron daily 03:00 timezone-local

Por cada property con DLC Market Intel Pro activo:
1. Resolver propertyLocation (country, region, city, lat/lng, radius preferido)
2. Por cada adapter habilitado: `fetchEvents(propertyLocation, dateRange=[today, today+180d])`
3. Por cada raw event: normalize → check duplicate → insert OR cross-reference
4. Eventos nuevos quedan `verifiedAt=null` (pendiente Curator review)
5. Eventos con `auto_verify_threshold` configurado (e.g., PredictHQ local_rank ≥ 80) se auto-verifican

#### D-MKTPRO4: Deduplication estricta con fuzzy match

```
findDuplicate(candidate) =
  LocalEvent.find({
    AND: [
      city: candidate.city OR within 5km lat/lng radius,
      OR: [
        sourceExternalId: candidate.sourceExternalId,  // match exacto external ID
        AND: [
          name: fuzzyMatch(candidate.name, threshold: 0.85, normalize: stripAccents+lower),
          dateRangeOverlaps(candidate.startDate, candidate.endDate, tolerance: ±2 días),
        ]
      ]
    ]
  })
```

Si encuentra duplicate, crear `LocalEventSourceLink { localEventId, source, externalId, externalUrl }`. Permite trazabilidad multi-source ("este evento existe en TM + PHQ + nuestra curación") y opt-out per-source si curator decide que una fuente es poco confiable.

#### D-MKTPRO5: Eventos curados manuales son inmutables vs ingest automático

Si Events Curator creó manualmente "Festival Bahidorá Tulum" con `demandImpact=HIGH` + descripción custom, y luego TM/PHQ ingest detectan el mismo evento, el ingest NUNCA sobrescribe los campos del evento manual. Solo crea `LocalEventSourceLink` cross-reference.

#### D-MKTPRO6: Events Curator UI con queue de revisión

Nueva ruta `/admin/events/curator-queue`:
- Lista de eventos `verifiedAt=null` ordenados por `source` + `rank`
- Inline approve/reject + edit
- Bulk approve por fuente (e.g., "Aprobar todos los Ticketmaster MX-QR del próximo trimestre")
- Filtros: por source, by country/region/city, by category, by demand impact

#### D-MKTPRO7: Rate limits respetuosos per provider

- Ticketmaster: 5,000 calls/día gratis — pipeline distribuido propiedades por timezone para evitar burst
- Calendarific: 1,000 calls/mes free → cache 30 días por country/year (renovar solo al fin del año)
- Nager.Date: open source pero rate-limit suave — 1 call por country/year
- PredictHQ: variable según plan — respetar `429 Retry-After`
- Bandsintown: documentado en sus docs (variable)

Exponential backoff + circuit breaker per adapter.

#### D-MKTPRO8: Source-trust scoring per evento

`LocalEventSourceLink.trustScore: Decimal(3,2)` (0-1):
- PREDICTHQ: 0.95 (alta calidad curado)
- TICKETMASTER: 0.90 (alta calidad pero solo events ticketables)
- CALENDARIFIC: 0.85 (holidays bien curados)
- NAGER_DATE: 0.80 (open source, menos categorías)
- BANDSINTOWN: 0.70 (artist-driven, ruido moderado)
- MANUAL: 1.00 (curado humano)

Si conflicto entre fuentes, gana el de mayor trustScore. Audit log captura cuál ganó.

### Bloque COMPSET SWAP

#### D-MKTPRO9: Swap del scraper DIY a Lighthouse via cambio de config

`LegalEntity.compsetProvider` cambia de `'SCRAPER_DIY'` a `'LIGHTHOUSE'` desde admin UI (con health-check antes de activar). Sin cambio de runtime, sin re-scrape, simplemente el nuevo cron usa el nuevo adapter.

#### D-MKTPRO10: Lighthouse partnership comercial obligatorio antes del swap

Activar `LighthouseCompsetAdapter` requiere:
1. Contrato firmado con OTA Insight Lighthouse (4-8 semanas onboarding comercial)
2. API key per LegalEntity configurada (no global Zenix)
3. Wholesale rate $30-50/property/mes pass-through al cliente como part del DLC fee

#### D-MKTPRO11: Auto-radius compset detection opcional

Toggle Settings → "Compset detection mode":
- **Manual** (default, mismo MVP): manager pin 3-7 competidores
- **Auto-radius**: sistema sugiere top N competidores en radio 5km/10km filtrados por star rating (±0.5), room count (±50%), guest rating (±0.5)
- **Híbrido**: manager pinea 2-3 críticos + auto-radius rellena hasta 7

Auto-detection usa Google Places API + Booking Affiliate API + Lighthouse competitor search.

### Bloque PUSH NOTIFICATIONS

#### D-MKTPRO12: Notification rules engine configurable

Manager configura en Settings → "Push alerts":
- ⚠️ Competitor changed rate by ≥X% (default 10%)
- 📅 Evento nuevo detectado en mi compset window (default ON)
- 🔥 Demand spike detectado (próximos 30d, threshold configurable) — requiere DEMAND-INTELLIGENCE
- 💵 Tu rate vs mediana se aleja >Y% — sugiere ajuste (default 20%)
- 🎯 Pickup pace below baseline (requiere ≥6m historia)

Cada regla genera entrada en `AppNotification` (notification center existente §99) + opcionalmente push notification al móvil (si Expo Push enrolled).

#### D-MKTPRO13: Daily digest opt-in para evitar fatiga

Manager puede preferir "1 email diario 08:00" con resumen vs notifications individuales. Pattern Slack/Notion notifications.

### Bloque AUTO-RADIUS COMPSET

#### D-MKTPRO14: Algoritmo de selección automática transparente

```
selectAutoCompset(propertyId, options = { radiusKm: 10, maxResults: 7 }):
  1. Fetch candidates within radius via Google Places + Lighthouse
  2. Filter:
     - star_rating BETWEEN (property.starRating - 0.5) AND (property.starRating + 0.5)
     - room_count BETWEEN (property.roomCount × 0.5) AND (property.roomCount × 1.5)
     - guest_rating ≥ property.guestRating - 1.0
     - excludePropertyOwn (no incluir self)
  3. Sort by composite score:
     - 0.4 × proximity_score (inverse of distance)
     - 0.3 × rating_similarity_score
     - 0.2 × room_count_similarity_score
     - 0.1 × guest_rating_score
  4. Return top maxResults
  5. Audit trail: cada candidato seleccionado registra los scores que ganaron
```

Manager puede ver "Por qué este competidor fue seleccionado" con breakdown del score.

#### D-MKTPRO15: Recompute auto-radius monthly

Cron mensual re-evalúa la selección. Si cambia, Push notification al manager: "Tu compset auto-detectado actualizado. Hotel X reemplazado por Hotel Y. Revisar." Manager puede aceptar o congelar selección actual.

---

## 4. Schema changes

```prisma
// ── Event ingest ──

model LocalEventSourceLink {
  id              String   @id @default(uuid())
  localEventId    String   @map("local_event_id")
  source          String   // TICKETMASTER | PREDICTHQ | CALENDARIFIC | NAGER_DATE | BANDSINTOWN | EVENTBRITE | MANUAL
  externalId      String   @map("external_id")
  externalUrl     String?  @map("external_url")
  trustScore      Decimal  @db.Decimal(3, 2) @map("trust_score")
  lastFetchedAt   DateTime @map("last_fetched_at")
  rawPayload      Json?    @map("raw_payload")  // últimos N caracteres del raw response, debug

  localEvent      LocalEvent @relation(fields: [localEventId], references: [id])

  @@unique([source, externalId])
  @@index([localEventId])
  @@map("local_event_source_links")
}

model EventIngestRun {
  id              String   @id @default(uuid())
  propertyId      String   @map("property_id")
  source          String
  startedAt       DateTime @default(now()) @map("started_at")
  completedAt     DateTime? @map("completed_at")
  status          String   // RUNNING | SUCCESS | PARTIAL | FAILED
  eventsFetched   Int      @default(0) @map("events_fetched")
  eventsNew       Int      @default(0) @map("events_new")
  eventsLinked    Int      @default(0) @map("events_linked")  // dedupe → linked existing
  eventsSkipped   Int      @default(0) @map("events_skipped")
  errors          Json?    // log de errores no-fatales

  @@index([propertyId, startedAt(sort: Desc)])
  @@index([source, startedAt(sort: Desc)])
  @@map("event_ingest_runs")
}

// ── Notification rules ──

model MarketIntelNotificationRule {
  id              String   @id @default(uuid())
  propertyId      String   @map("property_id")
  ruleType        String   // COMPETITOR_RATE_CHANGE | NEW_EVENT_DETECTED | DEMAND_SPIKE | RATE_DEVIATION | PICKUP_LAG
  isActive        Boolean  @default(true)

  // Thresholds (per rule type, JSON config)
  config          Json     // ej. { changePercent: 10 } o { dateRange: '30d' }

  // Delivery
  deliveryChannels String[] // APP_NOTIFICATION | EMAIL | SMS | PUSH
  digestMode       String?  // INSTANT | DAILY_DIGEST | WEEKLY_DIGEST

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([propertyId, isActive])
  @@map("market_intel_notification_rules")
}

// ── LegalEntity additions ──
model LegalEntity {
  // ... existing fields ...
  marketIntelProActive    Boolean @default(false) @map("market_intel_pro_active")
  eventDataProviders      String[] @default(["TICKETMASTER","NAGER_DATE"]) @map("event_data_providers")
  predictHqApiKey         String? @map("predict_hq_api_key")
  ticketmasterApiKey      String? @map("ticketmaster_api_key")
  calendarificApiKey      String? @map("calendarific_api_key")
  bandsintownAppId        String? @map("bandsintown_app_id")

  // Compset provider already exists from RATES-METRICS-COMPSET-CORE
  compsetProvider         String  @default("SCRAPER_DIY") @map("compset_provider")
  compsetApiKey           String? @map("compset_api_key")
  compsetAutoRadiusMode   String  @default("MANUAL") @map("compset_auto_radius_mode")  // MANUAL | AUTO_RADIUS | HYBRID
  compsetAutoRadiusKm     Decimal? @db.Decimal(5, 2) @map("compset_auto_radius_km")
}

// ── LocalEvent additions to existing model ──
model LocalEvent {
  // ... existing fields ...
  sourceLinks     LocalEventSourceLink[]
  autoVerifyThreshold Decimal? @db.Decimal(3, 2) @map("auto_verify_threshold")  // si PHQ local_rank ≥ X auto-verify
}
```

---

## 5. API endpoints

### 5.1 Event ingest management

```
GET    /v1/admin/event-ingest/runs                   → historial de ingest runs
GET    /v1/admin/event-ingest/runs/:id               → detail con errores
POST   /v1/admin/event-ingest/trigger?source=...     → manual trigger (debug)

GET    /v1/admin/events/curator-queue?status=pending → eventos esperando approval
PATCH  /v1/admin/events/:id/approve                  → approve con optional edits
POST   /v1/admin/events/bulk-approve                 → bulk approve filtered
PATCH  /v1/admin/events/:id/reject                   → reject con reason
GET    /v1/admin/events/:id/source-links             → todas las fuentes que detectaron este evento
```

### 5.2 Notification rules

```
GET    /v1/properties/:id/notification-rules
POST   /v1/properties/:id/notification-rules
PATCH  /v1/properties/:id/notification-rules/:ruleId
DELETE /v1/properties/:id/notification-rules/:ruleId
```

### 5.3 Auto-radius compset

```
GET    /v1/properties/:id/compset/auto-suggest?radiusKm=10 → preview sugerencias
POST   /v1/properties/:id/compset/auto-apply              → aplicar sugerencias
GET    /v1/properties/:id/compset/auto-recompute-log      → historial de updates auto-radius
```

### 5.4 Lighthouse integration health

```
POST   /v1/admin/lighthouse/test-connection
GET    /v1/admin/lighthouse/health
POST   /v1/admin/legal-entities/:id/swap-compset-provider → SCRAPER_DIY → LIGHTHOUSE con health-check
```

---

## 6. Services

### 6.1 `EventIngestService`

```ts
class EventIngestService {
  async runDailyIngest(propertyId: string): Promise<EventIngestRun>
  async runForProvider(propertyId: string, provider: string): Promise<EventIngestRun>
  async getRunHistory(propertyId: string, limit: number): Promise<EventIngestRun[]>

  private async normalizeAndPersist(raw, adapter, propertyContext): {
    isNew: boolean,
    isLinked: boolean,
    skipReason?: string,
  }
}
```

### 6.2 `EventDeduplicationService`

```ts
class EventDeduplicationService {
  async findDuplicate(candidate: Partial<LocalEvent>): LocalEvent | null
  async linkSource(existingId: string, source: string, externalId: string, payload: object): Promise<LocalEventSourceLink>
  private fuzzyMatchName(a: string, b: string, threshold: number): boolean
  private dateOverlap(a: DateRange, b: DateRange, tolerance: number): boolean
}
```

### 6.3 `EventsCuratorService`

```ts
class EventsCuratorService {
  async getQueue(filters: { status, source, country, region, city, category }): LocalEvent[]
  async approve(eventId: string, edits?: Partial<LocalEvent>, curatedById: string): Promise<LocalEvent>
  async bulkApprove(filter: object, curatedById: string): { count: number, eventIds: string[] }
  async reject(eventId: string, reason: string, curatedById: string): Promise<void>
}
```

### 6.4 `CompsetAutoRadiusService`

```ts
class CompsetAutoRadiusService {
  async suggestCompset(propertyId: string, options: AutoRadiusOptions): Promise<CompetitorCandidate[]>
  async applyAutoSelection(propertyId: string, candidateIds: string[]): Promise<Competitor[]>
  async recomputeMonthly(propertyId: string): Promise<{ added: string[], removed: string[] }>
}
```

### 6.5 `MarketIntelNotificationService`

```ts
class MarketIntelNotificationService {
  async evaluateRules(propertyId: string): Promise<Notification[]>
  async sendInstant(notification: Notification): Promise<void>
  async generateDailyDigest(propertyId: string): Promise<DigestSummary>
  // Cron: daily 06:30 timezone-local para digests
}
```

---

## 7. UI flows

### 7.1 Settings → Market Intel

`/settings/market-intel-pro`:

- **Tab "Event sources"** — toggle on/off per provider. Configurar API keys. Status health per provider (last successful fetch, errors).
- **Tab "Compset"** — modo manual/auto-radius/hybrid + radius config + recompute frequency.
- **Tab "Notifications"** — rules configurable + delivery channels + digest mode.
- **Tab "Lighthouse"** — connection status, swap CTA con health-check.

### 7.2 Admin → Events Curator Queue

`/admin/events/queue`:

```
┌─ Events Curator — Pending Review (47) ─────────────────────┐
│                                                              │
│ Filters: [TM ▾] [MX-QR ▾] [Festival ▾] [Next 90d ▾]         │
│                                                              │
│ [✓] Festival Bahidorá 2026                                  │
│     Source: TM · TM-ID: G5dIZ9pAA1234 · trustScore 0.90    │
│     Tulum, MX-QR · 21-23 feb 2026                            │
│     Impacto: HIGH (inferred from venue capacity 18,000)     │
│     [Approve] [Edit] [Reject] [Link to existing event]      │
│                                                              │
│ [ ] Boda private en venue X                                  │
│     Source: TM · trustScore 0.90                            │
│     Tulum, MX-QR · 25 abr 2026                              │
│     ⚠️ Likely irrelevant — venue capacity 80                │
│     [Approve] [Edit] [Reject]                               │
│                                                              │
│ [Bulk approve filtered] [Bulk reject filtered]              │
└──────────────────────────────────────────────────────────────┘
```

### 7.3 Dashboard — Notification widget

Existing `NotificationPanel` (§99) extends para mostrar market intel alerts:

```
🔔 5 nuevas alertas mercado
  ⚠️ Habitas subió tarifa +18% para 27 may (hace 2h)
  📅 Festival Cosmica detectado para 15-17 jun (Tulum)
  🔥 Demand spike próximos 30d: ocupación forecast 95%
  💵 Tu rate $145 vs mediana $182 — considera ajuste +25%
  🎯 Pickup pace -12% vs misma semana año pasado
```

---

## 8. Plan de implementación (~15-20 días-dev)

### Día 1-2 — Schema + adapter interface

- Migration `add_market_intel_pro_schema`
- `IEventDataAdapter` interface + base abstract class
- `LocalEventSourceLink`, `EventIngestRun`, `MarketIntelNotificationRule` models
- `LegalEntity` additions

### Día 3-5 — Ticketmaster + Nager.Date adapters

- `TicketmasterEventAdapter` con tests unit
- `NagerDateHolidayAdapter` con tests unit
- `EventDeduplicationService` con fuzzy match algorithm + tests
- `EventIngestService` orchestrator + cron diario per timezone

### Día 6-7 — Calendarific + Bandsintown adapters

- `CalendarificHolidayAdapter`
- `BandsintownEventAdapter`
- Cache strategy para holidays (30 días)

### Día 8-9 — PredictHQ adapter (premium tier)

- `PredictHQEventAdapter` con OAuth2 flow + access token refresh
- Auto-verify threshold logic (rank-based)
- Aviation rank + local rank persistence para integration con DEMAND-INTELLIGENCE futuro

### Día 10-11 — Events Curator UI

- Admin route `/admin/events/queue`
- Approval workflow (single + bulk)
- Filters + search
- Source-link visualization

### Día 12-13 — Lighthouse compset swap

- `LighthouseCompsetAdapter` implementation
- Health check endpoint + UI
- Swap workflow con dry-run

### Día 14-15 — Auto-radius compset

- `CompsetAutoRadiusService` con scoring algorithm
- UI suggestions preview + apply
- Monthly recompute cron + diff notifications

### Día 16-17 — Push notifications

- `MarketIntelNotificationService` rule engine
- Rule configuration UI
- Daily digest cron + email template
- Integration con notification center existente (AppNotification)

### Día 18-19 — QA + tests E2E

- Tests integration per adapter (con mocked APIs)
- E2E pipeline: cron daily → ingest → dedup → curator queue → approve → visible en dashboard
- Smoke test con fixture multi-property (Monica Tulum + ficticio Guadalajara)

### Día 20 — Polish + Docs

- ADR-0003: Event Ingest Adapter Pattern (analog ADR-0001)
- Runbook `docs/zenix-market-intel-runbook.md`
- CLAUDE.md decisiones D-MKTPRO1..15 registradas
- zenix-sales-master.md: Módulo 10 — Market Intel Pro DLC

**Total: ~15-20 días-dev (1 dev) o ~8-10 días calendar (2 devs paralelos backend + frontend).**

---

## 9. Lo que NO está en este sprint (out-of-scope explícito, deferido)

| Feature | Razón | Destino |
|---|---|---|
| **Songkick adapter** | Partner-only, requiere contrato comercial separado. LATAM coverage débil. | v1.2.x si demanda |
| **SeatGeek adapter** | US-focused, no aporta LATAM | v1.2.x si llegamos a US market |
| **GDELT integration** | Muy ruidoso, requiere ML classification | Phase 3 "Disruption Detection" |
| **OAG Sport Schedule** | Enterprise pricing $2k+/mes | v2.0 enterprise tier |
| **Festicket scraping** | Sin API pública | No haremos scraping |
| **Eventbrite Search ingest** | API restringida desde 2020 | No es factible (descartado por proveedor) |
| **Flight APIs + Demand Score** | Sprint propio | [DEMAND-INTELLIGENCE-plan.md](DEMAND-INTELLIGENCE-plan.md) |
| **ML para predicción attendance** | Necesita historia + datos | v2.0 |
| **Multi-property compset aggregation** | Para cadenas | v1.2.x enterprise |

---

## 10. Riesgos y mitigación

| Riesgo | Prob | Impacto | Mitigación |
|---|---|---|---|
| Ticketmaster API key revocada o rate-limited | Media | Alto | Multiple keys rotativos (1 per LegalEntity). Fail-soft a Nager.Date para holidays + LocalEvent manual. |
| PredictHQ contract no se materializa | Media | Medio | El sprint completa sin PredictHQ (tier base + Pro funcional). PredictHQ adapter queda stub-listo. |
| Lighthouse partnership tarda 8+ semanas | Alta | Alto | Sprint NO depende del contrato. `LighthouseCompsetAdapter` se implementa con tests mock; activación per cliente cuando el contrato cierra. |
| Deduplication falsos positivos (Festival ≠ Boda private) | Alta | Medio | Curator approval queue es la red de seguridad. Trust score + reject reason iteran el algoritmo. |
| Push notification fatigue | Alta | Medio | Daily digest opt-in + thresholds configurables + max 5 notifications/día default. |
| Auto-radius selecciona competidores poco relevantes | Media | Medio | Manager puede congelar selección + manual override siempre disponible. Algoritmo transparente con "por qué fue seleccionado". |
| API costs exceeden margen del DLC tier | Media | Alto | Cache agresivo (24h holidays, 12h events) + per-LegalEntity API key (cliente paga sus llamadas a PredictHQ directamente si tier Premium). |

---

## 11. Definición de "hecho"

- [ ] Migrations aplicadas + rollback documentado
- [ ] 80%+ test coverage en EventIngestService, EventDeduplicationService, EventsCuratorService
- [ ] E2E passing: cron daily → ingest TM → dedup → curator approve → visible en compset card
- [ ] E2E passing: PredictHQ adapter con sandbox account funcional
- [ ] E2E passing: swap compset SCRAPER_DIY → LIGHTHOUSE_MOCK con health-check OK
- [ ] E2E passing: auto-radius suggest → preview → apply funciona end-to-end
- [ ] E2E passing: notification rule "competitor changed rate" dispara AppNotification correctamente
- [ ] CLAUDE.md decisiones D-MKTPRO1..15 registradas
- [ ] ADR-0003 creado (Event Ingest Adapter Pattern)
- [ ] Runbook market-intel operations en `docs/zenix-market-intel-runbook.md`
- [ ] zenix-sales-master.md actualizado con Módulo 10
- [ ] Pricing matrix activable desde Zenix Activate wizard

---

## 12. Pricing comercial

| Tier | Precio (USD) | Incluido |
|---|---|---|
| **v1.0.x bundled (MVP)** | $0 (incluido) | Compset MVP scraping DIY (3-7 manual) + LocalEvent manual + Nager.Date holidays |
| **v1.1.x Market Intel Pro DLC** | $50-80/property/mes | **Este sprint**: + Ticketmaster ingest + Calendarific + Bandsintown + Curator queue + Lighthouse compset (swap del scraper) + Auto-radius + Push notifications |
| **v1.1.x+ Demand Intelligence Premium DLC** | $80-150/property/mes | **+ DEMAND-INTELLIGENCE sprint**: + Flight APIs (Amadeus) + Vacation calendars curados + DemandScore + Recommendations engine |
| **v1.1.x++ Bundle "Revenue Intelligence Suite"** | $120-200/property/mes | Market Intel Pro + Demand Intelligence Premium combinados con descuento |
| **PredictHQ add-on (opcional cualquier tier)** | + $40-80/property/mes pass-through | Reemplaza Ticketmaster + Calendarific + Bandsintown con PredictHQ premium (cobertura mejor + local_rank/aviation_rank nativos) |

**Comparativa competidores:**

| PMS | Equivalente | Costo |
|---|---|---|
| Mews Compset (powered by OTA Insight) | Solo compset, sin event ingest | $50/property/mes |
| Cloudbeds Insights Pro | Compset + métricas | Bundled tier Pro (efectivo $30+/mes) |
| RoomRaccoon RaccoonRev | Compset básico | Bundled tier mid |
| SiteMinder Insights | Compset (con channel mgr) | Bundled |
| **Zenix Market Intel Pro DLC** | **Compset + event ingest + holidays + auto-radius + notifications** | **$50-80/mes** |

Diferenciador: **único PMS LATAM-first que integra event ingest + holidays + compset + notifications en un solo tier**. Mews/Cloudbeds tienen pedazos pero no el bundle.

---

## 13. Dependencies

```
v1.0.x RATES-METRICS-COMPSET-CORE (MVP)
                  │
                  ▼
v1.1.x MARKET-INTEL-PRO DLC ──┐ (este sprint)
                              │
                              ├──→ v1.1.x+ DEMAND-INTELLIGENCE PREMIUM DLC
                              │       (consume: LocalEvent + LocalEventSourceLink
                              │        + opcionalmente PredictHQ adapter para
                              │        local_rank/aviation_rank)
                              │
                              └──→ v1.2.x ENTERPRISE TIER
                                      (multi-property compset aggregation,
                                       white-label notifications, etc.)
```

**Activación:** sprint independiente. Puede arrancar cuando: (1) RATES-METRICS-COMPSET-CORE merged, (2) primer cliente del piloto activa DLC opt-in, (3) Lighthouse partnership cerrado (no bloquea start si los otros adapters se priorizan).

---

## 14. Apéndice — Plataformas evaluadas pero descartadas (preservadas de Opción C)

Estas plataformas fueron evaluadas y NO se descartan del catálogo conceptual, pero quedan **out-of-scope del MVP del sprint**. Documentadas aquí para que el equipo futuro no las re-investigue desde cero:

| Plataforma | Por qué quedó out-of-scope | Cuándo retomarla |
|---|---|---|
| **Songkick API** | Partner-only + cobertura LATAM débil | v1.2.x si entramos USA/UK seriamente |
| **SeatGeek Public API** | US-focused | v1.2.x USA expansion |
| **OAG Sport Schedule** | Enterprise pricing prohibitive | v2.0 enterprise tier |
| **GDELT Project** | Ruidoso, requiere ML | Phase 3 "Disruption Detection" |
| **AbstractAPI Holidays** | Alternativa a Calendarific con menor cobertura | Backup secundario |
| **Festicket / Festival Network** | Sin API pública | No factible |
| **Eventbrite Platform** | Discovery API descontinuada 2020 | **DESCARTADO permanente** (no factible por proveedor) |

---

## 15. References

### APIs evaluadas
- [Ticketmaster Discovery API v2 docs](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/)
- [PredictHQ API documentation](https://docs.predicthq.com/)
- [Calendarific API docs](https://calendarific.com/api-documentation)
- [Nager.Date GitHub](https://github.com/nager/Nager.Date)
- [Bandsintown API for Artists](https://corporate.bandsintown.com/api-docs)
- [OTA Insight / Lighthouse partner program](https://www.otainsight.com/partners)
- [Eventbrite API changes 2020 (deprecation notice)](https://www.eventbrite.com/platform/api)

### Internas Zenix
- [docs/sprints/RATES-METRICS-COMPSET-CORE-plan.md](RATES-METRICS-COMPSET-CORE-plan.md) — sprint MVP precedente
- [docs/sprints/DEMAND-INTELLIGENCE-plan.md](DEMAND-INTELLIGENCE-plan.md) — sprint futuro que consume artefactos de este
- [CLAUDE.md §89](../../CLAUDE.md) — Adapter pattern precedent (IFiscalAdapter)
- [CLAUDE.md §99](../../CLAUDE.md) — Notification center self-suppress + auto-cleanup
- [docs/architecture/ADR-0001-pdf-rendering.md](../architecture/ADR-0001-pdf-rendering.md) — ADR template (MADR 3.0)

---

**Status:** Plan documentado. Ejecución cuando: (1) RATES-METRICS-COMPSET-CORE esté merged + estable en piloto, (2) decisión comercial confirme tier DLC Pro $50-80/property/mes con primer cliente prospect, (3) Lighthouse partnership iniciado en paralelo (NO bloquea start del sprint si los otros adapters se priorizan). Estimado calendar: Q3-Q4 2026.
