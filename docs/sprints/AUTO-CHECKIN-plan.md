# Sprint AUTO-CHECKIN — Pre-arrival identity capture (PROPUESTA)

> **Status:** ✅ **APROBADO 2026-06-11 (Opción C)** · branch `feat/auto-checkin` · scope v1.0.0
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

## 4. Propuesta de plan (fases)

**AUTO-CHECKIN MVP (estimado ~2-3 sem, mayormente ensamblaje):**
- **Fase 1 — Backend (4-5d):** schema `precheckinToken*` + `guestVerifiedFields` +
  endpoints públicos `GET /precheckin/:token` (datos pre-cargados, token-gated,
  rate-limited) + `POST /precheckin/:token` (datos + foto, write-back + audit +
  `identityCaptured=true`). Trigger email (scheduler pre-arrival). Resend template.
  Precedencia §136 vs guest-verified (D-AC6).
- **Fase 2 — Web-app huésped (4-6d):** ruta `/precheckin/:token`, form pre-llenado
  con datos de Channex, cámara móvil (D-AC3) + compresión, aviso de privacidad,
  estados (ready/expired/submitted/error), responsive mobile-first.
- **Fase 3 — Integración recepción + storage (2-3d):** el sheet/ConfirmCheckin
  refleja "identidad pre-cargada por el huésped" + foto visible; storage (D-AC4).
- **Fase 4 — QA e2e + verificación navegador móvil (1-2d).**

**Diferido a SIGN-DLC v1.1.0 (NO en este MVP):** e-signature canvas, T&C
versionado, NOM-151/Mifiel, chargeback evidence package. El MVP deja el cimiento
(token kiosk + consent log + foto) que SIGN-DLC extiende.

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
