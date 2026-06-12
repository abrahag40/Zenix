# Zenix Booking — Casos de uso (nivel usuario + nivel técnico)

> Complemento de [BOOKING-ENGINE-plan.md](BOOKING-ENGINE-plan.md). Describe **cómo
> funciona el motor de reservas directas a nivel usuario y a nivel técnico**.
> Reflejan la **Opción B** (decisión owner 2026-06-11): Fase 1 en modo
> `PAY_AT_HOTEL`-only, prepago online se enchufa post-PAY-CORE (v1.0.1).
>
> **Status:** B0 + B1 + B2 + **B3 implementados y verificados e2e**. Ya funciona:
> READ público (property/availability/rates/room-types + **`availability-calendar`**
> feed advisory) + WRITE autenticado (`POST /reservations` `rooms[]` multi-tipo/
> multi-fecha/grupo → `GuestStay source='DIRECT_WEB'` + SSE) + `GET /reservations/:ref`
> + **webhooks outbound** (`reservation.created` + `availability.changed`, HMAC +
> retry + dead-letter). Falta: B4 wizard/panel UI, B5 hosted page, B6 docs.

---

## 0. Actores

| Actor | Quién es | Dónde opera |
|-------|----------|-------------|
| **Consultor** | PARTNER_MEMBER de ZaharDev que onboarda al hotel | Nova (`/nova/wizard`, `/settings`) |
| **Dueño/Admin del hotel** | ORG_OWNER del cliente | `app.zenix.com` (panel admin) |
| **Recepcionista** | ORG_STAFF rol RECEPTIONIST | Calendario PMS + mobile |
| **Huésped** | Visitante anónimo del sitio web del hotel | `book.zenix.com/{slug}` (público, sin login) |
| **Developer del hotel** | Equipo técnico (chains, Zapier) | Consume la API pública con `pk_live_…` |
| **Sistema Zenix** | Backend (schedulers, webhooks, SSE) | `apps/api` |

---

## PARTE A — Casos de uso a nivel USUARIO

### 🧭 Modelo mental — Zenix Booking es una API headless, no una página web

> **Aclaración fundacional (owner 2026-06-11).** Zenix Booking **NO es un sitio web
> que Zenix le construye al hotel.** Es una **API**. El website del hotel es
> **independiente** (lo construye el owner o un tercero), vive en su propio
> dominio/hosting, y **se adapta a la documentación de Zenix Booking** vía HTTP:
> manda la data (fechas, huésped, habitación) → la API de Zenix la recibe, valida
> inventario y **genera la reserva** en el PMS. El website nunca toca la BD de
> Zenix; sólo habla el contrato HTTP documentado. Cualquier developer que quiera
> conectar un website lee la doc e implementa contra la API.

**Tres roles que NO hay que confundir:**

| Pieza | Quién la hace | Qué es |
|-------|---------------|--------|
| **Config + datos** (slug, habitaciones, tarifas, políticas, **API key**) | **Consultor** en Nova — *no programa, sólo llena campos* | El "panel de control" del motor |
| **El website del hotel** | **El owner / un tercero** (developer) | Independiente. Lee la doc y consume la API por HTTP. **Headless.** |
| **Hosted Page `book.zenix.com/{slug}`** | **Zenix la renderiza** (opcional) | Sólo para hoteles **sin** dev. Es el *fallback turnkey* + la *reference implementation* de la API |

**El entregable primario es la API (B1-B2) + su documentación (B6).** La Hosted Page
(B5) es la implementación de referencia: cubre al hotel sin dev y sirve de ejemplo
vivo copy-paste. Ambos paths consumen **la misma** API backend — cero duplicación.

---

### UC-U1 · El consultor configura el motor (NO construye un sitio web) ⏳ (B4)
**Como** consultor (que no es dev ni diseñador), **quiero** dejar lista la
*configuración y la llave* del motor **para que** el website del hotel pueda
consumir la API.

**Lo que el consultor SÍ hace (llenar campos en Nova, Wizard Step 5.5):**
1. **Slug** — el sistema propone uno del nombre (`Hotel Tulum` → `hotel-tulum`),
   editable; se desambigua si choca (`hotel-tulum-2`). Es el identificador público
   de la property en la API (`/v1/public/properties/hotel-tulum`).
2. **Inventario y tarifas** — ya configurados en pasos previos del wizard
   (RoomTypes, RatePlans). El motor los expone tal cual.
3. **Política de pago** — sólo `PAY_AT_HOTEL` habilitado en Fase 1; los demás
   (`FULL_PREPAY`, `DEPOSIT_30/50`) aparecen deshabilitados ("Disponible con
   prepago online — próximamente").
4. **Branding tokens** (logo, color, copy) — **datos**, no diseño: la API los
   devuelve como JSON para que el website (o la Hosted Page) los aplique. El
   consultor no maquetea nada.
5. **Genera la API key** (`pk_live_…`) + registra `allowedOrigins[]` (el dominio
   del website del hotel). Se la entrega al developer.
6. Pulsa **Activar** → `enabled=true`. La API queda LIVE para ese slug.

**Lo que el consultor NO hace:** no programa el website, no diseña páginas, no
sube HTML. Eso es trabajo del developer (UC-U1b) o, si el hotel no tiene dev, usa
la Hosted Page que Zenix ya renderiza (UC-U2).

**Resultado:** el motor está LIVE y documentado. El developer del hotel tiene su
API key + la doc para integrar.

**Diferenciador:** ningún PMS de la comparativa separa limpio "config consultor-led
en el panel" de "website headless del cliente". Cloudbeds mezcla ambos en un
self-service de ~12h; Opera exige consultor Oracle ($15-30k). Zenix = el consultor
deja la config en minutos y el developer integra contra una API documentada.

---

### UC-U1b · El developer conecta el website independiente del hotel ⏳ (B2/B6)
**Como** developer (el owner o un tercero contratado por el hotel), **quiero**
integrar el sitio web del hotel con Zenix Booking leyendo la documentación
**para que** el sitio muestre disponibilidad real y cree reservas — sin que Zenix
me imponga cómo se ve mi sitio.

**Flujo (headless, el sitio se adapta a la API):**
1. El consultor me pasa el `slug` + la API key (`pk_live_…`) + el link a la doc
   (`docs.zenix.com/api`, B6).
2. En **mi** website (WordPress/Next/Astro/lo que sea, en **mi** hosting), maqueteo
   la UI **como yo quiera** — Zenix no dicta el diseño.
3. Cuando el visitante elige fechas, mi front llama:
   `GET /api/v1/public/properties/{slug}/availability?checkIn=…&checkOut=…&adults=…`
   → recibo JSON con tipos de habitación disponibles + tarifas. Lo pinto a mi estilo.
4. Al confirmar, mi backend llama:
   `POST /api/v1/public/reservations` con `X-API-Key` + `Idempotency-Key` + el body
   documentado → Zenix valida inventario (§35) y **genera la reserva** en el PMS.
5. Me suscribo a webhooks (`reservation.created/cancelled`, `availability.changed`)
   para mantener mi sitio en sync.

**Garantía de independencia:** mi website y Zenix sólo comparten el **contrato HTTP**.
Mi sitio puede caerse, cambiar de tecnología o rediseñarse sin tocar Zenix; Zenix
puede evolucionar internamente sin romperme mientras respete `/v1/`. **Esto es
exactamente lo que describe el owner: el website manda data por HTTP, la interfaz
de Zenix la recibe y procesa para generar la reserva.**

**Quién lee la doc:** cualquier developer que quiera conectar un website —
indistintamente de quién sea— lee `docs.zenix.com/api` e implementa contra el
contrato. No hay "integración mágica"; hay una API documentada y estable.

---

### UC-U2 · El huésped reserva desde el sitio del hotel (pago en recepción) ⏳ (B5)
**Como** huésped, **quiero** reservar una habitación directamente en el sitio del hotel **para que** no tenga que pasar por Booking.com.

**Flujo (happy path, Opción B):**
1. En el sitio del hotel pulsa "Reservar" → aterriza en `book.zenix.com/hotel-tulum`.
2. Elige fechas (check-in/out) + huéspedes (adultos/niños) → **Buscar**.
3. Ve tarjetas de habitaciones disponibles con foto + precio por noche + total. (Sin disponibilidad → mensaje claro + sugerencia de fechas cercanas.)
4. Elige una habitación → checkout **single-page**: nombre, email, teléfono.
5. **Banner explícito:** "Tu reserva se confirma ahora. **Pagas al llegar al hotel.**" (No se pide tarjeta en Fase 1.)
6. Acepta T&C + política de cancelación → **Confirmar reserva**.
7. Pantalla de confirmación: número de reserva (`bookingRef`) + resumen + email de confirmación.

**Resultado:** la reserva aparece **al instante** en el calendario de recepción (SSE §124) con `source='DIRECT_WEB'`, `paymentModel='HOTEL_COLLECT'`, saldo pendiente = total. Cero comisión OTA.

**Por qué pago en recepción funciona (LATAM):** hoteles boutique/hostal ya operan así; "reserva directa + pago al llegar" es vendible solo. El prepago online es un *upgrade* (P1, post-PAY-CORE), no un prerequisito.

---

### UC-U3 · La recepcionista ve y gestiona la reserva directa ✅ (base ya existe)
**Como** recepcionista, **quiero** que las reservas directas lleguen como cualquier otra **para que** mi flujo de check-in no cambie.

**Flujo:**
1. Trabajando en el calendario, aparece un bloque nuevo sin recargar (SSE `stay:created`).
2. El bloque indica origen directo (chip `Directo`, distinto de OTA).
3. Al llegar el huésped: check-in normal → registra el pago en recepción (efectivo/terminal/transferencia) con el flujo `RegisterPaymentDialog` existente.
4. Si el huésped no llega: el night audit lo marca no-show (§13) y aplica la política de cancelación (Fase C, ya en main).

**Nota:** este UC reusa 100% lo que ya existe (check-in §105-§110, pagos §28, no-show §11-§18). El booking engine solo *inyecta* el `GuestStay`.

---

### UC-U4 · El huésped cancela su reserva ⏳ (B2)
**Como** huésped, **quiero** cancelar mi reserva online **para que** el hotel libere la habitación.
**Flujo:** abre el link de su confirmación → "Cancelar" → si la política lo permite (`DELETE /v1/public/reservations/:id`), se marca `cancelledAt`, libera inventario (AvailabilityService excluye cancelled §95), aplica retención según política, y dispara webhook `reservation.cancelled`. Si la política no permite cancelación online → mensaje "contacta al hotel".

---

### UC-U5 · El developer del hotel integra la API directamente ⏳ (B2/B6)
**Como** developer de una cadena, **quiero** crear reservas vía API **para que** mi propia UI/app las empuje a Zenix.
**Flujo:** obtiene `pk_live_…` desde Settings → consume `GET /availability` + `POST /reservations` con `X-API-Key` + `Idempotency-Key` → recibe webhooks `reservation.created`. Maneja su propia UI. (Tier 3, ~5% del mercado.)

---

### UC-U6 · El hotel mide el ROI del motor directo ⏳ (reports)
**Como** dueño, **quiero** ver qué % de reservas vinieron directas vs OTA **para que** mida el ahorro de comisión.
**Flujo:** en reports, el desglose por `source` separa `DIRECT_WEB` de `BOOKING_COM/EXPEDIA/AIRBNB`. El dueño ve "30% directo = $X ahorrado en comisión este mes".

---

## PARTE B — Casos de uso a nivel TÉCNICO

### UC-T1 · Resolución pública de la property por slug ⏳ (B1)
```
GET /v1/public/properties/hotel-tulum
```
1. CORS abierto (read-only, sin API key). Throttle per-IP 60/min.
2. `SELECT … FROM booking_engine_config WHERE slug='hotel-tulum'`.
3. Guard: `enabled=true` → si no, **404** (no se filtra que el slug exista pero esté off).
4. Devuelve info pública: nombre, hero, branding, currency, languages, fotos. `Cache-Control: max-age=30`.

**Por qué el slug y no el `propertyId`:** no exponemos el UUID interno (anti-IDOR, mismo principio que el token opaco de auto-checkin §179). El slug es público por diseño.

---

### UC-T2 · Consulta de disponibilidad ⏳ (B1)
```
GET /v1/public/properties/hotel-tulum/availability?checkIn=2026-07-01&checkOut=2026-07-04&adults=2
```
1. Resuelve `propertyId` por slug (UC-T1).
2. **Delega a `AvailabilityService.check` (§35)** — única fuente de verdad de inventario. NUNCA query directa a `staySegment`/`guestStay`.
3. Excluye no-shows (§17), cancelled (§95) y zombies/overstayed (§128) — gratis, ya lo hace el service.
4. Resuelve tarifas con el `rate-resolver` (RATES-CORE) por RoomType × noches.
5. Respuesta cacheable 30s. Sin commit a DB.

---

### UC-T3 · Creación de reserva con anti-overbook + idempotencia ⏳ (B2)
```
POST /v1/public/reservations
Headers: X-API-Key: pk_live_…   Idempotency-Key: <uuid>
Body: { slug, roomTypeId, checkIn, checkOut, guest{name,email,phone}, paxCount }
```
**Secuencia:**
```
Cliente            API pública            AvailabilityService        DB / SSE
   │  POST + Idempotency-Key  │                    │                    │
   │─────────────────────────►│                    │                    │
   │                          │ ¿Idempotency-Key    │                    │
   │                          │  ya visto? ─────────┼───► sí: 200 cached │
   │                          │                    │                    │
   │                          │ validar API key +  │                    │
   │                          │ CORS allowedOrigins│                    │
   │                          │────── check() ─────►│  (§35 transaccional)│
   │                          │                    │── overlap? 409 ────►│
   │                          │◄─── libre ──────────│                    │
   │                          │ crea GuestStay      │                    │
   │                          │  source=DIRECT_WEB  │───── INSERT ──────►│
   │                          │  paymentModel=      │                    │
   │                          │   HOTEL_COLLECT     │                    │
   │                          │  paymentPolicy=     │                    │
   │                          │   PAY_AT_HOTEL      │                    │
   │                          │ emite SSE           │── stay:created ───►│ (recepción)
   │                          │ encola webhook      │                    │
   │◄──── 201 {bookingRef} ───│                    │                    │
```
**Garantías:**
- **Anti-overbook:** el guard transaccional §35 — el primero que confirma gana, el segundo recibe **409** (mismo mecanismo que protege walk-ins y OTA inbound).
- **Doble-click / retry:** `Idempotency-Key` UUID client-side → el segundo request devuelve el primer resultado, no crea reserva duplicada.
- **Auth:** `X-API-Key` (bcrypt hash en DB) + CORS dinámico contra `allowedOrigins[]` de la key. Origen no listado → 403.
- **Tiempo real:** SSE `stay:created` (§124, singleton) refresca el calendario de recepción sin recargar.

---

### UC-T4 · Hold de inventario + auto-release (sin prepago) ⏳ (B2)
Sin prepago, una reserva sin confirmar no puede bloquear inventario para siempre.
- Al crear, la reserva nace confirmada (pago en recepción) — en Fase 1 **no hay estado "hold"** porque no esperamos un pago online. El inventario se ocupa de inmediato.
- `holdTtlMinutes` (default 1440) queda **cableado para P1**: cuando llegue el prepago (OXXO/SPEI 24-72h), una reserva en estado `pending_payment` se auto-libera vía scheduler si el voucher no se paga. En Fase 1 el campo existe pero no se ejerce.

---

### UC-T5 · Webhooks outbound con HMAC + retry ⏳ (B3)
Cuando ocurre `reservation.created/cancelled` o `availability.changed`:
1. `WebhookDispatcher` busca `WebhookSubscription` activas de la property suscritas al evento.
2. Firma el payload con HMAC-SHA256 (`secret` per-subscription) → header `X-Zenix-Signature`. El cliente verifica que el evento viene de Zenix.
3. Entrega async. Si falla: retry exponencial 1s/5s/30s/5m/30m. Tras 5 intentos → dead-letter + alerta al supervisor (`AppNotification`).
4. Patrón idéntico al outbound de Channex (§144) — reutiliza la disciplina de cola + backoff.

---

### UC-T6 · Modelo de datos (B0 implementado ✅)
```
Property 1───1 BookingEngineConfig   (slug, enabled, paymentPolicy, branding, …)
GuestStay.source = 'DIRECT_WEB'       (String libre, sin migration de enum)
GuestStay.paymentModel = 'HOTEL_COLLECT'
─── pendientes B2/B3 ───
BookingApiKey         (pk_live/pk_test, bcrypt hash, allowedOrigins[])
WebhookSubscription   (url, events[], secret HMAC)
─── pendiente P2 (post-PAY-CORE) ───
CommissionLog         (marketplace Tier 2, Stripe Connect split)
```

---

### UC-T7 · Aislamiento de seguridad (multi-capa)
| Vector | Defensa |
|--------|---------|
| Scraping / DDoS de la API pública | Cloudflare WAF + `@nestjs/throttler` per-IP (read) + per-key (write) |
| Overbook desde API externa | `AvailabilityService.check` transaccional §35 → 409 |
| IDOR (adivinar reservas/properties) | slug público opaco; reservas por `bookingRef` no enumerable; UUID interno nunca expuesto |
| API key comprometida | revocable instant + audit log por IP/timestamp + `allowedOrigins` CORS |
| Webhook spoofing | HMAC-SHA256 `X-Zenix-Signature` verificable por el cliente |
| Doble booking accidental | `Idempotency-Key` obligatorio en POST |

---

## PARTE C — Modelo de habitaciones y huéspedes (duda owner 2026-06-11)

> *"¿Cómo se asegura la API de recibir la habitación correcta y los huéspedes
> correctos? ¿Está planeada para recibir diferentes tipos de habitación en
> diferentes fechas?"* — **Sí. Así funciona:**

### C.1 · Se reserva un TIPO de habitación, no una habitación física
El visitante (y por ende el website) **nunca elige la habitación física** (la 103,
la B1…). Elige un **tipo** (Estándar, Suite, Cabaña, Villa, Dormitorio…). Zenix
**asigna la habitación física libre** de ese tipo al crear la reserva, validando
con `AvailabilityService.check` (§35). Es el estándar de industria (Booking/Expedia
mandan `room_type_id`, el PMS asigna el cuarto) y es **el mismo path que ya usa
Channex inbound** (§137) — no inventamos nada.

**Por qué TYPE y no room físico:**
- El hotel quiere libertad de asignar el cuarto óptimo (piso, vista, turnover de
  limpieza) hasta el check-in. Si el website fijara "habitación 103", ataría al
  hotel y multiplicaría los conflictos de overbook.
- Cada hotel define sus tipos en el wizard (un hotel tiene Estándar/Suite; una
  villa tiene "Villa 2 rec"/"Villa 4 rec"; un hostal tiene "Cama en dorm mixto").
  El motor es **agnóstico al tipo de propiedad** — sólo expone los RoomTypes que
  el hotel configuró.

### C.2 · El website obtiene los `roomTypeId` válidos de la API (B1)
El website **no inventa** ids de habitación. Los **lee** de:
```
GET /v1/public/properties/{slug}/room-types   → [{ id, name, maxOccupancy, baseRate }]
GET /v1/public/properties/{slug}/availability → por tipo: availableRooms + tarifa
```
Pinta esos tipos a su estilo. Cuando el visitante elige uno, el website manda
**ese `roomTypeId`** en el POST. Si manda un id inexistente o de otra property →
la API responde **404** (`Tipo de habitación no encontrado`). El website se adapta
al contrato; la API **nunca confía** en el cliente — re-valida todo server-side.

### C.3 · Huéspedes: `adults` + `children` con tope de capacidad
Cada línea de habitación lleva `adults` (≥1) + `children` (≥0). La API calcula
`pax = adults + children` y lo valida contra `RoomType.maxOccupancy`:
- `pax > maxOccupancy` → **400** (`"Estándar" admite hasta 2 huéspedes; se solicitaron 4`).
- El `paxCount` se guarda en la `GuestStay` (BI + reportes demográficos).

> El modelo es **per-room + paxCount** (no per-cama-nominal). El check-in per-bed
> nominal de hostal (un nombre por litera) es una decisión de esquema aparte
> (diferida, igual que en GROUP-BILLING Fase B §242).

### C.5 · Comunicación website ↔ Zenix para evitar overbooking (3 capas)

> *"El website debería decirle al huésped que esas fechas no están disponibles
> ANTES de dar click en reservar; deben estar en comunicación sólida."* — Sí, en
> **3 capas**. Ninguna sola basta; juntas dan la garantía:

**Capa 1 — Feed de calendario (advisory, B3 ✅).** `GET …/availability-calendar?from=&to=`
devuelve, por noche y por tipo, cuántas habitaciones quedan libres. El **date-picker
del website pinta en gris las fechas sin cupo** antes de que el huésped elija →
elimina el ~95% de los callejones sin salida. Es cacheable (60s) → puede estar
levemente desfasado (por eso es *advisory*, no garantía).

**Capa 2 — Webhook `availability.changed` (push, B3 ✅).** Cuando el inventario
cambia (una reserva de OTA vía Channex, una cancelación, un bloqueo de
mantenimiento, o **otra reserva directa**), Zenix hace un **POST firmado al
website** → el sitio **invalida su calendario cacheado al instante**. Sin polling.
Esto cierra la ventana de desfase de la Capa 1: el website siempre tiene el cupo
casi en tiempo real. **Verificado e2e**: reserva directa → llegan `reservation.created`
+ `availability.changed` con `X-Zenix-Signature` HMAC válido.

**Capa 3 — Guard transaccional §35 en el POST (hard, B2 ✅).** Es la **única
garantía real**. Aunque el calendario diga "libre", dos huéspedes pueden pulsar
"Reservar" por el último cuarto en el mismo milisegundo. El `POST /reservations`
hace el check dentro de una transacción: **el primero gana, el segundo recibe 409**.
El website maneja el 409 con "esa habitación se acaba de ocupar, intenta otras
fechas". **Ningún sistema puede prevenir 100% la carrera desde el cliente** — la
verdad vive en el servidor.

> **Resumen:** Capa 1 evita que el huésped *intente* fechas malas · Capa 2 mantiene
> el calendario fresco en tiempo real · Capa 3 garantiza que jamás se cree un
> overbooking real. El website "se adapta" consumiendo el feed + escuchando el
> webhook + manejando el 409 — todo documentado en el contrato HTTP.

### C.4 · Diferentes tipos en diferentes fechas → SÍ, vía `rooms[]`
El body del POST es un **array** `rooms[]`. **Cada entrada es independiente**:
su propio `roomTypeId`, su propio `checkIn`/`checkOut`, sus propios huéspedes.
```jsonc
POST /v1/public/reservations
{
  "guest": { "name": "Familia García", "email": "...", "phone": "..." },
  "rooms": [
    { "roomTypeId": "villa-2rec", "checkIn": "2026-09-01", "checkOut": "2026-09-04", "adults": 2 },
    { "roomTypeId": "suite",      "checkIn": "2026-09-02", "checkOut": "2026-09-05", "adults": 4, "guestName": "Abuelos" }
  ]
}
```
Esto cubre nativamente:
- **1 habitación** → `rooms` de 1 elemento → reserva simple.
- **N habitaciones mismas fechas** (familia/grupo) → `ReservationGroup` + N stays.
- **Tipos y/o fechas distintas** (villa 3 noches + suite 3 noches solapadas) → cada
  línea se resuelve por separado; si son ≥2, se agrupan en un `ReservationGroup`.

**Atomicidad:** si **cualquier** línea no tiene disponibilidad (§35) o excede
capacidad, se rechaza **toda** la reserva (no se crea media reserva). El website
recibe el error y reintenta con otras fechas/tipos.

**Verificado e2e (2026-06-11):** grupo `[Estándar 09-01→09-04, Suite 09-02→09-05]`
→ `isGroup:true`, 2 stays (rooms 103 + B1), total correcto, cada una con su
`bookingRef` + journey + segment + `groupRoomIndex`.

---

## PARTE D — Wizard Step 5.5: cómo el consultor configura el motor (detalle)

> El consultor **no programa ni diseña**. Llena un formulario en Nova que produce
> la `BookingEngineConfig` + la API key. El website (que haces tú/un tercero)
> consume la API resultante. ⏳ UI pendiente (B4); el schema ya existe (B0/B2).

**⚠️ OPCIONAL — no es forcing function (decisión owner 2026-06-11).** Zenix
Booking es un **servicio extra que se cobra aparte**; el cliente puede no quererlo.
Por eso:
- El **Step 5.5 del wizard es skippeable** — si el consultor lo salta, **no se crea
  `BookingEngineConfig`** y la API pública responde 404 para esa property (motor
  apagado). El wizard avanza al Step 6 sin bloquear.
- **Se puede activar/desactivar después desde el panel/dashboard del consultor en
  Nova** (no sólo en el wizard). Un toggle "Zenix Booking" → set `enabled=true/false`
  (crea la config si no existía). Así el cliente puede contratar el servicio meses
  después sin re-onboarding, o darse de baja sin tocar el resto del PMS.

**Contexto:** cuando SÍ se configura, el Step 5.5 vive **después** de que el
consultor ya cargó Properties (Step 4) e Inventario/RoomTypes+RatePlans (Step 5).
Es decir, **las habitaciones y tarifas ya existen** cuando llega aquí; el motor
sólo las expone.

### Sub-pasos del Step 5.5 (lo que el consultor llena)

| # | Campo | Qué hace | Persiste en |
|---|-------|----------|-------------|
| 5.5.1 | **Slug** | El sistema propone `slugify(nombre)` (`Hotel Tulum`→`hotel-tulum`); editable, se desambigua si choca (`buildUniqueSlug`). Es el id público de la API. | `BookingEngineConfig.slug` |
| 5.5.2 | **Activar motor** | Toggle on/off. Off → la API responde 404 para ese slug. | `enabled`, `publishedAt` |
| 5.5.3 | **Política de pago** | Radio: sólo **`PAY_AT_HOTEL`** habilitado en Fase 1; `FULL_PREPAY/DEPOSIT_30/50` grises ("requiere prepago online — próximamente"). | `paymentPolicy` |
| 5.5.4 | **Branding (tokens, no diseño)** | Logo (sube a R2), color primario/acento (color picker), fuente. Son **datos** que la API devuelve como JSON; el website (o la Hosted Page) los aplica. | `logoUrl`, `primaryColor`, `accentColor`, `fontFamily` |
| 5.5.5 | **Copy & políticas** | Título/subtítulo del hero, link de T&C, política de cancelación (hook al engine Fase C). | `heroTitle`, `heroSubtitle`, `termsUrl`, `cancellationPolicyId` |
| 5.5.6 | **Display** | Idioma default (es-MX), moneda de display (fallback a `LegalEntity.baseCurrency`). | `defaultLanguage`, `displayCurrency` |
| 5.5.7 | **API key + dominios** | Botón "Generar llave" → muestra el `pk_live_…` **una sola vez** (se copia). Registra `allowedOrigins[]` (el dominio del website del hotel) para el CORS. | `BookingApiKey` |
| 5.5.8 | **Marketplace (opt-in)** | Toggle para listarse en `book.zenix.com` (Tier 2, comisión 3-5%). Default off. | `marketplaceListingEnabled` |

### Lo que el consultor ENTREGA al developer (tú/tercero)
1. El **slug** (`hotel-tulum`) → para los `GET /v1/public/properties/{slug}/…`.
2. La **API key** (`pk_live_…`) → para el `POST /reservations` + `GET /reservations/:ref`.
3. El **link a la documentación** (`docs.zenix.com/api`, B6) → el contrato HTTP completo.

Con eso, el developer integra el website independiente (UC-U1b). El consultor
no toca código ni diseño: su trabajo es **dejar la config y la llave listas**.

### Para hoteles SIN developer
El consultor (o el hotel) usa la **Hosted Page** `book.zenix.com/{slug}` (B5),
que Zenix ya renderiza leyendo esa misma `BookingEngineConfig`. Cero integración;
el hotel pega un `<a href>` en su sitio. Es la opción turnkey — mismo motor, misma
config, sin developer.

---

## Matriz UC × Etapa de implementación

| UC | Nivel | Etapa | Estado |
|----|-------|-------|--------|
| UC-U1 consultor configura motor | Usuario | B4 | ⏳ (schema ✅) |
| UC-U1b developer conecta website headless | Usuario | B2/B6 | ✅ API (READ+WRITE) · ⏳ docs |
| UC-U2 huésped reserva (Hosted Page) | Usuario | B5 | ⏳ |
| UC-U3 recepción gestiona | Usuario | (base) | ✅ existe |
| UC-U4 huésped cancela | Usuario | B2.1 | ⏳ (requiere cancel engine) |
| UC-U5 developer integra (Tier 3) | Usuario | B2/B6 | ✅ API · ⏳ docs |
| UC-U6 ROI directo vs OTA | Usuario | reports | ⏳ |
| UC-T1 resolución por slug | Técnico | B1 | ✅ |
| UC-T2 disponibilidad (rango) | Técnico | B1 | ✅ |
| UC-T2b feed calendario (per-noche) | Técnico | B3 | ✅ |
| UC-T3 crear reserva (multi-room) | Técnico | B2 | ✅ |
| UC-T4 hold + auto-release | Técnico | B2/P1 | ⏳ |
| UC-T5 webhooks (HMAC+retry) | Técnico | B3 | ✅ |
| UC-T6 modelo de datos | Técnico | B0 | ✅ parcial |
| UC-T7 seguridad | Técnico | B1-B3 | ⏳ |
