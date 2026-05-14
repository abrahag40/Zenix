# 03 · Roadmap v1.0 → v2.0

> Ladder de versionado con justificación, dependencias, y métricas de éxito por versión.
> Cada versión está pensada para ser vendible independientemente.

---

## 1. Resumen del ladder

| Versión | Misión | Trigger comercial |
|---------|--------|-------------------|
| **v1.0** | "Funciona en 1 hotel real sin perder dinero" | Hotel Monica Tulum piloto |
| **v1.0.x** | "Cobra automático + sincroniza OTAs" | Mismos clientes con volumen Booking.com |
| **v1.1** | "Multi-tenant maduro + semilla partners" | Onboarding sin asistencia técnica |
| **v1.2** | "Distribución activa + BI tier-1" | Primer partner certificado vende a 3 hoteles |
| **v1.3** | "Punto de venta integrado" | Hotel con restaurante completo |
| **v1.4** | "Compras y costos profesional" | Hotel quiere controlar COGS |
| **v1.5** | "Experiencia del huésped premium" | Boutique upscale pide diferenciación |
| **v1.6** | "Hardware integrado" | Hotel quiere reemplazar cerraduras card-key |
| **v1.7** | "Recursos humanos hotelero" | Cliente sufre rotación 40%+ |
| **v1.8** | "Contabilidad nativa hotelera" | Cliente sale de SAP B1 o Xero |
| **v1.9** | "Marketplace activo" | 30+ propiedades activas con Procure |
| **v2.0** | "Data licensing externo + AI predictivo" | Primer contrato ABI con OTA o tourism board |

---

## 2. v1.0.0 — PMS Base (Q2 2026, en curso)

### Misión
Producto operativo y estable para 1-3 hoteles piloto en LATAM. Ningún bug crítico de seguridad llega al piloto. Mx-1 cierre completo. Las 3 plataformas (api/web/mobile) listas.

### Sprints restantes

| Sprint | Alcance | Días |
|--------|---------|------|
| **SEC-α** | Hardening de seguridad multi-tenant (bugs MT-5, MT-3, NS-3, NS-6, MT-7, MT-8 de auditoría) | 5-7 |
| **Mx-1B finalización** | Cerrar gaps menores del módulo de mantenimiento (web + mobile) | 3-4 |
| **Setup Recamaristas** (antes 8J) | SettingsPage tab "Recamaristas" — turnos + cobertura + reglas | 5-7 |
| **Pulido v1** | Bugs medios cleanup (CAL-10, PAY-8, BLK-6, MAINT-4, NOTIF-7+13, NOTIF-11) | 2-3 |
| **Tests v1** | Test coverage mobile housekeeping (Hub) | 4-5 |

### Gate de release v1.0.0

- SEC-α verificado con pen-test interno (2 cuentas en distinta propiedad)
- Setup Recamaristas permite onboarding sin asistencia técnica (medido: 30 min total)
- DoD metrics del CLAUDE.md cumplidas (latencia SSE <5s, CRITICAL→auto-block 100%, ≥100 tests verdes, etc.)
- 0 errores TypeScript en api + web + mobile

### Streams activos
R1 (PMS subscription), R14 (consulting directo)

---

## 3. v1.0.x — Revenue Enablement (Q3 2026)

### v1.0.1 · PAY — Procesamiento de pagos
Módulo `apps/api/src/payments/` con providers Stripe (internacional) + Conekta (MX OXXO + tarjetas). UI "Procesar cargo" en BookingDetailSheet. UI "Perdonar cargo + razón" con audit a StayJourney.

**Por qué después de v1.0:** requiere capital comercial (cuenta Stripe/Conekta + KYC del cliente). No bloquea operación del piloto — cobro manual sigue funcionando.

**Esfuerzo:** 2 semanas (incluye sandbox tests + KYC del cliente).

### v1.0.2 · CHX — Channex.io integración real
`ChannexGateway.pushInventory()` real (hoy stub). Webhooks inbound `booking_new` / `booking_modify` / `booking_cancel`. Reportes con breakdown por canal.

**Por qué:** la Capa 1 hard-block ya previene overbooking. Channex mejora UX en OTAs (la habitación desaparece antes del intento de reserva, no después).

**Esfuerzo:** 2 semanas + 1 testing con sandbox Channex.

### v1.0.3 · IMG + NS-UI + DEBT-α
- IMG: S3 + Sharp upload infrastructure (extracted del placeholder Mx-1B-W2)
- NS-UI: Toggle "Ocultar no-shows" en calendario
- DEBT-α: Limpieza deuda técnica menor (BLK-4 PRIVATE rooms multi-bed, MAINT-3 photo size validation, PAY-9 WAIVED separation, PUSH-11 token property scoping)

**Esfuerzo:** 1 semana total.

### Streams adicionados en v1.0.x
R1 estable, payment processing automático.

---

## 4. v1.1 — Multi-Tenant Maduro + Data Consent (Q4 2026)

### Misión
Cadenas multi-propiedad pueden operar. Sembrar campos `consentToAggregation` y `partnerId` en schema (sin UI todavía) para no cerrar puertas a v1.2+.

### Sprints

| Sprint | Alcance |
|--------|---------|
| **RBAC-UI** | Página `/settings/permissions` con matrix role × feature. AUDITOR read-only. Renombrar StaffRole. Crear StaffRole.TECHNICIAN real. |
| **CROSS-PROP** | Endpoint `GET /v1/reports/cross-property`. Página `/dashboard/organization` con KPIs sumados + comparativa. Org-tree viz. |
| **DATA-CONSENT** | Schema fields `Property.consentToAggregation`, `GuestStay.guestConsentSnapshot`. UI doble consent (hotel + huésped en check-in). |
| **PARTNER-SEED** | Schema fields `Partner` model + `Organization.partnerId`. Sin UI todavía. Migration safe. |

### Streams adicionados
R10 semilla (consent legal sembrado para BI), preparación R13.

---

## 5. v1.2 — Partner Network + BI tier-1 (Q1 2027)

### Misión
Distribución activa. Primer partner certificado opera 3-5 hoteles. ZaharDev libera ancho de banda — solo strategic clients directos.

### Sprints

| Sprint | Alcance |
|--------|---------|
| **PARTNER-PORTAL** | App `apps/partner` (React + Vite). CRM partner + multi-hotel pipeline + white-label parcial + billing dashboard. |
| **PARTNER-CERT** | Programa certificación: training online + práctico. Tiers Bronze/Silver/Gold/Platinum. |
| **INSIGHTS-T1** | Benchmarks por ciudad mensuales. k-anonymity ≥5 propiedades. Consume DATA-CONSENT de v1.1. |
| **ETL-INTERNAL** | Pipeline ZaharDev → data warehouse interno (BigQuery o Snowflake). dbt para transformaciones. |

### Streams adicionados
R10 activo (Insights vendible), R13 activo (partner license), R14 escalado vía partners.

### Métrica de éxito
≥3 partners certificados Silver + ≥10 propiedades activas no piloto.

---

## 6. v1.3 — Zenix POS (Q2 2027)

### Misión
Punto de venta hotelero con integración nativa folio↔POS. Hotel con restaurante puede operar todo en Zenix.

### Apps nuevas
- `apps/pos-terminal` (iPad/PWA) — meseros y barman
- `apps/kds` (kiosk webview) — cocina

### Streams adicionados
R2 (POS subscription).

### Ver detalle
[04-module-pos.md](04-module-pos.md)

---

## 7. v1.4 — Zenix Procure (Q3 2027)

### Misión
Compras + inventario + COGS multi-departamento. Consume datos POS (recetas) y los enriquece (suppliers, par levels). Da arquitectura a Marketplace futuro.

### Streams adicionados
R3 (Procure subscription). Semilla R11 (Marketplace data).

### Ver detalle
[05-module-procure.md](05-module-procure.md)

---

## 8. v1.5 — Zenix Stay + NFC (Q4 2027)

### Misión
Guest App con identidad NFC. Smartphone-first, wristband secundario. Permite tap-to-pay en POS, charge-to-room sin cash, captura nacionalidad para insights culturales.

### App nueva
- `apps/guest` (Expo branded "Zenix Stay")

### Streams adicionados
R4 (Stay free/freemium), R5 (NFC consumibles).

### Ver detalle
[06-module-stay-access.md](06-module-stay-access.md)

---

## 9. v1.6 — Zenix Access (Q1 2028)

### Misión
Hardware integrado al ecosistema. Cerraduras NFC + BLE white-label OEM (TTLock/Sciener compatible). Gateway por piso. Audit forensic por puerta.

### Streams adicionados
R6 (hardware one-time), R7 (maintenance recurrente).

### Riesgo crítico
Capital de trabajo para inventario. Modelo pre-orden con anticipo 50% como mitigación inicial.

### Ver detalle
[06-module-stay-access.md](06-module-stay-access.md)

---

## 10. v1.7 — Zenix People (Q2 2028)

### Misión
HR hotelero. Nómina + turnos + ausentismo + retención. Foundation ya existe (StaffShift + StaffShiftClock + StaffPreferences). v1.7 lo expande a producto vendible.

### Países en v1.7 inicial
México (IMSS, INFONAVIT, SAT) + Colombia (EPS, ARL, Cesantías, ICBF). Otros países en v1.7.x sucesivos.

### Streams adicionados
R8 (People subscription).

### Ver detalle
[07-module-people.md](07-module-people.md)

---

## 11. v1.8 — Zenix Books (Q3 2028)

### Misión
Contabilidad nativa hotelera USALI 12ed compliant. Multi-país (CFDI MX, DIAN CO, SUNAT PE, AFIP AR). **Máximo lock-in del cliente** — una vez en Books, no migran.

### Países en v1.8 inicial
México (CFDI 4.0 + SAT) + Colombia (DIAN). Otros países en v1.8.x sucesivos.

### Streams adicionados
R9 (Books subscription).

### Ver detalle
[08-module-books.md](08-module-books.md)

---

## 12. v1.9 — Marketplace B2B (Q4 2028)

### Misión
Hoteles con Procure pueden comprar a proveedores con precios pre-negociados. ZaharDev cobra comisión 5-15% al proveedor. Modelo Avendra.

### Trigger
≥30 propiedades con Procure activo + ≥2 ciudades con masa crítica para negociar.

### Streams adicionados
R11 (Marketplace commissions).

### Ver detalle
[05-module-procure.md](05-module-procure.md) sección "Marketplace v1.9"

---

## 13. v2.0 — ABI External + AI Predictivo (2029+)

### Misión
Data licensing a OTAs, aerolíneas, tourism boards, REITs. AI predictivo (route optimization housekeeping, demand forecasting). Eventual: cerraduras propias (no white-label).

### Sprints estimados

| Sprint | Alcance |
|--------|---------|
| **DATA-LICENSING-API** | Endpoints para clientes externos. Auth tier separado. Audit trail comercial. |
| **DEMAND-FORECASTING** | Modelo ML cross-property + ABI. Vendible como producto separado. |
| **CULTURAL-INSIGHTS** | Dashboard premium para hotel chains. |
| **AI-ROUTING** | Optimización housekeeping (Optii-like). |
| **MARKETING-MODULE-FULL** | CRM export + ABI integration (los 4 segmentos: extensiones, no-shows, frecuentes, alto valor). |
| **OWN-LOCKS** | Eventual: desarrollo de cerraduras propias (no white-label) si volumen ≥500/año. |

### Streams adicionados
R12 (ABI Data Licensing).

### Trigger comercial
≥50 propiedades activas con consent + ≥2 contratos ABI piloto.

---

## 14. Timeline visual

```
2026 Q2 ─ v1.0.0 ─── 🚀 SEC-α + Setup Recamaristas + POLISH + QA ── PILOTO
        ─ v1.0.1 ── PAY (Stripe/Conekta)
2026 Q3 ─ v1.0.2 ── CHX (Channex.io)
        ─ v1.0.3 ── IMG + NS-UI + DEBT-α
2026 Q4 ─ v1.1   ── RBAC-UI + CROSS-PROP + DATA-CONSENT + PARTNER-SEED
2027 Q1 ─ v1.2   ── PARTNER-PORTAL + INSIGHTS-T1 + ETL-INTERNAL
2027 Q2 ─ v1.3   ── Zenix POS launch
2027 Q3 ─ v1.4   ── Zenix Procure launch
2027 Q4 ─ v1.5   ── Zenix Stay + NFC (smartphone-first)
2028 Q1 ─ v1.6   ── Zenix Access (cerraduras white-label)
2028 Q2 ─ v1.7   ── Zenix People (HR — MX + CO inicial)
2028 Q3 ─ v1.8   ── Zenix Books (contabilidad — MX + CO inicial)
2028 Q4 ─ v1.9   ── Marketplace B2B launch
2029   ─ v2.0   ── ABI External + AI predictivo
```

Cada versión es ~3-4 meses. Agresivo pero realista con foco disciplinado.

---

## 15. Dependencias críticas entre versiones

```
v1.0 PMS ──┬─→ v1.1 MULTI-TENANT ──→ v1.2 PARTNERS ──→ v1.3 POS
           │                                              │
           │                                              ▼
           │                                          v1.4 PROCURE
           │                                              │
           │                                              ▼
           │                                          v1.5 STAY ──→ v1.6 ACCESS
           │                                              │
           │                                              ▼
           └─→ v1.7 PEOPLE ←──────────────────────── v1.8 BOOKS
                                                          │
                                                          ▼
                                                  v1.9 MARKETPLACE ──→ v2.0 ABI
```

**Lectura:**
- v1.3 (POS) y v1.4 (Procure) son secuenciales: Procure necesita datos de POS para BOM/recetas
- v1.5 (Stay) y v1.6 (Access) son secuenciales: Access necesita identidad de Stay
- v1.7 (People) es independiente — puede arrancar en paralelo a v1.5/1.6 si hay equipo
- v1.8 (Books) necesita PROC + POS + PMS folio para tener datos significativos
- v1.9 (Marketplace) necesita ≥30 hoteles con Procure
- v2.0 (ABI) necesita base instalada + consent legal maduro

---

## 16. Bitácora de revisiones

- **2026-05-13** — Documento creado. Roadmap consolidado v1.0 → v2.0 con 12 versiones. Agregados People (v1.7) y Books (v1.8) tras conversación de visión Zenix↔ZaharDev. POS movido antes que Procure (high customer demand wedge).
