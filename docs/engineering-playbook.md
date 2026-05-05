# ZaharDev Engineering Playbook

> **Fuente de la verdad** para el desarrollo de software profesional, serio y definitivo en ZaharDev.
> Consolidación de decisiones, fundamentos académicos, estándares de industria y patterns aprendidos.
>
> **Audiencia**: cualquier nuevo proyecto que arranque con Claude Code o cualquier developer.
> **Industria**: agnóstica — los principios aplican a hotelería, médica, construcción, fintech, edtech, etc.
> **Versión**: 1.0 · 2026-04-30 · Compilado durante Sprint 8I del proyecto Zenix PMS.
>
> **Cómo usar este documento al iniciar un nuevo proyecto**:
> 1. Copiar a `<nuevo-proyecto>/docs/engineering-playbook.md` (este archivo).
> 2. Crear `<nuevo-proyecto>/CLAUDE.md` con referencia a este playbook + decisiones específicas del dominio.
> 3. Crear `<nuevo-proyecto>/ARCHITECTURE.md` para Architectural Decisions del proyecto.
> 4. Compartir el playbook con Claude al inicio: "Aplica el playbook de ZaharDev en `docs/engineering-playbook.md`".

---

## Índice

1. [Filosofía de ingeniería](#1-filosofía-de-ingeniería)
2. [Principios no-negociables](#2-principios-no-negociables)
3. [Análisis crítico — cómo se decide](#3-análisis-crítico--cómo-se-decide)
4. [Fundamentos cognitivos (psicología aplicada)](#4-fundamentos-cognitivos-psicología-aplicada)
5. [Estándares de UX/UI](#5-estándares-de-uxui)
6. [Estándares de accesibilidad](#6-estándares-de-accesibilidad)
7. [Patterns arquitectónicos](#7-patterns-arquitectónicos)
8. [Calidad de código](#8-calidad-de-código)
9. [Performance budgets](#9-performance-budgets)
10. [Seguridad baseline](#10-seguridad-baseline)
11. [Documentación viva](#11-documentación-viva)
12. [Anti-patterns rechazados](#12-anti-patterns-rechazados-con-citación)
13. [Stack tecnológico recomendado](#13-stack-tecnológico-recomendado)
14. [Referencias canónicas](#14-referencias-canónicas)

---

## 1. Filosofía de ingeniería

> **ZaharDev crea productos serios, profesionales y definitivos. Software que pasa cualquier auditoría de la industria.**

Los pilares:

1. **Justificación con datos verificables, no opiniones.** Toda decisión cita fuente: estudio académico, documentación oficial (Apple HIG, Material Design, NN/g, WCAG), benchmark de competidor específico, o referencia industry-standard.

2. **Análisis crítico antes de implementar.** Cuando un cliente o stakeholder propone una solución, el deber profesional es identificar riesgos, generar contrapropuestas si aplica, y educar mientras se ejecuta. Aceptar pasivamente cualquier propuesta sin análisis es negligencia.

3. **La verdad del cliente es hipótesis, no axioma.** El cliente conoce su negocio; ZaharDev conoce ingeniería. Las decisiones técnicas son responsabilidad del ingeniero. Cuestionar críticamente es servicio profesional, no obstrucción.

4. **Documentar para el futuro.** Cada decisión arquitectónica vive en `ARCHITECTURE.md` con contexto, alternativas evaluadas, justificación y riesgos. Cualquier developer que llegue 6 meses después debe poder reconstruir el "por qué" sin preguntar.

5. **Estándares globales sobre invenciones locales.** Apple HIG, Material Design 3, NN/g 10 heuristics, WCAG 2.1 AA, ISO 9241 son la base. Solo se reinventa cuando hay justificación específica documentada.

6. **Modularidad por dominio (bounded contexts).** Cada feature/módulo es self-contained con su propio lenguaje, datos y reglas. Cross-domain coupling = deuda técnica.

7. **DRY pero NO premature abstraction.** Tres veces es regla → si dos componentes comparten lógica solo dos veces, NO se abstrae todavía. Esperamos al tercero.

---

## 2. Principios no-negociables

Estos principios aplican a TODO proyecto. No se relajan por presión de tiempo, demanda del cliente, o tamaño del proyecto.

### 2.1 Audit trail inmutable para datos sensibles

Todo registro que toque dinero, identidad, salud, legal, o decisiones operacionales con consecuencias debe:
- Tener un timestamp UTC.
- Identificar al actor (`actorId`, `staffId`, `userId`).
- Ser append-only (nunca update destructivo).
- Sobrevivir hard-delete via anonimización de PII.

**Justificación**: cumplimiento fiscal (CFDI México, DIAN Colombia), GDPR/LGPD/LFPDPPP, disputas industriales (Visa Core Rules §5.9.2 para chargebacks), HIPAA en salud, SOX en fintech.

### 2.2 Multi-timezone con `Intl.DateTimeFormat`

NUNCA hardcodear timezone. NUNCA usar `new Date().toLocaleDateString()` sin timezone explícito. Toda comparación de "hoy" debe hacerse en la timezone local de la entidad relevante (propiedad, paciente, proyecto, sucursal).

**Patrón**:
```ts
function toLocalDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date)
}
```

### 2.3 Idempotencia para crons

Todo cron job que muta datos debe tener un semáforo (`lastProcessedDate`, `lastJobId`, etc.). Si el servidor reinicia o el cron dispara dos veces, la segunda ejecución es no-op.

### 2.4 Aritmética de dinero/medidas con `Decimal`

Nunca `number` nativo para sumar fees, totales, o cualquier valor financiero/médico/legal. Usar `Decimal` (Prisma) o `BigInt` para enteros grandes.

### 2.5 Toda operación destructiva o de reasignación requiere confirmación explícita

Drag & drop, extensiones, cancelaciones, eliminaciones, transferencias — siempre pasan por modal de confirmación con preview. Anti-pattern: gesture sin confirmación = activación accidental.

**Fundamento**: Norman 1988 (forcing function), NN/g H3 (User control and freedom), Baymard Institute 2022 (68% errores ocurren sin confirmación).

### 2.6 Feedback informativo obligatorio

Toda operación rechazada, inválida o fallida debe comunicar:
1. **Qué ocurrió**
2. **Por qué ocurrió**
3. **Qué puede hacer el usuario**

Anti-patterns prohibidos:
- "Algo salió mal" / "An error occurred" sin detalle
- Cursor `not-allowed` sin tooltip/toast
- Falla silenciosa en drag&drop o submit

**Fundamento**: Nielsen H1 + H9, Apple HIG "Feedback", ISO 9241-110, Don Norman *Gulf of Evaluation*.

---

## 3. Análisis crítico — cómo se decide

### 3.1 Cuando el cliente propone una decisión arquitectónica

El responsable técnico (ZaharDev / Claude) responde con **análisis estructurado**:

1. **Lo que está bien en la propuesta** (con citación de por qué es correcto)
2. **Riesgos detectados** (con citación de por qué son riesgos)
3. **Contrapropuesta** cuando aplica
4. **Tabla comparativa** si hay ≥2 opciones
5. **Recomendación final + justificación**

### 3.2 Cuándo CONTRA-PROPONER

Generar contrapropuesta cuando la propuesta original:
- Choca con estándar global (Apple HIG, WCAG, etc.)
- Introduce duplicación significativa (DRY violation)
- Crea fragilidad (race conditions, edge cases ignorados)
- Es más complejo que la solución estándar
- Genera deuda técnica documentable

### 3.3 Cuándo NO contra-proponer

Aceptar la propuesta del cliente cuando:
- Es la opción estándar y el cliente la conoce
- Es decisión de producto (UX preferences, copy, branding) sin impacto técnico
- Es trade-off donde ambas opciones son válidas y el cliente prefiere una

### 3.4 Cuándo ESCALAR / DETENER ejecución

Detener trabajo y forzar conversación cuando:
- La propuesta viola **principios no-negociables** (sección 2)
- Hay riesgo legal/fiscal/seguridad documentable
- El alcance crece más allá del scope acordado sin renegociación
- La decisión genera **deuda técnica que pre-compromete sprints futuros** sin justificación

### 3.5 Plantilla de análisis crítico

```markdown
## [Decisión propuesta]

### Lo que está bien en la idea
- [Punto 1] — [Citación]
- [Punto 2] — [Citación]

### Riesgos detectados
1. **[Nombre del riesgo]** — [Cómo se manifiesta]. Citación: [fuente].
2. ...

### Contrapropuesta
[Descripción de la alternativa]

### Comparación
| Aspecto | Propuesta original | Contrapropuesta |
|---|---|---|
| ...

### Recomendación
[Recomendación + justificación + impacto en sprint actual y futuros]
```

---

## 4. Fundamentos cognitivos (psicología aplicada)

Toda decisión de UX/UI debe estar anclada en fundamentos verificables, no en gusto personal.

### 4.1 Cognitive Load (Sweller 1988)

**Fuente**: Sweller, J. (1988). *Cognitive Load During Problem Solving*. Cognitive Science 12(2).

**Concepto**: la memoria de trabajo es finita. Información irrelevante consume slots = aumenta carga mental.

**Aplicación práctica**:
- Si una pantalla tiene >7 elementos visibles → agrupar o paginar
- Si una decisión requiere comparar >5 opciones simultáneas → reducir
- Información contextual (tooltips, ayudas) → on-demand, no permanente

### 4.2 Working Memory 7±2 (Miller 1956)

**Fuente**: Miller, G. A. (1956). *The Magical Number Seven, Plus or Minus Two*. Psychological Review 63(2).

**Aplicación**:
- Listas largas → secciones con headers
- Forms con >7 campos → wizards multi-step

### 4.3 Pre-attentive Attention (Treisman 1980)

**Fuente**: Treisman, A. (1980). *A Feature-Integration Theory of Attention*. Cognitive Psychology 12(1).

**Concepto**: el cerebro procesa color, orientación, tamaño, movimiento en ~200ms — antes del razonamiento consciente.

**Aplicación**:
- Sistema de color semántico universal (rojo=urgente, amber=advertencia, verde=ok, gris=neutral)
- NUNCA color-only encoding (daltonismo afecta 8% de hombres) → siempre acompañar con ícono o forma
- Diseñar para que el usuario "entienda sin leer"

### 4.4 Progressive Disclosure (Norman 1988)

**Fuente**: Norman, D. (1988). *The Design of Everyday Things*.

**Concepto**: mostrar lo mínimo necesario en cada momento. Información avanzada se revela cuando el usuario lo pide.

**Aplicación**:
- Niveles de detalle (panel breve → pantalla completa)
- "Ver detalles técnicos" colapsado por default
- Settings agrupados, descripción on-demand
- Anti-pattern: dump all info en single scroll

### 4.5 Hick's Law (Hick 1952)

**Fuente**: Hick, W. E. (1952). *On the Rate of Gain of Information*.

**Concepto**: tiempo de decisión crece logarítmicamente con número de opciones. **Reducir opciones = decisiones más rápidas**.

**Aplicación**:
- Tab Bar: 3-5 tabs (no 7)
- Forms stepwise: 1 decisión a la vez
- Menús con ≤7 ítems

### 4.6 Fitts's Law (Fitts 1954)

**Fuente**: Fitts, P. M. (1954). *The Information Capacity of the Human Motor System*.

**Concepto**: tiempo de alcance depende de tamaño y distancia del target.

**Aplicación**:
- Touch targets mínimo 44×44pt (Apple HIG)
- CTAs primarios en thumb-zone (Hoober 2013)
- Botones críticos grandes y cercanos al foco visual

### 4.7 Self-Determination Theory (Deci & Ryan 1985)

**Fuente**: Deci, E. L., & Ryan, R. M. (1985). *Intrinsic Motivation and Self-Determination*.

**Concepto**: 3 necesidades psicológicas: autonomía, competencia, relación.

**Aplicación en gamificación / engagement**:
- Reforzar competencia (progreso visible, récords personales)
- Respetar autonomía (toggles, no forzar)
- Evitar comparación social pública (Crowding-out effect)

### 4.8 Flow (Csikszentmihalyi 1990)

**Fuente**: Csikszentmihalyi, M. (1990). *Flow: The Psychology of Optimal Experience*.

**Concepto**: balance reto/habilidad → estado mental óptimo.

**Aplicación**:
- Distribuir carga (no overwhelm con 10 tareas simultáneas urgentes)
- Animaciones suaves (no abruptas)
- Eliminar interrupciones innecesarias

### 4.9 Variable Ratio Reinforcement (Skinner 1953)

**Fuente**: Skinner, B. F. (1953). *Science and Human Behavior*.

**Aplicación** (gamificación científica):
- Refuerzo positivo aleatorio ~30% rate (no predictivo)
- Pool grande de mensajes/recompensas para evitar saturación

### 4.10 Loss Aversion (Tversky & Kahneman 1981)

**Fuente**: Tversky, A., & Kahneman, D. (1981). *The Framing of Decisions*. Science 211.

**Aplicación**:
- Lenguaje positivo-neutro en confirmaciones (no alarmista)
- Framing de precios: "+$12" no "$12 de cargo extra"
- Evitar mecánicas de pérdida en gamificación laboral

### 4.11 Operant Conditioning anti-patterns (Werbach 2012, Mekler 2017)

**Fuentes**:
- Werbach, K., & Hunter, D. (2012). *For the Win*.
- Mekler, E. D., et al. (2017). *Towards understanding individual gamification elements*. Computers in Human Behavior.

**Anti-patterns prohibidos**:
- PBL (Points/Badges/Leaderboards) sin contexto significativo
- Loss aversion en contexto laboral
- Streaks rígidos (estresan)
- Time pressure visible (saca de flow)
- Comparison social peer-to-peer (riesgo discriminación, NN/g)

---

## 5. Estándares de UX/UI

### 5.1 Apple Human Interface Guidelines (2024)

**URL**: https://developer.apple.com/design/human-interface-guidelines/

Reglas aplicadas universalmente:
- Tab Bar 3-5 tabs en bottom
- Touch targets 44×44pt mínimo
- Feedback inmediato (≤100ms)
- Acciones destructivas con confirmación
- Spring physics como base del motion
- Dark mode default + auto-detect system
- Status bar consistent con context

### 5.2 Material Design 3 (2024)

**URL**: https://m3.material.io/

- Bottom Navigation 56-80dp
- Active state con indicator + filled icon
- Elevation shadows para layers
- Adaptive layouts por window-size class

### 5.3 Nielsen Norman Group — 10 Heurísticas (1994, rev. 2020)

**URL**: https://www.nngroup.com/articles/ten-usability-heuristics/

Las más invocadas:
- **H1 Visibility of system status**: SSE en tiempo real, badges, progress bars
- **H2 Match between system and real world**: vocabulario del usuario, no técnico
- **H3 User control and freedom**: undo, escape, no traps
- **H4 Consistency and standards**: misma navegación cross-roles
- **H5 Error prevention**: confirmación destructive, blocks IN_PROGRESS
- **H6 Recognition rather than recall**: visible options, autocomplete
- **H7 Flexibility and efficiency**: shortcuts para power users
- **H8 Aesthetic and minimalist design**: nada irrelevante
- **H9 Help users recover from errors**: mensajes específicos accionables
- **H10 Help and documentation**: contextual, no manual obligatorio

### 5.4 ISO 9241-110:2020

Principios de ergonomía interactiva aplicables:
- Autodescripción
- Controlabilidad
- Conformidad con expectativas del usuario
- Tolerancia a errores
- Idoneidad para individualización

### 5.5 Hoober Mobile Thumb-Zone (2013)

**Fuente**: Hoober, S. (2013). *How Do Users Really Hold Mobile Devices?* UXmatters.

- CTAs primarios en bottom-third
- Tab Bar bottom (no top)
- Acciones secundarias accesibles pero no en primary thumb-zone

---

## 6. Estándares de accesibilidad

### 6.1 WCAG 2.1 AA (W3C 2018)

**URL**: https://www.w3.org/WAI/WCAG21/quickref/

Requisitos no negociables:
- **Contraste**: 4.5:1 texto normal, 3:1 UI components, 7:1 AAA si es posible
- **Touch targets**: 44×44pt mínimo (alineado con Apple HIG)
- **Texto**: 16px mínimo body, 1.5 line-height
- **Motion**: respetar `prefers-reduced-motion` (web) / `AccessibilityInfo.isReduceMotionEnabled` (mobile)
- **Color encoding**: NUNCA solo color (ícono o forma siempre)
- **Keyboard navigation**: tab order lógico, no traps
- **Screen readers**: `accessibilityLabel`, `accessibilityRole` en toda interacción

### 6.2 Verificación

- Plugin Lighthouse para accessibility audit (web)
- VoiceOver / TalkBack manual testing antes de release
- Color contrast checker: https://webaim.org/resources/contrastchecker/

---

## 7. Patterns arquitectónicos

### 7.1 Bounded Contexts (Eric Evans 2003)

**Fuente**: Evans, E. (2003). *Domain-Driven Design*.

Cada feature/módulo es self-contained con su propio lenguaje, datos y reglas. Cross-domain coupling se documenta explícitamente con justificación.

**Estructura recomendada**:
```
src/features/<dominio>/
├── api/                  # data fetching del dominio
├── components/           # UI components específicas
├── screens/              # entry-point views
├── icons.tsx             # iconografía propia
└── types.ts              # types del dominio
```

### 7.2 Shared chrome + role-aware module

Para apps multi-rol/multi-área, mantener UN shell común (navegación, dashboard, settings) y rotar el CONTENIDO de las pantallas operativas según rol.

**Anti-pattern rechazado**: árboles de navegación 100% independientes por rol → DRY violado, multi-rol roto, Apple HIG violation.

### 7.3 Error handling de 4 capas

| Capa | Componente | Catch |
|---|---|---|
| Render | `ErrorBoundary` (class) | Excepciones en render tree |
| Async | `globalErrorHandler` | unhandledRejection + ErrorUtils |
| Network | `api/client.ts` | Typed errors (NetworkError vs ApiError) |
| Branded fallback | `ErrorScreen` | UI cuando algo se rompe |

**Justificación**: React Error Boundaries no atrapan async, event handlers, ni errores fuera de render.

### 7.4 API client robusto (Stripe pattern)

```ts
- AbortController + timeout (default 12s)
- Exponential backoff retry (250/500/1000ms)
- Typed errors: NetworkError vs ApiError (discriminated union)
- Solo retry idempotent requests (GET) por default
```

### 7.5 Time-aware adaptive UI (§37 Zenix)

**Fuente**: Pousman & Stasko 2006 (ACM, *Ambient Information Display*).

UI adapta su contenido según hora del día / contexto del usuario. Información que pierde valor en ciertos horarios se reemplaza por información relevante.

### 7.6 Pre-fetch + warm-up durante loaders

Durante el loader post-login, pre-fetch datos críticos del usuario y warm-up de cache. Reduce tiempo perceptual de transición a 0.

**Fuente**: Web Vitals "Prerendering" (Google 2020), TanStack Query prefetching.

### 7.7 Audit trail / append-only logs

Para datos sensibles (dinero, identidad, decisiones operacionales con consecuencias):
- Cada evento se registra en una tabla `<entity>Log` o `<entity>Event`
- Append-only: nunca update, nunca delete
- Incluye actor, timestamp UTC, payload contextual
- Sobrevive hard-delete de la entidad padre via anonimización de PII

### 7.8 Idempotency para crons

Cron jobs deben ser idempotentes:
- Tener semáforo (`lastProcessedDate`, etc.)
- Si se ejecuta 2× en el mismo período, la segunda es no-op
- No depender de orden de ejecución entre crons

### 7.9 Modular monolith (no microservices premature)

Usar módulos NestJS / packages dentro de un monolito antes de fragmentar. Microservicios solo cuando se justifique con métricas (escala, equipos separados, deploy cadence).

**Anti-pattern**: empezar con microservicios desde día 1. Sobre-engineering para apps <100K usuarios.

### 7.10 Counter-cyclical data fetching

Para datos que cambian frecuentemente:
- WebSocket / SSE para realtime
- TanStack Query para cache + background refetch
- Optimistic updates con rollback

---

## 8. Calidad de código

### 8.1 TypeScript strict

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true
  }
}
```

### 8.2 Comentarios JSDoc con racional

Toda función no-trivial documentada con:
- Qué hace
- Por qué se eligió este approach (citar fuente si aplica)
- Edge cases conocidos
- Lo que NO hace (boundary explicit)

### 8.3 Tests

| Capa | Cobertura mínima |
|---|---|
| Backend services con lógica de negocio | 80%+ unit |
| Backend cron jobs | 100% (idempotencia + edge cases timezone) |
| Backend endpoints críticos | E2E con Supertest |
| Frontend pure functions | 80%+ unit |
| Frontend componentes | smoke tests + interaction tests críticas |

### 8.4 Naming conventions

- Variables/funciones: `camelCase`
- Tipos/interfaces/clases: `PascalCase`
- Constantes globales: `UPPER_SNAKE`
- Booleans: `is/has/can/should` prefix
- Eventos: subject-verb (`taskCreated`, `userLoggedIn`)
- Endpoints: REST (`POST /v1/tasks`)

### 8.5 Anti-patterns prohibidos

- `any` sin justificación documentada
- Promise sin `.catch` o try-catch
- Magic numbers sin constante
- Mensajes hardcoded en componentes (i18n-ready desde día 1)
- console.log en producción (solo `__DEV__`)
- Comentarios obsoletos (eliminar al refactorizar)

---

## 9. Performance budgets

### 9.1 Mobile (React Native / Expo)

- 60fps consistente en device baseline (iPhone 11 / Pixel 4a)
- Boot time <3s en cold start
- Bundle size <5MB JS
- Animaciones en UI thread (Reanimated, no Animated legacy)

### 9.2 Web (React / Next.js)

- LCP (Largest Contentful Paint) <2.5s
- TTI (Time to Interactive) <3.8s
- CLS (Cumulative Layout Shift) <0.1
- Bundle size <250KB JS gzipped por route

### 9.3 Backend (Node.js / NestJS)

- p50 latency <100ms
- p95 latency <500ms
- p99 latency <2s
- Cold start <2s (serverless)

### 9.4 Database

- Queries con explicit `EXPLAIN ANALYZE` cuando se introducen
- Índices en columnas usadas en `WHERE`, `JOIN`, `ORDER BY`
- N+1 prevention via eager loading explícito
- Connection pool configurado por carga esperada

---

## 10. Seguridad baseline

### 10.1 Autenticación

- Tokens en SecureStore (mobile) / HttpOnly cookies (web)
- JWT con expiración corta (≤24h) + refresh token
- bcrypt rounds ≥10
- Rate limiting en endpoints de auth (login, signup, password reset)

### 10.2 Autorización

- RBAC explícito en cada endpoint protegido
- Guards declarativos (`@Roles(['SUPERVISOR'])` en NestJS)
- Tenant isolation cuando aplica (multi-tenant)

### 10.3 Datos sensibles

- PII (nombres, emails, teléfonos, documentos) cifrados en tránsito (HTTPS) y at-rest cuando sea legal-requerido
- Stack traces NUNCA expuestos al usuario en producción
- Logs en producción NUNCA contienen PII (use IDs, no contenido)
- Credenciales NUNCA en repo (env vars + secret manager)

### 10.4 Dependencias

- `npm audit` en CI
- Renovate / Dependabot para updates
- Pin versiones críticas
- Verify integrity con lockfile

### 10.5 Cumplimiento

Por industria:
- **Hotelería LATAM**: CFDI MX, DIAN CO, SUNAT PE, GDPR/LGPD/LFPDPPP
- **Médica**: HIPAA (US), GDPR (EU), LFPDPPP (MX)
- **Fintech**: PCI DSS, SOX (si público), reglamentos locales
- **Construcción**: regulaciones locales de seguridad ocupacional (OSHA, ISO 45001)

---

## 11. Documentación viva

### 11.1 Archivos obligatorios por proyecto

| Archivo | Propósito | Audiencia |
|---|---|---|
| `CLAUDE.md` | Source of truth del proyecto: contexto, decisiones específicas del dominio, flujos operativos | Devs + Claude Code |
| `ARCHITECTURE.md` | Architectural Decisions (AD-001, AD-002, ...) con contexto + alternativas + justificación | Devs |
| `STANDARDS.md` | Baseline para futuros proyectos similares | Devs nuevos |
| `docs/engineering-playbook.md` | (este archivo) Industry-agnostic foundation | Cualquier nuevo proyecto |
| `docs/<domain>-research.md` | Investigaciones de mercado, competidores, oportunidades | Product + Devs |
| `docs/<product>-roadmap.md` | Plan versionado (v1.0 / v1.1 / v1.2) | Stakeholders |
| `README.md` | Setup, dev workflow, comandos | Cualquiera |

### 11.2 Frecuencia de actualización

- `CLAUDE.md`: cada decisión no-negociable nueva
- `ARCHITECTURE.md`: cada AD nueva (numerada)
- `STANDARDS.md`: cuando se descubre un gotcha o pattern reusable
- Roadmap: cada cambio de scope

### 11.3 Plantilla AD (Architectural Decision)

```markdown
## AD-XXX — Título corto

**Estado**: ✅ Implementado | 🔄 En progreso | 📋 Aprobado | ❌ Rechazado
**Sprint**: NX

### Contexto
Por qué requiere decisión.

### Decisión
Qué se eligió.

### Alternativas evaluadas
| Opción | Pro | Contra | Veredicto |
|---|---|---|---|

### Justificación
Citaciones.

### Riesgos identificados
Mitigaciones.

### Referencias
Files + links.
```

---

## 12. Anti-patterns rechazados (con citación)

Lista consolidada de patterns que NO se implementan, con justificación verificable.

| Anti-pattern | Por qué se rechaza | Citación |
|---|---|---|
| **"Algo salió mal" / "An error occurred"** sin detalle | Vago, infantilizante, no accionable | Nielsen H9, Apple HIG, Mailchimp Style Guide |
| **Falla silenciosa** en gestures (drag&drop, swipe) | Usuario no entiende qué pasó, reintenta | NN/g 2020 *Drag-and-Drop Drop Zones* |
| **Drawer menus** para navegación primaria mobile | -30% feature usage vs visible nav | NN/g 2018 *Mobile Bottom Navigation* |
| **Spinning circle solo** sin brand | Sin identity, indistinguible | Hick's Law (más cues = recognition más rápido) |
| **Hardcoded timezones** | Rompe en cuanto hay cliente en otra zona | (auto-evidente, multi-país) |
| **Stack traces a usuarios en producción** | Security risk + scary UX | OWASP Top 10, Apple HIG security |
| **PBL gamification** (Points/Badges/Leaderboards) sin contexto | Fatiga rápida, no aumenta motivación intrínseca | Werbach 2012, Mekler 2017 |
| **Leaderboards públicos peer-vs-peer** | Discriminación + Crowding-out effect | Hanus & Fox 2015, Deci & Ryan 1999 |
| **Time pressure visible** (countdown timers) | Saca al usuario de flow | Csikszentmihalyi 1990 |
| **Color-only encoding** | 8% hombres con daltonismo | WCAG 2.1 AA |
| **Microservicios desde día 1** | Sobre-engineering para apps <100K users | Martin Fowler 2015 *MicroservicePremium* |
| **Premature abstraction** | Dificulta evolución, hot-paths se vuelven indirectos | Sandi Metz "Wrong abstraction worse than duplication" |
| **Confirmation post-action** ("¿estás seguro de que querías hacer X?") | Forcing function va antes, no después | Norman 1988, Apple HIG Destructive |
| **Indeterminate progress bar** sin razón | Implica duración específica que no podemos garantizar | Apple HIG Loading |
| **Auto-redirect en cualquier error** | Destructivo, pierde context del user | Apple HIG Error Handling |

---

## 13. Stack tecnológico recomendado

> Estos son los defaults que se eligen al iniciar un proyecto nuevo. Solo se cambian con justificación documentada.

### Mobile

| Capa | Tecnología | Razón |
|---|---|---|
| Runtime | Expo SDK más reciente (managed) | OTA updates, sin Xcode setup |
| Lenguaje | TypeScript strict | Type safety, refactor confidence |
| Navegación | expo-router file-based | Self-documenting, deep-linking |
| Animación | react-native-reanimated v4+ | UI thread, 60fps |
| Gestos | react-native-gesture-handler | Drag/swipe nativos |
| Estado servidor | Zustand (small) → TanStack Query (más grande) | Pragmático según escala |
| API client | fetch nativo + AbortController + retry custom | Bundle slim, control total |
| Iconos | react-native-svg + componentes inline | Vectores nítidos cualquier densidad |
| Haptics | expo-haptics | Apple HIG standard |
| Audio | expo-audio | Reemplazo oficial de expo-av |
| Push | expo-notifications | Estándar de la industria mobile |

### Web

| Capa | Tecnología | Razón |
|---|---|---|
| Runtime | Vite + React 19 | Build rápido, ecosystem maduro |
| Lenguaje | TypeScript strict | Idem mobile |
| Routing | React Router v6 | Estándar de la industria |
| State server | TanStack Query | Cache + refetch + optimistic updates |
| Estado client | Zustand (auth) o Context (compartido) | Pragmático |
| CSS | Tailwind CSS | Speed + design system tokens |
| Components | Shadcn/ui (no library lock-in) | Copy-paste, customizable |

### Backend

| Capa | Tecnología | Razón |
|---|---|---|
| Runtime | Node.js LTS | Ecosystem JS unificado |
| Framework | NestJS | DI, decorators, modular |
| ORM | Prisma | Type safety, migrations |
| Database | PostgreSQL | Transactional, JSONB, partial indexes |
| Auth | @nestjs/jwt + bcrypt | Standard JWT |
| Realtime | SSE (Server-Sent Events) | Más simple que WebSocket cuando solo server→client |
| Background jobs | @nestjs/schedule (cron) | Built-in NestJS |
| Validation | class-validator | Decorator-based, integra con NestJS pipes |
| Tests | Jest + Supertest | Standard |

### DevOps

| Necesidad | Tecnología |
|---|---|
| Monorepo | Turborepo + npm workspaces |
| CI | GitHub Actions / GitLab CI |
| Deploy mobile | EAS Build + EAS Update |
| Deploy backend | Docker + (Railway / Fly.io / AWS ECS) |
| Logging | Pino structured logs |
| Errors prod | Sentry (al pasar de prototype a beta) |
| Monitoring | Datadog / Grafana (post-launch) |

### NO usar (anti-recommendations)

- **axios** — fetch nativo + utility wrapper es suficiente
- **Redux Toolkit** — Zustand + TanStack Query cubre 90% de casos
- **MongoDB** para apps con relaciones complejas — usar PostgreSQL
- **Microservicios** desde día 1 — empezar monolithic
- **GraphQL** sin caso de uso real (multiple clients with different shapes) — REST + TanStack Query suele bastar
- **Material UI / Ant Design** — design system propio + Shadcn/ui da más control

---

## 14. Referencias canónicas

### Diseño UX/UI

- **Apple Human Interface Guidelines**: https://developer.apple.com/design/human-interface-guidelines/
- **Material Design 3**: https://m3.material.io/
- **Nielsen Norman Group**: https://www.nngroup.com/
- **Don Norman, *The Design of Everyday Things***: ISBN 978-0465050659
- **Luke Wroblewski, Mobile First**: ISBN 978-1937557027
- **Hoober, Designing Mobile Interfaces**: O'Reilly 2011

### Psicología cognitiva

- Sweller, J. (1988). *Cognitive Load During Problem Solving*. Cognitive Science 12(2)
- Miller, G. A. (1956). *The Magical Number Seven, Plus or Minus Two*. Psychological Review 63(2)
- Treisman, A. (1980). *A Feature-Integration Theory of Attention*. Cognitive Psychology 12(1)
- Hick, W. E. (1952). *On the Rate of Gain of Information*. QJEP 4(1)
- Fitts, P. M. (1954). *The Information Capacity of the Human Motor System*. JEP 47(6)
- Csikszentmihalyi, M. (1990). *Flow: The Psychology of Optimal Experience*
- Kahneman, D. (2011). *Thinking, Fast and Slow*. ISBN 978-0374275631

### Motivación y gamificación

- Deci, E. L., & Ryan, R. M. (1985). *Intrinsic Motivation and Self-Determination*
- Werbach, K., & Hunter, D. (2012). *For the Win*. Wharton Digital Press
- Mekler, E. D., et al. (2017). *Towards understanding individual gamification elements*. CHB
- Yu-kai Chou (2015). *Actionable Gamification: Beyond Points, Badges, and Leaderboards*

### Arquitectura de software

- Eric Evans (2003). *Domain-Driven Design*. ISBN 978-0321125217
- Robert C. Martin (2008). *Clean Code*. ISBN 978-0132350884
- Martin Fowler. *Microservices Premium*: https://martinfowler.com/articles/microservice-premium.html
- Sandi Metz. *The Wrong Abstraction*: https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction

### Estándares industriales

- WCAG 2.1: https://www.w3.org/WAI/WCAG21/quickref/
- ISO 9241-110:2020 (ergonomía interactiva)
- WebAIM contrast checker: https://webaim.org/resources/contrastchecker/

### Performance

- Web Vitals: https://web.dev/vitals/
- Apple HIG Performance: https://developer.apple.com/design/human-interface-guidelines/performance

### Seguridad

- OWASP Top 10: https://owasp.org/www-project-top-ten/
- PCI DSS: https://www.pcisecuritystandards.org/

### Industria-específica

- **Hotelería**: AHLEI textbooks, USALI 12ª ed., ISAHC best practices
- **Médica**: HIPAA, NIST 800-66 compliance
- **Fintech**: SOX, PCI DSS, FFIEC guidance
- **Construcción**: OSHA, ISO 45001

---

## Cómo iniciar un nuevo proyecto con este playbook

```bash
# 1. Crear estructura monorepo
mkdir <new-project> && cd <new-project>
mkdir -p apps packages docs

# 2. Copiar este playbook
cp /path/to/zenix/docs/engineering-playbook.md docs/engineering-playbook.md

# 3. Crear CLAUDE.md específico del proyecto referenciando el playbook
cat > CLAUDE.md <<'EOF'
# <Nombre Proyecto> — Source of Truth

> Este proyecto sigue el ZaharDev Engineering Playbook
> (`docs/engineering-playbook.md`). Toda decisión arquitectónica,
> de UX/UI o de calidad de código se rige por ese documento.
>
> Este archivo CLAUDE.md captura las decisiones ESPECÍFICAS de este
> proyecto/dominio que no están en el playbook universal.

## Contexto del proyecto

[Industria, target users, stakeholders]

## Decisiones no-negociables específicas del dominio

[Lo que aplica a esta industria — fiscal, regulatorio, etc.]

## Flujos operativos

[Diagramas + descripción]
EOF

# 4. Crear ARCHITECTURE.md
touch ARCHITECTURE.md

# 5. Iniciar conversación con Claude Code:
#    "Aplica el playbook de ZaharDev en docs/engineering-playbook.md
#     a este proyecto de [industria]. Necesito ayuda con [primer task]."
```

---

> **Mantra de ZaharDev**: *"Toda decisión justificada con datos. Toda contrapropuesta argumentada. Todo riesgo identificado. Software serio, profesional y definitivo — no improvisación."*
