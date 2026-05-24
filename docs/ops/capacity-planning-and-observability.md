# Capacity Planning + CEO Observability Dashboard — Zenix

> **Pregunta del owner (2026-05-24)**:
> *"Si tenemos 100 hoteles en temporada alta enviando muchas peticiones al mismo tiempo, ¿estamos preparados? ¿Cómo voy a saber cuándo ampliar disco/RAM/CPU?"*
>
> **Respuesta corta**: hoy el sistema sostiene cómodamente ~50-80 hoteles activos sin tocar nada. Más allá necesitas decisiones específicas (sharding, read replicas, queue workers paralelos). Esto se mide y se predice — no se adivina.
>
> Este doc tiene 3 partes: (1) capacity estimada con números reales, (2) métricas que el CEO debe ver, (3) triggers concretos de scale-up.

---

## 1. Capacity estimada con números reales — back-of-envelope honest

### Escenario base: 100 hoteles × temporada alta

Asumamos:
- 100 hoteles boutique × promedio 25 rooms = 2500 rooms total
- Temporada alta = 85% occupancy = ~2100 stays activos
- Reservas OTA promedio = 8 per día per hotel = 800 webhooks/día = ~10/min en peak
- Operaciones de recepción peak (14:00-18:00) = 5 actions/min por hotel = 500/min cluster
- SSE connections simultáneas = ~2 staff por hotel × 100 = 200 active EventSources
- Mobile housekeeper sessions = 4 housekeepers × 100 = 400 SSE + push

### Carga real estimada

| Métrica | Volumen peak | Ventana |
|---|---|---|
| HTTP requests/segundo | 50-80 | Sostenido durante check-in peak |
| HTTP requests/segundo SPIKE | 150-200 | Rate calendar bulk PATCH simultáneo de 5+ consultores |
| Channex inbound webhooks/min | 10-15 | 24/7 con peaks 30-50 viernes noche |
| Channex outbound queue depth | 200-500 entries | Tras bulk PATCH grande |
| SSE concurrent connections | 600-800 | Sostenido en horario operativo |
| DB queries/segundo | 150-300 | Mix R/W 70/30 |
| DB connections active | 30-60 | Pool size required ≥80 |
| Disk usage growth/mes | ~2-5 GB | 100 hoteles × ~25-50 MB cada (audit log + payments) |
| RAM working set por instancia | 600 MB - 1.2 GB | NestJS + Prisma + active SSE handlers |

### Capacity de la stack Fase 1 (Vercel + Render + Neon)

| Recurso | Plan actual | Headroom hasta cap | Veredicto 100 hoteles |
|---|---|---|---|
| **Render API container** (Standard $25) | 1 instance, 2GB RAM, 1 CPU | ~150 req/s sostenido | ⚠️ ATENCIÓN — viene apretado, requiere escalar a 2-3 instances ($75-100/mes) |
| **Neon Postgres Scale** ($19) | 0.25-7 CU autoscale, hasta 64GB RAM | ~500 queries/s | ✅ OK hasta ~200 hoteles |
| **Vercel Web** (Pro $20) | Edge + ISR, ilimitado req | n/a (serverless) | ✅ OK indefinido |
| **Channex rate limit** (cliente del cliente) | 20 ARI ops/min per property | n/a per property | ✅ TokenBucket ya implementado (§143) |
| **SSE singleton** (1 EventSource per browser tab) | 1 connection × 200 staff | Node default fd limit ~1024 | ✅ OK con tuning a 8192 fd |
| **Outbox queue depth** | Postgres table, sin cap nativo | Workers procesan 60 entries/min (TokenBucket) | ⚠️ Para 100 hoteles peak puede acumular si workers solo 1 — necesita 2-3 workers |

### Verdadero cuello de botella (de adentro hacia afuera)

1. **Render API container memory** — 2GB RAM se quedan cortos con 600+ SSE simultáneos. Cada SSE = ~1-2 MB working set. → Necesitamos 4GB RAM ($75) o 2 instances de 2GB ($50) con sticky sessions desactivado (SSE singleton ya tolerante).

2. **Channex outbound queue throughput** — 20 ARI ops/min/property × 100 properties = 2000 ops/min total cluster cap. Con 1 worker procesando, max ~60 ops/min. **→ Spawn 5+ workers paralelos** (cada uno respeta su TokenBucket per-property).

3. **DB connection pool** — Prisma default `connection_limit=num_cpus + 1`. Con 2 CPU = 3 connections. Para 100 hoteles necesitamos `connection_limit=20` en string Neon + activar PgBouncer.

4. **NightAudit + MorningRoster cron** — al ejecutar para 100 properties secuencial = ~2-5 min wall-clock. Si overlaps con check-in peak crea spike DB. → Particionar cron en bandas de timezone (todas MX-Centro a las 02:00, todas LATAM Andes a 02:00, etc.).

### Veredicto honesto

**Hoy (v1.0.0 piloto)**: stack actual maneja 10-30 hoteles sin sudar.

**100 hoteles temporada alta**: necesita 4-6 ajustes específicos antes de llegar:

| Cambio | Costo extra/mes | Sprint estimado | Bloquea? |
|---|---|---|---|
| Upgrade Render API a 4GB + 2 instances | +$50 | 1d-dev (config) | trigger 30 hoteles |
| PgBouncer enabled + Prisma `connection_limit=20` | $0 | 0.5d | trigger 30 hoteles |
| 5 paralelos workers ChannexOutbound | $0 (mismo container) | 1d code | trigger 50 hoteles |
| Cron banding por timezone | $0 | 1.5d code | trigger 50 hoteles |
| Read replica Neon para reports | +$20 | 1d (Prisma `directUrl`) | trigger 70 hoteles |
| Migration a AWS Fargate Fase 2 | +$300-500 | 5-8 días | trigger 100+ hoteles |

**Total escalado hasta 100 hoteles**: ~$400/mes infra + 8-12 días-dev distribuidos en sprints.

### El cap "5000 entries" que preguntaste

El cap defensivo en `bulkUpdate` es **por request HTTP**, no por hotel. Cada consultor edita 1 property a la vez. Si 5 consultores en 5 hoteles distintos hacen bulk PATCH simultáneamente con 5000 entries cada uno, eso es:

- 5 requests HTTP llegando casi-simultáneos
- API procesa cada uno: load mapping (1 query) → validate (in-memory) → emit event (in-memory) → audit write (1 query)
- DB carga: ~10 queries/request × 5 = 50 queries
- Channex outbound: 5 × 5000 = 25000 entries en la cola, divididas en chunks por TokenBucket (20/min/property) → drena en ~250 min (4h) total
- **No-go**: si los 5 consultores esperan que Channex propague rápido, 4h es inaceptable

**Solución (Day 7+)**:
1. Subir el TokenBucket per-property no es viable (Channex impone el límite).
2. Lo que SÍ podemos hacer: **stream priority** — outbound queue ya tiene `priority` field. Bulk PATCH va con `priority=50` (normal). Acciones de recepción (cancel reservation, register payment) van con `priority=100` (alta). Los workers drenan high-priority primero.
3. UI debe avisar: "Tu cambio está propagándose a las OTAs en 4-6 horas. Las acciones de recepción seguirán normales."

Ya tienes el mecanismo (`ChannexOutboundQueue.priority` en schema). Day 7 / 8 lo ata en UX.

---

## 2. CEO Observability Dashboard — qué debe ver el owner

> **Principio NN/g + Pousman & Stasko 2006 (Ambient Information)**: el CEO no es DevOps. Necesita **3-5 indicadores** que respondan "¿está todo OK?" en una vista.
> Granularidad detallada es para el desarrollador / SRE. El CEO ve agregados con trend.

### Layer 1 — Tira de vida (always visible top)

| Indicador | Verde | Amarillo | Rojo |
|---|---|---|---|
| **Salud sistema** | Todo OK | 1 component degraded | 1+ critical down |
| **Clientes activos hoy** | Trend ↑/→ | Trend ↓ <5% | Trend ↓ >10% |
| **Reservas última hora** | dentro de norma | -20% to -50% | -50% o caída cero |
| **Pagos procesados última hora** | norma | -20% | caída total |
| **Channex sync** | <30s ack lag | 30s-5min | >5min sin ack |

Esta tira mide **"¿estoy perdiendo dinero ahora mismo?"**. Si está roja, NADA más importa.

### Layer 2 — Operacional (resumen diario)

| Métrica | Qué cuenta | Acción CEO |
|---|---|---|
| **Reservas creadas hoy (vs ayer / vs YoY)** | Top of funnel del negocio | OK si trend; reportar a partner si dip |
| **Check-ins exitosos hoy** | Conversion del funnel | dip = problema operativo recepcionistas |
| **Cancellations rate (vs baseline)** | Calidad del producto / lead | spike = problema OTA o rate |
| **Pagos failed rate** | Salud Stripe/Conekta | spike = investigar PSP |
| **DEAD_LETTER count Channex** | Integración OTA quebrada | >0 = supervisor cliente debe revisar |
| **Conflict Channex queue** | Overbooking risk | >0 = recepción debe resolver manual |
| **Tickets de soporte abiertos** | Salud cliente happiness | trend = invertir en docs/UX |

### Layer 3 — Estratégico (resumen semanal/mensual)

| Métrica | Trade-off |
|---|---|
| **MRR (Monthly Recurring Revenue)** | Crecimiento financiero |
| **Churn rate** | Retención clientes |
| **NPS / CSAT promedio** | Satisfacción |
| **ADR promedio cluster** | Capacidad de Zenix de optimizar pricing |
| **RevPAR promedio cluster** | Mismo, demand intelligence working |
| **Properties activas / total contratadas** | Onboarding velocity |
| **Avg time-to-activate** | Wizard Zenix Activate effectiveness |
| **Partner-driven revenue %** | Salud del programa partner |

### Layer 4 — Capacity / Tech Debt (lo que preguntaste)

| Métrica | Verde | Amarillo | Rojo | Acción |
|---|---|---|---|---|
| **API CPU utilization avg** | <60% | 60-80% | >80% | Scale up instance |
| **API memory utilization avg** | <70% | 70-85% | >85% | Scale up instance o increase RAM |
| **DB connection pool saturation** | <60% | 60-80% | >80% | Increase Prisma pool size + PgBouncer |
| **DB disk usage** | <70% | 70-85% | >85% | Upgrade Neon plan (autoscale catches a veces) |
| **DB IOPS sustained** | <70% provisioned | 70-90% | >90% | Upgrade plan o partition/archive |
| **Error budget burn rate (SLO 99.9%)** | <1x | 1-3x | >3x | Investigar incident root cause |
| **P95 latency / endpoint** | dentro 95th percentile baseline | +20% | +50% | Profile + index review |
| **Channex outbound queue depth** | <100 | 100-500 | >500 | Add workers o investigate Channex slow |
| **Channex outbound oldest entry age** | <2min | 2-10min | >10min | Investigate worker stuck |
| **Sentry error rate** | <0.5% requests | 0.5-2% | >2% | Triage top error |
| **Background job lag** (cron) | <5min | 5-30min | >30min | Investigate scheduler |

**Implementación CEO Dashboard**: ya está documentado el research en `docs/research/dashboard-user-research.md` (1064 líneas, 47 verbatim quotes de owners reales). Aplicar esa investigación al Nova landing `/nova/dashboard` (Day 9+).

---

## 3. Triggers concretos de scale-up — recetas listas

> **Regla heurística (Google SRE)**: provision capacity para 2x el peak histórico de las últimas 4 semanas. Si pasas el 50% del provisioned, planifica scale-up. Si pasas el 70%, scale-up ahora.

### 3.1 "Necesito más RAM"

**Síntomas**: P95 latency creciendo + OOMKilled eventos en Render logs + memory utilization > 85% sostenido.

**Diagnóstico**: ¿Memory leak (memoria sube monotonic sin volver) o working set legítimo (sube/baja con tráfico)?

```bash
# En Render dashboard → Metrics → Memory
# Si gráfica es escalera siempre arriba → LEAK
# Si es serrucho con peaks correlacionados a tráfico → working set legítimo
```

**Acción si LEAK**: heap snapshot con Node `--heap-prof` flag, diff vs baseline. Bug fix.

**Acción si working set**: upgrade Render plan (2GB → 4GB → 8GB es 1 click + reinicia rolling).

### 3.2 "Necesito más CPU"

**Síntomas**: P95 latency creciendo + CPU >80% sostenido + 502/504 errors aparecen.

**Diagnóstico**: clasificar requests por tipo:
- Si son endpoints reportes/aggregations → SQL no usa índice. Profile con `EXPLAIN ANALYZE`.
- Si son PDFs/Puppeteer → Chromium consume CPU. Limita concurrent Page count.
- Si es uniform across → genuino growth, scale horizontal.

**Acción**: 
- 2 instances en lugar de 1 (Render: bump `numInstances=2`). API ya es stateless (CLS contexto via JWT/middleware). Sin session affinity necesaria.
- Verificar SSE singleton respeta múltiples backends (sí, cada cliente conecta a uno arbitrario, no broadcast cross-backend — está OK porque eventos se generan en el backend que recibió la mutation y emite via EventEmitter local + SSE local. Para multi-backend necesitarías Redis pub/sub, Phase 2 trigger).

### 3.3 "Necesito más DB capacity"

**Síntomas**: 
- DB CPU >80% Neon dashboard
- Query latency creciendo (P95 endpoint correlacionado a una query específica)
- `pg_stat_statements` muestra top-1 query consumes >30% time

**Diagnóstico**:
```sql
SELECT query, calls, mean_exec_time, total_exec_time / 1000.0 / 60 AS total_minutes
FROM pg_stat_statements
ORDER BY total_exec_time DESC LIMIT 10;
```

**Acciones (orden de costo creciente)**:
1. Add index a la columna del WHERE más común — gratis, sub-second despliegue.
2. PgBouncer enabled — incluido Neon, configurar pool mode `transaction`.
3. Increase Prisma `connection_limit` en URL.
4. Read replica para queries de reports — Neon $20+ extra, configurar `directUrl` separado en Prisma.
5. Particionar tabla grande (audit_log) por month — 1 día-dev planning + ALTER TABLE.
6. Move cold data a S3/R2 (audit > 365d, payment_logs > 5y CFDI retention) — sprint REPORTS-CORE.
7. Upgrade Neon plan a Pro/Enterprise — 10x capacity.
8. Migrate a RDS Multi-AZ Aurora — Fase 2 sprint.

### 3.4 "Necesito más Channex throughput"

**No puedes**. El rate limit 20 ARI/min lo impone Channex. Lo que puedes:

1. **Verificar TokenBucket utilization** (admin endpoint `/v1/channex/admin/state`). Si saturado → es operativa cliente, no infra.
2. **Priorizar high-priority items** (cancels manuales > bulk PATCH rate calendar). Ya implementado.
3. **Reducir entries innecesarios** en outbound — dedup ya lo hace via `payloadHash` 5s window.
4. **Negociar con Channex partner success** — si tu volumen lo justifica, suben el rate limit.

### 3.5 "Necesito más disk"

**Síntomas**: Neon storage usage > 80%.

**Diagnóstico**:
```sql
SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) AS size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC LIMIT 20;
```

Top consumidores típicos: `audit_logs`, `channex_outbox`, `channex_webhook_log`, `payment_logs`, `task_logs`.

**Acciones**:
1. Neon Scale plan autoscale storage hasta 200GB sin acción. Verifica plan.
2. Archive cold partition (audit > 365d, channex_outbox SUCCEEDED > 90d) — script monthly cron.
3. Compress JSON payloads grandes con `pg_column_compression` (PG14+).
4. Move binary blobs (raw webhook payload >100KB) a R2 con pointer en DB.

---

## 4. SLO + Error Budget — disciplina de operación

### Service Level Objectives (recomendación v1.0.x)

| Objective | Target | Window |
|---|---|---|
| **API availability** | 99.9% (43min downtime/mes) | Rolling 30 días |
| **API P95 latency** | <800ms (todos los endpoints excepto reportes) | Rolling 7 días |
| **Channex webhook ack latency** | <2s P95 | Rolling 24h |
| **SSE reconnect time post-deploy** | <5s P95 | Per deploy |
| **Payment success rate** | >99.5% (Stripe + Conekta combinados) | Rolling 7 días |

### Error budget

Si tu SLO es 99.9% availability:
- Budget = 0.1% × 30 días × 24h × 60min = **43 min downtime tolerable/mes**

Si consumes 30 min en una sola caída, tu budget restante para el mes = 13 min. Si llegas a 0 → "feature freeze" hasta el siguiente reset (mes nuevo). Es disciplina psicológica que invierte el incentivo: si rompes mucho, no entregas nada nuevo hasta que arregles.

### Burn rate alerting

| Burn rate | Significado | Acción |
|---|---|---|
| 1x (steady) | Quemas según presupuesto, todo normal | Nada |
| 2x sostenido 6h | Quemarías el budget mensual en 15 días | Page on-call (warning) |
| 10x sostenido 1h | Quemarías el budget en 3 días | Page on-call (critical) |
| 100x cualquier momento | Quemarías el budget en 7h | All-hands, rollback |

Esta es la herramienta más útil del SRE handbook de Google. Mucho mejor que alertas de threshold absoluto.

---

## 5. Métricas técnicas — qué instrumentar (con OpenTelemetry)

OpenTelemetry estándar 2024+ — agnóstico de vendor. Sentry + BetterStack + Datadog soportan OTEL ingress.

### Backend (NestJS apps/api)

```typescript
// apps/api/src/instrumentation.ts (futuro, no implementado aún)
import { Resource } from '@opentelemetry/resources'
import { NodeSDK } from '@opentelemetry/sdk-node'

const sdk = new NodeSDK({
  resource: new Resource({ 'service.name': 'zenix-api', 'service.version': '1.0.0' }),
  // ... configure exporters
})
sdk.start()
```

**Métricas custom obligatorias**:

| Métrica | Tipo | Labels | Por qué |
|---|---|---|---|
| `zenix.checkin.confirmed` | counter | propertyId, paymentModel | Funnel check-in |
| `zenix.payment.processed` | histogram | provider (stripe/conekta), status | Latency PSP |
| `zenix.channex.outbound.queue.depth` | gauge | propertyId, kind | Queue health |
| `zenix.channex.outbound.token_bucket.remaining` | gauge | propertyId, kind | Rate limit headroom |
| `zenix.sse.connections.active` | gauge | (none, global) | SSE pressure |
| `zenix.db.query.duration` | histogram | operation, model | Slow query detection (Prisma middleware) |
| `zenix.audit_log.write` | counter | action, status | Audit volume |

### Frontend (apps/web)

PostHog autocaptures pageviews + clicks. Custom events:
- `reservation.created` con metadata source (OTA/direct/walk-in)
- `bulk_rate_update.submitted` con entry count
- `nova.impersonation.started` con onBehalfOf
- `wizard.step_completed` con step number

### Mobile (apps/mobile)

PostHog mobile SDK. Mismo modelo de eventos custom para task completed, photo uploaded, push received.

---

## 6. Plan de implementación concreto — qué hacer cuándo

### Pre v1.0.0 launch (siguiente sprint dedicado, 4-5 días)

**OPS-α sprint** (no oficializado aún, sugerido):
- Día 1: Sentry + BetterStack onboarding + healthcheck `/health` endpoint
- Día 2: OpenTelemetry instrumentation Backend + métricas custom obligatorias
- Día 3: PostHog Web + Mobile setup + funnels críticos
- Día 4: CEO Dashboard `/nova/dashboard` con tira de vida + Layer 1+2
- Día 5: Smoke test runbook + chaos test 1 (kill API container during deploy, validate SSE reconnect)

### v1.0.1 (post-launch primer mes)

- Layer 3 CEO dashboard (MRR + churn + activation funnel)
- Read replica Neon setup + Prisma directUrl wiring
- Capacity baseline measurement con tráfico real

### Trigger 30 hoteles (v1.0.5 territory)

- Workers paralelos ChannexOutbound (2-5 procesos)
- PgBouncer activo + connection pool tuning
- Cron banding por timezone

### Trigger 100 hoteles (Fase 2 trigger)

- Migrate a AWS Fargate o Render multi-region
- Aurora multi-AZ
- Datadog APM enterprise
- 24/7 paging rotation

---

## 7. Lectura de profundidad

- **Cindy Sridharan** — *Distributed Systems Observability* (O'Reilly 2018). Free PDF. Las 3 pillars.
- **Charity Majors + Liz Fong-Jones** — *Observability Engineering* (O'Reilly 2022). High cardinality logs + SLO.
- **Mike Krieger** — Charlas Instagram scaling.
- **Google SRE Book + Workbook** (free online). SLO + Error Budget + alerting rules.
- **AWS Well-Architected Framework** — Reliability pillar es la mejor síntesis de capacity planning.
- **Brendan Gregg** — *Systems Performance* 2nd ed (Pearson 2020). El libro definitivo de capacity/perf.
- **Postgres docs** — Cap "Performance Tips" + `pg_stat_statements` + `auto_explain`.

---

## 8. Síntesis para Abraham — tu acción inmediata como CEO

**1. Antes de v1.0.0 GA**: ejecuta el sprint OPS-α (4-5 días). Sin esto vas a ciegas y no podrás responder "¿estamos OK?" a un cliente que llama.

**2. Trigger de scale up por dolor, no por miedo**: hoy tienes 0-3 hoteles. No optimices para 100. Pero ten escrito el runbook (este doc) para que cuando llegues a 30, sepas exactamente qué hacer en qué orden.

**3. CEO Dashboard es prioridad alta de UI**: el research ya está. Day 9+ del sprint actual hace el shell. Day 12+ wire los widgets reales. Sin esto operas con sensación, no con datos.

**4. Error budget es disciplina de equipo**: estás solo hoy pero cuando contrates devs, "no entregas nuevo si gastaste budget" es la única regla que evita degradación silenciosa.

**5. Costo total Fase 1 v1.0.0**: ~$150-200/mes hoy + ~$50-100 más al sumar Sentry/BetterStack/PostHog paid tiers. Total ~$300/mes para piloto serio. **Esto es 1% del MRR proyectado de 5 clientes** ($30-50k/año bundled). Es la mejor inversión que haces.

**6. La gran trampa a evitar**: NO sobre-construyas observability ahora. La pirámide invertida: gastas 80% del tiempo en monitorear vs 20% en producto = vas mal. Build 5 dashboards críticos + 10 alertas + done. El resto se agrega cuando duele.
