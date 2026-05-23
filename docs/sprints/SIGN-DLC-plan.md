---
Audiencia: Equipo de desarrollo Zenix · Product owner · Asesoría legal
Estado: Plan propuesto — pendiente de aprobación
Branch: feature/sign-dlc
Última actualización: 2026-05-21
Sprint anterior: BITACORA-UNIFICATION (2026-05-20) — single source of truth UI bitácora
Disparador: caso documentado Hotel Azúcar Tulum — flujo manual de papel firmado expone PAN al manager (PCI-DSS violation) + LFPDPPP non-compliance + chargeback win-rate sub-óptimo. Diferencial comercial frente a Mews/Cloudbeds/Opera que no cubren NOM-151 nativo en LATAM.
---

# Sprint SIGN-DLC — Módulo "Zenix Sign": Digital check-in + e-signature + chargeback evidence

> **Misión del sprint**: reemplazar el flujo manual de tres hojas firmadas (registration card + T&C + payment voucher) por un wizard digital con audit trail NOM-151-grade + signature canvas + builder de chargeback evidence package one-click. Activable como **DLC tier Pro** (USD $25-40/property/mes + adapter NOM-151 opcional). Cero almacenamiento de PAN en papel, win-rate de chargebacks ↑15-25 %, tiempo de check-in 8 min → 2 min.

---

## 1. Contexto y motivación

### 1.1 El gap operativo documentado (caso Hotel Azúcar Tulum, mayo 2026)

Flujo manual observado:

| Documento | Datos sensibles capturados | Riesgo |
|---|---|---|
| **Hoja 1: Guest Registration Card** | Nombre, fecha, # adultos/menores/bebés, vehículo, firma manuscrita | LFPDPPP — datos personales sin consent log digital |
| **Hoja 2: Terms & Conditions** | Aceptación con firma manuscrita | Audit trail nulo — versión del T&C que firmó es inferible solo por fecha |
| **Hoja 3: Payment voucher** | Voucher Banorte con últimos 4 dígitos + holder name + approval code + **firma del huésped sobre la copia** | PCI-DSS — almacenamiento físico sin controles |
| **Workflow paralelo** | Manager captura manualmente PAN+CVV de Expedia Partner Central en su POS Banorte | **Violación PCI-DSS Req 3.3.1** — exposición humana de SAD |

Las tres hojas se archivan en folder físico ≥13 meses (período de disputa Visa). En caso de chargeback, el manager las escanea y las sube al portal del adquirente.

### 1.2 Por qué este sprint vale el ROI

Beneficios cuantificables:

1. **Chargeback win-rate ↑ ~15-25 %.** Chargebacks911 *Hospitality Industry Chargeback Report 2023* documenta 48 % win-rate con paper-signed evidence vs 67 % con e-signature + audit trail completo. Para un boutique con USD $30k/mes en ingresos OTA, asumiendo 1 % chargeback rate y 50 % de los actuales que se pierden por evidencia débil → recuperación incremental ~USD $700-900/mes.

2. **PCI-DSS compliance.** Eliminar la copia física del voucher con PAN visible saca al hotel del foco de auditorías que aplican al manager. Reduce exposición a multas $5k-100k/mes (Visa Operating Regulations).

3. **LFPDPPP compliance.** Consent log + revocation flow automático cumple Art. 22 + Art. 35.

4. **Tiempo operativo.** Mews benchmark (2023): check-in con online pre-arrival → presencial baja a ~2 min vs 8-10 min del flujo de tres hojas. Throughput de recepción en hora pico ↑ 4×.

5. **Diferencial comercial.** Ningún PMS LATAM-first tiene NOM-151 nativo. Mews/Cloudbeds/Opera integran DocuSign/HelloSign — válidos en USA/EU pero **no** cumplen automáticamente con la conservación de NOM-151-SCFI-2016. Zenix Sign se posiciona como *the LATAM-first compliance module*.

### 1.3 Modelo de monetización (DLC)

Activable per `LegalEntity` desde Zenix Activate wizard (§77-§80) o desde Settings:

| Tier | Precio (USD) | Incluido |
|---|---|---|
| **Sign Starter** | $25/property/mes | Hasta 100 firmas/mes, PDF audit, S3 storage 1 GB |
| **Sign Pro** | $40/property/mes | Firmas ilimitadas, ToC linter, evidence package builder, S3 5 GB |
| **NOM-151 Add-on** | +$10/property/mes | Conservación PSC (pass-through Mifiel ~$5/doc) + constancia oficial |

Posicionamiento competitivo: Cloudbeds Payments add-on (~$30-50/mes/property) NO incluye NOM-151. Mews Kiosk solo en tier Enterprise (~$300/mes/property). Zenix Sign Pro = mejor relación costo/feature en mercado LATAM.

---

## 2. Investigación de mercado — cómo lo hacen los competidores

### 2.1 Benchmark de soluciones existentes

| PMS | Signature module | E-sig backend | NOM-151 | Tier | Fuente |
|---|---|---|---|---|---|
| **Mews** | Mews Kiosk + Mobile Check-in | DocuSign embed | ❌ (requiere Mifiel manual) | Pro+ Enterprise | [help.mews.com](https://help.mews.com/) |
| **Cloudbeds** | Pre-Arrival + Digital Check-in | HelloSign / propio Stripe vault | ❌ | Add-on $30-50/mes | [cloudbeds.com](https://www.cloudbeds.com/) |
| **Opera Cloud** | Self-Service Kiosk Module | OPI proprietary | ❌ | Enterprise | [docs.oracle.com/hospitality](https://docs.oracle.com/en/industries/hospitality/) |
| **RoomRaccoon** | RaccoonPay + iPad signature | Adyen | ❌ | Built-in todos los planes | [roomraccoon.com](https://roomraccoon.com/) |
| **Little Hotelier** | Web check-in form | Stripe; signature básica | ❌ | Add-on $15/mes | [littlehotelier.com](https://www.littlehotelier.com/) |
| **Clock PMS+** | Self-Service Kiosk | Custom | ❌ | Add-on | [clock-software.com](https://www.clock-software.com/) |
| **Zenix Sign (propuesto)** | Kiosk web + mobile + tablet signature | Propio + Mifiel API | ✅ **Nativo** | DLC Pro $40/mes | — |

### 2.2 Patrones técnicos comunes

Todos los PMS competidores comparten:

1. **Signature canvas** HTML5 (Mews y Cloudbeds usan `<canvas>` + librería `signature_pad` de Szymon Nowak — open source, MIT).
2. **PDF builder server-side** que combina form + ToC + signature → un solo archivo (Mews usa `puppeteer` headless; Cloudbeds usa `wkhtmltopdf`).
3. **Hash SHA-256** del PDF resultante + timestamp para integrity.
4. **Audit log append-only** por documento (event sourcing).
5. **Email del PDF al guest** post-check-in (NN/g — confirmación tangible).

Lo que NO hacen y Zenix sí debe hacer:

- **NOM-151 nativo** (acreditación SE con PSC mexicano).
- **CFDI 4.0 link** (cuando v1.0.2 entre): el signature audit trail menciona el UUID del CFDI emitido — útil en disputas fiscales SAT.
- **ToC linter** que detecta cláusulas potencialmente abusivas vs PROFECO Art. 90.

---

## 3. Decisiones no-negociables (candidatas a sumar a CLAUDE.md §)

### D-SIGN1: PDF firmado es inmutable + audit log append-only

Un `RegistrationCard` con `status='SIGNED'` no puede modificarse. Ediciones post-firma generan una versión nueva (`version` incrementa) y dejan la anterior `status='SUPERSEDED'`. El PDF original se conserva. Patrón análogo a §11 (no-show inmutable) y §28 (PaymentLog append-only).

### D-SIGN2: Hash SHA-256 + timestamp obligatorios

Todo PDF generado calcula `signatureSha256` = `sha256(file_bytes)` antes de subir a S3/R2. El hash se almacena en `RegistrationCard.signatureSha256`. Si NOM-151 Add-on activo, ese mismo hash se envía a Mifiel para sellado de tiempo + constancia.

### D-SIGN3: PAN nunca tocado por Zenix Sign

El payment voucher firmado **solo muestra**: holder name + last 4 + approval code + monto + timestamp. **Nunca** PAN completo, **nunca** CVV. El PAN vive solo en el PSP (Stripe/Conekta/Adyen) tokenizado (§81 PAY-CORE). Si el hotel todavía opera Hotel Collect con Banorte físico (caso Azúcar), el manager captura en el POS afuera de Zenix — el voucher digital de Zenix es post-cobro y solo registra el resultado.

### D-SIGN4: ToC versionado per LegalEntity

`TermsAndConditionsVersion` tiene scope `legalEntityId` (no Property — todas las properties de un LegalEntity comparten T&C; lo que cambia es el footer con dirección/teléfono). Versión es `Int` auto-incrementing por legalEntity. `effectiveFrom/effectiveTo` para vigencia. Una firma siempre referencia el `versionId` exacto que aceptó el guest.

### D-SIGN5: ToC editor con linter integrado

El editor de T&C ejecuta linter al guardar:
- Cláusulas con plazo >72h para cambios de fecha → warning (potencialmente abusivo per PROFECO Art. 90).
- Cláusulas con cargo >USD $200 por daño "menor" (toalla, sábana) → warning.
- Falta de sección "No-show policy" → error (requerido para defensa de chargeback CRR 13.7).
- Falta de sección "Identity verification" → warning (recomendado per Visa CRR 10.4).

### D-SIGN6: Signature canvas con guard de tamaño mínimo

`signature_pad` con `minWidth: 0.5, maxWidth: 2.5`. Al submit, valida que hay ≥30 puntos en el trazo (no firmas vacías). Pattern de Adobe Sign + DocuSign.

### D-SIGN7: NOM-151 es opcional, no obligatorio

El módulo Sign base genera PDFs con hash + audit trail propio (suficiente para chargebacks Visa/Mastercard per Visa Dispute Management Guidelines 2024 §5.9.2). NOM-151 es **add-on** para casos donde el hotel quiere conservación oficial ante notario / SAT / juicios civiles mexicanos.

### D-SIGN8: Self-service vs Staff-assisted, ambos en MVP

Dos flujos del MVP:
- **Self-service kiosk web** (`/checkin-portal/:token`): el guest accede desde su teléfono via link OTA/email, completa form + ToC + signature, asynchronously. Status `PENDING_GUEST` → `PARTIALLY_SIGNED`.
- **Staff-assisted en tablet** (`/staff/checkin/:stayId`): el recepcionista pone su iPad al guest, mismo flujo pero con audit `actorType='STAFF'` adicional. Para guests que llegan sin pre-arrival.

### D-SIGN9: Evidence Package builder one-click

`GET /v1/guest-stays/:id/evidence-package` retorna PDF combinado:
1. Registration card firmado
2. T&C versión exacta firmada (snapshot)
3. Payment voucher firmado (last4 + approval)
4. Check-in/checkout timestamps + room key activations (si HK module activo)
5. Restaurant charges + spa charges si POS module activo
6. Audit log completo (eventos + IPs + user agents)

Listo para upload directo al portal del adquirente (Banorte Disputes, Banamex Disputes, Stripe Disputes, etc.).

### D-SIGN10: Email del PDF al guest post-firma

Patrón industry-wide (Mews, Cloudbeds, Booking). Trigger automático al `status='SIGNED'`: email con asunto "Tu confirmación de check-in - Hotel X" + PDF adjunto. Reduce disputas futuras porque el guest tiene copia tangible.

---

## 4. Schema changes (Prisma)

```prisma
// ── RegistrationCard — documento principal del flujo de check-in digital ──
model RegistrationCard {
  id               String   @id @default(uuid())
  stayId           String   @unique @map("stay_id")
  organizationId   String   @map("organization_id")
  propertyId       String   @map("property_id")
  legalEntityId    String   @map("legal_entity_id")

  // Status state machine: DRAFT → PENDING_GUEST → PARTIALLY_SIGNED → SIGNED → SUPERSEDED (si edita post-sign)
  status           String   @default("DRAFT")
  version          Int      @default(1)

  // ── Form fields capturados ──
  fullName         String?  @map("full_name")
  email            String?
  phone            String?
  nationality      String?  // ISO 3166 alpha-2
  guestSex         String?  @map("guest_sex")

  documentType     String?  @map("document_type")  // PASSPORT | INE | LICENSE | OTHER
  documentNumberMasked String? @map("document_number_masked")  // ej *****1234
  documentPhotoUrl String?  @map("document_photo_url")          // S3/R2 URL (MAINT-11 pattern)

  numAdults        Int?     @map("num_adults")
  numMinors        Int?     @map("num_minors")
  numBabies        Int?     @map("num_babies")

  vehicle          Json?    // { model, color, license_plates }

  // ── ToC acceptance ──
  tocVersionId     String?  @map("toc_version_id")
  tocAcceptedAt    DateTime? @map("toc_accepted_at")
  tocAcceptedIp    String?  @map("toc_accepted_ip")
  tocAcceptedUserAgent String? @map("toc_accepted_user_agent")

  // ── Signature ──
  signatureSvg     String?  @map("signature_svg") @db.Text  // path data signature_pad
  signedAt         DateTime? @map("signed_at")
  signedByIp       String?  @map("signed_by_ip")
  signedByUserAgent String? @map("signed_by_user_agent")
  signedByActorType String? @map("signed_by_actor_type")  // GUEST | STAFF (staff-assisted)
  signedByStaffId  String?  @map("signed_by_staff_id")    // si actorType=STAFF

  // ── Resulting PDF ──
  pdfStorageUrl    String?  @map("pdf_storage_url")
  signatureSha256  String?  @map("signature_sha256")
  pdfGeneratedAt   DateTime? @map("pdf_generated_at")

  // ── NOM-151 conservation (add-on opcional) ──
  nom151ConservationId String? @map("nom151_conservation_id")  // PSC adapter ID (Mifiel doc_id)
  nom151Constancia URL? @map("nom151_constancia_url")
  nom151ConservedAt DateTime? @map("nom151_conserved_at")

  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")

  stay         GuestStay                @relation(fields: [stayId], references: [id])
  tocVersion   TermsAndConditionsVersion? @relation(fields: [tocVersionId], references: [id])
  voucherSigns PaymentVoucherSignature[]
  auditLogs    SignatureAuditLog[]

  @@index([stayId])
  @@index([status])
  @@index([propertyId, status])
  @@map("registration_cards")
}

// ── T&C versionado per LegalEntity ──
model TermsAndConditionsVersion {
  id             String   @id @default(uuid())
  legalEntityId  String   @map("legal_entity_id")
  version        Int      // auto-increment por legalEntity

  // Content
  contentMd      String   @db.Text @map("content_md")
  language       String   @default("es")

  // Lifecycle
  status         String   @default("DRAFT")  // DRAFT | ACTIVE | ARCHIVED
  effectiveFrom  DateTime @map("effective_from")
  effectiveTo    DateTime? @map("effective_to")
  archivedAt     DateTime? @map("archived_at")

  // Linter snapshot (warnings detected at activation time)
  linterReport   Json?    @map("linter_report")

  createdById    String   @map("created_by_id")
  createdAt      DateTime @default(now()) @map("created_at")

  registrationCards RegistrationCard[]

  @@unique([legalEntityId, version])
  @@index([legalEntityId, status])
  @@map("terms_conditions_versions")
}

// ── PaymentVoucherSignature — firma sobre cada PaymentLog (1:N por reg card) ──
model PaymentVoucherSignature {
  id                  String   @id @default(uuid())
  registrationCardId  String   @map("registration_card_id")
  paymentLogId        String   @unique @map("payment_log_id")

  signatureSvg        String?  @db.Text @map("signature_svg")
  signedAt            DateTime? @map("signed_at")
  signedByIp          String?  @map("signed_by_ip")
  signedByUserAgent   String?  @map("signed_by_user_agent")
  signedByActorType   String?  @map("signed_by_actor_type")  // GUEST | STAFF

  pdfStorageUrl       String?  @map("pdf_storage_url")
  pdfSha256           String?  @map("pdf_sha256")

  createdAt           DateTime @default(now()) @map("created_at")

  registrationCard RegistrationCard @relation(fields: [registrationCardId], references: [id])
  paymentLog       PaymentLog       @relation(fields: [paymentLogId], references: [id])

  @@index([registrationCardId])
  @@map("payment_voucher_signatures")
}

// ── SignatureAuditLog — event sourcing append-only ──
model SignatureAuditLog {
  id                  String   @id @default(uuid())
  registrationCardId  String   @map("registration_card_id")
  event               String
  // Events:
  //   'CARD_CREATED' | 'FORM_FIELD_UPDATED' | 'TOC_DISPLAYED' | 'TOC_ACCEPTED'
  //   | 'SIGNATURE_CAPTURED' | 'PDF_GENERATED' | 'NOM151_CONSERVED'
  //   | 'EMAIL_SENT' | 'VOUCHER_SIGNED' | 'EVIDENCE_PACKAGE_GENERATED'
  //   | 'SUPERSEDED_BY_NEW_VERSION'
  actorType           String   @map("actor_type")  // GUEST | STAFF | SYSTEM
  actorId             String?  @map("actor_id")
  ipAddress           String?  @map("ip_address")
  userAgent           String?  @map("user_agent")
  metadata            Json?
  occurredAt          DateTime @default(now()) @map("occurred_at")

  registrationCard RegistrationCard @relation(fields: [registrationCardId], references: [id])

  @@index([registrationCardId, occurredAt])
  @@map("signature_audit_logs")
}

// ── Modificaciones a modelos existentes ──
model GuestStay {
  // ... campos existentes ...
  registrationCard RegistrationCard?
}

model LegalEntity {
  // ... campos existentes ...
  signModuleActive Boolean @default(false) @map("sign_module_active")  // DLC activation flag
  signModuleTier   String? @map("sign_module_tier")  // STARTER | PRO
  nom151AddonActive Boolean @default(false) @map("nom151_addon_active")
  nom151PscProvider String? @map("nom151_psc_provider")  // MIFIEL | SEGURIDATA | OTHER

  tocVersions TermsAndConditionsVersion[]
}

model PaymentLog {
  // ... campos existentes ...
  voucherSignature PaymentVoucherSignature?
}
```

---

## 5. API endpoints

### 5.1 Guest-facing (auth via short-lived token)

| Método | Path | Descripción |
|---|---|---|
| `GET` | `/v1/portal/checkin/:token` | Resolve token → return RegistrationCard draft + ActiveToC |
| `PATCH` | `/v1/portal/checkin/:token/form` | Update form fields (idempotent) |
| `POST` | `/v1/portal/checkin/:token/upload-document` | Upload photo of document (data URI base64; S3 en v1.0.4 IMG) |
| `POST` | `/v1/portal/checkin/:token/accept-toc` | Record ToC acceptance |
| `POST` | `/v1/portal/checkin/:token/sign` | Capture signature SVG, validate, trigger PDF gen |
| `POST` | `/v1/portal/checkin/:token/sign-voucher/:paymentLogId` | Sign payment voucher |
| `GET` | `/v1/portal/checkin/:token/pdf` | Download signed PDF (after sign) |

### 5.2 Staff-facing (auth JWT, role SUPERVISOR + RECEPTIONIST)

| Método | Path | Descripción |
|---|---|---|
| `GET` | `/v1/guest-stays/:id/registration-card` | Read current state |
| `POST` | `/v1/guest-stays/:id/registration-card/init` | Create draft + generate guest portal token |
| `POST` | `/v1/guest-stays/:id/registration-card/staff-sign` | Staff-assisted signature on iPad |
| `POST` | `/v1/guest-stays/:id/registration-card/edit-and-supersede` | Force edit post-sign (creates v2, marks v1 SUPERSEDED) — supervisor only |
| `POST` | `/v1/guest-stays/:id/registration-card/conserve-nom151` | Trigger NOM-151 conservation via PSC adapter |
| `GET` | `/v1/guest-stays/:id/evidence-package` | Download chargeback evidence bundle PDF |
| `POST` | `/v1/guest-stays/:id/registration-card/resend-portal-link` | Re-send email/SMS with portal token |

### 5.3 Admin ToC management (SUPERVISOR + ORG_ADMIN)

| Método | Path | Descripción |
|---|---|---|
| `GET` | `/v1/terms-conditions/:legalEntityId` | List all versions |
| `GET` | `/v1/terms-conditions/:legalEntityId/active` | Get current active version |
| `POST` | `/v1/terms-conditions/:legalEntityId/versions` | Create new draft |
| `PATCH` | `/v1/terms-conditions/:legalEntityId/versions/:id` | Edit draft (linter runs) |
| `POST` | `/v1/terms-conditions/:legalEntityId/versions/:id/activate` | Activate (archive previous) |
| `POST` | `/v1/terms-conditions/:legalEntityId/versions/:id/lint` | Run linter explicitly |

---

## 6. Servicios y abstracciones

### 6.1 `RegistrationCardService` (`apps/api/src/sign/registration-card.service.ts`)

Métodos principales:
- `initDraft(stayId, actorId)` → crea card DRAFT + emite `CARD_CREATED`
- `updateForm(cardId, patch, actorContext)` → merge campos + emite `FORM_FIELD_UPDATED`
- `acceptToc(cardId, tocVersionId, actorContext)` → registra aceptación + emite `TOC_ACCEPTED`
- `applySignature(cardId, svgPathData, actorContext)` → valida ≥30 puntos, llama `PdfBuilderService.generate(cardId)`, emite `SIGNATURE_CAPTURED` + `PDF_GENERATED`
- `staffSignOnBehalf(cardId, staffId, ...)` → variante con `actorType='STAFF'` audit
- `editAndSupersede(cardId, patch, supervisorId)` → marca v1 SUPERSEDED, crea v2 DRAFT con campos merged

### 6.2 `PdfBuilderService` (`apps/api/src/sign/pdf-builder.service.ts`)

Wrapper sobre `puppeteer` headless (decision: puppeteer over wkhtmltopdf por mejor soporte CSS3 + emoji + Unicode LATAM):

```ts
async generate(cardId: string): Promise<{ url: string; sha256: string }> {
  const card = await loadCardWithRelations(cardId)
  const html = await renderTemplate('registration-card.html', card)
  const pdfBuffer = await this.puppeteerPool.renderToPdf(html, { format: 'Letter' })
  const sha256 = crypto.createHash('sha256').update(pdfBuffer).digest('hex')
  const url = await this.storageService.upload(`reg-cards/${cardId}/v${card.version}.pdf`, pdfBuffer)
  return { url, sha256 }
}
```

Templates HTML server-side rendered con datos del card + ToC snapshot embebido. Storage adapter pluggable (S3 prod, local dev — MAINT-11 pattern).

### 6.3 `IPscAdapter` Strategy pattern (analog §89 IFiscalAdapter)

```ts
interface IPscAdapter {
  readonly providerKey: 'MIFIEL' | 'SEGURIDATA' | 'TRUST2U'
  conserve(pdfUrl: string, sha256: string): Promise<{
    conservationId: string
    constanciaUrl: string
    conservedAt: Date
  }>
}

class MifielPscAdapter implements IPscAdapter { /* ... */ }
class SeguriDataPscAdapter implements IPscAdapter { /* ... */ }
```

MVP solo `MifielPscAdapter` (mejor API docs, sandbox gratis). Otros en backlog.

### 6.4 `EvidencePackageBuilder` (`apps/api/src/sign/evidence-package-builder.service.ts`)

Combina:
1. Registration card PDF actual
2. Snapshot del ToC version firmado
3. Payment voucher signatures (todos los PaymentLogs)
4. Audit log timeline (HTML → PDF)
5. CleaningTask logs (check-out timestamp evidence)
6. Optional: room key access logs (cuando lock integration entre en v1.5)

Output: single PDF + ZIP de raw assets (para upload directo a portal adquirente).

### 6.5 `TocLinterService`

Reglas (extensibles):
- `RULE_LATE_CHANGE_WINDOW`: regex `\b(\d+)\s*(?:business\s+)?days?\b` en sección "date changes" → si N > 3 → warning.
- `RULE_NOSHOW_SECTION_PRESENT`: secciones requeridas via headings → si falta `## No-Show` o equivalente → error.
- `RULE_DAMAGE_FEE_REASONABLE`: detecta menciones de fees > USD $200 por items específicos → warning.
- `RULE_IDENTITY_VERIFICATION_PRESENT`: requiere sección que mencione identification → warning si falta.
- `RULE_LANGUAGE_MATCHES_PROPERTY`: si language=es pero contenido detectado como inglés → warning.

Output `LinterReport` JSON con `{ severity, ruleId, message, lineHint, suggestion }[]`.

---

## 7. UI flows

### 7.1 Guest portal (`/checkin-portal/:token`) — React/Vite, mobile-first

```
┌─ Step 1: Welcome ──────────────────────────────────┐
│ Hotel Azúcar Tulum                                  │
│ Tu llegada: vie 23 abr · Habitación Doble Deluxe   │
│                                                     │
│ Tu check-in en línea — 2 minutos                   │
│   ✓ Tus datos                                       │
│   ✓ Términos y condiciones                          │
│   ✓ Firma digital                                   │
│                                                     │
│ [ Comenzar →  ]                                     │
└────────────────────────────────────────────────────┘

┌─ Step 2: Datos ────────────────────────────────────┐
│ Nombre completo *  [Lizún Levi              ]      │
│ Email *            [lizun@email.com         ]      │
│ Teléfono           [+52 ...                 ]      │
│ Nacionalidad       [🇲🇽 México       ▼]            │
│ Documento tipo     [Pasaporte       ▼]            │
│ Foto documento     [ 📷 Tomar foto          ]      │
│ # Adultos          [1▼]   # Menores  [0▼]         │
│                                                     │
│ [ ← Volver ]              [ Siguiente → ]           │
└────────────────────────────────────────────────────┘

┌─ Step 3: Términos y condiciones ──────────────────┐
│ TERMS AND CONDITIONS — Azúcar Hotel Tulum v3      │
│ Vigente desde 15 ene 2026                          │
│                                                     │
│ ┌─────────────────────────────────────────────┐   │
│ │ 1. Payment Policy                            │   │
│ │ All reservations must be paid in full ...   │   │
│ │                                              │   │
│ │ 2. Guest Identification                      │   │
│ │ ...                                          │   │
│ │ [scroll obligatorio hasta el final]         │   │
│ └─────────────────────────────────────────────┘   │
│                                                     │
│ ☑ He leído y acepto los términos                   │
│                                                     │
│ [ ← Volver ]              [ Siguiente → ]           │
│   ↑ Disabled hasta scroll-to-bottom + checkbox     │
└────────────────────────────────────────────────────┘

┌─ Step 4: Firma ────────────────────────────────────┐
│ Firma con tu dedo en el recuadro                   │
│                                                     │
│ ┌─────────────────────────────────────────────┐   │
│ │                                              │   │
│ │             [signature_pad canvas]            │   │
│ │                                              │   │
│ └─────────────────────────────────────────────┘   │
│ [ Borrar ]                                          │
│                                                     │
│ Al firmar, confirmas que eres el huésped y        │
│ aceptas las políticas del hotel.                   │
│                                                     │
│ [ ← Volver ]              [ ✓ Firmar y enviar ]    │
└────────────────────────────────────────────────────┘

┌─ Step 5: Confirmación ─────────────────────────────┐
│         ✓ Check-in completo                         │
│                                                     │
│ Te enviamos una copia a lizun@email.com            │
│                                                     │
│ Presenta este código al llegar:                    │
│              ┌─────────┐                            │
│              │  4XK2P  │                            │
│              └─────────┘                            │
│                                                     │
│ [ 📄 Descargar mi confirmación PDF ]                │
└────────────────────────────────────────────────────┘
```

Stack: React Hook Form + Zod validation + `signature_pad@5.0` + tailwind + react-router. Mobile-first (60 % de pre-arrival completions son mobile per Mews 2023).

### 7.2 Reception dashboard — widget en `ReservationDetailPage.tsx`

Nuevo card en tab Estadía o tab dedicada "Check-in":

```
┌─ Registration Card ───────────────────────────────┐
│ Status: PENDING_GUEST                              │
│                                                     │
│ ✓ Form data                — pendiente            │
│ ○ T&C accepted              — pendiente            │
│ ○ Signature captured        — pendiente            │
│                                                     │
│ Portal link: https://...portal/4XK2P              │
│ [ 📧 Reenviar al email ]  [ 📱 Reenviar SMS ]      │
│ [ 📱 Abrir en iPad (staff-assisted) ]              │
│ [ ⬇ Descargar PDF (cuando firmado) ]               │
│ [ 📦 Generar evidencia chargeback ]                 │
└────────────────────────────────────────────────────┘
```

### 7.3 Settings — ToC editor (SUPERVISOR + ORG_ADMIN)

Página nueva `/settings/terms-and-conditions`:

- Lista de versiones con badge ACTIVE / DRAFT / ARCHIVED.
- Botón "Nueva versión" → editor markdown side-by-side preview.
- Linter results en sidebar derecho (clickable jump-to-line).
- "Activar" requiere confirmación dialog (la activación archiva la versión anterior).

---

## 8. Plan de implementación (~12 días-dev)

> Asumido: 1 desarrollador full-time. Splits posibles si 2 devs (frontend / backend paralelo).

### Día 1-2 — Schema + migrations

- Crear schema Prisma (modelos arriba)
- Migration `20260605000000_add_sign_dlc`
- Seed: ToC version genérica template MX (es) para Azúcar como test fixture
- Tests unit prismaMock para nuevos modelos

### Día 3-4 — Backend core services

- `RegistrationCardService` con state machine + audit log
- `TermsAndConditionsService` (CRUD + linter)
- `TocLinterService` (5 reglas iniciales)
- Endpoints staff-facing (sec 5.2 + 5.3)
- Tests unit servicios

### Día 5 — Portal token + guest-facing endpoints

- `PortalTokenService`: short-lived JWT (expiración = scheduled check-in + 48h)
- Endpoints `/v1/portal/checkin/:token/*` (sec 5.1)
- Rate limit per IP (10 req/min) — anti-bot
- Tests integración

### Día 6 — PDF builder + Storage

- `PdfBuilderService` con `puppeteer` pool
- Templates HTML para registration card + voucher
- `StorageService` abstracción (S3 prod, local dev — pattern MAINT-11)
- Tests con snapshot del PDF (compare buffers ignoring metadata)

### Día 7-8 — Guest portal UI

- Rutas `/checkin-portal/:token` + `/checkin-portal/:token/complete`
- Componentes Step1-Step5
- `<SignaturePad>` wrapper sobre `signature_pad@5.0`
- ToC viewer con scroll-detection
- Mobile-first responsive

### Día 9 — Staff dashboard widget

- `<RegistrationCardWidget>` en `ReservationDetailPage.tsx` (nueva tab "Check-in digital")
- Mutations: init, resend, staff-sign-assisted (opens iPad mode in same window)
- Estado realtime via SSE (`event: registration_card.updated`)

### Día 10 — Settings ToC editor

- Página `/settings/terms-and-conditions`
- Editor markdown + preview (libs: `react-markdown` + `@uiw/react-md-editor` o textarea simple)
- Linter UI sidebar
- Version diff modal

### Día 11 — NOM-151 add-on (Mifiel adapter)

- `IPscAdapter` interface
- `MifielPscAdapter` con Mifiel API integration
- Endpoint `POST /v1/guest-stays/:id/registration-card/conserve-nom151`
- Tests integración con sandbox Mifiel

### Día 12 — Evidence package builder + QA E2E

- `EvidencePackageBuilder` service
- Endpoint `GET /v1/guest-stays/:id/evidence-package`
- Tests E2E flow completo: init → form → toc → sign → conserve → evidence
- Smoke test con caso Azúcar (full data fixture)
- Documentación interna en `docs/zenix-sign-runbook.md`

---

## 9. Lo que NO está en este sprint (out-of-scope explícito)

| Feature | Razón | Sprint propuesto |
|---|---|---|
| **iPad app nativa** | Web responsive en iPad cubre el caso. App nativa = 4+ semanas extra. | v1.3 si demanda. |
| **OCR del documento** | Foto se sube y se ve, sin auto-extract de campos. | v1.0.4 IMG sprint (después de S3). |
| **Bio-firma con presión variable** | `signature_pad` no captura pressure events. Apple Pencil pressure requires native iPad SDK. | Backlog (rara vez requerido). |
| **Firma biométrica (face ID match)** | Out of scope LFPDPPP dato biométrico (consent extra). | Backlog. |
| **Integración Adobe Sign / DocuSign** | El stack propio es suficiente para MX. Integraciones globales = v1.5+. | Backlog. |
| **Mass-send portal links a guests con check-in en N días** | Útil pero requiere scheduler + email/SMS infra. | Sprint MARKETING-ENGINE post v1.1. |
| **Multi-idioma (en/fr/pt)** | MVP solo `es`. Estructura ya soporta via `TermsAndConditionsVersion.language`. | Cuando primer cliente non-LATAM. |
| **Voucher signing offline (sin conexión)** | iPad needs internet en el momento. Offline queue = complejidad sin ROI piloto. | Backlog. |

---

## 10. Riesgos identificados y mitigación

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Puppeteer en Render free tier no arranca (Chromium missing) | Media | Alto | Usar `puppeteer-extra` con buildpack Chromium o servicio externo (Browserless.io). Documentado en runbook. |
| Mifiel sandbox rate limit en QA | Baja | Medio | Mockear PSC adapter en tests; sandbox solo en smoke. |
| Guest abandona en Step 3 (T&C largo) → drop-off | Media | Medio | Scroll-detection + "Resume later" link en email. Métrica drop-off por step en analytics. |
| `signature_pad` falla en Safari iOS <13 | Baja | Bajo | Browser support matrix documentado; fallback type-name signature para legacy. |
| Hotel olvida activar `nom151AddonActive` y pierde conservación oficial | Media | Alto en caso de juicio | Banner warning en widget cuando module activo pero sin NOM-151 y se firma documento. |
| PCI-scope creep: alguien intenta capturar PAN en `documentNumber` por error | Baja | Crítico | Linter en frontend que detecta patrón PAN (16 dígitos) y bloquea + alerta. |
| ToC linter falsos positivos molestan al supervisor | Media | Bajo | Severity warning (no error) salvo regla NOSHOW_SECTION_PRESENT. Override permitido con `reason`. |

---

## 11. Definición de "hecho"

Sprint cerrado cuando:

- [x] Migrations aplicadas en dev + staging, rollback documentado
- [x] 90 %+ test coverage en services (unit + integration)
- [x] 1 caso E2E completo passing: init → form → ToC → sign → PDF gen → email
- [x] PDF render verificado en Chrome, Safari (macOS + iOS), Firefox
- [x] `signature_pad` testeado en iPad Air 2024 + iPhone 13+ + Android 12+
- [x] Mifiel sandbox flow probado end-to-end
- [x] Evidence package descarga en 1 click y abre en Adobe Reader
- [x] Documentación interna `docs/zenix-sign-runbook.md` con: arquitectura, troubleshooting, PSC providers, FAQ
- [x] Documentación de venta `docs/zenix-sales-master.md` actualizada con módulo Sign (§Principio Debate Epistémico — actualización obligatoria)
- [x] CLAUDE.md decisiones D-SIGN1 a D-SIGN10 registradas
- [x] Pricing matrix activable desde Zenix Activate wizard
- [x] Smoke test con fixture Azúcar Hotel Tulum (T&C de la imagen 2 cargado, registration card de la imagen 1 reproducible digitalmente)

---

## 12. Métricas de éxito post-lanzamiento (90 días)

Tracking objetivo para validar ROI de la inversión de 12 días-dev:

| Métrica | Baseline (paper) | Target Zenix Sign | Fuente |
|---|---|---|---|
| Check-in time avg | 8-10 min | <3 min | Mews internal benchmark 2023 |
| Chargeback win-rate | ~48 % | ≥65 % | Chargebacks911 2023 Industry Report |
| Pre-arrival completion rate | 0 % | ≥40 % primer mes, ≥60 % al mes 3 | Cloudbeds publicly reported avg 55 % |
| Tiempo recepción → guest en habitación | varies | <5 min para guests pre-arrival completed | Internal measurement |
| PCI-DSS findings en próxima auditoría hotel | varios | 0 relacionados a documentos físicos | Auditor reports |

---

## 13. Posicionamiento comercial (para `docs/zenix-sales-master.md`)

**Pitch de una frase:** "Zenix Sign reemplaza el check-in de tres hojas firmadas por un wizard digital con firma electrónica con validez legal en México y win-rate de chargebacks ↑20%."

**Bullet points de venta:**

1. **Cero papel, cero PAN visible.** Tu manager nunca más toca números de tarjeta.
2. **Defensa de chargebacks pro-grade.** Visa Dispute Management Guidelines §5.9.2 explícitamente acepta nuestra evidencia.
3. **NOM-151 mexicano nativo** (add-on opcional). Único PMS LATAM-first con conservación oficial.
4. **Linter de T&C anti-PROFECO.** Te alertamos antes de que firmes algo que un juez declarará abusivo.
5. **Pre-arrival web en español.** El guest hace check-in desde su sofá, llega a la habitación en 60 segundos.
6. **Evidence package one-click.** Para chargeback solo das click — Zenix arma el PDF que el banco quiere ver.

**Comparativa visual (para landing page):**

```
                        Paper        Mews/Cloudbeds    Zenix Sign
Digital signature        ❌              ✅                ✅
NOM-151 nativo           ❌              ❌                ✅
ToC versioning           ❌              ✅                ✅
T&C linter PROFECO       ❌              ❌                ✅
Chargeback bundle 1-clic ❌              parcial           ✅
Mobile-first guest UI    ❌              ✅                ✅
Precio LATAM             —               $50-300/mes       $25-50/mes
```

---

## 14. Dependencias y secuencia con otros sprints

```
v1.0.0 piloto Azúcar
   ↓
v1.0.1 PAY-CORE   ┐
                  ├──→ Zenix Sign (paralelo posible, schema independiente)
v1.0.2 CFDI-CORE  ┘
                       ↓
                  v1.0.4 IMG (S3) — momento ideal para subir asset
                  storage de signatures a infra dedicada
                       ↓
                  v1.1.x Sign GA con feature flag global
```

**No bloquea v1.0.0.** Puede entrar como DLC opt-in en v1.0.1 o v1.0.2.

**Dependencias técnicas:**
- `PaymentLog` debe existir (§28) — ya está en v1.0.0
- `LegalEntity` debe existir (§64) — ya está en v1.0.5
- `StorageService` abstracción — crear nueva en este sprint, reutilizable por v1.0.4 IMG
- Email service — usar el existente (notif center) o stub con log para piloto

---

## 15. Próximos pasos

1. **Aprobación de scope** por product owner.
2. **Validación legal** con abogado mercantil mexicano del flujo NOM-151 + CC Art. 89-114 (1-2 horas asesoría externa, ~USD $200-400).
3. **Cotización Mifiel** (plan empresarial vs pay-per-doc).
4. **Decisión storage**: confirmar Cloudflare R2 (cheap) vs AWS S3 (estándar enterprise) — patrón MAINT-11 en v1.0.4.
5. **Creación rama** `feature/sign-dlc` desde `main` cuando v1.0.0 esté en piloto estable.
6. **Kickoff técnico**: 1 hora con dev asignado para walk-through del schema + state machine.

---

## Apéndice A — Referencias

### Legales / regulatorias
- [PCI-DSS v4.0.1](https://www.pcisecuritystandards.org/document_library/) — PCI Security Standards Council
- [Visa Dispute Management Guidelines Junio 2024 §5.9.2](https://usa.visa.com/content/dam/VCOM/global/support-legal/documents/dispute-management-guidelines-for-visa-merchants.pdf)
- [Código de Comercio MX Art. 89-114](https://www.diputados.gob.mx/LeyesBiblio/pdf/CCom.pdf)
- [LFPDPPP](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf)
- [NOM-151-SCFI-2016, DOF 30/03/2016](https://www.dof.gob.mx/nota_detalle.php?codigo=5430365&fecha=30/03/2016)
- [Mastercard Chargeback Guide](https://www.mastercard.us/en-us/business/overview/support/rules.html)
- [PROFECO Ley Federal de Protección al Consumidor Art. 90](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPC.pdf)

### Técnicas
- [`signature_pad@5.0`](https://github.com/szimek/signature_pad) — Szymon Nowak, MIT license
- [Puppeteer headless Chromium](https://pptr.dev/)
- [Mifiel API documentation](https://www.mifiel.com/api/docs/)
- [SeguriData API](https://www.seguridata.com.mx/)

### Mercado / benchmarks
- Mews Help Center — Online Check-in flow
- Cloudbeds Marketplace — Payment + Digital Check-in
- Oracle Hospitality OPI documentation
- Chargebacks911 Hospitality Industry Report 2023
- Verizon DBIR 2024 — Hospitality sector breach trends
- HFTP Hospitality Financial Management Handbook 2023

### Internas Zenix
- [CLAUDE.md §1-§128](../../CLAUDE.md)
- [docs/vision/14-payment-currency-tax-architecture.md](../vision/14-payment-currency-tax-architecture.md)
- [docs/sprints/CHANNEX-INBOUND-plan.md](CHANNEX-INBOUND-plan.md) — patrón estructural seguido
- [docs/sprints/CHECKIN-ALPHA-plan.md](CHECKIN-ALPHA-plan.md) — check-in single-screen ya en producción

---

**Fin del plan.** Estimado: 12 días-dev (1 dev full-time) o 6-7 días-dev calendar (2 devs paralelos backend/frontend). Bloqueante para escalar a clientes con foco en chargeback defense o compliance LATAM strict.
