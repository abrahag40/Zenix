# Sprint AUTO-CHECKIN — Pre-arrival identity capture (PROPUESTA)

> **Status:** PROPUESTA / pendiente aprobación owner · arrancado análisis 2026-06-11
> **Origen:** directiva owner — incluir auto-checkin en v1.0.0. Idea: al recibir
> un booking de Channex (email + tel), Zenix manda un email lindo con un link a
> una mini web-app donde el huésped corrige sus datos (pre-cargados de la OTA) +
> toma foto de su pasaporte desde el móvil → se carga a la reserva → agiliza el
> check-in en recepción.
> **⚠️ Esta es una propuesta con opciones, NO un plan cerrado. El owner elige
> secuenciación/scope antes de implementar.**

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

### D-AC4 — Almacenamiento de la foto (PUNTO CRÍTICO — privacidad)
- La foto de pasaporte es PII sensible. Hoy recepción usa data-URI base64 en BD
  (§110e, migración S3 en v1.0.4 IMG). Para uploads guest-facing a escala, base64
  en BD es riesgoso (blobs grandes).
- **Opción A (recomendada):** presigned upload a S3/R2 (adelanta parte de v1.0.4
  IMG). + **política de retención**: borrar/anonimizar la foto N días post-checkout
  (Visa chargeback window 120d vs minimización LFPDPPP/GDPR — definir con el owner;
  default sugerido: conservar hasta checkout+30d, luego purgar la imagen y dejar
  solo el flag "verificada").
- Opción B: data-URI base64 interino (consistente con recepción) + límite de
  tamaño estricto + cifrado. Más rápido de shippear, deuda explícita.
- **Debate:** Opción A es lo correcto pero acopla S3. Si v1.0.0 no quiere S3 aún,
  Opción B con TODO numerado. Recomiendo A si el owner acepta adelantar S3.

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

## 5. Recomendación de secuenciación v1.0.0 (3 opciones — owner decide)

| Opción | Qué entra a v1.0.0 | Tag v1.0.0 | Trade-off |
|---|---|---|---|
| **A — Ship & iterate (recom.)** | Tag PMS core YA. AUTO-CHECKIN = v1.0.1 (fast-follow, alto ROI, chico). BOOKING-ENGINE = v1.1.0 (grande, depende de pago guest). | inmediato | Piloto arranca ya; features llegan como updates. Menor riesgo. |
| **B — v1.0.0 expandido** | AUTO-CHECKIN + BOOKING-ENGINE adentro. Tag al cerrar ambos. | +~2-3 meses | Un solo lanzamiento "completo"; piloto espera. Mayor riesgo de slip. |
| **C — Híbrido** | AUTO-CHECKIN adentro de v1.0.0 (chico, agiliza recepción del piloto). BOOKING-ENGINE = v1.1.0. | +~3 sem | Balance: el piloto estrena auto-checkin; el booking engine (que necesita pago guest) no bloquea. |

**Mi recomendación: C** (o A si el piloto necesita arrancar ya). Razón: el
BOOKING-ENGINE depende de **procesar el pago del huésped** (flujo Stripe distinto
al de subscription billing — Payment Intents guest→hotel, payouts, PCI), que es
territorio PAY-CORE (v1.0.1). Meterlo "en v1.0.0" arrastra PAY-CORE adentro y
duplica el tamaño del release. AUTO-CHECKIN no tiene esa dependencia y da valor
operativo inmediato al piloto.
