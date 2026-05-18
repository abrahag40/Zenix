# Sprint FX-LATAM — Plan formal

> **Status:** Propuesta lista para implementación · **Autor del research:** sesión 2026-05-17 · **Sprint estimado:** 3-5 días (4 países first batch) · **Versión target:** v1.0.4 (paralelizable con IMG + DEBT-α)
>
> **Precede:** `CHECK-IN-α` (PR #34+impl) — reusa el `lookupFxRate` bidireccional y el shape `secondaryRates: Record<string, number | null>` ya en producción.
> **Bloqueante de:** primer cliente Zenix fuera de MX. Sin esto, una `LegalEntity` colombiana se activa pero el check-in muestra COP primary sin conversión secundaria → degrada UX desde el día 1.

---

## 0. Resumen ejecutivo

La arquitectura multi-tenant 4-level (`CLAUDE.md §63`) + `LegalEntity.baseCurrency` (§64) + `PropertyFxRate` (§103) ya soporta **modelo de datos multi-país**. Lo que falta es:

1. **Strategy pattern de FX adapters** — paralelo al `IFiscalAdapter` (§89 PAC providers). Hoy `FxService.refreshBanxicoDaily` está hardcoded a Banxico MX.
2. **Adapters concretos por país** — Banco de la República (CO), BCCR (CR), SBS (PE) como first batch. Argentina (BCRA), Brasil (BCB) y Guatemala (BANGUAT) en batches posteriores.
3. **UI multi-par en `FxSection.tsx`** — hoy hardcoded a USD↔MXN.
4. **Override del set "tourist currencies" per-property** — hoy `getSecondaryFxRates` tiene targets `{USD, EUR, MXN}` hardcoded. Una sucursal Argentina no necesita MXN.
5. **Zenix Activate wizard etapa 4b** — actualizar `docs/vision/13` para que el consultor configure FX explícitamente al activar una `LegalEntity` nueva.

**Métrica objetivo:** activar una `LegalEntity` colombiana en el wizard → al siguiente check-in en una property de esa LegalEntity, ver `COP X primary + ≈ USD Y + ≈ EUR Z secondary`, sin intervención manual del manager.

---

## 1. Research — APIs de bancos centrales LATAM

### 1.1 Matriz de fuentes oficiales

| País | Banco / Fuente | Endpoint público | Auth | Rate limit | Frecuencia publicación |
|---|---|---|---|---|---|
| **MX** | Banxico SF43718 (FIX) | [SIE API](https://www.banxico.org.mx/SieAPIRest/service/v1/) | Token gratuito (40k req/día) | Generoso | Diaria, 12:00 CST, DOF |
| **CO** | Banco de la República TRM | [webservice TRM](https://www.banrep.gov.co/es/estadisticas/trm) — endpoint REST `https://www.datos.gov.co/resource/32sa-8pi3.json` | Sin auth (Datos Abiertos GOV) | Open Data CO ~1k req/hora | Diaria, 18:30 COL time |
| **PE** | SBS Tipo de Cambio | [API SBS](https://www.sbs.gob.pe/app/pp/sistip_portal/paginas/publicacion/tiposdecambioPublicador.aspx) — endpoint `/sbsif-portal-services-rest/api/tipoCambio` | Sin auth | Sin documentar | Diaria, 18:00 PE time |
| **CR** | BCCR Indicadores Económicos | [webservice BCCR SOAP](https://gee.bccr.fi.cr/Indicadores/Suscripciones/WS/wsindicadoreseconomicos.asmx) — series 317 (venta) / 318 (compra) | Suscripción gratuita (email + nombre + token) | Generoso | Diaria, 18:00 CR time |
| **AR** | BCRA Comunicación "A" 3500 (oficial) | [APIs BCRA](https://api.bcra.gob.ar/estadisticas/v3.0/Monetarias/4) | Sin auth | Sin documentar | Diaria, pero ojo: **AR tiene oficial/MEP/CCL/blue** — distintos rates legales para distintos usos |
| **BR** | BCB PTAX | [API Olinda BCB](https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/aplicacao) | Sin auth | Sin documentar | 4 veces al día (PTAX-1, 2, 3, fechamento) |
| **GT** | BANGUAT | [Servicios web BANGUAT](https://banguat.gob.gt/cambio/) — SOAP `/variables/ws/TipoCambio.asmx` | Sin auth | Sin documentar | Diaria, 16:00 GT time |
| **HN** | BCH | [BCH endpoint](https://www.bch.hn/estadisticas-y-publicaciones-economicas/tipos-de-cambio) — sin API REST pública estable | Scraping requerido (riesgo) | n/a | Diaria, 14:00 HN time |
| **PA, SV** | USD nativo | n/a — `LegalEntity.baseCurrency='USD'` | n/a | n/a | n/a |

### 1.2 First batch decidido

| País | Razón |
|---|---|
| **MX** | ya hecho, refactorizar a `BanxicoMxAdapter` clase |
| **CO** | Banrep TRM es API simple sin auth, Datos Abiertos GOV es estable. Primer cliente fuera de MX más probable. |
| **CR** | BCCR webservice estable (Tribu-CR es target de plan §89). Suscripción gratuita un solo click. |
| **PE** | SBS endpoint REST simple. Volumen turístico boutique alto. |

### 1.3 Batches futuros (NO scope FX-LATAM)

| País | Razón de aplazar |
|---|---|
| **AR** | Complejidad rates múltiples (oficial vs MEP vs CCL vs blue). Necesita decisión de producto sobre cuál usar para hospedaje turístico. Investigar con contador AR. |
| **BR** | Sprint posterior por §93 — Brasil entra a Zenix post v1.2 con Sovos como `FiscalAdapter`. FX integration vendría junto. |
| **GT, HN** | Volumen actual bajo según roadmap v1.0.x. Agregar bajo demanda. |
| **PA, SV** | Sin necesidad de adapter — USD nativo. Property currency = USD, ningún cron necesario. |

---

## 2. Estado actual de Zenix — gaps específicos

### 2.1 Backend

| ID | Gap | Archivo:línea | Severidad |
|----|-----|---------------|-----------|
| FX-1 | `FxService.refreshBanxicoDaily` no extiende a otros países | `apps/api/src/pms/rates/fx.service.ts:105` | 🔴 Alto |
| FX-2 | No existe `IFxAdapter` interface — `FxService` hace todo monolíticamente | `apps/api/src/pms/rates/fx.service.ts` | 🔴 Alto |
| FX-3 | `FiscalRegime` no tiene `fxAdapterClass` (paralelo a `pacAdapterClass` §69) | `apps/api/prisma/schema.prisma` `FiscalRegime` model | 🟠 Alto |
| FX-4 | Cron único `@Cron('0 13 * * *', 'America/Mexico_City')` — cada país necesita su huso | `apps/api/src/pms/rates/fx.service.ts:105` | 🟠 Alto |
| FX-5 | `getSecondaryFxRates` targets hardcoded `{USD, EUR, MXN}` | `apps/api/src/pms/guest-stays/guest-stays.service.ts` (este sprint) | 🟡 Medio |
| FX-6 | Sin `PropertySettings.secondaryDisplayCurrencies` override per-property | `apps/api/prisma/schema.prisma` `PropertySettings` | 🟡 Medio |

### 2.2 Frontend

| ID | Gap | Archivo:línea | Severidad |
|----|-----|---------------|-----------|
| FX-W1 | `FxSection.tsx` hardcoded a USD↔MXN — manager CO no puede configurar USD↔COP | `apps/web/src/components/settings/FxSection.tsx:40,76` | 🔴 Alto |
| FX-W2 | `FxRateWidget.tsx` mismo problema (dashboard widget) | `apps/web/src/components/FxRateWidget.tsx:40` | 🟠 Medio |
| FX-W3 | Sin indicador en check-in dialog cuando rates están vacíos para esa LegalEntity | `ConfirmCheckinDialog.tsx` | 🟡 Bajo (nice-to-have) |

### 2.3 Zenix Activate wizard

| ID | Gap | Archivo | Severidad |
|----|-----|---------|-----------|
| FX-WZ1 | Etapa "FX & Currency" no especificada en `docs/vision/13` | `docs/vision/13-consultant-setup-wizard.md` | 🟠 Alto (cuando se construya v1.2) |

---

## 3. Decisión de diseño: Strategy pattern paralelo al `IFiscalAdapter`

### 3.1 Principios aplicados

| Principio | Cita | Aplicación |
|---|---|---|
| Open/Closed (Meyer 1988) | Open for extension, closed for modification | Agregar país nuevo = 1 adapter class + 1 row `FiscalRegime`. Sin tocar `FxService`. |
| Strategy pattern (GoF 1994) | Encapsular variación algorítmica | Cada `IFxAdapter` encapsula su API HTTP, parsing, schedule. |
| **§89 antecedente** | `IFiscalAdapter` ya estableció este patrón para PACs | Reusar la decisión arquitectónica — consistencia mata genialidad. |
| Fail-soft per-país | Si Banrep CO está caído, MX no se afecta | Cada adapter corre en su propio try/catch + log; un error no bloquea los demás. |

### 3.2 Interface propuesta

```typescript
export interface IFxAdapter {
  /** ISO 3166-1 alpha-2 — 'MX', 'CO', 'PE'... */
  readonly countryCode: string

  /** Moneda local primary del país — 'MXN', 'COP', 'PEN', 'CRC'... */
  readonly primaryCurrency: string

  /** Cron expression (UTC interno; el adapter convierte a su tz local). */
  readonly cronSchedule: string  // e.g. '0 13 * * *'
  readonly cronTimezone: string  // e.g. 'America/Mexico_City'

  /**
   * Llamada al banco central. Retorna pares base→quote con su fecha efectiva.
   * Idempotente: si llama 2× el mismo día, retorna las mismas rates.
   * Fail-soft: lanza si falla; el caller hace el try/catch + log + alerta.
   */
  fetchOfficial(): Promise<Array<{
    baseCurrency:  string
    quoteCurrency: string
    rate:          number  // 1 baseCurrency = rate quoteCurrency
    effectiveDate: Date
    source:        string  // 'BANXICO_SF43718', 'BANREP_TRM', etc.
  }>>
}
```

### 3.3 Schema change minimal

```prisma
model FiscalRegime {
  // ... existing fields ...
  pacAdapterClass  String?  @map("pac_adapter_class")  // ya existe §69
  fxAdapterClass   String?  @map("fx_adapter_class")   // NUEVO
}

model PropertySettings {
  // ... existing fields ...
  /**
   * Override per-property del set de monedas a mostrar como secundarias en
   * el check-in dialog. Si null, fallback a las "tourist defaults" por país:
   *   MX/CO/CR/PE → ['USD', 'EUR']
   *   AR          → ['USD']  (EUR poco usado por turistas Argentina)
   *   default     → ['USD', 'EUR']
   * Nunca incluye la propia baseCurrency.
   */
  secondaryDisplayCurrencies String[]  @default([])  @map("secondary_display_currencies")
}
```

### 3.4 Auto-registro de crons al boot

```typescript
@Injectable()
export class FxAdapterRegistry implements OnModuleInit {
  private readonly adapters = new Map<string, IFxAdapter>()

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly fxService: FxService,
    private readonly prisma:    PrismaService,
  ) {}

  async onModuleInit() {
    // Carga adapters desde class registry (1 import per país).
    this.register(new BanxicoMxAdapter())
    this.register(new BancoRepublicaCoAdapter())
    this.register(new BccrCrAdapter())
    this.register(new SbsPeAdapter())

    // Registra cron per-adapter usando @nestjs/schedule programático.
    for (const adapter of this.adapters.values()) {
      const job = new CronJob(
        adapter.cronSchedule,
        () => this.runAdapter(adapter),
        null, true, adapter.cronTimezone,
      )
      this.schedulerRegistry.addCronJob(`fx-${adapter.countryCode}`, job)
    }
  }

  private async runAdapter(adapter: IFxAdapter) {
    try {
      const rates = await adapter.fetchOfficial()
      // Para cada LegalEntity con countryCode == adapter.countryCode, persist
      for (const r of rates) {
        await this.fxService.storeRate({ ...r, organizationId: /* per-org */ })
      }
    } catch (err) {
      this.logger.warn(`[FX][${adapter.countryCode}] adapter failed: ${err}`)
      // Fail-soft: log + SSE alerta admin, sin throw.
    }
  }
}
```

---

## 4. Implementación — plan day-by-day

### Día 1 — Refactor backend a Strategy pattern

**Tareas:**
1. **Crear** `apps/api/src/pms/rates/adapters/fx-adapter.interface.ts` con `IFxAdapter`.
2. **Migrar** `FxService.fetchBanxicoFix` → nueva clase `BanxicoMxAdapter implements IFxAdapter` en `adapters/banxico-mx.adapter.ts`. Mantener tests existentes verdes.
3. **Migration** `add_fx_adapter_class_to_fiscal_regime`:
   ```prisma
   model FiscalRegime { fxAdapterClass String? @map("fx_adapter_class") }
   ```
4. **Seed update** — sembrar `fxAdapterClass: 'BanxicoMxAdapter'` para `FiscalRegime` MX.
5. **`FxAdapterRegistry`** nuevo Injectable + `OnModuleInit` con auto-cron registration.
6. **Refactor** `FxService.refreshBanxicoDaily` cron → eliminar; el registry lo agenda.
7. **Tests:** refactor `fx.service.spec.ts` para mock del Registry; nuevo `banxico-mx.adapter.spec.ts`.

**Deliverable:** 0 funcionalidad nueva, solo arquitectura. Tests verdes paridad.

### Día 2 — Adapters CO + CR

**Tareas:**
1. **`BancoRepublicaCoAdapter`** — endpoint Datos Abiertos `https://www.datos.gov.co/resource/32sa-8pi3.json` (TRM diario). Parsing JSON simple. Cron `0 19 * * *` `America/Bogota`.
2. **`BccrCrAdapter`** — webservice SOAP `wsindicadoreseconomicos.asmx`, series 317 (venta USD) y 318 (compra USD). Necesita token de suscripción gratuita; documentar en `.env.example` como `BCCR_API_TOKEN`. Cron `0 19 * * *` `America/Costa_Rica`.
3. **Seed update** — `FiscalRegime` CO y CR con sus respectivos `fxAdapterClass`.
4. **Tests** de cada adapter con HTTP mock (Nock o MSW).

**Deliverable:** 2 adapters productivos + 4-6 tests cada uno + docs `.env.example`.

### Día 3 — Adapter PE + UI multi-par

**Tareas:**
1. **`SbsPeAdapter`** — endpoint REST SBS Perú. Sin auth. Cron `0 19 * * *` `America/Lima`.
2. **Seed update** — `FiscalRegime` PE.
3. **Frontend `FxSection.tsx` refactor:**
   - Agregar selector `<select>` de pares al inicio del form.
   - Por defecto mostrar pairs sugeridos según `LegalEntity.baseCurrency`:
     - `baseCurrency=MXN` → sugerir USD↔MXN, EUR↔MXN
     - `baseCurrency=COP` → sugerir USD↔COP, EUR↔COP
     - `baseCurrency=USD` → sugerir USD↔MXN, USD↔EUR (Panamá/Salvador case)
   - Permitir pares custom para tourist edge cases.
4. **`FxRateWidget.tsx`** del dashboard: mismo refactor — exponer dropdown de par activo.

**Deliverable:** 1 adapter + UI multi-par usable por managers fuera de MX.

### Día 4 — `secondaryDisplayCurrencies` per-property + integración con check-in

**Tareas:**
1. **Migration** `PropertySettings.secondaryDisplayCurrencies String[] @default([])`.
2. **`getSecondaryFxRates` refactor** — leer override de PropertySettings; si vacío, defaults por país (helper `defaultTouristCurrencies(countryCode)`).
3. **UI** en SettingsPage: nueva sub-sección "Monedas mostradas al huésped" con `<TagInput>` para curar el set.
4. **Tests** actualizados para el nuevo shape.
5. **Smoke test manual** — activar property colombiana en dev seed, abrir check-in, verificar COP primary + USD/EUR secondary.

**Deliverable:** end-to-end multi-país operacional. Property en CO funciona idéntico a property en MX.

### Día 5 (buffer) — Update `docs/vision/13` etapa wizard + observability

**Tareas:**
1. **Update wizard doc** `docs/vision/13-consultant-setup-wizard.md` con etapa **4b "FX & Currency"** entre LegalEntity y Properties:
   - Auto-detection: countryCode → propone `fxAdapterClass` del catálogo seed
   - Trigger primer refresh inmediato (no esperar al cron del día siguiente)
   - Manager puede setear override inicial
   - Health check pre-activación: confirma que hay al menos 1 row en `ExchangeRate` para la LegalEntity
2. **Health check** nuevo en activación: `verifyFxAdapterHealth(legalEntityId)` retorna `{ ok, missingRates: string[] }`.
3. **Alerta SSE** admin si un adapter falla 3× consecutivos (anti-silent-failure).

**Deliverable:** wizard doc updated; alertas operativas activas; sprint cerrado.

---

## 5. Riesgos detectados + contrapropuestas

### R1 — Argentina rates múltiples (oficial vs MEP vs CCL vs blue)

**Contexto:** un hotel boutique en Buenos Aires legalmente debe cobrar al rate "MEP" para extranjeros (Decreto 671/2024), pero la realidad operativa usa "blue" en muchos hostales. Esto es zona gris legal/operativa.

**Mitigación:** Argentina fuera de first batch FX-LATAM. Agregar cuando haya cliente Argentina + decisión de producto + contador argentino consultado. Documentar en backlog.

### R2 — BCCR requiere token gratuito → fricción en setup wizard

**Contexto:** el manager o consultor debe registrarse con email + nombre en BCCR para obtener token. Es 1 form de 2 min, pero rompe el flow "automático" del wizard.

**Mitigación:** Documentar el paso en el wizard como warning explícito en etapa 4b. Alternativamente, Zenix puede tener un "token compartido" pre-registrado para todos los clientes CR (validar términos BCCR — algunos servicios prohíben sharing). Decisión a tomar en Día 5.

### R3 — Datos Abiertos GOV Colombia puede cambiar URL del dataset

**Contexto:** la URL `https://www.datos.gov.co/resource/32sa-8pi3.json` apunta a un dataset específico mantenido por el Ministerio de Hacienda. Si cambia el ID del dataset, el adapter falla silenciosamente.

**Mitigación:** Health check del adapter en `onModuleInit` detecta rate 0 → SSE alerta admin. Fallback: scraping de la página oficial de BanRep (deuda técnica documentada).

### R4 — SOAP de BCCR es legacy y complejo de parsear

**Contexto:** SOAP no es nativo a Node modernos. Necesita lib `soap` o `easy-soap-request` (más de 100KB en el bundle).

**Mitigación:** investigar si BCCR expone también JSON/REST (algunos endpoints más nuevos sí). Si no, lib `soap` agregada al package como dep opcional cargada solo en runtime del adapter CR.

### R5 — Crons múltiples per-país en el mismo Node process

**Contexto:** Si el proceso tiene 9 crons concurrentes (uno por país), riesgo de spike CPU al cambio de día UTC.

**Mitigación:** Los crons son IO-bound (HTTP fetch + DB write), no CPU. Spread por timezone real ya los desincroniza. Si en futuro crece a >20 países, migrar a worker process aparte.

### R6 — Override del manager sobreescribe el rate oficial sin auditoría

**Contexto:** un manager malicioso puede setear rate ridículo (1 USD = 100 MXN) para inflar conversiones mostradas al guest.

**Mitigación:** `PropertyFxRate` debe tener `updatedById` (ya lo tiene §103) + audit log de cambios + alerta SSE supervisor si `spreadFromOfficial > 10%`. Setting opcional `requiresApprovalIfSpreadAbovePercent` para hoteles que quieren forzar approval workflow.

---

## 6. Acceptance criteria

### Funcionales
- [ ] `LegalEntity` con `countryCode=CO` activa: al siguiente día (o trigger manual) hay rates USD→COP en BD vía Banrep adapter.
- [ ] Check-in en property colombiana muestra COP primary + USD/EUR secondary.
- [ ] Check-in en property mexicana (regression) mantiene funcionamiento idéntico — Banxico sigue corriendo.
- [ ] `FxSection.tsx` permite al manager configurar overrides en cualquier par (USD↔COP, EUR↔COP, etc.).
- [ ] `PropertySettings.secondaryDisplayCurrencies` override respetado en el dialog.
- [ ] Health check del adapter detecta fallo y emite SSE alerta admin.

### Arquitectura
- [ ] `IFxAdapter` interface estable + 4 implementaciones (MX, CO, CR, PE).
- [ ] Agregar país nuevo en el futuro = 1 adapter class + 1 row seed `FiscalRegime`. Sin migration.
- [ ] `FxAdapterRegistry` carga adapters al boot + registra crons programáticamente.

### Tests
- [ ] ≥4 tests por adapter (happy path, network error, parsing error, idempotency).
- [ ] Tests de `FxAdapterRegistry` (auto-registration + per-adapter try/catch).
- [ ] Tests de `getSecondaryFxRates` con overrides per-property.

### Documentación
- [ ] `docs/vision/13` actualizado con etapa 4b.
- [ ] CLAUDE.md actualizado con §111+ decisiones FX-LATAM.
- [ ] `.env.example` documenta tokens necesarios (`BANXICO_TOKEN`, `BCCR_API_TOKEN`).
- [ ] `docs/zenix-sales-master.md` actualizado con sección "Multi-país operativo".

---

## 7. Decisiones a registrar en CLAUDE.md (post-sprint)

A agregar como `§111-§115`:

- **§111** — `IFxAdapter` Strategy pattern paralelo a `IFiscalAdapter` (§89). Cada `FiscalRegime` mapea su `fxAdapterClass`. Agregar país = 1 class + 1 seed row.
- **§112** — `FxAdapterRegistry` con `OnModuleInit` auto-registra crons per-país usando `SchedulerRegistry`. Cada cron corre en su timezone local del banco central; fail-soft per-país (uno cae no afecta a los demás).
- **§113** — `PropertySettings.secondaryDisplayCurrencies: String[]` override del set de monedas secundarias. Defaults derivados de `LegalEntity.countryCode` via helper `defaultTouristCurrencies()`. Nunca incluye la propia `baseCurrency`.
- **§114** — Argentina rates múltiples (oficial/MEP/CCL/blue) requieren decisión de producto + contador AR antes de implementar. Out-of-scope FX-LATAM.
- **§115** — Brasil FX adapter llega junto con Sovos `IFiscalAdapter` post v1.2 (consistencia con §93 — Brasil entra al ecosistema en bundle).

---

## 8. Out-of-scope (deferred)

- **Argentina adapter** — pendiente decisión producto sobre cuál rate usar.
- **Brasil adapter** — entra junto con Sovos post v1.2.
- **Guatemala, Honduras adapters** — bajo demanda según volumen de clientes LATAM.
- **Multi-rate intra-país** (e.g., AR oficial vs MEP en el mismo dialog) — overkill v1.0.x.
- **Histórico de rates UI** — el dashboard hoy solo muestra el rate actual. Histórico es feature v1.0.3 REPORTS-CORE.
- **Currency conversion en folios CFDI** (Art. 20 CFF) — ya cubierto en §83 PAY-CORE, sin overlap con este sprint.

---

## 9. Citaciones (todas verificables)

### APIs de bancos centrales

- [Banxico SIE API — series económicas](https://www.banxico.org.mx/SieAPIRest/service/v1/)
- [Banco de la República TRM — Datos Abiertos GOV.CO](https://www.datos.gov.co/Econom-a-y-Finanzas/Tasa-de-Cambio-Representativa-del-Mercado-Historic/32sa-8pi3)
- [SBS Perú — Tipo de Cambio](https://www.sbs.gob.pe/app/pp/sistip_portal/paginas/publicacion/tiposdecambioPublicador.aspx)
- [BCCR Costa Rica — Webservice indicadores económicos](https://gee.bccr.fi.cr/Indicadores/Suscripciones/WS/wsindicadoreseconomicos.asmx)
- [BCRA Argentina — APIs públicas](https://api.bcra.gob.ar/estadisticas/v3.0/Monetarias/4)
- [BCB Brasil — API Olinda PTAX](https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/aplicacao)
- [BANGUAT Guatemala — Servicios web](https://banguat.gob.gt/cambio/)

### Patrones arquitectónicos

- Gamma, Helm, Johnson, Vlissides 1994 — *Design Patterns*, Strategy pattern
- Meyer 1988 — *Object-Oriented Software Construction*, Open/Closed principle
- CLAUDE.md §89 — `IFiscalAdapter` antecedente (PAC providers)
- CLAUDE.md §69 — `FiscalRegime` seed-driven catalog

### Cumplimiento

- [Banxico Art. 20 CFF — rate del día para CFDI](https://www.diputados.gob.mx/LeyesBiblio/pdf_mov/Codigo_Fiscal_de_la_Federacion.pdf)
- [Decreto AR 671/2024 — rate MEP para extranjeros](https://www.boletinoficial.gob.ar/detalleAviso/primera/315241/20240801)

---

## 10. Quick-start para nueva sesión

Para retomar este sprint en sesión limpia:

1. Leer este archivo + `CLAUDE.md` (especial atención a §63, §69, §89, §103, §110+).
2. `git checkout main && git pull && git checkout -b sprint/fx-latam`.
3. Empezar Día 1 (refactor `FxService` → `IFxAdapter` + Registry). Validar tests existentes verdes antes de tocar adapters nuevos.
4. Día 2-3 adapters CO/CR/PE en paralelo (cada adapter es independiente).
5. Día 4 frontend `FxSection.tsx` + `PropertySettings.secondaryDisplayCurrencies`.
6. Día 5 wizard doc + health checks + cierre.

**Archivos de referencia para copiar patrones:**
- Strategy pattern existente: `apps/api/src/pms/rates/fx.service.ts` (refactor target)
- Seed-driven catalog: `prisma/seed.ts` sección `FiscalRegime` (§69)
- IFiscalAdapter antecedente: TBD post v1.0.2 CFDI-CORE (consistencia)
- Test pattern: `apps/api/src/pms/rates/fx.service.spec.ts`

---

**Fin del plan. Listo para iniciar cuando v1.0.4 esté activo en roadmap.**
