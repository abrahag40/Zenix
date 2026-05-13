# Zenix PMS — Paquetes y Precios

> **Documento operativo de pricing**. Base para el equipo comercial, ventas consultivas, y decisiones de roadmap (qué feature va en qué tier).
> Fuente de verdad: este archivo + `docs/zenix-sales-master.md` (justificación comercial). Cualquier cambio se refleja en ambos.
> Última actualización: 2026-05-13 — Sprint Mx-1B-W3 W3.0-W3.7 + Tier 1 notifs (A+B+F) + **Sprint Mx-1B-M M3.1-M3.5 cerrado**. Módulo de Mantenimiento feature-complete en backend + web + mobile.

---

## Filosofía de pricing

Tres principios no-negociables que distinguen a Zenix del mercado:

### 1. Tier price ≠ feature lock arbitrario

Los tiers se diferencian por **tamaño operativo de la propiedad** (habitaciones, staff, multi-property), no por encerrar funcionalidad core detrás de un paywall arbitrario.

**Anti-pattern competidor**: Mews cobra el módulo de mantenimiento como add-on de $150/mes encima del PMS base; Cloudbeds cobra mobile como tier upgrade aunque sea una sola app. El usuario pequeño paga más por funcionalidad básica.

**Zenix**: el módulo de mantenimiento, mobile completo, audit trail USALI, no-show outreach, y SSE en tiempo real están en **todos los tiers** desde Essentials. Lo que cambia entre tiers es **capacidad** (habitaciones, staff, OTAs simultáneas, multi-property), no funcionalidad.

### 2. Pricing transparente · cero setup fee · cero per-room

- **Todos los tiers son flat monthly**. Ni Mews per-booking, ni Roomraccoon per-room, ni Cloudbeds escalado lineal por propiedad.
- **Setup fee: $0** en todos los tiers (vs Clock PMS+ €1,500-2,600 setup, Opera $5K-50K setup).
- **Primer mes gratis**, sin tarjeta requerida.
- Una propiedad chica (15 habitaciones, 5 staff) paga Essentials; cuando crece a 50 hab. pasa a Professional. Sin cambiar de proveedor, sin migración, sin re-entrenamiento.

### 3. Foco LATAM

Cumplimiento fiscal CFDI 4.0 / DIAN / SUNAT (v1.2.0), WhatsApp nativo 360Dialog (cuenta el 85% de penetración LATAM vs 20% email), soporte en español de operador hotelero (no de developer outsourced), monedas regionales por default (MXN, COP, ARS, BRL).

---

## Vista general — 3 tiers

| | **Zenix Essentials** | **Zenix Professional** ⭐ | **Zenix Enterprise** |
|---|---|---|---|
| **Precio mensual** | **$149 USD** | **$299 USD** | **$499 USD** |
| **Modelo** | Flat — sin per-room, sin per-booking | Flat | Flat (org-wide, no per-property) |
| **Hasta** | 30 habitaciones · 5 staff | 80 habitaciones · 10 staff | 10 propiedades · staff ilimitado |
| **Setup** | $0 | $0 | $0 |
| **Primer mes** | Gratis | Gratis | Gratis |
| **Onboarding asistido** | Self-service + docs | Asistido (2h video calls) | Account manager dedicado |
| **Soporte** | Email · 24/5 · respuesta <4h | Chat + email · 24/7 · <1h | Slack compartido + AM · SLA 99.9% |
| **Cliente típico** | Hostal 12-30 hab. · 1 ubicación · 1-2 recepcionistas | Boutique 30-80 hab. · 1 ubicación · 5+ housekeepers · 1 supervisor mant. | Cadena 3-10 propiedades · operación distribuida |
| **Segmento** | Reemplaza Little Hotelier / Amenitiz / Cloudbeds Starter | Reemplaza Mews + Flexkeeping / Cloudbeds + módulos | Reemplaza Cloudbeds Enterprise / Mews Multi-Property |
| **vs competencia** | 30-50% más barato con 3× el feature set | 40-60% más barato que Mews+Flexkeeping con paridad funcional | 70-90% más barato que Cloudbeds Enterprise por orden de magnitud |

---

## Detalle por tier

### 🟢 Zenix Essentials — $149/mes

**Target**: hostal pequeño / boutique chico / vacation rental owner-operator. **1 propiedad**, hasta **30 habitaciones**, hasta **5 staff totales**.

**Reemplaza**: Little Hotelier (€89 — pero sin mantenimiento, sin mobile real, sin CFDI), Amenitiz (€42-69 — sin audit trail fiscal, soporte limitado LATAM), Cloudbeds Starter ($200 — sin mantenimiento, mobile básico).

#### PMS core (completo desde el día 1)

- ✅ **Calendario PMS en tiempo real** — SSE multi-cliente · soft-lock advisory para evitar overbooking intra-property (`§26 CLAUDE.md`)
- ✅ **Inventario diario × habitación** con drag & drop (mover reserva, extender, split mid-stay)
- ✅ **Confirmación de llegada (`actualCheckin`)** con 4 pasos AHLEI: datos · identidad · pago · entrega de llave (`CI-10..CI-15`)
- ✅ **Gestión per-bed** para hostales con dorms (único en este tier de precio)
- ✅ **Calendario adaptativo Hotel/Hostal/Vacation Rental** — el wizard de setup detecta el tipo y oculta opciones irrelevantes

#### Housekeeping (módulo completo)

- ✅ **DailyPlanningPage** — recepción planifica salidas en grid de pizarra
- ✅ **Flujo 2 fases** — `batchCheckout` (PENDING) → `confirmDeparture` (READY+push). Nunca activar limpieza antes de salida física (`§1` no-negociable)
- ✅ **Mobile housekeeper** — lista de tareas, start/pause/end, fotos opcionales
- ✅ **KanbanPage supervisor** — 7 columnas + auto-asignación + scrollbar permanente Trello/Jira
- ✅ **Hub Recamarista mobile** — 4 secciones priorizadas (doble urgente · hoy entra · carryover · normal · estadías)
- ✅ **Cola offline** con sync al reconectar (crítico para pisos sin wifi consistente)

#### Mantenimiento (módulo completo — Mx-1 + Mx-1B-W + Mx-1B-M, feature-complete)

**Backend (Sprint Mx-1):**
- ✅ **Sistema de tickets work-order** con 7 estados auditados (OPEN → ACKNOWLEDGED → IN_PROGRESS → WAITING_PARTS → RESOLVED → VERIFIED → CLOSED)
- ✅ **3 flujos de creación**: A top-down (supervisor crea + asigna), B bottom-up (housekeeper reporta → supervisor aprueba), C cola (técnico claim voluntario)
- ✅ **CRITICAL → auto-bloqueo de inventario** vía `RoomBlock` con FK al ticket (`§Mx2 D-Mx2`)
- ✅ **VERIFIED → auto-liberación** de bloqueo y limpieza post-mantenimiento
- ✅ **Audit trail USALI** — 19 eventos por ticket, append-only, exportable
- ✅ **Histórico por habitación** y por asset (lavadora, generador, vehículo) — solo Optii ($350-500/mes) y Quore ($135-171/mes) lo tienen EXTRA al PMS

**Web (Sprint Mx-1B-W1 + W2 + W3):**
- ✅ **Vista raíz adaptativa por rol** (SUPERVISOR · TECHNICIAN · RECEPTIONIST)
- ✅ **Kanban supervisor** con 7+1 columnas, scrollbar permanente, pixel-perfect Apple HIG
- ✅ **TicketDetailDrawer global** — montado a nivel App, accesible desde cualquier vista (W3.6 GlobalMaintenanceDrawer + Zustand store)
- ✅ **Cross-integración calendario** — badge 🔧 dot indicator en RoomColumn, sección en BookingDetailSheet, click bloque originado por ticket abre drawer in-place
- ✅ **Click notificación → drawer in-place** (no navega fuera del contexto)
- ✅ **SLA 2 tiers automatizado** — CRITICAL 15min · HIGH 60min con escalación al supervisor (solo Optii/Quore/MaintainX en otros PMS)

**Mobile (Sprint Mx-1B-M, completo M3.1-M3.5):**
- ✅ **MaintenanceHub** para técnicos — 5 secciones priorizadas (Esperando aprobación · Crítico · Mis tickets · Disponibles · Esperando piezas) con border-l semántico color-coded
- ✅ **ReportProblem screen** con captura de foto, selector room/asset/área general, 11 categorías
- ✅ **TicketDetailScreen** con ciclo de vida completo: claim/start/resolve/verify/reject/close/reopen + photos + comments + audit log humanizado
- ✅ **Push OS-level (M3.2)** — el técnico recibe notificación CRITICAL aunque la app esté cerrada, tap abre directo al ticket detail
- ✅ **Polling fallback (M3.4)** — datos siempre frescos aunque SSE falle (wifi intermitente en pisos)
- ✅ **Bulk-start multi-select (M3.5)** — long-press inicia modo selección, técnico arranca N tickets ACKNOWLEDGED en 1 acción (único en el mercado)
- ✅ **Deep-link tap multi-tipo** — taskId/ticketId/stayId routing automático

#### No-Shows (cumplimiento fiscal)

- ✅ **Night audit multi-timezone** — IANA timezone por propiedad (Mews/Cloudbeds tienen este bug documentado)
- ✅ **Idempotencia `noShowProcessedDate`** — sin doble-marcado al reiniciar cron
- ✅ **Pre-arrival warning a las 20:00 local** — alerta amber en calendario
- ✅ **Outreach automático WhatsApp** (360Dialog · 85% open rate LATAM) + email (Postmark)
- ✅ **GuestContactLog append-only** — evidencia Visa Core Rules §5.9.2 para disputas de chargeback
- ✅ **Ventana de reversión 48h** con audit trail completo
- ✅ **Reporte CSV exportable** CFDI-ready (`RPT-02`)
- ✅ **Liberación inmediata de inventario** al marcar no-show

#### Notificaciones

- ✅ **NotificationCenter (Sprint 7D)** — bell 🔔 con 3 niveles (ambient · notification · alarm) siguiendo Apple HIG 2024 · Cisco Healthcare Alert Fatigue Study 2021
- ✅ **Push tokens Expo** para mobile housekeeper y técnico
- ✅ **SSE en web** para 8 eventos críticos (`task:*`, `maintenance:ticket:*`, `notification:new`)
- ✅ **Audit log** de quién leyó, quién aprobó, cuándo

#### Channel Manager (limitado en Essentials)

- ✅ **Channex.io integración** (Sprint 8C — v1.0.x)
- ⚠️ **Hasta 1 OTA simultánea** (Booking O Airbnb, no ambos). Para multi-canal → upgrade a Professional.

#### Reportes y métricas

- ✅ Ocupación diaria · tareas completadas · housekeeper performance (self-vs-self, privado por staff)
- ✅ No-shows exportable CSV
- ❌ Revenue por canal (Professional)
- ❌ Benchmarks cross-property (Enterprise)

#### Configuración

- ✅ **Wizard de onboarding** que detecta tipo de propiedad y configura defaults
- ✅ **PropertySettings**: timezone, hora cutoff no-show, hora roster matutino, frecuencia stayover, late checkout escalación
- ✅ **CRUD habitaciones, camas, staff**
- ✅ **Roles**: SUPERVISOR · RECEPTIONIST · HOUSEKEEPER (con department MAINTENANCE para técnicos)
- ❌ RBAC granular (Professional)
- ❌ Org-tree visualization (Enterprise — v1.1.0)

#### Cumplimiento fiscal

- ✅ **Export CSV CFDI/DIAN/SUNAT-ready** para entrega al contador
- ✅ **Audit trail inmutable** de no-shows, pagos, cancelaciones, mantenimiento
- ❌ **Generación CFDI 4.0 XML firmado** (Enterprise v1.2.0 — Módulo de Facturación LATAM)

#### Marketing

- ✅ Export CSV segmento "Huéspedes con extensión" (Sprint 9 — Marketing module scaffold)
- ❌ Cuatro segmentos completos (Professional)
- ❌ Benchmarks anonimizados cross-property (Enterprise)

#### Soporte

- Email · 24 horas / 5 días · respuesta <4 horas
- Knowledge base online (Diátaxis: tutorials · how-to · reference · explanation)
- Comunidad Slack moderada por Zenix

#### Justificación del precio $149

**Costo de adquisición de cliente (CAC) estimado**: $120 (Inbound SEO + Google Ads LATAM)
**Costo operativo por cliente/mes**: ~$100 (infra Vercel + Postgres managed + Postmark + 360Dialog + soporte tier 1)
**Margen bruto**: ~$49 (33%)
**Payback**: 2.5 meses

**vs Little Hotelier €89** (~$95 USD): Zenix Essentials cuesta +$54 al mes pero incluye módulo de mantenimiento, mobile real, audit trail fiscal, WhatsApp pre-arrival. En Little Hotelier el upgrade a "PLUS" (€150 ~$160) sigue sin mantenimiento. Diferencia neta: Zenix +$10 vs Little Hotelier PLUS por funcionalidad operativamente esencial.

**vs Cloudbeds Starter $200**: Zenix Essentials cuesta -$51, con más funcionalidad nativa (sin add-ons).

---

### ⭐ Zenix Professional — $299/mes

> **Tier estrella — donde el 70% de los clientes deberían estar.**

**Target**: boutique hotel 30-80 habitaciones · 1 ubicación · staff diferenciado (recepción + housekeeping + 1 técnico de mantenimiento dedicado) · supervisor activo.

**Reemplaza**: Mews ($300/mes) + Flexkeeping ($150-300 EXTRA) = $450-600 → Zenix $299. **Ahorro: 40-60%**. Cloudbeds Growth ($500) + complejidad de armar mobile + mantenimiento = $500+ → Zenix con paridad funcional por -$201.

**Incluye TODO lo de Essentials** +:

#### Capacidad expandida

- ✅ **Hasta 80 habitaciones** (vs 30 en Essentials)
- ✅ **Hasta 10 staff** (vs 5 en Essentials)
- ✅ **Channel Manager unlimited** — Channex white-label, sin límite de OTAs simultáneas (Booking + Airbnb + Hostelworld + Expedia + Despegar regional)

#### Productividad avanzada (8K post-release v1.0.x)

- ✅ **Productividad self-vs-self** del housekeeper — "Mi semana" tab privada con récords personales, sin comparación con peers (D7 privacy by design · Deci & Ryan 1985 Self-Determination Theory)
- ✅ **Clock-in/out UI** con `StaffShiftClock` append-only para USALI labor accounting
- ✅ **Verificación con foto** — el supervisor verifica limpieza con before/after photos del housekeeper
- ✅ **Gamificación capa 2** — 30+ badges SVG animados · catálogo de mensajes contextualizados (Mekler et al. 2017 — feedback significativo > PBL público)

#### Gestión de tarifas (Sprint 9)

- ✅ **Rate plans configurables** por tipo de habitación (estacionalidad, fin de semana, eventos)
- ✅ **Modificación manual de precios** con razón obligatoria auditada (`rateOverride` · `rateOverrideReason`)
- ✅ **Permisos**: solo SUPERVISOR/MANAGER pueden hacer overrides
- ✅ **Revenue reports por canal** — `GET /reports/revenue` con breakdown por OTA (directo · Booking · Airbnb · etc.) · comisiones · revenue neto
- ✅ **Historial de cambios de precio** visible en `ReservationDetailPage > Historial`

#### Mantenimiento avanzado

- ✅ **Bridge HK ↔ Mantenimiento documentado y monitoreado** — métricas de cuántos tickets vinieron de housekeeping, tiempo de resolución por categoría
- ✅ **Mantenimiento preventivo recurrente** (Sprint Mx-2 — v1.1.0) — 24 templates pre-seed (AHLEI/ASHRAE/NFPA/USALI) que generan tickets en frecuencia configurable
- ✅ **Reportes operativos**: tiempo promedio de respuesta · resolución por categoría · SLA breach rate · tickets por habitación (heatmap de cuartos problemáticos)

#### Marketing module

- ✅ **Cuatro segmentos completos**: Extensiones · No-shows · Huéspedes frecuentes (count >=2) · Alto valor (top 20% por revenue, Pareto)
- ✅ **Export CSV/JSON** para llevar a Mailchimp / HubSpot / Brevo (separación PMS ↔ CRM — Inmon 2005)
- ✅ **Filtros avanzados** por rango de fechas, canal, demografía básica

#### Configuración avanzada

- ✅ **RBAC granular** — permisos por rol y por feature (auditor read-only · manager sin override · etc.) — Sprint v1.1.0
- ✅ **Multi-currency** simultánea (huéspedes pagando en USD vs MXN)
- ✅ **Custom roles** (Owner, Auditor) con scope limitado

#### Mobile completo

- ✅ **Mobile housekeeper** (incluido en Essentials)
- ✅ **Mobile MaintenanceHub** para técnicos (Mx-1B-M)
- ✅ **Push notifications tier 2.5** (urgent operational) con haptic feedback

#### Soporte

- Chat + email · 24/7 · respuesta <1 hora
- Onboarding asistido: 2 video calls × 60min (setup wizard + entrenamiento del equipo)
- Migración de datos asistida desde Mews/Cloudbeds/Little Hotelier

#### Justificación del precio $299

**Costo operativo por cliente/mes**: ~$150
**Margen bruto**: ~$149 (50%)
**Payback**: 4 meses (asumiendo upgrade desde Essentials)

**Argumento de venta** (de `zenix-sales-master.md:1242`):
> *"Zenix Professional cuesta $299 al mes — incluye PMS completo, channel manager con Booking/Airbnb/Hostelworld, módulo de mantenimiento con bridge a housekeeping, mobile para tu equipo de limpieza y de mantenimiento, gestión de no-shows con audit trail para chargebacks, e histórico de mantenimiento por habitación. Es un único precio. Cero setup fee. Si quisieras lo mismo en Mews + Flexkeeping pagarías €500 mensuales — Zenix te ahorra 40%. Si lo intentaras armar con Cloudbeds + módulos sueltos, llegarías a $400 al mes y tendrías 3 sistemas que no se hablan entre sí. Aquí es uno solo, en español, hecho para hoteles latinos."*

---

### 🏢 Zenix Enterprise — $499/mes

**Target**: cadena boutique emergente · 3-10 propiedades · operación distribuida · staff multi-rol cross-property · necesidad de reporting consolidado.

**Reemplaza**: Cloudbeds Enterprise (10 propiedades = $4,000-10,000/mes por su modelo lineal) · Mews Multi-Property (€2,000+/mes) · Opera Cloud Multi-Property ($50K-500K+/año + setup).

**Incluye TODO lo de Professional** +:

#### Multi-propiedad (la decisión arquitectónica más cara de la competencia)

- ✅ **Hasta 10 propiedades** bajo una sola organización
- ✅ **Property switcher** en GlobalTopBar (ya implementado — `G1` resuelto)
- ✅ **JWT scoped por propiedad** con `POST /auth/switch-property` que emite token nuevo
- ✅ **Dashboard agregado cross-property** (v1.1.0) — owner ve ocupación y revenue consolidados sin abrir cada propiedad
- ✅ **Cross-property staff** (Sprint v1.1.0) — un Manager con scope sobre 3 propiedades, un técnico itinerante que cubre 2

#### Módulo de Facturación LATAM (v1.2.0)

- ✅ **CFDI 4.0 México** — generación de XML firmado vía PAC (Facturama / SW Sapien / Solución Factible · integración nativa)
- ✅ **DIAN Colombia** y **SUNAT Perú** — generación de documentos fiscales equivalentes
- ✅ **Folios fiscales, series, cancelaciones SAT**
- ✅ **Notas de crédito automáticas** por reversión de no-show / waiveCharge
- ✅ **Reportes contables USALI Schedule 11** — revenue por categoría · taxes recaudados · breakdown por propiedad

> **Sin facturación nativa los clientes MX no pueden operar legalmente >30 días sin workaround manual con su contador**. Razón de re-orden v1.2.0 (antes v1.2.0 era BI; ahora BI baja a v1.3.0).

#### BI cross-property + Benchmarks (v1.3.0)

- ✅ **Floor plan visualization** del mantenimiento por propiedad (heatmaps de habitaciones problemáticas)
- ✅ **Benchmarks anonimizados cross-property** con k-anonymity ≥5 (Data Network Effects — `zenix-sales-master.md` Sprint 9+ scaffold)
- ✅ **Dynamic pricing recommendations** basado en ocupación histórica + demanda local + competencia (v1.3.0)
- ✅ **Predictive maintenance** (v2.0 — pattern Optii adquirido por Amadeus, requiere ≥6 meses datos)

#### Org-tree visualization (v1.1.0)

- ✅ **SuccessFactors-like** — consume `Staff.reportsToId` (ya disponible desde Sprint 9 G1)
- ✅ Visualización jerárquica owner → general manager → property managers → supervisors → staff
- ✅ Útil para cadenas con estructura de reporting compleja

#### Partner portal (v1.1.0)

- ✅ Portal Diátaxis para sub-consultoras que distribuyen Zenix (modelo SAP-style)
- ✅ Documentación: tutorials (onboarding) · how-to (tasks) · reference (API) · explanation (architecture)
- ✅ Comisiones recurrentes documentadas

#### Integraciones premium

- ✅ **API externa** para integraciones custom (ERP del cliente, BI tools, channel managers especializados)
- ✅ **Webhooks outbound** configurables para eventos críticos
- ✅ **Custom integrations** desarrolladas por el equipo Zenix (incluido en pricing)
- ✅ **White-label** opcional para sub-marcas

#### Soporte Enterprise

- **Slack compartido** con el equipo Zenix · respuesta <30min business hours
- **Account Manager dedicado** — 1 persona asignada que conoce tu operación
- **SLA 99.9% uptime** documentado con créditos automáticos si se incumple
- **Migración white-glove** desde cualquier PMS legacy (incluyendo Opera, Mews, Cloudbeds Enterprise)
- **Trainings on-site** disponibles (costo de viaje aparte)

#### Justificación del precio $499

**Costo operativo por cliente/mes**: ~$200 (infra escalada · soporte premium · account manager fractional)
**Margen bruto**: ~$299 (60%)
**LTV/CAC ratio target**: >10×

**Argumento de venta** (de `zenix-sales-master.md:1246`):
> *"Zenix Enterprise es $499 mensuales para toda la organización — no per property. En Cloudbeds Enterprise estarías pagando $4,000-10,000 al mes por las mismas 5 propiedades. La razón: el modelo de precio de Cloudbeds escala lineal con propiedades, el nuestro está pensado para que crezcas sin que el sistema te cobre por crecer. Si abres la sexta propiedad mañana, sigues en $499."*

**Punto de inflexión clave**: cuando un cliente tiene 3+ propiedades, Cloudbeds/Mews cuestan $1,500-3,000/mes mientras Zenix Enterprise sigue en $499. **El ahorro paga el upgrade desde Professional en la primera propiedad adicional**.

---

## Matriz comparativa rápida

| Feature | Essentials | Professional | Enterprise |
|---|:---:|:---:|:---:|
| **Calendario PMS + SSE en tiempo real** | ✅ | ✅ | ✅ |
| **Soft-lock advisory anti-overbooking intra** | ✅ | ✅ | ✅ |
| **Gestión per-bed (hostales)** | ✅ | ✅ | ✅ |
| **Confirmación check-in 4 pasos AHLEI** | ✅ | ✅ | ✅ |
| **Housekeeping completo (web + mobile)** | ✅ | ✅ | ✅ |
| **Hub Recamarista mobile (Sprint 8I)** | ✅ | ✅ | ✅ |
| **KanbanPage supervisor** | ✅ | ✅ | ✅ |
| **Mantenimiento completo (3 flujos + SLA 2-tier)** | ✅ | ✅ | ✅ |
| **Auto-bloqueo CRITICAL + auto-liberación** | ✅ | ✅ | ✅ |
| **Histórico mantenimiento por habitación/asset** | ✅ | ✅ | ✅ |
| **Mobile MaintenanceHub para técnicos (Mx-1B-M)** | ✅ | ✅ | ✅ |
| **Push OS-level con deep-link al ticket (M3.2)** | ✅ | ✅ | ✅ |
| **Bulk-start mobile multi-select (M3.5)** | ✅ | ✅ | ✅ |
| **Polling fallback SSE (M3.4)** | ✅ | ✅ | ✅ |
| **Click notif → drawer in-place (W3.6)** | ✅ | ✅ | ✅ |
| **Bridge HK→Mtto con sourceTaskId** | ✅ | ✅ | ✅ |
| **No-show fiscal completo + WhatsApp** | ✅ | ✅ | ✅ |
| **NotificationCenter (Sprint 7D) 3 tiers** | ✅ | ✅ | ✅ |
| **Audit trail USALI append-only** | ✅ | ✅ | ✅ |
| **Wizard de onboarding adaptativo** | ✅ | ✅ | ✅ |
| **Export CSV CFDI/DIAN/SUNAT-ready** | ✅ | ✅ | ✅ |
| **Habitaciones máximas** | 30 | 80 | ilimitadas |
| **Staff máximo** | 5 | 10 | ilimitado |
| **OTAs simultáneas (Channex)** | 1 | unlimited | unlimited |
| **Propiedades** | 1 | 1 | 10 |
| **Productividad self-vs-self housekeeper** | ❌ | ✅ | ✅ |
| **Clock-in/out USALI** | ❌ | ✅ | ✅ |
| **Verificación con foto** | ❌ | ✅ | ✅ |
| **Gamificación capa 2 (30+ badges)** | ❌ | ✅ | ✅ |
| **Rate plans configurables** | ❌ | ✅ | ✅ |
| **Revenue por canal** | ❌ | ✅ | ✅ |
| **Mantenimiento preventivo recurrente** | ❌ | ✅ | ✅ |
| **Marketing module 4 segmentos** | ❌ | ✅ | ✅ |
| **RBAC granular** | ❌ | ✅ | ✅ |
| **Multi-property dashboard** | ❌ | ❌ | ✅ |
| **Property switcher cross-property** | ❌ | ❌ | ✅ |
| **CFDI 4.0 / DIAN / SUNAT generación XML** | ❌ | ❌ | ✅ |
| **Org-tree visualization** | ❌ | ❌ | ✅ |
| **BI / benchmarks cross-property** | ❌ | ❌ | ✅ |
| **Floor plan visualization** | ❌ | ❌ | ✅ |
| **Dynamic pricing recommendations** | ❌ | ❌ | ✅ |
| **Predictive maintenance ML** | ❌ | ❌ | ✅ |
| **API externa + webhooks** | ❌ | ❌ | ✅ |
| **White-label** | ❌ | ❌ | ✅ |
| **Account manager dedicado** | ❌ | ❌ | ✅ |
| **SLA 99.9% con créditos** | ❌ | ❌ | ✅ |

---

## Add-ons / Overages

Cuando un cliente excede los límites de su tier, **NO se le cobra automáticamente** — el sistema notifica al owner y propone upgrade. Filosofía: cero sorpresas en la factura.

| Overage | Trigger | Acción |
|---|---|---|
| Excedió habitaciones del tier | Cliente Essentials configura habitación #31 | Banner persistente "Upgrade a Professional para habilitar más habitaciones" + bloqueo de creación de la nueva habitación (no se cobra extra silenciosamente) |
| Excedió staff | Cliente Professional intenta crear staff #11 | Banner + bloqueo + propuesta de upgrade a Enterprise |
| Necesita OTA #2 en Essentials | Conecta segunda OTA en Channex config | Banner "Multi-OTA requiere Professional" + bloqueo de activación |
| Necesita 2ª propiedad | Cliente Professional intenta crear propiedad #2 | Bloqueo + propuesta de upgrade a Enterprise |
| Necesita generación CFDI XML | Cliente Professional pide al accountant export | El export sigue funcionando (CSV); para XML firmado upgrade a Enterprise |

**Add-ons puntuales disponibles a TODOS los tiers**:

| Add-on | Precio | Cuándo aplica |
|---|---|---|
| **Migración white-glove** desde otro PMS (Mews/Cloudbeds/Opera) | $500-2,000 one-time | Onboarding inicial · Enterprise incluido |
| **Training on-site** para el equipo (1 día) | $500 + viáticos | Cuando el cliente lo pide |
| **Custom integrations** (ERP, BI tool específico) | $1,500-5,000 one-time | Enterprise incluye 2 al año |
| **Branded mobile app** (white-label) | $300/mes adicional | Solo Enterprise |
| **Soporte fuera de SLA** (incidentes nocturnos sin contrato Enterprise) | $150/incidente | Essentials/Professional |
| **Anual prepago** | -10% del total | Cualquier tier (mejora cash flow Zenix) |

---

## Upgrade triggers (cuándo proponer el upgrade)

El sistema detecta automáticamente y notifica al owner (NotificationCenter `OWNER_UPGRADE_SUGGESTED`):

### Essentials → Professional

- Habitación #25 creada (early warning · 5 de 30 disponibles)
- Staff #4 creado
- Segunda OTA solicitada en config
- Pedido de rate plans configurables
- Pedido de revenue report por canal
- 3+ "rejection" de feature request por estar en Essentials en último mes

### Professional → Enterprise

- Habitación #65 creada (early warning · 15 de 80 disponibles)
- Pregunta del owner sobre CFDI/DIAN/SUNAT en chat de soporte
- Segunda propiedad solicitada
- Pedido de API externa
- Cadena emergente: el owner es dueño de propiedad #2 (detectado vía soporte o LinkedIn enrichment)
- 6 meses de pago consistente sin churn → enviar propuesta proactiva

---

## Precios regionales

LATAM tiene poder adquisitivo distinto al USD spot. Pricing efectivo:

| Región | Essentials | Professional | Enterprise |
|---|---|---|---|
| **México · Colombia · Perú · Chile · Argentina · Ecuador** | MXN $2,690 ($149) | MXN $5,390 ($299) | MXN $8,990 ($499) |
| **España · Portugal** | €139 | €279 | €459 |
| **USA · Canadá · UK** | $149 USD | $299 USD | $499 USD |
| **Resto LATAM** (Bolivia · Paraguay · Uruguay · Centroamérica) | $99 | $199 | $349 |

**Por qué precios distintos por región**:
- Poder adquisitivo: Zenix Bolivia $99 = ~10 días de ingreso operativo de un hostal de 15 hab. en La Paz
- Conversión: en México el sweet spot psicológico es <$150 USD; arriba de eso, frio
- Competencia local: en España, Amenitiz cobra €42-69 — el tier base debe ser competitivo

**Esto NO es discriminación de precio** — es **regional pricing** estándar (ver Stripe, Slack, Notion, Figma todos lo hacen). El customer puede ver el precio en su moneda local.

---

## Anti-fricción comercial (lo que NO hacemos)

| Anti-pattern del mercado | Por qué evitarlo | Zenix |
|---|---|---|
| **Per-room pricing** (Roomraccoon, Clock PMS+) | Castiga el crecimiento — el cliente paga más por agrandar | Flat por tier |
| **Per-booking commission** (Mews algunos planes) | Imprevisible — el cliente no puede presupuestar | Flat |
| **Per-property scaling** (Cloudbeds Enterprise) | A 5 propiedades, $4K/mes inviable para boutique chain | $499 hasta 10 propiedades |
| **Setup fee $1K-50K** (Clock PMS+, Opera) | Barrera de entrada — el cliente no prueba antes de comprar | $0 setup |
| **Mantenimiento como add-on $150-300** (Mews + Flexkeeping) | Doble licencia, dos sistemas que no se hablan | Incluido en todos los tiers |
| **Mobile detrás de paywall premium** (Cloudbeds, Mews) | El housekeeper es quien más necesita mobile · paywall lo bloquea | Mobile completo en Essentials |
| **Auto-charge al exceder límite** | Sorpresa en factura → churn | Bloqueo + propuesta de upgrade, nunca cobro silente |
| **Renovación automática anual sin aviso** | El cliente se entera tarde y pelea con su banco | Email 30 días antes con opt-out |

---

## Modelo de comisiones por sub-consultora (partner network — v1.1.0)

Para distribución vía red de sub-consultoras (modelo SAP) — ver `~/.claude/projects/-Users-abraham-Documents-Projects-housekeeping3/memory/project_business_model.md`:

| Tier | Comisión recurrente | Setup share | Notas |
|---|---|---|---|
| **Bronze** (0-5 clientes activos) | 15% MRR | 50% del setup fee si aplica | Sin contrato exclusivo |
| **Silver** (6-15 clientes) | 20% MRR | 60% | Onboarding training del partner pagado por Zenix |
| **Gold** (16-50 clientes) | 25% MRR | 70% | Co-marketing budget compartido |
| **Platinum** (51+ clientes) | 30% MRR | 80% | Listing prominente en partner portal · referrals priorizados |

**Ejemplo concreto**: un partner Silver con 10 clientes en Professional ($299) gana:
- MRR recurrente: 10 × $299 × 20% = **$598/mes** indefinido
- Anualizado: $7,176/año por solo mantener relación + soporte tier-1

---

## Plan de transición v1.0.0 → v1.0.x → v1.1.0+

### v1.0.0 (release inicial — Q3 2026)

**Disponible**: TODA la funcionalidad de Essentials + 80% de Professional (rate plans diferidos a Sprint 9 · Marketing module diferido)

**Pricing inicial promocional** (los primeros 50 clientes Founding Members):
- Essentials: **$99/mes** (locked-in 12 meses, luego $149)
- Professional: **$199/mes** (locked-in primer año)
- Enterprise: **negociable** caso por caso

**Por qué descuento agresivo de lanzamiento**:
- Build social proof (testimonios, case studies)
- Detectar friction operativa que solo aparece en producción real
- Validar el unit economics antes de invertir en CAC paid

### v1.0.x (Q4 2026)

**Activación**: Sprint 8A (Stripe/Conekta payment processing) + Sprint 8C (Channex.io real).

Sin esto, los clientes pueden operar pero el cobro de no-show queda en `PENDING` esperando integración manual con su pasarela.

### v1.1.0 (Q1 2027)

**Activación**: RBAC UI granular + Partner portal Diátaxis + Org-tree visualization (consume `Staff.reportsToId` ya disponible).

Habilita el tier Enterprise completo + modelo de sub-consultoras.

### v1.2.0 (Q2 2027) — Módulo de Facturación LATAM

**Activación**: CFDI 4.0 + DIAN + SUNAT generación XML firmado.

**Re-orden desde el roadmap original (era BI)**: sin facturación nativa los clientes MX no pueden operar legalmente >30 días sin workaround manual. Bloqueante comercial real.

### v1.3.0 (Q3 2027) — BI cross-property

**Activación**: benchmarks anonimizados, dynamic pricing, floor plan, inbound WhatsApp.

### v2.0 (Q4 2027+)

**Activación**: predictive maintenance ML (pattern Optii), inventario de refacciones (pattern Quore).

---

## Conclusión — por qué este pricing gana

1. **Floor del mercado**: $149 vence a Little Hotelier €89 en feature set (3× la funcionalidad por +$54)
2. **Sweet spot**: $299 mata a Mews+Flexkeeping €500 con paridad funcional total (-40-60%)
3. **Top**: $499 hasta 10 propiedades es orden de magnitud más barato que Cloudbeds Enterprise (-80-90%)
4. **Sin trampas**: flat pricing, cero setup, cero per-room, cero per-booking, mobile incluido en todo, mantenimiento incluido en todo
5. **Made for LATAM**: WhatsApp nativo, español operativo (no traducido), CFDI-ready, soporte en zona horaria local, regional pricing real

**El cliente boutique no debería pagar $500/mes para que su housekeeper pueda usar una app**. Ese es el insight estructural que define el pricing de Zenix.

---

*Documento maintained junto con `docs/zenix-sales-master.md`. Cualquier cambio de tier, feature o precio se refleja en ambos archivos en la misma sesión (§Actualización automática del documento de ventas — CLAUDE.md).*
