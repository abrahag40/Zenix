# Zero-Downtime Deployment — Zenix v1.0.0+ Production Releases

> **Escenario base**: ya lanzaste v1.0.0. Tienes 5 clientes × 2 hoteles = 10 properties operando.
> Reservas entrando por Channex en tiempo real, check-ins activos, pagos en proceso, tareas de limpieza en mobile.
> **Pregunta del owner**: ¿cómo subes v1.0.1 sin que ningún recepcionista se entere?
>
> **Respuesta corta**: con un proceso de release ensayado de 4 fases que mantiene 2 versiones funcionando simultáneamente durante ~5-15 minutos.
> Si lo haces bien, el recepcionista en Tulum no nota nada — al recargar el navegador 30 min después ya está en v1.0.1.

---

## 1. El problema real — qué se rompe si haces deploy "a lo bruto"

Sin protocolo, un deploy normal causa:

| Categoría | Síntoma | Costo real |
|---|---|---|
| **API restart abrupto** | Requests en vuelo abortan mid-flight | Cargo Stripe parcialmente registrado, CFDI sin timbrar, audit log inconsistente |
| **SSE drop** | TimelineScheduler pierde conexión → "Reconectando..." stuck | Recepcionista no ve la nueva reserva OTA por 30s-5min |
| **DB migration bloqueante** | `ALTER TABLE` con lock exclusivo | API bloqueada hasta que migración termine (puede ser minutos en tablas grandes) |
| **JWT versioning mismatch** | Browser tiene token viejo, API espera campo nuevo | 401 silente — recepcionista logueado de pronto necesita re-login |
| **Schema breaking change** | Frontend pide campo que ya no existe | UI rota — calendario blanco, modal de checkout fallando |
| **Channex webhook in-flight** | Webhook llega durante restart → 502 | Channex reintenta exponential backoff, pero si fallan 5 retries → DEAD_LETTER + supervisor manual |
| **Cron midway** | Night audit scheduler ejecutándose cuando el container muere | No-shows no marcados ese día → revenue loss + fiscal compliance gap |

**Conclusión**: deploy abrupto = 0% downtime visible en el dashboard de Vercel/Render, pero un puñado de operaciones críticas se pierden. Para v1.0.0 piloto con 1-3 hoteles esto es "molesto". Con 100 hoteles y temporada alta, **inadmisible**.

---

## 2. Estrategias de deployment — comparativa

### 2.1 Rolling deploy (default de Render/Vercel/AWS ECS)

**Cómo funciona**:
1. Render spawnea N+1 instancias del nuevo container.
2. Healthcheck del nuevo container debe responder 200 antes de recibir tráfico.
3. Render redirige tráfico al nuevo, drena el viejo (espera connections cerrar).
4. Mata el viejo cuando drain completa o timeout (default 30s).

**Pros**:
- Configuración ya nativa en Render. Cero esfuerzo.
- Sin doble costo de infra.

**Contras**:
- Drain timeout 30s default — requests largos (PDF render, bulk PATCH, sandbox Channex con latencia) se pueden cortar.
- SSE connections se cierran al matar el container. El cliente tiene que reconectar (ya tenemos `sseClient.ts` singleton con backoff §124).
- DB schema y código deben ser compatibles ambas versiones durante el rolling.

**Cuándo usarlo**: cambios sin schema migration + sin breaking JWT/contract. La mayoría de patches (bug fixes UI, copy changes, small backend tweaks). **~70% de nuestros releases v1.0.x.**

### 2.2 Blue/green

**Cómo funciona**:
1. Tienes 2 ambientes idénticos (Blue = producción actual, Green = nueva versión).
2. Despliegas a Green. Lo testeas internamente con tráfico sintético (smoke tests).
3. Switch del load balancer/DNS de Blue a Green en un solo click.
4. Mantienes Blue corriendo por X horas para rollback instantáneo.
5. Apagás Blue cuando confirmás estabilidad.

**Pros**:
- Rollback instantáneo (flip back del DNS).
- Verificación con tráfico real antes de switch (canary subset).

**Contras**:
- **Doble costo** de infra durante la ventana.
- DNS switch tiene TTL de propagación (5-30 min según CDN). Cloudflare proxy es ~30s.
- Schema migrations comparten DB → tienen que ser compatibles ambas versiones igualmente.

**Cuándo usarlo**: releases mayores v1.0 → v1.1 o cambios arquitectónicos grandes. **~5% de releases.**

### 2.3 Canary deploy

**Cómo funciona**:
1. Despliegas v1.0.1 a una sola región / un % del tráfico (e.g. 5%).
2. Observas error rate + latency + business metrics (check-ins exitosos, pagos OK).
3. Si todo verde 30-60 min, expandes a 25% → 50% → 100%.
4. Si rojo, rollback automático.

**Pros**:
- Detecta bugs que solo aparecen bajo carga real con datos reales.
- Limita blast radius (5% afectado vs 100%).

**Contras**:
- Requiere routing inteligente (Cloudflare Workers / AWS ALB rules / feature flag header).
- Métricas comparativas necesitan baseline limpio (1h sin deploy previo).
- Multi-tenant complica: si Cliente A es canary y Cliente B no, sus datos siguen en la misma DB.

**Cuándo usarlo**: cambios riesgosos en hot paths (calendar, payments, Channex). **~15% de releases.**

### 2.4 Feature flags (LaunchDarkly / PostHog / casero)

**Cómo funciona**:
1. Código nuevo se despliega pero envuelto en `if (flagEnabled('new-rate-calendar', { propertyId }))`.
2. Por default OFF para todos.
3. Activas cliente por cliente, observas, expandes.
4. Si rompe, desactivas sin redeploy.

**Pros**:
- Separa **deploy** de **release**. El código está en producción pero apagado.
- Rollback en segundos (toggle del flag).
- A/B testing nativo.

**Contras**:
- Costo de complejidad del código (branches if/else duplican lógica).
- Debt si flags no se limpian.
- Requiere herramienta dedicada (FeatureFlagsModule ya existe en `apps/api/src/feature-flags/`).

**Cuándo usarlo**: rasgos nuevos visibles al usuario (UI redesign, nuevo flujo check-in, dashboard widget). **Combinable con rolling/canary.**

---

## 3. Decisión recomendada para Zenix v1.0.x

| Tipo de cambio | Estrategia | Tiempo total | Rollback |
|---|---|---|---|
| Hot fix bug crítico UI | **Rolling deploy** | 5-8 min | Git revert + redeploy (8 min) |
| Bug fix backend sin migration | **Rolling deploy** | 5-8 min | mismo |
| Feature nueva (UI/UX visible) | **Rolling + Feature flag** | 5-8 min deploy + activación incremental | Toggle flag OFF (segundos) |
| Schema migration (expand-contract) | **Rolling deploy 2 pasadas + migration intermedia** | 20-40 min | Documentado per migration |
| Cambio arquitectónico grande (e.g. v1.0 → v1.1) | **Blue/green con DNS flip** | 30-60 min ventana | DNS flip back (5 min propagation) |
| Cambio en Channex contract / integraciones críticas | **Canary 5% → 25% → 100%** | 2-6 horas total | Stop expansion + rollback canary subset |

---

## 4. El patrón crítico — Expand-Contract para schema migrations

> **El 80% de los problemas de zero-downtime son por DB schema, no por código.**

Inventado por GitHub + Stripe. Documentado en *"Database Reliability Engineering"* (Campbell & Majors, O'Reilly 2018).

### Regla de oro

**Nunca cambies una columna en un solo paso si hay tráfico productivo.** Divide en 3 pasos:

```
Paso A — EXPAND:    Agrega lo nuevo SIN tocar lo viejo
Paso B — MIGRATE:   El código nuevo escribe en lo nuevo Y lo viejo (dual write)
Paso C — CONTRACT:  Borra lo viejo cuando estás seguro
```

### Ejemplo real: agregar `GuestStay.paymentModel` (lo que hicimos en CHECK-IN-α §106)

**Mal (1 paso)**:
```sql
ALTER TABLE guest_stays ADD COLUMN payment_model TEXT NOT NULL DEFAULT 'HOTEL_COLLECT';
```
Problema: con 100k reservas históricas, este `ALTER` lockea la tabla 30-60s. Recepción de los 100 hoteles queda bloqueada para crear nuevas reservas durante ese minuto.

**Bien (3 pasos)**:

**Paso A — EXPAND** (release v1.0.0):
```sql
-- Agrega NULLABLE primero, sin default → cero bloqueo
ALTER TABLE guest_stays ADD COLUMN payment_model TEXT;
```
- Migración instantánea (Postgres registra metadata change sin rewrite).
- Código viejo y nuevo conviven; nuevo escribe `paymentModel`, viejo ignora.

**Paso B — MIGRATE** (release v1.0.0 + 1 día):
```sql
-- Backfill en lotes de 5000, fuera de horario peak
UPDATE guest_stays SET payment_model = 'HOTEL_COLLECT'
WHERE payment_model IS NULL
  AND id IN (SELECT id FROM guest_stays WHERE payment_model IS NULL LIMIT 5000);
-- Repetir hasta 0 rows affected
```
- Sin lock global. Lock por row solo.
- Código nuevo ya escribe; código viejo ignora.

**Paso C — CONTRACT** (release v1.0.1):
```sql
ALTER TABLE guest_stays ALTER COLUMN payment_model SET NOT NULL;
ALTER TABLE guest_stays ALTER COLUMN payment_model SET DEFAULT 'HOTEL_COLLECT';
```
- Ahora la columna es obligatoria. Toda fila tiene valor → ALTER es instantáneo.

**Total wall-clock**: ~3 días. **Downtime visible**: 0 segundos.

### Patrones expand-contract específicos

| Necesito... | Cómo hacerlo sin downtime |
|---|---|
| Renombrar columna `old_name → new_name` | A: Add `new_name`, dual write. B: Backfill. C: Switch reads to new. D: Drop `old_name`. |
| Cambiar tipo de columna (text → enum) | A: Add `new_col` con tipo nuevo. B: Backfill con CAST. C: Switch reads. D: Drop viejo. Nunca `ALTER TYPE` directo en columna existente con datos. |
| Borrar columna | A: Marcar deprecated en código (stop reading). B: Confirmar 0 reads en logs por 7 días. C: Drop. |
| Agregar índice grande | `CREATE INDEX CONCURRENTLY` (Postgres) — no bloquea writes pero toma 10x más. Sin esto, lock 30+ min en tabla grande. |
| Add NOT NULL constraint | A: Add columna NULLABLE. B: Backfill. C: Add CHECK NOT VALID. D: Validate constraint. E: SET NOT NULL. (Postgres 12+.) |
| Cambiar PK type (int → uuid) | Casi inhacible online sin replicación. Requiere ventana planeada (Phase 3 problem). |

### Herramientas que ayudan

| Herramienta | Función |
|---|---|
| **`pg_repack`** | Reconstruye tabla sin lock exclusivo. Útil para `VACUUM FULL` equivalente online. |
| **`pgroll`** | (Xata, 2023) declarative expand-contract automatizado. 🔵 EVALUACIÓN. |
| **Prisma Migrate**| Genera migrations pero NO te protege de expand-contract — tú tienes que separar manualmente en N migrations. |
| **`pglock`** | Detecta queries que están blocking otras. Útil para canary monitor. |

---

## 5. Pre-deploy checklist — runbook obligatorio

Cada release v1.0.x debe pasar esta lista. **No saltees.** Si saltas un paso, escríbelo en la nota del release y aprende del fail.

### Pre-merge (PR review)

- [ ] PR description tiene **Risk Level** declarado: LOW / MEDIUM / HIGH.
- [ ] Si toca DB schema: migration sigue expand-contract (no breaking single-step).
- [ ] Si toca API contract: hay **dual support** del campo viejo + nuevo durante 1 release.
- [ ] CI verde: lint + typecheck + tests + build.
- [ ] Local: probaste tu cambio con seed data.
- [ ] Docs actualizados (CLAUDE.md + sales master si aplica).
- [ ] Owner approve (estás solo, autoapruebas pero cool-down 30 min antes de merge).

### Pre-deploy (entre merge y prod)

- [ ] Tag del commit: `git tag -a v1.0.1 -m "..."`.
- [ ] **Release notes** generadas (gh CLI: `gh release create v1.0.1 --generate-notes`).
- [ ] Backup DB hot (Neon point-in-time recovery está auto, pero verifica timestamp <1h).
- [ ] Notificar al canal Slack #releases (futuro) o sticky note: "v1.0.1 deploying 14:00".
- [ ] **Ventana operativa correcta**: NUNCA deployes durante:
  - 7:00-11:00 hora local del hotel piloto (checkout + planning peak).
  - 14:00-18:00 (check-in peak).
  - Viernes-sábado noche (reservas OTA spike).
- [ ] **Ventana ideal**: Martes/miércoles 10:00 CST (post-checkout, pre-check-in lull).

### Durante deploy

- [ ] Monitor abierto: Sentry + BetterStack + Render logs + Channex outbound queue.
- [ ] Healthcheck endpoint: `/health` debe responder 200 en <300ms (incluye DB ping + Channex enabled flag).
- [ ] Smoke tests post-deploy:
  - GET /v1/properties → 200
  - POST /auth/login → 200 (con cuenta test)
  - GET /v1/nova/channex/properties/.../rate-calendar → 200
- [ ] Verifica SSE reconnect: `_sseDebug()` en console del browser piloto.

### Post-deploy (T+30 min)

- [ ] Error rate Sentry: ≤baseline último 24h.
- [ ] Latency P95: ≤baseline + 10%.
- [ ] Channex outbound queue: 0 DEAD_LETTER nuevos.
- [ ] AppNotification: 0 alertas de cliente nuevas (review queue, conflicts).
- [ ] DB connection pool: <60% saturation.

### Rollback criteria (cuándo abortar)

Cualquiera de estos = rollback inmediato:
- Error rate Sentry > 2x baseline durante 5 min consecutivos.
- Cualquier endpoint 5xx > 1% requests.
- DB connection saturation > 90%.
- 1+ payment workflow reportado roto por cliente.
- 1+ webhook Channex fallando consistentemente.
- Healthcheck rojo > 60s.

### Rollback procedure

1. **Render**: tienes 1 click "Rollback to previous deploy" — vuelve al container previo. ~2 min downtime durante el switch.
2. **Vercel**: `vercel rollback` del deployment ID previo. ~30s (CDN cache invalidation).
3. **DB**: si la migración fue **expand-only** (paso A), no requiere rollback DB. Si fue **contract** (paso C borrando algo), tienes que restaurar de backup → **doloroso, evita siempre**.
4. **Post-mortem** en `docs/ops/incidents/YYYY-MM-DD-shortname.md` dentro de 48h.

---

## 6. Cómo NO afectar a un cliente con reserva en proceso

### SSE drain

El `sseClient.ts` singleton (CLAUDE.md §124) ya maneja reconnect con exponential backoff. Al deploy:

1. API cierra connection (signal SIGTERM).
2. Browser detecta close → triggera `onerror` → backoff timer 1s.
3. Nueva conexión apunta al nuevo container (Render LB ya redirige).
4. Re-subscription a eventos.

**Total invisible time**: 1-3s. Recepcionista no nota. **Esto ya funciona — no hay trabajo nuevo, solo validar en smoke test.**

### Cargo en proceso de Stripe / Conekta

Stripe es idempotente con `Idempotency-Key` header. Si el container muere mid-charge:

1. Backend retry-on-startup verifica los `PaymentLog` con `status=PENDING` >5 min.
2. Llama `stripe.paymentIntents.retrieve(id)` → confirma si succeed o failed real.
3. Reconciles `PaymentLog` con el truth de Stripe.

**Requirement**: scheduler `payment-reconcile.scheduler.ts` corriendo cada 5 min (pendiente v1.0.1 PAY-CORE).

### CFDI emission mid-flight

Patrón análogo. PAC emission tiene `idempotencyKey` derivado del folio + timestamp. Reconcile scheduler confirma cada 10 min.

### Channex webhook llegando durante restart

- Channex reintenta auto (exponential 30s → 1min → 5min → 30min → fail tras 5h).
- Nuestro `ChannexOutbox` + `booking_revisions/feed` cron cada 30min (CLAUDE.md §134) recupera lo que falló.
- Hueco máximo: ~5h post-restart = inventario stale máx 5h. Channex re-pull cubre 100% del gap.

### Cron schedulers (NightAudit, MorningRoster, etc.)

- Schedulers son idempotentes con `noShowProcessedDate` / `morningRosterDate` (CLAUDE.md §13, §45).
- Si el container muere durante run, el siguiente tick (1h-24h después) retoma desde donde quedó.
- **Riesgo único**: si deployás justo a las 02:00 (NightAudit hora) en TZ MX. Por eso el runbook prohíbe ventanas peak.

---

## 7. Versioning + tagging — convención

Semantic Versioning estricto (semver.org):

```
v1.0.0    primera GA piloto
v1.0.1    patch — bug fix sin schema change
v1.0.2    minor — feature CFDI-CORE
v1.1.0    minor — nuevo módulo Mensajería
v2.0.0    major — breaking API change (autenticación nueva, schema breaking)
```

### Branches

- `main` — siempre deployable. Tag releases desde acá.
- `feature/<sprint-name>` — work in progress. Squash merge a main.
- `hotfix/<descripcion>` — patch crítico directo desde el tag de prod. Test mínimo + deploy + back-merge a main.
- `release/v1.X.Y` — solo si necesitamos preparar release notes complejas o branch tipo stabilization.

### Tag conventions

```bash
git tag -a v1.0.1 -m "Bug fix: SSE reconnect on switchProperty"
git push origin v1.0.1
```

GitHub Release auto-generado con notes desde commits squashed.

---

## 8. Database migration strategy específica Prisma + Neon

Neon es Postgres con branching. Esto ayuda enormemente:

1. **Cada PR feature branch genera su propio Neon DB branch automático**.
2. Migraciones se prueban en el branch sin tocar prod.
3. Al merge → migration corre en prod main branch.

### Procedimiento Prisma para migration safe

```bash
# 1. En feature branch local
npx prisma migrate dev --name add_payment_model_nullable
# Prisma genera SQL en prisma/migrations/timestamp_add_payment_model_nullable/

# 2. Reviewa el SQL manualmente. Verifica:
#    - ADD COLUMN nullable, no NOT NULL
#    - No DROP COLUMN sin paso anterior de deprecate
#    - No ALTER TYPE en columna con datos
#    - CREATE INDEX → asegurar CONCURRENTLY (Prisma no lo hace por defecto)

# 3. Si es expand-only → safe, merge a main → migration corre en deploy.
# 4. Si requiere backfill → segunda migration manual `npx prisma migrate dev --create-only`
#    con SQL UPDATE en batches.
# 5. Tercera migration `_contract_` con SET NOT NULL.
```

### Anti-patterns Prisma a evitar

| Anti-pattern | Por qué falla |
|---|---|
| Renombrar campo en schema.prisma | Prisma genera DROP + ADD → pierde datos. Hacer expand-contract manual. |
| Cambiar tipo (Int → BigInt) | Mismo problema. Add new column, dual-write, contract. |
| Borrar campo activo | Pierde datos para siempre. Stop reading 7d, drop después. |
| `migrate dev` en prod | NUNCA. Solo `migrate deploy`. `dev` puede reset DB. |

---

## 9. Runbook concreto para release v1.0.1 (template)

> Copia-paste cuando releases. Marca cada step done.

```markdown
# Release v1.0.1 — YYYY-MM-DD

**Risk Level**: MEDIUM
**Changes**: [list]
**Schema migrations**: [yes/no, expand-only?]
**Window**: martes 2026-06-10 10:00-10:30 CST

## T-24h
- [ ] Anunciar al cliente piloto (WhatsApp / email): "Mantenimiento programado breve"
- [ ] Verificar backup Neon point-in-time-recovery <1h
- [ ] Revisar Sentry baseline error rate

## T-1h
- [ ] Sandbox sanity check (`/v1/health` + smoke tests)
- [ ] Channex outbound queue drain (0 PENDING bonus)

## T-0 deploy start
- [ ] `gh release create v1.0.1 --target main --generate-notes`
- [ ] Vercel + Render auto-deploy se dispara por release
- [ ] Monitor Sentry + BetterStack
- [ ] Healthcheck post 2 min

## T+5min smoke
- [ ] Curl `/health` 200
- [ ] Login con cuenta test
- [ ] Crear reserva test → SSE arrives
- [ ] Cancel reserva test → Channex outbox queue 1 PENDING → drains <30s

## T+30min validate
- [ ] Error rate Sentry ≤ baseline
- [ ] Latency P95 ≤ baseline + 10%
- [ ] 0 DEAD_LETTER nuevos
- [ ] 0 quejas cliente piloto

## T+24h closeout
- [ ] Release post-mortem si hubo issues
- [ ] Update CLAUDE.md changelog
- [ ] Tag deployed-stable
```

---

## 10. Costos de zero-downtime — qué pagas a cambio

| Costo | Cuantía | Mitigación |
|---|---|---|
| Slot doble de infra (blue/green) | 2x el ~$70-200/mes durante la ventana | Solo para releases mayores. ~$10-30/release. |
| Tiempo del owner ensayando runbook | 2-4h primera vez, 30min runs subsiguientes | Worth it. Es seguro de tu negocio. |
| Expand-contract migrations splits a 3 releases | +2 weeks calendar per migration grande | Acepta. Es el costo de no romper a clientes. |
| Feature flags add complexity al código | +5-10% dev time en branches if/else | Usar solo en features con riesgo alto. Limpiar 30d después de full rollout. |
| Monitoring tools (Sentry, BetterStack) | $20-50/mes inicial → $200-500/mes Fase 2 | No-negociable. Sin observability no hay zero-downtime real. |

---

## 11. Tabla resumen — cuándo aplica qué patrón

| Tipo de cambio | Rolling | Canary | Blue/Green | Feature flag | Expand-Contract DB |
|---|---|---|---|---|---|
| Bug fix backend sin schema | ✓ | | | | |
| UI tweak / copy change | ✓ | | | maybe | |
| Nueva feature UI | ✓ | maybe | | ✓ | |
| Nueva tabla / nueva columna nullable | ✓ | | | maybe | ✓ (paso A only) |
| Renombrar / cambiar tipo columna | | maybe | | | ✓ (3 pasos) |
| Cambio en Channex contract | maybe | ✓ | | ✓ | |
| Cambio en JWT shape | | ✓ | | ✓ | |
| Nuevo microservicio / arquitectura | | | ✓ | | |
| Major upgrade (Postgres v15 → v17, Node v18 → v22) | | | ✓ | | |

---

## 12. Lectura de profundidad

- **Mike Krieger (Instagram CTO co-founder)** — *Scaling Instagram Infrastructure*. Detalle de cómo Instagram hizo deploys 30+ veces/día sin downtime.
- **Charity Majors** — *Observability Engineering* (O'Reilly 2022). Tier 3 observability + feature flags + canary.
- **Sam Newman** — *Building Microservices* 2nd ed (O'Reilly 2021). Cap. "Deployment" con focus expand-contract.
- **Stripe Engineering blog** — *Online Migrations at Scale* (2017). Patrón clásico expand-contract documentado.
- **GitHub Engineering** — *MySQL High Availability at GitHub* (2018). Detrás del switch DB sin downtime.
- **Google SRE Book** — Cap. 8 "Release Engineering" + Cap. 27 "Reliable Product Launches at Scale".
- **PostgreSQL docs** — `CREATE INDEX CONCURRENTLY` + `pg_repack` + `ALTER TABLE` lock levels.

---

## 13. Para v1.0.0 piloto específicamente

**Realidad chequeada**: con 5 clientes × 2 hoteles = 10 properties, la mayoría de releases caben en rolling deploy + ventana 10:00 CST. No necesitas blue/green todavía. La inversión ahora es:

1. **Sentry configurado y alertando** (release blocker, sin esto vuelas a ciegas).
2. **BetterStack uptime + status page** ($25/mes), comunica a clientes proactivamente.
3. **Runbook template ensayado 1x** en sandbox antes de v1.0.0 GA.
4. **Healthcheck endpoint real** que pingue DB + Channex.
5. **Migrations en feature branch Neon** antes de prod.

Lo demás (canary, blue/green, feature flag elaboradas, chaos testing) se va sumando cuando crezcas a Fase 2.

**Tiempo total invertir**: 4-6 días-dev pre-v1.0.0. Vale cada minuto.
