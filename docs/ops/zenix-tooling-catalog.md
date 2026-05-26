# Zenix — Catálogo Consolidado de Herramientas

> **Propósito**: una sola página donde el owner ve TODAS las herramientas externas que Zenix usa, evalúa o tiene en pipeline.
> Estado: 2026-05-24. Mantener vivo — cada herramienta nueva entra aquí antes de adoptarse.
>
> **Cómo leer la columna `Estado`**:
> - 🟢 **EN USO** — ya integrada, con credenciales productivas/sandbox configuradas en `.env`.
> - 🟡 **PIPELINE** — decisión tomada, falta integrar (referencia en CLAUDE.md o sprint plan).
> - 🔵 **EVALUACIÓN** — candidata, sin commit aún.
> - ⚫ **DESCARTADA** — evaluada y rechazada (preservamos la razón para no re-debate).

---

## 1. Infraestructura — Hosting + DB + Storage + DNS

### Fase 1 — v1.0.0 piloto (HOY, $70-200/mes)

| Herramienta | Función | Estado | Costo aprox/mes | Alternativa principal | Decisión + ref |
|---|---|---|---|---|---|
| **Vercel** | Hosting web (`apps/web`) + Edge Functions | 🟢 EN USO | $20 (Pro) | Netlify, Cloudflare Pages | Pro plan: preview deploys + branch protection + custom domains. Ver §73 CLAUDE.md. |
| **Render** | Hosting NestJS API (`apps/api`) + cron schedulers | 🟢 EN USO | $25 (Starter+) | Fly.io, Railway, Heroku | Persistent disk + cron jobs + zero-config Docker. PaaS friendly para 1 dev. |
| **Neon** | Postgres serverless (Project DB) | 🟢 EN USO | $19 (Scale) | Supabase, RDS, Crunchy | Branching para preview deploys + auto-scaling compute. Path natural a RDS Fase 2. |
| **Cloudflare R2** | Object storage (fotos check-in v1.0.4) | 🟡 PIPELINE | $0-15 | AWS S3, Backblaze B2 | R2 = S3 API compatible **sin egress fees** — diferencial vs S3 cuando hay tráfico mobile alto. CLAUDE.md §73. |
| **Cloudflare DNS + Pages** | DNS + WAF + CDN | 🟢 EN USO | $0 (free tier) | Route53, Vercel DNS | Free tier soporta DDoS protection básico. Subdomain split: `app.zenix.com` + `nova.zenix.com` + `api.zenix.com`. |
| **Upstash Redis** | Cache + JWT assignedOrgIds overflow (§169) + rate-limit tokens | 🟡 PIPELINE | $0-10 (free tier hasta 256MB) | Redis Cloud, AWS ElastiCache | Serverless Redis con HTTP API — no requiere persistent connection (compatible con serverless functions). |

### Fase 2 — v1.0.5+ growth (≥10 properties O ≥3 cadenas, $400-800/mes)

| Herramienta | Función | Estado | Costo aprox/mes | Trigger | Decisión |
|---|---|---|---|---|---|
| **AWS Fargate** | Container hosting API | 🟡 PIPELINE | $150-300 | ≥10 properties | Migrar de Render. Auto-scaling reglas + multi-AZ. CLAUDE.md §74. |
| **AWS RDS (Postgres)** | DB managed | 🟡 PIPELINE | $100-250 | mismo trigger | db.t4g.medium en multi-AZ. Path desde Neon vía pg_dump + replication slot. |
| **AWS ALB** | Load balancer + WAF | 🟡 PIPELINE | $25 | mismo | Termina TLS + WAF rules para Channex webhook auth. |
| **AWS CloudFront** | CDN | 🟡 PIPELINE | $20-50 | mismo | Migrar de Cloudflare cuando consolidemos en un solo cloud. (Opcional — quedarnos en CF es OK.) |
| **AWS Secrets Manager** | Secrets rotation | 🟡 PIPELINE | $5 | mismo | Reemplaza .env productivo. Auto-rotate de Channex api-key + Stripe webhook secret + PAC creds. |

### Fase 3 — v1.2+ enterprise (≥100 properties O 1 enterprise client, $5-15k/mes)

| Herramienta | Función | Estado | Trigger | Decisión |
|---|---|---|---|---|
| **AWS Aurora Postgres** | DB HA enterprise | 🟡 PIPELINE | ≥100 properties | Read replicas + global database para LATAM multi-region. |
| **Datadog / New Relic** | APM + RUM | 🟡 PIPELINE | mismo | 3-tier observability nivel enterprise (custom metrics + traces + RUM). |
| **HashiCorp Vault** | Secrets enterprise | 🟡 PIPELINE | mismo | Reemplaza Secrets Manager cuando hay >20 servicios + audit centralizado. |

---

## 2. Channel Manager + OTAs

| Herramienta | Función | Estado | Costo | Decisión + ref |
|---|---|---|---|---|
| **Channex.io** | Channel manager primario (Booking, Expedia, Airbnb, Hostelworld, ~120 OTAs) | 🟢 EN USO | $39-150 USD/property/mes (pass-through al hotel) | Único certificado para Booking + Hostelworld + Expedia simultáneo en LATAM. Sandbox `staging.channex.io` ya configurado. CLAUDE.md §36. |
| **SiteMinder** | Channel manager alt | ⚫ DESCARTADA | — | Cobertura LATAM débil. Channex domina. |
| **MyAllocator (Cloudbeds)** | Channel manager alt | ⚫ DESCARTADA | — | Tied a Cloudbeds — incompatible con PMS propio. |
| **Booking.com Connectivity API directa** | Direct PMS↔Booking sin Channel Manager | 🔵 EVALUACIÓN | — | Solo viable si tenemos volumen ≥500 properties para que Booking otorgue partnership. v2.0+. |

---

## 3. Payments + Cash Drawer

| Herramienta | Función | Estado | Costo | Decisión + ref |
|---|---|---|---|---|
| **Stripe** | Tarjeta crédito/débito internacional + Apple/Google Pay | 🟡 PIPELINE v1.0.1 | 2.9% + $0.30 USD | Cobertura USD/EUR/global. Para reservas direct de hoteles boutique con guests internacionales. §81. |
| **Conekta** | Tarjeta MX (autorización local) + OXXO + SPEI | 🟡 PIPELINE v1.0.1 | 2.9-3.6% + $2.50 MXN | Cobertura MX que Stripe no tiene (OXXO + SPEI). Required para nuestro mercado piloto. |
| **MercadoPago** | Pagos LATAM (AR/BR/CO/MX) | 🔵 EVALUACIÓN v1.1.x | 3.5-5% | Para clientes con guests latam-domésticos pagando con QR/wallet. Decidir cuando entremos a AR/CO. |
| **PayPal** | Wallet legacy | ⚫ DESCARTADA | — | Adopción <8% en boutique LATAM y cobra 4-6%. Sin valor. |
| **Banxico SF43718 (FIX)** | Tipo de cambio oficial MX | 🟡 PIPELINE v1.0.x | $0 (40k req/día gratis) | CFDI compliance Art. 20 CFF — rate oficial requerido para emisiones. §83. |
| **Banco República CO (TRM)** | FX Colombia | 🟡 PIPELINE v1.0.4 | $0 (Datos Abiertos GOV.CO) | FX-LATAM sprint. §111. |
| **BCCR (Banco Central Costa Rica)** | FX CR | 🟡 PIPELINE v1.0.4 | $0 (webservice SOAP) | mismo |
| **SBS (Superintendencia Banca Perú)** | FX PE | 🟡 PIPELINE v1.0.4 | $0 (REST) | mismo |
| **OpenExchangeRates** | Fallback FX cualquier país | 🔵 EVALUACIÓN | $12-97/mes | Solo se activa si bancos centrales fail. Backup defensivo. |
| **Tap to Pay on iPhone** | Recepción cobra con su iPhone (Stripe Terminal) | 🔵 EVALUACIÓN v1.1.x | Stripe Terminal pricing | Ver `docs/sprints/TAP-TO-PAY-research.md`. Diferencial para boutique sin POS dedicado. |

---

## 4. Fiscal — CFDI / DIAN / SUNAT / Tribu-CR

| Herramienta | Función | Estado | Costo | Decisión + ref |
|---|---|---|---|---|
| **Facturama** | PAC México (CFDI 4.0 I/E/REP) | 🟡 PIPELINE v1.0.2 | $0.20-0.50/timbre | PAC top 3 MX por adoption. API REST limpia. §89 (`MxCfdi40Adapter`). |
| **SW Sapien** | PAC México alt | 🔵 EVALUACIÓN | $0.15-0.40/timbre | Alternativa Facturama. Decidir en Day 1 sprint CFDI-CORE basado en sandbox SLA. |
| **Mifiel** | PSC NOM-151 (conservación e-firma 10 años) | 🟡 PIPELINE v1.1.x | $0.50-1.00/firma | Para SIGN-DLC — sello de tiempo legal MX. Diferencial vs competencia (ningún PMS global trae NOM-151 nativo). |
| **DIAN UBL 2.1** | Facturación Colombia | 🔵 EVALUACIÓN v1.0.x+ DLC | — | Investigar adapter cuando primer cliente CO firme. §89. |
| **SUNAT FE Perú** | Facturación electrónica Perú | 🔵 EVALUACIÓN | — | mismo, primer cliente PE. |
| **Tribu-CR (Costa Rica)** | Facturación electrónica CR | 🔵 EVALUACIÓN | — | mismo. |
| **Sovos** | Multi-país enterprise (BR + 60 países) | 🟡 PIPELINE post-v1.2 | $30-50k/año | Único viable para Brasil (CBS/IBS reforma tributária 2026-2033). §93. |
| **Avalara** | Tax engine USA + intl | ⚫ DESCARTADA v1.0.x | $1-4k/mes | Costo alto vs catálogo nativo `TaxCatalogEntry` con `TAX_CURATOR` interno (~$1.5-2k/mes). §91. |
| **Vertex** | Tax engine enterprise | ⚫ DESCARTADA v1.0.x | $30k+/año | mismo razonamiento. |

---

## 5. Email + Notificaciones

| Herramienta | Función | Estado | Costo | Decisión |
|---|---|---|---|---|
| **Expo Push API** | Push notifications mobile | 🟢 EN USO | $0 (gratis) | Bundled con Expo. Suficiente hasta ≥10k devices. |
| **Resend** | SMTP + transactional email API | 🟡 PIPELINE v1.0.0 (release blocker) | $20/mes (50k emails) | Modern API (mejor DX que SendGrid) + Cloudflare-friendly. EmailModule actualmente stubbed en `apps/api/src/common/email/`. |
| **SendGrid** | SMTP alt | 🔵 EVALUACIÓN | $20-90/mes | Enterprise option si Resend no escala. |
| **AWS SES** | SMTP commodity | 🔵 EVALUACIÓN Fase 2 | $0.10/1000 emails | Si migramos a AWS, SES es la opción nativa. |
| **Twilio SMS** | SMS check-in confirmations + WhatsApp Business | 🔵 EVALUACIÓN v1.1.x | $0.04/SMS MX | Para pre-arrival warming. CLAUDE.md menciona WhatsApp automático a las 20:00. |
| **WhatsApp Business Cloud API (Meta directo)** | WhatsApp sin reseller | 🔵 EVALUACIÓN v1.1.x | $0.005-0.05/msg | Más barato que Twilio. Decidir cuando entremos a Mensajería sprint v1.1.0. |

---

## 6. Market Intel + Demand + Compset (sprints v1.1.x DLC)

| Herramienta | Función | Estado | Costo | Decisión + ref |
|---|---|---|---|---|
| **Ticketmaster Discovery API** | Event ingest (concerts, sports, theater) | 🟡 PIPELINE v1.1.1 | $0 (5k calls/día gratis) | Cobertura LATAM decente. Sin auth complejo. |
| **PredictHQ** | Event intelligence premium (`local_rank` + `aviation_rank`) | 🟡 PIPELINE v1.1.1 (Premium tier) | $200-1000/mes per property | Hospitality-grade nativo. Pricing alto → solo Premium tier. Ver [docs/ops/predicthq-explainer.md](predicthq-explainer.md). |
| **Calendarific** | Holidays per país | 🟡 PIPELINE v1.1.1 | $9-99/mes | Pro tier — 200+ países. Suficiente para LATAM. |
| **Nager.Date** | Holidays open-source fallback | 🟡 PIPELINE v1.1.1 | $0 (open-source) | Fallback gratis a Calendarific. Cobertura limitada pero LATAM básico OK. |
| **Bandsintown** | Conciertos artist-driven | 🟡 PIPELINE v1.1.1 Pro tier | $50-200/mes | Complementa Ticketmaster para indie/local. |
| **Eventbrite Search API** | Discovery eventos | ⚫ DESCARTADA permanente | — | API discovery descontinuada 2020. |
| **Songkick / SeatGeek / OAG / Festicket / GDELT** | Event sources alt | 🔵 EVALUACIÓN Phase 3+ | varía | Si necesitamos más coverage post-v1.2. |
| **Lighthouse (formerly OTA Insight)** | Compset rate shopping enterprise | 🟡 PIPELINE v1.1.1 | $30-50/property/mes wholesale | Pass-through al cliente. Mejor data LATAM que scraping DIY. CLAUDE.md sprint MARKET-INTEL-PRO. |
| **Amadeus Travel API** | Flight schedules + demand | 🟡 PIPELINE v1.1.1+ Premium tier | $0.005-0.02/call (pay-as-you-go) | Demand Intelligence sprint. Sandbox gratis. |
| **AviationStack** | Flight data alt | 🔵 EVALUACIÓN | $50-150/mes | Backup Amadeus. |
| **FlightAware AeroAPI** | Flight tracking realtime | 🔵 EVALUACIÓN | $100+/mes | Si necesitamos delays/cancellations en flujo. |
| **Cirium FlightStats** | Flight data enterprise | ⚫ DESCARTADA v1.1.x | $$$$ | Sólo enterprise. Overkill. |
| **OAG** | Flight schedules enterprise | ⚫ DESCARTADA v1.1.x | $$$$ | mismo. |

---

## 7. Maps + Geo

| Herramienta | Función | Estado | Costo | Decisión |
|---|---|---|---|---|
| **Google Cloud Places API** | Place search (compset detection + property setup) | 🟡 PIPELINE v1.0.0 | $17/1000 calls | Single source of truth geo. Activar como parte del kickoff Bloque 1 (decisión owner 2026-05-22). |
| **Google Cloud Geocoding API** | Address → lat/lng | 🟡 PIPELINE v1.0.0 | $5/1000 calls | Direcciones LATAM heterogéneas. |
| **Google Hotel Ads** | Marketing channel | 🔵 EVALUACIÓN v1.1.x | rev-share | Futuro module booking-engine. |
| **Mapbox** | Maps render alt | 🔵 EVALUACIÓN | $0-100/mes | Si Google se vuelve caro o queremos personalización mapas. |
| **OpenStreetMap + Nominatim** | Geocoding gratis | 🔵 EVALUACIÓN backup | $0 | Fallback sin API key. Calidad LATAM variable. |

---

## 8. PDF + Documents + e-Signature

| Herramienta | Función | Estado | Costo | Decisión + ref |
|---|---|---|---|---|
| **Puppeteer + Chromium pool** | PDF rendering (Activation Report, CFDI PDF, registration card) | 🟡 PIPELINE v1.0.0 (Step 8 wizard) + v1.1.x SIGN-DLC | $0 (self-hosted) | ADR-0001 elegido sobre wkhtmltopdf/pdfkit/SaaS externos. Pool 1 browser × max 5 pages = ~210MB constante. |
| **Browserless.io** | Puppeteer-as-a-service fallback | 🔵 EVALUACIÓN | $35-200/mes | Escape hatch si self-hosted da problemas. |
| **pdf-lib** | Post-procesamiento metadata (determinismo SHA-256 NOM-151) | 🟡 PIPELINE v1.1.x | $0 (open-source) | Stamp CreationDate epoch para hash reproducible. Crítico NOM-151. |
| **Mifiel** | PSC firma digital NOM-151 | 🟡 PIPELINE v1.1.x SIGN-DLC | $0.50-1/firma | Ya listado en sección 4. |

---

## 9. AI + Voice + Image Bank

| Herramienta | Función | Estado | Costo | Decisión |
|---|---|---|---|---|
| **Anthropic Claude API** | Asistente dev (este chat) + futuras features IA | 🟢 EN USO (dev) | $3-15/M input + $15-75/M output | Single source for AI features (recommendations engine v1.1.1+, support chatbot v1.2+). |
| **OpenAI API** | Embeddings (búsqueda semántica notas/bitácora) | 🔵 EVALUACIÓN v1.1.x | $0.02/1M tokens (text-embedding-3-small) | Para search en BookingNotesThread + concierge knowledge base. |
| **ElevenLabs** | AI voice multilingual (ES/EN/PT) | 🔵 EVALUACIÓN v1.0.0 marketing | $22-330/mes | Mejor calidad voice español LATAM. Para video tutoriales onboarding + sales decks. |
| **Cartesia (Sonic)** | AI voice realtime conversational | 🔵 EVALUACIÓN v1.2+ | $0.06-0.20/min | Si construimos voice agent guest-facing post-v1.2. |
| **OpenAI TTS** | Voice fallback | 🔵 EVALUACIÓN | $15/1M chars | Alternativa más barata pero menos natural en español. |
| **Resemble AI** | Voice cloning custom | ⚫ DESCARTADA v1.0.x | — | Overkill para marketing inicial. |
| **Unsplash + Pexels** | Image bank gratis (hero landing, sales deck) | 🟡 PIPELINE v1.0.0 (landing) | $0 (con attribution) | Cobertura hotelería decente. Free tier perfecto para piloto. |
| **Shutterstock / Getty** | Stock photos premium | ⚫ DESCARTADA v1.0.x | $$$ | Sobra con Unsplash hasta tener guests reales que fotografíen. |
| **Cloudinary** | Image hosting + on-the-fly transforms | 🔵 EVALUACIÓN v1.0.4 IMG | $0-89/mes (free tier 25GB) | Alternativa a Sharp self-hosted en S3/R2. Decisión en sprint IMG. |
| **Sharp (self-hosted)** | Image transforms server-side | 🟡 PIPELINE v1.0.4 IMG | $0 (open-source) | Pareja con S3/R2. Más control + menor costo recurrente. |
| **DALL-E 3 / Midjourney / Stable Diffusion** | Image generation marketing | 🔵 EVALUACIÓN v1.0.0 | $20-60/mes | Para sales deck visuals + landing variants sin presupuesto fotógrafo. |

---

## 10. Developer Tooling + DevOps

### Source control + CI/CD

| Herramienta | Función | Estado | Costo |
|---|---|---|---|
| **GitHub** | Repo + Actions CI/CD + Releases | 🟢 EN USO | $0 (Free) — $4/user (Team) |
| **GitHub Actions** | CI pipeline (lint, test, build) | 🟢 EN USO | $0 (2000 min/mes free) |
| **Turborepo** | Monorepo build orchestration | 🟢 EN USO | $0 (open-source) |
| **pnpm / npm** | Package manager | 🟢 EN USO (npm) | $0 |

### Editor + AI dev assist

| Herramienta | Función | Estado | Costo |
|---|---|---|---|
| **Claude Code CLI** | AI pair programming | 🟢 EN USO | $20/mes Claude Pro |
| **GitHub Copilot** | Inline completions | 🔵 EVALUACIÓN | $10/mes |
| **Cursor / Windsurf** | AI-native IDE | 🔵 EVALUACIÓN | $20/mes |
| **VS Code** | Editor primary | 🟢 EN USO | $0 |

### Issue tracking + docs + design

| Herramienta | Función | Estado | Costo |
|---|---|---|---|
| **Notion** | Internal docs + roadmap visible | 🟢 EN USO (via MCP) | $10/user/mes |
| **Linear** | Issue tracking dev | 🔵 EVALUACIÓN | $8/user/mes |
| **Figma** | Design system + mockups | 🟡 PIPELINE v1.0.0 | $0-15/editor/mes |
| **Excalidraw** | Whiteboard + ADR diagrams | 🔵 EVALUACIÓN | $0 (open-source) |
| **Mermaid** | Diagrams en markdown | 🟢 EN USO | $0 |

### Monitoring + observability + alerting

| Herramienta | Función | Estado | Costo |
|---|---|---|---|
| **Sentry** | Error tracking + perf monitoring | 🟡 PIPELINE v1.0.0 (release blocker) | $0-26/mes (free tier 5k errors/mes) |
| **BetterStack / Logtail** | Logs centralizados + uptime + statuspage | 🟡 PIPELINE v1.0.0 | $0-25/mes (free tier 1GB) |
| **Datadog** | APM enterprise | 🟡 PIPELINE Fase 2 | $15-25/host/mes |
| **New Relic** | APM alt | 🔵 EVALUACIÓN Fase 2 | $0-99/mes (free tier 100GB) |
| **Honeycomb** | Distributed tracing | 🔵 EVALUACIÓN Fase 3 | $0-100/mes |
| **OpenTelemetry** | Standard de instrumentación | 🟡 PIPELINE v1.0.x | $0 (open-source) |
| **PagerDuty** | On-call rotation + alerting | 🔵 EVALUACIÓN Fase 2 | $21/user/mes |
| **Slack** | Team comms + alerting | 🟡 PIPELINE | $7-12/user/mes |

### Testing tools (detalle en `testing-strategy-pre-v1.0.0.md`)

| Herramienta | Función | Estado | Costo |
|---|---|---|---|
| **Jest** | Unit + integration tests | 🟢 EN USO | $0 |
| **ts-jest** | TypeScript transformer | 🟢 EN USO | $0 |
| **Supertest** | API HTTP integration | 🟢 EN USO | $0 |
| **Playwright** | E2E + browser automation | 🟡 PIPELINE v1.0.0 QA-α | $0 |
| **k6** | Load testing (stress + soak) | 🟡 PIPELINE pre-v1.0.0 | $0 (OSS) — $99/mes (Cloud) |
| **Artillery** | Load testing alt | 🔵 EVALUACIÓN | $0 (OSS) |
| **Lighthouse CI** | Web perf + a11y CI gate | 🟡 PIPELINE v1.0.0 | $0 |
| **axe-core** | a11y testing | 🟡 PIPELINE v1.0.0 | $0 (open-source) |
| **Chaos Mesh / LitmusChaos** | Chaos engineering | 🔵 EVALUACIÓN Fase 2 | $0 (OSS) |
| **OWASP ZAP** | Security scan automated | 🟡 PIPELINE pre-v1.0.0 | $0 (OSS) |
| **Snyk** | Dep vulnerability scan | 🟡 PIPELINE v1.0.0 | $0 (free OSS) — $25/user (Team) |

### Secrets + security

| Herramienta | Función | Estado | Costo |
|---|---|---|---|
| **1Password** | Team password manager | 🔵 EVALUACIÓN | $8/user/mes |
| **Doppler** | Secrets sync across envs | 🔵 EVALUACIÓN v1.0.0 | $0-12/user (free tier 5 users) |
| **HashiCorp Vault** | Secrets enterprise | 🟡 PIPELINE Fase 3 | varía |
| **AWS Secrets Manager** | mismo cuando estemos en AWS | 🟡 PIPELINE Fase 2 | $0.40/secret/mes |

### Analytics + product intelligence

| Herramienta | Función | Estado | Costo |
|---|---|---|---|
| **PostHog** | Product analytics + session replay + feature flags | 🟡 PIPELINE v1.0.0 | $0 (free tier 1M events/mes) |
| **Mixpanel** | Product analytics alt | 🔵 EVALUACIÓN | $0-25/mes (free tier 100k MAU) |
| **Amplitude** | Product analytics enterprise | 🔵 EVALUACIÓN | $$$ |
| **Plausible / Fathom** | Privacy-friendly web analytics | 🔵 EVALUACIÓN v1.0.0 landing | $9-19/mes |
| **Google Analytics 4** | Web analytics commodity | ⚫ DESCARTADA | — | Cookie banner pain GDPR + LFPDPPP. |

---

## 11. Stack recomendado para release v1.0.0 (Bloque 1 actual)

Esta es la lista **mínima viable** para lanzar piloto. Todo lo demás se difiere.

| Layer | Tool | Status | Costo/mes |
|---|---|---|---|
| Hosting web | Vercel Pro | 🟢 | $20 |
| Hosting API | Render Standard | 🟢 | $25 |
| Database | Neon Scale | 🟢 | $19 |
| DNS + WAF | Cloudflare free | 🟢 | $0 |
| Storage (post v1.0.4) | Cloudflare R2 | 🟡 | $5 |
| Email | Resend Pro | 🟡 | $20 |
| Push | Expo Push | 🟢 | $0 |
| Channel Manager | Channex sandbox | 🟢 | $0 (dev) |
| Channel Manager | Channex production | 🟡 | pass-through al cliente |
| Maps | Google Cloud | 🟡 | $20 |
| Error tracking | Sentry | 🟡 | $0 (free tier) |
| Logs + uptime | BetterStack | 🟡 | $0-25 |
| Product analytics | PostHog Cloud | 🟡 | $0 (free tier) |
| AI dev | Claude Pro | 🟢 | $20 |
| **TOTAL piloto** | | | **~$150-180/mes** |

Sin esto el sistema NO está listo para clientes reales: Sentry, Resend, Google Cloud, R2, BetterStack. Todo lo demás se va agregando según el sprint que active.

---

## 12. Decisiones registradas — herramientas DESCARTADAS y por qué

Preservamos las decisiones negativas para no re-debate. Si vuelven a la mesa, hay que invalidar la razón aquí escrita primero.

| Herramienta | Razón descarte | Fecha | Re-evaluación |
|---|---|---|---|
| Eventbrite Search API | API descontinuada 2020 | 2026-05-22 | nunca |
| Avalara | Costo $1-4k/mes vs Tax Curator interno ~$1.5k/mes | 2026-05-15 | re-evaluar si entramos a USA |
| Vertex | mismo razonamiento | mismo | mismo |
| Sovos (v1.0.x) | Solo viable post-v1.2 cuando entremos a Brasil | mismo | activación en sprint Brasil |
| PayPal | Adopción <8% boutique LATAM + fees altos | 2026-05-15 | si guests USA/EU lo piden |
| SiteMinder | Cobertura LATAM débil vs Channex | varies | nunca a menos que Channex falle |
| Cloudbeds MyAllocator | Tied a Cloudbeds (incompatible) | varies | nunca |
| Cirium FlightStats / OAG | Solo enterprise, overkill | 2026-05-22 | post-v1.2 si entramos enterprise |
| Resemble AI | Overkill para marketing | 2026-05-24 | si lanzamos voice agent guest |
| Shutterstock / Getty | Unsplash cubre necesidad piloto | 2026-05-24 | cuando tengamos brand profesional |
| Google Analytics 4 | Cookie banner pain LATAM | 2026-05-24 | nunca a menos que requerido legalmente |

---

## 13. Total cost projection per fase (orden de magnitud)

| Fase | Properties | Tools cost/mes | Comments |
|---|---|---|---|
| Piloto (HOY) | 1-3 | **$150-200** | Free tiers everywhere posible |
| v1.0.0 launch | 5-10 | **$300-500** | Sentry paid + Resend escalado + Google Cloud usage |
| Growth (Fase 2) | 10-50 | **$1-3k** | AWS Fargate + RDS + Datadog + Sovos no-brasil |
| Scale (Fase 3) | 50-200 | **$5-15k** | Aurora + multi-AZ + PagerDuty + Vault + Sovos Brasil |
| Enterprise | 200+ | **$30-100k** | Dedicated DevOps team + 24/7 on-call + SOC 2 audit |

**Insight**: los costos de tooling escalan **sub-linealmente** con properties porque los costos fijos (Vercel/Render/Neon mínimos) dominan en piloto, y los costos variables solo crecen cuando hay carga real. No te asustes del piloto siendo ~$200 — es lo correcto. La curva sube fuerte al pasar a Fase 3.
