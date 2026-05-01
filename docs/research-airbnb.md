# Research #5 — Vacation Rental / Airbnb Viability for Zenix

> ¿Tiene sentido extender Zenix PMS al segmento de inmuebles vacacionales (Airbnb, VRBO, Booking.com Homes)? Análisis arquitectónico, de mercado y de costo de oportunidad.

---

## TL;DR — Recomendación

**Sí — pero como módulo dedicado en V1.3+**, no como parche al modelo HOTEL/HOSTAL actual. La diferencia operativa entre un hotel y un vacation rental es estructural, no cosmética: cambia el modelo de inventario, el ciclo de operación, la integración con channel managers, y el conjunto de dashboards.

**Decisiones clave:**

1. ✅ **Mantener `PropertyType.VACATION_RENTAL`** ya en el enum (existe en schema.prisma). Extiende, no rompe.
2. ✅ **Reutilizar el 70% del core** (auth, multi-tenant, channex gateway, journeys, payments, marketing exports).
3. 🔶 **Bifurcar la UX** en mobile y web por `propertyType` mediante el patrón "shared chrome + role-aware module" (AD-011) extendido a "+ propertyType-aware module".
4. ❌ **No copiar el módulo Housekeeping tal cual** — el VR no tiene staff fijo per-shift; tiene "turnover crews" agendados por checkout específico (modelo Hostfully/Guesty).
5. ❌ **No copiar el calendario PMS de timeline 2D web** — VRs operan multi-listing geográficamente disperso; el calendario útil es **un calendario por listing**, no un grid room×day de un edificio.

**Mercado objetivo:** property managers con 5-50 listings (segmento Hostaway/Guesty mid-tier). El segmento single-listing (host individual) ya está saturado por las apps nativas de Airbnb/VRBO — no competir ahí.

---

## 1. Diferencias operativas estructurales

| Dimensión | HOTEL / HOSTAL | VACATION_RENTAL |
|-----------|----------------|-----------------|
| **Inventario** | 1 propiedad = N rooms en 1 edificio | 1 propiedad gestora = N listings en N edificios/ciudades |
| **Unidad vendible** | Cama (hostel) / habitación (hotel) | Listing completo |
| **Front desk** | Sí, con recepcionistas | No — auto-check-in con código/lockbox |
| **Limpieza** | Staff propio en shifts | Crews externas agendadas por turnover |
| **Stayover cleaning** | Diaria opcional | Casi nunca (estancias 3-7 noches sin servicio) |
| **F&B** | A veces | Nunca |
| **Channel mix** | Booking, Expedia, Hostelworld | Airbnb, VRBO, Booking Homes |
| **Pricing** | Rate plans + tarifas de temporada | Dynamic pricing (PriceLabs, Wheelhouse, Beyond) |
| **Check-in** | Recepcionista verifica documento | Auto via app con QR + foto del documento |
| **Check-out** | Recepcionista cierra folio | Guest cierra solo, sale, código se invalida |
| **No-shows** | Common, alta tasa de cargo fiscal | Raros; cobro 100% pre-pago vía OTA |
| **Reportes** | Ocupación + RevPAR + ADR por habitación | RevPAR por listing + tasa de respuesta + reseñas |
| **Audit trail fiscal** | CFDI/DIAN/SUNAT por estadía | Más simple — OTA emite recibos |
| **Operación remota** | Algo (apps móviles) | Total — el dueño puede vivir en otro país |

---

## 2. Lo que SÍ se reutiliza del core actual (70%)

### 2.1 Multi-tenant foundation
- `Organization` → mismo modelo (un property manager = una organización)
- `Property` → ahora puede ser un listing individual o un grupo de listings
- `UserPropertyRole` → mismo control de acceso por listing

### 2.2 Calendar/Reservation core
- `GuestStay`, `StayJourney`, `StaySegment` → modelo agnostico, sirve igual
- `AvailabilityService` → mismo pattern, solo cambia origin del lock (Channex también soporta Airbnb)
- No-show flow → simplificado (Airbnb cobra al booking, raro tener no-show con cargo)

### 2.3 Payments
- `PaymentLog` append-only (USALI 12ª) → sirve igual; OTAs prepagadas registran como `OTA_PREPAID`
- `voidPayment` → mismo pattern

### 2.4 Channex.io integration
- Channex soporta Airbnb, VRBO, Booking Homes — el gateway ya construido sirve sin cambios
- `pushInventory` y `pullAvailability` con los mismos endpoints

### 2.5 Notification Center
- `AppNotification` con categoría nueva: `TURNOVER_REQUIRED`, `GUEST_ARRIVED`, `KEY_CODE_SENT`

### 2.6 Marketing module
- Los 4 segmentos (extensiones, no-shows, frecuentes, alto valor) aplican igual
- VR aporta dato extra: **reseñas** (review score por listing) — nuevo segmento

---

## 3. Lo que se BIFURCA por `PropertyType`

### 3.1 Schema — campos nuevos opcionales

```prisma
model Property {
  // ... existing fields ...

  // ── Vacation rental specific (nullable for HOTEL/HOSTAL) ──
  airbnbListingId   String?  @map("airbnb_listing_id")
  vrboListingId     String?  @map("vrbo_listing_id")
  selfCheckInCode   String?  @map("self_check_in_code")  // master code (rotated per stay)
  lockboxLocation   String?  @map("lockbox_location")
  cleaningCrewId    String?  @map("cleaning_crew_id")     // FK → CleaningCrew
  reviewScore       Float?   @map("review_score")         // average across OTAs
  reviewCount       Int?     @map("review_count")
}

model CleaningCrew {
  id             String   @id @default(uuid())
  organizationId String
  name           String
  contactPhone   String?
  rateFlat       Decimal? @db.Decimal(10, 2)  // pago por turnover
  // ...
}

model TurnoverJob {
  id             String          @id @default(uuid())
  propertyId     String          // listing
  scheduledFor   DateTime
  crewId         String?
  status         TurnoverStatus  @default(SCHEDULED)
  guestArrivalAt DateTime?       // hard deadline
  // ...
}

enum TurnoverStatus {
  SCHEDULED
  EN_ROUTE
  IN_PROGRESS
  COMPLETED
  PHOTO_VERIFIED
  ISSUES_REPORTED
}
```

### 3.2 UX bifurcation — mobile

```
HOTEL/HOSTAL                    VACATION_RENTAL
─────────────                   ────────────────
Tab Inicio     (dashboard)      Tab Inicio     (different dashboard)
Tab Limpieza   (tasks/shifts)   Tab Turnovers  (jobs by listing)
Tab Reservas   (per-room cal)   Tab Listings   (calendar per listing)
Tab Equipo     (staff)          Tab Crews      (external cleaning)
Tab Cuenta                      Tab Cuenta
```

Patrón de implementación: **mismo `_layout.tsx`** con `<Tabs>`, los nodos se escogen por `propertyType` (igual que ya hacemos por `department`).

### 3.3 Dashboard bifurcation

VR-specific permanent KPIs:
- **OccupancyByListingCard** — barras horizontales (top 10 listings por % de ocupación 30d)
- **NextTurnoversCard** — siguientes 4 turnovers programados con countdown
- **ReviewScoreCard** — score promedio + delta vs último mes

VR-specific adaptive:
- Morning: turnovers de hoy + crews asignadas
- Evening: keys sent + arrivals confirmed
- Overnight: pending reviews to respond

---

## 4. Análisis competitivo (mercado VR)

### 4.1 Líderes del mercado

| Player | Segment | Strength | Weakness |
|--------|---------|----------|----------|
| **Hostaway** | 5-500 listings | Mejor UX móvil, Channex integrated | Caro ($120/listing/mo) |
| **Guesty** | 100+ listings | Enterprise features, ML pricing | Solo enterprise, no LATAM-friendly |
| **Hostfully** | 5-100 listings | Best turnover management | UI obsoleta |
| **Lodgify** | 1-50 listings | Direct booking website builder | Channel manager débil |
| **iGMS** | 5-200 listings | Cheapest ($14/listing) | UX espartana |
| **Smoobu** | 1-30 listings | Europe-friendly | Sin LATAM |

**Brecha de mercado en LATAM:** ningún PMS VR tiene cumplimiento fiscal LATAM (CFDI 4.0, DIAN, SUNAT). Hostaway/Guesty operan asumiendo el host emite recibos. **Esto es la cuña de Zenix** — replicar el audit trail fiscal-grade que ya tenemos para hoteles.

### 4.2 Posicionamiento Zenix VR

- **Target inicial:** property managers LATAM con 5-30 listings (Quintana Roo, Medellín, Buenos Aires, CDMX, Cusco)
- **Pricing:** $25-40 USD/listing/mes (entre iGMS y Lodgify)
- **Diferenciador #1:** cumplimiento fiscal LATAM (CFDI integrado vs ERP externo)
- **Diferenciador #2:** módulo Marketing exportable a CRMs (mismo que hoteles — ya está construido)
- **Diferenciador #3:** WhatsApp pre-arrival (mismo pattern que `GuestContactLog` en no-show flow)

---

## 5. Plan de roadmap propuesto

```
V1.0  Core PMS (HOTEL + HOSTAL)         ← actual
V1.1  Operación profunda (Mantenimiento, Inventario, KPIs avanzados)
V1.2  Inventory + Costos cross-cutting   ← ya en docs/zenix-roadmap.md
V1.3  ★ Vacation Rental MVP
       - PropertyType.VACATION_RENTAL completo
       - TurnoverJob + CleaningCrew models
       - Self-check-in via QR + lockbox code
       - Dashboard VR (OccupancyByListing, NextTurnovers, ReviewScore)
       - Multi-listing calendar (lista de listings con mini-calendar c/u)
V1.4  VR features avanzadas
       - Dynamic pricing integration (PriceLabs API)
       - Review response automation (Google Translate API)
       - Channel manager: Airbnb webhooks consumidos
V2.0  Multi-property + Mixed portfolios
       - Un property manager con HOTELES y VRs en la misma org
```

---

## 6. Riesgos identificados

1. **Distracción de roadmap:** VR puede consumir 30-40% del bandwidth de desarrollo si se prioriza antes de V1.2. Mitigación: scope congelado en V1.3 (no antes de Q3 con la deuda actual estabilizada).

2. **Diluir la propuesta de valor:** Zenix nace como "PMS LATAM hotelero". Agregar VR puede confundir el go-to-market. Mitigación: **dos productos bajo la misma plataforma** — `zenix.com/hotel` y `zenix.com/rentals`. Mismo backend, dos onboardings, dos pricing.

3. **Channex.io coverage de Airbnb:** Airbnb es notoriamente difícil de integrar (no acepta XML estándar OTA, requiere certificación). Verificar antes de prometer. Backup plan: integración directa via Airbnb Channel Manager API (más caro, pero garantizado).

4. **Cleaning crew = nuevo dominio:** modelar contratistas externos con pagos variables es una vertical aparte (Uber-like marketplace). Riesgo de que se convierta en "Stripe for cleaners" en vez de feature de PMS. Mitigación: empezar simple — `CleaningCrew` con `rateFlat`, pago manual offline, escalar solo si demanda lo justifica.

5. **Propiedades mixtas:** un mismo dueño puede tener un hotel + 3 listings VR. ¿Una sola org? ¿Dashboard combinado? Decisión: en V1.3 cada `Property` es solo HOTEL **o** VR, nunca mixto. La org puede tener N propiedades de cualquier tipo. Dashboard combinado se posterga a V2.0.

---

## 7. Validación de hipótesis antes de construir

Antes de empezar V1.3 ejecutar:

1. **5 entrevistas cualitativas** con property managers LATAM de 10-30 listings (CDMX, Tulum, Medellín)
2. **Análisis de competencia** real con cuentas de prueba en Hostaway, Guesty, Lodgify
3. **Validación fiscal:** consulta con contador especializado en CFDI 4.0 sobre nota de crédito por reservas Airbnb canceladas
4. **POC técnico:** Channex sandbox + Airbnb test listing — verificar que el pipeline funciona

Si los 4 quedan positivos → proceder con V1.3 design. Si alguno falla → escalar 6 meses y re-evaluar.

---

## 8. Recomendación final

**Esperar a V1.3** (estimado Q3 del próximo año, después de cerrar la deuda V1.0/V1.1/V1.2). Antes de eso:

✅ **Mantener `PropertyType.VACATION_RENTAL` en schema** — ya existe, no romper nada
✅ **El campo `propertyType` en AuthResponse** — ya está expuesto, mobile lo lee, base lista
✅ **Documentar este research** — base para conversaciones con primeros prospects VR
🔶 **No invertir tiempo de desarrollo en VR-specific code hasta validar hipótesis con clientes reales**

---

## 9. Referencias

- Hostaway, Guesty, Hostfully, Lodgify, iGMS, Smoobu — feature comparison docs (2024)
- AirDNA Market Report 2024 — VR market growth in LATAM
- PriceLabs / Wheelhouse / Beyond — dynamic pricing API docs
- Channex.io — Airbnb integration documentation (`/api/v1/channels`)
- Airbnb API for Hosts (2024) — terms and limitations
- ISAHC — *Vacation Rental Standards*, 2023
- USALI 12ª edición — capítulo "Alternative Lodging" (sección sobre VR)
- IRS Schedule E (US) / SAT CFDI 4.0 (MX) — fiscal compliance for short-term rentals
