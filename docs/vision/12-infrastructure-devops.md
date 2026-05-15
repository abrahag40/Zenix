# 12 · Infrastructure & DevOps

> Stack tecnológico de producción + prácticas DevOps mínimas para vender enterprise. Tres fases alineadas con el crecimiento sin lockear el proyecto en una sola decisión.
>
> **Status:** Plan aprobado 2026-05-15. Fase 1 vigente.
> **Decisión de Abraham:** "Estamos compitiendo con los grandes y debemos tener un ambiente y un sistema profesional."

---

## 1. Filosofía de evolución — 3 fases sin pintarse a una esquina

Las arquitecturas SaaS exitosas evolucionan en fases. Sobre-invertir en infra día 1 mata la velocidad (Stripe primer año = 1 servidor EC2). Sub-invertir mata la confianza enterprise (Cloudbeds en 2014 perdió un deal Hyatt por no tener SOC 2). El equilibrio:

| Fase | Properties | Costo/mes USD | Foco principal |
|------|-----------:|---------------:|----------------|
| **Fase 1** — Piloto | 1-10 | $70-$200 | Velocity + profesionalismo mínimo |
| **Fase 2** — Crecimiento | 10-100 | $300-$1,000 | Reliability + observability |
| **Fase 3** — Enterprise | 100-500+ | $3,000-$10,000 | Compliance + multi-region |
| **Fase 4** — Continental | 500-5,000+ | $15,000+ | Edge + dedicated security team |

Cada fase es **migración aditiva**, no reescritura. Los servicios elegidos en Fase 1 deben tener path de upgrade hacia Fase 2/3 sin lock-in.

---

## 2. Fase 1 — Piloto profesional (HOY)

**Target:** Hotel Monica Tulum + 2-3 hoteles más como early adopters. 99.5% uptime. Recovery <1h. Costo: **$70-200/mes**.

### Stack recomendado

| Componente | Servicio | Plan | Costo mensual | Migración a Fase 2 |
|------------|----------|------|---------------|---------------------|
| **Frontend Web** | [Vercel](https://vercel.com) | Hobby → Pro | $0 → $20 | Trivial (mismo deploy) |
| **API NestJS** | [Render](https://render.com) o [Railway](https://railway.app) | Starter Web Service | $7-$25 | Migrar a AWS Fargate cuando volumen aumente |
| **PostgreSQL** | [Neon](https://neon.tech) o [Supabase](https://supabase.com) | Pro / Launch | $0-$25 | Neon → AWS RDS managed (Aurora compatible) |
| **File storage** | [Cloudflare R2](https://www.cloudflare.com/products/r2/) | Pay-per-use | $0-$5 | S3-compatible API → AWS S3 sin tocar código |
| **Mobile builds** | [Expo EAS Build](https://expo.dev/eas) | Free → Production | $0-$99 | iOS sin Mac, OTA updates |
| **Push notifications** | Expo Push | Gratis | $0 | Wrapper APNs/FCM |
| **Email transactional** | [Resend](https://resend.com) | Free → Pro | $0-$20 | 10k emails/mes en Pro |
| **WhatsApp Business** | [Twilio](https://www.twilio.com) | Pay-per-message | $5-$30 | Standard API |
| **Error monitoring** | [Sentry](https://sentry.io) | Developer | $0-$26 | Full backend + frontend traces |
| **Log aggregation** | [Better Stack](https://betterstack.com) (Logtail) | Free Tier | $0 | Hasta 1GB logs/mes |
| **Uptime monitoring** | [Better Stack Uptime](https://betterstack.com) | Free | $0 | Hasta 10 monitors |
| **Status page** | [Better Stack](https://betterstack.com) | Free | $0 | Público para clientes |
| **DNS + WAF** | [Cloudflare](https://www.cloudflare.com) | Free + Pro $20/mes | $0-$20 | DDoS protection + WAF rules |
| **Domain** | Cloudflare Registrar o Namecheap | — | $10-$15/año | — |
| **CI/CD** | GitHub Actions | Free (2k min/mes) | $0 | Suficiente para piloto |
| **Code repo** | [GitHub](https://github.com) | Team plan | $4/user/mes | Repos privados + Copilot |

**Total típico Fase 1: $70-$200/mes.**

### Topología de red

```
                    Internet
                       │
                       ▼
              ┌────────────────┐
              │   Cloudflare   │   ← DNS + WAF + DDoS protection
              │   (free + pro) │
              └───────┬────────┘
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
  ┌──────────┐               ┌──────────────┐
  │  Vercel  │               │    Render    │
  │ (Web SPA)│               │  (NestJS API)│
  └──────────┘               └──────┬───────┘
                                    │
                          ┌─────────┴──────────┐
                          ▼                    ▼
                    ┌──────────┐         ┌─────────────┐
                    │   Neon   │         │ Cloudflare  │
                    │ (Postgres│         │     R2      │
                    │  managed)│         │  (storage)  │
                    └──────────┘         └─────────────┘
                          ▲
                          │  daily backup
                          ▼
                  ┌───────────────┐
                  │  Backup vault │
                  │ (Neon native +│
                  │ S3 weekly)    │
                  └───────────────┘
```

### Environments

| Env | URL | Database | Auto-deploy |
|-----|-----|----------|-------------|
| **Local** | localhost | Docker postgres local o Neon dev branch | manual |
| **Preview** | `pr-N.zenix-web.vercel.app` | Neon preview branch (auto-creada por PR) | en cada PR |
| **Staging** | `staging.zenix.app` | Neon staging branch | merge a `staging` |
| **Production** | `app.zenix.app` | Neon main branch | merge a `main` con gate manual |

**Neon branching es la killer feature:** cada Pull Request crea automáticamente un branch de DB con los datos del último snapshot de producción. Permite testing real sin riesgo de tocar producción ni datos demo.

### Backups y disaster recovery

| Activo | Estrategia | Recovery time | Retención |
|--------|-----------|---------------|-----------|
| Postgres data | Neon point-in-time recovery + S3 weekly snapshot | <30 min PITR | 30 días branch + 90 días S3 |
| File storage (R2) | Versioning enabled | <5 min | 90 días |
| Application code | GitHub immutable | <2 min | infinito |
| Secrets | Vercel/Render env vars + 1Password vault backup | <10 min | infinito |
| Customer config | Daily SQL dump en S3 | <1h | 1 año |

**Test de recovery:** ejecutar restore mensual en environment de staging desde backup más reciente. Documentar tiempo real. Si excede 1h → escalar a Fase 2.

### Seguridad mínima Fase 1

| Control | Implementación |
|---------|---------------|
| **WAF** | Cloudflare Pro rules (OWASP Core Rule Set) — $20/mes |
| **Bot protection** | Cloudflare Bot Fight Mode (gratis) |
| **Rate limiting** | NestJS [`@nestjs/throttler`](https://docs.nestjs.com/security/rate-limiting) por endpoint |
| **Secrets** | NEVER en repo; Vercel/Render env vars + rotación manual trimestral |
| **JWT** | TTL 24h ([NIST SP 800-63B](https://pages.nist.gov/800-63-3/sp800-63b.html)), refresh tokens en v1.1 |
| **HTTPS** | Forzado en todos los dominios (Vercel/Cloudflare auto) |
| **CORS** | Whitelist explícita en API (no `*`) |
| **Headers** | `helmet` middleware + CSP estricto en frontend |
| **Audit logs** | Tabla `audit_log` append-only en BD para acciones sensitivas |
| **Encryption at rest** | Neon AES-256 (default) |
| **Encryption in transit** | TLS 1.3 forzado (Cloudflare + Vercel + Neon) |

### CI/CD pipeline

```yaml
# .github/workflows/ci.yml (simplificado)
on: [push, pull_request]

jobs:
  test:
    - npm ci
    - npx tsc --noEmit              # 0 errors required
    - npx jest --coverage           # ≥70% coverage required
    - npx eslint .                  # 0 errors required

  build:
    needs: test
    - npm run build                 # ambos apps

  preview-deploy:                   # solo en PRs
    needs: build
    - Vercel preview deploy auto
    - Neon branch auto-create
    - Comment en PR con preview URL

  production-deploy:                # solo en main
    needs: build
    needs: human-gate               # 1 approver requerido
    - Vercel production deploy
    - Render API deploy
    - Prisma migrate deploy
    - Smoke test (curl /health)
    - Sentry release tracking
```

### SLO mínimo Fase 1

| Métrica | Target | Cómo medirlo |
|---------|--------|--------------|
| **Uptime** | 99.5% (3.6h downtime/mes max) | Better Stack monitors cada 30s |
| **API latency P95** | <800ms | Sentry Performance |
| **Error rate** | <1% | Sentry error count vs request count |
| **Recovery time (RTO)** | <1 hora | Mensual restore test |
| **Recovery point (RPO)** | <15 min | Neon PITR config |

---

## 3. Fase 2 — Crecimiento (10-100 properties)

**Trigger:** ≥10 properties activas O ≥3 cadenas con ≥3 properties cada una.

Migración aditiva. **Render → AWS Fargate, Neon → AWS RDS o Neon Enterprise.** Costo proyectado: **$300-$1,000/mes**.

### Cambios respecto a Fase 1

| Componente | Cambio | Razón |
|------------|--------|-------|
| API hosting | Render → AWS Fargate + ALB | Auto-scaling horizontal multi-AZ |
| Database | Neon Pro → Neon Enterprise o AWS RDS Multi-AZ | Read replicas + 99.99% uptime SLA |
| Cache layer | NUEVO: Upstash Redis | Cache queries calientes + queue (BullMQ) |
| Background jobs | NUEVO: BullMQ + Upstash Redis | Night audit, Channex sync, email |
| Search | NUEVO: Postgres FTS / Meilisearch | Búsqueda global de huéspedes |
| CDN | Cloudflare Pro/Business | Edge cache para queries GET frecuentes |
| Observability | + Datadog APM o Sentry Performance Pro | Distributed tracing |
| Email | Resend Pro o AWS SES | 50k+ emails/mes |
| Region | + São Paulo edge | Latencia LATAM <100ms |

### SLO Fase 2

| Métrica | Target Fase 2 |
|---------|---------------|
| Uptime | 99.9% (43 min downtime/mes max) |
| API latency P95 | <300ms LATAM |
| Error rate | <0.5% |
| RTO | <30 min |
| RPO | <5 min |

### Equipo mínimo Fase 2

- 1 Backend lead
- 1 Frontend lead
- 1 DevOps part-time (puede ser contratista) — owner del runbook
- On-call rotation 2 personas mínimo

---

## 4. Fase 3 — Enterprise (100-500 properties)

**Trigger:** Selina/cadena multi-país firma. Costo: **$3-10k/mes**.

### Adiciones críticas

| Componente | Cambio |
|------------|--------|
| Multi-region | Read replicas en MX + BR + USA |
| Database | AWS Aurora Global Database o CockroachDB |
| Auth | Auth0 / WorkOS para SSO enterprise (SAML, OIDC, SCIM) |
| Audit | CloudTrail + tabla `audit_log` exportable |
| Backup | AWS Backup Vault + cross-region replication |
| **Compliance** | SOC 2 Type 2 audit ($30k-$50k) |
| **Compliance** | PCI-DSS Level 1 si volumen tarjeta >6M/año |
| **Compliance** | ISO 27001 (opcional pero valioso para enterprise) |
| Status page | Statuspage.io con incident management ($30/mes) |
| Security | Bug bounty program (HackerOne) |
| Pen-testing | Anual con firma certificada |
| Insurance | Cyber liability $1M+ ($500-$2k/mes) |

### SLO Fase 3

| Métrica | Target Fase 3 |
|---------|---------------|
| Uptime | 99.95% (22 min downtime/mes max) |
| API latency P95 | <150ms global |
| Error rate | <0.1% |
| RTO | <10 min |
| RPO | <1 min |

### Equipo Fase 3

- Engineering: 8-12 ingenieros (frontend, backend, mobile, devops, security)
- Customer Success: 3-5 personas
- Sales engineering: 2 personas para enterprise deals
- Dedicated security: 1 lead + on-call rotation

---

## 5. Fase 4 — Continental (500-5000 properties)

**Trigger:** ≥3 países con >100 properties, primer contrato ABI Data Licensing.

Stack ya enterprise. Cambios marginales:
- Edge functions (Cloudflare Workers o Vercel Edge) para hot endpoints
- Dedicated security team con SOC operacional
- Audit anual ISO 27001 + SOC 2 Type 2 renovación
- Compliance LFPDPPP México + GDPR Europa + LGPD Brasil

---

## 6. Prácticas DevOps que aplican desde HOY (sin costo)

Estos son disciplinas, no servicios:

### 6.1 Environments separados y branches por feature

- Nunca commitear a `main` directo
- Cada feature → branch → PR → review → merge
- Preview deploys automáticos en PR (Vercel + Neon branch)

### 6.2 Migrations versionadas con rollback path

- Prisma migrate con timestamp + nombre semántico
- Cada migration documenta su rollback en comentario
- Migrations destructivas requieren 2 approvers

### 6.3 Backups verificados

- Daily snapshot automático (Neon)
- Monthly restore test en staging
- Si el test falla → crítico, parar features hasta arreglar

### 6.4 Secrets management

- NEVER en repo
- Vercel/Render env vars como source of truth
- Vault backup en 1Password (org)
- Rotación trimestral (Q1, Q2, Q3, Q4)

### 6.5 Observability 3-tier

- **Metrics** — uptime, latency, error rate (Better Stack)
- **Logs** — searchable, retention 30 días (Better Stack Logtail)
- **Traces** — distributed tracing (Sentry Performance)

### 6.6 Incident runbook

Documentar 8 incident types con respuesta específica:

1. **API 5xx error rate spike** — check Sentry → identify endpoint → revert deploy si reciente
2. **Database connection pool exhausted** — check Neon dashboard → scale up o kill long queries
3. **Channex.io webhook stopped** — check Channex status → backfill manual via API
4. **Stripe/Conekta payment failure rate spike** — check provider status → switch to fallback
5. **PAC CFDI timbrado falla** — check Facturama/SW Sapien status → queue documents
6. **Frontend white screen** — check Sentry frontend → revert Vercel deploy
7. **Push notifications delayed** — check Expo Push status
8. **SSE/real-time disconnect** — check Render/Fargate metrics → restart pod

Cada runbook tiene: síntomas, comandos para diagnosticar, pasos de mitigación, postmortem template.

### 6.7 Postmortems blameless

Para todo incident con downtime ≥5 min:
- Timeline reconstruida de eventos
- Root cause analysis (5 whys)
- Action items con owner + due date
- Sin culpar a personas, culpar al proceso/sistema

### 6.8 On-call rotation

- Fase 1: solo founder (Abraham). Aceptable para piloto.
- Fase 2: 2 personas rotación semanal
- Fase 3: 4 personas, primary + secondary
- Pago premium por on-call (estándar 10-15% sobre base)

### 6.9 Feature flags

Para rollouts graduales sin redeploy:
- Implementación built-in en v1.0.5 (parte de Entitlement system)
- Pattern: `EntitlementService.has(orgId, FEATURE_FLAG_KEY)`
- Rollout 5% → 25% → 50% → 100% con observability

### 6.10 SLA contractual para enterprise

Cuando llegue Fase 3:
- 99.9% uptime garantizado
- Service credit si <99.9% (10% off mensual)
- Response time:
  - P0 (down): 15 min
  - P1 (degraded): 1 hora
  - P2 (degraded individual): 4 horas
  - P3 (cosmetic): 1 día
- Status page público con history
- Annual SOC 2 Type 2 disponible bajo NDA

---

## 7. Cost projection 5 años

| Año | Properties | Costo infra/mes USD | Costo infra/año USD |
|----:|----------:|----------------:|----------------:|
| 1 | 5 | $150 | $1,800 |
| 2 | 30 | $500 | $6,000 |
| 3 | 100 | $1,500 | $18,000 |
| 4 | 300 | $5,000 | $60,000 |
| 5 | 800 | $12,000 | $144,000 |

**Costo infra como % de revenue:**
- Año 1 (5 properties × $200/mes promedio = $12k revenue): infra 15%
- Año 5 (800 properties × $250/mes promedio = $2.4M revenue): infra 6%

Costo decrece como % de revenue → es economía de escala SaaS sana.

---

## 8. Decisiones críticas — registradas para no revisitar

### 8.1 ¿Vercel + Render vs AWS desde día 1?

**Decisión:** Vercel + Render Fase 1; migrar a AWS Fase 2.

**Por qué:**
- AWS día 1 requiere 1 DevOps dedicado (>$5k/mes salario)
- Render + Vercel = "managed Heroku 2.0" con DX 10x vs AWS raw
- Vercel→AWS migration es trivial (Next.js/Vite a S3+CloudFront)
- Render→Fargate es Docker → Docker, sin reescritura

### 8.2 ¿Neon vs Supabase vs AWS RDS Fase 1?

**Decisión:** Neon.

**Por qué:**
- Branching para PRs es killer feature
- Postgres puro (sin sabores propietarios como Supabase auth)
- Path a AWS RDS es Postgres → Postgres (data dump + restore)
- Supabase es más amplio pero su BD branching es inferior

### 8.3 ¿Cloudflare R2 vs S3 Fase 1?

**Decisión:** R2.

**Por qué:**
- S3-compatible API (mismo SDK)
- Zero egress fees (vs S3 $0.09/GB out)
- Performance LATAM superior (Cloudflare network)
- Migration a S3 = mismo `aws-sdk` config

### 8.4 ¿Heroku?

**Decisión:** NO.

**Por qué:**
- Pricing 5x más caro que Render para misma performance
- Salesforce-owned (futuro incierto post-acquisition)
- Cold starts en planes baratos
- Ya no es "el opinionated PaaS" — Render lo es ahora

### 8.5 ¿Cuándo migrar de Render → AWS?

**Trigger checklist:**
- API latency P95 >500ms sostenido
- >100 concurrent connections sostenido
- Necesidad de VPC peering con servicios enterprise
- Cliente firma contrato con SLA <300ms guaranteed
- Cualquier 1 = trigger; cualquier 2 = inmediato

---

## 9. Glosario para no-DevOps

Términos que aparecen en este doc, en español de programador frontend:

| Término | Significado simple |
|---------|---------------------|
| **CDN** | Servidor en muchas partes del mundo que cachea tu sitio cerca del usuario → rapidísimo |
| **WAF** | Firewall web que bloquea ataques antes de que lleguen a tu API |
| **DDoS** | Ataque de muchas peticiones falsas para tirar tu sitio |
| **SLO/SLA** | Promesa de cuánto va a estar arriba tu sistema (99.5% = ~3.6h offline al mes ok) |
| **RTO** | Tiempo máximo para volver online tras una caída |
| **RPO** | Cuántos datos podrías perder en una caída (ideal: minutos) |
| **APM** | Herramienta que mide qué tan rápido responde cada endpoint |
| **Edge** | Servidor más cercano al usuario, no en US central |
| **On-call** | Quien atiende incidentes fuera de horario |
| **Postmortem** | Documento después de un incidente para no repetirlo |
| **SOC 2** | Auditoría que certifica que tu empresa maneja datos seguro — enterprise lo pide |
| **PCI-DSS** | Norma para procesar tarjetas — Stripe/Conekta te cubren parcialmente |
| **GDPR / LFPDPPP / LGPD** | Leyes de privacidad UE / México / Brasil |
| **PITR** | Point-in-time recovery — restaurar BD a un momento exacto |

---

## 10. Bitácora

- **2026-05-15** — Documento creado. Plan de 4 fases (Piloto / Crecimiento / Enterprise / Continental) con stack específico y costos proyectados. Fase 1 aprobada para piloto. Glosario incluido para Abraham (frontend background sin DevOps). Decisiones registradas: Vercel+Render+Neon+R2 en Fase 1; migración AWS Fase 2.
