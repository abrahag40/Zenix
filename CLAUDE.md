# CLAUDE.md — Zenix PMS

> Instrucciones técnicas para el agente IA + decisiones no-negociables del código.
> **Última actualización:** 2026-05-15 (decisiones §81-§90: PAY-CORE/CFDI-CORE arquitectura LATAM).

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

## Estado actual del proyecto (2026-05-13)

- **Versión en curso:** v1.0.0 (piloto comercial — Hotel Monica Tulum)
- **Últimos commits relevantes:** PR #8 (Sprint 9-HK ext + KP-01), Sprint Mx-1 backend (commit 1436f6c), Sprint Mx-1B (web + mobile completos en worktrees)
- **Próximo bloque:** SEC-α (hardening seguridad multi-tenant) → HK-CFG (SettingsPage Recamaristas) → POLISH-α → QA-α → release v1.0.0
- **Auditoría completa:** [Modo auditoría 2026-05-13](#audit-20260513) — 1 bug crítico (MT-5), 2 altos, 11 medios, 5 acknowledged debt

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

## Non-Negotiable Decisions §1-§90

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

### 🔴 Crítico (fix antes de v1.0.0 release — Sprint SEC-α)

- **MT-5** — Query `?propertyId=` bypasea JWT scope. 5 controllers afectados: `notification-center.controller.ts:22-27`, `guest-stays.controller.ts:52-58, 131-141`, `room-readiness.controller.ts:25`, `stay-journeys.controller.ts:20`, `room-types.controller.ts:13`. **Fix:** guard `if (query.propertyId !== actor.propertyId) throw ForbiddenException()`.

### 🟠 Alto (fix Sprint SEC-α)

- **MT-3** — `switchProperty` no valida `UserPropertyRole` pivot. `auth.service.ts:83-87`. **Fix:** `await this.prisma.userPropertyRole.findFirst({ where: { userId: actor.sub, propertyId: targetPropertyId } })`.
- **NS-3** — Verificar que `noShowRevertedAt: null` está en `night-audit.scheduler.ts:146` `where` clause (documentado §15b).

### 🟡 Medio (cleanup en SEC-α o v1.0.x POLISH-α)

| Bug | Archivo | Fix |
|-----|---------|-----|
| NS-6 | `guest-stays.service.ts:1512` | Guard `localHour >= potentialNoShowWarningHour` en markAsNoShow |
| MT-7 | `useSSE.ts:111`, `PropertySwitcher.tsx` | Re-mount SSE tras switchProperty |
| MT-8 | `.env.example:3` | JWT TTL de 7d → 24h |
| PAY-8 | `guest-stays.service.ts:1920, 2055, 2108` | `shiftDate` con timezone + checkoutHour |
| CAL-10 | `stay-journeys.service.ts:339-365` | Guard `effectiveDate >= segment.checkIn` |
| CAL-4 | `useMoveRoom` hook | Verificar toast en 409 ConflictException |
| BLK-6 | `blocks.service.ts` | `notifyReservation/Release` post-commit (fire-and-forget) |
| MAINT-4 | `TicketDetailDrawer.tsx:277-288` | Draft persistence comments |
| NOTIF-7+13 | `GlobalMaintenanceDrawer.tsx` | 404 fallback con toast |
| NOTIF-11 | `NotificationPanel.tsx:177` | `disabled={mut.isPending}` |
| MT-9 | `useSSE.ts:59,70` | Reverse proxy redact `?token=` |

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
| **SEC-α** | Hardening seguridad (MT-5, MT-3, NS-3, NS-6, MT-7, MT-8) | 5-7 | **Sí — crítico** |
| **Mx-1B finalización** | Gaps menores web + mobile mantenimiento | 3-4 | Sí |
| **HK-CFG (Setup Recamaristas)** | SettingsPage tab "Recamaristas" | 5-7 | Sí |
| **POLISH-α** | Bugs medios cleanup | 2-3 | Sí |
| **QA-α** | Test coverage mobile Hub | 4-5 | Sí |
| **CI-RESCUE** | Rescatar pipeline CI: eslint configs + 110 tests rojos `@zenix/api` + migrar multer 1.x→2.x | 3-5 | No (lint/test marcados non-blocking 2026-05-15) |

### Sprint CI-RESCUE — detalle técnico

> **Status:** PENDIENTE. Marcado non-blocking en `.github/workflows/ci.yml` el 2026-05-15.
> **Razón de existir:** durante el fix de lockfile (PR #19) se descubrió que CI llevaba múltiples capas de bugs ocultos. Para no detener entrega, se hizo `continue-on-error: true` en lint+test. **Esta deuda debe pagarse antes de release v1.0.0.**

**Lo que tiene que arreglar:**

1. **Eslint configs faltantes** — `apps/api`, `apps/mobile`, `apps/web`, `packages/shared` no tienen `.eslintrc*` ni `eslint.config.{js,mjs}`. `npm run lint` falla en api+mobile con "ESLint couldn't find a configuration file". Decisiones pendientes:
   - Presets: `@typescript-eslint/recommended`, `eslint-plugin-react`, `react-native`, `prettier`
   - ¿Strict mode o moderate? (impacto enorme en cuántos archivos requieren cleanup)
   - ¿Auto-fix permitido en CI o solo report?
2. **110 de 297 tests de `@zenix/api` fallan localmente** — patrón observado: imports de `uploads/*` + `multer 1.x` (deprecated, vulnerabilidades). Hipótesis de root cause:
   - Posible migración pendiente `multer 1.x → 2.x` (breaking change documentado)
   - O refactor reciente que rompió importaciones del módulo uploads
   - Reproducir con: `cd apps/api && npm test` (exit code 1, 9 suites failed)
3. **Workspace name legacy** — antes del rename `@housekeeping/api → @zenix/api`, el workflow CI referenciaba el nombre viejo. Ya fixed en PR #19, pero validar que no haya otros lugares (scripts, docs, etc.).
4. **Reactivar lint/test como blocking** — una vez 1+2+3 resueltos, quitar `continue-on-error: true` de `.github/workflows/ci.yml` líneas correspondientes. CI vuelve a ser red/green binario.

**Pasos sugeridos del sprint:**
1. (4-6h) Crear eslint configs por workspace + correr `npm run lint -- --fix` para auto-resolver lo trivial
2. (1-2h) Revisar manualmente issues no auto-fixables (probable: 50-100 ocurrencias razonables)
3. (4-8h) Investigar root cause de los 110 tests fallidos — probable un solo PR causal
4. (2-4h) Migrar multer 1→2 si aplica (revisar [changelog multer 2.0](https://github.com/expressjs/multer/blob/master/CHANGELOG.md))
5. (1h) Quitar `continue-on-error` del workflow, validar CI verde en PR de cierre

**Estimado:** 3-5 días enfocados. Se puede paralelizar con otros sprints v1.0.0 si no se toca el código de uploads/auth.

### v1.0.x Roadmap (refinado 2026-05-15 — ver [docs/vision/14-payment-currency-tax-architecture.md](../../docs/vision/14-payment-currency-tax-architecture.md))
- **v1.0.1 PAY-CORE** (~9.5 semanas) — Stripe + Conekta + folio modal + master billing + folio splitting + refund/void + COMP approval. **Adiciones §81-§88:** multi-currency con `PaymentFxLock` inmutable, OTA-collect detection vía Channex, cash drawer multi-divisa con `CashierShift`, Banxico SF43718 integration, `GuestCredit` con audit completo + `applicableChannels` default DIRECT
- **v1.0.2 CFDI-CORE** (~3 sem adicionales) — `MxCfdi40Adapter` (Facturama/SW Sapien) + CFDI I/E/REP + cancelación CFDI + cumplimiento `FormaPago=15 (Condonación)` para GuestCredit no-monetario. **Tax engine §84:** `TaxRate` multi-cálculo (PERCENT_OF_BASE | FIXED_PER_ROOM_NIGHT | UMA_MULTIPLIER) + `UmaValue` versionada + `IFiscalAdapter` Strategy. **Tax transparency §82:** `PropertySettings.taxStrategy=INCLUSIVE` default + push Channex con `is_inclusive` selectivo (resuelve fricción Hostelworld)
- **v1.0.3 REPORTS-CORE** (~6-8 sem) — 12 reportes esenciales + GuestCredit liabilities (pasivo contable USALI) + Cashier Shift Report per-divisa
- **v1.0.4 IMG + NS-UI + DEBT-α** (~1-2 sem) — S3 + toggle no-shows + cleanup deuda técnica

### v1.1.x+ (post-Foundation)
- **v1.1.0** — Mensajería Booking + Online check-in + Digital signature
- **v1.1.1** — IA tarifaria heurística + Pickup/Pace avanzados
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
| Settings Recamaristas tab | ⏳ HK-CFG |
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

- **2026-05-15** (PM) — Decisiones §81-§90 (PAY-CORE / CFDI-CORE) registradas tras investigación competitiva de 5 PMS (Mews, Cloudbeds, Opera Cloud, Roomraccoon, Little Hotelier). 9 sub-módulos de cobros/divisas/impuestos LATAM consolidados en `docs/vision/14-payment-currency-tax-architecture.md`. Hallazgos clave: (1) Ningún PMS premium tiene GuestCredit core con CFDI E + FormaPago=15 — Zenix lo entrega como diferenciador; (2) Mews no distingue OTA-collect vs Hotel-collect (gap competitivo); (3) Banxico SF43718 (FIX) confirmado como fuente primaria FX MX, 40k consultas/día gratuito; (4) Quintana Roo 2026: IVA 16% + ISH 6% + DSA per-room/per-person basado en % UMA (117.31 MXN); (5) Tax strategy INCLUSIVE default resuelve fricción Hostelworld del 73% de quejas por extra fees inesperados.
- **2026-05-15** (AM) — Decisiones arquitectónicas fundacionales registradas como §63-§80. Modelo multi-tenant 4-level Brand→Organization→LegalEntity→Property aprobado. Plan de infraestructura 4 fases definido (Vercel+Render+Neon en piloto, AWS en growth, enterprise en cadenas, continental en escala LATAM). Zenix Activate wizard de 8 etapas diseñado. 3 nuevos docs en `docs/vision/`: 11-multi-tenant-architecture.md, 12-infrastructure-devops.md, 13-consultant-setup-wizard.md.
- **2026-05-13** — Refactor mayor. Visión estratégica completa movida a `docs/vision/` (11 archivos). CLAUDE.md reducido de ~3970 a ~700 líneas. Mantiene solo decisiones técnicas ejecutables, principios rector, decisiones no-negociables §1-§62, patterns, commands, y bitácora del sprint en curso. Agregados módulos futuros People (v1.7) y Books (v1.8) en docs/vision/.
- **2026-05-09** — PR #8 mergeado: Sprint 9-HK ext + KP-01 (Kanban UX overhaul + bug fixes housekeeping).
- **2026-05-04** — Sprint 8I (Mobile Hub Recamarista) + 9-HK refactor completados.
- **2026-04-30** — Sprint 8H (Housekeeping Scheduling Foundation) completado, 86/86 tests verdes.
- **2026-04-24** — Sprint 8 (Check-in Confirmation + PaymentLog) completado.
