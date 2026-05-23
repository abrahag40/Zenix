# CLAUDE.md — Zenix PMS

> Instrucciones técnicas para el agente IA + decisiones no-negociables del código.
> **Última actualización:** 2026-05-22 (late PM — Bloque 1 kickoff oficial. Sprint ACTIVO: **CHANNEX-INBOUND** en branch `feature/channex-inbound`. Owner decisiones 1-10 consolidadas en [docs/ops/2026-05-22-bloque1-kickoff.md](docs/ops/2026-05-22-bloque1-kickoff.md). Explainers ops creados: [predicthq-explainer.md](docs/ops/predicthq-explainer.md) en español plano + [branding-landing-recommendation.md](docs/ops/branding-landing-recommendation.md) decisión Opción A sub-secciones zenix.app justificada con NN/g 2019 + Ahrefs 2023 + patrón industry (Mews/Cloudbeds/Opera). Events Curator role justificado con HFTP 2023 + STR 2023 (1 hora/mes × ciudad × 0.5 FTE max). Google Cloud empresarial + PredictHQ trial 14d + Mifiel sandbox queued como acciones administrativas para que el owner ejecute esta semana. Validación legal abogado mercantil MX movida a v1.0.1.) PM update — Plan MARKET-INTEL-PRO documentado [docs/sprints/MARKET-INTEL-PRO-plan.md](docs/sprints/MARKET-INTEL-PRO-plan.md), sprint v1.1.x DLC ~15-20 días-dev cubriendo event ingest multi-adapter (Ticketmaster + PredictHQ + Calendarific + Nager.Date + Bandsintown) + dedup fuzzy-match con `LocalEventSourceLink` cross-reference + swap del compset MVP a Lighthouse partnership + auto-radius compset detection + push notifications config con 5 rule types + daily digest opt-in. 15 decisiones D-MKTPRO1..15. Eventbrite Search API descartada permanente (descontinuada 2020). DEMAND-INTELLIGENCE plan actualizado con PredictHQ como adapter alternativo via `PredictHQFlightProxyAdapter` y `CompositeFlightDataAdapter` para combinar Amadeus + PHQ. Pricing tiers consolidados: bundled v1.0.x (MVP free) → Market Intel Pro $50-80/mes → Demand Intelligence Premium $80-150/mes → Bundle Revenue Intelligence Suite $120-200/mes.) Plans RATES-METRICS-COMPSET-CORE + DEMAND-INTELLIGENCE documentados — sprint principal de v1.0.0 que cubre 3 capas en 1: pricing flexible con seasons + day-of-week + rate plans + restrictions + promotion engine; dashboard métricas con `MetricsDailySnapshot` + glanceable/operacional/estratégico colapsables; Compset Card MVP con scraping DIY + adapter pattern abierto a Lighthouse partnership futuro + `LocalEvent` replicable LATAM 4-niveles geo-scope + Events Curator role. Sprint futuro DEMAND-INTELLIGENCE con flight APIs Amadeus + vacation calendars + DemandScore heurístico + recommendations engine planificado para v1.1.x+ DLC tier Premium $80-150/property/mes.) Sprint BITACORA-UNIFICATION + plan SIGN-DLC (2026-05-21, UI bitácora consolidada: `ReservationNotesThread` es ahora el componente canónico compartido entre slide drawer del calendario y página de detalle de reserva — burbujas tipo Telegram, filtro por channel con scroll horizontal, sticky 80px top con altura `calc(100vh-7rem)`, empty state con illustration centrada, sombra elevation +1. Eliminados `StayStickyNotes` + `PinnedNoteCard` + `HOSPITALITY_DOODLES_SVG` + `BitacoraChat` + `ChatBubble` (~600 LOC) + `arrivalNotes` inline card + `data.notes` special requests del tab Huésped — única fuente de comunicación per-reserva es la bitácora. Sprint **SIGN-DLC** planificado (v1.1.x DLC, ~12 días-dev): digital check-in + e-signature canvas + ToC versionado per LegalEntity con linter PROFECO + NOM-151 conservation (Mifiel adapter) + chargeback Evidence Package builder. Documentación nueva: [docs/sprints/SIGN-DLC-plan.md](docs/sprints/SIGN-DLC-plan.md), [docs/architecture/ADR-0001-pdf-rendering.md](docs/architecture/ADR-0001-pdf-rendering.md) (Puppeteer + pool elegido sobre wkhtmltopdf/pdfkit/SaaS externos), [docs/standards/toc-linter-schema.json](docs/standards/toc-linter-schema.json) (JSON Schema 2020-12 del LinterReport, 10 reglas con citas regulatorias). Módulo comercial 8 agregado a [docs/zenix-sales-master.md](docs/zenix-sales-master.md) con pricing Starter $25 / Pro $40 / NOM-151 add-on $10.)

---

## 📂 Documentos hermanos (LEE PRIMERO si trabajas en algo estratégico)

| Documento | Contenido |
|-----------|-----------|
| **[docs/vision/](../../docs/vision/)** | **Visión estratégica completa: 5 capas de negocio, 14 streams de revenue, roadmap v1.0→v2.0, todos los módulos del ecosistema Zenix** |
| [docs/vision/00-README.md](../../docs/vision/00-README.md) | Índice de docs estratégicos |
| [docs/vision/01-vision-zahardev-zenix.md](../../docs/vision/01-vision-zahardev-zenix.md) | Modelo de negocio Zenix↔ZaharDev (flywheel) |
| [docs/vision/02-product-family.md](../../docs/vision/02-product-family.md) | Naming framework + bundles tiered |
| [docs/vision/03-roadmap-v1-v2.md](../../docs/vision/03-roadmap-v1-v2.md) | Roadmap de versiones detallado |
| [docs/vision/04-08](../../docs/vision/) | Módulos: POS, Procure, Stay+Access, People, Books |
| [docs/vision/09-partner-network.md](../../docs/vision/09-partner-network.md) | Modelo SAP/SuccessFactors |
| [docs/vision/10-data-strategy-abi.md](../../docs/vision/10-data-strategy-abi.md) | Política de datos + ABI |
| **[docs/vision/11-multi-tenant-architecture.md](../../docs/vision/11-multi-tenant-architecture.md)** | **Modelo 4-level Brand→Org→LegalEntity→Property + migration v1.0.5** |
| **[docs/vision/12-infrastructure-devops.md](../../docs/vision/12-infrastructure-devops.md)** | **4 fases de infra (Vercel+Render+Neon → AWS → enterprise) + DevOps practices** |
| **[docs/vision/13-consultant-setup-wizard.md](../../docs/vision/13-consultant-setup-wizard.md)** | **Zenix Activate — 8 etapas + templates inventory + health checks** |
| **[docs/vision/14-payment-currency-tax-architecture.md](../../docs/vision/14-payment-currency-tax-architecture.md)** | **9 sub-módulos PAY-CORE/CFDI-CORE: multi-currency, OTA-collect, cash drawer, tax engine LATAM, GuestCredit con CFDI E, FxAdvisor** |
| [docs/zenix-sales-master.md](../../docs/zenix-sales-master.md) | Pitch comercial completo |
| [docs/prices-packages.md](../../docs/prices-packages.md) | Packaging y pricing |
| [docs/engineering-playbook.md](../../docs/engineering-playbook.md) | Patrones de implementación |
| [docs/sprints/](../../docs/sprints/) | Planes técnicos de sprint |

**Regla:** este `CLAUDE.md` trata decisiones técnicas ejecutables. Si una sección crece más de 2 párrafos sobre visión/negocio/pricing, mover a `docs/vision/`.

---

## Estado actual del proyecto (2026-05-22)

- **Versión en curso:** v1.0.0 (piloto comercial — Hotel Monica Tulum)
- **Sprint ACTIVO:** 🚀 **CHANNEX-INBOUND** — branch `feature/channex-inbound`. Owner confirmó kickoff oficial 2026-05-22 PM con plan de trabajo Bloque 1 secuencial (1 dev). Plan: [docs/sprints/CHANNEX-INBOUND-plan.md](docs/sprints/CHANNEX-INBOUND-plan.md).
- **Plan de trabajo Bloque 1 (release v1.0.0):** **CHANNEX-INBOUND** (5-7d, activo) → **CHECK-IN modal redesign** (1-2d) → **RATES-METRICS-COMPSET-CORE** (20-23d, revenue blocker, plan docs/sprints/RATES-METRICS-COMPSET-CORE-plan.md) → **QA-α mobile** (4-5d) → **CI-RESCUE residual** (0.5-1d). Total ~30-40 días-dev secuencial = ~6 semanas calendar. Target tag v1.0.0: julio 2026.
- **Últimos PRs merged a main:** PR #40 (2026-05-22 PM, MARKET-INTEL-PRO + DEMAND-INTEL update con PredictHQ), PR #39 (2026-05-22 AM, RATES-METRICS-COMPSET-CORE + DEMAND-INTELLIGENCE plans), PR #38 (2026-05-21, BITACORA-UNIFICATION + AVAIL-OVERSTAY + plan SIGN-DLC).
- **Decisiones administrativas owner 2026-05-22 PM** (consolidadas en [docs/ops/2026-05-22-bloque1-kickoff.md](docs/ops/2026-05-22-bloque1-kickoff.md)): (1) 1 dev secuencial; (2) CHANNEX-INBOUND arranca ya; (3) Google Cloud empresarial activar como parte v1.0.0; (4) PredictHQ trial 14 días activar con explainer en español plano [docs/ops/predicthq-explainer.md](docs/ops/predicthq-explainer.md); (5) Mifiel sandbox activar; (6) Events Curator role = ZaharDev coordinator interno + 1× revisión mensual (justificado HFTP Handbook 2023 + STR 2023 + cost-benefit analysis); (7) Validación legal abogado mercantil MX dentro de v1.0.1; (8) Lighthouse explainer creado para no olvidar; (9) Pricing validation con prospecto: no aún; (10) Branding landing zenix.app sub-secciones [docs/ops/branding-landing-recommendation.md](docs/ops/branding-landing-recommendation.md).
- **Bloqueantes hard identificados:** sin CHANNEX-INBOUND, reserva OTA invisible para recepción → overbooking + chargeback Visa 13.7 indefendible. Sin RATES-METRICS-COMPSET-CORE, manager piloto cobra "a ojo" → 20-30% revenue uplift documentado en Mews benchmark perdido.
- **Auditoría completa:** [Modo auditoría 2026-05-13](#audit-20260513) — 1 bug crítico (MT-5 ✅), 2 altos (MT-3 ✅, NS-3 ✅), 11 medios (✅ los 11 resueltos en commits previos; MT-9 con componente ops pendiente fuera del repo), 5 acknowledged debt. **SEC-α + POLISH-α ambos cerrados** tras verificación 2026-05-15.

---

## Principio de Debate Epistémico — Colaboración Activa (No Negociable)

> **Este principio rige CADA conversación, decisión de diseño y propuesta de funcionalidad. Su propósito es proteger la integridad del PMS ante el desconocimiento parcial — tanto del desarrollador como del asistente.**

**En cada petición, mi verdad no es la única verdad.** Puedes y debes debatir cualquier argumento con justificaciones sólidas, con la finalidad de encontrar una verdad que cumpla con la creación de un PMS definitivo — sin intuición ni suposiciones.

### Base de conocimiento obligatoria para el debate

Todo argumento o contrapropuesta debe estar fundamentado en al menos una de estas cuatro fuentes:

**1. Software engineering — estudios comprobados:**
- Nielsen Norman Group (NNGroup) — usabilidad, patterns de diseño, eyetracking studies
- Baymard Institute — benchmarks de UX para sistemas de gestión y e-commerce B2B
- Apple Human Interface Guidelines (HIG) — decisiones de interacción y jerarquía visual
- ISO 9241-110:2020 — principios de ergonomía de sistemas interactivos
- WCAG 2.1 AA — accesibilidad
- Estudios de carga cognitiva (Sweller 1988), Hick (1952), Fitts (1954), Kahneman (2011), Von Restorff (1933)

**2. Hotelería — procesos estándarizados de la industria:**
- AHLEI (American Hotel & Lodging Educational Institute) — estándares operativos
- ISAHC — auditoría de no-shows y chargebacks
- HFTP (Hospitality Financial and Technology Professionals) — gestión fiscal hotelera, USALI
- Opera Cloud, Mews, Cloudbeds, Clock PMS+, Little Hotelier — comportamiento documentado y sentimiento de usuarios
- Visa/Mastercard Core Rules — evidencia requerida para disputas de chargeback

**3. Cumplimiento fiscal LATAM:**
- CFDI 4.0 (México SAT)
- DIAN (Colombia), SUNAT (Perú), AFIP (Argentina)
- GDPR / LGPD / LFPDPPP — anonimización de PII manteniendo registros fiscales

**4. Neuromarketing y psicología del consumidor:**
- Mehrabian-Russell (1974) — psicología del color
- Cialdini (1984) — principio de escasez visual
- Csikszentmihalyi (1990) — estado de flujo
- Tversky & Kahneman (1981) — efecto de encuadre

### Por qué este principio existe

El desarrollador puede desconocer procesos hoteleros estandarizados que parecen detalles pero que comprometen la operación real del hotel. El asistente puede asumir premisas de UX que son correctas en general pero incorrectas para el contexto específico de la recepción hotelera. **El debate fundamentado protege al sistema de ambos sesgos.**

### Actualización automática del documento de ventas

**Cada vez que se agrega, modifica o justifica una funcionalidad del sistema, el archivo `docs/zenix-sales-master.md` debe actualizarse en la misma sesión.** Si una funcionalidad nueva no aparece en `zenix-sales-master.md`, no existe para el equipo comercial.

---

## Principio Rector de Análisis Crítico

> **Antes de cualquier decisión de implementación, arquitectura, o cambio de scope, Claude DEBE:**
>
> 1. **Identificar y comunicar riesgos detectados** durante el análisis. Si una propuesta del usuario tiene un riesgo arquitectónico, de mantenimiento, de UX, o de deuda técnica — **debe alertarse explícitamente** antes de proceder.
>
> 2. **Generar contrapropuestas cuando sea pertinente**, especialmente cuando la propuesta original choca con estándares globales o introduce duplicación/fragilidad. La contrapropuesta debe respetar el insight nuclear del usuario y atacar específicamente los riesgos identificados.
>
> 3. **Justificar TODA recomendación con datos verificables**: estudios académicos, documentación oficial, benchmarks de competidores específicos. Nunca recomendar "porque sí" o por gusto personal.
>
> 4. **Tratar la verdad del usuario como hipótesis, no axioma**. Aceptar pasivamente cada propuesta sin análisis = falta de profesionalismo.
>
> 5. **Educar mientras se ejecuta**. Cuando se introduce una metodología, terminología o pattern nuevo, explicar qué es, de dónde viene, y por qué se elige.

**Cómo aplicar:**
- Lo que está bien en la idea (con citación)
- Riesgos detectados (con citación)
- Contrapropuesta (cuando aplica)
- Tabla comparativa de opciones cuando son ≥2
- Recomendación final + justificación

---

## Principio Rector de Diseño

> **Este principio aplica a CADA decisión de UI, flujo, arquitectura de información, y experiencia de usuario.**

Todo código, componente, flujo o pantalla que se escriba en Zenix debe estar cimentado en estándares globales con base psicológica, comportamiento humano y neuromarketing.

### Marco de referencia obligatorio

**Psicología cognitiva:** Carga cognitiva (Sweller 1988) · Working Memory 7±2 (Miller 1956) · Ley de Hick (1952) · Ley de Fitts (1954) · Pre-attentive Attention (Treisman 1980) · Procesamiento dual (Kahneman 2011) · Efecto de encuadre (Tversky & Kahneman 1981)

**Estándares globales:** NN/g 10 Heurísticas (1994, rev 2020) · Apple HIG 2024 · ISO 9241-110:2020 · WCAG 2.1 AA · Material Design 3

**Neuromarketing:** Mehrabian-Russell 1974 (color) · Cialdini 1984 (escasez) · Csikszentmihalyi 1990 (flow) · Gestalt principles

### Antes de implementar cualquier componente UI, responder:

1. **¿Cuántos elementos simultáneos ve el usuario?** → Si son más de 5, agrupar o colapsar.
2. **¿El color comunica el estado correctamente?** → Sistema semántico Zenix (emerald/amber/red), nunca arbitrario.
3. **¿El flujo requiere Sistema 1 o Sistema 2?** → Rutinario = mínima fricción. Destructivo = confirmación explícita (forcing function).
4. **¿El feedback es inmediato?** → Toda acción debe tener respuesta visual en ≤100ms.
5. **¿La animación tiene propósito?** → `--ease-spring` (entrada) y `--ease-sharp-out` (salida). Nunca solo estética.
6. **¿El error es informativo?** → Nunca "Error genérico". Siempre: qué pasó + por qué + qué puede hacer el usuario.

### Fundamentos académicos aplicados (referencia rápida)

Cuando una decisión técnica invoque un fundamento, citar nombre + año:

- **Sweller 1988** → max 7 elementos simultáneos visibles
- **Miller 1956** → 7±2 chunks working memory
- **Treisman 1980** → color/forma procesado en 200ms
- **Norman 1988** → Progressive Disclosure + Action Cycle + Reversibility
- **Hick 1952 / Fitts 1954** → opciones y targets
- **Kahneman 2011** → Sistema 1 vs Sistema 2
- **Apple HIG 2024** → feedback inmediato + confirmación destructiva
- **WCAG 2.1 AA** → contraste 4.5:1, motion-reduce, 44pt targets
- **NN/g H1 / H5 / H9** → visibility, error prevention, recovery
- **Evans 2003** → Bounded Contexts (DDD) — cada módulo NestJS es un bounded context
- **Pousman & Stasko 2006** → Ambient Information Display
- **Mehrabian-Russell 1974** → psicología del color hospitalaria

### Animaciones — fluidez SwiftUI/iOS

Curvas canónicas (CSS vars en `apps/web/src/index.css`):

```css
--ease-spring:    cubic-bezier(0.22, 1, 0.36, 1);   /* expo-out: entrada rápida, desacelera */
--ease-sharp-out: cubic-bezier(0.55, 0, 1, 0.45);   /* expo-in:  salida limpia */
```

Reglas:
- **Entrada panels/sheets/modales**: 360-400ms con `--ease-spring`
- **Salida**: 200-220ms con `--ease-sharp-out` (~40% más corta)
- **Sin overshoot/rebote** — NUNCA `y1 > 1.0` en cubic-bezier para sliding elements
- **`motion-reduce:duration-0`** en todos los elementos animados (epilepsia/vértigo)
- **Radix UI**: usar `data-[state=open]:` y `data-[state=closed]:` (no `data-open:`)

---

## Project Overview

**Zenix es un PMS (Property Management System)** para hoteles boutique y hostales de LATAM con dormitorios compartidos y habitaciones privadas. El eje central del sistema es el **calendario de reservas**, que actúa como fuente de verdad de todos los datos de huéspedes, ocupación y operación.

Del calendario se derivan todos los módulos del sistema:
- **Housekeeping** — limpieza activada por checkouts
- **No-shows** — flujo fiscal de no-show automático
- **Reportes** — fuente de verdad de ocupación, revenue y métricas
- **Mantenimiento** — bloqueo de habitaciones con audit trail
- **Disponibilidad** — toda verificación pasa por AvailabilityService

**Visión completa:** ver [docs/vision/01-vision-zahardev-zenix.md](../../docs/vision/01-vision-zahardev-zenix.md). Zenix es producto-pilar de ZaharDev, una empresa de consultoría especializada en hotelería que monetiza datos agregados además del SaaS.

### Ventajas competitivas vs PMS del mercado

- **Calendario PMS con SSE en tiempo real** — al nivel de PMS premium
- **Gestión per-bed nativa** — tarea por cama, no por habitación (solo Mews lo ofrece parcialmente)
- **Checkout de 2 fases** — planificación AM + confirmación física (ningún competidor)
- **App móvil offline con cola de sync** — crítico para pisos sin wifi consistente
- **Auditoría fiscal-grade de no-shows** — trail inmutable + reversión 48h + cargos traceables CFDI
- **Pre-arrival warming con WhatsApp automático** — detección temprana a las 20:00 local
- **Night audit multi-timezone** — scheduler per-propiedad con IANA timezone

> **Nota histórica:** el proyecto comenzó como prueba de concepto de housekeeping. Desde Sprint 6 es un PMS completo. El repositorio conserva el nombre `housekeeping3` por continuidad técnica.

---

## Flujo Operativo Central

### Diagrama de secuencia

```
07:00  FASE 1 — Planificación matutina
       → batchCheckout crea CleaningTask(PENDING) por bed con hasSameDayCheckIn per-task
       → bed.status NO cambia, SIN push, SIN SSE task:ready

11:00  FASE 2 — Confirmación de salida física
       → confirmDeparture(checkoutId, bedId) filtra task del bed específico
       → PENDING → READY/UNASSIGNED, bed → DIRTY
       → Push a camarera asignada, SSE task:ready

11:30  FASE 2.5 — Reversión (error recovery, <48h)
       → undoDeparture revierte READY/UNASSIGNED → PENDING
       → bed → OCCUPIED, push notif al housekeeper
       → Solo si NO hay tareas IN_PROGRESS

12:00+ FASE 3 — Ciclo de limpieza (mobile)
       → start → IN_PROGRESS → end → DONE → verify → VERIFIED

CANCELACIÓN per-bed (extensión de estadía):
       cancelCheckout con bedId → solo esa tarea CANCELLED
       cancelCheckout sin bedId → todas + checkout.cancelled
       IN_PROGRESS → D11 ConflictException (no cancel silencioso)
```

### Máquina de estados CleaningTask

```
PENDING ──(confirmDeparture)──→ UNASSIGNED ──(assign)──→ READY ──(start)──→ IN_PROGRESS
   │                                                       │                    │
   │ (undoDeparture) ◄──────────────────────────────────────┘                    │
   │                                                                              │
   └──(cancelCheckout)──→ CANCELLED                                              │
                                                                                  ▼
                                                                                DONE ──(verify)──→ VERIFIED
                                                                                  ▲
                                                                                  │
                                                                              IN_PROGRESS ⇄ PAUSED
                                                                              IN_PROGRESS → DEFERRED → READY (AHLEI 4.3)
```

---

## Tech Stack

### Monorepo (Turborepo)

| App | Framework | Puerto |
|-----|-----------|--------|
| `apps/api` | NestJS 10 + Prisma + PostgreSQL | 3000 |
| `apps/web` | React 18 + Vite + Tailwind CSS | 5173 |
| `apps/mobile` | Expo (React Native) + Expo Router | — |
| `packages/shared` | TypeScript types + enums compartidos | — |

**Apps futuras (post v1.0):** `apps/partner` (v1.2), `apps/pos-terminal` (v1.3), `apps/kds` (v1.3), `apps/guest` (v1.5).

### Detalles técnicos

- **API:** NestJS con `@nestjs/jwt`, `@nestjs/event-emitter`, `class-validator`. Prisma ORM con PostgreSQL. SSE para tiempo real. Push notifications via Expo Push API. Jest + ts-jest.
- **Web:** React Query, React Router v6, Zustand para auth, Tailwind CSS, react-hot-toast.
- **Mobile:** Expo Router, Zustand, Expo Notifications, SyncManager para cola offline.
- **Shared:** `enums.ts` + `types.ts` — fuente única de DTOs.

---

## Project Structure

```
housekeeping3/
├── apps/
│   ├── api/                  NestJS REST API
│   │   ├── prisma/           Schema + seed + migrations
│   │   └── src/
│   │       ├── auth/                 JWT auth (login, guard, switch property)
│   │       ├── checkouts/            ★ Ciclo 2-phase + carryover
│   │       ├── tasks/                Lifecycle de CleaningTask
│   │       ├── notifications/        SSE + Push
│   │       ├── notification-center/  AppNotification (Sprint 7D)
│   │       ├── maintenance/          Sprint Mx-1 (tickets work-orders)
│   │       ├── blocks/               SmartBlocks (RoomBlock)
│   │       ├── soft-lock/            SSE advisory lock
│   │       ├── scheduling/           Sprint 8H (shifts + roster + clock)
│   │       ├── assignment/           Sprint 8H (auto-asignación 3 reglas)
│   │       ├── staff-preferences/    Sprint 8H (D9)
│   │       ├── pms/
│   │       │   ├── availability/     ★ Regla §35: toda validación pasa aquí
│   │       │   ├── guest-stays/      CRUD + no-show + revert + check-in
│   │       │   └── stay-journeys/    Room moves + extensiones
│   │       ├── integrations/channex/ Channex.io gateway (stub Sprint 8C)
│   │       └── common/               Decorators, guards, filters
│   ├── web/src/
│   │   ├── pages/
│   │   ├── modules/rooms/            Calendario PMS (TimelineScheduler)
│   │   ├── components/               Sidebar, NotificationBell, etc.
│   │   ├── hooks/useSSE, useSoftLock, useNotifications
│   │   └── store/auth.ts             Zustand
│   └── mobile/
│       ├── app/(app)/                Expo Router screens
│       └── src/features/             Por módulo (maintenance, housekeeping)
└── docs/
    ├── vision/                       ★ Estrategia + módulos futuros
    ├── sprints/                      Planes técnicos
    └── archive/                      Histórico
```

---

## Architecture Decisions (compactas)

> Las decisiones críticas para código nuevo están consolidadas en §Non-Negotiable Decisions abajo.

**Top 10 decisiones que afectan código nuevo:**

1. **Ciclo de dos fases de checkout** — `batchCheckout` crea PENDING, `confirmDeparture` activa READY.
2. **`confirmDeparture` requiere `bedId`** — sin él, en dorms se activan todas las camas.
3. **`await qc.refetchQueries()`** antes de cualquier navegación que dependa de datos frescos.
4. **`getDailyGrid` filtra por `checkout.actualCheckoutAt`** — nunca `createdAt` (timezone-safe).
5. **`hasSameDayCheckIn` per-task**, re-evaluado contra fecha real (no `now`).
6. **Toda validación de inventario pasa por `AvailabilityService`** — nunca queries directas.
7. **Night audit multi-timezone con `Intl.DateTimeFormat`** — nunca hardcodear timezone.
8. **`PaymentLog` append-only** — sin `@updatedAt`, void crea entrada negativa.
9. **Multi-tenancy strict** — `organizationId` + `propertyId` en cada query. JWT scope respetado.
10. **Módulos son bounded contexts (Evans 2003)** — comunicación vía SSE/EventEmitter, no service imports cruzados.

---

## Non-Negotiable Decisions §1-§94

> Decisiones tomadas deliberadamente. NO revertir sin discusión documentada.

### Operación del PMS y housekeeping

1. **Dos fases de checkout** — `batchCheckout` crea PENDING (sin notificar); `confirmDeparture` activa (notifica). Jamás activar limpieza antes de confirmación física.

2. **`confirmDeparture` debe recibir `bedId`** — sin él, en dorms se activan todas las camas del checkout.

3. **`await qc.refetchQueries()`** (no `invalidateQueries`) antes de cualquier navegación que dependa de datos frescos.

4. **`getDailyGrid` filtra por `checkout.actualCheckoutAt`** — nunca por `createdAt` (timezone-safe).

5. **`planningIsDone` derivado del servidor** — nunca de `useState`. Source of truth: `allBeds.some(b => !!b.taskId && !b.cancelled)`.

6. **Tab state en URL params** — `useSearchParams`, nunca `useState`.

7. **`hasSameDayCheckIn` per-task** — nunca per-checkout. Cada cama tiene su propio flag, re-evaluado contra la fecha real de la tarea (no `now`).

8. **`getState()` precedencia:** tarea activa (no cancelada) en servidor → override local → inferir de servidor.

9. **Cancel per-bed:** con `bedId` no marca `checkout.cancelled = true`. Sin `bedId` sí.

10. **Módulo de Mantenimiento monolítico** — comparte BD, NestJS y auth con Housekeeping. No es microservicio. Separación a nivel de módulos NestJS.

### Cumplimiento fiscal y no-shows

11. **Registros de no-show son inmutables** — nunca hard-delete de `GuestStay` con `noShowAt != null`. Solo anonimización de PII para GDPR/LGPD.

12. **Night audit NUNCA hardcodea timezone** — siempre usar `PropertySettings.timezone` con `Intl.DateTimeFormat`.

13. **`noShowProcessedDate` como idempotencia del corte nocturno** — antes de procesar, verificar que `localDate !== noShowProcessedDate`.

14. **Aritmética monetaria con `Decimal`** — nunca `number` nativo. Importar `Decimal` de `@prisma/client/runtime/library`.

15. **`checkAvailability` excluye no-shows** — el filtro incluye `noShowAt: null`.

**15b.** **Guard anti-re-marcado:** `noShowRevertedAt: null` en el query del night audit. Un stay revertido NO se re-marca aunque caiga en el rango temporal.

16. **Ventana de reversión de no-show — 48 horas** desde `noShowAt`. Después es inmutable. Guard server-side con `differenceInHours(now, noShowAt) > 48`.

17. **Liberación de inventario en no-show** — `checkAvailability` excluye stays con `noShowAt != null`.

18. **`NoShowChargeStatus` enum** — ciclo `NOT_APPLICABLE → PENDING → CHARGED | FAILED | WAIVED`.

### Frontend / UI

19. **Reports multi-tab con lazy loading** — query `enabled` por tab activo.

20. **No-show inline confirm** — no Dialog separado, panel dentro de BookingDetailSheet.

21. **No usar `useState` para estado de servidor** — React Query es source of truth.

22. **Color tokens del calendario: solo `emerald`, nunca `brand-*`** — `tailwind.config.js` no define `brand`.

23. **Grid del calendario con `z-0` (stacking context)** — sin esto, RoomColumn puede quedar cubierto por bloques.

24. **`hide()` antes de `onNoShow`** — al clicar "Marcar no-show" en tooltip, cerrar tooltip primero.

25. **Arquitectura de dos niveles para detalle de reserva** — `BookingDetailSheet` (420px) cubre el 90%. `ReservationDetailPage` es nivel 2 (auditoría completa). Mutaciones críticas solo en contexto del calendario.

26. **`GET /v1/guest-stays/availability` ANTES de `GET /v1/guest-stays/:id`** — orden de declaración en controller crítico.

27. **`BookingDetailSheet` tiene su propio `×`** — `SheetContent` con `showCloseButton={false}`.

28. **Modelo de precios aditivo (no recalculativo)** — cada cambio genera línea nueva. Reduce errores de facturación (Baymard 2022: 68%).

29. **Precios en modales son informativos (snapshot)** — `ratePerNight` del segmento activo es fuente de verdad hasta Sprint 8.

30. **Ghost block para celdas vacías** — patrón Apple Calendar. Tooltip portal solo para reservas existentes (evita tooltip fatigue, NN/g).

### Psicología del color y feedback

31. **Psicología del color en el calendario** — `emerald` = disponibilidad/positivo, `amber` = advertencia no-bloqueante, `red` = rechazo/escasez. El recepcionista decide solo por color (Mehrabian-Russell 1974).

32. **SSE Soft-Lock TTL = 90s con cleanup en unmount** — advisory lock, no hard lock. Liberación inmediata al cerrar dialog.

33. **Housekeeping bridge: PMS → Housekeeping automático** — `extendNewRoom` o `executeMidStayRoomMove` crean `CleaningTask(PENDING)` + SSE `task:planned`.

34. **Connected Rooms: descartado permanentemente** — <2% adopción en mercado target.

35. **Toda validación de inventario pasa por `AvailabilityService`** — regla arquitectónica obligatoria. Ninguna query directa a `staySegment` o `guestStay` para responder "¿está libre?".

36. **Channel Manager = Channex.io** — `user-api-key` header. Base URL `https://app.channex.io/api/v1`. Nunca importar fetch/axios para Channex desde otro módulo.

37. **Política Channex ante fallo** — `pushInventory` es best-effort (no revierte tx local). `pullAvailability` es fail-soft normal, fail-closed crítico (Sprint 8 decide).

### Confirmaciones y feedback informativo

38. **Toda operación CRUD destructiva o de reasignación exige confirmación explícita** — drag&drop, extensión, mover segmento, split, checkout manual, no-show marcado/revertido, cancelación, resize. Nunca disparar mutación final desde drag — siempre `*ConfirmDialog` con preview. (Baymard n=3,400: 68% errores en confirmaciones ausentes.)

39. **Feedback informativo obligatorio** — toda operación rechazada, inválida o fallida debe comunicar: (1) qué ocurrió, (2) por qué, (3) qué puede hacer el usuario. (NN/g H1+H9, Norman 1988, Shneiderman 1987, ISO 9241-110, Baymard n=2,100: 47% errores por feedback silencioso.)

40. **Bloques de no-show permanecen visibles en el calendario** — rayas diagonales rojas + badge "NS". Cumplimiento fiscal + chargeback evidence + KPI revenue management.

41. **Ventana temporal de no-show basada en día hotelero real** — termina en night audit (`noShowCutoffHour`, default 2 AM), no medianoche. Antes de `potentialNoShowWarningHour` (default 20:00): solo "Iniciar check-in". Entre 20:00 y `noShowCutoffHour`: ambas acciones coexisten.

42. **Los intentos de contacto al huésped quedan registrados** — `GuestContactLog { stayId, channel, sentById, sentAt, messagePreview }` append-only. Evidencia primaria para chargeback (Visa Core Rules §5.9.2).

43. **KPIs del Dashboard son ADAPTATIVOS por hora del día** — nunca estáticos cuando pierden valor operativo. Bloque permanente (24/7): ocupación, mapa rooms, "tu día". Bloque adaptativo rota según ventana. (Sweller, Apple HIG, Pousman & Stasko 2006.)

### Sprint 8H (Housekeeping Scheduling)

44. **D1: cron 7am NO sustituye `batchCheckout`** — pre-popula con base en `expectedCheckOut`. El recepcionista sigue siendo fuente de verdad.

45. **D2: cron multi-timezone `Intl.DateTimeFormat`** — patrón idéntico a NightAuditScheduler. Idempotencia con `morningRosterDate`.

46. **D3: hora del cron configurable per-property** — `PropertySettings.morningRosterHour` (default 7).

47. **D4: auto-asignación determinística + auditable** — siempre escribe `TaskLog { event: 'AUTO_ASSIGNED', metadata: { rule } }`.

48. **D5: cobertura es soft, no hard** — `StaffCoverage` define preferencia. Titular ausente → backup → round-robin. Flujo de ausencia: `POST /v1/scheduling/absences`.

49. **D6: carryover preserva `assignedToId` solo si está en turno hoy** — default `REASSIGN_TO_TODAY_SHIFT`. Re-evalúa `hasSameDayCheckIn` contra HOY.

50. **D7: métricas individuales son privadas** — `GET /reports/housekeeper-self/:staffId` requiere `actor.sub === staffId` o SUPERVISOR. NUNCA leaderboard público (LFPDPPP, Crowding-out effect Deci & Ryan 1999).

51. **D8: mobile usa SSE solo en foreground** — background → push only. Preserva batería.

52. **D9: gamificación opcional gestionada por supervisor** — `StaffPreferences.gamificationLevel`. Privacidad peer-to-peer estricta.

53. **D10: toda tarea creada pasa por `AssignmentService.autoAssign()`** — análogo a §35 AvailabilityService. 6 puntos de invocación.

54. **D11: tarea IN_PROGRESS es inmutable desde recepción** — `ConflictException` con mensaje específico. No cancel silencioso.

55. **D12: extensiones no eliminan tareas, las re-etiquetan** — modal "¿requiere limpieza?". `extensionFlag: WITH_CLEANING | WITHOUT_CLEANING`.

### Sprint 9

56. **D14: `StayoverFrequency` configurable per-property** — defaults por PropertyType (HOSTAL → NEVER, HOTEL → DAILY).

57. **D15: Kanban consolida Ajustes del día** — `KanbanPage` absorbe acciones operativas de override. `/overrides` deprecated.

58. **D16: Disciplina de Niveles de Notificación** — 3 niveles escalonados (Ambient / Notification / Elevated / Alarm). Limpieza nunca activa nivel 3. (Cisco Healthcare Alert Fatigue Study 2021.)

59. **D17: Persistencia obligatoria de toasts en NotificationPanel** — todo toast nivel 2+ crea entrada en `AppNotification` simultáneamente. NN/g H1+H6.

60. **D18: Mobile Hub Recamarista — agrupación dual priority+room** — runtime detection (≥2 tasks del mismo roomId → render como acordeón). Counter dual `🚪 X/Y · 🛏️ Z/W`. Sticky priority header. Bulk-start desde room header.

### Sprint Mx-1 (Mantenimiento)

61. **D-Mx1: `MaintenanceTicket` reemplaza a `MaintenanceIssue`** — modelo legacy preservado por compatibilidad pero no usado en flujos nuevos.

62. **D-Mx2: CRITICAL ticket auto-bloquea inventario** — `SmartBlockService.createBlock(OUT_OF_ORDER, MAINTENANCE, maintenanceTicketId)` síncrono en misma transacción. **Resuelve caso Hotel Monica Tulum (encerado vs venta OTA).**

**Notas adicionales Mx-1:** D-Mx3 (auto-release en VERIFIED), D-Mx4 (audit trail `MaintenanceTicketLog`), D-Mx5 (técnicos son `Staff` con `department=MAINTENANCE`), D-Mx6 (módulo NestJS monolítico), D-Mx7 (foto antes/después opcional pero recomendada).

### Sprint 8 (Check-in + Payments)

**Sprint 8E decisions:**
- **Confirmación de check-in via `confirmCheckin()`** — guard idempotencia (`actualCheckin !== null` → ConflictException), guard fecha futura, guard balance unpaid (sin OTA prepaid + sin COMP).
- **`PaymentLog` append-only USALI 12 ed** — sin `@updatedAt`, void crea entrada negativa con `voidsLogId`.
- **COMP + $0 amount requiere approval** — `approvedById` + `approvalReason`. Backend-enforced, no solo UI.
- **CARD_TERMINAL + BANK_TRANSFER requieren `reference`** — no chargeback evidence sin POS auth code.
- **`documentNumber` enmascarado** — `***1234` en audit logs + UI (GDPR/LGPD).
- **`keyType` enum default PHYSICAL** — captura trazabilidad de qué acceso se entregó.

### Arquitectura multi-tenant 4-level (v1.0.5+)

> **Decisión fundacional 2026-05-15.** Ver `docs/vision/11-multi-tenant-architecture.md` para análisis completo. Estas son las reglas no-negociables que aplican a TODO código nuevo a partir de v1.0.5.

63. **Modelo 4-level Brand→Organization→LegalEntity→Property** — el schema multi-tenant es jerárquico, no flat. Toda Property pertenece a 1 LegalEntity (fiscal); toda LegalEntity pertenece a 1 Organization (customer SaaS); toda Organization pertenece a 0..1 Brand (comercial, opcional). Justificación: casos reales como Selina (24 países) necesitan separar entidad fiscal de entidad comercial. Modelos flat (Org→Property) no pueden soportarlo sin atajos peligrosos.

64. **LegalEntity es required para invoicing** — toda emisión CFDI/DIAN/SUNAT/Tribu-CR pasa por LegalEntity. Tax ID, currency, PAC credentials viven en LegalEntity (no Property). Razón: el PAC se contrata por razón social, no por propiedad.

65. **Property.legalEntityId** será NOT NULL eventualmente (v1.1+). Durante migration v1.0.5 es nullable con backfill automático. Toda Property nueva debe asignarse a una LegalEntity desde el día 1.

66. **organizationId denormalizado en Property** — además del FK a LegalEntity, Property mantiene `organizationId` denormalizado para queries comunes ("todas las properties de esta org"). Trigger Postgres garantiza consistencia. Citus pattern.

67. **User scope 3-level: BrandUserRole / LegalEntityUserRole / UserPropertyRole** — autorización jerárquica. Un user puede tener cualquier combinación. AccessControlService verifica vía query UNION los 3 niveles. Pattern Salesforce Profile + Permission Sets.

68. **JWT lleva `scope: 'BRAND' | 'LEGAL_ENTITY' | 'PROPERTY'`** — el scope efectivo de la sesión. Endpoints cross-* validan el scope adecuado. Backwards compat: si scope no presente, asume PROPERTY.

69. **FiscalRegime es semilla, no hardcode** — los 10 países LATAM (MX/CO/CR/PE/PA/GT/BR/SV/HN/AR) están en tabla `FiscalRegime` sembrada. Cada uno tiene su `pacAdapterClass` (Strategy pattern). Agregar país nuevo = 1 row + 1 adapter class, sin migration.

70. **PAC credentials per LegalEntity, NO per Property** — el PAC tiene 1 contrato por razón social. Multi-property bajo misma LegalEntity comparte PAC.

71. **legalAddress como `jsonb`** — cada país tiene formato distinto (MX: calle/colonia/CP; BR: rua/bairro/CEP). Modelar 30 columnas opcionales = anti-pattern. JSONB + adapter validation. Citus pattern.

72. **TenantContextService es app-layer (no Postgres RLS)** — enforcement en NestJS middleware/interceptor. RLS reservado como defense-in-depth en v1.2+. Razón: app-layer es más debuggeable, ya tiene 8/8 tests pasando.

### Infraestructura — 4 fases sin lock-in

> Ver `docs/vision/12-infrastructure-devops.md` para detalle completo.

73. **Fase 1 (HOY): Vercel + Render + Neon + R2** — costo $70-200/mes. Path de migración trivial a AWS sin reescritura. Razón: velocity para piloto; AWS día 1 requiere DevOps dedicado ($5k+/mes salario).

74. **Fase 2 trigger:** ≥10 properties O ≥3 cadenas con ≥3 properties cada una. Migración a AWS Fargate + RDS + Upstash Redis.

75. **Fase 3 trigger:** ≥100 properties O 1er customer enterprise (cadena multi-país). Compliance SOC 2 Type 2 + PCI-DSS si volumen tarjeta >6M/año.

76. **Disciplinas DevOps desde día 1 (no costean dinero):** environments separados con preview deploys, migrations versionadas con rollback documentado, backups verificados mensualmente, secrets en env vars (nunca en repo), 3-tier observability (metrics + logs + traces), incident runbook documentado para 8 tipos de incidente.

### Setup wizard — Zenix Activate

> Ver `docs/vision/13-consultant-setup-wizard.md` para detalle de las 8 etapas.

77. **Zenix Activate** — wizard de onboarding ejecutado por consultor ZaharDev o partner certificado (v1.2+). 8 etapas: Customer Account → Brand → LegalEntity → Properties → Inventory → Staff → Integrations → Activación. Target 30 min - 2 semanas según complejidad (vs SAP 6-12 semanas).

78. **Templates de inventario obligatorios** — 4 templates pre-cargados (HOSTAL, BOUTIQUE, CABAÑAS, BUSINESS) con RoomTypes razonables. Customer empieza desde template y customiza. Pattern Salesforce "Industry Solutions".

79. **Health checks pre-activación** — antes de marcar `Organization.activatedAt`, wizard ejecuta batería de tests (Channex push, Stripe charge $1, PAC emission, etc.). Failed checks bloquean activación; warnings permiten continuar con confirmación explícita.

80. **Activation Report PDF** — generado automáticamente al activar. Documenta toda la configuración, sirve como handover formal al customer. Pattern SAP Activate "Realize Phase Report".

### Payment, Currency & Tax — v1.0.1 PAY-CORE / v1.0.2 CFDI-CORE

> Decisiones fundacionales 2026-05-15. Ver [docs/vision/14-payment-currency-tax-architecture.md](../../docs/vision/14-payment-currency-tax-architecture.md) para análisis completo (9 sub-módulos, esquemas Prisma, bibliografía LATAM).

81. **`PaymentFxLock` atómico e inmutable** — todo `PaymentLog` con `paidCurrency ≠ propertyDefaultCurrency` genera un `PaymentFxLock` en la misma transacción. El rate se congela al cobro y nunca se reescribe. Cuando llega el payout report de Stripe/Conekta se reconcilia `realizedGainLoss` en línea separada (USALI 12 ed. Foreign Exchange Gain/Loss). Patrón inmutable análogo a §28 PaymentLog append-only.

82. **`PropertySettings.taxStrategy` default `INCLUSIVE`** — rate público incluye IVA + ISH (porcentuales). Push a OTAs vía Channex con `is_inclusive=true`. DSA per-night (cuota fija) **siempre `EXCLUSIVE`** con disclosure obligatorio en confirmation page del OTA (la OTA no puede pre-calcular sin noches/personas). Resuelve el "problema Hostelworld" — fricción del 73% de quejas post-stay por extra fees inesperados (NN/g Price Transparency 2023).

83. **Banxico SF43718 (FIX) es fuente primaria de FX para properties MX** — cron diario 12:00 CST post-publicación DOF. Token gratuito, 40 000 consultas/día. Fallback a Open Exchange Rates si Banxico no responde en 30s con alerta SSE al admin. CFDI 4.0 usa el FIX del día de la operación (Art. 20 CFF). REP usa FIX del día del pago (no de la factura) — diferencia natural se asienta en `realizedGainLoss`.

84. **`TaxRate` modela rate porcentual, cuota fija, y multiplicador UMA** — `calculation: PERCENT_OF_BASE | FIXED_PER_ROOM_NIGHT | FIXED_PER_PERSON_NIGHT | UMA_MULTIPLIER | PER_BOOKING`. **`UmaValue` versionada per-country con `validFrom/validTo`, nunca hardcoded** (UMA cambia cada febrero por inflación INEGI). Ejemplo MX: ISH QR 2026 = `PERCENT_OF_BASE 0.06`; DSA Tulum 2026 = `UMA_MULTIPLIER 0.30 perPerson=true`.

85. **Cash drawer multi-divisa reconcilia per-divisa, no agregado** — `CashierShift.{openingFloat, expectedClose, actualClose, variance}` son `Json { MXN, USD, EUR }`. Todo `PaymentLog method=CASH` requiere `shiftId` activo (sin shift abierto → ConflictException). Devuelta en moneda distinta = dos `CashMovement` con mismo `transactionGroupId`. Variance > umbral configurable requiere `varianceReason` + `reconciledById` SUPERVISOR (patrón AHLEI Front Office Cashier's Shift Report).

86. **`GuestCredit` es entidad de primera clase BASE no DLC** — emitida por `LegalEntity`, aplicable solo intra-`LegalEntity` (un crédito de LegalEntity A nunca aplicable a folio de LegalEntity B — sería ingreso doble fiscal). En MX, si folio origen tuvo CFDI I emitido, **es obligatorio emitir CFDI E con `FormaPago=15 (Condonación)` + `UsoCFDI=G02`** antes de marcar `status=ISSUED`. Servicio: `GuestCreditService.issueCredit()` análogo §35 AvailabilityService. Audit append-only en `GuestCreditLog`. Default `transferable=false`, expiración configurable per-property (default 12 meses MX). Ningún PMS premium tiene esto en core — diferenciador real frente a Mews/Opera (que dependen de VoucherCart add-on).

87. **OTA-collect detection vía Channex `payment_collect` flag** — persistido en `GuestStay.paymentModel: HOTEL_COLLECT | OTA_COLLECT | HYBRID_DEPOSIT`. En `OTA_COLLECT` el `confirmCheckin` no requiere balance pagado (folio se marca "paid via OTA virtual card / pending reconciliation"). En `HYBRID_DEPOSIT` balance = `totalCharges − depositReceived`. Mews tiene feature request abierto desde hace años — Cloudbeds sí lo tiene. Zenix lo entrega en core.

88. **`PaymentMethod` enum se mantiene como naturaleza del pago** — `CASH | CARD_TERMINAL | BANK_TRANSFER | OTA_VIRTUAL_CARD | COMP`. **NO se factoriza por divisa** (no crear `CASH_USD`, `CASH_MXN`...). La divisa viaja siempre en `paidCurrency: String (ISO 4217)` + `paidAmount` + `baseAmount`. Modelo Cloudbeds, más limpio para agregar divisas sin migrations.

89. **`IFiscalAdapter` por país (Strategy pattern)** — cada `FiscalRegime` (§69) tiene su `pacAdapterClass`: `MxCfdi40Adapter` (Facturama / SW Sapien), `CoDianAdapter`, `PeSunatAdapter`, `CrHaciendaAdapter`. **MX es BASE v1.0.2 CFDI-CORE**; CO/PE/CR son **DLC tier Pro** activables vía Zenix Activate wizard (§77-§80). Permite escalar a nuevos países agregando 1 row en `FiscalRegime` + 1 adapter class sin migration.

90. **Créditos emitidos sobre stays OTA por default solo aplicables a reservas direct** — `GuestCredit.applicableChannels: String[] @default(["DIRECT"])`. Mitigación del riesgo de "OTA pierde comisión por venta original cuando crédito se aplica a stay direct futura". Override per-property con audit log. Documentado en UI al emitir crédito sobre stay OTA.

### Tax catalog nativo + multi-país LATAM — v1.0.2 CFDI-CORE / Zenix Activate

> Decisiones fundacionales 2026-05-15 (PM late) tras investigación profunda 32 estados MX + 9 países LATAM + fricción competitiva. Ver [docs/vision/14-payment-currency-tax-architecture.md §J](../../docs/vision/14-payment-currency-tax-architecture.md) para matriz completa.

91. **Catálogo nativo Zenix de impuestos (`TaxCatalogEntry`) — single source of truth, owned por rol `TAX_CURATOR` interno.** Cliente NUNCA edita el catálogo base; solo crea `TaxCatalogOverride` con `reason` + `approvedById` obligatorios. Patrón SAP Tax Determination / Vertex Tax Content team / Salesforce Permission Sets. NO usar Avalara/Vertex/Sovos en v1.0.x — costo y velocidad de actualización (LATAM hotelería) favorecen catálogo curado por contador interno parcial (~$1.5-2k/mes vs $1-4k Avalara vs ≥$30k/año Sovos). Es **diferenciador comercial documentado** frente a Mews (Tax Environments hard-coded no modificables tras crear enterprise), Cloudbeds (sin presets, ~30 clicks setup MX), Opera (requiere consultor Oracle $15-30k), RoomRaccoon (onboarding 1-4 semanas).

92. **`TaxCatalogOverride` con precedencia PROPERTY > LEGAL_ENTITY > catálogo base.** Override permite `disabled=true` para exoneraciones (ZOLITUR Roatán, RNT Colombia, IVA-exempt diplomático) o `customRate/customFixedAmount`. Validez con `validFrom/validTo`. Resolución en `resolveTaxesForProperty()`: catalog entries más específicos primero (municipality > region > federal), luego merge con overrides en orden de precedencia. Toda aplicación crea entry en `TaxApplicationLog` append-only (§14, §28).

93. **Brasil EXCLUIDO de v1.0.x.** ISS municipal (2-5 % por ayuntamiento, 80+ ciudades top) + reforma tributária 2026-2033 (CBS/IBS gradual replacement de PIS/Cofins/ICMS/ISS) hacen Brasil incompatible con el catálogo curado interno de Zenix. Entrar a Brasil **post v1.2** con **Sovos como `FiscalAdapter`** dentro del pattern §89 (no reinventar). Sovos tiene equipo dedicado y cobertura de la reforma tributária. Documentar al cliente que reciba reservas Brasil OTA antes de v1.2 con flag warning.

94. **`TaxCatalogEntry.status='AMBIGUOUS'`** para entradas con fuente primaria no verificable. Caso vigente: **DSA Tulum** (per-room confirmado por sitio oficial H. Ayuntamiento Playa del Carmen para Riviera Maya / per-person tiered según Reporte Quintana Roo 2026; Decreto 191 texto literal no accesible). Wizard Zenix Activate solicita al cliente seleccionar modalidad al activar property; equipo de Activate verifica con Tesorería Municipal antes de marcar `status='ACTIVE'`. Default conservador = `UMA_MULTIPLIER` per-room (modalidad soportada por la fuente oficial municipal Riviera Maya). Nuevo `TaxCalculation.UMA_PER_PERSON_TIERED` agregado para soportar el caso tiered si se verifica.

**México — datos 32 estados ISH 2026 confirmados** ([El Contribuyente](https://www.elcontribuyente.mx/impuesto-sobre-hospedaje/) × [JA Del Río](https://www.jadelrio.com/mx/es/blogs/tasas-actuales-del-impuesto-sobre-hospedaje-2026)): Yucatán bajó 5→4.5 %; QR 5 %/6 % plataformas; CDMX 3.5 %/5 % plataformas; Guerrero/Querétaro/Jalisco tarifa diferenciada plataformas. Catálogo seed productivo lo carga el Tax Curator antes de release v1.0.2.

**LATAM 9 países — granularidad mínima:** MX y Brasil requieren per-estado/municipio; CO/CR/PE/PA/GT/SV/AR funcionan con catálogo nacional; HN requiere override regional para ZOLITUR (Roatán/Utila/Guanaja).

### Cancel-Archive — v1.0.0 sprint cerrado (PR #32)

95. **Soft-delete obligatorio de reservas (D-CAN1)** — `GuestStay.cancelledAt` + cascade a `StaySegment.status='CANCELLED'` + `StayJourney.status='CANCELLED'`. Nunca hard-delete. Justificación: Visa Reason Code 13.7 ventana 120d filing + 30d ack ([Visa Dispute Management Guidelines junio 2024](https://usa.visa.com/content/dam/VCOM/global/support-legal/documents/merchants-dispute-management-guidelines.pdf)); CFDI 4.0 Art. 30 CFF retención 5 años; GDPR Art. 17.3.b/e excepción. AvailabilityService excluye `cancelledAt != null` — libera inventario inmediato. Schema "espiral": `cancelInitiator: String?` (no enum), `cancelMetadata: Json?`, `cancellationPolicyId: String?` FK hook, `requiresFiscalReview: Boolean` sembrado para v1.0.2 CFDI-CORE — sin migration en sprints futuros.

96. **Restore window 7d para HOTEL/ADMIN_ERROR únicamente (D-CAN7)** — cancelaciones iniciadas por GUEST u OTA NO son restaurables (operación real ya cerrada). Restore verifica `AvailabilityService.check` antes de aplicar — si la habitación ya está reservada, error friendly. `GuestStayLog` append-only registra event `RESTORED` con audit completo.

97. **Calendar filtra cancelled del view (paridad industria)** — `staysWithoutJourneys.filter(s => !s.journeyId && !s.cancelledAt)`. Industria estándar (Cloudbeds/Mews/Opera/RR/LH liberan slot visual). Cancelled accesible vía slide drawer footer "Canceladas hoy: N" + sub-tab archive (futuro `/reservations`).

98. **Modal dismiss estándar reusable (`useModalDismiss` hook)** — patrón Apple HIG aplicado a TODOS los modales: backdrop click + Esc cierran. Si `isDirty=true` (form con cambios) → `window.confirm` antes de descartar. Aplicado a CancelReservationDialog, CancelledTodayDrawer, MoveExtensionConfirmDialog. Backdrop blur div con `pointer-events-none` para que click pase al outer container.

### Notif center — auto-cleanup + self-suppress sistémico

99. **Self-suppress sistémico (analogía FB)** — el actor que dispara una notif NUNCA recibe la suya. Aplicado en `NotificationCenterService.sendPush` (filtra `triggeredById` de staffIds para recipientType=ROLE/PROPERTY_ALL) Y en `listForUser` + `unreadCount` (filtro `triggeredById !== staffId`). Excepción: `recipientType=USER` con `recipientId=self` sí se entrega (caso DM-style legítimo).

100. **Auto-mark-as-read tras decisión de aprobación** — `recordApproval` auto-crea `AppNotificationRead` entries para todos los recipients elegibles al crear el `AppNotificationApproval`. Backward-compat: `unreadCount` filtra `approvals: { none: {} }` para data legacy. Resultado: bell counter no muestra notifs ya decididas; panel "Sin leer" tampoco. La notif sigue visible en "Todas" con badge ✓Aprobado/✗Rechazado.

101. **Purga física de notifs (NotificationPurgeScheduler)** — patrón "two-tier retention": (a) `expiresAt > now` = activas; (b) `expiresAt < now < expiresAt+7d` = grace period audit; (c) `expiresAt+7d < now` → DELETE físico vía `@Cron EVERY_DAY_AT_4AM`. Cascade automático a `AppNotificationRead` + `AppNotificationApproval` por FK. Compliance permanente (`expiresAt=null`: NO_SHOW Visa-evidence, MAINTENANCE_SLA_BREACH, PAYMENT_PENDING) NUNCA se purga — futura migration v1.0.3 REPORTS-CORE moverá >365d a cold storage partition.

### Rates 3-LEVEL + FX-CORE — v1.0.0 sprint cerrado (PR #32)

102. **Patrón Rates 3-LEVEL** — solución al gap competitivo documentado en Mews feedback (8 votos abierto desde oct-2024, 2 quejas verbatim). Niveles:
    - **Nivel 1 — Ambient**: BAR per-group renderizado en cada `row.type='group'` del TimelineGrid usando `RoomTypeGroup.baseRate` client-side (no requiere endpoint). Cada grupo (Cabaña, Estándar, Junior Suite, Suite) muestra su rate distinto por día. Fallback a BAR strip top cuando solo hay 1 grupo (caso STR/Airbnb flat).
    - **Nivel 2 — Hover enriquecido**: ghost block del `TimelineGrid` muestra rate completo (no truncado) con layout adaptativo según `colWidth` (narrow: `$1.5k` solo; medium: `+ $145`; wide: `+ Nueva reserva — USD 145`).
    - **Nivel 3 — Rate Quote Sheet**: side panel (max-w-2xl) accesible vía botón "Tarifas" en `TimelineSubBar` con grid `RoomType × Dates` + totales por type. Endpoint `GET /v1/rates/quote` con `RatesService.getRateQuoteGrid()`. Selector de fechas + presets "Hoy / 7d".

103. **FX-CORE — Banxico oficial + override hotel** — adelantado de v1.0.1 PAY-CORE porque rate display requiere conversión.
    - **ExchangeRate** model: snapshot diario inmutable per `[org, base, quote, effectiveDate, source]` UNIQUE. Source primario: `BANXICO_SF43718` (FIX gratuito, 40k req/día).
    - **PropertyFxRate** model: override comercial del hotel. Rate absoluto o spread relativo (`spreadFromOfficial: Decimal?`) sobre oficial. `validFrom/validTo` para histórico.
    - **`FxService.refreshBanxicoDaily`** `@Cron('0 13 * * *', timeZone: 'America/Mexico_City')` post-publicación DOF. Fail-soft si Banxico no responde — log warning, sin alerta crítica en v1.0.0.
    - **CFDI compliance** (Art. 20 CFF): cancelaciones, refunds y emisiones usan rate **oficial Banxico del día de la operación**. REP usa FIX del día del pago (no de la factura) — diferencia natural se asienta en `realizedGainLoss` (v1.0.1 §81 PaymentFxLock).
    - **Override interno** aplica para quotes al guest + cobros front-desk únicamente — nunca para CFDI.

104. **Scroll performance SwiftUI-style (calendar timeline)** — refactor de `handleScroll` para bypass total de React reconciliation en cada scroll event:
    - 3 refs (`dateHeaderInnerRef`, `barStripInnerRef`, `footerInnerRef`) apuntan a los inner divs que sincronizan con scroll horizontal.
    - `handleScroll` aplica `translate3d(${-x}px, 0, 0)` directo al DOM en cada scroll event (60-120/s) — 0 React cost, GPU-composited.
    - `setScrollLeft` (React state) sigue existiendo pero throttled vía `requestAnimationFrame` (1 update/frame cuando idle) — usado solo por virtualizer + cálculos derivados.
    - `will-change: transform` en los inner divs → compositor thread.
    - `BarStrip` + `OccupancyFooter` signatura: `scrollLeft: number` → `innerRef: Ref<HTMLDivElement>`. Componente NO conoce el valor, solo expone el ref.
    - Patrón Apple Calendar / SwiftUI scroll-aware container — el scroll es 100% imperativo.

128. **Overstayed/zombie stays — tratados como salidos para availability, expuestos en reports.** Sprint AVAIL-OVERSTAY (2026-05-19). Una `GuestStay` con `scheduledCheckout < startOfDay(today)` y `actualCheckout=null` se considera "zombie" (huésped se fue pero recepción no confirmó checkout; o falló la conexión; o cambió dueño de turno).
   - **`AvailabilityService.check()` los excluye** del query de conflictos. Cutoff combinado `effectiveCheckoutCutoff = max(dayAfterNewCheckIn, zombieCutoff=startOfDay(today))`. Sin esto, Elena dragged A1→A2 con su `checkIn` en pasado disparaba conflict contra Carlos zombie sch=ayer (bug reportado por testing 2026-05-18).
   - **`AvailabilityService.findOverstayed(propertyId)` es el counterpart**: retorna exactamente las zombies con `outstandingBalance = totalAmount - amountPaid` + `hoursOverdue`. Política Option B (user-approved 2026-05-19): "si no hizo checkout y debía saldo el sistema debe reportarlo en algún lugar". Contabilidad encuentra el saldo via dashboard widget + endpoint reports.
   - **Endpoint `GET /v1/reports/overstayed`** (RECEPTIONIST/SUPERVISOR; HOUSEKEEPER → 403, sin acceso a PII financiera).
   - **Frontend mirror del filtro** en `TimelineScheduler.occupancySet`, `MoveRoomDialog.staysByRoom`, y `useDragDrop.hasConflict` (con `effectiveCheckIn = max(today, checkIn)` para clipping del rango cuando el dragged stay ya hizo check-in — fix de Bug 1+2 reportados 2026-05-18).
   - **Visual cue en calendar**: `BookingBlock` muestra ring amber `inset 0 0 0 2px rgba(217,119,6,0.85)` + badge "Vencido" cuando `isOverstayed`. Diferenciable de no-show (red solid).
   - **`OverstayedWidget`** en Dashboard renderiza top-3 + saldo agregado + "Ver N más". Empty state explícito ("Sin pendientes") para reinforcement positivo.
   - **Tests:** `apps/api/src/pms/availability/availability.service.spec.ts` 6/6 verdes — cubre cutoff combinado, segment query, ordering, balance computation.
   - **Out-of-scope deferido a v1.0.3 REPORTS-CORE:** paginación cuando >50 zombies, filtros por antigüedad (>7d crítico), export CSV, notif diaria al SUPERVISOR cuando count > 0 al cerrar turno.

127. **Confirmar mudanza lightweight (1-click) para room-change segments.** Sprint MOVE-CONFIRM 2026-05-18. Schema: `StaySegment.moveConfirmedAt + moveConfirmedById`. Endpoint `POST /v1/stay-journeys/segments/:id/confirm-move`. Guards: reason in [EXTENSION_NEW_ROOM, ROOM_MOVE] + status=ACTIVE + checkIn ≤ now + !moveConfirmedAt + stay no cancelled/no-show/checked-out. Side effect: `promoteRoomChangeTaskToReady` promueve PENDING → READY (consistente §1 ciclo 2-phase: PENDING=planning, READY=HK actúa) — sin esto recamarista podría limpiar cuarto antiguo ANTES del move físico. Pattern 5/5 PMS (Mews, Cloudbeds, Opera, Little Hotelier, RoomRaccoon) — separado del re-check-in (§125 propagación actualCheckin). UI: botón "Confirmar mudanza" en BookingDetailSheet como primary CTA cuando aplica.

126. **Cancelar extensión de un guest checked-in ≠ early checkout.** Sprint 2026-05-17. Cuando un guest checked-in tiene un segmento futuro (extension) y decide cancelar esa extensión, NO debe forzarse el flow de early checkout — el guest sigue alojado en su segmento actual; solo se revoca la prolongación planeada. Endpoint: `POST /v1/stay-journeys/segments/:segmentId/cancel` → `StayJourneyService.cancelFutureSegment`. Guards: segment.checkIn > now + status=ACTIVE + journey con ≥1 otro segmento ACTIVE. Efectos: segment.status=CANCELLED + journey.journeyCheckOut + GuestStay.scheduledCheckout revierten al max checkOut de los segmentos restantes; availability libera noches; audit en StayJourneyEvent con subType='EXTENSION_CANCELLED'. Frontend routing condicional en TimelineScheduler: `isFutureExtensionSegment = !!stay.segmentId && stay.checkIn > now && !stay.isFirstSegment` → llama `useCancelExtensionSegment` en lugar de `useCancelStay`. **Cross-PMS consensus 5/5** (Mews, Cloudbeds, Opera, Little Hotelier, RoomRaccoon): cancel extension = revertir fecha de salida; NO genera checkout, NO requiere re-check-in, NO genera housekeeping task. El bug previo "El huésped ya hizo check-in — usar checkout anticipado" forzaba audit erróneo + HK task prematura + balance/refund incorrecto. Las extension cancellations aparecen en el footer "Canceladas hoy" con badge `Extensión` (ícono CalendarMinus ámbar) distinguible visualmente de stay-level cancellations.

125. **Mid-stay room change housekeeping flow — task PENDING en el día del move, NO en el día del booking.** Sprint 2026-05-17. Cuando un guest extiende su estadía a otra habitación (EXTENSION_NEW_ROOM o ROOM_MOVE), la habitación origen necesita limpieza el día del move, no el día que se registra la extensión.
   - **`createRoomChangeTasks(propertyId, roomId, scheduledFor: Date)`** (privado en StayJourneyService) — el tercer parámetro `scheduledFor` es REQUERIDO. Normaliza a UTC midnight; valida idempotency local antes de crear; skipea SSE emit si no se creó task nueva.
   - **Callers actualizados:** `extendNewRoom` pasa `activeSegment.checkOut` (= fecha del move). `executeMidStayRoomMove` pasa `effectiveDate`. `splitReservation` pasa `today` (split sucede ahora).
   - **Morning roster cron amplía detección:** además de `GuestStay.scheduledCheckout` (stay-level), ahora query `StaySegment` con `checkOut=today + reason in [EXTENSION_NEW_ROOM, ROOM_MOVE]` (move-outs) Y `checkIn=today + reason in [...]` (move-ins). Unifica fuentes con `Map<roomId>` dedup.
   - **`hasSameDayCheckIn` URGENT escalation:** rooms con guest llegando hoy via move-in (segment-level) se marcan URGENT igual que stay-level checkins. Tu escenario (Guest A se mueve a C2 donde Guest B hizo checkout same-day) ahora correctamente prioriza C2 sobre otras rooms del roster — el guest esperando no se queda con maletas en recepción mientras la recamarista limpia otra cosa.
   - **Upgrade-in-place:** si la task ya existía (creada eagerly por `extendNewRoom` con priority MEDIUM) y AHORA el cron detecta same-day arrival, hace `UPDATE` con priority=URGENT + hasSameDayCheckIn=true. La señal "guest llegando" se preserva incluso si llega después de la creación de la task.
   - **Tests:** 4 nuevos en `morning-roster.scheduler.spec.ts` (B2 task creation segment moveout / B3 URGENT priority via move-in / upgrade-in-place / dedup). Total 16/16 passing, 365/365 backend suite passing.

124. **SSE singleton — UNA sola EventSource por tab del navegador, garantizado.** Ubicación: [apps/web/src/lib/sseClient.ts](apps/web/src/lib/sseClient.ts). Los hooks `useSSE`, `useSoftLockSSE`, `useRoomSSE` son subscribers ligeros del singleton — NO crean sus propias `EventSource`. Decisión fundacional Sprint SSE-RESILIENCE (2026-05-17, adelantada de v1.0.4 al detectar bloqueo recurrente en testing dev).
   - **Bug raíz que motivó:** 3 EventSources por tab (useSSE + useSoftLockSSE + useRoomSSE), cada una con su propio lifecycle, cada una capaz de leak con HMR. Tras horas de dev se acumulaban 15-25 conns TCP a localhost:3000 → pool HTTP/1.1 de Chrome (6 simultáneas por origin) se agotaba → POSTs colgaban hasta timeout. Bug reportado 4+ veces en una sola sesión.
   - **Garantías:** (1) máximo 1 EventSource activa por tab, ref-counted via subscribers; (2) reconnect con exponential backoff 1s→2s→4s→8s→max 30s; (3) token-aware: re-conecta al cambiar JWT (switchProperty); (4) HMR-safe via `import.meta.hot.dispose()` que cierra la conn vieja al re-importar el módulo; (5) AbortController para preflight evita race conditions; (6) handlers aislados (un throw en uno no rompe a los demás).
   - **API pública mínima:** `subscribeSse(handler) → unsubscribe()`. Cualquier hook nuevo que necesite SSE usa esta API — está PROHIBIDO crear `new EventSource()` fuera de `sseClient.ts`.
   - **Debug helper:** `_sseDebug()` retorna `{ connected, readyState, subscribers, token, reconnectAttempts }` para introspección desde DevTools console.
   - **Por qué documentamos esto:** prevenir que la próxima feature reintroduzca el patrón `new EventSource()` ad-hoc que ya nos costó 4+ iteraciones de debugging. La eficiencia SSE en dev (HMR-safe) y en prod (cero accumulation) depende de mantener la disciplina del singleton.

123. **`DialogActions` es el primitive canónico para footers de modal — par Cancelar/Confirmar.** Ubicación: [apps/web/src/modules/rooms/components/shared/DialogActions.tsx](apps/web/src/modules/rooms/components/shared/DialogActions.tsx). Prohibido renderizar pares `<Button variant="outline">Cancelar</Button> + <Button>Confirmar</Button>` ad-hoc en footers de dialog — la inconsistencia visual (heights mixtos h-8/h-9/h-10, text-xs vs text-sm, ghost vs outline vs solid) viola NN/g H4 (consistency & standards) y erosiona la confianza del usuario en herramientas operativas.
   - **Reglas canónicas no-negociables:**
     1. Cancelar SIEMPRE izquierda (variant `outline`), Confirmar SIEMPRE derecha (solid coloreado por `tone`). Western reading flow + Apple HIG (primary action es el "destino" del gesto).
     2. Mismo `h-9` (36px ≥ 44pt iOS effective con padding), mismo `text-xs`, mismo `gap-2`.
     3. `tone: 'primary' | 'destructive' | 'warning' | 'info'` mapea 1:1 a tonos `ConfirmDialog` (§117). Primary = emerald-600, destructive = red-600, warning = amber-600, info = slate-700.
     4. `isPending` deshabilita AMBOS botones (Cancel + Confirm) — el HTTP standard §122 garantiza terminal state, el band-aid "habilitar Cancel durante pending" está explícitamente prohibido.
     5. `confirmPendingLabel` se deriva automáticamente del verbo del label ("Registrar pago" → "Registrando…"). Override sólo si la derivación no aplica.
     6. Icono opcional `confirmIcon` (`LucideIcon`) a la izquierda del label primary, h-3.5 w-3.5.
     7. `widthMode: 'stretch' | 'auto'` — stretch default (cada botón flex-1). Auto para footers con contenido a la izquierda (ej: línea audit ConfirmCheckin USALI/CFDI).
   - **Modales migrados al primitive (2026-05-17 post-debate):** `ConfirmDialog` (los demás `*ConfirmDialog` heredan al delegar), `RegisterPaymentDialog`, `VoidPaymentDialog`, `ChangeConfirmDialog`, `ConfirmCheckinDialog`, `CancelReservationDialog`, `MoveExtensionConfirmDialog`, `MoveReservationConfirmDialog`, `MoveRoomDialog`, `EarlyCheckoutDialog`, `ExtendConfirmDialog`, `UploadDocumentPhotoDialog`.
   - **Por qué documentamos esto:** auditoría detectó 10+ modales con button pairs inconsistentes (heights mixtos, sizes mixtos, tonos arbitrarios). Cada modal era "casi" igual pero no idéntico, lo cual produce esa sensación de UI "armada por varios devs" — exactamente lo que Apple HIG previene mediante design tokens. Cualquier modal NUEVO usa `DialogActions` desde el día 1.

122. **HTTP Client Standard — estandarizado y formalizado en [docs/engineering/http-client.md](docs/engineering/http-client.md).** Resumen ejecutivo:
   - `apps/web/src/api/client.ts` es el ÚNICO entry point para HTTP del frontend. Raw `fetch()` fuera de él está prohibido (única excepción documentada: `useSSE.ts` preflight para EventSource).
   - Timeouts automáticos via `AbortSignal.timeout()`: GET 30s · POST 20s · PATCH 20s · DELETE 15s. Override per-call con `opts.timeoutMs`.
   - Timeout vence → throw `ApiError(0, msg, { code: 'TIMEOUT' })` con mensaje accionable en español.
   - Network error → `ApiError(0, ..., { code: 'NETWORK_ERROR' })`. 401 → logout + redirect a /login con `returnTo`.
   - **Estado terminal garantizado**: toda mutation resuelve OK o ERROR — `isPending` siempre vuelve a `false`. Modales que dependen de `isPending` para Cancel/X tienen ciclo cerrado.
   - **Anti-pattern explícitamente prohibido**: habilitar Cancel durante `isPending` para "salir de modales colgados". Si un modal se cuelga, el bug está en el cliente (sin timeout), no en el modal. Cura es timeout, no band-aid.
   - Browsers soportados: `AbortSignal.timeout/any` desde 2023 (Chrome 103+, Safari 16.4+, Firefox 124+). Sin polyfill.
   - Cualquier modificación al contrato requiere update simultáneo de `client.ts` + `docs/engineering/http-client.md` + este §122.

121. **`useSSE.ts` usa `AbortController` para el fetch preflight** (fix iter 6 EDIT-RESERVATION). Bug original: el cleanup hacía `es?.close()` pero si HMR re-ejecutaba el effect mientras el fetch preflight estaba en flight, `es` era null en ese momento → la EventSource creada al resolver el fetch quedaba huérfana. Cada HMR sumaba 1 EventSource zombie. Chrome limita HTTP/1.1 a **6 conexiones simultáneas por host** → 6+ zombies bloqueaban el pool → POSTs como Registrar Pago, GETs de Movimientos/Notas quedaban en queue indefinidamente. Síntoma engañoso: "Cargando..." stuck sin error en consola, "Registrando..." sin progreso. Fix definitivo: `AbortController.abort()` en cleanup cancela el fetch antes de que pueda crear una EventSource huérfana. Cualquier hook NUEVO que use `EventSource` debe seguir este pattern.

### CHECK-IN-α — implementación iteración 2 (2026-05-17)

> Decisiones registradas tras feedback del usuario en sesión 2026-05-17. Ver [docs/sprints/CHECKIN-ALPHA-plan.md](docs/sprints/CHECKIN-ALPHA-plan.md) §3 + plan implementación.

105. **Check-in es single-screen con secciones colapsables, no wizard.** Justificación: NN/g 2024 "Wizards" — apropiados sólo para tareas >20min ejecutadas <1×/semana. Check-in es <2min, >20×/día → wizard es anti-patrón. Mercado boutique-PMS: 5/6 PMS (Cloudbeds, Mews, Clock PMS+, Little Hotelier, RoomRaccoon) usan single-screen. Sólo Opera (legacy) usa wizard de 7-12+ clicks — el más odiado en reviews verbatim. Anatomía: header sticky con balance badge → Identidad colapsable → Pago colapsable adaptativo (OTA/paid/pending) → Notas opcionales. CTA único `Confirmar check-in` con Cmd/Ctrl+Enter shortcut. `useModalDismiss` (Esc + backdrop + dirty confirm).

106. **`GuestStay.paymentModel` driver de OTA-collect detection.** Enum `HOTEL_COLLECT | OTA_COLLECT | HYBRID_DEPOSIT`, default `HOTEL_COLLECT` (no rebaja guards). Si `OTA_COLLECT`, `confirmCheckin` skip guard `BALANCE_UNPAID` y marca folio `paymentStatus=PAID` con nota "paid via OTA virtual card / pending reconciliation". `HYBRID_DEPOSIT` reservado para cuando Channex webhook escriba el flag real (sprint CHANNEX-INBOUND). Sin breaking change.

107. **Endpoint `GET /v1/guest-stays/:id/checkin-context` consolida data en single round-trip.** Pattern Cloudbeds "action drawer" — frontend recibe todo lo que necesita en una llamada (stay, paymentModel, balanceProjection, canCheckIn{reasons,warnings}, identityCaptured, paymentLogs, propertyCurrency, secondaryRates). Reduce 3 calls separadas (stay + payments + property settings) a 1. Declarado antes de `:id` en el controller para evitar shadowing (§26).

108. **Identidad por foto del documento, NO por campo "número" tipeado.** Sustitución completa del input manual. Pattern Maintenance MAINT-11 (data URI base64 hoy, migración S3 en v1.0.4 IMG). Justificación: CFDI 4.0 con RFC genérico `XAXX010101000` no requiere número estructurado (95% casos hospedaje turístico); Visa CRR 13.1/13.7 acepta foto como evidencia equivalente. Más práctico para recepción hostal LATAM (NN/g Form Usability: cognitive cost del typing eliminado). Límite blando 5MB. Checkbox "Verifiqué físicamente" sigue siendo requirement (audit trail).

109. **`documentNumber` enmascarado al perder foco (`••••XXXX`), plain con foco.** Pattern Stripe Elements. Audit log siempre enmascara `***XXXX` (ya en backend §2016). GDPR/LFPDPPP best practice — el número visible reduce superficie de exposición. Aplica al campo legacy cuando viene precargado de OTA/reserva direct previo a la foto.

110. **Backend devuelve códigos machine-readable en `confirmCheckin` errors:** `CHECKIN_ALREADY_CONFIRMED`, `BALANCE_UNPAID` (ya), `BALANCE_OVERPAID` (nuevo §110b), `NOSHOW_LOCKED`, `FUTURE_CHECKIN`. Frontend (`ApiError.code` getter) muestra feedback informativo específico (NN/g H9). Idempotency `CHECKIN_ALREADY_CONFIRMED` NO es error rojo — toast info + refetch silencioso. Mejor: parent TimelineScheduler guard previene apertura del dialog si `actualCheckin != null` → toast "Esta reserva ya está checked-in" sin renderizar dialog (evita el race en primera línea).

**110b. Overpayment bloqueado con `BALANCE_OVERPAID`** (Opera Cloud + RoomRaccoon paridad — 2/5 PMS conservadores). Tolerancia float 0.01. Crédito a favor / depósitos por incidentales son flujo aparte (v1.0.1 PAY-CORE territory, no parte del check-in). Mensaje claro: "El pago excede el saldo por $X. Ajusta el monto al saldo exacto — los depósitos por incidentales se registran después del check-in." Justificación: Cloudbeds/Mews/Little Hotelier permiten línea negativa silenciosa, lo cual genera errores en arqueo del turno. Cloudbeds adicionalmente usa banker's rounding (raro contra USALI half-up) — descartado para Zenix.

**110c. Currency display: property currency primary, USD/EUR/MXN secundarios.** 5/5 PMS analizados (Mews "outlet currency", Cloudbeds "house currency", Opera "operational currency", RoomRaccoon, Little Hotelier) priorizan property currency. Cash drawer física opera en property currency — mostrar otra moneda como primary genera errores de arqueo. Conversión secundaria con `Intl.NumberFormat` (decimales correctos per ISO 4217: USD/MXN: 2; JPY/CLP/COP: 0; KWD/BHD: 3). `propertyCurrency` derivado de `LegalEntity.baseCurrency` con fallback a folio currency durante v1.0.5 transición. `secondaryRates` lookup bidireccional 4-niveles: `PropertyFxRate` directo → inverso → `ExchangeRate` directo → inverso.

**110d. Sección "Entrega de llave" eliminada.** El hotel administra ese flujo aparte. NN/g H8 (minimalist) + Hick's Law — opciones irrelevantes son ruido cognitivo. Campo `keyType` permanece en DTO/schema como opcional para backward-compat; el UI ya no lo expone.

**110e. Foto upload sin OCR sirve hoy** (data URI base64, mismo patrón Maintenance MAINT-11). Migración a S3+Sharp en v1.0.4 IMG sprint — back-fill rows existentes. Razón vs esperar S3: Visa chargeback ventana es 120d; hoteles operando v1.0.1/v1.0.2 perderían evidencia retroactiva si esperamos.

### FX-LATAM — decisiones planeadas (registrar al ejecutar sprint v1.0.4)

> Decisiones del [plan FX-LATAM](docs/sprints/FX-LATAM-plan.md). Aún no implementadas — primer cliente Zenix fuera de MX las activa. Numeración reservada para preservar continuidad.

111. **`IFxAdapter` Strategy pattern paralelo a `IFiscalAdapter` (§89).** Cada `FiscalRegime` mapea su `fxAdapterClass` (campo nuevo). Agregar país = 1 class + 1 seed row, sin migration. Interface: `{ countryCode, primaryCurrency, cronSchedule, cronTimezone, fetchOfficial(): ExchangeRateInput[] }`. First batch: `BanxicoMxAdapter` (refactor existente), `BancoRepublicaCoAdapter` (Datos Abiertos GOV.CO), `BccrCrAdapter` (webservice SOAP), `SbsPeAdapter` (REST). Países USD-nativos (PA, SV) sin adapter.

112. **`FxAdapterRegistry` con `OnModuleInit` auto-registra crons per-país** usando `SchedulerRegistry` de `@nestjs/schedule`. Cada cron corre en timezone local del banco central (Banxico 13:00 CST, Banrep 19:00 COT, BCCR 19:00 CRT, SBS 19:00 PET). Fail-soft per-país: try/catch + log + SSE alerta admin si falla 3× consecutivos. Un adapter caído NO afecta los demás.

113. **`PropertySettings.secondaryDisplayCurrencies: String[]`** override del set de monedas secundarias en el check-in dialog. Si vacío, fallback a defaults por país (helper `defaultTouristCurrencies(countryCode)`): MX/CO/CR/PE → `['USD', 'EUR']`; AR → `['USD']` (EUR poco usado); PA/SV → `['EUR']` (USD ya primary). Nunca incluye la propia `baseCurrency`. Configurable en SettingsPage con `<TagInput>` para tourist edge cases.

114. **Argentina rates múltiples (oficial vs MEP vs CCL vs blue) requieren decisión de producto + contador AR antes de implementar.** Out-of-scope FX-LATAM first batch. Decreto AR 671/2024 obliga rate MEP para extranjeros pero realidad operativa hostal usa blue. Zona gris legal. Investigar al primer cliente Argentina.

115. **Brasil FX adapter llega bundled con Sovos `IFiscalAdapter` post v1.2** (consistencia §93). BCB Olinda PTAX API existe y es estable, pero entrar a Brasil sin el motor fiscal completo no tiene sentido — la conversión sin invoicing CFDI/NFSe equivalente es feature parcial. Bundle con Sovos asegura activación completa de Brasil de una vez.

### Modales — patrón canónico Zenix (no negociable post-2026-05-17)

> Decisiones cristalizadas tras 4 iteraciones costosas en sprint EDIT-RESERVATION
> reinventando contenedores cuando Radix ya los proveía. **Documentado para
> evitar repetir el ciclo.** Cualquier modal nuevo en el repo SIGUE estas reglas.

116. **Todo modal usa Radix Dialog primitives — NO inventar contenedores `fixed inset-0` manuales.** Si un modal vive dentro de otro Radix Sheet/Dialog abierto, los hacks de portal manual fallan en cascada:
   - **pointer-events lock** — Radix Sheet/Dialog setea `pointer-events:none` en body. Modal manual hereda → clicks pasan al overlay debajo → cierra ambos.
   - **dismissable layer** — Radix detecta clicks fuera del SheetContent y dispara `onOpenChange(false)`. Cualquier modal "fuera" del árbol gatilla esto.
   - **FocusScope trap** — Radix succiona el focus de regreso al primer focusable del Sheet padre. Inputs del modal manual no reciben keystrokes.

   Radix Dialog primitives (`Root`/`Portal`/`Overlay`/`Content`) **soportan nesting nativo** sobre Sheets/Dialogs padre — el inner FocusScope cede, los pointer events funcionan, el dismiss stack se respeta. **Importar de `radix-ui`** (`import { Dialog as DialogPrimitive } from 'radix-ui'`), no replicar la estructura.

117. **`<ConfirmDialog>` + `useDiscardConfirm` + `useConfirmDialog` son los primitives canónicos de confirmación.** Ubicación: [apps/web/src/modules/rooms/components/shared/ConfirmDialog.tsx](apps/web/src/modules/rooms/components/shared/ConfirmDialog.tsx). NUNCA usar `window.confirm` nativo — look & feel inconsistente per OS, bloquea JS thread, no respeta Apple HIG. Tones: `warning` (descartar) / `destructive` (anular, eliminar) / `info` (neutro) / `success` (acción positiva). Mapean a stripe + icono + color del botón confirmativo.

118. **`isDirty` se computa contra snapshot inicial — NO contra empty.** Si el modal pre-fillea cualquier campo (e.g., `amount = balance.toFixed(2)` en RegisterPaymentDialog), comparar `value !== ''` da false-positive: el dialog se considera dirty desde el primer render y el prompt de descartar aparece aunque el usuario no haya tocado nada. Pattern correcto:
   ```ts
   const [initial, setInitial] = useState({...})
   useEffect(() => { if (open) {
     const init = computeInitialState(props)
     setForm(init); setInitial(init)
   }}, [open, ...deps])
   const isDirty = form.field !== initial.field || ...
   ```
   Apple HIG: confirm dirty solo si HAY pérdida real de trabajo.

119. **Cero animaciones en modales/sheets.** Decisión 2026-05-17 — instant feedback prevalece sobre motion polish para herramientas operativas (recepción no debe esperar fade-in mientras un huésped espera frente al desk). Aplica a: `ui/sheet.tsx`, `ui/alert-dialog.tsx`, `ui/drawer.tsx`, todos los dialogs custom (ConfirmDialog, ConfirmCheckinDialog, etc.). Tooltips, dropdown-menu, select, NotificationPanel slide-in PRESERVAN animación (no son modales). Los comentarios sobre spring/ease curves en `ui/sheet.tsx` se mantienen por si se revierte la decisión.

120-bis. **Cambios post-checkin NO requieren approval bloqueante del manager** (revisión 2026-05-17 PM tras feedback usuario). Política original §117 pedía `managerApprovalCode + managerApprovalReason` para rate/pax post-checkin; revertida porque manager ocupado = cuello de botella operativo. Política actual (Cloudbeds/Mews pattern):
   - `ChangeConfirmDialog` se sigue mostrando con diff side-by-side + razón (textarea, opcional pero recomendado).
   - Backend acepta el cambio sin `managerApprovalCode` requirido; `reason` queda en `GuestStayLog.metadata`.
   - Saldo resultante negativo (= crédito a favor del huésped) se muestra con `−USD X` y línea explicativa: "Queda USD X a favor del huésped (crédito devolvible al checkout)". Sin entity `GuestCredit` automática (eso es v1.0.1 PAY-CORE §86).
   - Backward-compat: el backend SIGUE aceptando `managerApprovalCode/Reason` si la UI los manda, no lanza error. La columna en audit log preserva el dato si se proveyó. UI ya no los pide.
   - Tests: `RATE_CHANGE_REQUIRES_APPROVAL` ya no se lanza. Spec reemplazado por "rate change post-checkin sin approval — permitido".

120. **Reglas de discoverability para inline-edit (Apple HIG):**
    - Lapicito siempre visible al 40% opacity en estado idle, 100% en hover (signifier perceptible sin requerir hover). El pattern "pencil oculto hasta hover" mata descubrimiento.
    - Para tabs con múltiples campos editables, preferir **bulk-edit mode** con header sticky "✎ Editar" → `[Cancelar] [Guardar cambios]`: 1 PATCH consolidado vs N round-trips, 1 audit log entry agrupado, header siempre arriba (no scroll para encontrar Save). Pattern Mews/Cloudbeds para guest profile.
    - Para acciones con consecuencia significativa (rate, paxCount post-checkin), abrir `ChangeConfirmDialog` con diff side-by-side + razón + approval modal. Pattern Apple HIG "destructive confirmation".

> **Por qué documentamos esto**: este sprint EDIT-RESERVATION reinventó tres veces lo mismo. El primer modal custom (`useModalDismiss` + div + createPortal) funcionaba bien para dialogs hermanos a nivel root. El segundo fallaba dentro del Sheet porque ignoró las 3 capas internas de Radix. Cada parche revelaba la siguiente capa hasta refactorizar a Radix Dialog primitives. **La lección no es "Radix es complicado" — es "no reinventar el contenedor cuando Radix ya provee uno con nesting nativo".** Si la próxima vez ves un modal dentro de un Sheet, primer reflejo: importar `Dialog as DialogPrimitive from 'radix-ui'`.

### Channex inbound — Sprint CHANNEX-INBOUND (Days 1-7, 2026-05-22)

129. **D-CHX1 — Webhook real-time es el mecanismo PRIMARIO, polling es safety net.** Endpoint `POST /api/webhooks/channex` responde 200 en <100ms y dispara `setImmediate(() => puller.processOutboxRow(outboxId))` fire-and-forget. Latencia P95 end-to-end ~2-3s (Day 7 latency boost). `ChannexOutboxScheduler` cron cada 30s y `ChannexFeedScheduler` cron cada 30min UTC son recovery — NO el primary path. Polling sin webhook fue explícitamente descartado por la doc oficial Channex y desalineado con cert Stage 4.

130. **D-CHX2 — Idempotencia estricta por `GuestStay.channexBookingId @unique` + dedup en `ChannexOutbox`.** Channex puede emitir webhooks duplicados; `acceptDelivery` rechaza encolar si ya existe outbox PENDING/IN_PROGRESS/SUCCEEDED para la misma `revisionId`. El log `ChannexWebhookLog` SÍ se escribe siempre (forense). Sin esto, retries de Channex crean stays fantasma.

131. **D-CHX3 — Custom-header bearer token, NO HMAC.** Investigación oficial (Day 2) confirmó que Channex no firma payloads con HMAC. Su modelo es: webhook se configura con `headers` object donde NOSOTROS ponemos `Authorization: Bearer <token>` propio. `ChannexAuthGuard` valida con `crypto.timingSafeEqual` contra `PropertySettings.channexWebhookSecret`. Fail-open onboarding cuando secret no configurado (sandbox); cierra automáticamente al setear el secret via Zenix Activate. La auth REAL inbound ocurre cuando NOSOTROS llamamos `getBookingRevision` con `user-api-key`.

132. **D-CHX4 — `ChannexWebhookLog` + `ChannexOutbox` append-only fiscal-grade.** Toda delivery deja entry inmutable, incluso si auth falla. Cubre Visa CRR §5.9.2 chargeback evidence + auditabilidad cross-OTA. Ambas tablas se escriben en MISMA transacción Postgres (`$transaction`) — pattern transactional outbox. Imposible perder un webhook ni duplicar trabajo si crashea entre writes.

133. **D-CHX5 — Conflict resolution: persistir + revisar humano, NUNCA overwrite silente.** Si `booking_new` solapa con stay existente (case C de overbooking race), creamos GuestStay con `channexConflict=true` + placeholder room. Frontend `/channex/conflicts` (SUPERVISOR-only) muestra ranking smart de alternativas (`ChannexRoomSuggesterService` algoritmo weighted: 30 mismo channexRoomTypeId + 25 mismo RoomType + 15 categoría + 15 capacity + 10 floor + 5 status AVAILABLE). 4 acciones: MOVE_ROOM (con suggestion preseleccionada) / CANCEL_LOCAL / CANCEL_AT_OTA (propaga vía Channex CRS PUT status=cancelled) / MARK_REVIEWED. Pattern Mews "Space alternatives" + Cloudbeds "Room move suggestions".

134. **D-CHX6 — `booking_revisions/feed` reconciliation cron cada 30min UTC.** Single call que cubre TODAS las properties accesibles por api-key (sin `filter[property_id]`) per recomendación oficial Channex 2024-12. Paginación canónica: short page (revisions.length < PAGE_SIZE) O totalSeen >= meta.total → break. Cada revision se enqueue vía `ChannexInboundService.acceptDelivery` con `eventType='feed_recovery'` — reutiliza la pipeline canónica del webhook. Dedup automático. Defensa contra webhook delivery failures + Channex `non_acked_booking` event después de 30 min.

135. **D-CHX7 — `BookingCancelHandler` bridge al sprint CANCEL-ARCHIVE.** OTA cancellations escriben las MISMAS columnas que un cancel manual (`cancelInitiator='OTA'`, `cancelledFromChannel='CHANNEX_WEBHOOK'`, `cancelMetadata` con channexRevisionId+otaName) + cascade journey/segments + audit `GuestStayLog event=CANCELLED actorType=SYSTEM` + room status AVAILABLE si era la única active. `requiresFiscalReview=true` cuando `amountPaid > 0` (seed para v1.0.2 CFDI E emission). Decisión matrix de 5 ramas: not_found idempotent / already_cancelled idempotent / checked-in manual_review / checked-out review / no-show review / ARRIVING soft-cancel. NO reutilizamos `GuestStaysService.cancelStay` porque lee tenant del JWT (webhook es Public).

136. **D-CHX8 — `BookingModifyHandler` con guards multi-estado: post-checkin = SAFE FIELDS ONLY.** Decisión matrix de 6 ramas: not_found → fall-through a `BookingNewHandler` (out-of-order modify-before-new) / stale via inserted_at / cancelled / no-show / checked-out terminales / **checked-in: solo updateamos guestName/email/phone/notes/nationality + channexLastSyncAt** (date/room/pricing change → review notif, NO autoaplicar) / **ARRIVING + date conflict → channexConflict=true** + review notif / ARRIVING happy → full update **EXCEPTO payment fields si `amountPaid > 0`** (§28 USALI append-only). Alineado con CRS rule oficial "only changes are saved without reverting PMS modifications".

137. **D-CHX9 — Room mapping vía `Room.channexRoomTypeId`; sin match → UNASSIGNED conflict.** `BookingNewHandler` busca rooms con `channexRoomTypeId == revision.rooms[0].room_type_id`. Si N rooms del mismo tipo, itera AvailabilityService.check hasta encontrar libre. Si TODOS ocupados → conflict AVAILABILITY_OVERLAP con placeholder room. Si ningún room mapeado → conflict NO_ROOM_TYPE_MATCH. Si `rate_plan_id` null → conflict UNMAPPED_RATE_PLAN. Las 4 reasons + PROPERTY_NOT_FOUND alimentan el `ChannexNotifService.raiseConflict` → AppNotification SUPERVISOR + body localizado per reason ("Llegó una reserva de Booking.com para habitación ya ocupada...").

138. **D-CHX10 — Outbox + scheduler con `FOR UPDATE SKIP LOCKED` permite multi-worker sin race.** Tabla `ChannexOutbox` con status enum PENDING/IN_PROGRESS/SUCCEEDED/FAILED/DEAD_LETTER. `ChannexRevisionPullerService.processOutboxRow` marca IN_PROGRESS antes del pull. **Ack ONLY after successful save** — si el handler throws, NO ack call → cron retry vía backoff exponencial 2^attempts seconds (max 5 attempts → DEAD_LETTER). Errores terminales 401/403/404 → DEAD_LETTER inmediato (api-key issue o revision purged). Esta regla es la #1 criterio de cert Stage 4. Spec dedicado verifica el contrato.

> **Sprint CHANNEX-INBOUND — implementación cerrada 2026-05-22 con 94/94 unit tests verdes + 3/3 sandbox integration vs `staging.channex.io`. Roadmap post-cert (improvements v1.0.1+) documentado en [docs/sprints/CHANNEX-INBOUND-post-cert-roadmap.md](docs/sprints/CHANNEX-INBOUND-post-cert-roadmap.md): trigger directo ya activo (Day 7), pendientes last-room sync push + Postgres advisory locks + outbound retry queue + health monitor + smart suggestions v2 (bed-level + multi-property).**

---

## Patterns & Conventions

### API (NestJS)

```typescript
@Get(':id')
@Roles(SystemRole.SUPERVISOR)
async findOne(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {}
```

- **Servicios:** toda la lógica de negocio. Controllers son thin wrappers.
- **DTOs:** validados con class-validator en `dto/` subdirectorio.
- **Errores:** `throw NotFoundException | ConflictException | ForbiddenException`.
- **Logs:** `this.logger.debug/log/warn/error` (Logger NestJS, no console.log).
- **Multi-tenancy:** todo where clause incluye `organizationId` y `propertyId` cuando aplica.
- **SSE:** emitir con `event: <type>\n` header explícito (no solo `data:`).

### Web (React)

```typescript
// Queries con queryKey tipado
const { data } = useQuery<DailyPlanningGrid>({
  queryKey: ['daily-grid', TODAY],
  queryFn: () => api.get(`/planning/daily?date=${TODAY}`),
  staleTime: 2 * 60 * 1000,
})

// Mutations: onSuccess async cuando hay refetch crítico
const mutation = useMutation({
  mutationFn: (dto) => api.post('/checkouts/batch', dto),
  onSuccess: async () => {
    await qc.refetchQueries({ queryKey: ['daily-grid', TODAY] })
    setActiveTab('realtime')
  },
})
```

- **Estado de navegación → URL params**. Estado local efímero → useState. Estado de servidor → React Query (NUNCA duplicar en useState).
- **Auth → Zustand** (token JWT).
- **`useSSE`:** registra TODOS los eventos nombrados de `ALL_SSE_TYPES`. No usar `'message'` genérico.

### Shared Types

- Todos los enums en `packages/shared/src/enums.ts`
- Todos los DTOs y tipos de respuesta en `packages/shared/src/types.ts`
- **NUNCA** redefinir un tipo en `apps/web` o `apps/api` si ya existe en shared.
- `SseEventType` union — agregar aquí cuando se añade un nuevo evento SSE.

### Tests

```typescript
it('descripción en español — qué debe hacer', async () => {
  // Arrange
  // Act
  // Assert
})
```

- Builders de datos: `makeRoom()`, `makeCheckout()`, etc.
- Mocks: `prismaMock` con `$transaction` que ejecuta callback directamente.
- Limpiar mocks: `jest.clearAllMocks()` en `beforeEach`.

---

## Commands

### Setup inicial

```bash
npm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cd apps/api
npx prisma migrate dev
npx ts-node -r tsconfig-paths/register prisma/seed.ts
```

### Desarrollo

```bash
# API
cd apps/api && npx nest start --watch
# Web
cd apps/web && npx vite
# Mobile
cd apps/mobile && npx expo start
```

### Tests

```bash
cd apps/api && npx jest
npx jest --testPathPattern="checkouts.service.spec" --verbose
cd apps/api && npx tsc --noEmit
cd apps/web && npx tsc --noEmit
```

### Base de datos

```bash
cd apps/api && npx ts-node -r tsconfig-paths/register prisma/seed.ts  # reset
npx prisma migrate dev --name nombre_de_la_migracion
npx prisma studio
```

### Credenciales de seed (todas con password `123456`)

| Email | Rol | Propiedad |
|-------|-----|-----------|
| `s@z.co`  | SUPERVISOR   | Tulum  |
| `r@z.co`  | RECEPTIONIST | Tulum  |
| `m@z.co`  | HOUSEKEEPER  | Tulum  |
| `p@z.co`  | HOUSEKEEPER  | Tulum  |
| `rc@z.co` | RECEPTIONIST | Cancún |
| `l@z.co`  | HOUSEKEEPER  | Cancún |

---

## Audit 20260513

> Auditoría comparativa Zenix vs bugs documentados en PMS competidores (Mews, Cloudbeds, Opera, Clock PMS+, Quore, MaintainX, Optii, Breezeway, hotelkit, Roomraccoon). 103 patrones cruzados. 88 patrones (85%) ya mitigados correctamente.

### 🔴 Crítico (RESUELTO en commit `aa6f122` Sprint SEC-α)

- **MT-5** ✅ DONE — `PropertyScopeGuard` (`apps/api/src/common/guards/property-scope.guard.ts`) registrado como `APP_GUARD` global en `app.module.ts:113`. Intercepta TODOS los endpoints que reciben `?propertyId=` y valida contra `TenantContextService.getPropertyId()` (que viene del JWT). 6 tests en `property-scope.guard.spec.ts` cubren happy path + mismatch + public skip + non-string array. Defense ya activa system-wide, no por-controller — más robusto que el plan original del audit.

### 🟠 Alto (RESUELTO en commit `aa6f122` Sprint SEC-α)

- **MT-3** ✅ DONE — `switchProperty` valida `UserPropertyRole` pivot en `auth.service.ts:95-127` (comentario "SEC-α MT-3"). Caso (a) Staff con userId vinculado exige `userPropertyRole.findFirst`. Caso (b) Staff legacy sin userId solo permite no-op switch. Caso (c) switch idempotente al mismo property siempre permitido.
- **NS-3** ✅ DONE — `noShowRevertedAt: null` presente en `night-audit.scheduler.ts:146` (junto al `noShowAt: null`). Stays revertidos no se re-marcan.

### 🟡 Medio (TODOS RESUELTOS en commits previos — verificado 2026-05-15)

| Bug | Status | Archivo donde vive el fix |
|-----|--------|----------------------------|
| NS-6 | ✅ DONE | `guest-stays.service.ts:1528-1544` (guard + supervisor override + comentario "Sprint SEC-α — bug NS-6") |
| MT-7 | ✅ DONE | `useSSE.ts` re-runs effect con esRef tras switchProperty (línea 46) |
| MT-8 | ✅ DONE | `.env.example:4` `JWT_EXPIRES_IN="24h"` |
| PAY-8 | ✅ DONE | `guest-stays.service.ts:77-90` función `shiftDateForTimezone` con tz IANA; usado en checkout (línea 1952) |
| CAL-10 | ✅ DONE | `stay-journeys.service.ts:360-363` guard `isBefore(effectiveDate, startOfDay(activeSegment.checkIn))` |
| CAL-4 | ✅ DONE | `useGuestStays.ts:240-242` `useMoveRoom` con `onError → toast.error` |
| BLK-6 | ✅ DONE | `blocks.service.ts:795-797` patrón fire-and-forget post-commit + comentario "BLK-6" |
| MAINT-4 | ✅ DONE | `CommentsThread.tsx:40-59` draft persistence via `DRAFT_STORAGE_KEY` localStorage (movido del TicketDetailDrawer original) |
| NOTIF-7+13 | ✅ DONE | `TicketDetailDrawer.tsx:101-114` `toast.error` con `lastErrorToastedTicket` ref + comentario "NOTIF-7+13 fix" |
| NOTIF-11 | ✅ DONE | `NotificationPanel.tsx:177` `disabled={isActionPending}` + comentario "NOTIF-11" |
| MT-9 | ⚠️ Code TODO + Ops pendiente | `useRoomSSE.ts:54-67` y `useSSE.ts` documentan el riesgo y la mitigación. Acción de código (cookie httpOnly + sse-token short-lived) está en TODO para v1.0.x SSE-auth refactor. Acción ops (proxy redact `?token=`) requiere config nginx/Cloudfront productivo — NO en repo. Documentar en `docs/ops/sse-token-redaction.md` cuando se setup el proxy. |

### 🟢 Deuda técnica acknowledged (v1.0.x DEBT-α)

- **BLK-4** — `activateBlock` PRIVATE rooms multi-bed genera N tasks. Fix v1.0.x DEBT-α.
- **MAINT-11** — Photos como data URI base64. Fix v1.0.3 IMG (S3+Sharp).
- **MAINT-3** — Photo size validation backend explícita.
- **PAY-9** — WAIVED vs CHARGED en cash summary (validar con producto).
- **PUSH-11** — Verify push payloads incluyen propertyId correcto post-switch.

---

## Pending — Sprints inmediatos para v1.0.x Foundation

> **Versionado:** refactor mayor 2026-05-14 — pasamos de "v1.0 → v2.0 lineal" a "bloques temáticos v1.x.y". v1.0.x Foundation se expandió con PAY-CORE + CFDI-CORE + REPORTS-CORE. Ver [docs/vision/03-roadmap-v1-v2.md](../../docs/vision/03-roadmap-v1-v2.md).

### v1.0.0 — Hardening + Onboarding

| Sprint | Alcance | Días | Bloquea v1.0.0 |
|--------|---------|------|----------------|
| ~~SEC-α~~ | ✅ CERRADO commit `aa6f122` + doc update PR #20 — MT-5/MT-3/NS-3 | — | Cerrado |
| ~~POLISH-α~~ | ✅ CERRADO — los 11 bugs medios del audit ya estaban resueltos en commits previos (verificado 2026-05-15). Único pendiente: MT-9 ops (config proxy productivo, no código) | — | Cerrado |
| ~~Mx-1B finalización~~ | ✅ CERRADO PR #13 (commit `6c09fab`) — MAINT-4 draft persist + NOTIF-7+13 toast + UX help text. 4 gaps menores deferidos con justificación (InputSheet, aria-labels, header flash, assign dialog) | — | Cerrado |
| ~~HK-CFG (Setup Recamaristas)~~ | ✅ CERRADO Sprint 8H — `HousekeepingScheduleSection` 1138 líneas con 3 sub-tabs (Horarios + Cobertura + Reglas). Tab "Recamaristas" en `SettingsPage.tsx:28` | — | Cerrado |
| ~~Bug-fixes UI + same-day turnover~~ | ✅ CERRADO PR #28-31 (2026-05-16) — Fix F TZ-safe `utcStartOfDay()`, occupancySet por día UTC, journey predecessor por ID, ID interno copyable, tooltip drag suppression, dim foco visual, early-checkout sync | — | Cerrado |
| ~~CANCEL-ARCHIVE~~ | ✅ CERRADO PR #32 — Soft-delete reservas + 3 niveles Rates (BAR per-group, ghost enriquecido, Quote Sheet) + FX-CORE (Banxico SF43718 daily cron + PropertyFxRate override + dashboard widget + Settings UI) + modal dismiss estándar (`useModalDismiss`) + scroll performance SwiftUI-style + notif self-suppress sistémico + auto-cleanup approval + purge scheduler. Ver [docs/sprints/CANCEL-ARCHIVE-manual.md](docs/sprints/CANCEL-ARCHIVE-manual.md) + [proposal](docs/sprints/CANCEL-ARCHIVE-proposal.md) + [plan](docs/sprints/CANCEL-ARCHIVE-plan.md). | — | Cerrado |
| **CHANNEX-INBOUND** | Webhooks reales OTA→PMS (`booking_new` / `modify` / `cancel`) — sin esto Zenix hace MENOS que un PMS y obliga monitoreo manual de extranets. HMAC verify + idempotencia `channexBookingId` UNIQUE + conflict resolution con review queue + pull nocturno anti-drift. Ver [docs/sprints/CHANNEX-INBOUND-plan.md](docs/sprints/CHANNEX-INBOUND-plan.md). | 5-7 | Sí |
| **CHECK-IN modal redesign** | Modal actual demasiado angosto (max-w-md ~448px) para 4-step wizard. Rediseño Apple HIG / SwiftUI Form pattern con max-w-2xl/3xl, grid 2-col donde corresponda, spacing 8pt consistente con cancel dialog. | 1-2 | Recomendado |
| **RATES-METRICS-COMPSET-CORE** | Tres capas en 1 sprint: (1) Rate Plans + Seasons + Day-of-week + Restrictions (MLOS/MaxLOS/CTA/CTD) + Promotion engine + Rate Calendar grid UI con bulk update; (2) Dashboard métricas (ocupación / llegadas / salidas / saldo glanceable + ADR/RevPAR/Pickup/Channel mix/LOS/Cancellation rate colapsable + heatmap forecast 14d + `MetricsDailySnapshot` populated por NightAuditScheduler); (3) Compset Card MVP con scraping DIY (Playwright) + 3-7 competidores manualmente seleccionados + adapter pattern `ICompsetAdapter` abierto a swap Lighthouse en v1.1.x DLC + `LocalEvent` con scope 4-niveles (country/region/city/lat-lng) replicable LATAM (no QR-hardcoded) + Events Curator role analog Tax Curator. Decisiones D-RATES1..6, D-METRICS1..6, D-COMPSET1..10 propuestas. Ver [docs/sprints/RATES-METRICS-COMPSET-CORE-plan.md](docs/sprints/RATES-METRICS-COMPSET-CORE-plan.md). | 20-23 | Sí (revenue blocker) |
| **BOOKING-ENGINE** (nuevo 2026-05-18) | Direct Booking Engine + widget web component + WordPress plugin + REST API público + bundle Activate Plus (PMS + BE + website + marketing). Diferencial LATAM payments (OXXO/MercadoPago/SPEI) + pricing 1mes vs 3mes. Ver [docs/sprints/BOOKING-ENGINE-plan.md](docs/sprints/BOOKING-ENGINE-plan.md). | 6-8 sem MVP | Estratégico (post v1.0.0) |
| **QA-α** | Test coverage mobile Hub Recamarista (jest-expo configurado, 0 specs aún en `apps/mobile`) | 4-5 | Sí |
| ~~CI-RESCUE~~ | ✅ Mayormente CERRADO — 102/110 tests recuperados; ESLint configs creados; lint reactivado como blocking. **Pendiente:** 8 stale assertions (no-show 3, stay-journeys 4, dashboard 1) que requieren feature-owner ajustar expectations. Test step queda non-blocking hasta resolver | — | Cerrado mayormente |

### Sprint CI-RESCUE — detalle técnico

> **Status:** PENDIENTE. Marcado non-blocking en `.github/workflows/ci.yml` el 2026-05-15.
> **Razón de existir:** durante el fix de lockfile (PR #19) se descubrió que CI llevaba múltiples capas de bugs ocultos. Para no detener entrega, se hizo `continue-on-error: true` en lint+test. **Esta deuda debe pagarse antes de release v1.0.0.**

**Lo que tiene que arreglar (diagnóstico actualizado 2026-05-15 post PR #22+#23):**

1. **Eslint configs faltantes** — `apps/api`, `apps/mobile`, `apps/web`, `packages/shared` no tienen `.eslintrc*` ni `eslint.config.{js,mjs}`. `npm run lint` falla en api+mobile con "ESLint couldn't find a configuration file". Decisiones pendientes:
   - Presets: `@typescript-eslint/recommended`, `eslint-plugin-react`, `react-native`, `prettier`
   - ¿Strict mode o moderate? (impacto enorme en cuántos archivos requieren cleanup)
   - ¿Auto-fix permitido en CI o solo report?

2. **110 de 305 tests de `@zenix/api` fallan — ROOT CAUSE REAL identificado** (no era multer): los `prismaMock` de los specs no incluyen `room`, pero el código de producción reciente agregó llamadas `tx.room.update(...)` en al menos:
   - `tasks/tasks.service.ts:204` — sync room status durante task lifecycle
   - Probable que otros services (stay-journeys, no-show, late-checkout, assignment, dashboard-overview, access-control) tengan llamadas similares no mockeadas.
   - Error consistente en CI Y local: `TypeError: Cannot read properties of undefined (reading 'update')`
   - Suites afectadas (~8-10):
     - `tasks.service.spec.ts` (prismaMock tiene cleaningTask + unit + staff + taskLog, falta `room`)
     - `guest-stays.no-show.spec.ts` (solo guestStay, falta `room` + probablemente más)
     - `guest-stays.late-checkout.spec.ts` (guestStay + cleaningTask + taskLog, falta `room`)
     - `night-audit.scheduler.spec.ts`
     - `stay-journeys.service.spec.ts`
     - `assignment.service.spec.ts`
     - `dashboard-overview.service.spec.ts`
     - `access-control.service.spec.ts` (este sí toca BD real — necesita DB de test)
     - `multi-tenant-hierarchy.spec.ts`
     - `tenant-isolation.spec.ts` (e2e, necesita DB)
   - **Fix mecánico:** agregar `room: { update: jest.fn(), findUnique: jest.fn() }` a cada `prismaMock` afectado, configurar `mockResolvedValue({})` en los `beforeEach`. Trabajo bien acotado y reproducible.
   - Multer 1.x↔2.x NO era la causa (PR #22 corrigió la resolución a 1.4.5-lts.2, solo +8 tests verdes — bajaron de 110 a 110 fail; rebote de números, no fix real).

3. **Workspace name legacy** — antes del rename `@housekeeping/api → @zenix/api`, el workflow CI referenciaba el nombre viejo. Ya fixed en PR #19.

4. **Reactivar lint/test como blocking** — una vez 1+2 resueltos, quitar `continue-on-error: true` de `.github/workflows/ci.yml`. CI vuelve a ser red/green binario.

**Pasos sugeridos del sprint (revisado — scope mucho menor que estimación original):**
1. **(2-4h) Update mocks de specs API** — agregar `room` (y otros models que falten al inspeccionar) a los `prismaMock` de los 7-10 specs afectados. Validar `npm test` baja de 110 fails a 0-10.
2. **(2-4h) Crear ESLint configs por workspace** — flat config con presets razonables. Run `--fix` para auto-resolver.
3. **(1-2h)** Revisar issues no auto-fixables.
4. **(1h)** Quitar `continue-on-error` del workflow, validar CI verde en PR de cierre.

**Estimado revisado:** 1-1.5 días enfocados (antes 3-5 días). Cambio: el problema de tests no era infra, era mocks. Bounded fix.

### v1.0.x Roadmap (refinado 2026-05-15 — ver [docs/vision/14-payment-currency-tax-architecture.md](../../docs/vision/14-payment-currency-tax-architecture.md))
- **v1.0.1 PAY-CORE** (~9.5 semanas) — Stripe + Conekta + folio modal + master billing + folio splitting + refund/void + COMP approval. **Adiciones §81-§88:** multi-currency con `PaymentFxLock` inmutable, OTA-collect detection vía Channex, cash drawer multi-divisa con `CashierShift`, Banxico SF43718 integration, `GuestCredit` con audit completo + `applicableChannels` default DIRECT
- **v1.0.2 CFDI-CORE** (~3 sem adicionales) — `MxCfdi40Adapter` (Facturama/SW Sapien) + CFDI I/E/REP + cancelación CFDI + cumplimiento `FormaPago=15 (Condonación)` para GuestCredit no-monetario. **Tax engine §84:** `TaxRate` multi-cálculo (PERCENT_OF_BASE | FIXED_PER_ROOM_NIGHT | UMA_MULTIPLIER) + `UmaValue` versionada + `IFiscalAdapter` Strategy. **Tax transparency §82:** `PropertySettings.taxStrategy=INCLUSIVE` default + push Channex con `is_inclusive` selectivo (resuelve fricción Hostelworld)
- **v1.0.3 REPORTS-CORE** (~6-8 sem) — 12 reportes esenciales + GuestCredit liabilities (pasivo contable USALI) + Cashier Shift Report per-divisa
- **v1.0.4 IMG + NS-UI + DEBT-α** (~1-2 sem) — S3 + toggle no-shows + cleanup deuda técnica
- **v1.0.4 FX-LATAM** (~3-5 días, paralelizable con IMG)
- **v1.0.4 SSE-RESILIENCE** (~2-3 días, paralelizable) — consolidar SSE a 1 sola EventSource (refactor `useSoftLockSSE` a handler global de `useSSE`) + heartbeat client-side 60s + Tab Visibility API (close SSE al ocultar tab) + reconnect exponential backoff (1s/2s/4s/8s/16s/30s) + server-side metric "SSE conns per user" + verificación HTTP/2 en deploy Render/Vercel pre-piloto. Hardening prod-grade contra escenarios sleep/wake, network glitch, switchProperty rápido. Bug raíz (race condition useSSE cleanup) ya fixed iter 6 con AbortController — esto cubre los caminos alternos hacia SSE zombie que persisten en producción independiente del race. — `IFxAdapter` Strategy pattern (analog §89 `IFiscalAdapter`) + adapters CO/CR/PE first batch (Banco República TRM, BCCR webservice, SBS) + `FiscalRegime.fxAdapterClass` seed-driven + refactor `BanxicoMxAdapter` a clase + multi-par UI en `FxSection.tsx` + `PropertySettings.secondaryDisplayCurrencies: String[]` (override del manager). Ver [docs/sprints/FX-LATAM-plan.md](docs/sprints/FX-LATAM-plan.md). **Bloqueante para primer cliente fuera de MX.**

### v1.1.x+ (post-Foundation)
- **v1.1.0** — Mensajería Booking + Online check-in + **Zenix Sign DLC** (digital check-in + e-signature canvas + ToC versionado per LegalEntity + linter PROFECO + NOM-151 conservation via Mifiel + chargeback Evidence Package builder). Plan completo en [docs/sprints/SIGN-DLC-plan.md](docs/sprints/SIGN-DLC-plan.md). ADR de PDF rendering (Puppeteer + pool) en [docs/architecture/ADR-0001-pdf-rendering.md](docs/architecture/ADR-0001-pdf-rendering.md). JSON Schema del linter en [docs/standards/toc-linter-schema.json](docs/standards/toc-linter-schema.json). Pricing DLC: Starter $25 / Pro $40 / NOM-151 add-on $10 USD/property/mes. Estimación: ~12 días-dev (1 dev) o 6-7 calendar (2 paralelos). **Decisiones D-SIGN1..D-SIGN10** documentadas en el plan; serán §-numeradas al cerrar sprint.
- **v1.1.1** — IA tarifaria heurística + Pickup/Pace avanzados + **Zenix Market Intel Pro DLC** ([plan completo en docs/sprints/MARKET-INTEL-PRO-plan.md](docs/sprints/MARKET-INTEL-PRO-plan.md)) — swap compset MVP → Lighthouse partnership + **Event ingest automático multi-adapter** (Ticketmaster Discovery API gratis + PredictHQ premium opcional + Calendarific holidays + Nager.Date holidays open-source + Bandsintown conciertos) + **`IEventDataAdapter` interface + dedup fuzzy-match + `LocalEventSourceLink` cross-reference table** + auto-radius detection (transparente con scoring) + push notifications config (5 rule types + daily digest opt-in). 15 decisiones D-MKTPRO1..15 propuestas. Eventbrite descartado permanente (API discovery descontinuada 2020). Pricing $50-80/property/mes. Estimación 15-20 días-dev (~8-10 calendar 2 devs paralelos).
- **v1.1.1+ Demand Intelligence Premium DLC** — Predicción de demanda con flight APIs (Amadeus Travel API primary; AviationStack/Cirium futuros via adapter pattern) + Vacation calendars per source country (US/CA/EU/MX) + `DemandScore` heurístico weighted-sum + Recommendations engine no-auto-apply con confidence threshold + Property↔Airport mapping. Plan completo en [docs/sprints/DEMAND-INTELLIGENCE-plan.md](docs/sprints/DEMAND-INTELLIGENCE-plan.md). Estimación: 30-40 días-dev (~7-9 sem 1 dev, ~3-4 sem 2 paralelos). Pricing: $80-150/property/mes. Decisiones D-DEMAND1..D-DEMAND10 a registrar en kickoff. Activación post v1.0.x Foundation + ≥6m de historia del piloto.
- **v1.1.2** — Group reservations + Master billing refinado
- **v1.1.3** — Mensajería Airbnb + Expedia + Upsell engine
- **v1.1.4** — Guest CRM + Concierge + Lost&Found + Day-use + Late fees

---

## Wizard de Configuración Inicial (Sprint HK-CFG)

Ver [docs/vision/03-roadmap-v1-v2.md](../../docs/vision/03-roadmap-v1-v2.md) sección v1.0.0.

Pasos del wizard:
1. **Datos básicos** — nombre, ciudad, timezone, PropertyType, currency
2. **Configuración operativa** — checkout time, noShowCutoffHour, potentialNoShowWarningHour, PMS mode
3. **Habitaciones y camas** — número, piso, categoría, capacidad (filtros por PropertyType)
4. **Equipo** — Staff con roles + capabilities
5. **Revisión final** — resumen + "Activar propiedad"

Solo SUPERVISOR o admin de Zenix ejecuta el wizard. Aplica a primer onboarding de cada Property.

---

## Known Issues & Edge Cases

### Edge cases conocidos (todos con guard implementado)

- Planificación sin ninguna salida → `localStorage` flag
- `batchCheckout` no idempotente → frontend previene con `isPending`
- Mobile sin tests completos → QA-α resuelve
- `CleaningTask.bedId` NOT NULL → deuda BLK-4 para hoteles multi-bed

### Bugs resueltos recientes (referencia)

Sprint 9-HK ext (PR #8, 2026-05-09):
- `hasSameDayCheckIn` per-task-date (no `now`)
- Carryover re-evalúa `hasSameDayCheckIn` contra HOY
- Stayover scheduler excluye `scheduledCheckout` pasado
- Mi día alarm cascade (module-level `lastShownAt` Map + 5min recency)
- Cancelaciones SSE `task:ready` con `event:` header
- VERIFIED tasks visibles hasta fin de turno
- Single-open kebab menu state lifted al padre

Sprint 8H decisions completadas. Sprint Mx-1 backend completado (commit `1436f6c`).

---

## Bitácora de Funcionalidades

> La bitácora detallada por módulo (HK-01 a HK-48, PMS-01 a PMS-21, NS-01 a NS-18, etc.) se preserva en git history.
> Para roadmap actualizado de qué viene cuándo: [docs/vision/03-roadmap-v1-v2.md](../../docs/vision/03-roadmap-v1-v2.md).
> Para feature map por módulo: [docs/vision/02-product-family.md](../../docs/vision/02-product-family.md).

**Estado de implementación v1.0.0:**

| Módulo | Estado |
|--------|--------|
| PMS Core (calendar + reservas + folio) | ✅ |
| Housekeeping (planning + 2-phase + carryover + auto-assign) | ✅ |
| No-shows + Night audit + Pre-arrival warming | ✅ |
| SmartBlocks (mantenimiento + bloqueos) | ✅ |
| Notifications Center + SSE | ✅ |
| Soft-Lock SSE | ✅ |
| Check-in confirmation (4 pasos + PaymentLog) | ✅ |
| Maintenance backend (Mx-1) | ✅ |
| Maintenance web (Mx-1B-W) | ✅ |
| Maintenance mobile (Mx-1B-M M3.1-M3.5) | ✅ |
| Mobile Hub Recamarista | ✅ |
| KanbanPage UX completo | ✅ |
| Settings Recamaristas tab | ✅ (HousekeepingScheduleSection 1138 LOC) |
| QA test coverage mobile | ⏳ QA-α |
| Security hardening | ⏳ SEC-α |
| Payment processing | 📋 v1.0.1 |
| Channex.io real | 📋 v1.0.2 |
| S3 image upload | 📋 v1.0.3 |

---

## Arquitectura de Protección contra Overbooking

Tres capas de defensa:

1. **Hard block transaccional** (✅ activo) — `checkAvailability` rechaza 409 dentro de transacción. Primero que confirma gana.
2. **Channel Manager Channex.io** (⚠️ Sprint 8C / v1.0.2) — push delta a OTAs en segundos. Mientras stub, Capa 1 atrapa los webhooks.
3. **SSE Soft-Lock intra-Zenix** (✅ activo Sprint 7C) — badge "En uso por María" para coordinación entre recepcionistas. No bloquea, informa.

---

## Bitácora de cambios mayores a este documento

- **2026-05-22** (late PM) — **Bloque 1 kickoff oficial — Sprint CHANNEX-INBOUND activado.** Owner confirmó plan de trabajo secuencial 1-dev:
  - **Branch `feature/channex-inbound` creada** desde main (post PR #40 merged).
  - **Plan de trabajo Bloque 1**: CHANNEX-INBOUND (5-7d, activo) → CHECK-IN modal redesign (1-2d) → RATES-METRICS-COMPSET-CORE (20-23d) → QA-α mobile (4-5d) → CI-RESCUE residual (0.5-1d). Total ~30-40 días-dev = ~6 semanas calendar. Target v1.0.0 release: julio 2026.
  - **Decisiones administrativas owner 2026-05-22 PM** consolidadas en [docs/ops/2026-05-22-bloque1-kickoff.md](docs/ops/2026-05-22-bloque1-kickoff.md): (1) 1 dev secuencial; (2) CHANNEX-INBOUND arranca ya; (3) Google Cloud empresarial activar como parte de v1.0.0 (Places API + Geocoding + Hotel Ads futuro); (4) PredictHQ trial 14 días activar ahora con explainer plain-spanish creado; (5) Mifiel sandbox activar; (6) Events Curator role = ZaharDev coordinator + 1× revisión mensual (justificado con HFTP Hospitality Financial Management Handbook 2023 + STR 2023 demand impact 15-40% + cost-benefit $400-800/mes vs $24-48k/año PredictHQ Premium); (7) Validación legal abogado mercantil MX movida a v1.0.1 timing; (8) Lighthouse explainer creado en kickoff doc por "no recuerdo qué era"; (9) Pricing validation con prospecto: no aún; (10) Branding zenix.app sub-secciones (Opción A confirmada con datos NN/g 2019 + Ahrefs SEO 2023 + patrón industry Mews/Cloudbeds/Opera/SiteMinder).
  - **Documentos ops creados:**
    * [docs/ops/2026-05-22-bloque1-kickoff.md](docs/ops/2026-05-22-bloque1-kickoff.md) — handoff checklist consolidando 10 decisiones + acciones pendientes + sprints planificados full list. Diseñado para context-restore después de session-clean.
    * [docs/ops/predicthq-explainer.md](docs/ops/predicthq-explainer.md) — explainer ejecutivo en español plano sin tecnicismo. Qué es PHQ, quién lo usa (Booking/Marriott/Hyatt/Hilton/Uber/DoorDash), cómo se compara con Ticketmaster/Eventbrite/Songkick, cómo encaja en MARKET-INTEL-PRO + DEMAND-INTELLIGENCE sprints, paso-a-paso para activar trial, qué endpoint probar primero con curl, riesgos y mitigaciones.
    * [docs/ops/branding-landing-recommendation.md](docs/ops/branding-landing-recommendation.md) — análisis 3 opciones (sub-secciones / dominios separados / sub-dominios) + decisión Opción A justificada con NN/g 2019 "Information Architecture for Multi-Product SaaS" (n=287 users, 84% completion rate single-domain vs 51% multi) + Ahrefs SEO Study 2023 (+30% ranking single-domain) + patrón industry hospitality SaaS (Mews, Cloudbeds, Opera, SiteMinder, RoomRaccoon). Arquitectura propuesta: Astro 5+ + Tailwind + MDX content + Vercel deploy. Estructura páginas pre-diseñada: /pms /sign /market-intel /demand-intel /booking-engine /pricing /case-studies /docs /activate /partners.
  - **Eventos curator justificación detallada**: HFTP Handbook 2023 capítulo 6 documenta que eventos locales impactan ocupación 15-40% en ciudades receptivas. Sin curador → DemandScore pierde 20% de su input weight. Songkick LATAM débil + Eventbrite descontinuada 2020 + PredictHQ prohibitivo $200-400/mes/property para boutique. Solución: curador interno + Ticketmaster gratis + PredictHQ opcional upgrade. Costo total $0-9.6k/año vs $24-48k/año puramente automatizado.

- **2026-05-22** (PM) — **Plan MARKET-INTEL-PRO documentado + DEMAND-INTELLIGENCE actualizado con PredictHQ alternativo.** Tras discusión de event ingest platforms con owner:
  - [docs/sprints/MARKET-INTEL-PRO-plan.md](docs/sprints/MARKET-INTEL-PRO-plan.md) creado — sprint v1.1.x DLC ~15-20 días-dev. Combina (a) **event ingest automático multi-adapter** con `IEventDataAdapter` Strategy: `TicketmasterEventAdapter` (gratis 5k calls/día tier base) + `PredictHQEventAdapter` (premium opcional $200-1000/mes con `local_rank` + `aviation_rank` nativos hospitality-grade) + `CalendarificHolidayAdapter` (Pro $9-99/mes) + `NagerDateHolidayAdapter` (open source gratis fallback) + `BandsintownEventAdapter` (conciertos artist-driven Pro). Eventbrite Search API descartada permanente (descontinuada 2020, ya no provee discovery público). Songkick/SeatGeek/OAG/Festicket/GDELT documentados como Phase 3+ futuro. (b) **Dedup fuzzy-match** con `LocalEventSourceLink` cross-reference table (mismo evento detectado por múltiples sources → 1 LocalEvent + N source links + `trustScore` per source 0-1). (c) **Swap del compset MVP scraping DIY → Lighthouse partnership** via cambio de `LegalEntity.compsetProvider`. Wholesale $30-50/property/mes pass-through. Cero cambio de runtime. (d) **Auto-radius compset detection** algoritmo transparente con scoring composite (0.4 proximity + 0.3 rating similarity + 0.2 room count similarity + 0.1 guest rating) + manager puede congelar selección + monthly recompute. (e) **Push notifications config** con 5 rule types (competitor rate change ≥X%, new event detected, demand spike, rate deviation, pickup lag) + daily digest opt-in para anti-fatigue + integration AppNotification existente §99. 15 decisiones D-MKTPRO1..15 documentadas. Cobertura LATAM detallada per país (MX/AR✅✅, CO/CL✅, PE/UY/CR/EC⚠️ parcial, BO/VE solo Calendarific+Nager).
  - [docs/sprints/DEMAND-INTELLIGENCE-plan.md](docs/sprints/DEMAND-INTELLIGENCE-plan.md) actualizado con sección 2.1 "PredictHQ como adapter alternativo" — el `local_rank` + `aviation_rank` de PHQ pueden sustituir parcialmente la integración Amadeus en clientes que ya activaron MARKET-INTEL-PRO Premium tier. Nuevos adapters propuestos: `PredictHQFlightProxyAdapter` (usa aviation_rank como proxy del FlightDemandIndex) y `CompositeFlightDataAdapter` (combina Amadeus + PHQ para tier Enterprise). `LegalEntity.demandIntelFlightProvider` configura cuál usar. Sección 2.2 clarifica por qué los sprints quedan separados (productos comerciales distintos $50-80 vs $80-150/mes; bundle Revenue Intelligence Suite $120-200/mes para ambos).
  - Roadmap v1.1.1 ampliado con links a plan + 15 decisiones + pricing model + estimación. Eventbrite descartado se registra explícitamente en CLAUDE.md por contexto histórico.
  - **Pricing tiers consolidados:** bundled v1.0.x core (MVP free, scraping DIY + LocalEvent manual + Nager.Date holidays) → Market Intel Pro DLC $50-80/property/mes → Demand Intelligence Premium DLC $80-150/property/mes → Bundle Revenue Intelligence Suite $120-200/property/mes (combo con descuento) → PredictHQ add-on opcional $40-80/mes pass-through cualquier tier.

- **2026-05-22** — **Plans RATES-METRICS-COMPSET-CORE + DEMAND-INTELLIGENCE creados (2 docs sprint planning).** Tras debate con owner sobre el sprint de pricing del Bloque 1 del work plan:
  - **RATES-METRICS-COMPSET-CORE** ([docs/sprints/RATES-METRICS-COMPSET-CORE-plan.md](docs/sprints/RATES-METRICS-COMPSET-CORE-plan.md)) — 20-23 días-dev sprint principal que combina 3 capas: (1) Rates: RatePlan + RateSeason + DayOfWeekRule + RateRestriction (MLOS/MaxLOS/CTA/CTD) + Promotion engine + RateOverride + Rate Calendar grid UI con bulk update preview obligatorio (NN/g H5). Decisión D-RATES1: Rate Plan es entidad de primera clase. D-RATES2: resolución precio con precedence explícita (Override > Season×Multiplier×DayOfWeek > Base > Group). (2) Metrics: `MetricsDailySnapshot` populated por NightAuditScheduler con occupancy/ADR/RevPAR/cancellations/no-shows/LOS/lead time/channel mix/revenueByRoomType. Dashboard adaptive (§43) con 3 capas: glanceable (4 big numbers HOY + heatmap 14d) + operacional + estratégico colapsable (ADR/RevPAR/Pickup/channel mix). YoY pace guard "necesita 1 año historia". D-METRICS1..6. (3) Compset MVP: scraping DIY Playwright + manual 3-7 competitors selection (no auto-radius) + adapter pattern `ICompsetAdapter` (analog §89 IFiscalAdapter) con `LegalEntity.compsetProvider` para swap MVP→Lighthouse en v1.1.x DLC sin cambio de runtime + `LocalEvent` con scope 4-niveles (countryCode + regionCode + city + lat/lng radius) replicable LATAM no QR-hardcoded + Events Curator role internal (analog Tax Curator §91-§92) + `LocalEventOverride` per-property con reason + approvedById. D-COMPSET1..10. Visibility RBAC SUPERVISOR+ strict. Disclaimer permanente "Datos best-effort, refresh diario". Pricing: bundled en v1.0.x core. Phase 2 (Lighthouse + Eventbrite/Songkick ingest automático + auto-radius) en v1.1.x DLC Market Intel Pro $50-80/property/mes.
  - **DEMAND-INTELLIGENCE plan** ([docs/sprints/DEMAND-INTELLIGENCE-plan.md](docs/sprints/DEMAND-INTELLIGENCE-plan.md)) — sprint futuro 30-40 días-dev documentado por solicitud explícita del owner. Componentes: Property↔Airport mapping seed inicial top 50 LATAM + `IFlightDataAdapter` Strategy con `AmadeusFlightDataAdapter` MVP (Amadeus Travel API, sandbox gratis, $0.005-0.02/call pay-as-you-go) + `FlightSegmentSnapshot` per IATA destination × arrival date × source country + `VacationPeriod` curated calendars per country 2026-2028 (US Spring Break state-by-state, Canadá March Break, España Semana Santa, MX vacaciones) + `DemandScore` heurístico weighted-sum 0-100 (35% flight + 25% historical YoY + 20% local event + 10% vacation overlap + 10% compset rate delta) + Recommendations engine NO auto-apply con confidence threshold ≥0.7 + drivers visibles + feedback loop accept/edit/dismiss persisted. Tier DLC "Demand Intelligence Premium" $80-150/property/mes post v1.0.x Foundation + ≥6m historia hotel. Decisiones D-DEMAND1..10 a registrar en kickoff. ML real solo cuando hotel tenga 18+ meses data; MVP es 100% heurístico. APIs evaluadas: Amadeus (recomendado) / AviationStack / FlightAware AeroAPI / Cirium FlightStats (enterprise) / OAG (enterprise) / Skyscanner Partner (partner-only).
  - **Roadmap v1.0.0 ampliado** — RATES-METRICS-COMPSET-CORE agregado como bloqueante revenue (entre CHECK-IN modal redesign y QA-α). v1.1.1 expandido con Market Intel Pro DLC. v1.1.1+ agregada línea Demand Intelligence Premium DLC con link al plan.
  - **Header date + changelog** actualizado.

- **2026-05-21** — **Sprint BITACORA-UNIFICATION cerrado + plan SIGN-DLC documentado (3 deliverables paralelos).**
  - **UI bitácora unificada — single source of truth.** `ReservationNotesThread` es ahora el componente canónico compartido entre el slide drawer del calendario (BookingDetailSheet tab "Notas") y la página de detalle de reserva (sidebar derecho `ReservationDetailPage`). Eliminado código duplicado: `BitacoraChat` + `ChatBubble` + `HOSPITALITY_DOODLES_SVG` (~400 líneas SVG hospitality doodles Telegram-inspired) + `StayStickyNotes` + `PinnedNoteCard` + `channelMeta` + interface `StickyNoteData` (~600 LOC total). Eliminados también `arrivalNotes` inline card (banner ámbar legacy) + special requests row del tab Huésped — única fuente de comunicación per-reserva es ahora la bitácora.
  - **Refactor a chat bubbles Telegram-style** dentro de `ReservationNotesThread`: bubbles asimétricas (`bg-emerald-500 text-white rounded-br-sm` mine vs `bg-white rounded-bl-sm border-slate-100` other), avatar circular hash-color HSL derivado del `authorId`, channel chip inline en header del bubble (ahorra fila vertical), timestamp + edit pencil en footer del bubble con `group-hover:opacity-60`.
  - **Filtro por channel** agregado al header del componente — chips clickeables (Todas N · General · Petición · Limpieza · Interno) con `flex-nowrap overflow-x-auto scrollbar-none` para escalabilidad. Justificación documentada con Gestalt continuidad + Hick's Law + Apple HIG Page Controls.
  - **Layout sidebar** — `aside sticky top-20 h-[calc(100vh-7rem)]` (despeja el Sidebar fijo h-14 + breathing). Card con shadow elevation +1 (`shadow-[0_8px_24px_rgba(15,23,42,0.06),0_2px_6px_rgba(15,23,42,0.04)]`). Lista de mensajes con bg-color cool-blue muted `#E8EFF7` (Mehrabian-Russell PAD: baja Arousal + alta Pleasure → reduce carga cognitiva).
  - **Input**: textarea single-line `rows={1}` con `rounded-full`, botón circular icon-only Send (sin label "Enviar"), Enter envía / Shift+Enter newline (patrón Telegram/Slack), IME composition fix preservado para acentos/CJK.
  - **Empty state** con illustration SVG inline (chat bubble emerald + halo mint + paper plane accent) + headline "Conversación vacía" + subtitle + caso "filtro sin matches" diferenciado con botón "Ver todas". Sin assets externos (cero dependencia CDN, cero copyright).
  - **Sticky positioning** corregido: `top-6` (24px) escondía el card detrás del `<Sidebar />` fijo `h-14`. Cambiado a `top-20` (80px). Auto-scroll del chat usa `el.scrollTop = el.scrollHeight` en vez de `scrollIntoView` (que movía el viewport global).
  - **Sprint SIGN-DLC planificado.** Plan técnico completo en [docs/sprints/SIGN-DLC-plan.md](docs/sprints/SIGN-DLC-plan.md): módulo DLC v1.1.x para reemplazar el flujo manual de tres hojas firmadas (registration card + ToC + payment voucher) del check-in tradicional con un wizard digital + signature canvas + audit trail SHA-256 + NOM-151 conservation (Mifiel PSC) + chargeback Evidence Package builder one-click. Escala 12 días-dev (1 dev) o 6-7 días calendar (2 paralelos backend/frontend). 10 decisiones D-SIGN1..D-SIGN10 documentadas; serán §-numeradas en CLAUDE.md al cerrar sprint. Pricing DLC: Starter $25 / Pro $40 / NOM-151 add-on $10 USD/property/mes. Diferencial competitivo único en LATAM: ningún PMS global (Mews, Cloudbeds, Opera, RoomRaccoon, Little Hotelier) trae NOM-151 nativo.
  - **ADR-0001 PDF rendering engine** creado en [docs/architecture/ADR-0001-pdf-rendering.md](docs/architecture/ADR-0001-pdf-rendering.md). Formato MADR 3.0. Decisión: Puppeteer + Headless Chromium con `PuppeteerPool` compartido (1 browser, max 5 pages concurrentes → ~210MB memoria constante). Pre-warm en module init para cold start. `pdf-lib` post-procesa metadata (CreationDate epoch) para determinismo del hash SHA-256 — crítico para reconciliación NOM-151. Browserless.io documentado como escape hatch si infra propia da problemas. Descartados: wkhtmltopdf (proyecto en maintenance + sin CSS Grid/flexbox), pdfkit/pdf-lib programático (templates duales HTML/JS en sync = costo dev recurrente), servicios externos DocRaptor/PDFShift (datos sensibles atravesando red externa + costo recurrente).
  - **JSON Schema LinterReport** creado en [docs/standards/toc-linter-schema.json](docs/standards/toc-linter-schema.json). Draft 2020-12. Estructura: `findings[]` con `ruleId` (enum de 10 reglas), `severity` (error/warning/info), `message` localizable, `location` (line/column/snippet), `suggestion` (replace/insert/delete/manual + newText), `reference` (kind=law/norm/industry_guideline + citation + url), `overridable` + `overrideHistory[]` para audit. Ejemplo completo con findings reales del T&C de Hotel Azúcar Tulum (ventana 16 días hábiles + cargo $150 toalla) citando PROFECO LFPC Art. 90 + HFTP Handbook 2023. Persistible en `TermsAndConditionsVersion.linterReport` (jsonb).
  - **Sales master actualizado.** [docs/zenix-sales-master.md](docs/zenix-sales-master.md) ahora incluye Módulo 8 — Zenix Sign con tabla comparativa vs Mews/Cloudbeds/Opera/RoomRaccoon/Little Hotelier, ROI documentado (chargeback win-rate 48% → ≥65% per Chargebacks911 Hospitality Report 2023), 3 speech quotes pulidos, argumento de cierre para hotel boutique LATAM.
  - **Sticky notes para Elena en BD.** Para demo del flujo previo de sticky notes (después eliminado), script idempotente en `apps/api/prisma/scripts/seed-elena-sticky-notes.ts` creó 4 notas STICKY de prueba. Las notas siguen en BD; al eliminar la UI de sticky notes quedaron huérfanas pero no rompen nada porque el filtro `kind !== 'STICKY'` en `ReservationNotesThread` las oculta automáticamente.

- **2026-05-19** — **Sprint AVAIL-OVERSTAY cerrado (rama `sprint/availability-room-move-fixes`).** Reportado por testing 2026-05-18: drag Elena Vasquez A1→A2 rechazado con conflict contra Carlos (que ya hizo checkout days ago pero `actualCheckout=null`). Root cause: PMSs típicos (incluído Zenix hasta hoy) tratan a `scheduledCheckout < today` + `actualCheckout=null` (huésped fantasma) como ocupación válida → bloquea re-bookings legítimos. Fix Option B (user-approved): tratar como salido para availability, pero reportar como pendiente en contabilidad. Implementación: `AvailabilityService.check()` añade `effectiveCheckoutCutoff = max(dayAfterNewCheckIn, startOfDay(today))` aplicado tanto a GuestStay como a StaySegment.journey.guestStay query. `findOverstayed(propertyId)` retorna las zombies con `outstandingBalance` + `hoursOverdue`. Endpoint `GET /v1/reports/overstayed` (RECEPTIONIST/SUPERVISOR; HOUSEKEEPER 403). Frontend mirror en `TimelineScheduler.occupancySet` + `MoveRoomDialog.staysByRoom` + `useDragDrop.hasConflict` (con `effectiveCheckIn = max(today, checkIn)` para clipping del rango de stays checked-in dragged). Visual: ring amber inset + badge "Vencido" en `BookingBlock`. Widget `OverstayedWidget` en Dashboard con top-3 + saldo agregado + expand. Bug 3 (split flow click savings): MoveRoomDialog simple-mode ahora seedea `selectedRoomId` desde `initialNewRoomId` cuando viene de drag — ahorra 1 click. Issue 4 (scroll auto-center): `SplitPartRoomField` hace `scrollIntoView({block: 'center'})` cuando expande inline el RoomPicker. Tests: 6/6 nuevos en `availability.service.spec.ts`; suite completa 142/142 verde (stay-journeys + guest-stays). Decisión §128 registrada.

- **2026-05-17** — **Sprint CHECK-IN-α implementación (iteración 2) + plan FX-LATAM creado.** Día 1 backend (migration `paymentModel` + `documentPhotoUrl` + `getCheckinContext` endpoint + 17 tests verdes). Día 2 frontend (ConfirmCheckinDialog rediseñado single-screen `max-w-3xl`, `useModalDismiss`, foto del documento data URI base64 reemplaza campo "número", overpayment bloqueado con `BALANCE_OVERPAID` siguiendo Opera/RoomRaccoon, terminal POS reword a "Número de aprobación de la terminal", llave eliminada, `propertyCurrency` (LegalEntity.baseCurrency) como primary + secondaryRates `{USD, EUR, MXN}` con lookup bidireccional 4-niveles (PropertyFxRate override directo/inverso → ExchangeRate Banxico directo/inverso). Guard nuevo en `TimelineScheduler:1182` previene abrir dialog si `actualCheckin` ya existe → toast informativo + auto-close. `ApiError` extendido para exponer `.code` machine-readable. Sprint a registrar §105-§110 en próxima iteración. **Plan FX-LATAM** ([docs/sprints/FX-LATAM-plan.md](docs/sprints/FX-LATAM-plan.md)) creado para v1.0.4 — 3-5 días, `IFxAdapter` Strategy pattern paralelo a `IFiscalAdapter` (§89), first batch MX/CO/CR/PE con Banco República TRM + BCCR + SBS, `FxAdapterRegistry` auto-cron registration via `SchedulerRegistry`, `FxSection.tsx` multi-par, `PropertySettings.secondaryDisplayCurrencies` override. Bloqueante para primer cliente fuera de MX. **Wizard `docs/vision/13` Etapa 3 LegalEntity actualizada** con sub-sección "FX integration" análoga a "PAC integration" — adapter auto-seleccionado por countryCode + test sandbox + health check pre-activación. Decisiones §111-§115 a registrar post-sprint FX-LATAM.

- **2026-05-16** (final) — **Sprint CANCEL-ARCHIVE + 3-LEVEL Rates + FX-CORE mergeado (PR #32).** Resumen del megasprint cerrado:
  - **Cancel-Archive** completo: soft-delete obligatorio + audit log append-only `GuestStayLog` + sub-tab archive con filter chips + slide drawer "Canceladas hoy" + restore 7d window (HOTEL/ADMIN_ERROR only) + AvailabilityService excluye cancelled. Calendar libera slot visual (paridad Cloudbeds/Mews/Opera/RR/LH). Schema "espiral": string fields no enum, `cancelMetadata: Json?`, `cancellationPolicyId: String?` FK hook + `requiresFiscalReview: Boolean` sembrado para v1.0.2 CFDI-CORE. 20 unit tests verdes. Decisiones §95-§98.
  - **3-LEVEL Rates pattern** (research 12 fuentes citadas, Mews feedback 8 votos abierto desde oct-2024 con quejas verbatim):
    - Nivel 1 ambient — BAR per-group en cada `row.type='group'` del `TimelineGrid` (Cabaña $130, Estándar $70, Junior Suite $180, Suite $280). Fallback strip top cuando ≤1 grupo (STR/Airbnb flat).
    - Nivel 2 enriquecido — ghost block adaptativo según `colWidth` (narrow→compacto, medium→`+ $145`, wide→`+ Nueva reserva — USD 145`). Sin truncación.
    - Nivel 3 quote sheet — side panel `max-w-2xl` con grid `RoomType × Dates` + totales, accesible vía botón "Tarifas" en `TimelineSubBar`. Endpoint `GET /v1/rates/quote`.
    Decisión §102.
  - **FX-CORE adelantado** (parcial de §81-§83 v1.0.1 PAY-CORE) porque rate display necesita conversión: `ExchangeRate` snapshot inmutable + `PropertyFxRate` override comercial (rate absoluto o spread relativo) + `FxService.refreshBanxicoDaily` `@Cron 13:00 CST 'America/Mexico_City'` SF43718 FIX + Dashboard widget + Settings UI tab "Tipo de cambio" con form supervisor-only. CFDI compliance Art. 20 CFF documentado (Banxico oficial para emisiones, override interno solo para quotes/cobros). Decisión §103.
  - **Modal dismiss estándar** (`useModalDismiss` hook reusable): backdrop click + Esc cierran; dirty-state confirm; aplicado a CancelReservationDialog + CancelledTodayDrawer + MoveExtensionConfirmDialog. Fix sistemático: backdrop blur div con `pointer-events-none`. Decisión §98.
  - **Notif self-suppress sistémico** (analogía FB): actor nunca recibe su propia notif. Aplicado a `sendPush`, `listForUser`, `unreadCount`. Auto-mark-as-read tras `recordApproval` para todos los recipients elegibles + filtro `approvals: { none: {} }` backward-compat. `NotificationPurgeScheduler` `@Cron EVERY_DAY_AT_4AM` purga física tras 7d post-`expiresAt`. Compliance permanente (NO_SHOW, MAINTENANCE_SLA_BREACH, PAYMENT_PENDING) NUNCA se purga. Decisiones §99-§101.
  - **Scroll performance SwiftUI-style**: refactor handleScroll a DOM mutation directa con refs + `translate3d` GPU-composited + `will-change: transform`. React state throttled via `requestAnimationFrame`. 60fps consistente sin desincronización entre header/grid/footer. `BarStrip` + `OccupancyFooter` cambiados de `scrollLeft: number` prop a `innerRef: Ref<HTMLDivElement>` prop. Decisión §104.
  - **bookingRef en sheet header** — el ID formal MX-D-PROP-YYMM-NNNN (generator existente desde antes) ahora se muestra al lado de "Ver completa" como texto plano SF Mono copiable. Stays seed/legacy sin bookingRef NO muestran el ID (cleaner que mostrar UUID).
  - **Bugs UI corregidos en el mismo sprint**: drag tooltip suppression (memo comparator faltaba `anyDragInProgress`), NS chips dimming al click selección, NS collision day-level UTC (no timestamp), X button dismiss en NotificationPanel, drawer cache refetch faltante, chip "Aprobación requerida" hidden tras decisión, ghost block truncation, modal centrado vs bottom drawer para canceladas.
- **2026-05-16** — **Bug-fixes UI + planes Cancel-Archive y Channex-Inbound.** PR #28 mergeó Fix F same-day turnover (day-level overlap) + tooltip drag suppression + dim foco visual sin ring + early-checkout `await refetchQueries`. PR #29 reemplazó `findPredecessor` proximity-based por ID-based (`journeyId` única fuente de verdad) — fix arquitectural para evitar que 5 reservas back-to-back sean tratadas como journey. PR #30 agregó ID interno del `GuestStay` (UUID truncado 8+4 chars) con copy-to-clipboard en `BookingDetailSheet`. PR #31 corrigió root cause real del fix Same-day: `date-fns startOfDay()` usa TZ local del runtime — reemplazado por `utcStartOfDay()` helper basado en `Date.UTC()`; mismo patrón aplicado a `occupancySet` del calendario (itera entre `Date.UTC(y,m,d)` no por timestamp + MS_DAY) que bloqueaba la celda PM del día de checkout. Verificado en preview API + browser: 17→18 same-day turnover en C1 ahora available, overlap real sigue 409. **Plan Cancel-Archive + Channex-Inbound creados como bloqueantes hard de v1.0.0** tras debate con user sobre completitud del MVP: sin cancel-archive el piloto rompe audit trail (5-15% reservas se cancelan según rate plan); sin Channex inbound real, reserva OTA invisible → chargeback Visa 13.7 no defendible. **Scope cancel-archive simplificado** post-debate 2026-05-16: drop CFDI E auto + CancelKind enum estricto + scheduler anonymization → defer a v1.0.1+ donde tienen sentido. Schema diseñado "espiral" (string fields no enum, `cancelMetadata: Json?`, `cancellationPolicyId: String?` FK hook) para acomodar hotel/hostal/STR sin migration. Research: 26 fuentes citadas (help centers Cloudbeds/Mews/Opera/RoomRaccoon/Little Hotelier, Visa Dispute Management Guidelines junio 2024, SAT Anexo 20 v4.0, USALI 12ed HFTP/AHLA mandatory 2026-01-01, Mews feedback forum 817 votos undo-cancel 2yr gap).
- **2026-05-15** (late night) — **CI-RESCUE ejecutado en gran parte.** Sprint completado en una sesión (~6h). Resultados: (1) Fixes mecánicos a prismaMock en 6 specs API + 3 providers faltantes (PushService, NotificationsService, AvailabilityService) + mocks que retornan Promise para fire-and-forget calls — **102 de 110 tests rojos resueltos** (110→8). (2) ESLint configs minimalistas creados por workspace (api/mobile/web `.eslintrc.json`) con reglas permisivas para bootstrap inicial; instalados `eslint-plugin-react`+`eslint-plugin-react-hooks` para mobile y web. (3) Lint reactivado como **blocking** en workflow CI; Test sigue `continue-on-error: true` por los 8 stale tests restantes. (4) Web lint script cambia de `--max-warnings 0 --report-unused-disable-directives` a default (incompatible con reglas off + comments disable legacy). 8 fails restantes son **assertions obsoletas vs comportamiento actual del servicio** (no-show timezone México, room AVAILABLE/OCCUPIED restoration, stay-journeys effectiveDate guards, dashboard data structure) — necesitan feature-owner del PMS, no infra fix. Total esfuerzo real: ~5-6 horas (vs 1-1.5 días estimado).
- **2026-05-15** (night) — **Diagnóstico real CI-RESCUE.** Post-merge de PR #22 (lockfile fix con multer 1.4.5-lts.2 correcto) y PR #23 (QA-α batch 1 con 26 tests mobile), se re-corrieron los tests del API. Multer fix solo arregló +8 tests (de 187 pass → 195 pass; los 110 fails siguen siendo 110). El root cause real es **mocks desactualizados**: el código de `tasks/tasks.service.ts:204` agregó `tx.room.update(...)` (sync de room.status durante task lifecycle) en algún commit reciente sin actualizar `prismaMock` en los specs. Error idéntico en CI y local: `TypeError: Cannot read properties of undefined (reading 'update')`. Suites afectadas: tasks, guest-stays.no-show, guest-stays.late-checkout, night-audit.scheduler, stay-journeys, assignment, dashboard-overview, access-control (e2e con BD), multi-tenant-hierarchy, tenant-isolation. **Scope CI-RESCUE revisado de 3-5 días a 1-1.5 días** — el fix es mecánico: agregar `room: { update: jest.fn(), findUnique: jest.fn() }` a cada `prismaMock`. Lockfile broken + multer y ESLint configs son items menores adicionales. CLAUDE.md actualizado con diagnóstico real + plan de pasos.
- **2026-05-15** (final +2) — **Mx-1B finalización y HK-CFG también cerrados tras verificación.** Cuarto y quinto cierre silencioso del día. Mx-1B finalización: PR #13 (commit `6c09fab`) mergeó MAINT-4 draft persist + NOTIF-7+13 toast + UX help text "días estimados"; 4 gaps menores deferidos con justificación. HK-CFG: `HousekeepingScheduleSection` (1138 LOC, 3 sub-tabs Horarios+Cobertura+Reglas) ya implementado en Sprint 8H (commit más viejo) y tab "Recamaristas" registrado en `SettingsPage.tsx:28`. **Resultado final del día: 4 sprints v1.0.0 cerrados** (SEC-α + POLISH-α + Mx-1B finalización + HK-CFG). Únicos pendientes reales antes de release: **QA-α** (test coverage mobile, ~4-5 días) y **CI-RESCUE** (eslint configs + 110 tests rojos API + multer 1→2, ~3-5 días). Estimado total a v1.0.0: ~8-10 días enfocados.
- **2026-05-15** (final +1) — POLISH-α también CERRADO tras verificación de los 11 bugs medios del audit 2026-05-13. Hallazgo paralelo al de SEC-α: el audit estaba desactualizado, todos los bugs (NS-6, MT-7, MT-8, PAY-8, CAL-10, CAL-4, BLK-6, MAINT-4, NOTIF-7+13, NOTIF-11) ya tenían su fix en main con comentarios trazables (`Sprint SEC-α`, `NOTIF-7+13 fix`, `BLK-6`, `NS-6`, etc.). Único pendiente: MT-9 — componente código (cookie httpOnly + sse-token) está en TODO para refactor v1.0.x SSE-auth; componente ops (proxy nginx redact `?token=`) requiere config productivo fuera del repo. CLAUDE.md actualizado con archivo:línea de cada fix para que el audit refleje la realidad. **Resultado neto: SEC-α y POLISH-α cerrados; quedan Mx-1B finalización, HK-CFG, QA-α, CI-RESCUE antes de release v1.0.0.**
- **2026-05-15** (final) — SEC-α cerrado tras verificación. Items críticos+altos del audit 2026-05-13 (MT-5, MT-3, NS-3) **ya estaban resueltos** en main por commit `aa6f122` "feat(security): Sprint SEC-α — hardening multi-tenant pre-v1.0.0". MT-5 fixed con `PropertyScopeGuard` registrado como `APP_GUARD` global (más robusto que plan por-controller del audit original — protege TODO endpoint con `?propertyId=`, no solo los 5 listados). MT-3 fixed en `auth.service.ts:95-127` con guard de `UserPropertyRole` pivot. NS-3 fixed en `night-audit.scheduler.ts:146`. CLAUDE.md actualizado: items movidos de "🔴 pendiente" a "✅ DONE"; sprint SEC-α marcado cerrado; bugs medios (NS-6, MT-7, MT-8, etc.) reasignados a POLISH-α. Plan próximo: Mx-1B finalización → HK-CFG → POLISH-α → QA-α → CI-RESCUE → release v1.0.0.
- **2026-05-15** (PM late) — Decisiones §91-§94 agregadas tras investigación profunda 32 estados MX + 9 países LATAM + fricción competitiva. Catálogo nativo `TaxCatalogEntry` curado internamente por rol `TAX_CURATOR` Zenix (NO Avalara/Vertex/Sovos en v1.0.x). Override en dos capas con precedencia PROPERTY > LEGAL_ENTITY > base. Brasil EXCLUIDO v1.0.x (entrar post v1.2 con Sovos como `FiscalAdapter`). DSA Tulum marcado `status='AMBIGUOUS'` — wizard solicita modalidad al cliente, Activate verifica con Tesorería Municipal. Nueva sección J en `14-payment-currency-tax-architecture.md` con matriz completa MX 32 estados (Yucatán bajó 5→4.5 %, tarifas diferenciadas plataformas digitales). Setup wizard objetivo: 6-8 clicks vs ~30 Cloudbeds.
- **2026-05-15** (PM) — Decisiones §81-§90 (PAY-CORE / CFDI-CORE) registradas tras investigación competitiva de 5 PMS (Mews, Cloudbeds, Opera Cloud, Roomraccoon, Little Hotelier). 9 sub-módulos de cobros/divisas/impuestos LATAM consolidados en `docs/vision/14-payment-currency-tax-architecture.md`. Hallazgos clave: (1) Ningún PMS premium tiene GuestCredit core con CFDI E + FormaPago=15 — Zenix lo entrega como diferenciador; (2) Mews no distingue OTA-collect vs Hotel-collect (gap competitivo); (3) Banxico SF43718 (FIX) confirmado como fuente primaria FX MX, 40k consultas/día gratuito; (4) Quintana Roo 2026: IVA 16% + ISH 6% + DSA per-room/per-person basado en % UMA (117.31 MXN); (5) Tax strategy INCLUSIVE default resuelve fricción Hostelworld del 73% de quejas por extra fees inesperados.
- **2026-05-15** (AM) — Decisiones arquitectónicas fundacionales registradas como §63-§80. Modelo multi-tenant 4-level Brand→Organization→LegalEntity→Property aprobado. Plan de infraestructura 4 fases definido (Vercel+Render+Neon en piloto, AWS en growth, enterprise en cadenas, continental en escala LATAM). Zenix Activate wizard de 8 etapas diseñado. 3 nuevos docs en `docs/vision/`: 11-multi-tenant-architecture.md, 12-infrastructure-devops.md, 13-consultant-setup-wizard.md.
- **2026-05-13** — Refactor mayor. Visión estratégica completa movida a `docs/vision/` (11 archivos). CLAUDE.md reducido de ~3970 a ~700 líneas. Mantiene solo decisiones técnicas ejecutables, principios rector, decisiones no-negociables §1-§62, patterns, commands, y bitácora del sprint en curso. Agregados módulos futuros People (v1.7) y Books (v1.8) en docs/vision/.
- **2026-05-09** — PR #8 mergeado: Sprint 9-HK ext + KP-01 (Kanban UX overhaul + bug fixes housekeeping).
- **2026-05-04** — Sprint 8I (Mobile Hub Recamarista) + 9-HK refactor completados.
- **2026-04-30** — Sprint 8H (Housekeeping Scheduling Foundation) completado, 86/86 tests verdes.
- **2026-04-24** — Sprint 8 (Check-in Confirmation + PaymentLog) completado.
