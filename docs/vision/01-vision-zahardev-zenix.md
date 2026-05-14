# 01 · Visión ZaharDev ↔ Zenix

> El documento maestro del modelo de negocio. Si alguien solo lee un doc del proyecto, debe ser este.

---

## 1. La relación Zenix ↔ ZaharDev

**Zenix** es un producto SaaS multi-tenant para la industria hotelera. **ZaharDev** es una empresa de consultoría especializada en hotelería que usa Zenix como pilar tecnológico de su negocio.

No son la misma cosa. Son dos negocios que se alimentan mutuamente — un **data flywheel** clásico al estilo Toast, Stripe, Square, CoStar/STR.

```
              ZAHARDEV (consultoría + data business)
              ─────────────────────────────────────
                          ▲
                          │ datos anonimizados + insights
                          │
                          │
              ZENIX (plataforma SaaS multi-tenant)
              ─────────────────────────────────────
                          ▲
                          │ uso operativo diario
                          │
                          │
              HOTELES (clientes del producto)
```

- **Zenix** se vende como SaaS al hotel → revenue recurrente directo (subscription)
- **ZaharDev** monetiza los **datos agregados + insights derivados** → revenue indirecto pero de mayor margen
- El hotel paga por Zenix → genera datos → ZaharDev refina servicios → ZaharDev hace mejor consultoría → Zenix evoluciona con esos aprendizajes → más hoteles adoptan Zenix

Este flywheel es el motor estructural de todo el roadmap. Cada módulo nuevo de Zenix alimenta datos a ZaharDev y cada producto de ZaharDev se sostiene en la base instalada de Zenix.

---

## 2. Las 5 capas del negocio

```
   ┌─────────────────────────────────────────────────────┐
   │ L5 · DISTRIBUTION                                    │
   │     Partner network (sub-consultoras estilo SAP)    │
   └─────────────────────────────────────────────────────┘
                          ▲
   ┌─────────────────────────────────────────────────────┐
   │ L4 · DATA                                            │
   │     BI · Benchmarks · ABI · Marketplace             │
   └─────────────────────────────────────────────────────┘
                          ▲
   ┌─────────────────────────────────────────────────────┐
   │ L3 · HARDWARE                                        │
   │     Zenix Access (cerraduras) · NFC wristbands      │
   └─────────────────────────────────────────────────────┘
                          ▲
   ┌─────────────────────────────────────────────────────┐
   │ L2 · SERVICES                                        │
   │     Consultoría · Training · Certificación          │
   └─────────────────────────────────────────────────────┘
                          ▲
   ┌─────────────────────────────────────────────────────┐
   │ L1 · SOFTWARE                                        │
   │     PMS · POS · Procure · People · Books · Stay     │
   └─────────────────────────────────────────────────────┘
```

**Lectura crítica:**
- Cada capa se apoya en las de abajo
- L1 (software) genera datos
- L2 (services) monetiza expertise humano
- L3 (hardware) diferencia físicamente el ecosistema
- L4 (data) convierte datos en producto
- L5 (distribution) escala geográficamente sin abrir oficinas

**Por qué este modelo es defensible:** ningún competidor en hotelería LATAM opera las 5 capas. Mews y Cloudbeds operan L1+L2 parcialmente. Opera Cloud opera L1+L2. SAP Hospitality opera L1+L5. Nadie opera L3+L4 con el detalle que tenemos planeado.

---

## 3. Los 14 streams de revenue

| # | Stream | Tipo | Quién paga | Margen | Activación |
|---|--------|------|-----------|--------|-----------|
| **R1** | Zenix PMS subscription | SaaS recurrente | Hotel | 70-80% | v1.0 |
| **R2** | Zenix POS subscription | SaaS recurrente | Hotel | 65-75% | v1.3 |
| **R3** | Zenix Procure subscription | SaaS recurrente | Hotel | 60-70% | v1.4 |
| **R4** | Zenix Stay (Guest App) | Free/freemium | Hotel paga setup | N/A directo | v1.5 |
| **R5** | NFC wristbands/cards | Consumible | Hotel | 40-60% | v1.5 |
| **R6** | Zenix Access (hardware) | One-time + setup | Hotel | 30-50% | v1.6 |
| **R7** | Zenix Access (mantenimiento) | Recurrente anual | Hotel | 65-80% | v1.6 |
| **R8** | Zenix People subscription | SaaS recurrente | Hotel | 65-75% | v1.7 |
| **R9** | Zenix Books subscription | SaaS recurrente | Hotel | 70-80% | v1.8 |
| **R10** | Zenix Insights / Benchmarks | Recurrente | Hotel + OTAs + tourism boards | 85-95% | v1.2 |
| **R11** | Marketplace B2B commissions | Por transacción | Proveedores | 5-15% por tx | v1.9 |
| **R12** | ABI / Data Licensing | Contratos anuales | OTAs, aerolíneas, REITs, gobiernos | 90%+ | v2.0 |
| **R13** | Partner License (SAP-style) | License fee + rev share | Sub-consultoras | 20-40% pass-through | v1.2 |
| **R14** | Consulting + Training + Cert | Project-based o per-seat | Hoteles + partners | 50-80% | Existing |

**Concentración de revenue prevista a 3 años (50+ propiedades activas):**
- **25%** SaaS subscriptions PMS+POS+Procure (R1-R3)
- **15%** SaaS subscriptions People+Books (R8-R9) — máximo lock-in
- **15%** Hardware + NFC (R5-R7)
- **20%** Data products (R10-R12)
- **15%** Partner licensing (R13)
- **10%** Consulting directo (R14)

**Lectura:** ningún stream supera el 25%. Esto es **diversificación defensiva** — si un cliente cancela el PMS pero sigue usando Access (cerraduras), no se pierde la cuenta. Es el modelo que protege a Toast (POS + Capital + Payments + Marketing) y Stripe (Payments + Billing + Connect + Capital + Issuing + Treasury).

---

## 4. Cómo se relaciona con el roadmap

Cada versión activa nuevos streams. Ver [03-roadmap-v1-v2.md](03-roadmap-v1-v2.md) para detalle.

| Versión | Streams activos | Hito |
|---------|----------------|------|
| v1.0 | R1, R14 | Piloto comercial (Hotel Monica Tulum) |
| v1.0.x | + R1 estable | Revenue enablement (PAY + CHX) |
| v1.1 | + R10 semilla | Multi-tenant maduro + DATA-CONSENT |
| v1.2 | + R10, R13, R14 reforzado | Partner network activo + Insights tier-1 |
| v1.3 | + R2 | Zenix POS launch |
| v1.4 | + R3 | Zenix Procure launch |
| v1.5 | + R4, R5 | Zenix Stay + NFC smartphone-first |
| v1.6 | + R6, R7 | Zenix Access (cerraduras white-label) |
| v1.7 | + R8 | Zenix People (HR) |
| v1.8 | + R9 | Zenix Books (contabilidad multi-país) |
| v1.9 | + R11 | Marketplace B2B activo |
| v2.0 | + R12 | ABI External + AI predictivo + cerraduras propias |

---

## 5. Productos ZaharDev derivados de Zenix data

| Módulo Zenix | Datos generados | Producto ZaharDev derivado |
|-------------|-----------------|----------------------------|
| **PMS** | Ocupación, ADR, RevPAR, no-shows, extensiones | Benchmarks por ciudad (Insights tier-1) |
| **HK** | Tiempo limpieza, productividad, carryover | Operational efficiency reports |
| **POS** | Consumo F&B por nacionalidad, ticket promedio | Cultural F&B insights (ABI tier-2) |
| **Procure** | Precios proveedores, márgenes, lead times | Price index + Marketplace (R11) |
| **People** | Rotación, salarios, ausentismo | Workforce benchmarks por mercado |
| **Books** | Margen real por departamento, gastos por categoría | Financial benchmarks USALI-grade |
| **Stay** | Movimiento físico interno, time-of-day patterns | Hotel design insights |
| **Access** | Patrones de entrada/salida, ocupación real vs facturada | Audit & forensic services |

**El insight crítico:** ningún PMS competidor del mercado actual tiene TODA esta data en un solo sistema con consent legal estructurado. Cloudbeds tiene PMS+POS pero no Procure ni Access. Mews tiene PMS+POS+Stay pero no Procure ni hardware. Opera tiene casi todo pero está fragmentado (cada módulo es silo). **Zenix integrado desde día 1 es el moat.**

---

## 6. Filosofía de monetización por capa

### L1 — Software (SaaS)
**Modelo:** bundles tiered (Starter / Growth / Premium / Enterprise). Ver [02-product-family.md](02-product-family.md).
**Razón:** maximiza ARPU + reduce decisión del cliente (1 línea de bundle vs 7 SKUs separadas).

### L2 — Services (Consulting)
**Modelo:** consultoría premium directa de ZaharDev (Platinum partners) + consultoría tier-2 de partners certificados.
**Razón:** ZaharDev no escala con horas humanas — los partners absorben volumen, ZaharDev se queda con strategic-only.

### L3 — Hardware
**Modelo:** one-time + maintenance recurrente. Margen menor pero lock-in altísimo (cerradura física no se cambia fácil).
**Razón:** hardware es ancla — el hotel que tiene Cerraduras Zenix no migra a otro PMS sin perder hardware.

### L4 — Data
**Modelo:** suscripciones B2B y licencias enterprise para data licensing externo.
**Razón:** margen 85%+ porque el costo marginal es cero. Pero solo escala con base instalada ≥30 propiedades.

### L5 — Distribution (Partner Network)
**Modelo:** license fee anual + revenue share per active property.
**Razón:** convierte ZaharDev en plataforma. ZaharDev no necesita oficina en cada país — los partners ya están ahí.

---

## 7. Riesgos estructurales del modelo

### Riesgo 1 — Capital de trabajo para hardware
L3 requiere inventario. Pre-orden con anticipo 50% es la mitigación inicial. Línea de crédito comercial cuando el volumen ≥100 cerraduras/mes.

### Riesgo 2 — Regulatorio de datos
L4 atrae reguladores. **Abogado de privacidad especializado contratado antes de v1.4.** T&C versionados y firmados por cada hotel + cada huésped (al check-in).

### Riesgo 3 — Captura de partners
L5 puede generar partners que quieran hacer fork del producto. Cláusulas anti-fork + acceso de partners solo a "su vista" de datos (no BD completa).

### Riesgo 4 — Calidad del primer piloto
Si Hotel Monica Tulum falla en v1.0, la red de partners colapsa antes de existir. **Aceptar máximo 2-3 propiedades piloto** y obsesionarse con su éxito antes de abrir v1.1.

### Riesgo 5 — Scope creep durante v1.0-v1.1
Visión amplia tienta a empezar features avanzados. **Disciplina: v1.0 es PMS estable, v1.1 es multi-tenant + partner foundations. Nada de POS/NFC/Books hasta v1.3+.**

### Riesgo 6 — Competencia consolidada en POS
Mews POS, Cloudbeds POS, Square, Toast están más maduros. Diferencial Zenix POS: integración nativa folio↔POS + multi-property + cultural insights por nacionalidad.

---

## 8. Métricas de éxito por etapa

| Etapa | Métrica clave | Target |
|-------|---------------|--------|
| v1.0 piloto | NPS hotelero, retención 6m | NPS ≥40, retención 100% |
| v1.0-v1.2 | Propiedades activas | ≥10 |
| v1.2-v1.4 | ARPU mensual | ≥$200/propiedad |
| v1.4-v1.6 | Partners certificados | ≥3 Silver, ≥1 Gold |
| v1.6-v1.8 | Revenue mix diversificado | Ningún stream >35% |
| v1.8-v2.0 | Propiedades activas | ≥50 (umbral ABI viable) |
| v2.0+ | ABI contracts | ≥2 externos cerrados |

---

## 9. Bitácora de revisiones

- **2026-05-13** — Documento creado. Visión consolidada tras conversación de visión Zenix↔ZaharDev. Agregados módulos People (v1.7) y Books (v1.8) además de POS, Procure, Stay, Access. Streams de revenue ampliados de 12 a 14.
