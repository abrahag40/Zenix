# Wizard Zenix Activate — Pending research notes

> **Origen**: owner feedback durante sandbox testing Day 14 (2026-05-25).
> 3 items pendientes que requieren backend/integraciones externas. Documentado
> aquí para no perder contexto al ejecutar Day 15+ / sprint OPS-α / v1.0.4 IMG.

---

## 1. Image upload (Brand logo + Property photos)

### Estado HOY (Day 14)

Inputs son `<input type="url">` — el consultor pega un URL público (S3, R2,
Imgur, cualquier CDN).

### Lo que el owner pidió

Permitir upload directo desde PC. Drag-and-drop + file picker.

### Razón por la que NO está implementado todavía

Requiere infra de storage que aún no tenemos:
- **R2 bucket configurado** (`docs/ops/zenix-tooling-catalog.md` línea 21 — status 🟡 PIPELINE v1.0.4 IMG sprint).
- **Pre-signed URL endpoint** en backend (`POST /v1/uploads/sign` con tipo de archivo + tamaño max).
- **Sharp pipeline** post-upload para image optimization (resize 200x60 para logo, 1920x1080 para hero photos).
- **CleanUp scheduler** para uploads no commiteados (24h orphan purge).

### Plan de implementación (post-sprint actual)

1. **Sprint v1.0.4 IMG** (4-6 días-dev) cubre toda la pieza:
   - R2 bucket setup (Cloudflare account)
   - Backend `UploadsService` con pre-signed URLs (15min TTL)
   - Sharp transform pipeline (logo 200×60 + photo 1920×1080)
   - Frontend `<UploadField>` component con drag-and-drop + progress bar
   - Cleanup scheduler 24h
2. **Wizard Step 2 + futuro Step 5.5 (Booking Engine config)** consumen el component.
3. **Migration**: cambiar `brandLogoUrl: string` → `brandLogoUploadId: string | null + brandLogoUrl: string` (R2 URL).

### Workaround acceptable mientras tanto

URL paste sigue funcional. El consultor puede subir el logo a:
- WhatsApp / Slack del cliente → screenshot URL
- Drive público / Dropbox
- Cloudinary free tier (10GB, no requiere backend)

### Cuándo NO bloquea el activation

Brand logo es opcional. Property photos no se piden en wizard inicial (van en
v1.1.x SIGN-DLC + Booking Engine sprint). El wizard puede activar con
`brandLogoUrl=null`.

---

## 2. RFC / NIT / RUC validation contra padrón fiscal oficial

### Estado HOY (Day 14)

Validación cliente-side con regex per país (StepLegalEntity.tsx):
- MX RFC: `^([A-ZÑ&]{3,4})\d{6}[A-Z0-9]{3}$` (12-13 chars)
- CO NIT: `^\d{8,10}-?\d?$`
- PE RUC: `^\d{11}$`
- CR cédula: `^\d{9,12}$`

Visual feedback inline: emerald check si valid, amber alert + hint si invalid.

### Lo que el owner pidió

Validación contra API oficial — ¿el RFC existe realmente en el padrón SAT?

### Por qué NO existe API pública gratuita

**México SAT**:
- SAT ofrece "Validador masivo de RFC" SOLO vía web con e.firma del propio
  contribuyente. NO hay API pública sin credenciales personales.
- Servicios DOF (Diario Oficial de la Federación) sí publican listados de
  contribuyentes en lista 69-B (operaciones simuladas) y 69-C (deudores)
  pero NO un endpoint "¿este RFC existe?".
- Razón: privacidad fiscal — SAT no expone padrón completo público.

**Colombia DIAN**:
- RUT consulta es manual web (`consultaRUT.dian.gov.co`), no API.

**Perú SUNAT**:
- API pública existe pero requiere registro + límites estrictos.
- Alternativa: scraping del `e-consultaruc.sunat.gob.pe` (frágil, vulnerable
  a cambios sin notice).

### Soluciones comerciales (Day 15+ candidate)

| Provider | País | Costo | Trade-off |
|---|---|---|---|
| **Facturama API** | MX | $0.10-0.25 USD/consulta | Ya en tooling catalog como PAC adapter. Endpoint `verify-rfc` |
| **SW Sapien API** | MX | similar | Backup Facturama |
| **Konfío RFC** | MX | gratis hasta 100/mes | Solo para clientes empresariales Konfío |
| **DataCRM** | varios | suscripción mensual | Multi-país pero caro para piloto |

### Recomendación implementación

**Tier 1 (DEFAULT — incluido)**: regex format validation que YA tenemos
+ test CFDI sandbox en Step 7. Si el PAC sandbox acepta el RFC, está
operativamente válido (suficiente para piloto 1-3 hoteles).

**Tier 2 (post v1.0.0 — DLC opcional)**: agregar Facturama verify-rfc
endpoint como sub-paso de Step 3. Costo per cliente nuevo = $0.10. Vale
para evitar que un consultor escriba mal el RFC y descubra al timbrar
primer CFDI 30 días después.

### Decisión registrar

Por ahora regex + Step 7 health-check es suficiente. Documentar en CLAUDE.md
como "v1.0.x DLC opcional Facturama verify-rfc al activar".

---

## 3. City picker con catálogo estructurado (analytics consistency)

### Estado HOY (Day 14)

Implementado `apps/web/src/nova/data/latam-cities.ts` con catálogo curado
de **~60 cities top LATAM tourist** (México 26, Colombia 7, Costa Rica 6,
Perú 6, Argentina 6, Guatemala/Panamá/El Salvador/Honduras 9).

Cada CityRow tiene:
- `id` (estable, `mx_tulum`, `co_cartagena`, etc.) — DB key
- `name` display
- `region` (estado/departamento/provincia)
- `countryCode` ISO 3166-1
- `lat`, `lng`
- `timezone` IANA
- `tags` opcionales (`beach`, `mountain`, `capital`, `tourist`)

UI: `CityPicker.tsx` autocomplete con keyboard nav. Out-of-catalog
permite free text que se persiste con `cityId=null` + `cityFreeText`.

Auto-detect del timezone cuando city del catálogo es elegida (Tulum →
`America/Cancun` automático).

### Migration path Day 15+

1. **Backend tabla** `City` con FK desde `Property.cityId`.
2. **Seed inicial** con el stub LATAM_CITIES exacto.
3. **Endpoint** `GET /v1/cities?country=MX&q=tul` server-side filtering.
4. **Google Places integration** (post v1.0.0):
   - `googlePlaceId: String?` columna en `City`.
   - Search via Places Autocomplete API server-side.
   - Si user elige un Place no en nuestro catálogo, se crea row nueva
     en `City` con `source='google_places'` + `googlePlaceId`.
5. **Analytics events**:
   - `localCity.id` siempre estructurado para queries:
     `GROUP BY cityId` → "ocupación per ciudad", "events Tulum Sept", etc.
   - Sprint MARKET-INTEL-PRO + DEMAND-INTELLIGENCE consumen este FK para
     auto-radius compset + LocalEvent geographic scope.

### Por qué stub primero, no Google Places desde día 1

1. **Google Places API NO está activada aún** (tooling catalog § Maps —
   status 🟡 PIPELINE). Requiere Google Cloud account + billing + API
   key + restricciones de uso.
2. **Costo Google Places**: $17 USD per 1k Place Autocomplete requests.
   Para 100 hoteles × ~5 properties × 1 setup = 500 requests = $8.50.
   Ridículo bajo. PERO requiere setup ops.
3. **Stub LATAM cubre 95% del piloto** (Mexico hotel boutique + Colombia
   + Costa Rica son targets primarios).
4. **El swap es 1 archivo**: cambiar `searchCities()` interno de filter
   array a fetch al endpoint Places. Stub queda como fallback offline.

---

## Acciones owner antes de Day 15

1. **Google Cloud Console** — crear API key Places API con restricciones.
   Activar billing. ~15 min.
2. **R2 bucket** — opcional para v1.0.4 IMG, no bloqueante Day 15.
3. **Facturama account** — opcional para validación RFC tier 2.

Day 15 puede ejecutarse sin ninguno de estos 3 — el wizard activa con
stubs y los swap son single-file post-launch.
