# Sprint AUTO-CHECKIN — Pre-arrival identity capture (PROPUESTA)

> **Status:** ✅ **IMPLEMENTADO 2026-06-11 (Fases 1-4)** · branch `feat/auto-checkin` · scope v1.0.0
> · e2e verificado en Chrome (1 salvedad: pantalla de éxito del huésped → verificar en teléfono real). Pendiente: merge (OK owner) → tag v1.0.0.
> **Origen:** directiva owner — incluir auto-checkin en v1.0.0. Idea: al recibir
> un booking de Channex (email + tel), Zenix manda un email lindo con un link a
> una mini web-app donde el huésped corrige sus datos (pre-cargados de la OTA) +
> toma foto de su pasaporte desde el móvil → se carga a la reserva → agiliza el
> check-in en recepción.
>
> **Decisiones bloqueadas con el owner (2026-06-11):**
> - **Secuenciación = Opción C** — AUTO-CHECKIN entra a v1.0.0; BOOKING-ENGINE → v1.1.0.
> - **El link NUNCA expone el ID interno** — el ID solo viaja en el JSON server-side; el huésped jamás ve data interna. (token opaco en la URL, D-AC1).
> - **El check-in oficial en recepción NO se elimina** — esto OPTIMIZA (pre-carga identidad); recepción sigue confirmando llegada + pago + llave.
> - **Pagos = SIEMPRE en recepción.** El auto-checkin NO procesa pago (ni guest payment). Solo identidad.
> - **La carga del huésped es OPCIONAL** — no se le obliga; si no carga, el check-in es el normal en recepción. La UI/flujo asume "best-effort".
> - **Sin e-signature / T&C / NOM-151** en este MVP → eso es SIGN-DLC v1.1.0 (este es su cimiento).

---

## 0. TL;DR del análisis (debate, no "sí a todo")

La idea es **sólida y validada por la industria** (Mews Online Check-in, Cloudbeds
Guest Portal, Canary Technologies, Duve, Operto). Pero hay 4 cosas que **NO**
recomiendo hacer como las pediste literalmente, con justificación:

1. **NO usar el ID interno de Zenix en el link.** Sería un IDOR (Insecure Direct
   Object Reference): cualquiera adivinando IDs accede a PII de otros huéspedes.
   → Token single-use, alta entropía, hasheado y con expiración (patrón
   `setupTokenHash` §179, ya existe). La URL nunca expone el ID interno.
2. **NO es "elimina el check-in", es "agiliza".** El huésped pre-carga su
   IDENTIDAD; el recepcionista sigue confirmando llegada física + pago + llave.
   Lo que se ahorra es la captura de identidad (la parte lenta). Precisión de
   expectativa = evitar sobre-prometer al hotel.
3. **NO meter pago ni e-signature ni NOM-151 en este MVP.** El huésped captura
   identidad (datos + foto). El pago es hotel-side / OTA-collect. La firma +
   conservación legal NOM-151 es SIGN-DLC v1.1.0 (este MVP es su cimiento).
4. **NO enviar el email inmediato al confirmar** (un booking a 3 meses → email
   prematuro, el huésped lo ignora/olvida). → Envío **temporizado pre-arrival**
   (X días antes, configurable), reusando el scheduler de pre-arrival warming
   (§41) que ya existe. Opcional: envío inmediato + recordatorio.

El resto de tu idea (tomar datos de Channex, mostrarlos, dejar que el huésped los
corrija, foto desde el navegador móvil, write-back a la reserva) es **correcto y
se implementa casi todo ENSAMBLANDO piezas que ya existen** (ver §2).

## 1. Comparativa de mercado (¿quién hace esto y cómo?)

| PMS / plataforma | Pre-arrival check-in | ID upload | Pre-fill de OTA | Foto en móvil | E-sign | Fuente |
|---|---|---|---|---|---|---|
| **Mews** | Online Check-in (link email) | ✅ | ✅ | ✅ | ✅ (tier) | docs Mews |
| **Cloudbeds** | Guest Portal / MyFrontdesk | ✅ | parcial | ✅ | add-on | help Cloudbeds |
| **Canary Technologies** | especialista contactless | ✅ | ✅ | ✅ | ✅ | canarytech |
| **Duve / Operto** | guest-experience platform | ✅ | ✅ | ✅ | ✅ | duve.com |
| **Little Hotelier** | Web check-in form | básico | ✅ | ✅ | básico | littlehotelier |
| **Zenix (hoy)** | ❌ (solo recepción §105-§110) | ✅ recepción | ✅ (Channex mapper) | ✅ recepción | SIGN-DLC v1.1 | — |

**Conclusión:** es feature de paridad, no diferenciador per se. El diferenciador
Zenix es (a) **LATAM-first** (foto pasaporte sin OCR caro, CFDI genérico §108) y
(b) **el cimiento de SIGN-DLC** (NOM-151 nativo, que ningún PMS LATAM tiene).
Hacerlo bien ahora es la base; la firma+NOM-151 lo monetiza después (DLC Pro).

## 2. Lo que YA existe (este sprint es 70% ensamblaje, no obra nueva)

| Pieza necesaria | Estado | Dónde |
|---|---|---|
| Extracción email/tel/país/nombre de Channex | ✅ | `channex-booking.mapper.ts` (§129-§137) |
| Token single-use hasheado + TTL + TOCTOU | ✅ patrón | wizard `setupTokenHash` §179 |
| Captura de foto del documento (componente) | ✅ | `DocumentPhotoCapture` (recepción §108) |
| Flag `identityCaptured` que agiliza el check-in | ✅ | §229 D-CHECKIN-C1-1 (el sheet ya lo respeta) |
| Email transaccional (Resend) | ✅ | `ActivationEmailService` §182 |
| Ruta pública token-gated (patrón) | ✅ | `/setup/:token`, `/onboarding/card` |
| Scheduler pre-arrival (timing del envío) | ✅ | pre-arrival warming §41 |
| `GuestContactLog` (registrar el envío) | ✅ | §42 |

**Lo NUEVO a construir:** (a) token de pre-checkin + endpoints públicos
(GET datos pre-cargados / POST datos+foto); (b) la mini web-app `/precheckin/:token`
(form pre-llenado + cámara móvil + privacidad); (c) write-back a la reserva con
marca "guest-verified"; (d) el trigger del email (scheduler o on-booking); (e)
manejo de almacenamiento de la foto.

## 3. Decisiones de diseño (con alternativas, no una sola)

### D-AC1 — Token (no ID interno)
- **Opción A (recomendada):** token opaco 32 bytes hex, guardado **hasheado**
  (SHA256) en `GuestStay.precheckinTokenHash` + `precheckinTokenExpiresAt` +
  `precheckinSubmittedAt`. URL `app.zenix.com/precheckin/{rawToken}`. Single-use
  (re-submit permitido hasta arrival, luego se invalida). Patrón §179.
- Opción B: JWT firmado stateless. ❌ más difícil de revocar/expirar; no aporta.
- Opción C: ID interno directo. ❌ IDOR + fuga de PII. Descartada.

### D-AC2 — Ubicación de la web-app
- **Opción A (recomendada):** ruta pública en `apps/web` `/precheckin/:token`
  (como `/setup/:token`). Cero infra nueva, reusa build/deploy.
- Opción B: nueva `apps/guest` (planeada v1.5). ❌ over-engineering para MVP.

### D-AC3 — Captura de la foto
- **Opción A (recomendada MVP):** `<input type="file" accept="image/*"
  capture="environment">` → abre cámara trasera nativa en móvil. Simple, robusto.
  + compresión client-side (canvas, target ~1600px / <500KB) + fix de orientación EXIF.
- Opción B: `getUserMedia` live preview con botón de captura. Más control/UX, más
  código + permisos. Diferir a v1.0.x si el hotel lo pide.

### D-AC4 — Almacenamiento de la foto (PUNTO CRÍTICO — privacidad) ✅ DECIDIDO
**Hallazgo (2026-06-11): ya existe `apps/api/src/uploads/UploadsService`** (Sprint
Mx-1B) que procesa imágenes con Sharp: valida MIME real (no solo Content-Type),
resize a 1920px, recodifica JPEG q85, **strip de EXIF/GPS** (privacidad — NIST SP
800-122 + GDPR), nombra con UUID v4 no-adivinable, límite 5MB, path-traversal-safe.
Su interfaz de retorno `{ id, url }` **ya está diseñada para migrar a S3/R2 sin
tocar callers** (la migración es el step Mx-1C / v1.0.4 IMG). R2 ya está en el
stack de infra (§73 / docs/vision/12).

Comparativa:
| Opción | Pros | Cons |
|---|---|---|
| **1 — Reusar `UploadsService` + nuevo scope `precheckin`** ✅ | reusa procesamiento probado (Sharp, EXIF strip, MIME, UUID, 5MB); interfaz S3-ready ya abstraída; mínimo código nuevo; consistente con recepción | requiere variante public-path (orgId explícito, sin TenantContext) + **retrieval auth-gated** |
| 2 — base64 data-URI en BD | cero infra de archivos | blobs grandes en Postgres, infla backups; `UploadsService` ya es superior |
| 3 — R2 directo ahora | storage productivo desde día 1 | hace el migration Mx-1C dentro de auto-checkin; más scope del necesario |

**DECISIÓN = Opción 1.** Reusar `UploadsService` con un nuevo `UploadScope = 'precheckin'`.
Disco local ahora (igual que recepción); el swap a R2 es el step Mx-1C ya planeado
(misma interfaz `{id,url}`, sin refactor). Dos refinamientos **no-negociables** por
ser PII sensible (pasaporte):
- **(a) Retrieval AUTH-GATED.** El GET público actual `/api/uploads/:org/:scope/:file`
  sirve fotos de mantenimiento (bajo riesgo). La foto de pasaporte **NO** se sirve
  por ahí — solo visible para staff autenticado (embebida en el checkin-context
  auth'd, o endpoint de retrieval con guard). El huésped la SUBE (token-gated) pero
  solo recepción la VE.
- **(b) Path de upload público.** El guest sube vía el endpoint token-gated
  `POST /precheckin/:token` → backend valida token → llama `UploadsService` pasando
  el `organizationId` **resuelto del token** (no de `TenantContextService`, que no
  existe en request público). Variante `processPublic(buffer, orgId, scope)`.
- **Retención:** purgar la imagen N días post-checkout (default sugerido 30d,
  configurable), conservando el flag `identityVerifiedAt` + tipo de documento.
  Tensión Visa chargeback 120d vs minimización LFPDPPP — el owner/legal fija N.
  *(Cifrado-at-rest del blob: hardening para la fase R2; en disco single-instance
  el control es UUID no-adivinable + retrieval auth-gated + EXIF strip + retención.)*

### D-AC5 — Timing del email
- **Opción A (recomendada):** envío **X días antes de la llegada** (config
  `PropertySettings.precheckinLeadDays`, default 3) vía el scheduler pre-arrival
  (§41). + recordatorio opcional 24h antes si no completó.
- Opción B: inmediato al `booking_new`. ❌ prematuro para bookings lejanos.
- Opción C: ambos (inmediato "confirmación" + pre-arrival "completa tu check-in").
- Canal: **email (Resend) MVP**; WhatsApp (tel de Channex) en v1.0.x+ (requiere
  WhatsApp Business API, más trabajo).

### D-AC6 — Precedencia del write-back (dato corregido por huésped vs OTA)
- Si el huésped corrige su teléfono y luego llega un `booking_modify` de Channex
  con el dato viejo, **gana el dato verificado por el huésped**. Marca
  `guestVerifiedFields[]` + el `BookingModifyHandler` (§136 "safe fields") NO
  sobrescribe campos guest-verified. Sin esto, el dato corregido se pierde.

### D-AC7 — Privacidad / consentimiento (LFPDPPP)
- La web-app muestra **aviso de privacidad** + checkbox de consentimiento antes
  de capturar la foto. El consentimiento se registra (timestamp + versión) —
  cimiento del audit trail que SIGN-DLC formaliza.

### D-AC8 — Scope de datos del formulario
- Captura: nombre/apellido, tipo+foto de documento, nacionalidad, email/tel
  (corrección), nº de huéspedes/sexo (opcional, §233). **NO** pago, **NO** llave.
- El check-in en recepción (`ConfirmCheckinDialog`) detecta `identityCaptured` →
  salta la sección de identidad → recepción solo confirma llegada + pago.

## 4. Plan de trabajo + seguimiento (se actualiza al cerrar cada fase)

> **AUTO-CHECKIN MVP** (~2-3 sem, 70% ensamblaje). Esta tabla es la fuente de
> verdad del avance; se reporta al cerrar cada fase y se espeja en CLAUDE.md.

| Fase | Detalle | Entregables clave | Estado |
|------|---------|-------------------|--------|
| **1a — Backend core** | Token opaco SHA256 (anti-IDOR) + endpoints públicos `GET/POST /v1/precheckin/:token` + write-back con `guestVerifiedFields` + foto vía `UploadsService` scope `precheckin` (orgId del token, sin TenantContext) | migración `20260616000000_auto_checkin_precheckin`; `PrecheckinService`/`Controller`/`Module`; UploadsService scope+orgId override; **11/11 tests**; typecheck API verde | ✅ **HECHO** (2026-06-11) |
| **1b — Email + trigger** | `PrecheckinEmailService` (Resend HTML, fail-soft) + `PrecheckinScheduler` `@Cron` 2 pases idempotentes (invitación 3d antes + recordatorio 24h); precedencia `BookingModifyHandler` §136 no pisa `guestVerifiedFields` | migración `20260617000000`; email+scheduler+modify guard; **16/16 tests** | ✅ **HECHO** (2026-06-11) |
| **2 — Web-app huésped** | Ruta pública `/precheckin/:token` (form pre-llenado de Channex + cámara móvil `capture` + compresión + aviso privacidad LFPDPPP + consentimiento + estados), mobile-first | `PrecheckinPage.tsx` + ruta; typecheck web verde | ✅ **código** (render e2e → Fase 4) |
| **3 — Integración recepción + storage** | Seguridad D-AC4 (scope precheckin fuera del GET público) + foto auth-gated (context→data-URI) + badge recepción "identidad pre-cargada" + retención scheduler ~30d | uploads guard+helpers; context+badge; retention; **43/43 tests** | ✅ **HECHO** (2026-06-11) |
| **4 — QA e2e + navegador móvil** | Verificación en Chrome DESDE 0 (ver bitácora): GET pre-cargado sin IDs · submit write-back · foto pública 404 · contexto auth-gated data-URI · **recepción badge "identidad pre-cargada" + foto CAPTURADO** | bitácora QA e2e | ✅ **HECHO** (1 salvedad: pantalla "¡Listo!" del huésped → verificar en teléfono real) |

**Diferido a SIGN-DLC v1.1.0 (NO en este MVP):** e-signature canvas, T&C
versionado, NOM-151/Mifiel, chargeback evidence package. El MVP deja el cimiento
(token kiosk + consent log + foto) que SIGN-DLC extiende.

### Bitácora de avance
- **2026-06-11 — Ciclo de vida del link (single-use + purga).** Pedido owner: el
  link debe morir al cargar datos (o el día después del check-in si no se abrió),
  y la re-entrada debe mostrar "ya se realizó".
  - **Single-use (write):** `submit` rechaza con 409 si `precheckinSubmittedAt`
    ya existe → el link no permite un segundo envío ("expira al cargar datos").
  - **Re-entrada amable:** el GET devuelve `alreadySubmitted` → la página muestra
    la pantalla "¡Pre-check-in completo!" (ya existía + verificada con captura).
  - **Purga de memoria:** `PrecheckinRetentionScheduler.purgeExpiredTokens`
    (`@Cron` diario) anula `precheckinTokenHash`/`ExpiresAt` para stays con
    `checkinAt < hoy 00:00` → el token "muere al día siguiente del check-in"
    (cubre enviados y no-abiertos); conserva el rastro (`precheckinSubmittedAt`/
    `guestVerifiedFields`). Aclaración técnica: el token es un campo hasheado en
    la reserva (no un objeto aparte); se conserva hasta post-check-in solo para
    poder mostrar la re-entrada amable, luego se purga. 27/27 tests precheckin
    verdes (+ single-use guard + token-purge). Typecheck API verde.
- **2026-06-11 — Bug-hunt e2e en Chrome (con capturas).** 2 bugs + rediseño:
  - **BH-1 🟠 (aislamiento/privacidad):** las rutas PÚBLICAS (`/precheckin`,
    `/setup`, `/onboarding`, `/login`) montaban la maquinaria de staff —
    `NotificationAlertsMount` abría un SSE `/api/events` (con el token de staff
    persistido en el navegador) + el huésped descargaba TODO el bundle operativo
    (~100+ módulos: Dashboard/Kanban/Nova/Timeline…). **Fix doble:** (a)
    `ConditionalAlertsMount` no monta el SSE/notifs en rutas públicas; (b)
    **code-split** (React.lazy + Suspense) de todas las páginas de staff →
    verificado en navegador: `/precheckin` carga **0 módulos de staff** (solo
    `PrecheckinPage.tsx`; total bajó de 100+ a 46). El endpoint backend ya estaba
    aislado (`@Public`, solo `PrecheckinService`, proyección mínima). `/pms` sigue
    OK (lazy on-demand, sin regresión).
  - **BH-2 🟢 (UX):** un token corto/truncado (<32 chars → backend 400) mostraba
    "Tu link expiró" en vez de "inválido". **Fix:** mapeo 410→expirado, resto
    (404/400/red)→inválido. Verificado con captura.
  - **Rediseño (pedido owner):** las tarjetas de estado genéricas (emoji) →
    `StatusScreen` profesional (icono SVG en anillo con halo, jerarquía,
    eyebrow de propiedad, pill "Nos vemos pronto en {hotel}", firma "Pre-check-in
    seguro · Zenix") + `LoadingScreen` con spinner branded. Capturas: happy path
    pre-llenado, "¡Pre-check-in completo!", "link inválido", "link expiró".
  - **Salvedad Fase 4 RESUELTA:** la pantalla de éxito "¡Listo!" del huésped SÍ
    funciona (el cuelgue anterior era la pestaña congelada de CDP, no un bug);
    verificada en pestaña limpia con captura. Typecheck web verde.
- **2026-06-11 — Fase 4 (QA e2e en Chrome DESDE 0).** Stack levantado (API 3000 +
  web 5173). Seed: booking tipo-Channex (Hans Müller, hostelworld, OTA_COLLECT,
  llega +2d) + token de precheckin. Verificado:
  · `GET /v1/precheckin/:token` (público) → datos pre-cargados (Hans/Müller/email/
    +49/DE) **sin IDs internos ni folio** (curl + DOM del navegador).
  · `/precheckin/:token` en viewport móvil (414px) **renderiza** el form pre-llenado.
  · `POST /v1/precheckin/:token` (datos + foto) → `{ok, photoCaptured:true,
    verifiedFields:[guestPhone,documentType,documentPhoto]}`; BD: `guestPhone`
    corregido a +49 151 9999999, `precheckinSubmittedAt` set, `documentPhotoUrl`
    = scope precheckin en disco.
  · **Seguridad D-AC4**: `GET` público de la foto precheckin → **404** ✓.
  · **Auth-gated**: `getCheckinContext` (con JWT) resuelve la foto a
    `data:image/jpeg;base64,…` + expone `precheckinSubmittedAt`/`guestVerifiedFields`.
  · **Recepción**: `ConfirmCheckinDialog` (mover llegada a hoy) muestra banner
    **"Identidad pre-cargada por el huésped — confirmó/corrigió 7 dato(s)"** +
    **FOTO DEL DOCUMENTO ✓ CAPTURADO** (screenshot).
  · Limpieza: stay QA-PRECHK-1 + foto de prueba borrados; servers detenidos.
  **Salvedades honestas (§4):** (a) el submit POR LA PÁGINA aterrizó server-side
  pero la pestaña automatizada se congeló (CDP) y no se observó la pantalla
  "¡Listo!" del huésped → verificar en teléfono real. (b) La inyección de archivo
  por automatización no dispara el `onChange` de React (limitación de herramienta)
  → la foto se validó por el endpoint real + se vio CAPTURADA en recepción.
- **2026-06-11 — Fase 3 cerrada.** (a) Seguridad D-AC4: el GET público de
  uploads rechaza el scope `precheckin` (404 — no revela existencia). (b) Foto
  auth-gated: `UploadsService.readAsDataUri`/`deleteByUrl` + `getCheckinContext`
  resuelve la foto de disco a data-URI server-side (solo staff la ve;
  `UploadsService` inyectado `@Optional` para no romper specs legacy). (c) Badge
  recepción: `ConfirmCheckinDialog` muestra banner sky "Identidad pre-cargada por
  el huésped" + nº de campos verificados; el context expone `precheckinSubmittedAt`
  + `guestVerifiedFields`. (d) `PrecheckinRetentionScheduler` `@Cron('0 5 * * *')`
  purga la foto + anula `documentPhotoUrl` >30d post-checkout (conserva el rastro).
  43/43 tests (4 retention + 3 uploads helpers + 17 checkin regression + 19
  precheckin previos). Typecheck API+web verde. **Verificación e2e en Chrome
  desde 0 → Fase 4** (pedido del owner: documentado como parte del testing e2e
  al finalizar el desarrollo).
- **2026-06-11 — Fase 2 código completo.** `PrecheckinPage.tsx` (ruta pública
  `/precheckin/:token` en App.tsx): state machine loading/ready/expired/notfound/
  submitted; form pre-llenado con `GET /v1/precheckin/:token` (nombre/apellido/
  email/teléfono/nacionalidad/tipo-doc); captura de foto vía `<input
  capture="environment">` + compresión client-side (canvas ~1600px / JPEG 0.8);
  aviso de privacidad LFPDPPP + checkbox de consentimiento obligatorio; submit
  `POST /v1/precheckin/:token`. Mobile-first, emerald-branded, reusa el `api`
  client (mismo patrón que SetupPage). Typecheck web verde. **Render e2e en
  navegador móvil real diferido a Fase 4** (servidores dev abajo en esta sesión).
- **2026-06-11 — Fase 1b cerrada.** `PrecheckinEmailService` (Resend REST, HTML
  emerald + plain-text, fail-soft 3-niveles no-key/api-error/network).
  `PrecheckinScheduler` `@Cron('0 * * * *')`: pase invitación (≤3d antes) + pase
  recordatorio (≤24h, sin completar) — idempotentes vía `precheckinSentAt` /
  `precheckinReminderSentAt` (migración `20260617000000`); marca solo en éxito o
  `no-key` (transitorios reintentan); TTL del token cubre hasta la llegada+24h.
  Precedencia §D-AC6: `BookingModifyHandler` excluye `guestVerifiedFields` del
  patch (la corrección del huésped gana sobre la OTA). Defaults owner: 3d + 24h.
  16/16 tests nuevos/tocados (6 scheduler + 2 email + 8 modify). Typecheck verde.
- **2026-06-11 — Fase 1a cerrada.** Schema + migración aplicada (5 columnas
  `precheckin*` + `guestVerifiedFields`). `PrecheckinService` (generateToken /
  getContext / submit) con guards 404/410/400 + proyección pública sin IDs/folio
  (anti-fuga verificada en test). `PrecheckinController` público (`@Public`).
  `UploadsService` extendido (scope `precheckin` + `orgIdOverride`). 11/11 unit
  tests verdes; typecheck API verde.

## 5. Secuenciación v1.0.0 — ✅ Opción C elegida (owner 2026-06-11)

| Opción | Qué entra a v1.0.0 | Tag v1.0.0 | Trade-off |
|---|---|---|---|
| A — Ship & iterate | Tag PMS core YA. AUTO-CHECKIN = v1.0.1. BOOKING-ENGINE = v1.1.0. | inmediato | Piloto arranca ya; menor riesgo |
| B — v1.0.0 expandido | AUTO-CHECKIN + BOOKING-ENGINE adentro. | +~2-3 meses | Mayor riesgo de slip |
| **C — Híbrido ✅ ELEGIDA** | **AUTO-CHECKIN adentro de v1.0.0**; BOOKING-ENGINE = v1.1.0. | +~3 sem | Balance: el piloto estrena auto-checkin; el booking engine no bloquea |

**Decisión: C.** El BOOKING-ENGINE depende de **procesar el pago del huésped**
(Payment Intents Stripe guest→hotel + payouts + PCI) = territorio PAY-CORE (v1.0.1);
meterlo en v1.0.0 arrastraría PAY-CORE adentro y duplicaría el release. AUTO-CHECKIN
no tiene esa dependencia, es chico (~2-3 sem, mayormente ensamblaje) y da valor
operativo inmediato al piloto → entra a v1.0.0. **Tag v1.0.0 = al cerrar AUTO-CHECKIN.**
