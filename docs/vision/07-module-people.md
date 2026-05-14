# 07 · Zenix People — Recursos Humanos Hoteleros

> Versión activación: **v1.7 (Q2 2028)**
> Streams: **R8 (People subscription)**
> Países iniciales: México + Colombia. Otros en v1.7.x sucesivos.

---

## 1. Por qué este módulo es necesario

**Realidad operativa LATAM:**
- Rotación de housekeeping: **40-60% anual** (vs 20% promedio retail)
- Costo de reclutar + entrenar 1 housekeeper: **$300-800 USD**
- Hotel boutique de 30 habitaciones rota 8-15 personas/año = **$3K-12K USD/año en costos ocultos**
- Hoy se gestiona con WhatsApp, Excel, y nómina manual o servicio externo (Buk, Runa, Worky)

**Diferencial Zenix People:** integrado al PMS. La nómina se calcula automáticamente con datos reales de `StaffShiftClock` (foundation ya existe desde Sprint 8H). No es "otra app más" — es la capa fiscal/HR del sistema que el hotel ya usa todos los días.

**Posicionamiento:** competimos contra Buk (Chile), Runa (México), Worky (México), Aliados (Colombia). Todos son HR-first, no hospitality-native. Zenix People sabe que un mesero gana propinas + sueldo, que un housekeeper trabaja por habitación-equivalente, que un recepcionista tiene night-shift differential. **Eso lo hace defensible.**

---

## 2. Funcionalidad

### Foundation que ya existe (v1.0)

- `Staff` model con `role`, `department`, `propertyId`
- `StaffShift` (turnos semanales recurrentes LUN-DOM × HH:mm-HH:mm)
- `StaffShiftException` (vacaciones, ausencias, turnos extra)
- `StaffShiftClock` (clock-in/out con audit USALI)
- `StaffPreferences` + `StaffPreferenceLog` (preferencias gestionadas por supervisor)
- `StaffCoverage` (qué habitaciones cubre cada housekeeper)

### Nuevas features en v1.7

| Sub-feature | Qué hace | Equivalente |
|-------------|----------|-------------|
| **Nómina automática** | Cálculo de salario + horas extra + propinas + deducciones por país | Buk, Runa |
| **Recibos de pago digitales** | PDF firmado + email automático | Runa |
| **Ausentismo dashboard** | Tracking de faltas, late arrivals, justificaciones | Quore |
| **Onboarding workflow** | Documentos + training + asignación inicial | BambooHR |
| **Performance reviews** | Evaluación trimestral con escalas configurables | Lattice (lite) |
| **Retention dashboard** | Tracking rotación + predictive (employees at risk) | Visier |
| **Time-off requests** | Solicitud vacaciones con aprobación inline | Vacation Tracker |
| **Tax retentions** | IMSS, INFONAVIT, ISR (MX). EPS, ARL, Cesantías (CO) | TruePay |
| **Multi-currency payroll** | Para hoteles que pagan en USD a expatriados | Deel (lite) |
| **Training tracker** | Cursos completados + certificación de partner network | LMS lite |

### Datos para ZaharDev

| Data point | Producto derivado |
|------------|-------------------|
| Rotación por rol/región | Workforce benchmarks por mercado |
| Salarios pagados vs mercado | Compensation insights vendibles |
| Ausentismo patterns | Productivity consulting |
| Training completion rates | Quality reports cross-property |
| Tipos de contratos (full-time, part-time, temporal) | Labor market trends |

**Ejemplo de insight comercial:** "Tu hotel paga 8% sobre el promedio de mercado para housekeepers en Cancún, pero tu rotación es 22% — el problema no es salario, es schedule predictability. Te recomiendo cambiar a turnos rotativos semanales con 2 días libres consecutivos."

---

## 3. Complejidad por país

### México (v1.7 inicial)

**Obligaciones fiscales/laborales:**
- ISR (Impuesto Sobre la Renta) — retención mensual
- IMSS (Instituto Mexicano del Seguro Social) — 11.5-13% del salario base
- INFONAVIT — 5% del salario base
- AFORE (retiro) — 4.5% del salario base
- Aguinaldo (15 días mínimo, diciembre)
- Vacaciones (12 días base, +2 por año, hasta 20)
- Prima vacacional (25% sobre días de vacaciones)
- PTU (Participación de Trabajadores en Utilidades) — 10% utilidad
- Reparto de propinas (regulado en restaurantes)

**Reportes requeridos:**
- DIM (Declaración Informativa Mensual) ante SAT
- SUA (Sistema Único de Autodeterminación) ante IMSS
- Recibos CFDI 4.0 con nómina

### Colombia (v1.7 inicial)

**Obligaciones:**
- Retención en la fuente
- EPS (Salud) — 8.5% empleador + 4% empleado
- Pensión — 12% empleador + 4% empleado
- ARL (Riesgos Laborales) — 0.5-6.96% según clase de riesgo
- Cesantías — 1 mes/año + intereses 12%
- Prima de servicios — 1 mes/año
- Vacaciones — 15 días/año
- Auxilio de transporte (si gana <2 SMMLV)
- ICBF — 3% empleador
- SENA — 2% empleador
- Cajas de Compensación — 4% empleador

**Reportes:**
- PILA (Planilla Integrada de Liquidación de Aportes)
- Certificaciones DIAN
- Liquidaciones anuales

### Países en sprints sucesivos (v1.7.x)

| País | Versión target | Complejidad principal |
|------|---------------|----------------------|
| Perú | v1.7.1 | SUNAT + ESSALUD + SCTR + AFP + Gratificaciones |
| Argentina | v1.7.2 | AFIP + ANSES + ART + SAC + complejidad inflacionaria |
| Chile | v1.7.3 | Previred + AFP + Isapre + Gratificación |
| Brasil | v1.7.4 | INSS + FGTS + 13º salário + Vale + complejidad sindical |
| Costa Rica | v1.7.5 | CCSS + INS + Aguinaldo |
| República Dominicana | v1.7.5 | TSS + SDSS + Regalía pascual |

---

## 4. Arquitectura técnica

### Schema delta (sobre foundation existente)

```prisma
model Payroll {
  id                  String   @id @default(uuid())
  staffId             String
  propertyId          String
  periodStart         DateTime
  periodEnd           DateTime
  status              PayrollStatus  // DRAFT, APPROVED, PAID
  grossSalary         Decimal  @db.Decimal(12,2)
  overtime            Decimal? @db.Decimal(12,2)
  tips                Decimal? @db.Decimal(12,2)
  deductions          Json     // estructura por país
  netPay              Decimal  @db.Decimal(12,2)
  currency            String
  receiptPdfUrl       String?
  cfdiUuid            String?  // MX
  pilaReference       String?  // CO
  approvedById        String?
  approvedAt          DateTime?
  paidAt              DateTime?
  // ...
}

model StaffEmployment {
  id            String   @id @default(uuid())
  staffId       String
  startDate     DateTime
  endDate       DateTime?
  contractType  ContractType // FULL_TIME, PART_TIME, TEMPORAL, INTERN, FREELANCE
  baseSalary    Decimal  @db.Decimal(12,2)
  currency      String
  paymentFreq   PaymentFrequency // WEEKLY, BIWEEKLY, MONTHLY
  taxId         String?  // RFC, NIT, RUC
  bankAccount   Json?    // encrypted
  // ...
}

model TimeOffRequest {
  id           String   @id @default(uuid())
  staffId      String
  type         TimeOffType  // VACATION, SICK, PERSONAL, MATERNITY, PATERNITY, OTHER
  startDate    DateTime
  endDate      DateTime
  status       TimeOffStatus // PENDING, APPROVED, REJECTED
  approvedById String?
  reason       String?
  // ...
}

model PerformanceReview {
  id           String   @id @default(uuid())
  staffId      String
  reviewerId   String
  period       String   // "2027-Q3"
  rating       Int      // 1-5
  notes        String?
  goalsForNext Json?
  signedAt     DateTime?
  // ...
}

model Onboarding {
  id              String   @id @default(uuid())
  staffId         String
  documentsStatus Json     // {idDoc: 'verified', taxId: 'pending', ...}
  trainingStatus  Json     // {orientation: 'completed', safety: 'pending', ...}
  completedAt     DateTime?
  // ...
}

enum PayrollStatus { DRAFT, APPROVED, PAID }
enum ContractType { FULL_TIME, PART_TIME, TEMPORAL, INTERN, FREELANCE }
enum PaymentFrequency { WEEKLY, BIWEEKLY, MONTHLY }
enum TimeOffType { VACATION, SICK, PERSONAL, MATERNITY, PATERNITY, OTHER }
enum TimeOffStatus { PENDING, APPROVED, REJECTED }
```

### Servicio modular por país

```
apps/api/src/people/
├── people.module.ts
├── people.service.ts             // core CRUD
├── payroll.service.ts            // orchestrator
├── time-off.service.ts
├── performance.service.ts
├── onboarding.service.ts
└── country/
    ├── country-payroll.interface.ts  // contrato
    ├── mx/
    │   ├── mx-payroll.calculator.ts
    │   ├── mx-cfdi.exporter.ts
    │   ├── mx-sua.exporter.ts
    │   └── mx-imss.rates.ts
    ├── co/
    │   ├── co-payroll.calculator.ts
    │   ├── co-pila.exporter.ts
    │   └── co-rates.ts
    └── ...
```

Cada país implementa `ICountryPayrollCalculator` interface. Esto permite agregar países sin tocar el core.

---

## 5. Integraciones cruzadas

### Con Zenix PMS / Housekeeping
- `StaffShiftClock` feed real time de horas trabajadas → payroll
- Productividad (tasks completadas) → bono por performance opcional

### Con Zenix POS
- Propinas distribuidas → integración con tronc system
- Hours worked POS terminal → payroll
- Cocina vs sala → role differentiation

### Con Zenix Books (v1.8)
- Asiento contable de nómina: Salarios + Cargas sociales - Retenciones = Cash out
- USALI labor cost line items por departamento
- Tax accruals automáticos

### Con Zenix Insights
- Anonymous benchmarks cross-property: salario promedio housekeeper en Cancún vs Tulum
- Retention prediction (con datos suficientes)

---

## 6. Esfuerzo estimado

| Sprint | Alcance | Semanas |
|--------|---------|---------|
| **PEOPLE-CORE** | Payroll engine + StaffEmployment + TimeOffRequest | 4 |
| **PEOPLE-MX** | Calculadora MX + CFDI nómina + SUA + DIM | 4 |
| **PEOPLE-CO** | Calculadora CO + PILA + reportes DIAN | 4 |
| **PEOPLE-UX** | Dashboard ausentismo + retention + onboarding wizard | 3 |
| **PEOPLE-INTEGRATIONS** | Bridge con POS (tips), Books (asientos), Insights (benchmarks) | 2 |

**Total: ~17 semanas (~4 meses)** para v1.7 con MX + CO.

Países sucesivos: ~3-4 semanas c/u en v1.7.x.

---

## 7. Riesgos y mitigaciones

### Riesgo 1 — Complejidad legal por país cambia
**Mitigación:** suscripción a servicio especializado (Thompson Reuters Checkpoint, Doctrina) + revisión legal trimestral por país.

### Riesgo 2 — Errores fiscales generan multas al hotel
**Mitigación:** SLA contractual con responsabilidad limitada. Backup manual: cliente puede exportar a Excel para revisión propia antes de pagar.

### Riesgo 3 — Cliente ya tiene Buk/Runa contratado
**Mitigación:** import de Buk + period de transición 3 meses con doble entry. ROI claro: ahorro de licencia separada + integración con PMS.

### Riesgo 4 — Países adicionales toman más tiempo
**Mitigación:** roadmap public con prioridad por demanda. Si cliente argentino llega antes que el sprint, ofrecer consulting para configuración manual hasta v1.7.2.

---

## 8. Posicionamiento

| Vs Buk | Vs Runa | Vs Worky |
|--------|---------|---------|
| Mejor: integración PMS | Mejor: ZaharDev consultoría incluida | Mejor: hospitality-native |
| Peor: madurez HR | Peor: madurez HR | Peor: madurez HR |

**Pitch:** "Buk y Runa son nóminas. Zenix People es la nómina de tu hotel. Sabemos qué es un night shift differential, una propina de domingo, un housekeeper que se enferma a las 6am. Lo que tomaría Buk + ZaharDev consulting + Excel manual, Zenix People lo hace en un click."

---

## 9. Bitácora de revisiones

- **2026-05-13** — Documento creado. Foundation v1.0 reaprovechada. v1.7 inicial con MX + CO, otros países en sprints sucesivos.
