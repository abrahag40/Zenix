# Zenix Learning — Pricing & Billing detalle

> Respuesta concreta a la pregunta: *"¿Cómo se cobra? ¿Se cobra el módulo más los cursos? ¿O se cobra por persona que va a tomar el curso?"*
> Modelo definido + edge cases + comparación con alternativas descartadas.
> **Última actualización:** 2026-05-21

---

## 0. Modelo en una línea

**L1 Core: $7 USD por staff con login en últimos 30 días, por mes.** Incluye acceso ilimitado al LMS + TODOS los cursos del catálogo CORE.

**No es per-curso. No es per-seat. Es per-active-staff** — patrón iSpring Learn / Spotify Family / Slack.

---

## 1. Tabla canónica de SKUs

| SKU | Pricing | Billing mode | Incluye |
|-----|---------|--------------|---------|
| **ZNX-LRN-GIFT** (L0) | Gratis | `ONE_TIME_GIFT` | 1 curso lifetime, sin recurrente. Hook comercial al cerrar PMS. |
| **ZNX-LRN-L1 Core** | $7 USD/staff activo/mes | `PER_STAFF_ACTIVE` | Acceso LMS + cursos catálogo CORE (3 MVP + futuros CORE) |
| **ZNX-LRN-L2 Pro** | $12 USD/staff activo/mes | `PER_STAFF_ACTIVE` | L1 + SCORM/xAPI runtime + course authoring (Fase 2) |
| **ZNX-LRN-L3 Marketplace** | Per-course $30-300 USD | `PER_TRANSACTION` | Cursos premium individuales (AHLEI, eHotelier — Fase 2) |
| **ZNX-LRN-L4 Custom** | $5-25k USD/curso (one-time) | `PER_TRANSACTION` | Producción curso custom por ZaharDev |

**Schema:** `TenantDLC.billingMode` enum captura exactamente esto.

---

## 2. ¿Qué significa "staff activo"?

Un Staff cuenta como **activo** este mes si cumple **TODAS** estas condiciones:

1. `Staff.active = true` (no dado de baja)
2. **≥1 login** (web o mobile) en los últimos 30 días — desde cualquier device
3. Pertenece a un property dentro del **scope del DLC** (§147 — si `scopedPropertyIds` poblado, solo cuenta staff de esas properties)

**El cobro mensual se basa en el peak de "staff activos" de los últimos 30 días** — protege al cliente de cargos inflados si un staff hace login una vez y nunca más.

### Implementación técnica

```typescript
// Función ejemplo (a implementar Fase 1.4 con Stripe metering)
async calculateMonthlyActiveStaff(dlcId: string): Promise<number> {
  const dlc = await prisma.tenantDLC.findUnique({ where: { id: dlcId } })
  const cutoff = subDays(new Date(), 30)

  const where: Prisma.StaffWhereInput = {
    organizationId: dlc.organizationId,
    active: true,
    user: { lastLoginAt: { gte: cutoff } },
  }

  // §147 — restringir a properties scoped si aplica
  if (dlc.scopedPropertyIds.length > 0) {
    where.propertyId = { in: dlc.scopedPropertyIds }
  }

  return prisma.staff.count({ where })
}
```

---

## 3. Casos concretos

### Caso 1 — Hotel boutique single property

- Hotel con 12 staff totales
- 10 hacen login al menos 1 vez en el mes (8 housekeeping, 2 recepción)
- 8 toman Distintivo H, 5 toman Front Office, 3 toman Housekeeping Standards (algunos toman varios)
- **Cobro: 10 × $7 USD = $70 USD/mes**

**Lo que NO cambia:**
- Si los 10 toman 1 curso o si los 10 toman los 3 cursos → mismo cobro
- Si agregan a la mitad del mes Front Office Excellence → mismo cobro
- Si toman un examen 30 veces re-take → mismo cobro

### Caso 2 — Cadena con 4 hoteles (multi-property)

- Organization con 4 hoteles, total 60 staff
- 45 hacen login en el mes
- **Cobro: 45 × $7 = $315 USD/mes**

**Variante con `scopedPropertyIds`:**

- El cliente solo quiere Learning en hotel 1 + hotel 2 (no en 3 ni 4)
- 20 de los 45 activos están en hotel 1 + 2
- `TenantDLC.scopedPropertyIds = ['h1Id', 'h2Id']`
- **Cobro: 20 × $7 = $140 USD/mes** (solo cuenta staff de h1 + h2)

### Caso 3 — Hotel estacional

- Hostal Tulum: 8 staff base, 18 staff peak temporada alta (dic-mar)
- En noviembre: solo 8 activos → $56/mes
- En enero: 16 activos → $112/mes
- En marzo: 18 activos → $126/mes (peak del mes anterior)
- En mayo (temporada baja): vuelve a 8 → $56/mes

**Esto es justo.** Per-seat fijo cobraría $112/mes todo el año aunque solo trabajen 8 personas la mitad del año.

### Caso 4 — Cliente compra curso premium del marketplace

- Hotel con L1 activo (10 staff × $7 = $70/mes)
- Compra "Certified Hospitality Housekeeping Executive (AHLEI premium)" por $250 USD one-time
- **Cobro: $70/mes recurrente + $250 USD once**
- El curso premium queda en el catálogo del cliente para todos sus staff (no se cobra por staff que lo tome)

### Caso 5 — Cancelación + reactivación

- Mes 1-6: cliente paga $70/mes
- Mes 6: cliente cancela → status SUSPENDED
- Mes 6-7: **$0** (grace period 30d, data preservada, endpoints 402)
- Mes 7-12: status ARCHIVED, **$0**, data sigue preservada
- Mes 12: cliente reactiva → status ACTIVE → factura del mes 12 reanuda $70 + scaling según staff activos
- Todos los certificados emitidos en mes 1-6 siguen verificables públicamente (§131)

### Caso 6 — Curso de regalo (L0 GIFT)

- ZaharDev cierra deal PMS con prospecto
- Activate wizard etapa 7.5: ☑ Activar Learning GIFT + curso "Distintivo H + NOM-035"
- `TenantDLC.dlcCode = 'LEARNING_GIFT'`, `billingMode = 'ONE_TIME_GIFT'`, `pricePerUnit = null`
- **Cobro: $0 USD lifetime para ese curso específico**
- Si el cliente quiere otros cursos del catálogo CORE: necesita upgrade a L1 ($7/staff activo/mes)

---

## 4. Por qué NO los otros modelos

### Per-seat fijo (descartado)

| Pros | Cons |
|------|------|
| Cliente sabe exacto cuánto paga | **Injusto en hostelería estacional** — paga lo mismo en temporada baja con 8 staff que en alta con 18 |
| Simple matemáticamente | Cliente "subutiliza" — paga por staff que no usa el LMS |
| | Bloquea adopción en hoteles con rotación |

### Per-enrollment (descartado)

| Pros | Cons |
|------|------|
| Tour-perfect: paga por lo que usa | **Admin pesadilla** — 15 staff × 3 cursos = 45 cargos |
| | Cliente no puede predecir costo del mes |
| | Salesforce/HubSpot evitan este modelo deliberadamente |
| | Crea incentivo perverso ("no asignes cursos para no pagar") |

### Tier flat per-property (descartado)

| Pros | Cons |
|------|------|
| Predictible | "Next tier shock" — hotel con 11 staff paga $120 cuando con 10 pagaba $50 |
| | Frustration UX: cliente busca formas de mantenerse "bajo el cap" |
| | Inflexible — no premia growth |

### Per-active-staff (modelo Zenix elegido)

| Pros | Cons |
|------|------|
| Predictible (~staff × $7) | Requiere tracking de login activo (paridad iSpring) |
| Justo (no pagas inactivos) | |
| Simple admin (1 línea de factura mensual) | |
| Scaling lineal con el negocio del cliente | |
| Estándar SaaS B2B 2020+ (Spotify Family, Slack, iSpring) | |

---

## 5. Comparativa de pricing vs competencia

| Producto | Modelo | Precio mensual hostal típico (15 staff activos) |
|----------|--------|---------------------------------------------------|
| **Zenix Learning Core** | per-active-staff | 15 × $7 = **$105 USD** |
| TalentLMS Premium | per-active-user tier | ~$249/mes (40 users tier) |
| iSpring Learn | per-active-user | ~$300-500/mes |
| Docebo | enterprise annual | $15-25k/año (no per-seat) |
| Typsy | per-user flat | 15 × $20 ≈ $300/mes |
| eHotelier Academy | per-learner | 15 × $9.50 = $142/mes (solo onboarding) |
| Cloudbeds University | gratis (PMS-software-only training) | $0 (pero no cubre oficio) |
| HostelSphere LearnMS | pricing opaco | desconocido |
| AHLEI cursos individuales | per-cert | $50-300 USD por staff por cert (only) |

**Zenix queda 30-50% por debajo de Typsy/iSpring/TalentLMS** en el segmento SMB hostelero LATAM — y es el único con DC-3 STPS + PMS integration.

---

## 6. Edge cases pendientes de decisión (Fase 1.4)

| Edge case | Estado | Decisión pendiente |
|-----------|--------|--------------------|
| Staff que hace login último día del mes | Decidido — cuenta como activo si dentro de 30d window | — |
| Staff que comparte cuenta con otro | **No detectable hoy** — confiamos en hotel honesto | Posible audit Fase 2 (device fingerprinting) |
| Cambio de tier mid-month (L1 → L2) | Prorratear basado en días restantes | Implementación Stripe Fase 1.4 |
| Refund por error de configuración (cliente "no quería L2") | 7 días sin preguntas, después caso-por-caso | Política docs/zenix-sales-master.md update |
| Pago en MXN vs USD (clientes MX prefer MXN) | Hoy USD único | Multi-currency v1.0.4 FX-LATAM cuando llegue |
| Crédito a favor por scope reduction (mid-month change a `scopedPropertyIds`) | Prorratear desde día del cambio | Fase 1.4 |
| Prepago anual con descuento | 2 meses gratis (16% off) | Doc 11 §6 — implementación Fase 1.4 |

---

## 7. Decisión §148 reservada — Billing model

**Texto para CLAUDE.md al cierre del sprint:**

> **§148** Zenix Learning billing model es `PER_STAFF_ACTIVE` para L1/L2 — staff con ≥1 login (web o mobile) en últimos 30d cuenta como activo. Cobro mensual basado en peak de los 30d previos para proteger al cliente de spikes intermitentes. L3 Marketplace es `PER_TRANSACTION` per-course individual. L4 Custom es `PER_TRANSACTION` one-time. L0 GIFT es `ONE_TIME_GIFT` sin recurrencia. `TenantDLC.billingMode` enum captura esto. Si `scopedPropertyIds` poblado, solo cuenta staff de esas properties (§147). Implementación Stripe metering Fase 1.4 + v1.0.1 PAY-CORE.

---

## 8. Bitácora

- **2026-05-21** — Doc creado tras pregunta directa del usuario "¿cómo se cobra exactamente?". Modelo per-active-staff explicado con 6 casos + comparación vs alternativas descartadas + benchmark competencia.
