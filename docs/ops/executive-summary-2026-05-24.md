# Executive Summary — Decisiones Operativas Zenix v1.0.0

> **Audiencia**: Abraham (owner/CEO) — referencia rápida sin leer los 4 docs de 2000+ líneas.
> Generado 2026-05-24 tras debate de arquitectura/devops/testing/tooling.
> Cada bullet apunta al doc completo para profundidad.

---

## Mensajes ejecutivos clave

### 1. Tooling — `docs/ops/zenix-tooling-catalog.md`

- **Stack mínimo v1.0.0 piloto = ~$150-180/mes**. Vercel ($20) + Render ($25) + Neon ($19) + Cloudflare DNS ($0) + Claude Pro ($20) + lo que ya pagas.
- **Faltan integrar antes de GA** (release blockers): Sentry ($0 free tier), Resend ($20), Google Cloud Maps ($20 budget), Cloudflare R2 ($5), BetterStack uptime ($0-25). **Total adicional**: ~$70-90/mes → stack pre-launch ≈ **$220-270/mes**.
- **ElevenLabs ($22-330/mes)** para AI voice multilingual marketing — evaluación abierta cuando arranque sales motion.
- **Unsplash + Pexels gratis** para image bank piloto. Suficiente hasta tener fotógrafo propio.
- **PostHog free tier** para product analytics (1M events/mes). Single source funnel.
- **Descartadas explícitas con razón** (no re-debatir): PayPal, Avalara, Vertex, Eventbrite, SiteMinder, Cirium/OAG enterprise, Shutterstock/Getty, Google Analytics 4. Ver §12 del catálogo.
- **Curva costos**: Piloto $200 → v1.0.0 launch $300-500 → Fase 2 (10-50 hoteles) $1-3k → Fase 3 (50-200 hoteles) $5-15k → Enterprise 200+ $30-100k. Escala sub-lineal hasta Fase 3.

### 2. Deployment con clientes en producción — `docs/ops/zero-downtime-deployment.md`

- **70% de releases son rolling deploy** (default Render/Vercel). Sin esfuerzo extra. Solo cambios sin schema migration + sin breaking JWT/contract.
- **Patrón crítico: Expand-Contract para DB migrations**. Inventado por GitHub + Stripe. Nunca cambies columna en un solo paso si hay tráfico productivo. Divide en 3 releases:
  - A — agrega lo nuevo NULLABLE (instant)
  - B — backfill en batches (fuera de horario peak)
  - C — SET NOT NULL (instant porque ya todas las filas tienen valor)
- **Ventanas prohibidas de deploy**:
  - 7:00-11:00 hora local hotel (checkout + planning peak)
  - 14:00-18:00 (check-in peak)
  - Viernes-sábado noche (OTA spike)
- **Ventana ideal**: martes/miércoles 10:00 CST.
- **Runbook obligatorio per release** (template completo en doc §9): pre-merge → tag → backup verify → deploy window → smoke test → 30min validate → 24h closeout.
- **Rollback criteria** explícitos: error rate >2x baseline 5min consecutivos, 5xx >1% requests, DB saturation >90%, ≥1 payment workflow roto reportado por cliente → rollback inmediato.
- **Costo**: 4-6 días-dev pre-v1.0.0 para tener Sentry+BetterStack+healthcheck+smoke tests+runbook ensayado 1x.

### 3. Capacity 100 hoteles temporada alta — `docs/ops/capacity-planning-and-observability.md`

- **Stack actual maneja 50-80 hoteles cómodo**. Para 100 hoteles temporada alta necesitas 6 ajustes específicos:
  - Render API a 4GB RAM + 2 instances (+$50/mes, trigger 30 hoteles)
  - PgBouncer + Prisma `connection_limit=20` ($0, trigger 30)
  - 5 workers paralelos ChannexOutbound ($0, trigger 50)
  - Cron banding por timezone ($0, trigger 50)
  - Read replica Neon para reports (+$20, trigger 70)
  - Migration a AWS Fargate Fase 2 (+$300-500, trigger 100+)
  - **Total escalado a 100 hoteles**: ~$400/mes infra + 8-12 días-dev.
- **El "cap 5000 entries" preguntaste**: es POR REQUEST HTTP, no por hotel. Cada consultor edita 1 property a la vez. El cuello real es el rate limit 20 ARI/min/property de Channex (no podemos subirlo). Mecanismo de priority en `ChannexOutboundQueue` ya existe; UX Day 8+ debe avisar "tu cambio se propaga en 4-6h, acciones de recepción siguen normales".
- **CEO Dashboard de 4 layers** (research ya hecho en `docs/research/dashboard-user-research.md`):
  - **Layer 1 — Tira de vida always-visible**: salud sistema + reservas última hora + pagos última hora + Channex sync lag.
  - **Layer 2 — Operacional diario**: reservas hoy vs YoY + check-ins exitosos + cancellation rate + DEAD_LETTER count.
  - **Layer 3 — Estratégico semanal**: MRR + churn + NPS + ADR/RevPAR cluster.
  - **Layer 4 — Capacity tech debt**: CPU/RAM/DB saturation + error budget burn + Channex queue depth.
- **SLO recomendado v1.0.x**: 99.9% availability (= 43min downtime tolerable/mes). Burn rate alerting evita degradación silenciosa.

### 4. Testing pre-v1.0.0 — `docs/ops/testing-strategy-pre-v1.0.0.md`

- **12 familias de testing** reconocidas en industria. Para Zenix pre-v1.0.0:
  - **MUST (6)**: Unit, Integration, E2E, Smoke, Regression (auto), Load.
  - **SHOULD (4)**: Stress, Soak, Security, a11y.
  - **NICE (2)**: Chaos (post-launch), UAT (en proceso con hotel piloto).
- **Estado actual repo**: Unit + Integration verdes (305+ tests). Channex cert verdes (11). **Gaps críticos**: 0 E2E specs, 0 smoke tests, 0 load tests, 0 security scanner CI, 0 a11y CI.
- **Sprint OPS-α sugerido pre-v1.0.0 GA**: 10 días-dev cubriendo Sentry+BetterStack+healthcheck+OpenTelemetry+PostHog+smoke+Snyk+axe-core+Lighthouse+k6+CEO Dashboard widgets. Tools subscriptions $0 incremental (todos free tiers).
- **Stack testing recomendado**:
  - Unit: Jest (ya en uso)
  - E2E: **Playwright** (2x más rápido que Cypress, multi-browser nativo)
  - Load/stress/soak: **k6** by Grafana Labs ($0 OSS)
  - Security: Snyk en CI + OWASP ZAP baseline pre-release + pen-test externo post-launch ($3-8k USD una vez)
  - a11y: axe-core en Playwright + Lighthouse CI
- **Pirámide ideal**: 70% Unit + 20% Integration + 10% E2E. Smoke/Load/Security/a11y son verticals adicionales.
- **Anti-patterns explícitos** (no caer en estos): 100% coverage como meta, test-after retroactivo, mock everything, E2E para todo, skip flakys indefinidamente.

---

## Decisiones financieras pre-GA — orden de aprobación owner

| Item | Costo | Justificación | Cuándo |
|---|---|---|---|
| Sprint OPS-α (10 días-dev) | tiempo del owner | Sin observability, GA = ciego | Post-Day 20 sprint actual |
| Sentry + BetterStack + Resend + R2 + GCloud | +$70-90/mes | Release blockers | Día 1 OPS-α |
| Channex production tier client | pass-through al hotel | Para conectar OTAs reales | Cliente firma piloto |
| Mifiel sandbox (NOM-151) | $0 (sandbox) | Para SIGN-DLC v1.1.x | Owner activa cuenta esta semana |
| Pen-test externo HackerOne | $3-8k USD una vez | Compliance + chargeback evidence + reputational | Post-v1.0.0 launch +2 semanas |
| Google Cloud production keys | $20 budget/mes inicial | Places + Geocoding APIs | Día 4 OPS-α o antes |
| PredictHQ trial 14 días | $0 trial | Validar antes del Premium tier | Owner activa cuando quiera |
| Estimación total adicional fija v1.0.0 GA | **~$120/mes recurring + $3-8k one-time** | | |

---

## Triggers de scale-up — recetas listas (de mayor probabilidad a menor)

| Síntoma | Recipe | Doc ref |
|---|---|---|
| API Memory >85% sostenido | Upgrade Render a 4GB ($75) | capacity §3.1 |
| API CPU >80% sostenido | 2 instances Render ($75 total) | capacity §3.2 |
| DB query slow + pg_stat_statements top | Add index → PgBouncer → connection_limit → read replica → particion → Aurora | capacity §3.3 |
| Channex outbound queue depth >500 | Spawn paralelo workers (no hay nada más) | capacity §3.4 |
| DB disk >80% | Neon Scale autoscale 200GB → archive cold partition >365d → move blobs a R2 | capacity §3.5 |

---

## Anti-patterns explícitos — NO HACER

- ❌ Deploy abrupto sin runbook a clientes en producción
- ❌ DROP COLUMN sin paso previo de deprecate 7 días
- ❌ `prisma migrate dev` en prod (puede reset DB)
- ❌ Cookie banner GDPR pain → no usar Google Analytics 4
- ❌ Habilitar Cancel button durante isPending modal (band-aid prohibido §122)
- ❌ Crear `new EventSource()` fuera de `sseClient.ts` (singleton §124)
- ❌ Reinventar contenedores modales — usar Radix Dialog primitives (§116)
- ❌ Mock everything en tests — integration con DB real (Testcontainers)
- ❌ 100% coverage como meta — incentiva tests triviales
- ❌ Sobre-construir observability ahora — 5 dashboards críticos + 10 alertas = done

---

## Próximos sprints sugeridos post-NOVA-CHANNEX-COMMAND-CENTER

| Sprint | Días-dev | Bloquea v1.0.0 GA? | Prioridad |
|---|---|---|---|
| **OPS-α** (Sentry + BetterStack + smoke + load + healthcheck + CEO Dashboard) | 10 | SÍ | 1 |
| **SEC-β** (Snyk CI + OWASP ZAP baseline + headers helmet + rate limit login) | 2-3 | SÍ | 2 |
| **QA-α** (Playwright E2E 5-7 specs + axe-core integration) | 6-8 | SÍ | 3 |
| **Pen-test externo** (HackerOne marketplace) | calendar 1-2 sem | NO (post-launch) | 4 |
| **CHECK-IN modal redesign** (Apple HIG SwiftUI Form max-w-2xl) | 1-2 | recomendado | 5 |
| **RATES-METRICS-COMPSET-CORE** (revenue blocker) | 20-23 | SÍ | 6 |

**Total días-dev pre-v1.0.0 estimado**: ~20-25 días-dev distribuidos en 4-5 semanas calendar (1 dev secuencial).

---

## Cómo usar este doc

- **Cuando alguien pregunte "qué pasa con X tool"** → busca tabla en `zenix-tooling-catalog.md`.
- **Cuando tengas que hacer release** → sigue runbook en `zero-downtime-deployment.md §9`.
- **Cuando un cliente pregunte "puedes manejar mi hotel grande"** → respondes con números de `capacity-planning-and-observability.md §1` (50-80 hoteles cómodo HOY).
- **Cuando dev nuevo entre al equipo** → primer week reading list: este doc + CLAUDE.md + NOVA-architecture.md + uno de los 4 ops docs según rol.
- **Cuando alguien proponga "agreguemos X testing"** → checa si ya está en `testing-strategy §2` con prioridad asignada. Si NO está, debate primero por qué se sale de los 12 que cubrimos.
