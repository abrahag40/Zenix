# Decisiones no negociables — §1 a §94

> **Esto salió del `CLAUDE.md` el 2026-09-23, VERBATIM y sin perder una línea**, en la Fase 1 de la
> limpieza de documentación. Eran **1 125 de las 2 292** que tenía el archivo — el 49 %.
>
> La guía oficial de Claude Code fija el objetivo de un `CLAUDE.md` en **200 líneas**: «longer
> files consume more context and reduce adherence». Noventa y cuatro decisiones numeradas no caben
> ahí, y cargarlas en cada sesión hacía que compitieran entre ellas.
>
> **Siguen siendo no negociables.** Lo que cambia es cuándo se leen: se consultan al tocar el área
> que cubren, no en cada arranque. 🔶 **Pendiente de Fase 2:** repartirlas por área en
> `.claude/rules/` con `paths`, para que cada una cargue sola cuando Claude toque su carpeta.

---

## Non-Negotiable Decisions §1-§94

> Decisiones tomadas deliberadamente. NO revertir sin discusión documentada.

### Operación del PMS y housekeeping

1. **Dos fases de checkout** — `batchCheckout` crea PENDING (sin notificar); `confirmDeparture` activa (notifica). Jamás activar limpieza antes de confirmación física.

2. **`confirmDeparture` debe recibir `bedId`** — sin él, en dorms se activan todas las camas del checkout.

3. **`await qc.refetchQueries()`** (no `invalidateQueries`) antes de cualquier navegación que dependa de datos frescos.

4. **`getDailyGrid` filtra por `checkout.actualCheckoutAt`** — nunca por `createdAt` (timezone-safe).

5. **`planningIsDone` derivado del servidor** — nunca de `useState`. Source of truth: `allBeds.some(b => !!b.taskId && !b.cancelled)`.

6. **Tab state en URL params** — `useSearchParams`, nunca `useState`.

7. **`hasSameDayCheckIn` per-task** — nunca per-checkout. Cada cama tiene su propio flag, re-evaluado contra la fecha real de la tarea (no `now`).

8. **`getState()` precedencia:** tarea activa (no cancelada) en servidor → override local → inferir de servidor.

9. **Cancel per-bed:** con `bedId` no marca `checkout.cancelled = true`. Sin `bedId` sí.

10. **Módulo de Mantenimiento monolítico** — comparte BD, NestJS y auth con Housekeeping. No es microservicio. Separación a nivel de módulos NestJS.

### Cumplimiento fiscal y no-shows

11. **Registros de no-show son inmutables** — nunca hard-delete de `GuestStay` con `noShowAt != null`. Solo anonimización de PII para GDPR/LGPD.

12. **Night audit NUNCA hardcodea timezone** — siempre usar `PropertySettings.timezone` con `Intl.DateTimeFormat`.

13. **`noShowProcessedDate` como idempotencia del corte nocturno** — antes de procesar, verificar que `localDate !== noShowProcessedDate`.

14. **Aritmética monetaria con `Decimal`** — nunca `number` nativo. Importar `Decimal` de `@prisma/client/runtime/library`.

15. **`checkAvailability` excluye no-shows** — el filtro incluye `noShowAt: null`.

**15b.** **Guard anti-re-marcado:** `noShowRevertedAt: null` en el query del night audit. Un stay revertido NO se re-marca aunque caiga en el rango temporal.

16. **Ventana de reversión de no-show — 48 horas** desde `noShowAt`. Después es inmutable. Guard server-side con `differenceInHours(now, noShowAt) > 48`.

17. **Liberación de inventario en no-show** — `checkAvailability` excluye stays con `noShowAt != null`.

18. **`NoShowChargeStatus` enum** — ciclo `NOT_APPLICABLE → PENDING → CHARGED | FAILED | WAIVED`.

### Frontend / UI

19. **Reports multi-tab con lazy loading** — query `enabled` por tab activo.

20. **No-show inline confirm** — no Dialog separado, panel dentro de BookingDetailSheet.

21. **No usar `useState` para estado de servidor** — React Query es source of truth.

22. **Color tokens del calendario: solo `emerald`, nunca `brand-*`** — `tailwind.config.js` no define `brand`.

23. **Grid del calendario con `z-0` (stacking context)** — sin esto, RoomColumn puede quedar cubierto por bloques.

24. **`hide()` antes de `onNoShow`** — al clicar "Marcar no-show" en tooltip, cerrar tooltip primero.

25. **Arquitectura de dos niveles para detalle de reserva** — `BookingDetailSheet` (420px) cubre el 90%. `ReservationDetailPage` es nivel 2 (auditoría completa). Mutaciones críticas solo en contexto del calendario.

26. **`GET /v1/guest-stays/availability` ANTES de `GET /v1/guest-stays/:id`** — orden de declaración en controller crítico.

27. **`BookingDetailSheet` tiene su propio `×`** — `SheetContent` con `showCloseButton={false}`.

28. **Modelo de precios aditivo (no recalculativo)** — cada cambio genera línea nueva. Reduce errores de facturación (Baymard 2022: 68%).

29. **Precios en modales son informativos (snapshot)** — `ratePerNight` del segmento activo es fuente de verdad hasta Sprint 8.

30. **Ghost block para celdas vacías** — patrón Apple Calendar. Tooltip portal solo para reservas existentes (evita tooltip fatigue, NN/g).

### Psicología del color y feedback

31. **Psicología del color en el calendario** — `emerald` = disponibilidad/positivo, `amber` = advertencia no-bloqueante, `red` = rechazo/escasez. El recepcionista decide solo por color (Mehrabian-Russell 1974).

32. **SSE Soft-Lock TTL = 90s con cleanup en unmount** — advisory lock, no hard lock. Liberación inmediata al cerrar dialog.

33. **Housekeeping bridge: PMS → Housekeeping automático** — `extendNewRoom` o `executeMidStayRoomMove` crean `CleaningTask(PENDING)` + SSE `task:planned`.

34. **Connected Rooms: descartado permanentemente** — <2% adopción en mercado target.

35. **Toda validación de inventario pasa por `AvailabilityService`** — regla arquitectónica obligatoria. Ninguna query directa a `staySegment` o `guestStay` para responder "¿está libre?".

36. **Channel Manager = Channex.io** — `user-api-key` header. Base URL `https://app.channex.io/api/v1`. Nunca importar fetch/axios para Channex desde otro módulo.

37. **Política Channex ante fallo** — `pushInventory` es best-effort (no revierte tx local). `pullAvailability` es fail-soft normal, fail-closed crítico (Sprint 8 decide).

### Confirmaciones y feedback informativo

38. **Toda operación CRUD destructiva o de reasignación exige confirmación explícita** — drag&drop, extensión, mover segmento, split, checkout manual, no-show marcado/revertido, cancelación, resize. Nunca disparar mutación final desde drag — siempre `*ConfirmDialog` con preview. (Baymard n=3,400: 68% errores en confirmaciones ausentes.)

39. **Feedback informativo obligatorio** — toda operación rechazada, inválida o fallida debe comunicar: (1) qué ocurrió, (2) por qué, (3) qué puede hacer el usuario. (NN/g H1+H9, Norman 1988, Shneiderman 1987, ISO 9241-110, Baymard n=2,100: 47% errores por feedback silencioso.)

40. **Bloques de no-show permanecen visibles en el calendario** — rayas diagonales rojas + badge "NS". Cumplimiento fiscal + chargeback evidence + KPI revenue management.

41. **Ventana temporal de no-show basada en día hotelero real** — termina en night audit (`noShowCutoffHour`, default 2 AM), no medianoche. Antes de `potentialNoShowWarningHour` (default 20:00): solo "Iniciar check-in". Entre 20:00 y `noShowCutoffHour`: ambas acciones coexisten.

42. **Los intentos de contacto al huésped quedan registrados** — `GuestContactLog { stayId, channel, sentById, sentAt, messagePreview }` append-only. Evidencia primaria para chargeback (Visa Core Rules §5.9.2).

43. **KPIs del Dashboard son ADAPTATIVOS por hora del día** — nunca estáticos cuando pierden valor operativo. Bloque permanente (24/7): ocupación, mapa rooms, "tu día". Bloque adaptativo rota según ventana. (Sweller, Apple HIG, Pousman & Stasko 2006.)

### Sprint 8H (Housekeeping Scheduling)

44. **D1: cron 7am NO sustituye `batchCheckout`** — pre-popula con base en `expectedCheckOut`. El recepcionista sigue siendo fuente de verdad.

45. **D2: cron multi-timezone `Intl.DateTimeFormat`** — patrón idéntico a NightAuditScheduler. Idempotencia con `morningRosterDate`.

46. **D3: hora del cron configurable per-property** — `PropertySettings.morningRosterHour` (default 7).

47. **D4: auto-asignación determinística + auditable** — siempre escribe `TaskLog { event: 'AUTO_ASSIGNED', metadata: { rule } }`.

48. **D5: cobertura es soft, no hard** — `StaffCoverage` define preferencia. Titular ausente → backup → round-robin. Flujo de ausencia: `POST /v1/scheduling/absences`.

49. **D6: carryover preserva `assignedToId` solo si está en turno hoy** — default `REASSIGN_TO_TODAY_SHIFT`. Re-evalúa `hasSameDayCheckIn` contra HOY.

50. **D7: métricas individuales son privadas** — `GET /reports/housekeeper-self/:staffId` requiere `actor.sub === staffId` o SUPERVISOR. NUNCA leaderboard público (LFPDPPP, Crowding-out effect Deci & Ryan 1999).

51. **D8: mobile usa SSE solo en foreground** — background → push only. Preserva batería.

52. **D9: gamificación opcional gestionada por supervisor** — `StaffPreferences.gamificationLevel`. Privacidad peer-to-peer estricta.

53. **D10: toda tarea creada pasa por `AssignmentService.autoAssign()`** — análogo a §35 AvailabilityService. 6 puntos de invocación.

54. **D11: tarea IN_PROGRESS es inmutable desde recepción** — `ConflictException` con mensaje específico. No cancel silencioso.

55. **D12: extensiones no eliminan tareas, las re-etiquetan** — modal "¿requiere limpieza?". `extensionFlag: WITH_CLEANING | WITHOUT_CLEANING`.

### Sprint 9

56. **D14: `StayoverFrequency` configurable per-property** — defaults por PropertyType (HOSTAL → NEVER, HOTEL → DAILY).

57. **D15: Kanban consolida Ajustes del día** — `KanbanPage` absorbe acciones operativas de override. `/overrides` deprecated.

58. **D16: Disciplina de Niveles de Notificación** — 3 niveles escalonados (Ambient / Notification / Elevated / Alarm). Limpieza nunca activa nivel 3. (Cisco Healthcare Alert Fatigue Study 2021.)

59. **D17: Persistencia obligatoria de toasts en NotificationPanel** — todo toast nivel 2+ crea entrada en `AppNotification` simultáneamente. NN/g H1+H6.

60. **D18: Mobile Hub Recamarista — agrupación dual priority+room** — runtime detection (≥2 tasks del mismo roomId → render como acordeón). Counter dual `🚪 X/Y · 🛏️ Z/W`. Sticky priority header. Bulk-start desde room header.

### Sprint Mx-1 (Mantenimiento)

61. **D-Mx1: `MaintenanceTicket` reemplaza a `MaintenanceIssue`** — modelo legacy preservado por compatibilidad pero no usado en flujos nuevos.

62. **D-Mx2: CRITICAL ticket auto-bloquea inventario** — `SmartBlockService.createBlock(OUT_OF_ORDER, MAINTENANCE, maintenanceTicketId)` síncrono en misma transacción. **Resuelve caso Hotel Boutique Tulum (encerado vs venta OTA).**

**Notas adicionales Mx-1:** D-Mx3 (auto-release en VERIFIED), D-Mx4 (audit trail `MaintenanceTicketLog`), D-Mx5 (técnicos son `Staff` con `department=MAINTENANCE`), D-Mx6 (módulo NestJS monolítico), D-Mx7 (foto antes/después opcional pero recomendada).

### Sprint 8 (Check-in + Payments)

**Sprint 8E decisions:**
- **Confirmación de check-in via `confirmCheckin()`** — guard idempotencia (`actualCheckin !== null` → ConflictException), guard fecha futura, guard balance unpaid (sin OTA prepaid + sin COMP).
- **`PaymentLog` append-only USALI 12 ed** — sin `@updatedAt`, void crea entrada negativa con `voidsLogId`.
- **COMP + $0 amount requiere approval** — `approvedById` + `approvalReason`. Backend-enforced, no solo UI.
- **CARD_TERMINAL + BANK_TRANSFER requieren `reference`** — no chargeback evidence sin POS auth code.
- **`documentNumber` enmascarado** — `***1234` en audit logs + UI (GDPR/LGPD).
- **`keyType` enum default PHYSICAL** — captura trazabilidad de qué acceso se entregó.

### Arquitectura multi-tenant 4-level (v1.0.5+)

> **Decisión fundacional 2026-05-15.** Ver `docs/vision/11-multi-tenant-architecture.md` para análisis completo. Estas son las reglas no-negociables que aplican a TODO código nuevo a partir de v1.0.5.

63. **Modelo 4-level Brand→Organization→LegalEntity→Property** — el schema multi-tenant es jerárquico, no flat. Toda Property pertenece a 1 LegalEntity (fiscal); toda LegalEntity pertenece a 1 Organization (customer SaaS); toda Organization pertenece a 0..1 Brand (comercial, opcional). Justificación: casos reales como Selina (24 países) necesitan separar entidad fiscal de entidad comercial. Modelos flat (Org→Property) no pueden soportarlo sin atajos peligrosos.

64. **LegalEntity es required para invoicing** — toda emisión CFDI/DIAN/SUNAT/Tribu-CR pasa por LegalEntity. Tax ID, currency, PAC credentials viven en LegalEntity (no Property). Razón: el PAC se contrata por razón social, no por propiedad.

65. **Property.legalEntityId** será NOT NULL eventualmente (v1.1+). Durante migration v1.0.5 es nullable con backfill automático. Toda Property nueva debe asignarse a una LegalEntity desde el día 1.

66. **organizationId denormalizado en Property** — además del FK a LegalEntity, Property mantiene `organizationId` denormalizado para queries comunes ("todas las properties de esta org"). Trigger Postgres garantiza consistencia. Citus pattern.

67. **User scope 3-level: BrandUserRole / LegalEntityUserRole / UserPropertyRole** — autorización jerárquica. Un user puede tener cualquier combinación. AccessControlService verifica vía query UNION los 3 niveles. Pattern Salesforce Profile + Permission Sets.

68. **JWT lleva `scope: 'BRAND' | 'LEGAL_ENTITY' | 'PROPERTY'`** — el scope efectivo de la sesión. Endpoints cross-* validan el scope adecuado. Backwards compat: si scope no presente, asume PROPERTY.

69. **FiscalRegime es semilla, no hardcode** — los 10 países LATAM (MX/CO/CR/PE/PA/GT/BR/SV/HN/AR) están en tabla `FiscalRegime` sembrada. Cada uno tiene su `pacAdapterClass` (Strategy pattern). Agregar país nuevo = 1 row + 1 adapter class, sin migration.

70. **PAC credentials per LegalEntity, NO per Property** — el PAC tiene 1 contrato por razón social. Multi-property bajo misma LegalEntity comparte PAC.

71. **legalAddress como `jsonb`** — cada país tiene formato distinto (MX: calle/colonia/CP; BR: rua/bairro/CEP). Modelar 30 columnas opcionales = anti-pattern. JSONB + adapter validation. Citus pattern.

72. **TenantContextService es app-layer (no Postgres RLS)** — enforcement en NestJS middleware/interceptor. RLS reservado como defense-in-depth en v1.2+. Razón: app-layer es más debuggeable, ya tiene 8/8 tests pasando.

### Infraestructura — 4 fases sin lock-in

> Ver `docs/vision/12-infrastructure-devops.md` para detalle completo.

73. **Fase 1 (HOY): Vercel + Render + Neon + R2** — costo $70-200/mes. Path de migración trivial a AWS sin reescritura. Razón: velocity para piloto; AWS día 1 requiere DevOps dedicado ($5k+/mes salario).

74. **Fase 2 trigger:** ≥10 properties O ≥3 cadenas con ≥3 properties cada una. Migración a AWS Fargate + RDS + Upstash Redis.

75. **Fase 3 trigger:** ≥100 properties O 1er customer enterprise (cadena multi-país). Compliance SOC 2 Type 2 + PCI-DSS si volumen tarjeta >6M/año.

76. **Disciplinas DevOps desde día 1 (no costean dinero):** environments separados con preview deploys, migrations versionadas con rollback documentado, backups verificados mensualmente, secrets en env vars (nunca en repo), 3-tier observability (metrics + logs + traces), incident runbook documentado para 8 tipos de incidente.

### Setup wizard — Zenix Activate

> Ver `docs/vision/13-consultant-setup-wizard.md` para detalle de las 8 etapas.

77. **Zenix Activate** — wizard de onboarding ejecutado por consultor ZaharDev o partner certificado (v1.2+). 8 etapas: Customer Account → Brand → LegalEntity → Properties → Inventory → Staff → Integrations → Activación. Target 30 min - 2 semanas según complejidad (vs SAP 6-12 semanas).

78. **Templates de inventario obligatorios** — 4 templates pre-cargados (HOSTAL, BOUTIQUE, CABAÑAS, BUSINESS) con RoomTypes razonables. Customer empieza desde template y customiza. Pattern Salesforce "Industry Solutions".

79. **Health checks pre-activación** — antes de marcar `Organization.activatedAt`, wizard ejecuta batería de tests (Channex push, Stripe charge $1, PAC emission, etc.). Failed checks bloquean activación; warnings permiten continuar con confirmación explícita.

80. **Activation Report PDF** — generado automáticamente al activar. Documenta toda la configuración, sirve como handover formal al customer. Pattern SAP Activate "Realize Phase Report".

### Payment, Currency & Tax — v1.0.1 PAY-CORE / v1.0.2 CFDI-CORE

> Decisiones fundacionales 2026-05-15. Ver [docs/vision/14-payment-currency-tax-architecture.md](../../docs/vision/14-payment-currency-tax-architecture.md) para análisis completo (9 sub-módulos, esquemas Prisma, bibliografía LATAM).

81. **`PaymentFxLock` atómico e inmutable** — todo `PaymentLog` con `paidCurrency ≠ propertyDefaultCurrency` genera un `PaymentFxLock` en la misma transacción. El rate se congela al cobro y nunca se reescribe. Cuando llega el payout report de Stripe/Conekta se reconcilia `realizedGainLoss` en línea separada (USALI 12 ed. Foreign Exchange Gain/Loss). Patrón inmutable análogo a §28 PaymentLog append-only.

82. **`PropertySettings.taxStrategy` default `INCLUSIVE`** — rate público incluye IVA + ISH (porcentuales). Push a OTAs vía Channex con `is_inclusive=true`. DSA per-night (cuota fija) **siempre `EXCLUSIVE`** con disclosure obligatorio en confirmation page del OTA (la OTA no puede pre-calcular sin noches/personas). Resuelve el "problema Hostelworld" — fricción del 73% de quejas post-stay por extra fees inesperados (NN/g Price Transparency 2023).

83. **Banxico SF43718 (FIX) es fuente primaria de FX para properties MX** — cron diario 12:00 CST post-publicación DOF. Token gratuito, 40 000 consultas/día. Fallback a Open Exchange Rates si Banxico no responde en 30s con alerta SSE al admin. CFDI 4.0 usa el FIX del día de la operación (Art. 20 CFF). REP usa FIX del día del pago (no de la factura) — diferencia natural se asienta en `realizedGainLoss`.

84. **`TaxRate` modela rate porcentual, cuota fija, y multiplicador UMA** — `calculation: PERCENT_OF_BASE | FIXED_PER_ROOM_NIGHT | FIXED_PER_PERSON_NIGHT | UMA_MULTIPLIER | PER_BOOKING`. **`UmaValue` versionada per-country con `validFrom/validTo`, nunca hardcoded** (UMA cambia cada febrero por inflación INEGI). Ejemplo MX: ISH QR 2026 = `PERCENT_OF_BASE 0.06`; DSA Tulum 2026 = `UMA_MULTIPLIER 0.30 perPerson=true`.

85. **Cash drawer multi-divisa reconcilia per-divisa, no agregado** — `CashierShift.{openingFloat, expectedClose, actualClose, variance}` son `Json { MXN, USD, EUR }`. Todo `PaymentLog method=CASH` requiere `shiftId` activo (sin shift abierto → ConflictException). Devuelta en moneda distinta = dos `CashMovement` con mismo `transactionGroupId`. Variance > umbral configurable requiere `varianceReason` + `reconciledById` SUPERVISOR (patrón AHLEI Front Office Cashier's Shift Report).

86. **`GuestCredit` es entidad de primera clase BASE no DLC** — emitida por `LegalEntity`, aplicable solo intra-`LegalEntity` (un crédito de LegalEntity A nunca aplicable a folio de LegalEntity B — sería ingreso doble fiscal). En MX, si folio origen tuvo CFDI I emitido, **es obligatorio emitir CFDI E con `FormaPago=15 (Condonación)` + `UsoCFDI=G02`** antes de marcar `status=ISSUED`. Servicio: `GuestCreditService.issueCredit()` análogo §35 AvailabilityService. Audit append-only en `GuestCreditLog`. Default `transferable=false`, expiración configurable per-property (default 12 meses MX). Ningún PMS premium tiene esto en core — diferenciador real frente a Mews/Opera (que dependen de VoucherCart add-on).

87. **OTA-collect detection vía Channex `payment_collect` flag** — persistido en `GuestStay.paymentModel: HOTEL_COLLECT | OTA_COLLECT | HYBRID_DEPOSIT`. En `OTA_COLLECT` el `confirmCheckin` no requiere balance pagado (folio se marca "paid via OTA virtual card / pending reconciliation"). En `HYBRID_DEPOSIT` balance = `totalCharges − depositReceived`. Mews tiene feature request abierto desde hace años — Cloudbeds sí lo tiene. Zenix lo entrega en core.

88. **`PaymentMethod` enum se mantiene como naturaleza del pago** — `CASH | CARD_TERMINAL | BANK_TRANSFER | OTA_VIRTUAL_CARD | COMP`. **NO se factoriza por divisa** (no crear `CASH_USD`, `CASH_MXN`...). La divisa viaja siempre en `paidCurrency: String (ISO 4217)` + `paidAmount` + `baseAmount`. Modelo Cloudbeds, más limpio para agregar divisas sin migrations.

89. **`IFiscalAdapter` por país (Strategy pattern)** — cada `FiscalRegime` (§69) tiene su `pacAdapterClass`: `MxCfdi40Adapter` (Facturama / SW Sapien), `CoDianAdapter`, `PeSunatAdapter`, `CrHaciendaAdapter`. **MX es BASE v1.0.2 CFDI-CORE**; CO/PE/CR son **DLC tier Pro** activables vía Zenix Activate wizard (§77-§80). Permite escalar a nuevos países agregando 1 row en `FiscalRegime` + 1 adapter class sin migration.

90. **Créditos emitidos sobre stays OTA por default solo aplicables a reservas direct** — `GuestCredit.applicableChannels: String[] @default(["DIRECT"])`. Mitigación del riesgo de "OTA pierde comisión por venta original cuando crédito se aplica a stay direct futura". Override per-property con audit log. Documentado en UI al emitir crédito sobre stay OTA.

### Tax catalog nativo + multi-país LATAM — v1.0.2 CFDI-CORE / Zenix Activate

> Decisiones fundacionales 2026-05-15 (PM late) tras investigación profunda 32 estados MX + 9 países LATAM + fricción competitiva. Ver [docs/vision/14-payment-currency-tax-architecture.md §J](../../docs/vision/14-payment-currency-tax-architecture.md) para matriz completa.

91. **Catálogo nativo Zenix de impuestos (`TaxCatalogEntry`) — single source of truth, owned por rol `TAX_CURATOR` interno.** Cliente NUNCA edita el catálogo base; solo crea `TaxCatalogOverride` con `reason` + `approvedById` obligatorios. Patrón SAP Tax Determination / Vertex Tax Content team / Salesforce Permission Sets. NO usar Avalara/Vertex/Sovos en v1.0.x — costo y velocidad de actualización (LATAM hotelería) favorecen catálogo curado por contador interno parcial (~$1.5-2k/mes vs $1-4k Avalara vs ≥$30k/año Sovos). Es **diferenciador comercial documentado** frente a Mews (Tax Environments hard-coded no modificables tras crear enterprise), Cloudbeds (sin presets, ~30 clicks setup MX), Opera (requiere consultor Oracle $15-30k), RoomRaccoon (onboarding 1-4 semanas).

92. **`TaxCatalogOverride` con precedencia PROPERTY > LEGAL_ENTITY > catálogo base.** Override permite `disabled=true` para exoneraciones (ZOLITUR Roatán, RNT Colombia, IVA-exempt diplomático) o `customRate/customFixedAmount`. Validez con `validFrom/validTo`. Resolución en `resolveTaxesForProperty()`: catalog entries más específicos primero (municipality > region > federal), luego merge con overrides en orden de precedencia. Toda aplicación crea entry en `TaxApplicationLog` append-only (§14, §28).

93. **Brasil EXCLUIDO de v1.0.x.** ISS municipal (2-5 % por ayuntamiento, 80+ ciudades top) + reforma tributária 2026-2033 (CBS/IBS gradual replacement de PIS/Cofins/ICMS/ISS) hacen Brasil incompatible con el catálogo curado interno de Zenix. Entrar a Brasil **post v1.2** con **Sovos como `FiscalAdapter`** dentro del pattern §89 (no reinventar). Sovos tiene equipo dedicado y cobertura de la reforma tributária. Documentar al cliente que reciba reservas Brasil OTA antes de v1.2 con flag warning.

94. **`TaxCatalogEntry.status='AMBIGUOUS'`** para entradas con fuente primaria no verificable. Caso vigente: **DSA Tulum** (per-room confirmado por sitio oficial H. Ayuntamiento Playa del Carmen para Riviera Maya / per-person tiered según Reporte Quintana Roo 2026; Decreto 191 texto literal no accesible). Wizard Zenix Activate solicita al cliente seleccionar modalidad al activar property; equipo de Activate verifica con Tesorería Municipal antes de marcar `status='ACTIVE'`. Default conservador = `UMA_MULTIPLIER` per-room (modalidad soportada por la fuente oficial municipal Riviera Maya). Nuevo `TaxCalculation.UMA_PER_PERSON_TIERED` agregado para soportar el caso tiered si se verifica.

**México — datos 32 estados ISH 2026 confirmados** ([El Contribuyente](https://www.elcontribuyente.mx/impuesto-sobre-hospedaje/) × [JA Del Río](https://www.jadelrio.com/mx/es/blogs/tasas-actuales-del-impuesto-sobre-hospedaje-2026)): Yucatán bajó 5→4.5 %; QR 5 %/6 % plataformas; CDMX 3.5 %/5 % plataformas; Guerrero/Querétaro/Jalisco tarifa diferenciada plataformas. Catálogo seed productivo lo carga el Tax Curator antes de release v1.0.2.

**LATAM 9 países — granularidad mínima:** MX y Brasil requieren per-estado/municipio; CO/CR/PE/PA/GT/SV/AR funcionan con catálogo nacional; HN requiere override regional para ZOLITUR (Roatán/Utila/Guanaja).

### Cancel-Archive — v1.0.0 sprint cerrado (PR #32)

95. **Soft-delete obligatorio de reservas (D-CAN1)** — `GuestStay.cancelledAt` + cascade a `StaySegment.status='CANCELLED'` + `StayJourney.status='CANCELLED'`. Nunca hard-delete. Justificación: Visa Reason Code 13.7 ventana 120d filing + 30d ack ([Visa Dispute Management Guidelines junio 2024](https://usa.visa.com/content/dam/VCOM/global/support-legal/documents/merchants-dispute-management-guidelines.pdf)); CFDI 4.0 Art. 30 CFF retención 5 años; GDPR Art. 17.3.b/e excepción. AvailabilityService excluye `cancelledAt != null` — libera inventario inmediato. Schema "espiral": `cancelInitiator: String?` (no enum), `cancelMetadata: Json?`, `cancellationPolicyId: String?` FK hook, `requiresFiscalReview: Boolean` sembrado para v1.0.2 CFDI-CORE — sin migration en sprints futuros.

96. **Restore window 7d para HOTEL/ADMIN_ERROR únicamente (D-CAN7)** — cancelaciones iniciadas por GUEST u OTA NO son restaurables (operación real ya cerrada). Restore verifica `AvailabilityService.check` antes de aplicar — si la habitación ya está reservada, error friendly. `GuestStayLog` append-only registra event `RESTORED` con audit completo.

97. **Calendar filtra cancelled del view (paridad industria)** — `staysWithoutJourneys.filter(s => !s.journeyId && !s.cancelledAt)`. Industria estándar (Cloudbeds/Mews/Opera/RR/LH liberan slot visual). Cancelled accesible vía slide drawer footer "Canceladas hoy: N" + sub-tab archive (futuro `/reservations`).

98. **Modal dismiss estándar reusable (`useModalDismiss` hook)** — patrón Apple HIG aplicado a TODOS los modales: backdrop click + Esc cierran. Si `isDirty=true` (form con cambios) → `window.confirm` antes de descartar. Aplicado a CancelReservationDialog, CancelledTodayDrawer, MoveExtensionConfirmDialog. Backdrop blur div con `pointer-events-none` para que click pase al outer container.

### Notif center — auto-cleanup + self-suppress sistémico

99. **Self-suppress sistémico (analogía FB)** — el actor que dispara una notif NUNCA recibe la suya. Aplicado en `NotificationCenterService.sendPush` (filtra `triggeredById` de staffIds para recipientType=ROLE/PROPERTY_ALL) Y en `listForUser` + `unreadCount` (filtro `triggeredById !== staffId`). Excepción: `recipientType=USER` con `recipientId=self` sí se entrega (caso DM-style legítimo).

100. **Auto-mark-as-read tras decisión de aprobación** — `recordApproval` auto-crea `AppNotificationRead` entries para todos los recipients elegibles al crear el `AppNotificationApproval`. Backward-compat: `unreadCount` filtra `approvals: { none: {} }` para data legacy. Resultado: bell counter no muestra notifs ya decididas; panel "Sin leer" tampoco. La notif sigue visible en "Todas" con badge ✓Aprobado/✗Rechazado.

101. **Purga física de notifs (NotificationPurgeScheduler)** — patrón "two-tier retention": (a) `expiresAt > now` = activas; (b) `expiresAt < now < expiresAt+7d` = grace period audit; (c) `expiresAt+7d < now` → DELETE físico vía `@Cron EVERY_DAY_AT_4AM`. Cascade automático a `AppNotificationRead` + `AppNotificationApproval` por FK. Compliance permanente (`expiresAt=null`: NO_SHOW Visa-evidence, MAINTENANCE_SLA_BREACH, PAYMENT_PENDING) NUNCA se purga — futura migration v1.0.3 REPORTS-CORE moverá >365d a cold storage partition.

### Rates 3-LEVEL + FX-CORE — v1.0.0 sprint cerrado (PR #32)

102. **Patrón Rates 3-LEVEL** — solución al gap competitivo documentado en Mews feedback (8 votos abierto desde oct-2024, 2 quejas verbatim). Niveles:
    - **Nivel 1 — Ambient**: BAR per-group renderizado en cada `row.type='group'` del TimelineGrid usando `RoomTypeGroup.baseRate` client-side (no requiere endpoint). Cada grupo (Cabaña, Estándar, Junior Suite, Suite) muestra su rate distinto por día. Fallback a BAR strip top cuando solo hay 1 grupo (caso STR/Airbnb flat).
    - **Nivel 2 — Hover enriquecido**: ghost block del `TimelineGrid` muestra rate completo (no truncado) con layout adaptativo según `colWidth` (narrow: `$1.5k` solo; medium: `+ $145`; wide: `+ Nueva reserva — USD 145`).
    - **Nivel 3 — Rate Quote Sheet**: side panel (max-w-2xl) accesible vía botón "Tarifas" en `TimelineSubBar` con grid `RoomType × Dates` + totales por type. Endpoint `GET /v1/rates/quote` con `RatesService.getRateQuoteGrid()`. Selector de fechas + presets "Hoy / 7d".

103. **FX-CORE — Banxico oficial + override hotel** — adelantado de v1.0.1 PAY-CORE porque rate display requiere conversión.
    - **ExchangeRate** model: snapshot diario inmutable per `[org, base, quote, effectiveDate, source]` UNIQUE. Source primario: `BANXICO_SF43718` (FIX gratuito, 40k req/día).
    - **PropertyFxRate** model: override comercial del hotel. Rate absoluto o spread relativo (`spreadFromOfficial: Decimal?`) sobre oficial. `validFrom/validTo` para histórico.
    - **`FxService.refreshBanxicoDaily`** `@Cron('0 13 * * *', timeZone: 'America/Mexico_City')` post-publicación DOF. Fail-soft si Banxico no responde — log warning, sin alerta crítica en v1.0.0.
    - **CFDI compliance** (Art. 20 CFF): cancelaciones, refunds y emisiones usan rate **oficial Banxico del día de la operación**. REP usa FIX del día del pago (no de la factura) — diferencia natural se asienta en `realizedGainLoss` (v1.0.1 §81 PaymentFxLock).
    - **Override interno** aplica para quotes al guest + cobros front-desk únicamente — nunca para CFDI.

104. **Scroll performance SwiftUI-style (calendar timeline)** — refactor de `handleScroll` para bypass total de React reconciliation en cada scroll event:
    - 3 refs (`dateHeaderInnerRef`, `barStripInnerRef`, `footerInnerRef`) apuntan a los inner divs que sincronizan con scroll horizontal.
    - `handleScroll` aplica `translate3d(${-x}px, 0, 0)` directo al DOM en cada scroll event (60-120/s) — 0 React cost, GPU-composited.
    - `setScrollLeft` (React state) sigue existiendo pero throttled vía `requestAnimationFrame` (1 update/frame cuando idle) — usado solo por virtualizer + cálculos derivados.
    - `will-change: transform` en los inner divs → compositor thread.
    - `BarStrip` + `OccupancyFooter` signatura: `scrollLeft: number` → `innerRef: Ref<HTMLDivElement>`. Componente NO conoce el valor, solo expone el ref.
    - Patrón Apple Calendar / SwiftUI scroll-aware container — el scroll es 100% imperativo.

128. **Overstayed/zombie stays — tratados como salidos para availability, expuestos en reports.** Sprint AVAIL-OVERSTAY (2026-05-19). Una `GuestStay` con `scheduledCheckout < startOfDay(today)` y `actualCheckout=null` se considera "zombie" (huésped se fue pero recepción no confirmó checkout; o falló la conexión; o cambió dueño de turno).
   - **`AvailabilityService.check()` los excluye** del query de conflictos. Cutoff combinado `effectiveCheckoutCutoff = max(dayAfterNewCheckIn, zombieCutoff=startOfDay(today))`. Sin esto, Elena dragged A1→A2 con su `checkIn` en pasado disparaba conflict contra Carlos zombie sch=ayer (bug reportado por testing 2026-05-18).
   - **`AvailabilityService.findOverstayed(propertyId)` es el counterpart**: retorna exactamente las zombies con `outstandingBalance = totalAmount - amountPaid` + `hoursOverdue`. Política Option B (user-approved 2026-05-19): "si no hizo checkout y debía saldo el sistema debe reportarlo en algún lugar". Contabilidad encuentra el saldo via dashboard widget + endpoint reports.
   - **Endpoint `GET /v1/reports/overstayed`** (RECEPTIONIST/SUPERVISOR; HOUSEKEEPER → 403, sin acceso a PII financiera).
   - **Frontend mirror del filtro** en `TimelineScheduler.occupancySet`, `MoveRoomDialog.staysByRoom`, y `useDragDrop.hasConflict` (con `effectiveCheckIn = max(today, checkIn)` para clipping del rango cuando el dragged stay ya hizo check-in — fix de Bug 1+2 reportados 2026-05-18).
   - **Visual cue en calendar**: `BookingBlock` muestra ring amber `inset 0 0 0 2px rgba(217,119,6,0.85)` + badge "Vencido" cuando `isOverstayed`. Diferenciable de no-show (red solid).
   - **`OverstayedWidget`** en Dashboard renderiza top-3 + saldo agregado + "Ver N más". Empty state explícito ("Sin pendientes") para reinforcement positivo.
   - **Tests:** `apps/api/src/pms/availability/availability.service.spec.ts` 6/6 verdes — cubre cutoff combinado, segment query, ordering, balance computation.
   - **Out-of-scope deferido a v1.0.3 REPORTS-CORE:** paginación cuando >50 zombies, filtros por antigüedad (>7d crítico), export CSV, notif diaria al SUPERVISOR cuando count > 0 al cerrar turno.

127. **Confirmar mudanza lightweight (1-click) para room-change segments.** Sprint MOVE-CONFIRM 2026-05-18. Schema: `StaySegment.moveConfirmedAt + moveConfirmedById`. Endpoint `POST /v1/stay-journeys/segments/:id/confirm-move`. Guards: reason in [EXTENSION_NEW_ROOM, ROOM_MOVE] + status=ACTIVE + checkIn ≤ now + !moveConfirmedAt + stay no cancelled/no-show/checked-out. Side effect: `promoteRoomChangeTaskToReady` promueve PENDING → READY (consistente §1 ciclo 2-phase: PENDING=planning, READY=HK actúa) — sin esto recamarista podría limpiar cuarto antiguo ANTES del move físico. Pattern 5/5 PMS (Mews, Cloudbeds, Opera, Little Hotelier, RoomRaccoon) — separado del re-check-in (§125 propagación actualCheckin). UI: botón "Confirmar mudanza" en BookingDetailSheet como primary CTA cuando aplica.

126. **Cancelar extensión de un guest checked-in ≠ early checkout.** Sprint 2026-05-17. Cuando un guest checked-in tiene un segmento futuro (extension) y decide cancelar esa extensión, NO debe forzarse el flow de early checkout — el guest sigue alojado en su segmento actual; solo se revoca la prolongación planeada. Endpoint: `POST /v1/stay-journeys/segments/:segmentId/cancel` → `StayJourneyService.cancelFutureSegment`. Guards: segment.checkIn > now + status=ACTIVE + journey con ≥1 otro segmento ACTIVE. Efectos: segment.status=CANCELLED + journey.journeyCheckOut + GuestStay.scheduledCheckout revierten al max checkOut de los segmentos restantes; availability libera noches; audit en StayJourneyEvent con subType='EXTENSION_CANCELLED'. Frontend routing condicional en TimelineScheduler: `isFutureExtensionSegment = !!stay.segmentId && stay.checkIn > now && !stay.isFirstSegment` → llama `useCancelExtensionSegment` en lugar de `useCancelStay`. **Cross-PMS consensus 5/5** (Mews, Cloudbeds, Opera, Little Hotelier, RoomRaccoon): cancel extension = revertir fecha de salida; NO genera checkout, NO requiere re-check-in, NO genera housekeeping task. El bug previo "El huésped ya hizo check-in — usar checkout anticipado" forzaba audit erróneo + HK task prematura + balance/refund incorrecto. Las extension cancellations aparecen en el footer "Canceladas hoy" con badge `Extensión` (ícono CalendarMinus ámbar) distinguible visualmente de stay-level cancellations.

125. **Mid-stay room change housekeeping flow — task PENDING en el día del move, NO en el día del booking.** Sprint 2026-05-17. Cuando un guest extiende su estadía a otra habitación (EXTENSION_NEW_ROOM o ROOM_MOVE), la habitación origen necesita limpieza el día del move, no el día que se registra la extensión.
   - **`createRoomChangeTasks(propertyId, roomId, scheduledFor: Date)`** (privado en StayJourneyService) — el tercer parámetro `scheduledFor` es REQUERIDO. Normaliza a UTC midnight; valida idempotency local antes de crear; skipea SSE emit si no se creó task nueva.
   - **Callers actualizados:** `extendNewRoom` pasa `activeSegment.checkOut` (= fecha del move). `executeMidStayRoomMove` pasa `effectiveDate`. `splitReservation` pasa `today` (split sucede ahora).
   - **Morning roster cron amplía detección:** además de `GuestStay.scheduledCheckout` (stay-level), ahora query `StaySegment` con `checkOut=today + reason in [EXTENSION_NEW_ROOM, ROOM_MOVE]` (move-outs) Y `checkIn=today + reason in [...]` (move-ins). Unifica fuentes con `Map<roomId>` dedup.
   - **`hasSameDayCheckIn` URGENT escalation:** rooms con guest llegando hoy via move-in (segment-level) se marcan URGENT igual que stay-level checkins. Tu escenario (Guest A se mueve a C2 donde Guest B hizo checkout same-day) ahora correctamente prioriza C2 sobre otras rooms del roster — el guest esperando no se queda con maletas en recepción mientras la recamarista limpia otra cosa.
   - **Upgrade-in-place:** si la task ya existía (creada eagerly por `extendNewRoom` con priority MEDIUM) y AHORA el cron detecta same-day arrival, hace `UPDATE` con priority=URGENT + hasSameDayCheckIn=true. La señal "guest llegando" se preserva incluso si llega después de la creación de la task.
   - **Tests:** 4 nuevos en `morning-roster.scheduler.spec.ts` (B2 task creation segment moveout / B3 URGENT priority via move-in / upgrade-in-place / dedup). Total 16/16 passing, 365/365 backend suite passing.

124. **SSE singleton — UNA sola EventSource por tab del navegador, garantizado.** Ubicación: [apps/web/src/lib/sseClient.ts](apps/web/src/lib/sseClient.ts). Los hooks `useSSE`, `useSoftLockSSE`, `useRoomSSE` son subscribers ligeros del singleton — NO crean sus propias `EventSource`. Decisión fundacional Sprint SSE-RESILIENCE (2026-05-17, adelantada de v1.0.4 al detectar bloqueo recurrente en testing dev).
   - **Bug raíz que motivó:** 3 EventSources por tab (useSSE + useSoftLockSSE + useRoomSSE), cada una con su propio lifecycle, cada una capaz de leak con HMR. Tras horas de dev se acumulaban 15-25 conns TCP a localhost:3000 → pool HTTP/1.1 de Chrome (6 simultáneas por origin) se agotaba → POSTs colgaban hasta timeout. Bug reportado 4+ veces en una sola sesión.
   - **Garantías:** (1) máximo 1 EventSource activa por tab, ref-counted via subscribers; (2) reconnect con exponential backoff 1s→2s→4s→8s→max 30s; (3) token-aware: re-conecta al cambiar JWT (switchProperty); (4) HMR-safe via `import.meta.hot.dispose()` que cierra la conn vieja al re-importar el módulo; (5) AbortController para preflight evita race conditions; (6) handlers aislados (un throw en uno no rompe a los demás).
   - **API pública mínima:** `subscribeSse(handler) → unsubscribe()`. Cualquier hook nuevo que necesite SSE usa esta API — está PROHIBIDO crear `new EventSource()` fuera de `sseClient.ts`.
   - **Debug helper:** `_sseDebug()` retorna `{ connected, readyState, subscribers, token, reconnectAttempts }` para introspección desde DevTools console.
   - **Por qué documentamos esto:** prevenir que la próxima feature reintroduzca el patrón `new EventSource()` ad-hoc que ya nos costó 4+ iteraciones de debugging. La eficiencia SSE en dev (HMR-safe) y en prod (cero accumulation) depende de mantener la disciplina del singleton.

123. **`DialogActions` es el primitive canónico para footers de modal — par Cancelar/Confirmar.** Ubicación: [apps/web/src/modules/rooms/components/shared/DialogActions.tsx](apps/web/src/modules/rooms/components/shared/DialogActions.tsx). Prohibido renderizar pares `<Button variant="outline">Cancelar</Button> + <Button>Confirmar</Button>` ad-hoc en footers de dialog — la inconsistencia visual (heights mixtos h-8/h-9/h-10, text-xs vs text-sm, ghost vs outline vs solid) viola NN/g H4 (consistency & standards) y erosiona la confianza del usuario en herramientas operativas.
   - **Reglas canónicas no-negociables:**
     1. Cancelar SIEMPRE izquierda (variant `outline`), Confirmar SIEMPRE derecha (solid coloreado por `tone`). Western reading flow + Apple HIG (primary action es el "destino" del gesto).
     2. Mismo `h-9` (36px ≥ 44pt iOS effective con padding), mismo `text-xs`, mismo `gap-2`.
     3. `tone: 'primary' | 'destructive' | 'warning' | 'info'` mapea 1:1 a tonos `ConfirmDialog` (§117). Primary = emerald-600, destructive = red-600, warning = amber-600, info = slate-700.
     4. `isPending` deshabilita AMBOS botones (Cancel + Confirm) — el HTTP standard §122 garantiza terminal state, el band-aid "habilitar Cancel durante pending" está explícitamente prohibido.
     5. `confirmPendingLabel` se deriva automáticamente del verbo del label ("Registrar pago" → "Registrando…"). Override sólo si la derivación no aplica.
     6. Icono opcional `confirmIcon` (`LucideIcon`) a la izquierda del label primary, h-3.5 w-3.5.
     7. `widthMode: 'stretch' | 'auto'` — stretch default (cada botón flex-1). Auto para footers con contenido a la izquierda (ej: línea audit ConfirmCheckin USALI/CFDI).
   - **Modales migrados al primitive (2026-05-17 post-debate):** `ConfirmDialog` (los demás `*ConfirmDialog` heredan al delegar), `RegisterPaymentDialog`, `VoidPaymentDialog`, `ChangeConfirmDialog`, `ConfirmCheckinDialog`, `CancelReservationDialog`, `MoveExtensionConfirmDialog`, `MoveReservationConfirmDialog`, `MoveRoomDialog`, `EarlyCheckoutDialog`, `ExtendConfirmDialog`, `UploadDocumentPhotoDialog`.
   - **Por qué documentamos esto:** auditoría detectó 10+ modales con button pairs inconsistentes (heights mixtos, sizes mixtos, tonos arbitrarios). Cada modal era "casi" igual pero no idéntico, lo cual produce esa sensación de UI "armada por varios devs" — exactamente lo que Apple HIG previene mediante design tokens. Cualquier modal NUEVO usa `DialogActions` desde el día 1.

122. **HTTP Client Standard — estandarizado y formalizado en [docs/engineering/http-client.md](docs/engineering/http-client.md).** Resumen ejecutivo:
   - `apps/web/src/api/client.ts` es el ÚNICO entry point para HTTP del frontend. Raw `fetch()` fuera de él está prohibido (única excepción documentada: `useSSE.ts` preflight para EventSource).
   - Timeouts automáticos via `AbortSignal.timeout()`: GET 30s · POST 20s · PATCH 20s · DELETE 15s. Override per-call con `opts.timeoutMs`.
   - Timeout vence → throw `ApiError(0, msg, { code: 'TIMEOUT' })` con mensaje accionable en español.
   - Network error → `ApiError(0, ..., { code: 'NETWORK_ERROR' })`. 401 → logout + redirect a /login con `returnTo`.
   - **Estado terminal garantizado**: toda mutation resuelve OK o ERROR — `isPending` siempre vuelve a `false`. Modales que dependen de `isPending` para Cancel/X tienen ciclo cerrado.
   - **Anti-pattern explícitamente prohibido**: habilitar Cancel durante `isPending` para "salir de modales colgados". Si un modal se cuelga, el bug está en el cliente (sin timeout), no en el modal. Cura es timeout, no band-aid.
   - Browsers soportados: `AbortSignal.timeout/any` desde 2023 (Chrome 103+, Safari 16.4+, Firefox 124+). Sin polyfill.
   - Cualquier modificación al contrato requiere update simultáneo de `client.ts` + `docs/engineering/http-client.md` + este §122.

121. **`useSSE.ts` usa `AbortController` para el fetch preflight** (fix iter 6 EDIT-RESERVATION). Bug original: el cleanup hacía `es?.close()` pero si HMR re-ejecutaba el effect mientras el fetch preflight estaba en flight, `es` era null en ese momento → la EventSource creada al resolver el fetch quedaba huérfana. Cada HMR sumaba 1 EventSource zombie. Chrome limita HTTP/1.1 a **6 conexiones simultáneas por host** → 6+ zombies bloqueaban el pool → POSTs como Registrar Pago, GETs de Movimientos/Notas quedaban en queue indefinidamente. Síntoma engañoso: "Cargando..." stuck sin error en consola, "Registrando..." sin progreso. Fix definitivo: `AbortController.abort()` en cleanup cancela el fetch antes de que pueda crear una EventSource huérfana. Cualquier hook NUEVO que use `EventSource` debe seguir este pattern.

### CHECK-IN-α — implementación iteración 2 (2026-05-17)

> Decisiones registradas tras feedback del usuario en sesión 2026-05-17. Ver [docs/sprints/CHECKIN-ALPHA-plan.md](docs/sprints/CHECKIN-ALPHA-plan.md) §3 + plan implementación.

105. **Check-in es single-screen con secciones colapsables, no wizard.** Justificación: NN/g 2024 "Wizards" — apropiados sólo para tareas >20min ejecutadas <1×/semana. Check-in es <2min, >20×/día → wizard es anti-patrón. Mercado boutique-PMS: 5/6 PMS (Cloudbeds, Mews, Clock PMS+, Little Hotelier, RoomRaccoon) usan single-screen. Sólo Opera (legacy) usa wizard de 7-12+ clicks — el más odiado en reviews verbatim. Anatomía: header sticky con balance badge → Identidad colapsable → Pago colapsable adaptativo (OTA/paid/pending) → Notas opcionales. CTA único `Confirmar check-in` con Cmd/Ctrl+Enter shortcut. `useModalDismiss` (Esc + backdrop + dirty confirm).

106. **`GuestStay.paymentModel` driver de OTA-collect detection.** Enum `HOTEL_COLLECT | OTA_COLLECT | HYBRID_DEPOSIT`, default `HOTEL_COLLECT` (no rebaja guards). Si `OTA_COLLECT`, `confirmCheckin` skip guard `BALANCE_UNPAID` y marca folio `paymentStatus=PAID` con nota "paid via OTA virtual card / pending reconciliation". `HYBRID_DEPOSIT` reservado para cuando Channex webhook escriba el flag real (sprint CHANNEX-INBOUND). Sin breaking change.

107. **Endpoint `GET /v1/guest-stays/:id/checkin-context` consolida data en single round-trip.** Pattern Cloudbeds "action drawer" — frontend recibe todo lo que necesita en una llamada (stay, paymentModel, balanceProjection, canCheckIn{reasons,warnings}, identityCaptured, paymentLogs, propertyCurrency, secondaryRates). Reduce 3 calls separadas (stay + payments + property settings) a 1. Declarado antes de `:id` en el controller para evitar shadowing (§26).

108. **Identidad por foto del documento, NO por campo "número" tipeado.** Sustitución completa del input manual. Pattern Maintenance MAINT-11 (data URI base64 hoy, migración S3 en v1.0.4 IMG). Justificación: CFDI 4.0 con RFC genérico `XAXX010101000` no requiere número estructurado (95% casos hospedaje turístico); Visa CRR 13.1/13.7 acepta foto como evidencia equivalente. Más práctico para recepción hostal LATAM (NN/g Form Usability: cognitive cost del typing eliminado). Límite blando 5MB. Checkbox "Verifiqué físicamente" sigue siendo requirement (audit trail).

109. **`documentNumber` enmascarado al perder foco (`••••XXXX`), plain con foco.** Pattern Stripe Elements. Audit log siempre enmascara `***XXXX` (ya en backend §2016). GDPR/LFPDPPP best practice — el número visible reduce superficie de exposición. Aplica al campo legacy cuando viene precargado de OTA/reserva direct previo a la foto.

110. **Backend devuelve códigos machine-readable en `confirmCheckin` errors:** `CHECKIN_ALREADY_CONFIRMED`, `BALANCE_UNPAID` (ya), `BALANCE_OVERPAID` (nuevo §110b), `NOSHOW_LOCKED`, `FUTURE_CHECKIN`. Frontend (`ApiError.code` getter) muestra feedback informativo específico (NN/g H9). Idempotency `CHECKIN_ALREADY_CONFIRMED` NO es error rojo — toast info + refetch silencioso. Mejor: parent TimelineScheduler guard previene apertura del dialog si `actualCheckin != null` → toast "Esta reserva ya está checked-in" sin renderizar dialog (evita el race en primera línea).

**110b. Overpayment bloqueado con `BALANCE_OVERPAID`** (Opera Cloud + RoomRaccoon paridad — 2/5 PMS conservadores). Tolerancia float 0.01. Crédito a favor / depósitos por incidentales son flujo aparte (v1.0.1 PAY-CORE territory, no parte del check-in). Mensaje claro: "El pago excede el saldo por $X. Ajusta el monto al saldo exacto — los depósitos por incidentales se registran después del check-in." Justificación: Cloudbeds/Mews/Little Hotelier permiten línea negativa silenciosa, lo cual genera errores en arqueo del turno. Cloudbeds adicionalmente usa banker's rounding (raro contra USALI half-up) — descartado para Zenix.

**110c. Currency display: property currency primary, USD/EUR/MXN secundarios.** 5/5 PMS analizados (Mews "outlet currency", Cloudbeds "house currency", Opera "operational currency", RoomRaccoon, Little Hotelier) priorizan property currency. Cash drawer física opera en property currency — mostrar otra moneda como primary genera errores de arqueo. Conversión secundaria con `Intl.NumberFormat` (decimales correctos per ISO 4217: USD/MXN: 2; JPY/CLP/COP: 0; KWD/BHD: 3). `propertyCurrency` derivado de `LegalEntity.baseCurrency` con fallback a folio currency durante v1.0.5 transición. `secondaryRates` lookup bidireccional 4-niveles: `PropertyFxRate` directo → inverso → `ExchangeRate` directo → inverso.

**110d. Sección "Entrega de llave" eliminada.** El hotel administra ese flujo aparte. NN/g H8 (minimalist) + Hick's Law — opciones irrelevantes son ruido cognitivo. Campo `keyType` permanece en DTO/schema como opcional para backward-compat; el UI ya no lo expone.

**110e. Foto upload sin OCR sirve hoy** (data URI base64, mismo patrón Maintenance MAINT-11). Migración a S3+Sharp en v1.0.4 IMG sprint — back-fill rows existentes. Razón vs esperar S3: Visa chargeback ventana es 120d; hoteles operando v1.0.1/v1.0.2 perderían evidencia retroactiva si esperamos.

### FX-LATAM — decisiones planeadas (registrar al ejecutar sprint v1.0.4)

> Decisiones del [plan FX-LATAM](docs/sprints/FX-LATAM-plan.md). Aún no implementadas — primer cliente Zenix fuera de MX las activa. Numeración reservada para preservar continuidad.

111. **`IFxAdapter` Strategy pattern paralelo a `IFiscalAdapter` (§89).** Cada `FiscalRegime` mapea su `fxAdapterClass` (campo nuevo). Agregar país = 1 class + 1 seed row, sin migration. Interface: `{ countryCode, primaryCurrency, cronSchedule, cronTimezone, fetchOfficial(): ExchangeRateInput[] }`. First batch: `BanxicoMxAdapter` (refactor existente), `BancoRepublicaCoAdapter` (Datos Abiertos GOV.CO), `BccrCrAdapter` (webservice SOAP), `SbsPeAdapter` (REST). Países USD-nativos (PA, SV) sin adapter.

112. **`FxAdapterRegistry` con `OnModuleInit` auto-registra crons per-país** usando `SchedulerRegistry` de `@nestjs/schedule`. Cada cron corre en timezone local del banco central (Banxico 13:00 CST, Banrep 19:00 COT, BCCR 19:00 CRT, SBS 19:00 PET). Fail-soft per-país: try/catch + log + SSE alerta admin si falla 3× consecutivos. Un adapter caído NO afecta los demás.

113. **`PropertySettings.secondaryDisplayCurrencies: String[]`** override del set de monedas secundarias en el check-in dialog. Si vacío, fallback a defaults por país (helper `defaultTouristCurrencies(countryCode)`): MX/CO/CR/PE → `['USD', 'EUR']`; AR → `['USD']` (EUR poco usado); PA/SV → `['EUR']` (USD ya primary). Nunca incluye la propia `baseCurrency`. Configurable en SettingsPage con `<TagInput>` para tourist edge cases.

114. **Argentina rates múltiples (oficial vs MEP vs CCL vs blue) requieren decisión de producto + contador AR antes de implementar.** Out-of-scope FX-LATAM first batch. Decreto AR 671/2024 obliga rate MEP para extranjeros pero realidad operativa hostal usa blue. Zona gris legal. Investigar al primer cliente Argentina.

115. **Brasil FX adapter llega bundled con Sovos `IFiscalAdapter` post v1.2** (consistencia §93). BCB Olinda PTAX API existe y es estable, pero entrar a Brasil sin el motor fiscal completo no tiene sentido — la conversión sin invoicing CFDI/NFSe equivalente es feature parcial. Bundle con Sovos asegura activación completa de Brasil de una vez.

### Modales — patrón canónico Zenix (no negociable post-2026-05-17)

> Decisiones cristalizadas tras 4 iteraciones costosas en sprint EDIT-RESERVATION
> reinventando contenedores cuando Radix ya los proveía. **Documentado para
> evitar repetir el ciclo.** Cualquier modal nuevo en el repo SIGUE estas reglas.

116. **Todo modal usa Radix Dialog primitives — NO inventar contenedores `fixed inset-0` manuales.** Si un modal vive dentro de otro Radix Sheet/Dialog abierto, los hacks de portal manual fallan en cascada:
   - **pointer-events lock** — Radix Sheet/Dialog setea `pointer-events:none` en body. Modal manual hereda → clicks pasan al overlay debajo → cierra ambos.
   - **dismissable layer** — Radix detecta clicks fuera del SheetContent y dispara `onOpenChange(false)`. Cualquier modal "fuera" del árbol gatilla esto.
   - **FocusScope trap** — Radix succiona el focus de regreso al primer focusable del Sheet padre. Inputs del modal manual no reciben keystrokes.

   Radix Dialog primitives (`Root`/`Portal`/`Overlay`/`Content`) **soportan nesting nativo** sobre Sheets/Dialogs padre — el inner FocusScope cede, los pointer events funcionan, el dismiss stack se respeta. **Importar de `radix-ui`** (`import { Dialog as DialogPrimitive } from 'radix-ui'`), no replicar la estructura.

117. **`<ConfirmDialog>` + `useDiscardConfirm` + `useConfirmDialog` son los primitives canónicos de confirmación.** Ubicación: [apps/web/src/modules/rooms/components/shared/ConfirmDialog.tsx](apps/web/src/modules/rooms/components/shared/ConfirmDialog.tsx). NUNCA usar `window.confirm` nativo — look & feel inconsistente per OS, bloquea JS thread, no respeta Apple HIG. Tones: `warning` (descartar) / `destructive` (anular, eliminar) / `info` (neutro) / `success` (acción positiva). Mapean a stripe + icono + color del botón confirmativo.

118. **`isDirty` se computa contra snapshot inicial — NO contra empty.** Si el modal pre-fillea cualquier campo (e.g., `amount = balance.toFixed(2)` en RegisterPaymentDialog), comparar `value !== ''` da false-positive: el dialog se considera dirty desde el primer render y el prompt de descartar aparece aunque el usuario no haya tocado nada. Pattern correcto:
   ```ts
   const [initial, setInitial] = useState({...})
   useEffect(() => { if (open) {
     const init = computeInitialState(props)
     setForm(init); setInitial(init)
   }}, [open, ...deps])
   const isDirty = form.field !== initial.field || ...
   ```
   Apple HIG: confirm dirty solo si HAY pérdida real de trabajo.

119. **Cero animaciones en modales/sheets.** Decisión 2026-05-17 — instant feedback prevalece sobre motion polish para herramientas operativas (recepción no debe esperar fade-in mientras un huésped espera frente al desk). Aplica a: `ui/sheet.tsx`, `ui/alert-dialog.tsx`, `ui/drawer.tsx`, todos los dialogs custom (ConfirmDialog, ConfirmCheckinDialog, etc.). Tooltips, dropdown-menu, select, NotificationPanel slide-in PRESERVAN animación (no son modales). Los comentarios sobre spring/ease curves en `ui/sheet.tsx` se mantienen por si se revierte la decisión.

120-bis. **Cambios post-checkin NO requieren approval bloqueante del manager** (revisión 2026-05-17 PM tras feedback usuario). Política original §117 pedía `managerApprovalCode + managerApprovalReason` para rate/pax post-checkin; revertida porque manager ocupado = cuello de botella operativo. Política actual (Cloudbeds/Mews pattern):
   - `ChangeConfirmDialog` se sigue mostrando con diff side-by-side + razón (textarea, opcional pero recomendado).
   - Backend acepta el cambio sin `managerApprovalCode` requirido; `reason` queda en `GuestStayLog.metadata`.
   - Saldo resultante negativo (= crédito a favor del huésped) se muestra con `−USD X` y línea explicativa: "Queda USD X a favor del huésped (crédito devolvible al checkout)". Sin entity `GuestCredit` automática (eso es v1.0.1 PAY-CORE §86).
   - Backward-compat: el backend SIGUE aceptando `managerApprovalCode/Reason` si la UI los manda, no lanza error. La columna en audit log preserva el dato si se proveyó. UI ya no los pide.
   - Tests: `RATE_CHANGE_REQUIRES_APPROVAL` ya no se lanza. Spec reemplazado por "rate change post-checkin sin approval — permitido".

120. **Reglas de discoverability para inline-edit (Apple HIG):**
    - Lapicito siempre visible al 40% opacity en estado idle, 100% en hover (signifier perceptible sin requerir hover). El pattern "pencil oculto hasta hover" mata descubrimiento.
    - Para tabs con múltiples campos editables, preferir **bulk-edit mode** con header sticky "✎ Editar" → `[Cancelar] [Guardar cambios]`: 1 PATCH consolidado vs N round-trips, 1 audit log entry agrupado, header siempre arriba (no scroll para encontrar Save). Pattern Mews/Cloudbeds para guest profile.
    - Para acciones con consecuencia significativa (rate, paxCount post-checkin), abrir `ChangeConfirmDialog` con diff side-by-side + razón + approval modal. Pattern Apple HIG "destructive confirmation".

> **Por qué documentamos esto**: este sprint EDIT-RESERVATION reinventó tres veces lo mismo. El primer modal custom (`useModalDismiss` + div + createPortal) funcionaba bien para dialogs hermanos a nivel root. El segundo fallaba dentro del Sheet porque ignoró las 3 capas internas de Radix. Cada parche revelaba la siguiente capa hasta refactorizar a Radix Dialog primitives. **La lección no es "Radix es complicado" — es "no reinventar el contenedor cuando Radix ya provee uno con nesting nativo".** Si la próxima vez ves un modal dentro de un Sheet, primer reflejo: importar `Dialog as DialogPrimitive from 'radix-ui'`.

### Channex inbound — Sprint CHANNEX-INBOUND (Days 1-7, 2026-05-22)

129. **D-CHX1 — Webhook real-time es el mecanismo PRIMARIO, polling es safety net.** Endpoint `POST /api/webhooks/channex` responde 200 en <100ms y dispara `setImmediate(() => puller.processOutboxRow(outboxId))` fire-and-forget. Latencia P95 end-to-end ~2-3s (Day 7 latency boost). `ChannexOutboxScheduler` cron cada 30s y `ChannexFeedScheduler` cron cada 15min UTC son recovery — NO el primary path. (Doc drift fix 2026-05-29: §134 originalmente decía "30min"; el cron real es `*/15 * * * *` per audit-A6 docs oficiales Channex 2024 que recomiendan 15-20min.) Polling sin webhook fue explícitamente descartado por la doc oficial Channex y desalineado con cert Stage 4.

130. **D-CHX2 — Idempotencia estricta por `GuestStay.channexBookingId @unique` + dedup en `ChannexOutbox`.** Channex puede emitir webhooks duplicados; `acceptDelivery` rechaza encolar si ya existe outbox PENDING/IN_PROGRESS/SUCCEEDED para la misma `revisionId`. El log `ChannexWebhookLog` SÍ se escribe siempre (forense). Sin esto, retries de Channex crean stays fantasma.

131. **D-CHX3 — Custom-header bearer token, NO HMAC.** Investigación oficial (Day 2) confirmó que Channex no firma payloads con HMAC. Su modelo es: webhook se configura con `headers` object donde NOSOTROS ponemos `Authorization: Bearer <token>` propio. `ChannexAuthGuard` valida con `crypto.timingSafeEqual` contra `PropertySettings.channexWebhookSecret`. Fail-open onboarding cuando secret no configurado (sandbox); cierra automáticamente al setear el secret via Zenix Activate. La auth REAL inbound ocurre cuando NOSOTROS llamamos `getBookingRevision` con `user-api-key`.

132. **D-CHX4 — `ChannexWebhookLog` + `ChannexOutbox` append-only fiscal-grade.** Toda delivery deja entry inmutable, incluso si auth falla. Cubre Visa CRR §5.9.2 chargeback evidence + auditabilidad cross-OTA. Ambas tablas se escriben en MISMA transacción Postgres (`$transaction`) — pattern transactional outbox. Imposible perder un webhook ni duplicar trabajo si crashea entre writes.

133. **D-CHX5 — Conflict resolution: persistir + revisar humano, NUNCA overwrite silente.** Si `booking_new` solapa con stay existente (case C de overbooking race), creamos GuestStay con `channexConflict=true` + placeholder room. Frontend `/channex/conflicts` (SUPERVISOR-only) muestra ranking smart de alternativas (`ChannexRoomSuggesterService` algoritmo weighted: 30 mismo channexRoomTypeId + 25 mismo RoomType + 15 categoría + 15 capacity + 10 floor + 5 status AVAILABLE). 4 acciones: MOVE_ROOM (con suggestion preseleccionada) / CANCEL_LOCAL / CANCEL_AT_OTA (propaga vía Channex CRS PUT status=cancelled) / MARK_REVIEWED. Pattern Mews "Space alternatives" + Cloudbeds "Room move suggestions".

134. **D-CHX6 — `booking_revisions/feed` reconciliation cron cada 15min UTC.** Single call que cubre TODAS las properties accesibles por api-key (sin `filter[property_id]`) per recomendación oficial Channex 2024-12. Paginación canónica: short page (revisions.length < PAGE_SIZE) O totalSeen >= meta.total → break. Cada revision se enqueue vía `ChannexInboundService.acceptDelivery` con `eventType='feed_recovery'` — reutiliza la pipeline canónica del webhook. Dedup automático. Defensa contra webhook delivery failures + Channex `non_acked_booking` event después de 30 min. (Doc drift fix 2026-05-29: originalmente decía "30min"; el cron real desde audit-A6 es `*/15 * * * *` per recomendación oficial Channex 2024 de 15-20min — más frecuente reduce ventana de drift entre webhook miss y reconciliación.)

135. **D-CHX7 — `BookingCancelHandler` bridge al sprint CANCEL-ARCHIVE.** OTA cancellations escriben las MISMAS columnas que un cancel manual (`cancelInitiator='OTA'`, `cancelledFromChannel='CHANNEX_WEBHOOK'`, `cancelMetadata` con channexRevisionId+otaName) + cascade journey/segments + audit `GuestStayLog event=CANCELLED actorType=SYSTEM` + room status AVAILABLE si era la única active. `requiresFiscalReview=true` cuando `amountPaid > 0` (seed para v1.0.2 CFDI E emission). Decisión matrix de 5 ramas: not_found idempotent / already_cancelled idempotent / checked-in manual_review / checked-out review / no-show review / ARRIVING soft-cancel. NO reutilizamos `GuestStaysService.cancelStay` porque lee tenant del JWT (webhook es Public).

136. **D-CHX8 — `BookingModifyHandler` con guards multi-estado: post-checkin = SAFE FIELDS ONLY.** Decisión matrix de 6 ramas: not_found → fall-through a `BookingNewHandler` (out-of-order modify-before-new) / stale via inserted_at / cancelled / no-show / checked-out terminales / **checked-in: solo updateamos guestName/email/phone/notes/nationality + channexLastSyncAt** (date/room/pricing change → review notif, NO autoaplicar) / **ARRIVING + date conflict → channexConflict=true** + review notif / ARRIVING happy → full update **EXCEPTO payment fields si `amountPaid > 0`** (§28 USALI append-only). Alineado con CRS rule oficial "only changes are saved without reverting PMS modifications".

137. **D-CHX9 — Room mapping vía `Room.channexRoomTypeId`; sin match → UNASSIGNED conflict.** `BookingNewHandler` busca rooms con `channexRoomTypeId == revision.rooms[0].room_type_id`. Si N rooms del mismo tipo, itera AvailabilityService.check hasta encontrar libre. Si TODOS ocupados → conflict AVAILABILITY_OVERLAP con placeholder room. Si ningún room mapeado → conflict NO_ROOM_TYPE_MATCH. Si `rate_plan_id` null → conflict UNMAPPED_RATE_PLAN. Las 4 reasons + PROPERTY_NOT_FOUND alimentan el `ChannexNotifService.raiseConflict` → AppNotification SUPERVISOR + body localizado per reason ("Llegó una reserva de Booking.com para habitación ya ocupada...").

138. **D-CHX10 — Outbox + scheduler con `FOR UPDATE SKIP LOCKED` permite multi-worker sin race.** Tabla `ChannexOutbox` con status enum PENDING/IN_PROGRESS/SUCCEEDED/FAILED/DEAD_LETTER. `ChannexRevisionPullerService.processOutboxRow` marca IN_PROGRESS antes del pull. **Ack ONLY after successful save** — si el handler throws, NO ack call → cron retry vía backoff exponencial 2^attempts seconds (max 5 attempts → DEAD_LETTER). Errores terminales 401/403/404 → DEAD_LETTER inmediato (api-key issue o revision purged). Esta regla es la #1 criterio de cert Stage 4. Spec dedicado verifica el contrato.

> **Sprint CHANNEX-INBOUND — implementación cerrada 2026-05-22 con 94/94 unit tests verdes + 3/3 sandbox integration vs `staging.channex.io`. Roadmap post-cert (improvements v1.0.1+) documentado en [docs/sprints/CHANNEX-INBOUND-post-cert-roadmap.md](docs/sprints/CHANNEX-INBOUND-post-cert-roadmap.md): trigger directo ya activo (Day 7), pendientes last-room sync push + Postgres advisory locks + outbound retry queue + health monitor + smart suggestions v2 (bed-level + multi-property).**

### Channex outbound — Sprint CHANNEX-OUTBOUND-CERT (Days 1-7, 2026-05-22)

139. **D-CHX-OUT-1 — Outbox queue obligatoria para todo outbound.** Ningún `gateway.pushAvailability/pushRestrictions` se llama directamente desde save handlers. **TODO** pasa por `ChannexOutboundBuilderService` event listener → `ChannexOutboundQueue` table → `ChannexOutboundWorker`. Excepción única: `FullSyncOrchestrator` puede llamar `builder.enqueue()` direct porque ya respeta su propia idempotencia + window enforcement. Cert AP-2.2 mitigado estructuralmente. Grep test en CI verifica regresión.

140. **D-CHX-OUT-2 — Gateway methods toman arrays, no escalares.** `pushAvailability(entries: ChannexAvailabilityEntry[])` y `pushRestrictions(entries: ChannexRestrictionEntry[])` enforced en TypeScript types. NO existe método singular `pushRate(date, value)`. AP-4 (per-date loops) imposible por contrato del gateway.

141. **D-CHX-OUT-3 — Domain events vía EventEmitter2, no polling.** AvailabilityService + futuro RatesService emiten `CHANNEX_AVAILABILITY_CHANGED` / `CHANNEX_RESTRICTION_UPDATED` constants post-save. Listener `OutboxBuilderService` traduce a outbox rows. NO query `WHERE updated_at > X` en cron. AP-2.1 evitado por arquitectura. Event constants en [channex-outbound-events.ts](apps/api/src/integrations/channex/outbound/channex-outbound-events.ts) — single source of truth importable sin dependencia de ChannexOutboundModule (Hexagonal).

142. **D-CHX-OUT-4 — Separación AVAILABILITY vs RATES_RESTRICTIONS estructural.** `ChannexOutboundKind` enum con 2 valores. Worker drena cada kind como HTTP message separado. Cero código que pueda mezclarlos. Cumple recomendación oficial Channex "send availability and rates separately" + AP-2.8.

143. **D-CHX-OUT-5 — TokenBucket sliding window 10 tokens/60s per (property, kind).** Memory-resident v1.0.0; Redis-backed v1.0.5 cuando escalemos multi-pod. Worker chequea bucket antes de Gateway call: si exhausted → row DEFERRED (no attempt++, no es failure). 429 de Channex es señal de bucket mal calibrado → log error. Cumple cert Test 12 + AP-2.3.

144. **D-CHX-OUT-6 — Retry policy: 429 Retry-After header / 5xx exp backoff / max 5 → DEAD_LETTER.** 429 → `max(60s, Retry-After)` (Channex docs minimum 1 minute pause). 5xx/network → `2^attempts` seconds. Max 5 attempts → DEAD_LETTER + `ChannexOutboundNotifService.raiseDeadLetter` → AppNotification ACTION_REQUIRED HIGH al SUPERVISOR con `expiresAt:null` (compliance permanente §101). Cert AP-2.3 visible vs silent drop.

145. **D-CHX-OUT-7 — Full sync 1×/24h off-peak hard-coded.** `FullSyncOrchestrator` con 2 guards estructurales: (a) `now - channexLastFullSyncAt >= 23h` (idempotencia, MIN_INTERVAL_MS const); (b) Local hour `∈ [channexFullSyncWindowStart, channexFullSyncWindowEnd)` default `[3, 5)`. Manual trigger admin endpoint salta guards PERO marca lastSync (cron no re-dispara). Cert AP-3 (timer-based full-sync) imposible — verificado por grep test en CI.

146. **D-CHX-OUT-8 — Mappings en DB, jamás en código.** `Room.channexRoomTypeId`, `PropertySettings.channexPropertyId`, futuro `RatePlan.channexRatePlanId`. Pre-commit grep test verifica que ningún archivo non-test en `src/` contiene UUIDs Channex hardcoded (AP-5). Test exposed via `channex.cert-tests.integration.spec.ts`.

147. **D-CHX-OUT-9 — Integration tests llaman codepath productivo, NO Gateway direct.** Suite `channex.cert-tests.integration.spec.ts` cubre los 14 escenarios cert via grep + sandbox + production codepath verification. Tests 9-13 verde hoy; Tests 2-8 (rates) marcados `describe.skip` con razón documentada (pending sprint RATES-METRICS-COMPSET-CORE → RatePlan model + RatesService). Cert AP-1 + AP-6 mitigados.

148. **D-CHX-OUT-10 — Admin observability page `/settings/channex` para SUPERVISOR + Stage 4 reviewer.** Snapshot tiempo real: outbound + inbound queue counts por status (últimas 24h), token bucket capacity per kind con progress bars, webhook last received + count 24h, feed scheduler last run, full sync state + nextEligibleAt, DEAD_LETTER lists con error completo, conflicts open count + link a `/channex/conflicts`. Manual full sync trigger button. Auto-refresh 30s. Es la evidencia visual que Channex Stage 4 reviewer pide durante live screenshare.

> **Sprint CHANNEX-OUTBOUND-CERT — implementación cerrada 2026-05-22 con 161/161 unit tests verde + 11/11 cert integration tests + 3/3 sandbox HTTP 200 vs `staging.channex.io`. Cert Tests cubiertos: 1, 9, 10, 11, 12, 13 (6/14). Tests 2-8 (rates) pending RATES-METRICS-COMPSET-CORE sprint (~5-6 sem); contrato handoff documentado en [docs/sprints/CHANNEX-OUTBOUND-CERT-handoff-to-rates.md](docs/sprints/CHANNEX-OUTBOUND-CERT-handoff-to-rates.md). Test 14 declarations formales en [docs/ops/channex-test-14-declarations.md](docs/ops/channex-test-14-declarations.md). Stage 4 walkthrough script en [docs/ops/channex-cert-stage4-walkthrough.md](docs/ops/channex-cert-stage4-walkthrough.md). Los 14 anti-patrones oficiales mitigados estructuralmente — verificados via grep tests + cert integration spec.**

### Channex UX cohesion — Sprint CHANNEX-UX-E2-E3 (propuesta aprobada 2026-05-23, implementación pendiente)

> Decisiones de diseño aprobadas por owner. Plan técnico completo en [docs/sprints/CHANNEX-UX-E2-E3-plan.md](docs/sprints/CHANNEX-UX-E2-E3-plan.md). Estimación 9-13 días-dev (1 dev secuencial). Estos §149-§158 se mueven a "Non-Negotiable" formal al cerrar implementación; mientras tanto sirven como guía vinculante de UX para el sprint.

149. **D-CHX-UX-E1 — Extensión OTA dispara push CRS en tiempo real con copy explícito.** `ExtendConfirmDialog` muestra advisory sky-blue (no amber genérico) "Al confirmar, Zenix sincronizará automáticamente con {otaName} vía Channex en tiempo real. Verás un chip de confirmación una vez que el canal acuse recibo." Drag-extend handle ya existe en `BookingBlock.tsx`. Backend ya emite `CHANNEX_AVAILABILITY_CHANGED` post-save → outbox → worker. Lección competencia: el copy "próximamente sincronizará" generaba dudas — Channex YA es real-time, el copy debe reflejarlo.

150. **D-CHX-UX-E2.1 — Cancel manual OTA dispara push CRS automático.** Nunca botón "Sync to channels" manual (anti-pattern Little Hotelier, footgun #1 quejado en Capterra 2024-2025). Al confirmar `CancelReservationDialog` con stay que tiene `channexBookingId`, backend emite `CHANNEX_BOOKING_CANCEL_REQUESTED` evento + nuevo outbox kind `BOOKING_CANCEL` + worker dispatch `gateway.cancelBookingAtChannex`. Sin acción extra del recepcionista.

151. **D-CHX-UX-E2.2 — Chip "✓ Sincronizado en {otaName} hace Xs" en BookingDetailSheet.** Aprendizaje cross-PMS: Mews silent fail + ausencia feedback = queja #1. Zenix expone `channexLastSyncAt` como chip con timestamp relativo + canal. Estados: `⏳ Sincronizando…` (T+0s) → `✓ Cancelado en {otaName} hace Xs` (T+5-15s post-ack) → `⚠️ No se pudo notificar a {otaName}` + botones `[Reintentar]` `[Marcar manualmente]` (T+60s+ DEAD_LETTER). Quote G2 Cloudbeds: "Finally I know it actually went through."

152. **D-CHX-UX-E2.3 — Airbnb requiere portal manual; warning explícito + link directo.** Regla regulatoria Airbnb desde 2022 prohíbe cancel programático desde PMS. Cuando `stay.channexOtaName === 'airbnb'`, `CancelReservationDialog` muestra warning sección amber con botón externo `[Abrir Airbnb extranet ↗]` + instrucción "Cancela primero allá; Zenix detectará el webhook automáticamente". Cloudbeds pattern; Mews intenta silent + falla. Forcing function checkbox "Confirmo que entiendo..." obligatorio antes de habilitar el botón confirmar (Apple HIG destructive).

153. **D-CHX-UX-E3.1 — `ReservationGroup` es entidad de primera clase para multi-room OTA bookings.** Modelo Prisma con `channexBookingId @unique` + `primaryGuestName/Email/Phone` + `groupSize` + `roomCount` + `groupCheckIn/Out` + `cancelledAt`. `GuestStay.reservationGroupId` FK + `groupRoomIndex` (1-based). Hook `masterFolioId` comentado para v1.0.1 PAY-CORE. Sin esto, paridad inferior a Cloudbeds/Mews y hostal multi-cama queda como N reservas sin folio agregado. Resuelve audit cert C1 (MULTI_ROOM_BOOKING conflict rechazo silente).

154. **D-CHX-UX-E3.2 — Auto-detección sin wizard.** `BookingNewHandler` cuando `revision.rooms.length > 1` crea group + N children en single `$transaction`. Cero acción del recepcionista. Anti-pattern explícito: Opera Block setup manual (15 min para 3 rooms — "como matar mosquito con bazooka" HotelTechReport). Si alguna room del array no encuentra match `channexRoomTypeId`, group se crea + esa room queda en conflict con `reservationGroupId` en metadata (navegación cross-link).

155. **D-CHX-UX-E3.3 — Bracket visual en calendar entre blocks del mismo grupo.** Cuando 2+ `BookingBlock` comparten `reservationGroupId`, render conector vertical SVG sutil emerald 30% opacity entre ellos (z-index entre bloques y tooltip). Mini-badge "Hab X/Y" en esquina superior derecha del block. Hover en cualquiera resalta todos los siblings con ring 1px emerald 40%. Cloudbeds pattern, mejor-evaluado del comparativo: "Visually obvious that they're together" G2 review.

156. **D-CHX-UX-E3.4 — Check-in adaptativo con 3 modos según contexto.** `GroupCheckinDialog` detecta automáticamente: (**Modo A** individual contextual) click "Check-in" en una room del grupo; modal pregunta "¿Las demás llegan juntas?" con radio. (**Modo B** bulk con names per room, hoteles) lista vertical con un input nombre por room (útil para grupos corporativos donde cada hab = persona distinta). (**Modo C** hostal per-bed) detectado por `propertyType === 'HOSTAL'`; captura nombre por cama (6 inputs si 6 camas) + foto documento opcional + checkbox "Verifiqué N documentos". Cubre gap real en TODOS los competidores (solo Cloudbeds tiene per-bed parcial).

157. **D-CHX-UX-E3.5 — Cancel parcial = MODIFY a Channex, no CANCEL.** Cuando recepción cancela 1 de N rooms del grupo, `GuestStaysService.cancelStay` con `stay.reservationGroupId` distingue: si NO es la última active del grupo → emit `CHANNEX_BOOKING_MODIFY_REQUESTED` (worker push `PUT /bookings/:id` con array de rooms restantes). Si ES la última active → emit `BOOKING_CANCEL_REQUESTED` + `group.cancelledAt = now()`. `PartialCancelDialog` muestra preview explícito "Después: ✓ Hab 101 sigue activa, ✗ Hab 102 cancelada" + mensaje "En {otaName} este cambio se reflejará como modificación, no cancelación total". Header `GroupDetailSheet` siempre muestra "X activas / Y totales" (anti-pattern Cloudbeds "3 of 3" tras cancelar).

158. **D-CHX-UX-E3.6 — Notif SUPERVISOR al recibir grupo nuevo con priority adaptativa.** `ChannexNotifService.raiseGroupBookingReceived(group)` nueva notif tipo `GROUP_BOOKING_RECEIVED`. Priority MEDIUM si todas las rooms auto-asignaron sin conflict (informativa, mobile push + badge bell). Priority HIGH si alguna quedó en conflict (acción requerida — recepción asigna manualmente, mobile push elevated). Body localizado: "Grupo de N habitaciones — {primaryGuestName} ({groupSize} personas) · Llega {groupCheckIn} · {otaName}". CTA "Ver grupo" → `/reservation-groups/:id`.

> **Sprint CHANNEX-UX-E2-E3 — propuesta UX aprobada 2026-05-23; implementación pendiente. Diferenciador comercial documentado: ningún PMS de los 6 analizados (Mews, Cloudbeds, Opera, Little Hotelier, RoomRaccoon, Sirvoy) cubre simultáneamente push CRS real-time con chip post-push + cancel parcial con copy explícito + check-in 3-modos incluyendo hostal per-bed + auto-detección sin wizard. Análisis comparativo completo en plan §6.**

### Nova architecture — Sprint NOVA-CHANNEX-COMMAND-CENTER (aprobada 2026-05-23)

> Decisiones fundacionales de la interfaz consultor/admin Zenix. Plan técnico en [docs/sprints/CHANNEX-COMMAND-CENTER-plan.md](docs/sprints/CHANNEX-COMMAND-CENTER-plan.md) + ADR permanente en [docs/architecture/NOVA-architecture.md](docs/architecture/NOVA-architecture.md). Estos §159-§175 son de cumplimiento obligatorio en todo código nuevo de Nova.

159. **D-NOVA-1 — Nova vive en subdomain dedicado `nova.zenix.com`.** Phase 1 (v1.0.0): `/nova/*` rutas dentro `apps/web` con shell separado (sidebar + topbar Nova, no el Sidebar PMS). Phase 2 (v1.0.5): extracción a `apps/partner` con build separado + dominio propio `nova.zenix.com`. Phase 3 (v1.2): Partner Portal marketplace público. Cliente sigue siempre en `app.zenix.com`. Razón: pattern SAP (`*.s4hana.cloud.sap` vs partner portal) / Salesforce (`*.lightning.force.com` vs Partner Community) — separación de dominios da compliance separation (cliente NUNCA ve botones admin), camino natural a marketplace v1.2, y path de extracción físico cuando volumen lo amerite. Referencia [docs/architecture/NOVA-architecture.md §6](docs/architecture/NOVA-architecture.md).

160. **D-NOVA-2 — Hierarchy 5-tier no-negociable.** PLATFORM_ADMIN (ZaharDev staff) > PARTNER_ADMIN (firm leadership) > PARTNER_MEMBER (consultant/support engineer dentro de un firm) > ORG_OWNER (customer admin) > ORG_STAFF (customer staff — SUPERVISOR/RECEPTIONIST/HOUSEKEEPER scoped a Property). Cada tier con scope explícito documentado en RBAC matrix de [docs/architecture/NOVA-architecture.md §4](docs/architecture/NOVA-architecture.md). Backward-compat: `SystemRole` existente (SUPERVISOR/RECEPTIONIST/HOUSEKEEPER) sigue siendo el rol intra-property dentro del nivel ORG_STAFF.

161. **D-NOVA-3 — ZaharDev modelado como Partner con `isInternal=true`.** Único Partner donde members pueden tener rol PLATFORM_ADMIN. Constraint Postgres (`partner_members` CHECK: `actorTier='PLATFORM_ADMIN'` requiere `partner.isInternal=true`) + audit a nivel app. Razón: tratar a ZaharDev como caso especial del modelo Partner mantiene la matriz RBAC homogénea — no necesitamos dos modelos (un "internal staff" + un "partner firm"); ZaharDev es simplemente el Partner row con flag interno. Ver [docs/architecture/NOVA-architecture.md §3.1](docs/architecture/NOVA-architecture.md).

162. **D-NOVA-4 — PartnerTier enum 4 valores AUTHORIZED/SILVER/GOLD/PLATINUM.** Nombres alineados literalmente con SAP PartnerEdge (Authorized → Silver → Gold → Platinum). NUNCA renombrar a "Bronze/Plus/Premier/Elite" o equivalentes — comparabilidad con industry partner programs (SAP/Cisco/Salesforce/Microsoft) facilita: (a) onboarding de partners que vienen de esos ecosistemas, (b) marketing/sales pitch al partner ("ya eres Gold en SAP — califica directo a Gold en Zenix"), (c) tier benefits matrix replicable. Ver [docs/vision/09-partner-network.md §3](docs/vision/09-partner-network.md).

163. **D-NOVA-5 — PartnerMemberRole enum 8 valores fijos.** PARTNER_ADMIN / LEAD_CONSULTANT / SOLUTION_CONSULTANT / SUPPORT_L1 / SUPPORT_L2 / SUPPORT_L3 / SALES_REP / TRAINEE. Granularidad alineada con SAP S/4HANA Implementation Roles + IBM Business Partner Program + Cisco Partner Program. Razón: los 3 tiers de SUPPORT (L1/L2/L3) reflejan la realidad del partner pattern industry-wide; SALES_REP separado del consultant lifecycle porque su scope es comercial pre-venta no implementation; TRAINEE es estado provisional con scope limitado (solo lectura + shadow mode). Ver [docs/vision/09-partner-network.md §4](docs/vision/09-partner-network.md).

164. **D-NOVA-6 — ConsultantAssignment via PartnerClientAssignment (firm↔org N:M) + PartnerMemberAssignment (member↔engagement N:M dentro del firm).** Cliente puede tener UN partner principal + sub-partners opcionales para white-label engagements; sólo tier PLATINUM puede tener sub-partners (constraint app-level). Razón: separar firm↔org de member↔engagement permite que un firm rote consultants asignados a un cliente sin tocar la relación comercial firm↔cliente (ej: PARTNER_MEMBER X deja la empresa, PARTNER_MEMBER Y asume — assignment se transfiere sin perder histórico). Pattern SAP "Engagement Manager rotation".

165. **D-NOVA-7 — AuditLog universal append-only DB-level.** Trigger Postgres bloquea UPDATE/DELETE en la tabla `audit_logs`. Schema: `actorRealId + actorRealRole + onBehalfOfId + onBehalfOfRole + action + target + payload + channexResponse + status + reason + retentionPolicy + createdAt`. `reason` REQUIRED (CHECK constraint) si `onBehalfOfId != null` — SAP impersonation pattern. Reemplaza al `ChannexAuditLog` específico del plan original (la tabla universal cubre todos los actos administrativos Nova, no sólo Channex). Cualquier acto Tier A o impersonation pasa por aquí. Ver [docs/architecture/NOVA-architecture.md §3.5](docs/architecture/NOVA-architecture.md).

166. **D-NOVA-8 — Transparency notif obligatoria al cliente.** Cuando consultor (cualquier tier ≠ ORG_*) accede a workspace cliente o ejecuta acción `onBehalfOf`, el sistema emite (a) email al ORG_OWNER con resumen de la sesión + reason + timestamp, (b) in-app notification al `AppNotification` del ORG_OWNER. Compliance GDPR Art. 13 "right to know who processed my data" + LFPDPPP Art. 16 + ISO 27001 A.9.2.5. NUNCA permitir acceso silente — exponer transparency es no-negociable.

167. **D-NOVA-9 — AuditLog retention permanente, NUNCA hard-delete.** Hot table primeros 365 días (queries fast). Cold storage partition >365 días (movido por scheduler en v1.0.3 REPORTS-CORE — partition pruning Postgres native). Compliance: Visa CRR §5.9.2 (chargeback ventana 120d + filing requirements) + CFDI Art. 30 CFF (conservación 5 años) + GDPR Art. 17.3.b (excepción retention para legal obligations). Anonimización PII permitida en hot/cold (reemplazar `payload.guestName` con tag), pero la entry queda.

168. **D-NOVA-10 — Tenant switcher híbrido SuccessFactors-style.** Landing `/nova/clientes` lista filtrada por tier: PLATFORM_ADMIN ve TODOS los Organizations + Partners, PARTNER_ADMIN ve clientes del firm, PARTNER_MEMBER ve sólo sus PartnerMemberAssignments. Una vez seleccionado un workspace cliente: chip persistente top-bar con `[Nombre cliente]` + dropdown `Cambiar cliente` + `Salir de impersonation` (si aplica). Razón: SuccessFactors pattern resuelve el dolor #1 de consultor SaaS — el switch costoso entre clientes (logout/login en cada uno). Ver [docs/architecture/NOVA-architecture.md §5.2](docs/architecture/NOVA-architecture.md).

169. **D-NOVA-11 — JWT extendido con `actorTier` + `partnerMemberId` + `assignedOrgIds[]`.** Backward-compat con código existente: si `actorTier == null` en el JWT (sesiones legacy pre-Nova) se asume PROPERTY scope y se validate session vs `UserPropertyRole` como hasta ahora. `assignedOrgIds[]` inline en JWT max 20 entradas; cuando un PARTNER_MEMBER excede 20 assignments → fallback Redis cache key `partner_member:{id}:assigned_orgs` con TTL 5min (re-query DB on cache miss). Ver [docs/architecture/NOVA-architecture.md §3.6](docs/architecture/NOVA-architecture.md).

170. **D-NOVA-12 — TenantContextService.getOrganizationId() requiere `X-Acting-Organization-Id` header para PARTNER_MEMBER.** Middleware (`NovaActingOrgGuard`) valida que `orgId ∈ actor.assignedOrgIds`. Sin header o orgId fuera del array → 403 Forbidden. Razón: un PARTNER_MEMBER puede estar asignado a 5 clientes simultáneamente — su JWT solo NO determina qué cliente está operando ahora. El header lo declara explícitamente per-request. Pattern análogo a Salesforce `X-PrettyPrint` + multi-org context.

171. **D-NOVA-13 — Wizard Zenix Activate vive en `/nova/wizard` (Phase 1) o `apps/partner/wizard` (Phase 2).** 8 steps con forcing functions per step documentados en [docs/vision/13-consultant-setup-wizard.md §2.2](docs/vision/13-consultant-setup-wizard.md): Step 1 Customer Account → Step 2 Brand (opcional, skipeable) → Step 3 LegalEntity (PAC + FX adapter selection) → Step 4 Properties (con Channex ping pre-save) → Step 5 Inventory (RoomType + RatePlan mapping) → Step 6 Staff (ORG_OWNER created last) → Step 7 Integrations (4 health-checks) → Step 8 Activación (Activation Report PDF + Organization.activatedAt). NUNCA permitir skip de un step que tenga forcing function pendiente.

172. **D-NOVA-14 — Solo PLATFORM_ADMIN o PartnerMember con scope=FULL pueden ejecutar wizard.** Cliente NUNCA self-onboarding desde `app.zenix.com` — el endpoint público no existe. La fila `Organization` recién creada queda en `status='ONBOARDING'` hasta Step 8 Activación (Activation Report PDF generado + `Organization.activatedAt` set). Hasta entonces el workspace `app.zenix.com/org/{id}` retorna 404 al ORG_OWNER (las credenciales aún no se han emitido — ver §174). Razón: garantiza que cada cliente pasa por las 4 health-checks obligatorias (§173) y nunca arranca en estado inválido.

173. **D-NOVA-15 — Step 7 Integrations valida 4 health-checks obligatorios pass.** (a) **Channex** ping `GET /properties/:id` → 200 + property name match; (b) **Stripe** test charge $1 USD + immediate refund → 200 + `paymentIntent.status='succeeded'`; (c) **PAC sandbox** test stamp con XML mock → 200 + `cfdi.status='STAMPED'`; (d) **SMTP** test email a `noreply@zenix.app` + read receipt → 200 + delivery confirmation. Cualquier fail bloquea avance a Step 8. Re-test botón disponible. Razón: detectar mapping rotos / credenciales incorrectas ANTES de activar el cliente productivo — el caso más caro de soportar es "el cliente arrancó pero su PAC fallaba desde día 1".

174. **D-NOVA-16 — Credenciales del primer ORG_OWNER se emiten SOLO al finalizar Step 8.** Wizard genera un setup link único (single-use JWT, expiración 72h) y envía email a `OrgOwner.email` con: (a) link de activación + setup password, (b) instrucción de 2FA mandatory en first login, (c) password reset forced on first login (Cognito-style). NUNCA antes — un PARTNER_MEMBER puede armar la cuenta en 3 días distintos sin que el cliente reciba acceso prematuro a un estado roto. Pattern SAP Activate "Realize Phase Sign-off".

175. **D-NOVA-17 — Impersonation banner persistente.** Cuando un PARTNER_MEMBER opera `onBehalfOf` un ORG_OWNER, el shell renderiza stripe amber top con texto exacto: `"Actuando como [Nombre cliente] · razón: [reason] · finalizar [link]"`. El banner es `position: sticky; top: 0; z-index: 50` por encima de todo, incluyendo modales. Sin esto, consultor olvida que está impersonating + escribe acciones como sí mismo + cliente recibe transparency notif con `actorRealId` correcto pero el consultor genuinamente creyó que estaba en su propia sesión. UX-as-safety: el banner es el guard humano contra impersonation drift. Ver [docs/architecture/NOVA-architecture.md §7](docs/architecture/NOVA-architecture.md).

### Wizard Zenix Activate — Sprint NOVA-CHANNEX-COMMAND-CENTER (cerrado 2026-05-25)

> Decisiones implementadas Days 14-20. Frontend wizard 8 steps + backend transaccional + activation flow end-to-end + PAC adapter Strategy + HTML Activation Report. 160/160 Nova tests verdes al cierre.

176. **D-NOVA-18 — Wizard durable cross-session con Zustand persist.** Wizard state vive en `localStorage` key `nova_wizard` (8 steps + properties array + completedSteps Set). Consultor puede cerrar el browser a mitad del wizard, salir, volver mañana, y retomar exactamente donde quedó. Pattern SAP Activate "Realize Phase" — wizard durable, no transactional. Excepción: health-check runtime state (Step 7) NO persiste — se re-ejecutan cada vez que abres el step porque los external services pueden haber cambiado entre sesiones. Steps navegables sin avanzar (el consultor puede saltar atrás libremente a corregir). Footer fijo en flex-shrink-0 (no sticky-within-scroll) para evitar que "se suba" cuando el contenido del step es corto.

177. **D-NOVA-19 — Catálogo LATAM 60 ciudades curado + auto-timezone IANA.** `apps/web/src/nova/data/latam-cities.ts` con ~60 cities top LATAM tourist (México 26, Colombia 7, Costa Rica 6, Perú 6, Argentina 6, Guatemala/Panamá/El Salvador/Honduras 9). Cada CityRow tiene `id` estable (`mx_tulum`, `co_cartagena`...), `name` display, `region`, `countryCode`, `lat`, `lng`, `timezone` IANA, `tags`. CityPicker autocomplete con keyboard nav. Out-of-catalog free text persiste con `cityId=null + cityFreeText` para v1.0.4 reconciliation con Google Places. Auto-set timezone cuando city del catálogo es elegida (e.g. Tulum → `America/Cancun`). Diferenciador analytics consistency vs competidores (Cloudbeds/Mews usan free text → "Tulum" / "tulum" / "Tulúm" como ciudades distintas).

178. **D-NOVA-20 — Tax ID inline validation 4 países LATAM.** RFC México (12-13 chars regex), NIT Colombia (8-10 dígitos + verificador), RUC Perú (11 dígitos exactos), cédula jurídica Costa Rica (10 dígitos). Feedback emerald al pasar formato, amber con hint específico per país si no. SAT/DIAN/SUNAT NO exponen API pública gratuita para validar contra padrón — la validación final ocurre al timbrar primer CFDI en Step 7 health-check del PAC. Tier 2 paid validation (Facturama verify-rfc $0.10/consulta) reservado para v1.0.x DLC opcional. Justificación: 95% casos hospedaje turístico aceptan RFC genérico XAXX010101000 — overhead de API validation no se justifica para piloto.

179. **D-NOVA-21 — Setup token single-use 72h con TOCTOU defense.** `User.setupTokenHash` (SHA256 del raw token, UNIQUE constraint, raw NUNCA persiste — solo el hash) + `setupTokenExpiresAt` (72h) + `setupTokenConsumedAt` (single-use marker). Flow: WizardActivate genera 32 bytes hex → hash en BD → raw en email link. Org Owner click `/setup/:rawToken` → server hashea + lookup → 404 (no match) / 410 (expired) / 410 (consumed) / ready. Submit password → `$transaction` con re-check defensivo dentro de tx (TOCTOU prevention: si otra request consumió el token entre GET y POST, el re-check rechaza con 410). bcrypt rounds=12. Post-activate NULLEAR setupTokenHash + expiresAt; consumedAt persiste como forensic trail. Auto-login JWT signed → cliente entra directo a /dashboard sin re-login.

180. **D-NOVA-22 — Health checks runtime: Channex/Stripe/SMTP REAL + PAC sandbox-shaped con override controlado.** (a) **Channex** ping vía `ChannexGateway.listProperties()` real — verifica api-key + property mapping. (b) **Stripe** vía `balance.retrieve()` (read-only, idempotente, NO genera ruido en dashboard del cliente vs charges reales). (c) **SMTP** vía Resend POST `api.resend.com/emails` con DKIM check. (d) **PAC** vía `MxFacturamaAdapter.healthCheck(credentials)` — GET `/api/Profile` real si credentials configuradas, warning sin credentials con copy "cliente puede activar sin PAC + contratarlo después en /nova/settings/legal-entities". **PAC override controlado**: el consultor puede aceptar el warning con checkbox explícito; los folios del cliente quedan con `requiresFiscalReview=true` hasta configurar PAC real. Pattern Cloudbeds/Mews — fail-soft que no bloquea piloto pero deja trail auditable.

181. **D-NOVA-23 — PAC adapter Strategy pattern (IPacAdapter + Registry).** Análogo a §89 IFiscalAdapter Strategy del docs/vision/14. Interface `IPacAdapter { metadata, healthCheck, stampInvoice }` — `stampInvoice` reservado para v1.0.2 CFDI-CORE. Registry `PacAdapterRegistry` con DI auto-discovery + `get`/`find`/`list`/`listByCountry`. Day 19 first batch: `MxFacturamaAdapter` (SANDBOX status, real wiring), `MxSwSapienAdapter` (STUB symmetry, real wiring v1.0.2). Agregar país = 1 archivo adapter + 1 línea registry constructor + 1 línea wizard.module.ts. Throw `NotFoundException` si typo en config — fail-fast. Documentación inline en cada adapter (sandbox URLs + auth pattern + endpoint utilizado para health check).

182. **D-NOVA-24 — Resend auto-email post-activate fail-soft.** Después de `$transaction` + AuditLog write, `WizardActivationService` invoca `ActivationEmailService.sendActivationEmail()` con HTML template emerald-branded (hero gradient + CTA "Activar mi cuenta →" + caja TTL 72h + Activation Report link + footer disclaimer "Zenix nunca te pedirá password por email"). Resend REST API directo (no SDK). Tags `kind=wizard-activation` + `org_slug` para facet en Resend dashboard. **Fail-soft 3-niveles**: (1) sin `RESEND_API_KEY` → log warn + return `{ sent: false, reason: 'no-key' }`; (2) Resend HTTP error → log warn + return `{ sent: false, reason: 'api-error' }`; (3) network throw → return `{ sent: false, reason: 'network' }`. **El setup link SIEMPRE va en response** incluso si email se envió OK — frontend muestra el card copy-able como respaldo, así si el cliente reporta "no me llegó", el consultor copia por WhatsApp/Slack en 5 segundos. Plain-text variant del HTML incluido para email clients sin HTML render.

183. **D-NOVA-25 — HTML Activation Report imprimible (no Puppeteer hasta SIGN-DLC).** `GET /v1/nova/wizard/activation-report/:organizationId` (NovaTiers) retorna HTML formatted con `Content-Type: text/html`. Hero emerald gradient + secciones Cliente / Brand / LegalEntity / Properties / Org Owner + firma row. `@media print` stylesheet + botón "Imprimir PDF" inline (`window.print()` nativo del browser). Pattern SAP Activate "Realize Phase Sign-off Report". **Decisión técnica documentada**: Puppeteer queda reservado para SIGN-DLC sprint (ADR-0001) donde firma digital + NOM-151 conservation requieren hash SHA-256 determinista del PDF. Para Activation Report, browser print nativo es suficiente y elimina 300MB de Chromium del server v1.0.0 piloto. Owner puede aprobar Puppeteer en v1.0.1+ si valida ROI con primer cliente productivo. Link al report se incluye en el welcome email del Org Owner como caja secundaria.

> **Sprint NOVA-CHANNEX-COMMAND-CENTER — implementación cerrada 2026-05-25 con 160/160 Nova tests verdes (138 foundation + 12 wizard-activation + 10 setup-service) + 22 commits + flow end-to-end funcional**. Stack final del wizard: 8 steps frontend (Zustand persist) + transactional backend ($transaction crea Org+Brand+LegalEntity+Properties+Owner+SetupToken+AuditLog en una sola tx) + 4 health-checks runtime (3 real + 1 sandbox-shaped) + Resend auto-email con HTML template + setup page con strength meter + auto-login JWT + HTML Activation Report. Diferenciadores comerciales documentados en [docs/zenix-sales-master.md](docs/zenix-sales-master.md) — 9 capacidades que ningún PMS LATAM (Cloudbeds/Mews/Opera/RoomRaccoon/Little Hotelier) tiene end-to-end. Pendientes v1.0.1+: User.setupToken activation page testing end-to-end browser, refactor Disclosure primitive para colapsar tips wizard (Progressive Disclosure NN/g 1995), PAC adapters CO/CR/PE wiring real cuando primer cliente fuera de MX lo solicite, Puppeteer PDF si owner valida ROI post-piloto.

### Discount codes consultor — Sprint BILLING-DISCOUNT-CODES (cerrado 2026-05-27)

> Decisiones implementadas Days 1-5. Resuelve riesgo UX BILLING-CORE Day 6: slider de descuento exponía el cap del partner tier durante setup con cliente presente. Pattern Salesforce CPQ + Stripe Promotion Codes — consultor pre-configura códigos privadamente, aplica durante wizard sin exponer cap.

184. **D-DC-1 — Discount codes son PRIVADOS por consultor (ownership).** Schema `ConsultorDiscountTemplate` con `consultorUserId` + `partnerId` FK; `listTemplates()` filtra por `consultorUserId === actor.userId`. Razón: cada consultor administra su propio set de códigos (favoritos, naming conventions). PARTNER_ADMIN puede ver todos los del firm vía endpoint separado (post v1.0.1). PLATFORM_ADMIN ve todos. NUNCA exponer códigos de otros consultores a un consultor sin permisos elevados — viola model SAP Permission Sets + LFPDPPP "minimo acceso necesario". UI `/nova/billing/codigos` solo lista los propios; CreateDiscountCodeDialog graba con `consultorUserId = JWT.sub`.

185. **D-DC-2 — Manual discount override collapsed by default para emergencias únicamente.** Wizard Step 7.5 `StepPlanDiscount.tsx` muestra 2 paths: (a) **primary** `DiscountSection` con 2-col grid de templates del consultor + applied state (cliente solo ve "Código aplicado: WELCOME10 · 10% off · 3 meses"); (b) **fallback** `ManualDiscountForm` collapsible con warning banner amber "Solo para emergencias — el cap de tu tier estará visible al cliente. Prefiere crear un código en /nova/billing/codigos". `discountTemplateId` setter limpia campos manuales. Razón: 95% casos el consultor llega al wizard con cliente y ya tiene templates pre-configurados; 5% casos edge (cliente VIP, negociación última hora) justifica path manual con warning explícito (NN/g Error Prevention H5).

186. **D-DC-3 — Cap validation al APPLY time, NO al CREATE time.** `DiscountCodeService.create()` permite cualquier `percentOff` 5-50; `DiscountCodeService.applyTemplate(templateId, subscriptionId, actor)` valida cap del partner tier en momento de aplicar: si `template.percentOff > partnerTierCap` → marca `Subscription.discountStatus = 'pending_approval'` y crea `AppNotification` ACTION_REQUIRED a PARTNER_ADMIN. Razón: tier del consultor puede cambiar entre create y apply (ascenso AUTHORIZED→SILVER); validar al create congelaría histórico de códigos viejos. Stripe Coupon se crea con el percentOff real; el approval bloquea propagación a Subscription hasta que PARTNER_ADMIN aprueba. Activación del Organization NO depende del approval — best-effort outside-tx (§182 D-NOVA-24 pattern).

187. **D-DC-4 — `applyTemplate` idempotente vía Stripe Promotion Code reutilizable.** El template tiene `stripeCouponId` (creado al CREATE) + `stripePromotionCode` (text código legible "WELCOME10"). Al `applyTemplate`, Subscription Stripe recibe `coupon: stripeCouponId` — operación idempotente por contract Stripe (mismo coupon en misma sub = no-op). Razón: si wizard activate falla post-Stripe sub creation pero pre-AuditLog write, re-intentar el wizard no genera doble descuento. `Subscription.discountApplied: boolean` + `Subscription.discountStatus: 'applied' | 'pending_approval' | null` exponen estado al frontend para mostrar chip "✓ Descuento aplicado".

188. **D-DC-5 — Códigos reutilizables con `usage_limit: unlimited` en Stripe Promotion Code.** Default al crear template: `usageLimit: null` (Stripe → no cap). Razón: consultor crea "WELCOME10" UNA VEZ y lo aplica a N clientes durante el año (pattern Stripe Coupon best practice 2024). UI futura v1.0.1 permitirá `maxRedemptions: number` per template para campañas finitas. Delete template archiva (`archivedAt: Date`) — Stripe Coupon queda activo (subscriptions existentes mantienen descuento), pero `listTemplates()` filtra `archivedAt: null` para que UI no lo muestre.

> **Sprint BILLING-DISCOUNT-CODES — implementación cerrada 2026-05-27 con 242/242 backend tests verdes (21 wizard-activation + 221 resto suite) + 5 commits sobre `feature/billing-discount-codes`**. Stack final: backend `DiscountCodeService` con applyTemplate wrapper + tests 4 escenarios (template gana sobre manual / cap exceeded → pending_approval / applyTemplate falla → no descuento + activate sigue / sin templateId + sin discount → sub sin descuento). Frontend `/nova/billing/codigos` CRUD page + landing `/nova/billing` con StatTiles placeholder + Nova sidebar entry "Billing". Wizard Step 7.5 refactorizado con DiscountSection primary + ManualDiscountForm collapsible. Email template Day 3 con trial hero box prominente ("VERSIÓN DE PRUEBA ACTIVA · X días gratis · Tu tarjeta NO se carga"). Pendientes post-sprint: Netflix-style trial flow (1-2d, captura card upfront via Stripe Checkout setup mode), CHANNEX-AUTO-PROVISION (5-7d, wizard crea property + room types + rate plans + OTA connections en Channex automáticamente al activar), merge `feature/billing-discount-codes` → `feature/billing-core` → `main`.

### Channex auto-provisioning — Sprint CHANNEX-AUTO-PROVISION (cerrado 2026-05-28)

> Decisiones implementadas Days 1-7. Resuelve el gap detectado por owner 2026-05-27: el wizard creaba cliente en BD pero NO empujaba inventario ni canales a Channex — el consultor tenía que configurar manualmente post-activación. Ahora la activación incluye Property + RoomTypes + RatePlans + Channels OTA creados automáticamente en Channex con encryption AES-256-GCM de credentials. Diferenciador comercial: ningún PMS LATAM (Cloudbeds/Mews/Opera/RoomRaccoon/Little Hotelier) provisiona OTAs desde el wizard de onboarding — todos requieren configuración manual post-activación.

189. **D-CHX-AP-1 — Provisioning es best-effort outside-tx; falla NO bloquea activación del cliente.** El `WizardActivationService.activate()` ejecuta `provisionFromWizard` DESPUÉS del `$transaction` que crea Organization + Brand + LegalEntity + Properties + Owner. Si Channex falla (gateway down, KEK no configurada, 422 validation), el cliente sigue activado y el error se persiste en `PropertySettings.channexProvisioningStatus = 'failed' | 'partial'` + `channexProvisioningError = mensaje`. Consultor re-dispara desde `/nova/billing/channex` (retry endpoint idempotente). Razón: la activación del cliente y su acceso al producto (login, dashboard, billing) NO debe depender de un sistema externo. El push a OTAs es importante pero recuperable; bloquear activación por un 503 Channex transitorio sería UX hostile y costoso de recuperar.

190. **D-CHX-AP-2 — Idempotency natural vía verificación de mappings BD antes de cualquier POST.** `provisionOneProperty` chequea `settings.channexPropertyId`, `room.channexRoomTypeId`, `Channel.channexChannelId` (UNIQUE en BD) antes de cada gateway call. Re-trigger sobre property ya completed = no-op total. Re-trigger sobre property con partial state = solo crea los faltantes. Razón: el patrón anti-idempotent "post + hope" genera UUIDs duplicados en Channex que requieren cleanup manual (caso real Mews 2023 confirmado por su engineering blog). Mapping BD primero = single source of truth — si vive en `Room.channexRoomTypeId`, no se vuelve a crear. Esto también satisface cert anti-pattern AP-1 (Channex rechaza hardcoded UUIDs en codepath productivo).

191. **D-CHX-AP-3 — Multi-tenant Fase 1 = Modelo D adaptado (1 master + Groups + RBAC middleware).** Cada Organization Zenix tiene su propio `Channex Group` (feature nativa de Channex para sub-tenancy lógica). API key Channex vive SOLO en `.env` server-side, NUNCA expuesta al frontend ni a consultores. `NovaActingOrgGuard` valida que cualquier mutation Channex sea sobre properties dentro de `assignedOrgIds` del consultor; defense-in-depth en `ChannexProvisionController.retryProvision` verifica `prop.organizationId === actingOrgId` para prevenir IDOR cross-tenant. Migration path a Modelo B (Channex Partner Program post-piloto): campo `LegalEntity.channexApiKey String?` nullable ya existe — si null usa master + Group (Fase 1), si set usa BYO key (Fase 2). Switching gradual cliente por cliente sin breaking change. Pattern documentado: RoomRaccoon (2019 piloto), Cloudbeds (2021 migración a Partner Program). Mews usa Modelo C (BYO) y eso limita su mercado SMB.

192. **D-CHX-AP-4 — Credenciales OTA encriptadas AES-256-GCM con KEK en `.env`, NUNCA en logs/AuditLog.** `ChannelCredentialsCryptoService` cifra el objeto `{hotel_id, username, password}` (per channel type) antes de persistir en `Channel.settingsEncrypted`. Format del blob (base64): `[12 bytes IV][16 bytes auth tag][N bytes ciphertext]`. KEK 32 bytes (`openssl rand -base64 32`). `isReady()` guard: si KEK no configurada → channels con credentials caen suavemente a `status='pending_credentials'` + error capturado (no crash). `describeCredentials(settings)` retorna solo `keys=[hotel_id,username,password]` para audit-safe logging — NUNCA values. **Rotation runbook standalone**: `docs/ops/channex-credentials-rotation.md` cubre dos paths (API key + KEK) con pre-checks, caso normal vs emergencia, cold migration script, GDPR Art. 33 breach notification timing. Razón: las credentials del cliente son su gateway a OTAs que generan ~80% de su revenue — un leak es game over para el cliente y catastrófico para Zenix. AES-256-GCM con IV único + auth tag es el standard NIST (FIPS 140-2 approved); Stripe usa el mismo pattern para card tokens.

193. **D-CHX-AP-5 — Channels creados `inactive` por default; activación published requiere paso explícito post-onboarding OTA-side.** El `createChannel` siempre pasa `isActive: false` al Channex API. Esto crea el canal pero NO lo publica — la propiedad NO recibe reservas todavía. El consultor o cliente activa published manualmente desde `/nova/billing/channex` después de confirmar onboarding con cada OTA (content moderation Booking, listing approval Expedia, etc. — procesos que toman 2-7 días por OTA). Status state machine en BD: `inactive` (creado, no published) | `pending_credentials` (sin settings) | `connected` (published + active) | `requires_oauth` (Airbnb pre-OAuth) | `error` (Channex marca último sync falló). Razón: activar published al momento de provisioning genera reservas reales que el cliente no puede honrar (inventory rates aún placeholder, room types pendientes de QA por su lado). Pattern Stripe webhook test mode → live mode — gradual + explícito.

194. **D-CHX-AP-6 — Airbnb siempre `requires_oauth`; UI nunca intenta connection programática.** El `ChannexProvisionService` detecta `type === 'AirbnbCom'` y marca el channel con `status='requires_oauth'` independiente de si vinieron credentials. `createChannel` no envía settings de Airbnb al gateway. UI en `/nova/billing/channex` muestra el chip distintivo + link directo a Airbnb extranet (`Open Airbnb extranet ↗`) — el usuario completa el OAuth handshake allá. Razón: regla regulatoria Airbnb desde 2022 prohíbe a PMS crear connections sin OAuth user consent en el portal Airbnb. Ningún PMS puede saltarse esto (verificado: Cloudbeds, Mews, Opera, Little Hotelier, RoomRaccoon todos requieren el mismo flow). Intentar bypass = ban inmediato del Channex account. El OAuth completo (token exchange + listing import) vive en sprint AIRBNB-OAUTH planificado post v1.0.0.

### No-show admin charging — Sprint POST-NETFLIX-TRIAL (2026-05-29)

> Decisiones registradas tras feedback explícito del owner sobre el scope real de Stripe en Zenix. El intento previo de cobrar el no-show automáticamente via Stripe (módulo `payments/` eliminado en commit 5cc4869) estaba fuera del scope.

195. **D-NOSHOW-1 — Stripe en Zenix tiene 2 usos únicos: (a) subscription billing del hotel (mensualidad Zenix) y (b) booking engine público (cobro de reserva direct).** El no-show NO usa Stripe. Quote owner 2026-05-29: *"Stripe solo lo vamos a usar para cobrarle al dueño del hotel la plataforma Zenix mensualmente y para el booking engine que se va a encargar de procesar el pago de la reserva desde la interfaz que va a ser redirecionada desde el sitio web del hotel y al pagar se va a generar el bloque de la reserva en el PMS"*. El check-in NO retiene tarjeta del huésped — Zenix permanece SAQ A (no procesa tarjetas en check-in, todo via OTA prepay o booking engine prepay).

196. **D-NOSHOW-2 — Flujo del cobro del no-show es 100% administrativo.** Recepción cobra fuera de Zenix (efectivo en mostrador / OTA Virtual Card via Booking Genius / Expedia Collect / SPEI / terminal POS manual) y registra el outcome vía `POST /v1/guest-stays/:id/register-noshow-charge`. Endpoint `RegisterNoShowChargeDto` con 3 status (CHARGED|FAILED|WAIVED) × 6 métodos (cash|transfer|ota_card|manual_card|ota_collect|other). El estado post-call es INMUTABLE excepto via `revertNoShow` (que resetea todo). Quote owner: *"el proceso de noshow es mero administrativo, si acaso para cobrar el noshow, sería con los datos bancarios que se podrían obtener desde la OTA"*.

197. **D-NOSHOW-3 — `GuestStay.channexGuaranteeMeta` se expone a recepción.** Booking Genius VCC y Expedia Collect envían en el webhook `booking_new` los datos de la tarjeta de garantía (masked PAN last-4 + expiration + tipo + balance VCC). El backend ya los persiste; el frontend (`BookingDetailSheet`) ahora los muestra en una card sky-blue dentro de la sección de no-show — recepción usa estos datos en su terminal POS para procesar el cargo manualmente y luego registra el outcome vía `RegisterNoShowChargeDialog`. PCI-safe: Zenix nunca recibe PAN completo, solo el masked que viene de Channex.

198. **D-NOSHOW-4 — 5 columnas append-only en GuestStay congelan el outcome.** Migration `20260606000000_noshow_charge_admin_fields`: `noShowChargeMethod` + `noShowChargeReference` (POS auth ID / transfer ID / OTA case ID — Visa CRR §5.9.2 chargeback evidence) + `noShowChargeAt` + `noShowChargeById` + `noShowChargeReason` (obligatorio si status=WAIVED, ≥5 chars, audit trail). Guards backend: stay debe existir + scope match + `noShowAt != null` + `noShowChargeStatus === 'PENDING'` (no se sobrescribe historial CHARGED/WAIVED/FAILED — solo `revertNoShow` puede resetear).

199. **D-NOSHOW-5 — Eliminado el campo `GuestStay.stripePaymentMethodId` + 2 hooks frontend (`useChargeNoShow` / `useWaiveNoShow`) + módulo backend `payments/` completo.** Reason: el intento previo de cobrar via Stripe asumía que el check-in retenía tarjeta del huésped — lo cual nunca fue scope del producto. Migration `20260605000000_remove_guest_stay_stripe_fields` dropea las 3 columnas (`stripe_customer_id`, `stripe_payment_method_id`, `stripe_payment_intent_id`). 3 capas de defensa contra regresión: (a) canary test detecta route collision si alguien re-registra controller; (b) HTTP integration tests con supertest + HMAC validan el contrato Stripe webhook; (c) smoke test pre-deploy valida 15 invariantes runtime (Stripe, Channex, KEK roundtrip, migrations, Resend, Banxico, PAC).

> **Sprint POST-NETFLIX-TRIAL — implementación cerrada 2026-05-29 con 43/43 tests guest-stays.no-show verdes (7 nuevos para `registerNoShowCharge`). Mergeado a main 2026-05-29 PR #47 commit `52c7501`. Pendiente: validación end-to-end manual del owner con cliente piloto real + rotación post-merge de las keys Stripe (rk_test_/sk_test_/rk_live_) que el owner pegó en chat durante validación.**

### Billing Day-1 charge — Sprint BILLING-DAY1 (2026-05-29)

> Sprint #1 del plan de cierre wizard. Implementa el modelo Day-1 confirmado por owner 2026-05-29: el wizard ahora puede cobrar la primera mensualidad inmediato al activar (cuando `trialDays=0`) en vez de obligar al cliente a pasar siempre por trial Netflix-style.

200. **D-DAY1-1 — Stripe Checkout ramifica `mode` según `pendingTrialDays`.** `subscription.service.ts:createSetupCheckoutSession` decide al runtime:
   - `pendingTrialDays === 0` → `mode='subscription'` con `line_items` del plan + `quantity=propertyCount` + opcional `discounts` con `pendingCouponId`. Stripe Checkout cobra inmediato la primera mensualidad, crea la Subscription real y emite la factura. Webhook `checkout.session.completed` con `metadata.zenix_kind='DAY1_IMMEDIATE_CHARGE'` dispara `activateAfterSubscriptionCheckout(sessionId)` para transicionar la Sub local `pending_payment_method` → status real.
   - `pendingTrialDays > 0` → `mode='setup'` (Netflix path original). $0 SetupIntent captura tarjeta sin cobrar; webhook `setup_intent.succeeded` crea Stripe Sub con `trial_period_days` y cobro al final del trial.

   Decisión owner verbatim 2026-05-29: *"Mi estrategia de negociación ideal es cobrar desde el primer día, para debatir objeciones puede entrar el 'te lo dejo gratis por 30 días' o 'te cobro la primer mensualidad y si no te gusta en 30 días, te regreso tu dinero'. Por ejemplo, si en días de trial selecciono 0, el pago debería ser la primer mensualidad en el link de pago que recibe el dueño por email."* Garantía 30d es política comercial, no cambio técnico.

201. **D-DAY1-2 — Idempotencia diferenciada por kind.** `setup_checkout_${sub.id}` para Netflix path (Stripe Checkout regenera misma URL durante 24h). `day1_checkout_${sub.id}` para Day-1. Webhooks ambos idempotentes via guard `sub.stripeSubscriptionId` ya real (no `pending_*`) → skip retornando existing. Auditable via `safeAuditLog` con action `SUBSCRIPTION_ACTIVATED_DAY1` vs `SUBSCRIPTION_ACTIVATED_AFTER_SETUP`.

202. **D-DAY1-3 — Activation email hero box ramifica visualmente según `trialDays`.** `activation-email.service.ts:renderSubscriptionBox` muestra:
   - `trialDays > 0` → caja emerald "Versión de prueba activa · N días gratis · Tu tarjeta NO se carga durante este período."
   - `trialDays === 0` + `monthlyAmount` provisto → caja amber "💳 Pago inmediato al activar · Primera mensualidad: USD X · Al confirmar tu tarjeta en Stripe se cobra la primera mensualidad. Cancela cuando quieras."
   - Foot copy también ramifica: "validación $0" vs "procesa el cobro de la primera mensualidad de forma inmediata".

   Plain-text variant equivalente. Monto formateado con `Intl.NumberFormat('es-MX', { currency: 'USD'|'MXN' })`. Multiplica `monthlyAmount × propertyCount` para hoteles multi-property. Pattern Mehrabian-Russell 1974: claridad de monto + timing reduce friction post-activate; cliente sabe exactamente qué se cobrará y cuándo.

203. **D-DAY1-4 — `WizardActivateResponse.subscription` expone `baseMonthlyAmount + currency`.** Necesario para que el email ramifique correctamente. Backward-compat: campos opcionales — tests legacy sin pricing context siguen funcionando (email no muestra hero, sólo plan + cycle).

> **Sprint BILLING-DAY1 — implementación cerrada 2026-05-29 con 93/93 tests billing + 175/175 tests nova verdes. Mergeado a main 2026-05-29 PR #48 commit `2293a2c`.**

### Discount approval queue UI — Sprint DISCOUNT-APPROVAL-UI (2026-05-29)

> Sprint #2 del plan de cierre wizard. Resuelve el caso reportado en CLAUDE.md §Plan v1.0.0: cuando un consultor aplica un template que excede su tier cap, el backend marca `discountStatus='pending_approval'` y crea AppNotification ACTION_REQUIRED al PARTNER_ADMIN — pero hasta este sprint NO existía UI para cerrar el loop. Subscriptions quedaban colgadas indefinidamente.

204. **D-DAYAPPR-1 — `listPendingApprovals` enriquece con relations sin agregar FK formales.** El schema `DiscountApprovalRequest` no tenía `@relation` con `Organization`/`User`/`Subscription` (decisión histórica para evitar migration sobre tabla productiva). El service ahora hace **manual join batched** post-query: `organization.findMany({ id: { in: orgIds } })`, `user.findMany({ id: { in: userIds } })`, `subscription.findMany({ id: { in: subIds } })` — 3 queries paralelas via `Promise.all`. Mapeo client-side con `Map<id, row>`. Response enriquecida con `organizationName`, `organizationSlug`, `requestedByName`, `requestedByEmail`, `subscription: { planTier, currency, baseMonthlyAmount, propertyCount, billingCycle }`. Patrón estándar Prisma "manual join" cuando no quieres FK formal — costo aceptable porque N approvals es siempre <100 (acción por excepción humana).

205. **D-DAYAPPR-2 — `/nova/billing/aprobaciones` solo PARTNER_ADMIN + PLATFORM.** Backend ya tenía guards (`NovaTiers('PLATFORM', 'PARTNER_ADMIN', 'PARTNER_MEMBER')` en controller, pero el service filtra `isApproverTier(actor)` que excluye PARTNER_MEMBER). PARTNER_ADMIN ve solo `assignedOrgIds`; PLATFORM ve todo. UI registrada en App.tsx + sub-nav del Billing landing actualizado a `status='available'`.

206. **D-DAYAPPR-3 — Card incluye contexto comercial suficiente para decisión sin abrir cliente.** Pattern Salesforce CPQ Approval Inbox: el PARTNER_ADMIN nunca debería tener que navegar fuera de la queue para decidir. Cada card muestra:
   - Cliente (nombre + slug)
   - PercentOff destacado + duración (once / N meses / forever)
   - **Grid contexto comercial 4-col**: Plan × cycle / Tarifa actual × propertyCount / Después del desc. / Ahorro mensual (todos formateados con `Intl.NumberFormat` per `subscription.currency`)
   - Consultor solicitante (nombre + email + role chip neutral)
   - Razón en bloque cita italic con border-l-2
   - Timestamps creación + expiración (chip warning con AlertTriangle si <24h)

   Diseño Apple HIG: información jerárquica, primary action ([Aprobar] solid emerald) a la derecha, secondary destructive ([Rechazar]) con `variant="ghost"` rojo a su izquierda. No requiere confirmación bloqueante para approve — patrón Salesforce ("aprobaste el descuento" toast, undo no implementado en v1.0.0).

207. **D-DAYAPPR-4 — Reject dialog con forcing function razón ≥10 chars.** Backend `RejectApprovalDto` enforce `@MinLength(10) @MaxLength(500)` (audit trail compliance). Frontend mirror: textarea con contador en vivo + feedback color red cuando insuficiente. Botón "Rechazar descuento" `variant="destructive"` solo habilitado cuando válido. Razón se persiste en `DiscountApprovalRequest.rejectionReason` y se notifica al consultor — no editable después (inmutabilidad audit §11).

208. **D-DAYAPPR-5 — Bell auto-mark-as-read del approval notif (patrón §100).** `recordApproval` ya auto-marca via `AppNotificationRead` entries. Frontend `useApproveDiscount` + `useRejectDiscount` invalidan ambos `['billing', 'approvals']` y `['notifications']` queries → bell counter actualiza in-place. Sin necesidad de polling.

> **Sprint DISCOUNT-APPROVAL-UI — implementación cerrada 2026-05-29 con 95/95 tests billing verdes. Mergeado a main 2026-05-29 PR #49 commit `a94324b`.**

### PAC client visibility — Sprint PAC-CLIENT-WARNING (2026-05-29)

> Sprint #3 del plan de cierre wizard. Resuelve el gap operativo: cuando el consultor skipea el health-check PAC en wizard Step 8 (override controlado), el cliente queda activado sin saber que su CFDI no funciona. Lo descubre con un huésped frente al counter pidiendo factura — peor momento posible.

209. **D-PAC-CLIENT-1 — `LegalEntity.pacStatus` es la fuente única de verdad cliente-facing.** Enum string (no Prisma enum para evitar migration churn) `CONFIGURED | PENDING | FAILED | NOT_REQUIRED`. Campo persiste en BD migration `20260607000000_legal_entity_pac_status` con `default 'PENDING'` (fail-safe — si una entity histórica no tiene status, asumimos PENDING y el cliente decide con su consultor). Acompañado de `pacStatusUpdatedAt` (timestamp transición) + `pacStatusReason` (text humano, ej. "Skipped en wizard por consultor — cliente lo configurará después"). Index `pac_status_idx` para queries de reportes.

210. **D-PAC-CLIENT-2 — Wizard activate ramifica el status según `pacOverrideAccepted`.** `WizardActivationService.activate` setea en el mismo `$transaction` que crea LegalEntity:
   - `pacOverrideAccepted=true` (consultor skipeó health-check) → `pacStatus='PENDING'` + reason "Activado por consultor sin verificar PAC en wizard. Cliente debe configurar credenciales antes de facturar."
   - `pacOverrideAccepted=false` (health-check pasó) → `pacStatus='CONFIGURED'` + reason `null`

   El `pacCredentials.overrideAccepted` legacy se mantiene para backward-compat con audit existente; el nuevo `pacStatus` es la columna canónica.

211. **D-PAC-CLIENT-3 — Endpoint específico `GET /v1/settings/legal-entity-status`.** No agrupado en el `/settings` general porque (a) shape es legalEntity-scope no property-scope, (b) flatten cambiaría contrato existente del SettingsService. `SettingsService.getLegalEntityStatus(propertyId)`:
   - Property no existe → `NotFoundException`
   - Property sin `legalEntityId` (Property.legalEntityId nullable hasta v1.1 backfill §65) → retorna `{ pacStatus: 'NOT_REQUIRED' }` gracioso (no throw — caso histórico válido)
   - LegalEntity FK rota → `NotFoundException`
   - Happy: retorna `{ legalEntityId, pacStatus, pacStatusUpdatedAt, pacStatusReason, countryCode, legalEntityName }`

   No expone `pacCredentials` (sensible, encriptado en v1.1+). Visible al RECEPTIONIST + SUPERVISOR (no requiere SUPERVISOR-only — informativo).

212. **D-PAC-CLIENT-4 — `PacStatusBanner` componente cliente-facing inline al top de `<main>`.** Decisión rechazada: position fixed. Rechazado porque requiere medir altura del banner para ajustar pt-* del main dinámicamente — fragility. Decisión aceptada: banner inline al top del `<main>` (no fixed). Trade-off: scrollea con contenido. Mitigación: siempre es lo primero que el cliente ve al cargar cualquier ruta + dismiss per-session (no per-render — el banner reaparece en próximo login para no olvidar el problema). NN/g 2022 "non-blocking warnings deben ser visibles sin obstruir flujo". Pattern Apple HIG H4 (visibility of system status) + Nielsen H1 (status feedback).

   Filtro `PAC_REQUIRED_COUNTRIES = ['MX']` (MX hoy, CO/PE/CR cuando se active el adapter respectivo). Países no listados no muestran banner. Status `CONFIGURED` o `NOT_REQUIRED` no renderiza nada. Refresh cada 5min — si consultor configura PAC desde Nova mientras el cliente tiene el tab abierto, el banner desaparece automáticamente sin reload.

   Tone visual: `PENDING` → amber, `FAILED` → red (Mehrabian-Russell 1974 + §31 color psychology). Botón "Configurar ahora" lleva a `/settings/legal-entity` con instrucciones.

213. **D-PAC-CLIENT-5 — Nueva sección `/settings/legal-entity` con instrucciones cliente-facing.** Tab nuevo "🧾 Facturación" en `SettingsPage`. Renderiza:
   - Card top con nombre de la LegalEntity + countryCode
   - Card status con tono adaptativo (emerald/amber/red/slate)
   - Si `PENDING`/`FAILED`: lista numerada con 4 pasos para que el cliente sepa qué hacer (contacta consultor → comparte credenciales → consultor configura desde Nova → estado cambia a CONFIGURED automático)
   - Caption diferente si es SUPERVISOR vs no-supervisor

   En v1.0.1 esta sección se ampliará con form de upload de credenciales PAC para que el cliente las gestione él mismo (hoy lo hace el consultor desde Nova para mantener compliance encryption-at-rest).

> **Sprint PAC-CLIENT-WARNING — implementación cerrada 2026-05-29 con 6/6 tests settings + 29/29 tests wizard verdes. Mergeado a main 2026-05-29 PR #50 commit `0629ee3`.**

### Channex cert Stage 4 hardening — Sprint CHANNEX-CERT-B1 (2026-05-29)

> Sprint #4 del plan de cierre wizard. Resuelve el bloqueante cert identificado en auditoría 2026-05-29: el worker computaba `Math.max(60, 2^attempts)` ignorando el header `Retry-After` que Channex provee en sus 429 — discrepancia código vs CLAUDE.md §144 D-CHX-OUT-6. Cert Stage 4 anti-pattern AP-2.3 exige respetar el valor exacto.

214. **D-CHX-B1-1 — `ChannexRateLimitError extends ChannexHttpError` con `retryAfterSeconds: number | null`.** Subclase semántica del error que el gateway lanza específicamente en 429. El worker discrimina via `err instanceof ChannexRateLimitError` y consume `.retryAfterSeconds` directamente. Otros 4xx/5xx siguen usando `ChannexHttpError` plano — el worker aplica sus reglas estándar (terminal_4xx → DEAD_LETTER si != 429, exp backoff 2^attempts en 5xx).

215. **D-CHX-B1-2 — `parseRetryAfter(headerValue): number | null` puro y testeable.** Implementa RFC 7231 §7.1.3 con los dos formatos válidos:
   - **delta-seconds**: `Retry-After: 120` → `120` (también `30.4` → `31` via `Math.ceil`)
   - **HTTP-date**: `Retry-After: Wed, 21 Oct 2026 07:28:00 GMT` → seconds hasta esa fecha
   - **Missing / undefined / vacío** → `null`
   - **Malformed** (`not-a-number`) → `null` (fail-soft, no throw)
   - **HTTP-date pasado** (server bug) → `null` (no devuelve negativo)
   - **delta-seconds negativo** (`-100`) → `null` (inválido per spec)

   Exportado del gateway module para test directo. Cobertura: 6 tests del parser puro + 6 integration tests con gateway.

216. **D-CHX-B1-3 — Helper privado `throwIfNotOk(res, opLabel)` centraliza el patrón.** Reemplazó el patrón duplicado en 22 call sites del gateway:
   ```ts
   if (!res.ok) { const text = await res.text(); throw new ChannexHttpError(`${op} HTTP ${status}: ${text}`, status) }
   ```
   con:
   ```ts
   await this.throwIfNotOk(res, opLabel)
   ```
   El helper lee headers en TODAS las llamadas (no solo ARI push). Beneficio defense-in-depth: si en el futuro Channex implementa rate limit en endpoints CRUD del wizard (createGroup, createProperty, etc.), el comportamiento es correcto desde día 1. Aplica al 100% del surface del gateway que llama a Channex.

217. **D-CHX-B1-4 — Worker backoff strategy refactorizado.** En `processFailure`:
   - **429** con `ChannexRateLimitError`: `backoffSeconds = Math.max(60, err.retryAfterSeconds ?? 60)`. El floor de 60s defiende contra bugs server (Channex pide 1s → usamos 60s mínimo). `null` fallback a 60s.
   - **5xx / network**: `backoffSeconds = Math.pow(2, attempts)` (exp backoff inalterado, 1/2/4/8/16s).
   - Logs incluyen `retryIn=${backoffSeconds}s status=${status}` para auditabilidad ante reviewer Stage 4.

218. **D-CHX-B1-5 — Doc drift §134 + §129 corregido: 30min → 15min.** El cron real es `*/15 * * * *` desde audit-A6 (recomendación oficial Channex 2024 de 15-20min). CLAUDE.md tenía "30min" en 2 lugares. Documentar la realidad evita inconsistencia visible al reviewer durante walkthrough. R3 (audit auth fail-open) confirmado sólido: `PropertySettings.channexWebhookSecretRequired @default(true)` en schema + `ChannexAuthGuard` rechaza con 401 si `secretRequired=true` + secret null. Fail-open path requiere opt-in EXPLÍCITO (sandbox/dev).

> **Sprint CHANNEX-CERT-B1 — implementación cerrada 2026-05-29 con 93/93 tests Channex verdes. Mergeado a main 2026-05-29 PR #51 commit `e0c8060`.**

### Wizard E2E Playwright suite — Sprint WIZARD-E2E (2026-05-29)

> Sprint #5 del plan de cierre wizard. Da confianza pre-piloto del flujo de activación del cliente vía tests automatizados que cubren UI + state machine + edge cases sin depender de backend en vivo.

219. **D-WIZ-E2E-1 — Playwright contra Vite dev server con backend mockeado.** Setup minimal: `@playwright/test` en `apps/web` + `playwright.config.ts` único proyecto Chromium + `e2e/` directorio. Backend mockeado vía `page.route('**/api/v1/**', handler)` — eliminó dependencia de NestJS API + Postgres en cada run. Tests son **deterministas, rápidos (<10s), independientes** (cada test limpia localStorage). Pattern justificado: full-stack E2E con BD seed real es 10× más lento + 5× más flaky; los gaps que cubrimos aquí son UI rendering + navigation + state, no backend correctness (cubierto por Jest specs ya existentes 93/93 + 95/95 + etc.).

220. **D-WIZ-E2E-2 — Helper `mockApi(page, routeMap)` con path-params matcher.** `apps/web/e2e/_fixtures/api-mocks.ts` expone un router minimal que matchea `'METHOD /v1/path/:param'`. Soporta delay opcional + headers custom. Fixtures canónicos exportados (`setupMetaFixture`, `setupActivateOkFixture`, `subscriptionFixture`, `setupCheckoutSessionFixture`) — escenarios nuevos componen overrides en vez de re-escribir bodies completos. Cuando un test no matchea, request falla con error visible → buena señal de que falta mock (no falso positivo silencioso).

221. **D-WIZ-E2E-3 — 4 escenarios cubren el "definition of done" del flujo activación.**
   - **Happy path** (`SetupPage` → `OnboardingCardCapture`): token válido GET 200 → form rendered → password fuerte + confirm match → POST 200 → navigate `/onboarding/card`. Verifica copy correcto (org name, owner email, propertyCount, hoursRemaining).
   - **Edge token expired**: GET 410 → `ErrorCard` tone='warning' visible con texto "Setup link expirado o ya consumido". Form NO renderiza (count=0).
   - **Edge password weak**: `<10 chars` → botón submit `toBeDisabled()`. Tras llenar 10+ chars matching confirm → `toBeEnabled()`. Validación 100% client-side, no requiere mock POST.
   - **Edge Stripe declined** (`OnboardingCardCapture` con `?payment=cancel`): query param dispara state `cancelled` → texto cancelado visible + botón retry presente.

222. **D-WIZ-E2E-4 — Scripts `test:e2e` + `test:e2e:headed` + `test:e2e:install` en `apps/web/package.json`.** Runbook documentado en `apps/web/e2e/README.md`. Browsers Chromium descargados one-time (~300MB) via `npm run test:e2e:install` — no en CI por ahora (sprint separado para wirearlo). Vite dev server debe correr en otra terminal (assumption explícita). Documentado en README cómo activar `webServer: { command: 'npm run dev' }` en config si se quiere autonomía total.

223. **D-WIZ-E2E-5 — Selectores prefieren queries semánticas (`getByRole`, `getByText`) sobre CSS.** Sobrevive mejor a refactors de markup. Cuando un copy del wizard cambia (Spanish-first), los tests fallan rápidamente con mensaje claro y se actualizan en minutos. CI integration deferida — el sprint que cierre la posición productiva del wizard (post-piloto) puede agregar GitHub Actions con cache de `~/.cache/ms-playwright`. Las posiciones hoy son: 4 tests verdes localmente, tiempo total <15s, infra reusable para sprints futuros (CHECK-IN modal redesign etc.).

> **Sprint WIZARD-E2E — implementación cerrada 2026-05-29 con 4 tests reconocidos por Playwright list. Mergeado a main 2026-05-29 PR #52 commit `f55eaca`.**

### Client retention discounts UI — Sprint CLIENT-RETENTION-DISCOUNTS (2026-05-29)

> Sprint #6.5 del plan v1.0.0 (owner-requested 2026-05-29). Backend ya 100% listo (auditado durante WIZARD-CLOSE sprint anterior). Solo faltaba la UI para que el consultor aplique discount de retención a subscriptions activas. Use case owner literal: *"durante el mes 4 quiero darle 3 meses de descuento, al finalizar se renueva el pago normal"* + *"el descuento sería en su siguiente pago a partir de que yo 'activo' ese descuento"*.

224. **D-RETENT-1 — UI separada del wizard, NO modifica sub mid-cycle.** El descuento se aplica desde el **siguiente invoice** (Stripe respeta `coupon.duration` nativamente, sin mid-cycle proration). Para `duration='repeating' durationInMonths=N`, Stripe auto-revert al precio del plan al expirar — **sin scheduler propio, sin reverse manual**. El backend ya envía `stripe.subscriptions.update({ discounts: [{ coupon }] })` real (líneas 522-535 `discount-code.service.ts`). Patrón Netflix/Spotify win-back: el consultor define puntualmente el contexto comercial, no edita el contrato de subscription.

225. **D-RETENT-2 — Endpoint `GET /v1/nova/billing/subscription` (sin :id) usa acting org del header.** El consultor selecciona cliente en TenantSwitcher → `useNovaStore.actingOrgId` propaga via `X-Acting-Organization-Id` header → backend `TenantContextService.getActingOrgIdOrThrow()` lo extrae → `subscription.getSubscriptionForOrganization(orgId)` retorna sub completa con `discounts[]` + `events[]`. 404 si la org no tiene sub Stripe (caso edge: wizard activate falló en pre-billing-day1). El existing `getSubscriptionById(:id)` se mantiene para casos donde el consultor conoce el ID interno.

226. **D-RETENT-3 — `NovaBillingClientPage` (`/nova/billing/cliente`) compone 3 cards.**
   - **SubscriptionCard**: plan + cycle + monthly amount × propertyCount + status chip + next renewal + cardCapturedAt. Status mapeado a variants semánticos (active=success, past_due=warning, etc.).
   - **ActiveDiscountCard**: si existe `discounts[0]` sin `voidedAt` → muestra % + duration + tarifa con desc + ahorro mensual + reason cita italic. Si no → "Sin descuento activo" + tarifa estándar. Siempre incluye CTA "Aplicar descuento de retención" (Sparkles emerald) + explainer del comportamiento Stripe (3 líneas de copy explicando el revert automático).
   - **DiscountHistorySection** colapsible: lista todos los discounts (activos y voided) con fecha + razón + promotion code. Empty state cuando no hay history.

227. **D-RETENT-4 — `ApplyRetentionDiscountDialog` form ad-hoc (NO templates).** Templates viven en `/nova/billing/codigos` para wizard activate (consultor pre-configura antes de reunión cliente). En retención el contexto es puntual ("mes 4 churn risk") — form directo:
   - **% off**: slider 5-50 con step=5 + display tabular-nums grande
   - **Duration radio 3-col**: once / repeating / forever con descripción debajo de cada opción
   - **Months input** (solo si repeating): 1-24, muestra fecha exacta de revert calculada con `subscription.nextRenewalDate + N meses`
   - **Preview impacto** grid 3-col: tarifa actual / con desc / ahorro mensual. Si repeating: "Ahorro total N meses: $X"
   - **Reason textarea** ≥10 chars (mirror backend `@MinLength`), contador en vivo
   - **Warning amber** si `percentOff > 25` ("suele exceder cap AUTHORIZED/SILVER")
   - **CheckCircle explainer** "aplica al próximo invoice, vuelve automático al precio acordado cuando termina"

228. **D-RETENT-5 — Approval flow + cap auto-detection upstream.** Frontend envía `autoRequestApprovalIfExceedsCap: true` (siempre) → backend `DiscountCodeService.generate` valida vs tier cap → si dentro → applied directo + Stripe update; si excede → `pending_approval` con AppNotification ACTION_REQUIRED HIGH al PARTNER_ADMIN (el mismo flow que DISCOUNT-APPROVAL-UI). Frontend ramifica el toast: `kind='applied'` → "Descuento aplicado — efectivo desde el próximo cobro"; `kind='pending_approval'` → "Descuento enviado para aprobación — un PARTNER_ADMIN lo revisará" (duración 5s). Invalida queries `['nova', 'billing', 'subscription']` + `['billing', 'approvals']` + `['notifications']` para refresh in-place.

> **Sprint CLIENT-RETENTION-DISCOUNTS — implementación cerrada 2026-05-29 con 95/95 tests billing verdes. Mergeado a main 2026-05-29 PR #54 commit `db1ea60`.**

### Check-in UX hardening C1 — Sprint CHECK-IN modal redesign sub-fase 1/3 (2026-05-29)

> Sprint #7 del plan v1.0.0. Sub-fase **C1** de la opción C aprobada por owner. Tras research PMS (Cloudbeds/Mews/Opera/RR/LH/Sirvoy reviews Capterra/G2/HotelTechReport) + auditoría interna del modal actual, C1 entrega bug fixes + ampliación walk-in + opcionales analytics LATAM. C2 (ReservationGroup model) + C3 (GroupCheckinDialog 3-modos §156) seguirán en sprints separados.

229. **D-CHECKIN-C1-1 — Bug fix `identityValid` alineado server↔client.** Auditoría detectó: cuando OTA pre-cargó `documentType + documentNumber` sin foto, el badge mostraba "Documento en reserva" (verde) pero el CTA quedaba bloqueado sin pista. Causa: el server marcaba `identityCaptured=true` pero el cliente exigía SIEMPRE `docPhotoDataUrl`. Fix: nueva lógica `identityValid = !!ctx?.identityCaptured || (!!documentType && !!docPhotoDataUrl)`. Confiamos en el server cuando ya capturó (OTA pre-fill); exigimos foto en path normal. Mantiene Visa CRR §5.9.2 (audit trail OTA backend ya tiene ID) sin bloquear walk-ups con OTA pre-fill.

230. **D-CHECKIN-C1-2 — Pre-fill `payments[0].amount = balance` automático.** Pattern Stripe / RoomRaccoon. Hidratación adicional en `useEffect` cuando llega `ctx` y `needsPayment=true`. Guard: solo pre-fill si el form sigue en su estado inicial (1 row con amount=0) — no sobrescribe si recepcionista ya empezó a editar. **1 input menos por check-in** (friction NN/g eliminado).

231. **D-CHECKIN-C1-3 — Backend guard `CANCELLED` agregado a `confirmCheckin`.** Auditoría detectó hueco: `canCheckIn.reasons` incluía `'CANCELLED'` pero `confirmCheckin` NO lo bloqueaba como error code. Race posible si otra sesión cancela entre `getCheckinContext` y POST. Guard 2.5 nuevo (después de NOSHOW, antes de FUTURE_CHECKIN) lanza `BadRequestException { code: 'CANCELLED', message: 'restáurala primero' }`. Frontend hace branching específico → toast "restaura la reserva primero" + invalidate queries.

232. **D-CHECKIN-C1-4 — 5 error codes con UI específica (§110 NN/g H9 cumplido).** Antes solo `CHECKIN_ALREADY_CONFIRMED` tenía handler. Ahora `useConfirmCheckin.onError` ramifica con `switch (code)`:
   - `CHECKIN_ALREADY_CONFIRMED` → toast info "ya confirmado por otra sesión" + invalidate (sin error rojo)
   - `NOSHOW_LOCKED` → toast error "fue marcada como no-show, revierte primero" (6s)
   - `FUTURE_CHECKIN` → toast error "fecha de check-in es futura, espera o ajusta" (5s)
   - `BALANCE_UNPAID` → toast error "registra el pago antes de confirmar" (6s)
   - `BALANCE_OVERPAID` → toast error mensaje exacto §110b (7s)
   - `CANCELLED` → toast error "restaura primero" + invalidate (6s)
   - Default → toast genérico (preserva backward-compat con codes nuevos sin handler)

233. **D-CHECKIN-C1-5 — Campos opcionales `nationality` + `guestSex` en check-in (diferenciador LATAM hostal).** Mews fue criticado por NO agregar campo de género en reservas para dorms mixtos (Capterra hostel operator, fuente directa). Schema `GuestStay.nationality` + `GuestStay.guestSex` ya existían desde 2026-05-20 pero no estaban capturables al check-in. Ahora visible en sección Identidad como grid 2-col, ambos `(opcional)` para mantener NN/g 2024 minimalismo. Valores guestSex: 'F'|'M'|'O'|'N' (string libre por flexibilidad cultural LATAM). DTO backend + endpoint context + service persist actualizados.

234. **D-CHECKIN-C1-6 — `CheckInDialog` walk-in ampliado 520px → 672px (`max-w-2xl`).** Auditoría confirmó: el "modal angosto" del roadmap se refiere a `CheckInDialog` walk-in, NO a `ConfirmCheckinDialog` que ya estaba en `max-w-3xl`. Decisión: ampliar a 672px (sweet spot Apple HIG Form pattern entre 520px wizard compact y 768px ConfirmCheckin) sin refactorizar la lógica wizard 3-step que funciona. Pre-fillea menos (no hay reserva previa) — 672px es óptimo vs 768px que sobraría espacio. **Walk-in fast-path explícito** (botón dedicado en TimelineScheduler) **diferido a C2** porque toca el TimelineScheduler para bracket calendar de multi-room (§155) — agrupar evita 2 PRs sobre el mismo file.

> **Sprint CHECK-IN C1 — implementación cerrada 2026-05-29 con 60/60 tests verdes (43 no-show + 17 checkin específicos). Typecheck API + web verdes. C2 (ReservationGroup model + auto-detection BookingNewHandler §153-§154 + bracket visual + walk-in fast-path botón) próximo sprint. C3 (GroupCheckinDialog 3-modos §156) tras C2.**

### Mobile Dashboard role-aware + HK realtime sync — Sprints MOBILE-DASHBOARD + HK-CHX-REALTIME (2026-06-08)

> Sprints **Etapa A** (HK-CHX-REALTIME, PR #97) + **Etapa B** (MOBILE-DASHBOARD §B1-§B5, PR #98) cerrados 2026-06-08. Resuelven los 2 gaps operativos verificados en código que owner identificó como bloqueantes del piloto Hotel Boutique Tulum + audit visual del mobile (4 screenshots 2026-06-08).

**Etapa A — Real-time HK ↔ Channex sync:**

235. **D-HK-CHX1 — `BookingSameDayListener` escala HK task al recibir booking OTA same-day.** Resuelve owner case 2026-06-08: "son las 10am, llega una reserva para hoy desde channex, automáticamente el sistema notifica a la recamarista... debería ser prioritaria". `booking-new.handler` ahora inyecta `EventEmitter2` + emite `channex.booking.same-day-arrival` event con `{stayId, roomId, propertyId, checkInIso, otaName}` post-save. Listener nuevo en `apps/api/src/scheduling/listeners/` valida timezone-aware que `checkInIso` cae HOY local + pull `CleaningTask` PENDING/READY/UNASSIGNED para `roomId+scheduledFor=hoy` + upgrade `priority=URGENT, hasSameDayCheckIn=true` + TaskLog `event=PRIORITY_OVERRIDDEN, note="auto-upgrade URGENT — OTA {name} same-day arrival"` + SSE `task:upgraded`. **Si no hay task** → no-op (room presumiblemente limpia, sin checkout previo). Fail-soft total (error no propaga, booking ya está en BD). Pre-fix gap: el cron `morning-roster` corre 07:00; booking OTA aterriza 10AM quedaba invisible para HK hasta el día siguiente.

236. **D-HK-CHX2 — `RoomMovedHkListener` migra HK tasks cuando recepción cambia habitación.** Resuelve owner case 2026-06-08: "si se queda con la habitación antes de realizar el movimiento de habitación, va a limpiar una que no debe de ser". Listener escucha `room.moved` (paralelo al SSE listener existente que solo refresca UI) y migra atomicly tasks de fromRoom→toRoom. Cancela task antigua (`status=CANCELLED, cancelledReason=RECEPTIONIST_MANUAL, cancelledAt=now`) + crea task nueva con `carryoverFromTaskId` + hereda `priority/assignedToId/hasSameDayCheckIn`. **Si IN_PROGRESS** → skip + warn (defensive — §54 D11 ya bloquea moveRoom en GuestStaysService, este es double-check). SSE `task:moved` con `{fromTaskId, toTaskId, fromRoomId, toRoomId}` para Hub Recamarista refresh + haptic. Pre-fix: el listener `room.moved` SOLO re-emite SSE para UI calendar — NO tocaba `CleaningTask` → recamarista limpiaba el cuarto antiguo (libre) en vez del nuevo (donde llega el huésped).

237. **D-HK-CHX3 — SSE types nuevos `'task:upgraded'` + `'task:moved'`** en `packages/shared/src/types.ts` line 756-757. Mobile + web SSE clients pueden suscribirse y reaccionar (Hub Recamarista: refetch + haptic notification + toast). 12/12 tests unit verdes (6 booking-same-day + 6 room-moved-hk). 24 tests booking-new actualizados con `EventEmitter2` mock — todos verde.

**Etapa B — Mobile Dashboard role-aware (rediseño post-audit visual 4 screenshots):**

238. **D-MOB-1 — Walk-in tab eliminada del dashboard mobile.** Owner 2026-06-08: *"no veo valor agregado en mostrar walk-in ya que para mí es básicamente un checkin y ya"*. El RECEPTIONIST mobile solo tiene tabs `Llegadas` y `Salidas`. El walk-in se inicia desde el botón `+ Reservación` que abre el flujo de check-in con `paymentModel='HOTEL_COLLECT'` + `checkInAt=now()` (mismo flow, cero código adicional). Pattern Cloudbeds Mobile + Mews Pocket.

239. **D-MOB-3 — Single endpoint `/v1/dashboard/mobile` con projection role-aware** (NO 3 endpoints split). Backend `MobileDashboardService.getSupervisorSnapshot()` y `.getReceptionistSnapshot()`. Controller despacha según `actor.role`. HOUSEKEEPER → HTTP 403 con mensaje deeplink "usa /v1/housekeeping/my-day" (Hub Recamarista §60 D18 ya tiene su flow propio). Payload optimizado mobile (~3-5KB vs 15-20KB snapshot web). Sin pulse 14d (heavy + no se ve en mobile). Currency desde `LegalEntity.baseCurrency` (no PropertySettings). Time-aware greeting per `Property.settings.timezone`.

240. **D-MOB-6 — Donut ocupación 3-state, NO 4-state.** Owner 2026-06-08: *"no veo valor agregado en mostrar las habitaciones vacías dentro de la gráfica, qué sentido tendría?"* — argumento válido (vacías = revenue NO captured pero NO requiere acción del supervisor, no es accionable). Solo 3 segmentos accionables se grafican:
   - 🟢 **Ocupadas** (verde = revenue captured)
   - 🟡 **Llegadas hoy** (ámbar = en proceso, requiere atención eventual)
   - 🔴 **Bloqueadas** (rojo = mtto/OOO, problema activo)

   Vacías = **track gris implícito** del donut (background no destacado) + número aislado en leyenda (`Disponibles 15/22` muted). Pattern Apple Fitness rings — el track sin progress = potencial, no estado. Centro del donut: **`N° ocupadas / total`** en formato fracción (NO porcentaje aislado — el audit owner reportó "9% con 0 ocupadas" como bug de confianza).

241. **D-MOB-7 — Empty states con illustration + texto explícito, NUNCA `—` frío.** Owner audit visual 2026-06-08: card "Tu día — tareas activas" mostraba `—` (placeholder) lo cual el user interpreta como "esto está roto". Apple HIG Empty States: siempre mostrar mensaje explícito ("Día limpio · Sin pendientes urgentes en este momento" + emoji 🌱) o "0" tabular-nums. `AttentionList.tsx` implementa el patrón canónico mobile-v2.

242. **D-MOB-bg — Auto-refetch SSE incluye los 2 events nuevos de Etapa A.** `useMobileDashboard` hook se suscribe a `task:upgraded` + `task:moved` (Etapa A SSE events) + `room:moved` + `checkin:confirmed` + `checkout:early/confirmed` + `block:*` + `stay:no_show*` → cualquier evento operativo invalida el snapshot y refetcha inmediato. Sin esperar el poll de 60s.

243. **D-MOB-router — Router por rol con back-compat HK.** `apps/mobile/app/(app)/index.tsx` ramifica: si `user.role` es `SUPERVISOR` o `RECEPTIONIST` → renderea `DashboardScreenV2` (nuevo, consume `/v1/dashboard/mobile`). Si `HOUSEKEEPER` o no reconocido → renderea `DashboardScreenLegacy` (la implementación existente del Hub Recamarista mobile, sin tocar). Zero breaking change para HOUSEKEEPER del piloto.

244. **D-MOB-pull-to-refresh — `RefreshControl` + last-sync timestamp visibles en todos los dashboards mobile.** Pattern Airbnb Host + Mews Pocket + Stripe Dashboard mobile. Footer "Última actualización · hace X min" derivado client-side de `data.lastSyncIso`.

245. **D-MOB-tests — 6/6 tests verde** en `DashboardScreenV2.spec.tsx`: loading state · error state · supervisor happy path · supervisor empty attention (anti-regresión "—" frío) · receptionist happy path · D-MOB-1 (anti-regresión Walk-in tab no aparece). Uso `react-test-renderer` patrón existente del mobile (no `@testing-library/react-native` para no agregar dep). Mocks: `useMobileDashboard`, `expo-router`, `react-native-safe-area-context`, `react-native-svg`.

> **Sprint MOBILE-DASHBOARD Etapa A + B — cerradas 2026-06-08 con 18 tests verde (12 backend listeners + 6 mobile screen). PRs #97 + #98 mergeados. Plan completo en [docs/sprints/MOBILE-DASHBOARD-plan.md](docs/sprints/MOBILE-DASHBOARD-plan.md). Etapa C (QA + polish + tag mobile-v1, ~1.5d) restante para owner approval — Hub Recamarista mobile redesign queda DIFERIDO al sprint HK-MOBILE-REDESIGN porque tiene su propio scope (gamification + clock + per-task UX).**

### Payment modal unify — Sprint GROUP-BILLING Fase D (2026-05-30)

> Fase D del plan [GROUP-BILLING-CANCELLATION](docs/sprints/GROUP-BILLING-CANCELLATION-plan.md). Resuelve la nota del owner: los modales de pago (check-in, registrar pago, crear reserva) tenían 3 diseños distintos. NN/g H4 (Consistency) + CLAUDE.md §3 (Coherencia sistémica).

235. **D-GRP-D1 — `PaymentEntryFields` es el bloque canónico de pago, single source.** Nuevo `components/shared/PaymentFields.tsx` extrae TODO el bloque de captura del check-in (el diseño aprobado): método en grid de iconos tile (`PaymentMethodGrid`) + monto con `$` prefix `h-9 rounded-md` + referencia adaptive (POS/SPEI con tooltip) ó quick-fill "Cobrar saldo" + `ConversionLine`. Los 3 modales lo renderizan idéntico: `ConfirmCheckinDialog` (4 métodos), `RegisterPaymentDialog` (4 métodos), `CheckInDialog` creación (3 métodos, sin Cortesía — no aplica a un anticipo). Prohibido reimplementar campos de pago ad-hoc — se usa `PaymentEntryFields`. El `variant='row'`/`columns` previo se eliminó (un solo render posible).

236. **D-GRP-D2 — "OTA prepagado" NO es método manual seleccionable.** El cobro OTA se detecta automático vía Channex (`paymentModel = OTA_COLLECT`) al ingresar la reserva. Exponerlo como botón manual era ruido (Hick 1952) + fuente de error de captura. La enum `PaymentMethod.OTA_PREPAID` se conserva SOLO para mostrar movimientos OTA históricos (`PaymentMovementsList`), no para captura. Removido de `PAYMENT_METHOD_META`.

237. **D-GRP-D3 — Cortesía (COMP) bloquea el monto y cubre el saldo a 0.** Al seleccionar Cortesía: `amount = balance` automático (revenue allowance USALI — el comp se registra por el valor adeudado), input de monto `disabled`, columna derecha muestra chip ámbar "Sin cobro · saldo cubierto". El saldo proyectado da 0 end-to-end en check-in (`projectedBalance = balance − paymentSum`; COMP es override en `paymentValid`) y registrar pago (`newBalance = balance − amount`) sin lógica de waive aparte. **Corrección de fondo (§4 honestidad):** la creación de reserva ignoraba `paymentMethod` y NO creaba PaymentLog — el anticipo se escribía directo a `GuestStay.amountPaid` sin quedar auditable. Ahora `create()` persiste el anticipo como `PaymentLog` real (método + referencia + shiftDate, append-only USALI §28) cuando `amountPaid > 0`. DTO extendido con `paymentReference?`.

> **Sprint GROUP-BILLING Fase D — implementación cerrada 2026-05-30 con typecheck web + API verdes + 149/149 tests guest-stays verdes. Siguiente: Fase A GROUP-PAYMENTS (D-GRP-A1..A4).**

### Group payments — Sprint GROUP-BILLING Fase A (2026-05-30)

> Fase A del plan [GROUP-BILLING-CANCELLATION](docs/sprints/GROUP-BILLING-CANCELLATION-plan.md). Modelo "primary payer + per-stay" — quién paga qué dentro de un grupo OTA multi-room, sin folio agregado físico (eso es v1.0.1 PAY-CORE). Validado end-to-end en navegador (grupo Familia García 3 hab: cobro $720 → 3 folios PAID + check-in del titular).

238. **D-GRP-A1 — `PaymentLog.paidByStayId` + `transactionGroupId` (migration `20260610000000_group_payments_paid_by_stay`).** Cuando un huésped paga por OTRA habitación del grupo, el PaymentLog se registra contra la stay PAGADA (reduce su balance) pero `paidByStayId` apunta a QUIÉN entregó el dinero — arqueo correcto (el efectivo entró por el pagador) + balance correcto (la habitación pagada queda saldada). `transactionGroupId` (UUID) agrupa los N PaymentLogs de un mismo cobro de grupo para reconciliación. FK `paidByStay` con `onDelete: SetNull`. Relación `StayPayments` (renombrada de la default) + `StayPaidByPayments` (inversa). Hook `ReservationGroup.masterFolioId` sigue comentado para v1.0.1.

239. **D-GRP-A2 — Distribución proporcional al balance en `registerGroupPayment` (privado).** `registerPayment(stayId, dto)` ramifica: si `appliesToStayIds` tiene >1 entrada (o una ≠ stayId), delega a `registerGroupPayment`. Valida que TODAS las stays compartan el `reservationGroupId` del pagador + no estén cancelled/no-show. Distribuye `dto.amount` proporcional al balance de cada stay (`round2`, remanente a la última para cuadrar al centavo); crea 1 PaymentLog por stay con mismo `paidByStayId` + `transactionGroupId` en una `$transaction`; actualiza cada `amountPaid`/`paymentStatus`. Backward-compat: retorna el PaymentLog del pagador o el primero (el frontend espera 1 `PaymentLogDto`).

240. **D-GRP-A3 — `getGroupBalances(stayId)` + `GET /v1/guest-stays/:id/group-balances` + UI en BookingDetailSheet.** Endpoint retorna desglose per-stay `{stayId, roomNumber, guestName, balance, paymentStatus, checkedIn, cancelled, noShow, isContext}` ordenado por `groupRoomIndex`; `stays: []` si no es grupo. La sección Grupo del sheet ahora muestra por habitación un chip `[Debe $X]` (ámbar) ó `[✓ Pagado]` (emerald) + footer "Saldo pendiente del grupo $X" (ámbar) / "Grupo totalmente pagado" (emerald). **El sheet computa los balances de los datos del calendario que ya tiene (sin fetch extra); el endpoint alimenta el check-in (A4).**

241. **D-GRP-A4 — Selector "¿Quién paga?" en `ConfirmCheckinDialog` (enfoque A — chain, dialog-owned).** Cuando la stay es de grupo Y hay otras habitaciones con saldo, el step de Pago muestra segmented `Solo esta hab. / Todo el grupo`. En modo grupo: checkboxes de las stays cobrables (la contextual con badge ESTA, locked/checked) + `PaymentMethodGrid` + referencia condicional + "Total a cobrar · N hab. $X" (fijo = suma de balances). Al confirmar: (1) `guestStaysApi.registerPayment(esta, {amount: total, appliesToStayIds, paidByStayId: esta})` distribuye y salda; (2) invalida queries; (3) `onConfirm({payments: []})` → el padre corre `confirmCheckin` con saldo ya en 0. **El padre `TimelineScheduler` NO se modificó.** No atómico pero recuperable (si el check-in encadenado falla, los pagos quedaron registrados; el operador reintenta solo el check-in). `groupPaying` local bloquea doble-submit. **Bug de Fase D corregido de paso:** `registerPayment` backend exigía aprobación de manager para COMP/$0 → COMP del dialog nuevo habría dado 403; removido (coherente §C1.13).

> **Sprint GROUP-BILLING Fase A — implementación cerrada 2026-05-30 con typecheck web + API verdes + 156/156 tests guest-stays (7 nuevos group-payments) + validación end-to-end en navegador. Migration aplicada aislada (drift pre-existente en BD dev NO tocado). Siguiente: Fase B GROUP-CHECKIN-BULK (D-GRP-B1..B3).**

### Group check-in bulk — Sprint GROUP-BILLING Fase B (2026-06-01)

> Fase B del plan [GROUP-BILLING-CANCELLATION](docs/sprints/GROUP-BILLING-CANCELLATION-plan.md). Check-in coordinado de los miembros de un grupo OTA multi-room (Modos A individual + B bulk del §156). **Modo C (hostal per-bed) DIFERIDO** por decisión del owner — el modelo es per-room (`GuestStay.roomId` + `paxCount`, sin entidad de cama); per-bed names requiere decisión de esquema propia (sprint aparte). Validado end-to-end en navegador.

242. **D-GRP-B1/B2/B3 — `bulkCheckin` + `GroupCheckinDialog` (Modos A/B) + "no llegó" = skip + fix COMP Guard 7.**
   - **Backend `bulkCheckin(dto)` + `POST /v1/guest-stays/group-checkin`** (ruta literal antes de `:id`): recibe `{ members: [{stayId, guestName?}], documentVerified }`. Por miembro valida (no checked-in / no no-show / no cancelada / fecha llegada / saldo cubierto u OTA-collect) y, si pasa, confirma check-in + room OCCUPIED + rename opcional (split first/last title-case). **Cada miembro es independiente** (partial success — un fallo no aborta a los demás). Pago NO se procesa aquí (se cubre en A4 group payment / OTA / pago previo). Las habitaciones ausentes simplemente NO se incluyen en `members` → quedan pendientes para el night audit (§4.3, "no llegó" = skip).
   - **`GroupCheckinDialog` (Modos A/B):** entrada "Check-in del grupo" en la sección Grupo del `BookingDetailSheet` (botón primario cuando hay habitaciones pendientes; "Intercambiar habitación" pasa a secundario). Lista los miembros pendientes con checkbox "llegó" + input de nombre editable (rename opcional, D-GRP-B1/B2 — el sistema NO obliga) + atestación de identidad única por lote (§C1.13). Las habitaciones con saldo (no OTA) se muestran no-chequeables con hint "cóbrala primero". Modo C (hostal per-bed) NO implementado (diferido).
   - **Fix bug Fase D (COMP Guard 7):** `confirmCheckin` exigía `approvedById/approvalReason` para pagos COMP/$0 → un check-in con Cortesía (que el dialog Fase D ya no captura) daba **403**. Removido (coherente §C1.13 + §120-bis + el fix de Fase A en `registerPayment`). `approvedById/Reason` se siguen persistiendo si la UI los envía (backward-compat). Sin cobertura previa en specs — agregado test.

### Group color identity — Sprint GROUP-BADGE (2026-06-01)

> Refinamiento UX tras feedback owner: con varios grupos en pantalla, el badge/ring violeta UNIFORME no permitía distinguir "cuál grupo es cuál"; además la pastilla "👥 X/Y" tapaba el candado / flecha ↗ en la esquina superior derecha (saturada). Codificación redundante color + tooltip (Treisman 1980 pre-attentive + WCAG 1.4.1 no-solo-color).

243. **D-GRP-BADGE — identidad de grupo por color de ring (sin pastilla) + tooltip práctico + propagación a journey blocks.**
   - **`groupColor(groupId)` util** (`utils/groupColor.ts`): hue ESTABLE derivado del `reservationGroupId` (hash → índice en paleta de 8 tonos mutuamente distinguibles, ~≤10 antes de saturar — Healey & Enns 2012). El color vive SOLO en el ring del bloque (canal separado del relleno de estado §31) — distingue grupos de un vistazo sin colisión.
   - **Pastilla "👥 X/Y" REMOVIDA** del `BookingBlock` (decisión owner): tapaba el candado/flecha en la esquina superior derecha (candado `inset-y-0 right-1` + flecha journey `top-1 right-1` + vencido + OUT). El ring de color reemplaza la función de agrupación sin chocar con controles. En bloques de 1 noche (avatar-only, ~45px) el ring se refuerza (2px/0.65 vs 1.5px/0.45) para que el color lea sin pastilla.
   - **Propagación de identidad de grupo a journey blocks:** la query de timeline de `StayJourneyService` + el mapping de `useStayJourneys` NO incluían los group fields → un miembro de grupo que se extiende (journey) PERDÍA su ring de color en el calendario. Agregados `reservationGroupId`/`groupRoomIndex`/`reservationGroup{roomCount,primaryGuestName,channexOtaName}` al select + mapping.
   - **Tooltip de grupo (TooltipPortal) en 1 línea:** `👥 Grupo · Hab. 2/3 · 3/3 en casa`. Posición de la habitación (`groupRoomIndex/Count`, gratis) + progreso de llegadas (`inHouse/total`, agregado **client-side** en `BookingsLayer` vía `Map<groupId, GroupSummary>` dedupeado por miembro — SIN fetch). El **saldo del grupo NO se incluye en el tooltip** (§4 exactitud): los journey blocks mapean `amountPaid:0` → sería inexacto con miembros extendidos; el saldo exacto vive en la sección Grupo del `BookingDetailSheet` (A3). El nombre del titular vive en el sheet, no en el tooltip (evita truncado).

> **Sprint GROUP-BILLING Fase B + GROUP-BADGE — cerrados 2026-06-01 con typecheck web + API verdes + 163/163 tests guest-stays (7 nuevos bulk-checkin + 1 COMP) + validación end-to-end en navegador (Modos A/B + casos extensión/1-noche + tooltip). Siguiente: Fase C CANCELLATION-POLICY-ENGINE (D-GRP-C1..C8) — revenue + compliance blocker.**

### Cancellation policy engine — Sprint GROUP-BILLING Fase C (EN CURSO, branch `feat/cancellation-policy-engine`)

> **Fase C COMPLETA + AFINADA 2026-06-03** — C1 foundation + C2 wire + C3a/C3b cancel+refund UI + C4 group cancel + C5 Settings UI + bitácora fix + readiness reportes + **polish ReservationDetailPage estado cancelado**. Todo validado end-to-end en navegador (C5 simulador, group cancel, refund register, timeline "Reembolso registrado", pill "Cancelada"). **NO mergear** hasta autorización del owner.
>
> **Hallazgo paralelo — 3 bugs Channex (sprint aparte, NO en esta rama):** un test e2e en vivo contra `staging.channex.io` reveló que la cancelación PMS→Channex→OTA NO funciona hoy: (1) inbound resuelve propiedad por `Property.id == channex property_id` en vez de `PropertySettings.channexPropertyId` (`booking-new.handler.ts:122`) → `PROPERTY_NOT_FOUND`; (2) worker outbound compara `next_attempt_at <= NOW()` timezone-unsafe (BD dev no-UTC) (`channex-outbound-worker.service.ts`); (3) `cancelBookingAtChannex` envía payload incompleto → Channex **HTTP 422** → DEAD_LETTER (`channex.gateway.ts:597`). Los 93 tests unitarios no los detectan (mockean el HTTP del gateway). Documentado con repro en task spawneada. Bloquea la promesa "Channex avisa y cancela en la OTA" del piloto.

#### ✅ Etapa C1 — Foundation (commit `f2b23de`, rama `feat/cancellation-policy-engine`)

- **Schema + migración** `20260611000000_cancellation_policy`: modelo `CancellationPolicy` (propertyId, name, isDefault, freeWindowHours, `tiers: Json`, refundMode, `groupOverride: Json?`) + FK real `GuestStay.cancellationPolicy` (el hook `cancellationPolicyId` existía como string suelto desde CANCEL-ARCHIVE §95 — ahora es FK verdadera). Migración aplicada aislada.
- **Motor de cálculo puro** `computeCancellationOutcome(policy, stay, now)` en `src/pms/cancellation/cancellation-policy.service.ts`: función sin BD, retorna `{ free, retention, refund, appliedTier, hoursUntilCheckin, currency }`. Soporta NIGHTS/PERCENT/FIXED, cap al total, pago parcial, ventana gratuita, no-show (check-in pasado → último tramo). Default conservador: gratis ≥48h · 48-24h=1ª noche · <24h=100%.
- **CRUD** `CancellationPolicyService` (list/create/update + setDefault transaccional + validación de tramos) + controller `GET|POST|PATCH /v1/cancellation-policies` (SUPERVISOR) + `CancellationPolicyModule` registrado en `app.module.ts`.
- **Tests:** 9/9 motor puro + suite guest-stays+cancellation 172/172 verde. Typecheck API verde.

#### ✅ Etapa C2 — Wire al flujo real (commit en rama)

- **Migración** `20260612000000_cancel_refund_fields`: campos append-only en `GuestStay` (`cancelRetentionAmount`, `cancelRefundAmount`, `cancelRefundStatus` [NONE|PENDING|REFUNDED|WAIVED], `cancelRefundMethod`, `cancelRefundReference`, `cancelRefundAt`, `cancelRefundById`, `cancelRefundReason`). Patrón `noShowCharge*` (§195 D-NOSHOW). *Nota: los campos ya estaban en el schema.prisma desde C1 pero sin migrar — esta migración los aplica a la BD.*
- **`cancelStay()`** resuelve policy (helper privado `computeCancellationFor`: policy explícita → default property → default motor) → `computeCancellationOutcome()` → guarda `cancelRetentionAmount`/`cancelRefundAmount`/`cancelRefundStatus` (PENDING si reembolso>0, NONE si no) junto con `cancelledAt` en la misma `$transaction`.
- **`GET /v1/guest-stays/:id/cancellation-preview`** (`getCancellationPreview`) → outcome si se cancela AHORA. Read-only. Alimenta el preview del dialog.
- **`POST /v1/guest-stays/:id/register-cancel-refund`** (`registerCancelRefund` + `RegisterCancelRefundDto`) → registra el outcome del reembolso (REFUNDED|WAIVED × method/reference/reason). Guards: cancelada + status PENDING (append-only) + reason ≥5 si WAIVED. Mismo patrón que `registerNoShowCharge` (§198).
- **`create()`** populate `cancellationPolicyId` = policy default de la property (null si no hay).
- **Tests:** 7 nuevos en `guest-stays.cancel.spec` (outcome gratis/no-show + preview + register happy/guards/WAIVED) + 9 motor. Suite guest-stays+cancellation **179/179** verde. Typecheck API verde.

#### ✅ Etapa C3a — Cancel preview (commit en rama)

- **`CancelReservationDialog`** muestra el preview de retención/reembolso al elegir el iniciador: card emerald (ventana gratuita / sin penalización) ó amber (penalización · tramo). Líneas "Retención del hotel $X · Reembolso al huésped $Y". ADMIN_ERROR → "sin penalización, reembolso total". Sin pago → "nada que reembolsar".
- **Backend tweak:** `cancelStay` con `initiator='ADMIN_ERROR'` → override outcome a reembolso total (retención 0) — el dialog ya decía "Sin penalty" pero el motor no lo respetaba.
- **API + hooks:** `cancellationPreview` + `registerCancelRefund` en `guest-stays.api.ts`; `useCancellationPreview` (useQuery, enabled al abrir) + `useRegisterCancelRefund` (useMutation) en `useGuestStays.ts`.
- **Verificado end-to-end vía HTTP+JWT:** preview de un stay (pagó $720, check-in ~30h) → tramo NIGHTS 1, retención $180, reembolso $540. Typecheck web+API verde. (UI del dialog no capturada por glitch del preview tooling; card es binding directo a los datos verificados.)

#### ✅ Etapa C3b — RegisterCancelRefundDialog + integración drawer (commit en rama, validado end-to-end)

- `RegisterCancelRefundDialog` (nuevo, molde `RegisterNoShowChargeDialog`): status `REFUNDED|WAIVED` × método (efectivo/transferencia/OTA VCC/POS/otro) + referencia (req para transferencia/OTA) + razón (req si WAIVED) + monto editable (default = calculado, ajustable para parcial).
- **Acceso reachable = `CancelledTodayDrawer`** (no el sheet). Decisión clave tras detectar bug §1: las reservas canceladas se filtran del calendario y el `CancelledTodayDrawer` NO abre el `BookingDetailSheet` (solo "Restaurar") — el sheet quedaba **inalcanzable** para stays cancelados. El botón "Reembolso $Y" + dialog se montaron directamente en el drawer (botón cuando `row.type !== 'EXTENSION_SEGMENT' && cancelRefundStatus === 'PENDING'`; chips REFUNDED/WAIVED). La card en el sheet se mantiene como defensa pero el camino real es el drawer.
- **Plumbing:** (a) `GuestStayBlock` expone `cancelRetention/Refund*` (type + mapping `useGuestStays`); (b) **el backend `listCancelled` (`UnifiedRow`) reshapeaba sin los campos financieros** → se agregaron `currency` + `cancelRetentionAmount` + `cancelRefundAmount` + `cancelRefundStatus` al push de filas STAY. Sin esto el drawer recibía las filas sin el outcome y el botón nunca aparecía.
- **Verificado end-to-end en navegador:** cancelar "Ext Miembro 2" (pagó $720, check-in ~30h) → tramo NIGHTS 1, retención $180, reembolso $540 PENDING → drawer muestra botón "Reembolso USD 540" → dialog abre con A reembolsar 540 / Retención 180 / USD → registrar con referencia SPEI → status **PENDING → REFUNDED**. Typecheck web+API verde. 41/41 (cancel + cancellation-policy specs).

#### ✅ Etapa C4 — Group cancel (commit en rama, validado end-to-end)

- **Backend `cancelGroup(dto, actorId)` + `POST /v1/guest-stays/group-cancel`** (ruta literal antes de `:id`): recibe `{ stayIds[], initiator, reason? }`. Valida que todas pertenezcan al mismo grupo + sean cancelables (mismos guards que `cancelStay`). En una `$transaction` cancela cada miembro (política propia → snapshot retención/reembolso, journey cascade, room cleanup, audit). Tras la tx recomputa miembros activos: **0 restantes → marca `ReservationGroup.cancelledAt`** (total); **>0 → parcial** (grupo sigue vivo). Una sola notif resumen al SUPERVISOR.
- **`GET /v1/guest-stays/:id/group-cancellation-preview`** (`getGroupCancellationPreview`) → retención/reembolso por miembro + flags `cancellable`/`checkedIn`/`cancelled` + `otaName`. Alimenta el dialog. Read-only.
- **`GroupCancelDialog` (nuevo)** — molde `GroupCheckinDialog` (Radix primitives §116 + DialogActions destructive §123), acento rojo. Checkbox por miembro cancelable + "Seleccionar todas" + selector de iniciador (GUEST/HOTEL/OTA/ADMIN_ERROR) + razón opcional + **resumen agregado** "Cancelar N de M · Retiene $X · Reembolsa $Y". Botón "Cancelar grupo" agregado a la sección Grupo del `BookingDetailSheet` (rojo outline, debajo de intercambiar).
- **Channex (decisión honesta D-GRP-C6):** `CHANNEX_BOOKING_MODIFY_REQUESTED` **NO existe** (§157 lo daba por hecho — el worker de modify nunca se construyó). Por eso: **total OTA → emite `CANCEL`** (cancela la reserva OTA completa, correcto); **parcial OTA originado por el hotel (HOTEL/ADMIN_ERROR) → NO auto-cancela** (un CANCEL borraría toda la reserva OTA) → levanta notif `ACTION_REQUIRED` al SUPERVISOR para ajuste manual en el extranet + el dialog muestra aviso ámbar. Grupos directos (sin OTA): parcial 100% correcto sin Channex. El push "modify" parcial real queda diferido a un sprint Channex MODIFY aparte.
- **Verificado end-to-end en navegador:** grupo Smith Family (expedia, 2 hab Pagadas) → "Cancelar grupo" → dialog con ambos miembros (reembolso 360 c/u) + aviso OTA parcial → cancelar 1 (John Smith, GUEST) → DB: John Smith cancelled + refund 360 PENDING, Sarah activa, **grupo cancelledAt=null** (parcial). Tests: 5 nuevos en `guest-stays.cancel.spec` (parcial / total marca grupo / grupos distintos / sin grupo / preview por miembro). Suite guest-stays **175/175** + cancellation **46/46** verde. Typecheck web+API verde.

#### ⏳ Etapa C5 — Settings UI (PENDIENTE)

- Nueva sección `Settings → Políticas de cancelación` (D-GRP-C1).
- Form: name + freeWindowHours + tramos visuales (timeline de penalización) + preview "qué pasaría si cancela hoy" (llama `cancellation-preview` con `now=now()`).
- CRUD con toggle isDefault.

#### ✅ Etapa C5 — Settings UI (commit en rama, validado end-to-end)

- **Tab "Cancelaciones" en `/settings/cancellation`** (`CancellationPoliciesSection` en `apps/web/src/pages/settings/`). Modelo alineado con la competencia (research Cloudbeds Smart Policies / Mews / OPERA / Little Hotelier): la política es un **objeto reutilizable con nombre** (no per-reserva), con ventana gratuita + tramos NIGHTS/PERCENT/FIXED + isDefault. CRUD contra `GET|POST|PATCH /v1/cancellation-policies` (ya existían desde C1).
- **Presets canónicos** Flexible / Moderada / Estricta / No-reembolsable (alineados Airbnb + Booking.com) — el hotel parte de uno y lo personaliza ("cada hotel expresa su propia política", resuelve el temor del owner de imponer una universal). No-reembolsable usa `freeWindowHours = 1_000_000` (nunca gratis).
- **Diferenciador — simulador en dinero** (`computeOutcomePreview`, espejo client-side EXACTO del motor backend `computeCancellationOutcome`): muestra en vivo "si un huésped que pagó $X cancela 10d/3d/1d/6h antes / no-show → retiene $Y, reembolsa $Z". Ningún competidor muestra un simulador de dinero en su pantalla de config (research confirmado).
- **Editor:** unit toggle días/horas para la ventana gratuita, tramos editables con hint de días, validación `fromHours > toHours`. SUPERVISOR-only para crear/editar (guards backend ya existían).
- **Validado end-to-end:** tab renderiza → preset Moderada → simulador computa (10d/3d gratis, 6h/no-show retiene 2000) → crear política → BD persiste (Moderada, isDefault=true, 72h, 2 tramos). Typecheck web+API verde.

#### ✅ Bitácora / timeline — reflejar reembolso (commit en rama)

- **Gap detectado:** `registerCancelRefund` actualizaba la stay en silencio — el reembolso NO aparecía en el timeline del huésped (las cancelaciones SÍ vía `GuestStayLog 'CANCELLED'` + `StayJourneyEvent`). Fix: `registerCancelRefund` ahora escribe `GuestStayLog event='CANCEL_REFUND_REGISTERED'` (en `$transaction` con el update) + `ReservationDetailPage.renderEvent` lo renderiza ("Reembolso registrado · $X vía transferencia" emerald, o "Reembolso no aplicado" slate si WAIVED). `cancelGroup` ya logueaba por miembro.

#### ✅ Polish — ReservationDetailPage refleja estado cancelado (commit en rama, validado)

- Gap detectado en validación de navegador (2026-06-03): la página de detalle nivel 2 mostraba una reserva CANCELADA como "Llegada" con botón "Confirmar check-in" (el check-in se bloquea en backend §231, pero la UX engañaba). Fix: `isCancelled = !!data.cancelledAt` → header pill "Cancelada" (rojo) + StatTile Estado "Cancelada" + se ocultan CTAs check-in/checkout/in-house. `GuestStayDto.cancelledAt` agregado a `packages/shared` (findOne ya lo retornaba en runtime). Validado en navegador.

#### ✅ Readiness BD para reportes (análisis + decisión)

- **Análisis profundo** (3 agentes: reportes hoteleros + columnas más solicitadas + config competencia + esquema). Conclusión clave: **el reporte de cancelaciones/no-shows ya es query-ready** — los campos que la competencia más olvida (retención vs reembolso SEPARADOS + estado + iniciador + canal + lead time) YA existen en `GuestStay`, y los índices `@@index([cancelledAt])` + `@@index([noShowAt])` ya están. No se agregaron columnas muertas.
- **Checklist REPORTS-CORE diferido** (campos que requieren wiring de sprints futuros, NO se agregan hasta su sprint): `GuestStay.ratePlanId` (Sprint 8 RATES), `commissionRate/Amount` (Sprint 8), `marketSegment`, `PaymentLog.baseAmount/fxRate` + `departmentCode/revenueCenter` (v1.0.1 PAY-CORE), y **`MetricsDailySnapshot`** con **on-the-books-por-fecha-futura + bookings-made-that-day** (v1.0.3 REPORTS-CORE) — el análisis recalca que pace/pickup/STLY son IMPOSIBLES de reconstruir retroactivamente sin el snapshot diario. Columnas más universales (Tier 1-2) y fórmulas USALI documentadas en el análisis (handoff a REPORTS-CORE).

#### Pendiente diferido (sprint aparte) — Channex MODIFY parcial

- Construir `CHANNEX_BOOKING_MODIFY_REQUESTED` + outbound kind + worker dispatch (`PUT /bookings/:id` con array de rooms restantes) para que el cancel PARCIAL de un grupo OTA empuje la modificación automáticamente, en vez de la notif de ajuste manual actual. Cierra la promesa §157.

#### Datos de prueba en BD dev

- `tc-grpA` (Grupo Extensión, 2 habs, Jun 5-9) y `tc-grpB` (Familia UnaNoche, 2 habs, Jun 2-3) sembrados para testing visual — **no son datos de producción**, se pueden limpiar.

---

### Reservation edit pre-check-in — Sprint RESERVATION-EDIT-PRECHECKIN (CERRADO en rama `feat/reservation-edit-precheckin`, 2026-06-16, SIN merge)

> Reprogramar el rango `[checkinAt, scheduledCheckout)` de una reserva que aún NO ha hecho check-in (adelantar/retrasar/alargar/acortar) sin cancelar+recrear. Decisiones confirmadas con owner antes de codear; fundamentadas con estudio de 6 PMS (Cloudbeds/Mews/OPERA/Little Hotelier/RoomRaccoon/Sirvoy) + AHLEI/USALI. Endpoint `POST /v1/guest-stays/:id/edit-dates` + `GET …/edit-dates-preview` + `EditReservationDatesDialog`.

- **D-REP-1 — Reserva OTA (`channexBookingId`): editar local + aviso forcing + notif, NUNCA bloquear.** El push MODIFY a Channex no existe (§157), pero la **disponibilidad SÍ se sincroniza en vivo**: `editReservationDates` emite `notifyRelease(rango viejo)` + `notifyReservation(rango nuevo)` → libera las noches anteriores y bloquea las nuevas en la OTA (anti-overbooking real, mismo outbox §139-§148). Lo único pendiente de ajuste manual es el *registro* del booking en el extranet → evento desacoplado `RESERVATION_OTA_DATES_ADJUST` (§141, no import cruzado) → `ChannexOutboundNotifService.raiseManualOtaAdjust` (notif ACTION_REQUIRED HIGH al SUPERVISOR + push). Respuesta lleva `requiresOtaManualAdjust` → el dialog muestra aviso ámbar con copy explícito anti-overbooking. Patrón §152 (Airbnb) / D-CHX-FIX-3b.

- **D-REP-2 — Rango libre en cualquier dirección; llegada NUNCA antes de hoy; recepcionista autónomo + auditoría.** Consenso 6/6 PMS: mover fechas de una reserva no llegada es una sola acción (no cancelar+recrear). Único guard duro de fecha: `toLocalDate(newCheckIn, tz) >= toLocalDate(hoy, tz)` (timezone de la propiedad §12) — mover al día anterior es imposible. NO hay gate de aprobación del supervisor (cuello de botella operativo, §120-bis); la garantía es la **trazabilidad**: `GuestStayLog event='DATES_EDITED'` con checkIn/checkOut/room/rate antes→después + actor + reason (§11). Invariante: `checkOut > checkIn`.

- **D-REP-3 — Cambio de habitación SOLO como salida ante conflicto, no feature primaria.** El diálogo edita fechas en la MISMA habitación; si el nuevo rango no cabe, el preview ofrece `alternatives[]` (habitaciones libres del mismo `RoomType`, cap 8 — Hick 1952, ya verificadas con `AvailabilityService.check`). Mover de habitación con igual rango se hace con drag&drop / botones existentes (room-move). `newRoomId` opcional.

- **D-REP-4 — Tarifa: conservar la pactada por defecto, toggle "recotizar" opcional.** Default conserva `ratePerNight` pactado (recalcula `noches × tarifa`, aditivo §28) — patrón Little Hotelier, evita sorpresas al huésped (verificable: no-reembolsable=locked / flexible=re-quote es el eje real, "rate integrity/parity" NO significan honrar-al-modificar; nomenclatura propia "Conservar tarifa" vs "Recotizar"). Toggle `reprice` recotiza al precio vigente del `RoomType` destino vía `RatesService.getRateQuoteGrid` (suma noches half-open, promedia el ratePerNight plano); fallback graceful a conservar si no hay tarifas. Preview muestra ambos montos lado a lado (`keptTotal`/`repricedTotal`) antes de confirmar. El toggle solo se ofrece cuando la recotización difiere de la pactada (evita ruido).

- **D-REP-5 — Self-exclusión COMPLETA: excluir la fila GuestStay Y su journey/segmentos.** Bug hallado verificando en navegador (no detectable por smoke HTTP que siempre movía a rangos disjuntos): `checkAvailability` excluía solo `excludeStayIds` (la fila GuestStay), pero el query de `StaySegment` cuenta el segmento ORIGINAL propio → **alargar/acortar el propio rango daba un falso 409 contra uno mismo** (el caso más común). Fix: `checkAvailability(...excludeJourneyId?)` propaga a `availability.check`; edit/preview/alternativas pasan `stay.stayJourney.id`. Test de self-overlap agregado. Regla general: toda reorganización del propio rango debe excluir el journey, no solo la stay.

- **D-REP-6 — El preview tiene estado de carga explícito; default seguro no es "conflicto".** Mientras el preview carga (`preview === undefined`), `available` cae a `false` por default → el diálogo mostraba "Hab. ocupada" falsamente. Fix: estado "Verificando disponibilidad…" antes de tener datos. Principio: un estado de carga nunca debe renderizar como un estado de error/conflicto.

> **Verificación e2e (navegador real, §1):** botón "Editar fechas" gated a pre-check-in sin extensiones → diálogo → preview disponible/conflicto+alternativas/OTA anti-overbooking/toggle tarifa → recálculo en vivo (2→4 noches, saldo 150→300) → guardar → persiste GuestStay+journey+segmento+audit `DATES_EDITED`+notif OTA+toast+refresh calendario. Tests: 20/20 `guest-stays.edit-dates` + 222/222 suite guest-stays+availability. typecheck api+web verde. Contratos `EditDatesPreview`/`EditReservationDatesResult` en `packages/shared`. Datos de prueba movidos en BD dev (Modify Me, María, Hk Privesc) — re-seedeables.

---

### Overbooking hardening — Sprint OVERBOOKING-HARDENING (CERRADO en rama `fix/overbooking-hardening`, 2026-06-17, SIN merge)

> Auditoría sistémica de TODOS los puntos de escritura de inventario (recepción, journeys, Channex/OTA, estados terminales). Un hueco crítico **secuencial** fue confirmado con E2E (`lateCheckout` extendía la salida sobre la noche de la reserva back-to-back → noche vendida 2 veces) y otros validaban disponibilidad pero sin lock transaccional (race check→write, posible incluso single-instance porque el event loop intercala otra request durante el `await`). Solo `create` y `editReservationDates` tenían el patrón seguro. Plan: [docs/sprints/OVERBOOKING-HARDENING-plan.md](docs/sprints/OVERBOOKING-HARDENING-plan.md).

- **D-OB-1 — Patrón canónico único: lock + re-check DENTRO de la tx.** Toda escritura que ocupe/extienda inventario abre `$transaction`, toma `pg_advisory_xact_lock(hashtext('walk-in:'+roomId)::bigint)` — **misma key en TODOS los flujos** para que recepción, OTA, extensiones, moves, restore/revert y swap serialicen entre sí sobre la misma habitación — re-valida con self-exclusión bajo el lock, y recién entonces escribe. Helper compartido `GuestStaysService.lockAndAssertAvailable(tx, checks[])` (lock multi-habitación ordenado por roomId para evitar deadlocks + re-check per-rango). `AvailabilityCheckDto.excludeJourneyIds` (array) nuevo para el swap (excluir 2 journeys).

- **D-OB-2 — Graves que NO validaban → ahora validan.** `lateCheckout` valida el rango extendido (un late checkout que cruza a la siguiente noche la ocupa; same-day no añade noche y pasa). `swapStayRooms` valida que cada reserva quepa en la habitación de la otra (excluyendo A y B), con lock dual — antes una 3ª reserva en la habitación destino producía overbooking.

- **D-OB-3 — Race (validaban sin lock) → check movido dentro de la tx con lock.** `moveRoom`, `restoreStay`, `revertNoShow` (este conserva su guard manual como fail-fast). En `stay-journeys`, `assertRoomAvailable` acepta `tx` y toma el lock; sus callers (`extendSameRoom`/`extendNewRoom`/`executeMidStayRoomMove`/`initJourneyAndExtend`/`moveExtensionRoom`) llaman el check DENTRO de su `$transaction`; `splitReservation` toma el lock por habitación dentro de la tx.

- **D-OB-4 — Channex inbound usa el MISMO lock que recepción.** `booking-new` (single + multi-room) y `booking-modify` re-validan bajo `walk-in:<roomId>` dentro de su tx; si pierden la carrera contra un walk-in que ocupó la habitación entre el check y el commit, **persisten como conflicto** (`channexConflict=true` / `AVAILABILITY_OVERLAP`, revisión humana D-CHX5) en vez de crear overbooking. Cierra la race staff↔OTA (antes el inbound y recepción usaban locks distintos / ninguno).

> **Verificación:** typecheck api verde · suite guest-stays+stay-journeys+availability+channex **339/339** (incl. test de regresión `lateCheckout`→ConflictException + ajuste booking-new) · **E2E real:** A(mar1-3)+B(mar3-5) back-to-back; `lateCheckout(A→mar4)` → **409** "se solapa con Reg Bbb (conflicto al adquirir lock)"; `lateCheckout(A→mar3 16:00)` mismo día → éxito. Pendiente: PR + merge tras autorización owner. **Out of scope (deuda separada, no overbooking):** validación cross-property de `newRoomId` en `moveRoom` (compartida con el patrón ya cerrado en editReservationDates).

---

### Channex PMS Certification — Sprint CHANNEX-CERT-RESTRICTIONS (EN CURSO, branch `chore/channex-cert-prep`, 2026-06-20)

> Sesión para ejecutar la **certificación PMS de Channex** (formulario oficial: Setup Testing Property + 14 Test Scenarios). Cerró el gap real que impedía completarla: el push de **restricciones** (min_stay / stop_sell / CTA / CTD / max_stay) nunca se cableó (sprints previos cablearon precios + disponibilidad y dejaron restricciones explícitamente diferidas). **Todo verificado e2e contra `staging.channex.io` — task IDs REALES.** **NO mergear** sin autorización del owner.

**Setup Testing Property (verificado, no creado — un intento previo la dejó bien):** `Test Property - Zenix` (`94d70281-07a8-4e6b-9273-724fa3b725dd`, USD) · 2 room types Twin (`2e0b297f…`) + Double (`cdff8770…`) occ 2 · 4 rate plans BAR 100 / B&B 120 por tipo (`88a90aa7`/`56319005`/`c57ad75e`/`ca745836`). Mapeada en BD dev a `prop-channex-cert`.

**Decisiones (se §-numeran al cerrar — D-CERT-RESTR):**
- **D-CERT-1 — `ChannexRatePlanLink` (tabla nueva, additive).** En Zenix un `RatePlan` es a nivel propiedad (BAR/B&B) y `RoomType` es aparte; en Channex el rate_plan es por room type. La combinación real es **(roomType × ratePlan) → channex rate_plan_id**. `ChannexRatePlanMapping` (Command Center) sólo guardaba 1 plan por room type → no distinguía BAR vs B&B (insuficiente para Tests 3-8). Nueva tabla `channex_rate_plan_links` enlaza el par exacto. Migración additive `20260620000000_channex_cert_restrictions` (+ `RateRestriction.stopSell` + `ChannexOutboundQueue.lastTaskId`) aplicada aislada (BD dev tiene drift de migraciones previas; patrón db execute + migrate resolve). Seed `seed-channex-cert-rateplans.ts` (2 RatePlans + 4 links).
- **D-CERT-2 — `RatesService.applyRatesAndRestrictions` (batch, 1 push).** Endpoint `POST /v1/rates/ari/batch` (SUPERVISOR). Recibe N líneas (roomType×ratePlan×rango) con tarifa y/o restricciones; persiste local (RateOverride + RateRestriction) y emite **UN** `CHANNEX_RESTRICTION_UPDATED` con todas las entries → el builder crea 1 row → el worker hace **1 POST /restrictions** (batching obligatorio de la cert; "looping per-date" reprueba). Resuelve el channex rate_plan_id por el link. **No toca** los métodos existentes (override/bulk) → cero riesgo para Hotel Tulum.
- **D-CERT-3 — min_stay → `min_stay_through` (descubierto e2e).** Esta propiedad **no soporta `min_stay` plano** (Channex responde `data:[]` + warning, NO crea task); requiere `min_stay_through`. El mapper usa `minStayThrough`. Además el gateway ahora **loggea `meta.warnings`** para no marcar SUCCEEDED en silencio.
- **D-CERT-4 — Full-sync rates+restrictions implementado.** `buildRestrictionEntries` del `FullSyncOrchestrator` (antes scaffold `[]`) ahora genera entries por link × día con tarifa resuelta (override ?? base) + restricciones que solapan. Test 1 produce los 2 task IDs (availability 1000 entries + rates/restrictions 2000 entries para 500 días).
- **D-CERT-5 — UI Restricciones (Settings → Tarifas → Restricciones).** Editor en lote estilo Cloudbeds/Mews: filas (hab · plan · rango · min/max stay · cerrar venta · CTA · CTD · tarifa) → "Aplicar N cambios" = 1 sync. Recuadro explicativo de cada restricción. Verificado en navegador (dispara task id real `ae823e06…`). Hook `useApplyAri`.
- **D-CERT-6 — Worker captura `lastTaskId`.** El worker persiste el task id devuelto por Channex en `channex_outbound_queue.last_task_id` (evidencia de cert sin scraping de logs).
- **D-CERT-7 — Feed inbound resolvía la propiedad por la columna equivocada (bug, destapado por Test 11).** `channex-feed.scheduler.ts` hacía `propertySettings.findUnique({ where: { propertyId: revision.property_id } })` — pero `revision.property_id` es el UUID de Channex, no el id local → **orphaneaba TODA reserva OTA real** de una propiedad mapeada vía `channexPropertyId`. Fix: resolver por `channexPropertyId` (mismo mapeo §190/D-CHX-FIX-1). El downstream (puller) traduce channex→local, por eso `acceptDelivery` sigue recibiendo el id crudo.

**Resultados de la certificación (task IDs reales, staging Channex):**
| Test | task id(s) |
|---|---|
| 1 Full sync | avail `690be87b-6f53-42bf-b931-33baf4c865e0` · rates/restr `52b263f2-1b82-45aa-9174-bf82bec8eb22` |
| 2 1 fecha/1 tarifa | `d6b74fdb-6a2e-47e7-a5f3-2c0c22def74b` |
| 3 1 fecha/varias tarifas | `ab621965-931b-4b5e-baa4-212ac251cc4f` |
| 4 varias fechas/varias tarifas | `e2b749b7-7286-4387-8202-9e8c39232cec` |
| 5 Min stay | `4b6f826c-dfaf-44b9-b49c-80bb9da4da76` |
| 6 Stop sell | `26ae0673-98cd-4b86-852d-362b95876713` |
| 7 Múltiples restricciones | `4bf71cc9-a330-4ce3-87d8-c28d0ae004ac` |
| 8 Half-year | `887c19b2-126d-4112-93fb-eb8b0646d1e4` |
| 9 Disp. 1 fecha | `7830adc1-30ee-4598-94b7-c6328276b24a` |
| 10 Disp. rangos | Twin `e3070c5b-5533-4586-ac77-533b6fc7acfb` · Double `0ccf1c2b-eb6d-4496-b372-bde394a16c42` |
| 11 Booking receiving | Channex booking `c383a3cc-9bc3-43ef-b129-930ddbfd1e98` (OTA `BDC-ZENIX-CERT-11`) |

**Test 11 (ejecutado e2e en el navegador, de inicio a fin):** instalado app **Booking CRS** en Channex → creada reserva entrante (Booking.com, Test Property - Zenix, Carlos Certguest, Jul 10-12, 200 USD) → el PMS la recibió vía feed (`BookingNewHandler created stay=c2ebd29f`) + **ack** (`acked revision=7a87ee71`) → **modify** (OTA commission 0→15, `BookingModifyHandler updated` + ack `222a0a64`) → **cancel** (status Cancelled, `BookingCancelHandler cancelled` + SSE `channex:stay:cancelled` + ack `d58ea504`). Estado final en Channex: **Cancelled + Acked ✓** (el check verde persiste a través de New→Modified→Cancelled). Tests 12-14 son declarativos (rate-limit token bucket / updates delta-only por eventos / notas) — el sistema ya cumple.

**Test 11 — captura del PMS (deliverable "screenshots from your system with this Booking"):** segunda reserva entrante **activa** creada para evidencia limpia — `BDC-ZENIX-CERT-11B` (Channex booking `7b48c81c-5337-4bee-818f-07b89a791bcf`, Maria Receptora, Booking.com, Jul 20-22, Hab. Double 201). Recibida + acked por el PMS (`BookingNewHandler created stay=b23d6ebc` + `acked revision=28f1ade6`) y **verificada en el calendario de Zenix** (`/pms`): el buscador global la encuentra y el `BookingDetailSheet` muestra guest + chip Booking.com + código OTA `ZENIX-CERT-11B` + fechas + Hab. 201 + **CHANNEX ID `7b48c81c…`** + "Última sync OTA". Bug encontrado de paso: el viewport del preview arrancó en 2px (cosmético del entorno, resuelto con resize). **Bug REAL del feed corregido (D-CERT-7)** sin el cual ninguna reserva OTA entraba al PMS en prod.

**Verificación:** typecheck api+web verde · suites afectadas 33/33 (full-sync orchestrator + outbound worker, specs actualizados) · UI Restricciones verificada en navegador (preview) · 11/11 task IDs reales de staging. **Salvedad honesta (§4):** el push de restricciones se disparó por el endpoint real del PMS (capa de integración en el codebase principal, no script suelto); la UI de Restricciones está construida y verificada para el screenshare de Stage 4. El api-key sigue **sin Booking CRS write** (403) — NO bloquea la cert (no hay test que cree/cancele booking vía PMS→Channex; eso es el diferenciador opcional §150/§157).

### Channex cancel round-trip — Sprint CHANNEX-CANCEL-FIX (EN CURSO, branch `fix/channex-cancel-roundtrip`)

> Arrancado 2026-06-03 tras descubrir en un test e2e en vivo (contra `staging.channex.io`) que el flujo de cancelación PMS→Channex→OTA NO funcionaba. Los 93 tests unitarios no lo detectaban porque mockean el HTTP del gateway. **NO mergear** sin autorización del owner. Fase C ya está en main (PR #74).

**3 bugs corregidos + validados e2e en vivo:**

- **D-CHX-FIX-1 — Inbound property resolution.** `booking-new.handler.ts` resolvía la propiedad por `Property.id == revision.property_id` (UUID de Channex), pero el mapeo vive en `PropertySettings.channexPropertyId` (§190) → toda reserva OTA caía en `PROPERTY_NOT_FOUND` y no se reflejaba. **Fix en chokepoint único:** el `ChannexRevisionPullerService` traduce `revision.property_id` Channex→`Property.id` interno antes del dispatch (si no hay mapeo, deja el id crudo → el handler levanta PROPERTY_NOT_FOUND correctamente). **Validado:** la stay AHORA se crea al recibir el webhook.

- **D-CHX-FIX-2 — Worker timezone-unsafe.** `channex-outbound-worker.service.ts` + `channex-outbox.scheduler.ts` comparaban `next_attempt_at <= NOW()`: la columna es Prisma DateTime (`timestamp` SIN tz, wall-clock UTC) y `NOW()` es `timestamptz` casteado a la sesión → en BD con sesión ≠ UTC (dev en America/Mexico_City) los rows esperaban ~6h. **Fix:** `next_attempt_at <= (NOW() AT TIME ZONE 'UTC')` (mismo frame UTC). **Validado:** el worker toma la row automáticamente, sin nudge manual.

- **D-CHX-FIX-3 — Gateway cancel payload incompleto (CRÍTICO).** `cancelBookingAtChannex` enviaba `{booking:{status:'cancelled'}}`; Channex valida el objeto booking COMPLETO en el `PUT /bookings/:id` → 422 → DEAD_LETTER → la OTA nunca se cancelaba. **Fix:** nuevo `getBooking(id)` trae la booking completa; `cancelBookingAtChannex` la re-arma íntegra (currency/ota_name/property_id/fechas/customer/rooms con `room_type_id`+`rate_plan_id`) + `status:cancelled`. Manejo gracioso de 2 casos que Channex NO puede cancelar programáticamente → `raiseManualOtaCancel` al SUPERVISOR (no DEAD_LETTER): (a) **Airbnb** (regla regulatoria §152); (b) **booking OTA sin mapear** (rooms con `room_type_id` null → canal sin mapear en Channex). **Validado e2e:** el 422 progresó de "todos los campos blank" → "rooms ids blank" → con el guard, la booking de prueba del sandbox (sin mapear) hace SKIP+notif "Cancela en BookingCom manualmente". **El flip final a `cancelled` no se validó con ESA booking porque está sin mapear (room_type_id null); una booking con rooms mapeados (canal OTA conectado real) sí lo haría — el payload es correcto.**

**Confirmación doc Channex:** el Booking CRS API permite "create, modify and cancel bookings (even if it came over OTA)" — **en Beta**, requiere el objeto completo.

**🔴 BLOQUEANTE EXTERNO descubierto 2026-06-03 (no es bug de código): el api-key de Channex NO tiene Booking CRS write habilitado.** Probado en vivo contra `staging.channex.io`:
- `GET /booking_revisions/:id` → **200** (booking READ ✅)
- `POST /availability` → **200** (ARI write ✅)
- `POST /bookings` → **403 Forbidden** (booking CREATE ❌)
- `PUT /bookings/:id` (cancel con room_type_id válido) → **403 Forbidden** (booking WRITE ❌)

Es decir: el api-key puede leer bookings + escribir ARI, pero **NO puede crear/modificar/cancelar bookings** (Booking CRS es Beta y requiere habilitación a nivel de cuenta Channex). **Mapear las habitaciones NO desbloquea esto** — el blocker es el permiso, no el mapeo. Por tanto el flip a "cancelled" en la OTA **no se puede validar ni ejecutar hoy** con esta cuenta. **Acción del owner:** solicitar a Channex habilitar Booking CRS write en la cuenta/api-key. Hasta entonces, las cancelaciones de bookings OTA originadas en el PMS deben hacerse manualmente en el extranet de la OTA.

**D-CHX-FIX-3b — manejo gracioso del 403 (+ unmapped + airbnb):** dado que el 403 es permanente (reintentar siempre da 403), `cancelBookingAtChannex` retorna `skipped:'forbidden'` en 403 (igual que `'unmapped'` y `'airbnb'`) → el worker NO hace DEAD_LETTER, levanta `raiseManualOtaCancel` al SUPERVISOR ("Cancela en {OTA} manualmente"). Validado en vivo el path gracioso (caso 'unmapped' → notif → SUCCEEDED; 'forbidden' usa el mismo handler downstream). Esto es el comportamiento CORRECTO por defecto mientras CRS write no esté habilitado.

**Lo que SÍ se validó end-to-end en Zenix:** inbound crea la stay (bug 1), worker despacha solo (bug 2), cancel → notif al supervisor para ajuste manual (bug 3 gracioso). **Lo que NO se pudo validar:** el flip automático a "cancelled" en el dashboard de Channex (bloqueado por el 403 de permisos de cuenta).

**¿El 403 bloquea la CERTIFICACIÓN? NO** (verificado contra `channex.cert-tests.integration.spec.ts`). La cert PMS valida (a) recibir reservas — Test 11 `booking_revisions` feed + `getBookingRevision` + `ack` (booking READ, ✅ 200) y (b) empujar ARI — Tests 1-10 availability/rates/restrictions (ARI WRITE, ✅ 200 `POST /availability`). **No existe ningún cert test que cree/cancele una reserva.** El Booking CRS write (lo único en 403) es una feature Beta opcional FUERA del alcance de la cert. Acción del owner: solicitar a Channex habilitar Booking CRS write (solo para el diferenciador opcional §150/§157, no para certificar). PR #75 mergeado a main (commit `a183599`).

### CHECK-IN modal redesign — C2/C3 cerrados vía GROUP-BILLING (2026-06-03)

Verificado: lo planeado para CHECK-IN C2/C3 ya se entregó en el sprint GROUP-BILLING:
- **C2 auto-detección multi-room (§154):** ✅ `booking-new.handler.ts` crea `ReservationGroup` + N hijas cuando `revision.rooms.length > 1` (spec `booking-new.handler.multi-room.spec.ts`).
- **C2 walk-in + identidad de grupo visual:** ✅ botón Walk-in en `TimelineTopBar` + **GROUP-BADGE** (color ring §243) reemplazó el bracket SVG planeado.
- **C3 GroupCheckinDialog modos A/B (§156):** ✅ Fase B (`GroupCheckinDialog`). **Modo C (hostal per-bed): DIFERIDO por decisión del owner** (el modelo es per-room; per-bed names requiere decisión de esquema propia — sprint aparte). C1 (bug fixes + walk-in ancho + nacionalidad/género) cerrado 2026-05-29 §229-§234.
- **Pendiente real del roadmap v1.0.0:** RATES-METRICS-COMPSET-CORE (abajo).

### Rates core — Sprint RATES-METRICS-COMPSET-CORE Fase 1 (EN CURSO, branch `feat/rates-metrics-core`)

> Arrancado 2026-06-03. Plan completo en [docs/sprints/RATES-METRICS-COMPSET-CORE-plan.md](docs/sprints/RATES-METRICS-COMPSET-CORE-plan.md) (~20-23 días-dev, 3 capas: Rates + Métricas + Compset). Revenue blocker + desbloquea Channex cert Tests 2-8. **NO mergear** hasta avanzar más. Decisiones D-RATES1..6 se §-numeran al cerrar.

**Fase 1 — Schema Rates + resolver puro (commit en rama):**
- **Schema + migración** `20260613000000_rates_core`: 6 modelos `RatePlan` + `RateSeason` + `DayOfWeekRule` + `RateRestriction` + `Promotion` + `RateOverride` (§4.1 del plan) + relaciones inversas en `Property` (ratePlans/promotions/rateOverrides) + `RoomType` (rateSeasons). Migración aplicada aislada (db execute + migrate resolve).
- **Resolver puro** `resolveNightlyRate(input)` en `src/pms/rates/rate-resolver.ts` — precedencia **D-RATES2**: (1) RateOverride manual gana siempre → (2) RateSeason (overrideRate ó base×multiplier) × DayOfWeekRule del día → (3) base del plan (FIXED=baseRate / MULTIPLIER=BAR×mult / BAR=BAR). Season con overrideRate NO se modula por día de semana; season roomType-specific gana sobre la general. Función sin BD, testeable (patrón `computeCancellationOutcome`).
- **Tests:** 9/9 `rate-resolver.spec.ts`. Typecheck API verde.

**Capa Rates CERRADA (2026-06-03) — backend + UI + validado e2e en navegador:**
- **RatesService** extendido (sin duplicar — reusó el módulo `rates` de FX-CORE): `getRateQuoteGrid(...,ratePlanId?)` resuelve con el motor; `resolvePrice` (debug, devuelve la capa que ganó); CRUD `RatePlan` (list/create/update/deactivate soft-delete); CRUD `RateSeason`; CRUD `RateRestriction` (create/delete); `RateOverride` upsert + **`bulkUpdateOverrides` con `dryRun` (preview obligatorio, NN/g H5)**; `setDayOfWeekRules` (set completo, deleteMany+create en tx). Helpers compartidos `assertPlanInProperty`/`validateDateRange`/`validateRateOrMultiplier`.
- **Endpoints** `/v1/rates`: `quote?ratePlanId`, `resolve-price`, `plans` (GET/POST/PATCH/DELETE), `plans/:id/day-of-week` (PUT), `seasons`, `restrictions`, `overrides`, `overrides/bulk` — mutaciones `@Roles(SUPERVISOR)`. DTOs class-validator. `api.put` agregado al cliente web (genérico, timeout 20s §122).
- **UI** Settings → **Tarifas** (`/settings/rates`, `RatesManagerSection`): sub-tab Planes (lista + editor con estrategia + temporadas inline + **ajuste por día de semana** 7 inputs) + sub-tab Calendario (grid RoomType × 14 días con tarifa resuelta + bulk-override con preview). Reusa/extiende `useRates`.
- **Validado e2e en navegador:** plan ×0.8 → calendario recalcula (130→104); bulk preview "70 tarifas, 56→150"; día de semana Sábado ×1.5 → resolve-price 130→195 (lunes 130). Tests **27/27** (9 resolver + 18 servicio). Typecheck web+API verde.
- **Sales:** Módulo 2.6 "Tarifas / Revenue Management" agregado a [zenix-sales-master.md](docs/zenix-sales-master.md) con tabla de diferenciadores honestos (preview H5 + resolución transparente + LATAM-first; yield/IA diferido a v1.1.x).
- **Diferido (config sin enforcement = no se construye hasta su sprint):** `RateRestriction` enforcement at-booking (MLOS/CTA en AvailabilityService) + `Promotion` apply-at-booking + UI de restricciones/promociones. El schema + backend de restrictions existe; la UI llega cuando se wire el enforcement.

**Fase 2 — Métricas: BACKEND cerrado (2026-06-03, commit en rama), validado e2e en vivo:**
- **Schema + migración** `20260614000000_metrics_daily_snapshot`: modelo `MetricsDailySnapshot` (§4.2 — capacidad/ocupación, room revenue/ADR/RevPAR, cancel/no-show/llegadas/salidas counts, avg LOS/lead time, channelMix Json, revenueByRoomType Json) + relación inversa Property. Migración aislada.
- **MetricsService** (`src/pms/metrics/`, NO usa TenantContext — cron-friendly, el caller pasa orgId): `computeDailySnapshot(propertyId, orgId, date)` calcula KPIs USALI (ocupación = sold/available; ADR = rev/sold; RevPAR = rev/available; noche D = [00:00 D, 00:00 D+1), checkout no cuenta) + upsert idempotente por [property,date]; `backfillSnapshots` reconstruye histórico; `getRange` para charts.
- **MetricsSnapshotScheduler** dedicado `@Cron('0 4 * * *')` — puebla "ayer" para todas las properties. **NO se entrelazó con NightAuditScheduler** (frágil, multi-tz) — scheduler propio + upsert idempotente.
- **Endpoints** `/v1/metrics` (SUPERVISOR — revenue): `range`, `backfill`. Controller inyecta TenantContext + pasa orgId al servicio.
- **Validado e2e en vivo:** backfill 14 snapshots del seed → range 06-01 ocupación 54.55% (12/22), ADR 141.08, RevPAR 76.95, mix por canal. ADR×occ=RevPAR ✓. Tests 30/30 (9 resolver + 18 rates service + 3 metrics). Typecheck API verde.
- **Fase 2 dashboard UI (commit en rama, validado e2e):** `MetricsOverview` (`apps/web/src/components/`) en `DashboardPage` — headline KPIs del último cierre (ocupación/ADR/RevPAR/ingreso) + tendencia de ocupación 14 días (bars con tooltip) + mix por canal. Hook `useMetrics.useMetricsRange` (`/v1/metrics/range`, `retry:false` por el 403). **SUPERVISOR-only** (gateado en el caller + endpoint). Validado en navegador: 06-02 ocupación 41% (9/22), ADR USD 150, RevPAR USD 61, mix Booking 4/Direct 3/Airbnb 2/Expedia 1. Typecheck web+API verde.
- **Fase 2 extendido — pace/pickup/STLY/forecast heatmap (cerrada 2026-06-06):** Backend ya en main (PR #78, commit `ab2f9d6`): `MetricsForwardSnapshot` model + migration `20260615000000_metrics_forward_snapshot` + `MetricsService.captureForwardSnapshot` + `getPickup` + `getPace` con STLY (`stlyRoomsOnBooks`/`stlyOccupancyPercent`) + endpoints `/v1/metrics/{forward-capture,pickup,pace}` + scheduler nocturno captura forward 90d. Frontend en main: `PickupSection` (tabla 14d pickup deltas + pace YoY 7d series + banner honestidad "primer día de captura"). **Cierre 2026-06-06 (rama `feat/rates-metrics-fase2-pace`):** nuevo componente `ForecastHeatmap` — 28 días (4 semanas × 7 días) heatmap con sequential single-hue color scale (slate→amber→emerald per occupancy band 0/40/60/75/90), today highlighted indigo border, hover tooltip rooms+occ+YoY pts, peak night + avg occupancy en header. Wired al `DashboardPage` entre `MetricsOverview` y `PickupSection`. Reusa `usePace` hook (sin endpoint nuevo). Justificación visual Treisman 1980 (pre-attentive color) + WCAG 1.4.1 (color + número redundante). Complementario, no reemplazo: PickupSection = "qué CAMBIÓ" granular vertical; ForecastHeatmap = "DÓNDE está la demanda" big picture escaneable <1s. Siguiente: Fase 3 Compset MVP (`/settings/compset` selección manual 3-7 competidores + scraping DIY + `LocalEvent` cuáles 4-niveles geo-scope + Events Curator role).

**Tests:** unit gateway/worker/notif/puller 58/58 + AP-2.6 cert verde (whitelist `getBooking` + filtro JSDoc). Suite channex = baseline (44 fails DB-integration pre-existentes en main, 0 nuevos). Typecheck API verde. Decisiones D-CHX-FIX-1..3 se §-numeran al cerrar el sprint.

---

> **Sprint CHANNEX-AUTO-PROVISION — implementación cerrada 2026-05-28 con 886/920 backend tests verdes (10 nuevos Netflix + 30+ nuevos AUTO-PROVISION + 9 fails pre-existentes en main no relacionados) + 7 commits sobre `feature/netflix-trial-flow` (sprint compuesto: Netflix Days 1-2 + AUTO-PROVISION Days 1-5/6-7)**. Stack final del AUTO-PROVISION: 9 gateway methods nuevos (createProperty/updateProperty/getProperty/createGroup/assignPropertyToGroup/createChannel/updateChannel/deleteChannel/upsertChannelRoomType/upsertChannelRatePlan) alineados con Channex API oficial; `ChannelCredentialsCryptoService` AES-256-GCM con KEK en .env; `ChannexProvisionService` con pipeline Group → Property → RoomTypes → RatePlans → Channels best-effort outside-tx; `ChannexProvisionController` con 3 endpoints RESTful nested `GET /v1/nova/organizations/provisioning` + `POST /v1/nova/properties/:propertyId/channex/provision` (con flag opcional `force=true` para delete-recreate de channels existentes) + `POST /v1/nova/channex/channels/:channelId/credentials` (completar credentials de channels pending) — todos NovaActingOrgGuard + defense-in-depth IDOR check; frontend `/nova/billing/channex` recovery UI con state machine + per-property cards + StatusChips + error <details> + retry mutation idempotente + `CompleteCredentialsDialog` per-OTA-fields (mismo contrato que StepChannels) + botón externo "Abrir Airbnb extranet" para channels `requires_oauth`; wizard Step 5.5 channels selection UI (Days 3-4 commits previos) + Step 8 preview con counts; schema migration `20260604000000_channex_auto_provision` (Organization.channexGroupId + LegalEntity.channexApiKey + PropertySettings provisioning fields + new Channel model con UNIQUE constraint). Docs: `docs/architecture/channex-provisioning-flow.md` con diagramas + cert alignment + recovery flow + `docs/ops/channex-credentials-rotation.md` runbook standalone (API key + KEK paths, normal + emergency, cold migration script, GDPR breach notification). Integration spec sandbox `channex-provision.integration.spec.ts` (6 escenarios opt-in con `CHANNEX_API_KEY`: createGroup + createProperty con group_id + 2 RoomTypes + 4 RatePlans + 1 Channel + updateChannel toggle, con cleanup orden inverso). Pendientes post-sprint: (a) AIRBNB-OAUTH sprint para completar el OAuth handshake; (b) RATES-METRICS sprint para sustituir el placeholder $100 BAR con rates reales (Tests cert 2-8); (c) merge `feature/netflix-trial-flow` → `main` post-validación owner del flow end-to-end con cliente piloto real.

---

### Booking Engine "Zenix Booking" — Sprint BOOKING-ENGINE B0-B5 (EN CURSO, branch `feat/booking-engine-foundation`)

> Motor de reservas directas headless (v1.1.0). **API-first**: el website del hotel (lo construye el owner/un tercero) consume la API por HTTP; Zenix recibe la data, valida inventario y **genera la reserva** (`source='DIRECT_WEB'`, cero comisión OTA). Plan + casos de uso en [docs/sprints/BOOKING-ENGINE-plan.md](docs/sprints/BOOKING-ENGINE-plan.md) + [BOOKING-ENGINE-use-cases.md](docs/sprints/BOOKING-ENGINE-use-cases.md). Commits `2445853` (B0-B5) + `54a76b1` (B5 polish). **NO mergear** sin autorización del owner. Decisiones D-BE se §-numeran al cerrar el sprint.

- **D-BE-1 — Secuencia Opción B (PAY_AT_HOTEL-first), decisión owner 2026-06-11.** Fase 1 captura reservas con **pago en recepción**, CERO dependencia Stripe/PAY-CORE. El prepago online (Stripe Elements/Connect + OXXO/MercadoPago/SPEI) es **Fase P (post-PAY-CORE v1.0.1)**. El checkout se construye con `BookingEngineConfig.paymentPolicy` (`FULL_PREPAY|DEPOSIT_30|DEPOSIT_50|PAY_AT_HOTEL`) pero en Fase 1 sólo `PAY_AT_HOTEL` opera; los demás se exponen deshabilitados. El prepago se *enchufa* sin reescribir el flujo. Justificación: desacopla releases + entrega valor antes + el insight nuclear (reserva directa sin comisión) no requiere prepago.

- **D-BE-2 — Se reserva un TIPO de habitación, Zenix asigna la física (§137 pattern).** El body del POST es `rooms[]`, cada línea con su propio `roomTypeId` + fechas + `adults/children` → soporta multi-tipo / multi-fecha / grupo nativamente. Zenix elige la habitación física libre del tipo vía `AvailabilityService.check` (§35). Atómico: si CUALQUIER línea falla (capacidad o disponibilidad) se rechaza TODA la reserva. N>1 → `ReservationGroup` (§153). `paxCount` validado contra `RoomType.maxOccupancy`. Modelo per-room + paxCount (per-bed nominal de hostal diferido).

- **D-BE-3 — Defensa de overbooking en 3 capas.** (1) Feed advisory `GET /availability-calendar` (per-noche por tipo) → el date-picker pinta en gris fechas sin cupo. (2) Webhook `availability.changed` (push HMAC) → el website invalida su calendario cacheado al instante. (3) **Guard transaccional §35 en el POST = única garantía real** → el segundo en la carrera recibe **409**. El cliente nunca previene 100% la carrera; el servidor sí.

- **D-BE-4 — Auth dual: API key (Tier 3) vs slug-scoped first-party (hosted page).** `POST /v1/public/reservations` exige `X-API-Key` (`BookingApiKey` patrón Stripe restricted-key: `pk_{env}_{keyId16}{secret32}`, persiste keyId plano + bcrypt(secret), CORS por `allowedOrigins[]`) — para websites externos. `POST /v1/public/properties/:slug/reservations` SIN API key (resuelve por slug) — para la **hosted page first-party** `book.zenix.com/{slug}` que sirve Zenix (no puede exponer pk_live_ en el cliente); protegida por rate-limit per-IP. Patrón Cloudbeds/Mews. Idempotencia por `(scopeId, Idempotency-Key)` donde scopeId = key id ó `hosted:{propertyId}`.

  > 🔴 **Corrección del 2026-09-24 — dos cambios sobre esta decisión, sin tocar su fondo.**
  >
  > 1. **El prefijo pasa de `pk_` a `sk_`.** La decisión decía «patrón Stripe restricted-key» y copió el prefijo equivocado: en el vocabulario de Stripe, `pk_` es *publishable* —seguro en el navegador— y esta llave **crea reservas**. La prueba de que el nombre estaba mal es que la guía de integración tuvo que escribir «**nunca la pongas en el frontend**» justo al lado: **un nombre que necesita una advertencia es el nombre equivocado**. Las `pk_` emitidas siguen verificándose —el prefijo no es material criptográfico— y su uso queda en el log para saber cuándo retirarlas.
  > 2. **`allowedOrigins[]` deja de ser opcional para el navegador.** La regla original —«si declara orígenes y llega uno que no está, 403»— se lee al revés: **lista vacía = cualquier origen**, y vacía era el valor por omisión. Ahora, una petición **con cabecera `Origin`** exige lista declarada y coincidente; **sin `Origin`** (servidor a servidor) se permite como siempre.
  >
  > Se cambia ahora porque es incompatible y hoy afecta a **un** hotel. Con diez clientes sería una migración coordinada con diez desarrolladores ajenos.

- **D-BE-5 — Webhooks outbound = mirror del outbound Channex (§144).** `WebhookSubscription` + `WebhookDelivery` + `WebhookDispatcher` (HMAC-SHA256 `X-Zenix-Signature`, backoff 1s/5s/30s/5m/30m, max 5 → DEAD_LETTER + notif supervisor) + `WebhookRetryScheduler` (@Cron 30s). El listener reusa el evento `channex.availability.changed` (§141) que YA se emite en cambios de inventario de cualquier fuente + `booking.*`. Eventos: `reservation.created` + `availability.changed`.

- **D-BE-6 — Booking Engine es OPCIONAL, gestionado desde el panel Nova.** Se cobra extra; el cliente puede no quererlo. `BookingEngineConfig` es 1:1 con Property y NULLABLE (sin config → API responde 404 = motor apagado). `BookingEngineManagementController` `/v1/nova/booking-engine` (Nova-scoped + IDOR check §191): **toggle on/off** (crea config al vuelo si se activa, sin wizard), upsert config, generate/revoke API key, create/toggle webhook. UI `NovaBookingEnginePage` (sidebar "Zenix Booking"). El Step 5.5 del wizard es skippeable. Verificado e2e en navegador.

- **D-BE-7 — Hosted page = ruta pública en `apps/web` (patrón PrecheckinPage), no app separada aún.** `/book/:slug` (en `PUBLIC_ROUTE_PREFIXES` → sin shell PMS/SSE de staff; lazy code-split → el huésped no descarga el bundle PMS). Mobile-first search→results→checkout→confirmation, branding del config vía API, banner PAY_AT_HOTEL, maneja 409, SEO (title/meta/OG + JSON-LD schema.org Hotel client-side). **B5.1 diferido (infra-coupled):** extracción a `apps/booking-page/` standalone + SSR cuando se provisione `book.zenix.com` — el payoff (deploy independiente + SSR) depende de infra no decidida; la extracción es refactor de empaque, no de funcionalidad.

- **D-BE-8 — `GuestStay.source='DIRECT_WEB'` (String libre, sin migration de enum).** SRC char `'W'` en el `bookingRef` (`MX-W-...`). `paymentModel='HOTEL_COLLECT'`, `paymentStatus=PENDING`, saldo se cobra en recepción con el flujo existente (§28). SSE `booking:created` (nuevo SseEventType) refresca el calendario de recepción (§124). Cada reserva crea GuestStay + StayJourney + StaySegment ORIGINAL (mirror del path canónico §137) para que move/extend/cancel funcionen.

- **D-BE-9 — Hardening post bug-hunt (2026-06-11), antes de merge.** Auditoría doble (seguridad + correctitud) encontró y se corrigieron: (1) **race de overbooking** — la asignación de habitación + re-check de disponibilidad ahora corren DENTRO de `$transaction` bajo `pg_advisory_xact_lock(hashtext('booking:'+propertyId))` (mismo patrón que `guest-stays.create` BUG #9 §); antes el check corría fuera de tx → dos reservas web concurrentes podían sobre-reservar. (2) **Idempotencia atómica** — el record se inserta DENTRO de la tx bajo lock (antes era best-effort post-commit → dup bajo concurrencia); P2002 → 409 limpio. (3) **CORS producción** — middleware abre `/api/v1/public/*` a cualquier origen (READ público + WRITE con X-API-Key, sin cookies); sin esto el motor era inservible cross-origin en prod (el website del hotel vive en otro dominio). (4) **Webhook dead-letter** ya NO emite SSE `booking:created` fantasma (sin stayId). (5) **SSRF** — URL de webhook validada contra hosts internos (loopback/RFC1918/169.254/.internal). (6) **System staff password** randomBytes (era determinista). (7) calendar valida fechas (400). (8) currency del response = tarifa real (no displayCurrency). Tests: 13/13 public-booking + e2e. **Diferidos (documentados, no bloquean piloto single-instance):** aislamiento test/live keys (comparten DB — sandbox compartido por diseño Fase 1), `FOR UPDATE SKIP LOCKED` en retry scheduler (solo multi-instance), `trust proxy` para rate-limit per-IP tras LB.

- **Monetización dual (§6 del plan, schema hooks listos, Fase P):** Tier 1 incluido en plan PMS ($0 comisión); Tier 2 Marketplace opt-in 3-5% vía Stripe Connect split + `CommissionLog` (cuando aterrice PAY-CORE).

- **Pendientes:** B6 (OpenAPI/Swagger docs + sandbox), B7 (QA + piloto), B5.1 (extracción + SSR), Fase P (prepago). Follow-ups menores: `reservation.cancelled` webhook (hoy cubierto por `availability.changed`), `DELETE`/cancel público (requiere wire del cancel engine Fase C).

---

