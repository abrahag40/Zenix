# ADR-0001 — PDF rendering engine para Zenix Sign

> Architecture Decision Record. Formato basado en MADR 3.0 (Markdown Any Decision Records).

---

## Status

**Accepted** — 2026-05-21
**Sprint disparador:** [SIGN-DLC](../sprints/SIGN-DLC-plan.md)
**Decisores:** Equipo backend Zenix + Product owner
**Reviewed by:** Pending (TBD)

## Context

El módulo **Zenix Sign** (DLC v1.1.x) requiere generar PDFs server-side combinando:

1. Datos del `RegistrationCard` (form + foto del documento)
2. Snapshot del `TermsAndConditionsVersion` firmado (markdown → HTML renderizado)
3. `signatureSvg` embebida (canvas signature_pad output)
4. Footer con hash SHA-256 + timestamp + IP audit del firmante

Los PDFs deben cumplir:

- **Visual fidelity**: tipografía consistente (acentos español, símbolo MXN, posiblemente CJK en el futuro), márgenes A4/Letter precisos, embed de imágenes (foto del documento del huésped en data-URI o S3).
- **Compatibilidad de visualización**: el huésped abre el PDF desde su email en Apple Mail / Gmail / Outlook en mobile y desktop; el adquirente abre el evidence package en Adobe Reader / browsers; un juez civil mexicano lo abre eventualmente en su software de notaría.
- **Determinismo del hash**: dos llamadas al builder con los mismos inputs deben producir bytes idénticos (excepto el timestamp de generación) para que `SHA-256(pdf) === SHA-256(pdf')`. Esto importa para reconciliación post-NOM-151.
- **Throughput**: ~20-50 PDFs/min en hora pico (check-ins agrupados al inicio de fin de semana en hostal Tulum, por ejemplo). No es throughput de OLAP, pero sí superior a 1 PDF cada 2-3 segundos.
- **Operación en contenedor headless**: el API corre en Render free/starter tier (linux x64), después en AWS Fargate. Debe funcionar sin DISPLAY ni X11.

## Decision drivers (criterios de evaluación)

1. **Calidad visual** — CSS3 moderno (flexbox, grid, web fonts, gradientes), Unicode completo, emoji opcional.
2. **Memoria por instancia** — el plan de infraestructura (12-infra) limita Render a 512MB para servicios web. PDF builder no puede consumir 700MB cada call.
3. **Tiempo de arranque y latency** — frío vs caliente.
4. **Mantenimiento upstream** — el proyecto sigue activo, tiene security updates, no es legacy.
5. **Footprint del binario** — el container de la API ya tiene Node + Prisma + Nest. Sumar 250MB de Chromium no es trivial pero es manejable.
6. **API ergonomics** — el dev escribe templates HTML naturales (Tailwind, web fonts) sin learning curve raro.
7. **Future-proof** — soporta CJK (si Zenix expande a Brasil con Sovos o a Asia), soporta el roadmap de PDF/A para conservación legal.

## Considered Options

### Opción A: Puppeteer + Headless Chromium

- Bridge Node.js → Chromium headless.
- Templates HTML normales con CSS moderno; `page.pdf()` produce el output.
- Mantenedor: equipo Chrome DevTools (Google) + comunidad. Releases regulares.

**Pros**
- CSS3 / flexbox / grid / web fonts / emoji / gradientes — todo soportado out-of-the-box porque es el mismo engine que Chrome.
- Output de calidad **idéntica al print preview de Chrome**.
- Soporta `--print-css` media queries (`@page`, `@media print`) para márgenes A4/Letter.
- Comunidad enorme, abundante docs, sample templates.
- Puede ejecutar JS embebido en el template (útil para charts si se necesitan).
- `puppeteer-extra` con plugins de stealth, recapcha, etc. (irrelevante aquí pero la ecosistema es robusta).
- Render dev/prod ya tiene buildpacks Chromium documentados.
- Alternativa elegante: usar **Browserless.io** ($30-100/mes) si el bundle local da problemas — mismo código, infra outsourced.

**Cons**
- Memoria: Chromium consume ~180-250MB por instancia de browser activo. Solución: pool de browsers compartidos (1 browser, N pages).
- Cold start: ~2-3 segundos para arrancar Chromium si no hay pool tibio.
- Tamaño del bundle: +250MB al docker image de la API.
- Determinismo del hash: el output PDF de Chrome incluye metadata `/CreationDate` que cambia cada render → necesitamos post-procesar con `pdf-lib` o equivalente para normalizar metadata antes de hash.

### Opción B: wkhtmltopdf

- Bridge a binario standalone (basado en QtWebKit legacy).
- Templates HTML pero con engine de rendering antiguo (~2018 fork de WebKit).

**Pros**
- Binario único, ~50MB. Más liviano que Chromium.
- Velocidad de cold start menor (no levanta browser completo).
- Estable, conocido en infra hospitality legacy.

**Cons**
- **Mantenimiento detenido**: el proyecto wkhtmltopdf [paró desarrollo activo](https://github.com/wkhtmltopdf/wkhtmltopdf/issues/5447) — última release significativa 2020. **No recibe security patches.**
- QtWebKit es un fork de WebKit pre-2017. **No soporta CSS Grid, no soporta flexbox moderno, no soporta web fonts (Google Fonts) sin trabajo extra.**
- Render de emoji y caracteres Unicode no-Latin es inconsistente.
- API no-streaming (genera todo en memoria), peor para PDFs grandes.
- Comunidad reducida; problemas se resuelven en Stack Overflow obsoleto.
- No hay wrapper Node.js mantenido (last commit del wrapper [wkhtmltopdf-node](https://github.com/jdpnielsen/wkhtmltopdf) hace 4 años).

### Opción C: pdfkit / pdf-lib (PDF nativo programático)

- Bibliotecas JS para construir PDF byte-a-byte programáticamente (no HTML).

**Pros**
- Sin dependencias externas; corre en cualquier infra Node.
- Determinismo trivial (sin Chromium para CreationDate).
- Bundle pequeño.
- Memory footprint mínimo.

**Cons**
- **Sin engine HTML/CSS**: el dev escribe layout en código procedural (`doc.text(...)`, `doc.image(...)`). Cambios de diseño = re-código.
- Inviable para T&C que viene en markdown libre del cliente; tendríamos que escribir parser markdown→pdfkit propio.
- Tipografía limitada (sin web fonts naturales; embed manual).
- Mantener visual consistency entre PDF y preview HTML del portal del huésped = dos templates en sync.

### Opción D: Servicios externos (DocRaptor, Browserless, PDFShift, Gotenberg)

- API externa que recibe HTML y devuelve PDF.

**Pros**
- Cero overhead en infra propia.
- Algunos (Gotenberg) son open-source y self-hostable.

**Cons**
- Costo por documento (DocRaptor: $40/mes 250 docs; PDFShift: $9/mes 500 docs). Para 100 firmas/mes/property × 50 properties = 5000 docs/mes = $50-100/mes recurrente.
- **Datos sensibles atravesando red externa**: registration card incluye foto del documento + datos personales. Sale del control de Zenix → complicación LFPDPPP (debe haber contrato de tratamiento de datos con el proveedor).
- Latency adicional ~200-500ms por call.
- Dependencia de SLA de tercero para feature crítica.

## Decision

**Adoptamos Puppeteer + Headless Chromium (Opción A)** con pool de browsers compartidos para Zenix Sign.

### Razones de la elección

1. **CSS moderno es no-negociable** — los templates HTML usarán Tailwind (mismo stack que el frontend) y web fonts (consistencia visual entre el portal del huésped y el PDF final). Solo Puppeteer lo soporta sin fricción.
2. **Calidad visual del print preview de Chrome es el gold standard** — los huéspedes y adquirentes ven PDFs renderizados por Chrome todos los días. Reproducir esa fidelidad reduce questions/rejections.
3. **Datos sensibles permanecen in-house** — no atravesamos red externa. LFPDPPP simple.
4. **Browserless.io como escape hatch** — si el bundle local da problemas en Render starter tier o si el footprint en AWS Fargate se vuelve molesto, podemos migrar al SaaS con cambio de 5 líneas en el constructor del service. Mantenemos la abstracción `PdfBuilderService` independiente del backend.
5. **wkhtmltopdf descalificado** por falta de mantenimiento upstream + falta de CSS Grid/flexbox. Sería deuda técnica desde el día 1.
6. **pdfkit descalificado** por costo de mantenimiento de templates duales (HTML para portal + JS para PDF, en sync). El gain de footprint no compensa el dev time recurrente.

### Mitigación de los cons de Puppeteer

**Memoria → Pool de browsers compartidos:**

```ts
// apps/api/src/sign/pdf-builder.service.ts
import puppeteer, { Browser } from 'puppeteer'

class PuppeteerPool {
  private browser: Browser | null = null
  private inFlight = 0
  private readonly maxConcurrentPages = 5

  async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      })
      this.browser.on('disconnected', () => { this.browser = null })
    }
    return this.browser
  }

  async withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
    if (this.inFlight >= this.maxConcurrentPages) {
      await this.waitForCapacity()
    }
    this.inFlight++
    const browser = await this.getBrowser()
    const page = await browser.newPage()
    try {
      return await fn(page)
    } finally {
      await page.close()
      this.inFlight--
    }
  }
}
```

Un browser de Chromium consume ~180MB; cinco páginas concurrentes adicionales suman ~30MB. **Total ~210MB constante** vs 250MB×5 si lanzamos un browser por request.

**Cold start → Pre-warm en module init:**

```ts
@Module({
  providers: [
    {
      provide: PuppeteerPool,
      useFactory: async () => {
        const pool = new PuppeteerPool()
        await pool.getBrowser()  // pre-warm
        return pool
      },
    },
  ],
})
```

Cold start del primer PDF se paga al arranque del API, no en el primer request del usuario.

**Determinismo del hash → Post-procesado con `pdf-lib`:**

```ts
import { PDFDocument } from 'pdf-lib'

async function normalizeMetadata(pdfBuffer: Buffer): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBuffer)
  doc.setCreationDate(new Date(0))  // epoch
  doc.setModificationDate(new Date(0))
  doc.setProducer('Zenix Sign')
  doc.setCreator('Zenix PMS')
  return Buffer.from(await doc.save({ useObjectStreams: false }))
}
```

Aplicado antes del SHA-256, garantiza determinismo entre llamadas con los mismos inputs.

**Bundle size en Render starter tier → Buildpack oficial:**

Render documenta buildpack Chromium oficial ([docs.render.com/native-environments](https://docs.render.com/native-environments)) que añade Chromium al runtime sin requerir docker custom. Footprint ~280MB total (Node + Chromium + deps), dentro del límite del starter plan.

## Consequences

### Positivas

- Templates HTML normales con Tailwind → mismo stack del frontend → templates editables por cualquier dev del equipo.
- Fidelidad visual entre portal del huésped (HTML preview en step 5) y PDF descargado → reduce confusión y soporte.
- Determinismo del hash post-pdf-lib → reconciliación NOM-151 trivial.
- Browserless.io como escape hatch documentado → 0 riesgo de quedar atrapado en infra propia.
- Memoria gestionada via pool → predecible y monitoreable.

### Negativas

- Bundle del container API crece +250MB → builds más lentos, CI cache más caro.
- Cold start del primer PDF tras restart del proceso = ~2-3s. Mitigado con pre-warm pero medible.
- Dependencia transitiva de Chromium → security updates upstream a monitorear (mensual). Snyk/Dependabot config en CI debe cubrir esto.
- Render starter tier puede no soportarlo (RAM/CPU limit); validar en piloto. Si falla, migrar a Render standard ($25/mes extra/property setup) o Browserless.io.

### Neutrales

- Sin lock-in técnico: la abstracción `PdfBuilderService` permite swap de engine. Si en 2 años aparece WebKit Headless oficial de Apple, swap es 1 archivo.

## Compliance & follow-up

- **Security**: configurar Dependabot para `puppeteer` releases (alertas semanales).
- **Observability**: metric `pdf_builder.duration_ms` p50/p95/p99 en Prometheus desde día 1.
- **Capacity planning**: cuando un property alcance 200+ check-ins/mes, evaluar memoria del pool. Posible cap dinámico de `maxConcurrentPages` per LegalEntity.
- **Backup engine**: documentar en runbook el switch a Browserless.io paso-a-paso por si el pool falla en producción.

## Sources

1. [Puppeteer official docs](https://pptr.dev/)
2. [wkhtmltopdf status — issue #5447](https://github.com/wkhtmltopdf/wkhtmltopdf/issues/5447) (proyecto en maintenance mode)
3. [pdf-lib repo](https://github.com/Hopding/pdf-lib) (deterministic post-processing)
4. [Render Native Environments — Chromium support](https://docs.render.com/native-environments)
5. [Browserless.io pricing](https://www.browserless.io/pricing)
6. [DocRaptor pricing](https://docraptor.com/pricing) (rechazada por costo recurrente + LFPDPPP)
7. MADR 3.0 format spec — [adr.github.io](https://adr.github.io/madr/)

---

## Apéndice — Alternativas evaluadas y descartadas resumidas

| Opción | Razón principal de descarte |
|---|---|
| wkhtmltopdf | Mantenimiento detenido + CSS Grid/flexbox no soportados |
| pdfkit / pdf-lib programático | Costo dev recurrente (templates duales en sync) |
| DocRaptor / PDFShift | Costo $50-100/mes + datos sensibles atravesando red externa |
| Gotenberg self-hosted | Otro servicio que mantener; no aporta vs Puppeteer in-process |
| LaTeX server-side | Curva de aprendizaje + templates no editables por dev no-LaTeX |
| Apache FOP (XSL-FO → PDF) | Templates XSL-FO ilegibles + memoria JVM |
