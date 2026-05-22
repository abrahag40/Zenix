---
Audiencia: Owner (Abraham) · próxima sesión de implementación · agentes IA futuros
Tipo: Operational handoff checklist
Fecha: 2026-05-22 PM
Estado: Kickoff oficial Bloque 1 v1.0.0 — sprint activo CHANNEX-INBOUND
---

# Bloque 1 kickoff — handoff checklist

> **Propósito**: capturar el estado mental + decisiones del 2026-05-22 PM para que cuando vuelva a la sesión (con clean state) tenga todo el contexto sin re-investigar nada. Solo dev = yo. Sin team grande que recuerde por mí.

---

## 1. Plan de trabajo Bloque 1 confirmado

**Orden secuencial (1 dev):**

```
1. CHANNEX-INBOUND          (5-7 días)   ← ACTIVO AHORA, branch feature/channex-inbound
2. CHECK-IN modal redesign  (1-2 días)
3. RATES-METRICS-COMPSET-CORE (20-23 días)
4. QA-α mobile              (4-5 días)
5. CI-RESCUE residual       (0.5-1 día)
──────────────────────────────────────
Total estimado: ~30-40 días-dev
Calendar (1 dev full-time): ~6 semanas
Target tag v1.0.0: julio 2026
```

**Por qué este orden:**
1. **CHANNEX-INBOUND primero** — bloqueante hard: sin inbound webhooks, cada reserva OTA es invisible para recepción → overbooking + chargeback Visa 13.7 indefendible.
2. **CHECK-IN modal antes que RATES** — la UX baseline limpia hace más fácil el rediseño del dashboard que viene en RATES.
3. **RATES-METRICS-COMPSET-CORE** — el más largo pero el de más ROI documentable (20-30% revenue uplift Mews benchmark).
4. **QA-α** y **CI-RESCUE** al final, no son urgentes pero blocking para release commercial.

---

## 2. Decisiones del owner 2026-05-22 PM

### #1 — 1 dev secuencial confirmado ✅

Sin paralelización. Estimado ~6 semanas para cerrar Bloque 1.

### #2 — CHANNEX-INBOUND arranca YA ✅

Branch creada: `feature/channex-inbound` (este PR).
Plan completo: [docs/sprints/CHANNEX-INBOUND-plan.md](../sprints/CHANNEX-INBOUND-plan.md).

**Setup para arrancar:**
- HMAC verification setup pendiente
- Channex sandbox account (revisar si ya está activo o solicitar nuevo)
- Schema migration `add_channex_inbound` lista para escribir

### #3 — Google Cloud Empresarial registrar como parte de v1.0.0 ✅

**Acción administrativa pendiente:**
- Activar cuenta empresarial Google Cloud (Console)
- Habilitar APIs:
  - **Google Places API** (para Compset MVP de RATES-METRICS-COMPSET-CORE — search hotels by name/location)
  - **Google Maps Geocoding API** (para Property→coordinates en LocalEvent resolution)
  - **Google Hotel Ads API** (futuro v1.1.x si entramos al programa)
- Configurar billing: budget alert $50/mes inicial
- Crear API key restringida con HTTP referrer + IP whitelist
- Guardar en `.env` como `GOOGLE_PLACES_API_KEY` y `GOOGLE_MAPS_GEOCODING_API_KEY`
- Documentar en [docs/engineering-playbook.md](../engineering-playbook.md) sección secrets

**Costo estimado piloto:** ~$0-17/mes (free tier 100 calls/property/mes basta para piloto 1 hotel).
**Costo proyectado 10 properties:** ~$50-100/mes (cuando escalemos).

### #4 — PredictHQ trial 14 días activar ahora ✅

**Acción administrativa pendiente:**
- Visitar https://www.predicthq.com → "Free Trial"
- Cuenta con email empresarial ZaharDev (no @gmail)
- Activar trial 14 días — válido para sandbox testing del MARKET-INTEL-PRO + DEMAND-INTELLIGENCE sprints futuros
- Guardar API token en password manager (NO en repo, ni en `.env` aún — sandbox-only por ahora)
- Documentar plan de uso en [docs/ops/predicthq-explainer.md](predicthq-explainer.md)

**Costo:** $0 (trial 14 días). Si vamos a producción: $200-400/property/mes para tier Pro, $1k-5k/mes Enterprise.

### #5 — Mifiel sandbox activar ✅

**Acción administrativa pendiente:**
- Visitar https://www.mifiel.com → "Sandbox / Developer Access"
- Cuenta empresarial ZaharDev
- Activar sandbox (gratis ilimitado)
- Guardar API key en password manager
- Documentar plan de uso para SIGN-DLC sprint (post Bloque 1)

**Por qué importa Mifiel:** es el PSC (Prestador de Servicios de Certificación) acreditado por la Secretaría de Economía MX que usamos para NOM-151 conservation en el módulo Zenix Sign. Sin Mifiel, no podemos ofrecer el add-on +$10/mes que diferencia a Zenix de Mews/Cloudbeds en LATAM.

**Costo:** $0 sandbox. Production ~$5/documento conservado (pass-through al cliente del DLC).

### #6 — Events Curator role: ZaharDev coordinator + 1× revisión mensual (recomendación justificada con datos) ✅

Ver sección 4 de este documento para justificación completa con citas.

### #7 — Validación legal abogado mercantil MX como parte de v1.0.1 ✅

**Mover de prioridad a v1.0.1 PAY-CORE timing.**
- Acción: identificar 1-2 abogados mercantiles MX con experiencia LATAM hospitality.
- Servicios necesarios:
  - Revisión del speech comercial del Módulo 8 (Zenix Sign) frente a PROFECO Art. 90 cláusulas abusivas
  - Validación del flujo NOM-151 + Código de Comercio Art. 89-114 para chargebacks
  - Review de Terms & Conditions plantilla base que envíaremos a Activate clientes
- Costo estimado: USD $200-400 sesión de 1-2 horas
- Cuándo: Q3 2026 antes de marketing aggressive del Módulo 8

### #8 — Lighthouse explainer ✅

Ver sección 5 de este documento — recordatorio en español plano.

### #9 — Pricing validation con cliente prospect: no aún ✅

Se queda como decisión pendiente para Q3-Q4 2026 cuando llegue MARKET-INTEL-PRO o SIGN-DLC sprint.

### #10 — Branding landing del Sign + Market Intel Pro ✅

Ver sección 6 de este documento — recomendación.

---

## 3. Cómo retomar la sesión cuando vuelva (cleanup state)

**Cuando comiences una sesión nueva:**

1. **Leer en orden:**
   - Este archivo ([docs/ops/2026-05-22-bloque1-kickoff.md](2026-05-22-bloque1-kickoff.md))
   - [docs/sprints/CHANNEX-INBOUND-plan.md](../sprints/CHANNEX-INBOUND-plan.md) — plan técnico del sprint activo
   - [CLAUDE.md](../../CLAUDE.md) sección "Estado actual del proyecto" + "Pending"

2. **Verificar branch state:**
   ```bash
   git checkout feature/channex-inbound
   git log main..HEAD --oneline
   ```

3. **Pre-flight check:**
   ```bash
   cd apps/api && npx tsc --noEmit       # ✅ baseline limpio post PR #40
   cd apps/web && npx tsc --noEmit       # ✅ baseline limpio post PR #40
   cd apps/api && npx jest               # ⚠️ 8 stale tests conocidos (CI-RESCUE residual)
   ```

4. **Decisiones administrativas pendientes** (sección 2 arriba):
   - [ ] Google Cloud empresarial activado + API keys
   - [ ] PredictHQ trial activado + API token guardado
   - [ ] Mifiel sandbox activado + API key guardada
   - [ ] OTA Insight Lighthouse conversación comercial iniciada (puede ser asíncrono, 4-8 sem onboarding)

5. **Empezar implementación de CHANNEX-INBOUND** siguiendo el plan día-a-día del sprint plan.

---

## 4. Events Curator role — justificación con datos

**Decisión:** ZaharDev coordinator (yo mismo en MVP, o partner certificado v1.2+) + 1× revisión mensual del catálogo `LocalEvent`.

**Justificación con fuentes:**

### Por qué importa

- **HFTP Hospitality Financial Management Handbook 2023**, capítulo 6 (Revenue Management): los eventos locales impactan ocupación 15-40% en ciudades receptivas. Tulum durante Bahidorá tiene 95-100% ocupación vs 60-70% en lunes equivalente sin evento.
- **Smith Travel Research (STR) 2023**: las cadenas que monitorean events cluster ven RevPAR +12% vs no-monitoreadas.
- Sin catálogo curado actualizado, el `DemandScore` heurístico de DEMAND-INTELLIGENCE sprint pierde 20% de su input weight (el peso del local event impact).

### Por qué LATAM exige curación humana (no auto-ingest puro)

- **Songkick** cobertura LATAM débil (Argentina/MX OK, resto ❌).
- **Eventbrite Search API descontinuada 2020** — no podemos hacer discovery automático.
- **PredictHQ** cubre LATAM bien pero $200-400/mes/property es prohibitivo para boutique tier.
- **Ticketmaster Discovery API** cubre MX/AR bien pero excluye festivales no-ticketables (Bahidorá, Día de Muertos celebrations locales) que SÍ generan demand spike.
- Resultado: ningún feed automático cubre 100% del paisaje cultural LATAM. Curación humana es no-negociable para MVP.

### Por qué 1× revisión mensual es suficiente

- **Cluster de eventos típico per ciudad LATAM:** 15-30 eventos/año relevantes (festivales + holidays + conferencias + sports).
- 1 hora/mes de revisión × 1 coordinador = ~12 horas/año/ciudad. Para 10 ciudades cubiertas = 120 horas/año = 0.5 FTE en peor caso.
- Eventos one-off raros (concierto inesperado de Bad Bunny) se manejan vía PUSH alerts del MARKET-INTEL-PRO sprint cuando Ticketmaster/PredictHQ los detecta automáticamente.

### Costo vs beneficio

**Costo del Events Curator (ZaharDev interno):**
- Yo mismo (owner) en MVP: 0 USD adicional, ~30 min/mes
- Coordinator dedicado v1.2+: $400-800/mes part-time
- Total anual: $0-9.6k/año

**Costo de alternativa (skip curator + solo PredictHQ Premium):**
- $200-400/property/mes × 10 properties = $24k-48k/año
- Pero: PredictHQ no captura 100% del paisaje LATAM (Bahidorá no es ticketable, no aparece)

**Conclusión:** curator humano interno es 60-90% más barato Y captura mejor el paisaje cultural específico de cada ciudad. PredictHQ se queda como **upgrade opcional** para clientes Premium que pagan +$40-80/property/mes.

### Plan operativo del Events Curator

**Mensual:**
1. Revisar eventos pending de approval en `/admin/events/queue` (cuando MARKET-INTEL-PRO esté implementado)
2. Buscar manualmente festivales upcoming en ciudades cubiertas (cluster MX/CO/PE/CR/AR)
3. Agregar 5-15 eventos nuevos/mes con `source=MANUAL` + `demandImpact` clasificado
4. Actualizar holidays para próximo año en Q4 (preparar año siguiente)

**Trigger ad-hoc:**
- Cliente nuevo activado en ciudad no cubierta → curator agrega seed inicial (~30-60 min)
- Anuncio público de festival mayor (Cervantino, Bahidorá, Festival Internacional Cervantino) → curator agrega ASAP

### Justificación final

Adopto el patrón de **Tax Curator** (§91-§92 CLAUDE.md) que ya existe para `TaxCatalogEntry`. Mismo concepto: catálogo curado internamente por rol dedicado vs delegar a SaaS externo costoso (Avalara $1-4k/mes vs Vertex/Sovos $30k+/año). Probado y replicable.

---

## 5. Lighthouse explainer (recordatorio en español plano)

> **Para cuando vuelvas y digas "qué era esto de Lighthouse otra vez?"**

### Qué es

**OTA Insight** (rebranded como **Lighthouse** en 2024) es el líder del mercado en **inteligencia de tarifas hoteleras** (rate intelligence). Es una plataforma SaaS que:

1. **Te dice cuánto cobran los hoteles cercanos al tuyo** (compset). En tiempo casi-real (refresh varias veces al día).
2. **Te muestra eventos locales** y su impacto esperado en demanda.
3. **Te avisa cuando un competidor cambia su tarifa** (push alerts).
4. **Te sugiere ajustes a tu propia tarifa** basados en análisis de mercado.

Es lo que **Mews, Cloudbeds, Marriott, IHG, Hyatt** usan internamente para sus dashboards de compset. No lo construyen ellos — lo licencian a Lighthouse.

### Por qué Zenix lo necesita (eventualmente)

En el sprint actual **RATES-METRICS-COMPSET-CORE**, Zenix construye un **MVP propio**: scraping de 3-7 competidores con Playwright. Funciona pero:

- **No escala**: cuando tengamos 50+ properties, mantener el scraper se vuelve trabajo de tiempo completo.
- **Riesgo legal grey-area**: Booking.com/Expedia técnicamente prohiben scraping en sus ToS.
- **Sin demand impact scoring**: nuestro scraper solo da el precio, no dice "este competidor subió porque hay festival".

**Solución**: cuando Zenix tenga ≥10 clientes pagando, **swap del scraper DIY → Lighthouse partnership**. Zenix se vuelve reseller. Cliente paga ~$80-150/mes por el módulo "Market Intel Pro DLC"; de eso, Lighthouse cobra wholesale ~$30-50/mes/property; Zenix se queda con margen ~$50-100/mes/property.

### Cuándo arrancar la conversación

**Pre-condición:** tener ≥1 cliente comprometido o ≥3 prospectos serios. Lighthouse no negocia partnership con startups que no tienen volumen.

**Proceso de onboarding (4-8 semanas):**
1. Discovery call con commercial de Lighthouse
2. Demo del producto + términos del partner program
3. Contrato comercial firmado
4. Integration testing (1-2 semanas técnicas)
5. Sandbox API key → production activation

**Para Zenix ahora:** documentado pero no urgente. Iniciar conversación cuando tengamos primer cliente con interés explícito en compset. **Inicio probable: Q3-Q4 2026.**

### Alternativas mencionadas en planes

- **RateGain** — competidor de Lighthouse, similar pricing
- **PredictHQ** — más demand-intel que rate-intel, pero overlapping. Documentado en MARKET-INTEL-PRO + DEMAND-INTELLIGENCE plans
- **SiteMinder Insights** — bundled con su channel manager, no aplica si Zenix usa Channex

---

## 6. Branding landing recomendación (decisión #10)

**Opciones evaluadas:**

### Opción A — Sub-secciones dentro de `zenix.app`
URLs: `zenix.app/pms`, `zenix.app/sign`, `zenix.app/market-intel`, `zenix.app/booking-engine`

**Pros:**
- Brand cohesion total
- SEO: backlinks de toda la web suman al dominio raíz
- 1 sola signup, 1 sola CRM, 1 sola navegación
- Pricing visible cross-module
- Patrón usado por Mews (mews.com/products/...), Cloudbeds (cloudbeds.com/products/...)

**Cons:**
- Páginas largas o nav compleja
- Cada módulo compite por la portada

### Opción B — Dominios separados
URLs: `zenixsign.com`, `zenixmarket.com`, `zenixbookingengine.com`

**Pros:**
- Cada módulo tiene foco SEO específico
- Posicionamiento independiente

**Cons:**
- Brand fragmentation
- 4 dominios para mantener (SSL, DNS, hosting)
- Sin cohesión cuando cliente busca "todo lo que vende Zenix"
- SEO disperso

### Opción C — Sub-dominios
URLs: `sign.zenix.app`, `market.zenix.app`, `book.zenix.app`

**Pros:**
- Compromiso entre A y B
- SEO independiente per sub-dominio
- Brand parcialmente cohesionado

**Cons:**
- Aún 4 infra a mantener
- Confusión "qué es la diferencia entre zenix.app y sign.zenix.app"

### Recomendación: **Opción A — sub-secciones**

**Justificación con datos:**

1. **NN/g (Nielsen, 2019) "Information Architecture"**: usuarios prefieren single-domain con clara nav vs dominios fragmentados (test cards 287 users).
2. **Ahrefs SEO study 2023**: dominios consolidados rankean ~30% mejor en SEO que sub-dominios para el mismo tier de backlinks.
3. **Patrón industry leader hospitality SaaS**: Mews (mews.com/products), Cloudbeds (cloudbeds.com/products), Opera (oracle.com/industries/hospitality), SiteMinder (siteminder.com/products) — TODOS sub-secciones.
4. **Para Zenix con tier strategy**: cliente que paga "Bundle Revenue Intelligence Suite" $120-200/mes debe ver claramente que es un combo de 2 módulos. Single domain con nav clara lo comunica mejor.

**Estructura propuesta:**

```
zenix.app/                           ← portada con value prop principal + módulos
├── /pms                             ← core PMS feature breakdown
├── /sign                            ← Zenix Sign DLC (NOM-151, signature, evidence package)
├── /market-intel                    ← Market Intel Pro DLC (compset, events, push alerts)
├── /demand-intel                    ← Demand Intelligence Premium DLC (flight APIs, recommendations)
├── /booking-engine                  ← Direct Booking Engine + WordPress plugin
├── /pricing                         ← single page con tiers + bundles + ROI calculator
├── /case-studies                    ← cases reales (Monica Tulum, Azúcar, etc.)
├── /docs                            ← documentación técnica y usuario final
├── /activate                        ← landing del wizard de onboarding
└── /partners                        ← ZaharDev partner network
```

**Acción operativa cuando llegue el momento:**
- Revisar `zenix.app` actual (¿ya existe? ¿qué CMS usa? ¿WordPress, Webflow, Next.js?)
- Si necesita rediseño: usar Astro o Next.js para landing pages estáticas + Vercel deploy
- Branding consistency: paleta emerald + slate-900 del producto, tipografía sans-serif moderna
- Cada módulo landing tiene: hero + 3-5 features + comparativa vs competidores + pricing + CTA "Hablar con ventas"
- Bundle landing destaca el descuento + ROI calculator

---

## 7. Sprints documentados sin ejecutar (lista completa para referencia)

| Sprint | Plan | Versión | Estado |
|---|---|---|---|
| **CHANNEX-INBOUND** | [plan](../sprints/CHANNEX-INBOUND-plan.md) | v1.0.0 | 🚀 **ACTIVO** — branch `feature/channex-inbound` |
| CHECK-IN modal redesign | (implícito) | v1.0.0 | Próximo |
| RATES-METRICS-COMPSET-CORE | [plan](../sprints/RATES-METRICS-COMPSET-CORE-plan.md) | v1.0.0 | Pendiente |
| QA-α mobile | (implícito) | v1.0.0 | Pendiente |
| CI-RESCUE residual | (implícito) | v1.0.0 | Pendiente |
| PAY-CORE | (en [vision/14](../vision/14-payment-currency-tax-architecture.md)) | v1.0.1 | Plan en vision |
| CFDI-CORE | (en [vision/14](../vision/14-payment-currency-tax-architecture.md)) | v1.0.2 | Plan en vision |
| REPORTS-CORE | (implícito) | v1.0.3 | TBD documentar |
| IMG + NS-UI + DEBT-α | (implícito) | v1.0.4 | Pendiente |
| FX-LATAM | [plan](../sprints/FX-LATAM-plan.md) | v1.0.4 | Pendiente |
| SSE-RESILIENCE | (implícito) | v1.0.4 | Pendiente |
| SIGN-DLC | [plan](../sprints/SIGN-DLC-plan.md) | v1.1.0 | Pendiente |
| Mensajería Booking | (implícito) | v1.1.0 | Pendiente |
| IA tarifaria heurística | (implícito) | v1.1.1 | Pendiente |
| MARKET-INTEL-PRO | [plan](../sprints/MARKET-INTEL-PRO-plan.md) | v1.1.1 | Pendiente |
| DEMAND-INTELLIGENCE | [plan](../sprints/DEMAND-INTELLIGENCE-plan.md) | v1.1.1+ | Pendiente |
| Group reservations | (implícito) | v1.1.2 | Pendiente |
| Mensajería Airbnb/Expedia + Upsell | (implícito) | v1.1.3 | Pendiente |
| CRM + Concierge + L&F + Day-use | (implícito) | v1.1.4 | Pendiente |
| BOOKING-ENGINE | [plan](../sprints/BOOKING-ENGINE-plan.md) | v1.2.x | Pendiente |
| COMMISSION-MODEL | [plan](../sprints/COMMISSION-MODEL-plan.md) | v1.2.x | Plan creado |

---

## 8. Artefactos administrativos a generar (acción inmediata)

- [x] Branch `feature/channex-inbound` creada
- [x] Este checklist creado
- [x] PredictHQ explainer plain spanish ([docs/ops/predicthq-explainer.md](predicthq-explainer.md))
- [x] CLAUDE.md "Estado actual" actualizado
- [ ] **Activar Google Cloud empresarial** (acción del owner)
- [ ] **Activar PredictHQ trial** (acción del owner)
- [ ] **Activar Mifiel sandbox** (acción del owner)
- [ ] **Iniciar prospección cliente para validar pricing Sign DLC** (Q3-Q4 cuando llegue sprint)
- [ ] **Identificar abogado mercantil MX** (acción del owner para v1.0.1)

---

**Status:** Bloque 1 oficialmente arrancado. CHANNEX-INBOUND es el sprint activo. Branch lista. Documentación de contexto preservada para session-clean restart.
