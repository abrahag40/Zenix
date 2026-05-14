# 10 · Estrategia de Datos y ABI

> Política de consent, anonimización, k-anonymity, productos de inteligencia, modelo legal.
> Este doc es el bridge entre el código (Zenix) y la monetización de datos (ZaharDev).

---

## 1. Filosofía: Inmon (1992) — separación PMS vs BI

```
ZENIX (Sistema Operacional)             ZAHARDEV BI (Sistema Analítico)
─────────────────────────────           ───────────────────────────────
Real-time transactional                  Batch analytical
PII present (legal)                      PII anonymized (legal)
Per-property scope                       Cross-property aggregations
Mutable (corrects, updates)              Immutable historical snapshots
Latency <100ms                           Latency seconds-minutes acceptable
```

**Zenix opera el negocio del hotel. ZaharDev BI opera el negocio de los datos.** Son sistemas separados que se conectan por un pipeline ETL controlado.

Esta separación es **legal**, **operativa**, y **arquitectónica**:
- Legal: anonimización efectiva requiere transformación irreversible (GDPR Art. 4.5)
- Operativa: queries analíticas no pueden ralentizar checkout en producción
- Arquitectónica: data warehouse columnar (BigQuery, Snowflake) ≠ OLTP postgres

---

## 2. Política de consent doble

Toda data agregada para ZaharDev BI requiere **dos consents**:

### Consent 1 — Propiedad (hotel)

Cuando el hotel firma contrato con Zenix:
- Cláusula explícita: "Acepto que datos operacionales de mi propiedad pueden ser usados de forma agregada y anonimizada para benchmarks, insights de mercado, y productos de inteligencia comercial de ZaharDev."
- Marcado en schema: `PropertySettings.consentToAggregation: Boolean`
- Snapshot inmutable: `consentVersion: String` (e.g., "ZAHARDEV_2026_05")
- Trazable: `consentAcceptedAt`, `consentAcceptedById`

### Consent 2 — Huésped

Al check-in (sea via app Zenix Stay o front-desk):
- T&C presentado al huésped con sección clara sobre uso de datos
- Marcado por estadía: `GuestStay.guestConsentSnapshot: Json` (versión completa del T&C al momento)
- Trazable: `guestConsentAcceptedAt`
- Idioma del huésped (capturado en check-in)

### Reglas no-negociables

| Regla | Implementación |
|-------|----------------|
| **Si falta consent del hotel** → datos de esa propiedad **NO** entran al data warehouse | Filtro en ETL: `WHERE consentToAggregation = true` |
| **Si falta consent del huésped** → datos del huésped específico **NO** se incluyen, aunque otros huéspedes del mismo hotel sí | Filtro en ETL: `WHERE guestConsentAcceptedAt IS NOT NULL` |
| **Withdrawal del consent** → datos del huésped/hotel se purgan en 30 días | Endpoint `/v1/consent/withdraw` + cron de purga |
| **Versioning del T&C** | Cuando cambia, hotel re-acepta; huéspedes nuevos aceptan versión nueva; estadías pasadas mantienen su versión histórica |

---

## 3. Anonimización efectiva (no pseudonymisation)

GDPR Art. 4.5 distingue:
- **Pseudonymisation** = reemplazar PII con token reversible → sigue siendo dato personal
- **Anonymisation** = transformación irreversible → ya no es dato personal

ZaharDev BI requiere **anonimización**, no pseudonymisation.

### Técnicas aplicadas

| Técnica | Cuándo | Ejemplo |
|---------|--------|---------|
| **Drop PII campos** | Siempre antes de ingestar al warehouse | `name`, `email`, `phone`, `documentNumber` se descartan |
| **Generalización geo** | Nivel ciudad, no calle | "Cancún, MX" en vez de "Av. Tulum 123" |
| **Bucketing temporal** | Por semana o mes, no fecha exacta | "Semana 2026-W21" en vez de "2026-05-22" |
| **Bucketing demográfico** | Rangos, no valores exactos | "25-34 años" en vez de "27 años" |
| **k-anonymity** | Mínimo 5 propiedades en cualquier agregación pública | Si filtro retorna <5 hoteles → no retornar resultado |
| **Differential privacy (futuro)** | Sumas con ruido controlado | `count + Laplace(noise)` para queries sensibles |

### Pipeline ETL (v1.2+)

```
[Zenix OLTP postgres]
        │
        │ Cron diario (3 AM UTC) per-property con consent
        ▼
[Staging ETL Python/dbt]
        │  - Drop PII
        │  - Aggregate by city/week
        │  - Apply k-anonymity threshold
        ▼
[BigQuery / Snowflake]
        │
        ├─→ Insights reports (R10)
        ├─→ Benchmarks API (R10)
        ├─→ ABI custom contracts (R12)
        └─→ Marketplace pricing intelligence (R11)
```

---

## 4. Los 5 niveles de productos de datos

### Nivel 1 — Insights para el propio hotel (R10, v1.2+)

**Producto:** dashboard con KPIs del hotel + comparativa vs ciudad.
**Quién paga:** el mismo hotel (incluido en Premium tier).
**Tecnología:** queries sobre data warehouse filtradas por property.
**Ejemplo:** "Tu ADR es $85, promedio ciudad $92. Top quartile $115. Tu food cost % es 38%, promedio 32%."

### Nivel 2 — Benchmarks regionales (R10, v1.2+)

**Producto:** reporte mensual por ciudad/segmento.
**Quién paga:** hoteles + asociaciones hoteleras (AMHM, COTELCO, etc.).
**Precio:** $500-2K USD por reporte.
**Tecnología:** aggregations cross-property con k-anonymity ≥5.

### Nivel 3 — Cultural & Consumption Insights (R10/R12, v1.5+)

**Producto:** insights por mercado emisor (brasileños, alemanes, mexicanos).
**Quién paga:** OTAs, aerolíneas regionales, tourism boards.
**Precio:** $20K-80K USD por reporte / $50K-150K USD/año subscription.
**Tecnología:** requires Zenix Stay (Guest App) instalado para capturar nacionalidad.
**Ejemplo:** "Brasileños en Cancún en julio: gastan 35% más en F&B que mexicanos, 22% más cocktails entre 16:00-19:00, prefieren AC frío (impacto 12% en consumo eléctrico)."

### Nivel 4 — Demand Forecasting (R12, v2.0+)

**Producto:** API con predicción de demanda por mercado, mes, segmento.
**Quién paga:** OTAs (Booking, Expedia), aerolíneas, hoteles enterprise.
**Precio:** $100K-500K USD/año.
**Tecnología:** modelo ML entrenado con base instalada ≥50 propiedades.
**Ejemplo:** "Para julio 2029 en Tulum, demanda esperada +18% vs 2028, driver principal incremento de búsquedas desde Argentina (+45% YoY)."

### Nivel 5 — Marketplace Intelligence (R11, v1.9+)

**Producto:** precios de proveedores agregados → ZaharDev negocia volumen → cobra comisión.
**Quién paga:** proveedores (5-15% comisión).
**Tecnología:** consume datos de Zenix Procure de hoteles con consent.
**Modelo:** Avendra-like (broker entre N hoteles y M proveedores).

---

## 5. Clientes target para ABI (R12)

| Cliente | Producto | Precio típico | Volumen LATAM |
|---------|---------|--------------|---------------|
| **OTAs (Booking, Expedia, Despegar)** | API de demanda anticipada por mercado | $50K-$500K/año | 3-5 contratos posibles |
| **Tourism boards (SECTUR MX, ProColombia, Visit Cancún, Visit Cartagena)** | Reportes trimestrales | $20K-$80K/reporte | 10-20 organizaciones |
| **Inversores hoteleros / REITs** | Due diligence para compra de hotel | $5K-$25K/deal | 20-50 deals/año LATAM |
| **Aerolíneas regionales (Volaris, Viva, Avianca)** | Forecasting demanda por ruta | $100K+/año | 5-10 contratos |
| **Asociaciones hoteleras (AMHM, COTELCO, AHRA)** | Reportes anuales agregados | $10K-$50K | 5-10 organizaciones |
| **Consultoras competidoras (KPMG, JLL Hotels)** | Data licensing white-label | $200K+/año | 2-3 contratos potenciales |
| **Cadenas hoteleras grandes (Posadas, City Express)** | Insights para expansión | $50K-$200K/año | 5-15 contratos |

**TAM ZaharDev BI a 3-5 años:** $5M-$15M USD/año si llega a 50+ propiedades con consent activo.

---

## 6. Marco legal por país

### México

- **LFPDPPP** (Ley Federal de Protección de Datos Personales en Posesión de los Particulares)
- ARCO rights (Acceso, Rectificación, Cancelación, Oposición)
- Aviso de Privacidad obligatorio
- Transferencias de datos: notificación previa

### Colombia

- **Ley 1581 de 2012** (Habeas Data)
- Registro Nacional de Bases de Datos (RNBD)
- Autorización expresa para tratamiento
- Transferencias internacionales: garantías equivalentes

### Brasil

- **LGPD** (Lei Geral de Proteção de Dados)
- Equivalente a GDPR
- ANPD como autoridad supervisora

### UE (relevante si hoteles europeos)

- **GDPR** (Reglamento (UE) 2016/679)
- Anonimización efectiva = no aplica GDPR
- Pseudonymisation = sigue aplicando
- DPO recomendado si >250 empleados o procesamiento large-scale

### Cumplimiento ZaharDev

- T&C reviewed legal annually
- Aviso de privacidad publicado en zenix.com
- DPO (Data Protection Officer) contratado antes de v1.4
- Auditoría externa anual del pipeline anonimización (v1.4+)
- Programa de respuesta a ARCO requests (≤30 días por ley)

---

## 7. Modelo de retention de datos

| Tipo de dato | Retention en Zenix OLTP | Retention en Warehouse |
|-------------|------------------------|------------------------|
| **PII operacional** (nombre, email, doc) | 7 años (fiscal MX/CO) | NUNCA (drop en ETL) |
| **Operational anonimizado** (ocupación, COGS, etc.) | Indefinido | 10 años |
| **Behavioral huésped** (movement, app usage) | 2 años | 5 años (anonimizado) |
| **Financial records** (CFDI, journal entries) | Indefinido legal (10+ años) | N/A (no entran al warehouse) |
| **Marketing opt-out** | Inmediato | Inmediato (purga en 30 días) |

---

## 8. Riesgos legales y mitigaciones

### Riesgo 1 — Cambio regulatorio LATAM
Habeas Data evoluciona. LFPDPPP México probable refuerzo 2027-2028.
**Mitigación:** abogado especializado + suscripción a Westlaw/Vlex actualizado.

### Riesgo 2 — Hotel cliente disputa "ustedes están vendiendo mis datos"
**Mitigación:** consent explícito + bitácora + cláusula contractual + auditoría externa anual.

### Riesgo 3 — Huésped solicita borrado (right to be forgotten)
**Mitigación:** endpoint de purge automático + audit trail de cumplimiento dentro de 30 días.

### Riesgo 4 — Reidentificación malintencionada
Datos "anonimizados" pueden re-identificarse cruzando con otras fuentes.
**Mitigación:** k-anonymity ≥5 + monitoring de queries sospechosas + differential privacy para queries sensibles.

### Riesgo 5 — Hackeo del warehouse
**Mitigación:** segregación física (warehouse en account distinto de OLTP), encryption at rest + in transit, audit trails, MFA obligatorio para acceso, penetration testing anual.

---

## 9. Hitos del data flywheel

| Hito | Cuándo | Lo que desbloquea |
|------|--------|-------------------|
| **5 propiedades con consent** | v1.2 inicial | Benchmarks tier-1 publicables |
| **10 propiedades con consent** | v1.3-v1.4 | Primer reporte vendible externo |
| **20 propiedades con consent** | v1.5-v1.6 | Cultural insights (con Stay) |
| **30 propiedades con consent + Procure activo** | v1.7-v1.8 | Marketplace viable |
| **50 propiedades con consent** | v1.9-v2.0 | ABI external contracts |
| **100+ propiedades** | v2.0+ | Demand forecasting ML + multi-país insights |

---

## 10. Bitácora de revisiones

- **2026-05-13** — Documento creado. Política consent doble + k-anonymity + 5 niveles de productos de datos + clientes target ABI. Plan legal por país establecido.
